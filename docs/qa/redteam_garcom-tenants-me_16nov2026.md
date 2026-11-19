# QA Red Team — garcom-tenants-me
**Branch:** fix/garcom-tenants-me · **Dev:** Gabriel (IA orquestrada) · **Base:** origin/develop@cef3e50 · **Data:** 16/11/2026
**Arquivos auditados:** 2 no diff (`features/tenant/queries.ts`, `queries.test.ts`) + 7 de contexto
**Achados no escopo:** 3 (🔴 0 · 🟡 1 · 🟢 2) · **Repassados:** 0

## Veredito
APROVADO COM RESSALVAS

Os quatro critérios estão atendidos em produção. As ressalvas são de teste e de defesa em profundidade, nenhuma é bloqueante.

## Verificação dos critérios

1. **O WAITER não chama /tenants/me em nenhuma tela.** Atendido. Só há dois chamadores em `frontend/apps/pms/src`:
   - `components/AppShell.tsx:27` usa `useMyTenant()` e agora fica `enabled:false` para o WAITER.
   - `features/reservations/ReservationDetailPage.tsx:59` faz `prefetchQuery(myTenantOptions())` direto, sem passar pelo guard. A rota `reservas/:id` está sob `RequireRole allow={['ADMIN','RECEPTIONIST']}` (`App.tsx:36`), e `RequireRole.tsx:13` devolve `<Navigate>` antes de montar o `Outlet`. A página não monta para o WAITER, então o prefetch não roda (ver 🟢-1).
   - `ReservationReceiptPage.tsx:23` usa o hook, e a rota é só ADMIN/RECEPTIONIST (`App.tsx:68`).
   - Não há `fetchQuery`, `refetchQueries`, `resetQueries`, `invalidateQueries()` sem filtro nem persister do query client. No v5 o refetch global já pula query desabilitada.
2. **ADMIN e RECEPTIONIST continuam vendo o hotel.** Atendido. `enabled: true` para os dois. O comprovante só é acessível a esses dois papéis, os mesmos de `TENANT_READERS`, então nenhum papel que chega ao comprovante fica com "Buscando o nome do hotel…" para sempre. O risco é latente e está descrito em 🟢-2. A hidratação do zustand `persist` com localStorage é síncrona, então o `role` já existe no primeiro render e não há um render inicial com `enabled:false` seguido de flip.
3. **Troca de usuário e logout não carregam o hotel adiante.** Atendido. `stores/auth.ts`: `setSession` limpa o cache quando o `user.id` muda, `logout` limpa sempre, e `syncSessionFromOtherTab` limpa entre abas. Na troca ADMIN→WAITER no mesmo aparelho, o cache é zerado e a query desabilitada não tem dado, então o cabeçalho mostra "Gesway".
4. **O backend não muda.** Atendido. `git diff origin/develop...HEAD --stat -- services` vem vazio. `roles.js` continua sem `/tenants` na `WAITER_ALLOWLIST`.

Execução: `pnpm --filter ./apps/pms test` deu 43 arquivos e 429 testes passando. `typecheck` (`tsc --noEmit` app + node) passou sem erro, no Node 24.

## Achados no escopo

### 🟡 [Testes] O teste do comprovante passou a rodar sem sessão e não detecta "Buscando…" eterno nem regressão do guard
**Onde:** `frontend/apps/pms/src/features/reservations/ReservationReceiptPage.test.tsx:51-67` e `:115-122`; `frontend/apps/pms/src/features/tenant/queries.test.ts:6-17`
**Cenário:** a suíte do comprovante não grava usuário no `useAuthStore`. Com este commit, `useMyTenant` fica `enabled:false` em todos esses testes, um estado que nunca acontece em produção para quem abre o comprovante. Dois efeitos:
(a) o teste "com o hotel ainda carregando… avisa" (`:115`) passa porque a query desabilitada fica `pending` para sempre. Ele não distingue carregando de desabilitado para sempre, então continuaria verde se um papel novo ganhasse acesso ao comprovante sem ganhar `TENANT_READERS`, que é exatamente o "Buscando…" eterno que o critério 2 pede para evitar.
(b) `queries.test.ts` testa só a função pura `canReadMyTenant`. Apagar o `enabled` de `useMyTenant` (`queries.ts:41`) não quebra nenhum teste, e o 403 do garçom voltaria sem alarme.
**Regra violada:** checklist §8, teste que passaria com a regra quebrada.
**Correção sugerida:** no `beforeEach` do teste do comprovante, chamar `useAuthStore.setState({ token: 't', user: { id: 'u1', role: 'RECEPTIONIST', … } })` para exercitar o caminho real. Extrair as opções da query como função pura testável, por exemplo `myTenantQuery(role)` retornando `{ ...myTenantOptions(), enabled: canReadMyTenant(role) }`, e testar que `myTenantQuery('WAITER').enabled === false` e `myTenantQuery('ADMIN').enabled === true`.

### 🟢 [Defesa em profundidade] O prefetch do detalhe da reserva ignora o guard
**Onde:** `frontend/apps/pms/src/features/reservations/ReservationDetailPage.tsx:58-60`
**Cenário:** hoje a rota não é alcançável pelo WAITER (`App.tsx:36`). Se um dia `reservas/:id` entrar num grupo que inclua o garçom, `prefetchQuery` dispara `/tenants/me` mesmo assim, porque `prefetchQuery` e `fetchQuery` ignoram `enabled` no TanStack v5, e o 403 volta. A regra "quem pode ler o hotel" vive em dois lugares e um deles não a consulta.
**Correção sugerida:** `role` já está em escopo (`:53`). Usar `if (canReadMyTenant(role)) void queryClient.prefetchQuery(myTenantOptions());` e exportar `canReadMyTenant` pelo `features/tenant/index.ts`.

### 🟢 [UX latente] "Buscando o nome do hotel…" depende de `isPending`, que fica verdadeiro para sempre em query desabilitada
**Onde:** `frontend/apps/pms/src/features/reservations/ReservationReceiptPage.tsx:54`
**Cenário:** hoje não acontece, porque a allowlist da rota do comprovante (`App.tsx:68`) é igual a `TENANT_READERS` (`queries.ts:33`). Basta as duas listas divergirem para o aviso girar sem fim.
**Correção sugerida:** trocar por `tenant.isLoading` (`isPending && isFetching`), que é falso em query desabilitada. É uma linha e remove o acoplamento entre as duas listas.

## Repassados a outro dev
Nenhum.

## O que foi verificado e está correto
- Allowlist (fail-safe): `undefined` e papel desconhecido retornam `false` (`queries.ts:35-37`).
- `TENANT_READERS` espelha `FULL_ACCESS_ROLES` do backend (`roles.js:13`).
- Todos os chamadores de `/tenants/me` no app foram mapeados com grep (`useMyTenant`, `myTenantOptions`, `tenantKeys`, `getMyTenant`, `prefetchQuery`, `fetchQuery`, `refetchQueries`, `resetQueries`, `invalidateQueries`).
- Gate de rota: o `RequireRole` impede montar o detalhe e o comprovante para o WAITER.
- Limpeza de cache em logout, troca de usuário e outra aba (`stores/auth.ts:32-38`, `:66-71`).
- Nada de `require()`, nenhuma dependência nova, backend intocado.
- Testes e typecheck passaram.

## Não foi possível verificar
- Execução real no navegador (console sem 403 nas telas `/comanda` e `/comanda/:id` do garçom). O ambiente de teste é Vitest node sem jsdom, e não subi o app. A conclusão vem da leitura do código e do grep exaustivo de chamadores.

## Desfecho (Gabriel + IA, 19/11)
| Achado | Desfecho |
|---|---|
| 🟡 testes não pegavam a regressão | Corrigido. `myTenantQuery(role)` leva o `enabled`, e o `useMyTenant.test.ts` testa o próprio hook com dublês do `useQuery` e da sessão. Mutação: hook sem trava → 2 testes vermelhos. O teste do comprovante ganhou um dublê da sessão: no render de servidor, o zustand v5 lê o estado inicial da store, e o `setState` não chegava à tela |
| 🟢 prefetch sem trava | Corrigido. `ReservationDetailPage` só faz o prefetch quando `canReadMyTenant(role)` |
| 🟢 "Buscando…" eterno | Corrigido. O aviso só aparece para quem vai buscar (`isPending && canReadMyTenant(role)`); teste novo com o garçom. Mutação: sem a trava → 1 teste vermelho. O `isLoading` foi descartado porque no render de servidor ele é falso |

Verificação: `pnpm --filter ./apps/pms test` com 44 arquivos e 434 testes; typecheck limpo; `qa_checks.sh` sem erro.
