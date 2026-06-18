# Correções Críticas de Infraestrutura

**Data:** 18/06/2026
**Dev:** Weslley
**Branch:** feature/infra-cicd-readme

---

## Resumo

Sessao de auditoria e correção de bugs críticos na infraestrutura do projeto (Docker Compose, Dockerfile, Nginx, Kubernetes). Foram identificados 10 problemas e todos foram corrigidos.

---

## Correções Aplicadas

### Docker Compose (`docker-compose.yml`)

| Problema | Correção |
|----------|----------|
| `JWT_SECRET` com valor default hardcoded no repo | Trocado para `${JWT_SECRET:?...}` — Compose recusa subir sem definir no `.env` |
| `node_web` sem healthcheck | Adicionado healthcheck via `/health` com `start_period: 15s` |
| `nginx` dependia de `node_web` sem condição | Adicionado `condition: service_healthy` — Nginx so inicia quando Node responde |

### Dockerfile

| Problema | Correção |
|----------|----------|
| Sem instrução `HEALTHCHECK` | Adicionado `HEALTHCHECK` que consulta `/health` — Docker/K8s detecta e reinicia container travado |

### `.dockerignore`

| Problema | Correção |
|----------|----------|
| `.github/` não era excluído | Adicionado — workflows CI/CD não pertencem à imagem de runtime |

### `.env.example`

| Problema | Correção |
|----------|----------|
| `REDIS_URL` apontava para hostname Docker (`redis`) | Corrigido para `localhost:6379` (dev local), com comentário explicando o valor Docker |
| `JWT_SECRET` sem indicação de obrigatoriedade | Adicionado comentário que docker-compose falha sem este valor |

### Nginx (`docker/nginx/default.conf`)

| Problema | Correção |
|----------|----------|
| Sem headers de segurança | Adicionados: `X-Frame-Options`, `X-Content-Type-Options`, `X-XSS-Protection`, `Referrer-Policy` |
| Sem limite de body | Adicionado `client_max_body_size 10m` |
| Sem `X-Forwarded-Proto` | Adicionado header para backend saber se request veio por HTTPS |

### Kubernetes (`k8s/`)

| Problema | Correção |
|----------|----------|
| Redis não existia no cluster | Criado `k8s/redis.yaml` — Deployment + Service + probes + limites de recursos |
| `REDIS_URL` ausente no ConfigMap | Adicionado `REDIS_URL: redis://redis:6379` em `k8s/configmap.yaml` |
| PostgreSQL usava Deployment | Convertido para StatefulSet em `k8s/postgres.yaml` — garante identidade estável e vínculo correto com PVC |
| Probes do Postgres hardcoded (`hotel_user`, `gestao_hotel`) | Corrigido para ler `$POSTGRES_USER` e `$POSTGRES_DB` das env vars injetadas pelo ConfigMap |
| Secrets com senhas reais commitadas | Trocados para placeholder `TROCAR_ANTES_DE_APLICAR` em `k8s/secret.yaml` |
| Redis sem NetworkPolicy | Criada policy `redis-ingress` — somente pods `backend` acessam porta 6379 |
| Redis ausente no Kustomization | Adicionado `redis.yaml` em `k8s/kustomization.yaml` |

---

## Arquivos Modificados

| Arquivo | Tipo |
|---------|------|
| `docker-compose.yml` | Modificado |
| `Dockerfile` | Modificado |
| `.dockerignore` | Modificado |
| `.env.example` | Modificado |
| `docker/nginx/default.conf` | Modificado |
| `k8s/configmap.yaml` | Modificado |
| `k8s/postgres.yaml` | Modificado (Deployment → StatefulSet) |
| `k8s/secret.yaml` | Modificado |
| `k8s/networkpolicy.yaml` | Modificado |
| `k8s/kustomization.yaml` | Modificado |
| `k8s/redis.yaml` | Criado |

---

## Pendências para Próxima Sessão

- [ ] Configurar secrets via ferramenta externa (Sealed Secrets, External Secrets Operator) em vez de `stringData` no YAML
- [ ] Avaliar necessidade de HPA (Horizontal Pod Autoscaler) para o backend
- [ ] Adicionar TLS/HTTPS no Nginx (cert-manager + Ingress no K8s)
- [ ] Adicionar rate limiting no endpoint de login (`/auth/login`)
- [ ] Corrigir LoginController — login busca email global sem filtrar por tenant
