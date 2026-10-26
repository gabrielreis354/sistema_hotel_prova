### 2026-10-26 — Sirlande (orquestrando Claude Code)

- **Branch:** `feature/t047-consumo-interno-seed` · **Tarefa:** T-04.7 (SPEC-04), CA-04.7.a a f
- **Horário:** sessão de 26/10, depois do merge do PR #102 na `main`
- **Objetivo:** fechar a última fatia da comanda no MVP: relatório de consumo interno, seed de demonstração, Swagger e isolamento

#### Decisões
| # | Decisão | Escolha | Motivo |
|---|---|---|---|
| D-63 | Item de INTERNAL sem motivo | Grupo `reason: null` | Motivo desconhecido não é inventado (como a D-25) |
| D-64 | Período | `consumed_at`, datas juntas, 400 explícito | O item da fila offline pertence ao dia do consumo |
| D-65 | O que conta | Sem excluídos; conta em qualquer status; `count` = lançamentos | Custo do mês não some quando a conta fecha |
| D-66 | Seed | Cardápio, conta da suíte de cada CHECKED_IN, Mesa 3, day-use, INTERNAL, garçom | Demonstração da defesa com o mesmo estado que a API produz |
| D-67 | Onde fica a rota | core-service, com os outros analytics | O analytics-service ainda não existe |
| D-68 | Dia do relatório | Horário de Brasília (`HOTEL_TIMEZONE`) | A sessão em UTC jogava as 21h–24h para o dia seguinte (🟡-1 do redteam) |

Detalhe e justificativas: `docs/specs/anexos/SPEC-04-decisoes-T-04.7.md`.

#### O que foi feito
1. Testes do relatório escritos antes do código (falhavam por 404, a rota não existia), depois o endpoint e a mutação manual da query.
2. Swagger da rota nova e `api-client` regenerado. O de `/accounts` já estava completo.
3. Isolamento de Product e Account no `tenant-isolation.test.js`, com mutação nos controllers para provar que os testes pegam vazamento.
4. `seed_consumo.sql` e teste de idempotência e coerência com as regras da API; ensaio em banco criado pelo `migrate`.
5. qa-redteam e `/security-review`; correção dos achados.

#### Verificação
- Vitest: 983 testes passando (45 arquivos) · `qa_checks.sh`: 3 avisos pré-existentes, nenhum desta branch
- Mutação: 11/11 mutantes da query mortos; mutação nos testes de isolamento e no seed
- Ensaio: banco `gestao_hotel_t047` (migrate → seed por `command.js`, `npm run seed:db` e psql em Brasília e em UTC → 12 itens, 9 contas; o `migrate` rodado depois não alterou nenhuma conta)
- qa-redteam: `docs/qa/redteam_t047-consumo-interno_26out2026.md` (APROVADO COM RESSALVAS, 0 🔴; resolução no fim do arquivo)
- `/security-review`: sem achados

#### Commits
| Commit | Mensagem |
|---|---|
| `89220e0` | `test(analytics): relatorio de consumo interno por motivo (RED, CA-04.7.a a c)` |
| `0914d9c` | `feat(analytics): GET /analytics/internal-consumption agrupa consumo interno por motivo (CA-04.7.a a c)` |
| `906b72b` | `docs(swagger): documenta /analytics/internal-consumption com schema de resposta (CA-04.7.e)` |
| `b202210` | `chore(api-client): regenera o cliente com /analytics/internal-consumption` |
| `794be44` | `test(tenant-isolation): cardapio e contas da comanda entre hoteis (CA-04.7.f)` |
| `62ac799` | `feat(seed): seed da comanda idempotente com cardapio, contas, day-use, INTERNAL e cortesia (CA-04.7.d)` |
| `d918950` | `fix(comanda): achados do qa-redteam da T-04.7 (seed com fuso, seed:db, ano 0000)` |
| `4a8cb83` | `fix(seed): guarda dos lancamentos por conta e descricao, sem depender do fuso` |
| `0fc4ff8` | `test(analytics): dia do relatorio de consumo interno no horario de Brasilia (RED, D-68)` |
| `28cbf31` | `fix(analytics): relatorio de consumo interno conta o dia no horario de Brasilia (D-68)` |
| _(este)_ | `docs(spec-04): T-04.7 concluida, decisoes D-63 a D-68, auditorias e relatorio` |

#### Pendências
| # | Pendência | Prioridade | Observação |
|---|---|---|---|
| 1 | Tela do relatório de cortesias e perdas (CA-05.6.d) | 🟢 | Backend pronto; cliente tipado já tem a rota |
| 2 | Fuso por hotel (coluna em `tenants`) | 🟢 | Só quando houver cliente fora do horário de Brasília (D-68) |
| 3 | Repasse ao Gabriel: fuso em `revenue` e `payment-mix` | 🟡 | `docs/qa/repasses/para_gabriel_26102026.md`; `HOTEL_TIMEZONE` pronta |
| 4 | Repasse ao Weslley: `start.sh seed` com caminho antigo e sem o seed da comanda | 🟡 | `docs/qa/repasses/para_weslley_26102026.md` |
| 5 | Reservas CHECKED_IN do `seed_hotels.sql` em quartos AVAILABLE | 🟢 | `docs/qa/repasses/para_indefinido_26102026.md` |
| 6 | MER: promover `ACCOUNTS` e `ACCOUNT_ITEMS` para ✅ (DoD da SPEC-04) | 🟢 | — |
| 7 | Banco descartável `gestao_hotel_t047` no Postgres local | 🟢 | `DROP DATABASE gestao_hotel_t047;` quando não precisar mais |
