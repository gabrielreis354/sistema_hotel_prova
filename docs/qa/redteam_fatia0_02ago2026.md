# QA Red Team — Fatia 0 (pré-requisitos de backend para o frontend)
**Branch:** fix/backend-prep-frontend · **Base:** develop@9558b87 · **Data:** 02/08/2026
**Arquivos auditados:** 10 (diff) + contexto (router, role.middleware, userRouter, reservationRouter, ReservationModel, UpdateUserController) · **Achados:** 5 (🔴 0 · 🟡 3 · 🟢 2)

## Veredito
APROVADO COM RESSALVAS

Nenhum achado 🔴. Suíte roda verde (170 passed, 1 skipped) contra o Postgres de teste local. Os critérios de aceite da Fatia 0 estão cumpridos: CORS responde cross-origin e preflight 204; `?from=&to=` filtra por sobreposição; `?page=&limit=` devolve o envelope e sem query mantém array puro; WAITER recebe 403 em `/rooms`, `/users` e `/analytics`; role inválido em POST /users → 400; ADMIN sem over-block. As ressalvas abaixo são dívidas de robustez/segurança que não bloqueiam o merge, mas devem virar pendência.

## Achados

### 🟡 [Segurança/CORS] `.env.example` ship com CORS liberado para qualquer origem
**Onde:** `.env.example:16` (`CORS_ORIGINS=*`) e `middlewares/cors.middleware.js:9-14`
**Cenário:** quem copia `.env.example` para `.env` em staging/produção herda `CORS_ORIGINS=*`. O middleware então emite `Access-Control-Allow-Origin: *` para qualquer origem. Como a API usa Bearer token no header `Authorization` (não cookie) e o middleware **não** envia `Access-Control-Allow-Credentials: true`, isso não é um vazamento explorável de sessão — o navegador de um site malicioso ainda não consegue anexar credenciais da vítima. Mesmo assim, o default-aberto convida a esquecer de fechar em produção.
**Regra violada:** postura fail-safe (CLAUDE.md §7 — allowlist, não fail-open). O default deveria ser fechado, não `*`.
**Correção sugerida:** em `.env.example`, comentar o valor `*` e deixar `CORS_ORIGINS=` vazio (ou com exemplo de domínio), forçando decisão explícita. Opcionalmente, tratar ausência como "sem CORS" em vez de "libera tudo".

### 🟡 [Segurança/Consistência] `UpdateUserController` aceita qualquer `role` sem allowlist
**Onde:** `app/Controllers/UserApi/UpdateUserController.js:15` (`if (role) user.role = role;`) — arquivo **fora do diff**, pré-existente.
**Cenário:** `PUT /users/:id` com `{ "role": "SUPERADMIN" }` (ou qualquer string). O `CreateUserController` agora valida contra `VALID_ROLES` e devolve 400 limpo, mas o Update não valida. A gravação bate no `CHECK (role IN (...))` de `db/schema.sql` e o banco rejeita — o usuário recebe **500** (erro interno genérico) em vez de **400** com mensagem clara. Assimetria entre criar e atualizar. Note ainda: um `role` válido porém indevido (ex.: rebaixar/promover) passa sem trilha de auditoria.
**Regra violada:** DRY/consistência (a allowlist de role deveria ser compartilhada entre Create e Update) e contrato de erro previsível.
**Correção sugerida:** extrair `VALID_ROLES` para `app/utils/` (ou um validador compartilhado) e aplicar a mesma checagem no `UpdateUserController`. Fora do escopo desta fatia — registrar como pendência.

### 🟡 [Segurança/Escopo do WAITER] Papel WAITER criado sem gate nas rotas que ele NÃO deve usar além das três cobertas
**Onde:** `routes/apis/reservationRouter.js:26-42`, `routes/apis/guestRouter.js`, `routes/apis/paymentRouter.js`
**Cenário:** a Fatia 0 introduz o papel `WAITER` ("lança consumo pelo celular e não enxerga gestão"), mas só fechou `/rooms`, `/users` e `/analytics`. Um JWT de WAITER hoje consegue: `GET /reservations` (lista todas as reservas do tenant, incluindo dados de hóspede), `GET/POST /guests`, `POST /reservations`, `PUT /reservations/:id`, check-in/check-out/cancel, e os endpoints financeiros `GET /:id/bill`. Isso é mais do que "só lança consumo". Pode ser intencional para esta fatia (o escopo declarado cobre apenas rooms/users/analytics), mas o papel existir sem o restante do gate deixa uma janela: se o front do garçom usar o mesmo backend, o WAITER vê reserva e conta de hóspede.
**Regra violada:** qa-redteam §1 — "Role novo (WAITER) recebe apenas o que precisa"; least privilege.
**Correção sugerida:** definir explicitamente o que o WAITER pode (provavelmente só `GET /reservations/:id`, `GET/POST /reservations/:id/consumptions`) e gatear o resto. Registrar como pendência da próxima fatia (módulo de consumo) se estiver fora do escopo agora.

### 🟢 [Robustez] `from`/`to` sem validação de formato de data
**Onde:** `app/Controllers/ReservationApi/ListReservationController.js:18-19`
**Cenário:** `GET /reservations?from=abc&to=xyz`. Os valores vão direto para `{ [Op.lte]: to }` / `{ [Op.gte]: from }` contra colunas `DATEONLY`. Strings inválidas podem gerar erro de cast no Postgres (→ 500) ou comparação silenciosamente vazia, dependendo do driver. Não é vazamento nem perda financeira, mas o front pode receber 500 por um typo de query.
**Regra violada:** validação de entrada (padrão de controller do CLAUDE.md §8, passo 1).
**Correção sugerida:** validar `from`/`to` com regex `YYYY-MM-DD` (ou `Date.parse`) e devolver 400 quando malformado.

### 🟢 [DRY] Comparação de datas de sobreposição inline vs. utilitário existente
**Onde:** `app/Controllers/ReservationApi/ListReservationController.js:18-19`
**Cenário:** a lógica de sobreposição de período (`check_in <= to AND check_out >= from`) é a mesma ideia usada em conflito de reservas/disponibilidade. Confirmei que existe lógica de conflito no projeto (`checkReservationConflict`/disponibilidade), então há risco baixo de as duas divergirem no futuro. Aqui é filtro de leitura, não regra financeira, então o risco é pequeno — por isso 🟢.
**Correção sugerida:** se a lógica de janela crescer, considerar centralizar em `app/utils/`. Sem ação imediata.

## O que foi verificado e está correto
- CORS montado no router compartilhado **antes** de `express.json()` e das rotas; preflight OPTIONS encerra em 204 sem passar por auth (`routes/router.js:26`, `middlewares/cors.middleware.js:33-37`). Middleware **não** envia `Allow-Credentials`, então `*` com Bearer token não é exploração de sessão.
- `tenant_id` sempre de `request.user.tenantId` no `ListReservationController` — nunca de body/query.
- Envelope de paginação exatamente `{ data, total, page, limit }`; `limit` clampeado 1..100, `page` mínimo 1; `distinct: true` no count (belongsTo, então inofensivo).
- Contrato antigo preservado: sem `page`/`limit`, devolve array puro — teste cobre (`tests/backend-prep.test.js`).
- `include` com `attributes` explícitos (guest: id/full_name/email; room: id/number/floor; user: id/name) — não vaza `password_hash` nem PII excedente. Sem regressão de LGPD.
- `WAITER` adicionado ao `CHECK` de `db/schema.sql` em paridade com `VALID_ROLES` do controller.
- Gates `requireRole('ADMIN','RECEPTIONIST')` corretos em `roomRouter` (reads) e em `analyticsRouter.use(...)` (cobre os 7 endpoints). `GET /users` já era `requireRole('ADMIN')`, então WAITER recebe 403 lá também. Escritas de room seguem `requireRole('ADMIN')` — sem over-block do ADMIN (teste confirma 200).
- Swagger de `GET /reservations` atualizado com os 4 parâmetros de query e descrição do envelope condicional — não quebra o cliente tipado.
- ESM puro em todos os arquivos novos/alterados; nenhum `require()`.
- Testes exercitam CORS (2), filtro/paginação (3), e WAITER incl. role inválido→400 e ADMIN sem over-block (5). Suíte inteira: 170 passed, 1 skipped.

## Não foi possível verificar
- **Comportamento real de `from`/`to` malformado** contra o Postgres (não escrevi teste ad-hoc; classificado como 🟢 por baixo dano). Confirmação exigiria um caso `?from=abc`.
- **Cobertura de linha do portão de 60%** — a suíte passa, mas não rodei `--coverage` para conferir o número exato do CI para os arquivos novos.
- **Escopo pretendido do WAITER** — inferi "só lança consumo" do comentário no código; a extensão exata do least-privilege depende da definição do módulo de consumo (fatia seguinte), fora deste diff.
