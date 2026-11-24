# K8Pilot – System Architecture & Engineering Design

This document provides a comprehensive technical overview of **K8Pilot**, an AI-powered Cloud Operations & Kubernetes Management Platform ("AI DevOps Engineer").

---

## 1. High-Level Architecture Overview

```mermaid
flowchart TD
    classDef clientStyle fill:#0c4a6e,stroke:#38bdf8,stroke-width:2px,color:#f0f9ff;
    classDef gatewayStyle fill:#1e1b4b,stroke:#818cf8,stroke-width:1.5px,color:#e0e7ff;
    classDef backendStyle fill:#31104b,stroke:#c084fc,stroke-width:2px,color:#faf5ff;
    classDef dbStyle fill:#064e3b,stroke:#34d399,stroke-width:2px,color:#ecfdf5;
    classDef aiStyle fill:#581c87,stroke:#f472b6,stroke-width:2px,color:#fdf2f8;
    classDef promStyle fill:#78350f,stroke:#fbbf24,stroke-width:2px,color:#fffbeb;
    classDef k8sStyle fill:#172554,stroke:#60a5fa,stroke-width:2px,color:#eff6ff;

    subgraph ClientLayer["🌐 Client Layer (Browser)"]
        UI["React 18 + Vite SPA<br/>(Tailwind CSS, TanStack Query)"]:::clientStyle
    end

    subgraph HostGateway["🚪 Host Gateway Ports (localhost)"]
        FE_Port["Port 5173 (Vite Web UI)"]:::gatewayStyle
        BE_Port["Port 8000 (FastAPI Gateway)"]:::gatewayStyle
        Prom_Port["Port 9090 (Prometheus)"]:::gatewayStyle
        Ollama_Port["Port 11434 (Ollama)"]:::gatewayStyle
        PG_Port["Port 5432 (PostgreSQL)"]:::gatewayStyle
        Redis_Port["Port 6379 (Redis)"]:::gatewayStyle
    end

    subgraph ServiceLayer["⚙️ Core Application & Data Services"]
        Backend["FastAPI Backend<br/>(Async Python 3.12, Uvicorn)"]:::backendStyle
        Postgres[("PostgreSQL 16<br/>(Audit Log, Sessions)")]:::dbStyle
        Redis[("Redis 7<br/>(Cache & State)")]:::dbStyle
        Ollama["Ollama Local LLM<br/>(llama3:latest 8B)"]:::aiStyle
        GeminiCloud["Google Gemini Cloud API<br/>(Gemini 2.5/2.0 Flash)"]:::aiStyle
        Prometheus["Prometheus TSDB<br/>(Scraper & Metrics)"]:::promStyle
    end

    subgraph K8sLayer["⎈ Kubernetes Cluster Boundary (Minikube)"]
        APIServer["kube-apiserver<br/>(:8443 TLS)"]:::k8sStyle
        Kubelet["kubelet & cAdvisor"]:::k8sStyle
        MetricsServer["metrics-server<br/>(metrics.k8s.io)"]:::k8sStyle
        Workloads["User Workloads & Deployments<br/>(nginx, test apps)"]:::k8sStyle
    end

    UI -->|"HTTP / WebSocket"| FE_Port
    FE_Port -->|"Proxy /api & /health"| Backend
    Backend -->|"Persist state"| Postgres
    Backend -->|"Session cache"| Redis
    Backend -->|"Local inference"| Ollama
    Backend -->|"Cloud inference"| GeminiCloud
    Backend -->|"PromQL queries"| Prometheus
    Backend -->|"TLS with Kubeconfig"| APIServer

    APIServer --> MetricsServer
    APIServer --> Kubelet
    APIServer --> Workloads
    MetricsServer -->|"Resource utilization"| Kubelet

    style ClientLayer fill:#082f49,stroke:#0284c7,stroke-width:2px,color:#e0f2fe
    style HostGateway fill:#0f172a,stroke:#475569,stroke-width:2px,color:#cbd5e1
    style ServiceLayer fill:#18181b,stroke:#52525b,stroke-width:2px,color:#e4e4e7
    style K8sLayer fill:#0f172a,stroke:#2563eb,stroke-width:2px,color:#bfdbfe
```

---

## 2. Container Networking & Docker Bridge Topology

K8Pilot bridges standard containerized development services with the isolated Minikube container runtime network:

```mermaid
flowchart LR
    classDef feBox fill:#042f2e,stroke:#14b8a6,stroke-width:2px,color:#ccfbf1;
    classDef beBox fill:#1e1b4b,stroke:#818cf8,stroke-width:2px,color:#e0e7ff;
    classDef pgBox fill:#064e3b,stroke:#22c55e,stroke-width:2px,color:#dcfce7;
    classDef rdBox fill:#450a0a,stroke:#f87171,stroke-width:2px,color:#fee2e2;
    classDef olBox fill:#3b0764,stroke:#c084fc,stroke-width:2px,color:#f3e8ff;
    classDef prBox fill:#451a03,stroke:#fbbf24,stroke-width:2px,color:#fef3c7;
    classDef k8sBox fill:#0c4a6e,stroke:#38bdf8,stroke-width:2px,color:#e0f2fe;

    subgraph DockerBridge["🐳 k8pilot_default Docker Bridge Network"]
        direction TB
        c_fe["k8pilot-frontend-1<br/>(service: frontend:5173)"]:::feBox
        c_be["k8pilot-backend-1<br/>(service: backend:8000)"]:::beBox
        c_pg["k8pilot-postgres-1<br/>(service: postgres:5432)"]:::pgBox
        c_redis["k8pilot-redis-1<br/>(service: redis:6379)"]:::rdBox
        c_ol["k8pilot-ollama-1<br/>(service: ollama:11434)"]:::olBox
        c_prom["k8pilot-prometheus-1<br/>(service: prometheus:9090)"]:::prBox
    end

    subgraph MinikubeNet["⎈ K8Pilot Dedicated Minikube Network"]
        c_k8s["Minikube Control Plane<br/>(K8Pilot:8443)"]:::k8sBox
    end

    c_fe -->|"Vite Reverse Proxy"| c_be
    c_be --> c_pg
    c_be --> c_redis
    c_be --> c_ol
    c_be --> c_prom
    c_be -.->|"Dual-Homed Network Interface"| c_k8s

    style DockerBridge fill:#18181b,stroke:#3f3f46,stroke-width:2px,color:#fafafa
    style MinikubeNet fill:#082f49,stroke:#0284c7,stroke-width:2px,color:#e0f2fe
```

> **Network Isolation Note**: The backend container joins both `k8pilot_default` and `K8Pilot` networks, giving it direct connectivity to the Minikube API server on port 8443 without routing through host loops.

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
    classDef readStyle fill:#064e3b,stroke:#10b981,stroke-width:1.5px,color:#d1fae5;
    classDef mutateStyle fill:#4c0519,stroke:#f43f5e,stroke-width:1.5px,color:#ffe4e6;
    classDef safeOutStyle fill:#047857,stroke:#34d399,stroke-width:2px,color:#ffffff;
    classDef guardStyle fill:#78350f,stroke:#f59e0b,stroke-width:2px,color:#fef3c7;
    classDef execStyle fill:#1d4ed8,stroke:#60a5fa,stroke-width:2px,color:#ffffff;
    classDef abortStyle fill:#881337,stroke:#fb7185,stroke-width:2px,color:#ffffff;

    subgraph Class1["📖 Read-Only Informational Operations"]
        R1["Pod Status & Details"]:::readStyle
        R2["Live Container Logs"]:::readStyle
        R3["Cluster Events"]:::readStyle
        R4["CPU & Memory Metrics"]:::readStyle
        R5["YAML Manifest Inspection"]:::readStyle
    end

    subgraph Class2["⚡ Mutating & Destructive Operations"]
        M1["Delete Pod (Restart)"]:::mutateStyle
        M2["Scale Deployment"]:::mutateStyle
        M3["Rollout Restart"]:::mutateStyle
        M4["Apply / Create Manifest"]:::mutateStyle
        M5["Delete Namespace"]:::mutateStyle
    end

    Class1 -->|"Direct Auto-Execution"| SafeOut["Immediate Response in UI"]:::safeOutStyle
    Class2 -->|"Blocked by Safety Barrier"| Guard["🛡️ Human-in-the-Loop Dialog"]:::guardStyle
    Guard -->|"Operator Explicit Approval"| Exec["✅ Execute on Cluster"]:::execStyle
    Guard -->|"Operator Denies"| Abort["⛔ Cancel & Audit Log"]:::abortStyle

    style Class1 fill:#022c22,stroke:#059669,stroke-width:2px,color:#a7f3d0
    style Class2 fill:#2a0813,stroke:#e11d48,stroke-width:2px,color:#fecdd3
```

---

## 8. Automated Anomaly Detection & Self-Healing Architecture

```mermaid
flowchart TD
    classDef monitorStyle fill:#1e1b4b,stroke:#818cf8,stroke-width:2px,color:#e0e7ff;
    classDef detectStyle fill:#4c0519,stroke:#f43f5e,stroke-width:2px,color:#ffe4e6;
    classDef dbStyle fill:#064e3b,stroke:#34d399,stroke-width:2px,color:#ecfdf5;
    classDef healStyle fill:#581c87,stroke:#c084fc,stroke-width:2px,color:#faf5ff;
    classDef k8sStyle fill:#0c4a6e,stroke:#38bdf8,stroke-width:2px,color:#f0f9ff;
    classDef auditStyle fill:#78350f,stroke:#fbbf24,stroke-width:2px,color:#fffbeb;

    subgraph MonitorLoop["⏱️ Autonomous Background Watcher"]
        Ticker["Periodic Scan / Event Tick<br/>(30s lifespan task)"]:::monitorStyle
        K8sScan["Kubernetes CoreV1 API<br/>(List pods & container statuses)"]:::k8sStyle
    end

    subgraph Classifier["🔍 Anomaly Detection & Classification"]
        CrashCheck{"Failure Condition?"}:::detectStyle
        CrashLoop["CrashLoopBackOff"]:::detectStyle
        OOM["OOMKilled (Exit 137)"]:::detectStyle
        ImgErr["ImagePullBackOff"]:::detectStyle
        Evicted["Pod Evicted / Failed"]:::detectStyle
        Restarts["Frequent Restarts (>=3)"]:::detectStyle
    end

    subgraph IncidentDB["💾 Incident Persistence & State"]
        Deduplicator{"Already Tracked?"}:::dbStyle
        UpdateIncident["Update last_seen & restart count"]:::dbStyle
        CreateIncident["Persist new ClusterIncident (open)"]:::dbStyle
        IncTable[("PostgreSQL: cluster_incidents")]:::dbStyle
    end

    subgraph HealingEngine["⚡ Self-Healing Remediation"]
        ModeCheck{"Auto-Heal Enabled or<br/>1-Click User Approval?"}:::healStyle
        ActionPicker{"Target Controller Kind?"}:::healStyle
        RolloutDep["Patch Deployment<br/>(restartedAt rollout)"]:::k8sStyle
        RolloutSTS["Patch StatefulSet<br/>(restartedAt rollout)"]:::k8sStyle
        RecreatePod["Delete Pod<br/>(trigger fresh recreate)"]:::k8sStyle
        AuditTrail["Record AuditLog<br/>(action: auto_heal)"]:::auditStyle
        ResolveInc["Mark Incident: resolved / healed"]:::dbStyle
    end

    Ticker --> K8sScan
    K8sScan --> CrashCheck
    CrashCheck -->|Waiting reason| CrashLoop
    CrashCheck -->|Terminated reason| OOM
    CrashCheck -->|Waiting reason| ImgErr
    CrashCheck -->|Phase Failed| Evicted
    CrashCheck -->|Restart threshold| Restarts

    CrashLoop --> Deduplicator
    OOM --> Deduplicator
    ImgErr --> Deduplicator
    Evicted --> Deduplicator
    Restarts --> Deduplicator

    Deduplicator -->|Yes| UpdateIncident
    Deduplicator -->|No| CreateIncident
    UpdateIncident --> IncTable
    CreateIncident --> IncTable

    IncTable --> ModeCheck
    ModeCheck -->|Execute| ActionPicker
    ActionPicker -->|Deployment| RolloutDep
    ActionPicker -->|StatefulSet| RolloutSTS
    ActionPicker -->|Pod| RecreatePod

    RolloutDep --> AuditTrail
    RolloutSTS --> AuditTrail
    RecreatePod --> AuditTrail
    AuditTrail --> ResolveInc
    ResolveInc --> IncTable

    style MonitorLoop fill:#0f172a,stroke:#3b82f6,stroke-width:1.5px,color:#93c5fd
    style Classifier fill:#2a0813,stroke:#ef4444,stroke-width:1.5px,color:#fca5a5
    style IncidentDB fill:#022c22,stroke:#10b981,stroke-width:1.5px,color:#6ee7b7
    style HealingEngine fill:#2e1065,stroke:#a855f7,stroke-width:1.5px,color:#d8b4fe
```
