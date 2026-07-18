from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import httpx
import json
import re

from app.core.config import settings
from app.core.kubernetes import get_k8s_client, get_apps_client
from kubernetes.client.exceptions import ApiException

router = APIRouter(prefix="/ai", tags=["ai"])


class AnalyzeRequest(BaseModel):
    context: str  # logs, metrics, or incident description
    prompt: str = "Explain this Kubernetes issue in plain English and suggest a fix."


class GenerateManifestRequest(BaseModel):
    description: str  # e.g. "nginx deployment with 3 replicas and 512Mi memory limit"


@router.post("/analyze")
async def analyze_incident(req: AnalyzeRequest):
    """Use LLM to analyze logs/metrics and explain issues."""
    full_prompt = f"""{req.prompt}

Context:
{req.context}
"""
    return await _call_ollama(full_prompt)


@router.post("/chat")
async def smart_chat(req: AnalyzeRequest):
    """AI chat that can understand intent and execute cluster actions."""
    user_message = req.context

    # Get current cluster context for the AI
    cluster_context = _get_cluster_context(req)

    # Ask the LLM to decide: answer or act
    system_prompt = f"""You are KubePilot, an AI Kubernetes operations assistant. You can EXECUTE actions on the cluster, not just explain them.

Available actions you can perform (respond with a JSON action block to execute):
- {{"action": "delete_pod", "name": "<pod-name>", "namespace": "<ns>"}} — Stop/delete a pod
- {{"action": "scale", "deployment": "<name>", "namespace": "<ns>", "replicas": <n>}} — Scale a deployment
- {{"action": "restart", "deployment": "<name>", "namespace": "<ns>"}} — Restart a deployment
- {{"action": "get_logs", "name": "<pod-name>", "namespace": "<ns>"}} — Fetch pod logs

CURRENT CLUSTER STATE:
{cluster_context}

RULES:
1. If the user asks to perform an action, respond with ONLY a JSON action block wrapped in ```action tags.
2. If the user asks a question, answer in plain text.
3. Use the cluster state above to resolve ambiguous references (e.g. "pod 3" = the 3rd pod in the list).
4. Always confirm what you did after executing.

Example - if user says "delete the nginx pod":
```action
{{"action": "delete_pod", "name": "nginx-xyz-abc", "namespace": "default"}}
```"""

    full_prompt = f"""{system_prompt}

User: {user_message}"""

    llm_response = await _call_ollama(full_prompt)
    response_text = llm_response.get("response", "")

    # Check if the LLM wants to execute an action
    action_match = re.search(r'`{2,3}action\s*\n?(.*?)\n?`{2,3}', response_text, re.DOTALL)
    if not action_match:
        # Also try to find a raw JSON action block
        action_match = re.search(r'\{"action"\s*:\s*"[^"]+?".*?\}', response_text, re.DOTALL)
        if action_match:
            # Wrap it so the group(1) logic below works uniformly
            class _FakeMatch:
                def group(self, n):
                    return action_match.group(0)
            action_match = _FakeMatch()
    if action_match:
        try:
            action_data = json.loads(action_match.group(1).strip())
            result = _execute_action(action_data)
            return {
                "response": result["message"],
                "action_executed": action_data,
                "model": settings.ollama_model,
            }
        except (json.JSONDecodeError, KeyError, Exception) as e:
            return {
                "response": f"I tried to execute an action but encountered an error: {e}\n\nHere's what I was going to do:\n{action_match.group(1)}",
                "model": settings.ollama_model,
            }

    return llm_response


@router.post("/generate-manifest")
async def generate_manifest(req: GenerateManifestRequest):
    """Generate a Kubernetes manifest from a natural language description."""
    prompt = f"""Generate a valid Kubernetes YAML manifest for the following:
{req.description}

Return ONLY the YAML, no explanations."""
    return await _call_ollama(prompt)


@router.post("/cost-recommendation")
async def cost_recommendation(req: AnalyzeRequest):
    """Analyze resource usage and recommend cost optimizations."""
    prompt = f"""You are a Kubernetes cost optimization expert. Analyze the following 
resource usage data and provide specific recommendations to reduce costs 
while maintaining reliability.

{req.context}

Provide recommendations in a structured format with estimated savings."""
    return await _call_ollama(prompt)


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

    elif action == "get_logs":
        name = action_data["name"]
        v1 = get_k8s_client()
        logs = v1.read_namespaced_pod_log(name=name, namespace=namespace, tail_lines=50)
        return {"status": "success", "message": f"Logs from pod '{name}':\n\n```\n{logs}\n```"}

    else:
        return {"status": "error", "message": f"Unknown action: {action}"}


async def _call_ollama(prompt: str) -> dict:
    """Call Ollama API for LLM completion."""
    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(
                f"{settings.ollama_url}/api/generate",
                json={
                    "model": settings.ollama_model,
                    "prompt": prompt,
                    "stream": False,
                },
            )
            resp.raise_for_status()
            data = resp.json()
            return {"response": data.get("response", ""), "model": settings.ollama_model}
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"Ollama unreachable: {e}")
