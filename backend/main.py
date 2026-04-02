from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from database import engine, Base
from routers import auth, documents, billing
from config import get_settings
import os

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
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(auth.router)
app.include_router(documents.router)
app.include_router(billing.router)


@app.get("/health")
def health():
    return {"status": "ok"}


# Serve React frontend (after building)
FRONTEND_BUILD = os.path.join(os.path.dirname(__file__), "..", "frontend", "build")
if os.path.exists(FRONTEND_BUILD):
    app.mount("/static", StaticFiles(directory=os.path.join(FRONTEND_BUILD, "static")), name="static")

    @app.get("/{full_path:path}")
    def serve_react(full_path: str):
        index = os.path.join(FRONTEND_BUILD, "index.html")
        return FileResponse(index)
