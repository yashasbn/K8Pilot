from kubernetes import client, config
from kubernetes.config.config_exception import ConfigException
from app.core.config import settings

_k8s_configured = False
_k8s_available = False


def _ensure_config():
    """Attempt to load kubeconfig once. If no cluster is available, mark as unavailable."""
    global _k8s_configured, _k8s_available
    if _k8s_configured:
        return _k8s_available

    _k8s_configured = True
    try:
        if settings.kube_config_path:
            config.load_kube_config(
                config_file=settings.kube_config_path,
                context=settings.kube_context,
            )
        else:
            try:
                config.load_incluster_config()
            except ConfigException:
                config.load_kube_config(context=settings.kube_context)

        # Disable SSL verification to allow connecting via host.docker.internal
        # (minikube certs are issued for 127.0.0.1, not host.docker.internal)
        configuration = client.Configuration.get_default_copy()
        configuration.verify_ssl = False
        client.Configuration.set_default(configuration)

        _k8s_available = True
    except Exception:
        _k8s_available = False

    return _k8s_available


def is_k8s_available() -> bool:
    """Check if a Kubernetes cluster is reachable."""
    return _ensure_config()


def get_k8s_client() -> client.CoreV1Api:
    """Load kubeconfig and return a CoreV1Api client."""
    if not _ensure_config():
        raise ConfigException("No Kubernetes cluster configured or reachable.")
    return client.CoreV1Api()


def get_apps_client() -> client.AppsV1Api:
    """Return an AppsV1Api client."""
    if not _ensure_config():
        raise ConfigException("No Kubernetes cluster configured or reachable.")
    get_k8s_client()  # ensures config is loaded
    return client.AppsV1Api()
