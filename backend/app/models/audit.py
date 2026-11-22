from __future__ import annotations

from datetime import datetime
from typing import Any, Optional
from sqlalchemy import DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.types import JSON

from app.core.database import Base


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    action_type: Mapped[str] = mapped_column(String(50), index=True)  # scale, delete_pod, restart
    resource_kind: Mapped[str] = mapped_column(String(50))  # Deployment, Pod, StatefulSet, DaemonSet
    resource_name: Mapped[str] = mapped_column(String(255), index=True)
    namespace: Mapped[str] = mapped_column(String(255), index=True, default="default")
    initiated_by: Mapped[str] = mapped_column(String(50), default="user")  # "user" or "ai"
    payload: Mapped[Optional[Any]] = mapped_column(JSON, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="success", index=True)  # success, failed
    message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow, index=True
    )


class ClusterIncident(Base):
    __tablename__ = "cluster_incidents"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    title: Mapped[str] = mapped_column(String(255))
    namespace: Mapped[str] = mapped_column(String(255), index=True, default="default")
    severity: Mapped[str] = mapped_column(String(20), default="warning")  # warning, critical, info
    source: Mapped[str] = mapped_column(String(50), default="EventWatcher")
    details: Mapped[Optional[Any]] = mapped_column(JSON, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="open")  # open, resolved
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow, index=True
    )
