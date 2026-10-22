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
- **Categoria em uso não se exclui.** O backend faz *soft delete* e deixa os quartos sem categoria, ou seja, sem tarifa. Até o backend recusar com 409, a tela recusa antes, com "N quartos usam esta categoria…". Se a lista de quartos não carregar, o botão fica bloqueado (fail-safe).
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

## Lições

- O processo iniciado por `wsl bash` morre quando o comando volta. Backend e Vite só ficaram de pé num script em background com `wait`.
- Invalidar uma query *inativa* no TanStack só a marca como velha, e a lista reaparece com dado antigo. O QA no navegador pegou isso: o banco tinha `MAINTENANCE` e a tela mostrava "Livre".
- O proxy do `vite.config.ts` está fixo em `:3000`. Para testar em outra porta, usei um config temporário fora do versionamento (`vite.t051.config.ts`, já apagado).

## Pendências (com contexto para o próximo)

1. **Swagger (backend, fora do escopo):** `PUT /rooms/{id}` e `PUT /room-categories/{id}` não declaram `requestBody`, então o cliente tipa o corpo como `never`, e `roomsApi.ts` usa `body: input as never`, o mesmo caso do `PUT /guests/{id}`. Conserto em `services/core-service/config/swagger.js`.
2. **Backend, `CreateRoomController`:** `floor: floor || null` transforma o andar **0 (térreo) em null** no cadastro. A edição preserva o 0. A tela mostra "Térreo" quando o valor é 0.
3. **Backend, `DeleteRoomCategoryController`:** aceita excluir categoria em uso, e os quartos ficam sem categoria. O ideal é um 409. Hoje só a tela impede.
4. **Backend, `CreateRoomController`:** `status` sem allowlist no cadastro (o `Update` tem). A tela só envia Livre ou Manutenção.
5. **Barra inferior do celular com 6 itens para o ADMIN** (agora inclui Quartos): cabe a 375 px, mas sem folga. A forma do AppShell é do Gabriel.
6. **Hóspedes adotar `Table`/`ErrorState`** desta feature: elimina a string de cabeçalho repetida 3x e o `<button>` cru do `qa_checks`. Pela regra de promoção, esse movimento sobe os dois para `@hotel/ui`.
7. **Ordenação no servidor** (T-05.12). Hoje a ordenação é no cliente, sobre a coleção que a API devolve.
8. **Favicon** ausente no `index.html` do `apps/pms` (404 inofensivo do navegador).
