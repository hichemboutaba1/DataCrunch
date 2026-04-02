from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # Database
    DATABASE_URL: str

    # Security
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60

    # Claude AI
    ANTHROPIC_API_KEY: str

    # Stripe
    STRIPE_SECRET_KEY: str
    STRIPE_WEBHOOK_SECRET: str
    STRIPE_PRICE_ID: str
    STRIPE_METER_ID: str = ""

    # App
    APP_NAME: str = "DataCrunch"
    FRONTEND_URL: str = "http://localhost:3000"
    MONTHLY_QUOTA: int = 100
    OVERAGE_PRICE_CENTS: int = 100  # 1€ = 100 cents

    class Config:
        env_file = ".env"


@lru_cache()
def get_settings() -> Settings:
    return Settings()
