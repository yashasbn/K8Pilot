from __future__ import annotations

import json
import logging
import re
from typing import Any, AsyncGenerator, Dict, List, Optional
import httpx
from kubernetes.client.exceptions import ApiException

from app.core.config import settings
from app.core.kubernetes import (
    get_k8s_client,
    get_apps_client,
    get_custom_objects_client,
    is_k8s_available,
)

logger = logging.getLogger(__name__)


# ── Kubernetes Inspection Tools ─────────────────────────────────────────────

def tool_get_pod_status(name: str, namespace: str = "default") -> dict:
    """Fetch status, container states, restart counts, and conditions for a pod."""
    if not is_k8s_available():
        return {"error": "Cluster not connected"}
    try:
        v1 = get_k8s_client()
        pod = v1.read_namespaced_pod(name=name, namespace=namespace)
        containers = []
        for cs in (pod.status.container_statuses or []):
            state = "unknown"
            reason = ""
            if cs.state.waiting:
                state = "waiting"
                reason = cs.state.waiting.reason or "Waiting"
            elif cs.state.terminated:
                state = "terminated"
                reason = cs.state.terminated.reason or f"Exit {cs.state.terminated.exit_code}"
            elif cs.state.running:
                state = "running"
            containers.append({
                "name": cs.name,
                "ready": cs.ready,
                "restart_count": cs.restart_count,
                "state": state,
                "reason": reason,
                "image": cs.image,
            })
        conditions = [
            {"type": c.type, "status": c.status, "reason": c.reason or ""}
            for c in (pod.status.conditions or [])
        ]
        return {
            "name": name,
            "namespace": namespace,
            "phase": pod.status.phase,
            "node_name": pod.spec.node_name or "unassigned",
            "containers": containers,
            "conditions": conditions,
        }
    except ApiException as e:
        return {"error": f"Pod '{name}' not found: {e.reason}"}


def tool_get_pod_logs(name: str, namespace: str = "default", tail_lines: int = 50) -> str:
    """Fetch recent container logs from a pod."""
    if not is_k8s_available():
        return "(Cluster not connected)"
    try:
        v1 = get_k8s_client()
        logs = v1.read_namespaced_pod_log(
            name=name,
            namespace=namespace,
            tail_lines=tail_lines,
        )
        return logs.strip() if logs else "(No logs produced)"
    except ApiException as e:
        return f"(Could not read logs for {name}: {e.reason})"


def tool_get_pod_events(name: str, namespace: str = "default") -> list[dict]:
    """Fetch warning and normal events involving this pod."""
    if not is_k8s_available():
        return []
    try:
        v1 = get_k8s_client()
        events = v1.list_namespaced_event(
            namespace=namespace,
            field_selector=f"involvedObject.name={name}",
        )
        result = []
        for ev in events.items:
            result.append({
                "type": ev.type,
                "reason": ev.reason,
                "message": ev.message,
                "count": ev.count or 1,
                "last_timestamp": ev.last_timestamp.isoformat() if ev.last_timestamp else "",
            })
        return result
    except ApiException:
        return []


def tool_get_deployment_status(name: str, namespace: str = "default") -> dict:
    """Fetch deployment replica health and rollout conditions."""
    if not is_k8s_available():
        return {"error": "Cluster not connected"}
    try:
        apps = get_apps_client()
        dep = apps.read_namespaced_deployment(name=name, namespace=namespace)
        conditions = [
            {"type": c.type, "status": c.status, "message": c.message or ""}
            for c in (dep.status.conditions or [])
        ]
        return {
            "name": name,
            "namespace": namespace,
            "desired_replicas": dep.spec.replicas or 0,
            "ready_replicas": dep.status.ready_replicas or 0,
            "available_replicas": dep.status.available_replicas or 0,
            "updated_replicas": dep.status.updated_replicas or 0,
            "conditions": conditions,
        }
    except ApiException as e:
        return {"error": f"Deployment '{name}' not found: {e.reason}"}


def tool_get_cluster_metrics() -> dict:
    """Fetch live CPU and Memory pressure from metrics.k8s.io."""
    if not is_k8s_available():
        return {"metrics_available": False}
    try:
        custom_api = get_custom_objects_client()
        node_metrics = custom_api.list_cluster_custom_object(
            group="metrics.k8s.io", version="v1beta1", plural="nodes"
        )
        nodes = []
        for n in node_metrics.get("items", []):
            usage = n.get("usage", {})
            nodes.append({
                "node": n.get("metadata", {}).get("name"),
                "cpu": usage.get("cpu"),
                "memory": usage.get("memory"),
            })
        return {"metrics_available": True, "nodes": nodes}
    except Exception:
        return {"metrics_available": False}


# ── Autonomous ReAct Investigation Loop ─────────────────────────────────────

async def investigate_target(
    user_query: str,
) -> AsyncGenerator[dict, None]:
    """Detects target resources mentioned in the user query and runs inspection tools.
    Yields intermediate ReAct steps ('thought', 'tool_call', 'tool_result').
    Returns an assembled evidence block.
    """
    # 1. Parse target namespace
    ns_match = re.search(r"namespace\s+['\"]?([a-zA-Z0-9_-]+)['\"]?", user_query, re.IGNORECASE)
    namespace = ns_match.group(1) if ns_match else "default"

    # 2. Extract potential pod / workload names
    # Look for patterns like "pod <name>", "deployment <name>", or common k8s names
    pod_matches = re.findall(r"(?:pod|container)\s+([a-zA-Z0-9_-]+)", user_query, re.IGNORECASE)
    dep_matches = re.findall(r"(?:deployment|statefulset)\s+([a-zA-Z0-9_-]+)", user_query, re.IGNORECASE)

    # If user asks about diagnose or troubleshoot without explicit prefix, scan tokens
    if not pod_matches and not dep_matches:
        tokens = [t.strip(",.:'\"") for t in user_query.split()]
        known_system = ["coredns", "storage-provisioner", "kube-proxy", "nginx", "etcd"]
        for t in tokens:
            if any(k in t.lower() for k in known_system):
                pod_matches.append(t)
                break

    evidence_parts = []

    # Step A: Initial Thought
    if pod_matches or dep_matches:
        targets_str = ", ".join(pod_matches + dep_matches)
        yield {
            "type": "thought",
            "content": f"Investigating target resource(s) '{targets_str}' in namespace '{namespace}'...",
        }
    else:
        yield {
            "type": "thought",
            "content": f"Analyzing cluster state and metrics in namespace '{namespace}'...",
        }

    # Step B: Investigate Pods
    for pod_name in pod_matches[:2]:  # inspect up to 2 pods
        # 1. Inspect Pod Status
        yield {
            "type": "tool_call",
            "tool": "get_pod_status",
            "args": {"name": pod_name, "namespace": namespace},
        }
        status_data = tool_get_pod_status(pod_name, namespace)
        if "error" not in status_data:
            phase = status_data.get("phase", "Unknown")
            containers = status_data.get("containers", [])
            yield {
                "type": "tool_result",
                "tool": "get_pod_status",
                "summary": f"Pod '{pod_name}' is {phase} ({len(containers)} containers).",
            }
            evidence_parts.append(f"Pod Status ({pod_name}):\n{json.dumps(status_data, indent=2)}")
        else:
            yield {
                "type": "tool_result",
                "tool": "get_pod_status",
                "summary": f"Could not inspect pod: {status_data['error']}",
            }

        # 2. Inspect Events for the Pod
        yield {
            "type": "tool_call",
            "tool": "get_pod_events",
            "args": {"name": pod_name, "namespace": namespace},
        }
        events = tool_get_pod_events(pod_name, namespace)
        warn_events = [e for e in events if e.get("type") == "Warning"]
        yield {
            "type": "tool_result",
            "tool": "get_pod_events",
            "summary": f"Found {len(events)} events ({len(warn_events)} warnings).",
        }
        if events:
            ev_summary = "\n".join(f"[{e['type']}] {e['reason']}: {e['message']}" for e in events[:5])
            evidence_parts.append(f"Pod Events ({pod_name}):\n{ev_summary}")

        # 3. Read Recent Logs
        yield {
            "type": "tool_call",
            "tool": "get_pod_logs",
            "args": {"name": pod_name, "namespace": namespace, "tail_lines": 30},
        }
        logs = tool_get_pod_logs(pod_name, namespace, tail_lines=30)
        has_logs = logs and not logs.startswith("(")
        yield {
            "type": "tool_result",
            "tool": "get_pod_logs",
            "summary": f"Retrieved {len(logs.splitlines())} log lines from '{pod_name}'.",
        }
        if has_logs:
            evidence_parts.append(f"Recent Logs ({pod_name}):\n{logs[-1500:]}")

    # Step C: Investigate Deployments
    for dep_name in dep_matches[:2]:
        yield {
            "type": "tool_call",
            "tool": "get_deployment_status",
            "args": {"name": dep_name, "namespace": namespace},
        }
        dep_data = tool_get_deployment_status(dep_name, namespace)
        if "error" not in dep_data:
            desired = dep_data.get("desired_replicas", 0)
            ready = dep_data.get("ready_replicas", 0)
            yield {
                "type": "tool_result",
                "tool": "get_deployment_status",
                "summary": f"Deployment '{dep_name}': {ready}/{desired} ready replicas.",
            }
            evidence_parts.append(f"Deployment Status ({dep_name}):\n{json.dumps(dep_data, indent=2)}")
        else:
            yield {
                "type": "tool_result",
                "tool": "get_deployment_status",
                "summary": dep_data["error"],
            }

    # Step D: Final Synthesis Thought
    yield {
        "type": "thought",
        "content": "Synthesizing evidence and generating SRE technical diagnosis...",
    }

    # Store full assembled evidence in an attribute for prompt generation
    evidence_text = "\n\n".join(evidence_parts) if evidence_parts else "No specific pod or deployment targets identified."
    yield {
        "type": "evidence_assembled",
        "evidence": evidence_text,
    }


# ── Token Streaming Helpers ─────────────────────────────────────────────────

async def stream_ollama_tokens(prompt: str, model: str) -> AsyncGenerator[str, None]:
    """Stream token chunks directly from Ollama."""
    async with httpx.AsyncClient(timeout=180.0) as client:
        async with client.stream(
            "POST",
            f"{settings.ollama_url}/api/generate",
            json={"model": model, "prompt": prompt, "stream": True},
        ) as response:
            response.raise_for_status()
            async for line in response.aiter_lines():
                if not line:
                    continue
                try:
                    chunk = json.loads(line)
                    text = chunk.get("response", "")
                    if text:
                        yield text
                    if chunk.get("done"):
                        break
                except Exception:
                    continue


async def stream_gemini_tokens(prompt: str, model: str, api_key: str) -> AsyncGenerator[str, None]:
    """Stream token chunks directly from Google Gemini API."""
    async with httpx.AsyncClient(timeout=60.0) as client:
        async with client.stream(
            "POST",
            f"https://generativelanguage.googleapis.com/v1beta/models/{model}:streamGenerateContent?key={api_key}&alt=sse",
            json={"contents": [{"parts": [{"text": prompt}]}]},
            headers={"Content-Type": "application/json"},
        ) as response:
            response.raise_for_status()
            async for line in response.aiter_lines():
                if line.startswith("data: "):
                    data_str = line[6:].strip()
                    if not data_str:
                        continue
                    try:
                        data = json.loads(data_str)
                        candidates = data.get("candidates", [])
                        if candidates:
                            parts = candidates[0].get("content", {}).get("parts", [])
                            for p in parts:
                                text = p.get("text", "")
                                if text:
                                    yield text
                    except Exception:
                        continue
