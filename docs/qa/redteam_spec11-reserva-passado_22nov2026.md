# QA Red Team — SPEC-11 T-11.2, reserva com entrada no passado
**Branch:** fix/spec11-reserva-passado · **Dev:** Sirlande · **Base:** develop@cc959e4 · **Data:** 22/11/2026
**Arquivos auditados:** 7 (4 do backend, 1 de teste, 2 do cliente gerado)
**Achados no escopo:** 4 (🔴 1 · 🟡 1 · 🟢 2) · **Repassados:** 1

## Veredito
**REPROVADO.** O motivo é um só: o 🔴-1. A troca de datas pelo `PUT` ainda grava uma entrada no passado quando a data não chega como `YYYY-MM-DD` com dois dígitos. Reproduzi isso contra o banco de teste. A correção é pequena, uma validação de formato. O resto da entrega cumpre o CA-11.f.

## Achados no escopo

### 🔴-1 [regra de negócio / dinheiro] PUT aceita entrada no passado em formato não canônico e cobra as noites que não houve
**Onde:** `services/core-service/app/utils/checkInDateGuard.js:13-16`, chamado em `services/core-service/app/Controllers/ReservationApi/UpdateReservationController.js:75`. A gravação acontece em `UpdateReservationController.js:100-104`.
**Cenário (reproduzido com supertest no banco de teste, hoje = 2026-11-22):**
- A reserva PENDING vai de 25/11 a 30/11. O `PUT /reservations/:id` recebe `{ "check_in_date": "2026-11-3" }`.
  - A comparação de texto dá `'2026-11-3' < '2026-11-22'` = false, porque `'3' > '2'`. A regra não barra.
  - O 400 da linha 72 também não barra, porque `'2026-11-30' <= '2026-11-3'` é false.
  - O Sequelize normaliza o valor para `2026-11-03` no `save`. O `recalculateReservationTotal` recalcula sobre a data já normalizada.
  - Resultado: **200**. O banco fica com `check_in_date = 2026-11-03` e `total_amount = 2700.00`, ou seja, 27 noites em vez de 5. O `PUT /check-in` seguinte responde **200**, porque a janela aceita a chegada atrasada.
- O mesmo `PUT` com `{ "check_in_date": 20261121 }` (número) faz `20261121 < '2026-11-22'` virar `NaN`, que dá false. O moment lê o número como epoch em ms. Resultado: **200**, com `check_in_date = 1970-01-01` e `total_amount = 2078700.00`. O check-in também passa com 200.

Esse é exatamente o caso que o CA-11.f pede para barrar: "troca de datas com entrada antes de hoje → 422". A guarda supõe o formato DATEONLY (comentário da linha 9), mas ninguém garante esse formato no `PUT`. No `POST` o mesmo buraco não aparece só por sorte: o `countNights` de `calculateStayTotal.js:49` faz `Date.parse('2026-11-3T00:00:00Z')`, que dá NaN, e a criação cai em 400 antes de gravar (também reproduzido). O `PUT` não tem essa proteção porque recalcula **depois** do `save`, sobre o valor que o Sequelize já normalizou.

O caso do número já existia antes da branch. O que é desta branch é a regra nova se apoiar numa comparação de texto que esse valor contorna. Com isso a entrega não cumpre o próprio critério.
**Regra violada:** CA-11.f. CLAUDE.md: total recalculado no servidor sobre dado inválido, que é risco financeiro.
**Correção sugerida:** na guarda, ou no começo do `PUT` e do `POST`, aceitar só `typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)` e uma data real (por exemplo, `Date.parse(v + 'T00:00:00Z')` não pode ser NaN). Fora disso, 400. Somar dois testes: `'2026-11-3'` e `20261121` no `PUT`.

### 🟡-1 [testes] A suíte nova só exercita datas bem formadas
**Onde:** `services/core-service/tests/reservation-past-check-in.test.js:20-123`
**Cenário:** todos os casos usam `addDays(HOJE, n)`, que sempre devolve `YYYY-MM-DD`. Por isso os 11 testes e os 4 mutantes passam com o 🔴-1 aberto. Nenhum caso cobre data sem zero à esquerda, número, ISO com hora, `null` ou array.
**Regra violada:** checklist de testes, porque o teste passaria com a regra de negócio quebrada.
**Correção sugerida:** os casos de formato inválido do 🔴-1, mais um `PUT` com `check_in_date: null`. Hoje esse `PUT` responde 500 por `notNull Violation`. Isso já existia antes da branch (`UpdateReservationController.js:65` usa `??`, mas a linha 100 grava o `null`), mas cabe no mesmo teste.

### 🟢-1 [robustez] Valor que não é string e passa na comparação dá 500 dentro do `checkInInPastError`
**Onde:** `services/core-service/app/utils/checkInDateGuard.js:18` (`iso.split`)
**Cenário:** `POST /reservations` com `check_in_date: ["2026-11-01"]`. O array vira a string `'2026-11-01'`, que é menor que hoje. O `brDate` chama `.split` no array e lança `TypeError: iso.split is not a function`, e a resposta é **500**. Isso foi reproduzido. Nada é gravado. A validação de formato do 🔴-1 resolve junto.

### 🟢-2 [contrato / mensagem] Texto do 422 sai quebrado com ISO e a doc do PUT omite um 422 sem code
**Onde:** `checkInDateGuard.js:18`; `services/core-service/config/swagger.js:264-271` e `:1049`
**Cenário:**
- Com `check_in_date: '2026-11-21T10:00:00'`, o 422 diz "A data de entrada (21T10:00:00/11/2026) já passou". Isso foi reproduzido.
- A descrição do `ReservationDateError` diz que o 422 sem code acontece "só na criação". Mas o `PUT` também devolve 422 sem code quando a categoria não tem preço: `recalculateReservationTotal` chama `calculateStayTotal.js:40`, e a resposta sai em `UpdateReservationController.js:115`. A descrição do 422 do `PUT` (`swagger.js:1049`) também cita só o `CHECK_IN_IN_PAST`. O `schema.d.ts` regerado bate com o `swagger.js`, então o desvio fica só no texto. O tipo (`code?` opcional) continua correto.
**Correção sugerida:** a validação de formato resolve a mensagem. Na doc, trocar "(só na criação)" por "(criação e troca de quarto/datas)".

## Repassados a outro dev

| Sev. | Achado | Onde | Dono | Repasse |
|------|--------|------|------|---------|
| 🟡 | A assinatura de contrato B2B cria a reserva-bloco com `contract.check_in` no passado, sem a régua do CA-11.f. Pode ser uma decisão de produto | `services/core-service/app/Controllers/ContractApi/SignContractController.js:99-104` | Gabriel (T-01.2) | `docs/qa/repasses/para_gabriel_22112026.md` |

## O que foi verificado e está correto
- `POST` com entrada ontem dá 422 com `code: CHECK_IN_IN_PAST` e não grava nada. Com entrada hoje dá 201. A regra roda depois do 400 de campos (`CreateReservationController.js:27-31`) e antes de qualquer leitura ou escrita.
- `POST` com `'2026-11-3'`, `'2026-1-5'`, número, ISO com hora e string com espaço não grava no passado. Uns dão 422, outros dão 400 pelo `countNights`. Todos reproduzidos.
- No `PUT`, a regra roda dentro do bloco `roomChanged || datesChanged`, depois do lock (`:39-43`), da trava B2B/CHECKED_OUT/CANCELLED (`:70-71`) e do 400 (`:72`), e **antes** de qualquer escrita (o primeiro `save` está em `:104`). O `fail` faz rollback.
- `reservation.check_in_date` lido do Sequelize é string `'YYYY-MM-DD'` (DATEONLY; conferido com `typeof` na resposta). A comparação com a data reenviada funciona para o caso canônico.
- Estender a saída de uma reserva CHECKED_IN que entrou ontem, reenviar a mesma entrada e trocar o quarto de uma chegada atrasada PENDING continuam dando 200. Os testes cobrem os três.
- O "hoje" vem de `todayInHotel()` (America/Sao_Paulo). O teste da virada às 01:30 UTC está correto.
- `tenant_id`: a branch não cria query nova. Os imports são ESM e não há `require`.
- A reserva pública (`PublicBookingApi/CreateBookingController.js`) e o `CheckInController` ficaram intocados.
- O `openapi.json` e o `schema.d.ts` refletem o `swagger.js`. O `422` do `POST` passou de `Error` para `ReservationDateError`, que é compatível com o anterior: `error` obrigatório e `code` opcional.

## Não foi possível verificar
- O e2e (`pnpm e2e`) não rodou porque não há Docker neste WSL. Fica com o CI.
- O typecheck do pms não rodou de novo. Usei a verificação do autor.
- A tela de edição de reserva do PMS não foi auditada. O que ela manda no `PUT` (sempre `YYYY-MM-DD`?) só reduz a chance do 🔴-1 pela interface. Não fecha a API para quem a chama direto, pelo Swagger ou por script.

---

## Tratamento (Sirlande, 22/11)

| # | O que foi feito |
|---|---|
| 🔴-1 | `app/utils/isIsoDate.js`: só string `YYYY-MM-DD` que existe no calendário. POST e PUT respondem 400 antes da regra da entrada no passado; no PUT, antes do lock |
| 🟡-1 | Casos novos no teste: `2026-11-3`, data com hora, `dd/mm/aaaa`, `2026-02-30`, número, array, `''` e, no PUT, `null` (que dava 500). Agora são 27 casos |
| 🟢-1 | O array dá 400 pelo mesmo `isIsoDate` |
| 🟢-2 | Descrições do swagger corrigidas e cliente regerado |
| Repasse | B2B com entrada no passado: `para_gabriel_22112026.md` |

Suíte do core depois do tratamento: 67 arquivos e 1335 testes verdes.
