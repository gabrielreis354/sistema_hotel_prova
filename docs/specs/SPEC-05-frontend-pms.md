# SPEC-05 — Frontend `app-pms`

**Prioridade:** 🟠 Alta — é o que a banca vê funcionando
**Estado:** 🟡 Parcialmente implementado — Fase 0 completa, Fase 1 ~20%
**Criado em:** 26/08/2026
**Depende de:** SPEC-04 (para a Fase 2)

---

## 1. Contexto

Interface web do PMS. O plano completo está em `docs/frontend/PLANEJAMENTO_FRONTEND.md` — esta Spec **não o substitui**, apenas registra o estado real e organiza o que falta em tarefas executáveis.

### 1.1 Estado real, verificado no código em 26/08

**Fase 0 — Fundação: ✅ completa e mergeada**

Monorepo pnpm + Turborepo com `apps/{pms,booking,admin}` e `packages/{ui,api-client,domain,config}`. Design system com tokens de status, dinheiro em centavos inteiros, datas ancoradas em `America/Sao_Paulo`, máquinas de estado em allowlist, cliente tipado gerado do OpenAPI, login e roteamento por papel.

**Fase 1 — Recepção: 🟡 ~20%**

Verificado em `frontend/apps/pms/src/App.tsx`:

| Rota | Estado real |
|------|-------------|
| `/login` | ✅ Implementada |
| `/hospedes` · `/novo` · `/:id` · `/:id/editar` | ✅ Implementadas — CRUD com busca e ficha de histórico |
| `/` (Hoje) | 🔲 **`<Placeholder title="Hoje" />`** |
| `/reservas` | 🔲 **`<Placeholder title="Reservas" />`** |
| `/comanda` | 🔲 **`<Placeholder title="Comanda" />`** |
| `/config/usuarios` | 🔲 **`<Placeholder title="Usuários" />`** |

Não existem telas de quartos, categorias, check-in/out, rack, financeiro, analytics nem B2B.

---

## 2. Objetivo

Completar a interface do PMS até o nível de demonstração ao vivo na defesa, cobrindo o fluxo operacional de recepção e a comanda do garçom.

---

## 3. Decisões já tomadas (não reabrir)

| Decisão | Escolha |
|---------|---------|
| Stack | React 19 + TypeScript + Vite + Tailwind, monorepo pnpm + Turborepo |
| Responsividade | Mobile-first, **exceto** rack e analytics — layout de desktop dedicado |
| Rack no mobile | Componente **separado** (agenda do dia), não o grid espremido |
| Dinheiro | Centavos inteiros; `DECIMAL` chega como **string** do `pg`, nunca `Number()` |
| Datas | `America/Sao_Paulo` fixo via `@hotel/domain` |
| Cortesia | Preço riscado com rótulo, somando zero |
| Integração em dev | Proxy do Vite — CORS não bloqueia desenvolvimento |

---

## 4. Tarefas

### T-05.1 — Completar a Fase 1: quartos e categorias 🔲 *(~3 dias)*

Endpoints já existem: `/rooms`, `/room-categories`.

**Critérios de aceitação**
- [ ] **CA-05.1.a** — CRUD de categorias com capacidade e tarifa
- [ ] **CA-05.1.b** — CRUD de quartos com número, andar, categoria e status
- [ ] **CA-05.1.c** — Status do quarto exibido com **cor + rótulo**, nunca só cor
- [ ] **CA-05.1.d** — Escrita restrita a `ADMIN`, refletindo o backend
- [ ] **CA-05.1.e** — Estados de carregamento, vazio e erro em todas as telas
- [ ] **CA-05.1.f** — Alvo de toque ≥ 48px nas ações usadas em mobile

---

### T-05.2 — Reservas e check-in/out 🔲 *(~4 dias)*

Endpoints já existem, incluindo `?from=&to=` e paginação (Fatia 0).

**Critérios de aceitação**
- [ ] **CA-05.2.a** — Lista de reservas com filtro por período e paginação
- [ ] **CA-05.2.b** — Detalhe da reserva com hóspede, quarto, período e valores
- [ ] **CA-05.2.c** — Criação de reserva usando `GET /rooms/available`
- [ ] **CA-05.2.d** — Ações de check-in, check-out e cancelar, respeitando a máquina de estados
- [ ] **CA-05.2.e** — Ação indisponível fica **desabilitada com motivo**, não some
- [ ] **CA-05.2.f** — Conta da reserva (`/bill`) exibida no check-out
- [ ] **CA-05.2.g** — Valores formatados via `@hotel/domain`, sem `Number()` direto

---

### T-05.3 — Painel "Hoje" 🔲 *(~2 dias)*

**DEP:** T-05.2

Tela inicial da recepção. Substitui o placeholder.

**Critérios de aceitação**
- [ ] **CA-05.3.a** — Chegadas, saídas e hóspedes na casa, do dia
- [ ] **CA-05.3.b** — Ação direta de check-in/out a partir da lista
- [ ] **CA-05.3.c** — Alertas relevantes (`/analytics/alerts`)
- [ ] **CA-05.3.d** — Funciona bem no celular — é a tela que o gerente abre andando

---

### T-05.4 — Rack de reservas 🔲 *(~5 dias)* — tela mais complexa

**DEP:** T-05.2

**Critérios de aceitação**
- [ ] **CA-05.4.a** — Desktop: grid quartos × dias, com scroll horizontal virtualizado
- [ ] **CA-05.4.b** — Mobile: **componente separado** — agenda do dia, não o grid espremido
- [ ] **CA-05.4.c** — Cores de status com rótulo acessível
- [ ] **CA-05.4.d** — Consome `?from=&to=`, sem baixar o tenant inteiro
- [ ] **CA-05.4.e** — Clicar numa reserva abre o detalhe
- [ ] **CA-05.4.f** — Navegável por teclado — recepcionista é usuário de teclado

> Deixada por último **de propósito**: as telas anteriores validam design system, cliente de API, formulários e estados de erro com risco baixo. Se algo estiver errado, aparece antes do rack.

---

### T-05.5 — Comanda do garçom 🔲 *(~4 dias)*

**DEP:** ⛔ **SPEC-04 T-04.3** (endpoints `/accounts` e `/products`)

**Critérios de aceitação**
- [ ] **CA-05.5.a** — Tela inicial do garçom **é** a lista de contas abertas, sem tela intermediária
- [ ] **CA-05.5.b** — Cardápio em grade, categorias como chips, preço visível
- [ ] **CA-05.5.c** — Um toque no produto lança quantidade 1; quantidade só se diferente
- [ ] **CA-05.5.d** — Rodapé fixo com total da conta
- [ ] **CA-05.5.e** — **Fila offline** com `client_item_id` — reconexão não duplica
- [ ] **CA-05.5.f** — Confirmação otimista; erro de rede não aparece como falha
- [ ] **CA-05.5.g** — **Desfazer** em vez de diálogo de confirmação
- [ ] **CA-05.5.h** — Cortesia exibida com **preço riscado e rótulo**, somando zero
- [ ] **CA-05.5.i** — Alvo ≥ 48px; ações na metade inferior — uso com uma mão
- [ ] **CA-05.5.j** — `WAITER` não vê nada além da comanda

> **Critério de aceite do módulo:** se for mais lento que a comanda de papel, falhou.

---

### T-05.6 — Financeiro e analytics 🔲 *(~3 dias)*

Endpoints já existem (7 de analytics + `/payments`).

**Critérios de aceitação**
- [ ] **CA-05.6.a** — Registro e listagem de pagamentos
- [ ] **CA-05.6.b** — Telas de ocupação, receita, sazonalidade e ranking
- [ ] **CA-05.6.c** — Desktop: gráficos; **mobile: 4 números do dia em cartões**
- [ ] **CA-05.6.d** — Relatório de cortesias e perdas (depende de SPEC-04 T-04.7)

---

### T-05.7 — Grupos (B2B) 🔲 *(~3 dias)*

Endpoints já existem.

**Critérios de aceitação**
- [ ] **CA-05.7.a** — CRUD de clientes corporativos
- [ ] **CA-05.7.b** — Orçamentos com serviços e download de PDF
- [ ] **CA-05.7.c** — Contratos com parcelas, assinatura e cancelamento
- [ ] **CA-05.7.d** — Baixa de parcela

---

### T-05.8 — Configurações 🔲 *(~2 dias)*

**Critérios de aceitação**
- [ ] **CA-05.8.a** — CRUD de usuários com papel (substitui o placeholder)
- [ ] **CA-05.8.b** — Dados do hotel (`/tenants/me`), incluindo `booking_enabled` e `deposit_percent`
- [ ] **CA-05.8.c** — Cardápio de produtos

---

## 5. Ressalvas de auditoria ainda abertas

Do `qa-redteam` nas Fases 0 e 1:

| Ressalva | Estado |
|----------|--------|
| Swagger sem schema de resposta em **79%** dos endpoints 2xx — força `as unknown as` no cliente "tipado" | 🔲 Ver **SPEC-06 T-06.2** |
| Ficha do hóspede baixa **todas** as reservas do tenant e filtra no cliente | 🔲 Resolver com `?guest_id=` no backend, ou `staleTime` + cache compartilhado |
| `StatusBadge` só cobre status de quarto; reserva ficará sem | 🔲 Generalizar antes da T-05.2 |

---

## 6. Definition of Done

- [ ] Nenhum `<Placeholder>` restante nas rotas principais
- [ ] Fluxo de recepção completo: reserva → check-in → consumo → conta → pagamento → check-out
- [ ] Comanda usável em celular
- [ ] Build de produção limpo e typecheck sem erro
- [ ] Auditoria `qa-redteam` sem achado 🔴

---

## 7. Riscos

| Risco | Impacto | Mitigação |
|-------|---------|-----------|
| Rack subestimado | Alto | Deixado por último; prototipar com dados do seed |
| Comanda travar esperando SPEC-04 | Médio | T-05.1 a T-05.4 e T-05.6/07 não dependem dela |
| `baseUrl` de produção não resolvido | Médio | `VITE_API_URL` já tratado na Fase 0; validar no deploy |
| Casts mascarando erro de tipo | Médio | SPEC-06 T-06.2 elimina a causa |

---

## 8. Histórico

| Versão | Data | Autor | Alteração |
|--------|------|-------|-----------|
| 1.0 | 26/08/2026 | Gabriel Reis Cunha | Criação. Estado verificado em `App.tsx` — 4 rotas ainda são placeholder |
