# QA Red Team — M5-b saldo conferido no servidor (P-8)
**Branch:** fix/m5b-saldo-velho · **Dev:** Sirlande · **Base:** develop@094203c · **Data:** 11/11/2026
**Arquivos auditados:** 6 (3 de código, 3 de docs)
**Achados no escopo:** 4 (🔴 0 · 🟡 2 · 🟢 2) · **Repassados:** 0

## Veredito
APROVADO COM RESSALVAS

Não há 🔴 no escopo. O 🟡-1 abaixo vale corrigir antes do merge: ele contradiz a P-8 ("sem pausar por falta de rede") e, num caminho alcançável, grava o pagamento duas vezes. A correção é pequena.

## Achados no escopo

### 🟡-1 [Dinheiro / Rede] A conferência entra numa busca que já estava pausada: sem rede, trava e depois grava, e duas instâncias do formulário gravam duas vezes
**Onde:** `frontend/apps/pms/src/features/reservations/components/PaymentForm.tsx:83` (o `fetchQuery`) e `:90-106` (o `send` continua depois do `await`, mesmo com o componente desmontado).
**Mecanismo (confirmado no código do TanStack 5.101.4):** `query.ts:404-418`. Se a query `reservationKeys.bill(id)` já tem uma busca em andamento (`fetchStatus` `fetching` ou `paused`), o `fetchQuery` devolve a promessa dessa busca. O `networkMode: 'always'` e o `retry: false` desta chamada não valem. A busca que já existia segue o `useBill` da página, com `networkMode: 'online'` e `retry: 1`.
**Como se chega a uma busca pausada:** o `useBill` (`ReservationDetailPage.tsx:34`, `staleTime` de 30 s, `refetchOnMount` padrão) monta sem rede com a conta já em cache há mais de 30 s. A recepcionista abriu a reserva antes, a rede caiu e ela voltou à reserva pela lista. Nesse estado `bill.data` existe, `bill.isError` é falso e o formulário aparece.
**Cenário:**
1. Sem rede, a recepcionista toca "Registrar pagamento". O `fetchQuery` entra na busca pausada. A tela fica em "Conferindo saldo…" sem limite de tempo, com tudo desabilitado. É o mesmo sintoma que o qa-explorador marcou na mutação pausada.
2. Ela troca para outra aba da reserva e volta para "Conta". O `tab === 'conta'` desmonta e remonta o `PaymentForm`, e a nova instância nasce com `sending.current = false`. Ela toca "Registrar" de novo, e a segunda chamada entra na **mesma** promessa pausada.
3. A rede volta. A promessa resolve uma vez com o mesmo saldo para as duas chamadas. As duas veem `freshBalanceStep → send` e as duas chamam `create.mutate`. O `MutationObserver.mutate` (`mutationObserver.ts:128-140`) executa mesmo depois de desmontar. Resultado: **2 POST /payments**. O primeiro grava sem nenhum aviso, porque o callback do `mutate` exige listener. O saldo fica negativo ("a devolver") sem a confirmação da P-3, e a sobra só sai por estorno do ADMIN. É exatamente o dano que esta branch corrige.

Reproduzido no `query-core` isolado (script em `/tmp/claude-1000/-home-sirla-faculdade-TCC-sistema-hotel-prova/7cbc0206-a0bf-4b83-8b0d-93ba842a3c7e/scratchpad/t.mjs`, fora do repo): com uma busca pausada, duas chamadas `fetchQuery({... networkMode:'always', retry:false})` ficaram pendentes por 300 ms sem rede. Quando a rede voltou, as duas resolveram "ok" com 1 só chamada ao servidor. Faltou executar o fluxo no navegador. O script `verifica_saldo_velho.mjs` cobriu "sem rede" sem busca anterior em andamento, e por isso deu 0 POST.
**Regra violada:** P-8 do anexo ("sem pausar por falta de rede", "não deu para conferir → não grava"). CLAUDE.md §7 (risco financeiro). P-7 (sem fila escondida em operação de dinheiro).
**Correção sugerida:** a conferência não pode herdar a busca que já existe. A opção menor é `await qc.cancelQueries({ queryKey: reservationKeys.bill(reservationId) })` logo antes do `fetchQuery`. Isso cancela a busca pausada e força uma busca nova, com `networkMode: 'always'`. Outra opção: chamar `getBill` direto e depois `qc.setQueryData`. Como defesa extra, sair do `send` sem chamar `mutate` se o componente já desmontou (ref `mounted` limpo no cleanup de um `useEffect`).

### 🟡-2 [Testes] A ligação "parou → não grava" não tem teste no CI
**Onde:** `PaymentForm.tsx:98-104`. Os testes novos (`paymentLogic.test.ts:134-175`) cobrem só a função pura.
**Cenário:** trocar `if (check.kind === 'stop')` por `if (false)`, ou chamar `create.mutate` antes do `await readFreshBalance()`, deixa os 291 testes verdes. A única prova do comportamento é o `verifica_saldo_velho.mjs`, que está fora do git e por isso não roda de novo em outra máquina nem no CI. O `freshBalanceStep` está bem coberto, inclusive o sinal do valor a devolver. O que fica sem teste é a ordem conferência → decisão → `mutate`, e a liberação da trava no `stop`.
**Regra violada:** checklist §8 ("teste que passaria mesmo com a regra de negócio quebrada"). Decisão já registrada como item 6 do Em aberto (sem jsdom).
**Correção sugerida:** a menor é versionar o script Playwright em `docs/qa/evidencias/` ou em `e2e/`, para a prova ficar reproduzível. Outra opção: extrair a sequência do `send` para uma função pura que recebe `readFreshBalance` e `mutate` como parâmetros e testá-la sem jsdom, no mesmo padrão do `submitStep`.

### 🟢-1 [UX] A mensagem da falha de conferência manda "registrar de novo", mas o formulário some
**Onde:** `paymentLogic.ts:118-121`, junto com `ReservationDetailPage.tsx:96` (`billFailed: bill.isError`).
**Cenário:** o `fetchQuery` falha e deixa a query compartilhada em `error`, com os dados antigos mantidos. O `canReceivePayment` passa a dar `false` e o formulário desmonta. A mensagem diz "Confira a conexão e registre de novo", mas não existe formulário até a recepcionista achar o "Tentar de novo" do cartão "Conta da estadia", mais abaixo. Sem rede, o `refetchOnReconnect` recupera sozinho. Num 5xx não recupera, e "confira a conexão" aponta a causa errada. É fail-safe e não há dano: é só uma mensagem que diz o que falhou e não diz o que fazer.
**Correção sugerida:** "…Nada foi registrado. Toque em Tentar de novo na conta abaixo." Ou trocar "conexão" por "conexão ou tente em instantes".
**Efeito colateral a saber:** a falha da conferência agora também põe a página em "Conta indisponível". O botão "Confirmar check-out" continua habilitado (`ReservationDetailPage.tsx:303`, `disabled={busy || !bill.data}`), porque os dados antigos continuam lá. Isso já existia antes, mas esta branch torna o estado mais frequente.

### 🟢-2 [Robustez] A trava `sending` fica presa se algo lançar entre o `await` e o `mutate`
**Onde:** `PaymentForm.tsx:93-106`.
**Cenário:** `readFreshBalance` captura tudo que vem do `fetchQuery` e do `officialBalanceCents`, e isso está correto. Já `freshBalanceStep`, `PAYMENT_METHOD_OPTIONS.find` e `paymentBody` rodam fora de `try`. Se algum deles lançar, por exemplo `centsToDecimalString` com valor fora do esperado, `sending.current` fica `true` e `checking` volta a `false`. O botão fica habilitado e não faz nada, sem mensagem, e o `void send(...)` vira rejeição não tratada. A probabilidade é baixa, e o problema já existia na versão síncrona. Fica sem rede de segurança porque agora o `send` é assíncrono.
**Correção sugerida:** envolver o corpo depois de `sending.current = true` em `try/catch`. No `catch`: `sending.current = false`, `setChecking(false)` e `onResult` com a mensagem genérica.

## Repassados a outro dev
nenhum

## O que foi verificado e está correto
- **Remontagem por `key={balance}`:** quando o saldo novo difere, o `fetchQuery` grava o cache, a página troca a `key` e nasce uma instância limpa (`sending=false`, valor preenchido com o saldo novo). A instância antiga só faz `setState` sem efeito e `onResult`. O `onResult` é o `setPaymentResult` da página, que continua montada, então o aviso aparece e recebe foco (`ReservationDetailPage.tsx:48-50`).
- **Desmontagem por `billFailed`:** quando a conferência falha, a query fica em erro e o formulário sai. A continuação só chama `setState` sem efeito e `onResult`, sem `mutate`. Fail-safe.
- **Trava `sending`:** é ligada antes do `await`, solta no `stop` (`:100`) e solta no `onSettled` do `mutate`. Um segundo toque durante a conferência retorna em `:92`. Dentro da mesma instância está correta. A brecha entre instâncias é o 🟡-1.
- **P-3 continua valendo:** `submitStep` não mudou. O "a maior" ainda passa por `setOverpaid` e só grava por `confirmOverpaid`. A conferência exige saldo **igual**, então um valor que passou a ser a maior por causa de outro balcão para antes do POST.
- **🟡-1 de 09/11 sem regressão:** `submitStep` com `confirming` devolve `wait`. O foco vai para "Corrigir o valor" ao abrir a confirmação. Durante a conferência, campo, fieldset e botões ficam desabilitados, e o Enter não faz nada.
- **"Corrigir o valor" devolve o foco:** o `Input` do `@hotel/ui` usa `forwardRef` (`packages/ui` `Input`), e o campo não está desabilitado nesse momento, porque o botão só fica clicável com `busy` falso.
- `freshBalanceStep`: valor a devolver mostrado positivo, quitada e mudou com texto próprio, falha sempre `stop`. Comparação em centavos inteiros, sem float.
- **Multi-tenant:** o diff não toca o backend. A conta é buscada pelo `GET /reservations/:id/bill` que já existia, com tenant do JWT.
- **LGPD:** nenhum log novo e nenhum dado pessoal em mensagem.
- ESM, sem `require`. Sem endpoint novo, então sem impacto no Swagger.
- **Docs:** o P-8 e os itens 7 e 8 do Em aberto batem com o código, exceto a frase "sem pausar por falta de rede", que o 🟡-1 contradiz. O repasse ao Gabriel só acrescenta texto e não contradiz o código.

## Não foi possível verificar
- O 🟡-1 foi reproduzido no `query-core` isolado. Ele não foi executado no navegador com o componente React. O que falta é um Playwright com: abrir a reserva, esperar mais de 30 s, ficar offline, sair e voltar, Registrar, trocar de aba e voltar, Registrar de novo, voltar a rede e contar os POSTs.
- A janela entre a conferência e o POST, e a busca em andamento iniciada antes do POST de outro balcão, que devolve um retrato de alguns ms antes. São o limite já aceito (Em aberto, item 7).
- A interação com o PR #132 (`networkMode: 'always'` no `useCreatePayment`) não foi avaliada, porque está em outra branch.
