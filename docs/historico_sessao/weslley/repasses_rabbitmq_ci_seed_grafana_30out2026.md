# Repasses de RabbitMQ, CI e seed + merge do painel do Grafana — 30/10/2026

**Dev:** Weslley (sessão orquestrada com Claude Code)
**Branches:**
- `fix/rabbitmq-policy-e-seed`, a partir de `develop` em `093d14b`. Mesclada em `develop`.
- `feature/grafana-rabbitmq`, de 28/10, com a auditoria e as ressalvas corrigidas. Mesclada em `develop`.
- `feature/ci-analytics-service`, a partir de `origin/feature/analytics-service` em `9d797dd`. Fica com o Gabriel e entra junto com a `feature/analytics-service`.

**Status:** implementado e testado contra RabbitMQ 4.4.0 e Postgres 17 reais, em Docker. As duas auditorias do qa-redteam saíram APROVADO COM RESSALVAS, sem 🔴:
- `docs/qa/redteam_repasses-weslley-rabbitmq-ci-seed_30out2026.md`
- `docs/qa/redteam_grafana-rabbitmq_30out2026.md`, na branch do Grafana

## Contexto

Pendências da trilha do Weslley em `docs/retomada/ORQUESTRADOR.md` e no alinhamento do Sirlande
(`docs/delegacoes/alinhamento_weslley_28out2026.md`, branch `docs/alinhamento-weslley`):
- repasse de 23/10: CI do analytics e `at-least-once`;
- repasse de 26/10: `./start.sh seed`;
- repasse de 29/10: `delivery-limit`;
- qa-redteam e merge do painel do RabbitMQ (item 2.2 do alinhamento).

O repasse de 19/10, do migrate, já estava na `develop` desde 28/10.

## O que foi feito

| Commit | Arquivo | Mudança |
|---|---|---|
| `157a6bf` | `start.sh`, `README.md` | O `seed` lê de `services/core-service/seed/` e aplica `seed_hotels.sql` e depois `seed_consumo.sql`, com `ON_ERROR_STOP` |
| `5b7edc9` | `start.sh`, `README.md` | `seed` exige `ALLOW_SEED=1`, a mesma trava do `command.js`. A trava vem antes do `kubectl` |
| `28b74f9` | `infra/k8s/rabbitmq-setup.sh`, catálogo §3 | Policy `analytics-core-events`: `dead-letter-strategy at-least-once`, `overflow reject-publish` e `delivery-limit 50` |
| `7a2979b` | idem | Policy `analytics-core-events-dlq` com `delivery-limit -1`. O texto sobre o limite de 50 foi corrigido |
| `2a5147d` (CI) | `.github/workflows/ci.yml` | Job `test-analytics` com `services: postgres` e `rabbitmq`. Roda `rabbitmq-setup.sh` via `docker exec`, gera o `.env.test` e executa `test:coverage` |
| `0264fea` (Grafana) | SPEC-01, painel, alertas | O CA-01.4.f volta a aberto, porque o atraso de consumo não é medido. O alerta "RabbitMQ sem coleta" não afirma mais que o broker caiu |

**Por que policy e não argumento de fila:** argumento não muda numa fila já declarada. A policy vale
para a fila que já existe no volume do compose e no PVC do k8s, sem recriar. Os dois rodam o mesmo
script a cada subida.

## Evidências (RabbitMQ 4.4.0, Docker Desktop 29.9.2)

| Cenário | Resultado |
|---|---|
| Topologia antiga + 25 devoluções da mesma mensagem | Mensagem descartada; log: `dead letter cycle without reason 'rejected'` |
| Policy nova + 25 devoluções | Mensagem continua na fila (`x-delivery-count` 25) |
| `nack` → fila de espera → volta | `x-death` com `rejected`. O `x-delivery-count` **não zera** (25 → 26) |
| Fila de espera apagada + `nack` (at-least-once) | Mensagem retida na principal (`messages 1, ready 0`). Recriada a espera, ela chega lá e volta |
| DLQ com `-1` × padrão, 30 leituras com devolução | `-1`: mensagem fica. Padrão: some |
| Script rodado 2× sobre a topologia antiga e sobre a nova | Idempotente, sem erro |
| Job do CI simulado com os mesmos contêineres | 93 testes, cobertura de 95,4% (statements). Os 8 testes com broker passam com e sem a policy |
| `./start.sh seed` sem `ALLOW_SEED` | Recusa com rc=1, sem tocar no cluster |

**Não verificado:**
- execução real no GitHub Actions;
- `./start.sh seed` contra um cluster de verdade (sem cluster nesta sessão);
- idempotência dos seeds sobre um banco já migrado (só por leitura).

## Achado novo na revisão do compose da H.2 (repasse ao Gabriel)

🟡 O `analytics-service` monta o **arquivo** `./services/core-service/keys/jwt-public.pem`. Se a
chave ainda não foi gerada no primeiro `up`, o Docker cria um **diretório** com esse nome no host.
A partir daí, `gerar_chaves_jwt.js` falha ao gravar o arquivo e o backend não sobe.

Reproduzido no Docker Desktop. `bind.create_host_path: false` e `configs:` também criam o diretório,
então nenhum dos dois serve de trava.

Sugestão: o gerador grava a pública também em `keys/public/`, e o analytics monta esse diretório.
A falta da chave vira o *fail-fast* do `jwtPublicKey.js`, e a privada continua fora do analytics.

## Pendências

| # | Pendência | Dono | Observação |
|---|---|---|---|
| 1 | `delivery-limit` da fila principal: manter 50 ou passar a `-1` | Gabriel | Com 50, uma mensagem nunca confirmada some na 51ª entrega. Com `-1`, ela é reentregue sem fim (crash loop). Sinal hoje: a linha `dead letter cycle` no log do broker |
| 2 | Volta da fila de espera (classic) é at-most-once (🟡-2, SUSPEITA) | Gabriel/Weslley | Risco no restart do nó único. Avaliar a espera como quorum |
| 3 | `jwt-public.pem` vira diretório no compose | Gabriel | Ver a seção acima |
| 4 | Comentários do `consumer.js:79-80,131-133` citam o limite padrão de 20 | Gabriel | Deixa de valer com a policy |
| 5 | Linha no Histórico do catálogo e §5.3 ("20 por padrão", "repasse ao Weslley") | Gabriel | Não editei para não conflitar com a `feature/analytics-service`. Fazer na integração |
| 6 | CA-01.5.a: o job do analytics dispara em todo push | Weslley | Falta o filtro por diretório |
| 7 | Check da policy no CI (🟢-4) | Weslley | Só depois que o CI e o script novo estiverem juntos na `develop` |
| 8 | Atraso de consumo em segundos (CA-01.4.f) | Gabriel/Weslley | Histograma de `now() - occurred_at` no consumidor. `head_message_timestamp` não sai para fila quorum |
| 9 | 🟢 do Grafana: alerta da DLQ só para chegadas novas; vazão por fila; `dead_lettered_delivery_limit_total` | Weslley | Ver o relatório do qa-redteam |
| 10 | Conflito em `docs/infra/KUBERNETES.md` entre `develop` e `feature/analytics-service` | Gabriel | Não vem destas branches |
| 11 | Itens 1.2 a 1.5 e §3 do alinhamento (T-05.6, PIX, Doc 08, compose do roteiro, ofertas A/C/D) | Weslley | Próximas frentes |
