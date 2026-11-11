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
