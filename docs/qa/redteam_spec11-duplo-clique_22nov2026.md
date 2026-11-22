# QA Red Team — SPEC-11 T-11.3 (duplo clique e 422 sem código interno)
**Branch:** fix/spec11-duplo-clique · **Dev:** Sirlande · **Base:** develop@cc959e4 · **Data:** 22/11/2026
**Arquivos auditados:** 11 (diff `develop...HEAD`; nada rastreado fora de commit, só `.env.bak-19nov` e `.turbo/` não rastreados)
**Achados no escopo:** 5 (🔴 0 · 🟡 2 · 🟢 3) · **Repassados:** 0

## Veredito
**APROVADO COM RESSALVAS**

Nenhum 🔴. A trava faz o que promete e não fica presa nos cenários pedidos. As ressalvas: nenhum
teste liga as telas à trava, e o duplo clique em "Confirmar exclusão" das mesmas duas telas
continua sem trava. A SPEC-11 §2 promete que nenhum clique duplo vira erro falso.

## Achados no escopo

### 🟡 [Testes] Nenhum teste prova que as telas usam a trava
**Onde:** `frontend/apps/pms/src/lib/mutateOnce.test.ts:1-90`. Sem teste de ligação em `rooms/CategoryFormPages.tsx:39,89`, `rooms/RoomFormPages.tsx:63,141`, `today/components/rows.tsx:219,434` e `reservations/ReservationDetailPage.tsx:86`.
**Cenário:** se alguém volta `mutateOnce(lock, create.mutate, …)` para `create.mutate(…)` em qualquer uma das 7 chamadas, os 572 testes continuam verdes. `grep` nos `*.test.*` confirma: `CategoryNewPage`, `RoomNewPage`, `ArrivalItem`, `DepartureItem` e `CleaningItem` não aparecem em teste nenhum. `RoomFormPages.test.tsx` e `ReservationDetailPage.test.tsx` só fazem `renderToString` de estado de carga e de ações. O `mutateOnce.test.ts` é bom: usa um `MutationObserver` real e mostra que a função funciona. Mas ele não protege o CA-11.a contra regressão. Hoje a única prova da ligação é o teste manual no navegador, e o "Liberar quarto" nem passou por ele.
**Regra violada:** checklist §8 (o teste passaria com a regra de negócio quebrada).
**Correção sugerida:** a menor que resolve, sem DOM: extrair `run` e `confirmRelease` para funções puras que recebem `mutate` e `lock`, como já foi feito com `openAccountOnce` em `OpenAccountForm.tsx:22-29`, e testar cada uma com o `observer()` do `mutateOnce.test.ts`. Outra saída: um e2e de duplo clique em "Cadastrar categoria" no `pnpm e2e`.

### 🟡 [Duplo clique] "Confirmar exclusão" de quarto e de categoria continua sem trava, e o 2º clique provavelmente dá erro falso
**Onde:** `frontend/apps/pms/src/features/rooms/RoomFormPages.tsx:156-160` e `CategoryFormPages.tsx:111-115` (`del.mutate` direto). O botão está em `rooms/components/DeleteControl.tsx:45`, só com `disabled={pending}`.
**Cenário:** o defeito é o mesmo que a branch corrige no "Cadastrar". O `isPending` chega à tela depois do 2º clique, e saem dois `DELETE /rooms/:id`. No TanStack Query 5.101.4, `MutationObserver.mutate` troca o `#mutateOptions` e tira o observer da 1ª mutação (`query-core/build/modern/mutationObserver.js:56-61`). Por isso só os callbacks do 2º envio rodam. Se o 2º `DELETE` chega depois do commit do 1º, o backend responde 404 (`DeleteRoomController.js:28`, `DeleteRoomCategoryController.js:24`). O `onError` mostra "Quarto não encontrado — ele pode ter sido excluído por outra pessoa" (`errorMessages.ts:146`), e o `navigate('/quartos')` do 1º sucesso não acontece. O admin fica na tela de edição com um erro, e o quarto já foi apagado. **SUSPEITA quanto à ordem:** não reproduzi no navegador. Se os dois `DELETE` chegam juntos, os dois podem dar 204. O mecanismo é o mesmo que o autor mostrou com 3 POST (201, 409, 409) na develop.
**Regra violada:** SPEC-11 §2 ("nenhum clique duplo vira erro falso"). O CA-11.a lista só cadastro, check-in/out e liberação, então isto é **pendência da SPEC-11, não regressão desta branch**.
**Correção sugerida:** `const delLock = useRef(false)` e `mutateOnce(delLock, del.mutate, id, {...})` nas duas telas (2 linhas em cada). Se ficar para depois, registre como pendência no relatório da sessão.

### 🟢 [UX] O 422 do cancelamento perdeu a mensagem humana do servidor
**Onde:** `frontend/apps/pms/src/features/reservations/reservationsApi.ts:230-232`
**Cenário:** o `CancelReservationController.js:10-14` já manda texto legível: "Reserva já cancelada", "Reserva já encerrada", "Não é possível cancelar uma reserva com hóspede no quarto". O descarte geral do `serverMessage` no 422 também joga fora esse texto, e o cancelamento só mostra "mudou de situação em outro atendimento". O CA-11.b continua atendido. A recepção perde o motivo, mas o selo da tela recarrega. O fixture do teste (`reservationsApi.test.ts:121`) usa `"Cancelamento não permitido no status 'CHECKED_OUT'"`, texto que o backend só manda para um status sem entrada no mapa. Ele não representa o caso real.
**Regra violada:** nenhuma, é melhoria.
**Correção sugerida:** opcional. Descartar só quando o texto tiver código de status (`/PENDING|CONFIRMED|CHECKED_|CANCELLED/`), ou aceitar o comportamento e anotar a decisão.

### 🟢 [Duplo clique] Janela residual no detalhe: o botão reabre antes de o status novo chegar
**Onde:** `frontend/apps/pms/src/features/reservations/ReservationDetailPage.tsx:86-96` e `178`. Liga com `reservations/queries.ts:110-115`.
**Cenário:** o `onSettled` da mutação invalida as reservas sem esperar (corpo em bloco, sem `return`). A trava solta e o `isPending` cai antes de o refetch trazer `CHECKED_IN`. Nesse intervalo, "Fazer check-in" (primary, linha 178) volta habilitado com o status velho. Um 3º clique ali manda outro PUT, que volta 422, e a mensagem de erro troca o "Check-in feito". O intervalo é de um round-trip do GET, e o triplo clique do autor não caiu nele. Já existia antes da branch, porque o `isPending` tinha a mesma janela. **SUSPEITA de impacto baixo.** O painel Hoje não tem esse problema: o `after()` fecha o ConfirmPanel no `onSettled` (`rows.tsx:222-223`).
**Correção sugerida:** nenhuma para o MVP. Se incomodar, o `onSuccess` grava o status novo no cache (`setQueryData`) antes de soltar a trava.

### 🟢 [Higiene] `.env.bak-19nov` não rastreado na raiz
**Onde:** working tree (`git status`)
**Cenário:** um `git add .` leva para o commit uma cópia de `.env`, com segredos. Não está no diff.
**Correção sugerida:** apagar o arquivo, ou pôr `.env.bak*` no `.gitignore`.

## Repassados a outro dev
Nenhum.

Observação fora do diff, sem repasse porque o dono é o mesmo dev: `reservations/components/PaymentForm.tsx:62,120-121,145` tem uma trava manual (`sending` ref) que repete o `submitOnce`. Não há defeito: o pagamento já está protegido contra o 2º clique. É candidato a usar `mutateOnce` depois de 10/12 (DRY).

## O que foi verificado e está correto
- **A trava não fica presa.** A 5.101.4 envolve `onSuccess` e `onSettled` em `try/catch` separados (`mutationObserver.js` `#notify`). Um `onSuccess` que lança não impede o `onSettled`, e o `finally` do `mutateOnce` solta mesmo se o `onSettled` de quem chamou lançar (`submitLock.ts:47-53`).
- **Componente desmontado antes da resposta:** os callbacks do `mutate` não rodam (`hasListeners()` falso). Mas o `lock` é um `useRef` do próprio componente e morre junto. Uma montagem nova começa com `false`. O "Liberar quarto", cuja linha some, usa `promiseOnce` com `.finally(release)`, que não depende do observer.
- **Mutação pausada sem rede:** a trava fica presa enquanto a mutação estiver `pending`/`isPaused`, o mesmo tempo em que o `disabled={isPending}` já segura o botão. Ela solta quando a mutação sai. Não há estado novo de "botão habilitado e morto".
- **`navigate` no `onSuccess`:** `onSuccess` e `onSettled` rodam no mesmo `notifyManager.batch`, então a trava solta antes de a navegação desmontar a tela. `return navigate('/quartos')` sem mudanças no RoomEditPage (`RoomFormPages.tsx:140`) não pega a trava e não a deixa presa.
- **Cadastro de quarto e de categoria:** o `onSuccess` do hook retorna `invalidateQueries` (`rooms/queries.ts:64,138`) e é aguardado. O `isPending` e a trava cobrem o refetch inteiro, até a navegação.
- **Hooks antes dos returns:** `lock` em `ReservationDetailPage.tsx:83`, antes do 1º return (linha 105, coberto pelo teste da linha 119). `CategoryFormPages.tsx:27,60`, `RoomFormPages.tsx:44,85` e `rows.tsx:217,432` não têm return antecipado antes do JSX.
- **Todas as transições do detalhe passam por `run`:** check-in (178, 203), check-out (374) e cancelar (252). O cancelamento ganhou a trava sem custo.
- **Um observer por tela, sem chamada de `transition.mutate` fora da trava, e sem `.reset()`** nas features tocadas. Por isso uma 2ª chamada não trava pela troca de `#mutateOptions`.
- **CA-11.b:** só `CheckInController.js:40` e `CheckOutController.js:28` mandam status cru, os dois em 422, e agora são descartados. O 409 `ROOM_NOT_AVAILABLE` usa `UNAVAILABLE_LABEL` (texto humano). A janela de check-in (`CHECK_IN_TOO_EARLY`/`RESERVATION_EXPIRED`) entra antes do descarte (`reservationsApi.ts:225-227`) e tem teste (`reservationsApi.test.ts:132`).
- **CA-11.i, "Abrir mesa":** `openAccountOnce` passa `{ onSuccess: onOpened, onSettled: release }` como antes. O contrato não mudou, e os testes de `features/accounts` estão verdes. A API não foi tocada.
- **Rodei** `vitest run src/lib src/features/reservations/reservationsApi.test.ts src/features/accounts`: 19 arquivos e 203 testes verdes.
- Sem `require()`, sem dependência nova, sem PII nova.

## Não foi possível verificar
- "Liberar quarto" no navegador: o ambiente de QA não sobe o analytics, como o autor também registrou. A revisão foi só por leitura de código.
- A ordem real dos dois `DELETE` no 2º achado 🟡: não reproduzi.
- Não rodei a suíte inteira, o typecheck, a mutação nem o `pnpm e2e`. Confiei no que o autor relatou (572 verdes, typecheck limpo, 3 mutantes mortos).

---

## Tratamento das ressalvas (Sirlande, 22/11)

| # | Achado | O que foi feito | Commit |
|---|---|---|---|
| 🟡1 | Nenhum teste liga as telas à trava | `src/components/singleSubmit.test.ts`: lê as telas do balcão e falha se houver `x.mutate(` direto ou `x.mutateAsync(` fora do `promiseOnce` (mesma linha do `hooksOrder.test.ts`). O RED pegou os dois `del.mutate` do 🟡2 | `b507d02` |
| 🟡2 | Exclusão de quarto e categoria sem trava | `mutateOnce` no `del.mutate` das duas telas. No navegador: triplo clique em excluir o quarto 901 deu 1 DELETE (204) e voltou para a lista sem alerta | `5edb750` |
| 🟢3 | Motivo humano do cancelamento apagado | O motivo do servidor volta quando não tem palavra em CAIXA_ALTA, que conta como código. O teste usa os três textos reais do `CancelReservationController` | `b507d02`, `5edb750` |
| 🟢4 | 3º clique no detalhe entre a resposta e o refetch | Fica como pendência: a janela já existia antes da branch, e esperar a invalidação mexe no hook compartilhado | — |
| 🟢5 | `.env.bak-19nov` não rastreado | Sem mudança: é arquivo local do Sirlande, fora do diff | — |

Suíte do pms depois do tratamento: 61 arquivos e 579 testes verdes, typecheck limpo.
