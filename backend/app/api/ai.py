from fastapi import APIRouter, HTTPException, BackgroundTasks, Header
from pydantic import BaseModel
import httpx
import json
import re
import yaml

from app.core.config import settings
from app.core.kubernetes import get_k8s_client, get_apps_client
from kubernetes import utils
from kubernetes.client.exceptions import ApiException

router = APIRouter(prefix="/ai", tags=["ai"])

# Simple registry to keep track of model pull states
active_pulls = set()


class AnalyzeRequest(BaseModel):
    context: str  # logs, metrics, or incident description
    prompt: str = "Explain this Kubernetes issue in plain English and suggest a fix."
    model: str | None = None  # optional model override


class GenerateManifestRequest(BaseModel):
    description: str  # e.g. "nginx deployment with 3 replicas and 512Mi memory limit"
    model: str | None = None  # optional model override


class PullRequest(BaseModel):
    name: str


@router.get("/models")
async def list_models():
    """List available LLM models from Ollama (local only)."""
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(f"{settings.ollama_url}/api/tags")
            resp.raise_for_status()
            data = resp.json()
            models = [
                {
                    "name": m["name"],
                    "size": m.get("size", 0),
                    "modified_at": m.get("modified_at", ""),
                }
                for m in data.get("models", [])
            ]
            return {"models": models, "default": settings.ollama_model}
    except httpx.HTTPError:
        return {"models": [], "default": settings.ollama_model}


@router.get("/gemini-models")
async def list_gemini_models(x_gemini_api_key: str | None = Header(None)):
    """Fetch available Gemini models from Google's API using the provided key."""
    if not x_gemini_api_key:
        raise HTTPException(status_code=400, detail="X-Gemini-API-Key header is required.")
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(
                f"https://generativelanguage.googleapis.com/v1beta/models?key={x_gemini_api_key}&pageSize=100"
            )
            resp.raise_for_status()
            data = resp.json()

            models = []
            for m in data.get("models", []):
                name = m["name"].replace("models/", "")
                description = m.get("description", "")
                methods = m.get("supportedGenerationMethods", [])

                # Only include models that support chat/content generation
                if "generateContent" not in methods:
                    continue
                # Skip models Google marks as unavailable for new users
                if "no longer available" in description.lower():
                    continue

                models.append({
                    "name": name,
                    "displayName": m.get("displayName", name),
                    "description": description,
                    "inputTokenLimit": m.get("inputTokenLimit", 0),
                    "outputTokenLimit": m.get("outputTokenLimit", 0),
                })

            # Sort: newest/flash first, pro last
            def sort_key(m):
                n = m["name"]
                if "2.5" in n and "flash" in n: return 0
                if "2.0" in n and "flash" in n: return 1
                if "flash-lite" in n: return 2
                if "flash" in n: return 3
                if "2.5" in n and "pro" in n: return 4
                if "pro" in n: return 5
                return 6

            models.sort(key=sort_key)
            return {"models": models, "total": len(models)}
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail=f"Gemini API error: {e.response.text}")
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Failed to fetch Gemini models: {e}")


async def _pull_model_task(name: str):
    """Background task to pull model from Ollama."""
    active_pulls.add(name)
    try:
        async with httpx.AsyncClient(timeout=600.0) as client:
            resp = await client.post(
                f"{settings.ollama_url}/api/pull",
                json={"name": name, "stream": False},
            )
            resp.raise_for_status()
    except Exception as e:
        print(f"Error pulling model {name}: {e}")
    finally:
        active_pulls.discard(name)


@router.post("/pull")
async def pull_model(req: PullRequest, background_tasks: BackgroundTasks):
    """Start pulling an Ollama model in the background."""
    if req.name in active_pulls:
        return {"status": "downloading", "message": f"Model {req.name} is already downloading."}
    
    # Check if already installed
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(f"{settings.ollama_url}/api/tags")
            if resp.status_code == 200:
                installed = [m["name"] for m in resp.json().get("models", [])]
                if req.name in installed or f"{req.name}:latest" in installed:
                    return {"status": "installed", "message": f"Model {req.name} is already installed."}
    except Exception:
        pass

    background_tasks.add_task(_pull_model_task, req.name)
    return {"status": "downloading", "message": f"Started pulling model {req.name}."}


@router.get("/pull/status")
async def pull_status():
    """Get active model downloads."""
    return {"downloading": list(active_pulls)}


@router.post("/analyze")
async def analyze_incident(req: AnalyzeRequest, x_gemini_api_key: str | None = Header(None)):
    """Use LLM to analyze logs/metrics and explain issues."""
    full_prompt = f"""{req.prompt}

Context:
{req.context}
"""
    return await _dispatch_llm(full_prompt, model=req.model, api_key=x_gemini_api_key)


@router.post("/chat")
async def smart_chat(req: AnalyzeRequest, x_gemini_api_key: str | None = Header(None)):
    """AI chat that can understand intent and execute cluster actions."""
    user_message = req.context

    # Get current cluster context for the AI
    cluster_context = _get_cluster_context(req)

    # Ask the LLM to decide: answer or act
    system_prompt = f"""You are K8Pilot, an AI Kubernetes operations assistant. You can EXECUTE actions on the cluster, not just explain them.

Available actions you can perform (respond with a JSON action block to execute):
- {{"action": "delete_pod", "name": "<pod-name>", "namespace": "<ns>"}} — Stop/delete a pod
- {{"action": "delete_namespace", "name": "<namespace>"}} — Delete an entire namespace and all its resources
- {{"action": "scale", "deployment": "<name>", "namespace": "<ns>", "replicas": <n>}} — Scale a deployment
- {{"action": "restart", "deployment": "<name>", "namespace": "<ns>"}} — Restart a deployment
- {{"action": "get_logs", "name": "<pod-name>", "namespace": "<ns>"}} — Fetch pod logs
- {{"action": "create", "manifest": "<yaml-string>", "namespace": "<ns>"}} — Create/deploy any Kubernetes resource

CURRENT CLUSTER STATE:
{cluster_context}

RULES:
1. If the user asks to perform an action, respond with ONLY a JSON action block wrapped in ```action tags.
2. If the user asks a question, answer in plain text.
3. Use the cluster state above to resolve ambiguous references.
4. For the "create" action, ensure the "manifest" field is a single valid JSON string containing the complete YAML.

Example:
```action
{{"action": "delete_pod", "name": "nginx-xyz-abc", "namespace": "default"}}
```"""

    full_prompt = f"""{system_prompt}

User: {user_message}"""

    llm_response = await _dispatch_llm(full_prompt, model=req.model, api_key=x_gemini_api_key)
    response_text = llm_response.get("response", "")
    use_model = llm_response.get("model", settings.ollama_model)

    # ── Action extraction ────────────────────────────────────────────────────
    # Robust extractor: tracks brace depth to correctly handle manifests with
    # nested YAML that contains braces/newlines (breaks simple regex).
    def extract_json_objects(text: str) -> list[str]:
        """Find all top-level JSON objects that contain an 'action' key."""
        results = []
        i = 0
        while i < len(text):
            if text[i] == '{':
                depth = 0
                in_string = False
                escape = False
                start = i
                for j in range(i, len(text)):
                    ch = text[j]
                    if escape:
                        escape = False
                        continue
                    if ch == '\\' and in_string:
                        escape = True
                        continue
                    if ch == '"':
                        in_string = not in_string
                        continue
                    if not in_string:
                        if ch == '{':
                            depth += 1
                        elif ch == '}':
                            depth -= 1
                            if depth == 0:
                                candidate = text[start:j+1]
                                try:
                                    parsed = json.loads(candidate)
                                    if isinstance(parsed, dict) and "action" in parsed:
                                        results.append(candidate)
                                except json.JSONDecodeError:
                                    pass
                                i = j + 1
                                break
                else:
                    i += 1
                    continue
            else:
                i += 1
        return results

    action_strings = []

    # 1. Check for ```action, ```json, or ```yaml code fences first
    code_blocks = re.findall(r'`{2,3}(?:action|json|yaml)?\s*\n?(.*?)\n?`{2,3}', response_text, re.DOTALL)
    for block in code_blocks:
        action_strings.extend(extract_json_objects(block))

    # 2. If nothing found in fences, scan the full response text
    if not action_strings:
        action_strings = extract_json_objects(response_text)

    if action_strings:
        try:
            pending = [json.loads(s.strip()) for s in action_strings]
        except (json.JSONDecodeError, Exception) as e:
            return {
                "response": f"I planned some actions but could not parse them: {e}",
                "model": use_model,
            }
        # Return pending actions for user confirmation — NOT auto-executed
        return {
            "response": response_text,
            "pending_actions": pending,
            "model": use_model,
        }

    return llm_response


@router.post("/execute-action")
async def execute_action_endpoint(req: dict):
    """Execute a confirmed cluster action. Called after user approves a pending action."""
    try:
        result = _execute_action(req)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Action execution failed: {e}")


@router.post("/generate-manifest")
async def generate_manifest(req: GenerateManifestRequest, x_gemini_api_key: str | None = Header(None)):
    """Generate a Kubernetes manifest from a natural language description."""
    prompt = f"""Generate a valid Kubernetes YAML manifest for the following:
{req.description}

Return ONLY the YAML, no explanations."""
    return await _dispatch_llm(prompt, model=req.model, api_key=x_gemini_api_key)


@router.post("/cost-recommendation")
async def cost_recommendation(req: AnalyzeRequest, x_gemini_api_key: str | None = Header(None)):
    """Analyze resource usage and recommend cost optimizations."""
    prompt = f"""You are a Kubernetes cost optimization expert. Analyze the following 
resource usage data and provide specific recommendations to reduce costs 
while maintaining reliability.

{req.context}

Provide recommendations in a structured format with estimated savings."""
    return await _dispatch_llm(prompt, model=req.model, api_key=x_gemini_api_key)


def _get_cluster_context(req: AnalyzeRequest) -> str:
    """Gather current cluster state for AI context."""
    try:
        v1 = get_k8s_client()
        # List pods in default namespace
        pods = v1.list_namespaced_pod(namespace="default")
        pod_list = []
        for i, pod in enumerate(pods.items, 1):
            restarts = sum(cs.restart_count for cs in (pod.status.container_statuses or []))
            pod_list.append(f"  {i}. {pod.metadata.name} (phase={pod.status.phase}, restarts={restarts})")

        # List deployments
        apps = get_apps_client()
        deps = apps.list_namespaced_deployment(namespace="default")
        dep_list = []
        for d in deps.items:
            dep_list.append(f"  - {d.metadata.name} (replicas={d.spec.replicas}, available={d.status.available_replicas or 0})")

        context = "Pods in 'default' namespace:\n"
        context += "\n".join(pod_list) if pod_list else "  (none)"
        context += "\n\nDeployments in 'default' namespace:\n"
        context += "\n".join(dep_list) if dep_list else "  (none)"
        return context
    except Exception as e:
        return f"(Could not fetch cluster state: {e})"


def _execute_action(action_data: dict) -> dict:
    """Execute a cluster action based on parsed AI intent."""
    action = action_data.get("action")
    namespace = action_data.get("namespace", "default")

    if action == "delete_pod":
        name = action_data["name"]
        v1 = get_k8s_client()
        v1.delete_namespaced_pod(name=name, namespace=namespace)
        return {"status": "success", "message": f"Done! Pod '{name}' has been deleted from namespace '{namespace}'. If it's managed by a Deployment, a new pod will be created automatically."}

    elif action == "scale":
        deployment = action_data["deployment"]
        replicas = action_data["replicas"]
        apps = get_apps_client()
        apps.patch_namespaced_deployment_scale(
            name=deployment, namespace=namespace,
            body={"spec": {"replicas": replicas}},
        )
        return {"status": "success", "message": f"Done! Deployment '{deployment}' scaled to {replicas} replicas."}

    elif action == "restart":
        import datetime
        deployment = action_data["deployment"]
        apps = get_apps_client()
        now = datetime.datetime.utcnow().isoformat() + "Z"
        body = {
            "spec": {
                "template": {
                    "metadata": {
                        "annotations": {
                            "kubectl.kubernetes.io/restartedAt": now
                        }
                    }
                }
            }
        }
        apps.patch_namespaced_deployment(name=deployment, namespace=namespace, body=body)
        return {"status": "success", "message": f"Done! Deployment '{deployment}' is restarting (rollout restart triggered)."}

    elif action == "delete_namespace":
        name = action_data["name"]
        v1 = get_k8s_client()
        v1.delete_namespace(name=name)
        return {"status": "success", "message": f"Done! Namespace '{name}' and all its resources have been deleted."}

    elif action == "get_logs":
        name = action_data["name"]
        v1 = get_k8s_client()
        logs = v1.read_namespaced_pod_log(name=name, namespace=namespace, tail_lines=50)
        return {"status": "success", "message": f"Logs from pod '{name}':\n\n```\n{logs}\n```"}

    elif action == "create":
        manifest_str = action_data["manifest"]
        # Use K8s client config to build a helper API client
        from kubernetes.client import ApiClient
        k8s_client = ApiClient()
        
        # Parse the YAML manifest(s)
        try:
            yaml_dicts = list(yaml.safe_load_all(manifest_str))
        except Exception as e:
            return {"status": "error", "message": f"Failed to parse manifest YAML: {e}"}

        created_objs = []
        for obj in yaml_dicts:
            if not obj:
                continue
            # Force target namespace if specified
            if "metadata" in obj:
                obj["metadata"]["namespace"] = namespace
            
            utils.create_from_dict(k8s_client, obj)
            kind = obj.get("kind", "Resource")
            name = obj.get("metadata", {}).get("name", "unnamed")
            created_objs.append(f"{kind} '{name}'")

        return {"status": "success", "message": f"Done! Successfully created resource(s) in namespace '{namespace}': {', '.join(created_objs)}"}

    else:
        return {"status": "error", "message": f"Unknown action: {action}"}


async def _call_ollama(prompt: str, model: str | None = None) -> dict:
    """Call Ollama API for LLM completion."""
    use_model = model or settings.ollama_model
    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(
                f"{settings.ollama_url}/api/generate",
                json={
                    "model": use_model,
                    "prompt": prompt,
                    "stream": False,
                },
            )
            resp.raise_for_status()
            data = resp.json()
            return {"response": data.get("response", ""), "model": use_model}
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"Ollama unreachable: {e}")


async def _call_gemini(prompt: str, model: str, api_key: str) -> dict:
    """Call Google Gemini API for LLM completion."""
    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            # Format API url using Beta model endpoint
            resp = await client.post(
                f"https://generativelanguage.googleapis.com/v1/models/{model}:generateContent?key={api_key}",
                json={
                    "contents": [{"parts": [{"text": prompt}]}]
                },
                headers={"Content-Type": "application/json"}
            )
            resp.raise_for_status()
            data = resp.json()
            candidates = data.get("candidates", [])
            response_text = ""
            if candidates:
                parts = candidates[0].get("content", {}).get("parts", [])
                if parts:
                    response_text = parts[0].get("text", "")
            return {"response": response_text, "model": model}
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail=f"Gemini API error: {e.response.text}")
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Gemini API failed: {e}")


async def _dispatch_llm(prompt: str, model: str | None = None, api_key: str | None = None) -> dict:
    """Dispatches request to Gemini if selected, otherwise defaults to Ollama."""
    use_model = model or settings.ollama_model
    if use_model.startswith("gemini-"):
        if not api_key:
            raise HTTPException(status_code=400, detail="Gemini API Key is missing. Configure it in the UI Settings first.")
        return await _call_gemini(prompt, use_model, api_key)
    return await _call_ollama(prompt, use_model)
