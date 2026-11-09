### 2026-11-09 — Sirlande (orquestrando Claude Code)

- **Branch:** `feature/m5c-estorno-visivel` · **Tarefa:** M5-c, CA-05.2.j, parte do backend (SPEC-05)
- **Horário:** sessão única, 09/11 (depois do M5-b)
- **Objetivo:** o bill da reserva devolver o consumo estornado com quem autorizou, para a tela do Gabriel

#### Decisões
Detalhe, alternativas e justificativas em `docs/specs/anexos/SPEC-05-decisoes-CA-05.2.j.md`.

| # | Decisão | Escolha | Motivo |
|---|---|---|---|
| D-69 | Campo no bill ou endpoint novo | `voided_consumptions` no bill da reserva | Uma requisição, mesma foto (D-57), modelo do pagamento VOIDED |
| D-70 | Quais itens | Só faturáveis | Cortesia nunca foi cobrada |
| D-71 | Quem autorizou | `{ id, name }`, inclusive removido, só do hotel | Auditoria sem expor e-mail ou papel |
| D-72 | Bill da conta | Fora | A linha do tempo do roteiro é a da reserva |
| — | 🟡 do qa-redteam (estorno legado não migrado) | Opção A: documentado e pendente | A opção B arriscaria 503 permanente na comanda e no pagamento |

#### O que foi feito
1. RED com 10 casos e preparação real (check-in, item, estorno por ADMIN, usuário removido).
2. `reservationVoidedItems` e o campo no `reservationBill`; teste extra para `deleted_by` de outro hotel; mutação com 7 mutantes, 6 mortos e 1 equivalente.
3. Swagger com teste que prende a documentação à resposta; `api-client` regenerado; guardião do contrato CA-04.5.b atualizado de propósito.
4. Estorno feito de verdade na API; qa-redteam (3 🟢 corrigidos, 🟡 documentado); análise de segurança sem achado.

#### Verificação
- Testes: backend com 1140 passed · PMS com 203 passed, tipos limpos · qa_checks.sh: OK · qa-redteam (diff): aprovado com ressalvas → `docs/qa/redteam_m5c-estorno-visivel_09nov2026.md`
- API real: estorno aparece com o nome de quem autorizou, e os totais não mudam.

#### Commits
| `67c962a` | `docs(qa): qa-redteam do M5-c (estorno visivel no bill da reserva)` |
|---|---|
| `5e729ff` | `docs(swagger): voided_consumptions e deleted_by obrigatorios, nulo explicado e limitacao do legado (qa-redteam do M5-c)` |
| `b3d09f3` | `test(bill): estorno na conta do acompanhante e pela rota antiga aparecem (🟢 do qa-redteam do M5-c)` |
| `a0c258a` | `test(bill): guardiao do contrato (CA-04.5.b) aceita o acrescimo voided_consumptions (D-69)` |
| `a9fb590` | `chore(api-client): regenera com voided_consumptions no Bill` |
| `7d8478a` | `docs(swagger): voided_consumptions no schema Bill, preso a resposta por teste (M5-c)` |
| `2f3237e` | `feat(bill): voided_consumptions no bill da reserva, com quem autorizou (M5-c, CA-05.2.j)` |
| `8aee223` | `test(bill): RED do consumo estornado com quem autorizou no bill da reserva (M5-c, CA-05.2.j)` |

#### Pendências
| # | Pendência | Prioridade | Observação |
|---|---|---|---|
| 1 | Merge na `develop` depois da revisão humana (mexe em dado financeiro exibido) | Alta | Avisar o Gabriel para ligar a tela |
| 2 | Tela do estorno na linha do tempo | Alta | Gabriel; sugestão de rótulo no anexo §1 |
| 3 | M8: seed com as datas do dia e um estorno de exemplo | Alta | 17/11 |
| 4 | Estorno legado não migrado no histórico; possível reserva presa no `migrateConsumptions` | Baixa | Depois do congelamento (anexo §4) |
