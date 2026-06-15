# Kubernetes (K8s) na Infraestrutura

Este projeto tambem pode ser executado em Kubernetes como uma alternativa ao Docker Compose e ao Docker Swarm. A ideia e manter a mesma arquitetura, mas usando recursos nativos do K8s para orquestracao, escalabilidade e recuperacao automatica.

## Componentes

| Componente | Recurso Kubernetes | Replicas | Funcao |
|------------|--------------------|----------|--------|
| PostgreSQL | Deployment + PVC + Service | 1 | Banco de dados persistente |
| Backend Express | Deployment + Service | 3 | API REST do sistema |
| Nginx | Deployment + Service LoadBalancer | 1 | Entrada HTTP e proxy reverso |
| Configuracoes | ConfigMap | - | Variaveis nao sensiveis |
| Segredos | Secret | - | Senha do banco e JWT secret |
| Namespace | Namespace | - | Isolamento logico do projeto |

## Fluxo de rede

```txt
Cliente -> Nginx Service :80 -> Backend Service :3000 -> PostgreSQL Service :5432
```

O backend continua privado dentro do cluster. A entrada externa acontece pelo Service do Nginx, mantendo o mesmo papel que ele ja tem no Docker Compose.

## Arquivos criados

```txt
k8s/
  namespace.yaml
  configmap.yaml
  secret.yaml
  postgres.yaml
  backend.yaml
  nginx.yaml
  kustomization.yaml
```

Tambem existe uma versao simples para o Lab 9 dentro da pasta Docker:

```txt
docker/kubernetes/
  deployment.yaml
  service.yaml
  kustomization.yaml
  README.md
```

Essa pasta demonstra os conceitos basicos de Kubernetes pedidos no laboratorio: Deployment, Service, replicas, labels e NodePort.

## Como aplicar

Antes de aplicar os manifests, crie a imagem local do backend:

```bash
docker build -t sistema-gestao-hotel-backend:latest .
```

Em seguida, aplique todos os recursos:

```bash
kubectl apply -k k8s
```

Verifique os pods:

```bash
kubectl get pods -n hotel-system
```

Verifique os services:

```bash
kubectl get svc -n hotel-system
```

Se estiver usando Minikube, exponha o Nginx:

```bash
minikube service nginx -n hotel-system
```

## Escalabilidade

O backend foi configurado com 3 replicas, seguindo a mesma proposta do Docker Swarm. Para alterar a escala:

```bash
kubectl scale deployment/backend --replicas=5 -n hotel-system
```

## Observacoes academicas

- O PostgreSQL fica com 1 replica porque banco de dados e stateful e exige cuidado com replicacao.
- O volume persistente do PostgreSQL usa PVC para manter os dados mesmo se o pod for recriado.
- O backend e stateless, por isso pode ser replicado horizontalmente.
- O Nginx fica como ponto unico de entrada HTTP.
- ConfigMap e Secret separam configuracao comum de dados sensiveis.

## Respostas conceituais do Lab 9

1. Se um Pod morrer, o Deployment recria outro Pod para voltar ao numero desejado de replicas.
2. Para comunicacao interna, outros Pods devem usar o Service, pois ele fornece um endereco estavel.
3. O trafego externo chega no NodePort `30080`, passa pelo Service e vai para a porta `80` do container.
4. A label que conecta o Deployment ao Service e `app: web-app`.
