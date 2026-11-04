# RabbitMQ no CI do core, workflow do analytics e conflito do webhook PIX — 04/11/2026

Sessão do Weslley com o Claude Code. Partiu do item 6 da fila do painel (§4) e do repasse de
02/11 do qa-redteam da H.3 (`para_weslley_02112026.md`, na `feature/analytics-cutover`).

## O que foi feito

| Branch | PR | O que muda | CI |
|---|---|---|---|
| `feature/ci-analytics-service` | #114 | Workflow próprio do analytics-service (Postgres + RabbitMQ, topologia do `rabbitmq-setup.sh`); o `.env.test` gerado agora é conferido | 41927281059, 104/104 |
| `chore/ci-core-rabbitmq` | #115 | `ci-core-service.yml` com `services: rabbitmq`, `rabbitmq-setup.sh`, `npm ci` do analytics, `RABBITMQ_*` e `ANALYTICS_PIPELINE_PORT`; falha se o log trouxer `pipeline PULADO` | 41927544363 (develop) |
| `fix/asaas-ressalvas` | #111 | Já existia só na máquina (17/10); push feito. Conflito no `swagger.js` resolvido partindo da versão da develop e somando o `ignored`; cliente da API regenerado; ajustes 🟢 do qa-redteam | suíte local 1128 verdes |

**Prova com a H.3:** branch descartável `test/ci-core-h3` (H.3 + `chore/ci-core-rabbitmq`), run
41928725922: os 28 casos do `analytics.test.js` rodaram (estorno fora da receita, no-show só PAID),
nenhum `PULADO`, 1135 testes verdes. A branch foi apagada do local e do remoto depois.

## qa-redteam

`docs/qa/redteam_ci-rabbitmq-asaas-ressalvas_04112026.md`: as três APROVADAS COM RESSALVAS, sem 🔴.

- 🟡-1 (pipeline pulado com job verde): corrigido no workflow (#115); lado do teste repassado ao
  Gabriel em `docs/qa/repasses/para_gabriel_04112026.md`.
- 🟢-1, 2, 4, 5, 6 e 7: corrigidos nas branches.
- 🟢-3 (bloco do RabbitMQ copiado nos dois workflows): não corrigido. Extrair para uma action
  composta só vale se surgir um terceiro workflow com broker.

## Pendências

- Depois que #114 e a H.3 (#109) entrarem: rodar `ci-analytics-service.yml` na mão
  (`gh workflow run ci-analytics-service.yml --ref develop`) e conferir
  `analytics-queries.test.js` no log.
- Merge de #111, #114 e #115 depende de revisão.
- Ainda abertas da trilha: item 7 (revisar a infra da H.3 no #109), PIX no roteiro (M6, a chave do
  sandbox vence em 15/11), as outras ressalvas 🟡 do Asaas e o compose do roteiro inteiro (M8).
- Branches de docs do Weslley ainda fora da develop, com PR aberto nesta sessão:
  `docs/rds-workshop`, `docs/resposta-alinhamento-sirlande`, `docs/alinhamento-weslley`.

## Ambiente

- Worktrees em `/home/lucaskenway/wt-*` (fora do `/mnt/c`, `npm ci` mais rápido).
- Docker Desktop estava parado: `docker.exe desktop start` e `docker.exe start hotel-test-pg`.
- O diff de merge com mais de 300 arquivos pode não disparar o filtro de `paths`; use
  `gh workflow run <arquivo> --ref <branch>`.
