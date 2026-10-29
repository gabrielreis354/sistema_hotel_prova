### 2026-10-26 — Sirlande (orquestrando Claude Code)

- **Branch:** `fix/repasses-payments-products` · **Tarefa:** repasses de QA na área de schema e models
- **Horário:** sessão de 26/10, depois da T-04.7
- **Objetivo:** fechar `para_sirlande_21092026.md` / `para_sirlande_17102026.md` (índice de `payments.provider_charge_id`) e `para_sirlande_07102026.md` (testes de CHECK que passavam sem asserção)

#### Decisões
| # | Decisão | Escolha | Motivo |
|---|---|---|---|
| D-1 | Escopo do índice | Global, sem `tenant_id` | O id vem do PSP e o webhook PIX (rota pública) busca só por ele; por tenant deixaria a ambiguidade |
| D-2 | Parcial ou total | Parcial (`WHERE deleted_at IS NULL`) | Regra dos models paranoid; o webhook não acha pagamento excluído; desde a T-06.13 pagamento se estorna |
| D-3 | `provider` no índice | Fora | Uma instalação usa um provider só; a busca do webhook não filtra por ele |
| D-4 | Onde vive o índice | Só `applyDbConstraints` e `schema.sql`, não no model | 🟡-1 do qa-redteam: no model, duplicata legada para o sync no meio |

#### O que foi feito
1. Provado que os dois testes de CHECK de `products` rodavam com 0 asserções. Passaram a criar o próprio tenant, com `expect.assertions(1)` e o nome do CHECK no erro esperado.
2. Testes do índice escritos antes da correção (RED): duplicata viva recusada, nulos livres, id de pagamento excluído reaproveitável.
3. Índice `payments_provider_charge_id_unique` em `indicesParciais` e no `schema.sql`.
4. Código do PIX do Weslley intocado; aviso em `docs/qa/repasses/para_weslley_26102026.md`.

#### Verificação
- Vitest: 989 testes passando (45 arquivos), incluindo `public-booking`, `payments`, `asaas-webhook` e `mercadopago-webhook`
- Mutação: CHECKs de `products` enfraquecidos e entrada de `payments` removida do `indicesParciais` derrubam os testes
- Ensaio no banco `gestao_hotel_t047`: `migrate` cria o índice; com duplicata legada, o sync vai até o fim e o erro nomeia tabela, coluna e índice sem o valor; depois de limpar, o índice é criado
- qa-redteam: `docs/qa/redteam_repasses-payments-products_26out2026.md` (APROVADO COM RESSALVAS, 0 🔴; resolução no fim do arquivo)

#### Pendências
| # | Pendência | Prioridade | Observação |
|---|---|---|---|
| 1 | Antes do deploy: conferir duplicatas vivas de `provider_charge_id` no banco real | 🟢 | `SELECT provider_charge_id, count(*) FROM payments WHERE deleted_at IS NULL AND provider_charge_id IS NOT NULL GROUP BY 1 HAVING count(*) > 1;` — repassado ao Weslley no aviso |
| 2 | T-06.12 (CPF no log), tarefa livre do painel | 🟡 | Próxima da trilha, avisar o Gabriel |
