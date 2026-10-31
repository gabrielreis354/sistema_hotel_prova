# Repasses para o Gabriel — 30/10/2026

Origem: sessão do Weslley de 30/10 (`docs/historico_sessao/weslley/repasses_rabbitmq_ci_seed_grafana_30out2026.md`)
e a auditoria `docs/qa/redteam_repasses-weslley-rabbitmq-ci-seed_30out2026.md`. Área: `feature/analytics-service` (H.2).

### 🟡 [compose] `jwt-public.pem` vira diretório no host se a chave não existir no primeiro `up`
**Onde:** `docker-compose.yml`, serviço `analytics-service` (`volumes: ./services/core-service/keys/jwt-public.pem:/app/keys/jwt-public.pem:ro`)
**Cenário (reproduzido, Docker Desktop 29.9.2):** bind de arquivo inexistente faz o Docker criar `jwt-public.pem/` como diretório. Depois disso, `gerar_chaves_jwt.js` falha ao gravar e o backend, que monta `./keys`, não sobe. `bind.create_host_path: false` e `configs:` também criam o diretório.
**Correção sugerida:** o gerador grava a pública também em `keys/public/jwt-public.pem`, e o analytics monta o diretório `./services/core-service/keys/public:/app/keys:ro`. A privada continua fora, e a chave faltando vira o *fail-fast* do `jwtPublicKey.js`.

### 🟡 [decisão] `delivery-limit` da `analytics.core-events`: 50 ou `-1`
**Onde:** `infra/k8s/rabbitmq-setup.sh`, policy `analytics-core-events` (na `develop`).
**Cenário (reproduzido pelo qa-redteam):** uma mensagem que nunca é confirmada (consumidor que cai a cada entrega, OOM) some na 51ª entrega, fora da DLQ, com `dead letter cycle` no log. Com `-1` ela não some, mas é reentregue sem fim.
**Pedido:** decidir. Junto, avaliar a fila de espera como quorum (a volta dela é at-most-once, 🟡-2 SUSPEITA).

### 🟢 [docs] Textos que mudam com a policy
- `services/analytics-service/app/consumer/consumer.js:79-80,131-133` e catálogo §5.3 citam o `delivery-limit` padrão de 20 e "repasse ao Weslley": agora é 50, por policy.
- Falta a linha no Histórico do catálogo (§3 ganhou as policies na `develop`). Não editei para não conflitar com a sua branch.

### ℹ️ [CI] Job do analytics pronto na `feature/ci-analytics-service`
Feito a partir da `feature/analytics-service`, com o commit `2a5147d`. Entra junto com ela: mescle na sua branch antes do PR ou logo depois. Simulado: 93 testes, 95,4%.
