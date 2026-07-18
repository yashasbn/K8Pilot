.PHONY: help cluster-up cluster-down infra-up infra-down monitoring logs backend frontend dev clean

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

# ─── Local Infrastructure ────────────────────────────────────────────

cluster-up: ## Create minikube cluster
	minikube start --profile K8Pilot --driver docker --addons metrics-server
	@echo "✓ Minikube cluster 'K8Pilot' is ready"
	@echo "  Run 'make monitoring' to install Prometheus + Grafana"

cluster-down: ## Delete minikube cluster
	minikube delete --profile K8Pilot

infra-up: ## Start PostgreSQL and Redis (Docker Compose)
	docker compose up -d
	@echo "✓ PostgreSQL on :5432, Redis on :6379"

infra-down: ## Stop PostgreSQL and Redis
	docker compose down

# ─── Monitoring Stack ────────────────────────────────────────────────

monitoring: ## Install Prometheus + Grafana into minikube cluster
	helm repo add prometheus-community https://prometheus-community.github.io/helm-charts || true
	helm repo update
	helm upgrade --install monitoring prometheus-community/kube-prometheus-stack \
		-n monitoring --create-namespace \
		-f infra/helm/prometheus-values.yaml
	@echo "✓ Prometheus + Grafana installed"
	@echo "  Run 'make port-forward' to access them locally"

logs: ## Install Loki log aggregation into minikube cluster
	helm repo add grafana https://grafana.github.io/helm-charts || true
	helm repo update
	helm upgrade --install loki grafana/loki-stack \
		-n monitoring --create-namespace \
		-f infra/helm/loki-values.yaml
	@echo "✓ Loki installed in monitoring namespace"

port-forward: ## Port-forward Prometheus (9090) and Grafana (3000)
	@echo "Prometheus: http://localhost:9090"
	@echo "Grafana:    http://localhost:3000 (admin/admin)"
	kubectl port-forward -n monitoring svc/monitoring-kube-prometheus-prometheus 9090:9090 &
	kubectl port-forward -n monitoring svc/monitoring-grafana 3000:80

# ─── Application ─────────────────────────────────────────────────────

backend: ## Run FastAPI backend locally
	cd backend && pip install -r requirements.txt && \
	uvicorn app.main:app --reload --port 8000

frontend: ## Run React frontend locally
	cd frontend && npm install && npm run dev

dev: infra-up ## Start full local dev stack (DB + Redis + Backend + Frontend)
	@echo "Starting backend and frontend..."
	@make -j2 backend frontend

# ─── Sample Workloads ────────────────────────────────────────────────

deploy-sample: ## Deploy sample apps to test monitoring
	kubectl create deployment nginx-test --image=nginx:alpine --replicas=3 || true
	kubectl create deployment stress-test --image=polinux/stress --replicas=1 -- stress --cpu 1 --timeout 300s || true
	@echo "✓ Sample workloads deployed"

tunnel: ## Start minikube tunnel (required for LoadBalancer services)
	minikube tunnel --profile K8Pilot

dashboard: ## Open minikube Kubernetes dashboard
	minikube dashboard --profile K8Pilot

# ─── Cleanup ─────────────────────────────────────────────────────────

clean: cluster-down infra-down ## Destroy everything
	minikube delete --profile K8Pilot --purge || true
	@echo "✓ All cleaned up"
