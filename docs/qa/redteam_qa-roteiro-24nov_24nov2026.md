# QA Red Team — correções do QA do roteiro (24/11)
**Branch:** fix/qa-roteiro-24nov · **Dev:** Sirlande (com IA) · **Base:** develop@bf9cafe · **Data:** 24/11/2026
**Arquivos auditados:** 39 (11 commits, `a9525a5`..`8944e9d`)
**Achados no escopo:** 9 (🔴 0 · 🟡 2 · 🟢 7) · **Repassados:** 0

## Veredito
**APROVADO COM RESSALVAS**

Nenhum 🔴 no escopo. Tenant, contrato e máquinas de estado estão intactos. As duas ressalvas 🟡
são: o atalho "Usar este hóspede" pode ficar desatualizado em relação ao formulário, e o teste de
isolamento da categoria não pegaria a regressão. Nenhuma das duas quebra o roteiro ao vivo se o
operador seguir o guia.

## Achados no escopo

### 🟡 [UI/correção] Atalho "Usar este hóspede" sobrevive à edição do formulário e à corrida com o reenvio
**Onde:** `frontend/apps/pms/src/features/reservations/components/GuestPicker.tsx:142-147`, `:156-158`, `:165`, `:218`
**Cenário:**
- **(a) Edição depois do 409.** A recepcionista digita por engano o CPF da Maria e envia. Vem o 409, e o atalho mostra "Já cadastrado: Maria". Ela corrige o CPF no campo, porque o hóspede é o João, e não reenvia. O `set()` (l.156) não limpa `existing`. "Usar este hóspede" continua visível e seleciona a Maria para uma reserva do João.
- **(b) Corrida.** A busca do primeiro 409 (`offerExisting`, async, l.146) ainda está pendente quando a recepcionista corrige e reenvia. O `setExisting(null)` do segundo envio (l.165) roda antes. Depois a busca antiga resolve e reexibe o hóspede do rascunho anterior, porque o `draft` foi capturado no closure do primeiro envio.

O nome aparece no atalho, e isso atenua o risco. Mesmo assim, o próprio comentário de `findDuplicateGuest` (`guestRules.ts`) diz que "oferecer o hóspede errado num botão de um toque grava a reserva em nome de outra pessoa".
**Regra violada:** correção de UI e integridade da reserva: hóspede errado na reserva, e o CPF e o nome de outra pessoa entram na estadia (LGPD, art. 6º, V, qualidade do dado).
**Correção sugerida:**
- em `set()`, chamar `setExisting(null)` quando muda `cpf` ou `email`;
- em `offerExisting`, guardar um contador de requisição (ref) e descartar a resposta que não for a do último envio.

Não há teste de componente para o atalho. Só as funções puras foram testadas.

### 🟡 [Testes/multi-tenancy] O teste "mesmo nome em outro hotel" passa mesmo sem o filtro de tenant
**Onde:** `services/core-service/tests/room-categories.test.js:121-126`; regra em `services/core-service/app/utils/categoryNameTaken.js:24`
**Cenário:** o hotel vizinho cria `luxo`. No primeiro hotel, nesse ponto, não existe categoria cujo `lower(name)` seja `luxo`: a `Luxo` original virou `Luxo Premium` em `:77`. Se alguém remover `tenant_id: tenantId` do `where` de `categoryNameTaken`, o teste continua verde. O cross-tenant que ele diz cobrir fica sem cobertura. Pela mutação mental, o teste não pega a regressão. Com a regressão, um hotel não conseguiria criar "Standard" porque outro hotel já tem uma. É vazamento de existência entre tenants: o 409 revela o nome usado por outro hotel.
**Regra violada:** checklist §8, que pede teste de isolamento entre tenants no recurso novo.
**Correção sugerida:** no hotel vizinho, usar um nome que exista no primeiro em outra caixa, por exemplo `'suíte família'` ou `'STANDARD'`, e esperar 201.

### 🟢 [DRY/contrato] A entrada no passado tem duas regras e dois contratos
**Onde:** `services/core-service/app/utils/publicStayDates.js:26` × `services/core-service/app/utils/checkInDateGuard.js:13-16`
**Cenário:** a regra `checkIn < todayInHotel()` foi reescrita em vez de reusar `checkInInPast`. O balcão responde 422 `CHECK_IN_IN_PAST` com `code`. A API pública responde 400 só com `error`, sem `code`. Hoje não quebra nada, porque `apps/booking` está vazio e o passo 6 é pelo Swagger. Quando o site do hóspede existir, porém, vai ter que diferenciar os erros pelo texto da mensagem.
**Regra violada:** DRY (CLAUDE.md §7: "se existe em utils/, reutilize").
**Correção sugerida:** chamar `checkInInPast(checkIn, todayInHotel(now))` dentro de `publicStayDatesError`. Se o 400 continuar, registrar no Swagger que ele é diferente do 422 do balcão. O ajuste fica para o 5º semestre e não deve entrar no dia do congelamento.

### 🟢 [Testes] O fuso de `publicStayDatesError` não é exercitado
**Onde:** `services/core-service/app/utils/publicStayDates.js:20` (o `now` é injetável, mas nenhum teste o usa); `services/core-service/tests/public-booking.test.js:533-541`
**Cenário:** o teste usa entrada em 2020. Se alguém trocar `todayInHotel(now)` por `new Date().toISOString().slice(0,10)`, que é exatamente o bug corrigido no commit `089147a` em outros testes, a suíte continua verde. Às 22h de Brasília, uma reserva para "hoje" voltaria a dar 400.
**Regra violada:** checklist §8, teste que passaria com a regra quebrada.
**Correção sugerida:** teste unitário com `now = new Date('2026-11-25T01:30:00Z')` (22h30 de 24/11 em Brasília): `publicStayDatesError('2026-11-24', '2026-11-25', now)` deve dar `null`.

### 🟢 [Testes] O teste de "CPF com dígito errado" usa um CPF de dígitos repetidos
**Onde:** `services/core-service/tests/public-booking.test.js:497-498`
**Cenário:** `111.111.111-11` é barrado pela regra dos dígitos repetidos (`isValidCpf.js:17`), não pelos verificadores. Um `isValidCpf` que só checasse o formato e os dígitos repetidos passaria nesse teste. O nome do teste promete outra coisa.
**Correção sugerida:** usar `529.982.247-26` (verificador errado).

### 🟢 [Testes] Os testes novos da API pública têm data fixa em 2027 e vão quebrar sozinhos
**Onde:** `services/core-service/tests/public-booking.test.js:493` (`2027-11-01`), `:546` (`2027-12-01`)
**Cenário:** com a nova regra da entrada no passado, a partir de 02/11/2027 esses testes passam a receber 400 em vez de 201 ou 404. O CI fica vermelho sem mudança de código.
**Correção sugerida:** `addDays(todayInHotel(), N)`, como os commits de teste desta mesma branch já fazem.

### 🟢 [Legibilidade] JSDoc órfão: a documentação ficou presa na função errada
**Onde:**
- `frontend/apps/pms/src/features/reservations/reservationLogic.ts:43-55`: "Noites entre as datas…" agora fica acima do JSDoc de `pastCheckInError`, e `safeNights` ficou sem documentação;
- `frontend/apps/pms/src/features/accounts/connection.ts:21-32`: o JSDoc de `offlineBannerText` ficou acima do `OfflineReason`.

**Cenário:** o hover da IDE mostra a documentação de outra função.
**Correção sugerida:** mover os blocos novos para cima dos comentários originais.

### 🟢 [KISS/fragilidade] `departuresError` depende do texto da mensagem
**Onde:** `frontend/apps/pms/src/features/today/todayLogic.ts:255`
**Cenário:** se a mensagem de erro de `useInHouse` mudar, por exemplo para "dos hóspedes na casa", o `includes` falha em silêncio e o bloco Saídas volta a falar do vizinho. O `new Error(...)` também cria um objeto novo a cada render. Hoje é inofensivo, porque o `ErrorState` só lê `message`.
**Correção sugerida:** o bloco Saídas recebe uma mensagem própria, fixa, sempre que `inHouse.error` existir. Não é preciso reescrever o texto do outro bloco.

### 🟢 [Testes/UX] O "Liberar quarto" sem rede não tem teste, e o 409 por e-mail não oferece atalho
**Onde:**
- `frontend/apps/pms/src/features/today/components/rows.tsx:426`, `:476-486`;
- `frontend/apps/pms/src/features/guests/guestRules.ts` (`duplicateSearchTerm`).

**Cenário:**
- **(a)** `canConfirm={online}` e `isPaused` não têm teste. Se alguém remover `canConfirm`, nenhum teste falha.
- **(b)** CPF completo e novo, com e-mail já cadastrado: o 409 vem do e-mail, mas a busca é feita só pelo CPF. Não acha nada e o atalho não aparece. A falha é segura (vale "Voltar à busca"), mas o atalho só cobre metade dos casos de 409.

**Correção sugerida:**
- **(a)** um teste com `onlineManager.setOnline(false)`, no mesmo molde de `connection.test.tsx`;
- **(b)** sem resultado pelo CPF, tentar pelo e-mail.

## Repassados a outro dev
nenhum

## O que foi verificado e está correto
- **`categoryNameTaken`:**
  - filtra `tenant_id`;
  - usa `attributes: ['id']`, sem vazar campos;
  - a busca respeita o paranoid, então a categoria excluída não barra o nome;
  - o `fn('lower', name)` é parametrizado, sem injeção;
  - `lower()` com acento foi conferido no Postgres do compose (`postgres:17-alpine`, `en_US.utf8`, provider `c`): `SUÍTE FAMÍLIA ÇÃO` vira `suíte família ção`. No K8s a imagem é `postgres:17` (Debian, mesmo locale);
  - na edição, a própria categoria fica de fora (`Op.ne`);
  - a corrida está documentada e o índice exato continua de pé.
- **`publicStayDatesError`:**
  - ordem das checagens: obrigatórios → formato/calendário (`isIsoDate`) → `check_in < check_out` → passado (`todayInHotel`). A comparação de texto só acontece depois de validar o formato;
  - aceita entrada hoje;
  - na disponibilidade, a mensagem de "obrigatórios" e o formato `{ error }` são os de antes.
- **`CreateBookingController`:**
  - os obrigatórios continuam saindo como `errors[]`, e as datas saem como `error`, como antes no `check_in >= check_out`;
  - o Swagger já declara `oneOf [ValidationErrors, Error]` para o 400 (`swagger.js:606`);
  - `isUuid(category_id)` vem antes do `findOne`;
  - o CPF inválido é recusado antes de qualquer gravação ou cobrança, para todo provider. Com o Asaas o resultado é o mesmo de antes, só que mais cedo. O Mercado Pago e o fake não enviam CPF ao PSP, então a única mudança neles é recusar o malformado;
  - os exemplos do Swagger (`52998224725`, `529.982.247-25`) e o `cpf()` do e2e são válidos. O passo 6 da demonstração não quebra;
  - `""` não aciona a validação.
- **`router.param('id', notFoundUnlessUuid(...))`:** só `/bookings/:id/status` tem `:id`. `:subdomain` vem do router pai (mergeParams) e não é afetado.
- **`reservationBill`:**
  - `quantity` é `INTEGER` no model (`AccountItemModel.js:47`), o que bate com o `type: integer` do Swagger;
  - `unit_price` sai como `Number`, como o `amount`;
  - só acrescenta campos, e `openapi.json` e `schema.d.ts` foram regenerados. O frontend tolera servidor sem `quantity` (teste `c5`).
- **Comprovante e detalhe da reserva:** os dois passam por `buildBillTimeline`, então recebem o rótulo "3 × Caipirinha".
- **`BillTimeline`:**
  - `caption` e `scope=col` mantidos;
  - o tipo do lançamento continua em `sr-only`, sem depender só da cor;
  - valor e saldo `whitespace-nowrap`;
  - o estorno tem rótulo além do risco.
- **`GuestPicker`:**
  - o CPF do atalho está mascarado (`maskCpf`, só os dígitos 4 a 9, mesmo padrão do comprovante);
  - `findDuplicateGuest` exige CPF ou e-mail exato, e a busca do backend casa os dígitos do CPF formatado (`ListGuestController.js:63`).
- **`NewReservationPage`:**
  - o `todayISO()` é calculado em `America/Sao_Paulo` (`packages/domain/src/dates.ts:52`);
  - entrada no passado não consulta quartos (`datesOk`);
  - `aria-invalid` está em cada campo.
- **`useReleaseRoom`:** usa o `networkMode` padrão (`online`), então `isPaused` tem efeito real. `promiseOnce` segura o duplo toque.
- **`ItemList`:** `line-clamp-2` é nativo do Tailwind 3.4.
- **Regras gerais:** nenhum `require()`, nenhum endpoint novo sem Swagger, nenhuma gravação multi-tabela nova e nenhuma mudança de estado de reserva ou quarto.

## Não foi possível verificar
- Não rodei a suíte nem o e2e. Uso os números do orquestrador (core 1385/1385, frontend 606 + 49, e2e 7/7).
- Não verifiquei visualmente a `BillTimeline` em 800 e 360 px, nem com descrição longa sem espaço (palavra única pode forçar rolagem lateral, porque a célula não tem `break-words`).
- Não verifiquei o comportamento do `ConfirmPanel` com a mutação pausada e o componente desmontado (ex.: a recepcionista sai do painel Hoje antes de a rede voltar).
