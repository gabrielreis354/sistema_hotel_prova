# QA Red Team — M5-b, pagamento no check-out (CA-05.6.a)
**Branch:** feature/m5b-pagamento-checkout · **Dev:** Sirlande (agente orquestrado) · **Base:** origin/develop@245bb82 · **Data:** 09/11/2026
**Arquivos auditados:** 15 no diff (working tree limpo). Também li, para confirmar: `CreatePaymentController.js`, `paymentRouter.js`, `utils/paymentAmount.js`, `utils/calculateStayTotal.js` (`toCents`), `utils/accountBill.js` (`settlePaymentAccount`), `@hotel/ui` `Button.tsx`, `primitives.tsx` (`Notice`), `@hotel/domain` `money.ts`, `App.tsx` (rotas), `AccountPage.tsx`, `infra/k8s/nginx.yaml`, `@tanstack/query-core@5.101.4` `notifyManager.js`.
**Achados no escopo:** 4 (🔴 0 · 🟡 3 · 🟢 1) · **Repassados:** 2

## Veredito
**APROVADO COM RESSALVAS**

Nenhum 🔴 no escopo. O contrato bate: regenerei `openapi.json` e `schema.d.ts` a partir do `swagger.js` e o resultado é idêntico ao commitado. Dinheiro não passa por float. As allowlists de status e de papel são fail-safe. O `Button` tem `type="button"` por padrão, então "Sim, registrar" não dispara o submit junto. As ressalvas são três buracos nas salvaguardas D3/D7. Os três podem cobrar o hóspede a mais (o estorno é só do ADMIN), e nenhum é pego pelo CI.

## Achados no escopo

### 🟡 [Financeiro / D3] Enter duas vezes no campo de valor confirma o pagamento a maior sem passar pelo "Sim, registrar"
**Onde:** `frontend/apps/pms/src/features/reservations/components/PaymentForm.tsx:244-248` e `:323-343`
**Cenário:** o saldo é R$ 350,00 e a recepcionista digita "3500" por engano. Ela aperta Enter e aparece o aviso de "a maior". O foco continua no campo. Ela aperta Enter de novo, por hábito. O painel de confirmação não tem botão submit, e o form tem um único campo que bloqueia submissão implícita (o texto; radios não contam). Pela regra de *implicit submission* do HTML, o Enter submete o form mesmo assim. `submit()` vê `overpaid !== null` e chama `send()`: grava R$ 3.500,00 e deixa R$ 3.150,00 "a devolver", sem que ela tenha lido ou clicado na confirmação. Só um ADMIN desfaz, pelo estorno.
**Regra violada:** D3 (a maior *pede confirmação*). A confirmação pode ser pulada pelo mesmo gesto que a abriu.
**Correção sugerida:** no `submit`, retornar sem enviar quando `overpaid !== null` (o envio fica só no `confirmOverpaid`). Ou mover o foco para "Corrigir o valor" quando o painel abre, o que também resolve o anúncio (ver 🟢).

### 🟡 [Financeiro / D7] 502/504 do proxy diz "Não foi possível registrar", mas o pagamento pode ter gravado
**Onde:** `frontend/apps/pms/src/features/reservations/reservationsApi.ts:656-658`
**Cenário:** o nginx (`infra/k8s/nginx.yaml:32`, `proxy_read_timeout 60s`) fica entre o PMS e o backend. O `POST /payments` espera a trava `FOR UPDATE` da reserva (`CreatePaymentController.js:66-70`) atrás de um check-out ou de um webhook lento. O backend grava, mas o proxy já respondeu 504 com HTML, ou devolve 502 se o pod caiu depois do commit. `serverMessage(error)` não acha `error` no corpo e a tela mostra "Não foi possível registrar o pagamento.". Para a recepção, isso é "falhou", e ela registra de novo: cobrança dupla. O D7 tratou só o caso "sem resposta" (`fetch` rejeitado), mas para o backend um 502/503/504 do proxy é a mesma incerteza.
**Regra violada:** D7 (falha sem saber o resultado não pode dizer "falhou").
**Correção sugerida:** em `createPayment`, tratar `response.status` 502, 503 e 504 sem corpo JSON do backend como `PAYMENT_UNKNOWN_MESSAGE`. O status original pode ir junto no `ApiError`. Acrescentar um teste em `reservationsApi.test.ts`.

### 🟡 [Financeiro / D7] "Confira a conta abaixo" mostra a conta em cache quando a recarga também falha
**Onde:** `frontend/apps/pms/src/features/reservations/ReservationDetailPage.tsx:99`, `:328-333` e `:343-354`. A recarga é a de `queries.ts:560-563`.
**Cenário:** a rede cai no meio do `POST /payments`, que chegou e gravou. A tela diz "confira a conta abaixo antes de registrar de novo" e o `onSettled` invalida o bill. Com a rede ainda instável, o refetch falha. O TanStack mantém `bill.data` antigo quando o refetch dá erro, então `balance` continua sendo o saldo de antes do pagamento. O formulário continua aberto, já preenchido com o saldo cheio, e a `BillTimeline` antiga continua aparecendo abaixo do `ErrorState`. Quem segue a instrução e confere a conta vê o saldo intacto e paga de novo.
**Regra violada:** D7. A conferência que a mensagem pede usa um dado que pode estar velho.
**Correção sugerida:** não mostrar o formulário quando `bill.isError` (ou `bill.isRefetchError`). Exemplo: `receiving && !bill.isError && ...`. Na timeline, sinalizar que os dados não foram atualizados. O mesmo vale para `canReceivePayment` receber `balanceCents: null` quando o bill estiver em erro.

### 🟢 [Testes / A11y] A ligação do formulário com D3 e D7 não tem teste no CI; o painel "a maior" não é anunciado
**Onde:** `frontend/apps/pms/src/features/reservations/components/PaymentForm.tsx` (sem `*.test.tsx`; não há Playwright em `.github/workflows`), `:323-337`
**Cenário 1 (testes):** `paymentLogic.test.ts` e `reservationsApi.test.ts` prendem as funções puras, mas nada no CI prende o portão `overpaid` do `submit` nem o `disabled={busy}`. O 🟡 do Enter acima passa na suíte inteira. O Playwright de 375×812 foi rodado à mão.
**Cenário 2 (a11y):** o painel de confirmação aparece sem `role="alert"` nem `aria-live`, e o foco fica no campo. Quem usa leitor de tela não sabe que a ação parou à espera de confirmação.
**SUSPEITA (sem confirmar no navegador):** a trava do toque duplo depende de `create.isPending` chegar ao DOM. No `query-core@5.101.4` a notificação do observer sai por `setTimeout(0)` (`notifyManager.js:3`), então há uma janela de uma tarefa em que um segundo `click`/Enter já enfileirado chama `mutate` de novo. O Playwright com toque duplo gravou 1, o que indica que a janela é pequena, mas ela não é zero.
**Correção sugerida:** um teste de componente (Testing Library) para "Enter com painel aberto não envia" e "segundo submit enquanto envia não chama `mutate`". Nesse teste, a trava pode ganhar um `useRef` síncrono além do `isPending`. `role="alert"` no painel.

## Repassados a outro dev

| Sev. | Achado | Onde | Dono | Repasse |
|------|--------|------|------|---------|
| 🟡 | POST /payments só com `reservation_id` não checa `pendingLegacyConsumption` (o ramo `account_id` checa); pode marcar conta PAID com consumo antigo fora dela. SUSPEITA: falta ler `reservationLedger` | `services/core-service/app/Controllers/PaymentApi/CreatePaymentController.js:63-74` | Sirlande (SPEC-04, fora do diff) | `docs/qa/repasses/para_sirlande_09112026.md` |
| 🟢 | Backend aceita pagamento de reserva CANCELLED/NO_SHOW; a allowlist da M5-b existe só no cliente | `CreatePaymentController.js:66-74` | Sirlande | `docs/qa/repasses/para_sirlande_09112026.md` |

## O que foi verificado e está correto
- **Contrato:** rodei o `swagger.js` → `openapi.json` → `openapi-typescript` no scratch e o resultado é idêntico aos dois arquivos commitados, ou seja, o cliente não foi editado à mão. Não há validador OpenAPI de request no backend (`grep OpenApiValidator` vazio), então um cliente antigo que manda `amount` numérico continua aceito pelo `toCents`. O pattern do Swagger é mais estrito que o `toCents` (sem espaços), nunca mais frouxo.
- **Dinheiro:** `parseBRLInput` → centavos inteiros → `centsToDecimalString`, sempre com duas casas. Não há `Number()` sobre decimal no diff. `MAX_CENTS` do front bate com `utils/paymentAmount.js:4` e fica abaixo de 2^53.
- **Tenant/papel:** o `tenantId` vem do JWT (`CreatePaymentController.js:29`) e a reserva é buscada com `tenant_id`. A rota `reservas/:id` fica atrás de `RequireRole(['ADMIN','RECEPTIONIST'])` (`App.tsx:35,43`). `StaffActions` só aparece para staff (`AccountPage.tsx:119`), então o link C-19 não chega ao garçom. Não há tenant nem PII no corpo enviado (só `reservation_id`, `amount`, `method`).
- **Allowlists:** `RECEIVING_STATUSES` e `RECEIVING_ROLES` são fail-safe, e o teste cobre `NO_SHOW`, `undefined`, `MANAGER` e `WAITER`.
- **Botões:** o `Button` de `@hotel/ui` usa `type="button"` por padrão (`Button.tsx:40`), então "Sim, registrar" e "Corrigir o valor" não submetem o form junto com o `onClick`.
- **Invalidação:** `['reservations']` e `['accounts']` cobrem `reservationKeys.*` e `accountKeys.open/detail/bill` (`accounts/queries.ts:12-16`). O `onSettled` também invalida no erro, como pede o D7.
- **C-19:** `receiveAt` exige `reservation_id` e saldo > 0 por `decimalToCents`. Saldo ausente, zero ou negativo não gera link.
- **404:** o backend só devolve 404 neste endpoint antes de gravar (UUID inválido ou reserva inexistente), então "Nada foi registrado" é verdade.
- **Alvos de toque e estados:** `min-h-touch` nos radios, no campo e no link. O resultado aparece em `Notice` com texto e cor juntos. O formulário não aparece enquanto `balance` é `null` (estado de carregamento).
- **ESM:** sem `require()`. Não há seed, `start.sh` ou compose no diff, e não há migração: o backend só mudou no Swagger.

## Não foi possível verificar
- Não rodei a suíte nem o Playwright; aceitei os números informados (226+ / 1130 / 12 mutantes). A implicit submission e a janela do `setTimeout(0)` saem da especificação HTML e do código do TanStack, não de execução no navegador.
- Se o `reservationLedger` ignora `consumptions` legado: não li. Por isso o repasse está marcado como SUSPEITA.
