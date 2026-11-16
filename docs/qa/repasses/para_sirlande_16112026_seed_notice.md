# Repasses para Sirlande — 16/11/2026

Origem: `docs/qa/redteam_minio-e2e-final_16nov2026.md`, auditoria do PR #177 (`fix/start-seed-hoje`, Weslley).
Os achados abaixo **não** são da branch auditada. São da área do seed do dia (M8).

### 🟡 [observabilidade] O `node command.js seed` descarta o NOTICE e o WARNING do `seed_hoje.sql`
**Onde:** `services/core-service/command.js:99-103` · `services/core-service/seed/seed_hoje.sql:38-40,120,208-226`
**Cenário:** na véspera da banca, alguém roda `docker compose exec -T -e ALLOW_SEED=1 backend node command.js seed` num banco usado no ensaio. O `seed_hoje.sql` detecta o cenário incompleto e faz `RAISE WARNING 'seed_hoje: o cenário de aurora não ficou completo…'`. O `sequelize.query` usa o client `pg`, e nenhum código registra listener para o evento `notice`: não há `notice` em `node_modules/sequelize/lib/dialects/postgres/`. Por isso o aviso some, e o comando imprime `✅ Seed executado com sucesso.` O painel Hoje sai incompleto na banca, e o próprio arquivo diz que avisaria (linhas 38-40). Some também o NOTICE "linha do cenário pulada" (linha 120).
O mesmo arquivo pelo psql (`./start.sh seed`, PR #177) mostra os dois avisos. A diferença está só no caminho Node, que é o do compose, do CI e do roteiro do README.
**Regra violada:** a falha precisa avisar o operador, e o contrato está escrito no próprio arquivo.
**Correção sugerida:** antes do loop, `const pg = await sequelize.connectionManager.getConnection();` com `pg.on('notice', (n) => console.warn(\`   ${n.severity}: ${n.message}\`))`. Outra forma: rodar os 3 arquivos numa conexão dedicada do `pg` com esse listener. Um teste pode conferir que um banco com reserva mexida produz o WARNING na saída.

### 🟢 [texto] O WARNING manda recriar o banco pelo compose, mesmo quando o seed rodou no k8s
**Onde:** `services/core-service/seed/seed_hoje.sql:224` (e o cabeçalho, linha 38)
**Cenário:** depois do #177, o `ALLOW_SEED=1 ./start.sh seed` aplica o arquivo no cluster. Num banco já usado, o operador lê "recrie o banco: docker compose down -v, up, migrate e seed". No k8s, o comando certo é `./start.sh down`, `./start.sh up`, `./start.sh migrate` e `ALLOW_SEED=1 ./start.sh seed`.
**Correção sugerida:** trocar por "recrie o banco (compose: down -v, up, migrate, seed; k8s: ./start.sh down, up, migrate, seed)".
