# Kubernetes (K8s) na Infraestrutura

Este projeto tambem pode ser executado em Kubernetes como uma alternativa ao Docker Compose e ao Docker Swarm. A ideia e manter a mesma arquitetura, mas usando recursos nativos do K8s para orquestracao, escalabilidade e recuperacao automatica.

## Componentes

| Componente | Recurso Kubernetes | Replicas | Funcao |
|------------|--------------------|----------|--------|
| PostgreSQL | Deployment + PVC + Service | 1 | Banco de dados persistente |
| Backend Express | Deployment + Service | 3 | API REST do sistema |
| Nginx | Deployment + Service LoadBalancer | 1 | Entrada HTTP e proxy reverso |
| Configuracoes | ConfigMap | - | Variaveis nao sensiveis |
| Segredos | Secret | - | `hotel-secret`: senha do banco, webhook PIX, MinIO e RabbitMQ · `jwt-rsa-keys`: par RS256 do JWT, não versionado (ADR-006) |
| Namespace | Namespace | - | Isolamento logico do projeto |

## Fluxo de rede

```txt
Cliente -> Nginx Service :80 -> Backend Service :3000 -> PostgreSQL Service :5432
```

O backend continua privado dentro do cluster. A entrada externa acontece pelo Service do Nginx, mantendo o mesmo papel que ele ja tem no Docker Compose.

## Arquivos criados

```txt
infra/k8s/
  kustomization.yaml     — ponto de entrada (kubectl apply -k infra/k8s/)
  namespace.yaml         — namespace hotel-system
  configmap.yaml         — variaveis nao sensiveis
  secret.yaml            — POSTGRES_PASSWORD, PIX_WEBHOOK_SECRET, MINIO_ROOT_*, MINIO_PRESIGN_* e RABBITMQ_DEFAULT_* (JWT vira o secret jwt-rsa-keys, não versionado — ver README.md, ADR-006)
  postgres.yaml          — PVC + Deployment + Service do PostgreSQL
  backend.yaml           — Deployment (3 replicas) + Service do backend
  nginx.yaml             — ConfigMap nginx + Deployment + Service LoadBalancer
  pdb.yaml               — PodDisruptionBudget (minAvailable: 2 para o backend)
  networkpolicy.yaml     — isolamento: postgres so aceita backend; backend so aceita nginx
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

## Download de PDF por URL assinada (RNF-023) — operação

O backend assina as URLs com um usuário MinIO **só de leitura** (`MINIO_PRESIGN_USER`), criado pelo
contêiner `setup` do pod `minio-0` (`infra/k8s/minio-setup.sh`). O navegador baixa pelo nginx, que
só repassa ao MinIO `GET` de PDF de orçamento/contrato assinado por esse usuário, com validade de
até 5 minutos.

| Situação | O que fazer |
|---|---|
| Download de PDF responde `403` | `kubectl -n hotel-system logs minio-0 -c setup` — o setup loga cada falha (senha do leitor com menos de 8 caracteres, root errado). O pod fica `Ready` mesmo com o setup falhando, de propósito: o upload não depende dele |
| Trocar `MINIO_PRESIGN_PASSWORD` (ou o root) | `kubectl apply -k infra/k8s/` e **`kubectl -n hotel-system rollout restart statefulset/minio deploy/backend`** — o setup só roda quando o pod do MinIO reinicia; reiniciar só o backend deixa o MinIO com a senha antiga e todo download dá `403` |
| Mudar `MINIO_PUBLIC_ENDPOINT` ou o `nginx.yaml` | `kubectl apply -k infra/k8s/` e `kubectl -n hotel-system rollout restart deploy/backend deploy/nginx` — nenhum dos dois recarrega o ConfigMap sozinho |
| Renomear `MINIO_PRESIGN_USER` | Mude também o nome em `X-Amz-Credential=gesway-pdf-leitor%2F` no `nginx.yaml` **e** no `docker/nginx/default.conf` (o `qa_checks.sh` confere que as duas cópias batem) |

Para provar o comportamento contra um ambiente local: `scripts/verificar_download_pdf.sh`.
