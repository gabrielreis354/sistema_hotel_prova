# Repasses do qa-redteam — para Gabriel — 11/11/2026

Origem: auditoria de `fix/asaas-cobranca-cancelada` (Weslley), relatório
`docs/qa/redteam_asaas-cobranca-cancelada_11nov2026.md`. Área: Reservas (DIVISAO_TRABALHO §3/§7).
Estes achados não reprovam aquela branch.

### 🟡 [Dinheiro] `DELETE /reservations/:id` exclui reserva com sinal PIX PENDING sem cancelar a cobrança no PSP
**Onde:** `services/core-service/app/Controllers/ReservationApi/DeleteReservationController.js:19-21`
**Cenário:** um hóspede faz uma reserva online com o Asaas ativo. A reserva fica `PENDING` e o sinal fica `PENDING`, com um QR válido por cerca de 1 ano. O ADMIN exclui a reserva (soft delete). O pagamento continua `PENDING` e a cobrança continua viva no Asaas. Se o hóspede pagar depois, o webhook marca PAID, não encontra a reserva (está com `deleted_at`) e só grava um `console.warn` com `reservation_status: null`. O dinheiro entra sem reserva e sem quarto. A `fix/asaas-cobranca-cancelada` fechou esse caminho em `PUT /:id/cancel`, mas não neste endpoint.
**Regra violada:** CLAUDE.md §7 (risco financeiro); 🟡-1 do qa-redteam de 16/10 (o mesmo defeito, por outro caminho).
**Correção sugerida:** depois do `transaction.commit()`, chamar `await cancelPendingCharges(reservation)` (`app/services/pix/cancelPendingCharges.js`). A função não lança e filtra os pagamentos por `reservation_id` + `tenant_id`; os pagamentos não são apagados junto com a reserva. Acrescentar um teste no molde de `tests/asaas-webhook.test.js` ("PUT /reservations/:id/cancel — cobrança PIX no Asaas").

### 🟢 [Dinheiro] Check-in direto de PENDING (walk-in) de reserva online deixa o QR do sinal pagável
**Onde:** `services/core-service/app/Controllers/ReservationApi/CheckInController.js:36`
**Cenário:** uma reserva online `PENDING` tem sinal PIX `PENDING` no Asaas. O hóspede chega e a recepção faz o check-in direto de `PENDING`, o que a regra de 24/10 permite. A recepção cobra o valor no balcão. Se o QR for pago depois, o webhook marca PAID e grava só o aviso "reconciliar/estornar", porque a reserva já está `CHECKED_IN`. O hóspede paga o sinal duas vezes. A probabilidade é baixa, porque o hóspede teria de pagar o QR antigo.
**Regra violada:** CLAUDE.md §7 (risco financeiro).
**Correção sugerida:** decidir a regra de produto. Uma opção: no check-in, se houver sinal PIX `PENDING`, cancelar a cobrança depois do commit, com o mesmo `cancelPendingCharges`. Outra opção: avisar a recepção na resposta do check-in. Registrar como pendência, se for adiar.

---

## Repasses do qa-explorador — pagamento no check-out (M5-b)

Origem: `docs/qa/exploratorio_pagamento-checkout_11112026.md` (QA explorador no navegador, aba Conta da reserva, `develop@9035b1c`). Estes achados ficam fora do escopo pedido (o formulário de pagamento) e não reprovam aquela entrega.

### 🟢 [Rede] Um 503 sem corpo na conta aparece como "Consumos desta reserva em migração"
**Onde:** `frontend/apps/pms/src/features/reservations/ReservationDetailPage.tsx:340-343`, cartão "Conta da estadia".
**Passos:** script `docs/qa/evidencias/pagamento-checkout_11112026/rede_pagamento.mjs`, cenário D: `page.route('**/api/reservations/*/bill', r => r.fulfill({ status: 503, body: '' }))` e abrir a aba Conta.
**Obtido:** a tela diz "Consumos desta reserva em migração — a conta volta assim que ela terminar." e oferece "Tentar de novo". Isso está certo para o 503 do backend, que chega com motivo. Um 503 do proxy ou do gateway, sem corpo, também cai nessa mensagem, e a recepção passa a procurar uma migração que não existe.
**Sugestão:** usar a mensagem de migração só quando o corpo trouxer o motivo do backend. Nos outros casos, mostrar "Não foi possível carregar a conta." (a mesma regra que a M5-b aplicou ao `POST /payments`, 🟡-2 do qa-redteam de 09/11).

### 🟢 [Tela] Um saldo de 13 dígitos no cabeçalho causa rolagem lateral no celular
**Onde:** cabeçalho da reserva, "A DEVOLVER" ou "Saldo da estadia" (`span.whitespace-nowrap tabular-nums`).
**Passos:** a 375×812, numa reserva com saldo de R$ 9.999.999.783,99 a devolver (criado no QA com um pagamento a maior confirmado), o span termina em 382 px e a página rola 7 px para o lado.
**Severidade baixa:** só acontece com valor absurdo. Valores de pousada (até R$ 999.999,99) cabem. Se quiser blindar: `break-all` ou fonte menor quando o texto passar de N caracteres.
**Evidência:** `docs/qa/evidencias/pagamento-checkout_11112026/03_celular_valor_gigante_rolagem_lateral.png`.
