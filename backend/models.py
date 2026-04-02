from sqlalchemy import (
    Column, Integer, String, Boolean, DateTime, Float,
    ForeignKey, Enum, Text
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import enum
from database import Base


class SubscriptionStatus(str, enum.Enum):
    active = "active"
    canceled = "canceled"
    past_due = "past_due"
    trialing = "trialing"


class DocumentStatus(str, enum.Enum):
    pending = "pending"
    processing = "processing"
    completed = "completed"
    failed = "failed"


class DocumentType(str, enum.Enum):
    financial_statement = "financial_statement"
    payroll = "payroll"
    revenue_list = "revenue_list"
    other = "other"


# ─────────────────────────────────────────────
# ORGANIZATION
# ─────────────────────────────────────────────
class Organization(Base):
    __tablename__ = "organizations"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    stripe_customer_id = Column(String(255), unique=True, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    users = relationship("User", back_populates="organization")
    subscription = relationship("Subscription", back_populates="organization", uselist=False)
    document_logs = relationship("DocumentLog", back_populates="organization")


# ─────────────────────────────────────────────
# USER
# ─────────────────────────────────────────────
class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    full_name = Column(String(255), nullable=True)
    is_active = Column(Boolean, default=True)
    is_admin = Column(Boolean, default=False)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    organization = relationship("Organization", back_populates="users")
    document_logs = relationship("DocumentLog", back_populates="user")


# ─────────────────────────────────────────────
# SUBSCRIPTION
# ─────────────────────────────────────────────
class Subscription(Base):
    __tablename__ = "subscriptions"

    id = Column(Integer, primary_key=True, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False)
    stripe_subscription_id = Column(String(255), unique=True, nullable=True)
    status = Column(Enum(SubscriptionStatus), default=SubscriptionStatus.trialing)
    monthly_quota = Column(Integer, default=100)       # 100 docs inclus
    documents_used = Column(Integer, default=0)        # compteur du mois
    period_start = Column(DateTime(timezone=True), nullable=True)
    period_end = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    organization = relationship("Organization", back_populates="subscription")

    @property
    def documents_remaining(self) -> int:
        return max(0, self.monthly_quota - self.documents_used)

    @property
    def is_over_quota(self) -> bool:
        return self.documents_used > self.monthly_quota


# ─────────────────────────────────────────────
# DOCUMENT LOG
# ─────────────────────────────────────────────
class DocumentLog(Base):
    __tablename__ = "document_logs"

    id = Column(Integer, primary_key=True, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    filename = Column(String(500), nullable=False)
    document_type = Column(Enum(DocumentType), default=DocumentType.other)
    status = Column(Enum(DocumentStatus), default=DocumentStatus.pending)
    file_size_bytes = Column(Integer, nullable=True)
    pages_count = Column(Integer, nullable=True)
    extracted_data = Column(Text, nullable=True)       # JSON string
    excel_path = Column(String(500), nullable=True)    # path to generated Excel
    validation_passed = Column(Boolean, nullable=True) # True if sums match
    validation_notes = Column(Text, nullable=True)     # mismatch details
    error_message = Column(Text, nullable=True)
    is_overage = Column(Boolean, default=False)        # was this a paid overage?
    stripe_usage_record_id = Column(String(255), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    completed_at = Column(DateTime(timezone=True), nullable=True)

    # Relationships
    organization = relationship("Organization", back_populates="document_logs")
    user = relationship("User", back_populates="document_logs")
