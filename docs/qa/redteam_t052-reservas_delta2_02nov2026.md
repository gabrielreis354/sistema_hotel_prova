# QA Red Team — T-05.2 Reservas (reauditoria delta 2)
**Branch:** feature/t052-reservas · **Dev:** Gabriel (agente executor de frontend) · **Delta:** 7bc2ffe..483fe55 (first-parent: 9da9dc5 … 483fe55, com o merge da develop e12f32a) · **Data:** 02/11/2026
**Arquivos auditados:** os do delta — `ListGuestController.js`, `swagger.js` (`GET /guests`), `tests/guests-search.test.js`, `features/guests/{guestsApi,queries,index}.ts` e o teste, `GuestPicker.tsx`, `reservationLogic.ts` e o teste (VOIDED), `BillTimeline.tsx`, `ReservationReceiptPage.tsx`, `reservationsApi.ts` e o teste (PR 104), `queries.ts` e `reservationQueries.test.ts`, `primitives.tsx` (ErrorState), `App.tsx`, `api-client`. Contexto: `roles.js` e `auth.middleware.js` (allowlist do WAITER), `CreateReservationController.js`, `deadlockRetry.js`, `GetBillController.js`, `reservationBill.js`, `paymentEnums.js`.
**Achados no escopo:** 3 (🔴 0 · 🟡 0 · 🟢 3) · **Repassados:** 0

> Sem 🔴 de segurança, vazamento ou dinheiro fora do escopo.

## Veredito
**APROVADO**

As duas ressalvas 🟡 da rodada de 24/10 fecharam, e os quatro 🟢 também. A busca `GET /guests?q=&limit=` foi testada **contra o backend real**. O isolamento por tenant, o escape de `%`, `_` e `\`, a resistência a injeção, o teto de 20, o 400 acima de 100 caracteres, as máscaras de CPF e telefone e o 403 do WAITER funcionaram todos. Na tela, o `GuestPicker` só consulta o servidor, a partir de 3 caracteres e com debounce. O estorno aparece riscado na aba Conta, fica fora do comprovante e o saldo bate com o `balance_due` do servidor. As respostas do PR 104 (409 com `room_ids` e 404 de outro tenant) foram exercitadas contra o servidor real. Os três achados restantes são 🟢 e ficam como pendência pós-merge.

**Ordem de integração (sem mudança):** depois da T-05.1. A promoção de `Money` e a troca do `ReservationStatusBadge` pelo `StatusBadge tone/label` continuam previstas para esse passo (pendência nº 4 do relatório do executor). O `ErrorState` já subiu para o `@hotel/ui` neste delta.

## Saída real

**Ambiente próprio:** `pg-qa052` (postgres:17) na porta 5450, backend do worktree na 3060 (`migrate` + `seed`), Vite na 5260 com `VITE_API_URL=http://127.0.0.1:3060`. Tudo derrubado no fim: container removido e portas 5450, 3060 e 5260 livres. O `.env.test` foi trocado durante os testes do backend e restaurado; o worktree está limpo.

**Sondagem da API real** (`qa052_d2_api.mjs`): **40 PASS / 0 FAIL**
```
PASS  tenant B busca o CPF do hóspede do A: não vaza (QA021377 Mascara do Sol)
PASS  "%" sozinho não casa todo mundo → 1 resultado(s)
PASS  "_" literal: só Joao_Under (QA021377 Joao_Under)
PASS  "\" literal: só o nome com barra (QA021377 Barra \ Invertida)
PASS  injeção "' OR '1'='1" → status 200, 0 resultado(s)
PASS  injeção com DROP → status 200; tabela intacta
PASS  q repetido (array) → 400 · q como objeto → 400
PASS  limit padrão → 10 · limit=999 → 20 · limit=-5 → 10 · limit=6 ordenado por nome → 6
PASS  q com 100 caracteres → 200 · q com 101 caracteres → 400 {"error":"q aceita no máximo 100 caracteres"}
PASS  CPF/telefone "98765432100" | "987.654.321-00" | "654.321" | "21977776543" | "(21) 97777" | "977776543" acham o hóspede mascarado
PASS  campos devolvidos pela busca: id, tenant_id, full_name, cpf, phone, email, created_at, updated_at, deleted_at
PASS  WAITER busca → 403 · WAITER lista inteira → 403 · ADMIN busca → 200
PASS  409 com room_ids: 409 {"error":"Quarto indisponível no período solicitado","room_ids":["782f1c0f-…"]}
PASS  quarto principal do tenant B → 404 · quarto extra do tenant B → 404 · hóspede do tenant B → 404
PASS  hóspede excluído (delete 204) → 404 · busca não devolve hóspede excluído (paranoid) → 0
```

**E2E Playwright contra o backend real** (`qa052_d2_e2e.mjs`, 1366×900, pt-BR, America/Sao_Paulo): **25 PASS / 0 FAIL**
```
PASS  abrir Hoje, Reservas e Nova reserva: 0 chamada(s) a GET /guests
PASS  2 caracteres: 0 chamada(s)
PASS  digitou 12 caracteres a mais: 1 chamada(s) (debounce) → ?q=E37208 Ludmila&limit=6
PASS  toda chamada leva q e limit=6; nenhuma sem q
PASS  servidor real respondeu 409 {"error":"Quarto indisponível no período solicitado","room_ids":[…]}
PASS  mensagem: "Outro atendimento acabou de reservar o quarto 101 neste período. Escolha outro quarto livre."
PASS  quarto perdido saiu da seleção
PASS  quarto do tenant B: servidor real 404 {"error":"Quarto não encontrado"}
PASS  mensagem sem UUID: "O hóspede ou um dos quartos escolhidos não existe mais neste hotel — … escolha de novo."
PASS  /bill real: grand_total=300 total_paid=30 total_pending=0 balance_due=270
PASS  aba Conta: "Pagamento · Cartão de crédito (estornado: lançado em duplicidade) -R$ 200,00 (não abate o saldo)" com valor riscado
PASS  cabeçalho mostra o balance_due do servidor (R$ 270,00) · saldo corrido da última linha = R$ 270,00
PASS  totais da aba: Diárias e consumos R$ 300,00 · Pago R$ 30,00 · Aguardando R$ 0,00 · Saldo R$ 270,00
PASS  comprovante sem a linha estornada nem o valor de 200,00 · comprovante: Pago = R$ 30,00
PASS  fim do roteiro: 4 chamada(s) a /guests, todas com q · sem pageerror
```
Capturas: `qa052_d2_409_room_ids.png`, `qa052_d2_404_hospede.png`, `qa052_d2_conta_estorno.png` e `qa052_d2_comprovante.png`, na pasta scratchpad da sessão.

**Suítes e portões** (Node 24.14, pnpm 9.15):
- backend `guests-search.test.js` + `guests.test.js` no banco próprio: 18/18;
- backend suíte completa com cobertura: **53 arquivos, 1126 passando, 1 pulado**; cobertura 85,69% stmts / 82,47% branches / 89,43% funcs / 87,53% lines (portão 60/55);
- frontend `pnpm test`: domain 31/31, app-pms **145/145** em 12 arquivos;
- `pnpm typecheck --force`: 4/4; `pnpm build --force`: ok (458 kB);
- `bash scripts/qa_checks.sh`: 3 avisos, os mesmos 3 preexistentes, nenhum do delta;
- `api-client`: `npm run generate` regenerado do `swagger.js` atual não produz diff. O cliente bate com o Swagger e não foi editado à mão.

---

## Situação das ressalvas de 24/10

| Ressalva | Situação | Evidência |
|---|---|---|
| 🟡-1 busca baixava a base depois do 3º caractere | ✅ **Fechada** | `searchGuests` → `GET /guests?q=&limit=6` (`guestsApi.ts`), chave própria `['guests','search',termo]`, `enabled` só com 3+ caracteres, debounce de 250 ms (`GuestPicker.tsx:9,25-31`). `useGuests` saiu do `index.ts`: outro módulo não consegue pedir a coleção. Único consumidor restante da lista inteira é a própria `GuestsListPage` (T-05.12, fora do escopo). E2E: 0 chamadas ao abrir, 0 com 2 letras, 1 chamada para 12 teclas |
| 🟡-2 VOIDED e métodos novos em enum cru no comprovante | ✅ **Fechada** | Rótulos `CARTAO_CREDITO`, `CARTAO_DEBITO` e `VOIDED` ("estornado: motivo"), status desconhecido vira "situação desconhecida". `receiptEntries` mantém só PAID e PENDING. Conferido contra o servidor real (acima) |
| 🟢-1 testes de `maskCpf`, `enabled` e `MIN_TERM` | ✅ Fechada | `maskCpf('1234567890')` e `('123456789001')` → `null` (`reservationLogic.test.ts:246-247`); `guests/queries.test.ts` prende termo mínimo e `enabled`; `reservationQueries.test.ts` prende `enabled: rangeOk` |
| 🟢-2 comentário truncado | ✅ Fechada | `GuestPicker.tsx` reescrito |
| 🟢-3 erro visível depois de apagar o termo | ✅ Fechada | `searched && guests.isError` (`GuestPicker.tsx:80`) |
| 🟢-4 cabeçalho da SPEC | ✅ Fechada | `SPEC-05-frontend-pms.md:93` |

## Foco 1 — `GET /guests?q=&limit=` (backend)

- **Isolamento:** `where: { tenant_id, [Op.or]: … }`, com o `tenant_id` vindo do JWT. O homônimo, com o mesmo CPF, no outro hotel não aparece (API e teste de integração).
- **Injeção e curingas:** `escapeLike` escapa `\` primeiro, depois `%` e `_`. O valor vai por parâmetro do Sequelize, e o `regexp_replace` recebe o padrão fixo `\D`, não o termo. Na sondagem real, `%`, `%%%`, `_`, `\`, `\%`, `' OR '1'='1` e `DROP TABLE` se comportaram como texto literal.
- **Limite:** padrão 10, teto 20; valor inválido ou negativo cai no padrão. O frontend pede 6.
- **Tamanho de `q`:** 101 caracteres dá 400. `q` em array ou objeto também dá 400 (`typeof q !== 'string'`). `q` vazio devolve `[]`, nunca o cadastro.
- **Máscaras:** termo numérico com 3 dígitos ou mais casa CPF e telefone pelos dígitos (`regexp_replace`), com ou sem pontuação, nos dois sentidos.
- **Papéis e enumeração:** o WAITER recebe 403 tanto na busca quanto na lista. A allowlist em `roles.js` vem antes de qualquer router, e `/guests` não está nela. ADMIN e RECEPTIONIST buscam, que é o necessário para o balcão. A busca **não amplia** a enumeração: o mesmo RECEPTIONIST já recebe a base inteira em `GET /guests` sem `q`, contrato mantido para a tela de hóspedes, cuja paginação é da T-05.12. Com `q`, cada chamada devolve no máximo 20.
- **Paranoid:** o hóspede excluído não aparece na busca.
- **LGPD:** ver 🟢-1.

## Foco 3 — estorno x T-06.13

`reservationBill.js:45-46` conta como pago apenas `status === 'PAID'`; VOIDED segue listado com `void_reason` e `voided_at`. O frontend tem `notCounted = status !== 'PAID'` e `awaiting = status === 'PENDING'`. Por isso VOIDED não abate o saldo, não entra em "Pago" nem em "Aguardando", aparece riscado (`line-through`) com o motivo na aba da equipe e fica fora do comprovante. Na prática, com 300 de diárias, 200 estornado e 30 pago, deu `balance_due` 270 no servidor, 270 no cabeçalho e 270 na última linha da conta. O comprovante imprimiu "Pago R$ 30,00" sem o estorno. A regra é a mesma da T-06.13.

## Foco 4 — respostas do PR 104 na tela

| Resposta | Origem | Tela |
|---|---|---|
| 409 **com** `room_ids` | servidor real | `RoomConflictError`, "Outro atendimento acabou de reservar o quarto 101…", quarto sai da seleção ✅ |
| 409 **sem** `room_ids` (deadlock repetido) | **não provocado ao vivo** | `deadlockRetry.js:36` responde `{ error: DEADLOCK_RETRY_MESSAGE }` sem `room_ids` (lido). A tela vira `ApiError` "nada foi gravado… tente de novo" e mantém a seleção. Isso está provado por `reservationsApi.test.ts` (dois corpos) e pelo E2E do executor com interceptação. Ver "Não foi possível verificar" |
| 404 quarto de outro tenant | servidor real (corpo adulterado na rede) | "O hóspede ou um dos quartos escolhidos não existe mais neste hotel…", sem UUID ✅ |
| 404 hóspede de outro tenant / excluído | servidor real | mesma mensagem ✅ (ver 🟢-2) |

## Foco 5 — merge da develop (e12f32a)
- **`api-client`:** a diferença para `origin/develop` são só os parâmetros `q`/`limit` de `GET /guests` e o 400. A regeneração a partir do `swagger.js` não produz diff.
- **`ErrorState`:** vem do `@hotel/ui` em todas as telas de reserva. A cópia local saiu do `primitives.tsx`, e a assinatura (`onRetry` obrigatório) foi respeitada: a tela de detalhe passou a sempre oferecer "tentar de novo".
- **`App.tsx`:** só rotas novas foram acrescentadas sobre a develop (reservas, nova, detalhe e o comprovante fora do `AppShell`). As rotas de contas e indicadores da develop ficaram preservadas. Layout e sessão não foram tocados (`components/`, `routes/` e `stores/` estão sem diff da branch).

---

## Achados no escopo (🟢 — pendência pós-merge)

### 🟢-1 [LGPD art. 6º, III] A busca devolve o registro inteiro do hóspede, e o resultado mostra CPF, telefone e e-mail completos
**Onde:** `services/core-service/app/Controllers/GuestApi/ListGuestController.js` (o `findAll` do modo busca não tem `attributes`) e `frontend/apps/pms/src/features/reservations/components/GuestPicker.tsx:106`.
**Cenário:** o recepcionista digita "Ana" e recebe até 6 registros com `tenant_id`, `created_at`, `updated_at`, `deleted_at`, CPF, e-mail e telefone completos. Cada linha da lista exibe, por exemplo, "208.337.483-08 · (31) 98888-1234 · e37208@a.test" (saída real do E2E). Para escolher entre homônimos, basta o CPF mascarado mais o final do telefone. O dado completo só é necessário depois da escolha, e a ficha da reserva já o tem.
**Por que não pesa mais:** a mudança **reduz** a exposição em relação ao que havia (antes vinha a base inteira) e não cruza tenant. O mesmo papel ainda recebe tudo em `GET /guests` sem `q`.
**Correção sugerida:** no modo busca, `attributes: ['id','full_name','cpf','phone','email']`; no `GuestPicker`, exibir `maskCpf` (já existe) e o telefone parcial. Junto com a T-05.12 ou a T-06.11.

### 🟢-2 [UX] Depois do 404 de hóspede excluído, o hóspede continua selecionado e "Confirmar" repete o 404
**Onde:** `NewReservationPage.tsx` (o `onError` não limpa `guest`) e `reservationsApi.ts` (`CREATE_GONE_MESSAGE`).
**Cenário (E2E real):** o recepcionista escolhe o hóspede, o admin o exclui, e "Confirmar reserva" mostra "…não existe mais neste hotel… escolha de novo". O card do hóspede excluído continua na tela e o botão continua habilitado: clicar de novo dá outro 404. A mensagem também não diz se o que sumiu foi o hóspede ou o quarto. O quarto sai sozinho pela recarga da lista de livres; o hóspede não sai.
**Correção sugerida:** no 404, se o corpo for "Hóspede não encontrado" (ou se a nova checagem `GET /guests/:id` der 404), limpar a seleção do hóspede e dizer "o hóspede foi excluído"; caso contrário, dizer "um dos quartos".

### 🟢-3 [Contrato] O termo mínimo de 3 caracteres existe só no frontend
**Onde:** `ListGuestController.js`, onde `q` com 1 caractere é aceito.
**Cenário:** `GET /guests?q=a` devolve até 20 hóspedes. Não é vazamento, porque a lista inteira já está aberta para o mesmo papel, mas a regra "busca não é listagem" fica só no cliente. Quando a T-05.12 fechar o `GET /guests` sem `q`, a busca de uma letra vira o caminho de enumeração.
**Correção sugerida:** na T-05.12, `q` com menos de 3 caracteres responde `[]` ou 400, e o Swagger ganha `minLength: 3`.

## Repassados a outro dev
Nenhum. A paginação da tela de hóspedes, o `GET /guests` sem `q` e o `as never` preexistente em `guestsApi.ts:54` (`updateGuest`, commit f75be3b, fora do delta) já estão registrados na T-05.12 e na SPEC-05 §5.

## O que foi verificado e está correto
- Isolamento, escape, injeção, limite, tamanho, máscaras, papéis e paranoid da busca, contra o servidor real (40/0).
- `GuestPicker`: nenhuma chamada sem `q` em todo o roteiro (4 chamadas, todas com `q` e `limit=6`); consulta só a partir de 3 caracteres; debounce efetivo; resultado de termo apagado não aparece.
- A invalidação depois de criar a reserva recarrega a busca de hóspedes só no 404 (`invalidateAfterCreate`, testado). O prefixo `['guests']` alcança a chave de busca.
- Dinheiro: nenhum `Number(`, `parseFloat` ou `toFixed` novo no módulo. O saldo da tela é o `balance_due` do servidor.
- Nenhum `fetch(` direto e nenhum `as unknown as` no delta. O `api-client` foi gerado, não editado.

## Não foi possível verificar
- **409 sem `room_ids` ao vivo:** exige dois deadlocks seguidos (`withDeadlockRetry` repete uma vez), o que não dá para provocar de forma determinística por HTTP. A conclusão vem da leitura de `deadlockRetry.js:36`, do teste unitário da tela e do E2E do executor com interceptação. A corrida barrada pelo EXCLUDE (o outro 409 sem `room_ids`) também não foi provocada.
- **Celular (375 px):** o roteiro desta rodada rodou só em 1366×900. O alvo de toque das linhas do `GuestPicker` (`Button` comfortable, `h-auto`) foi conferido na leitura do código, não medido.
- **Typecheck da árvore mergeada com a T-05.1:** não refeito. A ordem e os conflitos esperados seguem os da rodada de 24/10.
