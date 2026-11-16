# QA Red Team — compose-up confere o rabbitmq-setup
**Branch:** fix/compose-up-confere-setup · **Dev:** Gabriel · **Base:** origin/develop@94eee74 · **Data:** 15/11/2026
**Arquivos auditados:** 3 (`start.sh`, `README.md`, `docs/qa/revisao_pr148_compose_15nov2026.md`) + contexto: `docker-compose.yml`, `infra/k8s/rabbitmq-setup.sh`, `docs/roteiro/PASSO_6_RESERVA_DIRETA_PIX.md`
**Achados no escopo:** 7 (🔴 0 · 🟡 3 · 🟢 4) · **Repassados:** 0

## Veredito
**APROVADO COM RESSALVAS**

Nenhum 🔴. O caminho principal funciona: `exited 0` sai 0, `exited N` sai 1 com o log, e o tempo
esgotado sai 1. O formato `{{.State}} {{.ExitCode}}` foi conferido contra o Compose real
(v2.40.3) num projeto já existente, só com leitura: `postgres-container|exited|0|`. As ressalvas
são três. Há um caminho em que o script sai sem mensagem. Há um falso negativo quando o `up`
recebe um serviço alvo. E existe uma solução nativa do Compose mais simples, que o próprio
repositório já usa no `minio-setup`.

## Achados no escopo

### 🟡-1 [set -e / pipefail] Falha do `docker compose ps` derruba o script sem mensagem
**Onde:** `start.sh:245` e `start.sh:252`
**Cenário:** o `up -d` dá certo e depois o `ps` falha uma vez. Causas possíveis: o daemon do
Docker Desktop oscila no WSL, o `.env` é editado durante a espera, ou a versão do compose não
aceita `--format`. Como o `2>/dev/null` engole o erro e o `pipefail` repassa o código do `docker`,
o `state=$(...)` sob `set -e` encerra o script com saída 1 **e sem nenhuma linha de erro**.
Reprodução com o docker simulado (`FAKE_PS_ERR="unknown flag: --format"`): `exit=1` e a última
linha é `[INFO] Aguardando o rabbitmq-setup...`. Não sai `[ERRO]`. Na frente da banca, isso parece
travamento.
**Regra violada:** Fail Fast com mensagem (CLAUDE.md global); checklist §7, "erro que não diz o
que fazer".
**Correção sugerida:** `state=$(compose_setup_state) || state="?"` e tratar `?` como "estado
desconhecido, tentando de novo" até o prazo acabar. Outra opção é tirar o `2>/dev/null` para o
erro real aparecer.

### 🟡-2 [lógica] `compose-up <serviço>` dá falso negativo de 200 s (ou lê estado velho)
**Onde:** `start.sh:271-272`
**Cenário:** `./start.sh compose-up --build backend` ou `./start.sh compose-up backend`. É o mesmo
uso de `docker compose up -d backend` que o roteiro manda fazer em
`docs/roteiro/PASSO_6_RESERVA_DIRETA_PIX.md:56` e `:90`. Nem o backend nem o analytics dependem
do `rabbitmq-setup` (`docker-compose.yml:184-196`, `:244-250`), então o `up` não o cria. Os
resultados:
- num ambiente limpo, o script espera 200 s e sai 1 com `estado: não criado`. Reproduzido no
  caso 13: `exit=1`, `não terminou em 4s (estado: não criado)`;
- num ambiente que já subiu antes, lê o estado **do último run**. Um `exited 1` antigo reprova um
  `up backend` que não tem nada a ver com ele, e um `exited 0` antigo aprova sem o setup ter
  rodado de novo.
**Regra violada:** o comando promete "conferir o setup" e responde sobre um contêiner que o `up`
não tocou.
**Correção sugerida:** se houver argumento posicional (serviço) e ele não for o `rabbitmq-setup`,
pular a espera com um `warn`. Ou documentar no `usage` que o comando é só para o `up` completo.
Ver também o 🟡-3, que elimina o problema.

### 🟡-3 [KISS / SRP] Existe a solução nativa do Compose, já usada no repositório
**Onde:** `start.sh:236-274` (todo o bloco) e `docker-compose.yml:105-125`
**Cenário:** o `minio-setup` resolve o mesmo problema sem script: o backend depende dele com
`condition: service_completed_successfully` (`docker-compose.yml:191-192`). Basta pôr no
`analytics-service` (`docker-compose.yml:244`) o mesmo:
`rabbitmq-setup: { condition: service_completed_successfully }`. O analytics não tem utilidade sem
a topologia, e o core continua sem esperar, como pede o CA-01.4.c. O ganho:
- o `docker compose up -d --build` puro volta a falhar na hora e mostra
  `service "rabbitmq-setup" didn't complete successfully: exit 1`;
- a regra vale para o README, para o roteiro (que segue com `docker compose up -d --build`,
  `PASSO_6...md:39`) e para o `up -d analytics-service`, que puxaria o setup junto;
- não precisa de polling, de prazo próprio nem de parser de `ps`.
Hoje o `start.sh` é o utilitário de **Kubernetes**: o cabeçalho, o `NS`, o `usage` e todos os
outros comandos são `kubectl`. O bloco de compose é a primeira exceção, e o cabeçalho precisou de
um "e, no compose-up..." para caber.
**Ressalva honesta:** o compose espera o one-shot sem limite próprio. O teto fica com os 3 min do
script. E o analytics só nasce depois do setup, o que não muda nada na prática.
**Regra violada:** KISS (mecanismo novo onde a ferramenta já resolve); SRP do `start.sh`; DRY de
padrão (dois one-shots tratados de jeitos diferentes).
**Correção sugerida:** decisão do Gabriel e do Weslley, dono do `docker-compose.yml` e do
`start.sh` (DIVISAO §3.3 linha 40, §7). Se o `depends_on` for adotado, o `compose-up` vira
desnecessário e o README volta ao `docker compose up -d --build`.

### 🟢-4 [mensagem] Os erros dizem o que falhou, mas não o que fazer
**Onde:** `start.sh:257` e `start.sh:261`
**Cenário:**
- **Falha:** a mensagem diz "Veja o log acima". O caso mais provável, senha do administrador
  diferente da gravada no volume do broker, não aparece como pista. Sugestão:
  `confira RABBITMQ_DEFAULT_PASS no .env (o broker guarda a senha do 1º boot no volume) e rode
  docker compose up -d rabbitmq-setup`.
- **Tempo esgotado:** o script sai 1, mas o setup **continua rodando** e pode terminar bem logo
  depois. A mensagem não diz isso nem como conferir: `docker compose ps -a rabbitmq-setup`.
- **Prazo:** o `rabbitmq-setup.sh` faz 90 × (2 s + o tempo de cada `rabbitmqadmin`). Com a API
  aceitando TCP mas lenta, a espera real passa de 180 s, e os 20 s de folga do `start.sh:241`
  podem não bastar. O relógio só começa depois do `up -d`, o que compensa em parte.

### 🟢-5 [robustez] Entradas fora do esperado dão erro críptico
**Onde:** `start.sh:249`, `start.sh:271`
**Cenário:**
- `COMPOSE_SETUP_TIMEOUT=abc` sai com `start.sh: line 249: abc: unbound variable` (caso 11).
- `./start.sh compose-up -p outro` ou `--profile observability`: o Compose rejeita a opção no
  `up`, porque `-p`, `-f` e `--profile` são opções globais e o `docker compose up --help` não tem
  `-p`. O script para com `unknown shorthand flag`, antes do `ps` (caso 10: zero chamadas a
  `ps -a`). **Logo, não há risco de o `ps` olhar outro projeto**. O `COMPOSE_PROJECT_NAME` por
  variável vale igual para o `up` e para o `ps`, e foi assim que a revisão rodou o projeto
  `gesway-ensaio`. Só falta uma linha no `usage` dizendo que opção global vai por variável
  (`COMPOSE_PROJECT_NAME`, `COMPOSE_PROFILES`) e não como argumento.

### 🟢-6 [doc] A revisão do #148 afirma um "antes" que não existia
**Onde:** `docs/qa/revisao_pr148_compose_15nov2026.md:33` e `:48`
**Cenário:**
- **Linha 33:** diz que, antes do #148, "o setup falhando aparecia no próprio
  `docker compose up`". Mas em `df04d4a^:docker-compose.yml` ninguém depende do
  `rabbitmq-setup`; o único `service_completed_successfully` é o do `minio-setup`. Antes, o que
  aparecia no `up` era o **broker unhealthy**. Uma saída 1 do próprio setup (senha errada) já era
  silenciosa. O #148 não criou o silêncio, só o ampliou ao caso "broker lento". A conclusão
  continua válida, mas o registro de QA deve ficar exato.
- **Linha 48:** atribui ao CLAUDE.md a exigência de qa-redteam antes do merge. A regra está em
  `docs/DIVISAO_TRABALHO_TIME_09set2026.md` §8 ("Nenhum merge em `develop` sem relatório do
  `qa-redteam`"). O `CLAUDE.md` não menciona red team.
**Correção sugerida:** corrigir as duas frases.

### 🟢-7 [coerência] README atualizado, roteiro da demonstração não
**Onde:** `README.md:308` e `docs/roteiro/PASSO_6_RESERVA_DIRETA_PIX.md:39`
**Cenário:** quem segue o roteiro na banca roda `docker compose up -d --build` e continua sem ver
a falha do setup. Se o 🟡-3 for adotado, nada precisa mudar. Se não, o roteiro deve apontar o
`compose-up`, e as linhas 56 e 90 (`up -d backend`) **não** devem virar `compose-up backend`, por
causa do 🟡-2. Observação lateral, que não é do diff: o `README.md:309` diz "6 serviços", mas o
compose tem 8 de longa duração e 2 one-shots sem o perfil de observabilidade (linha de
`b52a1d2d`, de 21/09).

## Repassados a outro dev
Nenhum. Observação de processo: o `start.sh` é da trilha do Weslley
(`docs/DIVISAO_TRABALHO_TIME_09set2026.md`, linha 40). A decisão do 🟡-3 deve passar por ele.

## O que foi verificado e está correto
- `"$@"` e `$*` vazios sob `set -u` (caso 9): `compose up -d` sem argumento extra. Argumento com
  espaço chega inteiro (caso 14: `--build "a b"`).
- `shift` no `compose-up` antes de repassar os argumentos (`start.sh:288`).
- Mais de uma linha (`--scale`): o `head -n1` pega a primeira, e não há SIGPIPE com poucas linhas.
  O resultado depende da ordem (casos 3 e 4), mas o serviço é one-shot e não escala. É aceitável.
- `restarting`, `paused`, `created` e `Exited` maiúsculo caem no tempo esgotado com o estado
  mostrado (casos 5 a 8). Com `restart: "no"`, `restarting` não ocorre.
- `ExitCode` vazio vira `exited ` e é tratado como falha (caso 2). É fail-safe, e o campo existe no
  Compose v2.40 conferido.
- `docker compose config -q` antes do `up` pega `.env` incompleto, com mensagem que aponta o
  README. O `ps` também interpola o `.env` e falharia sem ele (conferido: `MINIO_ROOT_PASSWORD
  is missing`), mas o `config -q` cobre esse caso antes.
- `cd "$(dirname "$0")"` garante que o compose ache o `docker-compose.yml` de qualquer diretório.
- Segredos: o diff não traz valor de senha, só os nomes das variáveis. O `docker compose logs`
  do setup não vaza senha: o script não usa `set -x`, o `adm` manda a saída para `/dev/null` e o
  `echo` final só imprime os nomes de usuário (`rabbitmq-setup.sh:85`).
- LGPD, multi-tenancy e Swagger: não se aplicam. O diff não toca API, modelo nem dado.

## Não foi possível verificar
- Compose real com `up`: proibido nesta auditoria. Tudo foi testado com docker simulado
  (`scratchpad/rt_composeup.sh`, 14 casos), mais uma leitura `ps -a` contra um projeto parado.
- Se o `up -d` sempre reinicia um one-shot que já saiu com config inalterada, o que eliminaria a
  leitura de estado velho no `up` completo (`SUSPEITA` de baixo risco). Confirmar com dois
  `compose-up` seguidos no projeto isolado `gesway-ensaio` e conferir o `StartedAt` do contêiner.
- Tempo real do setup com o broker lento (🟢-4): exige o 1º boot a frio no WSL.

## Desfecho (15/11, Gabriel com Claude)
- **🟡-1 corrigido:** `state=$(compose_setup_state) || state="? (docker compose ps falhou)"`. O laço segue até o prazo e para com `[ERRO]` e o estado.
- **🟡-2 corrigido:** com nomes de serviço nos argumentos, o setup só é conferido se `rabbitmq-setup` estiver entre eles. Quando ele faz parte do `up`, o contêiner anterior é apagado antes (`docker compose rm -fsv rabbitmq-setup`), para o estado lido ser o deste `up`. Limite documentado no código: flags com valor separado (`--timeout 10`) seriam lidas como serviço.
- **🟡-3 não adotado, com motivo:** o nginx depende de o contêiner do analytics existir. Com o analytics esperando o setup, uma falha do setup derrubaria o PMS inteiro na demonstração. Registrado em `revisao_pr148_compose_15nov2026.md`; a decisão final é do Weslley.
- **🟢 corrigidos:**
  - mensagens com o que fazer (`RABBITMQ_DEFAULT_PASS`, setup ainda rodando);
  - prazo de 240 s;
  - `COMPOSE_SETUP_TIMEOUT` validado;
  - `usage` cita `COMPOSE_PROJECT_NAME`/`COMPOSE_PROFILES`;
  - as duas frases da revisão do #148;
  - roteiro PASSO_6 com o `compose-up`.
- **Fica:** "6 serviços" no README (fora do diff).
- **Verificação:**
  - os 14 casos do `rt_composeup.sh` como esperado;
  - compose real, dois `compose-up --build` seguidos no `gesway-ensaio`, ambos com saída 0. O 2º setup tem `StartedAt` novo (18:23:04, contra 18:22:39 do 1º), ou seja, não leu o resultado anterior;
  - ambiente apagado com `down -v`.
