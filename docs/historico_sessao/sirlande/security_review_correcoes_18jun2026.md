# Relatório de Sessão — Security Review e Correções de Vulnerabilidades

**Dev:** Sirlande
**Data:** 18/06/2026
**Branch:** `fix/security-vulnerabilities-18jun2026` → integrado em `develop`
**Tipo:** Security Review + Implementação de Correções

---

## 1. Objetivo da Sessão

Conduzir uma auditoria de segurança completa do sistema após levantamento de achados iniciais sobre secrets em arquivos rastreados pelo git. O escopo incluiu:

1. Identificação de arquivos adicionais com credenciais não mapeados
2. Verificação do `k8s/secret.yaml` para outros dados sensíveis
3. Análise de middlewares e controllers para exposição de variáveis de ambiente em respostas HTTP
4. Revisão geral de práticas de segurança: auth, isolamento de tenant, validação de entrada

---

## 2. Metodologia

**Research → Plan → Implement** conforme CLAUDE.md.

- Leitura de todos os controllers, middlewares e routers
- Busca por padrões com `grep -rn` em todos os tipos de arquivo rastreados
- Análise de fluxo de dados desde entrada HTTP até persistência
- Mapeamento de fronteiras de tenant isolation
- Verificação de state machines contra endpoints disponíveis

---

## 3. Achados de Segurança

### 3.1 Secrets em Arquivos Rastreados (pré-existentes, confirmados)

| Arquivo | Conteúdo | Status |
|---|---|---|
| `k8s/secret.yaml` | `POSTGRES_PASSWORD`, `JWT_SECRET` em plaintext | Confirmado — apenas esses 2 campos |
| `.env.test` | Credenciais reais (JWT_SECRET difere do k8s com sufixo `_tcc`) | Confirmado |
| `docker-compose.yml` | Fallbacks hardcoded nas duas linhas de env | Confirmado |
| `README.md:172` | `POSTGRES_PASSWORD=hotel_password` | Identificado nesta sessão |
| `tests/setup/globalSetup.js:17` | `'hotel_password'` como fallback hardcoded | Identificado nesta sessão |

**Nenhum controller ou middleware expõe `process.env` em respostas HTTP.** Todos os erros retornam mensagens genéricas. `console.error()` é server-side apenas.

### 3.2 Vulnerabilidades de Aplicação Identificadas e Corrigidas

#### [HIGH] Vuln 1 — Associação Cross-Tenant via `extra_room_ids`

**Arquivo:** `app/Controllers/ReservationApi/CreateReservationController.js`
**Descrição:** O `room_id` principal era validado com `tenant_id`, mas cada ID em `extra_room_ids` era inserido diretamente na tabela pivô sem nenhuma checagem de tenant. Um usuário autenticado no Tenant A poderia vincular quartos do Tenant B a uma reserva sua.
**Impacto:** Associação de dados cross-tenant na tabela `reservation_rooms`.
**Correção aplicada:** Cada `rid` em `extra_room_ids` é agora validado com `RoomModel.findOne({ where: { id: rid, tenant_id: tenantId } })` antes de criar a pivot row. Retorna 404 para qualquer ID inválido ou de outro tenant.
**Correção complementar (revisão Gabriel):** Toda a criação (reserva + pivot rows) foi envolvida em uma transação Sequelize para garantir atomicidade. Validação dos extra_room_ids movida para antes de qualquer escrita no banco.

#### [HIGH] Vuln 2 — `tenantMiddleware` Nunca Aplicado

**Arquivo:** `middlewares/tenant.middleware.js` (definido) + todos os routers (omitido)
**Descrição:** O `tenantMiddleware` verifica se o tenant existe e tem `status === 'ACTIVE'`, mas não estava registrado em nenhum router. Um tenant suspenso retinha acesso completo à API pelo tempo de vida do JWT (8 horas).
**Impacto:** Suspensão de tenant sem efeito operacional.
**Correção aplicada:** Todos os 6 routers autenticados agora usam `router.use(authMiddleware, tenantMiddleware)` como primeiro middleware.

**Routers corrigidos:**
- `routes/apis/reservationRouter.js`
- `routes/apis/roomRouter.js`
- `routes/apis/paymentRouter.js`
- `routes/apis/guestRouter.js`
- `routes/apis/userRouter.js`
- `routes/apis/roomCategoryRouter.js`

#### [MEDIUM] Vuln 3 — Login Cross-Tenant Sem Subdomain

**Status:** **Já corrigido em sessão anterior** (PR #23). O `LoginController.js` atual verifica `candidates.length > 1` e retorna 409 exigindo `subdomain`. Não foi necessária ação.

#### [MEDIUM] Vuln 4 — Manipulação de Valor Financeiro via PUT /reservations/:id

**Arquivo:** `app/Controllers/ReservationApi/UpdateReservationController.js`
**Descrição:** O campo `total_amount` era aceito do body do cliente e persistido sem validação. Qualquer usuário autenticado (incluindo RECEPTIONIST) podia manipular o valor financeiro.
**Correção aplicada:** `total_amount` removido dos campos atualizáveis. O valor é calculado pelo sistema na criação e não pode ser sobrescrito via PUT.

#### [MEDIUM] Vuln 5 — Bypass da State Machine de Quartos

**Arquivo:** `app/Controllers/RoomApi/UpdateRoomController.js`
**Descrição:** `PUT /rooms/:id` aceitava qualquer string como `status` sem validação, permitindo que um ADMIN definisse status inválidos ou revertesse quartos OCCUPIED para AVAILABLE sem executar check-out.
**Correção aplicada:** Allowlist explícita `VALID_ROOM_STATUSES = ['AVAILABLE', 'OCCUPIED', 'CLEANING', 'MAINTENANCE']`. Retorna 400 para status inválido.

---

## 4. Arquivos Modificados

| Arquivo | Vuln | Tipo de mudança |
|---|---|---|
| `app/Controllers/ReservationApi/CreateReservationController.js` | 1 | Validação de tenant em `extra_room_ids` + transação Sequelize |
| `app/Controllers/ReservationApi/UpdateReservationController.js` | 4 | Remoção de `total_amount` do body aceito |
| `app/Controllers/RoomApi/UpdateRoomController.js` | 5 | Allowlist de status |
| `routes/apis/reservationRouter.js` | 2 | `router.use(authMiddleware, tenantMiddleware)` |
| `routes/apis/roomRouter.js` | 2 | `router.use(authMiddleware, tenantMiddleware)` |
| `routes/apis/paymentRouter.js` | 2 | `paymentRouter.use(authMiddleware, tenantMiddleware)` |
| `routes/apis/guestRouter.js` | 2 | `router.use(authMiddleware, tenantMiddleware)` |
| `routes/apis/userRouter.js` | 2 | `router.use(authMiddleware, tenantMiddleware)` |
| `routes/apis/roomCategoryRouter.js` | 2 | `router.use(authMiddleware, tenantMiddleware)` |

---

## 5. O Que NÃO Foi Alterado (e Por Quê)

- **`k8s/secret.yaml`** — Rotação de credenciais está fora do escopo de código; requer decisão de operação
- **`.env.test`** — Ambiente de teste; mas deveria ser adicionado ao `.gitignore`
- **`authRouter`** — Não recebe `tenantMiddleware` intencionalmente: `/auth/login` e `/auth/register` são endpoints públicos

---

## 6. Pendências para o Próximo Dev

### Alta Prioridade

1. **Rotacionar credenciais expostas no histórico git remoto**
   - `POSTGRES_PASSWORD=hotel_password` e `JWT_SECRET=pms_hotel_secreto_academico_2026` estão em commits públicos
   - Ação: gerar novas credenciais e atualizar `k8s/secret.yaml`, `.env.test`, `docker-compose.yml`

2. **Adicionar `.env.test` ao `.gitignore`**
   - Atualmente rastreado pelo git

3. **Verificar suite de testes com `tenantMiddleware` ativo**
   - O `tenantMiddleware` agora faz SELECT no banco a cada request autenticada
   - Verificar se o tenant seedado em `tests/setup/globalSetup.js` tem `status: 'ACTIVE'`

### Média Prioridade

4. **Restringir acesso a pagamentos por role**
   - `paymentRouter` sem `requireRole` para PUT e DELETE — qualquer RECEPTIONIST pode manipular pagamentos

5. **Substituir `stringData` por `data` em `k8s/secret.yaml`**
   - `stringData` armazena em plaintext; `data` usa base64

---

*Relatório: Sirlande (sessão 18/06/2026) + revisão Gabriel (19/06/2026)*
