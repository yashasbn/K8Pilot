from __future__ import annotations

from typing import Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy import desc, select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.audit import AuditLog

router = APIRouter(prefix="/audit", tags=["audit"])


@router.get("/logs")
async def list_audit_logs(
    namespace: Optional[str] = Query(None),
    action_type: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
):
    """Query cluster audit logs with optional filtering by namespace, action, and status."""
    stmt = select(AuditLog)

    if namespace and namespace != "_all":
        stmt = stmt.where(AuditLog.namespace == namespace)
    if action_type and action_type != "all":
        stmt = stmt.where(AuditLog.action_type == action_type)
    if status and status != "all":
        stmt = stmt.where(AuditLog.status == status)

    # Count total matching
    count_stmt = select(func.count()).select_from(stmt.subquery())
    total_result = await db.execute(count_stmt)
    total = total_result.scalar() or 0

    # Paginate and order by newest first
    stmt = stmt.order_by(desc(AuditLog.created_at)).limit(limit).offset(offset)
    result = await db.execute(stmt)
    logs = result.scalars().all()

    return {
        "logs": [
            {
                "id": log.id,
                "action_type": log.action_type,
                "resource_kind": log.resource_kind,
                "resource_name": log.resource_name,
                "namespace": log.namespace,
                "initiated_by": log.initiated_by,
                "payload": log.payload,
                "status": log.status,
                "message": log.message,
                "created_at": log.created_at.isoformat() if log.created_at else None,
            }
            for log in logs
        ],
        "total": total,
        "limit": limit,
        "offset": offset,
    }
