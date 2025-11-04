from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import Column, DateTime, ForeignKey, JSON, String, Text
from sqlalchemy.orm import relationship

from app.database import Base


class ProjectDB(Base):
    """Database model for projects linked to users."""

    __tablename__ = "projects"

    id = Column(String, primary_key=True, index=True)
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    prompt = Column(Text, nullable=False)
    status = Column(String, nullable=False, default="pending")
    template = Column(String, nullable=True)
    project_dir = Column(String, nullable=False)  # Stored as string path
    preview_url = Column(String, nullable=True)
    project_metadata = Column("metadata", JSON, nullable=False, default=dict)  # Column name "metadata" in DB, but attribute is project_metadata
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False)
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(UTC), onupdate=lambda: datetime.now(UTC), nullable=False)

    # Relationship to user (many-to-one)
    user = relationship("User", back_populates="projects")
    messages = relationship(
        "ProjectMessageDB",
        back_populates="project",
        cascade="all, delete-orphan",
        order_by="ProjectMessageDB.sequence",
    )

