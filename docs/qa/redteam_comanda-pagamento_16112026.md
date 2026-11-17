# QA Red Team — comanda-pagamento (receber na mesa, balcão e day-use, dividido por valor)
**Branch:** feature/comanda-pagamento · **Dev:** Sirlande · **Base:** origin/develop@51e7b03 · **Data:** 16/11/2026
**Commits:** deeb439 (RED) · 29a0111 (feat)
**Arquivos auditados:** 11 (diff) + 9 lidos para confirmar (CreatePaymentController.js, accountBill.js, paymentRouter.js, roles.js, auth.middleware.js, GetAccountController.js, queries.ts das contas e das reservas, queueStore.ts, Notice.tsx, ReservationDetailPage.tsx)
**Achados no escopo:** 7 (🔴 0 · 🟡 4 · 🟢 3) · **Repassados:** 0

## Veredito
**APROVADO COM RESSALVAS**

Não achei 🔴 no escopo. O dinheiro está certo em centavos, a allowlist está certa, o garçom fica de fora no frontend e no backend, e o check-out da reserva não mudou. As ressalvas são o fluxo "fechar antes de receber", que deixa a mesa sem tela de recebimento (🟡-1), o formulário que se refaz sozinho quando a fila do próprio aparelho descarrega (🟡-2), o valor a maior virando "a devolver" numa mesa sem hóspede (🟡-3) e o foco/anúncio do resultado, que ficou atrás do padrão já usado na reserva (🟡-4).

## Achados no escopo

### 🟡-1 [Dinheiro / fluxo] Mesa fechada com saldo fica sem tela para receber — CONFIRMADO (lido)
**Onde:** `frontend/apps/pms/src/features/accounts/receive.ts:13` (`account.status === 'OPEN'`), `receive.test.ts:28-30` (CLOSED e PAID tratados juntos), junto com `accountTotals.ts:101-104` (`receiveAt` devolve `null` sem reserva)
**Cenário:** mesa de R$ 198,00. A recepção segue o fluxo da T-05.5 ("fechar = fim do consumo"): fecha primeiro, ou recebe R$ 120,00 do primeiro pagante e fecha. A conta vira `CLOSED` com saldo de R$ 78,00. `canReceive` passa a dar `false`, então o botão "Receber" some. A lista volta sem link (`receiveAt` = null para conta sem reserva). Nenhuma tela registra os R$ 78,00, embora o backend aceite pagamento em conta `CLOSED` (`CreatePaymentController.js:55` só recusa `PAID`) e o `settleAccount` (`accountBill.js:77-93`) a leve a `PAID`. A conta fica `CLOSED` com dívida para sempre. O fechamento também não impede fechar com saldo (`closeBlockedReason`, `StaffActions.tsx:15-20`).
**Regra violada:** a allowlist recusa um estado que o backend aceita e que é o caminho natural da operação. Dinheiro a receber sem caminho na interface.
**Correção sugerida:** incluir `CLOSED` em `canReceive` (o backend já trata CLOSED→PAID) e manter `PAID` fora. Ou então, para conta sem reserva, avisar na confirmação do fechamento: "Saldo de R$ X: receba antes de fechar". Colocar um teste para CLOSED com saldo.

### 🟡-2 [Dinheiro / UX] O formulário se refaz no meio da digitação quando a fila do próprio aparelho descarrega — CONFIRMADO (lido)
**Onde:** `ReceivePanel.tsx:50` (`key={balance}`), `queueStore.ts:140` (`invalidateQueries({ queryKey: accountKeys.detail(id) })`, que pega `['accounts', id, 'bill']` por prefixo), `StaffActions.tsx:186-198` ("Receber" aparece mesmo com `pendingCount > 0`)
**Cenário:** o aparelho da recepção tem 1 lançamento de R$ 10,00 na fila (sem rede). A recepção abre "Receber" (nada bloqueia), troca 198,00 por 120,00 e marca PIX. A rede volta e a fila envia o item. O `invalidateQueries` refaz o bill, o saldo vai a 208,00, o `key` muda e o `PaymentForm` remonta com **208,00 preenchido e a forma de pagamento apagada**, sem aviso: o `onResult` não é chamado nesse caminho, só no envio. Quem marca PIX de novo por reflexo registra R$ 208,00 num pagante só. É o saldo exato, então não aparece a confirmação de valor a maior.
O lançamento do garçom **em outro aparelho** é seguro: a tela não faz polling do bill, e a conferência P-8 (`paymentLogic.ts:126-146`) para o envio com "O saldo mudou para…". O risco é só a fila local.
**Regra violada:** DESIGN_PMS §5 (dinheiro: um valor que muda sozinho na tela é erro no fechamento de caixa). A recepção confirma o valor que leu.
**Correção sugerida:** desabilitar "Receber" com `pendingCount > 0`, com o mesmo texto do `closeBlockedReason` ("Espere os lançamentos da fila chegarem"). Ou então, quando o saldo mudar com o formulário aberto, chamar `onResult` com um aviso ("O saldo mudou para R$ X; confira o valor").

### 🟡-3 [Dinheiro] Valor a maior numa mesa vira "a devolver ao hóspede" sem fluxo de devolução — CONFIRMADO (lido)
**Onde:** `PaymentForm.tsx:216-217` (texto fixo "a devolver ao hóspede", que ignora o `payer`), `ReceivePanel.tsx:59-62` ("Crédito do cliente… A conta pode ser fechada")
**Cenário:** mesa de R$ 198,00 paga em dinheiro com uma nota de R$ 200,00. A recepção digita 200,00 e confirma "Sim, registrar". O sistema grava R$ 200,00 recebidos, a conta fecha `PAID` com saldo de −2,00, e o troco sai da gaveta. O caixa e o `payment-mix` mostram R$ 2,00 a mais do que entrou. Numa mesa sem hóspede não há check-out nem reserva onde o crédito seja devolvido, e só o ADMIN pode estornar (`paymentRouter.js:35`). O texto da confirmação ainda fala em "hóspede" numa conta de balcão.
**Regra violada:** precisão do registro financeiro (o valor gravado tem que ser o que ficou com o hotel). Também não segue a parametrização `payer` que o próprio diff criou.
**Correção sugerida:** no alvo `accountId`, trocar o texto por "troco: registre só o valor da conta" ou recusar o valor a maior no formulário. No mínimo, usar `{payer}` no texto da confirmação.

### 🟡-4 [Acessibilidade] O resultado não recebe foco e o foco se perde no remount; o painel abre sem foco — CONFIRMADO (lido)
**Onde:** `ReceivePanel.tsx:34` (`<Notice>` sem `ref` e sem `focus()`), `AccountPage.tsx:122-126` (o painel entra no DOM **antes** do rodapé onde está o botão), `ReceivePanel.tsx` (não há nenhum `focus`)
**Cenário 1:** com teclado ou leitor de tela, o usuário registra R$ 120,00. O `key` muda e o botão "Registrar pagamento", que estava focado, é destruído, então o foco cai no `body`. A `ReservationDetailPage.tsx:63,70,381` resolve isso focando o `Notice` (`paymentResultRef.current?.focus()`), mas o painel não copiou o padrão. O `Notice` com `role="status"` é inserido já com o texto, e vários leitores não anunciam uma região viva que nasce assim (essa parte é SUSPEITA: falta testar com NVDA/TalkBack).
**Cenário 2:** "Receber" fica no rodapé fixo, no fim do DOM. O painel aparece acima, no lugar do cardápio. O Tab seguinte vai para "Ver conta" e nunca para o painel. Quem usa leitor de tela precisa voltar pela lista de itens para achá-lo. O `aria-controls` aponta para um id que não existe enquanto o painel está fechado (aceitável com `aria-expanded=false`, mas não ajuda).
**Regra violada:** o padrão de foco que a própria reserva já usa (🟡 do qa-explorador). O resultado de uma ação financeira precisa ser anunciado.
**Correção sugerida:** `ref` no `Notice` e `focus()` quando `result` muda, como na reserva. Ao abrir o painel, focar o título (`tabIndex={-1}`) ou o campo do valor.

### 🟢-1 [Testes] O ReceivePanel não tem teste, e o estado "aberto" do botão também não — CONFIRMADO (lido)
**Onde:** `StaffActionsReceive.test.tsx:25-33` (só `receiving=false` e ROOM), nenhum teste importa `ReceivePanel`
**Cenário:** tirar o `key={balance}` (o formulário deixa de voltar com o restante), trocar `balance <= 0` por `< 0` ou inverter o rótulo "Esconder pagamento". Nenhuma dessas mutações quebra um teste. As 8 de 8 mutações mortas valem para `receive.ts` e `paymentBody`, não para o painel. Também não há teste de que o garçom não vê o botão: isso depende do `isStaff` da `AccountPage.tsx:77,137`, que está correto, mas não está coberto por teste.
**Correção sugerida:** teste com `renderToString` do `ReceivePanel` com o cache semeado (saldo > 0, = 0, < 0) e do `StaffActions` com `receiving`.

### 🟢-2 [UX] Esconder o cardápio só protege este aparelho — CONFIRMADO (lido)
**Onde:** `AccountPage.tsx:120-126` (comentário "lançar consumo no meio da divisão mudaria o saldo")
**Cenário:** o `receiving` é estado local. O garçom em outro aparelho continua lançando, e quem protege é a P-8 no envio (correto). Se a recepção precisar lançar algo esquecido, ela fecha o painel e perde o aviso "Pagamento de R$ 120,00 em PIX registrado.", porque o `result` mora no `ReceivePanel`, que desmonta. Ao reabrir, o painel não mostra que já houve um pagamento, a não ser pelo "já pago".
**Correção sugerida:** subir o `result` para a `AccountPage`, ou deixar só o "já pago" e ajustar o comentário para dizer que a proteção real é a P-8.

### 🟢-3 [UX] Bill em cache de até 30 s ao abrir o painel — CONFIRMADO (lido)
**Onde:** `ReceivePanel.tsx:18` (`useAccountBill(accountId, true)`, sem `refetchOnMount: 'always'`), `lib/queryClient.ts:8` (`staleTime: 30_000`)
**Cenário:** a recepção abre "Ver conta" (o bill entra no cache), o garçom lança R$ 15,00 e ela abre "Receber" em menos de 30 s. O painel mostra o saldo antigo, que diverge do total do rodapé. O primeiro envio falha com "O saldo mudou". Nenhum dinheiro é gravado errado, mas a primeira tentativa sempre falha nesse caso.
**Correção sugerida:** `refetchOnMount: 'always'` (ou `staleTime: 0`) nesse uso do bill.

## Fora do diff (backend do mesmo dev, informativo; não entra no veredito)
- **SUSPEITA 🟡: dois balcões ao mesmo tempo.** A P-8 lê o saldo e depois envia o POST, com uma janela entre as duas coisas. Dois aparelhos que leem 198,00 na mesma janela gravam 198,00 cada: o backend trava a conta (`lockAccount`), mas aceita o valor a maior por desenho (D-44, `CreatePaymentController.js:18`) e não recebe o saldo esperado. Resultado: 396,00 recebidos e −198,00 de crédito numa mesa. A janela é de milissegundos e o comportamento já existia na reserva. Para confirmar, falta um teste de concorrência contra o banco. Correção possível: `expected_balance` opcional no POST, com 409 quando o saldo divergir dentro da trava.
- **Papéis (verificado, sem achado):** o POST /payments não tem `requireRole`, mas o `auth.middleware.js:29-31` aplica a `WAITER_ALLOWLIST` (`roles.js:19-26`), que não inclui `/payments`. O garçom leva 403 em qualquer pagamento. ADMIN e RECEPTIONIST passam, como combinado.

## Repassados a outro dev
nenhum (o backend tocado acima é da SPEC-04/T-04.4, do mesmo dev).

## O que foi verificado e está correto
- Centavos: cada pagante digita a sua parte; `readPaymentAmount` trabalha em centavos; `centsToDecimalString` grava sempre 2 casas; o saldo é lido com `decimalToCents`, sem `Number()`. Não existe divisão automática, então não há arredondamento a errar.
- Allowlist `canReceive` (TABLE/DIRECT/DAY_USE, OPEN, sem reserva): tipo desconhecido, INTERNAL, ROOM e conta com reserva ficam fora. `reservation_id` vem no `GET /accounts/:id` (`toJSON` do model).
- Regressão no check-out da reserva: o alvo é `{ reservationId }`; o `readFreshBalance` de fallback é idêntico ao anterior (`getBill` + `setQueryData` + `officialBalanceCents`); a legenda tem default "o hóspede"; o body do POST é idêntico (teste em `paymentLogic.test.ts:84-94`). A `ReservationDetailPage` só trocou a prop.
- O pagamento recarrega o bill da conta: `createPaymentOptions` invalida `['accounts']` (`reservations/queries.ts:131-134`), o saldo novo chega e o formulário volta com o restante.
- O pagamento com a conta OPEN fica OPEN até o fechamento, e o `closeAccount` → `settleAccount` leva a PAID com saldo ≤ 0 (`accountBill.js:49,85`).
- Pagamento duplo no mesmo aparelho: a trava `sending` + `mounted` continuam valendo.
- O garçom não vê "Receber" (`isStaff` em `AccountPage.tsx:77,137`), e o backend recusa.
- Os testes do diff rodam: `receive.test.ts`, `StaffActionsReceive.test.tsx` e `paymentLogic.test.ts`, com 43 de 43 verdes (executado).
- ESM, sem `require()`; nenhum endpoint novo (o Swagger não muda); sem PII nova em log ou URL.

## Não foi possível verificar
- O anúncio real do `Notice role="status"` em NVDA/VoiceOver/TalkBack (🟡-4, cenário 1).
- A corrida de dois balcões contra o PostgreSQL (fora do diff; ficou como SUSPEITA).
- Não rodei o fluxo no navegador (o dev informa que conferiu no Chromium a 390 px); a auditoria foi por leitura do código mais os testes unitários.
