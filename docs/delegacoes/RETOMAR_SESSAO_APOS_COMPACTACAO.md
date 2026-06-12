# Prompt de Retomada de Sessão — Após Compactação de Contexto
**Criado em:** 11/06/2026
**Para:** Claude Code (próxima janela ou após compactação)
**Projeto:** Sistema de Gestão de Hotel — SaaS Multi-Tenant (CorePMS)

> Cole este arquivo inteiro como primeira mensagem após compactar.
> O agente deve ler, confirmar o entendimento e continuar de onde parou.

---

## 1. Quem você é nesta sessão

Você é um **dev senior full-stack** atuando no projeto CorePMS.
Seu papel é **implementador + orquestrador**: você lê o contexto, executa as tarefas pendentes na ordem certa, segue os padrões do projeto e documenta o que faz.

Antes de qualquer ação, responda:
- O que está pendente?
- Qual é o próximo passo exato?
- Existe algum bloqueador?

---

## 2. O Produto

**CorePMS** — SaaS multi-tenant para gerenciamento hoteleiro (PMS).
Público-alvo: pousadas e hotéis no Brasil (5–80 quartos) que usam Excel.
Concorrentes: Cloudbeds, Little Hotelier, Hits Hotel.

**Modelo de negócio:** planos mensais (FREE / BÁSICO R$299-499 / PREMIUM R$799-1.299).

---

## 3. Stack Técnico (não negociável)

| Camada | Tecnologia |
|--------|-----------|
| Runtime | Node.js 24 |
| Framework | Express.js 4 — **ESModules obrigatório** (`import`/`export`, NUNCA `require()`) |
| ORM | Sequelize 6 + PostgreSQL 17 |
| Auth | JWT stateless `{ userId, role, tenantId }` + bcryptjs |
| API Docs | Swagger UI em `/api-docs` |
| Infra dev | Docker Compose |
| Infra staging | Docker Swarm |
| Infra prod | Kubernetes (`k8s/`) |

---

## 4. Arquitetura Multi-Tenant (regra crítica)

- Cada hotel = 1 registro na tabela **`tenants`** (tableName: 'tenants' — IMUTÁVEL)
- `tenant_id` obrigatório em **TODAS** as tabelas e queries de negócio
- JWT carrega `{ userId, role, tenantId }` — middleware injeta `request.tenantId`
- Isolamento: toda query filtra por `tenant_id`. Nunca retornar dados de outro tenant.

**8 tabelas core:**
`tenants` → `users` → `room_categories` → `rooms` → `guests` → `reservations` → `reservation_rooms` (pivô N:N) → `payments`

**Máquina de estados das reservas:**
```
PENDING → CONFIRMED → CHECKED_IN → CHECKED_OUT
PENDING ou CONFIRMED → CANCELLED (único caminho de cancelamento)
```
Check-in: `room.status = OCCUPIED` | Check-out: `room.status = CLEANING`

---

## 5. Estrutura de pastas

```
app/
  Controllers/          → Single-Action Controllers (1 arquivo por operação)
    AuthApi/            → Register, Login
    GuestApi/           → CRUD hóspedes
    RoomApi/            → CRUD quartos + ListAvailable
    ReservationApi/     → CRUD + CheckIn + CheckOut + Cancel
    PaymentApi/         → Create, List
  Models/               → Sequelize models (1 arquivo por entidade)
  utils/                → checkReservationConflict.js
routes/
  apis/                 → roomRouter.js, reservationRouter.js, guestRouter.js...
  router.js             → monta tudo + /health
database/
  connections/          → sequelize.js (singleton)
  relations.js          → TODAS as associações centralizadas aqui
middlewares/            → auth.middleware.js, tenant.middleware.js, role.middleware.js
k8s/                    → manifests Kubernetes completos
docs/
  CODING_STANDARDS.md
  PRODUCT_ROADMAP.md
  historico_sessao/gabriel/
```

---

## 6. Padrões de Código Obrigatórios

### Metodologia: RPI (Research → Plan → Implement)

**Toda tarefa segue exatamente estas 3 etapas. Nunca pule.**

**R — Research:** Antes de qualquer coisa:
1. Leia os arquivos relacionados (`Controllers`, `Models`, `routes`)
2. Verifique se já existe código similar em `app/utils/`
3. Verifique o impacto nos outros módulos (tenant isolation, transactions, state machine)

**P — Plan:** Defina:
- Critérios de aceite (happy path + erros)
- Arquivos a criar/modificar
- Ordem de execução
- Branch e commits planejados

**I — Implement:** Siga o plano. Commits lógicos separados. Nunca mega-commit.

---

### SOLID aplicado ao projeto

| Princípio | Como se aplica aqui |
|-----------|---------------------|
| **S** — Single Responsibility | 1 controller por operação (`CreateRoomController.js`, não `RoomController.js`) |
| **O** — Open/Closed | Novas regras de negócio via novos controllers/utils, sem modificar os existentes |
| **L** — Liskov | Middlewares têm contrato fixo: `(req, res, next)` — nunca alterar a assinatura |
| **I** — Interface Segregation | `requireRole('ADMIN')` em vez de middleware genérico que faz tudo |
| **D** — Dependency Inversion | Controllers dependem de Models (abstração), não de SQL direto |

---

### DRY — Don't Repeat Yourself

- Lógica de conflito de reservas → `app/utils/checkReservationConflict.js` (já existe, reutilize)
- Associações entre models → `database/relations.js` (único lugar)
- Paginação → padrão `{ page, limit, total, next, data }` (copie de `ListRoomController.js`)
- Se escrever a mesma lógica em 2 controllers → mova para `app/utils/`

---

### KISS — Keep It Simple

- 1 controller = 1 operação = 1 arquivo
- Sem abstrações para uso futuro hipotético
- Sem over-engineering: CRUD simples não precisa de Service Layer
- Nomes auto-explicativos: `CreateReservationController`, `checkReservationConflict`
- Máximo 3 níveis de indentação
- Se não consegue explicar o código em 1 frase → está complexo demais

---

### Controller Padrão

```js
// app/Controllers/[Domain]Api/[Action]Controller.js
import ModelXxx from '../../Models/XxxModel.js';

export default async function ActionController(request, response) {
    try {
        const tenantId = request.user.tenantId;  // SEMPRE do middleware
        const { param1, param2 } = request.body;

        // 1. Validação
        const errors = [];
        if (!param1) errors.push('param1 obrigatório');
        if (errors.length) return response.status(400).json({ errors });

        // 2. Busca com tenant isolation
        const record = await ModelXxx.findOne({
            where: { id: request.params.id, tenant_id: tenantId }
        });
        if (!record) return response.status(404).json({ error: 'Não encontrado' });

        // 3. Regra de negócio

        // 4. Persistência (transaction se atualizar 2+ tabelas)

        return response.status(200).json(record);
    } catch (error) {
        console.error('ActionController:', error);
        return response.status(500).json({ error: 'Erro interno do servidor' });
    }
}
```

### Transação Sequelize (obrigatória para 2+ tabelas)

```js
import sequelize from '../../../database/connections/sequelize.js';

await sequelize.transaction(async (t) => {
    await ModelA.update({ ... }, { where: { ... }, transaction: t });
    await ModelB.update({ ... }, { where: { ... }, transaction: t });
});
```

### HTTP Status codes

| Código | Quando usar |
|--------|------------|
| 200 | GET por ID, PUT (atualização), listagem |
| 201 | POST (criação) |
| 204 | DELETE (soft delete) |
| 400 | Campos obrigatórios ausentes, validação |
| 401 | JWT ausente/inválido |
| 403 | Role sem permissão, tenant suspenso |
| 404 | Registro não encontrado |
| 409 | UniqueConstraintError |
| 422 | Regra de negócio violada (ex: check-in em reserva CANCELLED) |
| 500 | Erro inesperado |

---

### Regras Git/GitHub

```
Branches: feature/<nome>, fix/<nome>, docs/<nome>, refactor/<nome>
Flow: branch → develop → (PR) → main
Commits: Conventional Commits — feat(scope): descrição | fix(scope): descrição
NUNCA: commit direto em main/develop | mega-commit | --no-verify | --force em main
SEMPRE: git pull origin develop antes de criar branch | push + relatório ao fechar sessão
```

### Relatório de Sessão (obrigatório ao finalizar)

Local: `docs/historico_sessao/gabriel/<titulo>_<ddMMyyyy>.md`
Commit: `docs(historico): add session report <titulo> (gabriel)`

Template mínimo:
```markdown
### YYYY-MM-DD — Gabriel
- Branch, Horário, Objetivo
#### O que foi feito (tabela)
#### Commits gerados (hash + mensagem)
#### Pendências (🔴/🟡/🟢 com contexto para o próximo dev)
```

---

## 7. Bug Crítico Conhecido — TenantModel.js

**NUNCA alterar** `app/Models/TenantModel.js` `tableName` sem revisar os outros 6 models.

O PR #8 (08/06/2026) trocou `tableName: 'tenants'` por `tableName: 'hotels'`, quebrando todas as migrations. O fix foi mergeado em develop no commit `f5312af` em 11/06/2026.

**Regra derivada:** `db/schema.sql` é documentação auxiliar. A fonte de verdade é o Sequelize. Se há conflito entre SQL manual e Models, o SQL está errado.

Hierarquia de autoridade do banco:
1. `app/Models/*.js` + `database/relations.js`
2. `node command.js migrate`
3. `db/schema.sql`
4. `seed/seed_hotels.sql`

---

## 8. O Que Estava Sendo Feito (estado exato ao compactar)

### Tarefa em andamento: `docs/delegacoes/teste_ambiente_completo_k8s_11jun2026.md`

**Status da delegação:** 🔴 Pendente — interrompida na Fase 1, após o fix do TenantModel

### O que já foi concluído ANTES desta delegação (develop está atualizado):

| Entrega | Commit | Status |
|---------|--------|--------|
| K8s hardening (resource limits, PDB, NetworkPolicy, nginx upstream) | `5d97c11` | ✅ |
| `total_amount` calculado automaticamente (price × noites) | `a70e9a0` | ✅ |
| Check-in/out propaga status para quartos extras em reservation_rooms | `b58788c` | ✅ |
| Merge fix/reverter-danos-pr8 (TenantModel tableName corrigido) | `f5312af` | ✅ |

### Estado do ambiente Kubernetes no momento da interrupção:

```
Minikube:     rodando (minikube start --driver=docker)
Namespace:    hotel-system
Pods:         backend x3 (1/1), nginx x1 (1/1), postgres x1 (1/1) — MAS backend com imagem ANTIGA
Port-forward: pode ter sido perdido (verificar)
Imagem:       sistema-gestao-hotel-backend:latest foi rebuildada com o fix
              e carregada com minikube image load — MAS rollout restart NÃO foi executado
Migration:    NÃO executada — banco tem tabela 'hotels' órfã (schema legado)
```

---

## 9. Próxima Ação — Sequência Exata para Continuar

```bash
# PASSO 1 — Verificar estado do Minikube
minikube status
kubectl get pods -n hotel-system

# PASSO 2 — Restartar backend com imagem corrigida
kubectl rollout restart deployment/backend -n hotel-system
kubectl rollout status deployment/backend -n hotel-system --timeout=90s

# PASSO 3 — Reativar port-forward se necessário
kubectl port-forward svc/nginx 8080:80 -n hotel-system &
export BASE_URL="http://localhost:8080"

# PASSO 4 — Limpar tabela 'hotels' órfã e rodar migration
POSTGRES_POD=$(kubectl get pods -n hotel-system -l app=postgres -o jsonpath='{.items[0].metadata.name}')
kubectl exec -n hotel-system $POSTGRES_POD -- \
  psql -U hotel_user -d gestao_hotel -c "DROP TABLE IF EXISTS hotels CASCADE;"

BACKEND_POD=$(kubectl get pods -n hotel-system -l app=backend -o jsonpath='{.items[0].metadata.name}')
kubectl exec -n hotel-system $BACKEND_POD -- node command.js migrate

# PASSO 5 — Verificar health
curl -s $BASE_URL/health | python3 -m json.tool
# Esperado: {"status":"OK","timestamp":"...","service":"..."}

# PASSO 6 — Executar todos os testes T01–T20 + K8s-1 a K8s-4
# (conforme a delegação: docs/delegacoes/teste_ambiente_completo_k8s_11jun2026.md)
```

**Se o Minikube não estiver mais rodando** (foi reiniciado ou parou):
```bash
minikube start --driver=docker
docker build -t sistema-gestao-hotel-backend:latest .
minikube image load sistema-gestao-hotel-backend:latest
kubectl apply -k k8s
kubectl wait --for=condition=ready pod --all -n hotel-system --timeout=300s
# depois continuar do PASSO 3
```

---

## 10. Output Obrigatório ao Finalizar Esta Sessão

```
[ ] Testes T01–T20 executados e tabela de resultados preenchida
[ ] Validações K8s-1 a K8s-4 executadas
[ ] docs/delegacoes/teste_ambiente_completo_k8s_11jun2026.md atualizado:
    → tabela de resultados preenchida (✅/❌ com observações)
    → Status alterado para ✅ Concluído (ou ⚠️ Parcial se houver falhas)
[ ] Relatório de sessão criado:
    docs/historico_sessao/gabriel/testes_k8s_ambiente_completo_11jun2026.md
    (ATUALIZAR o arquivo parcial já existente com os resultados reais)
[ ] Para cada ❌: pendência registrada com causa raiz
[ ] git add + commit + git push origin develop
```

**Commit do relatório:**
```
docs(testes): resultados do teste de ambiente completo K8s

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
```

---

## 11. Referências Rápidas

| Documento | O que tem |
|-----------|-----------|
| `CLAUDE.md` | Regras de orquestração, metodologia RPI, templates de prompt |
| `docs/CODING_STANDARDS.md` | SOLID/DRY/KISS com exemplos + template de relatório |
| `docs/PRODUCT_ROADMAP.md` | Fases: Demo 38% → TCC 65% → Produto 95% |
| `docs/historico_sessao/gabriel/REVIEW_PR8_08JUN2026.md` | Bug do TenantModel, causa raiz, lições |
| `docs/historico_sessao/gabriel/testes_k8s_ambiente_completo_11jun2026.md` | Relatório parcial desta sessão |
| `docs/delegacoes/teste_ambiente_completo_k8s_11jun2026.md` | Delegação com os 20 testes + critérios |
| `k8s/` | Manifests Kubernetes completos (pós-hardening) |
