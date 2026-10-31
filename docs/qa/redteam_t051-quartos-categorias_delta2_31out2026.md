# QA Red Team — T-05.1 quartos e categorias (reauditoria delta 2)
**Branch:** feature/t051-quartos-categorias · **Dev:** agente executor (trilha do Gabriel) · **Base:** develop@4234915 (PR #104), develop atual fbe086d · **Delta:** 74458e2..069a7a6. Commits próprios: 81b4a93, e07f660, 3f27492, e82c8fd e docs; merges: 19c7e26, 8d58ad4 e e36e60c · **Data:** 31/10/2026
**Arquivos auditados:** os que o delta muda em `features/rooms/` (`errorMessages`, `roomsApi`, `roomRules`, `RoomFormPages`, `CategoryFormPages`, as duas listas e os 3 testes), `routes/roomsRoutes.tsx` com o teste, `App.tsx`, `services/core-service/config/swagger.js` e o `api-client` regenerado. Para conferir o contrato, li `utils/roomErrors.js`, `Update/DeleteRoomController`, `Delete/UpdateRoomCategoryController`, `utils/roomRules.js` e `roomCategoryValidation.js`.
**Achados no escopo:** 3 (🔴 0 · 🟡 0 · 🟢 3) · **Repassados:** 1 (atualização de um repasse 🟢 que já existia)

## Veredito
**APROVADO**

Os quatro focos pedidos fecharam com chamada real ao backend da branch:
1. **Contrato.** Os 7 `code` chegam do servidor e cada um vira a mensagem certa, tanto pela função quanto pela tela, em desktop e em 375 px.
2. **Permissão.** Não houve regressão. O ADMIN escreve. A recepção só lê, recebe 403 em toda escrita e volta para `/` nas 4 rotas de formulário. O garçom não entra em nada de quartos.
3. **Mensagens.** Cada uma diz o que aconteceu e o que fazer, com contraste AA e alvos de 48 px, sem scroll horizontal.
4. **Swagger.** O merge preservou o #104 sem nenhuma alteração: `RoomError` é idêntico ao da develop, e as respostas das 6 rotas de escrita também. A branch só **acrescenta** `requestBody` nos três PUTs.

Os três 🟢 viram pendência pós-merge e não seguram o merge.

**Atenção no merge:** a develop andou para fbe086d (PR #105), que regenerou o `api-client`. O `swagger.js` não mudou na develop, então a diferença entre os dois lados é só o `requestBody` dos três PUTs. Se `openapi.json`/`schema.d.ts` derem conflito, **não resolva à mão**: aceite um dos lados e rode `pnpm gen:api`.

---

## Execução (saída real, worktree `/home/gabri/wt-t051`, Node 24.14, pnpm 9.15)

| Verificação | Resultado |
|---|---|
| `pnpm gen:api` | 49 paths, e `git status` limpo depois: cliente gerado, sem edição à mão |
| openapi da branch × `origin/develop` | 49 × 49 paths. `RoomError` igual: **True**. Diferenças só em `PUT /guests/{id}`, `PUT /room-categories/{id}` e `PUT /rooms/{id}`, todas no `requestBody` |
| `pnpm -r typecheck` | api-client, domain, ui e pms: Done |
| `pnpm -r test` | domain 37/37, pms 151/151 (12 arquivos) |
| `pnpm --filter ./apps/pms build` | ✓ `index-B9h2ulF7.js` 445,26 kB |
| `bash scripts/qa_checks.sh` | 0 erros e 3 avisos, todos anteriores e de fora de `features/rooms` |
| casts em `apps/pms/src` | só `@ts-expect-error` em `features/accounts/queueCore.test.ts:223` (T-05.5, não é desta branch). Nenhum em `rooms` |
| Ambiente próprio | `pg-qa051d` (Postgres 17, porta 5448), core-service da branch na 3058 (`migrate` limpo) e Vite na 5188 com config temporário fora do versionamento. Tudo derrubado e apagado no fim; `git status` limpo |

### 1. Contrato: corpo real do backend → `writeErrorMessage` real
Rodei um teste temporário em `apps/pms`, apagado depois. Ele chama o backend de verdade e passa o corpo recebido à função de produção:
```
INVALID_INPUT cat name vazio | HTTP 400 | code=INVALID_INPUT field=name | "Confira o campo Nome: valor faltando ou fora do formato."
INVALID_INPUT room floor x | HTTP 400 | code=INVALID_INPUT field=floor | "Confira o campo Andar: valor faltando ou fora do formato."
INVALID_INPUT POST status OCCUPIED | HTTP 400 | code=INVALID_INPUT field=status | "Confira o campo Status: valor faltando ou fora do formato."
INVALID_INPUT price 3 casas | HTTP 400 | code=INVALID_INPUT field=price_per_night | "Confira o campo Diária: valor faltando ou fora do formato."
CATEGORY_NOT_FOUND POST uuid inexistente | HTTP 404 | code=CATEGORY_NOT_FOUND | "A categoria escolhida não existe mais. Recarregue a página e escolha outra."
CATEGORY_NOT_FOUND PUT categoria do tenant B | HTTP 404 | code=CATEGORY_NOT_FOUND | (mesma mensagem)
  -> quarto 101 continua na categoria propria: true
CATEGORY_IN_USE | HTTP 409 | "Esta categoria ainda tem quartos. Mude a categoria desses quartos e tente excluir de novo."
CATEGORY_NAME_TAKEN create/update | HTTP 409 | "Já existe uma categoria com esse nome neste hotel. Use outro nome."
ROOM_NUMBER_TAKEN create/update | HTTP 409 | "Já existe um quarto 101 neste hotel. Use outro número."
ROOM_STATUS_TRANSITION AVAILABLE->OCCUPIED | HTTP 409 | "O status do quarto mudou enquanto você editava (check-in ou check-out na recepção). Recarregue a página para ver o status atual antes de alterar."
ROOM_IN_USE delete com reserva | HTTP 409 | "Este quarto está em uso (hóspede ou reserva) e não pode ser excluído agora."
404 sem code PUT quarto inexistente | HTTP 404 | "O sistema recusou salvar o quarto: Quarto não encontrado."
403 recepcao POST /rooms | HTTP 403 | "Só o administrador altera quartos e categorias."
setup: floor 0 gravado como 0
```
O R-1 (🔴 cross-tenant da 1ª rodada) está fechado no backend da branch: categoria de outro tenant dá 404 `CATEGORY_NOT_FOUND`, e o quarto não muda. Andar 0 agora é gravado como 0 (R-2).

### 1b. As mesmas mensagens pela tela (Playwright 1.48 + Chromium, login real, 1280×800 e 375×812)
```
[desktop|m375] ROOM_NUMBER_TAKEN -> "Já existe um quarto 101 neste hotel. Use outro número."
[desktop|m375] CATEGORY_NOT_FOUND (categoria excluída com o form aberto) -> "A categoria escolhida não existe mais. Recarregue a página e escolha outra."
[desktop|m375] CATEGORY_NAME_TAKEN -> "Já existe uma categoria com esse nome neste hotel. Use outro nome."
[desktop|m375] CATEGORY_IN_USE -> "Esta categoria ainda tem quartos. ..."
[desktop|m375]   requests na edicao da categoria: GET /api/room-categories/<id>, DELETE /api/room-categories/<id>   (sem GET /rooms)
[desktop|m375] ROOM_IN_USE -> "Este quarto está em uso (hóspede ou reserva) ..."
[desktop|m375] ROOM_STATUS_TRANSITION -> "O status do quarto mudou enquanto você editava ..."; status no banco depois: OCCUPIED
[desktop|m375]   PUT so do andar com check-in paralelo: corpo={"floor":2} / {"floor":3}; status no banco: OCCUPIED
[desktop|m375] 404 sem code (quarto excluido) -> "O sistema recusou salvar o quarto: Quarto não encontrado."
[desktop|m375]   alvos: Confirmar=187x48 Manter=88x48 Salvar=82x48 · cor do alerta rgb(220,38,38) sobre branco · scroll horizontal: false
```
O "check-in paralelo" foi simulado com `UPDATE rooms SET status='OCCUPIED'` no banco com o formulário aberto. A recusa veio do backend real. O 🟡-1 da 1ª rodada segue fechado: o PUT leva só o andar e não desfaz o `OCCUPIED`. `INVALID_INPUT` não é alcançável pela tela, porque a validação zod do formulário barra antes. Ficou coberto pela chamada direta acima.

### 2. Permissão (backend real e navegador)
```
papel RECEPTIONIST: {"getRooms":200,"getRoom":200,"getCats":200,"postRoom":403,"putRoom":403,"delRoom":403,"postCat":403,"putCat":403,"delCat":403}
papel WAITER:       {"getRooms":403,"getRoom":403,"getCats":403, ... todas as escritas 403}
[RECEPTIONIST] home=/; /quartos -> /quartos | /quartos/categorias -> /quartos/categorias | /quartos/novo -> / | /quartos/:id/editar -> / | /quartos/categorias/nova -> / | /quartos/categorias/:id/editar -> /
[RECEPTIONIST] /quartos: links de editar=0, Editar desabilitados=2, Novo quarto disabled=true describedby=rooms-read-only-reason
[WAITER] home=/comanda; as 6 rotas de quartos -> /comanda
```
O refactor para `routes/roomsRoutes.tsx` manteve os caminhos e os gates. `roomsReadRoutes` fica no grupo ADMIN+RECEPTIONIST e `roomsAdminRoutes` no grupo só ADMIN (`App.tsx:37` e `:54`). O teste `roomsRoutes.test.ts` trava a separação.

Capturas (todas no scratchpad da sessão, `C:\Users\gabri\AppData\Local\Temp\claude\--wsl-localhost-ubuntu-home-gabri-sistema-gestao-hotel\8465539f-e6b1-4d32-918b-ed02e5f06383\scratchpad\`):
- `qa051d_desktop_room_number_taken.png` e `qa051d_m375_room_number_taken.png`
- `qa051d_desktop_category_in_use.png` e `qa051d_m375_category_in_use.png`
- `qa051d_desktop_status_transition.png` e `qa051d_m375_status_transition.png`
- `qa051d_desktop_404_sem_code.png` e `qa051d_m375_404_sem_code.png`
- `qa051d_m375_recepcao.png`

---

## Achados no escopo (todos 🟢, pendência pós-merge)

### 🟢-1 [UI/UX] 404 sem `code` (registro excluído com o formulário aberto) diz o que houve, mas não o que fazer
**Onde:** `frontend/apps/pms/src/features/rooms/errorMessages.ts:146-148` (ramo 4xx sem code)
**Cenário (reproduzido nas duas larguras):** o ADMIN abre o quarto G1280, outra pessoa o exclui, e o ADMIN salva. A tela mostra "O sistema recusou salvar o quarto: Quarto não encontrado." O ramo que manda recarregar só roda quando o servidor não manda texto, e o backend sempre manda `error`. Na 1ª versão a mensagem dizia "pode ter sido excluído por outra pessoa". O mesmo vale para `PUT /room-categories/<inexistente>` e `DELETE /rooms/abc`.
**Regra violada:** DESIGN_PMS/CATALOGO, "erro diz o que fazer para recuperar".
**Correção sugerida:** no ramo `status === 404` sem code, usar "Este quarto/esta categoria não existe mais — pode ter sido excluído por outra pessoa. Volte à lista." Uma alternativa é anexar "Recarregue a página e confira os dados." também quando há `detail`.

### 🟢-2 [UI/UX] `ROOM_IN_USE` não diz o próximo passo
**Onde:** `errorMessages.ts:113-114`
**Cenário (reproduzido):** quarto livre com reserva PENDING → Excluir → "Este quarto está em uso (hóspede ou reserva) e não pode ser excluído agora." O backend distingue os dois casos ("faça o check-out antes" e "cancele ou mova a reserva antes"), mas a tela troca isso por "agora", e o admin não sabe o que fazer.
**Correção sugerida:** completar com "Faça o check-out ou cancele/mova a reserva e tente de novo."

### 🟢-3 [UI / layout] A aba "Quartos" leva a barra inferior do ADMIN a 7 itens, e "Usuários" sai da tela em 375 px
**Onde:** `frontend/apps/pms/src/routes/nav.ts` (item acrescentado por esta branch), lido pela barra em `components/AppShell.tsx:49-65` (`flex` sem `overflow-x`, itens `flex-1`)
**Cenário:** nas capturas `qa051d_m375_*.png`, a barra mostra "HojeReservasHóspedesQuartosComandaIndicadoresU". O último item fica cortado e fora do alcance do toque, porque a barra é `fixed` e não rola. O defeito é da casca (Gabriel) e já tinha repasse 🟢 de 31/10 com 6 abas. Esta branch o agrava.
**Correção sugerida:** é da casca: "Mais" com os itens excedentes, ou só ícones com rótulo curto. O repasse existente foi atualizado (abaixo).

---

## Repassados a outro dev

| Sev. | Achado | Onde | Dono | Repasse |
|------|--------|------|------|---------|
| 🟢 | Atualização: com Quartos (T-05.1) são 7 abas, e "Usuários" fica inalcançável em 375 px, não só espremido | `components/AppShell.tsx:49-65` | Gabriel (layout, §4.4) | `docs/qa/repasses/para_gabriel_31102026.md` (acrescentado) |

## O que foi verificado e está correto
- **Exaustividade dos codes:** `ROOM_ERROR_CODES` usa `satisfies readonly RoomErrorCode[]` e a checagem `MissingCode`, e o `switch` fecha em `never`. Um code novo ou renomeado no `swagger.js` quebra o typecheck. Os 7 do enum gerado batem com os 7 de `utils/roomErrors.js`.
- **`readErrorBody`:** lê o corpo como `unknown`, sem cast, e descarta code desconhecido. Code fora do contrato cai na mensagem genérica, não numa mensagem errada.
- **5xx:** separado de falha de rede ("tente de novo; se continuar, avise o suporte"). O 🟢-1 da 1ª rodada foi corrigido.
- **Trava de "em uso":** existe só no servidor. A edição de categoria faz só GET da categoria e DELETE (requisições capturadas), sem baixar `/rooms`. O 🟡-3 da 1ª rodada foi fechado, e a garantia está no backend (409 reproduzido).
- **`toRoomCreateBody`:** estreita o POST a AVAILABLE/MAINTENANCE, como o contrato, e recusa outro status antes da chamada. O backend devolve 400 `INVALID_INPUT field=status` para `OCCUPIED` (reproduzido).
- **Allowlist de status da tela** (`roomStatusOptions`) igual à `MANUAL_ROOM_TRANSITIONS` do backend: AVAILABLE↔MAINTENANCE e CLEANING→AVAILABLE; OCCUPIED não sai pela edição.
- **`ErrorState` do `@hotel/ui`:** substituiu a versão local, e as telas passam a mensagem completa.
- **Merge do `swagger.js`** (conflito em PUT /rooms): ficou o texto da develop mais uma frase. O `requestBody` de categoria e hóspede é aditivo. As respostas `RoomError` de POST/PUT/DELETE de quartos e categorias estão iguais às da develop.

## Não foi possível verificar
- **Check-in pelo fluxo real com o formulário aberto:** simulei o check-in mudando o status direto no banco. A recusa e a mensagem são do backend e da tela reais, mas o caminho `POST /reservations/:id/check-in` não foi exercitado.
- **Leitor de tela real:** não usei. A verificação de ARIA ficou na leitura do código e nos atributos (`role="alert"`, `aria-describedby`).
