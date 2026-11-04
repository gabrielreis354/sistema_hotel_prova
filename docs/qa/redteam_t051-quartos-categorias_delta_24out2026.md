# QA Red Team — T-05.1 quartos e categorias (reauditoria delta)
**Branch:** feature/t051-quartos-categorias · **Dev:** agente executor (trilha do Gabriel) · **Base:** develop@c6742b2 · **Delta:** 6c9a6a5..63e0009 (4 commits: 75395a0, 22f47b2, 32bfb4f, 63e0009) · **Data:** 24/10/2026
**Arquivos auditados:** 19 no delta. Código: `features/rooms/` (`RoomFormPages`, `RoomForm`, `CategoryFormPages`, `CategoryForm`, `roomRules`, `roomsApi`, `queries`, `errorMessages`, `DeleteControl`, `StatusPicker` e os 2 testes), `features/guests/guestsApi.ts`, `services/core-service/config/swagger.js` e `api-client` (`openapi.json`, `schema.d.ts`). Docs: relatório, SPEC-05 e retomada. Para conferir o contrato, li também `UpdateRoomController`, `DeleteRoomController`, `UpdateRoomCategoryController`, `DeleteRoomCategoryController`, `UpdateGuestController`, `lib/queryClient.ts` e os testes RED de `fix/tenant-fk-validation` (`tests/rooms-categories-rules.test.js`).
**Achados no escopo:** 3 (🔴 0 · 🟡 2 · 🟢 1) · **Repassados:** 0

## Veredito
**APROVADO COM RESSALVAS**

As três ressalvas da rodada anterior foram tratadas:
- **🟡-1 fechado no caso de base.** O PUT leva só o que mudou. Sobra uma brecha estreita: o "original" muda se a query for rebuscada com o formulário aberto (🟡-1 abaixo).
- **🟡-2 fechado.** O `requestBody` dos três PUTs está declarado no Swagger. O api-client sai idêntico quando é regenerado. Não há nenhum `as never`, `as unknown as`, `as any` ou `@ts-ignore` em `apps/pms/src`.
- **🟡-3 fechado no cliente.** A trava saiu e o 409 tem mensagem própria. A garantia depende do backend, que **ainda não existe na develop**.

Não há 🔴 no escopo. As duas 🟡 novas nascem da integração com `fix/tenant-fk-validation`, que passa a devolver 409 e 404 em casos que a tela ainda trata como "número duplicado" e "quarto excluído".

### Ordem de merge (obrigatória)
**`fix/tenant-fk-validation` antes da T-05.1.**
- Até lá, `DeleteRoomCategoryController.js:9` aceita excluir categoria em uso (204, reproduzido na rodada anterior). Como a trava do cliente saiu de propósito, mergear a T-05.1 primeiro deixa a develop **sem nenhuma barreira**.
- O mesmo vale para a máquina de estados do PUT /rooms (R-3). É ela que neutraliza o dano do 🟡-1 abaixo.
- Hoje `fix/tenant-fk-validation` está em RED (6f02ee4): "31 falham, 13 passam", e R-2 a R-6 ainda estão por implementar. **A T-05.1 espera o GREEN dela.**

Ordem sugerida: `fix/tenant-fk-validation` → `feature/t051-quartos-categorias`. `fix/t0613-estorno-pagamento` e `fix/repasses-gabriel-out` são independentes e podem entrar em qualquer ponto. **Quem mergear por último roda `pnpm gen:api`**: as duas `fix/` mudam o `swagger.js` sem regenerar o `openapi.json` (ver a verificação de merge abaixo).

### Execução (saída real, worktree `/home/gabri/wt-t051`, Node 24.14, pnpm 9.15)
| Verificação | Resultado |
|---|---|
| `grep -rnE "as never\|as unknown as\|as any\|@ts-ignore\|@ts-expect-error" apps/pms/src` | nenhum |
| `pnpm run generate` no api-client (regenerar e comparar) | 46 paths, e `git status` limpo depois: o cliente é **gerado, não editado à mão** |
| `pnpm -r typecheck` | api-client, domain, ui e pms: Done |
| `pnpm -r test` | domain 37/37, pms 31/31 |
| `pnpm --filter ./apps/pms build` | ✓ `index-BphNs2gd.js` 401,16 kB |
| `bash scripts/qa_checks.sh` | 0 erros e 3 avisos, os mesmos 3 da rodada anterior, todos de fora de `features/rooms` |
| `git merge-tree --write-tree` contra `fix/tenant-fk-validation` (6f02ee4), `fix/t0613-estorno-pagamento` (93b1b36) e `fix/repasses-gabriel-out` (5f9aa4a) | rc=0 nas três, **sem conflito**. As duas últimas mexem no `swagger.js` em outros trechos (enums de pagamento, PUT de reserva, DELETE do pivô) |
| Merge encadeado das quatro num worktree temporário (`develop` + fk + t0613 + repasses + t051) | Sem conflito. `swagger.js` carrega, e os três PUTs mantêm `requestBody` (`/rooms/{id}`: 200, 400, 404, 409). `pnpm gen:api` regenera com sucesso e o `pnpm -r typecheck` passa. O regenerado difere do commitado em +437/−41 linhas, todas de t0613 e repasses (pagamento, reserva), nenhuma de rooms ou guests. Worktree removido |
| Backend | Não subi. O delta não toca controller, e o `swagger.js` só é lido por `router.js:72` (swagger-ui). Não há `express-openapi-validator` nem outro consumidor em runtime, então declarar `requestBody` **não muda o comportamento do backend** |

---

## Achados no escopo

### 🟡-1 [Integridade / máquina de estados] O "original" do diff acompanha a query, mas o formulário não: um refetch com a tela aberta reenvia o status velho
**Onde:**
- `frontend/apps/pms/src/features/rooms/RoomFormPages.tsx:88-95` (`original` é recalculado a cada render, a partir de `room.data`)
- `RoomFormPages.tsx:135` (`changedRoomFields(original, input)`)
- `RoomForm.tsx:69-72`: o `useForm` lê `defaultValues` só na montagem. O RHF guarda em cache e não aplica mudança sem `reset()`.

**Cenário:**
1. O ADMIN abre a edição do quarto 101, que está `AVAILABLE`, para corrigir o andar. O formulário fixa `status: AVAILABLE`.
2. A recepção, em outro computador, faz o check-in, e o quarto 101 passa a `OCCUPIED`.
3. A rede do ADMIN cai e volta, o que é comum em pousada. A query do detalhe já está velha (`staleTime: 30_000`, `lib/queryClient.ts:8`), e o `refetchOnReconnect` do TanStack (padrão `true`; só o `refetchOnWindowFocus` foi desligado) rebusca. Agora `room.data.status = OCCUPIED`.
4. O `RoomForm` continua montado, com `status = AVAILABLE` no estado do formulário. O `StatusPicker` passa a desabilitar "Livre", mas o valor selecionado continua lá.
5. O ADMIN salva o andar. `changedRoomFields({status: OCCUPIED, …}, {status: AVAILABLE, …})` devolve `{ floor, status: "AVAILABLE" }`.
6. Na develop de hoje, o backend aceita (200, reproduzido na rodada anterior), e o quarto volta a Livre com hóspede dentro. É o 🟡-1 original, por outro caminho.

O mesmo vale para os outros campos. Se outro admin mudou o andar, o refetch move o original e o PUT desfaz a mudança dele.

**Atenuantes:**
- O gatilho é estreito: reconexão com mais de 30 s de tela aberta.
- Com `fix/tenant-fk-validation` mergeada antes (R-3: `OCCUPIED → AVAILABLE` vira 409), o dano no status é barrado pelo backend. Sobra a mensagem errada (🟡-2).

**Confirmação:** por leitura do código e da configuração do QueryClient. Não reproduzi no navegador.
**Regra violada:** CLAUDE.md §3, máquina de estados de quartos. A correção do 🟡-1 anterior prometia que "corrigir o andar não toca no status".
**Correção sugerida:** o diff precisa comparar com o snapshot que o formulário carregou, e não com a query viva. Duas formas:
- Congelar o `original` na primeira carga, com `useState`/`useRef` iniciado quando `room.data` chega pela primeira vez.
- Usar `formState.dirtyFields` do RHF, que já compara com os `defaultValues` cacheados.

Teste: componente com `room.data` trocado entre a montagem e o submit, conferindo que o corpo não leva `status`.

### 🟡-2 [Mensagem errada / integração] Os novos 409 do backend (`fix/tenant-fk-validation`) caem em "número duplicado" e em "faça o check-out"
**Onde:** `frontend/apps/pms/src/features/rooms/errorMessages.ts:36-49`. Fora do `delete`, todo 409 de `room` é "Já existe um quarto N neste hotel". No `delete` de quarto, é sempre "Faça o check-out antes".

**Cenário:** a ordem de merge obrigatória faz estes 409 ficarem ativos **no momento** em que a T-05.1 entrar. Os testes RED de `tests/rooms-categories-rules.test.js` em 6f02ee4 os definem:
1. **PUT com transição proibida → 409** (linhas 100-112). O ADMIN abriu o quarto `AVAILABLE` e escolheu "Manutenção", e a recepção fez o check-in no meio. O backend recusa `OCCUPIED → MAINTENANCE` com 409, e a tela diz **"Já existe um quarto 101 neste hotel. Use outro número."** O ADMIN não mudou o número e não sabe o que fazer. A mesma mensagem aparece no caso do 🟡-1.
2. **DELETE de quarto com reserva PENDING/CONFIRMED futura, ou de quarto extra de reserva ativa → 409** (linhas 234-251). A tela diz "Este quarto está em uso… **Faça o check-out antes**", mas não há check-out a fazer: o certo é cancelar ou mover a reserva.

**Regra violada:** "erro diz o que fazer" (CATALOGO/DESIGN_PMS). A mensagem atual manda o operador fazer a coisa errada.
**Correção sugerida:** o menor ajuste é distinguir no cliente.
- Para o PUT: se `changes` leva `status` e não leva `number`, o 409 é de transição ("O status do quarto mudou enquanto você editava. Recarregue a página e confira."). Se leva os dois, use um texto que cubra os dois casos.
- Para o DELETE de quarto: "Este quarto está ocupado ou tem reserva ativa ou futura. Faça o check-out ou mova a reserva antes."

O ideal é o backend mandar um `code` no corpo do 409. Fica para combinar com `fix/tenant-fk-validation`, que ainda vai escrever o Swagger dos novos 409. Teste: `writeErrorMessage` com o contexto novo.

### 🟢-1 [Mensagem errada / integração] 404 no PUT de quarto por categoria excluída diz que o quarto foi excluído
**Onde:** `errorMessages.ts:58-63`. O caso especial "a categoria escolhida não existe mais" só cobre `action === 'create'`.
**Cenário:** pela decisão de 24/10 de `fix/tenant-fk-validation` ("outro hotel, inexistente, excluído → 404"), o `PUT /rooms/:id` com `category_id` de categoria excluída passa a dar 404.
1. O ADMIN abre a edição e troca a categoria para "Luxo".
2. Outro admin exclui "Luxo" no meio.
3. A tela diz "Este quarto não existe mais — pode ter sido excluído por outra pessoa." O quarto existe.

**Correção sugerida:** no `update` de `room` com `changes.category_id` presente, o 404 deve dizer o mesmo que o `create` diz.

---

## Ressalvas anteriores — conferência
| Ressalva | Situação | Evidência |
|---|---|---|
| 🟡-1 status reenviado | **Fechada no caso base**; brecha residual no 🟡-1 acima | `roomRules.ts:56-63` compara campo a campo. Testes `roomRules.test.ts:74-96`: só o andar, só o status, nada (`{}`), `floor: null` e vários campos juntos. Se não há mudança, o PUT não sai (`RoomFormPages.tsx:136`) |
| 🟡-2 `as never` | **Fechada** | `swagger.js:741-744, 797-800, 839-842`. O schema do PUT de room bate com os campos que `UpdateRoomController.js:10` lê (`floor` integer nullable, `status` com o mesmo enum de `:4`). Guest bate com `UpdateGuestController.js:8`, category com `UpdateRoomCategoryController.js:8`. Os três controllers já eram parciais (`!== undefined`), então o "atualização parcial" do Swagger descreve o que existe. `updateCategory` ancora o corpo em `CategoryUpdateBody` (`roomsApi.ts:88`) |
| 🟡-3 trava só no cliente | **Fechada no cliente**; a garantia depende de `fix/tenant-fk-validation` | `blockedReason={null}` (`CategoryFormPages.tsx:92`). O 409 vira "Esta categoria ainda tem quartos…" (`errorMessages.ts:39-42`), com teste. A dica usa só o cache (`queries.ts:95-98`, `getQueryData`, sem fetch). O teste RED de fk espera exatamente 409 (`rooms-categories-rules.test.js:137-142`) |

### Casos-limite de `changedRoomFields` (pedidos pelo coordenador)
| Caso | Original → formulário | Corpo do PUT | OK? |
|---|---|---|---|
| Andar 0 sem mudança | `0` → `"0"` → `parseInt` = 0 | nada | ✓ (`0 !== 0` é falso) |
| Andar 0 a partir de nulo | `null` → `"0"` | `{floor: 0}` | ✓ (`0 !== null`) |
| `"-0"` digitado com original 0 | `parseInt("-0")` = −0 | nada | ✓ (`-0 !== 0` é falso; mesmo se fosse enviado, `JSON.stringify(-0)` = `"0"`) |
| Andar limpo | `3` → `""` → `null` | `{floor: null}` | ✓ O backend aplica, porque `null !== undefined` (`UpdateRoomController.js:23`) |
| Status igual | `AVAILABLE` → `AVAILABLE` | sem `status` | ✓ |
| Número com espaço | `"101"` → `" 101 "` (o zod faz `trim`) | nada | ✓ |
| Categoria excluída | `category_id` antigo → campo começa `""`, e a validação exige escolha | `{category_id: <nova>}` | ✓ O select não grava mais a primeira opção em silêncio. A SUSPEITA da rodada anterior está encerrada |
| Nenhuma mudança | — | não chama a API e volta para `/quartos` | ✓ |

## Os 🟢 da rodada anterior
| 🟢 | Situação |
|---|---|
| 🟢-1 teto da diária | ✓ `CategoryForm.tsx:10,27`: `MAX_DAILY_CENTS = 99_999_999` (R$ 999.999,99). É mais restrito que o teto planejado no backend (99.999.999,99), então não diverge para o lado perigoso |
| 🟢-1 5xx × rede | ✓ O 5xx diz "O sistema não conseguiu … avise o suporte" (`errorMessages.ts:66-69`). O fetch rejeitado continua falando da conexão (`messageOf`). Os dois têm teste |
| 🟢-1 comentário "sem tarifa" | ✓ A função e o comentário saíram. O relatório corrige o registro (linha 39) |
| 🟢-3 acessibilidade | ✓ Cada `<li>` de motivo tem `id`, e o botão desabilitado tem `aria-describedby` apontando para ele (`StatusPicker.tsx:39,54`). "Cancelar" virou `ActionLink` nos dois formulários |
| 🟢-2 `StatusBadge` sem consumidor, 🟢-4 `TOUCH` local | Sem mudança, como combinado (ficam para a T-05.2 e para a faxina) |
| SUSPEITA do select com categoria excluída | Tratada: aviso `role="status"` e campo vazio (`RoomFormPages.tsx:113-117, 126`) |

## Repassados a outro dev
Nenhum. O 🟡-2 depende de `fix/tenant-fk-validation`, que é trilha do Gabriel (retomada de 24/10, worktree `/home/gabri/wt-fk-tenant`). Ele vale como **nota de integração para quem fizer o GREEN de lá**: incluir no Swagger dos novos 409 um campo que diferencie o motivo, ou aceitar a heurística do cliente.

## O que foi verificado e está correto
- `body` dos três PUTs sem cast. `RoomUpdateBody` e `CategoryUpdateBody` vêm de `paths[...]['requestBody']`, sem tipo redefinido à mão. `guestsApi.ts` só perdeu o cast, e `GuestInput` cabe no schema (`cpf?: string` ⊂ `string | null`).
- A mudança no `swagger.js` se limita a três blocos `requestBody` (+12 linhas) e não toca em response, path nem schema compartilhado. Faz merge limpo com as três branches que mexem no Swagger.
- `useUpdateRoom` recebe `{ changes, number }`. O `number` serve só à mensagem de 409 e não vai no corpo.
- `useCachedRoomsUsingCategory` não dispara busca. Com zero quartos ou sem cache, devolve `0`/`null`, e a dica some.
- A coluna "Quartos" da lista de categorias segue contando no cliente. Está registrado na SPEC-05 como incompleto a partir da T-06.10. Não é regressão.
- O relatório e a SPEC-05 v2.2 registram que até `fix/tenant-fk-validation` "nada impede a exclusão".

## Não foi possível verificar
- **Navegador:** não reabri a UI. O 🟡-1 foi confirmado por leitura (RHF não reaplica `defaultValues`; `refetchOnReconnect` padrão). Os corpos de PUT capturados pelo executor cobrem só o caminho sem refetch.
- **Backend com os 409 novos:** `fix/tenant-fk-validation` está em RED. As mensagens do 🟡-2 e do 🟢-1 foram derivadas dos testes e das decisões registradas, não de resposta real.
- **Teste de componente** de `RoomEditPage`/`RoomForm`: continua inexistente (o `apps/pms` não tem testing-library nem jsdom). Foi o que deixou o 🟡-1 residual passar, como o original.
