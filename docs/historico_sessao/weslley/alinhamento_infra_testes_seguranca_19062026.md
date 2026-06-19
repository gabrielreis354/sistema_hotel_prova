# Alinhamento de Infraestrutura com Testes e Seguranca

**Data:** 19/06/2026
**Dev:** Weslley
**Branch:** fix/infra-alinhamento-testes-seguranca (a partir de feature/infra-cicd-readme)

---

## Contexto

Revisao cruzada do trabalho de infra (sessao 18/06) com o que Gabriel e Sirlande fizeram:
- Gabriel criou suite de 78 testes + corrigiu vulnerabilidade de login multi-tenant
- Sirlande corrigiu FKs do schema e sincronizou PaymentModel

Foram identificados **4 gaps** na infra que contradiziam ou nao aproveitavam o trabalho dos colegas.

---

## Correcoes Aplicadas

### 1. CI/CD — Testes antes do build (`.github/workflows/docker-ecr.yml`)

| Problema | Correcao |
|----------|----------|
| Pipeline so fazia build+push, ignorava os 78 testes do Gabriel | Adicionado job `test` com PostgreSQL service container |
| Testes so rodariam em push para main | Adicionado trigger em `pull_request` tambem |
| Job `build-and-push` nao dependia de testes | Adicionado `needs: test` — build so ocorre se testes passarem |
| `secrets.AWS_REGION \|\| 'us-east-1'` — syntax invalida em GH Actions | Corrigido para `secrets.AWS_REGION` direto |

### 2. Nginx K8s — Headers de seguranca (`k8s/nginx.yaml`)

| Problema | Correcao |
|----------|----------|
| Headers de seguranca existiam no Docker Compose mas nao no K8s | Adicionados: X-Frame-Options, X-Content-Type-Options, X-XSS-Protection, Referrer-Policy |
| Sem limite de body no K8s | Adicionado `client_max_body_size 10m` |

### 3. Rate Limiting em `/auth/login` (Nginx Docker + K8s)

| Problema | Correcao |
|----------|----------|
| Gabriel corrigiu vuln de login multi-tenant mas nao havia protecao contra brute force | Adicionado `limit_req_zone` com 5 requests/minuto por IP |
| Burst permitido: 3 requests extras com `nodelay` | Status 429 retornado quando excede |

### 4. Redis K8s — Persistencia real (`k8s/redis.yaml`)

| Problema | Correcao |
|----------|----------|
| Redis usava `emptyDir: {}` — dados perdem no restart do pod | Criado PVC de 512Mi + strategy Recreate |
| `--appendonly yes` sem volume persistente era contraditorio | Agora AOF persiste entre restarts via PVC |

---

## Arquivos Modificados

| Arquivo | Tipo |
|---------|------|
| `.github/workflows/docker-ecr.yml` | Modificado |
| `docker/nginx/default.conf` | Modificado |
| `k8s/nginx.yaml` | Modificado |
| `k8s/redis.yaml` | Modificado |

---

## Conceitos Demonstrados

| Conceito | Onde aparece |
|----------|-------------|
| CI/CD com quality gate (testes bloqueiam deploy) | docker-ecr.yml: `needs: test` |
| Service containers no GitHub Actions | docker-ecr.yml: PostgreSQL 17 como service |
| Rate limiting com nginx `limit_req_zone` | nginx.yaml + default.conf |
| Defense in depth (app fix + infra protection) | Rate limit complementa fix do Gabriel |
| Persistencia stateful em K8s (PVC) | redis.yaml: PVC 512Mi |
| Consistencia entre ambientes (dev = prod) | Headers de seguranca iguais em Docker e K8s |
| Separation of concerns no pipeline | Job `test` separado do job `build-and-push` |

---

## Pendencias Restantes

- [ ] Configurar TLS/HTTPS no Nginx (cert-manager + Ingress)
- [ ] HPA (Horizontal Pod Autoscaler) para o backend
- [ ] Sealed Secrets ou External Secrets Operator para secrets reais
- [ ] Adicionar Redis como service no CI se app passar a usa-lo

---

*Relatorio gerado em 19/06/2026.*
