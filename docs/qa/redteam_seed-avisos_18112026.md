# QA Red Team — seed: avisos do banco no `node command.js seed`
**Branch:** fix/seed-mostra-avisos · **Dev:** Sirlande · **Base:** develop@520545c · **Data:** 18/11/2026
**Arquivos auditados:** 5 (diff `origin/develop...HEAD`, commits e5e35fd, a3e65fe, 2d2eab7, d856b75; nada fora de commit além do link `node_modules`)
**Achados no escopo:** 5 (🔴 0 · 🟡 1 · 🟢 4) · **Repassados:** 1

## Veredito
**APROVADO COM RESSALVAS**

Nenhum 🔴. O `runSeed` devolve a conexão limpa nos caminhos de erro que consegui provocar. Uma falha no meio de
um arquivo com `BEGIN` próprio sai com o ROLLBACK, o `seed.agora` volta a vazio, o nível volta a `warning` e o
ouvinte é removido. Com a conexão quebrada, o próprio Sequelize a destrói, e o `releaseConnection` vira no-op.
A ressalva principal (🟡-1) é que esse caminho de erro não tem teste nenhum. O mutante que remove o ROLLBACK
devolve ao pool uma conexão com a transação abortada, e a suíte continua verde.

## Achados no escopo

### 🟡-1 [testes] O caminho de erro do `runSeed` (ROLLBACK no `finally`) não tem teste: o mutante sobrevive
**Onde:** `services/core-service/database/runSeed.js:54` · `services/core-service/tests/seed-avisos.test.js` (nenhum caso com falha)
**Cenário:** conferi com um script no scratchpad. Ele envolve o `client.query` pelo mesmo espião do teste da
linha 61 e troca o SQL do `seed_consumo` por `BEGIN; SELECT set_config('seed.agora','x',false); SELECT 1/0; COMMIT;`.
- Código da branch: o erro `division by zero` sobe, e a conexão volta com `client_min_messages = warning`,
  `seed.agora` vazio, fora de transação e com 0 ouvintes. Está correto.
- Mutante sem a linha 54: a conexão volta ao pool com a transação abortada. A consulta seguinte nela morre com
  `25P02 current transaction is aborted`, e o `set_config` de restauração (linha 57) também falha em silêncio,
  o que deixa o nível em `notice`.
Nenhum teste de `seed-avisos.test.js` ou `seed-hoje.test.js` faz o `runSeed` falhar: o único `expect` sobre o
resultado é `resolves.not.toThrow()` (`seed-hoje.test.js:293`). Por isso o mutante passa. Em produção o dano é
nulo, porque o CLI encerra o processo logo depois. O risco fica nos testes, que chamam o `runSeed` várias vezes
no mesmo processo e no mesmo pool: se alguém tirar ou quebrar o ROLLBACK, o teste seguinte falha longe da
causa. Os 10 mutantes relatados pelo dev não cobrem esse.
**Regra violada:** portão de testes (§8: "teste que exercita só o caminho feliz"). O comentário das linhas 52-53
promete exatamente o que ficou sem prova.
**Correção sugerida:** um caso no `seed-avisos.test.js` com o espião da linha 61, injetando uma falha depois de
`BEGIN` num dos arquivos. Ele confere que o `runSeed` rejeita e que, na mesma conexão, `SELECT 1` passa,
`current_setting('client_min_messages')` é `warning` e `listenerCount('notice')` é 0.

### 🟢-1 [texto] Metade compose do WARNING omite o `ALLOW_SEED=1`, e a metade k8s o inclui
**Onde:** `services/core-service/seed/seed_hoje.sql:225` (e o cabeçalho, linhas 38-39)
**Cenário:** o compose sobe com `NODE_ENV=production` por padrão (`docker-compose.yml:145`). Quem segue ao pé da
letra "Compose: docker compose down -v, up, migrate e seed" e roda `docker compose exec backend node command.js seed`
recebe "❌ Recusado: NODE_ENV=production sem ALLOW_SEED=1" (`command.js:81-85`). A recusa explica o que fazer, então
o custo é um passo a mais na véspera da banca, sem perda. A metade k8s já traz `ALLOW_SEED=1 ./start.sh seed`.
**Correção sugerida:** "Compose: docker compose down -v, up, migrate e ALLOW_SEED=1 seed" ou o comando completo
do README (`docker compose exec -e ALLOW_SEED=1 backend node command.js seed`).

### 🟢-2 [observabilidade] Os avisos recolhidos antes de uma falha se perdem
**Onde:** `services/core-service/command.js:102-104` · `services/core-service/database/runSeed.js:48-50`
**Cenário:** o `seed_hoje.sql` pula uma linha com NOTICE ("quarto 201 já reservado… linha do cenário pulada") e
depois aborta com `RAISE EXCEPTION`, ou falha no `COMMIT`. O `runSeed` relança só o erro, sem os `notices`, e o
`catch` do CLI imprime só `error.message`. O operador vê a causa final, mas não o contexto que a explicaria. Pelo
psql, os dois aparecem.
**Correção sugerida:** anexar `error.notices = notices` antes do `throw` e imprimir as linhas do `seedReport` no `catch`.

### 🟢-3 [testes] O NOTICE "linha do cenário pulada" não é conferido, embora agora chegue
**Onde:** `services/core-service/tests/seed-hoje.test.js:280-293`
**Cenário:** o repasse de 16/11 citava esse NOTICE (`seed_hoje.sql:121`) junto com o WARNING. O teste "quarto do
cenário vendido na demo: pula a linha com aviso" já chama o `runSeed` novo, mas descarta o retorno. Se alguém
reverter o `set_config('client_min_messages', 'notice')` (`runSeed.js:41`), o resumo do dia some e o teste da
linha 14 de `seed-avisos.test.js` pega. Já o texto do NOTICE de linha pulada pode mudar ou sumir sem quebrar teste.
**Correção sugerida:** nesse teste, guardar o `{ notices }` e conferir uma mensagem com `/quarto 201 já reservado/`.

### 🟢-4 [DRY] A lista dos 3 arquivos continua duplicada em `seed-consumo.test.js` (fora do diff, mesmo dono)
**Onde:** `services/core-service/tests/seed-consumo.test.js:19-20` · lista canônica em `database/runSeed.js:9`
**Cenário:** a branch exporta `SEED_FILES` como fonte única, e o `seed-hoje.test.js` passou a usá-lo, mas o
`seed-consumo.test.js` ainda percorre a própria lista com `sequelize.query`. Se um 4º arquivo entrar no seed, esse
teste semeia um banco diferente do CLI e não recebe os avisos. Não entra no veredito: o arquivo está fora do diff,
mas a área é a mesma (seed).
**Correção sugerida:** trocar o laço por `runSeed(sequelize)`.

## Repassados a outro dev

| Sev. | Achado | Onde | Dono | Repasse |
|------|--------|------|------|---------|
| 🟢 | `./start.sh seed` fecha com "Seed aplicado" verde mesmo quando o psql mostrou o WARNING de cenário incompleto | `start.sh:233-238` | Weslley (`start.sh`, §3 da divisão) | `docs/qa/repasses/para_weslley_18112026.md` |

## Respostas aos 4 pontos pedidos

1. **Higiene da conexão.** Fiz uma simulação em cada caminho, além de ler o código:
   - Falha no meio de um arquivo com `BEGIN`: o ROLLBACK, o RESET e o `set_config` devolvem a conexão limpa
     (simulação acima).
   - Falha fora de transação: o ROLLBACK só gera `WARNING: there is no transaction in progress`. Esse aviso cai
     no array e é descartado com o erro, sem efeito.
   - Falha do próprio ROLLBACK ou conexão quebrada: o pg emite `error` (`client.js:405-411`), e o ouvinte do
     Sequelize marca `_invalid` e chama `pool.destroy` (`postgres/connection-manager.js:158-161`). O
     `releaseConnection` cai em "attempt to release an invalid resource" (`sequelize-pool/Pool.js:204-207`), que
     não lança e só registra em log.
   - Falha antes de ler o nível (`nivelAntes` nulo): nada foi alterado, então pular a restauração está certo.
   - Lacuna: o caminho de erro não tem teste (🟡-1).
2. **Produção.** A trava `NODE_ENV=production` sem `ALLOW_SEED=1` (`command.js:81-86`) não mudou. A config do
   Sequelize (`database/connections/sequelize.js`) não tem `replication` nem `dialectOptions`, então o
   `getConnection()` sem `type` pega o pool único, que é o mesmo do `sequelize.query`. Não há Job de seed no k8s
   (`infra/k8s/jobs/` só tem `backend-migrate.yaml`): o caminho do cluster é o psql do `start.sh`. No compose e no
   CI (`ci-e2e.yml:123`) a saída continua 0 com WARNING, o que não quebra o CI num banco novo.
3. **Mesma sessão.** Os 3 arquivos não têm `SET`/`SET LOCAL`, tabela temporária, `pg_temp`, advisory lock nem
   `PREPARE`. Pelo grep, a única variável de sessão é `seed.agora`, lida em `seed_hoje.sql:52`. O que fica de
   sessão (`client_min_messages`, `seed.agora`, `TIME ZONE '+00:00'` do Sequelize) é o mesmo de antes ou é
   desfeito no `finally`. Antes, num CLI sem concorrência, o pool já reaproveitava a mesma conexão ociosa. A
   semântica dos seeds não muda.
4. **Caminho do psql.** O texto novo cita comandos que existem (`start.sh:350-356`). O `./start.sh down` apaga o
   namespace, e o PVC do postgres é do namespace (`infra/k8s/postgres.yaml:2-5`), então "recriar" zera o banco
   de fato. O psql mostra o NOTICE e o WARNING por conta própria. O único descompasso é a linha final verde do
   `start.sh` (repassado).

## O que foi verificado e está correto
- `seed-avisos.test.js` roda verde (8/8) contra o banco de teste.
- O ouvinte de `notice` vai só na conexão emprestada e é removido. O teste da linha 61 mata o mutante que o mantém.
- A troca de `SET seed.agora = '${agora}'` interpolado por `set_config($1)` elimina a interpolação no teste.
- `seedReport`: com WARNING a linha final muda, e sem ele mantém o texto de sucesso. Os dois casos são testados.
- Sem `require()`, sem PII nova em log: os NOTICEs só trazem subdomínio, quarto e datas do seed. O CPF do
  `RAISE EXCEPTION` (linha 93) já existia antes e é fictício.
- Nenhum endpoint ou contrato de API foi tocado, então o Swagger não se aplica.

## Não foi possível verificar
- `node command.js seed` dentro do container do compose e o `./start.sh seed` num cluster real: não subi o
  ambiente. Confiei na leitura e no relato do dev, que rodou contra o banco de teste.
- A política de retenção do PVC no minikube/Docker Desktop (StorageClass com `reclaimPolicy: Delete` é o padrão
  dos dois, mas não conferi no cluster da banca).

## Tratamento (18/11, Sirlande com Claude Code)

| Achado | O que foi feito |
|---|---|
| 🟡-1 O caminho de erro do `runSeed` não tinha teste | Um teste troca o `seed_consumo` por `BEGIN; SELECT 1/0;` e confere que o erro sobe e que a conexão volta limpa: o `SELECT 1` responde (sem `25P02`), o nível fica em `warning`, o `seed.agora` fica vazio e não sobra ouvinte. O mutante sem o ROLLBACK (M11) morre |
| 🟢-1 A metade "Compose" do WARNING sem `ALLOW_SEED=1` | O WARNING e o cabeçalho dizem "seed com ALLOW_SEED=1", e o cabeçalho explica que o compose sobe com `NODE_ENV=production` |
| 🟢-2 Na falha, os NOTICE recolhidos se perdiam | O erro sobe com `error.notices`, e o `command.js` imprime esses avisos antes do "❌ Erro ao executar o seed". Testado no caso do 🟡-1, e o mutante M12 morre |
| 🟢-3 O NOTICE "linha do cenário pulada" sem teste | O caso do quarto 201 vendido na demonstração confere que esse NOTICE chega. O mutante M13 (nível que não baixa) morre |
| 🟢-4 Lista dos 3 arquivos duplicada no `seed-consumo.test.js` | O `runSeed` do teste chama o `database/runSeed.js` |
| Repasse ao Weslley: `./start.sh seed` termina verde depois do WARNING | Em `docs/qa/repasses/para_weslley_18112026.md` |

**Mutação manual:** 13 de 13 mortos (M1 a M10 do fix, M11 a M13 das ressalvas).
**Depois do tratamento:** 1302 testes do core verdes.
