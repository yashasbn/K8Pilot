from fastapi import APIRouter, HTTPException, Query
import yaml
from kubernetes import client
from kubernetes.client.exceptions import ApiException
from kubernetes.config.config_exception import ConfigException

from app.core.kubernetes import (
    get_k8s_client,
    get_apps_client,
    get_custom_objects_client,
    get_networking_client,
    is_k8s_available,
)

router = APIRouter(prefix="/cluster", tags=["cluster"])


def _parse_cpu(val: str | int | float) -> float:
    """Parse Kubernetes CPU quantity to millicores (m)."""
    s = str(val).strip()
    if s.endswith("n"):
        return float(s[:-1]) / 1e6
    if s.endswith("u"):
        return float(s[:-1]) / 1e3
    if s.endswith("m"):
        return float(s[:-1])
    return float(s) * 1000.0


def _parse_memory(val: str | int | float) -> int:
    """Parse Kubernetes Memory quantity to bytes."""
    s = str(val).strip()
    units = {
        "Ki": 1024,
        "Mi": 1024**2,
        "Gi": 1024**3,
        "Ti": 1024**4,
        "k": 1000,
        "M": 1000**2,
        "G": 1000**3,
        "T": 1000**4,
    }
    for u, mult in units.items():
        if s.endswith(u):
            return int(float(s[:-len(u)]) * mult)
    try:
        return int(float(s))
    except ValueError:
        return 0


def _format_bytes(bytes_val: int) -> str:
    """Format bytes into readable string."""
    if bytes_val >= 1024**3:
        return f"{bytes_val / (1024**3):.2f} GiB"
    if bytes_val >= 1024**2:
        return f"{bytes_val / (1024**2):.1f} MiB"
    if bytes_val >= 1024:
        return f"{bytes_val / 1024:.0f} KiB"
    return f"{bytes_val} B"


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
            capacity = node.status.capacity or {}
            allocatable = node.status.allocatable or {}
            result.append({
                "name": node.metadata.name,
                "status": node.status.conditions[-1].type if node.status.conditions else "Unknown",
                "addresses": addresses,
                "cpu": capacity.get("cpu"),
                "memory": capacity.get("memory"),
                "allocatable_cpu": allocatable.get("cpu"),
                "allocatable_memory": allocatable.get("memory"),
            })
        return {"nodes": result, "cluster_connected": True}
    except ConfigException:
        return {"nodes": [], "cluster_connected": False}
    except ApiException as e:
        raise HTTPException(status_code=e.status, detail=e.reason)


@router.get("/metrics")
def cluster_metrics():
    """Get real-time CPU and Memory usage from Kubernetes metrics-server."""
    if not is_k8s_available():
        return {"metrics_available": False, "nodes": [], "pods": {}, "cluster_connected": False}

    try:
        custom_api = get_custom_objects_client()
        v1 = get_k8s_client()

        # 1. Fetch node capacity for percentage calculation
        node_items = v1.list_node().items
        node_caps: dict[str, dict] = {}
        for n in node_items:
            name = n.metadata.name
            alloc = n.status.allocatable or n.status.capacity or {}
            cpu_cap = _parse_cpu(alloc.get("cpu", "1"))
            mem_cap = _parse_memory(alloc.get("memory", "1024Mi"))
            node_caps[name] = {"cpu_m": cpu_cap, "mem_bytes": mem_cap}

        # 2. Fetch live node metrics
        node_metrics_raw = custom_api.list_cluster_custom_object(
            group="metrics.k8s.io", version="v1beta1", plural="nodes"
        )

        nodes_result = []
        total_used_cpu = 0.0
        total_cap_cpu = sum(c["cpu_m"] for c in node_caps.values())
        total_used_mem = 0
        total_cap_mem = sum(c["mem_bytes"] for c in node_caps.values())

        for nm in node_metrics_raw.get("items", []):
            name = nm["metadata"]["name"]
            usage = nm.get("usage", {})
            used_cpu_m = _parse_cpu(usage.get("cpu", "0"))
            used_mem_bytes = _parse_memory(usage.get("memory", "0"))

            total_used_cpu += used_cpu_m
            total_used_mem += used_mem_bytes

            cap = node_caps.get(name, {"cpu_m": 1.0, "mem_bytes": 1})
            cpu_pct = round((used_cpu_m / cap["cpu_m"]) * 100, 1) if cap["cpu_m"] > 0 else 0.0
            mem_pct = round((used_mem_bytes / cap["mem_bytes"]) * 100, 1) if cap["mem_bytes"] > 0 else 0.0

            nodes_result.append({
                "name": name,
                "cpu_usage_m": round(used_cpu_m, 1),
                "cpu_capacity_m": round(cap["cpu_m"], 1),
                "cpu_percent": cpu_pct,
                "cpu_display": f"{round(used_cpu_m)}m / {round(cap['cpu_m'])}m",
                "memory_usage_bytes": used_mem_bytes,
                "memory_capacity_bytes": cap["mem_bytes"],
                "memory_percent": mem_pct,
                "memory_display": f"{_format_bytes(used_mem_bytes)} / {_format_bytes(cap['mem_bytes'])}",
            })

        # 3. Fetch live pod metrics
        pod_metrics_raw = custom_api.list_cluster_custom_object(
            group="metrics.k8s.io", version="v1beta1", plural="pods"
        )
        pods_result: dict[str, dict] = {}
        for pm in pod_metrics_raw.get("items", []):
            key = f"{pm['metadata']['namespace']}/{pm['metadata']['name']}"
            p_cpu = 0.0
            p_mem = 0
            for c in pm.get("containers", []):
                u = c.get("usage", {})
                p_cpu += _parse_cpu(u.get("cpu", "0"))
                p_mem += _parse_memory(u.get("memory", "0"))
            pods_result[key] = {
                "cpu_m": round(p_cpu, 1),
                "cpu_display": f"{round(p_cpu)}m",
                "memory_bytes": p_mem,
                "memory_display": _format_bytes(p_mem),
            }

        cluster_cpu_pct = round((total_used_cpu / total_cap_cpu) * 100, 1) if total_cap_cpu > 0 else 0.0
        cluster_mem_pct = round((total_used_mem / total_cap_mem) * 100, 1) if total_cap_mem > 0 else 0.0

        return {
            "metrics_available": True,
            "cluster": {
                "cpu_usage_m": round(total_used_cpu, 1),
                "cpu_capacity_m": round(total_cap_cpu, 1),
                "cpu_percent": cluster_cpu_pct,
                "cpu_display": f"{round(total_used_cpu)}m / {round(total_cap_cpu)}m",
                "memory_usage_bytes": total_used_mem,
                "memory_capacity_bytes": total_cap_mem,
                "memory_percent": cluster_mem_pct,
                "memory_display": f"{_format_bytes(total_used_mem)} / {_format_bytes(total_cap_mem)}",
            },
            "nodes": nodes_result,
            "pods": pods_result,
            "cluster_connected": True,
        }
    except Exception as e:
        return {
            "metrics_available": False,
            "error": str(e),
            "nodes": [],
            "pods": {},
            "cluster_connected": True,
        }


@router.get("/events")
def list_events(
    namespace: str = Query("_all", description="Namespace or '_all'"),
    type: str | None = Query(None, description="'Warning', 'Normal', or None for all"),
    limit: int = Query(50, description="Max number of events to return"),
):
    """List cluster events sorted by most recent first."""
    if not is_k8s_available():
        return {"events": [], "warnings_count": 0, "cluster_connected": False}

    try:
        v1 = get_k8s_client()
        if namespace == "_all":
            raw_events = v1.list_event_for_all_namespaces().items
        else:
            raw_events = v1.list_namespaced_event(namespace=namespace).items

        events_list = []
        warnings_count = 0

        for e in raw_events:
            ev_type = e.type or "Normal"
            if ev_type == "Warning":
                warnings_count += 1
            if type and type != "_all" and ev_type.lower() != type.lower():
                continue

            # Pick best available timestamp
            ts = e.last_timestamp or e.event_time
            if not ts and e.metadata:
                ts = e.metadata.creation_timestamp
            ts_str = ts.isoformat() if hasattr(ts, "isoformat") else str(ts or "")

            inv_obj = e.involved_object
            events_list.append({
                "reason": e.reason or "Unknown",
                "message": e.message or "",
                "type": ev_type,
                "count": e.count or 1,
                "namespace": inv_obj.namespace or (e.metadata.namespace if e.metadata else "default"),
                "involved_object": {
                    "kind": inv_obj.kind or "",
                    "name": inv_obj.name or "",
                    "namespace": inv_obj.namespace or "",
                },
                "source": e.source.component if e.source else "cluster",
                "timestamp": ts_str,
            })

        # Sort newest first
        events_list.sort(key=lambda x: x["timestamp"], reverse=True)
        return {
            "events": events_list[:limit],
            "total": len(events_list),
            "warnings_count": warnings_count,
            "cluster_connected": True,
        }
    except ConfigException:
        return {"events": [], "warnings_count": 0, "cluster_connected": False}
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
    """List pods in a namespace (or all namespaces if '_all') with status details."""
    if not is_k8s_available():
        return {"pods": [], "cluster_connected": False}
    try:
        v1 = get_k8s_client()
        if namespace == "_all":
            pods = v1.list_pod_for_all_namespaces()
        else:
            pods = v1.list_namespaced_pod(namespace=namespace)

        result = []
        for pod in pods.items:
            # Determine refined status reason if in waiting/terminated
            status_reason = pod.status.phase
            restarts = 0
            container_details = []

            for cs in (pod.status.container_statuses or []):
                restarts += cs.restart_count
                state_name = "running"
                state_reason = ""
                if cs.state.waiting:
                    state_name = "waiting"
                    state_reason = cs.state.waiting.reason or "Waiting"
                    status_reason = state_reason
                elif cs.state.terminated:
                    state_name = "terminated"
                    state_reason = cs.state.terminated.reason or f"Exit {cs.state.terminated.exit_code}"
                    status_reason = state_reason
                elif cs.state.running:
                    state_name = "running"

                container_details.append({
                    "name": cs.name,
                    "ready": cs.ready,
                    "restarts": cs.restart_count,
                    "state": state_name,
                    "reason": state_reason,
                    "image": cs.image,
                })

            start_time_str = pod.status.start_time.isoformat() if pod.status.start_time else ""

            result.append({
                "name": pod.metadata.name,
                "namespace": pod.metadata.namespace,
                "phase": pod.status.phase,
                "status_reason": status_reason,
                "node_name": pod.spec.node_name or "",
                "pod_ip": pod.status.pod_ip or "",
                "start_time": start_time_str,
                "containers": [c.name for c in pod.spec.containers],
                "container_details": container_details,
                "restarts": restarts,
            })
        return {"pods": result, "cluster_connected": True}
    except ConfigException:
        return {"pods": [], "cluster_connected": False}
    except ApiException as e:
        raise HTTPException(status_code=e.status, detail=e.reason)


@router.get("/deployments")
def list_deployments(namespace: str = "default"):
    """List deployments in a namespace (or all namespaces if '_all')."""
    if not is_k8s_available():
        return {"deployments": [], "cluster_connected": False}
    try:
        apps = get_apps_client()
        if namespace == "_all":
            deps = apps.list_deployment_for_all_namespaces()
        else:
            deps = apps.list_namespaced_deployment(namespace=namespace)

        result = []
        for d in deps.items:
            images = [c.image for c in (d.spec.template.spec.containers or [])]
            match_labels = d.spec.selector.match_labels if d.spec.selector else {}
            result.append({
                "name": d.metadata.name,
                "namespace": d.metadata.namespace,
                "replicas": d.spec.replicas or 0,
                "available": d.status.available_replicas or 0,
                "ready": d.status.ready_replicas or 0,
                "updated": d.status.updated_replicas or 0,
                "images": images,
                "selector": match_labels,
                "created_at": d.metadata.creation_timestamp.isoformat() if d.metadata.creation_timestamp else "",
            })
        return {"deployments": result, "cluster_connected": True}
    except ConfigException:
        return {"deployments": [], "cluster_connected": False}
    except ApiException as e:
        raise HTTPException(status_code=e.status, detail=e.reason)


@router.get("/workloads")
def list_workloads(namespace: str = "default"):
    """List Deployments, StatefulSets, and DaemonSets in a namespace (or all if '_all')."""
    if not is_k8s_available():
        return {
            "deployments": [],
            "statefulsets": [],
            "daemonsets": [],
            "cluster_connected": False,
        }
    try:
        apps = get_apps_client()
        is_all = namespace == "_all"

        # 1. Deployments
        dep_items = apps.list_deployment_for_all_namespaces().items if is_all else apps.list_namespaced_deployment(namespace=namespace).items
        deployments = []
        for d in dep_items:
            images = [c.image for c in (d.spec.template.spec.containers or [])]
            match_labels = d.spec.selector.match_labels if d.spec.selector else {}
            deployments.append({
                "name": d.metadata.name,
                "namespace": d.metadata.namespace,
                "replicas": d.spec.replicas or 0,
                "ready": d.status.ready_replicas or 0,
                "available": d.status.available_replicas or 0,
                "updated": d.status.updated_replicas or 0,
                "images": images,
                "selector": match_labels,
                "created_at": d.metadata.creation_timestamp.isoformat() if d.metadata.creation_timestamp else "",
            })

        # 2. StatefulSets
        sts_items = apps.list_stateful_set_for_all_namespaces().items if is_all else apps.list_namespaced_stateful_set(namespace=namespace).items
        statefulsets = []
        for s in sts_items:
            images = [c.image for c in (s.spec.template.spec.containers or [])]
            match_labels = s.spec.selector.match_labels if s.spec.selector else {}
            statefulsets.append({
                "name": s.metadata.name,
                "namespace": s.metadata.namespace,
                "replicas": s.spec.replicas or 0,
                "ready": s.status.ready_replicas or 0,
                "current": s.status.current_replicas or 0,
                "updated": s.status.updated_replicas or 0,
                "images": images,
                "selector": match_labels,
                "created_at": s.metadata.creation_timestamp.isoformat() if s.metadata.creation_timestamp else "",
            })

        # 3. DaemonSets
        ds_items = apps.list_daemon_set_for_all_namespaces().items if is_all else apps.list_namespaced_daemon_set(namespace=namespace).items
        daemonsets = []
        for ds in ds_items:
            images = [c.image for c in (ds.spec.template.spec.containers or [])]
            match_labels = ds.spec.selector.match_labels if ds.spec.selector else {}
            daemonsets.append({
                "name": ds.metadata.name,
                "namespace": ds.metadata.namespace,
                "desired": ds.status.desired_number_scheduled or 0,
                "current": ds.status.current_number_scheduled or 0,
                "ready": ds.status.number_ready or 0,
                "available": ds.status.number_available or 0,
                "misscheduled": ds.status.number_misscheduled or 0,
                "images": images,
                "selector": match_labels,
                "created_at": ds.metadata.creation_timestamp.isoformat() if ds.metadata.creation_timestamp else "",
            })

        return {
            "deployments": deployments,
            "statefulsets": statefulsets,
            "daemonsets": daemonsets,
            "cluster_connected": True,
        }
    except ConfigException:
        return {"deployments": [], "statefulsets": [], "daemonsets": [], "cluster_connected": False}
    except ApiException as e:
        raise HTTPException(status_code=e.status, detail=e.reason)


@router.get("/services")
def list_services(namespace: str = "default"):
    """List services in a namespace (or all if '_all')."""
    if not is_k8s_available():
        return {"services": [], "cluster_connected": False}
    try:
        v1 = get_k8s_client()
        is_all = namespace == "_all"
        svc_items = v1.list_service_for_all_namespaces().items if is_all else v1.list_namespaced_service(namespace=namespace).items
        services = []
        for s in svc_items:
            ports = []
            for p in (s.spec.ports or []):
                ports.append({
                    "name": p.name or "",
                    "port": p.port,
                    "target_port": str(p.target_port),
                    "protocol": p.protocol,
                    "node_port": p.node_port or None,
                })

            external_ips = list(s.spec.external_i_ps or [])
            if s.status.load_balancer and s.status.load_balancer.ingress:
                for ing in s.status.load_balancer.ingress:
                    if ing.ip:
                        external_ips.append(ing.ip)
                    if ing.hostname:
                        external_ips.append(ing.hostname)

            services.append({
                "name": s.metadata.name,
                "namespace": s.metadata.namespace,
                "type": s.spec.type,
                "cluster_ip": s.spec.cluster_ip or "",
                "external_ips": external_ips,
                "ports": ports,
                "selector": s.spec.selector or {},
                "created_at": s.metadata.creation_timestamp.isoformat() if s.metadata.creation_timestamp else "",
            })
        return {"services": services, "cluster_connected": True}
    except ConfigException:
        return {"services": [], "cluster_connected": False}
    except ApiException as e:
        raise HTTPException(status_code=e.status, detail=e.reason)


@router.get("/ingresses")
def list_ingresses(namespace: str = "default"):
    """List ingress resources in a namespace (or all if '_all')."""
    if not is_k8s_available():
        return {"ingresses": [], "cluster_connected": False}
    try:
        net = get_networking_client()
        is_all = namespace == "_all"
        ing_items = net.list_ingress_for_all_namespaces().items if is_all else net.list_namespaced_ingress(namespace=namespace).items
        ingresses = []
        for ing in ing_items:
            rules = []
            for r in (ing.spec.rules or []):
                paths = []
                if r.http and r.http.paths:
                    for p in r.http.paths:
                        svc_name = p.backend.service.name if p.backend and p.backend.service else ""
                        svc_port = (
                            p.backend.service.port.number or p.backend.service.port.name
                            if p.backend and p.backend.service and p.backend.service.port
                            else ""
                        )
                        paths.append({
                            "path": p.path or "/",
                            "path_type": p.path_type or "Prefix",
                            "backend_service": svc_name,
                            "backend_port": str(svc_port),
                        })
                rules.append({
                    "host": r.host or "*",
                    "paths": paths,
                })

            lb_ips = []
            if ing.status.load_balancer and ing.status.load_balancer.ingress:
                for lb in ing.status.load_balancer.ingress:
                    if lb.ip:
                        lb_ips.append(lb.ip)
                    if lb.hostname:
                        lb_ips.append(lb.hostname)

            ingresses.append({
                "name": ing.metadata.name,
                "namespace": ing.metadata.namespace,
                "class_name": ing.spec.ingress_class_name or "",
                "rules": rules,
                "load_balancer": lb_ips,
                "created_at": ing.metadata.creation_timestamp.isoformat() if ing.metadata.creation_timestamp else "",
            })
        return {"ingresses": ingresses, "cluster_connected": True}
    except ConfigException:
        return {"ingresses": [], "cluster_connected": False}
    except ApiException as e:
        raise HTTPException(status_code=e.status, detail=e.reason)


@router.get("/manifest")
def get_resource_manifest(kind: str = Query(...), name: str = Query(...), namespace: str = Query("default")):
    """Export the live YAML manifest for any Kubernetes resource."""
    if not is_k8s_available():
        raise HTTPException(status_code=503, detail="Kubernetes cluster is not connected")

    kind_lower = kind.lower().strip()
    try:
        v1 = get_k8s_client()
        apps = get_apps_client()
        net = get_networking_client()

        obj = None
        if kind_lower in ("pod", "pods"):
            obj = v1.read_namespaced_pod(name=name, namespace=namespace)
        elif kind_lower in ("deployment", "deployments"):
            obj = apps.read_namespaced_deployment(name=name, namespace=namespace)
        elif kind_lower in ("statefulset", "statefulsets"):
            obj = apps.read_namespaced_stateful_set(name=name, namespace=namespace)
        elif kind_lower in ("daemonset", "daemonsets"):
            obj = apps.read_namespaced_daemon_set(name=name, namespace=namespace)
        elif kind_lower in ("service", "services"):
            obj = v1.read_namespaced_service(name=name, namespace=namespace)
        elif kind_lower in ("ingress", "ingresses"):
            obj = net.read_namespaced_ingress(name=name, namespace=namespace)
        elif kind_lower in ("node", "nodes"):
            obj = v1.read_node(name=name)
        elif kind_lower in ("namespace", "namespaces"):
            obj = v1.read_namespace(name=name)
        elif kind_lower in ("event", "events"):
            obj = v1.read_namespaced_event(name=name, namespace=namespace)
        else:
            raise HTTPException(status_code=400, detail=f"Unsupported resource kind: '{kind}'")

        data = client.ApiClient().sanitize_for_serialization(obj)
        # Remove managedFields to keep YAML clean and readable
        if isinstance(data, dict) and "metadata" in data and isinstance(data["metadata"], dict):
            data["metadata"].pop("managedFields", None)

        yaml_content = yaml.dump(data, sort_keys=False, default_flow_style=False)
        return {
            "kind": kind,
            "name": name,
            "namespace": namespace,
            "yaml": yaml_content,
        }
    except ApiException as e:
        if e.status == 404:
            raise HTTPException(status_code=404, detail=f"{kind} '{name}' not found in namespace '{namespace}'")
        raise HTTPException(status_code=e.status, detail=e.reason)
