# K8Pilot – System Architecture & Engineering Design

This document provides a comprehensive technical overview of **K8Pilot**, an AI-powered Cloud Operations & Kubernetes Management Platform ("AI DevOps Engineer").

---

## 1. High-Level Architecture Overview

```mermaid
flowchart TD
    subgraph ClientLayer["Client Layer (Browser)"]
        UI["React 18 + Vite SPA<br/>(Tailwind CSS, TanStack React Query)"]
    end

    subgraph HostGateway["Docker Compose Host Boundary (localhost)"]
        FE_Port["Port 5173 (Frontend Dev Server)"]
        BE_Port["Port 8000 (FastAPI API Gateway)"]
        Prom_Port["Port 9090 (Prometheus Web UI)"]
        Ollama_Port["Port 11434 (Ollama LLM Engine)"]
        PG_Port["Port 5432 (PostgreSQL Database)"]
        Redis_Port["Port 6379 (Redis Cache)"]
    end

    subgraph ServiceLayer["Core Application & Data Services"]
        Backend["FastAPI Backend<br/>(Async Python 3.12, Uvicorn)"]
        Postgres[("PostgreSQL 16<br/>(Cluster Audit, Sessions)")]
        Redis[("Redis 7<br/>(Ephemeral Cache & Queues)")]
        Ollama["Ollama Local AI<br/>(llama3:latest 8B)"]
        GeminiCloud["Google Gemini API<br/>(Gemini 2.5/2.0 Flash/Pro)"]
        Prometheus["Prometheus TSDB<br/>(Metric Scraper & Alerts)"]
    end

    subgraph K8sLayer["Kubernetes Cluster Boundary (Minikube: K8Pilot)"]
        APIServer["kube-apiserver<br/>(:8443 TLS)"]
        Kubelet["kubelet & cAdvisor"]
        MetricsServer["metrics-server<br/>(metrics.k8s.io/v1beta1)"]
        Workloads["User Workloads & Deployments<br/>(nginx, databases, microservices)"]
    end

    UI -->|"HTTP / WebSocket"| FE_Port
    FE_Port -->|"Proxy /api & /health"| Backend
    Backend -->|"Persist state"| Postgres
    Backend -->|"Session cache"| Redis
    Backend -->|"Local LLM inference"| Ollama
    Backend -->|"Cloud LLM inference"| GeminiCloud
    Backend -->|"PromQL queries"| Prometheus
    Backend -->|"TLS with mounted Kubeconfig"| APIServer

    APIServer --> MetricsServer
    APIServer --> Kubelet
    APIServer --> Workloads
    MetricsServer -->|"Pod & Node metrics"| Kubelet
```

---

## 2. Container Networking & Docker Bridge Topology

K8Pilot bridges standard containerized development services with the isolated Minikube container runtime network:

```mermaid
flowchart LR
    subgraph DockerBridge["k8pilot_default Docker Network"]
        direction TB
        c_fe["k8pilot-frontend-1<br/>172.18.0.7:5173"]
        c_be["k8pilot-backend-1<br/>172.18.0.6:8000"]
        c_pg["k8pilot-postgres-1<br/>172.18.0.3:5432"]
        c_redis["k8pilot-redis-1<br/>172.18.0.5:6379"]
        c_ol["k8pilot-ollama-1<br/>172.18.0.4:11434"]
        c_prom["k8pilot-prometheus-1<br/>172.18.0.2:9090"]
    end

    subgraph MinikubeNet["K8Pilot Dedicated Minikube Network"]
        c_k8s["Minikube Control Plane<br/>192.168.49.2:8443"]
    end

    c_fe -->|"Vite Reverse Proxy"| c_be
    c_be --> c_pg
    c_be --> c_redis
    c_be --> c_ol
    c_be --> c_prom
    c_be -.->|"Dual-Homed Network Interface"| c_k8s
```

> **Network Isolation Note**: The backend container joins both `k8pilot_default` and `K8Pilot` networks, giving it direct connectivity to the Minikube API server at `https://192.168.49.2:8443` without routing through host loops.

---

## 3. Real-Time Observability & Metrics Lifecycle

Live utilization gauges on the Dashboard and the Pods view query the Kubernetes Metrics API rather than relying solely on heavyweight external exporters:

```mermaid
sequenceDiagram
    autonumber
    participant UI as Frontend (React Query)
    participant BE as FastAPI Backend
    participant K8s as kube-apiserver
    participant MS as metrics-server (metrics.k8s.io)

    UI->>BE: GET /api/cluster/metrics
    activate BE
    BE->>K8s: list_node() (CoreV1Api)
    K8s-->>BE: Total allocatable CPU & Memory capacity
    BE->>K8s: CustomObjectsApi.list_cluster_custom_object("metrics.k8s.io", "nodes")
    K8s->>MS: Query node metrics
    MS-->>K8s: Node metrics (nano-cores, KiB)
    K8s-->>BE: Raw node resource metrics
    BE->>K8s: CustomObjectsApi.list_cluster_custom_object("metrics.k8s.io", "pods")
    K8s->>MS: Query pod metrics
    MS-->>K8s: Per-container resource consumption
    K8s-->>BE: Raw pod metrics
    BE->>BE: Normalize millicores, GiB, and utilization %
    BE-->>UI: { cluster, nodes: [...], pods: {...}, metrics_available: true }
    deactivate BE
    UI->>UI: Render live CPU/Memory bars & pod rows
```

---

## 4. SRE Diagnostic & Incident Investigation Lifecycle

When an operator clicks **"Diagnose with AI"** from the Pod Drawer or Dashboard warning stream, the platform follows a structured diagnostic flow with strict human-in-the-loop verification:

```mermaid
sequenceDiagram
    autonumber
    actor Dev as Cluster Operator
    participant UI as Pod Drawer (Pods.tsx)
    participant Chat as AI Assistant (AIChat.tsx)
    participant BE as Backend AI Router (/api/ai/chat)
    participant LLM as Ollama (Llama 3) / Gemini
    participant K8s as Kubernetes API Server

    Dev->>UI: Clicks "Diagnose with AI" on failing pod
    UI->>Chat: Routes with pod context (name, ns, phase, restarts, logs)
    Chat->>BE: POST /api/ai/chat
    activate BE
    BE->>K8s: Resolve target namespace & verify pod status
    K8s-->>BE: Live container states & restart counts
    BE->>BE: Assemble structured SRE diagnostic prompt
    BE->>LLM: Dispatches inference with safety guardrails
    activate LLM
    LLM-->>BE: Markdown diagnosis + (optional remediation action)
    deactivate LLM
    BE->>BE: Scan response for executable actions (is_example_text safety check)
    BE-->>Chat: Returns diagnosis + pending_actions (if remediation proposed)
    deactivate BE
    Chat->>Dev: Renders markdown diagnosis (Root Cause, Impact, Recommendation)

    opt Remediation Action Proposed (e.g. Restart Pod / Scale Deployment)
        Chat->>Dev: Displays "Cluster Authorization Required" card
        Dev->>Chat: Reviews diff & clicks "Confirm & Run"
        Chat->>BE: POST /api/ai/execute-action { action: "restart", ... }
        activate BE
        BE->>K8s: Patch deployment rollout / delete pod
        K8s-->>BE: Action executed successfully
        BE-->>Chat: { status: "success", message: "Deployment restarting..." }
        deactivate BE
        Chat->>Dev: Shows confirmed success banner ✅
    end
```

---

## 5. Autonomous SRE Agent Architecture (ReAct Loop)

For multi-step autonomous troubleshooting (Phase 4), K8Pilot utilizes a ReAct (Reasoning + Acting) execution loop:

```mermaid
stateDiagram-v2
    [*] --> Idle: User submits incident or query
    Idle --> Thinking: Initialize SRE Agent Goal

    state Thinking {
        [*] --> EvaluateHypothesis: Analyze observations & goal
        EvaluateHypothesis --> SelectTool: Need more evidence?
        SelectTool --> ExecuteTool: Tool chosen (get_logs, get_events, metrics)
    }

    ExecuteTool --> Observing: Invoke Kubernetes API
    Observing --> Thinking: Feed observation into context

    Thinking --> FormulateDiagnosis: Sufficient evidence acquired (or max steps)
    FormulateDiagnosis --> HumanApprovalCheck: Action required to fix?

    state HumanApprovalCheck <<choice>>
    HumanApprovalCheck --> PureAnalysis: Informational diagnosis only
    HumanApprovalCheck --> AwaitingConfirmation: Proposing mutating cluster action

    PureAnalysis --> [*]: Output SRE Report
    AwaitingConfirmation --> Execution: Operator approves action
    AwaitingConfirmation --> Cancelled: Operator denies action
    Execution --> [*]: Action executed & audited
    Cancelled --> [*]: Incident report archived
```

---

## 6. Subsystem & Component Details

### Frontend Architecture
* **Stack**: React 18, Vite, TypeScript, Tailwind CSS, Lucide Icons.
* **State & Caching**: TanStack React Query with automated background invalidation (`refetchInterval: 10000ms`).
* **Routing**: React Router DOM (`/` Dashboard, `/pods` Pods & Log Drawer, `/ai` AI Chat Assistant).
* **Hot Reloading**: Polling-enabled Vite dev server (`usePolling: true`) for instant Windows-to-Docker live sync.

### Backend Architecture
* **Framework**: FastAPI (Async Python 3.12).
* **API Modules**:
  - `cluster.py`: Cluster status, nodes, namespaces, pods, deployments, live metrics, cluster events.
  - `actions.py`: Pod deletion, deployment scaling, rollout restarts, pod log streaming.
  - `ai.py`: Multi-turn chat, prompt dispatching, action extraction, Ollama model pulling, Gemini API integration.
  - `health.py`: Deep health check across Redis, Prometheus, and Ollama.
* **Kubernetes Client**: Official `kubernetes` Python SDK with `CustomObjectsApi` for Metrics API support.

### AI Engine Layer
* **Local Inference**: Ollama (`llama3:latest` 8B parameter model running locally on CPU/GPU via Docker).
* **Cloud Inference**: Google Gemini API (supporting `gemini-2.0-flash`, `gemini-2.5-pro`, `gemini-1.5-flash` with client-provided API keys).
* **Action Guardrails**: Brace-depth JSON action extractor combined with natural language safety checks to prevent example code from executing against live clusters.

---

## 7. Security & Safety Model

```mermaid
flowchart TD
    subgraph Class1["Read-Only Informational Operations"]
        R1["Pod Status & Details"]
        R2["Live Container Logs"]
        R3["Cluster Events"]
        R4["CPU & Memory Metrics"]
        R5["YAML Manifest Inspection"]
    end

    subgraph Class2["Mutating / Destructive Operations"]
        M1["Delete Pod (Restart)"]
        M2["Scale Deployment"]
        M3["Rollout Restart"]
        M4["Apply / Create Manifest"]
        M5["Delete Namespace"]
    end

    Class1 -->|"Direct Auto-Execution"| SafeOut["Immediate Response in UI"]
    Class2 -->|"Blocked by Confirmation Barrier"| Guard["Human-in-the-Loop Dialog"]
    Guard -->|"Operator Explicit Approval"| Exec["Execute on Cluster"]
    Guard -->|"Operator Denies"| Abort["Cancel & Audit Log"]
```
