# ADR-006 (proposta): Propagação de Identidade entre Serviços

**Documento oficial:** `Projetos/gesway/07-registro-decisoes-arquitetonicas-adr.md` — a ADR-003 (§ Decisão,
"Comunicação") já reserva explicitamente o número: *"A propagação de identidade entre serviços é
tratada em decisão própria, a ser registrada como ADR-006"*.

**Status desta proposta:** **aprovada pelo Gabriel** (orquestrador) em 24/09/2026 e
**implementada no `core-service`** (fase 5b da T-01.3, PR #84, mergeado em `develop` em 28/09) — CA-01.3.a e
CA-01.3.b. CA-01.3.c e CA-01.3.d ficam decididos aqui e implementados na T-01.6 e na T-01.4. Quem
formaliza no documento oficial é o **Weslley**, dono do Documento 07.

**Rastreia:** SPEC-01 T-01.3 (CA-01.3.a a e) · RNF-011 (segredo fora do repositório) · RNF-012
(assinatura de webhook, já fechada pela T-06.9 — precedente de padrão a seguir).

---

## Contexto

Hoje o JWT é assinado e verificado com **HS256** e um único `JWT_SECRET`, compartilhado entre
todo o backend (`services/core-service/app/Controllers/AuthApi/LoginController.js:48` assina;
`services/core-service/middlewares/auth.middleware.js:12` verifica). HS256 é uma **chave
simétrica**: quem consegue verificar um token também consegue assinar um novo.

Isso é seguro enquanto existe **um** processo. A ADR-003 decompõe o backend em `core-service`,
`b2b-service` e `analytics-service`, cada um seu próprio deploy. Se os três continuarem
compartilhando o mesmo `JWT_SECRET` simétrico, qualquer um dos três — inclusive o
`analytics-service`, que só deveria **ler** projeções — passa a poder **emitir** um token válido
de qualquer tenant, com qualquer `role`. O CA-01.3.b da SPEC-01 ("`tenant_id` continua sendo
obrigatório e impossível de forjar em todos os serviços") deixa de ser alcançável com o esquema
atual — é um achado da pesquisa de 14/09, já registrado na própria SPEC-01.

Um segundo ponto, encontrado ao ler o código para esta proposta: `auth.middleware.js:12` chama
`jwt.verify(token, process.env.JWT_SECRET)` **sem fixar `algorithms`**.

O `jsonwebtoken` está na `^9.0.2` e, desde a v9, infere os algoritmos aceitos a partir do tipo da
chave: uma string é tratada como segredo simétrico e só admite a família HS; uma chave pública RSA
só admite RS e PS. Por isso o ataque clássico de *algorithm confusion* — um token `alg: HS256`
assinado com a chave pública como segredo — é recusado pela própria biblioteca, antes e depois
desta migração.

Ainda assim, o verificador passa a fixar `algorithms: ['RS256']`, como defesa em profundidade.
Primeiro, estreita o contrato a um único algoritmo: sem o pino, tokens RS512 e PS256 assinados pela
mesma chave também seriam aceitos. Segundo, torna a proteção uma declaração do nosso código, e não
um comportamento da versão da biblioteca — uma troca ou regressão do `jsonwebtoken` não reabre a
superfície.

A garantia do CA-01.3.b não depende do pino: vem do par de chaves. Só o `core-service` possui a
chave privada; os demais serviços apenas verificam e não conseguem produzir um token aceito.

> *Nota para quem transcreve — não vai para o Documento 07:* a primeira versão desta proposta
> afirmava uma vulnerabilidade de *algorithm confusion* ativa "hoje, no monólito"; a segunda
> (revisão do Gabriel, 27/09) dizia que ela nasceria com a migração. As duas estavam erradas. O
> texto acima foi conferido contra o `jsonwebtoken` 9.0.3 (segundo comentário de revisão do PR #84,
> 28/09) e pelos testes de `auth.test.js`.

Um terceiro ponto, fora do JWT: `infra/k8s/secret.yaml` versiona `JWT_SECRET` em texto puro,
sob a política documentada no `README.md` ("valores no repositório para facilitar a avaliação
acadêmica"). Essa política é aceitável para segredos **simétricos de baixo custo de rotação**
(senha de banco, segredo de webhook) — mas não para uma **chave privada assimétrica**, cujo
propósito inteiro é nunca circular. Versionar a privada equivaleria a não ter saído do HS256.

Por fim, a ADR-003 já desenha uma chamada síncrona sem usuário: `b2b-service → core-service`,
duas rotas internas (criar e cancelar reserva-bloco ao assinar/cancelar contrato), e o
`core-service → analytics-service` via RabbitMQ. Nenhuma das duas tem, hoje, mecanismo de
autenticação — a T-01.3 (CA-01.3.c e CA-01.3.d) precisa fechar as duas.

---

## Decisão

### CA-01.3.a — Cada serviço valida localmente, com RS256

O `core-service` assina com uma **chave privada RSA**; `core-service`, `b2b-service` e
`analytics-service` verificam com a **chave pública** correspondente, cada um localmente, sem
depender de um *gateway* de autenticação central.

- O cabeçalho do JWT ganha `kid` (*key id*) desde já, mesmo com uma única chave pública em uso:
  quando houver duas chaves válidas ao mesmo tempo, o verificador precisa saber *qual* usar, e
  retrofitar o campo depois que três serviços já verificam é mais caro do que incluí-lo agora.

  **O que o `kid` sozinho não resolve.** Como cada serviço lê a chave pública de um arquivo
  montado, rotacionar continua exigindo redeploy de todos os serviços. Rotação sem redeploy depende
  de os verificadores **descobrirem** a chave nova — um endpoint JWKS (`/.well-known/jwks.json`) no
  `core-service`, buscado e cacheado pelos demais. Fica fora desta decisão por desproporção (três
  serviços, nenhuma necessidade de rotação hoje), registrado como a dependência real: o `kid` é a
  preparação, o JWKS é o que torna a rotação possível.
- `auth.middleware.js` passa a fixar `jwt.verify(token, publicKey, { algorithms: ['RS256'] })` —
  defesa em profundidade (ver Contexto): sem a trava, a biblioteca aceitaria também RS384/512 e
  PS\* assinados com a mesma privada. Não é falsificação, mas o contrato fica em um algoritmo só.
  O teste que prova o pino assina com a privada **correta** em RS512/PS256 e espera `401` — é o
  único caso em que a presença do pino muda o resultado. O teste de HS256 assinado com a pública
  continua na suíte como guarda de regressão do vetor clássico, não como prova do pino.
- O Nginx (`infra/k8s/nginx.yaml`) continua como proxy simples — não teria como participar da
  validação sem virar um componente novo (WAF/gateway de autenticação), o que a SPEC-01 já
  descarta implicitamente ao listar *service mesh* como fora de escopo por desproporção ao
  tamanho da equipe.

### CA-01.3.b — `tenant_id` impossível de forjar

Consequência direta de a): só quem tem a chave **privada**
(o `core-service`, único emissor) consegue produzir um token que os outros aceitem. Nenhum
serviço que só verifica pode fabricar um `tenant_id` novo.

### CA-01.3.c — Chamada `b2b-service → core-service` sem usuário

**Credencial estática por serviço chamador**, não um JWT de serviço. O `core-service` expõe as
duas rotas internas da ADR-003 (`POST /internal/contracts/:id/block-reservation`,
`DELETE /internal/contracts/:id/block-reservation`, nomes indicativos — o contrato exato é
tarefa da T-01.2) **fora do que o Nginx expõe publicamente** (`location` própria no
`nginx.yaml`, negada por padrão, liberada só para o IP interno do `b2b-service` — mesmo
princípio das `NetworkPolicy` que já existem em `infra/k8s/networkpolicy.yaml`).

A chamada carrega um cabeçalho `X-Internal-Token: <segredo>`, e o `core-service` compara com
`crypto.timingSafeEqual` contra `B2B_SERVICE_TOKEN` do ambiente — **o mesmo padrão** já usado e
testado para o webhook PIX (`app/utils/pixWebhookSignature.js`, T-06.9): checar o tamanho antes
de comparar, falha fechada se a variável não estiver configurada, log do lado que recusa. Não
reinventa mecanismo — reaproveita um que a equipe já escreveu, revisou e testou.

**Por que não um "token de serviço" RS256** (a alternativa mais elegante, unificando os dois
caminhos de auth num só): exigiria um endpoint de emissão no `core-service`
(`POST /internal/auth/service-token`) que o próprio `b2b-service` chamaria antes de cada operação
(ou cacheasse com expiração curta), mais código, mais teste, mais uma decisão de expiração — para
**duas rotas de baixa frequência** (assinar/cancelar contrato). A ADR-003 já rejeitou gRPC entre
os mesmos dois serviços pelo motivo simétrico: "duas operações síncronas de baixa frequência não
justificam o ferramental". Fica registrado como evolução natural se o número de chamadas
`b2b → core` crescer (T-01.6): nesse ponto, migrar para um token de serviço RS256 de curta duração
passa a valer o custo, porque unifica a superfície de verificação e limita a janela de uso de um
segredo vazado (token expira; segredo estático não).

### CA-01.3.d — Credenciais do RabbitMQ separadas por serviço

O manifesto atual (`infra/k8s/rabbitmq.yaml`, entregue no PR #79) provisiona RabbitMQ com um único usuário administrador
(`RABBITMQ_DEFAULT_USER`/`RABBITMQ_DEFAULT_PASS`) — suficiente para "só provisionar", como o
próprio comentário do arquivo diz, mas não para operar com o princípio de menor privilégio que o
CA-01.3.d exige.

Proposta: dois usuários RabbitMQ além do administrador, criados via
`rabbitmqctl add_user` + `set_permissions` num *init container* ou *Job* de setup (RabbitMQ
suporta permissão por *vhost*, com *regex* separado de *configure*/*write*/*read* sobre nomes de
fila e *exchange*):

| Usuário | Permissões | Usado por |
|---|---|---|
| `hotel_core_publisher` | `write` na *exchange* de eventos do núcleo; sem `read`, sem `configure` em filas alheias | `core-service` (publicador do *outbox*) |
| `hotel_analytics_consumer` | `read` na fila do `analytics-service`; sem `write` em exchange nenhuma | `analytics-service` (consumidor) |
| `RABBITMQ_DEFAULT_USER` (administrador) | Continua existindo, mas some do uso operacional — fica só para `rabbitmqctl`/painel de gestão, credencial separada, não injetada em nenhum Deployment de aplicação | Operador humano |

Os dois novos pares entram em `infra/k8s/secret.yaml` como
`RABBITMQ_CORE_USER`/`RABBITMQ_CORE_PASSWORD` e
`RABBITMQ_ANALYTICS_USER`/`RABBITMQ_ANALYTICS_PASSWORD`. Implementação real (criar o *outbox*, o
publicador, o consumidor) é escopo da T-01.4, não desta ADR — aqui só a decisão de credencial.

### CA-01.3.e — Registro formal

Esta proposta, uma vez aprovada pelo Gabriel, vira a base do que o Weslley registra como
**ADR-006** no Documento 07 oficial, no mesmo formato das ADR-001 a 005 (Contexto → Decisão →
Alternativas → Consequências).

---

## Como as chaves chegam a cada ambiente, sem versionar a privada

A chave **privada** é o único artefato sensível. A **pública** é pública por definição: para
os serviços que só verificam (`b2b-service`, `analytics-service`), pode ir num ConfigMap
versionado, como qualquer outra configuração. O `core-service` recebe as duas pelo mesmo secret
porque assina e verifica.

| Ambiente | Como a chave chega |
|---|---|
| **Local (dev)** | `services/core-service/scripts/gerar_chaves_jwt.js` gera RSA-2048 em `services/core-service/keys/` (`jwt-private.pem` `0600`, `jwt-public.pem`). A pasta está no `.gitignore` (`services/*/keys/`) e no `.dockerignore` — é a única exceção à política de "segredo versionado por conveniência acadêmica" (ver Contexto). |
| **Docker Compose (contingência)** | As mesmas chaves do dev, montadas em `/app/keys` como volume somente leitura — nunca dentro da imagem. O backend roda como `node` (uid 1000): a privada `0600` precisa pertencer ao uid 1000 do host. |
| **Testes (`vitest`)** | Par efêmero gerado pelo `tests/setup/globalSetup.js` em `tests/setup/.tmp-jwt-keys/` (disco, não memória: o `globalSetup` roda em outro processo que os testes). Reaproveitado entre rodadas se `assertKeyPair` aprovar; regerado se estiver quebrado. Ignorado pelo git. |
| **CI** (`.github/workflows/ci.yml`) | O mesmo `globalSetup` gera o par no caminho que as variáveis `JWT_*_PATH` do job indicam — sem *step* separado, sem chave estável entre execuções. |
| **Cluster (k8s)** | Quem provisiona gera o par uma vez e cria o secret **depois do namespace** e **antes do backend**: `kubectl create secret generic jwt-rsa-keys --from-file=jwt-private.pem=keys/jwt-private.pem --from-file=jwt-public.pem=keys/jwt-public.pem -n hotel-system` (os nomes das chaves precisam ser exatamente esses — o `backend.yaml` monta `/app/keys/jwt-private.pem`). `scripts/infra_up.sh` e `./start.sh up` fazem isso sozinhos a partir de `services/core-service/keys/`, ou abortam com o comando se as chaves não existirem. Fora do `infra/k8s/secret.yaml` versionado; montado com `defaultMode: 0400` — só o dono do arquivo lê a privada. |
| **Serviços que só verificam** (T-01.4, T-01.6) | Só a chave pública, por ConfigMap versionado — sem passo manual. |

**O que acontece com os tokens HS256 já emitidos:** nada de transição — a troca é um corte seco.
Não há verificação dupla (aceitar HS256 *e* RS256 por um tempo): o verificador precisaria manter o
segredo simétrico vivo — justamente o que permite a qualquer detentor dele emitir token (CA-01.3.b).
Tokens HS256 emitidos antes do
deploy simplesmente falham na verificação (o *middleware* novo só entende RS256) — o usuário
recebe `401` e faz login de novo. Como o token expira em 8h (`LoginController.js:51`), o efeito
prático é: quem estava logado no momento do deploy relogicamente uma vez. Não é um caminho de
migração porque não precisa ser um — o custo de simplesmente derrubar sessões é baixo e o custo de
manter os dois algoritmos ativos é uma vulnerabilidade.

---

## Alternativas Consideradas

| Alternativa | Prós | Contras |
|---|---|---|
| **RS256, validação local por serviço — escolhida** | Nenhum serviço além do `core` consegue emitir token; sem componente novo de infraestrutura; alinhado com a recomendação já registrada na SPEC-01 | Chave privada precisa de manejo cuidadoso (ver seção de distribuição); dois artefatos (privada/pública) em vez de um segredo só |
| *Gateway* central valida e propaga identidade (ex.: um serviço de autenticação à parte, ou o próprio Nginx com um módulo de validação) | Um único ponto de verificação; serviços internos poderiam confiar cegamente num header propagado | Componente novo para construir, testar e operar; volta a existir um segredo simétrico entre o *gateway* e os serviços (o que o header propagado carrega); a SPEC-01 já trata *service mesh* como desproporcional para 3 serviços — um gateway de auth ad-hoc tem o mesmo problema de escopo |
| Manter HS256, mas com um segredo por serviço (`core` assina, publica sua "capacidade de assinar" só para si) | Menor mudança de código | Não resolve o problema: para o `b2b-service`/`analytics-service` **verificarem**, precisariam do mesmo segredo simétrico do `core` — e quem verifica com HS256 também consegue assinar. É a mesma vulnerabilidade com outro nome |
| **Serviço-a-serviço: credencial estática por cabeçalho — escolhida** | Reaproveita o padrão já testado do webhook PIX (T-06.9); zero infraestrutura nova; proporcional a 2 chamadas de baixa frequência | Segredo de vida longa — se vazar, fica válido até ser trocado manualmente (mitigado por não ser exposto por nenhuma rota pública e por `NetworkPolicy`) |
| Serviço-a-serviço: token RS256 de curta duração, emitido por um endpoint `/internal/auth/service-token` | Unifica toda a verificação num único caminho (RS256); token expira sozinho, reduz janela de segredo vazado | Endpoint novo, fluxo de obtenção/cache no `b2b-service`, mais uma decisão de TTL — desproporcional para 2 rotas hoje; registrado como evolução natural se o volume crescer na T-01.6 |
| Distribuir a chave pública via JWKS (`/.well-known/jwks.json` no `core-service`) em vez de arquivo montado | Elimina a distribuição manual da pública; habilita a rotação sem redeploy que o `kid` prepara | Endpoint novo, mais cache e política de atualização em cada verificador; desproporcional para três serviços sem necessidade de rotação. Registrado como dependência da rotação, não como parte desta decisão |
| Serviço-a-serviço: mTLS entre `core` e `b2b` | Autenticação na camada de transporte, independente de aplicação | Exige gestão de certificados por serviço, normalmente via *service mesh* — a SPEC-01 já descarta *service mesh* por desproporção; sem ele, mTLS manual em Node é mais código do que o problema justifica |
| RabbitMQ: manter usuário único compartilhado | Já está provisionado, zero trabalho adicional | Viola CA-01.3.d explicitamente; um bug ou vazamento no `analytics-service` (só deveria ler) ganharia permissão de publicar eventos falsos no `core-service` |
| RabbitMQ: usuários separados por permissão (`write`-only / `read`-only) — escolhida | Fecha o CA-01.3.d; RabbitMQ suporta nativamente via `set_permissions`, sem ferramental extra | Mais duas credenciais para gerenciar; setup do *init container*/Job a escrever (T-01.4) |

---

## Consequências

- **Positivas:**
  - `tenant_id` deixa de ser forjável por qualquer serviço que só deveria verificar — fecha o
    CA-01.3.b, condição que a própria SPEC-01 já apontava como inatingível no esquema atual.
  - O `algorithms: ['RS256']` fixo no `auth.middleware.js` restringe o contrato a um algoritmo
    só e torna a proteção independente da versão da biblioteca (defesa em profundidade — a 9.x já
    bloqueia o *algorithm confusion* clássico por conta própria).
  - O servidor recusa subir sem um par de chaves válido (`assertKeyPair` no boot): chave ausente,
    vazia, ilegível ou de outro par aparece no deploy, não no primeiro login.
  - Nenhum componente de infraestrutura novo para autenticação — nem *gateway*, nem *service
    mesh*, nem mTLS. A chamada `b2b → core` reaproveita um padrão (HMAC/segredo comparado com
    `timingSafeEqual`) já escrito, revisado e testado nesta mesma sessão para o webhook PIX.
  - O `kid` no cabeçalho prepara a rotação de chave: quando um JWKS existir, os verificadores
    escolhem a chave pelo `kid` sem mudança no formato do token.
- **Negativas:**
  - A chave privada exige um processo de distribuição que os outros segredos do projeto não têm
    (não pode seguir a política de "versionar por conveniência acadêmica") — mais uma peça de
    processo para a equipe lembrar ao provisionar um ambiente novo. Vale só para a **privada**: a
    pública vai por ConfigMap, e o passo manual é um arquivo, não dois.
  - O corte seco de HS256 para RS256 derruba todas as sessões ativas no momento do deploy — efeito
    aceito, não mitigado, por ser de baixo custo (relogin) frente à alternativa (rodar dois
    algoritmos).
  - A credencial estática do `b2b-service` não expira sozinha — depende de rotação manual se
    vazar. Mitigado por não ser exposta por rota pública nenhuma e pela `NetworkPolicy` que já
    restringe quem alcança o `core-service` na rede do cluster.
- **Riscos mitigados:**
  - *Chave privada vazar do jeito que o `JWT_SECRET` está versionado hoje.* Não é o mesmo
    caminho: a privada nunca entra no `infra/k8s/secret.yaml` versionado — vai por `kubectl
    create secret` manual, documentado como passo de setup, mesmo tratamento de um certificado
    TLS.
  - *Alguém reintroduzir HS256 sem querer, revertendo a correção.* O `algorithms: ['RS256']` fixo
    é o que impede isso estruturalmente — mesmo que o `JWT_SECRET` HS256 continue existindo em
    algum lugar por inércia, o verificador novo o ignora.
  - *Rotação de chave no futuro quebrar todos os serviços de uma vez.* **Não mitigado nesta
    decisão**, só preparado: o `kid` já está no token, mas sem JWKS cada verificador conhece uma
    única chave pública (ver CA-01.3.a). Hoje, trocar a chave exige
    `kubectl rollout restart deploy/backend` (a chave fica em cache na memória de cada pod) e
    derruba todas as sessões — durante o *rollout*, pods velhos e novos convivem e o `401` é
    intermitente até o fim.

---

## Implementação (fase 5b) — o que foi feito e o que fica para depois

Feito no `core-service` (PR #84, e os ajustes da revisão no PR seguinte):

1. `scripts/gerar_chaves_jwt.js` — gera o par local; `services/*/keys/` no `.gitignore` e `keys/`
   no `.dockerignore` (a privada nunca entra na imagem).
2. `LoginController.js` assina com a privada, RS256, `kid` no cabeçalho.
3. `auth.middleware.js` verifica com a pública, `algorithms: ['RS256']` fixo.
4. `_web.js` recusa subir sem um par válido: `assertKeyPair` assina e verifica um JWT RS256 com o
   par carregado — pega arquivo vazio, PEM inválido e chaves de pares diferentes numa operação só.
5. Chaves de teste efêmeras no `globalSetup`; testes: RS256 aceito; RS512/PS256 com a privada
   correta recusados (prova o pino — falham se ele for removido); HS256 forjado com a chave pública
   recusado (guarda de regressão do vetor clássico); outra chave recusada; `tenant_id` adulterado
   recusado.
6. `docker-compose.yml`, `infra/k8s/` e `scripts/infra_up.sh`/`start.sh` ajustados para entregar o
   par a cada ambiente (tabela acima).

Fica para depois, porque o que protegem ainda não existe:

- `B2B_SERVICE_TOKEN` (CA-01.3.c) — as rotas internas do `core-service` nascem na T-01.6.
- RabbitMQ com credenciais separadas (CA-01.3.d) — o publicador/consumidor nascem na T-01.4.

O Documento 07 oficial (do Weslley) já pode registrar a ADR-006 como **Aceita**, com a
implementação faseada descrita acima.
