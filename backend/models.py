from datetime import datetime, timezone

from sqlalchemy import Column, Integer, String, ForeignKey, DateTime, Boolean
from sqlalchemy.orm import relationship
from database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    email = Column(String, unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=False)
    role = Column(String, default="patient")
    is_active = Column(Boolean, default=True, nullable=False, server_default="1")


class Assessment(Base):
    __tablename__ = "assessments"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    status = Column(String, default="pending")
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    owner = relationship("User")


class ImageAsset(Base):
    __tablename__ = "image_assets"

    id = Column(Integer, primary_key=True, index=True)
    assessment_id = Column(Integer, ForeignKey("assessments.id"), nullable=False)
    stored_name = Column(String, nullable=False)   # random naam jisse file save hui
    size_bytes = Column(Integer, nullable=False)
    content_type = Column(String, nullable=True)
    sha256 = Column(String, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class Prediction(Base):
    __tablename__ = "predictions"

    id = Column(Integer, primary_key=True, index=True)
    assessment_id = Column(Integer, ForeignKey("assessments.id"), nullable=False)
    predicted_class = Column(String, nullable=False)
    probabilities = Column(String, nullable=False)   # JSON text mein save hota hai
    model_version = Column(String, nullable=False)
    heatmap_name = Column(String, nullable=True)   # heatmap PNG ka random file naam (private folder)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class DoctorReview(Base):
    __tablename__ = "doctor_reviews"

    id = Column(Integer, primary_key=True, index=True)
    prediction_id = Column(Integer, ForeignKey("predictions.id"), nullable=False)
    doctor_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    comment = Column(String, nullable=False)
    agrees = Column(Boolean, default=True, nullable=False, server_default="1")
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, nullable=True)      # login fail ho to user pata nahi hota
    action = Column(String, nullable=False)       # jaise "login_success"
    detail = Column(String, nullable=True)        # extra info (id, email)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))