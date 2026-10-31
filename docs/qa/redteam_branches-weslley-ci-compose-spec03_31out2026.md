# QA Red Team — compose do PIX/Asaas, SPEC-03 e CI por serviço (três branches)

**Branches:** `chore/compose-pix-asaas` (cab1c68) · `docs/spec03-asaas` (acda612) · `feature/ci-por-servico` (1d285b2, ed1fc66)
**Dev:** Weslley (orquestrando Claude Code) · **Base:** develop@4234915 · **Data:** 31/10/2026
**Arquivos auditados:** 9 no diff (3 + 1 + 5), mais o contexto: `services/core-service/app/services/pix/{index,AsaasPixProvider,MercadoPagoPixProvider}.js`, `infra/k8s/{backend,configmap,secret}.yaml`, `frontend/packages/api-client/scripts/dump-openapi.mjs`, `services/core-service/config/swagger.js`, `origin/feature/ci-analytics-service:.github/workflows/ci.yml`, a ADR-008 e o relatório de 15/10
**Achados no escopo:** 12 (🔴 0 · 🟡 5 · 🟢 7) · **Repassados:** 2 (ambos para o próprio Weslley, área dele mas fora destes diffs)

## Veredito

| Branch | Veredito |
|---|---|
| `chore/compose-pix-asaas` | **APROVADO COM RESSALVAS** (pode mergear; 1 🟡 e 2 🟢) |
| `docs/spec03-asaas` | **APROVADO COM RESSALVAS** (pode mergear **depois** da `chore/compose-pix-asaas`; 1 🟡 e 2 🟢) |
| `feature/ci-por-servico` | **APROVADO COM RESSALVAS** (pode mergear; 3 🟡 e 3 🟢. O 🟡-C1 precisa ser resolvido no merge da `feature/ci-analytics-service`) |

Nenhum 🔴 no escopo. Não há proteção de branch: `gh api .../branches/{develop,main}` responde `"protected": false` e `rulesets` vem vazio. Renomear job ou workflow não quebra nenhum check obrigatório hoje.

---

## Achados no escopo

### `chore/compose-pix-asaas`

#### 🟡-A1 [Segurança / KISS] O compose passa a repassar as credenciais do Mercado Pago, e esse provedor não tem trava de sandbox
**Onde:** `docker-compose.yml:157-158` (branch), `services/core-service/app/services/pix/MercadoPagoPixProvider.js:6,29`
**Cenário:** alguém põe `PIX_PROVIDER=mercadopago` e cola um Access Token de produção (`APP_USR-...`) no `.env` da raiz para "testar o plano C" na demonstração. O backend chama `https://api.mercadopago.com/v1/payments` e cria cobrança PIX real: um hóspede de teste que pagar paga de verdade. O Asaas recusa chave e URL fora do sandbox (`AsaasPixProvider.js:6-8,51-56`). O Mercado Pago não tem trava nenhuma. Os comentários novos do compose (`:151-152`) e do `.env.example` só falam da trava do Asaas, então quem lê conclui que o compose é "só sandbox".
**Regra violada:** SPEC-03 §3.2 ("apenas sandbox"), minimização / KISS: o roteiro usa só `fake` e `asaas`, e o Mercado Pago nunca foi validado (SPEC-03 na própria branch irmã).
**Correção sugerida:** tirar `MERCADOPAGO_*` do compose até haver trava de sandbox no provider. Se ficar, pôr um comentário explícito no compose dizendo que o Mercado Pago **não** tem trava de sandbox.

#### 🟢-A2 [Docs] "Sem aspas a chave chega vazia" não vale para toda chave
**Onde:** `docs/pagamentos/ASAAS_SANDBOX.md:99-101` (branch), `.env.example:40-41` (branch)
**Cenário:** testado com `docker compose` v5.5.0. `K2=$aact_hmlg_...OjFkZGZk==` sem aspas resolve para `"=="`, não para vazio. O nome da variável termina no primeiro caractere fora de `[A-Za-z0-9_]`, e o padding base64 sobra. O backend então recebe `==` e responde `503` com `ASAAS_API_KEY precisa ser uma chave de sandbox`, não com `não configurado`. Quem segue o guia procura a mensagem errada. O resto do texto foi confirmado: com aspas simples o `config` mostra `$$aact_hmlg_...`, e o aviso `The "aact_hmlg_..." variable is not set` aparece. Aspas duplas também esvaziam a chave (`K3="$aact_hmlg_abc"` deu `""`), e o guia não fala delas.
**Correção sugerida:** escrever "entrega a chave vazia **ou truncada**" e citar as duas mensagens de 503. Acrescentar uma linha: "aspas duplas não servem; `$$aact...` também funciona".

#### 🟢-A3 [Docs] `MERCADOPAGO_*` repassado pelo compose mas ausente do `.env.example` da raiz; porta do ngrok fixa
**Onde:** `docker-compose.yml:157-158` × `.env.example:33-46` (branch); `docs/pagamentos/ASAAS_SANDBOX.md:106-107`
**Cenário:** o compose lê duas variáveis que o `.env.example` da raiz não documenta. Pelo guia, `ngrok http 3000` "funciona igual", mas está errado quando `BACKEND_HOST_PORT` é outra porta (compose `:125`).
**Correção sugerida:** resolver junto com o 🟡-A1. No guia, escrever `ngrok http ${BACKEND_HOST_PORT:-3000}`.

### `docs/spec03-asaas`

#### 🟡-S1 [Docs / ordem de merge] O CA-03.2.h cita como fato uma branch ainda não mesclada
**Onde:** `docs/specs/SPEC-03-integracoes-externas.md:127` (branch)
**Cenário:** o texto diz "no `docker-compose.yml` desde 31/10, branch `chore/compose-pix-asaas`". Se a SPEC entrar na develop antes da branch do compose, ou se o compose for barrado, a develop passa a afirmar algo que não existe nela. O `git merge-tree` das duas branches não acusa conflito, então nada obriga a ordem certa.
**Regra violada:** CA marcado com evidência que não está na base.
**Correção sugerida:** mesclar a `chore/compose-pix-asaas` primeiro. Ou trocar o parêntese por "(compose: `cab1c68`)" só depois do merge.

#### 🟢-S2 [Docs] "Atualização (15/10)" narra fatos de 16/10 e 17/10
**Onde:** `docs/specs/SPEC-03-integracoes-externas.md:30` (branch)
**Cenário:** o parágrafo datado de 15/10 diz que o Asaas "entrou ... em 17/10" e "foi testado ... em 16/10". Os fatos batem com as fontes: `1cbc4c0` é de 17/10 00:07, o PR #89 de 12/10 e o teste real de 16/10 (relatório de 15/10, l. 47-64). Só a data do rótulo é que é anacrônica.
**Correção sugerida:** `**Atualização (31/10):**`.

#### 🟢-S3 [Evidência] CA-03.2.c diz "payload copia-e-cola **válidos**", mas ninguém validou o payload
**Onde:** `docs/specs/SPEC-03-integracoes-externas.md:122` (branch); fonte `docs/historico_sessao/weslley/integracao_asaas_pix_sandbox_15out2026.md:55,58`
**Cenário:** a fonte registra um "BR Code real de homologação" emitido pelo Asaas, com o pagamento confirmado pelo botão do painel. O copia-e-cola não foi lido por nenhum app nem decodificado: o guia (l. 143) diz que os bancos recusam QR de homologação. O CA está bem sustentado como "cobrança real com QR emitido pelo PSP", mas o "válidos" não tem evidência própria.
**Correção sugerida:** no parêntese, "QR e copia-e-cola emitidos pelo Asaas; pagamento confirmado pelo painel do sandbox, sem leitura por app de banco".

> As outras afirmações foram conferidas e batem: `pay_r2mqgcempts7u43h`, R$ 60, `RECEIVED` → reserva `CONFIRMED`; o webhook disparado localmente; a comparação em tempo constante (`AsaasPixProvider.js:194-198`, `timingSafeEqual` sobre SHA-256); `GET /payments/{id}` como fonte de verdade (`:206-207`); as 3 ressalvas 🟡 ainda abertas (nenhum commit em `AsaasPixProvider.js` depois de `a4702ab`, 16/10); a ADR-008 com b e c atendidos (`versao-sugerida_v1.0.md:481-499`); o PR #97 de 29/10; o Doc 07 passado ao Gabriel em 14/10 (`MOTIVOS.md:7`). O CA-03.3.a ficou parcial, e com razão.

### `feature/ci-por-servico`

#### 🟡-C1 [CI / conflito] O merge da `feature/ci-analytics-service` conflita no `ci.yml` e, resolvido do jeito óbvio, quebra o CA-01.5.a
**Onde:** `.github/workflows/ci.yml` (branch) × `origin/feature/ci-analytics-service:.github/workflows/ci.yml:98-180`
**Cenário:** `git merge-tree feature/ci-por-servico origin/feature/ci-analytics-service` dá `CONFLICT (content): Merge conflict in .github/workflows/ci.yml`. A outra branch reescreve o job `test` do core, que esta branch removeu, e acrescenta `test-analytics` no `ci.yml`, que não tem filtro de caminho. Quem resolve "aceitando os dois lados" ganha dois problemas:
- o job do core volta ao `ci.yml` e roda duas vezes, porque também está em `ci-core-service.yml`;
- o analytics roda em todo push, o que contraria o "disparado só por mudança no seu diretório" do CA-01.5.a.

Há um segundo conflito, em `docs/infra/KUBERNETES.md`, mas ele já existe entre a ci-analytics e a develop. Não é desta branch.
**Regra violada:** SPEC-01 CA-01.5.a. Coordenação de §7 da divisão (o Weslley integra o que a T-01.5 entrega).
**Correção sugerida:** no merge, descartar o job `test` da ci-analytics e mover o `test-analytics` para um `ci-analytics-service.yml`, com `paths: services/analytics-service/**`, `infra/k8s/rabbitmq-setup.sh` (o job o executa, l. 146-158) e o próprio workflow. Deixar o `ci.yml` só com `qa`.

#### 🟡-C2 [CI] Branches `refactor/**` e `test/**` não disparam nenhum workflow no push
**Onde:** `.github/workflows/ci-core-service.yml:8-14`, `.github/workflows/ci-frontend.yml:8-13`, `.github/workflows/ci.yml:7-14`
**Cenário:** o `docs/CODING_STANDARDS.md:793-794` define os prefixos `refactor/` e `test/`. Um `git push origin refactor/extract-date-utils` que quebra a suíte não roda CI nenhum. O fluxo do CLAUDE.md §4 é merge local em develop sem PR, então a quebra só aparece no push da develop. A lista vem da develop, mas esta branch a copiou para dois arquivos novos. O mesmo buraco já causou a ressalva 🟡-7 com `feat/**` (`docs/delegacoes/rodada2_gabriel_28set2026.md:77`).
**Correção sugerida:** acrescentar `'refactor/**'` e `'test/**'` nos três workflows, ou trocar a lista por `branches-ignore: []` com o filtro de `paths`.

#### 🟡-C3 [CI] O filtro de caminho deixa de fora mudanças que alteram o que o workflow testa
**Onde:** `.github/workflows/ci-frontend.yml:14-25`
**Cenário:**
- (a) Um PR que só sobe o `swagger-jsdoc` em `services/core-service/package.json` / `package-lock.json` pode mudar a serialização do spec. O job "Contrato da API em dia" não roda, e o cliente fica divergente sem ninguém ver.
- (b) Um `push` com mais de 300 arquivos alterados, como um merge grande na develop ou o PR de release develop→main, cai no limite documentado do GitHub para `paths`: se os arquivos casados não estiverem entre os 300 primeiros do diff, o workflow não roda. Hoje `origin/main...develop` tem 130 arquivos, ainda abaixo do limite. A ci-analytics sozinha traz 63.

O core-service não depende de nada fora do próprio diretório. Conferi: não há `readFileSync` nem import fora de `services/core-service/` nos testes. O frontend só depende do `swagger.js` e de `app/utils/` (`dump-openapi.mjs:19`; o `swagger.js` usa `apis: []` e importa 5 arquivos de `app/utils/`).
**Correção sugerida:** (a) acrescentar `services/core-service/package-lock.json` ao `paths` do ci-frontend. (b) No PR de release, rodar `workflow_dispatch` nos dois workflows ou registrar o limite no comentário do workflow, e acrescentar `workflow_dispatch:` aos dois.

#### 🟢-C4 [CI] Sem `permissions:` mínimas nos workflows novos
**Onde:** `.github/workflows/ci-core-service.yml:6`, `.github/workflows/ci-frontend.yml:5`
**Cenário:** o repositório é público, e nenhum job usa o `GITHUB_TOKEN` além do checkout. Sem `permissions: contents: read`, o token recebe o padrão do repositório, que pode ser leitura e escrita.
**Correção sugerida:** `permissions: { contents: read }` no topo de cada workflow.

#### 🟢-C5 [CI] Execução dobrada e sem `concurrency`
**Onde:** os três workflows, `on.push` + `on.pull_request`
**Cenário:** uma branch `feature/x` com PR aberto para a develop roda cada workflow duas vezes por push, uma por `push` e outra por `pull_request`. Push seguido não cancela a execução anterior. O padrão já existia, e esta branch triplica o número de arquivos que o repetem.
**Correção sugerida:** `concurrency: { group: ${{ github.workflow }}-${{ github.ref }}, cancel-in-progress: true }`.

#### 🟢-C6 [Docs] Documentos passam a dizer que o `ci.yml` roda os testes
**Onde:** `docs/sugestoes-documentos-oficiais/07-adr/ADR-006-proposta.md:175`, `docs/sugestoes-documentos-oficiais/05-arquitetura-nuvem/INSUMOS.md:162`, `docs/sugestoes-documentos-oficiais/06-c4/INSUMOS.md:187`, `docs/frontend/PLANEJAMENTO_FRONTEND.md:168`
**Cenário:** esses insumos de documento oficial descrevem o `ci.yml` como o arquivo que roda "checagens e testes com cobertura". Depois desta branch, os testes estão em `ci-core-service.yml`. Nenhuma `versao-sugerida_*` cita `ci.yml`, então o dano por enquanto é só nos insumos.
**Correção sugerida:** citar `.github/workflows/ci-*.yml` nesses insumos. O Doc 07 é do Gabriel: vale avisá-lo, mas não é repasse de defeito.

#### 🟢-C7 [Processo] `ci:` fora da tabela de tipos do CODING_STANDARDS; sem relatório de sessão nas branches
**Onde:** commit `ed1fc66`; `docs/CODING_STANDARDS.md:831-841`
**Cenário:** a tabela lista feat/fix/docs/style/refactor/test/chore. `ci` é Conventional Commits válido e já tem precedente na develop (`b2d0842`, `ce773b6`), então não há violação real, só a tabela desatualizada. Nenhuma das três branches traz relatório em `docs/historico_sessao/weslley/` (CLAUDE.md §6). Pode estar previsto para o fechamento da sessão.
**Correção sugerida:** incluir `ci` na tabela. Gravar o relatório antes do push da develop.

---

## Repassados a outro dev

Os dois achados são da área do próprio Weslley (`infra/k8s/` e integrações da SPEC-03), mas estão fora destes três diffs. Por isso não entram no veredito. Repasse gravado em `docs/qa/repasses/para_weslley_31102026.md`.

| Sev. | Achado | Onde | Dono | Repasse |
|------|--------|------|------|---------|
| 🟡 | k8s ficou para trás: `PIX_PROVIDER` e `ASAAS_*` ausentes. A nuvem roda sempre o `fake`, e a ADR-008/Doc 07 conta com o webhook do Asaas na AWS | `infra/k8s/backend.yaml:33-70`, `infra/k8s/configmap.yaml`, `infra/k8s/secret.yaml` | Weslley | `docs/qa/repasses/para_weslley_31102026.md` |
| 🟡 | `PIX_PROVIDER` com erro de digitação (`assas`) cai em silêncio no `fake` (fail-open) | `services/core-service/app/services/pix/index.js:25-26` | Weslley | `docs/qa/repasses/para_weslley_31102026.md` |

## O que foi verificado e está correto

- **Compose:** nenhum segredo novo recebeu valor padrão inseguro. `ASAAS_API_KEY` e `ASAAS_WEBHOOK_TOKEN` vazios dão fail-closed em runtime: `503` na cobrança (`AsaasPixProvider.js:40`) e `401` no webhook (`:181-183`, mais a recusa de token igual à chave em `:186`). `PIX_PROVIDER:-fake` preserva o plano B. `ASAAS_BASE_URL` vazio no `.env` cai no padrão (`:-`). O `docker compose config` com o `.env.example` da branch fecha. O `.dockerignore` do core exclui `.env`, então não há conflito com o dotenv da imagem.
- **Contrato determinístico:** rodei `pnpm gen:api` na branch (openapi-typescript 7.13.0, a versão do `pnpm-lock.yaml`). Nenhum byte mudou no `api-client`. O `services/` da branch é idêntico ao da develop, então a regeneração de `1d285b2` bate com o `swagger.js` da develop@4234915. O `swagger.js` não lê `process.env` nem data. `*.tsbuildinfo` está no `.gitignore`. O `git diff --exit-code` cobre os dois arquivos gerados, ambos versionados.
- **pnpm/action-setup:** `package_json_file: frontend/package.json` lê `packageManager: pnpm@9.15.0`. Ele roda antes do `setup-node` com `cache: pnpm` e `cache-dependency-path: frontend/pnpm-lock.yaml`, como deve. O `npm ci --omit=dev` basta, porque `swagger-jsdoc` está em `dependencies`.
- **qa_checks** continua no `ci.yml` sem filtro: mudança em `scripts/qa_checks.sh` sempre dispara.
- **Os 3 workflows rodaram verdes no push de `ed1fc66`** (`gh run list`). As branches do compose e da SPEC dispararam só o `CI`, como esperado.
- **Merge-tree entre as três branches:** sem conflito.

## Não foi possível verificar

- O comportamento real do filtro `paths` num PR para a develop: só houve eventos `push` nestas branches. A semântica de diff de três pontos vem da documentação do GitHub, não de execução.
- Se a configuração do repositório deixa o `GITHUB_TOKEN` padrão em leitura ou em escrita (sem permissão de admin no repositório).
- Formato real de uma chave `$aact_hmlg_` atual (se termina em `=`): não li `.env` nenhum, por regra. O 🟢-A2 foi demonstrado com uma chave sintética.
- O compose não foi subido: o daemon Docker não estava acessível no WSL, só o `docker compose config`.
