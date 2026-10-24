# Retomada — T-05.1 quartos e categorias (feature/t051-quartos-categorias)

**Atualizado:** 24/10/2026 · **Por:** agente executor (trilha do Gabriel)
**Worktree:** /home/gabri/wt-t051 · **Portas:** PG 5444 · backend 3051 · Vite 5181 (todas desligadas agora)
**Containers:** nenhum ativo. Para subir de novo, ver "Comandos úteis".

## Objetivo
Entregar a T-05.1 da SPEC-05 (CA-05.1.a–f): telas de quartos e categorias no `apps/pms`, precedidas da regeneração do `api-client`. Contrato: delegação do Gabriel de 21/10 — **sem PR e sem merge**; o Gabriel roda o qa-redteam e abre o PR.

## Onde estou
- Último commit de código: `32bfb4f fix(rooms): motivo do status indisponivel ligado ao botao` (com push). Este arquivo, a SPEC e o relatório entram no commit `docs(t051)` que vem logo depois.
- Passo atual: correções do qa-redteam (3 🟡 e os 🟢 baratos) **concluídas e verificadas no navegador**.
- Próximo passo: **nenhum de código.** Esperar o Gabriel. Ele pode reauditar e abrir o PR `develop`. Se pedir mais ajuste, ler `docs/qa/redteam_t051-quartos-categorias_21out2026.md` e o relatório da sessão.

## Feito
- [x] api-client regenerado (40 → 46 paths) — `0a0b9b4`
- [x] `@hotel/domain`: `parseBRLInput`, `centsToBRLInput`, `StatusTone` — `6e2bf90`
- [x] `StatusBadge` generalizado (`tone` + `label`) — `cc330f3`
- [x] api, queries e regras puras com testes — `680ee3c`
- [x] telas e componentes locais — `9e17448`
- [x] rotas `/quartos` e `/quartos/categorias` + item de menu — `40f8cc2`
- [x] lista atualizada na volta e campos com 48 px — `44d16a3`
- [x] revisão Impeccable e qa_checks sem regressão — `596c6e4`
- [x] SPEC-05, CATALOGO e relatório — `9d699ce`
- [x] qa-redteam recebido (aprovado com ressalvas) — `6c9a6a5`
- [x] 🟡-2: `requestBody` dos três PUTs no Swagger e `as never` removidos — `75395a0`
- [x] 🟡-1 (PUT só com o que mudou), 🟡-3 (exclusão confia no 409), 🟢-1, parte do 🟢-3 — `22f47b2`
- [x] 🟢-3: motivo do status ligado por `aria-describedby` — `32bfb4f`
- [x] Verificação: typecheck, build, testes (37 + 31), qa_checks idêntico a develop, navegador (corpos de PUT capturados)

## Falta
- [ ] (Gabriel) reauditar e abrir o PR
- [ ] (outra frente) 409 de categoria em uso no backend — `fix/tenant-fk-validation`

## Decisões tomadas nesta frente
- 21/10 — Categorias como aba em `/quartos/categorias`, e não em `/config/...`: a recepção consulta, e a barra do celular não ganha mais uma aba (executor)
- 21/10 — Status no formulário segue a máquina de estados: Ocupado e Limpeza ficam desabilitados com motivo (executor)
- 21/10 — Componentes nascem locais em `features/rooms/components/` (regra de promoção do CATALOGO)
- 24/10 — PUT de quarto parcial (`changedRoomFields`) (qa-redteam 🟡-1)
- 24/10 — Swagger: `requestBody` nos três PUTs, editando só esses trechos (autorizado pelo coordenador)
- 24/10 — Sem trava "categoria em uso" no cliente; quem recusa é o backend com 409 (coordenador, 🟡-3)

## Bloqueios e perguntas abertas
- Até `fix/tenant-fk-validation` entrar, o backend ainda aceita excluir categoria em uso (204).
- Repasses do redteam para a Sirlande (R-1 a R-6) e para o Gabriel (R-8) estão fora desta frente.

## Comandos úteis desta frente
Rodar via `MSYS_NO_PATHCONV=1 wsl bash <script>`. No Git Bash, `$VAR` dentro de `wsl bash -c` é expandido pelo Windows, então escreva o script em arquivo.

```bash
source ~/.nvm/nvm.sh && nvm use 24
# verificação
cd /home/gabri/wt-t051/frontend && pnpm typecheck --force && pnpm build --force && pnpm turbo run test --force
cd /home/gabri/wt-t051 && bash scripts/qa_checks.sh
# regenerar o cliente (só lê o swagger.js; precisa de services/core-service/node_modules)
cd /home/gabri/wt-t051/frontend && pnpm gen:api
# ambiente de teste (nunca 5432/3000)
docker run --rm -d --name pg-t051 -e POSTGRES_USER=hotel_user -e POSTGRES_PASSWORD=hotel_password -e POSTGRES_DB=gestao_hotel -p 5444:5432 postgres:17
cd services/core-service
sed -e 's/^NODE_WEB_PORT=.*/NODE_WEB_PORT=3051/' -e 's/^POSTGRES_PORT=.*/POSTGRES_PORT=5444/' -e 's/^REDIS_URL=.*/REDIS_URL=/' .env.example > .env
node scripts/gerar_chaves_jwt.js && node command.js migrate && ALLOW_SEED=1 node command.js seed
# backend + Vite precisam de um processo que fique vivo (o wsl bash mata filhos ao sair):
# script com "node _web.js & npx vite --config vite.t051.config.ts & wait" rodado em background.
# vite.t051.config.ts é temporário (proxy -> :3051, porta 5181), NÃO versionar.
# Ao final: parar processos, docker stop pg-t051, apagar .env, keys/ e o config temporário.
```
