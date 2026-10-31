# Kubernetes (K8s) na Infraestrutura

Este projeto tambem pode ser executado em Kubernetes como uma alternativa ao Docker Compose e ao Docker Swarm. A ideia e manter a mesma arquitetura, mas usando recursos nativos do K8s para orquestracao, escalabilidade e recuperacao automatica.

## Componentes

| Componente | Recurso Kubernetes | Replicas | Funcao |
|------------|--------------------|----------|--------|
| PostgreSQL | Deployment + PVC + Service | 1 | Banco de dados persistente |
| Backend Express | Deployment + Service | 3 | API REST do sistema |
| Nginx | Deployment + Service LoadBalancer | 1 | Entrada HTTP e proxy reverso |
| Configuracoes | ConfigMap | - | Variaveis nao sensiveis |
| Segredos | Secret | - | `hotel-secret`: senha do banco, webhook PIX, MinIO e RabbitMQ (admin + usuários do core e do analytics) · `jwt-rsa-keys`: par RS256 do JWT, não versionado (ADR-006) |
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
  secret.yaml            — POSTGRES_PASSWORD, PIX_WEBHOOK_SECRET, MINIO_ROOT_*, MINIO_PRESIGN_*, RABBITMQ_DEFAULT_*, RABBITMQ_CORE_* e RABBITMQ_ANALYTICS_* (JWT vira o secret jwt-rsa-keys, não versionado — ver README.md, ADR-006)
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

## Atualizar o backend — migrate antes e depois do rollout

Desde a T-04.2 o `migrate` também migra **dados** (consumo de `consumptions` para `account_items`).
Por isso a troca de versão do backend passa sempre pelo `./start.sh deploy`, nunca por um
`rollout restart` solto:

```bash
./start.sh deploy                                   # reinicia com a imagem que está no Deployment
./start.sh deploy sistema-gestao-hotel-backend:v2   # troca para a imagem informada
```

| Etapa | Por quê |
|---|---|
| 1. `migrate` num Job com a imagem **nova** | O código novo procura o consumo em `account_items`; sem o migrate antes, o bill dessas reservas responde `503` até alguém rodar o migrate |
| 2. Rollout, e espera os pods antigos **saírem** | O `rollout status` volta com os pods antigos ainda em Terminating (até 60 s), atendendo pelas conexões keepalive do nginx |
| 3. `migrate` de novo | Durante o rolling update os pods **antigos** ainda gravam em `consumptions`. O migrate é idempotente e só pega esse intervalo |

- O Job é `infra/k8s/jobs/backend-migrate.yaml`, fora do `kustomization` (Job é imutável; cada
  execução ganha nome novo). Label `app: backend-migrate`, liberado no `postgres-ingress` da
  `networkpolicy.yaml`.
- `./start.sh migrate` sozinho roda o mesmo Job com a imagem que está no ar.
- Trocar só configuração (ConfigMap, Secret) com a mesma imagem não exige migrate: os `rollout
  restart` da seção acima continuam valendo.

### Quando algo falha

| Onde falhou | Estado do cluster | O que fazer |
|---|---|---|
| 1º migrate (inclusive código 1 = reservas com dado inválido; imagem que não baixa) | Pods antigos intactos, nada trocado | O script mostra condição, eventos e log do Job. Corrija a causa e rode o `deploy` de novo. O pod do Job fica 1 h para o `kubectl logs` |
| Rollout passou de 300 s | Deployment **misto** (pods novos e antigos) e sem o 2º migrate | `kubectl -n hotel-system rollout undo deploy/backend` para voltar, ou corrija e rode o `deploy` de novo. Nos dois casos termine com `./start.sh migrate` |
| Pods antigos não saíram em 120 s | Pods novos no ar; o 2º migrate roda mesmo assim, com aviso | Quando os antigos saírem, `./start.sh migrate` |
| 2º migrate | Pods **novos já no ar**; o bill das reservas afetadas responde `503` (fail-safe, sem valor errado) | Corrija os dados listados no log e rode `./start.sh migrate` |

### Cuidados

- **`kubectl apply -k infra/k8s/` volta a imagem para a do manifest** (`:latest`). Se o backend
  estava numa tag posta por `./start.sh deploy <imagem>`, o apply dispara um rollout de outro código
  sem migrate. Depois de um apply, rode `./start.sh deploy <imagem>` de novo.
- **Remover ou renomear coluna exige duas releases (expand/contract).** O 1º migrate roda com o
  model novo enquanto os pods antigos ainda atendem, e o `sync({ alter: true })` apaga a coluna que
  saiu do model: os pods antigos passam a dar `500`. Release 1: o código para de usar a coluna.
  Release 2: o model deixa de declarar a coluna.
- Fora do kind, use tag imutável no `deploy`: com `:latest` e `imagePullPolicy: IfNotPresent`, o Job e
  os pods podem rodar builds diferentes.

## analytics-service — `/health` é readiness, não liveness (T-01.4)

[revisão do Weslley] Desde a H.3 o analytics tem manifesto próprio, `infra/k8s/analytics.yaml` (CA-01.4.n):
StatefulSet `analytics-postgres` com PVC e Service (banco próprio, ADR-003), Deployment
`analytics-service` com 1 réplica e Service na porta 3001. A credencial do banco vem do secret
`analytics-db`, **não versionado**, criado com senha aleatória por `scripts/k8s_garantir_secret_analytics.sh`
(chamado por `infra_up.sh` e `./start.sh up`). O pod monta só o item `jwt-public.pem` do `jwt-rsa-keys`.
NetworkPolicy: só o analytics fala com o `analytics-postgres`; só o nginx chega à porta 3001; o analytics
entra na lista de quem alcança o AMQP do RabbitMQ.

O nginx manda `/analytics/` para o `analytics-service` e `/analytics/internal-consumption` para o
backend (o consumo interno lê `accounts`/`account_items`, sem evento no catálogo — decisão L-1).

As probes seguem a regra da reauditoria delta da H.2 (🟢-D):

| Probe | Caminho | Por quê |
|---|---|---|
| `readinessProbe` | `GET /health` (porta 3001) | Responde **503** com o banco do analytics fora ou o consumidor sem consumir (broker fora, topologia ausente). O pod sai do Service enquanto a projeção está parada — é o comportamento certo |
| `livenessProbe` | **não usar `/health`** — só TCP na porta 3001, ou nenhuma | Com o broker ou o banco fora, `/health` dá 503 **de propósito**. Como liveness, o kubelet reiniciaria o pod em laço (`CrashLoopBackOff`) sem resolver nada: o consumidor já reconecta sozinho, com espera crescente |

O `HEALTHCHECK` do `Dockerfile` do analytics usa o mesmo `/health`. No Docker Compose isso só marca o
contêiner como `unhealthy` (não reinicia); em Swarm, um `unhealthy` **reinicia** a tarefa — no Swarm,
desligue o healthcheck do analytics ou troque por um teste de porta.
