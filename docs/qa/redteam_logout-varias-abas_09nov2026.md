# QA Red Team — sessão entre abas (logout e troca de usuário)
**Branch:** fix/logout-varias-abas · **Dev:** Gabriel (agente orquestrado) · **Base:** develop@01ac15c · **Data:** 09/11/2026
**Arquivos auditados:** 2 no diff (`frontend/apps/pms/src/stores/auth.ts`, `auth.test.ts`). Lidos para contexto: `lib/api.ts`, `lib/queryClient.ts`, `routes/ProtectedRoute.tsx`, `routes/RequireRole.tsx`, `routes/roleHome.ts`, `App.tsx`, `components/AppShell.tsx`, `features/auth/LoginPage.tsx`, `loginApi.ts`, `features/accounts/queueStore.ts`, `queueCore.ts`, `accountsApi.ts`, `features/rooms/queries.ts`, `packages/api-client/src/index.ts`, `zustand/esm/middleware.mjs`.
**Achados no escopo:** 7 (🔴 1 · 🟡 4 · 🟢 2) · **Repassados:** 0

`origin/develop` andou para `d426667`, mas sem tocar em `stores/`, `lib/`, `routes/`, `queueStore.ts` nem `packages/`.

## Veredito
**REPROVADO**, por um único 🔴.

O logout entre abas funciona: reproduzi em Chrome real e a outra aba cai para `/login` com o cache vazio. O que falha é o outro caminho que a branch anuncia, a **troca de usuário**. O cache é esvaziado, mas a tela continua mostrando os dados do usuário anterior, agora sob o cabeçalho do novo usuário. Antes desta branch o cenário era pior (a aba seguia logada como A), mas o teste novo declara esse caminho resolvido e não é o que acontece na tela.

## Como foi verificado
Além da leitura, rodei duas abas reais no Chrome 155 (Playwright, mesmo contexto, mesmo `localStorage`) contra o Vite do worktree, com a API simulada na rede por token. O login da outra aba foi feito pela tela real. Os scripts ficaram fora do repositório. Os identificadores S1 a S10 abaixo são esses cenários.

## Achados no escopo

### 🔴 [LGPD/Multi-tenancy] Troca de usuário em outra aba deixa os dados do usuário anterior na tela, sob a sessão do novo
**Onde:** `frontend/apps/pms/src/stores/auth.ts:61-62`, com `frontend/apps/pms/src/routes/ProtectedRoute.tsx:7-8`
**Cenário:** recepcionista do Hotel A está em `/hospedes` na aba 1. Em outra aba do mesmo computador, um admin do Hotel B entra por `/login` (a rota não tem guarda, `App.tsx:31`). Na aba 1, `syncSessionFromOtherTab` chama `queryClient.clear()` e `setState`. Como o token continua preenchido, o `ProtectedRoute` não desmonta nada, e o `<Outlet />` devolve o mesmo elemento, então a página não re-renderiza. O observer continua preso à query destruída, com os dados antigos. Saída real (S1):
```
t1 url /hospedes | header B true | header A false
t1 mostra hospede A true | hospede B false
t1 cache []
GET /guests por token ["token-a"]
apos 35s: hospede A true | hospede B false
```
A pessoa do Hotel B vê nome, CPF, telefone e e-mail de hóspedes do Hotel A com o nome dela no cabeçalho, sem prazo para sair: nenhuma nova busca é feita. O teste `entrar com outro usuário em outra aba troca a sessão e esvazia o cache aqui` passa porque olha o cache, não a tela. Quem não assina a sessão no próprio hook fica assim (`useGuests`, `useRooms` e outros sem `user.id` na chave); as queries de `today` e `analytics` têm o id na chave e rebuscam.

A mesma causa tem um segundo sintoma. Com um GET em andamento na hora da troca, a tela fica em "Carregando…" para sempre (S8: cache `[]`, nenhum GET com o token novo).

No caminho local, nada disso ocorre: `setSession` roda na tela de login, sem observers montados, e `logout()` zera o token, o que desmonta a árvore. É um caminho novo, criado pelo sync.
**Regra violada:** CLAUDE.md §7 (vazamento cross-tenant) e LGPD art. 46. O repasse de origem cobre "troca de usuário".
**Correção sugerida:** desmontar a árvore quando o usuário muda. Em `ProtectedRoute`, ler `user?.id` e devolver `<Fragment key={userId}><Outlet /></Fragment>`. Testei com patch temporário, já revertido: S1 passa a mostrar só `HOSPEDE-DO-HOTEL-B`, com GET usando `token-b`, e S8 sai do "Carregando…". Falta um teste que exercite a tela, não só o cache.

### 🟡 [Sessão] 401 atrasado de token antigo derruba a sessão nova em todas as abas
**Onde:** `frontend/apps/pms/src/lib/api.ts:24-26`, `packages/api-client/src/index.ts:33-35`, propagado por `auth.ts:58-65`
**Cenário:** a aba 1 tem uma requisição em andamento com token vencido. O usuário entra em outra aba. A aba 1 sincroniza para o token novo e `clear()` cancela a query, mas só no TanStack: o `fetch` não recebe `signal` (`guestsApi.ts:16`) e continua. Chega o 401 do token velho, o middleware chama `endSessionOnUnauthorized`, que só pergunta se *existe* token, e não se foi aquele que levou o 401. `logout()` grava sessão nula e a outra aba cai junto. Saída real (S4):
```
antes do 401:  t1 /hospedes | t2 /      | disco token-b
depois do 401: t1 /login    | t2 /login | disco {"token":null,"user":null}
```
**Novo x anterior:** o `logout()` por 401 já ignorava de qual token veio, mas após logout o token era nulo e o `if` protegia. O sync cria o estado "token novo com requisição velha em voo" e propaga a queda para as outras abas. Janela pequena: exige requisição com token já inválido em voo no instante do login.
**Regra violada:** Fail Fast aplicado ao alvo errado; a resposta de uma sessão encerra outra.
**Correção sugerida:** o cliente repassa o token usado em `onUnauthorized`, e `endSessionOnUnauthorized` só derruba se ele for igual ao token atual.

### 🟡 [Sessão] Senha errada em `/login` numa aba derruba a sessão de todas
**Onde:** `frontend/apps/pms/src/lib/api.ts:21-25`, `features/auth/loginApi.ts:27`, `services/core-service/app/Controllers/AuthApi/LoginController.js:47`
**Cenário:** recepcionista logada na aba 1, com uma reserva pela metade. Alguém abre `/login` em outra aba e erra a senha. O `POST /auth/login` passa pelo mesmo cliente, volta 401, há token no store, e `logout()` roda. Saída real (S3):
```
t2 /login | erro na tela true
t1 url /login | disco {"state":{"token":null,"user":null},"version":0}
```
A aba 1 perde o formulário em andamento. Não há perda de lançamento: a fila fica no `localStorage`.
**Novo x anterior:** o comentário de `api.ts:21-22` ("evita interferir no 401 do próprio login") já era falso com sessão aberta, mas o dano ficava na aba do erro. Esta branch estende a queda a todas as abas.
**Regra violada:** contrato documentado em `api.ts:21-22`.
**Correção sugerida:** o middleware não chamar `onUnauthorized` quando a URL for `/auth/login`. Comparar tokens não resolve este caso, pois o login sai com o token da sessão atual (log do S4: `["/auth/login","token-velho"]`).

### 🟡 [Fail-safe] Sessão de formato inesperado não vale como deslogado
**Onde:** `frontend/apps/pms/src/stores/auth.ts:44-51` e `:61`
**Cenário:** o comentário de `:43` promete "ausente ou ilegível vale como deslogado", mas só JSON quebrado e valor ausente têm esse efeito. Saída real (S6):

| Valor gravado por outra aba | Estado resultante | Efeito |
|---|---|---|
| `{token:'t-x'}` sem user | `token:'t-x', user:null` | `/login`, mas com token vivo em memória e regravado no disco |
| `{token:'t-x', user:{id:'z'}}` | aceito | fica em `/`, sem papel, sessão mantida |
| `{token:123, user:'abc'}` | aceito | fica em `/`, tipos errados no store e no disco |
| `{token:null, user:A}` (mesmo id) | token cai, user fica | `/login` **com o cache de A preservado** (`["guests"] ... HOSPEDE-DO-HOTEL-A`) |
| `{quebrado` / `removeItem` | deslogado | correto |

Sobre `user?.id` indefinido dos dois lados: o `clear()` só é pulado se o usuário atual também não tiver id, situação em que não achei caminho com cache populado. O caso que de fato pula uma limpeza devida é o último da tabela (mesmo id, token nulo). O repasse de origem pedia limpar "quando o `user.id` mudar **ou o token sumir**", e a condição implementada só cobre a primeira parte. Nenhum fluxo do app grava esses formatos (`setSession` e `logout` gravam os dois juntos): depende de versão antiga em outra aba, DevTools ou XSS. Por isso 🟡.
**Regra violada:** CLAUDE.md §7, allowlist em vez de fail-open.
**Correção sugerida:** só aceitar `typeof token === 'string' && token` com `user` objeto e `user.id` string; caso contrário, `{token:null, user:null}`. Limpar também quando o token resultante for nulo.

### 🟡 [Testes] Remover o registro do listener mantém a suíte verde
**Onde:** `frontend/apps/pms/src/stores/auth.ts:65` e `auth.test.ts`
**Cenário:** alguém apaga a linha do `addEventListener`, e a correção inteira do 🔴 de origem deixa de existir. Mutação M1, saída real: `Tests 11 passed (11)`. O Vitest roda em `environment: 'node'`, então `window` não existe, o `if` é falso e a função só é chamada à mão. Pelo mesmo motivo, o `persist` não tem `localStorage` (avisos `storage is currently unavailable`) e a regravação do foco 1 não é exercitada.
As mutações M2 a M6 (sem `clear`, sempre `clear`, ignora `key` nula, aceita qualquer `key`, não aplica sessão) ficam vermelhas, ou seja, a função em si está coberta.
**Regra violada:** checklist §8, teste que passaria com a regra quebrada.
**Correção sugerida:** um teste com `window` e `localStorage` simulados (`vi.stubGlobal` antes de um `import()` dinâmico) que dispare o listener registrado.

### 🟢 [Concorrência] Regravar `event.newValue` gera eco limitado quando duas abas gravam quase juntas
**Onde:** `frontend/apps/pms/src/stores/auth.ts:60` e `:62`
**Cenário:** `setState` passa pelo `persist` (`middleware.mjs`, `api.setState` chama `setItem`). No caso normal não há eco: o texto gravado é idêntico e o navegador não dispara evento (S2: 1 escrita e 1 evento por aba). Numa colisão de até 2 ms, cada aba regrava o valor que recebeu, já velho, e elas se rebatem. Saída real (S5b, 30 rodadas por linha):
```
logout x setSession | 0ms | divergiu 0 | eventos media 22.8 max 179 | ultimo evento ate 104ms
logout x setSession | 1ms | divergiu 0 | eventos media 39.5 max 281 | ultimo evento ate 85ms
logout x setSession | 5ms | a mais nova venceu 30/30 | eventos media 2.0
```
Sempre converge (0 divergências em 420 rodadas), e com 5 ms ou mais a escrita mais nova venceu em todas. Em até 2 ms não há "mais nova" mensurável: os relógios têm resolução de 1 ms. Sobra um pico curto de eventos, com possíveis `clear()` repetidos. Risco baixo.
**Regra violada:** nenhuma regra direta; custo desnecessário.
**Correção sugerida:** ler o disco em vez do evento, `readStoredSession(localStorage.getItem(STORAGE_KEY))`, o que torna a regravação idêntica. Testei em patch temporário, já revertido: máximo de 2 eventos em todas as defasagens. Observação: `persist.rehydrate()`, sugerido no repasse de origem, seria pior aqui. Com chave ausente ou JSON quebrado ele mantém a sessão atual (`merge` com `undefined`; erro cai no `catch`), ou seja, fail-open.

### 🟢 [Dev] Listeners de `storage` acumulam a cada HMR
**Onde:** `frontend/apps/pms/src/stores/auth.ts:65`
**Cenário:** cada edição de `auth.ts` em dev reavalia o módulo e registra de novo. Saída real (S9): 2, 4, 6, 8 listeners após 3 edições (o `queueStore.ts:79` tem o mesmo padrão e também é reavaliado; não há `import.meta.hot` no app). Os antigos ficam presos a stores antigos. Só afeta desenvolvimento, e some ao recarregar.
**Correção sugerida:** `import.meta.hot?.dispose(...)` removendo o listener, ou deixar como está.

## Repassados a outro dev
Nenhum.

## O que foi verificado e está correto
- **Logout em outra aba (S2):** a outra aba vai para `/login`, com cache vazio e sessão nula no disco.
- **Foco 3, resposta atrasada (S8):** a resposta 200 do usuário anterior não repopula o cache depois do `clear()` (cache `[]`). Igual ao `logout()`, que já cancelava em silêncio. O que é novo é o 401 atrasado (acima) e a tela presa (🔴).
- **Foco 3, mutações:** os `setQueryData` usam updater que devolve `undefined` sem dado anterior, e os `onSuccess` só invalidam (`rooms/queries.ts:85-87`).
- **Foco 4, fila (S7):** com troca durante o envio, houve um único POST, com o token do dono (`["token-w"]`), e o segundo item ficou `queued` no disco. A guarda `queueStore.ts:131-132` vale igual ao logout local,. A diferença de comportamento é esperada: antes a aba não sabia da saída e seguia enviando como o usuário anterior; agora a fila dele espera novo login, com aviso na tela ("Há 1 lançamento de outro usuário esperando neste aparelho"). O listener da fila ignora a chave da sessão, e vice-versa.
- **Foco 5, 401 simultâneo nas duas abas:** o segundo encontra token nulo e não faz nada; sem efeito em cascata. Não há renovação de token no app: o único chamador de `setSession` é `LoginPage.tsx:39`.
- **Foco 6, SSR:** não há SSR, e a guarda `typeof window` é suficiente.
- **bfcache em build de produção (S10):** página restaurada (`persisted:true`) chegou em `/login`, com a sessão já nula.
- **JSON válido porém estranho** (`null`, número, string em `state`) não lança exceção.
- ESM, sem `require`. Commits RED (`b4803b6`) e GREEN (`afa23ab`) separados.

## Testes e typecheck (saída real, `frontend/apps/pms`)
```
pnpm test       exit=0   Test Files 20 passed (20) · Tests 267 passed (267)
pnpm typecheck  exit=0   tsc --noEmit
```

## Não foi possível verificar
- **Firefox e Safari:** a corrida e o bfcache foram medidos só no Chrome 155. A ordem e a entrega de eventos de `storage` podem diferir.
- **Backend real:** a API foi simulada na rede. O 401 do login foi conferido em `LoginController.js:47`.
- **Aba congelada pelo navegador** (economia de memória): não reproduzido. O bfcache foi testado uma vez.
- **Cobertura:** o portão de 60% não foi medido; esta branch só adiciona testes.
