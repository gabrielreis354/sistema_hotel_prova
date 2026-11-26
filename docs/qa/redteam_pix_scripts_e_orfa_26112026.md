# QA Red Team — scripts do PIX do passo 6 e cobrança órfã no Asaas
**Branches:** `chore/scripts-pix-ensaio` (0543718, a8fdcdd) · `fix/asaas-cobranca-orfa` (1d0a831, b6328ce)
**Dev:** Weslley (repasse `docs/qa/repasses/para_weslley_24112026.md`) · **Base:** develop@c8a829b · **Data:** 26/11/2026
**Arquivos auditados:** 9 (7 no scripts, 2 no fix), mais o `CreateBookingController.js` e o `docker-compose.yml` para contexto
**Achados no escopo:** 6 (🔴 0 · 🟡 2 · 🟢 4) · **Repassados:** 0 (ver a observação fora do diff no fim)

## Veredito

| Branch | Veredito |
|---|---|
| `chore/scripts-pix-ensaio` | **APROVADO COM RESSALVAS**: 🟡-1 (porta do `.env` ignorada) e 🟡-2 (o script não tem a trava de sandbox) |
| `fix/asaas-cobranca-orfa` | **APROVADO**: só 🟢. Os quatro critérios foram conferidos no código e nos testes |

Nenhum dos achados bloqueia o ensaio ou a demonstração. O 🟡-1 só aparece numa máquina com
`BACKEND_HOST_PORT` no `.env`, e é a correção mais barata de fazer antes de 10/12.

---

## Branch 1: `chore/scripts-pix-ensaio`

### 🟡-1 [Portabilidade] `BACKEND_HOST_PORT` do `.env` é ignorado pelos scripts
**Onde:** `scripts/pix/_comum.sh:14`
**Cenário:** o `docker-compose.yml:14` e o `.env.example:13` mandam definir `BACKEND_HOST_PORT` **no
`.env`** quando a porta 3000 está ocupada. O compose lê o `.env`, mas o shell dos scripts não. Numa
máquina com `BACKEND_HOST_PORT=3001` no `.env`, o backend publica na 3001 e os scripts consultam
`http://localhost:3000`:
- O `1_preparar_plano_a.sh` para no passo 1/4 com "NÃO. Suba antes", com o backend no ar.
- Se outra coisa responder 200 em `localhost:3000/health`, o quick tunnel expõe esse outro serviço.
  O webhook passa a apontar para ele, e o `QR_OK` sai mesmo assim, porque o teste do QR roda dentro do container.
- O `2_plano_b.sh` e o `3_fechar.sh` esperam 2 min e saem com 1.

Isso contraria o critério "rodar de qualquer máquina". É exatamente o caso de um computador do grupo que não é o de sempre.
**Regra violada:** critério de aceite da tarefa (portabilidade) e consistência com o compose.
**Correção sugerida:** em `_comum.sh`, ler a porta do `.env` quando ela não vier do ambiente:
`BACKEND_HOST_PORT="${BACKEND_HOST_PORT:-$(grep -E '^BACKEND_HOST_PORT=' "$REPO/.env" 2>/dev/null | tail -1 | cut -d= -f2)}"`.
O valor padrão continua `3000`. A alternativa, mais robusta, é perguntar ao compose:
`docker compose port backend 3000`.

### 🟡-2 [Segurança operacional] O `asaas_webhook_e_qr.mjs` não tem a trava de sandbox do provider
**Onde:** `scripts/pix/asaas_webhook_e_qr.mjs:8-9`. A checagem do `1_preparar_plano_a.sh:22` só confere se as variáveis estão preenchidas.
**Cenário:** o `AsaasPixProvider.getAsaasConfig()` (`AsaasPixProvider.js:36-61`) recusa URL fora de
`api-sandbox.asaas.com` e chave sem o prefixo `$aact_hmlg_`. Ele recusa no momento da requisição,
não na subida, e por isso o backend fica saudável com uma configuração errada. O script lê
`ASAAS_BASE_URL` e `ASAAS_API_KEY` crus. Com uma chave de produção e
`ASAAS_BASE_URL=https://api.asaas.com/v3` no `.env`, ele faria `PUT /webhooks/<id>` e
`POST /payments` de R$ 5 na conta real. Hoje o dano é contido por acaso: o script sai antes da
cobrança se não existir um webhook chamado `gesway-ensaio-plano-a` (linha 18), e numa conta de
produção esse webhook não existe. Com chave de produção e URL de sandbox, o sandbox responde 401, e
a mensagem engana: "webhook ... não existe no sandbox", em vez de "chave recusada".
**Regra violada:** a regra "nesta fase só o sandbox" (comentário de `AsaasPixProvider.js:31-34`,
`docker-compose.yml:165`) tem um caminho que contorna a trava.
**Correção sugerida:** no topo do `.mjs`, repetir as duas checagens e sair com 1. A URL precisa ter o host
`api-sandbox.asaas.com`, e a chave precisa começar com `$aact_hmlg_`. Uma alternativa é importar
`getAsaasConfig` de `/app/app/services/pix/AsaasPixProvider.js`, que já está no container. Também
vale tratar `lista.status !== 200` antes da busca por nome, para dar a mensagem certa.

### 🟢-1 [Operação] `pkill -x cloudflared` mata qualquer cloudflared da máquina
**Onde:** `scripts/pix/_comum.sh:40`, chamado pelo `2_plano_b.sh:10` e pelo `3_fechar.sh:11`
**Cenário:** o `1_preparar_plano_a.sh <URL>` é documentado para "um túnel já no ar"
(`PASSO_6_RESERVA_DIRETA_PIX.md`, bloco do 1_preparar). Se esse túnel for um cloudflared que o
apresentador subiu à mão, em outro terminal, o `2_plano_b.sh` ou o `3_fechar.sh` o derruba sem
aviso. A troca de `-f` por `-x` resolve a saída 144 de 24/11, porque `-x` compara só o nome do
processo, e está correta. O alcance continua sendo todos os cloudflared do usuário. Com ngrok não acontece.
**Correção sugerida:** quando houver PID file, matar só pelo PID e não chamar o `pkill`. Ou então
registrar no `PASSO_6` que o `2_plano_b`/`3_fechar` fecham todo cloudflared da máquina.

### 🟢-2 [Operação] O DELETE da cobrança de teste não é conferido
**Onde:** `scripts/pix/asaas_webhook_e_qr.mjs:39`
**Cenário:** o QR está OK, mas o DELETE falha (rede ou 4xx). A cobrança de R$ 5 fica aberta no sandbox e
o script imprime `QR_OK` sem avisar. No sandbox não há dano. Só acumula lixo, como o que este fix
quer evitar no backend. As falhas de rede em `/webhooks` e `/payments` (linhas 16 e 31) não têm
`catch`, então o Node sai com 1 e imprime o stack. O shell diz "Falhou no webhook" até quando a
falha foi na criação da cobrança de teste, que deveria sair com 2 ("vá de plano B"). Conferido: o stack
não carrega cabeçalho nem chave.
**Correção sugerida:** logar `id` e status quando o DELETE não voltar 200. Envolver as chamadas do
passo 2 num `try` que saia com 2.

### 🟢-3 [Doc] A linha "O script responde 401" ficou ambígua
**Onde:** `docs/roteiro/PASSO_6_RESERVA_DIRETA_PIX.md`, tabela "Se algo der errado" (linha do 401)
**Cenário:** agora o passo tem quatro scripts. "O script" é o `simular_pagamento_pix.js`, mas quem
lê pode pensar no `1_preparar`. Bastaria escrever "O `simular_pagamento_pix.js` responde 401".

---

## Branch 2: `fix/asaas-cobranca-orfa`

Os critérios da tarefa foram conferidos um a um:

| Critério | Resultado | Evidência |
|---|---|---|
| O erro do QR nunca é mascarado | ok | `AsaasPixProvider.js:165-169` relança `error`. O `#cancelOrphanCharge` (190-201) engole tudo e nunca lança. O teste "se o cancelamento também falha" confere a mensagem `Asaas respondeu 400` |
| O contrato da API não muda | ok | o erro relançado é sempre `PixProviderUnavailableError`, que vem do `#request` (109, 117) ou da linha 163. Por isso o `CreateBookingController.js:122-124` continua respondendo 503. Nenhum outro tipo de erro entra no `try` |
| Nenhum PII no log | ok | as linhas 194 e 200 logam só o `paymentId`. O `#request` loga status, método e rota (`/payments/pay_x`), sem corpo |
| O fluxo feliz não faz DELETE | ok | o teste "QR gerado: nenhuma cobrança é cancelada" falharia se houvesse DELETE |
| Testes | ok | `npx vitest run tests/asaas-pix.test.js`: 48/48 verdes, rodado nesta auditoria. Os testes novos falham contra o código antigo, porque o `deleteCalls` precisa ter 1 e o código antigo não fazia DELETE |

**Latência no caminho de falha (pedido do orquestrador):** o pior caso é aceitável. Hoje é assim:
- Pior caso: `POST /customers` 10 s + `POST /payments` 10 s + QR 10 s (timeout) + DELETE 10 s = **~40 s**, e só no caminho que já termina em 503.
- O cancelamento acrescenta no máximo 10 s.
- Nenhuma transação de banco está aberta nesse tempo: a cobrança roda antes do `sequelize.transaction()` (`CreateBookingController.js:99-130`). Por isso não há lock retido.
- O teto do proxy é o `proxy_read_timeout 60s` (`docker/nginx/default.conf:25`). O Swagger da demo vai direto na 3000.

Fazer o DELETE em segundo plano (fire-and-forget) economizaria 10 s, mas o log do id sairia depois
da resposta, e isso complica os testes. Não compensa.

### 🟢-4 [Testes] O timeout e a falha de rede no QR não têm teste próprio
**Onde:** `services/core-service/tests/asaas-pix.test.js`, bloco "cobrança órfã" (testes novos)
**Cenário:** os testes cobrem o QR que volta não-2xx e o QR sem payload. O caso de 22/11, um QR que demora
mais de 10 s, passa pelo outro ramo do `#request` (`AsaasPixProvider.js:107-109`, `fetch` lança
`AbortError`). Esse ramo não é exercitado com o DELETE em seguida. Pela leitura ele funciona: o
`catch` da linha 165 pega qualquer erro. Falta um teste em que o mock do `pixQrCode` lance
`Object.assign(new Error('aborted'), { name: 'AbortError' })` e o teste confira 1 DELETE e a
mensagem `Asaas indisponível no momento`.

---

## Repassados a outro dev
Nenhum arquivo de repasse foi gravado. A observação abaixo fica **fora do diff** e tem o mesmo dono
provável (PIX/SPEC-03 Integrações é a trilha do Weslley, `DIVISAO_TRABALHO_TIME_09set2026.md`).
Ela não entra no veredito.

| Sev. | Achado | Onde | Dono | Repasse |
|------|--------|------|------|---------|
| 🟢 | As outras duas cobranças órfãs do fluxo continuam só com log, sem `cancelCharge`: o quarto excluído antes da gravação e o rollback da transação. Também fica órfã a cobrança criada quando o `POST /payments` expira no cliente mas foi criada no Asaas, e nesse caso nem o id existe | `CreateBookingController.js:138-143` e `:246-251`; `AsaasPixProvider.js:144-157` | Weslley (provável) | não gravado: mesmo dono, cabe no pós-entrega |

## O que foi verificado e está correto
- Nenhum segredo no diff (grep por `aact`, `token=`, `password`). A chave e o token só existem no
  ambiente do container. O `.mjs` imprime `url`, `enabled` e `interrupted` do webhook, nunca o `authToken`.
- `.tmp-pix-ensaio/` no `.gitignore` bate com o `ESTADO` de `_comum.sh:10`.
- Não há caminho fixo: `PIX_DIR` e `REPO` são derivados de `BASH_SOURCE`, e os scripts fazem `cd "$REPO"`. O cloudflared vem do `PATH`, com fallback para `~/.local/bin`.
- O `1_preparar` aceita a URL, com ou sem `/` final ou `/webhooks/pix`, e confere `$URL/health` antes de apontar o webhook.
- O `PIX_PROVIDER=fake docker compose up -d backend` funciona, porque o compose usa `${PIX_PROVIDER:-fake}`
  (`docker-compose.yml:166`) e a variável do shell tem prioridade sobre o `.env`.
- `setsid nohup ... &` seguido de `$!` grava o PID do cloudflared. O script não é líder de grupo, então o `setsid` não faz fork.
- A doc bate com os scripts nos quatro passos do 1_preparar, nas saídas `PRONTO`/`QR_FALHOU`/rc 2, na troca A→B sem `.env`, no fechamento e na regravação do token.
- O fix entra depois do congelamento de 24/11, mas é correção e não funcionalidade nova. O `PLANO_FECHAMENTO_MVP_15NOV2026.md:39` permite.

## Não foi possível verificar
- A execução real dos scripts: não rodei contra o sandbox nem subi o túnel nesta auditoria. Vale o
  rc=0/357 ms informado pelo dev.
- A suíte completa do core (1411 verdes): só rodei `tests/asaas-pix.test.js`.
- Se o `PUT /webhooks/{id}` do Asaas exige campos que o script não manda: fica valendo a execução real informada.
