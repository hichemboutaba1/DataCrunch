from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from database import get_db
from models import User, Organization, Subscription, SubscriptionStatus
from schemas import UserRegister, Token, UserResponse
from services.auth import hash_password, verify_password, create_access_token, get_current_user
from services.billing import create_stripe_customer
from datetime import datetime, timedelta
from config import get_settings

router = APIRouter(prefix="/auth", tags=["Authentication"])
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")
settings = get_settings()


def get_authenticated_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    user = get_current_user(token, db)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account is disabled")
    return user


@router.post("/register", response_model=Token, status_code=201)
def register(data: UserRegister, db: Session = Depends(get_db)):
    # Check if email already exists
    if db.query(User).filter(User.email == data.email).first():
        raise HTTPException(status_code=400, detail="Email already registered")

    # Create organization
    org = Organization(name=data.organization_name)
    db.add(org)
    db.flush()  # Get org.id before commit

    # Create Stripe customer
    try:
        stripe_customer_id = create_stripe_customer(data.email, data.organization_name)
        org.stripe_customer_id = stripe_customer_id
    except Exception:
        # Don't block registration if Stripe fails in dev
        pass

    # Create subscription (trial by default)
    sub = Subscription(
        organization_id=org.id,
        status=SubscriptionStatus.trialing,
        monthly_quota=settings.MONTHLY_QUOTA,
        documents_used=0,
        period_start=datetime.utcnow(),
        period_end=datetime.utcnow() + timedelta(days=30),
    )
    db.add(sub)

    # Create user
    user = User(
        email=data.email,
        hashed_password=hash_password(data.password),
        full_name=data.full_name,
        organization_id=org.id,
    )
    db.add(user)
    db.commit()

    token = create_access_token({"sub": user.email})
    return Token(access_token=token)


@router.post("/login", response_model=Token)
def login(form: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == form.username).first()
    if not user or not verify_password(form.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    token = create_access_token({"sub": user.email})
    return Token(access_token=token)


@router.get("/me", response_model=UserResponse)
def me(current_user: User = Depends(get_authenticated_user)):
    return current_user
