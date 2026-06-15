# Kubernetes no Docker

Esta pasta guarda os manifestos simples do Lab 9 para praticar Kubernetes com Docker Desktop, Minikube e kubectl.

## Arquivos

| Arquivo | Funcao |
|---------|--------|
| `deployment.yaml` | Cria 3 replicas de uma aplicacao Nginx |
| `service.yaml` | Expoe a aplicacao com Service do tipo NodePort |
| `kustomization.yaml` | Permite aplicar ou validar os dois arquivos juntos |

## Como executar no Minikube

Inicie o cluster:

```bash
minikube start
```

Aplique os manifestos:

```bash
kubectl apply -f docker/kubernetes/deployment.yaml
kubectl apply -f docker/kubernetes/service.yaml
```

Ou aplique tudo junto:

```bash
kubectl apply -k docker/kubernetes
```

Verifique os recursos:

```bash
kubectl get deployments
kubectl get pods
kubectl get services
```

Abra a aplicacao:

```bash
minikube service web-app-service --url
```

Escale para 5 replicas:

```bash
kubectl scale deployment web-app-deployment --replicas=5
kubectl get pods
```

Remova os recursos:

```bash
kubectl delete -f docker/kubernetes/service.yaml
kubectl delete -f docker/kubernetes/deployment.yaml
```

## Relacao com a infra do projeto

- Esta pasta (`docker/kubernetes/`) atende ao exercicio basico do Lab 9.
- A pasta `k8s/` contem os manifests completos do sistema de hotel: PostgreSQL, backend Express e Nginx.
