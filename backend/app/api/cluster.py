from fastapi import APIRouter, HTTPException
from kubernetes.client.exceptions import ApiException
from kubernetes.config.config_exception import ConfigException

from app.core.kubernetes import get_k8s_client, get_apps_client, is_k8s_available

router = APIRouter(prefix="/cluster", tags=["cluster"])


@router.get("/status")
def cluster_status():
    """Check if a Kubernetes cluster is connected."""
    available = is_k8s_available()
    return {
        "connected": available,
        "message": "Cluster connected" if available else "No Kubernetes cluster configured. Connect a cluster to see pods, nodes, and deployments.",
    }


@router.get("/nodes")
def list_nodes():
    """List all nodes with resource info."""
    if not is_k8s_available():
        return {"nodes": [], "cluster_connected": False}
    try:
        v1 = get_k8s_client()
        nodes = v1.list_node()
        result = []
        for node in nodes.items:
            addresses = {a.type: a.address for a in node.status.addresses}
            capacity = node.status.capacity
            result.append({
                "name": node.metadata.name,
                "status": node.status.conditions[-1].type if node.status.conditions else "Unknown",
                "addresses": addresses,
                "cpu": capacity.get("cpu"),
                "memory": capacity.get("memory"),
            })
        return {"nodes": result, "cluster_connected": True}
    except ConfigException:
        return {"nodes": [], "cluster_connected": False}
    except ApiException as e:
        raise HTTPException(status_code=e.status, detail=e.reason)


@router.get("/namespaces")
def list_namespaces():
    """List all namespaces."""
    if not is_k8s_available():
        return {"namespaces": [], "cluster_connected": False}
    try:
        v1 = get_k8s_client()
        ns_list = v1.list_namespace()
        return {"namespaces": [ns.metadata.name for ns in ns_list.items], "cluster_connected": True}
    except ConfigException:
        return {"namespaces": [], "cluster_connected": False}
    except ApiException as e:
        raise HTTPException(status_code=e.status, detail=e.reason)


@router.get("/pods")
def list_pods(namespace: str = "default"):
    """List pods in a namespace with status."""
    if not is_k8s_available():
        return {"pods": [], "cluster_connected": False}
    try:
        v1 = get_k8s_client()
        pods = v1.list_namespaced_pod(namespace=namespace)
        result = []
        for pod in pods.items:
            result.append({
                "name": pod.metadata.name,
                "namespace": pod.metadata.namespace,
                "phase": pod.status.phase,
                "containers": [c.name for c in pod.spec.containers],
                "restarts": sum(
                    cs.restart_count for cs in (pod.status.container_statuses or [])
                ),
            })
        return {"pods": result, "cluster_connected": True}
    except ConfigException:
        return {"pods": [], "cluster_connected": False}
    except ApiException as e:
        raise HTTPException(status_code=e.status, detail=e.reason)


@router.get("/deployments")
def list_deployments(namespace: str = "default"):
    """List deployments in a namespace."""
    if not is_k8s_available():
        return {"deployments": [], "cluster_connected": False}
    try:
        apps = get_apps_client()
        deps = apps.list_namespaced_deployment(namespace=namespace)
        result = []
        for d in deps.items:
            result.append({
                "name": d.metadata.name,
                "replicas": d.spec.replicas,
                "available": d.status.available_replicas or 0,
                "ready": d.status.ready_replicas or 0,
            })
        return {"deployments": result, "cluster_connected": True}
    except ConfigException:
        return {"deployments": [], "cluster_connected": False}
    except ApiException as e:
        raise HTTPException(status_code=e.status, detail=e.reason)
