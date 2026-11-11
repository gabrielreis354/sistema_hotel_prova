# QA Red Team — exclusão e check-in cancelam o sinal PIX; CPF da reserva pública por dígitos
**Branch:** fix/pix-exclusao-checkin-cpf · **Dev:** Gabriel (agente executor) · **Base:** develop@4f7c537 · **Data:** 11/11/2026
**Arquivos auditados:** 6 (diff `origin/develop...109f2fa`, commits `bb729c5` e `109f2fa`), mais o contexto lido inteiro: `PixWebhookController.js`, `AsaasPixProvider.js`, `PaymentModel.js`, `GuestModel.js`, `db/schema.sql`, `applyDbConstraints.js`, `ListGuestController.js`, `CreateGuestController.js`, `UpdateGuestController.js`, `GetBookingStatusController.js`, `SignContractController.js`, `reservationRouter.js`
**Achados no escopo:** 5 (🔴 0 · 🟡 1 · 🟢 4) · **Repassados:** 1

## Veredito
**APROVADO COM RESSALVAS**

Não há 🔴 no escopo. Os três consertos fazem o que prometem, e nenhum caminho novo deixa o QR pagável nem cancela cobrança indevida. A ressalva é o 🟡-1: a busca do CPF por `regexp_replace` deixa de usar o índice `guests_cpf_tenant_unique` e passa a varrer a tabela `guests` inteira, de todos os hotéis, a cada reserva pública. Hoje a base é pequena e o efeito não aparece. Ele cresce com o número de hotéis.

## Achados no escopo

### 🟡-1 [Desempenho · endpoint público] A busca do CPF por dígitos varre a tabela `guests` de todos os tenants, dentro da transação da reserva
**Onde:** `services/core-service/app/Controllers/PublicBookingApi/CreateBookingController.js:159-166`
**Cenário:**
1. Antes da branch, `where: { tenant_id, cpf }` usava o índice parcial `guests_cpf_tenant_unique (cpf, tenant_id)` (`db/schema.sql:124-126`).
2. Agora o filtro é `regexp_replace(cpf, '\D', '', 'g') = :digits AND tenant_id = :t`. Nenhum índice serve para isso. Os únicos índices de `guests` são `(cpf, tenant_id)` e `(email, tenant_id)` (`db/schema.sql:124-130`, `applyDbConstraints.js:103-104`, `GuestModel.js:41-60`), e nenhum começa por `tenant_id`. A FK de `tenant_id` não cria índice no Postgres.
3. Com isso, cada `POST /public/:subdomain/bookings` com CPF faz um seq scan de `guests` inteiro (todos os hotéis do SaaS) e roda a regex em cada linha do tenant. O endpoint não tem autenticação. A varredura acontece com a transação aberta e o `KEY SHARE` no quarto (`:132`), então a transação fica aberta mais tempo.
4. Com 200 hotéis e 5 mil hóspedes cada, são 1 milhão de linhas lidas por reserva pública. O tempo da transação cresce com a base de todos os clientes, não com a do hotel.

**Regra violada:** KISS/desempenho. É uma regressão de plano de execução num endpoint público. O `ListGuestController` usa a mesma expressão, mas é autenticado e paginado.
**Correção sugerida (a menor):** um índice funcional parcial, em `db/schema.sql` e em `applyDbConstraints.js`:
`CREATE INDEX guests_cpf_digits_tenant_idx ON guests (tenant_id, regexp_replace(cpf, '\D', '', 'g')) WHERE deleted_at IS NULL;`
A expressão do índice precisa ser idêntica à do `where`. Alternativa definitiva: normalizar o CPF na gravação em todo o `GuestApi` e fazer uma migração única dos CPFs existentes (ver o repasse). Depois disso, a busca volta a ser igualdade simples e usa o índice que já existe. Não rodei `EXPLAIN` (ver "Não foi possível verificar").

### 🟢-1 [Testes] Nenhum teste cobre "o mais antigo vence" nem o isolamento entre tenants na busca por dígitos
**Onde:** `services/core-service/tests/public-booking.test.js:343-385`; a regra fica em `CreateBookingController.js:164`
**Cenário:** se alguém tirar o `order: [['created_at', 'ASC']]`, os três testes novos continuam verdes. Nenhum deles cria dois cadastros com os mesmos dígitos (um com máscara e outro sem), e é exatamente para esse caso que o `order` existe. Também falta um caso com o mesmo CPF cadastrado em outro hotel. A leitura confirma que o `tenant_id: tenant.id` está no `where`, mas um refactor que o tirasse passaria nos testes. O helper `guestsWithCpfDigits` (`:345-351`) conta hóspedes sem filtrar por tenant e não ajudaria a pegar isso.
**Regra violada:** checklist §8 ("teste que passaria mesmo com a regra quebrada"; "falta teste de isolamento entre tenants").
**Correção sugerida:** (a) criar `'11144477735'` e depois `'111.444.777-35'` direto pelo model, reservar com qualquer forma e afirmar que `guest_id` é o primeiro; (b) criar o CPF num segundo tenant e afirmar que a reserva no hotel A não usa aquele `guest_id`.

### 🟢-2 [Testes] O check-in não tem teste com o PSP fora do ar nem do guard `wasPending`, e o teste depende da ordem no arquivo
**Onde:** `services/core-service/tests/asaas-webhook.test.js:597-626`; o código fica em `CheckInController.js:65` e `:85`
**Cenário:** a exclusão tem o teste "Asaas fora do ar", mas o check-in não. Se `cancelPendingCharges` passasse a lançar, ou se a chamada fosse para dentro da transação, nenhum teste do check-in pegaria o 500. Também não há caso de check-in a partir de `CONFIRMED` afirmando zero `DELETE`. Hoje isso não muda o resultado, porque `CONFIRMED` só nasce do webhook PAID (`PixWebhookController.js:162`) ou do contrato (`SignContractController.js:106`, sem PIX). O guard ficaria sem rede se surgir uma confirmação manual. Por fim, o comentário da linha 597 ("Fica por último no arquivo") deixa explícito que o teste depende da ordem dos `describe`, e isso quebra em silêncio quando alguém acrescenta um bloco no fim.
**Regra violada:** checklist §8 (só o caminho feliz).
**Correção sugerida:** acrescentar `asaasDown = true` no check-in (espera 200, `CHECKED_IN`, sinal `PENDING` e o id no log). Usar um quarto próprio criado no teste, em vez de depender da posição no arquivo.

### 🟢-3 [Operação] Check-in e exclusão esperam o PSP antes de responder, com até 10 s de latência
**Onde:** `services/core-service/app/Controllers/ReservationApi/CheckInController.js:85`, `DeleteReservationController.js:117` (via `AsaasPixProvider.js:9`, `TIMEOUT_MS = 10000`)
**Cenário:** com o Asaas lento, a recepção fica com o check-in de uma reserva online `PENDING` girando por até 10 s, embora o check-in já esteja gravado. Se ela recarregar e tocar de novo, recebe 422 `Check-in não permitido no status 'CHECKED_IN'`, uma mensagem que soa como erro para algo que deu certo. O `CancelReservationController` já tem o mesmo padrão, então isso é consistente, não regressão. Só o check-in de reserva com sinal PIX `PENDING` paga esse custo. Check-in de balcão faz só uma query.
**Regra violada:** nenhuma regra escrita. É ergonomia do balcão.
**Correção sugerida:** aceitar como está e registrar, ou disparar sem `await` (`void cancelPendingCharges(...)`). A função nunca lança, então isso é seguro, ao custo de perder o cancelamento num shutdown no meio da chamada. Nesse caso, ele cai no mesmo log de conciliação que já existe.

### 🟢-4 [DRY · produto] A expressão de dígitos é copiada do `ListGuestController`, e a regra "check-in de PENDING cancela o sinal" não está registrada como decisão
**Onde:** `CreateBookingController.js:162` repete `digitsOf` de `ListGuestController.js:25-27`, que não é exportado. A regra fica em `CheckInController.js:83-85`.
**Cenário:** (a) se um dia a normalização mudar (por exemplo, para aceitar passaporte alfanumérico), as duas cópias divergem, e a busca da recepção deixa de achar o que a reserva pública grava. (b) O repasse de origem pedia "decidir a regra de produto", e a branch escolheu cancelar o sinal. A decisão vive só num comentário. O site público passa a mostrar `deposit.status: 'FAILED'` (`GetBookingStatusController.js:37-47`) para uma reserva `CHECKED_IN`. O hóspede que abre o link vê "sinal falhou" já hospedado.
**Regra violada:** DRY (CLAUDE.md §7, "lógica de negócio duplicada"). Decisão de produto sem registro (CLAUDE.md §3 registra as regras de walk-in).
**Correção sugerida:** extrair `digitsOf(column)` para `app/utils/` e usar nos dois controllers. Registrar a decisão no §3 do CLAUDE.md, junto da nota de walk-in, ou no relatório de sessão. Se o "FAILED" no status público incomodar, o front público pode tratar `status !== 'PENDING' && status !== 'CONFIRMED'` sem olhar o sinal.

## Repassados a outro dev

| Sev. | Achado | Onde | Dono | Repasse |
|------|--------|------|------|---------|
| 🟡 | O balcão ainda grava e compara o CPF cru. Com o site gravando só dígitos, a recepção que digita com máscara cria o segundo cadastro | `GuestApi/CreateGuestController.js:12-20`, `GuestApi/UpdateGuestController.js:20` | DONO INDEFINIDO | `docs/qa/repasses/para_dono-indefinido_11112026.md` |

## O que foi verificado e está correto

**Dinheiro: algum caminho ainda deixa o QR pagável?**
- **Exclusão:** `cancelPendingCharges(reservation)` roda depois do commit (`DeleteReservationController.js:117`) e cobre todos os kinds. Os pagamentos não somem com a reserva: o `PaymentModel` é paranoid, mas o `destroy` da reserva não faz cascata no soft delete, e o teste confirma `FAILED`. A rota segue `requireRole('ADMIN')` (`reservationRouter.js:31`).
- **Check-in a partir de `CONFIRMED`:** não cancela, e não precisa. `CONFIRMED` só nasce do webhook PAID, com o sinal já pago, ou do contrato B2B, sem PIX. Não existe hoje uma reserva `CONFIRMED` com sinal `PENDING`.
- **Caminhos que continuam pagáveis, todos por desenho e com log de conciliação:** PSP fora do ar no cancelamento; cobrança de outro provider (`cancelPendingCharges.js:36-38`); reserva `PENDING` que nunca recebe check-in, cancelamento ou exclusão (no-show), já registrado em `AsaasPixProvider.js:172-174` como job de expiração futuro. Nenhum desses caminhos é novo.

**O check-in pode cancelar o que não devia?**
- O filtro `kind: ['DEPOSIT']` vira `IN` e vem só do código. `createCharge` é chamado em um único lugar (`CreateBookingController.js:109`), e o único pagamento PIX com `provider_charge_id` nasce como `DEPOSIT` (`:206`). A recepção não gera QR PIX hoje (grep de `createCharge` em `app/`), então "QR de saldo da recepção cancelado no check-in" não acontece. O filtro protege o dia em que esse QR existir, e o teste com `kind: 'FULL'` cobre isso.

**Corrida com o webhook PAID:**
- **Check-in primeiro:** o webhook espera o lock da reserva, vê `CHECKED_IN` e grava PAID com aviso. `cancelPendingCharges` ou lê `PAID` e pula, ou lê `PENDING` antes do commit do webhook e chama `DELETE`. O Asaas recusa apagar cobrança recebida (não-2xx vira `PixProviderUnavailableError`, que é capturada e logada), e o `update` condicional (`status: 'PENDING'`, `cancelPendingCharges.js:44-47`) não sobrescreve o PAID.
- **Hóspede já pagou, mas o webhook atrasou** (por exemplo, fila do Asaas pausada): mesmo caminho. `DELETE` recusado, log, e o PAID entra depois. Não há perda.

**Multi-tenancy:**
- `cancelPendingCharges` filtra por `tenant_id` + `reservation_id` da reserva lida com `tenant_id` do JWT, e o `update` repete o `tenant_id`.
- O `where` do CPF tem `tenant_id: tenant.id`, resolvido pelo subdomínio e nunca pelo body. O teste de isolamento da exclusão (hotel B → 404, zero `DELETE`) está correto.

**Índice `guests_cpf_tenant_unique` × CPF normalizado:**
- A gravação só com dígitos não colide com um cadastro antigo mascarado. O índice compara a string crua, e `'11144477735'` ≠ `'111.444.777-35'`.
- Também não colide com um cadastro só de dígitos vivo, porque a busca por dígitos o teria achado antes do `create`.
- Cadastro soft-deletado fica fora da busca (paranoid) e do índice (parcial `WHERE deleted_at IS NULL`).
- O efeito colateral real é o contrário: o índice não garante unicidade por dígitos. Isso foi repassado.

**Outros pontos conferidos:**
- `onlyDigits` devolve `null` para vazio, então hóspede sem CPF continua `NULL` e não `''`, e não queima o índice.
- `guest.cpf` vindo como array ou objeto vira string e não `IN()`, o que melhora o comportamento de antes.
- O literal `'\D'` chega certo ao Postgres: o escape do Sequelize para postgres só dobra aspas, e os testes passam.
- Contrato da API: as respostas de check-in (200 + reserva), da exclusão (204) e da reserva pública não mudaram, e o Swagger não precisa de ajuste.
- ESM, sem `require()`. Chamadas ao PSP fora da transação e sem lançar.

## Não foi possível verificar
- **`EXPLAIN ANALYZE` da busca por dígitos.** O 🟡-1 se apoia na leitura dos índices declarados (`schema.sql`, `applyDbConstraints.js`, `GuestModel.js`), não em plano medido. Para confirmar, rode `EXPLAIN SELECT ... WHERE tenant_id = $1 AND regexp_replace(cpf,'\D','','g') = $2` numa base com milhares de hóspedes.
- **Não rodei a suíte de novo.** Uso o resultado informado: 1198 passaram e 21 foram pulados contra Postgres 17, igual ao develop.
- **Comportamento real do `DELETE /payments/{id}` do Asaas para cobrança já recebida.** Assumi a documentação e o comentário de `AsaasPixProvider.js:186-187` (não-2xx). Não testei no sandbox.

## Desfecho (Gabriel, orquestrando Claude Code — 11/11)

| Achado | Desfecho |
|---|---|
| 🟡-1 Busca do CPF sem índice | ✅ Corrigido. Índice `idx_guests_tenant_cpf_digits (tenant_id, regexp_replace(cpf, D, , g)) WHERE deleted_at IS NULL` em `applyDbConstraints.js` e `schema.sql`. Um teste faz `EXPLAIN` do SQL que o Sequelize gera de fato e exige o índice no plano. Sem o índice, o teste falha (conferido removendo o índice e rodando). |
| 🟢-1 Testes do CPF | ✅ Parcial. Entrou o caso do mesmo CPF em outro hotel. O desempate por `created_at` fica sem teste: dois cadastros com os mesmos dígitos no mesmo hotel só existem em base legada. |
| 🟢-2 Testes do check-in | Pendente. O caminho do Asaas fora do ar é o mesmo `cancelPendingCharges` já coberto no cancelamento e na exclusão. |
| 🟢-3 Latência do PSP na resposta | Pendente, por consistência com o cancelamento. Vale decidir junto para os três endpoints. |
| 🟢-4 DRY e regra de produto | ✅ `digitsOf` foi para `app/utils/digitsOf.js`, usado pela busca de hóspedes e pela reserva pública. A regra "check-in de PENDING cancela o sinal" fica no relatório da sessão, como proposta para o §3 do CLAUDE.md. |
| Repasse 🟡 (balcão grava o CPF cru) | Fica com o Gabriel atribuir. Não é regressão desta branch: antes dela, o site também gravava a string crua. |

Suíte do core depois das correções: 1200 passaram, 21 pulados.
