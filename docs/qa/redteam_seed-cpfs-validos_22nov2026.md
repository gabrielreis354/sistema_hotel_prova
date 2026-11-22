# QA Red Team — seed com CPFs válidos (repasse da SPEC-11)
**Branch:** fix/seed-cpfs-validos (86015fd) · **Dev:** Sirlande · **Base:** develop@859cb30 · **Data:** 22/11/2026
**Arquivos auditados:** 5 (`seed/seed_hotels.sql`, `seed/seed_consumo.sql`, `seed/seed_hoje.sql`, `tests/seed-cpf-valido.test.js`, `tests/seed-hoje.test.js`)
**Achados no escopo:** 4 (🔴 0 · 🟡 1 · 🟢 3) · **Repassados:** 0

Linhas citadas são as da branch (`git show fix/seed-cpfs-validos:<arquivo>`), não as da working tree.

## Veredito
**APROVADO COM RESSALVAS**

Nenhum 🔴. Os 60 CPFs de hóspede e os 5 de representante são válidos pelo `isValidCpf`, o de-para
é injetivo e bate com o INSERT, e nenhuma referência ao CPF antigo ficou em JOIN do seed ou dos testes.
A ressalva 🟡 é o UPDATE dos representantes, que sobrescreve sem olhar o valor anterior.

## Achados no escopo

### 🟡-1 [idempotência / dado do usuário] O UPDATE dos representantes sobrescreve qualquer CPF, não só o antigo
**Onde:** `services/core-service/seed/seed_hotels.sql:534-543`
**Cenário:** no ensaio, a recepção corrige o CPF do representante da "Igreja Batista Central" para
o CPF real do pastor (ou qualquer outro valor). Quem roda `ALLOW_SEED=1 node command.js seed` de novo
vê o valor voltar a `50000000132` sem aviso. A condição é `representante_cpf IS DISTINCT FROM m.novo`,
e isso casa com qualquer valor. O UPDATE dos hóspedes (`:61-85`) faz o contrário: só troca quando
`g.cpf = m.antigo`. Além disso o CNPJ não fica preso ao hotel dono: `:542` aceita `aurora` **ou** `sol`
para qualquer um dos 5 CNPJs. Se a Pousada Sol cadastrar à mão um cliente com o CNPJ
`11111111000101` (que no seed é da Aurora), o representante desse cadastro também é sobrescrito.
**Regra violada:** o contrato do próprio seed ("ON CONFLICT DO NOTHING", não mexe no que já existe:
cabeçalho `seed_hotels.sql:6-8`), e o comentário em `:532-533` ("troca só o CPF" do seed antigo).
**Correção sugerida:** de-para igual ao dos hóspedes, com o valor antigo e o hotel na tupla:
`(VALUES ('aurora','11111111000101','11111111101','50000000132'), …) AS m(sub, cnpj, antigo, novo)`
e `WHERE cc.cnpj = m.cnpj AND cc.representante_cpf = m.antigo AND cc.tenant_id = (SELECT id FROM tenants WHERE subdomain = m.sub)`.
O teste `seed-cpf-valido.test.js:54-57` passa com as duas versões. Para pegar a diferença, acrescente
um caso que grava um CPF válido qualquer no representante, roda o seed e confere que o valor ficou.

### 🟢-1 [seed legado] O caso "CPF novo já cadastrado à mão" fica pela metade, e o comentário promete mais
**Onde:** `services/core-service/seed/seed_hotels.sql:58-59` (comentário), `:84-85` (NOT EXISTS), `:276` (JOIN das reservas)
**Cenário:** banco semeado antes de 22/11, e alguém cadastrou um hóspede com `30000000620` na Aurora.
O UPDATE pula o Felipe Rocha do seed, que fica com `30000000006`, um CPF inválido que a tela não salva
de novo. O INSERT de hóspede não duplica, como o comentário diz. Mas o INSERT de reservas (`:276`) agora
resolve `30000000620` para o hóspede cadastrado à mão. A primeira guarda (quarto + entrada 15/06)
não acha nada, porque o `seed_hoje` já moveu a estadia original. A guarda do CHECKED_IN procura
reserva *desse* hóspede no 106 e também não acha. Resultado: nasce uma reserva CHECKED_IN fantasma
de 15 a 20/06 no 106 para o hóspede errado, e o `seed_hoje` pula a linha com NOTICE. O mesmo acontece
se o cadastro manual gravou o CPF formatado (`300.000.006-20`). Aí o NOT EXISTS (`x.cpf = m.novo`) nem
casa, o UPDATE segue e ficam dois cadastros ativos da mesma pessoa.
Para acontecer, alguém precisa digitar um CPF que só passou a existir nesta branch, num banco antigo.
Por isso é 🟢.
**Regra violada:** nenhuma regra dura. É um comentário que descreve mais garantia do que o código dá.
**Correção sugerida:** a menor é ajustar o comentário de `:58-59` ("o hóspede do seed fica com o CPF
antigo; recrie o banco"), já que o próprio `seed_hoje.sql:49-51` manda recriar o banco antes da banca.
Alternativa: um `RAISE WARNING` quando sobrar hóspede com CPF do de-para antigo depois do UPDATE.

### 🟢-2 [doc] Comentário do `seed_hoje` estragado pela troca automática
**Onde:** `services/core-service/seed/seed_hoje.sql:36`
**Cenário:** o texto ficou "novos (30000002240 a 24, 40000001449 e 15)". Antes era "30000000022 a 24,
40000000014 e 15", e a troca só alcançou o primeiro número de cada faixa. Quem lê fica sem saber quais
são os hóspedes, e "30000002240 a 24" não é uma faixa.
**Correção sugerida:** "hóspedes 22 a 24 da Aurora (30000002240, 30000002321, 30000002402) e 14 e 15 da Sol (40000001449, 40000001520)".

### 🟢-3 [testes] Lacunas que deixariam um erro de digitação passar
**Onde:** `services/core-service/tests/seed-cpf-valido.test.js:33-58`, `services/core-service/seed/seed_consumo.sql:101,105`
**Cenário:**
- O day-use usa `LEFT JOIN guests` pelo CPF (`seed_consumo.sql:105`). Com um CPF errado em `:101`, a
  conta "Day-use — piscina" nasce com `guest_id NULL` e nenhum teste falha. Nenhum teste de seed confere
  o hóspede do day-use. O valor de hoje (`30000001007`, hóspede 10) está correto. A lacuna é só de
  proteção.
- O teste do banco legado só cobre o caminho feliz. Ficam sem teste o hóspede soft-deleted com CPF
  antigo, o NOT EXISTS de `seed_hotels.sql:84-85` e o CPF de representante editado à mão (ver 🟡-1).
- O teste não é falso verde no que afirma. Sem o UPDATE dos hóspedes, o reseed quebra no
  `guests_email_tenant_unique` e o `beforeAll` falha. A reconstrução do CPF antigo
  (`substr(cpf,1,1)||'00000000'||substr(cpf,8,2)`) reproduz o valor exato de antes para os 60 hóspedes.

**Correção sugerida:** em `seed-consumo.test.js`, conferir que a conta DAY_USE tem `guest_id` do hóspede
`30000001007`. No teste legado, acrescentar o caso do representante editado à mão.

## Repassados a outro dev
nenhum

## O que foi verificado e está correto
- **CPFs válidos:** script com o `isValidCpf` do projeto sobre todos os literais de 11 dígitos dos 3
  arquivos de seed da branch. Os únicos inválidos são os 59 valores "antigo" do de-para. Um detalhe:
  `30000000035` já era válido e é trocado mesmo assim, o que não causa problema.
- **De-para (`seed_hotels.sql:65-79`):** 60 pares, os 60 novos são distintos e seguem a fórmula do comentário
  (`prefixo + 000000 + nº + DV`). O conjunto dos 60 é igual ao dos INSERTs de hóspede. Nenhum novo
  coincide com um antigo, então não há troca em cadeia.
- **Nenhuma referência antiga sobrando** em `seed/*.sql`, `tests/seed-*.test.js`, `frontend/e2e`
  (gera CPF próprio em `helpers.ts:45`), `start.sh` e `infra/k8s` (`jobs/backend-migrate.yaml` só
  migra; o seed do k8s é o `start.sh seed`, com os mesmos 3 arquivos). Ainda aparecem
  `30000000014`/`11111111111` em `GuestRow.test.ts`, `guestFilter.test.ts`, `documents.test.ts` e
  `tenant-isolation.test.js`. São fixtures próprias que não dependem do seed. Também em
  `docs/legado/queries/demo_apresentacao.sql`, que é material superado.
- **Banco legado: hóspede soft-deleted com CPF antigo.** O UPDATE renomeia também a linha apagada. Os
  índices `guests_cpf_tenant_unique` e `guests_email_tenant_unique` são parciais (`deleted_at IS NULL`,
  `db/schema.sql:124-130`), então isso não viola nada. A duplicação do JOIN sem `deleted_at` em
  `seed_hotels.sql:276` já existia com o CPF antigo e não vem desta branch.
- **Outro tenant:** o UPDATE de hóspedes fica preso a `aurora`/`sol` pelo prefixo (`:82`). Um hotel
  criado no cadastro público com um hóspede `30000000006` não é tocado.
- **Atomicidade:** os dois UPDATEs ficam dentro do `BEGIN` (`:23`) / `COMMIT` do `seed_hotels.sql`. Se
  falhar no meio, o `runSeed.js` faz ROLLBACK.
- **Outbox / analytics:** a `GuestProjection` não guarda CPF (`analytics-service/app/Models/GuestProjection.js:5`),
  então trocar o CPF por UPDATE direto não deixa a projeção divergente. O UPDATE mantém o `id` do
  hóspede, e reservas, contas e eventos continuam apontando para ele.
- **seed_hoje / seed_consumo:** todos os JOINs por CPF (`seed_hoje.sql:70-80`, `seed_consumo.sql:101,127`)
  usam os novos valores. Se não achar o hóspede, o `seed_hoje` lança `RAISE EXCEPTION` (`:94`), e é isso
  que faz o teste legado falhar se o UPDATE quebrar.
- **Testes do `seed-hoje.test.js`:** as 16 trocas de literal correspondem 1:1 ao de-para (22→2240,
  23→2321, 24→2402, 30→3050, 31→3131, 06→0620, 07→0701, Sol 14→1449, 15→1520).

## Não foi possível verificar
- **Execução da suíte:** não rodei `npm test`. Durante a auditoria a working tree foi trocada para
  `fix/comanda-abrir-conta-duplo-toque` por outra sessão, e o `truncateAll` dos testes apagaria o banco
  de teste que ela pode estar usando. Toda a leitura foi feita por `git show fix/seed-cpfs-validos:…`.
  O commit RED (42c2784) antes do GREEN (86015fd) indica que o teste foi visto falhando, mas eu não
  reproduzi.
- **Banco real usado em ensaio:** não rodei o UPDATE contra um dump do ambiente de demonstração. A
  análise do caso legado é só pela leitura do SQL.

---

## Desfecho (22/11, Sirlande com o Claude Code)

| Achado | Tratamento |
|---|---|
| 🟡-1 UPDATE dos representantes sobrescreve qualquer valor | **Corrigido.** De-para `(subdomínio, cnpj, antigo, novo)` e `representante_cpf = m.antigo`, no hotel dono do CNPJ. Teste novo: o CPF corrigido à mão no ensaio continua depois de um novo seed (RED visto antes da correção). |
| 🟢-1 CPF novo já cadastrado à mão | **Comentário ajustado** em `seed_hotels.sql`, como limite conhecido: num banco antigo, recriar o banco. Caso só possível com um CPF que nasceu nesta branch. |
| 🟢-2 Comentário estragado pela troca automática | **Corrigido** em `seed_hoje.sql:36` ("hóspedes 22 a 24 da Aurora e 14 e 15 da Sol"). |
| 🟢-3 Lacunas de teste | **Day-use coberto:** teste confere que a conta "Day-use — piscina" nasce com o hóspede Joao Pereira. O banco antigo continua coberto só no caminho feliz e no caso do 🟡-1. |

Portões: `seed-cpf-valido` (6) e `seed-hoje` (20) verdes.
