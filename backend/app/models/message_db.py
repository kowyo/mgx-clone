from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import JSON, Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from app.database import Base


class ProjectMessageDB(Base):
    """Database model for persisted project conversation messages."""

    __tablename__ = "project_messages"

    id = Column(String, primary_key=True, index=True)
    project_id = Column(
        String,
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    parent_id = Column(String, ForeignKey("project_messages.id"), nullable=True)
    role = Column(String, nullable=False)  # "user" or "assistant"
    status = Column(String, nullable=False, default="pending")
    content = Column(Text, nullable=False, default="")
    sequence = Column(Integer, nullable=False, index=True)
    message_metadata = Column("metadata", JSON, nullable=True, default=dict)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False)
    updated_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
        nullable=False,
    )

    project = relationship("ProjectDB", back_populates="messages", foreign_keys=[project_id])
    parent = relationship("ProjectMessageDB", remote_side=[id], backref="children")
