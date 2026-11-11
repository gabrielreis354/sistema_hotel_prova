### 2026-11-11 — Gabriel (orquestrando Claude Code)

- **Branch:** `fix/pix-exclusao-checkin-cpf`
- **Horário:** 20:30 ~ 21:15
- **Objetivo da sessão:** corrigir os repasses do qa-redteam de 11/11 (`docs/qa/repasses/para_gabriel_11112026.md` e `para_dono-indefinido_11112026.md`)

#### O que foi feito

| Achado | Causa raiz | Correção | Onde |
|---|---|---|---|
| 🟡 `DELETE /reservations/:id` deixava o sinal PIX vivo no Asaas | Só o cancelamento chamava `cancelPendingCharges` | A exclusão cancela as cobranças pendentes depois do commit | `DeleteReservationController.js` |
| 🟢 Check-in direto de PENDING (walk-in) deixava o QR do sinal pagável | O check-in não olhava os pagamentos | Se a reserva estava `PENDING`, o sinal (`kind: DEPOSIT`) é cancelado depois do commit | `CheckInController.js`, `cancelPendingCharges.js` (filtro `kinds`) |
| 🟡 Reserva pública duplicava o hóspede com o mesmo CPF com e sem máscara | O find-or-create comparava a string crua | Busca pelos dígitos (`regexp_replace`, como o `ListGuestController`), o cadastro mais antigo vence, e o hóspede novo nasce com o CPF só com dígitos | `CreateBookingController.js` |

Decisões:
- **Check-in cancela só o sinal.** Um QR PIX de outro tipo, gerado pela recepção, continua valendo. A resposta do check-in não muda (continua a reserva).
- **PSP fora do ar não trava nada.** `cancelPendingCharges` não lança: a exclusão e o check-in acontecem, e o id da cobrança vai para o log para conciliar.
- **🟢 da validação de CPF no balcão: não mexi.** É decisão de produto. O balcão recebe passaporte e digitação provisória, e os testes do CRUD usam CPFs inválidos. Fica como pendência para o Gabriel decidir.

#### Verificação

- TDD: os 6 testes novos falharam antes da correção (commit `bb729c5`) e passam depois. O teste de isolamento da exclusão já passava, porque um 404 nunca cancelava nada.
- **qa-redteam:** aprovado com ressalvas (1 🟡, 4 🟢, 1 repasse). O 🟡 era a busca do CPF sem índice: cada reserva pública varria a tabela de hóspedes inteira. Foi corrigido com o índice `idx_guests_tenant_cpf_digits`, e um teste faz `EXPLAIN` do SQL gerado. Sem o índice, o teste falha. Dois 🟢 também foram corrigidos (`digitsOf` em `app/utils` e o teste do CPF em outro hotel). Desfecho em `docs/qa/redteam_pix-exclusao-checkin-cpf_11nov2026.md`.
- Suíte do core contra Postgres 17 temporário: **1200 passaram**, 21 pulados (os mesmos do develop). O container foi removido ao final.
- `scripts/qa_checks.sh`: nenhum erro bloqueante (4 avisos antigos do frontend).

#### Commits gerados

| Hash | Mensagem |
|------|----------|
| `bb729c5` | `test(core): exclusao e check-in cancelam o sinal PIX; CPF normalizado na reserva publica` |
| `109f2fa` | `fix(core): exclusao e check-in cancelam o sinal PIX; reserva publica casa CPF pelos digitos` |
| `f541903` | `perf(core): indice pelos digitos do CPF na busca da reserva publica` |
| (este) | `docs: relatorio da sessao e red team da correcao do sinal PIX e do CPF` |

#### Pendências

| # | Pendência | Prioridade | Observação |
|---|-----------|-----------|------------|
| 1 | Validar o CPF no CRUD de hóspede do balcão? | 🟢 Decisão de produto | Se validar, reusar `app/utils/isValidCpf.js` e aceitar passaporte por outro campo |
| 2 | Balcão grava e compara o CPF cru (`CreateGuestController`, `UpdateGuestController`) | 🟡 Média | Repasse do qa-redteam em `docs/qa/repasses/para_dono-indefinido_11112026.md`. A área não tem dono: falta atribuir. A reserva pública já casa pelos dígitos |
| 3 | Registrar no §3 do CLAUDE.md: "check-in direto de PENDING cancela o sinal PIX pendente" | 🟢 Baixa | Hoje a regra está no código e neste relatório |
| 4 | Check-in, exclusão e cancelamento esperam o PSP (até 10 s) antes de responder | 🟢 Baixa | Decidir junto para os três se a chamada passa a ser sem espera |
| 5 | Teste do check-in com o Asaas fora do ar | 🟢 Baixa | O caminho já é coberto no cancelamento e na exclusão |
