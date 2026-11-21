# K8Pilot – Roadmap & Phased Implementation Plan

This document outlines the architectural improvements, feature additions, and phased execution plan for **K8Pilot**. Each phase is developed on an isolated feature branch, tested and validated end-to-end, and then merged into `main`.

---

## Architecture Overview & Git Branching Strategy

```
main
  │
  ├─── Phase 1: feature/phase1-metrics-events-model-selector
  │    ├── Model Selector UX (Tabs: Local / Cloud / Pull + Search Filter)
  │    ├── Real-time Cluster Metrics (Live CPU & Memory from metrics-server)
  │    ├── Kubernetes Events API (Warning & Incident feed)
  │    └── Pod Details & Live Log Drawer (Click pod -> View logs & actions)
  │
  ├─── Phase 2: feature/phase2-workloads-and-services
  │    ├── Deployments & StatefulSets with 1-click scaling / rollout restarts
  │    ├── Services & Ingress endpoints viewer
  │    └── YAML Manifest Inspector & Editor
  │
  ├─── Phase 3: feature/phase3-database-persistence
  │    ├── PostgreSQL models & Alembic migrations
  │    ├── Persistent AI chat history across browser refreshes
  │    └── Cluster action audit log (who executed what & status)
  │
  ├─── Phase 4: feature/phase4-agentic-ai-streaming
  │    ├── Server-Sent Events (SSE) token streaming for real-time AI responses
  │    ├── Autonomous agentic tools (AI pulls logs & events to diagnose issues)
  │    └── 1-click "Diagnose Pod" button routing from Pods directly to AI
  │
  └─── Phase 5: feature/phase5-auto-healing-monitor
       ├── Background health watcher detecting CrashLoopBackOff & OOMKilled
       └── Proactive incident alerts with 1-click self-healing approval
```

---

## Phase Details

### Phase 1: Metrics, Events & Model Selector UX (Completed ✅)
* **Branch**: `feature/phase1-metrics-events-model-selector`
* **Status**: Completed & Validated
* **Delivered Features**:
  1. **Revamped Model Selector Dropdown**:
     - Segmented tabs: `[ Local (Ollama) ]`, `[ Gemini (Cloud) ]`, `[ Pull (Download) ]`.
     - Instant search filtering (`Search models...`) to find models in seconds without scrolling past cloud models.
     - Automatically opens to the active model's category (defaults to Local).
  2. **Real-Time Cluster Metrics**:
     - Backend endpoint `/api/cluster/metrics` querying Kubernetes `metrics.k8s.io` API.
     - Live CPU and Memory utilization progress bars on the Dashboard and Pods table with exact millicores and GiB consumption.
  3. **Kubernetes Events API**:
     - Backend endpoint `GET /api/cluster/events` with severity filters (`Warning`, `All`) and namespace filtering.
     - Real-time Events feed component on the Dashboard for rapid incident detection.
  4. **Interactive Pod Drawer & Live Logs**:
     - Clickable pod rows opening a slide-out drawer with dark blurred backdrop overlay.
     - Live container logs viewer (tail selector: 50, 100, 250 lines, auto-refresh, copy to clipboard).
     - Pod-specific events tab and detailed container statuses.
     - 1-click actions: *Restart Pod* and *Diagnose with AI* (with structured SRE diagnostic context).
  5. **SRE Diagnostic Intelligence & Safety**:
     - Intelligent prompt routing: separates technical SRE diagnostic requests from mutating actions.
     - Dynamic target-namespace resolution (e.g. `kube-system`).
     - Example-filtering guardrail: prevents conversational example actions from triggering real authorization cards.

---

### Phase 2: Workloads & Networking Management
* **Branch**: `feature/phase2-workloads-and-services`
* **Target Merge**: `main`
* **Key Deliverables**:
  1. **Workloads View**:
     - Dedicated page for Deployments, StatefulSets, and DaemonSets.
     - Visual replica controls (scale up/down directly with stepper controls).
     - Rollout status indicators and rollout restart triggers.
  2. **Services & Ingress View**:
     - List cluster Services (ClusterIP, NodePort, LoadBalancer) and mapped ports.
     - Display Ingress rules and external hosts.
  3. **Manifest Inspector**:
     - Read-only YAML viewer for any cluster resource with syntax highlighting.
     - Quick "Copy Manifest" and "Apply Manifest" actions.

---

### Phase 3: Database Persistence & Audit Trail
* **Branch**: `feature/phase3-database-persistence`
* **Target Merge**: `main`
* **Key Deliverables**:
  1. **PostgreSQL Activation**:
     - Define SQLAlchemy declarative models (`ChatSession`, `ChatMessage`, `AuditLog`, `ClusterIncident`).
     - Set up Alembic migration workflow in the backend container.
  2. **Persistent AI Chat Sessions**:
     - Save chat sessions and message histories in PostgreSQL.
     - Sidebar chat history with past incident discussions and session naming.
  3. **Cluster Action Audit Logging**:
     - Record every action executed against the cluster (`scale`, `delete_pod`, `restart`, `create`).
     - Track timestamp, initiating user/AI, parameters, and execution outcome.

---

### Phase 4: Autonomous SRE Agent & Token Streaming
* **Branch**: `feature/phase4-agentic-ai-streaming`
* **Target Merge**: `main`
* **Key Deliverables**:
  1. **Autonomous ReAct Agent Loop (`backend/app/core/agent.py`)**:
     - Implement a true multi-step ReAct agent loop (`Thought` ➔ `Action/Tool` ➔ `Observation` ➔ `Synthesis`).
     - Replaces single-turn static prompts with iterative, self-directed investigation (max 4 steps).
     - Works seamlessly across local Ollama models (`llama3`) and Google Gemini.
  2. **Kubernetes Agent Tools**:
     - `get_pod_status(name, namespace)`: Exact container statuses, readiness, exit codes.
     - `get_pod_logs(name, namespace, tail_lines, container)`: Live container logs.
     - `get_pod_events(name, namespace)`: Warning and normal events specifically for the pod.
     - `get_deployment_status(name, namespace)`: Replica counts, rollout conditions, selectors.
     - `get_cluster_metrics()`: Live CPU/Memory pressure on nodes and pods.
  3. **Agent Thought Visibility in UI**:
     - Display intermediate tool execution steps in the chat (e.g. `🔍 Inspecting pod events...`, `📋 Reading recent logs...`).
     - Transparent reasoning so operators can see exactly how the agent reached its diagnosis.
  4. **Server-Sent Events (SSE) Streaming**:
     - Stream LLM tokens in real time to the frontend for zero-latency response perception.
       - `describe_workload(deployment, namespace)`
     - AI investigates multi-step issues and summarizes findings with evidence before recommending action.
  3. **1-Click "Diagnose with AI" Flow**:
     - Add a button next to any unhealthy pod or warning event that opens AI Chat with the incident pre-populated.

---

### Phase 5: Automated Anomaly Detection & Self-Healing
* **Branch**: `feature/phase5-auto-healing-monitor`
* **Target Merge**: `main`
* **Key Deliverables**:
  1. **Background Health Watcher**:
     - Async background loop monitoring Kubernetes watch streams for pod failures (`OOMKilled`, `CrashLoopBackOff`, unhealthy probes).
  2. **Incident Inbox & Alerting**:
     - Generate incident cards on the Dashboard when anomalies occur.
     - Pre-generate an AI diagnostic explanation and proposed remediation manifest.
  3. **Human-in-the-Loop Auto-Healing**:
     - 1-click "Approve & Apply Fix" button with dry-run verification before execution.

---

## Standard Workflow for Each Phase

1. **Create Branch**:
   ```powershell
   git checkout -b <branch-name>
   ```
2. **Develop & Validate**:
   - Run backend & frontend validations.
   - Test container compatibility (`docker compose`).
3. **Commit & Push**:
   ```powershell
   git add <modified-files>
   git commit -m "<conventional-commit-message>"
   ```
4. **Merge into Main**:
   ```powershell
   git checkout main
   git merge <branch-name>
   ```
