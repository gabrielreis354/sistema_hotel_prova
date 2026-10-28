# QA Red Team — T-05.5 comanda (segunda reauditoria delta)
**Branch:** feature/t055-comanda · **Dev:** Sirlande · **Escopo:** `bea0a0e..51dba9a` (commits 49b0131, 51dba9a) · **Data:** 26/10/2026
**Arquivos auditados:** 7 (`queueCore.ts`, `queueCore.test.ts`, `queueStore.ts`, `accountsApi.ts`, `AccountPage.tsx`, `AccountsListPage.tsx`, `components/StaffActions.tsx`)
**Achados no escopo:** 4 (🔴 0 · 🟡 0 · 🟢 4) · **Repassados:** 0

Auditorias anteriores: `redteam_t055-comanda_26out2026.md` e `redteam_t055-comanda_delta_26out2026.md`.

## Veredito
**APROVADO.** Os quatro achados de código da reauditoria anterior (D-1, D-2, D-3, D-5) estão fechados.
Nenhuma correção abriu um problema 🔴 ou 🟡. O que sobra é limitação documentada ou lacuna de teste (🟢).

## Situação das correções

| Achado | Situação | Onde |
|---|---|---|
| D-1 Fechamento sem aviso no aparelho com itens de outro usuário | **Fechado**, nos termos da decisão "avisar sem bloquear". O aviso aparece na conta (`AccountPage.tsx:44,95-100`) e junto do botão (`StaffActions.tsx:83-88`). O botão de confirmação muda o texto para "Fechar mesmo assim" (`:100`), e o `aria-describedby` aponta para o aviso (`:106`). A lista nomeia as contas só depois de carregar (`AccountsListPage.tsx:28-30`). | ver 🟢-1 |
| D-2 `AbortSignal.timeout` ausente | **Fechado.** `timeoutSignal` (`queueCore.ts:139-144`) usa AbortController quando falta a função. O AbortError cai no `catch` de `postItem` (`accountsApi.ts:71-72`) e vira `'network'`, ou seja, nova tentativa. O grep em `src/` não acha outro uso de `AbortSignal.timeout`. O timer do fallback não é cancelado, mas isso é inofensivo: abortar um fetch que já terminou não tem efeito, e o timer dura no máximo 10 s. | — |
| D-3 Item preso em "Enviando" deixado por uma aba fechada | **Fechado.** Ver a análise abaixo. | `queueCore.ts:128-132`, `queueStore.ts:126-127,133` |
| D-5 Envio com o token de outro usuário | **Fechado.** Antes de cada `markSending`/`postItem`, o código confere de novo o token e o `user.id` (`queueStore.ts:131-132`). Entre essa checagem e a chamada de `postItem` não há `await`, então o usuário não consegue trocar nesse intervalo. Os itens não enviados continuam `queued` e saem no próximo login do dono. | ver 🟢-3 |

### D-3: as duas perguntas do pedido
- **A própria aba pode ter um envio em andamento há mais de 15 s?** Não. `recoverStale` só roda dentro de `flush`, e `flush` não começa enquanto `flushing` está ligado (`queueStore.ts:123-127`). Assim, a aba que está enviando nunca recupera o próprio envio. O risco é outra aba ainda viva, mas suspensa (celular bloqueado, aba em segundo plano congelada). Nesse caso o `AbortSignal.timeout` também para, porque conta tempo ativo, então o envio pode passar de 15 s. A aba B devolve o item à fila e envia de novo com o mesmo `client_item_id`. O backend trata esse reenvio sem duplicar: `CreateAccountItemController.js:107-109` devolve 200 com o item original (antes de checar o status da conta), e `:202-208` cobre a corrida no índice único. Quando a aba A volta, o `applyOutcome` dela não faz nada se o item já saiu da fila, ou deixa o item `queued` e ele é reenviado de novo, também sem duplicar. **Não há cobrança dupla.** O custo é só um POST a mais.
- **Entradas antigas sem `sendingSince` contam como paradas na hora:** está ok. Só uma aba com o bundle anterior ao deploy ainda aberta gravaria `sending` sem esse campo. Pior caso: um reenvio que o servidor reconhece pelo `client_item_id`. As entradas antigas já em disco também seriam devolvidas à fila pelo `recoverAfterReload` no próximo carregamento. Ver 🟢-2 sobre o valor padrão.

## Achados no escopo

### 🟢-1 [UX / dinheiro, limitação aceita] O aviso do D-1 só aparece no aparelho que guarda os itens; a lista avisa justamente quem não pode fechar
**Onde:** `AccountsListPage.tsx:48-52`, `AccountPage.tsx:44`
**Cenário:** o tablet compartilhado guarda 2 itens do garçom A na "Mesa 4". A recepção fecha a Mesa 4 **no computador do balcão**, onde não há nenhum aviso. Quando A entra de novo, os itens são recusados com "A conta foi fechada e não aceita item novo". O consumo não some sem rastro, porque A vê a recusa, mas a cobrança depende de alguém agir manualmente. A frase "não feche essas contas antes" aparece na lista para quem está logado no tablet, que normalmente é outro garçom (WAITER não fecha conta: `AccountPage.tsx:65`).
**Regra violada:** nenhuma. É o limite da decisão "avisar, não bloquear", que só conhece o que está neste aparelho.
**Correção sugerida:** nada no código agora. Registrar no anexo de decisões que o aviso cobre só o aparelho compartilhado, e que a mitigação nos outros aparelhos é operacional: o garçom entra de novo antes de passar o aparelho adiante.

### 🟢-2 [Robustez] `markSending(..., now = 0)`: chamar sem `now` cria uma entrada que já nasce parada
**Onde:** `queueCore.ts:115`
**Cenário:** uma chamada futura `markSending(entries, id)` sem o terceiro argumento grava `sendingSince: 0`. Qualquer outra aba vê isso como parado no próximo tick (`queueCore.ts:129`) e reenvia o item enquanto o primeiro POST ainda está em andamento. O servidor não duplica, mas a proteção do D-3 deixa de valer. Hoje a única chamada passa `Date.now()` (`queueStore.ts:133`).
**Correção sugerida:** tornar `now` obrigatório.

### 🟢-3 [Testes] D-1, D-5 e o caso de entrada antiga do D-3 não têm teste unitário. Removê-los mantém o vitest verde
**Onde:** `queueStore.ts:131-132`, `StaffActions.tsx:83-106`, `queueCore.test.ts:195-211`
**Cenário:** apagar as linhas 131-132 de `queueStore.ts` (checagem de sessão), ou trocar `othersHere` por `0` em `AccountPage.tsx:120`, não derruba nenhum dos 46 testes. A cobertura existe só no roteiro Playwright, que roda manualmente. Em `recoverStale`, o caso sem `sendingSince` (entrada antiga) e o limite exato (`>` contra `>=`) também ficam sem teste.
**Correção sugerida:** um teste de `recoverStale` com entrada sem `sendingSince`. Se for barato, um teste do `flush` com `useAuthStore` trocado entre dois envios (mock de `postItem`). É o mesmo padrão do 🟢-1 da primeira auditoria.

### 🟢-4 [UX] O rótulo do botão de confirmação pode mudar durante os 5 s da confirmação; "conta já fechada" é um palpite
**Onde:** `StaffActions.tsx:51-55,100`, `AccountsListPage.tsx:29`
**Cenário:** (a) a recepção toca em "Fechar conta" e chega um item de outro usuário pelo evento `storage`. O botão passa de "Confirmar fechamento" para "Fechar mesmo assim" debaixo do dedo, e a confirmação não é cancelada, porque só `blocked` cancela. O aviso aparece ao lado, então o efeito é pequeno. (b) Com a lista vinda do cache e a rede pausada, uma conta aberta depois do último fetch aparece como "conta já fechada".
**Correção sugerida:** (a) cancelar `confirming` quando `othersPending` mudar. (b) usar "conta não encontrada na lista" ou mostrar só o número. Opcional.

## Repassados a outro dev
nenhum.

(Pré-existente, fora deste delta e já conhecido: `recoverAfterReload` na carga do módulo (`queueStore.ts:55`) devolve à fila, só na memória, o envio em andamento de outra aba viva. O efeito é o mesmo reenvio sem duplicação descrito no D-3. Não é achado novo.)

## O que foi verificado e está correto
- `recoverStale` devolve a mesma referência quando nada está parado (`queueCore.ts:130`), então a aba não regrava o disco a cada tick. O teste cobre (`queueCore.test.ts:207-210`).
- `isQueueEntry` aceita `sendingSince` ausente ou numérico (`queueCore.ts:261`). Entradas antigas não são descartadas.
- `recoverStale` sobre itens de outro dono só os devolve a `queued`. Eles não são enviados, porque `readyToSend` filtra por `ownerId`.
- O D-5 vale também para a rodada que já estava em andamento quando o usuário saiu (o efeito do `useQueueRunner` é desmontado, mas o loop continua e é interrompido pela checagem).
- Os rótulos da lista vêm de `GET /accounts?status=OPEN`, que não pagina, é filtrado por tenant e não traz dado do hóspede (`ListAccountController.js:16-39`).
- Reenvio para uma conta fechada depois do lançamento: o servidor devolve 200 (o replay vem antes da checagem de status), então o item já gravado não aparece como recusado.
- `{othersAccounts.length > 0 && ...}` com tamanho 0 não renderiza nada (é `false`, não `0`).

## Não foi possível verificar
- Não rodei o vitest nem o Playwright. Os números 46, 18/18 e 15/15 são os informados pelo dev.
- O comportamento real do timer do fallback no iOS 15 com a aba em segundo plano. Isso só afeta a latência; como o reenvio não duplica, a correção não depende disso.
