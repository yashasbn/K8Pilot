from fastapi import APIRouter, HTTPException
import httpx

from app.core.config import settings

router = APIRouter(prefix="/metrics", tags=["metrics"])


@router.get("/cpu")
async def cluster_cpu():
    """Get cluster-wide CPU usage from Prometheus."""
    query = '1 - avg(rate(node_cpu_seconds_total{mode="idle"}[5m]))'
    return await _query_prometheus(query)


@router.get("/memory")
async def cluster_memory():
    """Get cluster-wide memory usage from Prometheus."""
    query = '1 - (sum(node_memory_MemAvailable_bytes) / sum(node_memory_MemTotal_bytes))'
    return await _query_prometheus(query)


@router.get("/pod-restarts")
async def pod_restarts(namespace: str = "default"):
    """Get pod restart counts."""
    query = f'sum by (pod) (kube_pod_container_status_restarts_total{{namespace="{namespace}"}})'
    return await _query_prometheus(query)


@router.get("/query")
async def custom_query(promql: str):
    """Run a custom PromQL query."""
    return await _query_prometheus(promql)


async def _query_prometheus(query: str) -> dict:
    """Execute a PromQL instant query."""
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                f"{settings.prometheus_url}/api/v1/query",
                params={"query": query},
            )
            resp.raise_for_status()
            data = resp.json()
            if data.get("status") != "success":
                raise HTTPException(status_code=502, detail="Prometheus query failed")
            return {"query": query, "result": data["data"]["result"]}
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"Prometheus unreachable: {e}")
