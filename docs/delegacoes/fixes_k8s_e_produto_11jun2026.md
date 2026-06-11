# Delegação — Fixes K8s + Gaps Críticos de Produto
**Data:** 11/06/2026
**Orquestrador:** Gabriel
**Para:** Agente de implementação (outra janela Claude Code)
**Status:** 🔴 Pendente

---

## Instruções iniciais obrigatórias

1. Leia `CLAUDE.md` na raiz do projeto
2. Leia `docs/historico_sessao/gabriel/revisao_kubernetes.md` (revisão K8s completa)
3. Execute as 3 tarefas abaixo **em ordem**, cada uma em branch separada
4. Ao final: `git push origin develop` + relatório de sessão

---

## Contexto do produto

Sistema de gestão de hotel SaaS multi-tenant.
Usuário direto: recepcionista e administrador de hotel.
Stack: Node.js 24, Express 4, Sequelize 6, PostgreSQL 17.
**ESM obrigatório — `import`/`export`, nunca `require()`.**
`tenant_id` obrigatório em toda query ao banco.

### O que já foi feito nesta sessão (não refaça)

- `k8s/backend.yaml` — probes já usam `httpGet /health` ✅
- `k8s/nginx.yaml` — probes já usam `/healthz` local + location /healthz no ConfigMap ✅
- `.gitattributes` criado na raiz (normalização CRLF→LF) ✅

---

## TAREFA 1 — K8s hardening

**Branch:** `fix/k8s-hardening`
**Base:** `develop`
**Referência:** findings [3][6][7][11][12][13][14] em `docs/historico_sessao/gabriel/revisao_kubernetes.md`

> Não implemente os findings [1] (secrets), [4] (image tag CI/CD) nem [8] (securityContext).
> Esses são decisões arquiteturais fora do escopo desta sessão.

### [3] Resource limits — backend, nginx, postgres

Adicione `resources` em cada Deployment. Verifique o que já existe em `k8s/postgres.yaml`
antes de sobrescrever.

```yaml
# k8s/backend.yaml — dentro do container backend
resources:
  requests:
    cpu: "100m"
    memory: "128Mi"
  limits:
    cpu: "500m"
    memory: "512Mi"

# k8s/nginx.yaml — dentro do container nginx
resources:
  requests:
    cpu: "50m"
    memory: "64Mi"
  limits:
    cpu: "200m"
    memory: "128Mi"

# k8s/postgres.yaml — dentro do container postgres (complete se incompleto)
resources:
  requests:
    cpu: "250m"
    memory: "256Mi"
  limits:
    cpu: "1000m"
    memory: "1Gi"
```

### [6] PodDisruptionBudget — novo arquivo k8s/pdb.yaml

```yaml
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: backend-pdb
  namespace: hotel-system
spec:
  minAvailable: 2
  selector:
    matchLabels:
      app: backend
```

### [7] NetworkPolicy — novo arquivo k8s/networkpolicy.yaml

```yaml
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
              app: backend
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
              app: nginx
      ports:
        - protocol: TCP
          port: 3000
```

### [11] Nginx ConfigMap melhorado

Substitua o conteúdo de `default.conf` no ConfigMap de `k8s/nginx.yaml`.
Mantenha o `location /healthz` que já existe e adicione upstream e timeouts:

```nginx
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
    proxy_set_header   Upgrade     $http_upgrade;
    proxy_set_header   Connection  "";
    proxy_set_header   Host              $host;
    proxy_set_header   X-Real-IP         $remote_addr;
    proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_set_header   X-Forwarded-Proto $scheme;
  }
}
```

### [12] Centralizar namespace no kustomization.yaml

Adicione `namespace: hotel-system` diretamente em `k8s/kustomization.yaml`.
Isso não conflita com o `namespace.yaml` — aquele define o *recurso* Namespace,
este instrui o Kustomize a injetar o namespace em todos os outros recursos.

```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
namespace: hotel-system
resources:
  - namespace.yaml
  - configmap.yaml
  - secret.yaml
  - postgres.yaml
  - backend.yaml
  - nginx.yaml
  - pdb.yaml
  - networkpolicy.yaml
```

### [13] terminationGracePeriodSeconds no backend

No `k8s/backend.yaml`, dentro de `spec.template.spec`, adicione:

```yaml
terminationGracePeriodSeconds: 60
```

### [14] Pin versão nginx no Lab 9

Em `docker/kubernetes/deployment.yaml`, troque:
```yaml
image: nginx:alpine
```
por:
```yaml
image: nginx:1.27-alpine
```

### Critérios de aceite — TAREFA 1

- [ ] `kubectl kustomize k8s` roda sem erros após as mudanças
- [ ] `k8s/backend.yaml` e `k8s/nginx.yaml` têm `resources.limits` definidos
- [ ] `k8s/postgres.yaml` tem `resources.limits` definidos
- [ ] `k8s/pdb.yaml` existe e está em `kustomization.yaml`
- [ ] `k8s/networkpolicy.yaml` existe e está em `kustomization.yaml`
- [ ] ConfigMap do nginx tem `upstream backend_pool` e os 3 timeouts
- [ ] `docker/kubernetes/deployment.yaml` usa `nginx:1.27-alpine`

**Commit:**
```
fix(k8s): hardening — resource limits, PDB, NetworkPolicy e nginx upstream

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
```

---

## TAREFA 2 — Cálculo automático de total_amount

**Branch:** `fix/reservation-price-calculation`
**Base:** `develop`

### Problema

`app/Controllers/ReservationApi/CreateReservationController.js` aceita qualquer
`total_amount` enviado pelo cliente — inclusive 0. O hotel perde receita se a
recepcionista digitar errado. O sistema já tem todos os dados para calcular:
`RoomCategoryModel.price_per_night` × número de noites.

### Leia antes de implementar

```
app/Controllers/ReservationApi/CreateReservationController.js  (estado atual)
app/Models/RoomModel.js                                         (tem category_id)
app/Models/RoomCategoryModel.js                                 (tem price_per_night)
```

Verifique se já existe associação `BelongsTo` entre `RoomModel` e `RoomCategoryModel`
procurando por `.belongsTo` ou `.hasMany` nos dois arquivos e em
`database/connections/sequelize.js`.

### Implementação

**Passo 1 — Garantir a associação no RoomModel**

Se não existir, adicione ao final de `app/Models/RoomModel.js` (antes do `export`):

```js
import RoomCategoryModel from './RoomCategoryModel.js';
RoomModel.belongsTo(RoomCategoryModel, { foreignKey: 'category_id', as: 'category' });
```

**Passo 2 — Modificar CreateReservationController**

Remova `total_amount` do destructuring do body.
Após a validação de `room_id`, busque o quarto **com sua categoria**:

```js
import RoomCategoryModel from '../../Models/RoomCategoryModel.js';

const room = await RoomModel.findOne({
    where: { id: room_id, tenant_id: tenantId },
    include: [{ model: RoomCategoryModel, as: 'category' }]
});
if (!room) return response.status(404).json({ error: 'Quarto não encontrado' });

if (!room.category?.price_per_night) {
    return response.status(422).json({
        error: 'Categoria do quarto não possui preço definido'
    });
}

const checkIn  = new Date(check_in_date);
const checkOut = new Date(check_out_date);
const nights = Math.ceil((checkOut - checkIn) / (1000 * 60 * 60 * 24));
const total_amount = parseFloat(room.category.price_per_night) * nights;
```

Use `total_amount` calculado na chamada `ReservationModel.create(...)`.

### Critérios de aceite

- [ ] `POST /reservations` sem `total_amount` no body → criado com valor calculado
- [ ] `POST /reservations` com `total_amount: 0` no body → ignora, usa calculado
- [ ] Reserva de 3 noites × R$150/noite → `total_amount: 450` na resposta
- [ ] Quarto sem categoria com preço → 422 com mensagem clara
- [ ] Tenant isolation mantida (room buscado com `tenant_id`)
- [ ] Conflict check continua funcionando (não quebrar o existente)

**Commit:**
```
fix(reservations): calcular total_amount automaticamente via price_per_night × noites

Remove dependência do valor enviado pelo cliente.
Sistema calcula com base na categoria do quarto e número de noites.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
```

---

## TAREFA 3 — Status de quartos extras no check-in/check-out

**Branch:** `fix/checkin-extra-rooms-status`
**Base:** `develop`

### Problema

Reservas podem ter 1 quarto principal (`reservation.room_id`) + quartos extras
(tabela `reservation_rooms`). Hoje `CheckInController` e `CheckOutController` só
atualizam o quarto principal. Os extras ficam `AVAILABLE` no dashboard enquanto têm
hóspede — a recepcionista não sabe quais estão ocupados.

### Leia antes de implementar

```
app/Controllers/ReservationApi/CheckInController.js   (estado atual)
app/Controllers/ReservationApi/CheckOutController.js  (estado atual)
app/Models/ReservationRoomModel.js                    (tem reservation_id e room_id)
```

### Implementação — CheckInController

Dentro da transaction existente, após salvar o quarto principal, adicione:

```js
import ReservationRoomModel from '../../Models/ReservationRoomModel.js';

// dentro de sequelize.transaction(async (t) => { ... })

// quartos extras da pivot (exclui o principal para não duplicar update)
const pivotRows = await ReservationRoomModel.findAll({
    where: { reservation_id: reservation.id }
});
const extraRoomIds = pivotRows
    .map(r => r.room_id)
    .filter(id => id !== reservation.room_id);

if (extraRoomIds.length > 0) {
    await RoomModel.update(
        { status: 'OCCUPIED' },
        { where: { id: extraRoomIds, tenant_id: tenantId }, transaction: t }
    );
}
```

### Implementação — CheckOutController

Mesma estrutura, mas com `status: 'CLEANING'` nos extras.

### Critérios de aceite

- [ ] Reserva com 1 quarto (sem extras): comportamento idêntico ao atual
- [ ] Reserva com quarto principal + 2 extras: check-in → todos os 3 ficam `OCCUPIED`
- [ ] Reserva com quarto principal + 2 extras: check-out → todos os 3 ficam `CLEANING`
- [ ] Tudo dentro da mesma transaction (falha em qualquer um faz rollback completo)
- [ ] `tenant_id` passado no `RoomModel.update` (tenant isolation)

**Commit:**
```
fix(reservations): check-in e check-out atualizam status de todos os quartos da reserva

Quartos extras em reservation_rooms agora recebem OCCUPIED/CLEANING
junto com o quarto principal, mantendo o dashboard consistente.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
```

---

## Output obrigatório ao finalizar

```
[ ] Branch fix/k8s-hardening mergeada em develop
[ ] Branch fix/reservation-price-calculation mergeada em develop
[ ] Branch fix/checkin-extra-rooms-status mergeada em develop
[ ] git push origin develop
[ ] Relatório de sessão criado em:
    docs/historico_sessao/gabriel/fixes_k8s_e_produto_11jun2026.md
    (use o template de CODING_STANDARDS.md — seção "Relatório de Sessão")
[ ] Marcar este arquivo como concluído: altere "Status: 🔴 Pendente" para "Status: ✅ Concluído"
```
