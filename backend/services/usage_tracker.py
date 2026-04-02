from sqlalchemy.orm import Session
from sqlalchemy.sql import func
from datetime import datetime
from models import Subscription, DocumentLog, DocumentStatus
from config import get_settings

settings = get_settings()


def get_subscription(db: Session, organization_id: int) -> Subscription | None:
    return db.query(Subscription).filter(
        Subscription.organization_id == organization_id
    ).first()


def can_process_document(db: Session, organization_id: int) -> dict:
    """
    Returns dict:
      - allowed: bool
      - is_overage: bool  (true if beyond quota but allowed via overage billing)
      - documents_remaining: int
      - message: str
    """
    sub = get_subscription(db, organization_id)

    if not sub:
        return {"allowed": False, "is_overage": False,
                "documents_remaining": 0, "message": "No active subscription found."}

    if sub.status not in ("active", "trialing"):
        return {"allowed": False, "is_overage": False,
                "documents_remaining": 0, "message": "Subscription is not active."}

    is_overage = sub.documents_used >= sub.monthly_quota
    remaining = sub.documents_remaining

    return {
        "allowed": True,
        "is_overage": is_overage,
        "documents_remaining": remaining,
        "message": "OK" if not is_overage else f"Overage billing applies (1€ per document)"
    }


def increment_usage(db: Session, organization_id: int) -> Subscription:
    sub = get_subscription(db, organization_id)
    if sub:
        sub.documents_used += 1
        db.commit()
        db.refresh(sub)
    return sub


def reset_monthly_usage(db: Session, organization_id: int) -> Subscription:
    """Called by Stripe webhook at the start of each billing period."""
    sub = get_subscription(db, organization_id)
    if sub:
        sub.documents_used = 0
        db.commit()
        db.refresh(sub)
    return sub
