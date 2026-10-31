### 2026-10-30 — Gabriel (agente executor orquestrado)

- **Branch:** `fix/tenant-fk-validation` — sem PR e sem merge
- **Worktree / banco:** `/home/gabri/wt-fk-tenant` · PostgreSQL 17 próprio na porta 5459 (container `pg-fkint`, removido no fim)
- **Objetivo da sessão:** corrigir as ressalvas do qa-redteam de 30/10
  (`docs/qa/redteam_tenant-fk-validation_24out2026.md`, veredito APROVADO COM RESSALVAS na
  ponta `02ab6f4`), cada item com teste RED antes.

> Continua o relatório `tenant_fk_validation_24102026.md`, que não foi editado.
> **A área de quartos e categorias é da Sirlande.** O repasse para ela ficou fora desta rodada,
> por decisão do coordenador.

#### O que foi feito — RED → GREEN

| Achado | RED (falhas antes) | GREEN | Correção |
|---|---|---|---|
| 🟡-1 corrida de exclusão | `b6d0906` — 8 falhas: 201/200 onde devia ser 404, e 204 onde devia ser 409 | `a6489ef` | `findInTenant` aceita `lock`. Quem grava a referência lê o quarto ou a categoria com `LOCK.SHARE` dentro da própria transação: CreateReservation (agora abre a transação antes de ler os quartos), AddRoomToReservation, UpdateReservation, SignContract (valida os quartos dentro da transação), CreateRoom (com transação nova) e UpdateRoom. DeleteRoomCategory trava com `FOR UPDATE` antes de contar. O comentário do DeleteRoom foi corrigido |
| 🟢-2 mutações M5/M6 | `b6d0906` — os 2 testes passam no código certo e caem com a mutação (abaixo) | — | Teste edição × check-in e teste exclusão × reserva em gravação |
| 🟡-2 `number` | `8af65e0` — 13 falhas (500, 201 e 200 onde devia ser 400) | `b8a9f8a` | `numberError` em `roomRules.js`: texto não vazio depois de aparar, sem null, objeto, lista, boolean ou número. 400 `INVALID_INPUT` com `field: 'number'` no POST e no PUT; o número é gravado aparado |
| 🟡-3 `:id` não-UUID | `8af65e0` — 4 falhas (500) | `b8a9f8a` | PUT/DELETE de `/rooms/:id` e `/room-categories/:id` buscam por `findInTenant` → 404 |
| 🟢-3 `name` aparado | `8af65e0` — 2 falhas | `b8a9f8a` | `name.trim()` no POST e no PUT da categoria |
| 🟢-5 `category_id` canônico | `8af65e0` — 1 falha | `b8a9f8a` | Grava e devolve `category.id`, o id que veio do banco |
| 🟢-4 Swagger | `4e13785` — 2 falhas | `ab04841` | `requestBody` de `PUT /rooms/{id}`, com todos os campos opcionais e as transições de `status`. O api-client **não** foi regenerado: isso fica com a T-05.1, depois do merge |

Os testes de corrida (`tests/rooms-race.test.js`) seguem a ordem de travas que o auditor
descreveu. Uma transação do teste segura a trava, a requisição é disparada, o teste espera
`pg_locks` mostrar uma sessão bloqueada e só então faz o soft delete (ou a gravação) e o COMMIT.

#### Mutações (saída real, `tests/rooms-race.test.js`)
```
[M5] × M5: edição concorrente com um check-in não sobrescreve o OCCUPIED   → expected 200 to be 409
[M5]      Tests  1 failed | 9 passed (10)
[M6] × M6: DELETE /rooms/:id enquanto uma reserva está sendo gravada     → expected 204 to be 409
[M6]      Tests  1 failed | 9 passed (10)
```
M5 tira o `lock` do UpdateRoom; M6 tira o do DeleteRoom. Os dois arquivos foram restaurados com
`git checkout` depois de cada rodada.

#### Suíte completa e checks (ponta final)
```
 Test Files  49 passed (49)
      Tests  1087 passed | 1 skipped (1088)
Statements   : 85.36% ( 3079/3607 )
Branches     : 82.39% ( 1708/2073 )
Functions    : 89.1% ( 368/413 )
Lines        : 87.1% ( 2735/3140 )
```
`bash scripts/qa_checks.sh`: `⚠ 3 aviso(s). Nenhum erro bloqueante.` São os mesmos 3 avisos da
develop: router fora do Swagger, botão cru e classes repetidas no frontend.

#### Commits gerados

| Hash | Mensagem |
|------|----------|
| `b6d0906` | `test(rooms): RED das corridas de exclusao de quarto e categoria (🟡-1, 🟢-2)` |
| `a6489ef` | `fix(rooms): quarto e categoria excluidos no meio nao sao referenciados (🟡-1)` |
| `8af65e0` | `test(rooms): RED de number, :id nao-UUID, name aparado e category_id canonico` |
| `b8a9f8a` | `fix(rooms): number validado, :id nao-UUID 404, name aparado e category_id canonico` |
| `4e13785` | `test(swagger): RED do requestBody de PUT /rooms/{id} (🟢-4)` |
| `ab04841` | `docs(swagger): requestBody de PUT /rooms/{id} e regra de number (🟢-4)` |

#### Pendências

| # | Pendência | Prioridade | Observação |
|---|-----------|-----------|------------|
| 1 | Conferir dado cruzado entre hotéis já gravado (pendência 1 de 24/10), **inclusive nos relatórios** (🟢-6) | 🔴 Alta | A consulta está no relatório de 24/10. Os JOINs de `GetAlertsController` e `GetRevenueByCategoryController` mostram o nome da categoria cruzada enquanto houver dado contaminado |
| 2 | Regenerar o api-client (`pnpm gen:api`) | 🟡 Média | Com a T-05.1, depois do merge: `RoomError`, enum de status do POST e corpo do PUT |
| 3 | CLEANING → MAINTENANCE (🟢-1) | 🟢 Baixa | Decisão de produto do Gabriel; ficou fora por ordem do coordenador |
| 4 | `POST /public/:subdomain/bookings` escolhe o quarto sem `FOR SHARE` | 🟢 Baixa | É a mesma classe do 🟡-1, mas fora da lista do auditor e do coordenador. Um quarto excluído durante a reserva pública ainda pode ser gravado. A correção é ler o quarto escolhido com `LOCK.SHARE` dentro da transação |
| 5 | `GET /rooms/:id` e `GET /room-categories/:id` com id não-UUID → 500 | 🟢 Baixa | Repassado pelo auditor à Sirlande (`para_sirlande_30102026.md`) |
| 6 | Check-in em quarto MAINTENANCE | 🟢 Baixa | Fora desta branch (nota do 🟢-1 do auditor) |

#### Complemento — reserva pública e conta avulsa (pedido do coordenador, mesma data)

Fecha a pendência 4 acima. O `grep` de `room_id`/`category_id` nos controllers achou mais um
ponto da mesma classe: a conta avulsa com `room_id`. Os outros pontos que gravam essas
referências já leem com trava, ou copiam o quarto da própria estadia ativa, que o R-6 protege
(`reservationRoomAccount`, `roomChangeAccounts`, `openStayAccount` no check-in).

| Ponto | RED | GREEN | Comportamento |
|---|---|---|---|
| `POST /public/:subdomain/bookings` | `da95122`: 201, reserva sem quarto | `261ffb7` | O quarto escolhido é relido com `LOCK.SHARE` na transação. Se tiver sido excluído no meio → 409 `{"error":"Sem disponibilidade na categoria para o período"}`, a mesma mensagem pública de sempre e sem detalhe interno. A cobrança no PSP fica no log como órfã, igual ao rollback que já existia |
| `POST /accounts` (avulsa com `room_id`) | `da95122`: 201, conta apontando para quarto excluído | `261ffb7` | `LOCK.SHARE` na transação do INSERT → 404. A conta ROOM não trava, porque a estadia CHECKED_IN já segura a exclusão e travar o quarto antes da reserva inverteria a ordem reserva → quarto do check-out |

Suíte final: `Test Files 49 passed (49)` · `Tests 1089 passed | 1 skipped (1090)`. Cobertura:
instruções 85.35%, branches 82.33%, funções 89.1%, linhas 87.14%. `qa_checks`: 3 avisos, os mesmos
da develop, e nenhum erro.

A pendência 4 desta tabela está **resolvida**.

#### Complemento 2 — reauditoria delta de 31/10 (🟡-D1 e 🟢-D2)

O auditor deu APROVADO COM RESSALVAS (`docs/qa/redteam_tenant-fk-validation_delta_31out2026.md`).
O 🟡-D1 é efeito colateral do FOR SHARE que esta branch introduziu.

**Causa raiz.** FOR SHARE conflita com o FOR NO KEY UPDATE que o `UPDATE rooms SET status` do
check-in e do check-out toma. Uma reserva com X principal e Y extra trava X e espera Y, enquanto o
check-in de outra reserva (Y principal, X extra) já mudou Y e vai mudar X. O ciclo se fecha, e o
Postgres derruba a criação, que recebia um 409 "Quarto indisponível" falso: o `isRoomOccupiedError`
tratava 40P01 como ocupação.

| Item | RED `a997586` | GREEN `3284400` |
|---|---|---|
| 🟡-D1 ciclo trava × check-in | 409 falso | 201, e o check-in também grava |
| 🟡-D1 compatibilidade (criação com o UPDATE de status aberto) | — (escrito no GREEN) | 201 sem esperar; com FOR SHARE, fica bloqueada (mutação) |
| 🟢-D2 deadlock na 1ª tentativa (criação e quarto extra) | 409 "Quarto indisponível" | Repete e responde 201 |
| 🟢-D2 deadlock repetido | 409 "Quarto indisponível" | 409 "Outra operação está usando estes quartos agora — tente de novo" |
| 🟢-D2 reserva pública | 409 "Quarto indisponível" | 500 genérico, sem repetir (a cobrança no PSP já existe) |

- Troca de `LOCK.SHARE` por `LOCK.KEY_SHARE` nas 8 leituras: CreateReservation, AddRoom,
  UpdateReservation, SignContract, CreateRoom, UpdateRoom, reserva pública e conta avulsa.
- KEY SHARE ainda conflita com o FOR UPDATE das exclusões. Os testes de exclusão concorrente seguem
  404/409, e o M6 passou a simular FOR KEY SHARE.
- `app/utils/deadlockRetry.js`: `isDeadlockError` e `withDeadlockRetry` (uma nova tentativa e,
  se o deadlock se repetir, 409 "tente de novo"). O RemoveRoom passou a usar o util.
- O teste N1 de 10/10 (papéis trocados em paralelo) continua dando [201, 409]: a repetição vê a
  reserva vencedora na checagem.
- O RED do ciclo reproduziu de forma determinística: 3 rodadas estáveis no GREEN. Por causa da nova
  tentativa, o teste do ciclo sozinho não pegaria a volta do FOR SHARE. Por isso existe o teste de
  compatibilidade, e a mutação (SHARE de volta na criação) o reprova: a criação fica
  "bloqueada esperando o check-in".

Suíte final: `Test Files 49 passed (49)` · `Tests 1096 passed | 1 skipped (1097)`. Cobertura:
instruções 85.51%, branches 82.33%, funções 89.15%, linhas 87.32%. `qa_checks`: 3 avisos, os mesmos
da develop, e nenhum erro.
