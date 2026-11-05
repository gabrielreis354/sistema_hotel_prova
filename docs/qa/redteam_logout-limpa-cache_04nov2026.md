# QA Red Team — logout limpa o cache do React Query
**Branch:** fix/logout-limpa-cache · **Dev:** Gabriel (agente orquestrado) · **Base:** develop@3e68e7f · **Data:** 04/11/2026
**Arquivos auditados:** 2 no diff (`frontend/apps/pms/src/stores/auth.ts`, `frontend/apps/pms/src/stores/auth.test.ts`). Também li, para contexto: `lib/api.ts`, `lib/queryClient.ts`, `features/auth/LoginPage.tsx`, `routes/ProtectedRoute.tsx`, `App.tsx`, `main.tsx`, `features/accounts/queueStore.ts`, `features/accounts/queueCore.ts`, `features/accounts/AccountsListPage.tsx`, `features/accounts/AccountPage.tsx`, os `queries.ts` de todas as features, `@tanstack/query-core@5.101.4` e `zustand@5.0.14` em `node_modules`.
**Achados no escopo:** 2 (🔴 0 · 🟡 1 · 🟢 1) · **Repassados:** 1

> **ALERTA FORA DO ESCOPO:** o logout não se propaga para as outras abas. Se a recepcionista do Hotel A sai numa aba, outra aba do mesmo navegador continua logada como ela, com o token válido (8 h) e o cache na tela. Quem sentar no computador depois usa essa aba como se fosse ela. O defeito já existia antes desta branch, que não o piora. A área é a casca do `apps/pms` (sessão), do Gabriel. Repasse em `docs/qa/repasses/para_gabriel_04112026.md`.

## Veredito
**APROVADO COM RESSALVAS**

A correção fecha o vazamento relatado no repasse de 31/10 na aba onde a troca de sessão acontece, pelos três caminhos que passam pelo store: logout manual, logout no 401 e login de outro usuário sem logout. Também testei o caso mais arriscado, uma query do usuário anterior que termina depois do `clear()`. Com a versão instalada do TanStack Query, essa resposta não volta para o cache (evidência abaixo). A fila offline do garçom não é afetada. Não há 🔴 no escopo. As ressalvas são a falta de teste do caminho do 401 (🟡) e um comentário que ficou falso (🟢).

## Achados no escopo

### 🟡 [Testes] O caminho do 401 não tem teste: trocar `logout()` por `setState` em `api.ts` passa a suíte inteira
**Onde:** `frontend/apps/pms/src/lib/api.ts:19` e `frontend/apps/pms/src/stores/auth.test.ts` (nenhum teste importa `api.ts`)
**Cenário:** alguém "simplifica" o `onUnauthorized` para `useAuthStore.setState({ token: null, user: null })`, que parece equivalente. O token vence (8 h, `LoginController.js:56`), a próxima request volta 401, a sessão cai sem `clear()`, e o próximo usuário da aba vê o cache do anterior, que é exatamente o 🔴 de origem. O CI não percebe. Mutação M5, saída real:
```
M5: 401 derruba sessao sem passar pelo logout (api.ts)
19:    if (useAuthStore.getState().token) useAuthStore.setState({ token: null, user: null });
      Tests  201 passed (201)
```
O pedido citava o 401 como um dos caminhos corrigidos. Hoje ele está correto só por leitura de código (`api.ts:19` chama `logout()`), sem teste que o proteja.
**Regra violada:** checklist §8 ("teste que passaria mesmo com a regra quebrada"). O repasse de origem cita o 401 de forma explícita.
**Correção sugerida:** um teste que chame o `onUnauthorized` do cliente (ou dispare um fetch mockado com 401 via `api`) com sessão ativa e cache populado, e verifique `getQueryCache().getAll().length === 0`. Para isso, o callback precisa ser exportado ou o `fetch` precisa ser mockado.

### 🟢 [Docs] O comentário das chaves de analytics passou a afirmar algo falso
**Onde:** `frontend/apps/pms/src/features/analytics/queries.ts:17-18` ("O cache sobrevive ao logout, e sem isso o ADMIN de outro hotel...")
**Cenário:** com esta branch, o cache não sobrevive mais ao logout. Quem ler o comentário vai achar que o vazamento ainda existe e que o `user.id` na chave é a única barreira. Pode, por exemplo, criar outra feature imitando o padrão, ou deixar de confiar no `clear()`.
**Regra violada:** Boy Scout Rule (CLAUDE.md global). Comentário de decisão desatualizado.
**Correção sugerida:** reescrever como "defesa em profundidade: o `logout()` limpa o cache (`stores/auth.ts`), e a chave por usuário cobre o que escapar disso, como o fetch tardio". O prefixo por usuário pode continuar.

## Repassados a outro dev

| Sev. | Achado | Onde | Dono | Repasse |
|------|--------|------|------|---------|
| 🔴 | O logout e a troca de usuário não se propagam para outras abas: a outra aba continua logada como o usuário anterior (até 8 h) e com o cache dele | `frontend/apps/pms/src/stores/auth.ts:23-38` (persist sem sincronização entre abas) | Gabriel (casca do `apps/pms`, sessão) | `docs/qa/repasses/para_gabriel_04112026.md` |

Fica como repasse, e não como achado no escopo, porque é outro defeito: a **sessão** que não se propaga entre abas, e não o **cache** que sobrevive à troca. Ele existia igual em `develop@3e68e7f` e o repasse de origem não o pedia. Esta branch nem introduz nem piora o problema.

## Verificação de cada caminho pedido

| Caminho | Fecha? | Evidência |
|---|---|---|
| Logout manual | Sim | `AppShell.tsx:39` chama `logout`, e `auth.ts:32-35` faz `clear()` antes do `set`. Na mutação M1 (sem `clear` no logout), o teste "logout esvazia o cache" fica vermelho. |
| 401 | Sim, sem teste | `api.ts:19` passa por `logout()`. Na mutação M5 a suíte continua verde (🟡 acima). |
| Login de outro usuário sem logout | Sim | `/login` não tem guarda (`App.tsx:30`), então dá para logar por cima de uma sessão. `setSession` limpa quando `user.id` muda. Na M2 o teste correspondente fica vermelho. O e-mail que existe em mais de um hotel gera linhas de usuário distintas (409 com subdomínio, `loginApi.ts`), então o `id` muda quando o hotel muda. |
| Renovar o token do mesmo usuário | Mantém o cache | Nas mutações M3 ("sempre limpa") e M4 ("compara token") o teste correspondente fica vermelho. Observação: não existe renovação de token no app. O único chamador de `setSession` é `LoginPage.tsx:39`, então esse ramo só roda quando o mesmo usuário refaz o login sem sair. |
| Hidratação do persist | Não se aplica | O `persist` hidrata de forma síncrona na criação do store (`zustand/esm/middleware.mjs:469-470`). O `QueryClient` nasce vazio a cada carga da página, então não há cache anterior para vazar. Recarregar a aba restaura só a sessão, que é intencional (comentário de `auth.ts:14`). |
| Outra aba com o mesmo localStorage | **Não** | O `persist` do zustand 5.0.14 não escuta o evento `storage`: `grep "addEventListener\|'storage'" esm/middleware.mjs` não acha nada. O único listener de `storage` no app é o da fila (`queueStore.ts:79`). Ver o repasse. |
| Query em andamento que termina depois do `clear()` | Sim | Detalhes abaixo. |

### Fetch tardio: comportamento real do `@tanstack/query-core@5.101.4`
Leitura do código instalado:
- `queryClient.ts:632-635`: `clear()` chama `queryCache.clear()` e `mutationCache.clear()`.
- `queryCache.ts:144-164`: `remove()` chama `query.destroy()` e tira a query do mapa.
- `query.ts:259-263`: `destroy()` chama `this.cancel({ silent: true })`.
- `retryer.ts:111-121`: `resolve` e `reject` não fazem nada depois que o retryer foi resolvido ou cancelado.
- `queryClient.ts:200-202`: `setQueryData` com updater que devolve `undefined` não cria a query.

Também rodei um teste descartável, criado e apagado na hora (`src/zz_inflight.test.ts`), contra o `queryClient` e o `useAuthStore` reais. Saída real:
```
fetchQuery resultado: rejected:CancelledError
cache apos resolver: 0 undefined
observer: cache= 0 resultado do observer= undefined
mutacao: cache= 0
 ✓ src/zz_inflight.test.ts (3 tests) 30ms
```
Os três cenários foram: um `fetchQuery` que resolve depois do logout, um `QueryObserver` inscrito (componente montado) com fetch em andamento, e uma mutação em andamento cujo `onSuccess` faz `setQueryData(updater)`. Em nenhum deles a resposta repõe dado no cache. Conferi todos os `setQueryData` do app (`rooms/queries.ts:85,141` e `accounts/queueStore.ts:107`): todos usam updater que devolve `undefined` quando não há dado anterior. Os `onSuccess` tardios restantes só chamam `invalidateQueries`, que não cria query. Se o próximo usuário já tiver queries, elas são rebuscadas com o token dele.

## Outros caches (foco 2)
- **Zustand:** o único store é o `auth`. Grep por `create<`, `persist(` e `createStore` em `apps/pms/src` e `packages/*/src`.
- **`sessionStorage` e `indexedDB`:** nenhum uso.
- **`localStorage`:** só `hotel-pms-auth` e as chaves `gesway-comanda-item:*` da fila.
- **Variáveis de módulo:** só `entries`, `listeners` e `flushing` em `queueStore.ts:55,56,115`. Elas sobrevivem à troca **por design** (T-05.5): o lançamento de um garçom não pode se perder no logout. Isso não é vazamento. `readyToSend` filtra por `ownerId`, e `flush` interrompe a rodada se `session.user?.id !== ownerId` (`queueStore.ts:131-132`). Para o usuário seguinte, a tela mostra apenas a contagem de lançamentos de outra pessoa. Os rótulos vêm da lista de contas **do usuário atual** (`AccountsListPage.tsx:40-42`), então um usuário de outro hotel vê "conta já fechada", sem descrição nem preço.

## Efeito colateral na comanda offline (foco 4)
O `clear()` não apaga nenhum lançamento pendente. A fila mora no `localStorage` e numa variável de módulo, fora do `QueryClient`. Quando um envio termina depois do logout, o item sai da fila pelo `applyOutcome` normal, porque o servidor gravou. O `showSaved` não reconstrói a conta no cache, porque o updater devolve `old` igual a `undefined`. O efeito único é cosmético: o item gravado aparece na conta na próxima busca, que já é o comportamento de qualquer conta fora do cache. Não há perda de dado.

## O que foi verificado e está correto
- O `tenant_id` não entra no frontend (o JWT carrega o tenant). Comparar por `user.id` cobre a troca de hotel, porque o `id` é UUID por linha de usuário.
- A ordem `clear()` e depois `set()` dentro do mesmo tick deixa o React renderizar uma vez só, já com `token: null`. O `ProtectedRoute` desmonta os observers antes que eles reconstruam alguma query. A app usa `createRoot` (`main.tsx`), com batching automático.
- ESM, sem `require`. Commits RED (`18fb0c7`) e GREEN (`23df72b`) separados, no padrão Conventional Commits.
- `pnpm test`: 17 arquivos, 201 testes verdes. `pnpm typecheck`: exit 0.
- `bash scripts/qa_checks.sh`: 3 avisos, todos anteriores e fora do diff (Swagger de 3 routers, `<button>` cru em `GuestsListPage.tsx:28`, classes repetidas). Nenhum erro bloqueante.
- Mutações M1 a M4 no `auth.ts`: cada uma deixa exatamente um teste vermelho (saídas abaixo).

```
M1: sem clear no logout
   × sessão e cache do React Query > logout esvazia o cache
AssertionError: expected 1 to be +0 // Object.is equality
M2: sem clear no setSession
   × ... > entrar com outro usuário sem passar pelo logout também esvazia o cache
AssertionError: expected [ { id: 'g-1', …(1) } ] to be undefined
M3: setSession sempre limpa
   × ... > renovar o token do mesmo usuário mantém o cache
AssertionError: expected +0 to be 1 // Object.is equality
M4: setSession compara token em vez de user
   × ... > renovar o token do mesmo usuário mantém o cache
AssertionError: expected +0 to be 1 // Object.is equality
```
Depois de cada mutação o arquivo foi restaurado com `git checkout --`. O `git status` final ficou limpo.

## Não foi possível verificar
- **Reprodução no navegador (Playwright):** não foi feita. Exigiria subir Postgres (5467), backend com migrate e seed de dois tenants (3067) e Vite (5267), e o pacote `playwright` não está instalado no workspace. Os caminhos foram verificados por leitura de código e por testes contra o `queryClient`, o `useAuthStore` e o `@tanstack/query-core@5.101.4` reais. A ordem do render React no logout foi checada só por leitura (batching do React 18).
- Os testes do store rodam em ambiente `node`, sem `localStorage`, como mostram os avisos `[zustand persist middleware] ... storage is currently unavailable`. A persistência e a hidratação não são exercitadas pela suíte.
