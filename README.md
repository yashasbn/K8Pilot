# K8Pilot – AI Cloud Operations Platform

Your AI DevOps Engineer. Connect a Kubernetes cluster and get AI-powered monitoring, incident analysis, cost optimization, and auto-healing.

## Disk Space & Resource Requirements

Running the full K8Pilot stack locally requires a minimum amount of disk space and system resources to accommodate Docker images, local AI models, and the local Kubernetes cluster:

- **Disk Space**: **~15 GB to 25 GB** of free space is highly recommended:
  - **Docker Images & Databases**: ~5 GB (Backend, Frontend, Postgres, Redis, Prometheus).
  - **Local AI Models (Ollama)**: ~2 GB to 10 GB depending on the model (e.g. `llama3` is 4.7 GB, `gemma2:2b` is 1.6 GB).
  - **Minikube VM / Storage**: ~5 GB for cluster state, caches, and sample container workloads.
- **RAM**: **Minimum 16 GB** (with 8 GB allocated to Minikube).
- **CPU**: **4+ Cores** (recommended for running local Ollama inference efficiently).

---

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

To avoid installing Python, Node.js, and other host dependencies directly on your machine, you can run the entire stack inside Docker.

#### Docker Desktop DNS Configuration (Required)

Before first run, configure Docker Desktop to use public DNS servers to avoid image pull failures:

1. Open **Docker Desktop → Settings → Docker Engine**
2. Add the `dns` field to the JSON config:
   ```json
   {
     "builder": {
       "gc": {
         "defaultKeepStorage": "20GB",
         "enabled": true
       }
     },
     "experimental": false,
     "dns": [
       "8.8.8.8",
       "8.8.4.4"
     ]
   }
   ```
3. Click **Apply & Restart**

#### Launch Everything

A single command starts Minikube, all Docker services, and connects the backend to the cluster:

```powershell
.\run.ps1 dev
```

This will:
1. Start a Minikube cluster (`K8Pilot` profile) with the Docker driver
2. Generate a container-compatible kubeconfig at `infra/docker/kube-config.yaml`
3. Build & start all Docker Compose services (Postgres, Redis, Ollama, Prometheus, Backend, Frontend)
4. Connect the backend container to the Minikube Docker network

The first startup will automatically download the `llama3.2:1b` AI model (~1.3 GB) inside the Ollama container, which may take a few minutes.

#### Deploy Sample Workloads

```powershell
.\run.ps1 deploy-sample
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
