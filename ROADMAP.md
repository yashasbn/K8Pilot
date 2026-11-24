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

### Phase 2: Workloads & Networking Management (Completed ✅)
* **Branch**: `feature/phase2-workloads-and-services`
* **Target Merge**: `main` (via GitHub Pull Request)
* **Delivered Features**:
  1. **Workloads View (`/workloads`)**:
     - Dedicated dashboard for Deployments, StatefulSets, and DaemonSets.
     - Live interactive replica steppers (`[-]` / `[+]` with instant API scaling via `/api/actions/scale`).
     - Real-time rollout status indicators (Ready/Target counters, available, updated, misscheduled).
     - 1-click Rollout Restart triggers with animated progress states (`/api/actions/restart`).
     - Image tags display and namespace filtering.
  2. **Services & Ingress View (`/networking`)**:
     - Comprehensive Service catalog with color-coded type badges (`ClusterIP`, `NodePort`, `LoadBalancer`, `ExternalName`).
     - Port mapping representations (`port:nodePort/protocol` and targets).
     - Label selector badges and external endpoint IPs.
     - Ingress routing rules inspector (hosts, HTTP paths, and destination backends).
  3. **Live Manifest Inspector (`ManifestModal`)**:
     - Live YAML serialization of any cluster resource (Deployments, StatefulSets, DaemonSets, Services, Ingresses, Pods, Nodes).
     - Cleaned-up YAML output (automatic stripping of cluster internal `managedFields`).
     - 1-click "Copy YAML" and "Download .yaml" options.
     - Dark monospaced inspector with line numbers.

---

### Phase 3: Database Persistence & Audit Trail (Completed ✅)
* **Branch**: `feature/phase3-database-persistence`
* **Target Merge**: `main` (via GitHub Pull Request)
* **Delivered Features**:
  1. **PostgreSQL Activation & SQLAlchemy ORM**:
     - Database connection pool using `asyncpg` and SQLAlchemy async engine.
     - Declarative models: `ChatSession`, `ChatMessage`, `AuditLog`, `ClusterIncident`.
     - Automated table initialization on application startup (`init_db`).
     - Alembic migration environment initialized, revision generated, and stamped at `head`.
  2. **Persistent AI Chat Sessions (`/ai`)**:
     - Conversation history preserved across browser refreshes and sessions.
     - Collapsible History sidebar with list of previous sessions, message counts, and timestamps.
     - 1-click "+ New" conversation creation.
     - Multi-turn conversation context injection into LLM prompts.
     - Ability to delete previous sessions with cascading message cleanup.
  3. **Cluster Action Audit Logging (`/audit`)**:
     - Dedicated Audit Trail page tracking all mutations: `scale`, `restart`, `delete_pod`, `create`.
     - Detailed parameter logging, timestamping, initiated by (User vs AI badge), and status (Success/Failed).
     - Full filter controls by namespace, action type, outcome, and text search.

---

### Phase 4: Autonomous SRE Agent & Token Streaming (Completed ✅)
* **Branch**: `feature/phase4-agentic-ai-streaming`
* **Target Merge**: `main` (via GitHub Pull Request)
* **Delivered Features**:
  1. **Autonomous ReAct Agent Loop (`backend/app/core/agent.py`)**:
     - Real-time multi-step investigation loop (`investigate_target`): extracts target resources, determines inspection sequence, and fetches live evidence.
     - SRE inspection tools:
       * `tool_get_pod_status`: Pod phase, readiness, restart counts, and container termination reasons.
       * `tool_get_pod_logs`: Tail container stdout/stderr logs.
       * `tool_get_pod_events`: Warning and normal events specifically involving the target resource.
       * `tool_get_deployment_status`: Desired/ready replicas and rollout conditions.
       * `tool_get_cluster_metrics`: Real-time node and pod resource pressure.
  2. **Server-Sent Events (SSE) Streaming (`/api/ai/stream`)**:
     - Real-time event streaming (`session`, `step`, `token`, `action`, `done`).
     - Live token-by-token output directly into the chat bubble for zero perception latency.
     - Intermediate investigation transparency: shows active thoughts, tool calls, and tool results.
     - Asynchronous streaming across both local Ollama models (`llama3`) and Google Gemini.
     - Persistent chat history automatically saved to PostgreSQL (`ChatMessage`) upon stream completion.
  3. **1-Click "Diagnose with AI" Flow on Dashboard**:
     - Direct "Diagnose with AI" button on warning events in the Dashboard events feed, automatically navigating to AI Chat with the event context pre-populated.

---

### Phase 5: Automated Anomaly Detection & Self-Healing (Completed ✅)
* **Branch**: `feature/phase5-auto-healing-monitor`
* **Target Merge**: `main` (via GitHub Pull Request)
* **Delivered Features**:
  1. **Continuous Anomaly Detection Monitor (`backend/app/core/monitor.py`)**:
     - Background async worker integrated into FastAPI lifespan with configurable polling interval.
     - Detects critical conditions: `CrashLoopBackOff`, `OOMKilled` (exit code 137), `ImagePullBackOff`, `ErrImagePull`, `Evicted` pods, and rapid high restart counts.
     - Resolves top-level owner references (Deployment, StatefulSet, DaemonSet, Job, or standalone Pod).
     - Intelligent deduplication: prevents database spam by tracking and updating existing open incidents with last-seen timestamps and state changes.
  2. **Self-Healing Remediation Engine (`backend/app/api/incidents.py`)**:
     - Automated and 1-click self-healing: supports rolling restarts for Deployments, StatefulSets, DaemonSets, and direct Pod recreation.
     - Autonomous Auto-Heal Agent mode: toggleable dynamic setting to automatically remediate known recoverable failures immediately upon detection.
     - Integrated mutation audit logging: records all self-healing actions into PostgreSQL `AuditLog` with before/after state and initiator tags.
  3. **Incident Command Center UI (`/incidents`)**:
     - Dedicated monitoring cockpit with KPI cards: Open Incidents, Critical Issues, Warnings, and Auto-Healed/Resolved.
     - Live sidebar alert badge showing active incident counts in real time.
     - Dashboard integration: prominent alert banner notifying operators of active incidents with 1-click navigation.
     - Full interactive controls: instant "Scan Cluster" trigger, Auto-Heal toggle, 1-click "Auto-Heal" execution, "Diagnose with AI" integration, and dismissal flow.

---

## Standard Workflow for Each Phase (PR-First)

1. **Create Feature Branch**:
   ```powershell
   git checkout -b <feature-branch-name>
   ```
2. **Develop & Validate**:
   - Run backend & frontend validations (`npm run build`, endpoint tests).
   - Test container compatibility and live browser UX.
3. **Commit & Push to Remote**:
   ```powershell
   git add <modified-files>
   git commit -m "<conventional-commit-message>"
   git push -u origin <feature-branch-name>
   ```
4. **Open Pull Request (PR)**:
   - Open a PR from `<feature-branch-name>` targeting `main` on GitHub.
   - Review code diff and validation summary.
   - Merge strictly via the GitHub Pull Request interface (Squash & Merge or Merge Commit).
5. **Sync Local Main**:
   ```powershell
   git checkout main
   git pull origin main
   ```
