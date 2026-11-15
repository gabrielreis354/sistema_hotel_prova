# QA Red Team — comanda-acabamento (faixa "sem conexão" + contagem do Desfazer)
**Branch:** fix/comanda-acabamento · **Dev:** Gabriel · **Base:** develop@c62cdba · **Data:** 15/11/2026
**Arquivos auditados:** 8 (diff) + contexto: queueStore.ts, queries.ts, Notice (local e @hotel/ui), Button (@hotel/ui), onlineManager do @tanstack/query-core 5.101.4
**Achados no escopo:** 7 (🔴 0 · 🟡 3 · 🟢 4) · **Repassados:** 0

## Veredito
**APROVADO COM RESSALVAS**

Nenhum 🔴. A fila, a janela de 5 s, a API e o backend não mudaram: `awaitsServer` é extração
pura de `PENDING.includes` e `pendingFor` continua com o mesmo comportamento. Os testes passam
(30 arquivos, 348 testes), o `tsc --noEmit` passa e o `qa_checks.sh` sai com 0. Os 4 avisos
dele, incluindo os da regra 9, estão em arquivos fora desta branch. As ressalvas: a contagem
pisca um número errado depois do toque, a faixa fica muda quando a conta abre já sem rede, e
a queda de rede mais comum no salão não liga a faixa.

## Achados no escopo

### 🟡 [UI/UX — critério 2] A contagem mostra "(6 s)" ou "(65 s)" logo depois do toque
**Onde:** `frontend/apps/pms/src/features/accounts/components/ItemList.tsx:63` e `:158`, com a causa em `queueStore.ts:152-160` (`useNow`)
**Cenário:** `useNow(active)` devolve o `now` guardado no estado quando `active` é verdadeiro. Esse valor só se atualiza no `setInterval`, e o primeiro tique chega 250 ms depois do efeito.
- (a) Na conta aberta há 60 s, sem nenhuma janela de desfazer aberta, o garçom toca "Cerveja". No render do toque, `active` passa a verdadeiro e `now` ainda vale o horário da montagem (T−60 s). `undoSecondsLeft(T+5000, T−60000)` dá 65, e o botão pinta **"Desfazer (65 s)"** até o primeiro tique, uns 250 ms. A cada nova rodada de toques, o `now` é o último tique da rodada anterior, então o número pode ser qualquer um.
- (b) Com uma janela já aberta, cada toque novo (outro produto, ou o mesmo produto renovando a janela) usa um `now` até 250 ms mais velho que o toque. `ceil((5000+δ)/1000)` dá **6**. No toque em rajada ("3 cervejas"), o botão mostra "(6 s)" depois de cada toque.

O critério diz "mostra quanto falta da janela de 5 s". O teste `ItemList.test.tsx:12` ("logo depois do toque mostra 5") só passa porque recebe um `now` fresco. Os testes com `renderToString` nunca chegam ao `now` velho do hook, porque lá o `useState` inicializa com `Date.now()` e o `useEffect` não roda. Confirmei lendo o código. Não executei, porque o pacote não tem DOM (sem jsdom ou happy-dom) para montar o hook.
**Regra violada:** critério de aceite 2. Antes desta branch o `now` velho não aparecia na tela, só deixava o botão visível até 250 ms a mais. A branch passou a mostrar esse valor.
**Correção sugerida:** a menor é limitar o valor em `undoSecondsLeft`, com `Math.min(UNDO_MS / 1_000, Math.max(0, Math.ceil(...)))`, mais um teste com `now < undoUntil − UNDO_MS`. A alternativa na causa é o `useNow` devolver `Date.now()` no render em que `active` vira verdadeiro (ou `Math.max(now, Date.now())`).

### 🟡 [A11y — critério 1] A faixa não é anunciada quando a conta abre já sem rede
**Onde:** `frontend/apps/pms/src/features/accounts/components/OfflineBanner.tsx:17-25`, `AccountPage.tsx:95`
**Cenário:** sem rede, o garçom está na lista de contas (que mostra "Sem conexão com o sistema: mostrando a última lista") e abre uma conta que está no cache. A `AccountPage` monta, e o `OfflineBanner` nasce com a região `status` **já preenchida**. O comentário do próprio componente (linhas 6-9) diz que leitor de tela não anuncia região viva que nasce preenchida, e esse é o caso. O aviso só é lido se a rede cair com a tela já aberta. O mesmo problema aparece se a conta ainda carregava quando a rede caiu: a região só monta depois que `account` existe (`AccountPage.tsx:52-68`).
**Regra violada:** critério 1 ("anunciado por leitor de tela"). O repositório já resolveu esse caso no `Notice` local (`components/Notice.tsx:8-9, prop focus`, 🟢-1 de um red team anterior), e a faixa não usou esse padrão.
**Correção sugerida:** mover o foco para a faixa quando ela monta já offline (o mesmo `focus` do `Notice` local), ou deixar a região `status` fora do `if (!account)`, para ela existir antes do conteúdo.

### 🟡 [Estados de rede] Wi-Fi sem internet ou servidor fora do ar não ligam a faixa, e o garçom continua lançando às cegas
**Onde:** `frontend/apps/pms/src/features/accounts/connection.ts:12-18`, `AccountPage.tsx:95-101`, `queries.ts:24-30`
**Cenário:** o `onlineManager` da v5 instalada (5.101.4) começa em `true` e só muda com os eventos `online`/`offline` do `window` (`query-core/build/modern/onlineManager.js`). O navegador só dispara `offline` quando a interface de rede cai. O caso mais comum no salão é Wi-Fi conectado e sem saída para a internet, ou o backend fora do ar. Nesse caso `navigator.onLine` fica `true`, a faixa nunca aparece, e o `postItem` falha com `retry`, que deixa os lançamentos em `queued` com `attempts` subindo. A linha antiga também não aparece: `useAccount` não tem `refetchInterval` e o `flush` só invalida a conta depois de `saved` ou `rejected` (`queueStore.ts:138-141`), então `stale` fica `false`. O que o garçom vê é só o "Na fila" de cada linha, ou seja, o achado 7 de 26/10 ("lançava sem saber que estava sem rede") continua valendo nesse cenário. Não é regressão (antes era igual), mas a branch diz que resolve o achado 7, e isso só vale para o modo avião ou o Wi-Fi desligado.
**Regra violada:** critério 1, que, na leitura do garçom, inclui a rede que não funciona.
**Correção sugerida:** usar a própria fila como evidência: `const offline = !online || mine.some((e) => e.status === 'queued' && e.attempts > 0)`. A fila já sabe que o envio falhou por rede (`classifySend` → `retry`). Se a decisão for não cobrir esse caso, registrar como pendência e não dar o achado 7 por resolvido.

### 🟢 [UX — decisão do implementador] A contagem soma pendências de todas as contas, e o texto não diz isso
**Onde:** `AccountPage.tsx:48-50`, `connection.ts:28-29`
**Cenário:** o garçom lançou 2 itens na Mesa 4 e 1 na Suíte 12 e está na Suíte 12, sem rede. A faixa diz "3 lançamentos aguardando a rede.", mas a lista mostra 1 item na fila e o rodapé diz "inclui R$ 12,00 na fila". Os números não batem na mesma tela.
**Julgamento:** contar o aparelho inteiro faz sentido, porque a queda é do aparelho e esse é o número que importa antes de fechar o turno. Filtrar por `ownerId` (só `mine`) também está correto para o aparelho compartilhado. O que falta é o texto deixar claro o alcance.
**Correção sugerida:** "3 lançamentos aguardando a rede (2 em outras contas)." ou "…neste aparelho.".

### 🟢 [A11y] Releitura a cada toque sem rede
**Onde:** `OfflineBanner.tsx:18`, `AccountPage.tsx:125`
**Cenário:** `role="status"` já implica `aria-atomic="true"`. Sem rede, cada toque muda o `waiting` (o toque em `undo` já conta), e o leitor relê a faixa inteira ("Sem conexão: os lançamentos serão enviados… 4 lançamentos aguardando a rede."). Ao mesmo tempo, o `status` do rodapé ("inclui R$ X na fila") também muda. São dois anúncios por toque. Ao contrário do critério 2, o critério 1 não pede silêncio, então é só ruído.
**Correção sugerida:** tirar a contagem da região viva (deixar só o lead e a mensagem dentro do `status`, com a contagem num irmão fora dele), ou usar `aria-atomic="false"` com a contagem num nó próprio.

### 🟢 [DRY/design system] A faixa reimplementa o `Notice` do @hotel/ui à mão
**Onde:** `OfflineBanner.tsx:20`
**Cenário:** o comentário diz "mesmo desenho do `Notice` do @hotel/ui", mas as classes estão copiadas, com um tom âmbar que o `NOTICE_TONE` (`packages/ui/src/Notice.tsx:4-7`) não tem. O próximo aviso de "atenção" vai copiar de novo. A regra 9c não pegou porque as classes só aparecem uma vez.
**Correção sugerida:** quando um segundo módulo precisar, criar o tom `warning` no `NOTICE_TONE` (border-status-cleaning). Por enquanto, só registrar.

### 🟢 [Testes] `useOnline` testado só pelo snapshot de servidor
**Onde:** `connection.test.tsx:62-69`, `connection.ts:14-17`
**Cenário:** o teste "aparece… e some quando a rede volta" faz dois `renderToString` independentes. Os dois leem `getServerSnapshot`, então nenhum deles exercita o `subscribe`, ou seja, um componente montado sendo re-renderizado quando o `onlineManager` muda. Também não há teste da decisão de `AccountPage.tsx:97` (linha antiga escondida sem rede e mostrada com `stale && online`). Se alguém trocar `online` por `!online` ali, nenhum teste falha.
**Correção sugerida:** extrair a decisão para uma função pura (`connectionNotice({ online, stale })` → `'banner' | 'stale-line' | null`) e testá-la. Para o `subscribe`, um teste que chame o callback passado a `onlineManager.subscribe` e confira que o listener é chamado.

### Observações sem achado
- **375 px:** o botão passou de "Desfazer 1" para "Desfazer 1 (5 s)", uns 40 px a mais (text-base com px-4, mais o span text-sm). O nome do produto (`truncate`) perde esse espaço, e numa largura útil de ~317 px sobram ~145 px para a descrição. É aceitável e o alvo continua ≥48 px. O `Button` já tem `tabular-nums`, então a largura não oscila de 5 para 4. A mistura de text-base com text-sm dentro do botão é escolha visual, não defeito.
- **Nome acessível:** "Desfazer: Cerveja, disponível por 5 segundos após o toque" começa pelo texto visível "Desfazer", então cumpre o WCAG 2.5.3. Não muda com o tique, o que atende o critério 2.

## Repassados a outro dev
nenhum

A causa do primeiro 🟡 está no `useNow` (`queueStore.ts`, da área da Sirlande, T-05.5). Mantive o achado no escopo porque o sintoma só existe por causa desta branch, e a correção mínima (limitar o valor em `undoSecondsLeft`) também é desta branch.

## O que foi verificado e está correto
- `awaitsServer` tem a mesma semântica de `PENDING.includes` e `pendingFor` não mudou. Fila, `UNDO_MS`, `canUndo`, `readyToSend`, `flush`, API e backend estão intactos (critério 3).
- `canUndo` e `undoSecondsLeft` usam o mesmo `now` no render, então o 0 nunca aparece (o teste de varredura a cada 250 ms em `ItemList.test.tsx:25` prova isso para um `now` coerente).
- `undoAccessibleName` reaproveita `undoLabel` e `UNDO_MS` (DRY) e o span da contagem tem `aria-hidden`.
- A faixa filtra por `mine` (dono), sem contar a fila de outro usuário do aparelho.
- A linha antiga e a faixa nunca aparecem juntas, e com erro do servidor com rede a linha antiga continua aparecendo.
- Quando a rede volta, a faixa some (`onlineManager` → `online`) e a fila continua andando pelo `useQueueRunner`, que segue ouvindo `online`.
- O estado não é codificado só por cor: o texto começa com "Sem conexão". O contraste é texto gray-900 sobre tom 10%.
- Sem `require()`, sem `Number()` em dinheiro, sem PII em log. `tsc` limpo.
- `pnpm --filter ./apps/pms test`: 30 arquivos e 348 testes passando (Node 24). `qa_checks.sh` sai com 0, e os avisos da regra 9 são de `features/guests` e de um bloco de classes de outra área.

## Não foi possível verificar
- O comportamento do `useNow` com efeitos reais (primeiro 🟡): o pacote não tem ambiente DOM (jsdom, happy-dom ou test-renderer). A análise é determinística pelo código, mas não foi executada.
- O anúncio real em TalkBack/VoiceOver e a renderização em 375 px num aparelho: não houve navegador nesta auditoria.
- Os eventos `online`/`offline` com aba congelada ou restaurada no Android: SUSPEITA de que o `onlineManager` fique em `true` se a queda acontecer com a aba congelada e o evento não for entregue ao descongelar. Para confirmar, é preciso testar num aparelho.

## Desfecho (15/11/2026)

Os 3 🟡 e o 🟢 do alcance do texto foram corrigidos na mesma branch, com um commit para cada.
Cada um tem teste que falha sem a correção, e isso foi conferido por mutação: o código voltou ao
estado antigo, o teste ficou vermelho, e depois o código foi restaurado.

| Achado | Commit | Correção | Mutação que o teste pega |
|---|---|---|---|
| 🟡-1 contagem "65 s" / "6 s" | `a2bc9ff` | Na causa: o `useNow` passa a ler `Date.now()` no render, e o intervalo só força o render (a janela de 5 s não muda). Na defesa: `undoSecondsLeft` limitado a `UNDO_MS / 1000` | Tirar o `Math.min` deixa vermelho o teste com `now` anterior ao toque (T−60 s e T−200 ms) |
| 🟡-2 faixa muda ao abrir a conta já sem rede | `8c4b005` | A região `status` nasce sempre vazia e o texto entra depois da montagem (efeito). Foi escolhido no lugar do `focus` do `Notice`, porque mover o foco tiraria o garçom do lugar a cada conta aberta sem rede, e o aviso não pede ação. O custo é a faixa aparecer um quadro depois da conta | Renderizar o texto já no primeiro render deixa vermelho o teste "abrindo a conta já sem rede, a região nasce vazia" |
| 🟡-3 Wi-Fi sem internet ou servidor fora | `19ecf58` | `looksOffline(online, mine) = !online \|\| mine.some(e => awaitsServer(e) && e.attempts > 0)`. Inclui o `sending` que já tinha falhado, para a faixa não piscar a cada nova tentativa. Recusa do servidor não liga a faixa. Quando o envio grava, ela apaga | `offline = !online` deixa vermelhos 2 testes (o sinal da fila e a nova tentativa em andamento) |
| 🟢 alcance da contagem | `ba3ec6c` | "3 lançamentos aguardando a rede (2 em outras contas).", com variações para "1 em outra conta" e "em outras contas" | Ignorar o `elsewhere` no `OfflineNotice` deixa vermelho o teste de renderização |

**Ficam registrados, sem correção nesta branch:** 🟢 releitura da faixa a cada toque sem rede,
🟢 tom `warning` no `Notice` do @hotel/ui, 🟢 `subscribe` do `useOnline` e decisão da linha antiga
sem teste de função pura.

**Saída real (Node 24.14.0):**
```
$ pnpm --filter ./apps/pms test
 Test Files  30 passed (30)
      Tests  357 passed (357)
$ pnpm --filter ./apps/pms typecheck
> tsc --noEmit && tsc --noEmit -p tsconfig.node.json   (exit 0)
```

**Continua sem verificação:**
- **`useNow`:** ainda não foi montado com efeitos reais (o pacote não tem DOM). Quem cobre o sintoma é o limite em `undoSecondsLeft`, testado.
- **Anúncio no leitor de tela:** o anúncio da faixa depois da montagem não foi testado em TalkBack ou VoiceOver. Fica para o qa-explorador.
- **375 px com a faixa mais longa:** a contagem com "(2 em outras contas)" pode ocupar uma linha a mais. Fica para o qa-explorador.
- **Servidor fora:** um 5xx também liga a faixa, que diz "Sem conexão". É aceitável para o garçom, que vê o mesmo efeito: o lançamento não chega.
