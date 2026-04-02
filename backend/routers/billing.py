from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from database import get_db
from models import User, Organization, Subscription
from routers.auth import get_authenticated_user
from services.billing import (
    create_subscription, get_subscription_status, handle_webhook
)
from config import get_settings

router = APIRouter(prefix="/billing", tags=["Billing"])
settings = get_settings()


@router.post("/subscribe")
def subscribe(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_authenticated_user),
):
    """Creates a Stripe subscription for the user's organization."""
    org = db.query(Organization).filter(
        Organization.id == current_user.organization_id
    ).first()

    if not org or not org.stripe_customer_id:
        raise HTTPException(status_code=400, detail="No Stripe customer found for this organization")

    sub = db.query(Subscription).filter(
        Subscription.organization_id == org.id
    ).first()

    if sub and sub.stripe_subscription_id:
        raise HTTPException(status_code=400, detail="Already subscribed")

    try:
        stripe_sub = create_subscription(org.stripe_customer_id)

        if sub:
            sub.stripe_subscription_id = stripe_sub.id
            sub.status = stripe_sub.status
        db.commit()

        return {
            "subscription_id": stripe_sub.id,
            "status": stripe_sub.status,
            "client_secret": stripe_sub.latest_invoice.payment_intent.client_secret,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/status")
def billing_status(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_authenticated_user),
):
    sub = db.query(Subscription).filter(
        Subscription.organization_id == current_user.organization_id
    ).first()

    if not sub:
        return {"status": "no_subscription"}

    return {
        "status": sub.status,
        "monthly_quota": sub.monthly_quota,
        "documents_used": sub.documents_used,
        "documents_remaining": sub.documents_remaining,
        "is_over_quota": sub.is_over_quota,
        "period_end": sub.period_end,
    }


@router.post("/webhook")
async def stripe_webhook(request: Request, db: Session = Depends(get_db)):
    """Stripe webhook endpoint — receives billing events."""
    payload = await request.body()
    sig_header = request.headers.get("stripe-signature")

    if not sig_header:
        raise HTTPException(status_code=400, detail="Missing Stripe signature")

    try:
        result = handle_webhook(payload, sig_header, db)
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
