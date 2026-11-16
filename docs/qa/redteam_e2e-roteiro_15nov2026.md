# QA Red Team — e2e-roteiro (Playwright, 7 passos da banca)
**Branch:** feature/e2e-roteiro · **Dev:** Gabriel (agente de implementação) · **Base:** develop@27cf7ad · **Data:** 15/11/2026
**Arquivos auditados:** 13 (9 novos em `frontend/e2e/`, 4 alterados)
**Achados no escopo:** 9 (🔴 0 · 🟡 5 · 🟢 4) · **Repassados:** 0

## Veredito
**APROVADO COM RESSALVAS**

Nenhum achado 🔴: o diff é só teste e tooling, não grava segredo, não mexe em código de produto e não toca dado de outro tenant. Mas dois passos **não provam o que o título promete** (3 "sem rede" e 5 "pagamento"). Do jeito que está, o roteiro fica verde mesmo com a fila offline duplicando item ou com o pagamento recusado. Os 🟡-1 e 🟡-2 deviam ser corrigidos antes de alguém tratar o job como prova do roteiro.

Verificação executada (sem compose, como combinado): `pnpm -r typecheck` verde nos 5 pacotes, incluindo `e2e`. `pnpm -r test` verde (domain 49/49, pms 334/334) e não roda o e2e. O pacote não tem script `test`, e o `turbo run test --dry` lista `@hotel/e2e#test` sem comando.

## Achados no escopo

### 🟡-1 [Testes] Passo 3: o trecho "sem rede" nunca fica sem rede na hora do envio, e `>= 2` aceita duplicação
**Onde:** `frontend/e2e/tests/roteiro.spec.ts:103-109` e `:119`. A regra fica em `frontend/apps/pms/src/features/accounts/queueCore.ts:19,64-80,104-110`.
**Cenário:** toque 1 em t=0 → `undo` até t=5s. Às 1,5s o contexto fica offline e o toque 2 (t≈1,5s) **soma na mesma linha** e renova `undoUntil` para cerca de 6,5s. A rede volta em t≈2,5s (800 ms mais o screenshot). Pelo `readyToSend`, o envio só sai depois de `undoUntil`, com a rede já de volta. Assim o caminho offline (falha de envio → `queued` → reenvio no evento `online` com o mesmo `client_item_id`) **nunca é exercitado**. Além disso, `toBeGreaterThanOrEqual(2)` aprova 3 ou 4 unidades, e duplicação é justamente a falha que a fila offline existe para impedir. Nesse caso o hóspede pagaria em dobro e o teste ficaria verde.
**Regra violada:** "o roteiro prova o que o passo diz" (critério de aceite). Também o checklist §7, idempotência via `client_item_id`.
**Correção sugerida:** o produto e a conta são novos a cada rodada, então use `toBe(2)`. Para provar o offline, fique sem rede **depois** que a janela de desfazer vencer (toque → offline → espere `undoUntil` passar ou poll até a UI mostrar "aguardando rede" → online) e confira que chega exatamente 1 unidade dessa entrada.

### 🟡-2 [Testes] Passo 5: `/registrad/i` casa com a mensagem de falha, e o check-out não exige saldo zero
**Onde:** `frontend/e2e/tests/roteiro.spec.ts:150` e `:156-158`.
**Cenário:** o registro do pagamento falha e a tela mostra "Sem conexão: o pagamento não foi registrado." (`apps/pms/src/features/reservations/reservationsApi.ts:172`) ou "…Nada foi registrado." (`paymentLogic.ts:120-134`). A regex `/registrad/i` casa e o teste segue. O backend aceita check-out com saldo em aberto (`services/core-service/app/Controllers/ReservationApi/CheckOutController.js:28` só confere o status), então a reserva vai a CHECKED_OUT, o quarto vai a CLEANING e o passo 5 passa **sem nenhum pagamento gravado**. O passo diz "o pagamento é registrado, e a conta e a estadia fecham", e nenhuma das duas coisas é conferida.
**Regra violada:** critério "o roteiro prova o que o passo diz". Passo 5 do plano (`docs/PLANO_FECHAMENTO_MVP_15NOV2026.md` §3).
**Correção sugerida:** esperar o texto de sucesso exato (`/Pagamento de R\$ .* registrado\./`, de `PaymentForm.tsx:134`). Depois do check-out, conferir pela API o pagamento gravado com valor igual ao total (400,00 + consumo) e a conta da suíte com status `CLOSED`/saldo 0.

### 🟡-3 [Testes] Passo 5 depende da collation do Postgres alpine para o produto ser "Caipirinha"
**Onde:** `frontend/e2e/tests/roteiro.spec.ts:102` (clica no primeiro produto com `R$`) e `:147` (exige "Caipirinha").
**Cenário:** o cardápio vem de `ListProductController.js:31` com `order: [['category','ASC'],['name','ASC']]`. Entre os DRINK do seed (`seed_consumo.sql:54-58`) estão "Água mineral 500ml" e "Caipirinha". No `postgres:17-alpine` (`docker-compose.yml:19`) a musl ordena por byte, "Á" (0xC3) cai no fim e Caipirinha vem primeiro. Num Postgres com collation glibc/ICU (imagem Debian, gerenciado, futuro manifest K8s), "Água mineral" vem primeiro, o passo 3 lança Água e o passo 5 falha por um motivo que nada tem a ver com regressão. Qualquer produto novo do seed com nome antes de "C" também quebra.
**Regra violada:** seletor frágil, acoplado à ordem do seed.
**Correção sugerida:** no passo 3, clicar pelo nome (`menu.getByRole('button', { name: /Caipirinha/ })`), ou guardar o nome clicado e usá-lo no passo 5.

### 🟡-4 [Testes] Passo 3 (mesa) e passo 7 sem asserção do resultado
**Onde:** `frontend/e2e/tests/roteiro.spec.ts:121-129` e `:204-213`.
**Cenário (mesa):** abre a conta, toca um produto, espera 1,5s fixos e tira o screenshot. Se a criação da conta ou o lançamento falhar, o teste passa, e a metade "numa mesa" do passo 3 não é provada. Os 1,5s também ficam abaixo dos 5s de `UNDO_MS`, então o item nem chegou a ser enviado quando o passo termina.
**Cenário (passo 7):** 9s de espera fixa (5s "para o outbox" + 4s). Só se confere que alguma chamada `/api/analytics/` voltou 2xx. Nada usa os eventos dos passos 1 a 6, então a espera do outbox não serve para nada e o passo passa com o analytics vazio ou atrasado. É aceitável como "a tela abre e o serviço responde", mas o comentário da linha 204 promete mais.
**Regra violada:** asserção fraca e espera fixa (flakiness/tempo).
**Correção sugerida:** mesa → `expect.poll` pela API até a conta `Mesa ${tag}` ter 1 item. Passo 7 → trocar os `waitForTimeout` por espera da resposta (`page.waitForResponse` de `/api/analytics/`). Ou conferir um número que os passos anteriores alteram, ou tirar o comentário do outbox.

### 🟡-5 [Testes/Operação] Cada rodada deixa lixo no tenant de demonstração, e o README não manda derrubar o ambiente
**Onde:** `frontend/e2e/tests/roteiro.spec.ts:11-14,123-127,174-180` e `frontend/e2e/README.md:9-19`.
**Cenário:** cada rodada cria no Hotel Aurora uma categoria, um quarto (fica em CLEANING), um hóspede, uma reserva encerrada, uma reserva CONFIRMED daqui a 10 dias e uma **conta de mesa que fica OPEN para sempre**. Rodando no mesmo ambiente (o README diz que "pode rodar de novo no mesmo ambiente"), a lista "Contas abertas" do garçom, o rack de quartos e o site público vão acumulando "Ensaio NNNNNN". Basta alguém apontar `E2E_API_URL` para o compose em que vai apresentar (é o mesmo tenant Aurora) e a banca vê esse lixo. O README não traz o `docker compose -p gesway-ensaio down -v` que a regra do time exige no fim.
**Regra violada:** restrição do time ("compose de teste sempre `gesway-ensaio` com `down -v` no fim").
**Correção sugerida:** acrescentar ao README a seção "Depois de rodar" com `down -v` e um aviso para nunca apontar para o ambiente da apresentação. Opcional: fechar a conta da mesa no fim do passo 3.

### 🟢-1 [Testes] Passo 6 falha com `ENOENT`/"service not running" em vez de pular quando o docker não alcança o projeto
**Onde:** `frontend/e2e/src/helpers.ts:33-34` e `tests/roteiro.spec.ts:164`.
**Cenário:** API no ar em :8088, mas o compose subiu com outro `COMPOSE_PROJECT_NAME` (ou o `pnpm e2e` roda num host sem o CLI do docker, como no Windows com o compose no WSL). O `execFileSync` lança e o passo 6 reprova com um stack trace, não com o `skip` explicativo. O globalSetup também não confere se o projeto `-p` corresponde ao nginx de `E2E_API_URL`.
**Correção sugerida:** envolver o `printenv` em try/catch e fazer `test.skip` (ou falhar) com a mensagem "projeto compose X não encontrado; defina COMPOSE_PROJECT_NAME".

### 🟢-2 [Testes] Comentário falso e `catch` silencioso no check-out
**Onde:** `frontend/e2e/tests/roteiro.spec.ts:153-154`.
**Cenário:** o comentário diz que a confirmação "aparece conforme o saldo", mas `ReservationDetailPage.tsx:105-109` (`openCheckOut`) **sempre** abre a confirmação. O `.catch(() => {})` com 5s esconde a causa real quando o botão não aparece: a falha ressurge na linha 155 como "check-out feito não visível", sem o porquê.
**Correção sugerida:** clicar sem `catch` e corrigir o comentário.

### 🟢-3 [Testes] Passo 4: heurística de erro por regex e espera fixa
**Onde:** `frontend/e2e/tests/roteiro.spec.ts:136-139`.
**Cenário:** `/erro[^\n]{0,80}/i` casa com qualquer palavra que contenha "erro" ("Ferro", "Serrote", um nome de hóspede), o que gera falso vermelho. Uma mensagem de falha sem "erro"/"não foi possível"/"não carreg" passa batido. Há também 2s de `waitForTimeout`.
**Correção sugerida:** procurar `role="alert"` ou o componente `ErrorState`, e esperar as seções do painel (chegadas/saídas) visíveis em vez do tempo fixo.

### 🟢-4 [Segurança/LGPD leve] Trace e relatório guardam JWT e senha do seed
**Onde:** `frontend/e2e/playwright.config.ts:18,24` e `src/helpers.ts:14`.
**Cenário:** `trace: 'retain-on-failure'` grava a rede: o POST `/auth/login` com `senha123`, o `Authorization: Bearer` dos 3 usuários e o localStorage. Os traces ficam ignorados pelo git (`e2e/.gitignore`), mas quando o job do CI do Weslley publicar `playwright-report/` como artefato, quem tiver acesso ao artefato leva JWT válido (enquanto não expirar) do ambiente do CI. Se alguém definir `E2E_PASSWORD` real contra um ambiente não descartável, a senha real vai junto. Os dados de hóspede no corpo do erro (`helpers.ts:14`) são fictícios.
**Correção sugerida:** README/CI: publicar o artefato só em falha, com retenção curta, e só contra ambiente descartável. Opcional: `trace: { mode: 'retain-on-failure', snapshots: true, sources: false }` não resolve a rede, então o controle é operacional.

## Repassados a outro dev
Nenhum.

Fica uma observação, sem repasse: o check-out aceita saldo em aberto (`CheckOutController.js:28`), mas a UI avisa (`ReservationDetailPage.tsx:302-307`) e isso parece decisão de produto, não defeito. Só aparece aqui porque é o que torna o 🟡-2 perigoso.

## O que foi verificado e está correto
- **Lockfile:** só entram `@playwright/test`/`playwright`/`playwright-core` 1.48.2 e `fsevents@2.3.2` opcional (dependência transitiva do playwright). Nenhuma versão de outro pacote mudou. `typescript` resolve para o 5.9.3 já presente.
- `pnpm -r test` e `turbo run test` não executam o e2e (sem script `test`). Nenhum vitest do monorepo varre `e2e/tests/*.spec.ts`: cada vitest roda na pasta do próprio pacote.
- `pnpm -r typecheck` verde, incluindo o pacote novo.
- Nenhum `.env`, chave ou segredo no diff. `senha123` é a senha pública do seed, já versionada em `seed_hotels.sql`. Saídas (`test-results/`, `playwright-report/`) estão no `.gitignore`.
- Limite de login: nginx com `rate=5r/m burst=3 nodelay` (`docker/nginx/default.conf:1,45`) permite exatamente 4 logins em rajada, e a rodada faz 4. O 429 tem mensagem própria tanto no globalSetup quanto em `session()`. Rerrodar logo depois de uma falha rápida (menos de ~48s) leva 429, e o README documenta isso.
- Falha rápida sem compose: health com timeout de 5s e mensagem dizendo como subir. O login do admin confirma o seed e a senha.
- Proxy: `NGINX_PORT`/`BACKEND_HOST_PORT` do `webServer.env` vencem o `.env` da raiz (`apps/pms/vite.config.ts:14-20`). Todo o `/api` passa pelo nginx, como na produção.
- `REPO_ROOT` (`src/env.ts:28`) resolve de fato para a raiz do repositório.
- Isolamento de tenant: o roteiro só usa o tenant Aurora e as próprias credenciais. Nenhuma escrita em outro tenant.
- Datas: `TODAY` em `America/Sao_Paulo`, e `addDays` ao meio-dia UTC (sem virada de dia).
- Dados por rodada sem colisão: tag de 6 dígitos de ms, CPF com DV válido. `/accounts` e `/rooms` não paginam, então o `find` acha o registro mesmo com acúmulo.
- O passo 2 confere o valor antes de confirmar (R$ 400,00) e o status CHECKED_IN pela API. O passo 5 confere CHECKED_OUT + CLEANING. O passo 6 faz poll até CONFIRMED.

## Não foi possível verificar
- Execução real dos 7 passos, duas vezes seguidas: compose não subido, por instrução. Não confirmo flakiness em tempo de execução, só por leitura.
- Se `webServer` sobe antes do `globalSetup` no Playwright 1.48.2 (é o comportamento documentado). Se não subir, o aquecimento falha com "Falha ao aquecer o Vite", o que continua explicativo.
- Se a tela "Comanda" mostra algum estado "aguardando rede" que permita a correção sugerida no 🟡-1 sem espera fixa.

## Desfecho
**Data:** 15/11/2026 · **Branch:** feature/e2e-roteiro · Correções feitas pelo agente de implementação. Todos os 9 achados foram tratados.

| Achado | Correção |
|---|---|
| 🟡-1 | Passo 3: o 1º toque é enviado com rede e conferido pela API (`toBe(1)`). Depois o contexto fica offline, vem o 2º toque, a janela de desfazer vence sem rede e o teste espera "Na fila" na lista de itens. Com a rede ainda fora, a API continua com 1 unidade. A rede volta, a fila reenvia, e o teste espera `toBe(2)` e o fim de "Na fila/Enviando/Aguardando envio". Uma 2ª leitura confere de novo `toBe(2)`, então duplicação reprova. |
| 🟡-2 | Passo 5: espera o texto exato `Pagamento de R$ … em Dinheiro registrado.`. Depois do check-out, o bill da conta da suíte tem que estar `PAID` com saldo `0.00`, e a soma dos pagamentos PAID da reserva (`GET /payments`) tem que ser igual ao total do bill. |
| 🟡-3 | O produto é escolhido pelo nome (`Caipirinha`), na suíte e na mesa, sem depender da ordem do cardápio. |
| 🟡-4 | Mesa: `expect.poll` pela API até a conta `E2E Mesa <tag>` ter exatamente 1 unidade. Passo 7: sem espera fixa. `expect.poll` sobre `GET /analytics/revenue-by-category` até a categoria do passo 1 contar as reservas dos passos 2 e 6 (2, ou 1 se o passo 6 for pulado). Na tela, o teste espera a 1ª resposta `/api/analytics/` e o `networkidle`, e exige todas 2xx. |
| 🟡-5 | Tudo o que o roteiro cria leva o prefixo "E2E": categoria, quarto, hóspedes, mesa, e-mails. O README tem o aviso "só no ambiente descartável `gesway-ensaio`, nunca no da apresentação" e a seção "Depois de rodar" com `docker compose -p gesway-ensaio down -v --remove-orphans`. O `globalSetup` recusa `E2E_API_URL` fora de localhost/127.0.0.1/[::1]; verificado com `http://192.0.2.10:8088`, que dá erro `[e2e] … não é local`. |
| 🟢-1 | Passo 6: quando o `docker compose exec … printenv` falha, o passo é pulado com o motivo (1ª linha do stderr), a dica de `COMPOSE_PROJECT_NAME` e o ponteiro para o passo manual. |
| 🟢-2 | Comentário corrigido: a confirmação de check-out sempre aparece. O `.catch(() => {})` saiu. |
| 🟢-3 | Passo 4: o hóspede é esperado no bloco "Na casa" e a lista da faixa "Atenção" visível (só renderiza com alertas carregados). Também conta zero spinners "Carregando …" e zero `role="alert"`. Sem regex, sem espera fixa. |
| 🟢-4 | O README ganhou a seção "Artefatos no CI": publicar o relatório e os traces só em falha, com retenção curta e só contra o ambiente descartável. |

**Verificação, depois das correções.** O ambiente `gesway-ensaio` foi subido do zero (compose-up --build, migrate, seed, outbox-initial-load), com o cache do Vite apagado. Foram duas rodadas seguidas, com ≥65 s entre os inícios por causa do limite de login do nginx:
- Rodada 1 (Vite frio): ✅ 1 (1.2s) · ✅ 2 (1.2s) · ✅ 3 (21.8s) · ✅ 4 (474ms) · ✅ 5 (959ms) · ✅ 6 (571ms) · ✅ 7 (2.3s): `7 passed (53.7s)`
- Rodada 2: ✅ 1 (1.5s) · ✅ 2 (1.4s) · ✅ 3 (21.5s) · ✅ 4 (477ms) · ✅ 5 (946ms) · ✅ 6 (733ms) · ✅ 7 (1.0s): `7 passed (52.6s)`
- O passo 3 passou de ~11s para ~21s. É o tempo da janela de desfazer vencendo duas vezes, mais o reenvio depois da volta da rede: o caminho offline agora é exercitado.
- No fim, `docker compose -p gesway-ensaio down -v --remove-orphans`: 0 contêineres e 0 volumes do projeto restantes.
- `pnpm -r test`: domain 49/49 e pms 334/334, sem o e2e. `pnpm -r typecheck`: verde nos 5 pacotes.

**Fica em aberto (fora do escopo):** a conta de mesa do passo 3 continua OPEN no ambiente descartável, porque o `down -v` a apaga. O check-out com saldo em aberto continua aceito pelo backend, como decisão de produto.
