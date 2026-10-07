### 2026-09-09 — Gabriel (agente executor / Claude Code)

- **Branch:** `fix/paranoid-unique-constraints`
- **Continua:** `docs/delegacoes/continuacao_divida_tecnica_27ago2026.md` — ETAPA A
- **Objetivo da sessão:** fechar o PASSO 2 da SPEC-06 (push, sincronização e auditoria pendentes desde 26-27/08).

---

## O que foi feito

**ETAPA A completa.** A branch tinha 4 commits só locais e nunca tinha passado pelo `qa-redteam` — o ciclo obrigatório da delegação tinha sido pulado.

| Passo | Resultado |
|---|---|
| A.1 — Push | 4 commits enviados |
| A.2 — Sincronizar com `develop` | Merge limpo (`bfc2cba`) — só um untracked idêntico ao que já estava versionado |
| A.3 — Auditoria (1ª rodada) | **REPROVADO** — 3 🔴, 3 🟡. Relatório: `docs/qa/redteam_paranoid-unique_27ago2026.md` |
| Correção dos 3 🔴 + 3 🟡 + 2 🟢 | 5 commits (`a76934c`…`cde4e5e`) |
| A.3 — Reauditoria (2ª rodada) | **APROVADO COM RESSALVAS** — 0 🔴, 4 🟡, 5 🟢. Relatório: `docs/qa/redteam_paranoid-unique_reaudit_27ago2026.md` |
| Correção dos 4 🟡 + 3 dos 5 🟢 | 5 commits (`b1c9cc5`…`6664dd2`) |

**Total da sessão: 10 commits, 2 rodadas completas de `qa-redteam`.**

### A 1ª rodada — REPROVADO

O código dos 5 commits do PASSO 2 (sessão de 26/08) estava certo, mas **não chegava a nenhum banco que já existia** — nem ao `gestao_hotel` de desenvolvimento desta máquina, medido pelo auditor. Achados:

- **🔴 1** — `sync({alter})` compara índice por nome e pula um já existente (mesmo total); `schema.sql` antigo criava o parcial *ao lado* da constraint legada, que sobrevivia. → Corrigido: `applyDbConstraints.js` agora detecta qualquer índice único sobre o conjunto de colunas certo, independente de nome, e substitui.
- **🔴 2** — Consequência do 🔴1: o 409 do ciclo recriar tinha virado uma "mentira convincente" em banco não curado. Fechado junto com o 🔴1.
- **🔴 3** — `CreateBookingController.js` (único endpoint público sem auth do sistema) só buscava hóspede por e-mail; um CPF já cadastrado com e-mail novo batia direto no índice e caía num 500 com o CPF impresso no log via `console.error(error)`.
- **🟡 regra 8** — a heurística de contagem-por-arquivo tinha 3 bypasses comprovados (`unique: 'string'`, `defaultScope` compensando, comentário compensando) + 1 gap (`schema.sql` fora do alcance). Reescrita para casamento estrutural (pilha de chaves em `awk`).
- **🟡 Swagger** — 10 endpoints passaram a devolver 409 sem documentar. 8 corrigidos.
- **🟡 LGPD** — registrado como pendência, não corrigido (decisão do próprio relatório).

### A 2ª rodada — APROVADO COM RESSALVAS

Os 3 🔴 fecharam de verdade (o auditor reproduziu de forma independente, não confiou em commit message). Mas apareceram 4 🟡 novos:

- **🟡-1** — Um banco provisionado pelo `schema.sql` antigo faz `node command.js migrate` morrer no `sync({alter})` por um bug **pré-existente e alheio** (enum de `event_quotes`), **antes** de `applyDbConstraints` ser importado — a cura nunca era alcançada por esse caminho. → `command.js` reestruturado: `sync` roda num try próprio: se falhar, `applyDbConstraints` roda mesmo assim (só mexe em tabelas que já existem), e só depois o erro original do sync é relançado — Fail Fast preservado no *reporte*, Fail Safe na *execução*.
- **🟡-2** — Um índice com duplicata viva (dado real incorreto, não desta branch) abortava a cura dos 3 seguintes do array e dos índices compostos de performance, com mensagem opaca ("Validation error"). → `try/catch` por item, falhas acumuladas e relançadas só ao final, com tabela+colunas+índice — sem expor o valor duplicado (`error.original.message`, não `.detail`).
- **🟡-3** — **Bypass novo que eu mesmo introduzi** na regra 8: um índice defeituoso escrito **em uma linha só** (o formato que qualquer formatador produz, e que o próprio `ProductModel` usa) escapava da detecção — bug de ordem no `awk` (a linha só era anexada aos blocos abertos *depois* do laço de caracteres). → Reordenado: o caractere é anexado a todos os níveis abertos a cada iteração, não só no fim da linha.
- **🟡-4** — O find-or-create por CPF/e-mail usava `Op.or` sem precedência nem `ORDER BY`; quando e-mail casa com um hóspede e CPF casa com outro (situação normal numa base de hotel), o resultado dependia do plano de execução do Postgres — contrariando o próprio comentário do código ("CPF é identidade mais forte"). → Duas consultas em ordem explícita (CPF primeiro).

Cada uma das 4 correções foi **verificada por mim com reprodução independente** — bancos descartáveis simulando os cenários exatos do relatório, não só lida e aceita:

- 🟡-1: banco via `schema.sql` de `develop`, `node command.js migrate` desta branch → sync morre no enum (como esperado), mas os 7 índices ficam parciais e o ciclo recriar funciona; `migrate` ainda sai com `exit 1` reportando a causa raiz certa.
- 🟡-2: banco com 2 hóspedes vivos de mesmo CPF → só o índice de CPF falha; os outros 6 índices e os 8 compostos são aplicados normalmente.
- 🟡-3: os 5 cenários da rodada anterior (A–E) + o novo (F, índice de uma linha) — todos `exit 1`; base limpa `exit 0`.
- 🟡-4: teste novo (e-mail de A + CPF de B) — falha 5/5 execuções com o `Op.or` antigo, passa com as duas consultas em ordem.

Também corrigidos 3 dos 5 🟢: fallback morto já tinha sido removido na 1ª rodada; testes novos ganharam `afterEach` restaurando estado + limpeza de tenant/hóspedes órfãos; asserção frouxa trocada; teste unitário novo para `uniqueConstraintConflict.js` (ramo do mapa vazio nunca coberto); comentário do `RegisterController` ajustado para não afirmar mais do que o código garante.

### Não corrigido nesta branch (por decisão, não por omissão)

| Item | Por quê |
|---|---|
| 🟡-4(b) — reserva de terceiro anexa a cadastro alheio via CPF, sem confirmação | Decisão de produto (exigir OTP/confirmação, ou sempre criar cadastro novo na reserva pública), não bug de código. O próprio relatório da reauditoria pede para registrar, não corrigir agora. Amplia um vetor que já existia por e-mail antes desta branch — CPF é mais fácil de obter de terceiro, por isso a auditoria tratou como achado novo. |
| 🟢-3 — `console.error(error)` cru em 10 dos 11 controllers que usam `uniqueConstraintConflict` | Só o `CreateBookingController` (público) foi ajustado para `error.message`. Nos outros 10 o guard já responde antes de chegar no `console.error` no caso de unicidade — o vazamento real (LGPD) já estava fechado pela correção anterior. O que resta é inconsistência de estilo para erros *não*-unique, sem dano comprovado (`GuestModel` não tem `CHECK`/`allowNull:false` em campo de PII que gerasse esse tipo de erro). Corrigir os 10 expande o diff bem além do escopo desta branch — registrado aqui para quem quiser padronizar depois. |
| LGPD art. 18, VI (purge de PII) | **Já registrado** como `T-06.11` em `docs/specs/SPEC-06-qualidade-divida-tecnica.md` — atualizado por outra sessão durante esta auditoria, com critérios de aceite mais detalhados do que eu escreveria aqui. Não duplicado. |

---

## Estado da SPEC-06 ao final desta sessão

| Passo/Tarefa | Estado |
|---|---|
| PASSO 1 — vazamento no endpoint público (T-06.5) | ✅ Concluído, no remoto |
| **PASSO 2 — `paranoid` + unique total (T-06.3)** | ✅ **Concluído nesta sessão** — auditado 2×, 0 🔴 remanescente, no remoto |
| T-06.9 — assinatura do webhook PIX 🔴 | 🔲 Não iniciado. Delegação pronta em `DELEGACAO_WEBHOOK_PIX.md`. **Prioridade máxima** — é dinheiro |
| T-06.1 — portão de cobertura | 🔲 Não iniciado, mas destravado: `branches` real 70,18% contra portão de 55/60 exigido |
| T-06.2 — schema no Swagger | 🔲 Não iniciado no geral; os 8 endpoints do PASSO 2 já documentam 409 |
| T-06.10 — paginação | 🔲 Não iniciado (nova, registrada por outra sessão em 09/09) |
| T-06.4 — docker-compose | 🔲 Não iniciado |
| T-06.11 — purge de PII (LGPD) | 🔲 Registrado, não iniciado |
| T-06.6 — R4 (índice em banco existente) | ⚠️ **Reavaliar prioridade** — o mecanismo genérico que resolve isto para os 7 índices desta branch já existe em `applyDbConstraints.js`; falta só `products`, que a SPEC descreve como risco baixo "porque a tabela não existe no cluster". Vale conferir se isso ainda é verdade antes de manter a prioridade baixa |

---

## Efeito colateral desta sessão: frontend rodando localmente

Fora do escopo da SPEC-06, a pedido pontual: `frontend/apps/pms` (Fase 1 — hóspedes) foi colocado no ar para visualização — `pnpm install`, port-forward do backend (`svc/backend` → `:3000`) e `vite dev` (`:5173`), mais `./start.sh seed` para dados de exemplo. Login `admin@aurora.example` / `senha123`. Nada disso foi commitado (são processos em background + dependências instaladas, não mudança de código).

**Pendência observada de passagem, não investigada:** `./start.sh seed` reporta sucesso mas um trecho do módulo B2B falha (`ERROR: column "status" is of type enum_event_quotes_status but expression is of type text`) e faz rollback de uma transação — o script não propaga esse erro no exit code. Guests/rooms/users seedaram corretamente (61 hóspedes, login funcional); o que depende de `event_quotes` no seed, não. Mesma família do bug que trava o `sync({alter})` no 🟡-1 desta sessão — os dois provavelmente têm a mesma causa raiz no enum de `event_quotes`.

---

## Commits gerados

| Hash | Mensagem |
|------|----------|
| `bfc2cba` | `merge: sincroniza com develop antes da auditoria do PASSO 2` |
| `a76934c` | `fix(db): applyDbConstraints cura indice unico total em banco legado` |
| `56b2f60` | `fix(public-booking): find-or-create por CPF, evita 500 e log com PII` |
| `497a02c` | `fix(qa): regra 8 vira casamento estrutural, fecha 3 bypasses comprovados` |
| `af4d0ba` | `docs(swagger): documenta 409 nos 8 endpoints que passaram a devolve-lo` |
| `cde4e5e` | `refactor(auth): RegisterController usa uniqueConstraintConflict` |
| `b1c9cc5` | `fix(qa): regra 8 corrige bypass de indice defeituoso em uma linha` |
| `10e9827` | `fix(db): indice com duplicata viva nao aborta a cura dos outros 6` |
| `49bdf31` | `fix(db): applyDbConstraints roda mesmo se sync({alter}) falhar` |
| `86409b6` | `fix(public-booking): find-or-create resolve CPF x email com precedencia explicita` |
| `6664dd2` | `test(qa): unitario do uniqueConstraintConflict + ajusta comentario do register` |

Todos em `fix/paranoid-unique-constraints`, enviados para `origin`.

## Estado ao encerrar

- `npm run qa:checks` → exit 0. `npm test` → 18 arquivos, 247 passam, 1 skip. Cobertura 74,03% stmts / 70,18% branches / 76,67% lines / 86,04% funcs — acima do portão.
- Working tree limpo (verificado após cada commit). Bancos e worktrees descartáveis das verificações, todos removidos.
- `minikube` + stack `hotel-system` seguem no ar (port-forwards de Postgres `:5432` e backend `:3000` ativos), mais o frontend em `:5173` — nenhum custo de nuvem, tudo local.
- **Não fiz merge em `develop` nem push nela** — só na branch da etapa, como a delegação pede.

## Pendências

| # | Pendência | Prioridade | Observação |
|---|-----------|-----------|------------|
| 1 | T-06.9 — assinatura do webhook PIX | 🔴 Alta | Delegação pronta (`DELEGACAO_WEBHOOK_PIX.md`), é a próxima etapa (ETAPA B) |
| 2 | 🟡-4(b) — reserva pública pode anexar a cadastro de terceiro via CPF, sem confirmação | 🟡 Média | Decisão de produto, não bug de código — ver seção acima |
| 3 | 🟢-3 — `console.error(error)` cru em 10 controllers | 🟢 Baixa | Sem dano comprovado hoje; padronizar quando mexer nesses arquivos por outro motivo |
| 4 | Bug do enum `event_quotes_status` trava `sync({alter})` e o seed do B2B | 🟡 Média | Pré-existente, fora do escopo desta branch, mas confirmado em 2 caminhos diferentes nesta sessão (migrate legado e `start.sh seed`). Vale uma investigação própria |
| 5 | T-06.6 (R4) — reavaliar prioridade | 🟢 Baixa | O mecanismo que resolve isto já existe para 7 índices; falta só `products`, e a premissa de "tabela não existe no cluster" pode estar desatualizada |
| 6 | ETAPAS C/D/E da delegação (cobertura, Swagger completo, docker-compose) | 🟡 Média | Não iniciadas — vêm depois de T-06.9 na ordem da delegação |
