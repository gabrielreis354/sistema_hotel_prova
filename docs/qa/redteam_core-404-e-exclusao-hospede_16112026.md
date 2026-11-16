# QA Red Team — 404 para :id inválido nos routers + exclusão de hóspede com reserva ativa
**Branches:** `fix/id-invalido-404-routers` e `fix/excluir-hospede-com-estadia` · **Dev:** Sirlande · **Base:** develop@bb5032b · **Data:** 16/11/2026
**Arquivos auditados:** 20 (11 + 9)
**Achados no escopo:** 7 (🔴 0 · 🟡 0 · 🟢 7) · **Repassados:** 0

---

# Branch 1 — `fix/id-invalido-404-routers`

## Veredito
**APROVADO**

## Achados no escopo

### 🟢 [Contrato] Ordem `router.param` x `requireRole`: papel sem permissão recebe 404 em vez de 403 quando o id é inválido
**Onde:** `routes/apis/userRouter.js:19` (com `:22,24,25`), `roomRouter.js:21` (com `:28,30,32,33`), `guestRouter.js:18` (com `:24`), `paymentRouter.js:18` (com `:35-37`), `contractRouter.js:19`, `corporateClientRouter.js:15`, `eventQuoteRouter.js:18`, `roomCategoryRouter.js:19`
**Cenário:** um RECEPTIONIST chama `GET /users/abc` e recebe `404 {"error":"Usuário não encontrado"}`. Com um UUID válido, recebe 403. O WAITER também recebe 404 em `GET /rooms/abc`, e 403 em `GET /rooms/<uuid>`. O Express roda o callback de `router.param` antes da pilha da rota.
**Avaliação de vazamento:** não há vazamento. O 404 depende só do formato da string, sem nenhuma consulta ao banco, então não confirma nem nega a existência de um registro, e nada depende do tenant. O papel sem permissão não lê nenhum dado. O efeito é só a precedência de status ficar inconsistente (403 deveria vencer). Isso é aceitável no MVP.
**Correção sugerida (opcional):** nenhuma é necessária. Se quiser precedência estrita, aplique `requireRole` no `router.use` dos routers só para ADMIN (`userRouter`). Ou documente no comentário do utilitário que o 404 de formato vem antes do 403.

### 🟢 [Contrato] `DELETE /payments/<não-uuid>` agora responde 404, e não o 405 que ensina o caminho do estorno
**Onde:** `routes/apis/paymentRouter.js:18` e `:37`
**Cenário:** um cliente antigo faz `DELETE /payments/abc` e recebe 404 "Pagamento não encontrado." no lugar do 405 com a instrução de usar `POST /payments/:id/void`. Um cliente real sempre manda UUID, então o efeito prático é nulo. A rota 405 também não está no teste novo.
**Correção sugerida:** nenhuma é obrigatória. Se quiser, inclua `['delete', '/payments/x', …]` em `tests/invalid-id-routers.test.js` para fixar o comportamento escolhido.

### 🟢 [Testes] Falta caso de papel restrito com id inválido
**Onde:** `tests/invalid-id-routers.test.js:60-76`
**Cenário:** o teste roda só como ADMIN. Se a ordem mudar (por exemplo, a guarda migrar para dentro do controller), nenhum teste registra se o garçom recebe 403 ou 404. Isso só documenta o comportamento e não protege uma regra.
**Correção sugerida:** um caso com WAITER em `GET /rooms/x` que fixe o status escolhido.

## O que foi verificado e está correto
- **Rota com `:id` que não é UUID por natureza:** nenhuma nos 9 routers cobertos. As rotas literais (`/rooms/available`, `/`) não têm `:id`, e `router.param` só dispara em rota que declara o parâmetro. `/available` continua antes de `/:id` (`roomRouter.js:25`). Nenhum outro router é montado no mesmo prefixo (`routes/router.js:78-98`), então o 404 do param não intercepta rota de outro router. O `tenantRouter` usa `/me`, e o `publicBookingRouter` (`:subdomain`, slug) não foi tocado.
- **Mensagens:** cada mensagem do `notFoundUnlessUuid` bate com o 404 do controller correspondente (git grep em `app/Controllers/*Api`), incluindo o ponto final de "Pagamento não encontrado." e "Parcela não encontrada".
- **Ordem auth:** `router.use(authMiddleware, tenantMiddleware)` vem antes dos `router.param` em todos os routers. Sem token, a resposta continua 401 (teste em `:66`).
- **ESM:** sem `require`. `isUuid` foi reaproveitado (DRY), e o refactor do `reservationRouter` manteve as mensagens.
- **Swagger/contrato:** a branch não toca no `swagger.js`. O 404 de id inválido usa o mesmo corpo `Error` que o 404 já documentado, então o cliente gerado não muda.
- O `:installmentId` está coberto (`contractRouter.js:20`, teste `:47`).

## Não foi possível verificar
- Não rodei a suíte. Usei como base o relato de 1287 testes passando.
- Não verifiquei `productRouter` e `accountRouter`, que estão fora do diff e fora da lista do repasse de 15/11.

---

# Branch 2 — `fix/excluir-hospede-com-estadia`

## Veredito
**APROVADO**

## Achados no escopo

### 🟢 [Integridade] A conta avulsa (DAY_USE ou DIRECT) aberta com o hóspede não entra na checagem
**Onde:** `app/Controllers/GuestApi/DeleteGuestController.js:31-35`. O vínculo vem de `db/schema.sql:313` (`accounts.guest_id`) e de `CreateAccountController.js:19-23`: DAY_USE e DIRECT aceitam `guest_id` sem reserva.
**Cenário:** a recepção abre uma conta DAY_USE com `guest_id = G` e status OPEN. `DELETE /guests/G` responde 204, porque a checagem só olha `reservations`. A conta aberta passa a apontar para um hóspede excluído (a FK não enxerga `deleted_at`). Os controllers de leitura de conta não incluem o `GuestModel` (git grep em `AccountApi`) e a conta tem `label` próprio, então o dano visível hoje é baixo. Por isso é 🟢.
**Regra violada:** nenhuma regra escrita. A decisão de 16/11 fala só de reserva. A pergunta "o hóspede está só em `reservations.guest_id`?" tem resposta não: ele também está em `accounts.guest_id`. Na conta ROOM o vínculo é coberto pela reserva (`reservationRoomAccount.js:136,180` copia o `reservation.guest_id`, e a conta ROOM exige reserva). No multi-quarto o hóspede é único por reserva, porque o pivô `reservation_rooms` não tem `guest_id`.
**Correção sugerida:** levar a decisão ao produto. Se valer a mesma regra, acrescente `AccountModel.findOne({ where: { guest_id, tenant_id, status: 'OPEN' } })` ao 409.

### 🟢 [Concorrência] A limitação declarada está incompleta: além da criação, a troca de hóspede na reserva e as outras portas de criação também escapam
**Onde:** o comentário em `DeleteGuestController.js:14-16`. Os caminhos são `CreateReservationController.js:30` (lê o hóspede fora da transação), `UpdateReservationController.js:47` (lê na transação, sem trava), `SignContractController.js:101` e `PublicBookingApi/CreateBookingController.js:189`.
**Cenário:** a corrida é real só nesta ordem. A exclusão trava o hóspede (FOR UPDATE). Em paralelo, um `PUT /reservations/:id { guest_id: G }` já leu G. O INSERT/UPDATE da reserva pede KEY SHARE pela FK e espera. A exclusão comita (o UPDATE de `deleted_at` não muda a chave), a FK passa e a reserva ativa fica com o hóspede excluído. Na ordem inversa a trava fecha a corrida: o FOR UPDATE espera o KEY SHARE da FK e a consulta seguinte, em READ COMMITTED, já vê a reserva e dá 409. A probabilidade é baixa, e o caso está aceito como limitação.
**Correção sugerida:** só ajustar o comentário para citar as quatro portas, para que quem fizer o KEY SHARE depois não corrija só a criação.

### 🟢 [Contrato] O 409 do hóspede não tem `code`, ao contrário do 409 do quarto
**Onde:** `DeleteGuestController.js:37`, comparado com `DeleteRoomController.js:47` (`roomError(ROOM_ERROR_CODES.ROOM_IN_USE, …)`)
**Cenário:** hoje o frontend só exibe `error.error` (`guestsApi.ts:70`), o que basta. Se aparecer um segundo motivo de 409 no DELETE (por exemplo, a conta avulsa do achado acima), a tela não consegue distinguir os dois sem casar o texto.
**Correção sugerida:** opcional. Use um `code: 'GUEST_HAS_ACTIVE_RESERVATION'` no corpo e `Error` com `code` no swagger.

### 🟢 [Testes] Sem teste de tenant no caminho transacional novo
**Onde:** `tests/guest-delete-active-stay.test.js`. O `tests/guests.test.js:112` também só exclui no próprio tenant.
**Cenário:** o caminho trocou `findOne` por `findInTenant` com trava. Se alguém tirar o `tenantId` da chamada, nenhum teste de exclusão falha por causa de um tenant B que exclui hóspede do tenant A. O código está correto hoje (`DeleteGuestController.js:28`, `findInTenant.js:31`).
**Correção sugerida:** um caso com um segundo `registerAndLogin` e `DELETE /guests/<id do A>` → 404, conferindo que o hóspede continua existindo.

## O que foi verificado e está correto
- **Multi-tenancy:** o hóspede é buscado por `findInTenant(GuestModel, id, tenantId)` com o `tenantId` do JWT (`request.user.tenantId`). A busca da reserva filtra `tenant_id` e `guest_id` (`:32`). Não há `findByPk`.
- **Allowlist:** `ACTIVE_RESERVATION_STATUSES = ['PENDING','CONFIRMED','CHECKED_IN']` (`reservationStatuses.js:10`) é fail-safe. CHECKED_OUT e CANCELLED liberam, e há teste dos 5 status mais o caso sem reserva.
- **Transação:** o rollback acontece em todo retorno antecipado (`fail`) e no `catch` (`!transaction.finished`). O destroy roda dentro da transação, e o outbox de `guests` é um trigger de banco (`database/applyDbConstraints.js`), então entra na mesma transação.
- **Ciclo de import:** não há. `reservationStatuses.js` não importa nada, e `roomRules.js` → `reservationStatuses.js` é uma aresta só. `ROOM_HOLDING_RESERVATION_STATUSES` passa a ser a mesma referência, com o mesmo conteúdo de antes.
- **Contrato da API:** regenerei o `openapi.json` com `scripts/dump-openapi.mjs` num worktree temporário da branch, e o resultado ficou idêntico ao versionado. O `schema.d.ts` do diff corresponde às respostas 404 e 409 novas. O job "Contrato da API em dia" deve passar.
- **Frontend:** `GuestDetailPage.tsx:127` exibe o `ApiError.message`, então o motivo do servidor chega à tela. O 403 continua antes do 409, e o 500 mantém o "Tente novamente".
- **LGPD/log:** `console.error('DeleteGuestController:', error)` registra o erro, sem o objeto de request ou de hóspede. A consulta de reserva usa `attributes: ['id']`.

## Não foi possível verificar
- Não rodei a suíte nem o `openapi-typescript`. Comparei o `schema.d.ts` lendo o diff.
- Não reproduzi a corrida com duas conexões. A análise de locks foi feita pela semântica de FOR UPDATE contra a KEY SHARE da FK no Postgres.

---

## Repassados a outro dev
nenhum

## Desfecho (Sirlande, 16/11)

As duas branches foram aprovadas sem 🔴 nem 🟡.
- **Branch 2:** o comentário da limitação da corrida no `DeleteGuestController` agora lista os quatro pontos que gravam referência ao hóspede sem KEY SHARE e a conta DAY_USE/DIRECT.
- **Demais 🟢** (404 antes de 403, `DELETE /payments/<não-uuid>`, 409 sem `code`, teste de tenant no caminho transacional): ficam registrados aqui, sem mudança.
- **Conta DAY_USE/DIRECT aberta com o hóspede:** é decisão de produto, levada ao Sirlande.
