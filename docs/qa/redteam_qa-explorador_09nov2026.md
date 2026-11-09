# QA Red Team — qa-explorador (subagente de QA exploratório + ambiente)
**Branch:** chore/qa-explorador · **Dev:** Sirlande · **Base:** develop@058a3d1 · **Data:** 09/11/2026
**Arquivos auditados:** 5 (`.claude/agents/qa-explorador.md`, `.gitignore`, `docs/FERRAMENTAL.md`, `scripts/qa_explorador_ambiente.sh`, `scripts/qa_explorador_dados.mjs`)
**Achados no escopo:** 11 (🔴 0 · 🟡 4 · 🟢 7) · **Repassados:** 0

## Veredito
**APROVADO COM RESSALVAS**

Nenhum 🔴. O `dropdb` não alcança outro banco Postgres. Mas o backend de QA **escreve fora
do `gestao_hotel_qa`** por outro caminho: o outbox para o RabbitMQ (🟡-1). Corrija antes de
usar o agente numa máquina com o compose de dev no ar.

## Achados no escopo

### 🟡-1 [segurança do ambiente] O backend de QA herda o `.env` de desenvolvimento: publica no RabbitMQ do dev e usa o PIX/MinIO do dev
**Onde:** `scripts/qa_explorador_ambiente.sh:42-44` e `:58`; mecanismo em `services/core-service/_web.js:8-11` (dotenv carrega `$CORE/.env`) e `app/services/outbox/publisher.js:200-213`
**Cenário:** o script exporta só o que está no `.env.test` e depois `POSTGRES_DB`, `NODE_ENV` e
`NODE_WEB_PORT`. O `.env.test.example` não tem `RABBITMQ_*`, `PIX_PROVIDER`,
`MERCADOPAGO_*`/`ASAAS_*`, `MINIO_*` nem `REDIS_URL`. Como o backend roda com `cwd=$CORE`, o
`dotenv.config()` preenche essas variáveis a partir do `.env` de **desenvolvimento**. O dotenv só
deixa de sobrescrever as chaves que já existem, e essas não existem.
Exemplo: um dev com o compose de dev no ar e `RABBITMQ_HOST=localhost` no `.env` →
`startOutboxPublisherFromEnv` liga o publicador → as reservas, pagamentos e check-outs que o
agente cria no "Hotel QA" (hóspedes "Ana Hospedada" etc.) vão para a exchange de dev → o
analytics-service de dev consome e grava no banco **de desenvolvimento** do analytics. O mesmo
acontece com `PIX_PROVIDER=mercadopago|asaas`: o pagamento PIX do agente vira cobrança no provedor
configurado, e com o Mercado Pago não há trava de sandbox. Também com `MINIO_*`: o PDF vai para o
bucket de dev.
**Regra violada:** o comentário do próprio script (`:7`): "nunca o de desenvolvimento". Também
`qa-explorador.md` §5 (`:88-89`, só o banco `gestao_hotel_qa`) e LGPD art. 6º, III
(dado fictício, mas o fluxo vai para um terceiro sem necessidade).
**Correção sugerida:** neutralizar os integradores antes de subir o backend, no mesmo `export` da
`:44`: `RABBITMQ_HOST= PIX_PROVIDER=fake MINIO_ENDPOINT= REDIS_URL=` e as demais. Uma chave que já
existe, mesmo vazia, não é sobrescrita pelo dotenv. Se o MinIO for necessário, use um bucket
próprio de QA.

### 🟡-2 [coerência] O eixo "Rede" manda fazer algo que as próprias regras impedem
**Onde:** `.claude/agents/qa-explorador.md:80-82` × `:95-96` × `:114-116`
**Cenário:** o agente recebe a tarefa de testar "sem rede / 500 / 503". O §4 manda escrever um
script do Playwright (`page.route`, `context.setOffline`) e rodá-lo pelo Bash numa pasta
temporária fora do repositório. Só que:
(a) nenhum `package.json` do repositório tem `playwright`, que só existe no cache do `npx` do MCP.
Um `import 'playwright'` numa pasta temporária falha;
(b) o §5 proíbe instalar qualquer coisa (`:95`);
(c) o Chromium só abre com o `--executable-path` e o `LD_LIBRARY_PATH` da configuração local do
MCP (`docs/FERRAMENTAL.md:94-99`), e o agente não recebe esses valores.
Resultado: o agente instala por conta própria, violando o §5, ou marca "Rede" como não testada
em toda rodada.
Há ainda uma contradição no destino do script: o §4 diz "pasta temporária fora do repositório",
o §7 diz que "scripts de reprodução" vão em `docs/qa/evidencias/<tema>_<data>/`.
**Regra violada:** coerência interna das regras (o agente não consegue cumprir o §3 com o §4 e o
§5 juntos).
**Correção sugerida:** documentar o caminho real: `NODE_PATH` para o `node_modules` do npx do MCP,
mais as mesmas `LD_LIBRARY_PATH`/`executable-path`. Outra opção: um script pronto em `scripts/`
que receba a rota e o status. Em qualquer caso, escolher um único destino para os scripts.

### 🟡-3 [limite de segurança] "Só reporta / só localhost / não leia .env" dependem só do texto, e o FERRAMENTAL chama de trava algo que não é
**Onde:** `.claude/agents/qa-explorador.md:4` (`Bash`, `Write`), `:22-23`, `:87`, `:97-98`; `docs/FERRAMENTAL.md:102`
**Cenário:** com `Bash` e `Write` liberados, nada impede `sed -i`/`git commit` em código,
`cat services/core-service/.env.test`, ou `psql -d gestao_hotel` (banco de dev, com a senha do
próprio `.env.test`). Nada impede também um `curl`/script Node para fora do localhost: o
`--allowed-origins` só vale para o navegador do MCP, e o script de rede do §4 passa por fora dele.
O `FERRAMENTAL.md:102` chama o `--allowed-origins` de "a trava do só localhost", mas o README do
`@playwright/mcp` 0.0.83 (linha 410, no cache do npx) diz: *"Important: does not serve as a
security boundary and does not affect redirects."*
O `qa-redteam` tem as mesmas ferramentas. A diferença é que este agente roda um script que
derruba banco, sobe processos e executa código próprio, então o texto pesa mais.
**Regra violada:** a regra é declarada como limite de segurança (§5), mas nenhuma ferramenta a
aplica.
**Correção sugerida:** no FERRAMENTAL, trocar "trava" por "filtro de conveniência, não fronteira
de segurança". Criar regras `deny` de permissão no `.claude/settings.json` do projeto: `Read(**/.env*)`,
`Bash(git commit:*)`, `Bash(git push:*)`, `Bash(psql:*)`, `Bash(dropdb:*)` fora do script. Ou
dizer explicitamente no §5 que esses limites dependem da obediência do agente.

### 🟡-4 [ferramental] "Uma vez por máquina" está errado: o escopo `local` é por pasta de projeto, e o time trabalha com worktree
**Onde:** `docs/FERRAMENTAL.md:87-89` e `:99`
**Cenário:** confirmado no `~/.claude.json`: o servidor `playwright` está registrado só em
`/home/sirla/faculdade/TCC/sistema_hotel_prova`, e o worktree `wt-qa-explorador` não tem entrada.
Uma sessão aberta em qualquer worktree (é o fluxo desta própria branch) sobe o `qa-explorador`
sem nenhuma ferramenta `mcp__playwright__*`. O agente fica só com Bash, o que leva de volta ao
🟡-2/🟡-3. Além disso, o `--output-dir <repo>/docs/qa/evidencias` é absoluto: mesmo onde funciona,
as capturas caem na pasta de um único checkout, não na do worktree em que o relatório é escrito.
**Regra violada:** documentação do ferramental incorreta (`CLAUDE.md` §10: o FERRAMENTAL é a
referência do que cada recurso faz).
**Correção sugerida:** dizer "uma vez por pasta de projeto (cada worktree conta)", ou registrar com
`--scope user`. Nesse caso, avisar que o `--output-dir` precisa ser um caminho fora do repo ou
passado por sessão.

### 🟢-1 [robustez] Falha no meio do `subir` deixa os serviços no ar sem avisar, e a espera não percebe processo morto
**Onde:** `scripts/qa_explorador_ambiente.sh:31-34`, `:58-68`
**Cenário:** (a) se o backend morre na largada (por exemplo, chave JWT inválida, porque o
`_web.js:24-28` faz `exit(1)`), o `esperar` continua chamando o `curl` por 60 s em vez de
checar `kill -0 $pid`. (b) Se o Vite falha, ou se `qa_explorador_dados.mjs` lança no meio (por
exemplo, contrato da API mudou), o `set -e` sai, mas o backend, e no segundo caso também o Vite,
continuam rodando com os PIDs gravados. Não há `trap`, e a mensagem não diz para rodar `parar`.
No caso do script de dados não sai nem um "✘": só o stack do Node e um `dados.json` parcial,
que o agente pode usar. O próximo `subir` falha em "porta 3000 ocupada", o que é seguro, mas
deixa o usuário sem saber o que fazer.
**Correção sugerida:** colocar um `trap 'parar' ERR` dentro do `subir` e um `kill -0` no laço do
`esperar`. Gravar o JSON num arquivo temporário e fazer `mv` só quando o Node terminar com sucesso.

### 🟢-2 [robustez] `parar` mata o PID gravado sem conferir de quem é, e não espera o processo sair
**Onde:** `scripts/qa_explorador_ambiente.sh:21-28`
**Cenário:** um `.pid` que ficou para trás (processo já morto, PID reaproveitado depois de muito
tempo) faz o `parar` dar `kill` num processo qualquer do usuário. Isso é raro no WSL, onde o
`/tmp` some no reboot. O `kill` também retorna antes de o processo morrer: um `parar && subir`
imediato pode falhar em "porta ocupada". O `ESTADO` em `/tmp` é um só para todos os worktrees:
o `parar` de um worktree derruba o ambiente que outro subiu. Isso é aceitável porque as portas
são únicas, mas não está documentado. Quando nada estava no ar, o `parar` não imprime nada.
**Correção sugerida:** conferir `ps -o args= -p $pid | grep -q _web.js|vite` antes do `kill`,
esperar a porta liberar e imprimir "nada a parar" quando for o caso.

### 🟢-3 [robustez] SUSPEITA — `porta_ocupada` só testa 127.0.0.1
**Onde:** `scripts/qa_explorador_ambiente.sh:19`, `:39`, `:65`
**Cenário:** numa máquina onde `localhost` resolve primeiro para `::1`, um Vite de outro checkout
fica em `[::1]:5173`. O teste em 127.0.0.1 diz que a porta está livre. O Vite novo
(`--strictPort`) falha, mas o `curl http://localhost:5173/` do `esperar` recebe resposta do
**Vite antigo**, servindo o código de outra branch. O agente testa a tela errada.
**Não confirmado aqui:** neste WSL o `/etc/hosts` mapeia `localhost` só para 127.0.0.1.
**Correção sugerida:** testar também `::1`, ou checar que o PID gravado continua vivo depois do
`esperar`.

### 🟢-4 [dados] `dia()` usa o fuso da máquina, não `America/Sao_Paulo`
**Onde:** `scripts/qa_explorador_dados.mjs:26`
**Cenário:** máquina ou CI em UTC, com o script rodando depois das 21h de Brasília →
`toLocaleDateString('sv-SE')` devolve o dia seguinte. A "chegada de hoje" vira chegada de
amanhã para o `@hotel/domain` (`HOTEL_TZ`). O agente então reporta um falso defeito: "a chegada
não aparece no painel de hoje". Nesta máquina o fuso é `America/Sao_Paulo`, por isso não
aparece aqui.
**Correção sugerida:** `toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' })`.

### 🟢-5 [robustez] Sem checagem prévia de `node_modules`
**Onde:** `scripts/qa_explorador_ambiente.sh:53`, `:58`, `:63`
**Cenário:** num worktree recém-criado (este próprio, por exemplo), não existe
`services/core-service/node_modules` nem `frontend/apps/pms/node_modules`. O `migrate` falha
com uma mensagem genérica. Se o backend estiver instalado e o PMS não, o `.bin/vite` não existe,
o subshell sai com 127 e o `esperar` gasta 60 s antes de dizer "tela não respondeu".
**Correção sugerida:** `[ -x "$PMS/node_modules/.bin/vite" ] || falha "rode pnpm install em frontend/"`,
e o mesmo para o core.

### 🟢-6 [coerência] Oráculo "CPF mascarado" genérico, somado à severidade 🔴 por "pessoal exposto", produz 🔴 falso
**Onde:** `.claude/agents/qa-explorador.md:53` e `:151`
**Cenário:** o agente abre o detalhe do hóspede, onde a recepção precisa do CPF completo para
conferir o documento no balcão, e reprova a entrega com 🔴 por "dado pessoal exposto". No
produto, o mascaramento é decisão só do comprovante impresso (`ReservationReceiptPage.tsx:41,61`).
**Correção sugerida:** restringir o exemplo: "CPF mascarado onde a tarefa não precisa dele, como
no comprovante". Deixar 🔴 só para dado de outro hotel, ou dado pessoal em tela de papel que não
deveria vê-lo (garçom, por exemplo).

### 🟢-7 [coerência] "Quando uma tela está pronta" é citada como regra escrita, mas só existe no próprio agente; um item é CA ainda aberto
**Onde:** `.claude/agents/qa-explorador.md:28-29`, `:40-45`
**Cenário:** a lista não existe no `DESIGN_PMS.md` nem na SPEC-05 com esse nome: veio dos
CA-05.1.e, CA-05.1.f e CA-05.12.c. O CA-05.12.c ("nenhuma tela baixa a coleção inteira") está
`[ ]` (`docs/specs/SPEC-05-frontend-pms.md:277`), ou seja, é pendência conhecida. O agente vai
reportar como defeito novo em cada tela o que o time já sabe que falta.
**Correção sugerida:** citar a origem de cada item (CA-xx) e mandar conferir o `[x]`/`[ ]` na
SPEC antes de classificar; pendência aberta entra como "conhecido", não como achado.

## Repassados a outro dev
Nenhum.

## O que foi verificado e está correto
- O `dropdb`/`createdb` usam o nome fixo `BANCO="gestao_hotel_qa"` (`:16`, `:51-52`). Não há
  variável vazia nem herdada que mude o alvo, e o `set -u` aborta se faltar
  `POSTGRES_HOST/PORT/USER/PASSWORD`.
- O `POSTGRES_DB` do `.env.test` é sobrescrito **depois** do `source` (`:44`). O dotenv do
  `_web.js:8` e do `command.js:7` não sobrescreve chave que já existe, então o migrate e o
  backend usam o `gestao_hotel_qa`.
- O `NODE_ENV=test` do `.env.test` é trocado por `development`, e o `migrate` usa
  `sync({alter})` no banco recém-criado, sem `force` em outro banco.
- `qa_explorador_dados.mjs:10`: regex ancorada, só `http://localhost|127.0.0.1[:porta]`.
- O `dados.json` tem só a senha de teste (`senha123`), e-mails e URLs. Nenhum token é impresso, e
  nenhum segredo do `.env.test` vai para log ou JSON. O `PGPASSWORD` só passa por ambiente.
- Rodar o `subir` duas vezes é barrado pelo teste de porta (`:38-39`).
- PID certo: o `exec` no subshell e o shim do pnpm (`.bin/vite` termina em `exec node …`)
  preservam o PID do node.
- Os nomes `mcp__playwright__*` do frontmatter batem com a lista do 0.0.83, e o
  `browser_run_code_unsafe` ficou de fora. As ferramentas omitidas `file_upload`/`drag`/`drop` não
  fazem falta: o `apps/pms/src` não tem `type="file"` nem drag-and-drop.
- O PMS não carrega origem externa (sem `https://` em `index.html`/`src`), então o
  `--allowed-origins` não gera falso erro de console.
- O `.gitignore` cobre `docs/qa/evidencias/`; relatórios e repasses continuam versionados.
- Não há colisão com arquivo de outra trilha (`DIVISAO_TRABALHO` §7).

## Não foi possível verificar
- Execução real do `subir` neste worktree: faltam `.env.test` e `node_modules` (o chamador já
  validou no checkout principal).
- Se o analytics-service de dev de fato consome a exchange com o compose típico. O mecanismo do
  🟡-1 foi confirmado no código (`publisher.js:200-213`), mas não rodando.
- O 🟢-3 (localhost → ::1) depende do `/etc/hosts` de outra máquina.
