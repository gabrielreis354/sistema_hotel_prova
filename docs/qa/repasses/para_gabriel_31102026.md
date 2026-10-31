# Repasses para o Gabriel — 31/10/2026

Origem: auditoria `docs/qa/redteam_t056-indicadores_31out2026.md` (branch `feature/t056-indicadores`, Weslley).
Área: casca do `apps/pms` (sessão e `QueryClient`, Fase 0) e listagem de hóspedes. Nenhum destes achados reprova a branch auditada.

### 🔴 [Segurança/LGPD] O logout não limpa o cache do React Query: o próximo usuário da aba vê os dados do anterior, inclusive de outro tenant
**Onde:** `frontend/apps/pms/src/stores/auth.ts:23` (`logout: () => set({ token: null, user: null })`), `frontend/apps/pms/src/lib/api.ts:19` (logout automático no 401), `frontend/apps/pms/src/lib/queryClient.ts:5` (`QueryClient` único do módulo, `staleTime: 30_000`, `gcTime` padrão de 5 min). Nenhuma chave de query tem `tenantId` nem `userId` (`features/guests/queries.ts:11`, `features/accounts/queries.ts:12`, `features/analytics/queries.ts:15`).
**Cenário:** o computador da recepção é compartilhado. A recepcionista do Hotel A abre `/hospedes` e depois clica em "Sair". A tela vai para `/login` sem recarregar a página (`LoginPage.tsx:40` usa `navigate`). Em menos de 30 s, um usuário do Hotel B entra na mesma aba e abre `/hospedes`. A query `['guests']` ainda está fresca, então não há refetch, e a lista do Hotel A aparece para o Hotel B. Depois de 30 s e antes de 5 min, a lista de A aparece até o refetch terminar. Com a T-05.6, o ranking de hóspedes do Hotel A (nome, valor gasto e última estadia) fica 5 min inteiros na tela de um ADMIN do Hotel B, porque essas queries usam `staleTime` de 5 min. O mesmo acontece no logout pelo 401 de token vencido.
**Regra violada:** CLAUDE.md §7 (vazamento cross-tenant), LGPD art. 46 (segurança do tratamento).
**Correção sugerida:** chamar `queryClient.clear()` no `logout()` (no store, ou num `subscribe` do `useAuthStore` quando o token muda) e também no `setSession` se o `tenantId` mudar. Um teste unitário confirma: depois do logout, `queryClient.getQueryCache().getAll()` precisa estar vazio.

### 🟢 [UI] `GuestsListPage` ainda improvisa o estado de erro, e o `ErrorState` já está no `@hotel/ui`
**Onde:** `frontend/apps/pms/src/features/guests/GuestsListPage.tsx:28` (`<button className="underline" onClick={() => refetch()}>`)
**Cenário:** a T-05.6 promoveu o `ErrorState` para o `@hotel/ui` e tirou do `CATALOGO.md` a linha que citava esta tela. O `qa_checks.sh` (regra 9a) continua acusando o botão cru, e o erro da lista de hóspedes não tem o alvo de toque nem o foco do `Button`.
**Correção sugerida:** trocar pelo `<ErrorState message=... onRetry={() => refetch()} />` do `@hotel/ui`.

### ℹ️ Lembrete: fuso de `paid_at::date` (repasse de 26/10 ainda aberto)
Continua igual na `develop` (`GetRevenueController.js:10,15`, `GetPaymentMixController.js:10`), e a T-05.6 agora mostra o problema no cartão "Recebido hoje". Ver `para_gabriel_26102026.md`.
