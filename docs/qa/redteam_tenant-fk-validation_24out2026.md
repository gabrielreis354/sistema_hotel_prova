# QA Red Team — validação de tenant em FK (R-1) e regras de quartos e categorias (R-2 a R-6)
**Branch:** fix/tenant-fk-validation · **Dev:** Gabriel (agente executor), em área da Sirlande (RoomApi/RoomCategoryApi) · **Base:** develop@94f7abf (já mesclada na ponta) · **Ponta auditada:** 02ab6f4 · **Data:** 30/10/2026 (iniciada em 24/10)
**Arquivos auditados:** 17 do diff (`origin/develop...02ab6f4`: 7 controllers, 6 utils, `config/swagger.js`, 2 testes e docs). Também li os 91 controllers da árvore mesclada para refazer a varredura.
**Achados no escopo:** 9 (🔴 0 · 🟡 3 · 🟢 6) · **Repassados:** 1

## Veredito
**APROVADO COM RESSALVAS**

O R-1 está fechado. `PUT /rooms/:id` e `POST /rooms` só aceitam categoria do próprio hotel. A categoria de outro hotel, inexistente, excluída ou com id não-UUID responde 404 `CATEGORY_NOT_FOUND`, sem confirmar que o id existe. Os testes que travam essa regra são de verdade: tirei o `tenant_id` de `findInTenant` e 4 testes falharam (mutação M1).

Refiz sozinho a varredura da mesma classe de falha nos 91 controllers da árvore mesclada (id de outra entidade vindo do corpo, da query string ou da rota sem filtro de tenant), inclusive nas leituras. Não achei outro vazamento ativo.

Nenhum achado é 🔴. Os três 🟡 não vazam dado e não perdem dinheiro sozinhos:
- **🟡-1:** a trava do R-6 não protege contra corrida. Reproduzi uma reserva criada para um quarto que estava sendo excluído.
- **🟡-2:** o `number` do quarto não é validado e gera 500.
- **🟡-3:** um `:id` que não é UUID gera 500 nos controllers que a branch reescreveu.

Vale corrigir os três numa rodada curta. Não reprovam a branch.

**Merge com a develop:** a ponta 02ab6f4 já contém a `develop@94f7abf`. O merge teve um conflito semântico e ele foi resolvido certo. No meu merge simulado (`/tmp`, antes do push do executor), o teste `POST /payments com reservation_id do hotel B → 404` falhava com **400**: depois da T-06.13, `method` passou a ter allowlist, e `'CASH'` não está nela. Em 02ab6f4 o teste manda `'DINHEIRO'` e volta a provar o 404 de verdade.

Depois disso a `develop` andou para **093d14b** (PRs #97 e #99). São só documentos: `CLAUDE.md` (o walk-in na máquina de reservas; a máquina de quartos não mudou), retomadas e sugestões. `git merge-tree` não acusa conflito e nenhum código mudou, então **não é preciso outro merge antes do PR**. O PR mescla limpo.

## Achados no escopo

### 🟡-1 [Concorrência / integridade · R-6 e R-4] A trava do `DELETE /rooms/:id` não segura uma reserva que já leu o quarto; o `DELETE /room-categories/:id` nem tem trava
**Onde:** `services/core-service/app/Controllers/RoomApi/DeleteRoomController.js:9,20,43` · `RoomCategoryApi/DeleteRoomCategoryController.js:15-23`
**Cenário (reproduzido em 02ab6f4, Postgres 17 próprio na porta 5457, sonda local não versionada):**
1. A transação 1 refaz os passos do `DeleteRoomController`: `SELECT ... FOR UPDATE` no quarto T-1, nenhuma reserva ativa encontrada.
2. Ao mesmo tempo chega um `POST /reservations` para T-1. O `RoomModel.findOne` sem trava do `CreateReservationController.js:32` lê o quarto normalmente. A checagem de conflito passa, e o INSERT da reserva fica esperando na FK (KEY SHARE contra o FOR UPDATE).
3. A transação 1 faz o soft delete (`UPDATE deleted_at`) e o COMMIT.
4. O INSERT segue, porque a linha ainda existe: a FK não enxerga `deleted_at`. Resultado: **201**, `total_amount: "200.00"`.
5. `GET /reservations/:id` devolve `"room": null, "rooms": []`. É exatamente o estado que o R-6 queria impedir: uma reserva sem onde hospedar.

O comentário da linha 9 diz que "a inserção de uma reserva para ele (FK no pivô) espera". Ela espera, e depois grava. A trava só funciona na ordem inversa, quando a reserva grava primeiro.

Na categoria a situação é igual e sem trava nenhuma. O `count` deu 0, um `POST /rooms` entrou na janela, a categoria foi excluída, e o `GET /rooms/:id` devolveu `"category": null`. É o cenário do R-4: um quarto "sem categoria" que continua cobrando a diária da categoria excluída.

As mutações M5 e M6 confirmam que nenhum teste exercita as travas. Tirei o `lock` do Update e do Delete e os 65 testes continuaram verdes.
**Regra violada:** R-4 e R-6 do repasse de 21/10 (fechados só no caminho sequencial). CLAUDE.md §9: estado consistente entre tabelas.
**Correção sugerida:** é o leitor que precisa travar a linha.
- Em `CreateReservation`, `AddRoomToReservation`, `UpdateReservation` (troca de quarto) e `SignContract`, ler os quartos **dentro da transação** com `lock: transaction.LOCK.SHARE`. Em READ COMMITTED, o Postgres reavalia o `WHERE` (`deleted_at IS NULL`) na versão nova da linha depois da espera: o quarto excluído some e a reserva responde 404.
- Em `CreateRoom` e `UpdateRoom`, ler a categoria com `LOCK.SHARE` dentro da transação.
- Em `DeleteRoomCategory`, travar a categoria com `FOR UPDATE` antes do `count`.
- Corrigir o comentário da linha 9 e acrescentar um teste de corrida, no padrão dos que já existem em `account-payments.test.js`.

### 🟡-2 [Validação · R-5 / contrato INVALID_INPUT] O `number` do quarto não é validado: objeto, lista e null viram 500; vazio é gravado na edição
**Onde:** `RoomApi/UpdateRoomController.js:20-28,51` · `RoomApi/CreateRoomController.js:15`
**Cenário (reproduzido em 02ab6f4):**
- `PUT /rooms/:id {number: null}` → **500**. O `allowNull: false` dispara `SequelizeValidationError`, que não é tratado.
- `PUT {number: {a:1}}` e `PUT {number: ["1"]}` → **500**. `POST {number: {a:1}}` e `POST {number: ["9"]}` → **500**.
- `PUT {number: ""}` → **200** e grava o quarto com número vazio. O `POST` recusa vazio (`!number`), então o mesmo dado é aceito ou recusado conforme o caminho, a mesma assimetria do R-2.
- `POST {number: "   "}` → 201. `POST {number: true}` → 201 com `"number": "true"`.

A branch reescreveu a validação desses dois controllers no formato `INVALID_INPUT` + `field`, e o relatório do executor afirma "nunca 500", mas o campo principal do quarto ficou de fora. A tela da T-05.1 vai receber um 500 genérico onde o contrato prometeu `field: "number"`.
**Regra violada:** contrato de erro combinado (`INVALID_INPUT` + `field`). Fail Fast. CODING_STANDARDS: entrada inválida responde 4xx.
**Correção sugerida:** criar `numberError(number, { partial })` em `roomRules.js`, no mesmo molde de `floorError`. Aceitar só texto com `trim()` não vazio, com teto de tamanho, e gravar o valor aparado. Usar a mesma função no Create e no Update (com `partial`). Testar null, vazio, espaços, objeto, lista e booleano.

### 🟡-3 [Validação · R-5] `:id` não-UUID em `PUT`/`DELETE /rooms/:id` e `PUT`/`DELETE /room-categories/:id` responde 500
**Onde:** `RoomApi/UpdateRoomController.js:31` · `RoomApi/DeleteRoomController.js:20` · `RoomCategoryApi/UpdateRoomCategoryController.js:17` · `RoomCategoryApi/DeleteRoomCategoryController.js:9`
**Cenário (reproduzido):** `PUT /rooms/abc {floor: 1}`, `DELETE /rooms/abc`, `PUT /room-categories/abc {name:"x"}` e `DELETE /room-categories/abc` → **500** `Erro interno do servidor`. A causa é o cast inválido de `abc` para uuid no Postgres.

O defeito já existia antes, mas a branch reescreveu os quatro controllers e criou `findInTenant` justamente para devolver 404 em id não-UUID, usando-o só para o `category_id` do corpo. O restante do sistema já responde 404 nesse caso (`ListReservationAccountsController.js:19`, `CreatePaymentController.js:39-40`).
**Regra violada:** R-5 ("nunca 500"). DRY: o utilitário existe e não foi usado no próprio arquivo.
**Correção sugerida:** buscar o recurso da rota por `findInTenant(RoomModel, id, tenantId, { transaction, lock })` (o utilitário precisa aceitar `lock`) ou fazer `if (!isUuid(id)) return 404` antes da busca. Os dois GETs equivalentes não estão no diff e foram repassados.

### 🟢-1 [Decisão de produto · R-3] CLEANING → MAINTENANCE está proibido
**Onde:** `app/utils/roomRules.js:17-22`
**Cenário (reproduzido):** a camareira encontra o chuveiro quebrado durante a limpeza. O quarto está CLEANING, e `PUT {status: "MAINTENANCE"}` responde 409. A recepção precisa passar por AVAILABLE (o quarto aparece em `/rooms/available` nesse intervalo) para só então colocá-lo em MAINTENANCE.

A regra segue o que foi delegado e o CLAUDE.md §3, que não lista essa transição. Para a governança, porém, a transição faz sentido.
**Correção sugerida:** é **decisão do Gabriel** (pendência 5 do executor). Se aprovada, basta incluir `CLEANING: ['AVAILABLE', 'MAINTENANCE']` e um teste.

Relacionado, e fora desta branch: o `CheckInController.js:31-35` não confere o status do quarto e faz check-in em quarto MAINTENANCE. Por isso a trava de status desta branch protege a edição, mas não o check-in.

### 🟢-2 [Testes] As travas `FOR UPDATE` do Update e do Delete não têm teste
**Onde:** `tests/rooms-categories-rules.test.js`
**Cenário:** mutações M5 e M6 (tirar o `lock` do `UpdateRoomController` e do `DeleteRoomController`): 65 de 65 testes continuam verdes. A garantia de não sobrescrever um check-in simultâneo, descrita no comentário de `UpdateRoomController.js:10-11`, não é verificada.

A leitura do código confirma que a trava do Update está certa. A edição espera o check-in e relê o status já confirmado, então OCCUPIED → AVAILABLE recebe 409. Mas uma futura refatoração pode removê-la sem nenhum aviso.
**Correção sugerida:** escrever um teste de corrida edição × check-in, junto com o teste do 🟡-1.

### 🟢-3 [Integridade] O `name` da categoria é validado aparado, mas gravado como veio
**Onde:** `RoomCategoryApi/CreateRoomCategoryController.js:19` · `UpdateRoomCategoryController.js:20`
**Cenário (reproduzido):** com a categoria "P" já cadastrada, `POST {name: "P "}` responde 201. Ficam duas categorias "P" na tela, e o índice único não as distingue. `"  Z7  "` é gravado com os espaços.
**Correção sugerida:** gravar `name.trim()`, como faz o `CreateProductController.js:17` (`trimmedName`).

### 🟢-4 [Swagger / cliente tipado] `PUT /rooms/{id}` não tem `requestBody`, e o `openapi.json` do api-client não foi regenerado
**Onde:** `config/swagger.js:816` · `frontend/packages/api-client/openapi.json` (não tem `RoomError`)
**Cenário:** a branch mudou a semântica do `status` no PUT (transição em vez de valor), mas o corpo do PUT continua sem documentação. O cliente tipado gera o PUT com body sem tipo. A falta já existia (também na develop). O snapshot do api-client segue sem o schema `RoomError` e com o enum antigo de status do POST.
**Correção sugerida:** documentar o `requestBody` do PUT (todos os campos opcionais; `status` com a descrição das transições permitidas). Rodar `pnpm gen:api` (pendência 3 do executor) no mesmo PR ou logo depois, antes da T-05.1 consumir o `code`.

### 🟢-5 [Consistência] O `category_id` é gravado como veio do corpo, não pelo id canônico do banco
**Onde:** `RoomApi/UpdateRoomController.js:50` · `RoomApi/CreateRoomController.js:31`
**Cenário:** um `category_id` em maiúsculas passa no `isUuid` (regex `/i`) e no Postgres. A resposta do PUT/POST devolve o id em maiúsculas, enquanto o `GET` devolve em minúsculas. O cliente que compara ids como texto vê duas categorias diferentes. O projeto já corrigiu isso nas reservas (N3, `UpdateReservationController.js:46-53`).
**Correção sugerida:** atribuir `category.id`, o valor devolvido por `findInTenant`.

### 🟢-6 [Dado legado · pendência 1 do executor] A limpeza de categoria cruzada também afeta os relatórios
**Onde:** `AnalyticsApi/GetAlertsController.js:37` · `AnalyticsApi/GetRevenueByCategoryController.js:25` (JOIN em `room_categories` só pela FK)
**Cenário:** se algum quarto já tiver sido gravado com categoria de outro hotel antes do fix, o relatório de receita por categoria do hotel A mostra o **nome** da categoria do hotel B. Isso não é vazamento novo: é consequência do dado contaminado, que a consulta da pendência 1 detecta.
**Correção sugerida:** incluir os relatórios na pendência 1, para conferir e corrigir o dado antes de confiar no analytics. Como defesa em profundidade, acrescentar `AND rc.tenant_id = r.tenant_id` nos JOINs quando alguém mexer nesses controllers.

## Repassados a outro dev

| Sev. | Achado | Onde | Dono | Repasse |
|------|--------|------|------|---------|
| 🟢 | `GET /rooms/:id` e `GET /room-categories/:id` com id não-UUID → 500 (fora do diff; mesma correção do 🟡-3) | `RoomApi/GetRoomController.js:8` · `RoomCategoryApi/GetRoomCategoryController.js:7` | Sirlande | `docs/qa/repasses/para_sirlande_30102026.md` |

## O que foi verificado e está correto
- **Varredura refeita (árvore 02ab6f4, 91 controllers).** Conferi toda FK de corpo, query string e rota:
  - Corpo: `category_id` (rooms, booking público), `guest_id`/`room_id`/`extra_room_ids` (reservas), `room_id` (add-room), `reservation_id`/`account_id` (payments, via `lockAccount` com tenant), `reservation_id`/`room_id`/`guest_id` (accounts, após o PR #101), `product_id` (itens), `corporate_client_id`/`quote_id` (contracts, quotes), `room_ids` (sign) e `installments[].id` (só casa com parcelas do contrato já filtrado).
  - Rota: `roomId`, `itemId`, `consumptionId` e `installmentId` estão sempre no `where` junto com o pai validado por tenant.
  - Leituras: todo `include` parte de uma raiz filtrada por tenant. O SQL cru do analytics filtra `tenant_id` na tabela raiz.
  - As rotas novas da develop também estão certas: `GET /reservations/:id/accounts` (T-04.6), `GET /analytics/internal-consumption` (T-04.7, só datas na query) e `POST /payments/:id/void`. A T-05.5 é frontend sobre endpoints que já existiam.
  - Os únicos `where` sem tenant são login/register/webhook (por desenho) e filhos de pai já validado.
- **`findInTenant`:** filtra tenant e respeita o soft delete (`RoomCategoryModel` tem `paranoid: true`). Id não-UUID responde 404, sem consulta ao banco. Outro hotel, inexistente e excluído recebem a mesma resposta 404, sem confirmar que o id existe.
- **R-3:** a allowlist do cadastro aceita só AVAILABLE | MAINTENANCE, e `status: null` cai no padrão AVAILABLE. Na edição valem AVAILABLE ↔ MAINTENANCE e CLEANING → AVAILABLE. Reenviar o status atual é aceito. MAINTENANCE → CLEANING/OCCUPIED recebe 409 `ROOM_STATUS_TRANSITION_NOT_ALLOWED`. A mutação M2 (liberar todas as transições) derruba 8 testes. A trava contra check-in concorrente está correta na ordem de locks (sem ciclo com o CheckIn, que trava reserva → quarto).
- **R-4/R-6 no caminho sequencial:**
  - Os 409 `CATEGORY_IN_USE` e `ROOM_IN_USE` funcionam para OCCUPIED, reserva PENDING/CONFIRMED/CHECKED_IN e **quarto extra** de reserva ativa (`rooms-categories-rules.test.js:280-289`).
  - Reserva excluída e CHECKED_OUT/CANCELLED não seguram o quarto.
  - Mutações M3 e M4 derrubam testes.
- **R-2:** `floor: 0` é gravado como 0. `1.5` recebe 400 `field: floor`.
- **R-5 (categoria):** objeto, lista, `true`, `"1e2"` e `0.1+0.2` recebem 400 `INVALID_INPUT` com `field`. `10.5` (número) é gravado como `"10.50"`.
- **Contrato:**
  - Os corpos de erro só ganharam campos. O 400 antigo `{errors}` continua e ganhou `error/code/field`. O `{error}` do PUT continua.
  - Os 409 de unicidade, no Create e no Update, passaram a ter `ROOM_NUMBER_TAKEN` e `CATEGORY_NAME_TAKEN` (reproduzido).
  - Os 404 de "Quarto/Categoria não encontrado(a)" continuam sem `code`, como está documentado.
  - O Swagger tem o schema `RoomError` e os 400/404/409 novos.
- **Testes, cobertura e checks (saída real):**
  - Branch pré-merge (26ff176): 41 arquivos, 901 passam, 1 skip.
  - Ponta 02ab6f4: `Test Files 47 passed (47)` · `Tests 1054 passed | 1 skipped (1055)` · Statements 85.21%, Branches 82.23%, Functions 89.46%, Lines 87.03%, acima do portão de 60%.
  - `qa_checks.sh`: `⚠ 3 aviso(s). Nenhum erro bloqueante.` São os mesmos 3 avisos da develop.
- **ESM:** nenhum `require()`. Nenhum `console.*` com PII no diff.

## Não foi possível verificar
- Dados reais em staging e produção (pendência 1). Não tenho acesso a ambiente com dado de hotel. A consulta do relatório do executor precisa ser rodada antes de declarar o vazamento encerrado **na base**.
- O 🟡-1 foi reproduzido com a transação de exclusão emulada passo a passo na sonda, não com duas chamadas HTTP disparadas no mesmo milissegundo. A sequência de locks é exatamente a do controller.
- O frontend da T-05.1 consumindo os `code` novos: a branch não mexe no frontend e o api-client não foi regenerado (🟢-4).
