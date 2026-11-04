### 2026-10-19 — Sirlande (orquestrando Claude Code)

- **Branch:** `feature/t04-3-account-bill` (sai de `develop` em `2ad97fc`) · **Tarefa:** T-04.3 (SPEC-04 §5)
- **Objetivo:** bill da conta (`GET /accounts/:id/bill`) e fechamento (`PUT /accounts/:id/close`), e fechar as contas que ficavam abertas depois do check-out e do cancelamento (N-5 da reauditoria da T-04.2)

#### Contexto de abertura

- Mesma sessão da T-04.2, mergeada em `develop` logo antes. PR #98 (`develop → main`) segue aberto, esperando aprovação.
- Research:
  - a reserva guarda um total só (`total_amount`), sem valor de diária por quarto;
  - `payments` ainda não tem `account_id` (só na T-04.4);
  - quatro controllers do Gabriel encerram reserva e nenhum toca nas contas;
  - o garçom já fica fora das rotas novas pela allowlist.

#### Decisões desta sessão

D-33 a D-36 foram escolhidas pelo Sirlande entre alternativas apresentadas no research; D-39 a D-41, na revisão do rateio e depois das auditorias. Justificativa completa em `docs/specs/anexos/SPEC-04-decisoes-T-04.3.md`.

| # | Decisão | Escolha |
|---|---|---|
| D-33 | Valor da diária da conta | Rateio do `total_amount` pelo preço da categoria; sobra dos centavos no quarto principal |
| D-34 | `payments_made` | 0 até a T-04.4; o saldo real segue no bill da reserva |
| D-35 | Reserva cancelada ou excluída | Diária 0; consumo segue cobrado |
| D-36 | Encerrar a estadia | Fecha as contas abertas na mesma transação (check-out, cancelamento, contrato, exclusão) |
| D-37 | Contas antigas abertas | O `migrate` fecha; idempotente; `closed_at` = hora do `migrate` |
| D-38 | Formato e acesso | Valores em texto; INTERNAL com total 0; ADMIN e RECEPTIONIST; 503 com consumo não migrado; frigobar tardio via conta `DIRECT` |
| D-39 | Conta fechada | Grava a diária apresentada (`closed_room_charges`); as abertas dividem só o que sobra do total |
| D-40 | Entre quem dividir | Entre as contas que cobram diária, não entre os quartos; substitui a regra da D-32 no bill |
| D-41 | Fechar a conta de diária | Só com a estadia encerrada (check-out ou cancelamento); conta sem diária fecha durante a estadia |

#### O que foi feito

1. **TDD:** `tests/account-bill.test.js` e `tests/account-close.test.js` escritos antes do código; 26 testes falhando pelos motivos certos.
2. **Bill** (`app/utils/accountBill.js`): o GET e o fechamento usam o mesmo cálculo. Os consumos reusam `accountTotal`.
3. **Fechamento** com a conta travada por `FOR UPDATE`, como o lançamento e a exclusão de item.
4. **Fechamento automático** (`closeReservationAccounts`) nos 4 controllers do Gabriel. A exclusão de reserva passou a usar transação. Repasse em `docs/qa/repasses/para_gabriel_19102026.md`.
5. **`migrate`** fecha as contas que ficaram abertas (`database/closeEndedStayAccounts.js`).
6. **Swagger** das duas rotas, com o schema `AccountBill`, validado com `swagger-parser` e conferido campo a campo contra o que o código devolve.
7. **Teste da T-04.1 ajustado:** o lançamento depois do check-out agora dá 422 porque a conta está `CLOSED`, não mais pela regra da D-22. A D-22 ganhou um teste próprio, com a conta reaberta à força como numa corrida, para não ficar sem cobertura.
8. **Lacunas achadas pelo teste de mutação:** a diária de reserva excluída e o 503 do fechamento não tinham teste. Os dois foram acrescentados.
9. **Revisão do rateio pelo Sirlande:** mostrei o código e apontei dois riscos. O primeiro era a conta fechada mudar de valor depois, e virou a D-39. O segundo era o quarto sem conta ficar fora da cobrança. Recomendei adiar esse para a T-04.6, e errei a gravidade (item 10).
10. **qa-redteam, 1ª rodada: REPROVADO.** O 🔴-1 era justamente o segundo risco, e já acontece hoje: uma reserva com vários quartos e uma conta só deixava a diária dos outros quartos sem cobrança. Eu tinha dito que "nada se perde hoje" porque o bill da reserva continua certo, mas a conta fechada é o que a recepção apresenta. O Sirlande escolheu a D-40 (dividir entre as contas). Correções:
    - 🔴-1 e 🟡-3 pela D-40. O teste que exigia diária 0 depois da troca de quarto foi trocado;
    - 🟡-1 pela D-39, e o realinhamento só move conta aberta;
    - 🟡-2: o fechamento consulta o consumo não migrado na própria transação. Seis fechamentos simultâneos travavam o pool por 60 s;
    - 🟢-1: a rota antiga relê a estadia depois de travar a conta;
    - 🟢-2 documentado.
11. **2ª rodada de mutação:** 32 mutações; 3 sobreviventes viraram testes novos, e só ficou a N03, equivalente (conta fechada com diária gravada nunca chega ao cálculo do rateio).
12. **Reauditoria (2ª rodada): REPROVADO** por um 🔴 que a D-39 abriu (N-1): a conta de diária fechada no meio da estadia não acompanhava uma prorrogação ou um encurtamento, e não sobrava conta aberta para absorver a diferença. Correções, com as escolhas do Sirlande:
    - N-1 → D-41: a conta de diária só fecha com a estadia encerrada (422 no meio dela);
    - N-2 → D-35 ajustada: a conta fechada mantém a diária gravada, mesmo se a reserva for excluída depois;
    - N-3: o `migrate` grava a diária também depois da migração de consumo. Ensaiado num upgrade direto da `main`, que ainda não tem a T-04.2: um `migrate` só deu a conta migrada fechada com R$ 200 gravados;
    - N-4: `closeAccount` só fecha conta aberta.
13. **3ª rodada do qa-redteam: APROVADO COM RESSALVAS.** Os quatro N-x fecharam. Ficaram três 🟢, corrigidos: testes para a conta de diária que fecha em reserva cancelada ou excluída (N-5), teste da D-35 ajustada e um teste que passava com o código errado (N-6), e o `migrate` gravando a diária mesmo quando a migração de consumo sai com erro (N-7). As mutações que o auditor deixou vivas agora morrem.
14. **3ª rodada de mutação:** 37 mutações, 36 mortas; a N03 continua equivalente. Duas sobreviventes intermediárias (trava e filtro no encerramento) mostraram que os testes não conferiam a resposta do check-out; passaram a conferir.

#### Verificação

- `npm test`: **775 passed + 1 skip**, em 38 arquivos. Antes eram 714. O `tests/bill-consumptions.test.js` não foi alterado.
- **Mutação:** 1ª rodada com 22 mutações, todas mortas; 2ª com 32, 31 mortas; 3ª com 37, 36 mortas. A sobrevivente é sempre a N03, equivalente. Duas mutações equivalentes ficaram de fora de propósito:
  - tirar `type !== 'ROOM'` do rateio: o CHECK da D-4 já garante `charges_lodging` falso fora de ROOM;
  - tirar o `requireRole` das rotas: a allowlist já barra o garçom.
- **Ensaio num banco no estado do `develop`, com dados:** worktree do `develop`, `migrate` e dados pela API do `develop`. No `develop`, check-out e cancelamento deixaram as 4 contas `OPEN`. O `migrate` desta branch:
  - fechou 3 contas e manteve aberta a da reserva hospedada;
  - saiu com código 0;
  - na segunda rodada, fechou 0.

  Pela API nova:
  - a reserva multiquarto (Std 180 + Lux 270, 3 noites, total 1.350) deu diária de 540 numa conta e 810 na outra, somando o mesmo 1.350 do bill antigo;
  - a reserva cancelada deu diária 0 e consumo de 14;
  - o check-out novo fechou a conta.

  Repetido depois da D-39 e D-40: o `migrate` gravou 540, 810 e 0 nas contas que fechou, o check-out novo gravou 360, e mudar o preço da categoria depois não alterou as contas fechadas.

  Banco e worktree apagados ao final dos dois ensaios.
- **qa-redteam:** 1ª rodada REPROVADO, 2ª REPROVADO, 3ª **APROVADO COM RESSALVAS** (três 🟢, corrigidos antes do merge: N-5, N-6 e N-7).

#### Commits

| Hash | Mensagem |
|------|----------|
| `f70d461` | `test(accounts): bill e fechamento da conta (RED)` |
| `bbd0563` | `feat(accounts): bill da conta com rateio da diaria` |
| `16989fe` | `feat(accounts): fechamento OPEN para CLOSED` |
| `73ece40` | `feat(reservations): encerrar a estadia fecha as contas` |
| `9c35dcc` | `feat(db): migrate fecha contas de estadias encerradas` |
| `e4fab8d` | `docs(api): bill e fechamento da conta no Swagger` |
| `47a5ffa` | `test(accounts): reserva excluida sem diaria e 503 no fechamento` |
| `e2c8492` | `test(accounts): diaria gravada no fechamento (RED)` |
| `8412137` | `test(accounts): achados do qa-redteam da T-04.3 (RED)` |
| `8c02a49` | `feat(db): closed_room_charges em accounts` |
| `d720539` | `fix(accounts): diaria rateada entre as contas e gravada no fechamento` |
| `51ec180` | `fix(consumptions): realinhamento so de conta aberta e estadia conferida na trava` |
| `22a2704` | `docs(api): diaria gravada e rateio entre contas no Swagger` |
| `78b90ed` | `test(accounts): lacunas da segunda rodada de mutacao` |
| `c5971b0` | `test(accounts): achados da reauditoria da T-04.3 (RED)` |
| `8886e1f` | `fix(accounts): conta de diaria so fecha com a estadia encerrada` |
| `ead9b7f` | `docs(api): regra do fechamento da conta de diaria no Swagger` |
| `2c4a747` | `test(accounts): check-out responde 200 quando a conta ja estava fechada` |
| `60e077b` | `test(accounts): achados N-5 e N-6 da 3a rodada do qa-redteam` |
| `6d0c5ce` | `fix(db): migrate grava a diaria mesmo com a migracao de consumo falhando` |
| `f393171` | `docs(qa): tres rodadas do qa-redteam da T-04.3 e repasse ao Gabriel` |
| (este) | `docs(accounts): relatorio e decisoes D-33 a D-41 da T-04.3` |

#### Pendências para o próximo

- **Check-in com várias contas (T-04.6):** ao menos uma conta precisa cobrar diária, senão o total fica sem conta (anexo, ponto em aberto 5).
- **T-04.4** (`Payment ↔ Account`): `payments_made` real, `CLOSED → PAID`, e `fromCents` com valor negativo (saldo pode ficar negativo com pagamento a maior).
- **Deploy:** coluna nova `accounts.closed_room_charges` (o `migrate` cria e preenche). Rodar o `migrate` depois do rollout fecha as contas que os pods antigos deixaram abertas. Isso soma ao repasse da T-04.2 ao Weslley (`migrate` antes e depois do rollout).
- **Gabriel:** aviso dos 4 controllers e situação do 🟡 de troca de quarto, no repasse de 19/10.
