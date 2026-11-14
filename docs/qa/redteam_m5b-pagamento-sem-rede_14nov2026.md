# QA Red Team — M5-b pagamento sem rede (PR #132) e combinação com o PR #141
**Branch:** fix/m5b-pagamento-sem-rede (6250d69) · **Dev:** Sirlande · **Base:** develop@4a9ecd6 (merge-base 0ff0021) · **Data:** 14/11/2026
**Combinação avaliada:** + fix/m5b-saldo-velho (a92caf9, PR #141), merge simulado num worktree temporário, já removido
**Arquivos auditados:** 5 do #132 (4 de código/teste, 1 de doc) + `PaymentForm.tsx`, `paymentLogic.ts`, `ReservationDetailPage.tsx`, `queryClient.ts` e `getBill` no merge
**Achados no escopo:** 4 (🔴 0 · 🟡 1 · 🟢 3) · **Repassados:** 0

## Veredito

| Cenário | Veredito |
|---|---|
| **#132 sozinho** | **APROVADO COM RESSALVAS** |
| **#132 + #141 (merge simulado)** | **APROVADO** (ressalvas só 🟢) |

Não há 🔴. Nenhum caminho do #132 gera pagamento fantasma ou duplicado, nem dentro dele nem
somado ao #141. O 🟡-1 só tem efeito com o #132 **sozinho**. A mensagem de "sem conexão"
sobrescreve o aviso "pode ter sido registrado" de um envio anterior. Depois disso, a
recepcionista pode repetir um pagamento que entrou. Na combinação, a conferência do saldo
(P-8) barra esse segundo envio, e o achado deixa de causar dano. **Ordem recomendada:
mergear os dois juntos.** Se o #132 entrar antes do #141, o 🟡-1 vale como ressalva.

Merge simulado: `develop` + #132 + #141 **sem conflito**. Em `frontend/apps/pms`, `vitest run`
deu **22 arquivos e 299 testes verdes**, e o `tsc --noEmit` passou limpo (query-core 5.101.4).

## Achados no escopo

### 🟡-1 [Dinheiro / Mensagem] "O pagamento não foi registrado" apaga o "pode ter sido registrado" do envio anterior (só no #132 sozinho)
**Onde:** `frontend/apps/pms/src/features/reservations/reservationsApi.ts:165-171` (mensagem e pré-checagem). Junto com `ReservationDetailPage.tsx:41,316-318`: a página guarda **um** `paymentResult` e cada `onResult` substitui o anterior.
**Cenário:**
1. A recepcionista registra R$ 261,97. O POST sai, o servidor grava, e a rede cai antes da resposta. O `fetch` rejeita e a tela mostra `PAYMENT_UNKNOWN_MESSAGE`, que está correta: "pode ter sido registrado: confira a conta".
2. O `onSettled` invalida a conta (`queries.ts:131-134`). Sem rede, a recarga do `useBill` fica **pausada**, porque a query tem `networkMode` padrão. A conta continua com o saldo antigo, `isError` falso. O formulário segue na tela com o botão liberado, porque o `onSettled` soltou a trava.
3. Ainda sem rede, ela toca "Registrar" de novo. O pré-check devolve "Sem conexão: **o pagamento não foi registrado**. Reconecte e registre de novo.", e esse aviso **substitui** o do passo 1.
4. Ela reconecta e, seguindo a instrução, toca "Registrar" antes da conta recarregada chegar (a busca pausada leva algumas centenas de ms para voltar). O resultado é um **segundo POST** de R$ 261,97. O saldo fica negativo, e a sobra só sai por estorno do ADMIN.

A frase é verdadeira para **este** toque, porque o POST de fato não saiu. Ela é falsa para "o pagamento" que a recepcionista tem na cabeça, que é o do passo 1. A janela do passo 4 é curta, mas é exatamente a ação que a mensagem manda fazer.
**Atenuante:** no `develop` atual é pior. A mutação pausada sai sozinha quando a rede volta e duplica de qualquer jeito. O #132 é melhoria líquida.
**Com o #141:** o toque do passo 4 passa antes pela conferência (`PaymentForm.tsx:91-95` chama `getBill`). Se o primeiro POST gravou, o saldo mudou, a conferência para com "O saldo mudou para…" e não grava. **O dano some.** O texto do passo 3 continua impreciso (ver 🟢-3).
**Regra violada:** D7/P-7 do anexo (a mensagem não pode levar a recepção a registrar de novo um pagamento que pode ter entrado). CLAUDE.md §7 (risco financeiro).
**Correção sugerida:** a menor é mergear junto com o #141. Se o #132 for sozinho, trocar o texto por um que fale do envio e não do pagamento. Por exemplo: "Sem conexão: este envio não saiu. Se um registro anterior ficou sem resposta, confira a conta antes de registrar de novo."

### 🟢-1 [Testes] Se o teste do `MutationObserver` estourar o tempo, o `onlineManager` fica offline e a mutação pausada fica viva no resto do arquivo
**Onde:** `frontend/apps/pms/src/features/reservations/reservationQueries.test.ts:72-89`.
**Cenário:** o mutante sem `networkMode: 'always'` (executado nesta auditoria) faz o `await observer.mutate(...)` nunca resolver. O teste estoura os 5 s e o `finally` **não roda**, porque a função continua suspensa no `await`. Ficam três resíduos: `onlineManager` em `false`, `navigator` stubado e uma mutação pausada que dispararia `api.POST` se algo chamasse `setOnline(true)` depois. Hoje o teste é o último do arquivo e o Vitest isola por arquivo, por isso o efeito não aparece. Um teste novo acrescentado abaixo herdaria o estado e falharia por motivo enganoso. No caminho verde, a restauração funciona, e o stub de `navigator` **não vaza** para outros arquivos. Em `reservationsApi.test.ts:194-204` a restauração está correta, porque ali não há `await` que fique pendurado.
**Correção sugerida:** mover `onlineManager.setOnline(true)`, `vi.unstubAllGlobals()` e `qc.clear()` para um `afterEach` do `describe`, que roda mesmo quando o teste estoura o tempo.

### 🟢-2 [Testes] O segundo teste só repete a configuração
**Onde:** `reservationQueries.test.ts:92-94`.
**Cenário:** `expect(createPaymentOptions(...).networkMode).toBe('always')` só relê a constante. O comportamento já está provado pelo teste das linhas 72-89, que falha (por tempo) sem o `always`. Não há dano. É um teste que não acrescenta prova e que leva junto o 🟢-1.
**Correção sugerida:** apagar esse teste, ou trocar por um que confira `isPaused === false` logo após o `mutate`, sem esperar o tempo estourar. Assim o mutante cai em milissegundos, não em 5 s.

### 🟢-3 [Doc / UX] Com o #141, o aviso "Sem conexão…" quase nunca aparece, e o anexo diz que ele foi verificado
**Onde:** `docs/specs/anexos/SPEC-05-decisoes-CA-05.6.a.md`, seção "Correção depois do merge (09/11, noite)" (linhas 48-52 no #132). Junto com `paymentLogic.ts:118-121` do #141.
**Cenário:** com os dois PRs, sem rede, o `getBill` da conferência falha primeiro. O `fetch` rejeita na hora e a tela mostra "Não foi possível conferir o saldo da conta. Nada foi registrado. Tente de novo.". A frase é verdadeira, porque nenhum POST saiu. O pré-check do #132 só é alcançado se a rede cair entre a resposta do `getBill` e o `mutate`, uma cadeia de microtarefas sem evento de rede no meio, ou se o `navigator.onLine` for `false` com o servidor alcançável. Há dois efeitos:
(a) o anexo descreve um texto e uma verificação no navegador que deixam de valer;
(b) a mensagem da conferência não diz a causa (rede). A recepcionista tenta de novo sem reconectar e recebe a mesma mensagem.
**Correção sugerida:** atualizar a linha do anexo na hora do merge: o pré-check vira defesa em profundidade, e o aviso visível sem rede é o da conferência. Se quiser a causa na tela, `confirmBalanceThenSend` pode distinguir `navigator.onLine === false` e reaproveitar o `PAYMENT_OFFLINE_MESSAGE`.

## Análise pedida no foco

| Pergunta | #132 sozinho | #132 + #141 |
|---|---|---|
| **Rede cai entre a conferência e o POST** | Não se aplica: não há conferência. | Entre a resposta do `getBill` e o `api.POST` correm só microtarefas (`confirmBalanceThenSend` → `mutate` → `execute` do query-core). O `offline` é evento de macrotarefa e não entra no meio. Se a queda já estava registrada, o pré-check recusa e o POST não sai: "não foi registrado" é verdade. Se não estava, o POST sai, o `fetch` rejeita e a tela mostra `PAYMENT_UNKNOWN_MESSAGE` ("pode ter sido"), que também é verdade. **Sem duplicado.** |
| **`navigator.onLine` mente: `true` sem internet** (wifi sem saída) | O pré-check passa e o POST tenta sair. O `fetch` rejeita depois do tempo de desistência do navegador e a tela mostra `PAYMENT_UNKNOWN_MESSAGE`. É conservador e honesto. O botão fica em "Registrando…" até o navegador desistir, porque o `api.POST` não tem `AbortSignal` (`lib/api.ts`). O defeito é anterior ao PR, que não piora o caso. | O travamento acontece no `getBill` ("Conferindo saldo…") até o navegador desistir. Depois aparece a mensagem da conferência, que é verdadeira. |
| **`navigator.onLine` mente: `false` com servidor alcançável** | O pagamento é recusado sempre com "Sem conexão". Nada é gravado, então o efeito é fail-safe. *SUSPEITA* de alcance real: em produção (SaaS na nuvem), `onLine=false` no Chrome significa sem LAN, e aí o `fetch` também falha. O caso realista é dev em `localhost` sem interface de rede. Para confirmar, falta testar em Linux sem NetworkManager e com VPN. | Igual. |
| **A rede volta com a mutação pausada** | Com o `networkMode: 'always'`, a mutação **não pausa mais**, e o mutante sem `always` fez o teste estourar o tempo. Não há persistência de mutação (`persist` só no store de auth), então nada sobrevive à recarga. O `retry` de mutação é o padrão 0 (`queryClient.ts` só configura `queries`), então nenhum POST é repetido depois de ter saído. | Igual. O `getBill` direto também não pausa. |
| **"Não foi registrado" só quando o POST não saiu?** | **Sim, para o envio atual.** O `throw` está em `reservationsApi.ts:170-171`, antes do `api.POST` da linha 175, e não há retry. O 🟡-1 trata do envio **anterior**. | Sim. As três frases que dizem "nada/não foi registrado" (offline, falha da conferência, saldo mudou) saem todas antes do `mutate`. |

## Repassados a outro dev
nenhum

## O que foi verificado e está correto
- **Mutação:** sem `networkMode: 'always'`, os 2 testes de `reservationQueries.test.ts` falham, o primeiro por tempo. Trocando o pré-check `navigator.onLine === false` por `false`, falham os 2 testes de "navegador sem rede" (`reservationsApi.test.ts` e `reservationQueries.test.ts`). Os dois mutantes morreram.
- **Merge #132 + #141:** sem conflito. O anexo SPEC-05 junta as duas seções sem sobreposição. Resultado: 299 testes verdes e `tsc` limpo.
- `createPaymentOptions` mantém o `onSettled` que invalida `reservationKeys.all` e `['accounts']`, sem regressão do D7. O `Pick<QueryClient, 'invalidateQueries'>` é suficiente.
- `typeof navigator !== 'undefined'` protege o SSR e o Node. No Node 24, `navigator.onLine` é `undefined`, então os outros testes não caem no pré-check.
- O stub de `navigator` não vaza entre arquivos. Dentro do arquivo, só vaza no caso de tempo estourado (🟢-1).
- Na combinação, o 🟡-1 do red team do #141 (carona em busca pausada) continua fechado: o `getBill` é direto. O `always` do #132 elimina a outra fonte de "envio que sai depois", que era a mutação pausada.
- ESM, sem `require`. Sem endpoint novo, então o Swagger não muda. O diff não toca backend nem tenant. Nenhum log novo e nenhuma PII nas mensagens.

## Não foi possível verificar
- **Navegador real:** não executei o roteiro do 🟡-1 (POST sem resposta → toque offline → reconectar e tocar antes da recarga da conta) nem o caso wifi sem internet. A análise vem do código do `query-core` 5.101.4 e da ordem de chamadas.
- **Cobertura vs portão de 60%:** não rodei `vitest --coverage`.
- **`navigator.onLine` falso-negativo** em ambientes específicos (VPN, Linux sem gerenciador de rede): marcado como SUSPEITA acima.
