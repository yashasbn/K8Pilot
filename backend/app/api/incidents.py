from __future__ import annotations

from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.monitor import (
    execute_self_healing,
    scan_cluster_for_anomalies,
    monitor_settings,
)
from app.models.audit import ClusterIncident

router = APIRouter(prefix="/incidents", tags=["incidents"])


class HealRequest(BaseModel):
    initiated_by: str = "user"


class MonitorSettingsUpdate(BaseModel):
    auto_heal_enabled: Optional[bool] = None
    scan_interval_seconds: Optional[int] = None


@router.get("")
async def list_incidents(
    status: Optional[str] = Query("open", description="open, resolved, dismissed, or all"),
    severity: Optional[str] = Query(None, description="critical, warning, info"),
    namespace: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
):
    """List cluster incidents sorted by newest first."""
    stmt = select(ClusterIncident).order_by(ClusterIncident.created_at.desc())

    if status and status != "all":
        stmt = stmt.where(ClusterIncident.status == status)

    if severity:
        stmt = stmt.where(ClusterIncident.severity == severity)

    if namespace:
        stmt = stmt.where(ClusterIncident.namespace == namespace)

    stmt = stmt.limit(limit)
    result = await db.execute(stmt)
    incidents = result.scalars().all()

    return [
        {
            "id": inc.id,
            "title": inc.title,
            "namespace": inc.namespace,
            "severity": inc.severity,
            "source": inc.source,
            "details": inc.details,
            "status": inc.status,
            "created_at": inc.created_at.isoformat() if inc.created_at else None,
        }
        for inc in incidents
    ]


@router.get("/stats")
async def get_incident_stats(db: AsyncSession = Depends(get_db)):
    """Summary counts of incidents across cluster."""
    # Count open, critical, warning, resolved
    open_count = await db.scalar(
        select(func.count(ClusterIncident.id)).where(ClusterIncident.status == "open")
    ) or 0

    critical_count = await db.scalar(
        select(func.count(ClusterIncident.id)).where(
            ClusterIncident.status == "open",
            ClusterIncident.severity == "critical",
        )
    ) or 0

    warning_count = await db.scalar(
        select(func.count(ClusterIncident.id)).where(
            ClusterIncident.status == "open",
            ClusterIncident.severity == "warning",
        )
    ) or 0

    resolved_count = await db.scalar(
        select(func.count(ClusterIncident.id)).where(
            ClusterIncident.status.in_(["resolved", "dismissed"])
        )
    ) or 0

    return {
        "open": open_count,
        "critical": critical_count,
        "warning": warning_count,
        "resolved": resolved_count,
        "auto_heal_enabled": monitor_settings.get("auto_heal_enabled", False),
    }


@router.post("/scan")
async def trigger_scan(db: AsyncSession = Depends(get_db)):
    """Trigger an immediate scan for cluster anomalies."""
    anomalies = await scan_cluster_for_anomalies(db)
    return {
        "status": "success",
        "anomalies_detected": len(anomalies),
        "anomalies": anomalies,
    }


@router.post("/{incident_id}/heal")
async def heal_incident_endpoint(
    incident_id: int,
    req: HealRequest = HealRequest(),
    db: AsyncSession = Depends(get_db),
):
    """Trigger self-healing action for a specific incident."""
    try:
        result = await execute_self_healing(
            db=db,
            incident_id=incident_id,
            initiated_by=req.initiated_by,
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{incident_id}/dismiss")
async def dismiss_incident(
    incident_id: int,
    db: AsyncSession = Depends(get_db),
):
    """Mark an incident as dismissed/resolved without remediation."""
    stmt = select(ClusterIncident).where(ClusterIncident.id == incident_id)
    result = await db.execute(stmt)
    incident = result.scalar_one_or_none()

    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")

    incident.status = "dismissed"
    details = dict(incident.details or {})
    details["dismissed_at"] = func.now()
    details["resolution_note"] = "Dismissed by user"
    incident.details = details

    await db.commit()
    return {"status": "success", "message": f"Incident {incident_id} dismissed"}


@router.get("/settings")
async def get_monitor_settings():
    """Get background monitor and auto-heal configuration."""
    return monitor_settings


@router.post("/settings")
async def update_monitor_settings(update_data: MonitorSettingsUpdate):
    """Update background monitor and auto-heal configuration."""
    if update_data.auto_heal_enabled is not None:
        monitor_settings["auto_heal_enabled"] = update_data.auto_heal_enabled
    if update_data.scan_interval_seconds is not None:
        monitor_settings["scan_interval_seconds"] = max(5, update_data.scan_interval_seconds)

    return monitor_settings
