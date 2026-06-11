# Revisão de Infraestrutura Kubernetes — Sistema de Gestão de Hotel

**Data:** 2026-06-11
**Revisor:** Claude Code (engenheiro DevOps/Platform sênior)
**Branch:** develop
**Escopo:** `k8s/` (infraestrutura completa) + `docker/kubernetes/` (Lab 9)

---

## Visão Geral

O PR entrega toda a infraestrutura K8s do sistema do zero: namespace isolado, ConfigMap/Secret para configuração, Deployment PostgreSQL com PVC, backend Express com 3 réplicas e Nginx como reverse proxy com Service LoadBalancer. O Lab 9 (`docker/kubernetes/`) é um exercício separado e independente, correto para o propósito didático. A estrutura geral está sólida e demonstra domínio dos conceitos fundamentais de orquestração.

---

## 1. Verificação de Conceitos K8s (Perspectiva Acadêmica)

| Recurso | Arquivo | Status | Observação |
|---|---|---|---|
| Namespace | `namespace.yaml` | ✅ | `hotel-system` aplicado em todos os recursos |
| ConfigMap | `configmap.yaml` | ✅ | Separação correta: não-sensíveis no ConfigMap |
| Secret | `secret.yaml` | ✅ | `Opaque` com `stringData`, referenciado via `secretKeyRef` |
| Deployment c/ replicas + matchLabels | `backend.yaml`, `postgres.yaml`, `nginx.yaml` | ✅ | `selector.matchLabels` consistente com `template.labels` nos 3 deployments |
| Service com selector correto | todos os `*.yaml` | ✅ | ClusterIP para postgres e backend, LoadBalancer para nginx |
| PVC para PostgreSQL | `postgres.yaml` | ✅ | `ReadWriteOnce`, 1Gi, montado em `/var/lib/postgresql/data` |
| Kustomize funcional | `k8s/kustomization.yaml` | ✅ | Ordem correta: namespace → configmap → secret → workloads |
| Lab 9 (docker/kubernetes) | `deployment.yaml` + `service.yaml` | ✅ | Deployment 3 réplicas + NodePort 30080, correto para o exercício |

**Todos os conceitos obrigatórios estão implementados e corretos.**

---

## 2. Análise de Qualidade (Perspectiva de Produção)

### Findings

#### 🔴 Crítico

**[1] `secret.yaml:8-9` — Credenciais fracas em plaintext commitadas no Git**

```yaml
stringData:
  POSTGRES_PASSWORD: hotel_password        # senha trivial
  JWT_SECRET: pms_hotel_secreto_academico_2026
```

`stringData` é base64-encoded pelo K8s na hora da aplicação, mas o valor original fica exposto no repositório git para sempre — `git log` revela mesmo após delete. Para prod, o Secret não deveria nem existir no repositório.

Correção para produção:
```yaml
# Opção 1 - Sealed Secrets (Bitnami)
apiVersion: bitnami.com/v1alpha1
kind: SealedSecret
metadata:
  name: hotel-secret
  namespace: hotel-system
spec:
  encryptedData:
    POSTGRES_PASSWORD: AgBy3i4OJSWK+...  # criptografado com chave do cluster
    JWT_SECRET: AgBy3i4OJSWK+...

# Opção 2 - External Secrets Operator apontando para AWS Secrets Manager / Vault
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: hotel-secret
  namespace: hotel-system
spec:
  secretStoreRef:
    name: aws-secrets-manager
    kind: ClusterSecretStore
  target:
    name: hotel-secret
  data:
    - secretKey: POSTGRES_PASSWORD
      remoteRef:
        key: hotel/prod/db
        property: password
```

---

**[2] `nginx.yaml:46-55` — Health probes apontam para `/api-docs` que proxia para o backend**

```yaml
readinessProbe:
  httpGet:
    path: /api-docs   # proxia para http://backend:3000/api-docs
    port: 80
```

O problema: se o backend estiver down, o Nginx responde 502 → a probe falha → o pod Nginx vai para `NotReady` → o Service para de rotear para ele → o Nginx não recebe tráfego → as probes nunca passam. **Loop de cascata**: backend down derruba nginx. Além disso, `/api-docs` no Swagger UI retorna 301 redirect, que o httpGet do kubelet não segue por padrão — a probe falha mesmo com o sistema saudável.

Correção:
```yaml
# nginx.yaml — adicionar endpoint local de health no ConfigMap
data:
  default.conf: |
    server {
      listen 80;

      location /healthz {          # health check local, sem proxy
        access_log off;
        return 200 "ok\n";
        add_header Content-Type text/plain;
      }

      location / {
        proxy_pass http://backend:3000;
        ...
      }
    }

# E no Deployment:
readinessProbe:
  httpGet:
    path: /healthz
    port: 80
  initialDelaySeconds: 5
  periodSeconds: 10
livenessProbe:
  httpGet:
    path: /healthz
    port: 80
  initialDelaySeconds: 15
  periodSeconds: 20
```

---

**[3] `backend.yaml`, `postgres.yaml`, `nginx.yaml` — Nenhum container tem `resources.limits`**

Sem limites, um backend com memory leak pode consumir toda a RAM do node e acionar o OOM killer do kernel, derrubando pods de outros tenants ou do próprio postgres. Em um cluster compartilhado isso é crítico.

Correção (valores conservadores para o porte do sistema):
```yaml
# backend.yaml
resources:
  requests:
    cpu: "100m"
    memory: "128Mi"
  limits:
    cpu: "500m"
    memory: "512Mi"

# postgres.yaml
resources:
  requests:
    cpu: "250m"
    memory: "256Mi"
  limits:
    cpu: "1000m"
    memory: "1Gi"

# nginx.yaml
resources:
  requests:
    cpu: "50m"
    memory: "64Mi"
  limits:
    cpu: "200m"
    memory: "128Mi"
```

---

#### 🟡 Médio

**[4] `backend.yaml:20-21` — `image: latest` + `imagePullPolicy: IfNotPresent` é uma armadilha silenciosa**

```yaml
image: sistema-gestao-hotel-backend:latest
imagePullPolicy: IfNotPresent
```

`IfNotPresent` com `latest` significa: uma vez que a imagem está no nó, ela nunca é atualizada — `latest` na registry pode mudar, mas o pod continua rodando a versão antiga sem nenhum aviso. Correto para Minikube (onde a imagem foi buildada localmente), perigoso com registry remoto.

Correção para produção:
```yaml
image: seu-registry/sistema-gestao-hotel-backend:1.2.3   # tag imutável
imagePullPolicy: IfNotPresent   # OK com tag imutável
# ou
imagePullPolicy: Always   # sempre puxa da registry (garante atualização)
```

---

**[5] `backend.yaml:38-47` — `tcpSocket` como readiness probe não verifica saúde real da aplicação**

A probe só confirma que a porta TCP 3000 está aberta — o processo pode estar em estado de erro, travado no event loop ou com conexão ao banco caída, e a probe passa normalmente. Um `httpGet` para um endpoint `/health` seria muito mais confiável.

Correção (adicionar rota no Express + ajustar probe):
```javascript
// app.js — rota de health
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', uptime: process.uptime() });
});
```
```yaml
# backend.yaml
readinessProbe:
  httpGet:
    path: /health
    port: 3000
  initialDelaySeconds: 10
  periodSeconds: 10
  failureThreshold: 3
livenessProbe:
  httpGet:
    path: /health
    port: 3000
  initialDelaySeconds: 30
  periodSeconds: 20
  failureThreshold: 3
```

---

**[6] `backend.yaml` — Sem `PodDisruptionBudget`**

Com 3 réplicas, um `kubectl drain` de dois nós simultâneos pode matar todas as réplicas ao mesmo tempo. O PDB garante disponibilidade mínima durante manutenção.

```yaml
# novo arquivo: k8s/pdb.yaml
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: backend-pdb
  namespace: hotel-system
spec:
  minAvailable: 2          # sempre pelo menos 2 réplicas durante drenos
  selector:
    matchLabels:
      app: backend
```
Adicionar `- pdb.yaml` no `kustomization.yaml`.

---

**[7] `postgres.yaml` + `nginx.yaml` — Ausência de NetworkPolicy**

Qualquer pod no cluster (namespace `default` inclusive) pode conectar diretamente na porta 5432 do postgres. Não há isolamento de rede declarado.

```yaml
# novo arquivo: k8s/networkpolicy.yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: postgres-ingress
  namespace: hotel-system
spec:
  podSelector:
    matchLabels:
      app: postgres
  policyTypes:
    - Ingress
  ingress:
    - from:
        - podSelector:
            matchLabels:
              app: backend       # só o backend acessa o postgres
      ports:
        - protocol: TCP
          port: 5432
---
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: backend-ingress
  namespace: hotel-system
spec:
  podSelector:
    matchLabels:
      app: backend
  policyTypes:
    - Ingress
  ingress:
    - from:
        - podSelector:
            matchLabels:
              app: nginx         # só o nginx acessa o backend
      ports:
        - protocol: TCP
          port: 3000
```

---

**[8] `backend.yaml`, `postgres.yaml`, `nginx.yaml` — Sem `securityContext`**

Nenhum container define restrições de segurança. O postgres oficial roda como usuário `postgres` internamente, mas o K8s não está enforcement isso. O backend Node.js e o nginx rodam como root dentro do container.

```yaml
# Adicionar em cada container do backend e nginx:
securityContext:
  runAsNonRoot: true
  runAsUser: 1000          # UID não-root
  allowPrivilegeEscalation: false
  readOnlyRootFilesystem: true
  capabilities:
    drop:
      - ALL

# Para o nginx (precisa escrever em /tmp e /var/cache):
# Adicionar volumes temporários se readOnlyRootFilesystem: true
volumes:
  - name: nginx-tmp
    emptyDir: {}
  - name: nginx-cache
    emptyDir: {}
volumeMounts:
  - name: nginx-tmp
    mountPath: /tmp
  - name: nginx-cache
    mountPath: /var/cache/nginx
```

---

#### 🟢 Melhoria

**[9] `backend.yaml`, `postgres.yaml`, `nginx.yaml` — Labels mínimas (só `app`)**

Labels insuficientes dificultam filtragem, dashboards e políticas futuras.

```yaml
# template.metadata.labels em todos os deployments:
labels:
  app: backend
  version: "1.0.0"
  component: api
  part-of: hotel-pms
  managed-by: kustomize
```

---

**[10] `backend.yaml` — Sem annotations para Prometheus scraping**

```yaml
# template.metadata.annotations:
annotations:
  prometheus.io/scrape: "true"
  prometheus.io/port: "3000"
  prometheus.io/path: "/metrics"
```
Requer adicionar endpoint `/metrics` com `prom-client` no Express.

---

**[11] `nginx.yaml` — Config Nginx sem timeouts e sem upstream explícito**

```nginx
# nginx.yaml — default.conf melhorado:
upstream backend_pool {
  server backend:3000;
  keepalive 32;
}

server {
  listen 80;

  proxy_connect_timeout  5s;
  proxy_read_timeout     60s;
  proxy_send_timeout     60s;

  location /healthz {
    access_log off;
    return 200 "ok\n";
    add_header Content-Type text/plain;
  }

  location / {
    proxy_pass         http://backend_pool;
    proxy_http_version 1.1;
    proxy_set_header   Upgrade $http_upgrade;
    proxy_set_header   Connection "";
    proxy_set_header   Host              $host;
    proxy_set_header   X-Real-IP         $remote_addr;
    proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_set_header   X-Forwarded-Proto $scheme;
  }
}
```

---

**[12] `k8s/kustomization.yaml` — Namespace não centralizado no Kustomize**

Cada resource declara `namespace: hotel-system` individualmente. O Kustomize pode gerenciar isso centralmente, evitando divergência:

```yaml
# kustomization.yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
namespace: hotel-system      # centralizado aqui
resources:
  - namespace.yaml
  - configmap.yaml
  - secret.yaml
  - postgres.yaml
  - backend.yaml
  - nginx.yaml
```

---

**[13] `backend.yaml` — `terminationGracePeriodSeconds` ausente**

O Express precisa de tempo para drenar conexões HTTP abertas antes de morrer. O default de 30s pode ser insuficiente para requests longos.

```yaml
spec:
  terminationGracePeriodSeconds: 60
  containers:
    ...
```

---

**[14] `docker/kubernetes/deployment.yaml:21` — `nginx:alpine` sem versão pinada**

```yaml
# antes:
image: nginx:alpine

# depois:
image: nginx:1.27-alpine   # pinado, consistente com k8s/nginx.yaml
```

---

## O que está bem feito

- **Separação ConfigMap/Secret está correta**: valores não-sensíveis no ConfigMap, credenciais no Secret, referenciados com `configMapKeyRef`/`secretKeyRef` — padrão correto, não hardcoded nos containers.
- **PostgreSQL com probes `exec pg_isready`**: é exatamente o tipo certo de probe para banco — verifica se o processo aceita conexões SQL, não só se a porta TCP está aberta. Melhor escolha possível.
- **PVC com `ReadWriteOnce`**: correto para postgres single-node. `ReadWriteMany` seria errado aqui.
- **Nginx pinado em `nginx:1.27-alpine`**: tag de minor version em vez de `latest`, reproduzível.
- **Fluxo de rede correto**: Internet → LoadBalancer → ClusterIP nginx → ClusterIP backend → ClusterIP postgres. Nenhum serviço de infraestrutura exposto externamente.
- **`envFrom: configMapRef` no backend**: injeta todas as variáveis do ConfigMap de uma vez, limpo e sem repetição.
- **Lab 9 isolado**: `docker/kubernetes/` é independente de `k8s/` — o README deixa a separação clara, sem risco de um sobrescrever o outro.
- **Kustomize funcional**: ordem de recursos no `k8s/kustomization.yaml` respeita dependências (namespace antes dos namespaced resources).

---

## Roadmap para Produção (Priorizado)

| # | Ação | Esforço | Impacto |
|---|---|---|---|
| 1 | Remover credenciais do git + adotar Sealed Secrets ou External Secrets | Médio | Segurança crítica |
| 2 | Adicionar `resources.requests/limits` em todos os containers | Baixo | Estabilidade do cluster |
| 3 | Corrigir probe do Nginx para `/healthz` local | Baixo | Elimina cascata de falha |
| 4 | Adicionar `NetworkPolicy` isolando postgres e backend | Baixo | Segurança de rede |
| 5 | Adicionar `PodDisruptionBudget` para o backend | Baixo | Disponibilidade durante manutenção |
| 6 | `securityContext` com `runAsNonRoot` + drop capabilities | Médio | Hardening de container |
| 7 | Trocar `tcpSocket` por `httpGet /health` no backend | Baixo (requer rota no Express) | Detecção real de falha |
| 8 | Imagem do backend com tag imutável de CI/CD | Médio (pipeline CI) | Deploys reproduzíveis |
| 9 | Configurar TLS no Nginx (cert-manager + Let's Encrypt) | Alto | HTTPS obrigatório para SaaS |
| 10 | Adicionar `HorizontalPodAutoscaler` para backend | Médio | Escala automática sob carga |
| 11 | Prometheus annotations + `/metrics` endpoint | Médio | Observabilidade |
| 12 | `storageClassName` explícito no PVC | Baixo | Portabilidade entre clusters |
