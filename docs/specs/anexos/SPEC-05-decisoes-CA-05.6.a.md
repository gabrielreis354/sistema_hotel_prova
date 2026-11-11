# SPEC-05 · Anexo — Decisões do CA-05.6.a (pagamento no check-out, meta M5-b)

**Responsável:** Sirlande (orquestrando Claude Code) · **Data:** 09/11/2026
**Estado:** ✅ implementado na `feature/m5b-pagamento-checkout`, qa-redteam aprovado com ressalvas (todas corrigidas). Aguarda a revisão da tela pelo Gabriel e a revisão humana (mexe em dinheiro) antes do merge.
**Fonte:** parecer de 28/10 (§4, M5-b), aceito no ponto de controle de 03/11; relatório `docs/historico_sessao/sirlande/m5b_pagamento_checkout_09nov2026.md`; auditoria `docs/qa/redteam_m5b-pagamento-checkout_09nov2026.md`.

> Numeração própria (P-1 em diante), para não confundir com a SPEC-04 (D-n) nem com a comanda (C-n). No plano da sessão, as decisões P-1 a P-7 apareceram como D1 a D7.

---

## 1. O que foi produzido

Passo 5 do roteiro da banca: *"No check-out, a conta aparece em linha do tempo, **o pagamento é registrado**, e a conta e a estadia fecham."* A linha do tempo (M5-a) e o check-out já existiam. Faltava registrar o pagamento.

| Entrega | Onde |
|---|---|
| Formulário "Registrar pagamento" na aba Conta da reserva, abaixo da confirmação do check-out | `features/reservations/components/PaymentForm.tsx`, `ReservationDetailPage.tsx` |
| Regras puras: quem vê o formulário, leitura do valor, passo do envio, corpo do pedido | `features/reservations/paymentLogic.ts` (+ teste) |
| Chamada ao `POST /payments` e recarga da reserva e das contas | `reservationsApi.ts` (`createPayment`), `queries.ts` (`useCreatePayment`) |
| Link "Receber na reserva" no aviso de conta da suíte fechada com saldo (C-19) | `features/accounts/accountTotals.ts` (`receiveAt`), `StaffActions.tsx`, `AccountsListPage.tsx` |
| `amount` do `POST /payments` documentado como texto decimal; `api-client` regenerado | `services/core-service/config/swagger.js` (+ `tests/swagger-payments.test.js`) |

**Backend:** sem mudança de código. O `POST /payments` da T-04.4 já fazia tudo o que o passo 5 pede: trava reserva → conta (D-48), crédito da reserva repartido entre as contas (D-42, D-45), acerto CLOSED ↔ PAID na mesma transação (D-43) e pagamento a maior com saldo negativo (D-44). O check-out não exige saldo zero: fecha as contas, e elas viram PAID quando o pagamento as cobre, antes ou depois do check-out.

---

## 2. Decisões

| # | Decisão | Alternativa descartada | Por quê |
|---|---|---|---|
| **P-1** | Pagar **pela reserva** (`reservation_id`) | Pagar conta por conta (`account_id`) | O saldo no cabeçalho da tela é o da estadia inteira. O backend reparte o crédito entre as contas, fechadas primeiro (D-45). Escolher a conta no balcão seria um passo a mais e um jeito a mais de errar |
| **P-2** | Formulário só em **CHECKED_IN e CHECKED_OUT, com saldo > 0, para ADMIN e RECEPTIONIST**, por *allowlist* | Mostrar em qualquer status; *blocklist* | Allowlist é fail-safe (CLAUDE.md §7): status ou papel novo nasce sem o formulário. Receber o sinal de reserva futura (PENDING/CONFIRMED) no balcão fica fora do roteiro. CHECKED_OUT entra porque o hóspede pode sair devendo e voltar para pagar |
| **P-3** | Pagamento **parcial livre**; **a maior pede confirmação** mostrando o que sobra a devolver | Bloquear a maior; aceitar a maior sem aviso | O backend aceita a maior (D-44). Às vezes a recepção recebe uma nota maior e devolve o troco depois. Sem aviso, um dígito a mais ("3500" em vez de "350") gravaria R$ 3.150 a devolver, e só um ADMIN desfaz, pelo estorno |
| **P-4** | ~~Pôr `requireRole('ADMIN','RECEPTIONIST')` no `POST /payments`~~ **retirada** | — | A pesquisa supôs que o garçom conseguia registrar pagamento. Ele já é barrado pela lista de rotas liberadas do WAITER (`utils/roles.js`, CA-04.1.n), e o `waiter-least-privilege.test.js` cobre o `POST /payments` (48 testes verdes). Nada a mudar |
| **P-5** | `amount` do `POST /payments` como **texto** no Swagger, com o mesmo `pattern` que o backend lê | Manter `number` e converter na tela | A regra do PMS é que valor decimal nunca passa por float no cliente. O backend já lia texto pelo `toCents`, e cliente antigo que manda número continua aceito. Um teste prende o `pattern` ao `toCents` |
| **P-6** | Link "Receber na reserva" **só para a conta da suíte** fechada com saldo > 0 | Link também para mesa e day-use | Mesa e day-use não têm reserva, e ainda não existe tela de pagamento de conta avulsa. Um link para lugar nenhum é pior que nenhum link |
| **P-7** | Contra pagamento duplicado: **trava na tela agora**; chave contra repetição no servidor fica para depois | Chave de idempotência no `POST /payments` já nesta entrega | A chave mexe no contrato e no banco, perto do congelamento de 24/11. Na tela: botão desabilitado e trava síncrona enquanto envia; falha de rede ou 502/503/504 sem resposta do backend **não** diz "falhou" e manda conferir a conta; se a conta não recarrega, o formulário sai |
| **P-8** | **Conferir o saldo no servidor antes de gravar** (11/11): o formulário busca a conta de novo (`freshBillOptions`, sem pausar por falta de rede) e só grava se o saldo for o da tela. Mudou → não grava, avisa com o saldo novo e o formulário se refaz com ele. Não deu para conferir → não grava (fail-safe) | Recarregar a conta quando a aba volta ao foco; mandar ao servidor o saldo esperado e responder 409 | O "a maior" (P-3) é decidido com o saldo da tela, e o cache não recarrega no foco (`refetchOnWindowFocus: false`). Com dois balcões na mesma reserva, o a maior gravava sem confirmação e só saía por estorno do ADMIN (🔴 do qa-explorador, `docs/qa/exploratorio_pagamento-checkout_11112026.md`). Recarregar no foco não cobre dois computadores. O 409 no servidor fecha também a janela de milissegundos entre a conferência e o `POST`, mas muda o contrato da API: fica para o 5º semestre (Em aberto, item 7) |

### Correções da auditoria (qa-redteam de 09/11)

| Achado | Correção |
|---|---|
| 🟡-1 Enter no campo, com a confirmação do "a maior" aberta, gravava sem clicar em "Sim, registrar" (pela regra do HTML, form com um só campo submete no Enter) | `submitStep` devolve "esperar" com a confirmação aberta, e o foco vai para "Corrigir o valor". Verificado no navegador |
| 🟡-2 502/504 do proxy aparecia como "não foi possível registrar", mas o pagamento podia ter gravado | 502/503/504 sem corpo do backend vira a mesma mensagem da falha de rede. O 503 do próprio backend (consumo em migração) chega com motivo e é recusado antes de gravar, então mantém o motivo |
| 🟡-3 Com a recarga da conta falhando, o formulário seguia com o saldo antigo | `canReceivePayment` recebe `billFailed`: o formulário sai até a conta voltar |
| 🟢-4 Janela entre o toque e o `isPending`; confirmação não anunciada | Trava síncrona (`useRef`) no envio; `role="alert"` na confirmação |

### Repasses ao dono do backend (decididos em 09/11)

| Repasse | Decisão | Por quê |
|---|---|---|
| 🟡 *Suspeita:* pagamento só por reserva não checa consumo antigo pendente (D-31) | **Fechado sem mudança** | O pagamento entra como crédito, mas a conta não vira PAID: o `settleAccount` já retorna sem acertar quando há consumo antigo pendente (`accountBill.js:79`). O próximo pagamento, fechamento ou `migrate` acerta |
| 🟢 `POST /payments` aceita pagamento de reserva CANCELLED/NO_SHOW | **Para depois do congelamento** | Não aparece no roteiro, e a tela já não oferece. Mudar o backend agora abriria outra rodada de auditoria. Fica como pendência do 5º semestre |

---

## 3. Verificação

- **Testes:** PMS com 233 verdes (18 arquivos); backend com 1130 verdes, incluindo `swagger-payments.test.js` e `waiter-least-privilege.test.js`; tipos limpos.
- **Mutação manual:** 14 mutantes na lógica nova. 13 morreram e 1 é equivalente (`balanceCents !== null`, porque `null > 0` já é falso; a checagem existe por causa do TypeScript). Um sobrevivente da primeira rodada (valor por float) virou teste: `100.00` e `0.10`.
- **Navegador (Playwright, backend real, banco próprio), desktop e 375×812:**
  - valor preenchido com o saldo;
  - pede o método;
  - toque duplo grava 1 pagamento;
  - parcial atualiza o saldo e o valor preenchido;
  - a maior mostra o que sobra, o foco vai para "Corrigir o valor" e um Enter a mais não grava;
  - quitar tira o formulário e mantém o aviso;
  - depois do check-out, as contas ficam PAID;
  - celular sem rolagem lateral e console sem erro;
  - C-19: conta da suíte fechada pela comanda mostra "Receber na reserva" e abre a aba Conta com o saldo da estadia.
- **`/security-review`:** sem vulnerabilidade de severidade alta ou média.
- **qa-redteam:** aprovado com ressalvas, todas corrigidas (§2).

---

## 4. Em aberto

| # | Pendência | Dono | Quando |
|---|---|---|---|
| 1 | Revisão da tela pelo Gabriel (a página é dele) e revisão humana (mexe em dinheiro) antes do merge | Gabriel · Sirlande | antes do merge |
| 2 | Chave contra repetição no `POST /payments` (P-7) | Sirlande | 5º semestre |
| 3 | Pagamento de conta avulsa (mesa, day-use) e o link C-19 para ela (P-6) | Sirlande | 5º semestre |
| 4 | Allowlist de status da reserva no `POST /payments` (repasse 🟢) | Sirlande | depois do congelamento |
| 5 | Sinal de reserva futura pelo balcão (P-2) | — | fora do MVP |
| 6 | Teste de componente do formulário: o app ainda não tem jsdom; as decisões foram para funções puras testadas | time | quando o primeiro caso exigir jsdom |
| 7 | `POST /payments` recebe o saldo esperado e responde 409 se mudou (P-8): fecha a janela entre a conferência da tela e o registro | Sirlande | 5º semestre |
| 8 | 🟢 do qa-explorador de 11/11 na tela: Esc não fecha a confirmação do a maior; valor negativo mostra a mensagem genérica de formato; método escolhido só se distingue pela cor | Sirlande | depois do congelamento |
