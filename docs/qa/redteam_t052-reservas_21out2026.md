# QA Red Team — T-05.2 Reservas e check-in/out (frontend `apps/pms`)
**Branch:** feature/t052-reservas (5db7d2c..3efd467, 6 commits) · **Dev:** Gabriel (agente executor de frontend) · **Base:** develop@c6742b2 · **Data:** 23/10/2026
**Arquivos auditados:** 20 do diff + contexto (backend `ReservationApi/*`, `GuestApi/ListGuestController`, `@hotel/domain`, `@hotel/ui/Button`, preset do Tailwind, branch `feature/t051-quartos-categorias`)
**Achados no escopo:** 9 (🔴 0 · 🟡 6 · 🟢 3) · **Repassados:** 2

> Sem 🔴 de segurança, vazamento ou dinheiro fora do escopo.
>
> **Atenção de produto (não é 🔴 pela régua, mas trava a operação):** reserva criada pela tela nova nasce `PENDING` e **não chega ao check-in pela UI** — não existe endpoint nem botão de confirmar. Decisão pendente do Gabriel; ver 🟡-1 e o repasse.

## Veredito
**APROVADO COM RESSALVAS**

Nenhum 🔴 dentro do escopo. Dinheiro passa só por `@hotel/domain`, transições usam endpoints dedicados, a allowlist é a do domínio (fail-safe), 409/422 são tratados e nenhum arquivo compartilhado (layout, sessão, `packages/ui`, `packages/domain`) foi tocado. A ressalva que pesa é operacional: o fluxo do balcão (criar → check-in) está bloqueado até a decisão sobre `PENDING → CHECKED_IN`. Isso deve ser resolvido **antes de declarar a T-05.2 concluída**, mas não impede o merge em `develop` (antes do merge, `/reservas` era placeholder).

## Achados no escopo

### 🟡-1 [Máquina de estados / SPEC] CA-05.2.d marcado `[x]` com o fluxo do balcão bloqueado
**Onde:** `frontend/apps/pms/src/features/reservations/reservationLogic.ts:88-93,118-129`; `docs/specs/SPEC-05-frontend-pms.md:102`
**Cenário:** recepcionista cria reserva walk-in em `/reservas/nova` → `CreateReservationController.js:66` grava `status: 'PENDING'` → no detalhe, `canCheckIn('PENDING')` é `false` (`packages/domain/src/state-machines.ts`, allowlist `PENDING: ['CONFIRMED','CANCELLED']`) → botão "Fazer check-in" desabilitado com o motivo "o check-in libera quando ela for confirmada". Não há ação de confirmar em lugar nenhum da UI nem rota no backend (`reservationRouter.js` não tem `/confirm`; `CONFIRMED` só nasce em `PixWebhookController.js:146` e `SignContractController.js:97`). Resultado: o hóspede do balcão não faz check-in pelo PMS. O E2E do executor só passou porque promoveu reservas a `CONFIRMED` por SQL no banco descartável (relatório, linha 95).
**Classificação do impacto:** bloqueante para a operação real da recepção (é o fluxo nº 1 do balcão), sem perda de dado ou dinheiro. O código desta branch está **correto** em obedecer o domínio — a contradição é entre `@hotel/domain`/CLAUDE.md §3 (que proíbem `PENDING → CHECKED_IN`) e o `CheckInController.js:26` (que aceita). A correção de raiz está fora do diff (repassada).
**Regra violada:** SPEC é a fonte autoritativa (DIVISAO §8) — critério marcado como cumprido sem o caminho principal funcionar.
**Correção sugerida:** desmarcar CA-05.2.d (ou marcá-lo "parcial") até a decisão; quando ela sair, nada muda neste módulo — `reservationActions()` lê `canCheckIn` e o teste condicional (ver 🟢-2) precisa virar asserção firme.

### 🟡-2 [Dinheiro / divergência com `/bill`] "Aguardando confirmação" soma PIX expirado e falho
**Onde:** `frontend/apps/pms/src/features/reservations/reservationLogic.ts:263,279-281`; exibido em `components/BillTimeline.tsx:72` e `ReservationReceiptPage.tsx:94-96`
**Cenário:** reserva com sinal PIX R$ 100,00 `EXPIRED` e pagamento em dinheiro R$ 100,00 `PAID`. O servidor devolve `total_pending: 0` (`GetBillController.js:56` soma só `PENDING`). A tela calcula `pendingCents` somando todo pagamento `notCounted` (`status !== 'PAID'`) → mostra "Aguardando R$ 100,00" na aba Conta e **imprime "Aguardando confirmação R$ 100,00" no comprovante entregue ao hóspede**, sobre uma cobrança que nunca vai entrar. O saldo (`balance_due`) continua certo; o rótulo financeiro, não.
**Regra violada:** `buildBillTimeline` declara seguir o `GetBillController` (linha 218) e não segue; valor exibido diverge do servidor.
**Correção sugerida:** contar em `pending` só `status === 'PENDING'` (ou usar `bill.total_pending` do servidor); `EXPIRED`/`FAILED` continuam na linha do tempo, sem abater e sem somar. Acrescentar caso de teste com `EXPIRED` e `FAILED`.

### 🟡-3 [LGPD art. 6º, III] Comprovante imprime o CPF inteiro
**Onde:** `frontend/apps/pms/src/features/reservations/ReservationReceiptPage.tsx:64`
**Cenário:** check-out → "Comprovante para imprimir" → papel sai com `CPF 123.456.789-00` completo. O documento declara "sem valor fiscal" (linha 104), então o CPF não tem finalidade ali; o papel fica na mesa, no lixo do quarto, no PDF salvo no computador da recepção.
**Regra violada:** LGPD art. 6º, III (minimização) — dado pessoal além do necessário para a finalidade (conferência da conta).
**Correção sugerida:** remover o CPF ou mascarar (`***.456.789-**`). Nome, quarto, período e lançamentos bastam. (O resto do comprovante está bom: não traz telefone, e-mail nem quem lançou.)

### 🟡-4 [Princípio 7 / LGPD] Busca de hóspede baixa o cadastro inteiro do tenant
**Onde:** `frontend/apps/pms/src/features/reservations/components/GuestPicker.tsx:22-28` (via `guests/queries.ts:16` → `GET /guests` → `ListGuestController.js:6`, `findAll` sem limite)
**Cenário:** pousada com 8.000 hóspedes → abrir `/reservas/nova` baixa os 8.000 registros com nome, CPF, telefone e e-mail para o navegador da recepção, a cada vez que o cache expira, só para mostrar 6 resultados. Cresce linearmente e põe a base inteira de PII em memória/DevTools de qualquer estação.
**Classificação:** violação **real** do princípio 7, não cosmética — esta branch adiciona um segundo consumidor do defeito que o §4.5 da DIVISAO mandava corrigir antes de se propagar. Atenuantes: não há busca no backend (sem alternativa hoje), o limite está documentado no componente e em SPEC-05 §5 → T-05.12. Não é 🔴 porque não cruza tenant.
**Regra violada:** DIVISAO §4.2 princípio 7; LGPD art. 6º, III.
**Correção sugerida:** manter como dívida datada na T-05.12 (`GET /guests?q=&limit=`) e, enquanto isso, não iniciar a query antes de o usuário digitar (`enabled: term.length >= 2`), para pelo menos não baixar a base ao abrir a tela.

### 🟡-5 [Acessibilidade / contraste] Mensagens de sucesso e de erro abaixo de AA
**Onde:** `ReservationDetailPage.tsx:127` ("Conta quitada", `text-xs text-status-occupied`), `:203-205` (feedback em `bg-status-*/10`), `NewReservationPage.tsx:206` (erro de envio)
**Cenário:** medido com a fórmula WCAG sobre os tokens do preset: `#16a34a` sobre branco = **3,30:1**; sobre `occupied/10` = **2,96:1**; `#dc2626` sobre `maintenance/10` = **4,13:1**. Texto de 12–14 px exige 4,5:1. "Check-in feito…" e "Conta quitada" são exatamente as confirmações que o recepcionista precisa ler rápido.
**Regra violada:** DESIGN_PMS / checklist §7 (contraste AA); os quatro princípios de interface são RNF.
**Correção sugerida:** texto em tom escuro (`text-green-800`/`text-red-800`, ou token novo de "status-*-fg") mantendo o fundo tingido; ou ícone + texto `gray-900`.

### 🟡-6 [Testes] Evidência de 409/422 e do fluxo de telas fora do repositório
**Onde:** `reservationLogic.test.ts` (único teste do módulo); E2E em `scratchpad/t052_e2e.mjs`, não versionado
**Cenário:** `reservationsApi.ts:109-120` (409 → `RoomConflictError` com `room_ids`) e `:144-150` (422 → mensagem de "outro atendimento") não têm teste no repositório. Uma mudança no formato do corpo do 409 quebra a remoção do quarto perdido sem nenhum teste falhar. O E2E de 29 PASS é irreproduzível por quem não tem o scratchpad do executor.
**Regra violada:** checklist §8 — caminho de erro sem teste.
**Correção sugerida:** teste unitário de `serverMessage`, `createReservation` e `transitionReservation` com `api` mockado (409 com e sem `room_ids`, 422, 500); versionar o roteiro do E2E (mesmo que não rode no CI).

### 🟢-1 [Contrato] Detalhe nunca mostra categoria nem tarifa dos quartos
**Onde:** `ReservationDetailPage.tsx:265,270-274`
**Cenário:** `GetReservationController.js:15,17` inclui `RoomModel` sem `category`; o Swagger (`Room.category`) promete o campo. Resultado: a lista "Quartos" sai sem nome de categoria e sem "R$ X por noite" — código morto na prática. A causa é do backend (repassada); aqui, só registrar que o CA-05.2.b ("valores") depende disso.

### 🟢-2 [Testes] Asserção condicional em `PENDING`
**Onde:** `reservationLogic.test.ts:76` — `if (!a.checkIn.enabled) expect(...)`
**Cenário:** passa com check-in habilitado **ou** desabilitado; não protege nenhuma das duas decisões. Quando o 🟡-1 for decidido, trocar por asserção firme do comportamento escolhido.

### 🟢-3 [DRY / alvo de toque] Detalhes menores
- `reservationLogic.ts:131` redeclara a lista de status; `@hotel/domain` já exporta `RESERVATION_STATUSES`.
- Alvo de toque < 48 px no celular: link do nome na lista (`ReservationsListPage.tsx:131`, `block py-1` ≈ 28 px), `BackLink` (`primitives.tsx:72`) e "Tentar de novo" do `ErrorState` (`size="compact"`, 36 px). O E2E mediu só os botões de ação. Recepção é desktop-first, por isso 🟢.
- `?pagina=99` com `total > 0` mostra tabela vazia com "Página 99 de 2" (`ReservationsListPage.tsx:104`) — sem estado de "página inexistente".
- A query da lista dispara mesmo com período inválido (`from > to`), só esconde o resultado (`:27-28`); falta `enabled: rangeOk`.

## Conflito e ordem de merge com `feature/t051-quartos-categorias`

`git merge-tree --write-tree origin/feature/t051-quartos-categorias HEAD`:
- **`frontend/packages/api-client/*`** — idêntico nas duas (`git diff 0a0b9b4 5db7d2c` vazio). Sem conflito.
- **CONFLICT `frontend/apps/pms/src/App.tsx`** — as duas acrescentam imports e rotas no mesmo ponto (após `hospedes/:id/editar`). Resolução trivial: manter os dois blocos.
- **CONFLICT `docs/specs/SPEC-05-frontend-pms.md`** — as duas editam a tabela de ressalvas do §5 e o cabeçalho das tarefas. Resolução manual, sem risco de código.
- **Sobreposição semântica (o que realmente importa):** a T-05.1 cria `features/rooms/components/Money.tsx` e `ErrorState.tsx`, e generaliza o `StatusBadge` para `tone` + `label` (com tom `booked`). Esta branch tem `Money`/`ErrorState` em `components/primitives.tsx` e um `ReservationStatusBadge` local. Pela regra de promoção (DIVISAO §4.3), **quem mergear em segundo é o "segundo módulo"** e deve: promover `Money` e `ErrorState` para `packages/ui` (registrando no `CATALOGO.md`) e trocar `ReservationStatusBadge` por `<StatusBadge tone=… label=…>`.

**Ordem recomendada:** T-05.1 primeiro (já auditada, toca `packages/ui` e `packages/domain`); depois esta branch faz merge de `develop`, resolve os dois conflitos textuais e faz a promoção no mesmo passo. A ordem inversa também compila (nenhum símbolo usado por esta branch muda de assinatura na T-05.1 — as mudanças em `money.ts`/`state-machines.ts` são aditivas), mas joga a promoção para a T-05.1, que já foi auditada.

## Repassados a outro dev

| Sev. | Achado | Onde | Dono | Repasse |
|------|--------|------|------|---------|
| 🟡 | Descompasso `PENDING → CHECKED_IN` (domínio/CLAUDE.md proíbem, `CheckInController` aceita) e ausência de endpoint de confirmação — trava o check-in do balcão | `packages/domain/src/state-machines.ts:93`, `CheckInController.js:26`, `reservationRouter.js` | Gabriel (decisão registrada na SPEC-05 §5) | `docs/qa/repasses/para_gabriel_23102026.md` |
| 🟡 | `GET /reservations/:id` não inclui `category` nos quartos, mas o Swagger declara | `GetReservationController.js:15,17` | DONO INDEFINIDO | `docs/qa/repasses/para_indefinido_23102026.md` |

`GET /guests` sem busca/paginação já está registrado na T-05.12 — não repassado de novo.

## O que foi verificado e está correto
- **Dinheiro:** nenhum `Number(`, `parseFloat`, `toFixed` ou aritmética de float no módulo (grep). Só `Number.parseInt` do número da página (`ReservationsListPage.tsx:24`), que não é DECIMAL. DECIMAL em string → `decimalToCents`; números do `/bill` → `decimalToCents(number)` (arredonda, correto para valores já arredondados a 2 casas pelo servidor); soma em inteiros; `formatBRL` só na borda.
- **`buildBillTimeline` x `/bill`:** charges = `room_total` + consumos; só `PAID` abate; saldo final local = `grand_total − total_paid` do servidor; cancelada sem diária (D-46) igual ao servidor; `splitLodging` fecha a soma ao centavo. Cabeçalho e comprovante usam `balance_due` do servidor. Única divergência: 🟡-2.
- **Prévia (CA-05.2.m):** `quoteStay` = tarifa × noites por quarto, mesma regra do `calculateStayTotal`; o servidor recalcula e grava o total (o cliente não envia `total_amount`).
- **Máquina de estados:** transições só por `PUT /:id/check-in|check-out|cancel`; nunca `PUT /reservations/:id`. Allowlist do domínio, status desconhecido desabilita tudo. Toda ação desabilitada tem motivo visível ligado por `aria-describedby`. Check-out e cancelamento pedem confirmação; check-out bloqueado se a conta não carregou (503 incluído).
- **409/422:** 409 de corrida nomeia o quarto e tira-o da seleção; 422 explica e as mutações invalidam em `onSettled`, recarregando o estado real.
- **Princípios 4, 5, 8:** nenhum `fetch(`, `as unknown as`, `as never`, `as any` no módulo; tudo por `openapi-fetch` tipado; estado de servidor em TanStack Query.
- **`api-client`:** cherry-pick idêntico ao `0a0b9b4` da T-05.1 (diff vazio); gerado pelo script `generate`, não editado à mão.
- **Layout/sessão:** `git diff` vazio em `components/`, `routes/`, `lib/`, `packages/ui`, `packages/domain`, `packages/config`. `App.tsx` só ganhou rotas (aditivo, permitido pela DIVISAO §4.4); comprovante fora do `AppShell` mas dentro de `ProtectedRoute` + `RequireRole(['ADMIN','RECEPTIONIST'])`.
- **Lista (CA-05.2.a):** paginação e recorte no servidor (`?from&to&page&limit=20`); a semântica "estadia dentro do período, inclusive quem está na casa" bate com o filtro de sobreposição do `ListReservationController.js:24-25`.
- **Quatro estados e cor + rótulo:** carregando/vazio que ensina o próximo passo/erro com "tentar de novo"/conteúdo em todas as telas; `ReservationStatusBadge` e marcadores da linha do tempo com texto (e `sr-only`), nunca só cor.
- **Execução real (23/10, Node 24.14, pnpm 9.15):** `pnpm typecheck --force` exit 0 (4/4); `pnpm test` 30 + 22 testes passando; `pnpm build --force` ok; `bash scripts/qa_checks.sh` → 3 avisos, todos preexistentes no `develop` (Swagger sem 3 recursos, `<button>` cru em `GuestsListPage.tsx:28`, classe repetida em `guests`), nenhum do módulo de reservas.

## Não foi possível verificar
- **E2E:** não reexecutei o Playwright do executor (script fora do repo, ver 🟡-6); não subi `pg-qa052`/backend — a auditoria foi estática + typecheck/test/build. Nenhum container ou processo ficou ativo.
- **Capturas `t052_*.png`:** não usadas como evidência dos achados; os achados de contraste foram medidos sobre os tokens, não sobre pixels.
- **Typecheck do merge com a T-05.1:** não compilei a árvore mergeada (exige resolver os conflitos à mão); a conclusão de que compila vem da leitura do diff da T-05.1 (mudanças aditivas em `@hotel/domain`; `StatusBadge` não usado por esta branch).
- **Cobertura:** o portão de 60% é do backend; o frontend não tem limiar configurado para conferir.
