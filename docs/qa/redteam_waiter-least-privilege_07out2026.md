# QA Red Team — waiter-least-privilege (SPEC-04 §6, CA-04.1.n.2 / n.3)
**Branch:** fix/waiter-least-privilege · **Dev:** Sirlande · **Base:** develop@0865663 · **Data:** 07/10/2026
**Commit auditado:** `6ec4c85` fix(auth): WAITER restrito a allowlist (cardapio e comandas)
**Arquivos auditados:** 3 (`app/utils/roles.js`, `middlewares/auth.middleware.js`, `tests/waiter-least-privilege.test.js`). Para validar cenários também li: `routes/router.js`, os 16 routers de `routes/apis/`, `middlewares/role.middleware.js`, `middlewares/tenant.middleware.js`, `_web.js`, `tests/helpers/createApp.js`, `infra/k8s/nginx.yaml`, `frontend/apps/pms/vite.config.ts`, as rotas/nav do `frontend/apps/pms`, `config/swagger.js` (respostas 403) e a SPEC-04 §4–§6.
**Achados no escopo:** 6 (🔴 0 · 🟡 2 · 🟢 4) · **Repassados:** 0

## Veredito
**APROVADO COM RESSALVAS**

Nenhum bypass da allowlist foi encontrado: 30+ variações de path/método testadas de verdade contra o app (abaixo). Os testes provam a regra: rodando os mesmos 29 testes com o `auth.middleware.js` de `develop`, **19 falham**. As duas ressalvas 🟡 são de desenho: a regra de `/accounts` libera mais do que o CA permite (inclusive `/bill`), e o "fail-safe" vale por rota mas não por papel.

## Achados no escopo

### 🟡 [Segurança/LGPD] A regra de `/accounts` é um prefixo e já libera `GET /accounts/:id/bill` e `DELETE` em qualquer subrota para o WAITER
**Onde:** `services/core-service/app/utils/roles.js:16`
**Cenário:** a regra `{ methods: ['GET','POST','DELETE'], path: /^\/accounts(\/|$)/ }` autoriza o WAITER em **qualquer** path abaixo de `/accounts`. Quando a T-04.1 bloco D / 3a criar `GET /accounts/:id/bill` (CA-04.3.a: `room_charges`, `payments_made`, `balance`), `DELETE /accounts/:id` ou outra subrota de leitura, o garçom já entra nelas, a menos que quem escrever o router se lembre de pôr `requireRole`. É o mesmo padrão "fail-open por omissão" que a branch quis eliminar, agora dentro de `/accounts`. O CA-04.1.n.2 diz textualmente que o WAITER "**não** alcança … nem `/bill`". Hoje o problema está latente: o router `/accounts` não existe (`GET /accounts/x/bill` com token WAITER → 404, verificado).
**Regra violada:** SPEC-04 CA-04.1.n.2; CLAUDE.md §7 (allowlist fail-safe); LGPD art. 6º, III (minimização: o garçom não precisa do saldo nem dos pagamentos do hóspede).
**Correção sugerida:** detalhar a regra por rota, só com o que o garçom usa. Exemplo: `GET ^/accounts/?$`, `GET ^/accounts/[^/]+/?$`, `POST ^/accounts/[^/]+/items/?$`, `DELETE ^/accounts/[^/]+/items/[^/]+/?$` (e `POST ^/accounts/?$`, se abrir conta DAY_USE fizer parte do papel dele). `/bill`, `/close` e `DELETE /accounts/:id` ficam de fora até alguém decidir o contrário. Dá para fazer junto com a T-04.1 D, mas com pendência registrada na SPEC-04.

### 🟡 [Segurança] Fail-open por papel: qualquer `role` diferente de `WAITER` passa por todas as rotas
**Onde:** `services/core-service/app/utils/roles.js:20`
**Cenário:** `if (role !== 'WAITER') return true;`. Reproduzido assinando JWT RS256 com a chave do servidor: com `role: 'HOUSEKEEPER'`, `GET /guests` → 200, `GET /tenants/me` → 200 e `GET /reservations` chega no controller. Com payload **sem** `role`, a allowlist também deixa passar (`GET /reservations` → segue para o tenantMiddleware). Hoje não dá para explorar: só o servidor assina, e `db/schema.sql:48` faz `CHECK (role IN ('ADMIN','RECEPTIONIST','WAITER'))`. Mas o primeiro papel novo (governança/camareira é o próximo óbvio) nasce com acesso total, salvo nas rotas que já têm `requireRole`. É a blocklist que o comentário da linha 6–9 diz evitar, só que aplicada ao papel.
**Regra violada:** CLAUDE.md §7 ("Blocklist de estados (fail-open) — use allowlist (fail-safe)").
**Correção sugerida:** liberar acesso total só para os papéis conhecidos e negar o resto: `if (role === 'ADMIN' || role === 'RECEPTIONIST') return true; const rules = ALLOWLIST_BY_ROLE[role]; if (!rules) return false;`.

### 🟢 [Testes] O teste `/productsX` passaria mesmo sem a âncora da regex
**Onde:** `services/core-service/tests/waiter-least-privilege.test.js:136-139`
**Cenário:** nenhum router atende `/productsX`, então o Express devolve 404 antes de qualquer `authMiddleware`. O `not.toBe(200)` passa com ou sem a âncora. **Mutação feita:** troquei `/^\/products(\/|$)/` por `/^\/products/` (e o mesmo em `/accounts`) numa cópia em scratchpad, e os 29 testes passaram. Um router futuro como `/accounts-receivable` (contas a receber, B2B) seria liberado ao garçom e nenhum teste quebraria.
**Regra violada:** checklist §8, "teste que passaria mesmo com a regra de negócio quebrada".
**Correção sugerida:** teste unitário direto em `isRouteAllowedForRole('WAITER','GET','/productsX') === false` e `('WAITER','GET','/accounts-receivable') === false`.

### 🟢 [Testes] As regras de `/accounts` não têm nenhum teste
**Onde:** `services/core-service/app/utils/roles.js:16`; `tests/waiter-least-privilege.test.js` (ausente)
**Cenário:** o router não existe, então não dá para testar via HTTP. A linha 16 não tem nenhum teste, e qualquer mudança nela (método, âncora, escopo) passa sem que nada falhe.
**Correção sugerida:** o mesmo teste unitário do item anterior, cobrindo também `/accounts`. Junto com o 🟡 de `/bill`, vira teste de "`GET /accounts/x/bill` → negado".

### 🟢 [Contrato] Novo 403 nas rotas de `/reservations`, `/guests`, `/payments`, `/tenants`, `/room-categories` e B2B não está no Swagger
**Onde:** `services/core-service/config/swagger.js` (ex.: `'/guests'` na linha 685 e `'/reservations'` na 735 só documentam 401)
**Cenário:** o WAITER passa a receber 403 nessas rotas, e o OpenAPI não diz isso. Não quebra o cliente tipado: o `openapi-fetch` trata qualquer status não-2xx como `error`, e o frontend do garçom só abre `/comanda` (placeholder, sem chamada de API — `frontend/apps/pms/src/App.tsx:36`). ADMIN e RECEPTIONIST não mudam de comportamento.
**Classificação:** pendência de documentação, não quebra de contrato. Uma resposta `403` genérica ("papel sem acesso a esta rota") em `components.responses`, referenciada pelas rotas autenticadas, resolve. `swagger.js` tem regra de colisão (§7 da divisão), então isso precisa ser combinado com o Gabriel.

### 🟢 [KISS/robustez] `HEAD` e path com maiúsculas negados ao WAITER; regra presa ao ponto de montagem
**Onde:** `services/core-service/app/utils/roles.js:15`; `services/core-service/middlewares/auth.middleware.js:29`
**Cenário:** (1) o Express encaminha `HEAD` para o handler de `GET`, mas a allowlist só aceita `'GET'`: `HEAD /products` com WAITER → 403 enquanto `GET /products` → 200. (2) O Express não diferencia maiúsculas de minúsculas por padrão, mas a regex diferencia: `GET /Products` → 403. (3) A regra compara `originalUrl` absoluto. Se o core passar a ser montado sob um prefixo (`/api`, `/core`, gateway do ADR-003 que não remova o prefixo), o WAITER leva 403 em tudo. Os três casos negam acesso, então não vazam nada. Mas o (3) derruba o garçom em silêncio, e a única defesa é a suíte. Hoje o Vite e o nginx removem/passam o path na raiz (`vite.config.ts:14`, `infra/k8s/nginx.yaml:51`), então não há falha atual.
**Correção sugerida:** aceitar `HEAD` onde houver `GET` e deixar no `roles.js` um comentário dizendo que os paths são relativos à raiz do core-service. Nada urgente.

## Repassados a outro dev
nenhum

## O que foi verificado e está correto
- **Bypass por normalização**, testado de verdade (supertest e socket cru, JWT WAITER assinado com a chave de teste, tenant real e ativo): `/products/../reservations`, `/products/%2e%2e/reservations` e `/products/../guests` passam pela allowlist, mas caem no `productRouter`, que só tem `/` e `/:id` → **404**. `/products/..%2freservations` → `GetProduct` com id `../reservations` → 404 "Produto não encontrado". Nem Express nem nginx (`proxy_pass` sem URI repassa o path cru) normalizam `..`, então o prefixo que a regex vê é o mesmo que o router usa. `//reservations`, `//products`, `/products;x`, `/products%2f..%2freservations` → 404. `/./reservations`, `/Reservations`, `/reservations/`, `?x=/products`, `#/products` → 403. Absolute-form (`GET http://x/reservations`, `GET http://x/products/../reservations`) → 403: o `originalUrl` começa com `http://`, a regex ancorada falha e a requisição é negada.
- **Override de método:** não existe middleware `method-override`. `X-HTTP-Method-Override` é ignorado (POST /reservations com override GET → 403). `OPTIONS` é respondido pelo CORS antes do auth (204, sem dado).
- **Cobertura de routers:** dos 16 routers, 13 aplicam `router.use(authMiddleware, ...)` no topo (address, analytics, contract, corporateClient, eventQuote, guest, payment, product, reservation, roomCategory, room, tenant, user). Os que não aplicam são `auth` (login/register), `publicBooking` e `webhooks`, que são públicos por desenho. Nenhum router fica montado sem prefixo, o que poderia fazer o `authMiddleware` de um interceptar o prefixo de outro. Não há `case sensitive routing`/`strict routing` ligado.
- **O 403 vem antes da busca:** o check está no `authMiddleware`, antes do `tenantMiddleware` e de qualquer controller. Os testes usam IDs reais (`reservationId`, `guestId`). Mutação: com o middleware de `develop`, 19 dos 29 testes falham, entre eles todas as rotas de reserva, hóspede e pagamento e o teste "403 não vaza dado". Os 3 que passavam antes (`/rooms`, `/users`, `/analytics`) são regressão do `requireRole` antigo, não prova nova, e o teste deixa isso claro.
- **Regressão de ADMIN/RECEPTIONIST:** `isRouteAllowedForRole` devolve `true` para os dois, e os testes de regressão cobrem reservas/bill/hóspedes/pagamentos (RECEPTIONIST) e B2B/tenant/categorias (ADMIN). A suíte do arquivo roda verde (29/29).
- **Frontend:** o WAITER só tem `/comanda` (`nav.ts:18`, `roleHome.ts:5`), que é placeholder sem chamada de API. O AppShell não faz chamada de bootstrap (`/tenants/me` etc.) que agora quebraria.
- **Corpo do 403:** só `{ error }`, sem PII. Não há `console.*` novo.
- **SOLID/SRP:** a autorização dentro do middleware de autenticação mistura duas responsabilidades, mas a justificativa é real: é o único ponto por onde **toda** rota autenticada passa, o que fecha o garçom em routers futuros sem depender de cada router lembrar. A regra fica isolada em `app/utils/roles.js` (testável e reaproveitável), e o middleware só a chama. Considero aceitável, sem achado.
- ESM, sem `require()`. Nenhuma dependência nova. Nenhuma gravação em banco.

## Não foi possível verificar
- **Regras de `/accounts` em execução:** o router não existe (T-04.1 bloco D). Só foi possível ler a regex.
- **Cobertura global ≥ 60%:** não rodei `test:coverage` da suíte inteira. O caller informou 310 passed + 1 skip e `qa_checks.sh` limpo, e eu não refiz isso.
- **Papel desatualizado no JWT:** se um RECEPTIONIST é rebaixado a WAITER, o token antigo segue com `role: RECEPTIONIST` até expirar. É uma propriedade do JWT stateless (área de auth/RS256), anterior a esta branch e fora do diff. Fica como risco residual, sem repasse, porque não houve cenário confirmado de dano além da janela de expiração.
- Ingress/gateway do ADR-003 (split em 3 serviços) ainda não existe, então não dá para confirmar se ele vai preservar o path na raiz.
