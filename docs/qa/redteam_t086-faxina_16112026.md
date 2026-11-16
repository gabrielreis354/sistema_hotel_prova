# QA Red Team — T-08.6 faxina (SPEC-08)
**Branch:** feature/t086-faxina · **Dev:** Sirlande · **Base:** origin/develop@5d2eb3d · **HEAD:** f02459e · **Data:** 16/11/2026
**Arquivos auditados:** 40 (39 de código em `frontend/apps/pms/src/` e `frontend/packages/ui/src/`, mais o `CATALOGO.md`)
**Achados no escopo:** 5 (🔴 0 · 🟡 2 · 🟢 3) · **Repassados:** 0

## Veredito
**APROVADO COM RESSALVAS**

Não há 🔴. Os dois 🟡 são estes: o CA-08.g ficou incompleto nos campos de texto dos formulários de quartos, e a guarda que devia pegar isso não lê `.ts`. A regra do pagamento deixa a aba Resumo sem nenhuma ação principal.

## Achados no escopo

### 🟡 [UI/UX · CA-08.g] Inputs dos formulários de quarto e de categoria ainda encolhem no md, e a varredura não enxerga
**Onde:** `frontend/apps/pms/src/features/rooms/components/touch.ts:6` (`TOUCH = 'min-h-touch md:min-h-0'`), usado em `RoomForm.tsx:78,81` e `CategoryForm.tsx:72,77,84`. A guarda que deixa passar fica em `frontend/apps/pms/src/components/touchTargets.test.ts:16`, que só lê `.tsx`.
**Cenário:** no tablet de 768 px (md), o admin abre `/quartos/:id/editar`. O `Select` de categoria, mudado nesta branch em `Select.tsx:14`, tem 48 px. Os `Input` de número e andar, no mesmo formulário, caem para a altura natural do `Input` do `@hotel/ui`, uns 42 px segundo o próprio comentário do `touch.ts`. A mesma tela fica com duas alturas de campo e reprova o CA-08.g a 768 px. O mesmo acontece em `/quartos/categorias/:id` e na criação. O teste "nada encolhe a altura antes do xl" passa porque o filtro é `/\.tsx$/` e a constante está num `.ts`. O comentário do `PaymentForm.tsx:19` ainda aponta para o `touch.ts` como "o mesmo ajuste", que agora diverge (`xl:` de um lado, `md:` do outro).
**Regra violada:** SPEC-08 CA-08.g (48 px em 768 px). A guarda dá falsa garantia, o que cai no item "teste que passaria com a regra quebrada".
**Correção sugerida:** trocar para `'min-h-touch xl:min-h-0'` no `touch.ts:6` e mudar o filtro do `touchTargets.test.ts:16` para `/\.tsx?$/`, sem `.test.`. A varredura passa a reprovar o `touch.ts` antes da correção.

### 🟡 [UI/UX · CA-08.e/CA-08.l] Com saldo a receber, a aba Resumo, que é a aba padrão, fica sem nenhuma ação principal
**Onde:** `frontend/apps/pms/src/features/reservations/ReservationDetailPage.tsx:127` (`primaryAction(actions, { paymentDue: receiving })`), o cabeçalho em `:172-181` e o `PaymentForm`, que só aparece dentro de `tab === 'conta'` (`:347`, `:385-390`). A regra está em `reservationLogic.ts:661`.
**Cenário:** a recepção abre `/reservas/<id>` (sem `?aba`, que é o padrão) de uma reserva `CHECKED_IN` com saldo de R$ 300. O `paymentDue` é `true`, então `primary` vira `null` e o cabeçalho mostra só o saldo, sem botão. O "Registrar pagamento" fica na aba Conta, que não está aberta, e o check-out aparece como secondary no cartão de ações. A tela não tem nenhum `primary` e nada aponta para o pagamento. Quem nunca viu o sistema (CA-08.l: "registra um pagamento sem ajuda") precisa descobrir sozinho que o pagamento está atrás da aba Conta. O repasse de 16/11 pedia o rebaixamento "nessa aba", a Conta. A regra foi aplicada à tela toda.
O CA-08.e ("no máximo um") formalmente não é violado. O problema é de hierarquia e de descoberta, não de contagem. Nenhum teste prende o comportamento da aba Resumo: `ReservationDetailPage.test.tsx:100` e `:106` só renderizam `?aba=conta`.
**Regra violada:** T-08.3 ("a ação possível fica como `primary` à direita do cabeçalho") e CA-08.l.
**Correção sugerida:** a menor é aplicar `paymentDue` só quando `tab === 'conta'`, o que mantém o check-out primary no Resumo. A alternativa, que segue melhor a decisão "paga, depois sai", é pôr no cabeçalho, quando `receiving`, um primary "Registrar pagamento" que leva a `?aba=conta`. Nos dois casos, falta um teste da aba Resumo com saldo e papel `RECEPTIONIST`.

### 🟢 [UI/UX] Com a conta carregando ou com falha, o check-out volta a ser o principal e troca de lugar quando a conta chega
**Onde:** `ReservationDetailPage.tsx:123-127`, junto com `paymentLogic.ts` (`canReceivePayment` devolve `false` com `balanceCents === null` ou `billFailed`).
**Cenário 1:** a recepção abre uma reserva `CHECKED_IN` com saldo. Enquanto a conta está em "calculando…", `receiving` é `false` e o "Fazer check-out" aparece em primary no cabeçalho. Quando a conta chega com saldo, o botão some do cabeçalho e reaparece como secondary no cartão de baixo. No tablet, o toque dado nesse intervalo cai em outro lugar.
**Cenário 2:** a recarga da conta falha (`bill.isError`). O saldo fica "indisponível" e o check-out volta a ser o principal, justamente quando não se sabe se há saldo. Isso enfraquece o "paga, depois sai". O bloco de confirmação ainda avisa, e não é regressão: antes o check-out era sempre o principal.
**Correção sugerida:** usar `paymentDue: receiving || bill.isPending || bill.isError` quando o papel recebe pagamento. O check-out só sobe para principal com saldo zerado e confirmado.

### 🟢 [UI/UX] `RoomEditPage`: categorias com 404 aparecem como "Quarto não encontrado"
**Onde:** `frontend/apps/pms/src/features/rooms/RoomFormPages.tsx:102` (`error={room.error ?? categories.error}`).
**Cenário:** o quarto carrega (200) e `GET /room-categories` devolve 404, por exemplo uma rota fora do ar no gateway durante um deploy. O `room.error` é `null`, o `LoadError` recebe o 404 das categorias e diz "Quarto não encontrado — ele pode ter sido excluído", sem "Tentar de novo", com o quarto existindo. É improvável, porque é endpoint de lista.
O caso perguntado está certo. Quarto 404 com categorias falhando mostra "Quarto não encontrado" sem retry, porque o `room.error` vence. Está coberto em parte pelo `RoomFormPages.test.tsx` (404 com categorias 200). A combinação 404 com categorias 500 não tem teste.
**Correção sugerida:** passar só o `room.error` para o ramo 404 (`error={room.isError ? room.error : new Error()}`) ou acrescentar o caso ao teste.

### 🟢 [Testes] As guardas por regex são frouxas em pontos previsíveis
**Onde:** `components/touchTargets.test.ts:33` (só `min-h-0` e `h-N` com `sm|md|lg`: deixa passar `md:h-auto`, `md:py-0`, `md:min-h-[36px]`, `max-xl:`…), `components/uiNames.test.ts` (só pega `export function|const` no começo da linha: `function Money` local com `export { Money }` no fim escapa) e `LoadError.test.tsx:87` (`const notFound = .*status === 404` só acha uma grafia).
**Cenário:** alguém escreve `className="... md:h-auto"` num botão do tablet. A varredura passa e o alvo cai para a altura do conteúdo.
**Correção sugerida:** aceitar a limitação no comentário ou estender o padrão (`(?:sm|md|lg):(?:min-h-|h-)`). Não bloqueia.

## Repassados a outro dev
Nenhum. O destaque do atalho de período em `bg-brand` (`ReservationsListPage.tsx:516`, `variant='primary'` com `aria-pressed`) já está registrado como pergunta em `docs/qa/repasses/para_sirlande_16112026.md` e não foi reaberto.

## O que foi verificado e está correto
- **Regressão visual do `ButtonLink`:** as classes antigas eram `inline-flex min-h-touch items-center justify-center rounded-md px-4 text-base font-medium transition-colors` mais foco e variante. Batem uma a uma com o cva do `Button` (`comfortable` = `min-h-touch px-4 text-base`). Só entram `disabled:*`, inertes em `<a>`, e `block:false` (`''`). Conferi os 7 chamadores. `sm:self-start` (`GuestDetailPage.tsx:82`), `ROW_ACTION` + `xl:px-3` (`rows.tsx:309`) e `min-h-touch xl:min-h-0 xl:py-1.5 xl:text-sm` (comprovante) não conflitam: o tailwind-merge resolve por modificador, e o `cn` do ui conhece a escala tipográfica. Nenhum chamador passa `size` nem `block`.
- **Imports:** nenhum módulo importa `ButtonLink` ou `BackLink` de `reservations/`. O `index.ts` de reservas não reexporta mais, e todos os 8 imports apontam para `components/links.js`. O `@hotel/ui` continua sem depender de react-router, e o `buttonClasses` não traz dependência nova.
- **Regra do pagamento:**
  - o garçom (fora de `RECEIVING_ROLES`) e a sessão sem papel mantêm `receiving=false`, e o check-out continua primary (teste em `ReservationDetailPage.test.tsx:105`);
  - no `CHECKED_OUT` com saldo, `checkOut.enabled` já é falso, então `primary=null`, como antes, e o `PaymentForm` continua na aba Conta;
  - `PENDING` e `CONFIRMED` não são afetados: o check-in tem precedência (`reservationLogic.ts:660`, teste em `reservationLogic.test.ts`).
- **CA-08.f:** com saldo, o check-out rebaixado continua visível no `ActionSlot`, habilitado, e o cancelar segue com motivo.
- **`LoadError`:**
  - o 404 mostra `Notice` de erro sem retry; 500, 403 e erro de rede mostram `ErrorState` com retry (testado);
  - a volta aparece na reserva e no hóspede e fica de fora nos formulários de quartos, que já têm a volta do `FormShell`.
- O `isNotFound` saiu de `rooms/errorMessages.ts` sem sobrar chamador antigo.
- **Renomeações:** `DecimalMoney` e `InfoNotice` sem import residual, e o `uiNames.test.ts` cobre a colisão de nome.
- **CA-08.g no diff:** os cortes `md:` trocados por `xl:` em `AppShell`, `BackLink`, `FormShell`, `Select`, `RoomsHeader`, link da lista, comprovante e `PaymentForm` estão corretos. Os atalhos de período perderam o `size="compact"` e passaram a `xl:h-9 xl:min-h-0 xl:px-3 xl:text-sm`, coerente com o cva.
- **Segurança e LGPD:** o diff é só de apresentação. Não há query, nova coleta de dado nem `console.*` com PII, e nada vai para URL.
- `CATALOGO.md` descreve o `buttonClasses` e as renomeações exatamente como estão no código.
- **Rodado aqui:** `tsc --noEmit` do `apps/pms` limpo; `vitest run` com 40 arquivos e 399 testes passando.

## Não foi possível verificar
- A altura real dos `Input` do formulário de quartos a 768 px no navegador. O valor de 42 px vem do comentário do `touch.ts` e das classes (`py-2 text-base` com borda), sem medição.
- O tamanho do bundle antes e depois. Não rodei o build. Pela leitura, nenhuma dependência nova entrou.
- A cobertura do CI (portão de 60%). Não rodei com `--coverage`.

## Desfecho (Sirlande, 16/11)

| Achado | Desfecho |
|---|---|
| 🟡1 `touch.ts` com `md:min-h-0` | Corrigido: `xl:min-h-0`. A varredura agora lê `.ts` além de `.tsx` e pegou o caso no RED. No navegador, os campos da categoria a 768 px medem 48 px. |
| 🟡2 aba Resumo sem principal | Corrigido: `paymentDue` só vale com `tab === 'conta'`. No Resumo o check-out segue como principal, e clicar nele leva à Conta. Teste novo no `ReservationDetailPage.test.tsx`. |
| 🟢3 conta carregando ou com falha | Sem mudança. Quando o saldo é desconhecido, o check-out em primary é o comportamento de antes da T-08.6, e o próprio check-out confere a conta. |
| 🟢4 404 só das categorias | Corrigido: só o erro do quarto decide "não encontrado" (`room.isError ? room.error : null`). Teste para as combinações quarto 404 com categorias 500 e quarto em dia com categorias 404. |
| 🟢5 regex dos testes de varredura | Parcial: `.ts` incluído (🟡1). Os demais casos (`md:h-auto`, `export { Money }`) ficam como limitação conhecida das varreduras. |

Mutação nas correções: 3 de 3 mortos.
