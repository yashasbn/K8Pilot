# K8Pilot – AI Cloud Operations Platform

Your AI DevOps Engineer. Connect a Kubernetes cluster and get AI-powered monitoring, incident analysis, cost optimization, and auto-healing.

## Prerequisites

### macOS/Linux
- [Docker Desktop](https://www.docker.com/products/docker-desktop/)
- [minikube](https://minikube.sigs.k8s.io/docs/start/) (`brew install minikube`)
- [kubectl](https://kubernetes.io/docs/tasks/tools/) (`brew install kubectl`)
- [Helm](https://helm.sh/docs/intro/install/) (`brew install helm`)
- [Python 3.12+](https://www.python.org/)
- [Node.js 20+](https://nodejs.org/)
- [Ollama](https://ollama.ai/) (for AI features)

### Windows
For Windows, all prerequisites can be automatically checked and installed using Chocolatey with the built-in setup target (see below). If you prefer manual installation:
- [Docker Desktop](https://www.docker.com/products/docker-desktop/)
- [minikube](https://minikube.sigs.k8s.io/docs/start/) (`choco install minikube`)
- [kubectl](https://kubernetes.io/docs/tasks/tools/) (`choco install kubernetes-cli`)
- [Helm](https://helm.sh/docs/intro/install/) (`choco install kubernetes-helm`)
- [Python 3.12+](https://www.python.org/) (`choco install python3`)
- [Node.js 20+](https://nodejs.org/) (`choco install nodejs`)
- [Ollama](https://ollama.ai/) (`choco install ollama`)

## Quick Start

### macOS/Linux

```bash
# 1. Spin up the K8s cluster (4 CPU, 8GB RAM)
make cluster-up

# 2. Install monitoring (Prometheus + Grafana)
make monitoring

# 3. Start local databases (PostgreSQL + Redis)
make infra-up

# 4. Port-forward monitoring services
make port-forward

# 5. Start backend (terminal 1)
make backend

# 6. Start frontend (terminal 2)
make frontend

# 7. Deploy test workloads
make deploy-sample
```

### Windows (Docker Compose - Recommended)

To avoid installing Python, Node.js, and other host dependencies directly on your machine, you can run the entire stack inside Docker:

```powershell
# 1. Start minikube with a static API port (required for the backend in Docker to connect to it)
minikube start --profile K8Pilot --cpus 4 --memory 8192 --driver docker --addons metrics-server --apiserver-port=8443

# 2. Spin up the entire Docker Compose environment (Database, Redis, Ollama, Prometheus, Backend, Frontend)
docker compose up -d
```

Your app will be fully built and started. The first startup will automatically download the `llama3` model inside the Ollama container, which may take a few minutes.

If you want to run sample workloads to verify the UI monitoring, run:
```powershell
kubectl create deployment nginx-test --image=nginx:alpine --replicas=3
```

## Access Points

| Service    | URL                          | Credentials  |
|------------|------------------------------|--------------|
| Frontend   | http://localhost:5173        | -            |
| Backend API| http://localhost:8000/docs   | -            |
| Prometheus | http://localhost:9090        | -            |
| Grafana    | http://localhost:3000        | admin/admin  |

## Project Structure

```
K8Pilot/
├── backend/              # FastAPI application
│   ├── app/
│   │   ├── api/          # Route handlers
│   │   ├── core/         # Config, K8s client
│   │   ├── models/       # SQLAlchemy models
│   │   └── services/     # Business logic
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/             # React + Vite + Tailwind
│   └── src/
│       ├── components/
│       └── pages/
├── infra/
│   ├── kind/             # Kind cluster config
│   ├── helm/             # Helm values for monitoring
│   └── docker/           # Additional Dockerfiles
├── docker-compose.yml    # Local PostgreSQL + Redis
└── Makefile              # All dev commands
```

## Development

### macOS/Linux
```bash
# See all available commands
make help

# Tear down everything
make clean
```

### Windows (PowerShell)
```powershell
# See all available commands
.\run.ps1 help

# Tear down everything
.\run.ps1 clean
```

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌────────────────┐
│   React UI  │────▶│  FastAPI     │────▶│  Kubernetes    │
│  (Vite)     │     │  Backend     │     │  API Server    │
└─────────────┘     └──────┬───────┘     └────────────────┘
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
      ┌────────────┐ ┌─────────┐ ┌─────────┐
      │ Prometheus │ │  Redis  │ │ Ollama  │
      │ + Grafana  │ │         │ │  (LLM)  │
      └────────────┘ └─────────┘ └─────────┘
              │
              ▼
      ┌────────────┐
      │ PostgreSQL │
      └────────────┘
```
