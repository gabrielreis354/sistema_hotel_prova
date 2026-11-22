# QA Red Team — comanda-abrir-conta-duplo-toque
**Branch:** fix/comanda-abrir-conta-duplo-toque · **Dev:** Sirlande · **Base:** develop@859cb30 · **Data:** 22/11/2026
**Commits auditados:** `1b6cfd3` test(comanda): RED da trava · `296ce7e` fix(comanda): duplo toque em Abrir mesa abre uma conta só
**Arquivos auditados:** 3 (`features/accounts/submitLock.ts`, `features/accounts/submitLock.test.ts`, `features/accounts/components/OpenAccountForm.tsx`). Para confirmar cenários também li: `features/accounts/queries.ts` (`useOpenAccount`), `features/accounts/accountsApi.ts` (`openAccount`), `features/accounts/connection.ts`, `features/accounts/AccountsListPage.tsx`, `lib/queryClient.ts`, `features/reservations/components/PaymentForm.tsx` e o `MutationObserver` do `@tanstack/query-core@5.101.4` instalado.
**Achados no escopo:** 4 (🔴 0 · 🟡 2 · 🟢 2) · **Repassados:** 0

## Veredito
**APROVADO COM RESSALVAS**

Não achei nenhum caminho em que a trava fica presa com o componente montado, nem em que o botão parece habilitado e não envia. Conferi isso no código do `MutationObserver` e com um teste descartável em scratchpad contra o `QueryClient` real (detalhes abaixo). Ficam duas ressalvas 🟡. A primeira: o teste cobre só o helper, e a ligação `onSettled: release` no formulário pode ser removida sem que nada falhe. A segunda: a trava não cobre o "Cancelar e abrir de novo" com a rede caída, que continua gerando duas contas. Esse defeito já existia antes da branch.

## Achados no escopo

### 🟡 [Testes] A ligação da trava no formulário não tem teste: tirar o `onSettled: release` deixa o botão morto depois do primeiro envio, e a suíte passa
**Onde:** `frontend/apps/pms/src/features/accounts/components/OpenAccountForm.tsx:44-46`; `frontend/apps/pms/src/features/accounts/submitLock.test.ts` (inteiro)
**Cenário:** os 3 testes chamam `submitOnce` com um `send` falso. Nenhum deles importa o `OpenAccountForm` nem passa pelo `mutate`. Basta trocar `{ onSuccess: onOpened, onSettled: release }` por `{ onSuccess: onOpened }`, ou passar o `release` para o `onSuccess`, que é o erro mais provável numa refatoração. Aí, depois de um 500 ou 409, o `isPending` volta a `false` e o botão aparece habilitado, mas o `submit` cai no `if (lock.current) return false` e não envia nada. O garçom fica tocando num botão que não reage, até sair da tela. A suíte continua verde. Mutação feita no helper (o `release` deixou de soltar a trava): 2 de 3 testes falharam, então o helper está bem coberto. O que fica sem cobertura é a ligação dele com o formulário, que é exatamente onde o defeito apareceu.
**Regra violada:** checklist §8, teste que passaria com a regra quebrada.
**Correção sugerida:** dá para testar em environment node, sem DOM. Duas formas:
(a) extrair o handler para uma função pura do tipo `openOnce(lock, mutate, vars, onOpened)` e testá-la com `QueryClient` + `MutationObserver` reais do `@tanstack/query-core`. Fiz isso em scratchpad e funciona: `mutationFn` que lança → `lock.current === false`; sucesso → `false`; offline → `true` até o `onlineManager.setOnline(true)`;
(b) no mínimo, um teste que monta o `mutate` real com um `mutationFn` que rejeita e confere que o segundo `submitOnce` devolve `true`.

### 🟡 [Fluxo / dinheiro indireto] Sem rede, "Cancelar" e abrir de novo ainda cria duas contas iguais quando a rede volta (defeito anterior à branch, que a trava não cobre)
**Onde:** `frontend/apps/pms/src/features/accounts/components/OpenAccountForm.tsx:36` (trava por instância) e `:87-89` (Cancelar habilitado durante o envio); `AccountsListPage.tsx:49-51` (Cancelar desmonta o formulário)
**Cenário:** o garçom está com o aparelho em modo avião ou com o Wi-Fi caído (`onlineManager` offline). Ele toca "Abrir mesa" com "Mesa 5". As mutações usam o `networkMode: 'online'` padrão (`lib/queryClient.ts` não muda o padrão das mutações), então a mutação fica **pausada**: `isPending` é true e o botão mostra "Abrindo…" sem prazo. Confirmei no teste descartável: `isPaused` e `isPending` true, `lock.current` true. Ele toca "Cancelar". O formulário desmonta, o observer perde os listeners e a mutação pausada **continua no `MutationCache`**. Ele toca "Abrir conta" e digita "Mesa 5" de novo. A instância nova tem `sending.current === false` e `isPending === false`, e envia a segunda. O aviso "Já existe uma conta aberta com esse nome" não aparece, porque a lista em cache ainda não tem a primeira. Quando a rede volta, o `resumePausedMutations` manda os dois POST e nascem duas "Mesa 5". Item lançado na conta errada vira cobrança errada no fechamento.
O defeito não foi introduzido aqui: na `develop` acontece igual. Mas o arquivo é o mesmo, a classe de defeito é a mesma (duas contas a partir de um gesto do garçom), e o comentário da linha 34-35 dá a impressão de que o problema acabou.
**Regra violada:** checklist §7, "lançamento sem idempotência (`client_item_id`) — a fila offline duplica" (aqui na abertura da conta, não no item).
**Correção sugerida:** a menor correção é desabilitar o "Cancelar" enquanto `open.isPending`, ou trocar o "Abrindo…" por "Sem conexão — a mesa abre quando a rede voltar" quando `open.isPaused`, como a `useOnline` já faz na faixa da comanda. A correção de verdade é idempotência no `POST /accounts` (`client_request_id`), mas aí muda o contrato e não cabe antes do congelamento de 24/11. Registrar como pendência.

### 🟢 [DRY] Segunda trava síncrona escrita à mão; o helper fica num lugar que o `PaymentForm` não alcança naturalmente
**Onde:** `frontend/apps/pms/src/features/accounts/submitLock.ts:9`; duplicata em `frontend/apps/pms/src/features/reservations/components/PaymentForm.tsx:62,112,120-121,144-145` (fora do diff)
**Cenário:** o `PaymentForm` tem o mesmo `sending` ref (checa, liga, solta no `onSettled`) escrito inline. As duas versões já divergem: a do `PaymentForm` solta em mais de um lugar (linha 112 e no `onSettled`), e a daqui solta também quando o `send` lança. Os outros formulários de criação (`GuestFormPages.tsx:31`, `NewReservationPage.tsx:71`, `RoomFormPages.tsx:60`) só têm o `disabled={isPending}`, e o próximo que precisar da trava vai procurar em `lib/`, não em `features/accounts/`.
**Correção sugerida:** depois do congelamento, mover `submitLock.ts` para `src/lib/` e usar no `PaymentForm`. Nesta branch, nada a fazer. O `PaymentForm` está fora do diff e não entra no veredito.

### 🟢 [KISS / Testes] O ramo `catch` do `submitOnce` cobre um caso que o chamador nunca produz
**Onde:** `frontend/apps/pms/src/features/accounts/submitLock.ts:15-19`; teste em `submitLock.test.ts:28-36`
**Cenário:** o `mutate` do `useMutation` v5 não lança de forma síncrona. Ele devolve a promise do `observer.mutate` com `.catch(noop)`, e o erro do `mutationFn` chega pelo `onError`/`onSettled`. Um erro dentro do `onSuccess` (por exemplo, o `navigate` do `onOpened`) é engolido pelo `try/catch` do `#notify`, e o `onSettled` roda mesmo assim (`mutationObserver.js`, bloco `action.type === "success"`). Então o ramo `catch` e o terceiro teste protegem um caminho que não existe neste chamador. O código é barato e defensivo, e não faz mal. O que incomoda é que o teste dá uma sensação de cobertura que falta justamente na ligação real (ver o primeiro 🟡).
**Correção sugerida:** manter, mas trocar o nome do teste para deixar claro que é contrato do helper, não comportamento do formulário. Ou manter o ramo e gastar o esforço de teste no primeiro 🟡.

## Repassados a outro dev
nenhum

## O que foi verificado e está correto
- **A trava sempre solta com o componente montado.** Pelo `MutationObserver` do 5.101.4, o `onSettled` passado no `mutate` roda em sucesso e em erro sempre que `#mutateOptions && hasListeners()`. Os três jeitos de perder o callback com o componente montado não acontecem aqui: (1) outro `mutate` no mesmo observer, que a própria trava impede; (2) `reset()`, que não é chamado; (3) `mutationKey` que muda, e não há key. Um `onSuccess` que lança não impede o `onSettled`, porque cada um tem o seu `try/catch`.
- **Desmontar durante o envio não prende ninguém.** O callback por chamada deixa de rodar (confirmado no scratchpad: `lock.current` continua `true` depois de resolver sem listeners), mas o ref morre junto com a instância, e a próxima montagem começa com `false`. Esse risco só aparece se a trava um dia sair do componente para um escopo de módulo.
- **Rede caída (mutação pausada):** a trava fica presa enquanto `isPending`/`isPaused` estão true e solta quando o `onlineManager` volta (confirmado no scratchpad: 1 chamada do `mutationFn`, `lock.current === false` depois). O "Abrindo…" sem prazo é o mesmo comportamento da `develop`, e o botão nunca fica habilitado com a trava presa. Wi-Fi sem internet (onlineManager online, fetch falha): `retry` de mutação é 0 por padrão, o erro chega e a trava solta.
- **Erro do backend:** `openAccount` lança `ApiError` em qualquer `!response.ok` (`accountsApi.ts:39-41`), então 4xx/5xx passam pelo `onError` e pelo `onSettled`, e a mensagem aparece no `Field` (`open.error?.message`).
- Enter no input e clique no botão passam pelo mesmo `submit`, com a mesma trava.
- Os testes do helper passam (3/3) e pegam a mutação "release não solta" (2/3 falham).
- Sem `require()`, sem PII nova, sem endpoint novo, sem mudança de contrato.

## Não foi possível verificar
- Não rodei a suíte inteira do `pms` nem a cobertura. A working tree estava em outra branch (`fix/seed-cpfs-validos`, com alterações locais) e não fiz checkout. Rodei os dois arquivos da branch extraídos com `git show` para o scratchpad.
- Não reproduzi no navegador. A verificação com Playwright (duplo e triplo toque = 1 POST; segunda tentativa depois de 500 abre) é a relatada pelo dev. O cenário de rede caída com Cancelar (segundo 🟡) foi confirmado só no nível do `QueryClient`, sem o React montado.
- `NewReservationPage`/`GuestFormPages` sem trava síncrona: não confirmei se o backend segura o segundo POST (conflito de quarto, CPF único). Por isso não virou repasse.

---

## Desfecho (22/11, Sirlande com o Claude Code)

| Achado | Tratamento |
|---|---|
| 🟡 Teste só do helper, sem a ligação com o formulário | **Corrigido.** A ligação virou `openAccountOnce` (exportada de `OpenAccountForm.tsx`), testada com `QueryClient` e `MutationObserver` reais em `OpenAccountForm.test.ts`: duplo toque, erro do servidor e sem rede. RED visto antes; tirar o `onSettled: release` derruba 2 dos 3 casos. |
| 🟡 Sem rede, Cancelar e abrir de novo duplicava | **Corrigido.** "Cancelar" fica desabilitado durante o envio, e o botão mostra "Sem conexão…" enquanto a mutação espera a rede. No navegador: sem rede, Cancelar travado e 1 POST quando a rede volta. Idempotência do `POST /accounts` fica como pendência depois do congelamento. |
| 🟢 DRY com o `PaymentForm` | **Depois do congelamento:** levar `submitLock.ts` para `src/lib/` e usar no `PaymentForm` e na T-11.3 (sugerido no parecer da SPEC-11, PR #179). |
| 🟢 `catch` do `submitOnce` sem caso real neste chamador | **Mantido.** Custa 4 linhas e protege um chamador futuro cujo `send` lance; o teste da ligação agora cobre o caminho real. |

Portões: pms 57 arquivos / 537 testes, typecheck limpo.
