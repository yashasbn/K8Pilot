from __future__ import annotations

import logging
from typing import Any, Optional
from app.core.database import AsyncSessionLocal
from app.models.audit import AuditLog

logger = logging.getLogger(__name__)


async def record_audit_log(
    action_type: str,
    resource_kind: str,
    resource_name: str,
    namespace: str = "default",
    initiated_by: str = "user",
    payload: Optional[Any] = None,
    status: str = "success",
    message: Optional[str] = None,
) -> None:
    """Persist a cluster operation to the PostgreSQL audit log."""
    try:
        async with AsyncSessionLocal() as session:
            log_entry = AuditLog(
                action_type=action_type,
                resource_kind=resource_kind,
                resource_name=resource_name,
                namespace=namespace,
                initiated_by=initiated_by,
                payload=payload,
                status=status,
                message=message,
            )
            session.add(log_entry)
            await session.commit()
    except Exception as e:
        logger.error(f"Failed to record audit log: {e}")
