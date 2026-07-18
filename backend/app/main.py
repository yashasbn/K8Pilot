from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import cluster, metrics, ai, health, actions
from app.core.config import settings

app = FastAPI(
    title=settings.app_name,
    description="AI-powered Kubernetes operations platform",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],  # Vite dev server
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(cluster.router, prefix="/api")
app.include_router(metrics.router, prefix="/api")
app.include_router(ai.router, prefix="/api")
app.include_router(actions.router, prefix="/api")


@app.get("/")
def root():
    return {"app": settings.app_name, "version": "0.1.0"}
