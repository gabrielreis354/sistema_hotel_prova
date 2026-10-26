### 2026-10-26 — Sirlande (orquestrando Claude Code)

- **Branch:** `feature/t046-checkin-account` · **Tarefa:** T-04.6 (SPEC-04), escopo do MVP: CA-04.6.a, c, d
- **Horário:** sessão única, 26/10 (mesma sessão da T-04.5)
- **Objetivo:** o check-in abre a conta da suíte, e a recepção lista as contas da reserva

#### Decisões
| # | Decisão | Escolha | Motivo |
|---|---|---|---|
| D-58 | O que o check-in abre | 1 conta ROOM no quarto principal, cobrando diária, na transação do check-in; reaproveita qualquer conta de diária da reserva | CA-04.6.a e c; a rota antiga pode ter criado a conta antes do check-in |
| D-59 | Resposta do check-in | Continua sendo a reserva | Contrato em uso; a conta sai na rota nova |
| D-60 | `GET /reservations/:id/accounts` | Formato de `GET /accounts`, mais antiga primeiro, 404 fora do tenant, garçom barrado | CA-04.6.d |
| D-61 | Crédito sem conta de diária | Paga primeiro a diária que ficou na reserva | Corrige o 🟡-1 da T-04.5 (sinal devolvido por engano) |
| D-62 | Ordem de fechamento no encerramento | Trava por id, fecha pela ordem do crédito (titular primeiro) | Defeito da T-04.4: o sinal ia para quem fechasse primeiro, por sorteio de UUID |

Escopo: CA-04.6.b (check-in com várias contas) fica para o 5º semestre (painel de 21/10). CA-04.6.e e f já estavam atendidos pela T-04.1 e T-04.3.
Detalhe: `docs/specs/anexos/SPEC-04-decisoes-T-04.6.md`.

#### O que foi feito
1. Testes antes (`tests/checkin-account.test.js`): 9 de 17 falharam no código anterior.
2. Check-in abre a conta (`openStayAccount`, com savepoint) e rota nova `GET /reservations/:id/accounts`; Swagger atualizado.
3. 78 testes antigos abriam a conta da suíte à mão depois do check-in: passaram a usar `tests/helpers/legacyStay.js` (estado real das estadias anteriores ao deploy), uma linha por arquivo.
4. qa-redteam achou deadlock entre check-in e a rota antiga de consumo (🟡-1): a rota antiga passou a travar a reserva antes de criar a conta. O teste pedido no 🟢-2 revelou o defeito da D-62.
5. Mutação manual: 17 mutantes; 1 sobrevivente morto com teste novo, 1 equivalente. Deadlock, D-62 e o 🟢-1 da delta têm testes que falham sem a correção.

#### Verificação
- Testes: 944 passed, 1 skipped (43 arquivos), suíte completa rodada 2× seguidas sem falha · `bill-consumptions.test.js` sem alteração · qa_checks.sh: 3 avisos pré-existentes, sem erro
- qa-redteam: 1ª rodada APROVADO COM RESSALVAS → `docs/qa/redteam_t046-checkin-account_26out2026.md`; delta APROVADO → `docs/qa/redteam_t046-checkin-account_delta_26out2026.md`

#### Commits
| `5be4213` | `docs(spec-04): T-04.6 (a, c, d) concluida, decisoes D-58 a D-62 e auditorias` |
|---|---|
| `f429a42` | `fix(consumptions): estadia encerrada durante a espera da trava nao ganha conta nova` |
| `1eff38e` | `fix(accounts): encerramento fecha as contas pela ordem do credito, titular primeiro (D-62)` |
| `d2756ee` | `fix(accounts): rota antiga de consumo trava a reserva antes de criar a conta da suite` |
| `1666a04` | `test(checkin): conta de diaria em outro quarto da reserva tambem e reaproveitada` |
| `00a8997` | `docs(swagger): check-in abre a conta da suite e GET /reservations/{id}/accounts` |
| `177f377` | `test(accounts): testes da mecanica de contas montam a estadia sem a conta do check-in` |
| `19e1743` | `feat(checkin): check-in cria a conta da suite e GET /reservations/:id/accounts (T-04.6)` |
| `e5d6af2` | `fix(accounts): credito da reserva paga primeiro a diaria sem conta (D-61)` |
| `3c6a759` | `test(checkin): check-in cria a conta da suite e lista contas da reserva (T-04.6)` |

#### Pendências
| # | Pendência | Prioridade | Observação |
|---|---|---|---|
| 1 | Deploy: rodar o `migrate` antes e depois do rollout | 🟡 | Acerta `CLOSED ↔ PAID` das contas de acompanhante que viraram PAID por engano antes da D-61 |
| 2 | CA-04.6.b — check-in com várias contas | 🟢 | 5º semestre; inclui contas por quarto na reserva-bloco B2B |
| 3 | Seed: reservas `CHECKED_IN` entram por SQL, sem conta | 🟢 | T-04.7 |
| 4 | Pool de conexões no padrão (`max: 5`) | 🟢 | Herdado da T-04.5 |
