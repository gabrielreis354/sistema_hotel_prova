# QA Red Team — vite-proxy-analytics (🔴-1 do ensaio de 14/11)
**Branch:** fix/vite-proxy-analytics · **Dev:** Gabriel · **Base:** develop@9a3727c · **Data:** 14/11/2026
**Commits auditados:** `8efe1bd` test(pms): RED do proxy do Vite · `11e556e` fix(pms): proxy do Vite leva /api/analytics ao nginx
**Arquivos auditados:** 5 (`frontend/apps/pms/src/devProxy.ts`, `devProxy.test.ts`, `vite.config.ts`, `README.md`, `frontend/README.md`). Para validar cenários também li: o Vite 5.4.21 instalado (`frontend/node_modules/.pnpm/vite@5.4.21/.../dist/node/chunks/dep-BK3b2jBa.js`: `loadEnv`, `resolveConfig`, `proxyMiddleware`), `docker/nginx/default.conf`, `docker-compose.yml`, `.env.example`, `services/core-service/routes/apis/analyticsRouter.js`, `frontend/apps/pms/{vitest.config.ts,tsconfig.json,package.json}`, `frontend/turbo.json` e os consumidores de `/analytics/*` no `app-pms`.
**Achados no escopo:** 4 (🔴 0 · 🟡 2 · 🟢 2) · **Repassados:** 0

## Veredito
**APROVADO COM RESSALVAS**

A correção resolve o 🔴-1. A ordem das regras é garantida pelo Vite (detalhe abaixo), e nenhum segredo do `.env` da raiz chega ao `import.meta.env`. Ficam duas ressalvas 🟡. A primeira: o `loadEnv` do `.env` da raiz tem um efeito colateral que **provei executando o código**. Ele lê o `NODE_ENV=production` da raiz e com isso faz o Vite emitir um aviso falso a cada `dev`, além de expor `VITE_USER_NODE_ENV` ao cliente. A segunda: o caminho `'../../..'` é resolvido a partir do cwd, não da pasta do config, e quando erra cai em silêncio nas portas padrão.

## Achados no escopo

### 🟡 [config] `loadEnv` no `.env` da raiz injeta `VITE_USER_NODE_ENV=production` no processo: aviso falso a cada `dev` e chave nova no `import.meta.env`
**Onde:** `frontend/apps/pms/vite.config.ts:14`, combinado com `.env.example:7` (`NODE_ENV=production`) e com o Vite 5.4.21 `dep-BK3b2jBa.js:34911-34913` e `:66486-66495`
**Cenário:** o `.env` da raiz é o do compose e traz `NODE_ENV=production` (vem assim do `.env.example`). O `loadEnv` do Vite tem um efeito colateral fora do filtro de prefixo: `if (parsed.NODE_ENV && process.env.VITE_USER_NODE_ENV === void 0) process.env.VITE_USER_NODE_ENV = parsed.NODE_ENV`. Como o config é avaliado **antes** do `loadEnv` interno do Vite (`resolveConfig`, linhas 66416 → 66486), a variável já está no processo quando o Vite a lê. Rodei `resolveConfig({}, 'serve', 'development')` dentro de `apps/pms` nesta worktree e obtive:
```
NODE_ENV=production is not supported in the .env file. Only NODE_ENV=development is supported ...
env keys [ 'VITE_USER_NODE_ENV', 'BASE_URL', 'MODE', 'DEV', 'PROD' ]
VITE_USER_NODE_ENV production NODE_ENV development
```
Na `develop`, o `apps/pms` não tem `.env` e esse aviso não aparece. Consequências: (a) todo `pnpm --filter app-pms dev` e todo `vite build` imprimem um aviso que fala de um `.env` que o dev do frontend nem sabe que está sendo lido. Na demonstração, a mensagem parece um problema de configuração. (b) `VITE_USER_NODE_ENV` entra no `config.env` e fica visível em `import.meta.env`, porque o laço de `process.env` do `loadEnv` interno casa o prefixo `VITE_`. O valor é `production`, sem segredo, então não é vazamento. Mas o filtro de prefixo não basta para isolar o `.env` da raiz, e qualquer `BROWSER`/`BROWSER_ARGS` que alguém puser lá também passa a valer no `process.env` (linhas 34914-34919).
**O que NÃO acontece (verificado):** nenhum segredo vaza. O `loadEnv` só **devolve** chaves com os prefixos `NGINX_PORT`/`BACKEND_HOST_PORT`, e o `expand` roda sobre uma cópia (`processEnv = { ...process.env }`, linha 34920), sem gravar `PIX_WEBHOOK_SECRET`, `POSTGRES_PASSWORD` etc. no `process.env`. O `envPrefix` do cliente continua `VITE_` e o `envDir` do cliente continua `apps/pms`. O `NODE_ENV` efetivo segue `development` no dev.
**Regra violada:** Fail Fast / menor surpresa. O efeito colateral não foi pretendido e o comentário do `vite.config.ts` não o menciona.
**Correção sugerida:** não usar o `loadEnv` do Vite para um arquivo de outro dono. Ler só as duas chaves com `dotenv.parse(fs.readFileSync(<raiz>/.env))`, já que o `dotenv` vem com o Vite, e cair no padrão se o arquivo não existir. Outra saída é salvar e restaurar `process.env.VITE_USER_NODE_ENV` em volta da chamada, mas fica mais frágil. Vale um teste que confirme a ausência de `VITE_USER_NODE_ENV` no `config.env` resolvido.

### 🟡 [config] `REPO_ROOT = '../../..'` é relativo ao **cwd**, não à pasta do config, e quando erra cai em silêncio nas portas padrão
**Onde:** `frontend/apps/pms/vite.config.ts:9` e `:14`. O comentário da linha 7-8 diz "Caminho relativo a esta pasta", o que não é verdade.
**Cenário:** o `getEnvFilesForMode` faz `path.join(envDir, '.env')` (Vite `:34884-34894`) e o `readFileSync` resolve esse caminho contra o `process.cwd()`. Rodei o mesmo config a partir de `frontend/` (`resolveConfig({ configFile: 'apps/pms/vite.config.ts', root: 'apps/pms' })`). O `.env` da raiz diz `NGINX_PORT=8088` e o proxy saiu `"/api/analytics":"http://localhost:80"`. O Vite procurou `/home/gabri/.env`, não achou e não avisou. Em quem mudou a porta do nginx, o painel do gerente volta ao 404/500 do 🔴-1, e nada indica a causa. `pnpm --filter app-pms dev`, `turbo run dev` (`frontend/package.json:11`) e `pnpm -r dev` rodam o script na pasta do pacote, então os caminhos documentados funcionam. Quebram `vite --config apps/pms/vite.config.ts`, `npx vite apps/pms`, depuradores de IDE que iniciam na raiz e qualquer script futuro que não faça `cd`.
**Regra violada:** Fail Fast. A falha é silenciosa e o comentário engana quem for manter o código.
**Correção sugerida:** ancorar no arquivo com `const REPO_ROOT = fileURLToPath(new URL('../../..', import.meta.url));`. O config do Vite é empacotado com `import.meta.url` apontando para o arquivo original. De quebra, avisar com `console.warn` quando `<REPO_ROOT>/.env` não existir.

### 🟢 [testes] A ligação `vite.config.ts` → `loadEnv` → `devProxy` não tem teste
**Onde:** `frontend/apps/pms/src/devProxy.test.ts:1-37`
**Cenário:** os 5 testes cobrem bem a função pura: chaves, ordem, alvos, `rewrite` e porta inválida. O que provocou o 🔴-1 foi a configuração montada, e essa parte segue sem teste. Se alguém trocar `REPO_ROOT`, a lista de prefixos ou o `mode`, ou parar de chamar `devProxy` no config, os 5 testes continuam verdes. Os dois 🟡 acima também passariam pela suíte. A ordem também só é testada no objeto devolvido (`Object.keys`). Isso basta porque o Vite percorre o objeto com `for...in` e usa a primeira regra que casa (`dep-BK3b2jBa.js:61839-61858`), e a ordem de inserção de chaves string não numéricas é garantida pelo ECMAScript. Mas a suíte não registra essa dependência.
**Correção sugerida:** um teste que chama `resolveConfig({ root: <apps/pms> }, 'serve')` com um `.env` temporário e confere `config.server.proxy`, as portas lidas e a ausência de `VITE_USER_NODE_ENV` em `config.env`.

### 🟢 [docs] `frontend/README.md` ainda manda subir "só o core" para integrar de verdade
**Onde:** `frontend/README.md:57` ("Suba o backend (`node services/core-service/_web.js` na raiz, com Postgres no ar) para integrar de verdade.")
**Cenário:** com o core sozinho, `/api/analytics/*` agora vai para `localhost:80`, onde não há nada. O Vite responde **500** `text/plain`, porque o `proxy.on('error')` faz `writeHead(500)` (`dep-BK3b2jBa.js:61777-61782`). Antes era 404 do core, já que as rotas de indicadores saíram do core na H.3 (`analyticsRouter.js:8-9`). **Nenhuma funcionalidade se perdeu:** o único caminho que o core ainda serve, `/analytics/internal-consumption`, não é usado pelo `app-pms` (grep em `frontend/apps/pms/src`) e, com compose, continua chegando ao core pelo `location =` exato do nginx (`docker/nginx/default.conf:100-108`). Mas a frase do README leva o dev a um ambiente onde painel do gerente e alertas do Hoje falham, agora com 500.
**Correção sugerida:** completar a frase: "indicadores e alertas exigem o nginx e o analytics-service do compose".

## Repassados a outro dev
nenhum

## O que foi verificado e está correto
- **Ordem das regras:** é garantida. O `proxyMiddleware` do Vite 5.4.21 monta `proxies` na ordem de `Object.keys(options)` e o `viteProxyMiddleware` usa a primeira regra que casa, com `for...in` e `return` (`:61839-61858`). O casamento é `url.startsWith(context)` (`:61866-61868`). Resolvi o config de verdade e obtive `{"/api/analytics":…,"/api":…}` nessa ordem. O `mergeConfig` não reordena.
- **Prefixo `startsWith`:** `/api/analytics-foo` ou `/api/analyticsX` também iriam ao nginx. O `location /analytics/` exige a barra, então esses caminhos caem no `location /` e vão ao core, mesmo destino de antes. Sem efeito.
- **Segredos:** o retorno do `loadEnv` só tem as chaves com os dois prefixos. O `expand` opera numa cópia do `process.env`. O cliente continua com `envDir = apps/pms` e `envPrefix = VITE_`. Pela resolução real, as chaves do `config.env` são só `VITE_USER_NODE_ENV`, `BASE_URL`, `MODE`, `DEV` e `PROD`.
- **nginx:** o `limit_req` só vale em `/auth/login` (`default.conf:45-56`), que vai pela regra `/api` direto ao core e nem passa pelo nginx. Esse comportamento é igual ao de antes. Não há CORS no nginx, no core nem no analytics-service (grep por `cors(`). Os pedidos do proxy são de mesma origem e o `changeOrigin` só troca o `Host`. O `Authorization` passa intacto pelo http-proxy.
- **`internal-consumption`:** com compose, o `location = /analytics/internal-consumption` devolve o pedido ao core e a query string chega intacta.
- **Turbo / `pnpm -r`:** os dois rodam o script `dev` na pasta do pacote, e com isso o `'../../..'` resolve certo nos caminhos documentados.
- **Portas:** `NGINX_PORT` e `BACKEND_HOST_PORT` batem com `docker-compose.yml:127` e `:251`, e os padrões 80/3000 também. A validação de `port()` rejeita `abc`, vazio, 0 e valores acima de 65535.
- **ESM / TS:** não há `require()`. O `devProxy.ts` está em `src/`, mas nenhum módulo do app o importa, então não vai ao bundle do cliente. O `vite.config.ts` está no `include` do `tsconfig.json`.

## Não foi possível verificar
- Não rodei o `dev` do Vite com navegador nem os 7 passos do roteiro. Usei a verificação do autor e reproduzi a resolução do config com `resolveConfig`.
- Não avaliei se o `import.meta.env.VITE_USER_NODE_ENV` acaba inlinado no `dist/` do build. Isso depende de algum módulo referenciar `import.meta.env` inteiro, e não procurei.

## Desfecho (Gabriel, orquestrando Claude Code — 14/11)

| Achado | Desfecho |
|---|---|
| 🟡-1 `loadEnv` punha `VITE_USER_NODE_ENV` no processo | ✅ O `loadEnv` saiu. O `readComposePorts` (`src/devProxy.ts`, com teste) lê só `NGINX_PORT` e `BACKEND_HOST_PORT`. Reproduzido com `resolveConfig` e um `.env` com `NODE_ENV=production` e um segredo: nada no processo, nada no `import.meta.env`, e o `build` não mostra mais o aviso |
| 🟡-2 Caminho relativo ao cwd | ✅ `COMPOSE_ENV_FILE` sai de `import.meta.url`, com aviso no `dev` quando o `.env` não existe. Reproduzido chamando o Vite de `apps/pms` e de `frontend/` com `--config`: o alvo é `localhost:8088` nos dois |
| 🟢-1 Ligação do config sem teste | ✅ `vite.config.test.ts` cobre o caminho do `.env` com outro cwd e a variável de ambiente vencendo o arquivo. Para os tipos do Node não vazarem ao código do navegador, entrou `tsconfig.node.json` só para os arquivos de ferramenta, no padrão dos templates do Vite, com `@types/node` como devDependency |
| 🟢-2 `frontend/README.md` | ✅ Diz que os indicadores pedem o compose (nginx e analytics) |

Verificação depois das correções: PMS com 307 testes, typecheck dos dois tsconfigs, build. Os 7 passos do roteiro no compose limpo, com a config do repositório: 7 de 7.
