# QA Red Team — metrics-observabilidade (T-02.4, SPEC-02 · PR #90)
**Branch:** `pr90-integracao` (= `origin/feature/metrics` + merge da develop) · **Dev:** Weslley · **Base:** develop@f1de9f5 · **Data:** 12/10/2026
**Commits auditados:** `5255a77` feat(metrics) · `4158043` fix(infra) nginx barra /metrics · `e98473b` feat(infra) Prometheus + Grafana · `e42ce5e` docs · `20b6577` merge da develop
**Arquivos auditados:** 23 (todo o diff `origin/develop...HEAD`). Para validar os cenários também li: `_web.js`, `tests/helpers/createApp.js`, `vitest.config.js`, `middlewares/tenant.middleware.js`, os 16 routers de `routes/apis/`, `config/swagger.js`, `infra/k8s/backend.yaml` e `nginx.yaml` (inteiros), `scripts/infra_up.sh`, `docs/infra/KUBERNETES.md`.
**Achados:** 10 (🔴 2 · 🟡 3 · 🟢 5)

## Veredito
**REPROVADO**

Os dois 🔴 foram reproduzidos com um app Express mínimo que monta o `metricsMiddleware` e o `GetMetricsController` reais, sem banco e sem containers (script descartado depois, working tree limpo):

1. O `location = /metrics` do nginx é match **exato e sensível a maiúsculas**, mas o Express casa rotas **sem** diferenciar maiúsculas e com barra final opcional. `/METRICS`, `/Metrics` e `/metrics/` passam pelo nginx e chegam ao controller. No k8s, o token que sobra como única barreira está versionado em `secret.yaml`, num repositório **público**, e é aplicado como está por `kubectl apply -k`.
2. `routeLabel` normaliza `/public/:subdomain` com uma regex sensível a maiúsculas. Um `GET /PUBLIC/<qualquer-coisa>/hotel` sem autenticação cria uma série nova a cada requisição: a cardinalidade fica ilimitada e quem controla o valor do label é o atacante.

O resto do desenho está correto: o token é obrigatório (sem ele, 503), a comparação é feita em tempo constante, o `tenant_id` vem só do JWT validado, o Grafana não tem acesso anônimo nem senha padrão, e as NetworkPolicies novas não afrouxam as do MinIO.

## Achados

### 🔴 [Segurança/Multi-tenant] `/metrics` sai pela porta pública do nginx (`/METRICS`, `/metrics/`) e, no k8s, o token é público
**Onde:** `docker/nginx/default.conf:37` e `infra/k8s/nginx.yaml:44` (`location = /metrics`) · `services/core-service/routes/router.js:56` · `infra/k8s/secret.yaml:26` · `infra/k8s/nginx.yaml:178` (Service `LoadBalancer`)
**Cenário:**
- O nginx só responde 404 para o URI exatamente igual a `/metrics`. `GET /METRICS`, `GET /Metrics` e `GET /metrics/` caem no `location /` e são repassados ao `backend_pool`.
- O Express 4.22.2 cria o roteador com `caseSensitive: false` e `strict: false`, então `router.get('/metrics')` atende todas essas variações. Reproduzido com o controller real e `Authorization: Bearer <token>`: `/metrics` → 200, `/metrics/` → 200, `/METRICS` → 200, `/Metrics` → 200.
- No k8s, `scripts/infra_up.sh:59` roda `kubectl apply -k infra/k8s/`, que aplica `METRICS_TOKEN: metrics_token_academico_2026` sem trocar nada. O repositório `gabrielreis354/sistema_hotel_prova` é **PUBLIC** (`gh repo view`).
- Resultado: qualquer pessoa que alcance o LoadBalancer do nginx executa `curl -H 'Authorization: Bearer metrics_token_academico_2026' http://<lb>/METRICS` e recebe `http_requests_by_tenant_total{tenant_id="…"}`, ou seja, o volume de uso de **cada hotel**, além das rotas, das taxas de erro e da memória do processo. O próprio PR justifica bloquear o `/metrics` com esse risco (comentário em `default.conf:34-36` e no controller).
- A "segunda camada" que o comentário descreve não existe no k8s, porque o token é público. A "primeira", o nginx, é contornável.
- Efeito colateral: essas variações também escapam do filtro `request.path === '/metrics'` (`metrics.middleware.js:11`). O scrape passa a ser medido como `route="/metrics"`, o que foi confirmado na reprodução.

**Regra violada:** isolamento multi-tenant (CLAUDE.md §7: "nada pode vazar dado de um hotel para outro nem para a internet"); RNF de segredo fora do versionamento (a política acadêmica de secrets versionados foi aceita para senhas de serviços internos, mas aqui o token é a única barreira de um endpoint alcançável pela internet). A documentação também fica errada: `README.md:375` ("não sai pelo nginx (404)") e `SPEC-02:124` ("barrado no nginx").
**Correção sugerida (menor ajuste):**
1. No nginx (nos dois arquivos, que precisam continuar idênticos pela regra 10), troque o match exato por regex que ignora maiúsculas, por exemplo `location ~* ^/metrics(/|$) { return 404; }`. O nginx decodifica `%XX` e junta barras duplicadas antes de comparar o `location`, então `/%6Detrics` e `//metrics` também ficam cobertos.
2. No backend, monte `/metrics` em um `Router({ caseSensitive: true, strict: true })`, ou rejeite quando `request.path !== '/metrics'`. Assim o filtro do middleware e a rota usam a mesma definição.
3. No k8s, gere o `METRICS_TOKEN` por ambiente, igual a `scripts/k8s_garantir_secret_jwt.sh` faz com a chave do JWT, e retire-o de `secret.yaml`.
4. Adicione testes de regressão para `/METRICS` e `/metrics/`.

### 🔴 [Disponibilidade/Cardinalidade] Requisição não autenticada cria séries ilimitadas: `/PUBLIC/<x>/…` e variações de maiúsculas nos mounts
**Onde:** `services/core-service/app/utils/metrics.js:49` (`.replace(/^\/public\/[^/]+/, …)`, sem flag `i`) e `:51`/`:53` (`base` é o `request.baseUrl` cru)
**Cenário:**
- O Express casa o mount `/public/:subdomain` sem diferenciar maiúsculas, mas `request.baseUrl` guarda o texto **como foi enviado**. Por isso `GET /PUBLIC/rand0/hotel` gera `route="/PUBLIC/rand0/hotel"`, `/PUBLIC/rand1/hotel` gera outra série, e assim por diante. Reproduzido: três requisições geraram três séries distintas. `/Public/abc/hotel` também fica fora da normalização.
- Os demais mounts sofrem o mesmo problema: `/GuEsTs/x` e `/gUESTS/x` viram `route="/GuEsTs/*"` e `route="/gUESTS/*"`, também reproduzido. São 2^16 variações só em `/corporate-clients`.
- Nada disso exige autenticação. O nginx repassa tudo pelo `location /` e não há rate limit fora do `/auth/login`.
- Cada valor novo cria 11 séries no histograma (8 buckets + `+Inf` + `_sum` + `_count`), mantidas para sempre no registry em memória do processo. Com o subdomínio no tamanho máximo de URL (cerca de 8 KB pelo nginx), algumas dezenas de milhares de requisições bastam para estourar o `limits.memory: 512Mi` do backend (`backend.yaml:101`) → OOMKill das 3 réplicas, **todos os hotéis fora do ar**. O ataque recomeça depois de cada restart.
- Antes disso, o `/metrics` passa a serializar megabytes a cada 15 s e bloqueia o event loop, e o Prometheus (`limits.memory: 384Mi`) cai primeiro. Essas estimativas de memória são derivadas, não medidas. O crescimento ilimitado de séries foi reproduzido.
- O comentário do próprio arquivo (`metrics.js:10-12`) promete exatamente o contrário ("senão cada UUID viraria uma série nova e o Prometheus estouraria memória").

**Regra violada:** o critério declarado no próprio PR (cardinalidade controlada); disponibilidade multi-tenant: um anônimo derruba o serviço de todos os tenants.
**Correção sugerida (menor ajuste):** em `metrics.js:49`, normalize para minúsculas antes de aplicar a regex: `(request.baseUrl || '').toLowerCase().replace(/^\/public\/[^/]+/, '/public/:subdomain')`. Todos os mounts são minúsculos, e o único parâmetro presente em `baseUrl` é o `:subdomain`, que a regex já substitui. Para ficar mais robusto (opcional), use uma allowlist dos mounts conhecidos, mandando o que não estiver nela para `unmatched`. Adicione testes de regressão com `/PUBLIC/x/hotel` e `/GUESTS`.

### 🟡 [Observabilidade] Requisição abortada ou em timeout some das métricas: o middleware só escuta `finish`
**Onde:** `services/core-service/middlewares/metrics.middleware.js:17`
**Cenário:** um handler que leva 400 ms com um cliente que desiste em 50 ms não gera **nenhuma** série (reproduzido: `NENHUMA SERIE PARA /lento`). Em produção, isso cobre o 504 do nginx (`proxy_read_timeout 60s`), o usuário que fecha a aba e o celular do garçom que perde o sinal. Justamente as requisições lentas, que mais importam num incidente, saem do p95, da vazão e da taxa de erro, e o dashboard mostra tudo verde enquanto o sistema trava.
**Regra violada:** CA-02.4.d ("latência por endpoint, taxa de erro") medida errado no cenário em que ela importa.
**Correção sugerida:** registrar uma vez com `response.once('close', …)`, que dispara tanto após `finish` quanto no abort. Quando `!response.writableFinished`, use `status_code="499"` (convenção do nginx para cliente que fechou a conexão).

### 🟡 [Exposição/LGPD] No compose, Grafana e backend (com `/metrics`) ficam publicados em todas as interfaces
**Onde:** `docker-compose.yml:213` (`"${GRAFANA_HOST_PORT:-3002}:3000"`) e `docker-compose.yml:105` (backend `3000`, preexistente)
**Cenário:** no dia da defesa, o laptop está no Wi-Fi da faculdade. `http://<ip-do-laptop>:3002` mostra a tela de login do Grafana para qualquer pessoa da rede. A única exigência sobre a senha é não ser vazia (`docker-compose.yml:223`), então `GRAFANA_ADMIN_PASSWORD=admin` é aceita. Lá dentro, o painel "Requisições por hotel (tenant)" mostra o volume de cada hotel. A porta 3000 do backend também vai para `0.0.0.0`, então no compose o `/metrics` nunca passa pelo nginx (a "segunda camada" do comentário em `default.conf:34-36` não existe nesse caminho) e só o token protege. Com o `.env` gerado por `openssl rand` isso basta, mas o placeholder do achado 🟢-4 derruba essa proteção.
**Regra violada:** minimização de exposição; o próprio README chama a stack de "não exposta".
**Correção sugerida:** `"127.0.0.1:${GRAFANA_HOST_PORT:-3002}:3000"`. O Grafana é usado só no próprio laptop e só perde o acesso pela LAN. Na porta do backend, a mesma troca não quebra o Vite local, mas é mudança preexistente: registrar como pendência.

### 🟡 [Testes] Os testes não cobrem nenhum dos dois 🔴 e parte das asserções passa com o estado acumulado por outros arquivos
**Onde:** `services/core-service/tests/metrics.test.js:89`, `:105` (e o `isolate: false` de `vitest.config.js`)
**Cenário:**
- O registry é um singleton por processo e a suíte roda com `isolate: false`. `toContain('route="unmatched"')` e a série `/health` 200 continuam passando mesmo que a requisição feita **neste** teste não seja medida, desde que algum arquivo de teste anterior tenha gerado a série.
- Nenhum teste exercita maiúsculas, barra final ou `/PUBLIC/…`, que são justamente os caminhos que quebram (🔴 1 e 2).
- Os testes de "conteúdo" verificam presença de série, não incremento.

**Correção sugerida:** ler o valor antes e depois com `await httpRequestDuration.get()` (ou `registry.getSingleMetricAsString`) e afirmar delta = 1. Adicionar `/METRICS` → 404/401 conforme a correção escolhida, `/metrics/` e `/PUBLIC/x/hotel` → label `/public/:subdomain/hotel`.

### 🟢 [Observabilidade] As probes de `/health` dominam vazão e taxa de erro
**Onde:** `services/core-service/middlewares/metrics.middleware.js:11`
**Cenário:** no k8s são 3 réplicas × (readiness a cada 10 s + liveness a cada 20 s), mais o `HEALTHCHECK` do Dockerfile e o healthcheck do nginx no compose. Num hotel parado, quase toda a "vazão por rota" e o p95 geral vêm das probes, e a taxa de erro fica diluída. É a mesma justificativa usada no comentário para excluir o `/metrics`. **Correção:** excluir `/health` também, ou filtrar `route!="/health"` nas queries do dashboard.

### 🟢 [Observabilidade] Corpo JSON inválido vira `route="unmatched"`
**Onde:** `services/core-service/routes/router.js:29` e `:40`
**Cenário:** `POST /reservations` com JSON malformado recebe 400 do `express.json()` antes de entrar no router montado, e a métrica registra `unmatched` em vez de `/reservations/*`. A bandeja de erros 4xx por rota fica incompleta. É pequeno e fica só registrado.

### 🟢 [Dependência] `prom-client@15.1.3` entra já marcado como deprecated
**Onde:** `services/core-service/package-lock.json` (entrada `node_modules/prom-client`: `"deprecated": "prom-client has been replaced by @prometheus-io/client"`)
**Cenário:** a dependência nova já nasce sem manutenção futura. O lock também traz uma entrada sem relação com o PR (`node_modules/vitest/node_modules/yaml`, dev/optional/peer), inofensiva. **Correção:** registrar a migração como pendência. Não bloqueia.

### 🟢 [Infra] Detalhes dos manifests e do compose
- `infra/k8s/observability.yaml:48-79`: o `prometheus-config` é um ConfigMap fixo, fora do `configMapGenerator`. Mudar a config não reinicia o pod, diferente dos ConfigMaps do Grafana, que têm hash.
- `observability.yaml:97` e `:178`: os pods do Prometheus e do Grafana não têm `securityContext` (`runAsNonRoot`, `allowPrivilegeEscalation: false`). O Grafana monta o token da ServiceAccount `default` sem precisar (`automountServiceAccountToken: false`).
- `docker-compose.yml:192`: o token é gravado em `/prometheus/metrics_token`, dentro do volume persistente `prometheus_data`, e continua no disco depois que o `.env` muda.
- `docker-compose.yml:216`: o `GF_SECURITY_ADMIN_PASSWORD` só vale na **primeira** inicialização do `grafana_data`. Trocar a senha no `.env` depois não muda o login e a mensagem do entrypoint não avisa. Vale uma linha no README.

### 🟢 [Configuração] O placeholder não-vazio anula o fail-closed
**Onde:** `services/core-service/.env.example:30` (`METRICS_TOKEN=gere_um_token_aleatorio_aqui`)
**Cenário:** quem roda o backend fora do compose (`npm run dev`) e copia o `.env.example` sem editar fica com `/metrics` aberto para um token conhecido, que está no repositório público. O `.env.example` da raiz faz certo, com o valor vazio. **Correção:** deixar `METRICS_TOKEN=` vazio. `GRAFANA_ADMIN_USER` é usado no compose (`:215`) mas não aparece documentado no `.env.example`.

## O que foi verificado e está correto
- **Token:** o `GetMetricsController` é fail-closed (503 sem token) e compara o cabeçalho inteiro `Bearer <token>` com `timingSafeEqual`, conferindo o tamanho antes. Um JWT de hotel não abre o `/metrics` (há teste para isso). Query string não altera nada: `/metrics?x=1` foi testado.
- **Labels de tenant:** `tenant_id` só é setado por `tenant.middleware.js:21`, depois do JWT validado e do tenant existir e estar `ACTIVE`, com cardinalidade igual ao número de tenants reais. O motor público, `/auth` e `/webhooks` não setam `tenantId`.
- **Dados pessoais:** nenhum label contém PII. A rota vem do **padrão** (`/guests/:id`, `/address/:cep`), não do caminho cru, exceto nos casos do 🔴 2. Os UUIDs, CEPs e subdomínios minúsculos não aparecem (reproduzido e coberto por teste).
- **k8s, rede:** o Service do backend é `ClusterIP`. `backend-ingress` ganhou só `app: prometheus` na porta 3000. `minio-ingress`, `postgres-ingress`, `redis-ingress` e `rabbitmq-ingress` ficaram intactos. O Prometheus aceita ingress só do Grafana na 9090, e o Grafana não aceita ingress nenhum (acesso por `port-forward`). Os dois Services são `ClusterIP`.
- **k8s, RBAC:** o Prometheus usa um `Role` no namespace com get/list/watch em pods, não `ClusterRole`. O relabel mantém só `app=backend` na porta 3000.
- **nginx:** `docker/nginx/default.conf` e o ConfigMap de `infra/k8s/nginx.yaml` são idênticos, ignorando comentários. O `location = /metrics` não captura e não abre nada do MinIO: a regex `^/hotel-contracts/…\.pdf\z`, o `location /hotel-contracts/` → 403 e o `location /` estão inalterados.
- **kustomize:** `kubectl kustomize infra/k8s` renderiza sem erro. Os três ConfigMaps do Grafana e o `minio-setup` recebem hash, e os Deployments referenciam os nomes com hash.
- **Grafana:** `GF_AUTH_ANONYMOUS_ENABLED=false` e `GF_USERS_ALLOW_SIGN_UP=false`. Sem senha, o container não sobe no compose (o entrypoint testa a variável) nem no k8s (`secretKeyRef` obrigatório). Não há fallback para `admin/admin`.
- **Prometheus no compose:** não publica porta, recusa subir sem `METRICS_TOKEN` e usa `credentials_file`, então o token não fica na config.
- **ESM:** nenhum `require()`. O registry é próprio e não o global.
- **Swagger:** a ausência do `/metrics` segue o mesmo padrão do `/health`. É endpoint de infraestrutura, fora do cliente tipado do frontend.

## Não foi possível verificar
- **Grafana de pé (C8 "funcional e acessível"):** a própria SPEC-02 (linhas 123-130) registra que o Grafana **nunca subiu** na sessão do dev (falha de DNS do Docker Hub). O provisionamento (datasource com uid `prometheus`, provider, dashboard) só foi conferido lendo os arquivos. Pelas regras desta auditoria, nada foi subido. É o principal risco para a banca: alguém precisa subir `--profile observability` e abrir o dashboard antes da defesa.
- **Suíte de testes:** não rodada (o banco de teste está compartilhado com outra auditoria). Os comportamentos citados nos 🔴 e no 🟡 do abort foram reproduzidos em um app Express mínimo, sem banco.
- **Aplicação das NetworkPolicies:** depende de o CNI do cluster aplicar NetworkPolicy. Não verifiquei qual CNI o cluster de defesa usa.
- **Consumo de memória no ataque do 🔴 2:** o número de requisições até o OOM é uma estimativa, não uma medição.

---

## Reauditoria (12/10)
**HEAD:** `53ee8fc` · **Commits novos:** `85ddbbb` (merge da develop com o PR #89 do Mercado Pago) · `7c87576` fix(metrics) · `53ee8fc` fix(compose)
**Escopo:** `git diff 85ddbbb..HEAD` (8 arquivos). O merge `85ddbbb` não altera nenhum arquivo deste PR: `router.js`, nginx, networkpolicy, compose, `secret.yaml` e `backend.yaml` ficaram iguais entre `20b6577` e `85ddbbb`.

### Veredito
**APROVADO COM RESSALVAS**

Os dois 🔴 estão corrigidos, e reproduzi as correções de forma independente. Não sobra nenhum 🔴. A ressalva principal é o resíduo do 🔴-1 (o token versionado), que rebaixo para 🟡: deixa de ser um caminho a partir da internet e vira higiene de segredo dentro do cluster. Continua pendente o C8 (o Grafana de pé), que nenhuma das duas auditorias conseguiu verificar.

### Como foi verificado
- **`npx vitest run tests/metrics.test.js` isolado:** 21/21 passam, incluindo os 9 novos. Antes de rodar, conferi que nenhum vitest estava em execução.
- **App Express mínimo** com `metricsMiddleware`, `GetMetricsController`, um Router `{ caseSensitive, strict }` e `routeLabel` reais, montados como em `router.js`, com keep-alive ligado:
  - Responde 200 só em `/metrics` e `/metrics?x=1`.
  - Respondem 404 (`unmatched`): `/metrics/`, `/METRICS`, `/Metrics`, `/metrics;x`, `/metrics%2F`.
  - `/health`, `/health/`, `/HEALTH`, `/`, `/GUESTS/abc` e `/guests/abc/` seguem iguais: o router principal continua sem diferenciar maiúsculas e sem `strict`, então não há regressão.
  - `/PUBLIC/Zz/hotel` gera o label `/public/:subdomain/hotel`, e o controller ainda recebe `params.subdomain = "Zz"`, porque a caixa original fica preservada para o lookup.
  - Cada requisição normal com keep-alive foi contada **uma** vez (`/health` 3 → 3).
  - Um abort depois de 50 ms foi contado uma vez com `status_code="499"`.
  - O script ficou fora do repositório e foi apagado; o working tree continua só com este relatório.
- **nginx:** `docker/nginx/default.conf` e o ConfigMap de `infra/k8s/nginx.yaml` continuam idênticos, ignorando comentários. `kubectl kustomize infra/k8s` renderiza sem erro.

### Respostas às perguntas do coordenador
- **O Router `caseSensitive`/`strict` afeta outras rotas?** Não. As opções valem só para as rotas daquele Router. O `router.use(metricsRouter)` cria uma camada de mount em `/` com `strict: false` (é assim que o `use()` do Express monta), e caminhos que não casam seguem pelo `next()` sem alterar `baseUrl` nem `url`. Isso foi confirmado no teste acima.
- **O 499 pode contar em dobro com `finish` depois de `close`?** Não:
  - Os dois listeners usam `once` e passam pela guarda `recorded`.
  - No fluxo normal, o Node emite `finish` e depois `close` com `writableFinished = true`, e o segundo não registra.
  - No abort, `close` chega com `writableFinished = false` e registra 499. Um `finish` tardio pararia na guarda.
  - Observação (🟢): o teste novo emite `close` duas vezes, mas o `once` sozinho já impede a segunda chamada. Ele não exercita a ordem `finish` → `close`, então remover `recorded` não o deixaria vermelho. O teste com app real acima cobre esse caminho.
- **A regex do nginx captura algo legítimo?** `~* ^/metrics(/|$)` exige `/` ou fim logo depois de `metrics`. `/metrics-algo`, `/metricsx` e `/metrics.json` **não** são capturados e seguem ao backend. Ela não colide com o `location /auth/login` (prefixo) nem com a regex do MinIO, que é ancorada em `/hotel-contracts/`. Uma futura rota de API em `/metrics/<algo>` ficaria bloqueada no nginx, o que é aceitável e coerente com a intenção, já que o namespace `/metrics` é reservado ao scrape. O comentário diz "qualquer sufixo", quando na verdade é qualquer sufixo iniciado por `/`. É imprecisão menor e fica sem achado. Não executei o nginx (sem containers, pela regra desta auditoria). A matriz de 404 testada no nginx real é do executor.

### Estado de cada achado
| # | Achado | Estado |
|---|---|---|
| 🔴-1 | `/metrics` pela porta pública + token público | **Corrigido** o caminho externo: a regex do nginx (dois arquivos) mais o Router exato no backend. Resíduo **rebaixado para 🟡**: `METRICS_TOKEN` versionado em `secret.yaml:26`, num repositório público. Hoje só é alcançável dentro do cluster (backend `ClusterIP`, `backend-ingress` restrita a nginx e Prometheus). Se o CNI não aplicar NetworkPolicy (o Kubernetes do Docker Desktop, por exemplo), qualquer pod do cluster lê o `/metrics` com o token do repositório. Aceito como pendência do Weslley, alinhada à política acadêmica de segredos. Gerar o token por ambiente, como em `k8s_garantir_secret_jwt.sh`, fecha o resíduo. |
| 🔴-2 | Cardinalidade ilimitada via `/PUBLIC/<x>` e maiúsculas nos mounts | **Corrigido** (`metrics.js:52`, `.toLowerCase()` antes da regex). Os mounts são todos minúsculos e o único parâmetro presente em `baseUrl` é o `:subdomain`. Testes unitários e de integração cobrem, e o teste de integração ficaria vermelho sem a correção. |
| 🟡 | Abort/timeout fora das métricas | **Corrigido**: 499, registro único. Fica a observação 🟢 sobre o teste acima. |
| 🟡 | Portas do compose em todas as interfaces | **Corrigido**: backend e Grafana em `127.0.0.1:` (`docker-compose.yml:105` e `:213`). O RabbitMQ `15672` continua em `0.0.0.0`, mas é preexistente e fora do escopo do PR. |
| 🟡 | Testes não cobriam os 🔴 / dependiam de estado acumulado | **Corrigido parcialmente → 🟢**. Os testes novos usam sufixo aleatório e asserções de ausência, e são os que protegem os 🔴. As asserções antigas de presença (`metrics.test.js:89`, `:105`) seguem dependentes de séries já existentes no registry, o que é menor. |
| 🟢-1 | Probes de `/health` diluem o dashboard | Pendente (registrado pelo dono) |
| 🟢-2 | JSON inválido vira `unmatched` | Pendente |
| 🟢-3 | `prom-client` deprecated | Pendente |
| 🟢-4 | Hash do `prometheus-config`, `securityContext`, token no volume, senha do Grafana só no 1º boot | Pendente |
| 🟢-5 | Placeholder do `METRICS_TOKEN` no `.env.example` | **Corrigido** (vazio) |

### Ainda não verificado
- **C8 (Grafana de pé e dashboard abrindo):** continua sem prova e é o maior risco para a banca. Alguém precisa rodar `docker compose --profile observability up -d` e abrir *Gesway → Saúde do core-service* antes da defesa.
- **Suíte completa e nginx real:** não rodei nenhum dos dois. Os números (439 testes passando, cobertura, matriz de 404 no nginx) são do executor.
