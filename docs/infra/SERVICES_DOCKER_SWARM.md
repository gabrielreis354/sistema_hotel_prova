# Serviços de Infraestrutura — Kubernetes

> Este documento descreve os serviços que compõem o ambiente de execução do projeto.
> O ambiente atual é **Kubernetes**, aplicado via `kubectl apply -k k8s/`.
> Os manifests completos estão em `k8s/`.

---

## Serviços do Cluster

O projeto roda no namespace `hotel-system` com 3 serviços principais:

### 1. PostgreSQL — Banco de dados (1 réplica)

**Recursos K8s:** `Deployment` + `Service (ClusterIP)` + `PersistentVolumeClaim`

**Por que 1 réplica?**
PostgreSQL é **stateful** — replicação de banco de dados é complexa e exige soluções como Patroni ou pg-HA. Para um projeto acadêmico, 1 réplica é suficiente. O dado é protegido pelo PVC (PersistentVolumeClaim), que sobrevive à recriação do Pod.

**O que armazena:**
- Tenants (hotéis), usuários, categorias, quartos, hóspedes, reservas, pagamentos

**Acesso:** ClusterIP `:5432` — acessível apenas pelos Pods do backend dentro do cluster. Inacessível do host externo (NetworkPolicy aplicada).

---

### 2. Backend Express — API REST (3 réplicas)

**Recursos K8s:** `Deployment` + `Service (ClusterIP)` + `PodDisruptionBudget`

**Por que 3 réplicas?**
O backend é **stateless** — cada requisição é independente, o estado da sessão está no token JWT. Isso torna replicação horizontal segura e sem risco de inconsistência. 3 réplicas distribuem a carga e garantem resiliência: se 1 Pod falhar ou for atualizado, os outros 2 continuam respondendo.

**PodDisruptionBudget (`minAvailable: 2`):** durante uma atualização de deployment ou manutenção de nó, o K8s garante que pelo menos 2 réplicas continuem disponíveis — zero downtime.

**O que processa:**
- Autenticação JWT, CRUD de todas as entidades, check-in/out, cancelamentos, pagamentos

**Acesso:** ClusterIP `:3000` — acessível apenas pelo Pod do nginx dentro do cluster.

---

### 3. Nginx — Proxy reverso (1 réplica)

**Recursos K8s:** `ConfigMap` (configuração nginx) + `Deployment` + `Service (LoadBalancer)`

**Por que 1 réplica?**
Nginx é leve e stateless. Para este projeto acadêmico, 1 réplica é suficiente. Em produção, seria 2+ réplicas com um LoadBalancer externo real.

**O que faz:**
- Único ponto de entrada externo (porta 80)
- Roteia todas as requisições para o Service `backend:3000`
- Injeta headers de proxy (`X-Real-IP`, `X-Forwarded-For`)
- Health check próprio em `/healthz` — não consome recursos do backend

**Acesso:** LoadBalancer `:80` — no Docker Desktop resolve como `localhost:80`. No Minikube requer `minikube tunnel`.

---

## Fluxo de uma requisição

```
Cliente (browser / Postman / curl)
        |
    localhost:80
        |
   [ nginx Pod ]
        |   (NetworkPolicy: nginx → backend apenas)
   [ backend Service :3000 ]
        |
   [ backend Pod 1 ] ou [ Pod 2 ] ou [ Pod 3 ]  <- distribuido automaticamente
        |   (NetworkPolicy: backend → postgres apenas)
   [ postgres Service :5432 ]
        |
   [ postgres Pod ]
        |
   [ PVC postgres-data ]
```

---

## Isolamento de rede (NetworkPolicy)

Dois recursos `NetworkPolicy` garantem que nenhum Pod acesse o banco diretamente:

| Politica | Efeito |
|---|---|
| `postgres-ingress` | Aceita trafego na porta 5432 somente de Pods com label `app: backend` |
| `backend-ingress` | Aceita trafego na porta 3000 somente de Pods com label `app: nginx` |

Nginx nunca acessa o banco diretamente. Backend nunca e acessado pelo cliente diretamente.

---

## Comparativo: Kubernetes vs Docker Compose

| Aspecto | Kubernetes (`k8s/`) | Docker Compose (`docker-compose.yml`) |
|---|---|---|
| Uso | Ambiente principal de execucao | Auxiliar — usado para testes automatizados |
| Configuracao | ConfigMap + Secret | Arquivo `.env` |
| Persistencia | PersistentVolumeClaim | Named Volume |
| Replicas backend | 3 | 1 |
| Escalonamento | `kubectl scale deployment/backend --replicas=N` | Manual |
| Rede | Kubernetes networking + NetworkPolicy | Bridge customizada |
| Ponto de entrada | Service LoadBalancer `:80` | Port mapping `80:80` |

---

*Ultima atualizacao: 18/06/2026 — convertido de Docker Swarm para Kubernetes*
