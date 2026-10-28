# QA Red Team — T-05.5 saldo na confirmação e ordem do salão
**Branch:** feature/t055-saldo-ordem · **Dev:** Sirlande · **Base:** develop@9d10b56 · **Data:** 27/10/2026
**Intervalo:** `develop...feature/t055-saldo-ordem` (d66cc08, ee4b5f4, 7b7bd15 — os dois P1 do critique de 27/10)
**Arquivos auditados:** 5 do diff, mais o contexto: `queries.ts`, `lib/queryClient.ts`, `queueStore.ts`, `AccountPage.tsx`, `closeGuard.ts`, `AccountsListPage.tsx`, `utils/accountBill.js`, `utils/accountCharges.js`, `ListAccountController.js` e o `queryObserver.js` do TanStack Query 5.101.4
**Achados no escopo:** 9 (🔴 0 · 🟡 2 · 🟢 7) · **Repassados:** 0

## Veredito
**APROVADO COM RESSALVAS.** Não há 🔴. O saldo depois de fechar (`closedNotice`) vem do bill do `PUT /close` e está sempre certo, então não há perda de dinheiro garantida. Mesmo assim, o objetivo do P1 é mostrar o saldo certo **antes** de decidir, e os dois 🟡 mostram que a confirmação ainda pode exibir um saldo velho como se fosse atual. O 🟡-1 se corrige com uma linha e é recomendável corrigir antes do merge.

## Achados no escopo

### 🟡-1 [dinheiro · cache] Confirmação mostra saldo de até 30 s atrás quando "Ver conta" está fechado
**Onde:** `components/StaffActions.tsx:65` e `:168`, junto com `lib/queryClient.ts:8` (`staleTime: 30_000`)
**Cenário:** a recepção abre "Ver conta" da Mesa 3 (o bill entra no cache com saldo R$ 256,00) e esconde. Em seguida entra um pagamento de R$ 50 pela API, vindo de outro aparelho ou da confirmação PIX. Menos de 30 s depois, ela toca em "Fechar conta". Como `showBill` é `false`, o `refetch` explícito da linha 168 não roda. O `enabled` vai de `false` para `true`, mas o TanStack só busca ao habilitar se o dado estiver *stale* (`shouldFetchOptionally` → `isStale`, `queryObserver.js:457-461`), e o dado tem menos de 30 s. Resultado: não há fetch, `isFetching` fica `false`, aparece "Saldo a receber: R$ 256,00." e "Sim, fechar" já vem habilitado. O valor correto é R$ 206,00. O mesmo acontece com "Fechar conta" → "Voltar" → "Fechar conta" dentro de 30 s, e com sair da conta e voltar a ela (o `StaffActions` remonta, mas o cache continua *fresh*). O Playwright não pegou porque o pagamento foi feito antes da primeira leitura do bill, ou com "Ver conta" aberto.
**Regra violada:** o próprio critério do P1 (o saldo do momento decide o fechamento) e o comentário da linha 167, que promete "Saldo do momento".
**Correção sugerida:** tirar a condição e chamar `void bill.refetch()` sempre ao armar. No v5, `refetch` ignora `enabled`, e o fetch que o `enabled` dispararia em seguida é deduplicado. Outra opção é `staleTime: 0` só em `useAccountBill`. Vale um teste de componente que arma a confirmação com cache *fresh* e espera a chamada.

### 🟡-2 [dinheiro · erro] Se o refetch falha, o saldo velho aparece como válido e o aviso de erro não aparece
**Onde:** `components/StaffActions.tsx:122-128`
**Cenário:** "Ver conta" está aberto com saldo R$ 256,00 e entra o pagamento de R$ 50. A recepção toca em "Fechar conta", o `refetch` roda e falha (rede instável, 500; com `retry: 1`, depois de uns ~1 s). No v5 o `data` antigo fica no resultado mesmo com `isError: true`. O ternário testa `isFetching`, depois `balance`, e só por último cai na mensagem de erro. Como `balance` ainda tem o valor antigo, a tela mostra "Saldo a receber: R$ 256,00." em negrito, como se fosse atual, e "Não foi possível carregar o saldo." não aparece. Só o bloco "Ver conta", acima, mostra o erro. Com "Ver conta" fechado, nada indica o erro.
**Regra violada:** o critério da própria entrega ("se o bill falhar, a tela diz 'Não foi possível carregar o saldo.'") e o checklist de UX ("estado de erro").
**Correção sugerida:** testar `bill.isError` antes de `balance` na confirmação (`bill.isFetching ? … : bill.isError ? 'Não foi possível…' : balance ? … : …`). Com o 🟡-1 corrigido, toda abertura busca o bill, e isso basta.

### 🟢-1 [UX · dinheiro] Total e saldo vêm de leituras diferentes e podem se contradizer
**Onde:** `components/StaffActions.tsx:120-125` (o Total vem de `totalCents`, que sai de `useAccount`; o saldo vem de `useAccountBill`)
**Cenário:** outro garçom lançou um Suco de R$ 24 em outro aparelho. O detalhe da conta ainda está no cache (30 s, sem `refetchInterval`), mas o bill acabou de ser buscado. A tela mostra "Total R$ 256,00. Saldo a receber: R$ 280,00." sem nenhum pagamento, e a recepção não sabe em qual valor confiar. A regra que derruba a confirmação quando o total muda (`:72-76`) olha só o total do rodapé, não o `bill.total`.
**Correção sugerida:** na confirmação, usar `bill.data.total` quando ele existir (os dois números ficam da mesma leitura). Ou, se `bill.total` for diferente da parte do servidor no rodapé, invalidar o detalhe.

### 🟢-2 [UX] A trava de 400 ms conta a partir do toque em "Fechar conta", não da chegada do saldo
**Onde:** `components/StaffActions.tsx:134-136` e `:165`
**Cenário:** em 4G lento, o bill chega em 900 ms. "Sim, fechar" passa de desabilitado a habilitado no mesmo quadro em que o saldo aparece, e a trava já expirou. Quem já estava com o dedo indo para o botão fecha sem ter lido o saldo, que era justamente o que o P1 queria mostrar. Isso não reabre o P0 do toque duplo: o toque duplo é coberto pelo `disabled`, e um botão desabilitado não recebe o clique.
**Correção sugerida:** rearmar `shownAt.current = performance.now()` quando `bill.isFetching` passa de `true` a `false` com a confirmação aberta.

### 🟢-3 [a11y] A chegada do saldo não é anunciada e "Sim, fechar" fica desabilitado sem motivo
**Onde:** `components/StaffActions.tsx:119-134`
**Cenário:** o foco cai em "Voltar" (`autoFocus`) e o leitor de tela lê o grupo pelo `aria-labelledby` no momento em que o texto ainda diz "Carregando o saldo…". Quando o saldo chega, nada é anunciado, porque o `<p>` não tem `aria-live`. Quem passa para "Sim, fechar" durante o carregamento ouve "esmaecido" sem saber por quê.
**Correção sugerida:** colocar `aria-live="polite"` no trecho do saldo (um `<span>` sempre montado) e `aria-describedby="close-confirm-text"` em "Sim, fechar".

### 🟢-4 [UX] A mensagem de erro do saldo não diz o que fazer, e no modo offline engana
**Onde:** `components/StaffActions.tsx:127`
**Cenário:** (a) com o bill indisponível, a tela diz "Não foi possível carregar o saldo." e deixa fechar, mas não diz que o saldo aparece depois de fechar, no aviso da lista. A recepção não sabe se pode seguir. (b) Sem rede, a query fica `paused` (`isFetching` é `false`, sem `data`) e cai no mesmo texto, embora o motivo seja falta de conexão. Nesse caso "Sim, fechar" fica habilitado e a mutação também pausa, deixando "Fechando…" na tela indefinidamente. Esse comportamento já existia, mas agora o texto convida a fechar.
**Correção sugerida:** "Não foi possível carregar o saldo agora; ele aparece depois de fechar." Se `bill.fetchStatus === 'paused'`, dizer "Sem conexão" e desabilitar o fechamento.

### 🟢-5 [DRY] A regra crédito/saldo continua duplicada no "Ver conta"
**Onde:** `components/StaffActions.tsx:93-99` contra `accountTotals.ts:61-66` (`balanceLine`)
**Cenário:** o "Ver conta" refaz à mão a regra "saldo negativo → 'Crédito do hóspede', sem sinal" (`Math.abs`). Se a regra mudar (por exemplo, "Troco" em vez de "Crédito"), a confirmação e o aviso mudam e o "Ver conta" fica com o texto antigo.
**Correção sugerida:** extrair um `balanceParts(cents) → { label, cents }` usado por `balanceLine` e pela linha `balance` do `BILL_ROWS`.

### 🟢-6 [robustez] `sortAccounts`: conta sem tipo sobe para o grupo das mesas e tipo desconhecido vira `NaN`
**Onde:** `accountFilter.ts:62`
**Cenário:** (a) `type` ausente (o schema o declara opcional) leva a conta ao grupo 0, no meio das mesas. (b) Se o backend criar um tipo novo antes de o front ser atualizado, `SALON_GROUP[tipo]` é `undefined` e `group(a) - group(b)` dá `NaN`, que é *falsy*. O comparador cai no critério de data, e a ordem deixa de ser transitiva: o tipo novo fica espalhado entre os grupos. Hoje nada disso acontece, porque o enum é fechado nos dois lados.
**Correção sugerida:** `SALON_GROUP[a.type as AccountType] ?? 3` (o desconhecido vai para o fim). Caber um caso de teste.

### 🟢-7 [testes] Nenhum teste unitário cobre o comportamento do `StaffActions`
**Onde:** não existe `StaffActions.test.tsx`. Os 74 testes (69 em `features/accounts`) cobrem `balanceLine`, `closedNotice` e `sortAccounts`.
**Cenário:** se alguém remover `|| bill.isFetching` do `disabled`, trocar `showBill || confirming` por `showBill` ou apagar o `refetch`, nenhum teste do Vitest falha. Só as 24 checagens do Playwright cobrem o componente, e elas não exercitaram o caso do 🟡-1. As 7 mutações mortas eram nas funções puras.
**Correção sugerida:** um teste de componente com `QueryClient` de teste e `getAccountBill` mockado, cobrindo: (1) arma → busca mesmo com cache *fresh*; (2) desabilitado enquanto busca; (3) erro com dado antigo → mensagem de erro.

## Repassados a outro dev
Nenhum.

## O que foi verificado e está correto
- **Bill de outra conta:** não acontece. A chave é `['accounts', id, 'bill']` (`queries.ts:15`), e `id` vem da conta exibida.
- **`isFetching` piscando e travando "Sim, fechar":** só três coisas buscam o bill: abrir a confirmação, o `invalidate` do sucesso de `close` e o `invalidate` de `detail(id)` no envio da fila (`queueStore.ts:140`). Como é prefixo, ele também invalida o bill. O bill não tem `refetchInterval`, e `refetchOnWindowFocus` é `false`. O envio da fila desta conta exige item pendente, o que já bloqueia e derruba a confirmação (`:75`). Não encontrei como o botão pisque com a confirmação aberta.
- **Fechar sem querer enquanto o bill carrega:** o `disabled` cobre o caso. No primeiro render com `enabled: true`, o resultado otimista do v5 já vem com `fetchStatus: 'fetching'` quando não há cache, então "Não foi possível carregar o saldo." não pisca.
- **Trava de 400 ms:** continua no `onClick` (`:136`). O `disabled` novo só acrescenta proteção.
- **`othersPending`:** o rótulo "Fechar mesmo assim" e o aviso continuam. O saldo mostrado já exclui os lançamentos de outro usuário parados no aparelho, o que é coerente, porque fechar vai recusá-los.
- **Sucesso e erro do `close`:** `onSuccess` navega com o bill do `PUT` (saldo fresco), e `onSettled` derruba a confirmação. No 409/erro, o `close.error` aparece com `role="alert"`.
- **INTERNAL:** o bill zera o total (`accountCharges.js:103`). A confirmação diz "Total R$ X. Nada a receber.", o que é correto (RN-006).
- **Garçom e contas INTERNAL:** `GET /accounts` não filtra por papel, e o garçom vê as INTERNAL, agora no fim da lista. Nada fica escondido: a busca (`filterAccounts`) acha a conta antes da ordenação. É a decisão do P1.
- **Ordem:** os testes matam as trocas de grupo (DAY_USE↔ROOM, ROOM↔INTERNAL, TABLE↔DIRECT), porque as idades foram escolhidas contra a ordem esperada.
- **Dinheiro:** `balanceLine` usa `decimalToCents`/`formatBRL`, sem `Number()`, e o saldo negativo aparece sem sinal. O `if (!bill?.balance)` não confunde `'0.00'` com ausente, porque string não vazia é *truthy*.
- `queueCore`/`queueStore` não foram alterados. `tsc --noEmit` passa limpo, e `vitest run src/features/accounts` dá 69/69.

## Não foi possível verificar
- O comportamento do leitor de tela (🟢-3). O Playwright não verifica anúncio.
- O 🟡-1 não foi reproduzido no navegador. Ele foi confirmado pela leitura do `queryObserver.js` (`shouldFetchOptionally`/`isStale`) com o `staleTime` global de 30 s.
