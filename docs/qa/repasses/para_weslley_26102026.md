# Repasses para Weslley — 26/10/2026

Origem: `docs/qa/redteam_t047-consumo-interno_26out2026.md` (branch `feature/t047-consumo-interno-seed`, Sirlande).

### 🟡 [Infra/seed] `./start.sh seed` não encontra o seed e não aplica o seed da comanda
**Onde:** `start.sh:101-104`
**Cenário:** o `start.sh` faz `cd "$(dirname "$0")"` (linha 7), que é a raiz do repo, e testa `[ -f seed/seed_hotels.sql ]`. Desde a SPEC-01 (15/09), o seed fica em `services/core-service/seed/` e `ls seed` na raiz falha. Resultado: `./start.sh seed` aborta com "seed/seed_hotels.sql não encontrado". Mesmo com o caminho corrigido, ele só envia `seed_hotels.sql` ao psql. O `seed_consumo.sql` (cardápio, contas, garçom `garcom@aurora.example`) da T-04.7 fica de fora, e a demonstração no K8s sobe sem a comanda.
**Correção sugerida:** apontar para `services/core-service/seed/` e enviar os dois arquivos, nesta ordem: `seed_hotels.sql` e depois `seed_consumo.sql`. A alternativa é rodar `node command.js seed` dentro do pod do backend. Atualizar também `README.md:255,837` e `infra_up.sh:98`.
