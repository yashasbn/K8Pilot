from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from kubernetes.client.exceptions import ApiException

from app.core.kubernetes import get_k8s_client, get_apps_client
from app.core.audit import record_audit_log

router = APIRouter(prefix="/actions", tags=["actions"])


class DeletePodRequest(BaseModel):
    name: str
    namespace: str = "default"
    initiated_by: str = "user"


class ScaleRequest(BaseModel):
    deployment: Optional[str] = None
    name: Optional[str] = None
    kind: str = "Deployment"
    namespace: str = "default"
    replicas: int
    initiated_by: str = "user"


class RestartDeploymentRequest(BaseModel):
    deployment: Optional[str] = None
    name: Optional[str] = None
    kind: str = "Deployment"
    namespace: str = "default"
    initiated_by: str = "user"


class PodLogsRequest(BaseModel):
    name: str
    namespace: str = "default"
    tail_lines: int = 100


@router.post("/delete-pod")
async def delete_pod(req: DeletePodRequest):
    """Delete (stop) a pod by name."""
    try:
        v1 = get_k8s_client()
        v1.delete_namespaced_pod(name=req.name, namespace=req.namespace)
        msg = f"Pod '{req.name}' deleted from namespace '{req.namespace}'"
        await record_audit_log(
            action_type="delete_pod",
            resource_kind="Pod",
            resource_name=req.name,
            namespace=req.namespace,
            initiated_by=req.initiated_by,
            payload={},
            status="success",
            message=msg,
        )
        return {"status": "success", "message": msg}
    except ApiException as e:
        err_msg = f"Pod '{req.name}' not found in namespace '{req.namespace}'" if e.status == 404 else e.reason
        await record_audit_log(
            action_type="delete_pod",
            resource_kind="Pod",
            resource_name=req.name,
            namespace=req.namespace,
            initiated_by=req.initiated_by,
            payload={},
            status="failed",
            message=err_msg,
        )
        if e.status == 404:
            raise HTTPException(status_code=404, detail=err_msg)
        raise HTTPException(status_code=e.status, detail=e.reason)


@router.post("/scale")
async def scale_workload(req: ScaleRequest):
    """Scale a Deployment or StatefulSet to a specific number of replicas."""
    target_name = req.name or req.deployment
    if not target_name:
        raise HTTPException(status_code=400, detail="Missing resource name/deployment")

    kind_lower = req.kind.lower()
    try:
        apps = get_apps_client()
        if kind_lower in ("statefulset", "statefulsets"):
            apps.patch_namespaced_stateful_set_scale(
                name=target_name,
                namespace=req.namespace,
                body={"spec": {"replicas": req.replicas}},
            )
            msg = f"StatefulSet '{target_name}' scaled to {req.replicas} replicas"
            await record_audit_log(
                action_type="scale",
                resource_kind="StatefulSet",
                resource_name=target_name,
                namespace=req.namespace,
                initiated_by=req.initiated_by,
                payload={"replicas": req.replicas},
                status="success",
                message=msg,
            )
            return {"status": "success", "message": msg}
        else:
            apps.patch_namespaced_deployment_scale(
                name=target_name,
                namespace=req.namespace,
                body={"spec": {"replicas": req.replicas}},
            )
            msg = f"Deployment '{target_name}' scaled to {req.replicas} replicas"
            await record_audit_log(
                action_type="scale",
                resource_kind="Deployment",
                resource_name=target_name,
                namespace=req.namespace,
                initiated_by=req.initiated_by,
                payload={"replicas": req.replicas},
                status="success",
                message=msg,
            )
            return {"status": "success", "message": msg}
    except ApiException as e:
        err_msg = f"{req.kind} '{target_name}' not found in namespace '{req.namespace}'" if e.status == 404 else e.reason
        await record_audit_log(
            action_type="scale",
            resource_kind=req.kind,
            resource_name=target_name,
            namespace=req.namespace,
            initiated_by=req.initiated_by,
            payload={"replicas": req.replicas},
            status="failed",
            message=err_msg,
        )
        if e.status == 404:
            raise HTTPException(status_code=404, detail=err_msg)
        raise HTTPException(status_code=e.status, detail=e.reason)


@router.post("/restart")
async def restart_workload(req: RestartDeploymentRequest):
    """Restart a Deployment, StatefulSet, or DaemonSet via rollout restart."""
    import datetime

    target_name = req.name or req.deployment
    if not target_name:
        raise HTTPException(status_code=400, detail="Missing resource name/deployment")

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

    kind_lower = req.kind.lower()
    try:
        apps = get_apps_client()
        if kind_lower in ("statefulset", "statefulsets"):
            apps.patch_namespaced_stateful_set(
                name=target_name,
                namespace=req.namespace,
                body=body,
            )
            msg = f"StatefulSet '{target_name}' restarting (rollout restart)"
            await record_audit_log(
                action_type="restart",
                resource_kind="StatefulSet",
                resource_name=target_name,
                namespace=req.namespace,
                initiated_by=req.initiated_by,
                payload={},
                status="success",
                message=msg,
            )
            return {"status": "success", "message": msg}
        elif kind_lower in ("daemonset", "daemonsets"):
            apps.patch_namespaced_daemon_set(
                name=target_name,
                namespace=req.namespace,
                body=body,
            )
            msg = f"DaemonSet '{target_name}' restarting (rollout restart)"
            await record_audit_log(
                action_type="restart",
                resource_kind="DaemonSet",
                resource_name=target_name,
                namespace=req.namespace,
                initiated_by=req.initiated_by,
                payload={},
                status="success",
                message=msg,
            )
            return {"status": "success", "message": msg}
        else:
            apps.patch_namespaced_deployment(
                name=target_name,
                namespace=req.namespace,
                body=body,
            )
            msg = f"Deployment '{target_name}' restarting (rollout restart)"
            await record_audit_log(
                action_type="restart",
                resource_kind="Deployment",
                resource_name=target_name,
                namespace=req.namespace,
                initiated_by=req.initiated_by,
                payload={},
                status="success",
                message=msg,
            )
            return {"status": "success", "message": msg}
    except ApiException as e:
        err_msg = f"{req.kind} '{target_name}' not found in namespace '{req.namespace}'" if e.status == 404 else e.reason
        await record_audit_log(
            action_type="restart",
            resource_kind=req.kind,
            resource_name=target_name,
            namespace=req.namespace,
            initiated_by=req.initiated_by,
            payload={},
            status="failed",
            message=err_msg,
        )
        if e.status == 404:
            raise HTTPException(status_code=404, detail=err_msg)
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
