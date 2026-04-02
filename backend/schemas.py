from pydantic import BaseModel, EmailStr
from typing import Optional, List
from datetime import datetime
from models import SubscriptionStatus, DocumentStatus, DocumentType


# ─────────────────────────────────────────────
# AUTH
# ─────────────────────────────────────────────
class UserRegister(BaseModel):
    email: EmailStr
    password: str
    full_name: Optional[str] = None
    organization_name: str


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserResponse(BaseModel):
    id: int
    email: str
    full_name: Optional[str]
    is_active: bool
    organization_id: Optional[int]
    created_at: datetime

    class Config:
        from_attributes = True


# ─────────────────────────────────────────────
# SUBSCRIPTION
# ─────────────────────────────────────────────
class SubscriptionResponse(BaseModel):
    id: int
    status: SubscriptionStatus
    monthly_quota: int
    documents_used: int
    documents_remaining: int
    period_start: Optional[datetime]
    period_end: Optional[datetime]

    class Config:
        from_attributes = True


# ─────────────────────────────────────────────
# DOCUMENT
# ─────────────────────────────────────────────
class DocumentLogResponse(BaseModel):
    id: int
    filename: str
    document_type: DocumentType
    status: DocumentStatus
    pages_count: Optional[int]
    validation_passed: Optional[bool]
    validation_notes: Optional[str]
    is_overage: bool
    created_at: datetime
    completed_at: Optional[datetime]

    class Config:
        from_attributes = True


class DocumentListResponse(BaseModel):
    total: int
    items: List[DocumentLogResponse]


# ─────────────────────────────────────────────
# DASHBOARD
# ─────────────────────────────────────────────
class DashboardResponse(BaseModel):
    user: UserResponse
    subscription: Optional[SubscriptionResponse]
    recent_documents: List[DocumentLogResponse]
