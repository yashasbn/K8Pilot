from fastapi import APIRouter
import redis.asyncio as redis
import httpx

from app.core.config import settings

router = APIRouter(tags=["health"])


@router.get("/health")
async def health_check():
    """Check connectivity to all backend services."""
    checks = {}

    # Redis
    try:
        r = redis.from_url(settings.redis_url)
        await r.ping()
        checks["redis"] = "ok"
        await r.aclose()
    except Exception:
        checks["redis"] = "unreachable"

    # Prometheus
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            resp = await client.get(f"{settings.prometheus_url}/-/healthy")
            checks["prometheus"] = "ok" if resp.status_code == 200 else "unhealthy"
    except Exception:
        checks["prometheus"] = "unreachable"

    # Ollama
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            resp = await client.get(f"{settings.ollama_url}/api/tags")
            checks["ollama"] = "ok" if resp.status_code == 200 else "unhealthy"
    except Exception:
        checks["ollama"] = "unreachable"

    all_ok = all(v == "ok" for v in checks.values())
    return {"status": "healthy" if all_ok else "degraded", "checks": checks}
