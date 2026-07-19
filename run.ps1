# run.ps1 - Task Runner for K8Pilot on Windows
param(
    [Parameter(Position=0, Mandatory=$false)]
    [string]$Command = "help",

    [Parameter(Position=1, ValueFromRemainingArguments=$true)]
    [string[]]$ArgsList
)

$ErrorActionPreference = "Stop"

# Helper print functions
function Write-Header($msg) {
    Write-Host "`n=== $msg ===" -ForegroundColor Cyan
}

function Write-Success($msg) {
    Write-Host "[OK] $msg" -ForegroundColor Green
}

function Write-Info($msg) {
    Write-Host "     $msg" -ForegroundColor DarkGray
}

function Write-ErrorMsg($msg) {
    Write-Host "[ERROR] $msg" -ForegroundColor Red
}

function Check-Admin {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Setup-Target {
    Write-Header "K8Pilot Environment Setup for Windows"
    if (-not (Check-Admin)) {
        Write-Warning "Setup requires Administrator privileges to install software via Chocolatey."
        $response = Read-Host "Would you like to relaunch this setup in an elevated PowerShell session? [Y/N]"
        if ($response -eq 'Y' -or $response -eq 'y') {
            Write-Host "Relaunching setup as Administrator..."
            Start-Process powershell -Verb RunAs -ArgumentList "-NoExit -ExecutionPolicy Bypass -File `"$PSCommandPath`" setup"
            exit
        } else {
            Write-ErrorMsg "Administrative privileges are required. Exiting setup."
            exit 1
        }
    }
    
    # Check for Chocolatey
    Write-Info "Checking if Chocolatey is installed..."
    $chocoPath = Get-Command choco -ErrorAction SilentlyContinue
    if (-not $chocoPath) {
        Write-Warning "Chocolatey (choco) not found in PATH."
        Write-Host "To install Chocolatey, open an Administrative PowerShell and run:" -ForegroundColor Yellow
        Write-Host "Set-ExecutionPolicy Bypass -Scope Process -Force; [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072; iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))" -ForegroundColor White
        Write-Host "Once Chocolatey is installed, please run: .\run.ps1 setup" -ForegroundColor Yellow
        exit 1
    }
    Write-Success "Chocolatey is installed."

    # Define required packages and their registry/choco check names
    $packages = @(
        @{ Name = "python3"; Command = "python"; ChocoName = "python3" },
        @{ Name = "nodejs"; Command = "node"; ChocoName = "nodejs" },
        @{ Name = "docker-desktop"; Command = "docker"; ChocoName = "docker-desktop" },
        @{ Name = "minikube"; Command = "minikube"; ChocoName = "minikube" },
        @{ Name = "kubernetes-cli"; Command = "kubectl"; ChocoName = "kubernetes-cli" },
        @{ Name = "kubernetes-helm"; Command = "helm"; ChocoName = "kubernetes-helm" }
    )

    foreach ($pkg in $packages) {
        Write-Info "Checking for $($pkg.Name)..."
        $cmdCheck = Get-Command $pkg.Command -ErrorAction SilentlyContinue
        if ($cmdCheck) {
            Write-Success "$($pkg.Name) is already installed."
        } else {
            Write-Host "$($pkg.Name) is missing. Installing via Chocolatey..." -ForegroundColor Yellow
            try {
                choco install -y $($pkg.ChocoName)
                # Refresh environment path in case it was just installed
                $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
                Write-Success "$($pkg.Name) installed successfully."
            } catch {
                Write-ErrorMsg "Failed to install $($pkg.Name). Please try running 'choco install $($pkg.ChocoName)' manually."
            }
        }
    }
    
    Write-Success "Prerequisites check and installation completed."
    Write-Host "Note: You may need to restart your terminal or computer for some changes/PATH environments to take effect." -ForegroundColor Cyan
    Write-Host "Next step: Start Docker Desktop, then run '.\run.ps1 cluster-up'" -ForegroundColor Yellow
}

# Functions for targets
function Help-Target {
    Write-Host "K8Pilot Task Runner (Windows PowerShell)" -ForegroundColor Cyan
    Write-Host "Usage: .\run.ps1 <command> [args]" -ForegroundColor White
    Write-Host ""
    Write-Host "Available commands:" -ForegroundColor White
    Write-Host "  setup             Check and install all Windows dependencies using Chocolatey"
    Write-Host "  cluster-up        Create and start minikube cluster with 'K8Pilot' profile"
    Write-Host "  cluster-down      Stop and delete minikube cluster"
    Write-Host "  infra-up          Start local DB and Redis containers using Docker Compose"
    Write-Host "  infra-down        Stop local DB and Redis containers"
    Write-Host "  monitoring        Install Prometheus + Grafana stack inside the cluster"
    Write-Host "  logs              Install Loki log aggregation inside the cluster"
    Write-Host "  port-forward      Port-forward Grafana (3000) and Prometheus (9090)"
    Write-Host "  backend           Install dependencies and run FastAPI backend locally"
    Write-Host "  frontend          Install dependencies and run Vite frontend locally"
    Write-Host "  dev               Start DB/Redis and run both backend and frontend"
    Write-Host "  deploy-sample     Deploy sample applications to test metrics"
    Write-Host "  tunnel            Run minikube tunnel (allows LoadBalancer access)"
    Write-Host "  dashboard         Open minikube Kubernetes dashboard"
    Write-Host "  clean             Full cleanup (cluster-down and infra-down)"
}

function ClusterUp-Target {
    Write-Header "Starting Minikube Cluster"
    minikube start --profile K8Pilot --driver docker --addons metrics-server --apiserver-port=8443
    Write-Success "Minikube cluster 'K8Pilot' is ready"
    
    Write-Info "Generating Docker-compatible kubeconfig..."
    if (-not (Test-Path "infra/docker")) {
        New-Item -ItemType Directory -Force -Path "infra/docker" | Out-Null
    }
    
    try {
        # Get minikube container IP on its Docker network (avoids host.docker.internal IPv6 issues)
        $minikubeIP = (minikube ip --profile K8Pilot).Trim()
        # Flatten kubeconfig (embeds certs) and point to minikube container IP on port 8443
        (kubectl config view --flatten --raw) -replace "https://127.0.0.1:\d+", "https://${minikubeIP}:8443" | Set-Content -Path "infra/docker/kube-config.yaml" -Encoding UTF8
        Write-Success "Generated Docker-compatible kubeconfig at infra/docker/kube-config.yaml (API server: ${minikubeIP}:8443)"
    } catch {
        Write-Warning "Failed to generate Docker-compatible kubeconfig automatically. You may need to generate it manually."
    }
}

function ClusterDown-Target {
    Write-Header "Deleting Minikube Cluster"
    minikube delete --profile K8Pilot
    Write-Success "Minikube cluster deleted"
}

function InfraUp-Target {
    Write-Header "Starting Local Infrastructure (Postgres, Redis, Ollama)"
    docker compose up -d
    Write-Success "PostgreSQL on :5432, Redis on :6379, Ollama on :11434"
}

function InfraDown-Target {
    Write-Header "Stopping Local Infrastructure"
    docker compose down
    Write-Success "Infrastructure stopped"
}

function Monitoring-Target {
    Write-Header "Installing Prometheus + Grafana Stack"
    try {
        helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
    } catch {
        Write-Warning "Could not add Helm repository. Continuing..."
    }
    helm repo update
    helm upgrade --install monitoring prometheus-community/kube-prometheus-stack `
        -n monitoring --create-namespace `
        -f infra/helm/prometheus-values.yaml
    Write-Success "Prometheus + Grafana installed successfully"
    Write-Host "Next step: Run '.\run.ps1 port-forward' to access dashboards"
}

function Logs-Target {
    Write-Header "Installing Loki Log Aggregation Stack"
    try {
        helm repo add grafana https://grafana.github.io/helm-charts
    } catch {
        Write-Warning "Could not add Helm repository. Continuing..."
    }
    helm repo update
    helm upgrade --install loki grafana/loki-stack `
        -n monitoring --create-namespace `
        -f infra/helm/loki-values.yaml
    Write-Success "Loki installed in monitoring namespace"
}

function PortForward-Target {
    Write-Header "Starting Port Forwarding"
    Write-Host "Prometheus UI: http://localhost:9090" -ForegroundColor Yellow
    Write-Host "Grafana UI:    http://localhost:3000 (admin/admin)" -ForegroundColor Yellow
    
    # Spawn background processes for port-forwarding
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "kubectl port-forward -n monitoring svc/monitoring-kube-prometheus-prometheus 9090:9090" -WindowStyle Minimized
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "kubectl port-forward -n monitoring svc/monitoring-grafana 3000:80" -WindowStyle Minimized
    
    Write-Success "Port forwarding jobs started in minimized background PowerShell windows."
}

function Backend-Target {
    Write-Header "Starting FastAPI Backend"
    Push-Location backend
    try {
        if (-not (Test-Path ".venv")) {
            Write-Info "Virtual environment (.venv) not found. Creating it..."
            python -m venv .venv
        }
        Write-Info "Installing Python dependencies..."
        & .venv\Scripts\python.exe -m pip install -r requirements.txt
        Write-Info "Starting Uvicorn dev server..."
        & .venv\Scripts\uvicorn.exe app.main:app --reload --port 8000
    } finally {
        Pop-Location
    }
}

function Frontend-Target {
    Write-Header "Starting Vite Frontend"
    Push-Location frontend
    try {
        Write-Info "Installing npm packages..."
        npm install
        Write-Info "Starting Vite dev server..."
        npm run dev
    } finally {
        Pop-Location
    }
}

function Dev-Target {
    Write-Header "Launching Full Dev Environment"

    # ── Phase 1: Minikube Cluster ──────────────────────────────────────
    Write-Info "Phase 1/3: Starting Minikube cluster..."
    ClusterUp-Target

    # ── Phase 2: Docker Compose ────────────────────────────────────────
    Write-Info "Phase 2/3: Starting Docker Compose services..."
    docker compose up -d --build
    Write-Success "Docker Compose services started"

    # ── Phase 3: Connect backend to Minikube network ───────────────────
    Write-Info "Phase 3/3: Connecting backend container to Minikube network..."
    $minikubeNetwork = "K8Pilot"
    $backendContainer = (docker compose ps -q backend 2>$null)
    if ($backendContainer) {
        try {
            docker network connect $minikubeNetwork $backendContainer 2>$null
            Write-Success "Backend container connected to '$minikubeNetwork' network"
        } catch {
            Write-Warning "Could not connect backend to minikube network (may already be connected)"
        }
    } else {
        Write-Warning "Backend container not found. You may need to run 'docker compose up -d' again."
    }

    Write-Host ""
    Write-Success "Full development environment is ready!"
    Write-Host "  Frontend:   http://localhost:5173" -ForegroundColor Cyan
    Write-Host "  Backend:    http://localhost:8000" -ForegroundColor Cyan
    Write-Host "  API Docs:   http://localhost:8000/docs" -ForegroundColor Cyan
    Write-Host "  Prometheus: http://localhost:9090" -ForegroundColor Cyan
    Write-Host "  Ollama:     http://localhost:11434" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Run '.\run.ps1 deploy-sample' to deploy sample workloads." -ForegroundColor Yellow
}

function DeploySample-Target {
    Write-Header "Deploying Sample Workloads to Kubernetes"
    # Run commands and suppress errors if already deployed
    try {
        kubectl create deployment nginx-test --image=nginx:alpine --replicas=3 2>$null
    } catch {}
    try {
        kubectl create deployment stress-test --image=polinux/stress --replicas=1 -- stress --cpu 1 --timeout 300s 2>$null
    } catch {}
    Write-Success "Sample workloads deployed to 'default' namespace."
}

function Tunnel-Target {
    Write-Header "Starting Minikube Tunnel"
    minikube tunnel --profile K8Pilot
}

function Dashboard-Target {
    Write-Header "Opening Minikube Dashboard"
    minikube dashboard --profile K8Pilot
}

function Clean-Target {
    Write-Header "Cleaning Up Resources"
    ClusterDown-Target
    InfraDown-Target
    Write-Success "Clean up complete."
}

# Main Command Dispatcher
switch ($Command.ToLower()) {
    "help"             { Help-Target }
    "setup"            { Setup-Target }
    "cluster-up"       { ClusterUp-Target }
    "cluster-down"     { ClusterDown-Target }
    "infra-up"         { InfraUp-Target }
    "infra-down"       { InfraDown-Target }
    "monitoring"       { Monitoring-Target }
    "logs"             { Logs-Target }
    "port-forward"     { PortForward-Target }
    "backend"          { Backend-Target }
    "frontend"         { Frontend-Target }
    "dev"              { Dev-Target }
    "deploy-sample"    { DeploySample-Target }
    "tunnel"           { Tunnel-Target }
    "dashboard"        { Dashboard-Target }
    "clean"            { Clean-Target }
    default {
        Write-ErrorMsg "Unknown command: '$Command'"
        Write-Host ""
        Help-Target
        exit 1
    }
}
