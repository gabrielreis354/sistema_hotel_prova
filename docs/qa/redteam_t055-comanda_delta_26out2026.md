# QA Red Team — T-05.5 Fase A, comanda (reauditoria delta das correções)
**Branch:** feature/t055-comanda · **Dev:** Sirlande · **Base do delta:** 0553b8b..bea0a0e (commits dc1b76f, bea0a0e) · **Base da branch:** develop@72ef709 · **Data:** 26/10/2026
**Arquivos auditados:** 9 (`queueCore.ts`, `queueCore.test.ts`, `queueStore.ts`, `accountsApi.ts`, `AccountPage.tsx`, `AccountsListPage.tsx`, `components/{ItemList,MenuGrid,StaffActions}.tsx`)
**Achados no escopo:** 6 (🔴 0 · 🟡 3 · 🟢 3) · **Repassados:** 0

## Veredito
**APROVADO COM RESSALVAS**

Os cinco 🟡 da auditoria anterior foram tratados. O 🟡-1, o 🟡-2 e o 🟡-5 estão fechados. O 🟡-3 está fechado
no que importa: a tela não some quando já tem dados. Fica um resíduo 🟢. O 🟡-4 está **fechado pela metade, e a
correção abriu uma regressão** (D-1): o aparelho que tem os itens do outro usuário deixou de impedir o fechamento
da conta e também não avisa. Este achado e o D-2 (`AbortSignal.timeout`) são os que eu corrigiria antes do merge.
Nenhum é 🔴: o servidor nunca grava valor errado, e a idempotência por `client_item_id` segura todas as corridas
que examinei.

## Status dos achados anteriores
| Achado | Status | Evidência |
|---|---|---|
| 🟡-1 Desfazer morto | **Fechado** | `queueCore.ts:86-88` (`canUndo`), `ItemList.tsx:53,99,109` (`useNow`), `accountsApi.ts:69` (o timeout cai no `catch` e vira `'network'`). Conferi que o `openapi-fetch@0.13.8` repassa o `init.signal` para o `Request` (`dist/index.js:102-107`). |
| 🟡-2 Item some até o fim da rodada | **Fechado** | `queueStore.ts:103-112,129,133-134`. O formato bate: `POST` 201/200 devolve `{item: item.reload()/existing, account_total: accountTotal(...)}` (`CreateAccountItemController.js:81,199`), que é o mesmo `accountTotal` e o mesmo model do `GET` (`GetAccountController.js:27`). Com `old` sem `items`, o código usa `?? []`. Com `old` undefined, devolve undefined e a chamada não faz nada. O replay é deduplicado por `id`. |
| 🟡-3 Erro de rede derruba a tela | **Fechado, com resíduo 🟢 (D-4)** | `AccountPage.tsx:43-58,63`, `AccountsListPage.tsx:48-56`, `MenuGrid.tsx:36-40` |
| 🟡-4 Fila de outro usuário | **Parcial e com regressão (D-1)** | `AccountPage.tsx:39-41`, `AccountsListPage.tsx:22-24` |
| 🟡-5 Abas sobrescrevem a fila | **Fechado (perda de dado)**. A sincronização nova tem um efeito colateral (D-3). | `queueStore.ts:34-84` |
| 🟢-3 `isEntry` fraco | **Fechado** | `queueCore.ts:224-233` + teste |
| 🟢-4 Confirmação sem prazo | **Fechado** | `StaffActions.tsx:41-46` |
| 🟢-5 Rótulo do rodapé / crédito | **Fechado** | `AccountPage.tsx:66`, `StaffActions.tsx:56-66` |
| 🟢-6 aria | **Fechado** | `AccountPage.tsx:107`, `MenuGrid.tsx:64,72`, `StaffActions.tsx:73,91` |
| 🟢-1 Teste do motor da fila | **Aberto.** O delta mexeu justamente em `flush`, `commit`, `readDisk` e `showSaved`, e nenhum deles tem teste. | — |
| 🟢-2 5xx eterno, 🟢-7 runner fora da comanda | Abertos (não faziam parte do pedido) | — |

## Achados no escopo

### 🟡 D-1 [Fila / dinheiro, regressão do 🟡-4] No aparelho que tem os itens do garçom A, a recepção agora fecha a conta sem nenhum aviso
**Onde:** `AccountPage.tsx:39-41` (`mine` e `pendingCount` só olham o usuário logado), `AccountPage.tsx:110` (`StaffActions` recebe só o `pendingCount` de `mine`) e `AccountsListPage.tsx:24,51-56` (o aviso de "outro usuário" aparece só na lista, sem dizer a conta).
**Cenário:** sem rede, o garçom A lança 2 cervejas na Mesa 5 e faz logout. A recepcionista entra no mesmo tablet e abre a Mesa 5. A tela não mostra as 2 cervejas, o rodapé não as soma e "Fechar conta" fica **habilitado**. Antes do delta, este aparelho bloqueava o fechamento. Ela fecha e cobra. Quando A loga de novo, os 2 itens recebem 422 ("A conta foi fechada…") e viram `rejected`: o hotel deixa de cobrar o consumo, justamente no aparelho que tinha a informação. O aviso da lista ("Há 2 lançamentos de outro usuário…") não diz de qual conta são, e quem vai direto à Mesa 5 nem chega a vê-lo.
**Regra violada:** risco de receita (item consumido e não cobrado). A sugestão original do 🟡-4 pedia o aviso separado *na conta*.
**Correção sugerida:** na `AccountPage`, calcular `othersPending = pendingFor(entries.filter(e => e.ownerId !== user?.id), id).length` e, quando for maior que 0, mostrar perto de "Fechar conta": "N lançamentos de outro usuário nesta conta ainda não foram enviados deste aparelho". Isso não pode virar bloqueio que ninguém resolve (RNF-026). O mínimo é exibir o aviso, e de preferência exigir a confirmação explícita no fechamento. Na lista, somar esse número ao contador da própria conta, ou marcar a linha.

### 🟡 D-2 [Fila / compatibilidade] Em navegador sem `AbortSignal.timeout`, nenhum lançamento chega ao servidor, e nada avisa
**Onde:** `accountsApi.ts:69`.
**Cenário:** `AbortSignal.timeout` existe a partir do Safari/iOS 16, do Chrome 103 e do Firefox 100. O Vite 5 sem `build.target` (`vite.config.ts` não define um) gera código para `safari14`/`chrome87` e não faz polyfill de API. Um garçom com iPhone 7 ou 6s (o máximo desses aparelhos é o iOS 15) faz o toque. Quando a janela vence, `AbortSignal.timeout` lança `TypeError` **dentro do `try`**. A resposta vira `'network'`, depois `retry`, e o ciclo se repete para sempre. A entrada fica "Na fila" eternamente, o rodapé soma o valor, a recepção (no outro aparelho) não vê o item e fecha a conta sem ele. Nada distingue esse caso de um Wi-Fi ruim.
**Regra violada:** CA-05.5.e/f. A tela finge que o item está a caminho.
**Status:** o código foi confirmado. Que existam aparelhos com iOS 15 entre os alvos é **SUSPEITA**: o projeto não declara navegadores-alvo (busquei em `PLANEJAMENTO_FRONTEND.md` e `DESIGN_PMS.md`).
**Correção sugerida:** um fallback de 3 linhas: `const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), POST_TIMEOUT_MS);` e `clearTimeout(t)` no `finally`. Se preferir, declarar o alvo mínimo (`build.target`) e documentar.

### 🟡 D-3 [Fila / várias abas] Uma entrada que outra aba deixou em "Enviando" fica presa nesta aba até alguém recarregar a página
**Onde:** `queueStore.ts:78-82` (o listener `storage` faz `entries = readDisk()` **sem** `recoverAfterReload`) e `queueCore.ts:105-110` (`readyToSend` ignora `sending`).
**Cenário:** a recepção tem a comanda aberta em duas abas. A aba 1 marca a "Água" como `sending` (e grava no disco). A aba 2 recebe o evento `storage` e passa a ver a "Água" em `sending`. A aba 1 é fechada durante o `POST`. Na aba 2, a "Água" fica "Enviando" para sempre: nenhuma aba volta a enviá-la, e `pendingFor` inclui `sending`, então "Fechar conta" fica bloqueado com "Espere os lançamentos da fila chegarem…", um bloqueio que não se resolve sozinho (RNF-026). Só um F5 na aba 2 resolve, porque `recoverAfterReload` roda no import. Se o POST da aba 1 não tiver chegado ao servidor e a conta for fechada em outro terminal, o item se perde. Antes do delta isso não acontecia, porque a aba 2 nunca relia o disco.
**Regra violada:** CA-05.5.e. A fila deve andar sozinha.
**Correção sugerida:** registrar `sendingSince` ao marcar `sending` e, no `readyToSend`, tratar como `queued` o `sending` de outra aba que tenha mais de `POST_TIMEOUT_MS` + uma folga. A alternativa mais simples é guardar um `Set` dos `clientItemId` que **esta** aba está enviando e, ao reler do disco, aplicar `recoverAfterReload` só nas entradas fora desse set. O reenvio é seguro (RN-008).

### 🟢 D-4 [Offline] Sem cache e com Wi-Fi instável, a conta ainda mostra "Failed to fetch"
**Onde:** `AccountPage.tsx:57` (`isError ? error.message : …`).
**Cenário:** com `navigator.onLine` true e `fetch` falhando, a query não pausa, ela erra. O garçom abre uma Mesa que não está em cache e lê "Failed to fetch" (no Safari, "Load failed"). Também não há separação entre 404 real e falha de rede. É o resíduo do 🟡-3: a tela aparece só quando não há dados, então o impacto é pequeno.
**Correção sugerida:** `error instanceof ApiError ? error.message : 'Sem conexão com o sistema. Tente de novo.'`.

### 🟢 D-5 [Fila / auditoria, pré-existente] Uma rodada iniciada pelo garçom A pode continuar enviando os itens de A com o token de B
**Onde:** `queueStore.ts:121-135` (o loop usa o `ownerId` da closure) e `lib/api.ts:15` (o token é lido do store a cada requisição).
**Cenário:** A tem 3 itens na fila. O primeiro `POST` está lento (até 10 s). A faz logout e B loga nesse intervalo. O primeiro responde 201, o loop continua, e os itens 2 e 3 de A vão com o JWT de B: o `created_by` sai errado. A cleanup do `useQueueRunner` não interrompe uma rodada em andamento. Isso já existia antes do delta e não foi apontado na auditoria anterior. O timeout novo deixa a janela limitada, mas ela continua existindo.
**Correção sugerida:** antes de cada `postItem`, `if (useAuthStore.getState().user?.id !== ownerId) break;`.

### 🟢 D-6 [Testes] O código novo de concorrência não tem teste
**Onde:** `queueStore.ts:37-84,103-139`.
**Cenário:** se alguém trocar `before.get(id) !== entry` por `true` (regravando tudo e voltando a sobrescrever a outra aba), remover o `startsWith(PREFIX)` do listener ou apagar a deduplicação por `id` do `showSaved`, todos os 38 testes de `features/accounts` continuam verdes (rodei: 3 arquivos, 38 passaram). Isso é o 🟢-1 da auditoria anterior, agora mais caro, porque o D-1 e o D-3 vivem exatamente nesse código.
**Correção sugerida:** testes de `commit`/`readDisk` com um `localStorage` falso, de `showSaved` com um `QueryClient` real e de `flush` com `postItem` mockado.

## Pontos levantados pelo dev, conferidos
- **Duas abas enviando a mesma entrada:** isso pode acontecer, porque o evento `storage` é assíncrono e as duas abas podem disparar o tick antes de recebê-lo. **Não duplica.** O backend devolve 200 no replay ou cai no `UniqueConstraintError` → replay (`CreateAccountItemController.js:81` e o ramo da constraint), e o `showSaved` deduplica por `id`. Se a aba perdedora receber `retry` antes de saber que a outra gravou, ela regrava a entrada como `queued`, ela é reenviada, recebe 200 e sai da fila. O efeito é só visual.
- **Evento `storage` durante o `await` desta aba:** `applyOutcome` e `markSending` operam sobre o `entries` atual por `clientItemId`, então uma entrada removida pela outra aba vira no-op e não reaparece. O `for` itera um snapshot antigo e pode reenviar o que a outra aba já gravou, o que é seguro pelo RN-008. Um item novo desta aba que ainda não chegou ao disco (cota cheia) se perde na releitura. É um caso marginal, que não registro como achado.
- **Ordem por `undoUntil` depois de mesclar quantidade:** a mesclagem renova o prazo, então a ordem passa a ser "último toque de cada linha", e não "primeiro toque". Isso coincide com a ordem em que as entradas ficam prontas (`readyToSend` exige `now >= undoUntil`). Não há dependência de ordem entre itens no servidor. Não é achado. O comentário de `queueStore.ts:50` poderia dizer "ordem em que ficam prontas".
- **`setQueryData` com `old` sem `items`:** tratado (`?? []`). Com `old` undefined, a chamada não faz nada, e a invalidação logo depois cobre.
- **`useNow` devolvendo `Date.now()` fora de efeito:** é impuro no render, mas só quando inativo, e nesse caso nenhum consumidor depende do valor (`canUndo` exige `status === 'undo'`, que deixaria `active` true). Na transição para ativo, o primeiro render usa o `now` antigo do `useState`. Uma entrada vinda de outra aba já vencida pode exibir "Desfazer" por até 250 ms, e o toque nesse intervalo vira no-op (o `undoTap` usa `Date.now()` real). É desprezível.
- **`AbortSignal.timeout`:** ver D-2.
- **Vazamento no aviso de outro usuário:** nenhum. A mensagem (`AccountsListPage.tsx:51-56`) não traz nome, ID nem conta, só a contagem. A fila continua sem dado de hóspede (os campos são validados em `queueCore.ts:215-233`).

## Repassados a outro dev
Nenhum.

## O que foi verificado e está correto
- `commit` grava só por identidade alterada e remove as chaves que saíram. Depois de `readDisk`, as identidades são novas, mas o próximo `commit` compara contra elas, então não regrava tudo.
- O listener filtra por `PREFIX` e por `key === null` (o `clear()`). A chave antiga `gesway-comanda-fila` é abandonada sem migração. Com deploy da Fase A ainda não em produção, não há fila antiga para perder.
- `undoTap` com `ownerId` (`queueCore.ts:97`) tem teste. O `onUndo` da `AccountPage` exige `user`.
- `flush` agora para a rodada em `retry`, invalida por item (só em gravado, excluído ou recusado) e não guarda mais estado depois do unmount.
- `StaffActions`: o efeito desarma com `blocked` e no timeout de 5 s, e a cleanup limpa o timer. `Math.abs` em centavos inteiros, sem `Number()` sobre string.
- `MenuGrid`/`AccountsListPage`: no TanStack v5, `isLoading = isPending && isFetching`, então "pausado" e "carregando" não aparecem juntos.
- 38 testes de `features/accounts` passam (`npx vitest run src/features/accounts`).

## Não foi possível verificar
- O parque real de aparelhos dos garçons (para dimensionar o D-2).
- Não rodei o Playwright nem cenários de várias abas no navegador. As corridas acima foram analisadas lendo o código.
