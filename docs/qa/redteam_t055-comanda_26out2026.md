# QA Red Team — T-05.5 Fase A, comanda do garçom (frontend)
**Branch:** feature/t055-comanda · **Dev:** Sirlande · **Base:** develop@72ef709 · **Data:** 26/10/2026
**Arquivos auditados:** 19 (`App.tsx`, `features/accounts/**` com 13 arquivos de código e 3 de teste, `api-client/openapi.json` e `src/schema.d.ts`)
**Achados no escopo:** 12 (🔴 0 · 🟡 5 · 🟢 7) · **Repassados:** 0

## Veredito
**APROVADO COM RESSALVAS**

Nenhum achado é 🔴: o diff não vaza dado, não grava valor errado no servidor e não quebra contrato. O que
falha está na tela e na fila. Dois achados, porém, levam a **cobrança errada do hóspede** quando a rede
está ruim, que é justamente o cenário para o qual a fila existe:
- 🟡-1: o "Desfazer" aparece, mas não faz nada.
- 🟡-2: o item some da tela depois de gravado, e o garçom lança de novo.

Recomendo corrigir esses dois e o 🟡-3 antes do merge.

## Achados no escopo

### 🟡-1 [Fila / dinheiro] O botão "Desfazer" continua na tela depois que a janela fecha, e o toque nele não faz nada
**Onde:** `components/ItemList.tsx:114` (o botão aparece só por `status === 'undo'`, sem olhar o prazo). `queueCore.ts:85` (`undoTap` ignora o toque sem avisar quando `now >= undoUntil`). `queueStore.ts:281-300` (`flushing` é global e o envio é sequencial). `accountsApi.ts:229` (o `POST` não tem timeout).
**Cenário:** o garçom toca em "Cerveja". Aos 5 s a janela vence, mas nada redesenha a tela: o status só muda quando o `flush` chama `markSending`. Se um envio anterior estiver pendurado no Wi-Fi da piscina (o `fetch` sem `signal` pode ficar minutos esperando), o `flush` não roda e a entrada fica "Lançado" com "Desfazer" o tempo todo. Aos 8 s o garçom toca em "Desfazer": `undoTap` devolve a lista igual e a tela não muda. Quando a rede volta, a cerveja vai para a conta e o hóspede paga um item que o garçom achou que tinha desfeito. Sem rede pendurada, essa janela existe do mesmo jeito, entre o fim do prazo e o próximo tick (até 1 s).
**Regra violada:** CA-05.5.g ("desfeito, nunca chega ao servidor"). A tela também não pode mostrar uma ação que não existe mais (RNF-026).
**Correção sugerida:** em `ItemList`, mostrar "Desfazer" só enquanto `Date.now() < entry.undoUntil` e agendar um re-render para o fim da janela (um `setTimeout` por entrada, ou um tick do store que faça commit quando a janela vence). Em `postItem`, passar `signal: AbortSignal.timeout(10_000)`. O aborto cai no `catch` e vira `'network'` → retry. Assim um envio pendurado não segura a fila inteira.

### 🟡-2 [Fila / duplicação] O item gravado some da conta até o fim da rodada, e o garçom lança de novo
**Onde:** `queueStore.ts:296` (o `applyOutcome('saved')` tira a entrada da fila na hora) e `queueStore.ts:325-328` (a invalidação de `accountKeys.detail` só acontece quando o `flush` inteiro termina).
**Cenário:** a fila tem a "Cerveja" da Mesa 5 e, logo atrás, um item da Mesa 7. A cerveja grava (201) e sai da fila local. A Mesa 7 fica pendurada na rede (ver 🟡-1). O `GET /accounts/:id` da Mesa 5 só é invalidado quando a rodada acaba. Até lá, a cerveja não está nem na lista local nem nos itens do servidor, que estão desatualizados, e o rodapé cai R$ 12,00. O garçom acha que o toque se perdeu e toca de novo. O novo toque recebe outro `client_item_id`, e a cerveja entra duas vezes na conta. Com rede boa o buraco é curto (a latência do GET), mas o item ainda pisca: some e volta.
**Regra violada:** CA-05.5.f (a tela nunca pode fingir um estado que não é o real). O resultado é o mesmo do lançamento duplicado que a idempotência (RN-008) deveria evitar.
**Correção sugerida:** invalidar `accountKeys.detail(entry.accountId)` logo depois de cada `saved`/`excluded`/`rejected`, e não só no fim. Melhor ainda: com o 201, aplicar `item` e `account_total` da resposta no cache (`setQueryData`) antes de tirar a entrada da fila.

### 🟡-3 [Offline / estados da tela] Com rede ruim, a conta e o cardápio que já estavam na tela viram tela de erro, e a mensagem sai em inglês técnico
**Onde:** `AccountPage.tsx:31` (`if (isError || !account)`), `AccountPage.tsx:35` (`error?.message`), `components/MenuGrid.tsx:169` (`if (isError) return <ErrorState …>`), `accountsApi.ts:199-202`.
**Cenário A, Wi-Fi instável (`navigator.onLine` true e `fetch` falhando):** um item grava e invalida a conta. O refetch falha duas vezes (`retry: 1`, em `lib/queryClient.ts:10`). No TanStack Query 5, um refetch que falha deixa `isError = true` e mantém o `data`. A `AccountPage` olha `isError` primeiro e troca a conta inteira, cardápio incluído, por "Failed to fetch" (no Safari, "Load failed") e "Tentar de novo". O garçom perde o cardápio no momento em que a fila deveria segurar o lançamento. O mesmo vale para o `MenuGrid` quando o cardápio passa dos 5 min de `staleTime`.
**Cenário B, offline de verdade:** sem rede, o garçom volta à lista (que está em cache) e abre a Mesa 7, que ele não visitou nos últimos 5 min (`gcTime`). A query fica pausada, então `isLoading` e `isError` são false e `account` é undefined. A tela cai no ramo de erro e mostra "Conta não encontrada.". O garçom conclui que a mesa foi fechada, e não consegue lançar nela.
**Regra violada:** CA-05.5.f ("erro de rede não aparece como falha, aparece como 'na fila'"). Fere também os quatro estados por tela e a regra "erro diz o que fazer" (§4.2).
**Correção sugerida:** renderizar o conteúdo sempre que houver `data`. Erro de refetch vira um aviso discreto ("sem conexão — mostrando o último estado"). Separar `fetchStatus === 'paused'` ("Sem conexão. A conta aparece quando a rede voltar.") de 404 real (`ApiError.status === 404`). Não repassar `error.message` cru de `TypeError`. Se for barato, semear `accountKeys.detail` com o que a lista já tem (rótulo, tipo, status), para o cardápio abrir e a fila funcionar mesmo sem os itens.

### 🟡-4 [Fila / aparelho compartilhado] A fila de outro usuário aparece, conta no total, pode ser desfeita e trava o fechamento, mas nunca é enviada
**Onde:** `AccountPage.tsx:27` (`mine` filtra só por `accountId`), `AccountPage.tsx:28` e `:40` (`pendingFor`/`footerTotals` sem `ownerId`), `AccountsListPage.tsx:141`, `components/StaffActions.tsx:287`. O envio, por outro lado, filtra por dono (`queueCore.ts:96`, `queueStore.ts:319`).
**Cenário:** o garçom A lança 2 itens na Mesa 5 sem rede e encerra o turno com logout. `logout()` (`stores/auth.ts:54`) não toca na fila. O garçom B, ou a recepção, entra no mesmo tablet do bar. Os itens de A aparecem como "Na fila" eternamente, porque o runner de B não envia o que é de A. Eles entram no rodapé ("inclui R$ 24,00 na fila"), aparecem como "2 na fila" na lista e, na recepção, deixam "Fechar conta" desabilitado com "Espere os lançamentos da fila chegarem ao sistema." O desbloqueio só vem se A voltar a logar **neste** aparelho. Se A não voltar, a conta fecha em outro terminal sem os 2 itens, o hotel deixa de cobrar e nada avisa. Na janela de 5 s, B ainda consegue desfazer um toque de A (`undoTap` não confere o dono).
**Regra violada:** CA-05.5.f (a tela não pode fingir), RNF-026 (motivo de bloqueio que ninguém consegue resolver) e risco de receita (item consumido e não cobrado).
**Correção sugerida:** a decisão de não reenviar com o token de outro usuário está certa, porque o `created_by` sairia errado. O que falta é tratar o caso:
- filtrar `mine`, `pendingFor` e o bloqueio de fechamento pelo usuário logado;
- mostrar os itens de outro dono num aviso separado ("2 lançamentos de <nome> não enviados neste aparelho");
- antes do logout, avisar quando houver fila pendente. Isso toca a sessão e exige acordo com o Gabriel. Sem esse acordo, registrar como pendência.

### 🟡-5 [Fila / várias abas] Duas abas sobrescrevem a fila uma da outra no localStorage
**Onde:** `queueStore.ts:256` (`entries` é lido do armazenamento uma vez, no import do módulo) e `queueStore.ts:259-262` (`commit` grava a cópia em memória por cima da do disco). Não há listener do evento `storage`.
**Cenário:** a recepção abre a Mesa 5 numa aba e a Mesa 7 em outra, e as duas carregam a fila vazia. A rede cai. Na aba 1 entra "Água" (o disco fica `[água]`). Na aba 2 entra "Suco", e a aba 2, que não conhece a água, grava `[suco]` no disco. A recepcionista fecha a aba 1, ou recarrega o navegador. A água deixa de existir: não foi enviada nem ficou no disco. O consumo é perdido sem nenhum aviso.
**Regra violada:** CA-05.5.e (fila persistida no aparelho). Os comentários `queueStore.ts:228-229` prometem que a fila "sobrevive a recarregar a aba".
**Correção sugerida:** antes de cada `commit`, reler o disco e mesclar por `clientItemId`, ou escutar `window.addEventListener('storage', …)` e mesclar. O reenvio da mesma entrada pelas duas abas é seguro, porque o backend responde 200 no replay (`CreateAccountItemController.js:107-110` e `:202-205`).

### 🟢-1 [Testes] O motor da fila (`queueStore.flush`/`useQueueRunner`) não tem teste
**Onde:** `queueStore.ts:287-339`. Os 40 testes cobrem só `queueCore`, `accountTotals` e `accountFilter`.
**Cenário:** se alguém apagar o `break` do 401 (`:299`), trocar `entries` por `snapshot` no `applyOutcome` (`:296`, o que perderia o toque feito durante o `await`) ou remover a invalidação (`:327`), todos os testes continuam verdes. O Playwright pegou o fluxo feliz, mas não pega regressão.
**Correção sugerida:** um teste do `flush` com `postItem` mockado cobrindo: ordem, 401 que para a rodada, retry que para a rodada, toque durante o `await` preservado e contas tocadas devolvidas.

### 🟢-2 [Fila] Uma entrada que recebe 5xx sempre fica presa para sempre e não dá para dispensar
**Onde:** `queueCore.ts:129` e `:153-156`. `ItemList.tsx:119` só oferece "OK" para `rejected`/`excluded`.
**Cenário:** um 500 que se repete para um produto específico (constraint não mapeada, por exemplo) faz a entrada voltar à fila a cada 30 s, sem fim. Ela fica "Na fila" e, na recepção, bloqueia o fechamento (`StaffActions.tsx:287`). O garçom não tem como tirá-la dali.
**Correção sugerida:** depois de N tentativas com 5xx (não de rede), passar a entrada para `rejected` com "O sistema não aceitou. Avise a gerência.". Falha de rede continua retentando sem limite.

### 🟢-3 [Robustez] `isEntry` aceita uma entrada sem `unitPrice`/`status`, e a tela da conta quebra no render
**Onde:** `queueStore.ts:245-254` (valida só `clientItemId` e `accountId`), `ItemList.tsx:102` (`decimalToCents(entry.unitPrice)` lança `MoneyParseError`, ou `TypeError` se o valor for undefined).
**Cenário:** uma versão futura renomeia um campo da entrada. O que já está gravado nos celulares passa no `isEntry` e derruba a `AccountPage` em toda abertura, até alguém limpar o localStorage. Além disso, uma entrada sem `status` nunca é enviada.
**Correção sugerida:** validar todos os campos (`status` dentro da allowlist, `unitPrice` por regex de decimal, `quantity` inteiro > 0) e descartar o que não bate. Se quiser, versionar a chave (`gesway-comanda-fila-v1`).

### 🟢-4 [UX / fechamento] "Confirmar fechamento" fica armado sem prazo e ignora o bloqueio que surge depois
**Onde:** `components/StaffActions.tsx:339-346`.
**Cenário:** a recepcionista toca em "Fechar conta" e depois toca num produto, o que cria um pendente na janela de desfazer. O "Confirmar fechamento" continua habilitado, porque não olha `blocked`. Ela confirma, e o item recebe 422 ("A conta foi fechada…"). Também é possível deixar o botão armado e alguém confirmar minutos depois.
**Correção sugerida:** `disabled={close.isPending || !!blocked}` no botão de confirmação e desarmar sozinho depois de uns 5 s.

### 🟢-5 [Linguagem] O rodapé "Total" da conta da suíte não é o total do bill
**Onde:** `AccountPage.tsx:70` com `account.total`, que é só consumo (`accountTotal.js:23-30`), comparado com `StaffActions.tsx:294` ("Total" do bill = diárias + consumo).
**Cenário:** numa suíte com diária, a recepção vê na mesma tela "Total R$ 80,00" no rodapé e "Total R$ 880,00" no bill. Ao informar o hóspede, pode passar o valor errado.
**Correção sugerida:** chamar o rodapé de "Consumo" quando `charges_lodging`, ou sempre. Dica relacionada: um `balance` negativo (D-44) aparece como "Saldo −R$ 50,00". Para o balcão, "Crédito do hóspede R$ 50,00" é mais claro.

### 🟢-6 [Acessibilidade] O lançamento e o bloqueio não são anunciados
**Onde:** `ItemList.tsx:82-130` (lista sem `aria-live`) e `MenuGrid.tsx:193-200` (o motivo de desabilitado não está ligado aos botões).
**Cenário:** com leitor de tela, o toque no produto não confirma nada. Os botões desabilitados também não dizem por quê.
**Correção sugerida:** uma região `aria-live="polite"` com "Cerveja lançada, desfazer disponível" e `aria-describedby` apontando para o parágrafo do motivo.

### 🟢-7 [Fila] O envio para fora da `/comanda`
**Onde:** `useQueueRunner` está montado só em `AccountsListPage.tsx:96` e `AccountPage.tsx:22`.
**Cenário:** a recepção lança um item e vai para Hóspedes ou Reservas. O item fica parado até ela voltar à comanda. O garçom não é afetado, porque só tem a comanda.
**Correção sugerida:** registrar como pendência. Montar o runner no AppShell exige acordo com o Gabriel.

## Repassados a outro dev
Nenhum.

## O que foi verificado e está correto
- **api-client:** regenerei o `openapi.json` a partir do `config/swagger.js` atual e rodei o `openapi-typescript` no scratchpad. Os dois arquivos saíram **idênticos** aos do diff. `AccountDetail.total`, `AccountBill.{room_charges,consumptions,total,payments_made,balance}` e `Product.price` existem como string. O `GET /accounts/:id` devolve `total` (`GetAccountController.js:239`) e os itens em ordem `created_at ASC` (`:235`), então `slice(-3)` em `ItemList.tsx:72-73` mostra de fato os 3 últimos.
- **Dinheiro:** nenhum `Number()`/`parseFloat` no diff. Tudo passa por `decimalToCents`/`multiplyCents`/`sumCents`/`formatBRL`, e `decimalToCents` aceita valor negativo (`money.ts:33`). O preço local é só para exibição: o corpo do POST (`queueCore.ts:187-189`) não manda preço, e o servidor recalcula (`CreateAccountItemController.js:124-137`).
- **Idempotência:** o `client_item_id` nasce no toque. A mesclagem de quantidade só acontece enquanto a entrada está em `undo` e dentro do prazo (`queueCore.ts:62`), e o `flush` só pega o que já venceu o prazo (`:97`), então uma entrada não é mesclada depois de enviada. No servidor, o replay vem antes do status da conta (`CreateAccountItemController.js:107-110`), e o reenvio depois do fechamento devolve 200. A corrida entre dois envios cai no `UniqueConstraintError` → replay (`:202-205`). Dentro de uma aba, `tap` durante o `await` não se perde, porque `applyOutcome` usa `entries` atual e não o snapshot.
- **UUID v4** gerado com `getRandomValues`, com os bits de versão e variante certos (`queueCore.ts:195-201`).
- **Classificação das respostas** confere com o backend: 403 D-21 (`:113-117`), 404 de conta e produto, 422 de conta fechada, de ROOM sem check-in e de produto inativo, 400 `{errors}`, 409 de outra conta.
- **401:** `onUnauthorized` derruba a sessão (`lib/api.ts:16-20`), `ownerId` vira undefined e o runner para. A fila fica no disco e volta no próximo login do mesmo usuário.
- **LGPD:** a fila guarda `ownerId` (UUID do usuário), `accountId`, `productId`, o nome do produto e o preço. Não guarda dado de hóspede. O rótulo da suíte vem do backend sem nome (D-15). O `console.error` do 409 registra só o UUID e a mensagem.
- **Papel:** `StaffActions` só aparece para ADMIN/RECEPTIONIST (`AccountPage.tsx:41,76`), e o backend repete o `requireRole` em `/bill` e `/close` (`accountRouter.js:26-27`). A rota continua dentro do `RequireRole` existente e o diff não muda nav/AppShell. O garçom só abre TABLE/DIRECT (`OpenAccountForm.tsx:217-220`).
- **Fechar:** o bloqueio de conta de diária no frontend é o mesmo do backend (`CloseAccountController.js:302`), e o 503 de migração aparece pela mensagem do backend.
- **Regra 9 / restrições:** nenhum `<button>`/`<input>` cru, `fetch` direto, `as unknown as` ou cor hex no diff. O `Button` de `@hotel/ui` usa `type="button"` por padrão, então os botões de tipo dentro do `<form>` não submetem. `min-h-touch` = 48 px (`tailwind-preset.js:45`).
- **Status com cor + rótulo** em `EntryState` (`ItemList.tsx:38-46`). Cortesia aparece riscada, com rótulo e somando zero (`accountTotals.ts:337-347`), de acordo com `accountTotal.js:26` (`billable: true`).

## Não foi possível verificar
- Comportamento real de `fetch` pendurado no navegador do celular (quanto tempo até falhar). O 🟡-1 e o 🟡-2 se apoiam na falta de timeout no código e na semântica conhecida do `fetch`, não em medição.
- A semântica do TanStack Query no 🟡-3 (refetch com erro mantém `data` e liga `isError`; query pausada sem cache não liga `isLoading`) é a documentada da v5. Não rodei o cenário no navegador.
- Não rodei a suíte nem o Playwright. Confiei na verificação relatada (40 testes, tsc, build, 18 checagens em 375×812).
