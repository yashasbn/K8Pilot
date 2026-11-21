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

### Phase 1: Metrics, Events & Model Selector UX
* **Branch**: `feature/phase1-metrics-events-model-selector`
* **Target Merge**: `main`
* **Key Deliverables**:
  1. **Revamped Model Selector Dropdown**:
     - Replace the single long scroll list in `AIChat.tsx` with a clean tabbed interface:
       - `[ Local Models (Ollama) ]`
       - `[ Cloud (Google Gemini) ]`
       - `[ Download Recommended ]`
     - Add instant search filtering (`Search models...`) to find models in seconds.
     - Automatically open to the tab of the currently active model (defaults to Local).
     - Keep installed local models immediately visible at the top without scrolling past 20+ Gemini models.
  2. **Real-Time Cluster Metrics**:
     - Implement backend endpoint `/api/cluster/metrics` querying the Kubernetes `metrics.k8s.io` API (via Minikube's built-in `metrics-server`).
     - Display live CPU and Memory utilization percentages and progress bars on the Dashboard and Pods view.
  3. **Kubernetes Events API**:
     - Implement backend endpoint `GET /api/cluster/events` with severity filters (`Warning`, `Normal`) and namespace filtering.
     - Add a real-time Events feed component to surface `CrashLoopBackOff`, `OOMKilled`, `FailedScheduling`, and probe failures.
  4. **Interactive Pod Drawer & Live Logs**:
     - Make pods in `Pods.tsx` clickable to open a slide-out drawer.
     - View container statuses, recent pod events, and live tailing logs with auto-scroll.
     - Add 1-click actions directly inside the drawer (*Restart Pod*, *View YAML*, *Ask AI to Diagnose*).

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

### Phase 4: Agentic AI Assistant & Token Streaming
* **Branch**: `feature/phase4-agentic-ai-streaming`
* **Target Merge**: `main`
* **Key Deliverables**:
  1. **Server-Sent Events (SSE) Streaming**:
     - Replace blocking `/api/ai/chat` with SSE endpoint `/api/ai/chat/stream`.
     - Stream LLM tokens in real time to the frontend for both Ollama and Gemini models.
  2. **Autonomous Tool Calling**:
     - Enable the AI assistant to autonomously invoke cluster tools:
       - `fetch_pod_logs(pod, namespace, tail)`
       - `fetch_pod_events(pod, namespace)`
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
