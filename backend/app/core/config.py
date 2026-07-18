from __future__ import annotations

from typing import Optional

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    app_name: str = "KubePilot"
    debug: bool = True

    # Database
    database_url: str = "postgresql+asyncpg://kubepilot:kubepilot@localhost:5432/kubepilot"

    # Redis
    redis_url: str = "redis://localhost:6379/0"

    # Kubernetes
    kube_config_path: Optional[str] = None  # None = use default ~/.kube/config
    kube_context: Optional[str] = None

    # Prometheus
    prometheus_url: str = "http://localhost:9090"

    # LLM (Ollama)
    ollama_url: str = "http://localhost:11434"
    ollama_model: str = "llama3.2:1b"

    class Config:
        env_file = ".env"


settings = Settings()
