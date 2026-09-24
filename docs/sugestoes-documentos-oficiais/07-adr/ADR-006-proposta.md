# ADR-006 (proposta): Propagação de Identidade entre Serviços

**Documento oficial:** `Projetos/gesway/07-registro-decisoes-arquitetonicas-adr.md` — a ADR-003 (§ Decisão,
"Comunicação") já reserva explicitamente o número: *"A propagação de identidade entre serviços é
tratada em decisão própria, a ser registrada como ADR-006"*.

**Status desta proposta:** rascunho para aprovação do Gabriel (orquestrador) — fase 5a da T-01.3.
Depois de aprovada, quem formaliza no documento oficial é o **Weslley**, dono do Documento 07.

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

Um segundo problema, encontrado ao ler o código para esta proposta: `auth.middleware.js:12` chama
`jwt.verify(token, process.env.JWT_SECRET)` **sem fixar `algorithms`**. A biblioteca
`jsonwebtoken` aceita, por padrão, qualquer algoritmo que o próprio token declarar no cabeçalho —
o que inclui a classe de ataque conhecida como *algorithm confusion*: se um serviço um dia aceitar
RS256 verificando com a chave **pública**, um token forjado com `alg: HS256` e assinado usando a
chave pública como segredo simétrico passaria a validação. Isto já é um problema **hoje**, no
monólito, independente da divisão em serviços — e precisa ser corrigido na mesma migração, porque
é o RS256 que introduz a chave pública que tornaria o ataque possível se `algorithms` não for
fixado.

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

- O cabeçalho do JWT ganha `kid` (*key id*) desde já, mesmo com uma única chave pública em uso —
  trocar de chave sem invalidar todos os tokens em voo (rotação) exige que o verificador saiba
  *qual* chave pública usar, e retrofitar isso depois que múltiplos serviços já verificam é bem
  mais caro do que incluir agora.
- `auth.middleware.js` passa a fixar `jwt.verify(token, publicKey, { algorithms: ['RS256'] })` —
  sem isso, o RS256 sozinho não fecha o CA-01.3.b (ver *algorithm confusion* no Contexto). Esta
  correção vale mesmo antes da extração de serviços, porque é uma vulnerabilidade do middleware
  atual.
- O Nginx (`infra/k8s/nginx.yaml`) continua como proxy simples — não teria como participar da
  validação sem virar um componente novo (WAF/gateway de autenticação), o que a SPEC-01 já
  descarta implicitamente ao listar *service mesh* como fora de escopo por desproporção ao
  tamanho da equipe.

### CA-01.3.b — `tenant_id` impossível de forjar

Consequência direta de a) + a correção de `algorithms`: só quem tem a chave **privada**
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

O manifesto atual (`infra/k8s/rabbitmq.yaml`, branch `feature/docker-compose-rabbitmq`, ainda não
mergeada) provisiona RabbitMQ com um único usuário administrador
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

| Ambiente | Como a chave chega |
|---|---|
| **Local (dev)** | Script novo `services/core-service/scripts/gerar_chaves_jwt.js` (`crypto.generateKeyPairSync('rsa', { modulusLength: 2048 })`), grava em `services/core-service/keys/jwt-private.pem` e `jwt-public.pem`. Pasta `keys/` entra no `.gitignore` — é a única exceção à política atual de "segredo versionado por conveniência acadêmica" (ver Contexto). |
| **Testes (`vitest`)** | Par de chaves efêmero, gerado em memória no `tests/setup/globalSetup.js` (mesmo lugar que já prepara o banco de teste) — nunca toca disco, nunca precisa de `.gitignore`. |
| **CI** (`.github/workflows/ci.yml`) | Gera um par de chaves descartável como *step* do job, antes dos testes — mesmo raciocínio dos testes: CI não precisa de chave estável entre execuções. |
| **Cluster (k8s)** | Quem provisiona gera o par uma vez (`gerar_chaves_jwt.js` ou equivalente) e cria um `Secret` do tipo `kubernetes.io/tls`-like via `kubectl create secret generic jwt-rsa-keys --from-file=private.pem --from-file=public.pem -n hotel-system` — **fora do `infra/k8s/secret.yaml` versionado**, aplicado manualmente uma vez, documentado no `README.md` como passo de setup (mesmo tratamento que outros clusters dão a certificado TLS). `infra/k8s/backend.yaml` monta o secret como volume ou variável de ambiente apontando para o caminho do arquivo. |

**O que acontece com os tokens HS256 já emitidos:** nada de transição — a troca é um corte seco.
Não há verificação dupla (aceitar HS256 *e* RS256 por um tempo): isso reintroduziria a superfície
de *algorithm confusion* que a correção do CA-01.3.b elimina. Tokens HS256 emitidos antes do
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
| Serviço-a-serviço: mTLS entre `core` e `b2b` | Autenticação na camada de transporte, independente de aplicação | Exige gestão de certificados por serviço, normalmente via *service mesh* — a SPEC-01 já descarta *service mesh* por desproporção; sem ele, mTLS manual em Node é mais código do que o problema justifica |
| RabbitMQ: manter usuário único compartilhado | Já está provisionado, zero trabalho adicional | Viola CA-01.3.d explicitamente; um bug ou vazamento no `analytics-service` (só deveria ler) ganharia permissão de publicar eventos falsos no `core-service` |
| RabbitMQ: usuários separados por permissão (`write`-only / `read`-only) — escolhida | Fecha o CA-01.3.d; RabbitMQ suporta nativamente via `set_permissions`, sem ferramental extra | Mais duas credenciais para gerenciar; setup do *init container*/Job a escrever (T-01.4) |

---

## Consequências

- **Positivas:**
  - `tenant_id` deixa de ser forjável por qualquer serviço que só deveria verificar — fecha o
    CA-01.3.b, condição que a própria SPEC-01 já apontava como inatingível no esquema atual.
  - A correção do `algorithms` fixo no `auth.middleware.js` remove uma vulnerabilidade de
    *algorithm confusion* que existe **hoje**, antes mesmo de qualquer extração de serviço.
  - Nenhum componente de infraestrutura novo para autenticação — nem *gateway*, nem *service
    mesh*, nem mTLS. A chamada `b2b → core` reaproveita um padrão (HMAC/segredo comparado com
    `timingSafeEqual`) já escrito, revisado e testado nesta mesma sessão para o webhook PIX.
  - O `kid` no cabeçalho deixa a porta aberta para rotação de chave sem exigir nova extração de
    serviço para suportar.
- **Negativas:**
  - A chave privada exige um processo de distribuição que os outros segredos do projeto não têm
    (não pode seguir a política de "versionar por conveniência acadêmica") — mais uma peça de
    processo para a equipe lembrar ao provisionar um ambiente novo.
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
  - *Rotação de chave no futuro quebrar todos os serviços de uma vez.* O `kid` no cabeçalho
    permite que o verificador mantenha as duas chaves (antiga e nova) por uma janela, escolhendo
    pela `kid` do token — não é implementado nesta proposta (não há necessidade de rotação hoje),
    mas o campo já existe para quando precisar.

---

## O que fica para a fase 5b (implementação, só após aprovação)

1. `services/core-service/scripts/gerar_chaves_jwt.js` + `.gitignore` da pasta `keys/`.
2. `LoginController.js` assina com a privada, `kid` no cabeçalho.
3. `auth.middleware.js` verifica com a pública, `algorithms: ['RS256']` fixo.
4. Chaves de teste efêmeras no `globalSetup`.
5. Testes: RS256 válido aceito; HS256 recusado; token assinado com outra chave recusado;
   `tenant_id` adulterado recusado (os quatro casos que a delegação já pede).
6. `B2B_SERVICE_TOKEN` — não implementável de verdade nesta fase: as rotas internas do
   `core-service` só existem a partir da T-01.6 (extração do `b2b-service`). Fica documentado
   aqui como decisão, implementado lá.
7. RabbitMQ com credenciais separadas — implementável junto da T-01.4 (extração do
   `analytics-service`), que é quando o publicador/consumidor passam a existir de verdade.

Itens 6 e 7 não têm código para escrever **agora** porque as rotas/filas que eles protegem ainda
não existem — a decisão fica registrada para quando existirem, e o Documento 07 oficial (que
`Weslley` mantém) já pode citar a ADR-006 como fechada mesmo com a implementação faseada.
