from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from kubernetes.client.exceptions import ApiException

from app.core.kubernetes import get_k8s_client, get_apps_client

router = APIRouter(prefix="/actions", tags=["actions"])


class DeletePodRequest(BaseModel):
    name: str
    namespace: str = "default"


class ScaleRequest(BaseModel):
    deployment: str
    namespace: str = "default"
    replicas: int


class RestartDeploymentRequest(BaseModel):
    deployment: str
    namespace: str = "default"


class PodLogsRequest(BaseModel):
    name: str
    namespace: str = "default"
    tail_lines: int = 100


@router.post("/delete-pod")
def delete_pod(req: DeletePodRequest):
    """Delete (stop) a pod by name."""
    try:
        v1 = get_k8s_client()
        v1.delete_namespaced_pod(name=req.name, namespace=req.namespace)
        return {"status": "success", "message": f"Pod '{req.name}' deleted from namespace '{req.namespace}'"}
    except ApiException as e:
        if e.status == 404:
            raise HTTPException(status_code=404, detail=f"Pod '{req.name}' not found in namespace '{req.namespace}'")
        raise HTTPException(status_code=e.status, detail=e.reason)


@router.post("/scale")
def scale_deployment(req: ScaleRequest):
    """Scale a deployment to a specific number of replicas."""
    try:
        apps = get_apps_client()
        apps.patch_namespaced_deployment_scale(
            name=req.deployment,
            namespace=req.namespace,
            body={"spec": {"replicas": req.replicas}},
        )
        return {
            "status": "success",
            "message": f"Deployment '{req.deployment}' scaled to {req.replicas} replicas",
        }
    except ApiException as e:
        if e.status == 404:
            raise HTTPException(status_code=404, detail=f"Deployment '{req.deployment}' not found")
        raise HTTPException(status_code=e.status, detail=e.reason)


@router.post("/restart")
def restart_deployment(req: RestartDeploymentRequest):
    """Restart a deployment by triggering a rollout restart."""
    import datetime

    try:
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
        apps.patch_namespaced_deployment(
            name=req.deployment,
            namespace=req.namespace,
            body=body,
        )
        return {
            "status": "success",
            "message": f"Deployment '{req.deployment}' restarting (rollout restart)",
        }
    except ApiException as e:
        if e.status == 404:
            raise HTTPException(status_code=404, detail=f"Deployment '{req.deployment}' not found")
        raise HTTPException(status_code=e.status, detail=e.reason)


@router.post("/logs")
def get_pod_logs(req: PodLogsRequest):
    """Get logs from a pod."""
    try:
        v1 = get_k8s_client()
        logs = v1.read_namespaced_pod_log(
            name=req.name,
            namespace=req.namespace,
            tail_lines=req.tail_lines,
        )
        return {"pod": req.name, "namespace": req.namespace, "logs": logs}
    except ApiException as e:
        if e.status == 404:
            raise HTTPException(status_code=404, detail=f"Pod '{req.name}' not found")
        raise HTTPException(status_code=e.status, detail=e.reason)


@router.get("/pod-names")
def list_pod_names(namespace: str = "default"):
    """List pod names in a namespace (for UI autocomplete)."""
    try:
        v1 = get_k8s_client()
        pods = v1.list_namespaced_pod(namespace=namespace)
        return {"pods": [pod.metadata.name for pod in pods.items]}
    except ApiException as e:
        raise HTTPException(status_code=e.status, detail=e.reason)


@router.get("/deployment-names")
def list_deployment_names(namespace: str = "default"):
    """List deployment names in a namespace."""
    try:
        apps = get_apps_client()
        deps = apps.list_namespaced_deployment(namespace=namespace)
        return {"deployments": [d.metadata.name for d in deps.items]}
    except ApiException as e:
        raise HTTPException(status_code=e.status, detail=e.reason)
