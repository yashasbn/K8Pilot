from __future__ import annotations

import asyncio
from datetime import datetime, timezone
import logging
from typing import Any, Dict, List, Optional

from kubernetes.client.exceptions import ApiException
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import AsyncSessionLocal
from app.core.kubernetes import get_k8s_client, get_apps_client, is_k8s_available
from app.core.audit import record_audit_log
from app.models.audit import ClusterIncident

logger = logging.getLogger("k8pilot.monitor")

# In-memory settings for background monitor
monitor_settings = {
    "auto_heal_enabled": False,
    "scan_interval_seconds": 30,
    "is_running": False,
}

_monitor_task: Optional[asyncio.Task] = None


def _extract_workload_owner(pod) -> Dict[str, str]:
    """Find the top-level workload owner for a pod (Deployment, StatefulSet, DaemonSet, Job, or Pod)."""
    owner_refs = pod.metadata.owner_references or []
    for ref in owner_refs:
        kind = ref.kind
        name = ref.name
        if kind == "ReplicaSet":
            # Typical RS name is <deployment>-<pod-template-hash>
            # Owner of ReplicaSet is usually Deployment
            parts = name.rsplit("-", 1)
            deployment_name = parts[0] if len(parts) == 2 else name
            return {"kind": "Deployment", "name": deployment_name}
        if kind in ("StatefulSet", "DaemonSet", "Job"):
            return {"kind": kind, "name": name}
    return {"kind": "Pod", "name": pod.metadata.name}


async def scan_cluster_for_anomalies(db: AsyncSession) -> List[Dict[str, Any]]:
    """Scan cluster pods and events for critical failures and persist incidents."""
    if not is_k8s_available():
        return []

    anomalies: List[Dict[str, Any]] = []
    try:
        v1 = get_k8s_client()
        pods = v1.list_pod_for_all_namespaces().items
    except Exception as e:
        logger.error(f"Failed to list pods for anomaly detection: {e}")
        return []

    for pod in pods:
        ns = pod.metadata.namespace
        pod_name = pod.metadata.name
        owner = _extract_workload_owner(pod)
        phase = pod.status.phase or "Unknown"

        # Check container statuses
        container_statuses = pod.status.container_statuses or []
        for cs in container_statuses:
            c_name = cs.name
            restarts = cs.restart_count or 0

            # 1. CrashLoopBackOff or Error
            state = cs.state
            if state and state.waiting:
                reason = state.waiting.reason or ""
                message = state.waiting.message or ""
                if reason in ("CrashLoopBackOff", "Error"):
                    anomalies.append({
                        "title": f"CrashLoopBackOff: {pod_name}",
                        "namespace": ns,
                        "severity": "critical",
                        "resource_kind": owner["kind"],
                        "resource_name": owner["name"],
                        "pod_name": pod_name,
                        "container_name": c_name,
                        "reason": reason,
                        "message": message or f"Container '{c_name}' is in {reason} with {restarts} restarts",
                        "restarts": restarts,
                        "recommended_action": "restart",
                        "action_payload": {
                            "kind": owner["kind"],
                            "name": owner["name"],
                            "pod_name": pod_name,
                            "namespace": ns,
                            "action": "restart",
                        },
                    })
                elif reason in ("ImagePullBackOff", "ErrImagePull"):
                    anomalies.append({
                        "title": f"Image Pull Failure: {pod_name}",
                        "namespace": ns,
                        "severity": "warning",
                        "resource_kind": owner["kind"],
                        "resource_name": owner["name"],
                        "pod_name": pod_name,
                        "container_name": c_name,
                        "reason": reason,
                        "message": message or f"Container '{c_name}' failed to pull image",
                        "restarts": restarts,
                        "recommended_action": "review_image",
                        "action_payload": {
                            "kind": owner["kind"],
                            "name": owner["name"],
                            "pod_name": pod_name,
                            "namespace": ns,
                            "action": "restart",
                        },
                    })

            # 2. Terminated with OOMKilled
            if state and state.terminated:
                term_reason = state.terminated.reason or ""
                exit_code = state.terminated.exit_code
                if term_reason == "OOMKilled" or exit_code == 137:
                    anomalies.append({
                        "title": f"OOMKilled: {pod_name}",
                        "namespace": ns,
                        "severity": "critical",
                        "resource_kind": owner["kind"],
                        "resource_name": owner["name"],
                        "pod_name": pod_name,
                        "container_name": c_name,
                        "reason": "OOMKilled",
                        "message": f"Container '{c_name}' exceeded memory limits (exit code {exit_code})",
                        "restarts": restarts,
                        "recommended_action": "restart",
                        "action_payload": {
                            "kind": owner["kind"],
                            "name": owner["name"],
                            "pod_name": pod_name,
                            "namespace": ns,
                            "action": "restart",
                        },
                    })

            # 3. Frequent Restarts (> 3 restarts and not running cleanly)
            if restarts >= 3 and not (state and state.waiting and state.waiting.reason in ("CrashLoopBackOff", "Error")):
                if state and not (state.running and cs.ready):
                    anomalies.append({
                        "title": f"High Restarts ({restarts}): {pod_name}",
                        "namespace": ns,
                        "severity": "warning",
                        "resource_kind": owner["kind"],
                        "resource_name": owner["name"],
                        "pod_name": pod_name,
                        "container_name": c_name,
                        "reason": "HighRestarts",
                        "message": f"Container '{c_name}' has restarted {restarts} times",
                        "restarts": restarts,
                        "recommended_action": "restart",
                        "action_payload": {
                            "kind": owner["kind"],
                            "name": owner["name"],
                            "pod_name": pod_name,
                            "namespace": ns,
                            "action": "restart",
                        },
                    })

        # 4. Evicted or Failed Pods
        if phase in ("Failed", "Unknown"):
            pod_reason = pod.status.reason or phase
            pod_msg = pod.status.message or f"Pod {pod_name} is in phase {phase}"
            anomalies.append({
                "title": f"Pod {pod_reason}: {pod_name}",
                "namespace": ns,
                "severity": "critical" if pod_reason == "Evicted" else "warning",
                "resource_kind": "Pod",
                "resource_name": pod_name,
                "pod_name": pod_name,
                "container_name": "",
                "reason": pod_reason,
                "message": pod_msg,
                "restarts": 0,
                "recommended_action": "delete_pod",
                "action_payload": {
                    "kind": "Pod",
                    "name": pod_name,
                    "pod_name": pod_name,
                    "namespace": ns,
                    "action": "delete_pod",
                },
            })

    # Deduplicate and sync to database
    detected_incidents = []
    for item in anomalies:
        # Check if an open incident exists for this pod and reason
        stmt = (
            select(ClusterIncident)
            .where(
                ClusterIncident.namespace == item["namespace"],
                ClusterIncident.status == "open",
            )
            .order_by(ClusterIncident.id.desc())
        )
        result = await db.execute(stmt)
        existing = None
        for inc in result.scalars().all():
            inc_details = inc.details or {}
            if (
                inc_details.get("pod_name") == item["pod_name"]
                and inc_details.get("reason") == item["reason"]
            ):
                existing = inc
                break

        if existing:
            # Update last seen details
            current_details = dict(existing.details or {})
            current_details.update({
                "last_seen": datetime.now(timezone.utc).isoformat(),
                "restarts": item["restarts"],
                "message": item["message"],
            })
            existing.details = current_details
            detected_incidents.append(existing)
        else:
            # Create new incident record
            now = datetime.now(timezone.utc)
            new_incident = ClusterIncident(
                title=item["title"],
                namespace=item["namespace"],
                severity=item["severity"],
                source="AnomalyDetector",
                details={
                    "resource_kind": item["resource_kind"],
                    "resource_name": item["resource_name"],
                    "pod_name": item["pod_name"],
                    "container_name": item["container_name"],
                    "reason": item["reason"],
                    "message": item["message"],
                    "restarts": item["restarts"],
                    "recommended_action": item["recommended_action"],
                    "action_payload": item["action_payload"],
                    "detected_at": now.isoformat(),
                    "last_seen": now.isoformat(),
                },
                status="open",
                created_at=now,
            )
            db.add(new_incident)
            await db.flush()
            detected_incidents.append(new_incident)

            # Auto-healing execution if configured
            if monitor_settings.get("auto_heal_enabled") and item["recommended_action"] in ("restart", "delete_pod"):
                try:
                    await execute_self_healing(db, new_incident.id, initiated_by="auto_heal_agent")
                except Exception as ex:
                    logger.error(f"Auto-heal failed for incident {new_incident.id}: {ex}")

    await db.commit()
    return anomalies


async def execute_self_healing(
    db: AsyncSession,
    incident_id: int,
    initiated_by: str = "user",
) -> Dict[str, Any]:
    """Execute automated remediation action for a detected incident."""
    stmt = select(ClusterIncident).where(ClusterIncident.id == incident_id)
    result = await db.execute(stmt)
    incident = result.scalar_one_or_none()

    if not incident:
        raise ValueError(f"Incident with ID {incident_id} not found")

    if incident.status == "resolved":
        return {
            "status": "already_resolved",
            "message": "Incident is already resolved",
            "incident_id": incident_id,
        }

    details = dict(incident.details or {})
    action_payload = details.get("action_payload") or {}
    action = action_payload.get("action") or details.get("recommended_action") or "restart"
    target_kind = (action_payload.get("kind") or details.get("resource_kind") or "Pod").capitalize()
    target_name = action_payload.get("name") or details.get("resource_name") or details.get("pod_name")
    namespace = incident.namespace or "default"

    heal_message = ""
    success = False

    try:
        now_ts = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

        if action == "restart":
            apps = get_apps_client()
            v1 = get_k8s_client()

            if target_kind == "Deployment":
                apps.patch_namespaced_deployment(
                    name=target_name,
                    namespace=namespace,
                    body={
                        "spec": {
                            "template": {
                                "metadata": {
                                    "annotations": {
                                        "kubectl.kubernetes.io/restartedAt": now_ts
                                    }
                                }
                            }
                        }
                    },
                )
                heal_message = f"Triggered rolling restart for Deployment '{target_name}' in namespace '{namespace}'"
                success = True

            elif target_kind == "Statefulset":
                apps.patch_namespaced_stateful_set(
                    name=target_name,
                    namespace=namespace,
                    body={
                        "spec": {
                            "template": {
                                "metadata": {
                                    "annotations": {
                                        "kubectl.kubernetes.io/restartedAt": now_ts
                                    }
                                }
                            }
                        }
                    },
                )
                heal_message = f"Triggered rolling restart for StatefulSet '{target_name}' in namespace '{namespace}'"
                success = True

            elif target_kind == "Daemonset":
                apps.patch_namespaced_daemon_set(
                    name=target_name,
                    namespace=namespace,
                    body={
                        "spec": {
                            "template": {
                                "metadata": {
                                    "annotations": {
                                        "kubectl.kubernetes.io/restartedAt": now_ts
                                    }
                                }
                            }
                        }
                    },
                )
                heal_message = f"Triggered rolling restart for DaemonSet '{target_name}' in namespace '{namespace}'"
                success = True

            else:
                # Direct Pod restart: delete pod so replicaset or cluster recreates it
                pod_to_del = details.get("pod_name") or target_name
                v1.delete_namespaced_pod(name=pod_to_del, namespace=namespace)
                heal_message = f"Deleted crashed Pod '{pod_to_del}' in namespace '{namespace}' to trigger recreation"
                success = True

        elif action == "delete_pod":
            v1 = get_k8s_client()
            pod_to_del = details.get("pod_name") or target_name
            v1.delete_namespaced_pod(name=pod_to_del, namespace=namespace)
            heal_message = f"Deleted failed Pod '{pod_to_del}' in namespace '{namespace}'"
            success = True

        else:
            raise ValueError(f"Unsupported healing action: {action}")

    except ApiException as e:
        heal_message = f"Kubernetes API error during self-healing: {e.reason}"
        success = False
    except Exception as e:
        heal_message = f"Error during self-healing: {str(e)}"
        success = False

    # Record in audit trail
    await record_audit_log(
        action_type="auto_heal",
        resource_kind=target_kind,
        resource_name=target_name,
        namespace=namespace,
        initiated_by=initiated_by,
        payload={"incident_id": incident_id, "action": action, "heal_message": heal_message},
        status="success" if success else "failed",
        message=heal_message,
    )

    if success:
        details["healed_at"] = datetime.now(timezone.utc).isoformat()
        details["healed_by"] = initiated_by
        details["resolution_note"] = heal_message
        incident.details = details
        incident.status = "resolved"
        await db.commit()

        return {
            "status": "success",
            "message": heal_message,
            "incident_id": incident_id,
            "resolved": True,
        }
    else:
        await db.commit()
        raise RuntimeError(heal_message)


async def background_monitor_worker():
    """Background task running periodic anomaly scans."""
    monitor_settings["is_running"] = True
    logger.info("Autonomous Anomaly Detection & Self-Healing monitor started.")

    while monitor_settings["is_running"]:
        try:
            interval = monitor_settings.get("scan_interval_seconds", 30)
            await asyncio.sleep(interval)
            async with AsyncSessionLocal() as session:
                await scan_cluster_for_anomalies(session)
        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.warning(f"Error in background monitor tick: {e}")
            await asyncio.sleep(10)

    logger.info("Autonomous Anomaly Detection monitor stopped.")


def start_monitor():
    """Start the background monitor task."""
    global _monitor_task
    if _monitor_task is None or _monitor_task.done():
        _monitor_task = asyncio.create_task(background_monitor_worker())


def stop_monitor():
    """Stop the background monitor task."""
    global _monitor_task
    monitor_settings["is_running"] = False
    if _monitor_task and not _monitor_task.done():
        _monitor_task.cancel()
