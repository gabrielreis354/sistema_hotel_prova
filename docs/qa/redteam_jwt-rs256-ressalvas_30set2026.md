# QA Red Team — Ressalvas do JWT RS256 (Etapa B da rodada 2, PR #84)
**Branch:** fix/jwt-rs256-ressalvas @ 4128176 · **Base:** origin/develop@35e8548 · **Data:** 30/09/2026
**Arquivos auditados:** 10 (diff, 5 commits) + 9 lidos por contexto (`middlewares/auth.middleware.js`, `_web.js`, `tests/setup/globalSetup.js`, `infra/k8s/secret.yaml`, `scripts/k8s_garantir_secret_jwt.sh`, `scripts/gerar_chaves_jwt.js`, `Dockerfile`, `routes/apis/*Router.js`, `node_modules/jsonwebtoken@9.0.3`)
**Achados:** 8 (🔴 0 · 🟡 3 · 🟢 5)

## Veredito
**APROVADO COM RESSALVAS**

O código está correto. `assertKeyPair` assina e verifica um JWT RS256 de verdade, e o boot sai com
`exit 1` quando o par está trocado: executei `_web.js` com um par trocado e ele saiu com código 1.
Os testes RS512/PS256 provam o pino. O teste de HS256 foi renomeado como guarda de regressão.
As ressalvas estão todas na documentação. Um item da B.3 foi feito pela metade: sobrou uma
**segunda** tabela de segredos com 2 das 6 entradas. A ADR, que vai ser transcrita para o
Documento 07, ganhou duas afirmações novas que não batem com o manifesto nem com o fluxo de chaves.

---

## Verificações executadas (fora da suíte)

Script ad hoc com o `assertKeyPair` real e o `jsonwebtoken` 9.0.3 instalado. Mais dois boots
reais de `_web.js`, com `JWT_*_KEY_PATH` apontando para chaves temporárias no scratchpad. Nenhum
teste da suíte foi rodado, porque o banco é compartilhado.

| Entrada para `assertKeyPair` | Resultado |
|---|---|
| Par RSA-2048 válido | aceita |
| Privada vazia | recusa: `secretOrPrivateKey must have a value` |
| Pública vazia | recusa (mensagem "Chave pública…") |
| Privada lixo / pública lixo | recusa, com a mensagem do lado certo |
| Par trocado | recusa: `invalid signature` |
| RSA-1024 | recusa: `minimum key size of 2048 bits` (melhora em relação à versão anterior com `crypto`) |
| **Privada PEM no lugar da pública** | **aceita** (ver 🟢-4) |
| Boot `_web.js` com par trocado | `❌ JWT RS256 indisponível…`, **exit=1** |
| Boot `_web.js` com a privada nos dois caminhos | **sobe** ("Servidor … rodando") |
| `jwt.verify` sem `algorithms`, RS512 e PS256 assinados com a privada correta | aceitos. Confirma que o pino é o que o teste RS512/PS256 prova |

---

## Achados

### 🟡-1 [Docs/B.3] A tabela de segredos que a Etapa B mandou corrigir continua com 2 das 6 entradas
**Onde:** `README.md:438`, `docs/infra/KUBERNETES.md:31`. Relacionado: `README.md:439`
**Cenário:** a delegação pede para corrigir "a tabela de segredos [que] declara **duas** entradas;
o `secret.yaml` tem **seis**". A branch corrigiu a tabela de `§Configuração (ConfigMap e Secret)`
(`README.md:106-115`) e a de recursos (`README.md:385`). Em `§Configuração e segredos no
Kubernetes` sobrou outra tabela de segredos, e ela continua dizendo que `hotel-secret` guarda
"`POSTGRES_PASSWORD` e `PIX_WEBHOOK_SECRET`". O `KUBERNETES.md:31` repete isso na árvore de
arquivos. Quem ler essa seção não vê as credenciais do MinIO e do RabbitMQ. É a mesma reincidência
que a auditoria do webhook PIX e a revisão do PR #84 apontaram, e agora dentro da própria branch
que a corrige. Além disso, `README.md:439` diz que `jwt-rsa-keys` é "criado manualmente por
ambiente", o que contradiz `README.md:386`, onde o secret é criado por
`scripts/k8s_garantir_secret_jwt.sh`.
**Regra violada:** critério B.3 da delegação e consistência da documentação (DRY em docs)
**Correção sugerida:** listar as 6 chaves (ou "banco, webhook PIX, MinIO e RabbitMQ") em
`README.md:438` e em `KUBERNETES.md:31`. Em `README.md:439`, trocar "criado manualmente" por
"criado por `scripts/k8s_garantir_secret_jwt.sh` (ou à mão, comando na seção anterior)".

### 🟡-2 [Docs/ADR] "Só o dono do arquivo lê a privada" é falso. Quem lê é o grupo
**Onde:** `docs/sugestoes-documentos-oficiais/07-adr/ADR-006-proposta.md:174`. Relacionado: `README.md:386`
**Cenário:** a ADR diz "montado com `defaultMode: 0400` — só o dono do arquivo lê a privada". O
próprio `infra/k8s/backend.yaml:18-21,94` e a validação no minikube mostram outra coisa. O dono é
`root`, e o `fsGroup: 1000` faz o kubelet acrescentar leitura de grupo, então o arquivo efetivo fica
`r--r----- root:1000` (0440). O processo `node` lê a chave **pelo grupo**, não como dono. Se o
Weslley transcrever a frase como está, o Documento 07 descreve um modelo de permissão que o
manifesto não implementa. Quem conferir com `ls -l` dentro do pod vê 0440, não 0400. O
`README.md:386` ("com `0400`") mostra o valor do campo, não a permissão efetiva.
**Regra violada:** afirmação falsa em documento que vai virar oficial (mesma classe do 🟡-3 de 27/09)
**Correção sugerida:** "montado com `defaultMode: 0400` e `fsGroup: 1000` — efetivo `r--r-----
root:1000`: só o dono (root) e o grupo do processo `node` leem a privada". Em `README.md:386`,
acrescentar "(efetivo 0440 com `fsGroup`)".

### 🟡-3 [Docs/ADR] "Pública por ConfigMap versionado, sem passo manual" não fecha com o par gerado por ambiente
**Onde:** `ADR-006-proposta.md:163-166`, `:175`, `:224`
**Cenário:** o ajuste 4 entrou como "pode ir num ConfigMap **versionado** […] sem passo manual" e
"o passo manual é um arquivo, não dois". Só que a mesma ADR (`:170`, `:174`), o README e
`scripts/k8s_garantir_secret_jwt.sh` definem que **cada ambiente gera o próprio par**
(`gerar_chaves_jwt.js`, "uma vez por ambiente"). Uma pública versionada no repositório bate com a
privada de **um** ambiente só. No cluster de qualquer outro dev, ou no cluster da defesa, o
`b2b-service`/`analytics-service` verificariam com a pública do ConfigMap e recusariam todo token
do `core` com 401. Existem duas saídas coerentes. Ou a privada passa a ser a mesma em todos os
ambientes (e aí ela tem de ser distribuída entre as pessoas, o que contradiz "gera uma vez por
ambiente"), ou o ConfigMap é gerado por ambiente a partir de `jwt-public.pem`, e nesse caso não é
versionado e continua sendo um passo, ainda que automatizável no mesmo script. O texto atual
promete as duas coisas ao mesmo tempo. Nada disso quebra hoje, porque os serviços verificadores
ainda não existem. Mas é a decisão que a T-01.4/T-01.6 vai seguir ao pé da letra.
**Regra violada:** inconsistência interna da ADR (decisão × tabela de distribuição)
**Correção sugerida:** trocar "ConfigMap versionado" por "ConfigMap criado a partir da
`jwt-public.pem` do ambiente (não é sensível, não precisa de Secret nem de sigilo)". Retirar "sem
passo manual" e dizer que o passo é automatizável no `k8s_garantir_secret_jwt.sh`. Na
consequência negativa (`:224`), dizer que só a privada exige **sigilo** na distribuição, sem
afirmar que a pública dispensa passo.

### 🟢-4 [Auth/Operação] `assertKeyPair` aceita a chave privada no lugar da pública
**Onde:** `services/core-service/app/utils/jwtKeys.js:72-89` (verificação em `:81`)
**Cenário:** `JWT_PUBLIC_KEY_PATH` apontando para um arquivo que contém a **privada**. O
`jsonwebtoken` 9 chama `createPublicKey()` sobre o PEM privado, que deriva a pública e verifica.
O boot sobe normalmente, confirmado com `_web.js`. No monólito isso não faz diferença, porque o
core tem as duas chaves. Na T-01.4/T-01.6 o erro operacional previsível é montar o arquivo errado
no `analytics-service`. Ele subiria "saudável" com uma chave capaz de **assinar** token de qualquer
tenant, e o CA-01.3.b cairia sem nenhum sinal. A docstring promete que o teste pega "chave que não
é RSA e chaves de pares diferentes", e isso ela cumpre. O que ela não pega é a pública sendo
sensível.
**Regra violada:** fail-fast incompleto para o cenário que motivou a ADR (CA-01.3.b)
**Correção sugerida:** no verificador dos serviços futuros (ou já aqui), recusar se
`publicPem` contiver `PRIVATE KEY`, ou se `createPrivateKey(publicPem)` não lançar erro. É uma
linha, e documenta o motivo. Acrescentar o caso em `tests/jwt-keys.test.js`.

### 🟢-5 [Infra] O comentário do `defaultMode` promete isolamento que o pod não tem
**Onde:** `infra/k8s/backend.yaml:94-95`
**Cenário:** "O padrão 0644 deixaria a privada legível por qualquer processo do container". Com
`0400` + `fsGroup: 1000`, ela continua legível por qualquer processo do container. Todos rodam como
`node` (uid/gid 1000, `Dockerfile:23`), e o `fsGroup` acrescenta o gid 1000 aos grupos
suplementares de **todo** container do pod, inclusive de um sidecar que entre no futuro. O ganho
real é só tirar a leitura de "outros" (uid ≠ 1000 fora do grupo), que hoje não existem no pod. A
mudança atende ao pedido da B.3 e não piora nada, mas o comentário vende mais proteção do que ela
dá.
**Regra violada:** precisão de comentário de segurança
**Correção sugerida:** "Tira a leitura de 'outros'; dentro do container, todo processo roda como
`node` e continua lendo. É higiene, não isolamento."

### 🟢-6 [Docs] `secret.yaml` ainda diz "criado manualmente"
**Onde:** `infra/k8s/secret.yaml:12`
**Cenário:** a branch atualizou o comentário equivalente em `backend.yaml:40-41` para "criado por
`scripts/k8s_garantir_secret_jwt.sh`". O `secret.yaml` continua dizendo "criado manualmente uma vez
por ambiente". Não quebra nada, é só mais uma divergência entre as fontes.
**Correção sugerida:** o mesmo texto do `backend.yaml`.

### 🟢-7 [Docs, pré-existente] `MIDDLEWARES.md` diz que o `tenantMiddleware` não é aplicado. Ele é
**Onde:** `docs/back/MIDDLEWARES.md:28`, `:30`, `:226`
**Cenário:** o arquivo foi tocado pela branch e continua afirmando que o `tenantMiddleware` "não
está aplicado nas rotas" e que um tenant suspenso mantém acesso. `routes/apis/roomRouter.js:16`,
`tenantRouter.js:14`, `corporateClientRouter.js:12`, `roomCategoryRouter.js:15` e
`analyticsRouter.js:16` aplicam o middleware. O próprio `tests/auth.test.js:215-218` depende dele
("o tenant.middleware também devolve 401"). Não é regressão, mas é o mesmo documento vivo que a B.3
mandou corrigir. Vale o Boy Scout, ou registrar como pendência.
**Correção sugerida:** listar os routers que aplicam o middleware e os que não aplicam.

### 🟢-8 [Docs, fora da B] RNF-011 sugerido ainda cita `JWT_SECRET`
**Onde:** `docs/sugestoes-documentos-oficiais/02-requisitos/versao-sugerida_v1.4.md:173`
**Cenário:** o critério de aceite do RNF-011 diz que "`POSTGRES_PASSWORD` e `JWT_SECRET` [são]
injetados via `envFrom`/`secretKeyRef`". Depois da ADR-006, o JWT é um volume de secret não
versionado. Esse arquivo também é fonte de transcrição para documento oficial (Documento 02).
**Correção sugerida:** registrar como pendência para o dono do Documento 02.

---

## O que foi verificado e está correto

- **B.1 🟡-2:** `tests/auth.test.js:243` renomeado como "guarda de regressão do vetor clássico",
  com comentário explicando que não é o teste do pino. `it.each(['RS512','PS256'])` (`:260-272`)
  usa `payloadReal` de um tenant existente e confere a mensagem exclusiva do auth
  (`RECUSA_DO_AUTH`), então não pode passar pela camada do tenant. O controle positivo RS256
  (`:275`) com o mesmo payload dá 200. Confirmei no `jsonwebtoken` 9.0.3 que, sem o pino, RS512 e
  PS256 são aceitos. Os testes discriminam a mutação.
- **B.1 🟡-5:** `assertKeyPair` usa `jwt.sign(…RS256)` + `jwt.verify(…{algorithms:['RS256']})`, o
  mesmo caminho do login e do middleware. Não sobrou nenhuma checagem ad hoc de `asymmetricKeyType`.
  O novo teste de chave EC cobre o caso que a checagem removida cobria. `_web.js:23-28` faz
  `process.exit(1)`, confirmado por execução. O `globalSetup` reaproveita a mesma função.
- **B.2:** a ADR tem o texto do 2º comentário, praticamente literal, no lugar do ajuste 2 (`:32-48`),
  com nota de transcrição separada. O ajuste 3 (`kid` × JWKS, parágrafo, linha na tabela de
  alternativas, consequência positiva e risco reescritos como "não mitigado, só preparado") está
  aplicado. O ajuste 1 (comando `kubectl`) já estava correto em `develop`. O ajuste 4 foi aplicado,
  mas criou a inconsistência 🟡-3. O comentário de `middlewares/auth.middleware.js:13-17` está
  correto contra a 9.0.3 e aponta o teste certo.
- **B.3:** `backend.yaml` tem `defaultMode: 0400` + `fsGroup: 1000`. Nenhum outro volume no pod é
  afetado pelo `chown` recursivo do `fsGroup`, porque o secret é o único volume. `MIDDLEWARES.md:40-58`
  e `arquitetura_backend.md:134-140` mostram a chamada com `getPublicKey()` e `algorithms`. "JWT
  secret" saiu do README, e nenhuma ocorrência de `JWT_SECRET` sobrou em código, manifesto ou
  script (`grep` em `*.js/*.yaml/*.sh/*.example`). As restantes estão em docs históricos, na ADR
  como contexto e em 🟢-8. A tabela `README.md:106-115` lista as 6 entradas com os valores exatos
  do `secret.yaml`. `ARQ_INFRA.md` e `KUBERNETES.md:13` foram atualizados.
- Nenhum `require()` e nenhuma query nova. Nenhum endpoint novo, então não há impacto em Swagger.
  A mensagem de erro de `assertKeyPair` inclui só o `error.message` do `jsonwebtoken`, que não
  contém material de chave.

## Não foi possível verificar

- **Prova de mutação do pino e resultado da suíte/cobertura:** aceitos conforme relatado. A suíte
  não foi rodada, por instrução (banco compartilhado).
- **Permissão `r--r----- root:node` no minikube:** não reproduzida. O comportamento é coerente com
  o kubelet (volume somente leitura + `fsGroup` → máscara 0440), mas não executei em cluster.
- **Registro no PR de que a tabela de segredos é herdada do #79**, e a saída do `/security-review`
  no PR: não conferidos, porque o PR da branch não foi consultado.
- **CI verde:** não consultado.

---

## Tratamento dos achados (agente executor, 30/09)

| Achado | Tratamento |
|---|---|
| 🟡-1 segunda tabela de segredos / "criado manualmente" | `README.md` (seção "Configuração e segredos no Kubernetes") e `docs/infra/KUBERNETES.md` listam as 6 entradas; `jwt-rsa-keys` descrito como criado por `scripts/k8s_garantir_secret_jwt.sh` |
| 🟡-2 "só o dono lê" | ADR-006 e `README.md` passam a dizer o efetivo: `defaultMode: 0400` + `fsGroup: 1000` → `r--r----- root:1000` |
| 🟡-3 pública em ConfigMap "versionado" | ADR-006: ConfigMap **criado por ambiente** a partir da `jwt-public.pem`, **não versionado** — com o motivo (par gerado por ambiente) |
| 🟢-4 privada aceita no lugar da pública | `assertKeyPair` recusa `publicPem` com `PRIVATE KEY`; teste novo em `tests/jwt-keys.test.js` (vermelho antes, verde depois) |
| 🟢-5 comentário do `backend.yaml` | Reescrito: o ganho é tirar a leitura de "outros"; não isola de processos do mesmo uid |
| 🟢-6 `secret.yaml` "criado manualmente" | Comentário alinhado ao script |
| 🟢-7 `tenantMiddleware` "não aplicado" | `docs/back/MIDDLEWARES.md` corrigido — aplicado nos 13 routers autenticados (conferido com grep) |
| 🟢-8 RNF-011 na v1.4 sugerida do Doc 02 | **Não tratado aqui** — entra na Etapa E (conferência do Documento 02) |

Portão depois das correções: suíte 18 arquivos, 252 passam, 1 skip, cobertura 74,79 / 71,62 / 84,23 / 77,14; `qa_checks.sh` 0 erros (3 avisos pré-existentes do frontend).
