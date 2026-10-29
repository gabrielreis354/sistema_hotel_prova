### 2026-10-26 — Sirlande (orquestrando Claude Code)

- **Branch:** `feature/t045-reservation-bill` · **Tarefa:** T-04.5 (SPEC-04)
- **Horário:** sessão única, 26/10
- **Objetivo:** `GET /reservations/:id/bill` passa a somar as contas da reserva, com contrato idêntico

#### Decisões
| # | Decisão | Escolha | Motivo |
|---|---|---|---|
| D-54 | Diária que nenhuma conta cobra | Fica na reserva (`total_amount`, 0 se cancelada) | Até a T-04.6 o check-in não cria conta; somar só as contas zeraria a diária |
| D-55 | Diária com conta de diária | Soma das diárias das contas; a gravada no fechamento vale | É o que a conta apresentou (D-39) |
| D-56 | Pago e pendente | Seguem dos pagamentos da reserva | Igual à soma das contas quando há conta de diária; cobre o sinal sem conta |
| D-57 | Consistência da leitura | `REPEATABLE READ` + `SET TRANSACTION READ ONLY`, sem trava | Uma foto só; não toca a ordem reserva → contas (D-48, D-53) |

Detalhe: `docs/specs/anexos/SPEC-04-decisoes-T-04.5.md`.

#### O que foi feito
1. Testes primeiro (`tests/reservation-bill-accounts.test.js`): só o caso da D-55 falhava no código anterior.
2. `reservationLedger` passa a guardar diária, consumo e se a conta cobra diária (só acrescenta campos).
3. `app/utils/reservationBill.js` (novo) calcula o bill da reserva pelo razão; o controller só abre a transação.
4. Mutação manual: 11 mutantes em `reservationBill.js`; o de `fully_paid` na fronteira sobreviveu e foi morto com o teste de pagamento exato.
5. qa-redteam no diff: 🟢-1 e 🟢-2 corrigidos; 🟡-1 (anterior à tarefa) registrado como pendência.

#### Verificação
- Testes: 919 passed, 1 skipped (42 arquivos) · `bill-consumptions.test.js` sem alteração (CA-04.5.c) · qa-redteam (diff): APROVADO COM RESSALVAS → `docs/qa/redteam_t045-reservation-bill_26out2026.md`

#### Commits
| `9e40190` | `docs(spec-04): T-04.5 concluida, decisoes D-54 a D-57 e auditoria` |
|---|---|
| `6786e32` | `fix(bill): impoe leitura so no banco e prova a foto unica do bill` |
| `980549a` | `feat(bill): bill da reserva soma as contas (T-04.5)` |
| `8154324` | `refactor(accounts): razao da reserva guarda diaria e consumo de cada conta` |
| `3084504` | `test(bill): bill da reserva igual a soma das contas (T-04.5)` |

#### Pendências
| # | Pendência | Prioridade | Observação |
|---|---|---|---|
| 1 | Razão põe o sinal inteiro na conta do acompanhante quando nenhuma conta cobra diária (🟡-1) | 🟡 | Ex.: sinal 150, diária 400, suco 8 → reserva deve 258, conta mostra −142 e fecha PAID; a recepção pode devolver o sinal. Corrigir em `reservationLedger` separando a diária sem conta do crédito. Defeito da T-04.4 |
| 2 | Pool de conexões no padrão (`max: 5`) com o bill segurando conexão por várias consultas (🟢-3) | 🟢 | Medir e configurar |
| 3 | D-54 depois da T-04.6 | 🟢 | Reavaliar quando o check-in criar conta |
