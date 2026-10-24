# 21/10 — T-05.1: telas de quartos e categorias no `apps/pms` (agente executor, trilha do Gabriel)

**Branch:** `feature/t051-quartos-categorias` (a partir de `origin/develop` em `c6742b2`), publicada no remoto.
**Sem PR e sem merge.** O Gabriel roda o qa-redteam antes.

---

## O que foi feito

### 1. Cliente regenerado (primeiro commit, isolado e publicado)

`pnpm gen:api` → `openapi.json` passa de **40 para 46 paths**, incluindo `/products` e `/accounts`.
Nenhuma tela de hóspedes precisou mudar: o typecheck do `apps/pms` passou sem tocar em `features/guests`.
Os schemas `Room` e `RoomCategory` têm resposta tipada no Swagger. Por isso não houve motivo para parar.

### 2. Domínio e design system

- `@hotel/domain`: `parseBRLInput("1.234,56")` → centavos, sem float. Aceita o jeito brasileiro e o formato do backend; ponto seguido de três dígitos conta como milhar. `centsToBRLInput` faz o caminho de volta. `STATUS_TONES`/`StatusTone` tipam as chaves de cor do preset.
- `@hotel/ui`: o `StatusBadge` aceita `status` de quarto (uso atual, intacto) **ou** `tone` + `label` para qualquer outro status. A ressalva da SPEC-05 §5 fica encerrada. A cor de cada status de reserva continua a cargo da T-05.2.

### 3. Módulo `features/rooms`

| Arquivo | Papel |
|---|---|
| `roomsApi.ts`, `queries.ts` | CRUD de `/rooms` e `/room-categories` pelo `api-client`; TanStack Query |
| `roomRules.ts` (+ teste) | `canWriteRooms`, `roomStatusOptions` (máquina de estados), bloqueios de exclusão, `sortRooms`, `formatFloor` |
| `errorMessages.ts` (+ teste) | 409/400/422/403/404/5xx e erro de rede viram instrução de balcão |
| `RoomsListPage`, `RoomFormPages`, `RoomForm` | Lista, cadastro, edição e exclusão de quarto |
| `CategoriesListPage`, `CategoryFormPages`, `CategoryForm` | Idem para categoria |
| `components/` | `Table`, `ErrorState`, `Money`, `Select`, `Actions`, `RoomsHeader`, `StatusPicker`, `DeleteControl`, `FormShell`, `ReadOnlyNotice`, `touch` — todos locais, pela regra de promoção |

**Rotas (aditivas em `App.tsx` e `nav.ts`; AppShell, ProtectedRoute, RequireRole e sessão intactos):**
`/quartos` e `/quartos/categorias` ficam sob o gate ADMIN+RECEPTIONIST. O novo/editar fica sob o gate ADMIN.
Escolhi **`/quartos/categorias`** em vez de `/config/...` por dois motivos. Primeiro, a recepção consulta tarifa e capacidade no balcão, e o grupo `/config` é só do admin. Segundo, categorias ficarem como aba dentro de Quartos evita uma 6ª aba na barra inferior do celular para a recepção.

### Decisões de regra (todas com o motivo na tela)

- **Status no formulário segue a máquina de estados.** Ocupado e Limpeza aparecem **desabilitados com motivo**, porque são efeito do check-in e do check-out. Sobra para a mão: Livre ↔ Manutenção e Limpeza → Livre. O backend aceita qualquer valor da allowlist; quem restringe é a tela.
- ~~**Categoria em uso não se exclui na tela.**~~ *Revisto em 24/10 (🟡-3 do qa-redteam): a trava era check-then-act no cliente e baixava todos os quartos. Agora quem recusa é o backend com 409, e a tela traduz a resposta. O comentário "sem tarifa" estava errado: a reserva usa a diária congelada da categoria excluída.*
- **Quarto ocupado não se exclui** ("Faça o check-out antes").
- **Ordenação** por andar e número natural na lista. A tela mostra exatamente o que a API devolveu, sem filtro no cliente. Ordenar no servidor fica para a T-05.12.

---

## Critérios de aceite → evidência

| CA | Evidência (navegador, backend real em :3051, banco próprio em :5444) |
|---|---|
| **a** CRUD de categorias | Diária digitada `1.234,56` aparece na lista como `R$ 1.234,56`, e na edição o campo traz `1234,56`. O 409 mostra "Já existe uma categoria com esse nome neste hotel. Use outro nome." Diária `abc` mostra "Informe a diária em reais, por exemplo 150,00". A exclusão em dois passos funcionou (`categoria_excluida: true`) |
| **b** CRUD de quartos | O 409 mostra "Já existe um quarto 101 neste hotel. Use outro número." O T51 foi criado, editado para Manutenção e excluído. O banco confirmou `T51 | MAINTENANCE`, e a lista na volta mostrou `T51 3º … Manutenção` |
| **c** Cor + rótulo | `StatusBadge` (ponto + texto) em todas as linhas e no seletor. Os status desabilitados também levam rótulo e motivo |
| **d** Escrita só ADMIN | Com `recep1`: aparece a faixa "Modo consulta. Só o administrador cadastra e altera quartos e categorias."; `Novo quarto` vem com `disabled` e `aria-describedby="rooms-read-only-reason"`; os 15 "Editar" estão desabilitados e não há nenhum link de edição. `/quartos/novo` redireciona para `/`. Menu da recepção: Hoje, Reservas, Hóspedes, Quartos, Comanda |
| **e** Carregando, vazio e erro | Forçados por interceptação: "Carregando quartos…"; "Nenhum quarto cadastrado" com o próximo passo; "Não foi possível carregar as categorias. Verifique a conexão e tente de novo." com "Tentar de novo". Sem categorias, o cadastro de quarto mostra "Cadastre uma categoria antes". Registro apagado mostra "não encontrado" |
| **f** Alvo ≥ 48 px | Em 375×812, todos os links, botões, inputs e selects visíveis das listas e do formulário foram medidos: `mobile_alvos_menores_que_48: []`, `mobile_form_alvos_menores_que_48: []`, `mobile_scroll_horizontal: false` |

**Console:** num passeio limpo pelas telas (admin e recepção, desktop e 375×812), houve **0 erros de console e 0 respostas ≥ 400**.
No roteiro com falhas provocadas, só aparecem os 409 e 500 que o próprio roteiro forçou, mais um 404. Esse 404 vem do favicon: `index.html` não declara um, e isso já existia antes desta tarefa.

### Capturas (pasta scratchpad da sessão)

Desktop:
- `t051_desktop_quartos_admin.png`
- `t051_desktop_categorias_admin.png`
- `t051_desktop_quarto_409.png`
- `t051_desktop_quarto_edicao.png`
- `t051_desktop_quartos_carregando.png`
- `t051_desktop_quartos_vazio.png`
- `t051_desktop_categorias_erro.png`
- `t051_desktop_quartos_recepcao.png`

Celular (375×812):
- `t051_mobile_quartos_admin.png`
- `t051_mobile_categorias_admin.png`
- `t051_mobile_quarto_edicao.png`
- `t051_mobile_quartos_recepcao.png`

---

## Saídas reais

```
$ pnpm typecheck --force          (frontend/)
 Tasks:    4 successful, 4 total
Cached:    0 cached, 4 total        exit=0

$ pnpm build --force
app-pms:build: dist/assets/index-BeCXky8n.js   400.30 kB │ gzip: 121.41 kB
app-pms:build: ✓ built in 3.67s
 Tasks:    1 successful, 1 total
Cached:    0 cached, 1 total        exit=0

$ pnpm turbo run test --force
@hotel/domain:test:  ✓ src/state-machines.test.ts (7 tests)
@hotel/domain:test:  ✓ src/money.test.ts (21 tests)
@hotel/domain:test:  ✓ src/dates.test.ts (9 tests)
@hotel/domain:test:       Tests  37 passed (37)
app-pms:test:  ✓ src/features/rooms/errorMessages.test.ts (7 tests)
app-pms:test:  ✓ src/features/guests/guestFilter.test.ts (5 tests)
app-pms:test:  ✓ src/features/rooms/roomRules.test.ts (14 tests)
app-pms:test:       Tests  26 passed (26)
 Tasks:    2 successful, 2 total     exit=0

$ bash scripts/qa_checks.sh        exit=0
⚠ 3 aviso(s). Nenhum erro bloqueante.
(diff contra develop c6742b2: idêntico — os 3 avisos já existiam: Swagger sem
 corporate-client/event-quote/room-category*, <button> cru em GuestsListPage, e
 2 strings de classes repetidas 3x)
```

\* O aviso "room-category não aparece no Swagger" é falso positivo da regra: o recurso está documentado como `/room-categories`.

---

## Revisão Impeccable (`audit` + `critique`) — aceito e recusado

O Impeccable está no marketplace, mas **não está instalado** nesta sessão, e o detector precisaria baixar um binário. Não baixei nada sem autorização. Por isso a varredura determinística ficou indisponível, e apliquei à mão o checklist de `reference/audit.md` e `reference/critique.md`, tendo o `DESIGN_PMS.md` como árbitro.

| Achado | Decisão | Por quê |
|---|---|---|
| `radiogroup` sem navegação por setas (a11y, P2) | **Aceito** — virou grupo de botões com `aria-pressed` | Promessa de ARIA não cumprida é pior que nenhuma |
| Linhas de 53 px no desktop (densidade) | **Aceito** — ação `h-8`, célula `py-1.5` (~44 px) | DESIGN_PMS §2: densidade não é sujeira |
| Campos com 42 px no celular (responsivo) | **Aceito** — `min-h-touch` local | CA-05.1.f; o `Input` do `@hotel/ui` não foi alterado para não mexer em hóspedes |
| Lista volta com status velho depois de salvar (integridade) | **Aceito** — `refetchType: 'all'`; exclusão via `setQueryData` | Informação errada no balcão |
| 15 "Editar" desabilitados na visão da recepção são ruído visual | **Recusado** | Princípio 11 / RNF-026: ação indisponível fica desabilitada com motivo, não some |
| Ampliar a tabela/usar mais espaço em branco, hierarquia "de produto" | **Recusado** | `design-taste` não manda no `apps/pms`; PMS vive de tabela densa |
| Ocultar Ocupado/Limpeza no seletor em vez de desabilitar | **Recusado** | Mesmo princípio 11, e o admin aprende por que não pode |
| Mensagem de 409 continua visível quando surge um erro de validação novo | **Registrado (P3)** | O erro do servidor só some no próximo envio válido; baixo impacto |

---

## 24/10 — Correções do qa-redteam (`docs/qa/redteam_t051-quartos-categorias_21out2026.md`)

O veredito foi **aprovado com ressalvas**: 0 🔴, 3 🟡 e 4 🟢 no escopo. Corrigi os 3 🟡 e os 🟢 baratos.

| Achado | O que mudou | Evidência |
|---|---|---|
| 🟡-1 A edição reenviava `status` sempre e desfazia check-in/out paralelo | `changedRoomFields` em `roomRules.ts` (+4 testes): o PUT leva só o que mudou, e `status` só quando o admin o alterou. Se nada mudou, a tela volta sem fazer request | Corpos de PUT capturados no navegador: andar → `{"floor":7}`; status → `{"status":"MAINTENANCE"}`; quarto 102 salvo sem mudança → nenhum PUT |
| 🟡-2 `body: input as never` | `requestBody` declarado em `PUT /rooms/{id}`, `PUT /room-categories/{id}` e `PUT /guests/{id}` em `config/swagger.js` (só esses três trechos, autorizado pelo coordenador). `api-client` regenerado e os três `as never` removidos, inclusive o de hóspedes | `grep "as never\|as unknown as" apps/pms/src` → nada; o PUT de hóspede continua gravando (corpo capturado) |
| 🟡-3 Trava "em uso" só no cliente, com `GET /rooms` inteiro | A edição de categoria não busca mais quartos. "Excluir" fica habilitado para o ADMIN, e o 409 de exclusão vira "Esta categoria ainda tem quartos. Mude a categoria desses quartos e tente excluir de novo." (antes caía na mensagem de nome duplicado). Sobra uma dica não bloqueante, lida do cache **sem** disparar busca | Edição aberta a frio: `GET /rooms` = 0 requisições; Excluir habilitado; 409 simulado por interceptação → mensagem acima. O 409 real chega com `fix/tenant-fk-validation` |
| 🟢-1 5xx dizia "verifique a conexão"; diária sem teto; comentário falso | 5xx → "O sistema não conseguiu … Tente de novo; se continuar, avise o suporte." Falha de rede continua falando de conexão. A diária tem teto de R$ 999.999,99. O comentário "sem tarifa" foi removido | `100000000` → "Diária acima do limite (R$ 999.999,99). Confira os dígitos."; testes de mensagem |
| 🟢-3 Motivo só em `title`; Cancelar como Button | Opção desabilitada aponta `aria-describedby` para o item da lista de motivos. "Cancelar" virou `Link` | `aria-describedby` → "Ocupado — Só o check-in ocupa o quarto."; Cancelar → `href="/quartos"` |
| Suspeita: select com categoria excluída | O campo abre vazio, com o aviso "A categoria deste quarto foi excluída. Escolha outra para salvar.", em vez de gravar a primeira opção sem o admin ver | Por código. Reproduzir exigiria um quarto com categoria soft-deleted |
| 🟢-2 `tone`+`label` sem consumidor | Sem mudança | Validar com a T-05.2, o primeiro consumidor |
| 🟢-4 `TOUCH` local em vez de no `Input` do `@hotel/ui` | Sem mudança | Levar à faxina semanal: `min-h-touch md:min-h-0` no `Input` compartilhado também conserta hóspedes |

**Saídas reais (24/10, `--force`, sem cache):**

```
typecheck exit=0   Tasks: 4 successful, 4 total   Cached: 0 cached, 4 total
build     exit=0   app-pms: dist/assets/index-BphNs2gd.js 401.16 kB │ gzip: 121.87 kB  ✓ built in 4.46s
test      exit=0   @hotel/domain 37/37 · app-pms 31/31 (roomRules 17, errorMessages 9, guestFilter 5)
qa_checks exit=0   ⚠ 3 aviso(s). Nenhum erro bloqueante. — idêntico a develop c6742b2
```

No console do roteiro só aparece o 409 que eu mesmo provoquei, mais o 404 do favicon na carga inicial, que já existia antes.

## 24/10 — Correções da reauditoria delta (`docs/qa/redteam_t051-quartos-categorias_delta_24out2026.md`)

O veredito foi aprovado com ressalvas: 0 🔴, 2 🟡 e 1 🟢. Os três estão corrigidos.

| Achado | O que mudou | Evidência |
|---|---|---|
| 🟡-1 O "original" do diff seguia a query viva: com o formulário aberto, um refetch com o quarto já OCCUPIED reenviaria `status: "AVAILABLE"` | `toRoomInput` + `keepFirstSnapshot` (puros): a base do diff é congelada na primeira carga do formulário. O bloqueio de exclusão continua olhando o status **vivo** | Teste "check-in no meio da edição não volta o status: só o andar vai no PUT" (abre AVAILABLE → refetch OCCUPIED → salva só o andar → `{ floor: 2 }`) |
| 🟡-2 Os 409 novos do backend caíam em "número duplicado"/"check-out" | `writeErrorMessage` escolhe o motivo pelo **`code`** do corpo de erro (contrato com `fix/tenant-fk-validation`): `ROOM_NUMBER_TAKEN`, `ROOM_STATUS_TRANSITION_NOT_ALLOWED`, `ROOM_IN_USE`, `CATEGORY_IN_USE`, `CATEGORY_NAME_TAKEN`, `CATEGORY_NOT_FOUND`, `INVALID_INPUT` (+`field` → nome do campo na tela). Sem `code` conhecido, a mensagem é genérica e honesta, com o texto do servidor, **sem adivinhar pelo status**; 403 e 5xx continuam pelo status porque não são ambíguos. O `code` é lido de `unknown` com `readErrorBody`, sem cast. O api-client tipa só `{ error? }` até ser regenerado depois do merge da fk | `errorMessages.test.ts`: 14 testes, um por `code`, mais "409 sem code não vira número duplicado", "404 sem code não afirma o que sumiu", código desconhecido, 403, 5xx e `readErrorBody` com lixo |
| 🟢-1 404 no PUT de quarto por categoria excluída dizia "quarto excluído" | `CATEGORY_NOT_FOUND` no contexto de quarto → "A categoria escolhida não existe mais…" | Teste dedicado |

**Consequência até o merge da fk:** o backend da `develop` ainda não manda `code`. Por exemplo, o número repetido aparece como "O sistema recusou salvar o quarto: Já existe um quarto com esse número.", que é honesto, mas não é a mensagem de balcão final. A T-05.1 só entra depois da `fix/tenant-fk-validation`, como combinado.

**Saídas reais (`--force`):**

```
typecheck exit=0   Tasks: 4 successful, 4 total   Cached: 0 cached, 4 total
build     exit=0   app-pms: dist/assets/index-CHBwCi0m.js 402.16 kB │ gzip: 122.29 kB  ✓ built in 3.49s
test      exit=0   @hotel/domain 37/37 · app-pms 39/39 (roomRules 20, errorMessages 14, guestFilter 5)
qa_checks exit=0   ⚠ 3 aviso(s). Nenhum erro bloqueante. — idêntico a develop c6742b2
grep "as never|as unknown as|as any|@ts-ignore" apps/pms/src → nenhum
```

Nesta rodada não reabri o navegador: as mudanças são lógica pura e coberta por teste. A passagem do corpo de erro até a mensagem já tinha sido verificada no navegador na rodada anterior, com o 409 simulado. A conferência ponta a ponta com os `code` reais fica para depois do merge da fk.

## Lições

- O processo iniciado por `wsl bash` morre quando o comando volta. Backend e Vite só ficaram de pé num script em background com `wait`.
- Invalidar uma query *inativa* no TanStack só a marca como velha, e a lista reaparece com dado antigo. O QA no navegador pegou isso: o banco tinha `MAINTENANCE` e a tela mostrava "Livre".
- O proxy do `vite.config.ts` está fixo em `:3000`. Para testar em outra porta, usei um config temporário fora do versionamento (`vite.t051.config.ts`, já apagado).

## Pendências (com contexto para o próximo)

1. ~~**Swagger:** PUT sem `requestBody`.~~ **Resolvido em 24/10** (`75395a0`).
2. **Backend, `CreateRoomController`:** `floor: floor || null` transforma o andar **0 (térreo) em null** no cadastro. A edição preserva o 0. A tela mostra "Térreo" quando o valor é 0.
3. **Backend, `DeleteRoomCategoryController`:** aceita excluir categoria em uso (204). O 409 está sendo feito em `fix/tenant-fk-validation`, e a tela já trata. **Até esse merge, nada impede a exclusão**: a trava do cliente saiu de propósito (🟡-3).
9. **Coluna "Quartos" na lista de categorias** conta sobre `GET /rooms` inteiro. Com a paginação da T-06.10 ela fica incompleta e precisa de contagem no backend.
10. **Teste de componente** para `RoomForm`/`CategoryForm`: o CI não roda nada do frontend (achado do redteam). O 🟡-1 passou por falta disso. Hoje a regra está coberta em `changedRoomFields`.
4. **Backend, `CreateRoomController`:** `status` sem allowlist no cadastro (o `Update` tem). A tela só envia Livre ou Manutenção.
5. **Barra inferior do celular com 6 itens para o ADMIN** (agora inclui Quartos): cabe a 375 px, mas sem folga. A forma do AppShell é do Gabriel.
6. **Hóspedes adotar `Table`/`ErrorState`** desta feature: elimina a string de cabeçalho repetida 3x e o `<button>` cru do `qa_checks`. Pela regra de promoção, esse movimento sobe os dois para `@hotel/ui`.
7. **Ordenação no servidor** (T-05.12). Hoje a ordenação é no cliente, sobre a coleção que a API devolve.
8. **Favicon** ausente no `index.html` do `apps/pms` (404 inofensivo do navegador).
