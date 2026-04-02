import stripe
from sqlalchemy.orm import Session
from models import Organization, Subscription, SubscriptionStatus
from config import get_settings
from datetime import datetime

settings = get_settings()
stripe.api_key = settings.STRIPE_SECRET_KEY


def create_stripe_customer(email: str, org_name: str) -> str:
    """Creates a Stripe customer and returns their customer ID."""
    customer = stripe.Customer.create(
        email=email,
        name=org_name,
        metadata={"app": "DataCrunch"}
    )
    return customer.id


def create_subscription(stripe_customer_id: str) -> stripe.Subscription:
    """Creates a Stripe subscription for the 99€/month plan."""
    return stripe.Subscription.create(
        customer=stripe_customer_id,
        items=[{"price": settings.STRIPE_PRICE_ID}],
        payment_behavior="default_incomplete",
        expand=["latest_invoice.payment_intent"],
    )


def report_overage_usage(stripe_customer_id: str, quantity: int = 1) -> dict:
    """
    Reports overage document usage to Stripe for metered billing.
    Called each time a document is processed beyond the quota.
    """
    if not settings.STRIPE_METER_ID:
        return {"status": "skipped", "reason": "No meter ID configured"}

    record = stripe.billing.MeterEvent.create(
        event_name=settings.STRIPE_METER_ID,
        payload={
            "stripe_customer_id": stripe_customer_id,
            "value": str(quantity),
        }
    )
    return {"status": "reported", "record": record}


def get_subscription_status(stripe_subscription_id: str) -> dict:
    """Fetches current subscription status from Stripe."""
    sub = stripe.Subscription.retrieve(stripe_subscription_id)
    return {
        "status": sub.status,
        "current_period_start": datetime.fromtimestamp(sub.current_period_start),
        "current_period_end": datetime.fromtimestamp(sub.current_period_end),
    }


def handle_webhook(payload: bytes, sig_header: str, db: Session):
    """
    Handles Stripe webhooks:
    - invoice.paid → reset monthly usage counter
    - customer.subscription.updated → update subscription status
    - customer.subscription.deleted → cancel subscription
    """
    try:
        event = stripe.Webhook.construct_event(
            payload, sig_header, settings.STRIPE_WEBHOOK_SECRET
        )
    except stripe.error.SignatureVerificationError:
        raise ValueError("Invalid webhook signature")

    event_type = event["type"]
    data = event["data"]["object"]

    if event_type == "invoice.paid":
        # New billing period started → reset document counter
        stripe_sub_id = data.get("subscription")
        if stripe_sub_id:
            sub = db.query(Subscription).filter(
                Subscription.stripe_subscription_id == stripe_sub_id
            ).first()
            if sub:
                sub.documents_used = 0
                sub.status = SubscriptionStatus.active
                db.commit()

    elif event_type == "customer.subscription.updated":
        stripe_sub_id = data.get("id")
        sub = db.query(Subscription).filter(
            Subscription.stripe_subscription_id == stripe_sub_id
        ).first()
        if sub:
            sub.status = data.get("status", sub.status)
            sub.period_start = datetime.fromtimestamp(data["current_period_start"])
            sub.period_end = datetime.fromtimestamp(data["current_period_end"])
            db.commit()

    elif event_type == "customer.subscription.deleted":
        stripe_sub_id = data.get("id")
        sub = db.query(Subscription).filter(
            Subscription.stripe_subscription_id == stripe_sub_id
        ).first()
        if sub:
            sub.status = SubscriptionStatus.canceled
            db.commit()

    return {"status": "handled", "event": event_type}
