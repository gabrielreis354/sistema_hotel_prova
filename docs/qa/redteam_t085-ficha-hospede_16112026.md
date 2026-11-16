# QA Red Team — T-08.5, ficha do hóspede (correção dos 4 🟡 do qa-explorador de 16/11)
**Branch:** feature/t085-cabecalho-cartoes (PR #167) · **Dev:** Sirlande · **Base:** e697497 · **Data:** 16/11/2026
**Commits auditados:** 4a32bb8 (docs), 3220029 (RED), 6f8cd54 (fix)
**Arquivos auditados:** 10 (8 de código, 2 de docs)
**Achados no escopo:** 5 (🔴 0 · 🟡 2 · 🟢 3) · **Repassados:** 1

## Veredito
**APROVADO COM RESSALVAS**

Nenhum 🔴 no escopo. Os dois 🟡 são do mesmo tipo: a correção cumpre o achado no DOM, mas não
na tela que a pessoa vê. O 🟡-1 é o mais importante, porque o achado 🟡-1 do qa-explorador
(CA-08.f, "motivo **em texto**") continua aberto para quem enxerga a tela.

## Achados no escopo

### 🟡-1 [UI / CA-08.f / DRY] O motivo do "Excluir" desabilitado não aparece para ninguém que enxerga a tela
**Onde:** `frontend/apps/pms/src/features/guests/GuestDetailPage.tsx:97-109`; base do botão em `frontend/packages/ui/src/Button.tsx:11` (`disabled:pointer-events-none`)
**Cenário:** `recepcao@qa.test` abre `/hospedes/<id>`. O "Excluir" aparece desbotado (`opacity-50`) e nenhum texto explica por quê:
- o `title` (linha 98) não abre, porque o botão desabilitado tem `pointer-events: none`. O mouse atravessa o botão e o navegador não exibe o tooltip. No celular e no tablet do balcão não há tooltip de qualquer forma;
- o `<span>` com o motivo (linhas 106-108) é `sr-only`, invisível de propósito;
- o botão desabilitado sai da ordem do Tab, então o `aria-describedby` só é lido por quem navega pelo leitor de tela em modo de leitura.

O resultado é um botão apagado sem motivo, que é o que o CA-08.f proíbe: *"Toda ação indisponível continua visível, desabilitada e com motivo em texto"* (`docs/specs/SPEC-08-acabamento-corporativo.md:137`). As outras telas resolvem com texto visível: a faixa `ReadOnlyNotice` de quartos (`features/rooms/components/ReadOnlyNotice.tsx:7-12`), a lista de motivos do `StatusPicker` (`features/rooms/components/StatusPicker.tsx:52-58`) e o `ActionSlot` do `@hotel/ui` (`packages/ui/src/ActionSlot.tsx:16-36`), que foi promovido justamente para isso e é usado na reserva (`ReservationDetailPage.tsx:188`).
O teste `GuestDetailPage.test.tsx:77` confere só o atributo `title=`. Ele passaria igual com o motivo invisível, que é o caso agora.
**Regra violada:** SPEC-08 CA-08.f; DRY (o `ActionSlot` já existe e foi ignorado); checklist §7, "estado sem texto".
**Correção sugerida:** envolver o "Excluir" num `ActionSlot` (`state={{ enabled: canDelete, reason: DELETE_GUEST_REASON }}`), ou mostrar o motivo como texto visível (`text-xs text-gray-600`) no lugar do `sr-only`. No teste, conferir que o texto do motivo aparece fora de `class="sr-only"`.

### 🟡-2 [UI / CA-08.g] O link de volta do estado de erro tem cerca de 20 px de altura no celular
**Onde:** `GuestDetailPage.tsx:201-207` (`BackToGuests`, `inline-block text-sm`), usado no estado novo de erro e de 404 (`:73`) e no fim da ficha (`:194`)
**Cenário:** a 375 px, o hóspede não é encontrado. A única saída da tela é "← Voltar para hóspedes", com a altura da linha de `text-sm` (20 px), sem padding nem `min-h-touch`. Isso fica abaixo dos 48 px do CA-08.g, justamente na tela que o 🟡-4 do qa-explorador pediu para ter saída. O projeto já tem o link certo: `BackLink` em `features/reservations/components/primitives.tsx:46-52` (`inline-flex min-h-touch items-center … md:min-h-0 md:py-1`), que é o que a reserva usa no mesmo molde (`ReservationDetailPage.tsx:110`). O `BackToGuests` reescreve esse link sem a altura de toque. Ele só não é importável hoje porque `features/reservations/index.ts` não exporta o `BackLink`.
**Regra violada:** SPEC-08 CA-08.g (alvo de 48 px); DRY.
**Correção sugerida:** exportar o `BackLink` pelo `index.ts` das reservas (ou promovê-lo ao `@hotel/ui`) e usar `<BackLink to="/hospedes">`. Outra opção é pôr `inline-flex min-h-touch items-center md:min-h-0` no `BackToGuests`.

### 🟢-1 [Testes] A ligação `retry: retryGuestDetail` no `useGuest` não tem teste
**Onde:** `queries.ts:68`; `GuestDetailPage.test.tsx:39-40`
**Cenário:** se alguém apagar a linha 68, nenhum teste falha. O `queries.test.ts:48-61` testa a função isolada. O teste da página monta o próprio `QueryClient` com `retry: false` e preenche o cache com `prefetchQuery`, sem as opções do `useGuest`. Com a linha removida, o 404 volta a repetir (retry 1 do `lib/queryClient.ts:10`, com cerca de 1 s de espera) e a suíte continua verde. O "8 de 8 mutantes mortos" não inclui esse mutante.
**Correção sugerida:** um teste que confira `useGuest`/opções exportadas com `retry === retryGuestDetail`, ou extrair `guestDetailOptions(id)` (como `guestSearchOptions`) e testar o objeto.

### 🟢-2 [DRY] Terceiro molde de "não encontrado" e terceiro teste de 404 escrito à mão
**Onde:** `GuestDetailPage.tsx:62-75`
**Cenário:** sem falha hoje. O bloco copia `ReservationDetailPage.tsx:99-112` quase linha a linha, e `features/rooms/components/FormShell.tsx:29` (`NotFound`) é um terceiro molde. O `instanceof ApiError && status === 404` repete o `isNotFound` de `features/rooms/errorMessages.ts:48-50`. Na próxima mudança de texto ou de layout, as três telas vão divergir.
**Correção sugerida (pode ficar para a T-08.6):** promover para o `@hotel/ui` um `LoadFailure({ notFound, notFoundText, errorText, onRetry, back })` e um `isNotFound` compartilhado.

### 🟢-3 [Estados / Docs] "Tentar de novo" para 4xx que não é 404, e o "8 s" do exploratório não bate com a configuração
**Onde:** `GuestDetailPage.tsx:65-71`; `queries.ts:58-61`; `queries.test.ts:49`; `docs/qa/exploratorio_t085-cabecalho-cartoes_16112026.md:84`
**Cenário:**
- Um 400 ou 403 em `GET /guests/:id` cai no `ErrorState` com "Tentar de novo". A própria `retryGuestDetail` trata 4xx como resposta definitiva, e repetir nunca vai funcionar. Hoje o backend só devolve 404 ou 500 nessa rota (`GetGuestController.js:8`), então não acontece. É uma incoerência entre a regra de retry e a tela.
- O exploratório diz que o React Query "repete o 404 três vezes" (cerca de 8 s), e o comentário do teste repete isso. O app usa `retry: 1` (`lib/queryClient.ts:10`, o único `QueryClient` de `main.tsx`). A conta seria cerca de 1 s, a não ser que o ambiente de QA rode com outra configuração. A correção continua valendo. Só a justificativa registrada está imprecisa.
**Correção sugerida:** usar `status >= 400 && status < 500` como condição do aviso sem "Tentar de novo", e acertar o número no comentário do teste.

## Repassados a outro dev

| Sev. | Achado | Onde | Dono | Repasse |
|------|--------|------|------|---------|
| 🟡 | A edição do hóspede mostra "Hóspede não encontrado." em 500 e em queda de rede, sem volta e sem "Tentar de novo". É o mesmo defeito do 🟡-4 na tela irmã, que agora usa o mesmo `useGuest` | `GuestFormPages.tsx:47-48` | Sirlande (SPEC-08, `features/guests`) | `docs/qa/repasses/para_sirlande_16112026.md` |

## Respostas às perguntas do pedido

- **DRY, regra de papel:** `canDeleteGuest` repete `role === 'ADMIN'` de `canWriteRooms` (`roomRules.ts:11-13`). Aceitei, porque cada função espelha uma rota diferente do backend (`guestRouter.js:21`, `requireRole('ADMIN')`) e só cresceriam juntas por acaso. **Molde de motivo e de não encontrado:** não foram reaproveitados (🟡-1, 🟡-2, 🟢-2).
- **Dublê do store:** não esconde defeito de lógica. O componente só usa a forma com seletor (`useAuthStore((s) => …)`), que é a que o dublê implementa, e o seletor devolve um booleano estável. A ressalva é a cobertura: o teste renderiza no servidor e verifica atributos, então não enxerga o `pointer-events-none` nem o `sr-only`, e por isso deixou passar o 🟡-1.
- **Regra dos hooks:** respeitada. `useGuest`, `useAuthStore`, `useDeleteGuest`, os `useState`, os `useRef`, o `useEffect` e o `useQuery` das estadias vêm todos antes do primeiro `return` (`GuestDetailPage.tsx:61`). O `guestQuery.refetch()` no `onRetry` não é hook. O teste textual (`GuestDetailPage.test.tsx:105-115`) funciona para o arquivo atual, mas não pega hook dentro de JSX nem `use` sem parênteses. Serve como trava razoável.
- **`retry` por função e a outra tela:** o único outro chamador de `useGuest` é `GuestEditPage` (`GuestFormPages.tsx:43`). Para ela, o 404 passa a falhar em cerca de 0 s em vez de cerca de 1 s. 500 e rede continuam com uma nova tentativa (`failureCount` começa em 0 no `retryer.ts:176-179` do query-core, então `failureCount < 1` equivale a `retry: 1`). Não há regressão. A tela de edição continua com o defeito antigo de chamar tudo de "não encontrado" (repassado). Efeito colateral bom: depois da exclusão, o `invalidateQueries` do `useDeleteGuest` refaz a ficha antes do `navigate` e esperava a nova tentativa do 404. Agora esperar não custa mais esse segundo.

## O que foi verificado e está correto
- Espelho do backend: `DELETE /guests/:id` exige ADMIN (`guestRouter.js:21`), e o `GET` não exige papel. `canDeleteGuest(undefined) === false` (fail-safe).
- 403 em `deleteGuest` (`guestsApi.ts:67`) vem antes do ramo genérico. O 409 e o 500 mantêm as mensagens, e o teste cobre os três.
- O `delError` agora sai em `Notice tone="error"`, que renderiza `role="alert"` (`packages/ui/src/Notice.tsx:22`).
- Foco: o `wasConfirming` só devolve o foco ao "Excluir" na passagem de aberto para fechado, e não na primeira montagem. O `ref` vai até o `<button>` pelo `forwardRef` do `Button`.
- Tabela: `overflow-x-auto` no `Card`, recuo `px-2 sm:px-4` e `whitespace-nowrap` nas células. O status não quebra.
- 404 de outro hotel: o backend filtra por tenant e devolve 404. A tela mostra o mesmo aviso e não diferencia "existe noutro hotel" de "não existe". Não há oráculo.
- Sem `require()`, sem `console.` com dado pessoal e sem dependência nova. Nenhum endpoint novo, então o Swagger não muda.
- O `DELETE_REASON_ID` fixo não colide, porque a ficha tem uma instância só.

## Não foi possível verificar
- Não rodei a suíte nem o navegador. A auditoria foi por leitura. O comportamento do `title` em botão com `pointer-events: none` vem da especificação de CSS e do Tailwind, e não de uma medição nesta sessão. Para confirmar: passar o mouse sobre "Excluir" como recepção, no ambiente de QA.
- A origem dos "8 s" no exploratório (🟢-3): não chequei se o ambiente de QA roda com outro `QueryClient`.

## Desfecho (Sirlande, 16/11)

| Achado | Desfecho |
|---|---|
| 🟡-1 motivo do Excluir invisível | Corrigido. `ActionSlot` do `@hotel/ui`, como na reserva: o motivo fica em texto embaixo do botão e ligado por `aria-describedby`. O `title` e o `sr-only` saíram. Teste: o texto existe numa tag sem `sr-only`. No navegador, a 375 e a 1280 px. O "Editar" ganhou `sm:self-start` para não esticar até a altura do bloco. |
| 🟡-2 volta com cerca de 20 px | Corrigido. Usa o `BackLink` das reservas (agora exportado pelo `index.ts`), com 48 px no celular, conferido no navegador. Teste: `min-h-touch` no link do 404. |
| 🟢-1 retry sem teste | Corrigido. `guestDetailOptions` separada do hook, como a `guestSearchOptions`. Teste: `retry === retryGuestDetail`. O mutante que apaga o `retry` agora morre. |
| 🟢-2 terceiro molde de "não encontrado" | Fica para a T-08.6, junto com a promoção do `ButtonLink`: um `NotFound` comum no `@hotel/ui`. |
| 🟢-3 4xx fora do 404 e os "8 s" | Sem mudança. O backend só responde 404 ou 500 nessa rota. Os 8 s foram medidos no exploratório; a causa exata não foi apurada. |
| Repasse `GuestFormPages.tsx:47` | Corrigido a pedido do Sirlande. O estado de erro da ficha virou `GuestLoadError` (módulo de hóspedes), usado pela ficha e pela edição: 404 com aviso e volta, 500 e rede com "Tentar de novo". Testes no `GuestDetailPage.test.tsx` (404, 500, carregado). No navegador: o 404 na edição tem volta de 48 px, e o hóspede real abre com o formulário preenchido. Mutação: 3 de 3 mortos. |

Mutação nas correções das ressalvas: 3 de 3 mutantes mortos (sem retry, sem o motivo, volta sem alvo de toque).
