# QA Red Team — T-05.1 quartos e categorias (frontend `apps/pms`)
**Branch:** feature/t051-quartos-categorias · **Dev:** agente executor (trilha do Gabriel) · **Base:** develop@c6742b2 · **Commits:** 0a0b9b4..9d699ce (9) · **Data:** 21/10/2026
**Arquivos auditados:** 35 no diff: `features/rooms/` inteiro, `App.tsx`, `nav.ts`, `packages/domain` (`money.ts`, `state-machines.ts`), `packages/ui` (`StatusBadge.tsx`, `CATALOGO.md`), `api-client` (`openapi.json`, `schema.d.ts`) e a SPEC-05. Para conferir o que a tela promete, li também os controllers de `RoomApi/` e `RoomCategoryApi/`, os dois routers, `RoomModel`, `RoomCategoryModel`, `calculateStayTotal.js` e `accountCharges.js`.
**Achados no escopo:** 7 (🔴 0 · 🟡 3 · 🟢 4) · **Repassados:** 8 (🔴 1 · 🟡 6 · 🟢 1)

> ⚠️ **ALERTA FORA DO ESCOPO:** `PUT /rooms/:id` aceita `category_id` de **outro tenant**. Reproduzi em backend próprio: o ADMIN do hotel A pôs no quarto dele a categoria do hotel B. A partir daí, `GET /rooms` e `GET /rooms/:id` do hotel A devolvem o nome, a diária e o `tenant_id` do hotel B, e a reserva criada no hotel A foi cobrada pela diária do hotel B (`total_amount = 2.00`). Fica em `services/core-service/app/Controllers/RoomApi/UpdateRoomController.js:21`. **Área da Sirlande**, repasse em `docs/qa/repasses/para_sirlande_21102026.md`. Não reprova esta branch.

## Veredito
**APROVADO COM RESSALVAS**

Não achei 🔴 dentro do escopo:
- Dinheiro não passa por `Number()` em nenhum ponto novo.
- O backend barra de fato toda escrita de quem não é ADMIN (reproduzido).
- O `api-client` sai idêntico quando é regenerado.
- Typecheck, build, testes e `qa_checks.sh` passam.

Ficam três ressalvas 🟡 que valem resolver antes da T-05.2 copiar o padrão:
1. A edição de quarto **sempre** reenvia o `status`, e com isso pode desfazer um check-in ou um check-out feito em paralelo.
2. O `as never` no corpo do PUT anula a checagem de tipo tanto quanto um `as unknown as`.
3. A trava "categoria em uso" existe só no cliente e depende de baixar todos os quartos.

### Execução (saída real, worktree `/home/gabri/wt-t051`, Node 24.14)
| Verificação | Resultado |
|---|---|
| `pnpm -r typecheck` | api-client, domain, ui e pms: Done |
| `pnpm -r test` | domain 37/37, pms 26/26 (`roomRules` 14, `errorMessages` 7) |
| `pnpm --filter ./apps/pms build` | ✓ 473 módulos, `index-BeCXky8n.js` 400,30 kB, o mesmo hash do relatório do executor |
| `bash scripts/qa_checks.sh` | 0 erros e 3 avisos, todos de fora de `features/rooms`: Swagger de corporate-client/event-quote/room-category, `<button>` cru em `GuestsListPage`, classes repetidas 3x em `LoginPage` |
| `pnpm run generate` no api-client (regenerar e comparar) | `git status` limpo depois de regenerar: o cliente é **gerado e não foi editado à mão**. O spec tem 46 paths |
| Backend próprio (pg-qa051:5448, core-service:3058) | Dois tenants, ADMIN, RECEPTIONIST e WAITER. Sondas descritas abaixo. Container e processo encerrados ao final |
| `parseBRLInput` com 29 entradas-limite | Tabela no 🟢-1 |

---

## Achados no escopo

### 🟡-1 [Integridade / máquina de estados] A edição de quarto reenvia o `status` sempre e desfaz check-in ou check-out feito em paralelo
**Onde:** `frontend/apps/pms/src/features/rooms/RoomForm.tsx:24-31` (`toInput` inclui `status: v.status` incondicionalmente) · `RoomFormPages.tsx:114-120` · `roomsApi.ts:51-59`
**Cenário:**
1. Às 14h00 o ADMIN abre `/quartos/<id>/editar` do quarto 101, que está `AVAILABLE`, para corrigir o andar.
2. Às 14h01 a recepção faz o check-in, e o quarto 101 passa a `OCCUPIED`.
3. Às 14h02 o ADMIN salva. O PUT leva `status: "AVAILABLE"`, o valor carregado às 14h00.

O backend aceita qualquer valor da lista, sem validar a transição. Reproduzi `PUT {status:"AVAILABLE"}` sobre um quarto `OCCUPIED` e recebi **200**. O quarto volta a "Livre" com hóspede dentro e reaparece em `GET /rooms/available`. O caso simétrico também acontece: com o formulário aberto num quarto `OCCUPIED`, um check-out feito no meio do caminho é revertido de `CLEANING` para `OCCUPIED`.

A allowlist do `StatusPicker` (`roomRules.ts:35`) só vale para o status **de quando a tela carregou**. O que de fato se grava é o valor velho.

**Regra violada:** CLAUDE.md §3, máquina de estados de quartos. O check-in e o check-out são donos de `OCCUPIED` e `CLEANING`.
**Correção sugerida:** o menor ajuste é mandar `status` só quando o usuário o mudou (`formState.dirtyFields.status`). Sem mudança de status, o PUT não deve levar o campo. A defesa real é o backend validar a transição, e isso está no repasse R-3.

### 🟡-2 [Contrato de API / princípio 5] `body: input as never` desliga a checagem de tipo do corpo do PUT
**Onde:** `frontend/apps/pms/src/features/rooms/roomsApi.ts:56` e `:91`
**Cenário:** o Swagger de `PUT /rooms/{id}` e de `PUT /room-categories/{id}` não declara `requestBody`. Conferi no `openapi.json` regenerado: o POST tem corpo, o PUT tem `NO-BODY`. Por isso o `openapi-fetch` tipa o corpo como `never`. O cast `as never` aceita **qualquer** valor. Se amanhã o backend renomear `floor` ou exigir um campo novo, o PUT compila e falha só em produção, que é exatamente o que o princípio 5 existe para impedir.

O efeito do `as never` é o mesmo do `as unknown as`, com outro nome. Há um atenuante: o parâmetro da função é tipado (`RoomInput`/`CategoryInput`), então quem chama ainda é checado. O que fica sem checagem é a ligação com o contrato do backend. O precedente (`guestsApi.ts:44`) não torna o caso aceitável. Ele mostra que o desvio está se espalhando: já são três ocorrências.

**Regra violada:** `DIVISAO_TRABALHO` §4.2, princípio 5 ("se o tipo não existe, o problema está no Swagger, não se resolve com cast"), e §4.4 ("tipo que falta se conserta no Swagger").
**Correção sugerida:**
- O conserto de verdade é declarar o `requestBody` dos três PUTs no `swagger.js` e regenerar. Está no repasse para o Gabriel.
- Até lá, ancore o cast num tipo do schema, como o `createRoom` já faz na linha 44: `const body: RoomCreateBody = input; ... body: body as never`. Assim, uma divergência com o POST pelo menos quebra a compilação.
- Registre a pendência com prazo na SPEC-05. Hoje ela aparece só como "Resta:".

### 🟡-3 [Regra de negócio só na UI / princípio 7] A trava "categoria em uso" baixa todos os quartos do tenant e conta no cliente
**Onde:** `frontend/apps/pms/src/features/rooms/CategoryFormPages.tsx:53-63` · `CategoriesListPage.tsx:18-19` · `roomRules.ts:54-60` (`countRoomsByCategory`)
**Cenário:**
1. Para decidir se "Excluir" fica habilitado, a tela de edição de categoria faz `GET /rooms`, que devolve a coleção inteira do tenant, e filtra por `category_id` na memória.
2. O ADMIN 1 abre a categoria "Luxo", que tem 0 quartos, e o botão Excluir fica habilitado.
3. O ADMIN 2 cadastra o quarto 305 em "Luxo".
4. O ADMIN 1 confirma a exclusão. O backend devolve **204** (reproduzido) e o quarto 305 fica com `category: null` na listagem, mas continua aparecendo em `/rooms/available`.

A regra existe só no navegador e é *check-then-act* sem nenhuma trava. A coluna "Quartos" da lista usa o mesmo download completo. Com a paginação da T-06.10, o `useRooms()` passa a trazer uma página só, e a contagem vai mostrar "0" para categorias em uso. A trava abre em silêncio.

**Regra violada:** princípio 7 ("nenhuma tela baixa coleção inteira do tenant para filtrar na memória"). Também CLAUDE.md: "o backend continua sendo a autoridade" (o próprio `roomRules.ts:8` diz isso).
**Correção sugerida:**
- Manter a trava de UI como conveniência, mas registrar na SPEC-05 que ela **não é** a garantia e vai quebrar com a paginação.
- A garantia é o 409 no `DeleteRoomCategoryController` (repasse R-4).
- Quando o backend devolver 409, `writeErrorMessage` já precisa de uma mensagem para `category`/`delete`. Hoje o 409 cai no texto de "nome duplicado" (`errorMessages.ts:42`), errado para exclusão. Ajustar junto.

### 🟢-1 [Dinheiro] `parseBRLInput` sem teto: diária absurda vira 500 com instrução errada; o comentário sobre o impacto da exclusão está factualmente errado
**Onde:** `frontend/packages/domain/src/money.ts:90-100` · `CategoryForm.tsx:16-19` · `errorMessages.ts:60` · `roomRules.ts:62-66`

Rodei o `money.ts` real com 29 entradas:

| Entrada | Centavos | Leitura |
|---|---|---|
| `1.234.567,89` | 123456789 | ok |
| `1.5` / `1.50` / `1.500` | 150 / 150 / 150000 | ponto com 3 dígitos é milhar, como documentado |
| `150.123` | 15012300 | lido como **R$ 150.123,00**. Já `150,123` é recusado. Assimetria aceitável, mas sem teste |
| `150,` / `150.` | 15000 / **null** | vírgula solta aceita, ponto solto recusado (inconsistente, inofensivo) |
| `,50` / `.50` | null / null | recusa o que o balcão às vezes digita |
| `-10`, `R$ -10`, `+150`, `1,234.56`, `1e3`, `0x10`, `abc`, `１５０` | null | ok |
| `0` / `0,00` | 0 | o formulário recusa com `cents > 0` ✓ |
| `100000000` | 10000000000 | aceito pelo formulário; o backend estoura `DECIMAL(10,2)` |
| `999999999999999999` | 1e20 | acima de 2^53: `decimalToCents` perde precisão (`Number(intPart)*100`, `money.ts:41`) |

**Cenário:** o ADMIN digita "100000000" por engano numa diária. O formulário aceita. O backend responde **500**, reproduzido em `POST /room-categories {price_per_night:"100000000.00"}`. A tela mostra "Não foi possível salvar a categoria. **Verifique a conexão** e tente de novo.", e a conexão está boa. O operador tenta de novo sem fim.

Ao lado disso, o comentário em `roomRules.ts:62-66` e a pendência 3 do relatório do executor dizem que excluir categoria em uso deixa o quarto "sem tarifa para a reserva calcular". **É falso.** `calculateStayTotal.js:28` usa `paranoid: false`, e a reserva criada depois da exclusão foi cobrada pela diária da categoria excluída (`total_amount = 300.00`, reproduzido). O defeito real é outro: a tarifa fica **congelada e invisível**, e ninguém consegue mais editá-la pela tela.

**Regra violada:** "erro diz o que fazer" (CATALOGO/DESIGN_PMS). O comentário de regra descreve um comportamento que o sistema não tem.
**Correção sugerida:**
- Limitar a diária no `refine`, por exemplo a 999.999,99 ("Diária acima do limite").
- Separar 5xx de falha de rede em `writeErrorMessage`: com 5xx o servidor respondeu, então a instrução certa é "tente de novo; se persistir, avise o suporte".
- Corrigir o comentário.

### 🟢-2 [YAGNI / §4.3] `StatusBadge` ganhou a forma `tone` + `label` sem nenhum consumidor
**Onde:** `frontend/packages/ui/src/StatusBadge.tsx:20-23`
**Cenário:** a variante discriminada está correta. O typecheck prova que o uso `status={...}` continua igual (os 3 usos são todos de quarto) e que `tone` só aceita `StatusTone`. Mas a forma nova não tem consumidor. O primeiro será a T-05.2, e até lá a API é palpite. A ressalva da SPEC-05 pedia a generalização, então não é desvio. Fica só a observação de que o desenho pode mudar quando o status de reserva chegar.

O `CATALOGO.md` foi atualizado corretamente: a coluna "quando não usar" proíbe o uso como controle e cor fora de `STATUS_TONES`. `ErrorState`, `Table`, `Money` e `Select` nasceram locais, como manda a regra de promoção. ✓
**Correção sugerida:** nenhuma agora. Na T-05.2, validar a API com o primeiro consumidor real.

### 🟢-3 [Acessibilidade] Motivo das opções de status desabilitadas só em `title`; "Cancelar" é `Button` que só navega
**Onde:** `components/StatusPicker.tsx:37-38` · `RoomForm.tsx:114` e `CategoryForm.tsx` (botão Cancelar)
**Cenário:**
- O botão desabilitado sai da ordem de Tab, e o motivo fica em `title`, que não aparece no toque e é inconsistente em leitor de tela. A lista visível embaixo compensa para quem enxerga, mas não está ligada ao botão.
- "Cancelar" usa `navigate()` dentro de `Button`, e o CATALOGO diz que "Button que só navega quebra abrir em nova aba". O mesmo padrão existe em hóspedes.

`aria-pressed`, `role="group"`/`aria-labelledby` e o `aria-describedby` para a faixa de modo consulta estão corretos.
**Correção sugerida:**
- Dar `id` a cada `<li>` de motivo e apontar `aria-describedby` do botão para ele.
- Trocar Cancelar por `ActionLink`/`Link` com visual secundário.

### 🟢-4 [Dívida de design system] Altura de 48 px dos campos resolvida com patch local (`TOUCH`) em vez de no `Input` do `@hotel/ui`
**Onde:** `components/touch.ts:6` e o uso em `RoomForm.tsx`/`CategoryForm.tsx`
**Cenário:** o `Input` do pacote mede 42 px no celular. O executor corrigiu só nas telas de quartos, e as telas de hóspedes continuam abaixo do princípio 12. A decisão está documentada e é defensável, mas o defeito é do componente compartilhado. Cada módulo novo vai precisar lembrar de aplicar o `TOUCH`.
**Correção sugerida:** levar à faxina semanal e mudar o `Input` (e o `Select`, quando promovido) para `min-h-touch md:min-h-0` no `@hotel/ui`.

**SUSPEITA, não confirmada:** um quarto cuja categoria foi excluída abre a edição com o `<select>` sem opção correspondente ao valor (`RoomForm.tsx:84-93`). Dependendo do navegador, o select mostra o placeholder ou a primeira categoria real, e o RHF pode gravar a categoria antiga ou a primeira da lista sem o admin perceber. Para confirmar, falta abrir no navegador um quarto com categoria soft-deleted e inspecionar o corpo do PUT.

---

## Repassados a outro dev

| Sev. | Achado | Onde | Dono | Repasse |
|------|--------|------|------|---------|
| 🔴 | R-1 `PUT /rooms/:id` aceita `category_id` de outro tenant: vaza nome, diária e `tenant_id` do outro hotel e cobra a reserva pela diária dele. `category_id` inexistente dá 500 | `services/core-service/app/Controllers/RoomApi/UpdateRoomController.js:21` | Sirlande | `docs/qa/repasses/para_sirlande_21102026.md` |
| 🟡 | R-2 Andar 0 vira `null` no cadastro (`floor \|\| null`) | `RoomApi/CreateRoomController.js:26` | Sirlande | idem |
| 🟡 | R-3 Status sem allowlist no cadastro (`FOO` e `OCCUPIED` → 201) e sem validação de transição no PUT (`OCCUPIED→AVAILABLE` → 200) | `CreateRoomController.js:27` · `UpdateRoomController.js:12,24` | Sirlande | idem |
| 🟡 | R-4 Excluir categoria em uso → 204. O quarto fica com `category: null`, segue em `/rooms/available` e é cobrado pela diária congelada da categoria excluída | `RoomCategoryApi/DeleteRoomCategoryController.js:9` | Sirlande | idem |
| 🟡 | R-5 Categoria sem validação de valor: diária negativa aceita (201/200, o quarto fica impossível de reservar, com 422); capacidade −3 aceita; `"abc"` e estouro de precisão → 500; capacidade 0 vira 1 | `CreateRoomCategoryController.js:11,17` · `UpdateRoomCategoryController.js:14-15` | Sirlande | idem |
| 🟡 | R-6 `DELETE /rooms/:id` exclui quarto `OCCUPIED` (204). Só a tela impede | `RoomApi/DeleteRoomController.js:9` | Sirlande | idem |
| 🟡 | R-7 `PUT /rooms/{id}`, `PUT /room-categories/{id}` e `PUT /guests/{id}` sem `requestBody` no Swagger, o que força `as never` no front | `services/core-service/config/swagger.js` | Gabriel (T-06.2, §7: "uma pessoa") | `docs/qa/repasses/para_gabriel_21102026.md` |
| 🟢 | R-8 Regra 7 do `qa_checks.sh` dá falso positivo "room-category" (o recurso está documentado no plural, `/room-categories`) | `scripts/qa_checks.sh:158-165` | Gabriel (portão de QA) | idem |

## O que foi verificado e está correto
- **Isolamento e papel no backend** (sondas reais): RECEPTIONIST lê `/rooms` e `/room-categories` (200) e recebe 403 em POST, PUT e DELETE. WAITER recebe 403 em tudo, inclusive no GET. A tela não é a única barreira.
- **Gate de rota**: as 4 rotas de escrita estão sob `RequireRole allow={['ADMIN']}` (`App.tsx:56-60`). As listas aceitam ADMIN e RECEPTIONIST, e o WAITER não entra. Conferi a ordem das rotas: `quartos/categorias/nova` não colide com `quartos/:id/editar`.
- **Botões desabilitados com motivo**: `WriteButton` tem `title` e `aria-describedby` para `#rooms-read-only-reason`. O Editar desabilitado continua visível para a recepção (captura `t051_mobile_quartos_recepcao.png`). O `DeleteControl` mostra o motivo escrito.
- **Dinheiro**: nenhum `Number()` sobre `DECIMAL` no código novo. Exibição por `Money` → `decimalToCents` → `formatBRL`. Entrada por `parseBRLInput` → `centsToDecimalString` (string `"150.00"` para o backend). O ida-e-volta `centsToBRLInput`/`parseBRLInput` é testado. `parseInt` só em andar e capacidade, que são inteiros. Também confirmei que editar a diária **não** muda reserva já criada: `total_amount` fica gravado, e `accountCharges.js` usa a diária só como peso do rateio.
- **api-client**: regenerado e idêntico ao commit, sem edição manual. `Room` e `RoomCategory` vêm de `components['schemas']`, sem tipo redefinido à mão.
- **Quatro estados**: as seis telas têm Spinner, EmptyState com próximo passo, `ErrorState` com "Tentar de novo" e conteúdo. O cadastro de quarto sem categoria leva a "Cadastre uma categoria antes". O 404 vira "não encontrado".
- **Cor + rótulo**: `StatusBadge` sempre com ponto e texto, inclusive no seletor e na lista de motivos.
- **48 px**: `Button` `comfortable` = `min-h-touch`; `ActionLink`, abas, Select e campos com `min-h-touch md:min-h-0`. A captura do celular confere.
- **Cache**: `refetchType: 'all'` evita a lista velha depois de salvar. A exclusão usa `setQueryData` para não rebuscar o detalhe apagado. Editar a categoria invalida também a lista de quartos.
- **Ordenação no cliente** (`sortRooms`): **aceitável hoje**. Não filtra, e a lista mostrada é a que a API devolveu. Vai ficar errada quando houver paginação (ordenaria só a página), por isso deve entrar junto com a T-05.12/T-06.10.
- `qa_checks.sh` não acusa nada em `features/rooms`. O `<select>` cru tem `qa-allow: ui` justificado (é o próprio componente `Select`).

## Não foi possível verificar
- **Interação no navegador**: não reabri a UI. As afirmações visuais se apoiam no código e nas 12 capturas do executor. A SUSPEITA do select com categoria excluída depende disso.
- **Leitor de tela real** (NVDA/VoiceOver): só análise de ARIA.
- **Cobertura de linhas** do frontend: o `.github/workflows/ci.yml` não roda nada do frontend (nem teste, nem typecheck, nem cobertura; o portão de 60% é só do backend). Faltam testes de componente para `RoomForm`/`CategoryForm` (`toInput`, envio do status), e foi o que deixou o 🟡-1 passar.
