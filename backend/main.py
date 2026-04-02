from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from database import engine, Base
from routers import auth, documents, billing
from config import get_settings

settings = get_settings()

# Create all DB tables on startup
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="DataCrunch API",
    description="M&A Financial Analysis Automated — Due Diligence SaaS",
    version="1.0.0",
)

# CORS — allow frontend to call the API
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.FRONTEND_URL, "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(auth.router)
app.include_router(documents.router)
app.include_router(billing.router)


@app.get("/")
def root():
    return {"app": settings.APP_NAME, "status": "running", "version": "1.0.0"}


@app.get("/health")
def health():
    return {"status": "ok"}
