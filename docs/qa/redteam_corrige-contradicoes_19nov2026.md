# QA Red Team — corrige-contradicoes (🟡-26, R-1 a R-5 e 🟢-14 da revisão de 19/11)
**Branch:** docs/corrige-contradicoes-19nov (PR #192) · **Dev:** Gabriel · **Base:** develop@0f438db · **Data:** 19/11/2026
**Commits auditados:** `506b607` folha da banca · `983b1d2` roteiro passo 6 · `622a7f9` README · `b185959` CLAUDE.md, ARQ_DATABASE, ROADMAP · `fde7c6e` SPECs · `d93b1e7` plano de fechamento
**Arquivos auditados:** 13 (só documentação). Para conferir cada afirmação também li: `routes/router.js`, `routes/apis/{roomRouter,paymentRouter,webhookRouter,addressRouter}.js`, `app/utils/{roles,roomRules,jwtKeys,paymentEnums}.js`, `middlewares/auth.middleware.js`, `LoginController.js`, `PixWebhookController.js`, `AsaasPixProvider.js`, `FakePixProvider.js`, `config/swagger.js`, `db/schema.sql`, `OutboxModel.js`, `command.js`, os 5 arquivos de `.github/workflows/`, os modelos do `analytics-service`, `git log --merges origin/develop`, o conteúdo dos merges #123, #124, #143, #176, #177 e #178, `docs/qa/ensaio_roteiro_14112026.md`, `docs/delegacoes/estado_fechamento_mvp_19nov2026.md`, a proteção de branch no GitHub (`gh api`), os checks do PR #192 e os Docs 02, 04, 05, 06, 07 e 08 do fork.
**Achados no escopo:** 15 (🔴 0 · 🟡 7 · 🟢 8) · **Repassados:** 0

## Veredito
**APROVADO COM RESSALVAS**

As seis frentes pedidas foram tratadas, e a maior parte do texto novo confere com o código: rotas, papéis, RS256, 17 tabelas mais o *outbox*, máquinas de estado, `/address/:cep`, autenticação do webhook por provedor, números e datas de PR. Nenhum segredo novo. Ficam 7 🟡: afirmações que a banca consegue desmentir ao vivo (o Swagger não tem B2B; os cinco workflows **não** rodam a cada PR, e o próprio #192 provou isso), um rótulo de tarefa trocado na SPEC-05, e contradições novas entre o texto corrigido e outros trechos do repositório. Nenhuma é 🔴: é texto, sem dado nem dinheiro em jogo. Mas a banca lê a documentação, e por isso vale corrigir antes do congelamento.

## Achados no escopo

### 🟡 [doc × código] O README diz que o Swagger cobre B2B, e não cobre
**Onde:** `README.md:576`
**Cenário:** a banca abre `/api-docs` para conferir "B2B" e não acha nada. As chaves de `paths` em `services/core-service/config/swagger.js` (linhas 535 a 1519) não têm `/corporate-clients`, `/event-quotes` nem `/contracts`. O B2B aparece só como texto de um 409 (`swagger.js:1057`). As rotas existem (`routes/router.js:87-89`), mas estão fora do Swagger. As demais promessas da frase conferem: comanda, produtos, contas, `/public/{subdomain}/*`, `/webhooks/pix` e `/address/{cep}`.
**Regra violada:** precisão da documentação. CLAUDE.md §6: endpoint fora do Swagger quebra o cliente tipado.
**Correção sugerida:** tirar "B2B" da frase, ou escrever "B2B fora do Swagger (rotas no `router.js`)".

### 🟡 [doc × CI] "Cinco workflows rodam a cada PR" é falso
**Onde:** `README.md:1206`, `docs/banca/FOLHA_RESPOSTAS_BANCA.md:33` ("com testes e checagens a cada PR")
**Cenário:** só o `ci.yml` roda em qualquer PR. Os outros quatro têm filtro: `ci-core-service.yml` e `ci-analytics-service.yml` usam `paths:` do próprio serviço, `ci-frontend.yml` usa `paths: frontend/**…`, e `ci-e2e.yml` tem `paths-ignore: ['docs/**', '**/*.md']`. Prova: `gh pr checks 192` lista apenas "Checagens determinísticas". Se a banca perguntar "esse PR rodou os cinco?", a resposta da folha está errada. Além disso, a frase "o `ci-e2e` avisa, mas não bloqueia o merge" sugere que os outros bloqueiam. Não bloqueiam: `gh api …/branches/develop/protection` responde "Branch not protected", e a `main` responde "Required status checks not enabled".
**Regra violada:** precisão da documentação. A folha existe para a banca.
**Correção sugerida:** "Cinco workflows; cada um roda quando o PR mexe na sua área (o `ci` roda sempre)". Sobre bloqueio, ou declarar que nenhum check é obrigatório, ou ativar os checks obrigatórios. Essa decisão é do dono de `.github/`.

### 🟡 [SPEC × SPEC] SPEC-05 chama de T-05.5 o pagamento no check-out e o estorno
**Onde:** `docs/specs/SPEC-05-frontend-pms.md:6`
**Cenário:** a nota diz "T-05.5 com pagamento no check-out e estorno (#124, #123)". No mesmo arquivo, a T-05.5 é a **Comanda do garçom**, concluída em 26/10 (`SPEC-05:167`). O #124 (`feature/m5b-pagamento-checkout`) entrega o **CA-05.6.a**, e o #123 (`feature/m5c-estorno-visivel`) entrega o **CA-05.2.j** (commits `docs(m5b): anexo de decisoes do CA-05.6.a…` e `docs(m5c): anexo de decisoes do CA-05.2.j…`). A linha do índice (`docs/specs/README.md:38`) está certa: "T-05.5" = comanda. A nota nova, portanto, contradiz o próprio arquivo e o índice.
**Regra violada:** rastreabilidade SPEC → PR. O Doc 08 usa as SPECs como critério de conclusão.
**Correção sugerida:** "T-05.5 (comanda, 26/10); pagamento no check-out (CA-05.6.a, #124) e estorno visível (CA-05.2.j, #123)".

### 🟡 [doc × doc] O passo 6 diz que o roteiro em compose não foi ensaiado, mas foi, em 14/11
**Onde:** `docs/roteiro/PASSO_6_RESERVA_DIRETA_PIX.md:118-122`
**Cenário:** o texto novo diz: "O ensaio foi com o backend fora do compose; o roteiro inteiro no compose fica para o 2º ensaio, em 24/11". Só que `docs/qa/ensaio_roteiro_14112026.md:8-11,68-70` registra o roteiro em compose (`gesway-ensaio`, `PIX_PROVIDER=fake`) com o passo 6 pelo **plano B**, e `PLANO_FECHAMENTO_MVP_15NOV2026.md:28` diz "Em 14/11 … os 7 passos funcionaram de ponta a ponta". A pendência antiga ("ensaiar os dois planos") foi apagada sem registrar que o plano B já foi ensaiado. O que de fato falta é o **plano A dentro do compose**.
**Regra violada:** contradição nova entre documentos (o objetivo da branch).
**Correção sugerida:** "Plano B ensaiado em compose em 14/11 (`docs/qa/ensaio_roteiro_14112026.md`); plano A ensaiado em 12/11 fora do compose; plano A no compose fica para 24/11".

### 🟡 [doc interno] O plano de fechamento ainda contradiz o próprio cabeçalho e a SPEC-08
**Onde:** `docs/PLANO_FECHAMENTO_MVP_15NOV2026.md:161`, `:229`, `:191`, `:230`, `:77`, `:97`, `:189`
**Cenário:** o cabeçalho novo (`:10-11`) e o §5 (`:201`) dizem que o roteiro no CI foi feito no #176. Mesmo assim, `:161` mantém "Falta **rodar no CI**", e o calendário `:229` mantém "22/11 · Roteiro rodando no CI · A fazer". A SPEC-08 nova (`SPEC-08:6`) diz que a T-08.5 foi entregue no #167 (merge em 16/11, conferido) e que as ressalvas da T-08.4 saíram no #178 (16/11, conferido). O plano, porém, ainda diz "#167 aberto" (`:191`), "a T-08.5 em aberto" (`:230`) e "Restam 2 🟡 da T-08.4" (`:77`, `:97`, `:189`). Quem lê os dois documentos da mesma branch encontra estados opostos.
**Regra violada:** contradição nova entre documentos. O 🟢-14 pedia "atualizar o plano".
**Correção sugerida:** marcar `:161` e `:229` como feitos (#176), `:191`/`:230` como #167 mergeado e `:77`/`:97`/`:189` como resolvidos no #178. Se as 2 🟡 da T-08.4 ainda estiverem abertas, corrigir a SPEC-08.

### 🟡 [SPEC] SPEC-01 troca as letras dos CA da T-01.5 e dá por cumprido um critério que depende de deploy
**Onde:** `docs/specs/SPEC-01-microsservicos.md:6`
**Cenário:** a nota diz "publicação de imagem em registry e deploy (CA-01.5.b e e)". No mesmo arquivo (`:279-282`), o deploy é o **CA-01.5.c**, e o **CA-01.5.e** é "cobertura medida de forma global, considerando todos os microsserviços" (critério C7). Depois, a nota dá o **CA-01.5.d** ("falha bloqueia o *deploy*") como cumprido. Não há deploy, e nenhum check é obrigatório (ver o achado dos workflows). O CA-01.5.a também fica parcial, porque o `ci-core-service.yml` dispara com mudança no `analytics-service` (`paths`). O restante confere: #105 em 31/10, #109 em 09/11, #112 e #113 em 04/11, e o analytics sem `/metrics` (nenhum arquivo do `analytics-service` cita *metrics*; RNF-029 no Doc 02 exige).
**Regra violada:** rastreabilidade SPEC → critério. A banca cobra o C7, a cobertura global.
**Correção sugerida:** "CA-01.5.a e a parte de testes do d cumpridos; b, c e e (cobertura global) no 5º semestre".

### 🟡 [SPEC] SPEC-03 "concluída, falta só o job" com o CA-03.3.a ainda aberto
**Onde:** `docs/specs/SPEC-03-integracoes-externas.md:6`, `docs/specs/README.md:36`
**Cenário:** a nota diz "concluída para o 4º semestre … Falta só o job que expire a cobrança". O mesmo arquivo mantém `[ ] CA-03.3.a` (`:144`): a ADR não compara Asaas × Mercado Pago. Conferi a ADR-008 do fork (`07-registro-decisoes-arquitetonicas-adr.md:469-505`), e ela ainda não tem essa comparação. O `CA-03.2.d` (`:128`) segue `[ ]` com "falta o Asaas chamar a URL pública — M6". Isso já aconteceu, mas a SPEC-03, diferente da 01 e da 05, não avisa que os marcadores são históricos.
**Regra violada:** precisão do estado da SPEC.
**Correção sugerida:** "Falta o job de expiração (5º sem.) e um parágrafo na ADR-008 comparando os provedores (CA-03.3.a)". Marcar também o CA-03.2.d com a data de 12/11.

### 🟢 [doc × doc] O banner de legado da ARQ_DATABASE vale para conteúdo que foi atualizado em outubro e que ainda é citado
**Onde:** `docs/db/ARQ_DATABASE.md:3-6`
**Cenário:** o banner diz "3º semestre … não use como referência". O arquivo, porém, recebeu em 21/10 as colunas do estorno da T-06.13 (`0b6117e`, `5b67b84`) e em 28/10 o `./start.sh migrate` (`9b4429a`). Além disso, `docs/specs/anexos/SPEC-01-catalogo-eventos.md:497` manda ler "detalhes em `docs/db/ARQ_DATABASE.md` §7" (`reservation_rooms` com triggers e `EXCLUDE`).
**Correção sugerida:** "Legado na visão geral (8 tabelas, papéis); a §7 e a tabela `payments` foram atualizadas até 28/10. Em caso de divergência, vale o Doc 04".

### 🟢 [doc interno] O CLAUDE.md ainda manda pesquisar no PRODUCT_ROADMAP
**Onde:** `CLAUDE.md:153`
**Cenário:** `:30` e `:480` dizem que o roteiro é legado, mas `:153` (Research do RPI) segue citando `PRODUCT_ROADMAP.md` como "documentação que define o comportamento esperado".
**Correção sugerida:** trocar por `docs/PLANO_FECHAMENTO_MVP_15NOV2026.md` e `docs/specs/`.

### 🟢 [link] O plano aponta para um arquivo que ainda não está na develop
**Onde:** `docs/PLANO_FECHAMENTO_MVP_15NOV2026.md:13`
**Cenário:** `docs/banca/CONTRADICOES_DOCUMENTACAO_19NOV2026.md` não existe na worktree nem em `origin/develop`. Ele está só na `origin/docs/avaliacao-banca-simulada` (PR #179, aberto). Se o #192 entrar antes, o link fica quebrado.
**Correção sugerida:** fazer o merge do #179 antes do #192, ou citar o PR #179 no lugar do caminho.

### 🟢 [doc × doc] O plano diz que o ensaio de 12/11 usou ngrok; o roteiro novo diz que foi o cloudflared
**Onde:** `docs/PLANO_FECHAMENTO_MVP_15NOV2026.md:93` × `docs/roteiro/PASSO_6_RESERVA_DIRETA_PIX.md` (bloco do plano A)
**Cenário:** o relatório do ensaio (`ensaio_pix_asaas_sandbox_m6_12nov2026.md`, "Ambiente") confirma: "cloudflared … O ngrok não estava instalado". O roteiro está certo, e o plano ficou errado.
**Correção sugerida:** no `:93`, trocar "pelo ngrok" por "por túnel (cloudflared no ensaio de 12/11)".

### 🟢 [doc interno] O cabeçalho do README diz Kubernetes; o texto novo diz Compose
**Onde:** `README.md:5` × `README.md:1216`
**Cenário:** `:5` diz "Infraestrutura: **Kubernetes** (orquestração local …)", e o texto novo de `:1216` diz "no 4º semestre o ambiente é o Docker Compose local". O CLAUDE.md novo (`:57`) acerta: Compose para a demonstração e k8s local.
**Correção sugerida:** alinhar `:5` com o `CLAUDE.md:57`.

### 🟢 [doc × código] O banco do analytics não tem "só projeções"
**Onde:** `README.md:750`
**Cenário:** além das projeções (`defineProjection.js`), o banco tem `processed_events` (`app/Models/ProcessedEventModel.js:10`), a tabela de idempotência do consumidor.
**Correção sugerida:** "projeções e o controle de eventos já processados".

### 🟢 [doc × código] CLEANING → AVAILABLE também passa pelo PUT /rooms/:id
**Onde:** `README.md:636`
**Cenário:** `MANUAL_ROOM_TRANSITIONS.CLEANING = ['AVAILABLE','MAINTENANCE']` (`app/utils/roomRules.js:21-26`) vale para a edição manual (admin). O diagrama dá a impressão de que só o `/release` libera o quarto. O CLAUDE.md §3 tem a mesma omissão, mas fora do diff.
**Correção sugerida:** "via `PUT /rooms/:id/release` (admin ou recepção) ou pela edição do admin".

### 🟢 [doc × código] O DELETE /payments/:id responde 405 só para o ADMIN
**Onde:** `README.md:619`
**Cenário:** `paymentRouter.delete('/:id', requireRole('ADMIN'), paymentDeleteNotAllowed)` (`routes/apis/paymentRouter.js:39`): a recepção recebe 403, não 405. A linha também não marca "(admin)", ao contrário das linhas vizinhas de PUT e void.
**Correção sugerida:** "Responde 405 (admin; demais papéis, 403)".

## Repassados a outro dev
Nenhum. Todos os achados estão em arquivos que esta branch alterou ou são contradições criadas pelo texto novo.

## O que foi verificado e está correto
- **Rotas e papéis:** `PUT /rooms/:id` só ADMIN; `PUT /rooms/:id/release` para ADMIN e RECEPTIONIST; `POST /payments/:id/void` e `PUT /payments/:id` só ADMIN; `DELETE /payments/:id` → 405 (`roomRouter.js`, `paymentRouter.js`). Os papéis `ADMIN`/`RECEPTIONIST`/`WAITER` e o garçom só na comanda (`roles.js`, allowlist de 6 rotas). O CHECK de `role` no `schema.sql:48` inclui `WAITER`.
- **JWT:** `algorithm: 'RS256'`, `expiresIn: '8h'` (`LoginController.js:56`), verificação com `algorithms: ['RS256']` (`auth.middleware.js:19`), chave privada só no core (ADR-006). O token de exemplo decodifica para `{"alg":"RS256","typ":"JWT"}`.
- **Banco:** 17 `CREATE TABLE` no `db/schema.sql`. `outbox` vem do `OutboxModel` (`tableName: 'outbox'`), criado pelo `sequelize.sync` do `migrate`. A lista de comanda e B2B do README confere com o schema. O Doc 04 v1.3 registra "17 tabelas + OUTBOX".
- **Máquina de reservas:** check-in a partir de `PENDING` e `CONFIRMED` (`CheckInController.js:39`), cancelamento só de `PENDING`/`CONFIRMED` (`CancelReservationController.js:8`).
- **Máquina de quartos:** `CLEANING → MAINTENANCE` e `AVAILABLE ↔ MAINTENANCE` (`roomRules.js:21-26`).
- **Folha da banca:** `router.use('/address', …)` com `GET /:cep`. O Asaas autentica por `asaas-access-token` = `ASAAS_WEBHOOK_TOKEN` (`AsaasPixProvider.js:190-202`) e o fake por HMAC com `PIX_WEBHOOK_SECRET` (`FakePixProvider.js:42`). Os dois passam por `provider.getChargeStatus` antes de efeito (`PixWebhookController.js:84`). `ViaCepAddressProvider.js` e `address.test.js` existem.
- **Workflows:** os 5 arquivos existem, com o conteúdo descrito (o `qa_checks.sh` no `ci`; postgres:17 e rabbitmq no core; typecheck, test e build no frontend; Playwright não obrigatório no e2e). Nenhum publica imagem.
- **PRs e datas** contra `git log --merges origin/develop`: #100 24/10 · #105 31/10 · #106 02/11 · #108 03/11 · #109, #123, #124, #125 09/11 · #112, #113 04/11 · #143 12/11 · #159 a #162 15/11 · #167, #170, #178 16/11 · #176, #177 18/11. O #176 traz `docker/minio/Dockerfile` e `ci-e2e.yml`, e o #177 mexe só no `start.sh`.
- **Caminhos citados existem:** `docs/legado/justificativa/arquitetura.md`, `docs/legado/modelagem/{der.png,modelo_logico.png,dicionario_dados.md}`, `docs/legado/queries/{crud,consultas_avancadas,agregacoes}.sql`, `docs/historico_sessao/weslley/ensaio_pix_asaas_sandbox_m6_12nov2026.md` (versionado), `docs/delegacoes/estado_fechamento_mvp_19nov2026.md` (versionado; item 🟡 5 = chave do Asaas), `docs/pagamentos/ASAAS_SANDBOX.md`, `docs/PLANO_MVP_ATE_10DEZ2026.md`, `docker/minio`.
- **Ensaio de 12/11:** cloudflared, cobrança removida no cancelamento (`deleted: true`), `CONFIRMED`/`PAID` pelo webhook, botão nos detalhes da cobrança, backend fora do compose. Tudo confere com o relatório.
- **Plano A como decisão de 15/11:** `PLANO_FECHAMENTO:79,92,131`.
- **ADR-005 rejeita o Swarm:** fork, `07-…adr.md:342` e `06-c4-model.md:372`.
- **SPEC-06:** T-06.13 no #100 em 24/10. A T-06.12 é da S9 no Doc 08 (`08-…:264`), e T-06.1, 06.7, 06.10, 06.11 e 06.12 seguem 🔲 no corpo.
- **R-1, item `CARTAO`:** fica como está. `README.md:984` é a saída do seed, e `seed_hotels.sql:270` usa mesmo `'CARTAO'`.
- **Segredos:** o diff não acrescenta credencial, token nem chave. Aparecem só nomes de variável (`ASAAS_WEBHOOK_TOKEN`, `PIX_WEBHOOK_SECRET`) e o comando público do cloudflared. A remoção da tabela de secrets AWS do README tira referência, não expõe nada.

## Não foi possível verificar
- O texto dos Docs 04 (§10.1, "8 tabelas") e 08 v1.3: conferi a versão do fork local, que pode não ser a última enviada ao professor.
- Se a chave do Asaas de 12/11 já foi trocada. A única fonte é a declaração do Weslley, e o roteiro só diz "confirmar".
- Se o `/api-docs` é servido pelo nginx no compose no caminho que o README sugere: não subi o ambiente.

## Desfecho (19/11/2026)

Corrigidos no commit seguinte a este relatório: os 7 🟡 e os 🟢 1, 2, 4, 6, 7 e 8. Ficaram:

- 🟢 3 (link para o relatório de contradições): o plano agora cita o PR #179, que traz o arquivo;
  o link funciona depois que ele entrar.
- 🟢 5 (cabeçalho do README com Kubernetes): o README cobre os dois ambientes; a reescrita da Parte 2
  fica fora do escopo deste PR.
