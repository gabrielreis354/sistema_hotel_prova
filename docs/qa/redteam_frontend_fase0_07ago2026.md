# QA Red Team — Frontend Fase 0 (fundação do monorepo)
**Branch:** feature/frontend-fase0-fundacao · **Base:** develop@3f00ea1 · **Data:** 07/08/2026
**Arquivos auditados:** 60 (diff inteiro) · **Achados:** 6 (🔴 0 · 🟡 4 · 🟢 2)

## Veredito
APROVADO COM RESSALVAS

Nenhum achado 🔴. A entrega cumpre os critérios de aceite do plano §11 e da COORDENACAO_AGENTES.md §7:
fronteira respeitada (nada fora de `frontend/`), raiz intacta, domínio testado (27/27 verdes),
dinheiro em centavos inteiros sem `Number()` direto, datas ancoradas em `America/Sao_Paulo`,
allowlist nas máquinas de estado, login tipado com contrato batendo com o backend, e proxy do
Vite mesma-origem. As ressalvas são dívidas de robustez/UX, não bloqueiam a fase.

## Achados

### 🟡 [SOLID/robustez] Sessão inválida não é derrubada em 401 — comentário promete o que o código não faz
**Onde:** `frontend/apps/pms/src/stores/auth.ts:14-15` (comentário) · `frontend/apps/pms/src/lib/api.ts` · `frontend/apps/pms/src/lib/queryClient.ts`
**Cenário:** o comentário do store afirma "se o token expirar, a próxima request volta 401 e a
UI derruba a sessão". Não existe middleware `onResponse` no `createApiClient` nem `onError` global
no QueryClient que chame `logout()` em 401. Token expirado (expiração de 8h no backend,
`LoginController.js:51`) → usuário fica preso numa sessão morta: `ProtectedRoute`/`RequireRole`
só checam presença de token, não validade, então ele vê a casca autenticada e cada request falha
em silêncio sem redirecionar para `/login`.
**Regra violada:** KISS/consistência (comentário mente sobre o comportamento) — e UX §10
(estado de erro sem saída). Não é 🔴 porque na Fase 0 não há telas reais fazendo requests além do login.
**Correção sugerida:** adicionar um `client.use({ onResponse })` no api-client (ou `QueryCache.onError`)
que, em 401, chame `useAuthStore.getState().logout()`. Enquanto não existir, remover a frase do comentário para não induzir a erro.

### 🟡 [KISS/produção] baseUrl de produção não resolvido — `/api` só funciona com o proxy do Vite (dev)
**Onde:** `frontend/packages/api-client/src/index.ts:19` · `frontend/apps/pms/src/lib/api.ts:9-11`
**Cenário:** `createApiClient` usa `baseUrl` default `/api`, reescrito pelo proxy do Vite apenas em
`vite dev`. Em `vite build` (produção) não há proxy: `/api/...` bate na origem do bundle estático,
onde o backend monta as rotas **na raiz** (o próprio proxy faz `rewrite: path.replace(/^\/api/, '')`).
Sem um `import.meta.env.VITE_API_URL` (ou um rewrite equivalente no nginx de produção), o build
quebra em produção. O comentário do api-client reconhece isso ("Em produção, aponte para a origem
real"), mas o app-pms não passa `baseUrl` nenhum.
**Regra violada:** aderência ao plano (§4 do briefing pede proxy de dev; produção fica sem contrato).
Não é 🔴 porque a Fase 0 é dev-only e não há deploy do frontend ainda.
**Correção sugerida:** ler `import.meta.env.VITE_API_URL` em `api.ts` com fallback `/api`, e
documentar que o nginx de produção precisa do mesmo strip de `/api`.

### 🟡 [Testes] `formatDateTimeBR`, `todayISO` e `centsToDecimalString` negativo/`multiplyCents` string sem cobertura
**Onde:** `frontend/packages/domain/src/dates.ts:31-34,52-54` · `frontend/packages/domain/src/money.ts:47-51`
**Cenário:** `formatDateTimeBR` usa `new Date(value)` (parse de timestamp completo, caminho
diferente de `parseHotelDate`) e não tem teste — é justamente o formatador de "consumo lançado às
14:32", ponto sensível a fuso. `multiplyCents` com `quantity` string e `centsToDecimalString` de
valor negativo também não têm teste. Regra de negócio de fuso sem teste é a que escorrega em produção.
**Regra violada:** cobertura de caminho — o suite exercita bem o núcleo mas deixa formatadores de
data/hora e ramos negativos sem rede.
**Correção sugerida:** acrescentar casos para `formatDateTimeBR('2026-07-01T23:30:00Z')`,
`multiplyCents(1000, '2.5')` e `centsToDecimalString(-1234)`.

### 🟡 [KISS/UX] Login sem estado de erro de rede distinto e sem `aria-invalid`/foco no primeiro erro
**Onde:** `frontend/apps/pms/src/features/auth/LoginPage.tsx:41-48,63-79`
**Cenário:** qualquer falha que não seja `LoginError` cai em "Não foi possível entrar. Tente
novamente." — não distingue backend fora do ar de erro genérico, e o `serverError` (role="alert")
existe, mas os inputs não recebem `aria-invalid` nem foco programático quando há erro de validação,
o que prejudica leitor de tela. Não é 🔴 (é acessível o suficiente para passar, tem `role="alert"`
e `noValidate` com mensagens), mas fica abaixo do §10.
**Correção sugerida:** `aria-invalid={!!errors.campo}` nos inputs e foco no primeiro campo inválido.

### 🟢 [DRY/design system] StatusBadge cobre só status de QUARTO; reserva ficou de fora
**Onde:** `frontend/packages/ui/src/StatusBadge.tsx:22` · `frontend/packages/domain/src/state-machines.ts:72-78`
**Cenário:** o domínio já exporta `RESERVATION_STATUS_LABEL`, mas o `StatusBadge` só aceita
`RoomStatus`. Quando a Fase 1 renderizar status de reserva, ou se cria um segundo badge (viola DRY)
ou se generaliza este. Nota, não ressalva: a Fase 0 não tem tela de reserva ainda.
**Correção sugerida:** na Fase 1, parametrizar o badge por um mapa `{label, token}` genérico.

### 🟢 [nota] `formatBRL` usa `cents / 100` — float na borda de exibição (aceitável)
**Onde:** `frontend/packages/domain/src/money.ts:59-63`
**Cenário:** a formatação final divide por 100 em float antes de entregar ao `Intl`. É a borda de
exibição (o próprio módulo diz "só na borda"), e `Intl` arredonda para 2 casas, então não há erro
observável para valores realistas. Registrado só para deixar explícito que a única operação float
do módulo está isolada no formatador, não na aritmética — que é o correto.

## O que foi verificado e está correto
- **Fronteira J3 (crítico):** `git diff develop...HEAD --name-only` não retorna nada fora de
  `frontend/`. `app/`, `routes/`, `database/`, `db/`, `seed/`, `tests/` intocados.
- **Raiz não virou workspace:** sem `pnpm-workspace.yaml`/`turbo.json` na raiz; `package.json` da
  raiz (`sistema-gestao-hotel-backend`, npm) não aparece no diff. Isolamento em `frontend/.npmrc`.
- **Dinheiro em centavos:** `decimalToCents` parseia a STRING do pg via regex + inteiros, sem
  `Number()` sobre o valor com casas; `sumCents`/`multiplyCents` em inteiro; teste explícito de
  0.10+0.20 e de rejeição de `12,34`/`Infinity`.
- **Datas em America/Sao_Paulo:** `parseHotelDate` via `fromZonedTime`, `HOTEL_TZ` fixo, teste
  "2026-07-01 nunca vira 30/06", `nightsBetween` e virada de mês.
- **Máquinas de estado allowlist (fail-safe):** transições não listadas retornam false; espelham
  CLAUDE.md §3; só PENDING/CONFIRMED cancelam.
- **Cor + rótulo (acessibilidade §10):** `StatusBadge` sempre renderiza `meta.label` junto do ponto
  colorido, com `aria-hidden` no ponto. Preset documenta que cor nunca é o único sinal.
- **Alvo de toque 48px:** `min-h-touch`/`min-w-touch`=48px no preset; `Button` comfortable usa
  `min-h-touch`; bottom-tabs mobile usam `min-h-touch`.
- **Roteamento por papel:** `RequireRole` + `nav.ts` fonte única; WAITER só `/comanda`, ADMIN tudo,
  `homeForRole` manda garçom direto pra comanda. Papéis batem com o CHECK do backend
  (`db/schema.sql:49`: ADMIN/RECEPTIONIST/WAITER).
- **Contrato de login:** `LoginResult` (`token` + `user{id,name,email,role}`) idêntico ao retorno do
  `LoginController.js:54-56`. 409 tratado (e-mail em múltiplos hotéis) conforme Swagger.
- **Multi-tenancy/LGPD:** nenhum `console.*` no frontend (grep vazio) → sem log de token/PII;
  `tenant_id` nunca vem do cliente (o `subdomain` é campo documentado do body, resolução é
  server-side); token injetado via `Authorization: Bearer` por middleware, não em URL/query string.
- **ESM/secrets:** nenhum `require()` em `frontend/`; `.env*` no `.gitignore`; nenhum `.env`/secret
  no diff. Commits Conventional.
- **API client gerado do OpenAPI real:** `dump-openapi.mjs` importa `config/swagger.js` da raiz;
  `openapi.json`/`schema.d.ts` contêm as rotas reais do backend.
- **Testes rodam:** `pnpm --filter @hotel/domain test` → 3 arquivos, 27 testes, todos verdes.

## Não foi possível verificar
- **Build de produção e typecheck** (`turbo run build`/`typecheck`): não executados — exigiriam
  install completo do workspace; a auditoria foi por leitura + execução isolada do pacote domain.
- **Comportamento real do proxy contra o backend em :3000:** não subi o backend; validei só a
  configuração do Vite e o rewrite.
- **Contraste AA das cores de status/brand:** valores hex lidos, mas não medi contraste par a par
  contra os fundos reais de cada componente.
