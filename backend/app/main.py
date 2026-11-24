from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import cluster, metrics, ai, health, actions, audit, incidents
from app.core.config import settings
from app.core.database import init_db
from app.core.monitor import start_monitor, stop_monitor


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize database tables on startup
    await init_db()
    start_monitor()
    yield
    stop_monitor()


app = FastAPI(
    title=settings.app_name,
    description="AI-powered Kubernetes operations platform",
    version="0.1.0",
    lifespan=lifespan,
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
app.include_router(audit.router, prefix="/api")
app.include_router(incidents.router, prefix="/api")


@app.get("/")
def root():
    return {"app": settings.app_name, "version": "0.1.0"}
