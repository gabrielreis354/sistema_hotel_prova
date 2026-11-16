# QA Red Team — SPEC-08 T-08.4 (painel Hoje denso, ação secundária, corte de 8)
**Branch:** feature/t084-painel-hoje (PR #162) · **Dev:** Sirlande · **Base:** feature/t083-hierarquia-acoes@20321f3 · **Data:** 15/11/2026
**Escopo:** commit 96f8313. O merge 6ff6ed3 só traz a t083, já auditada, e não toca em `features/today/`.
**Arquivos auditados:** 4 (TodayPage.tsx, components/rows.tsx, todayLogic.ts, todayLogic.test.ts). Lidos para contexto: TodayBlock.tsx, todayApi.ts, queries.ts, Button/ActionSlot/cn de @hotel/ui, tailwind-preset, tokens.css, GUIA_UI_CORPORATIVA §3/§5, SPEC-08 §T-08.4/§6
**Achados no escopo:** 6 (🔴 0 · 🟡 2 · 🟢 4) · **Repassados:** 2 (🟢)

## Veredito
APROVADO COM RESSALVAS

Nenhum 🔴. A T-08.4 é só apresentação: não mexe em rede, em regra de negócio nem em dado novo. O 🟡1 é um critério de aceite (CA-08.i) que o próprio commit mediu e registrou como não atendido no pior caso.

Execução real (worktree descartável em origin/feature/t084-painel-hoje, Node 24, já removido):
- `pnpm install --frozen-lockfile`: ok
- `pnpm --filter ./apps/pms test`: 30 arquivos, 354 testes passando
- `pnpm --filter ./apps/pms typecheck`: limpo
- `scripts/qa_checks.sh`: 0 erro; 3 avisos, nenhum em `features/today` (regras 9a/9b/9c limpas no diff), então CA-08.k ok

## Achados no escopo

### 🟡1 [UI/CA-08.i] No pior caso a página passa de 3.000 px em 375 px
**Onde:** `frontend/apps/pms/src/features/today/components/rows.tsx:240-253` (ArrivalItem: HeadLine + StayLine + linha de selos) e a mensagem do commit 96f8313
**Cenário:** o próprio commit registra, em 375 px com chegadas acima do corte, 2.951 px no caso favorável e **3.091 px no pior caso**. O corte é 8, então 30 chegadas renderizam igual a 10. Logo o CA-08.i ("30 chegadas em 375 px: altura total abaixo de 3.000 px antes de expandir") falha no pior caso. No celular, a chegada com sinal ocupa 3 linhas de texto (nome+status, quarto+diárias, selos), e a GUIA §5 pede "até duas linhas de texto mais o botão".
**Regra violada:** SPEC-08 CA-08.i; GUIA_UI_CORPORATIVA §5 (lista operacional no celular)
**Correção sugerida:** levar os selos de no-show e de atraso para dentro do `HeadLine`, que já é `flex-wrap`, e assim eliminar a terceira linha. Depois, remedir com 30 chegadas e registrar o número no relatório de sessão.

### 🟡2 [UI/acessibilidade] "Mostrar menos" no fim da lista joga a pessoa para outro bloco; "Ver todas" deixa o foco depois dos itens revelados
**Onde:** `frontend/apps/pms/src/features/today/components/rows.tsx:38-55` (RowList)
**Cenário (recolher):** 30 chegadas expandidas. A recepcionista rola até o fim e toca "Mostrar menos". 22 linhas (~3.500 px no celular) somem acima do ponto que ela está vendo, e nada reposiciona a rolagem: o Safari/iOS não tem scroll anchoring, e no Chrome a âncora tende a ser uma linha que acabou de ser removida. Ela cai em "Na casa"/"Em limpeza" ou no rodapé, e o botão fica fora da vista.
**Cenário (expandir, teclado/leitor de tela):** o botão fica depois da `<ul>`. Ao expandir, os itens 9 a 30 entram ANTES do foco. O próximo Tab vai para o bloco seguinte, e para chegar ao item 9 é preciso voltar com Shift+Tab por 22 linhas. Nenhum `aria-controls` liga o botão à lista.
**Status:** recolher é SUSPEITA forte, por leitura de código: não medi em navegador, e o vitest roda em node, sem DOM. A ordem de foco está confirmada pela estrutura do JSX.
**Regra violada:** não perder o lugar da recepção no celular (DESIGN_PMS/GUIA); WCAG 2.4.3 (ordem de foco)
**Correção sugerida:** pôr um `ref` no botão (ou no título do bloco) e, ao recolher, chamar `scrollIntoView({ block: 'nearest' })`. Ao expandir, levar o foco ao primeiro item revelado (`tabIndex=-1` na 9ª linha). Dar `id` à `<ul>` e `aria-controls` ao botão.

### 🟢3 [UI/GUIA regra 2] "Ver todas" pintado com `text-brand`
**Onde:** `frontend/apps/pms/src/features/today/components/rows.tsx:47`
**Cenário:** com 4 blocos acima de 8 itens, a tela mostra quatro textos na cor da marca que não são "faça isto" (só abrem e fecham a lista) e competem com o `primary` da confirmação. O contraste está ok: #115e59 sobre branco dá cerca de 7,6:1, e sobre o gray-100 do hover fica acima de 4,5:1. O problema é de significado, não de leitura.
**Regra violada:** GUIA_UI_CORPORATIVA §3, regra 2 ("brand significa faça isto; não use como enfeite")
**Correção sugerida:** tirar o `text-brand` e deixar o `ghost` padrão (`text-gray-700`), se quiser com ícone ChevronDown/ChevronUp ao lado do rótulo.

### 🟢4 [UI] "Ver todas (N)" promete "todas" quando o servidor cortou
**Onde:** `rows.tsx:51`, junto com `TodayPage.tsx:127` e `:144` (aviso `truncated` do TodayBlock)
**Cenário:** sobre o ponto (a): no caso normal, o número do botão é igual ao da pílula do título, porque os dois vêm de `arrivalList.length`. Eles só divergem acima de `TODAY_LIMIT = 100` (todayApi.ts:10). Aí Chegadas mostra "Mostrando 100 de 140. A lista completa está em Reservas." no topo e "Ver todas (100)" no rodapé, e o "todas" fica falso. Em Saídas é pior: o aviso usa a contagem de hóspedes na casa (ex.: "100 de 130") e o botão a de saídas (ex.: "Ver todas (12)"), o que põe no mesmo bloco três números sem relação visível. É improvável em hotel pequeno, mas possível com seed volumoso.
**Correção sugerida:** quando o servidor cortar, trocar o rótulo para "Ver mais (N)" ou "Ver as N carregadas", ou passar o `total` do servidor ao RowList. O texto do aviso de Saídas é da T-05.3 (ver repasse).

### 🟢5 [Testes] Nenhum teste garante que alerta e atraso nunca caem abaixo do corte
**Onde:** `frontend/apps/pms/src/features/today/todayLogic.test.ts:147-162`
**Cenário:** os testes de `visibleRows` usam os números 0..29 e só conferem o fatiamento. A garantia da SPEC ("atrasados e itens com alerta vêm antes do corte") depende de `arrivalRows`/`departureRows` ordenarem antes. Hoje isso está certo (conferi em todayLogic.ts:77-81 e 89-92: no-show, depois atraso, depois quarto). Mas se alguém trocar a ordenação para só "por quarto", nenhum teste do corte falha: um no-show no quarto 99 entre 12 chegadas sumiria abaixo do "Ver todas" com a suíte verde.
**Correção sugerida:** um teste composto com 12 chegadas normais nos quartos 1..12, 1 no-show no quarto 99 e 1 atrasada no 98. Verificar que `visibleRows(arrivalRows(...), false).shown` traz as duas nas posições 0 e 1. Fazer o mesmo para saída atrasada.

### 🟢6 [UI/DRY] Constantes e ícones
**Onde:** `rows.tsx:26` x `rows.tsx:29`; `rows.tsx:399`
**Cenário:** `ROW_TRIGGER` é `ROW_ACTION` com `sm:px-3` a mais: duas constantes quase iguais no mesmo arquivo (melhor `cn(ROW_ACTION, 'sm:px-3')`). O `Sparkles` em "Liberar quarto" se lê como "IA/mágica" nos produtos de hoje; um ícone de limpeza ou de porta (`BrushCleaning`, `DoorOpen`, `CircleCheck`) comunica melhor. E o mesmo "Fazer check-in" no detalhe da reserva (T-08.3) não tem ícone, então as duas telas ficam inconsistentes.
**Correção sugerida:** derivar `ROW_TRIGGER` de `ROW_ACTION`, trocar o ícone e anotar como pendência o ícone no detalhe da reserva.

## Pontos levantados pelo orquestrador
| Ponto | Conclusão |
|---|---|
| (a) Dois números na tela | Só acontece acima de 100 itens (🟢4). A pílula do título e o "Ver todas (N)" usam a mesma lista e sempre coincidem |
| (b) `text-brand` no ghost | É violação da regra 2 da GUIA, mas o contraste está ok (🟢3) |
| (c) "Mostrar menos" e foco/rolagem | Procede (🟡2) |
| (d) ROW_ACTION vs ROW_TRIGGER, 48 px até xl | O alvo está ok: a base `min-h-touch` (48 px) do Button vale em 375 e em 768; só a partir de xl entra `xl:min-h-0 xl:h-10` (40 px, ≥1280). O "Ver todas" segue a mesma regra (`xl:h-9`) e o GuestLink tem `min-h-touch` até xl. CA-08.g atendido no diff. A duplicação é menor (🟢6) |
| (e) Ordem antes do corte | Correta hoje: chegadas vêm no-show → atrasadas → quarto, saídas vêm atrasadas → quarto, e o corte é aplicado sobre a lista já ordenada. Falta um teste que trave isso (🟢5) |

## Repassados a outro dev
| Sev. | Achado | Onde | Dono | Repasse |
|------|--------|------|------|---------|
| 🟢 | O aviso de truncamento de Saídas compara a contagem de "na casa" (in-house cru), não a de saídas | `TodayPage.tsx:144` / `TodayBlock.tsx:47-50` | Gabriel (painel do dia, T-05.3; DIVISAO §3) | `/tmp/repasse_para_gabriel_15112026.md` |
| 🟢 | "Na casa" usa a mesma consulta com teto de 100 e não recebe `truncated`: acima de 100 corta sem avisar | `TodayPage.tsx:151-165`, `todayApi.ts:10,17` | Gabriel | `/tmp/repasse_para_gabriel_15112026.md` |

A T-08.4 não piora os 🟡 já conhecidos (cartões uma ação atrás; duplo clique em Confirmar check-in): o gatilho continua `disabled={... || confirming}` e o ConfirmPanel não mudou.

## O que foi verificado e está correto
- CA-08.e: as três ações de linha passaram a `variant="secondary"`. Os únicos `primary` restantes são o da confirmação (exceção prevista) e o "Nova reserva" do estado vazio de Chegadas.
- GUIA regra 5: todo ícone novo tem rótulo ao lado e `aria-hidden`.
- `lucide-react` está declarado em `apps/pms/package.json` e não depende de hoisting.
- As keys do React se mantêm no render prop (a `key` fica no filho), e `visibleRows` não altera a lista recebida.
- O estado `expanded` sobrevive ao refetch de 60 s: o bloco só desmonta em `isPending`, que só ocorre na primeira carga.
- O diff não tem rede, dado novo, PII nova, tenant nem regra de negócio. CA-08.j ok: os testes existentes passam sem ajuste.
- A ordem fixa dos blocos (D-4) não mudou.

## Não foi possível verificar
- As alturas reais (CA-08.i) e a "uma linha por item" de 1280 a 1366 px com duas colunas (`lg:grid-cols-2`, ~540 px por bloco, `xl:flex-wrap`): isso exige navegador. Usei a medição registrada no commit.
- O comportamento do scroll anchoring em cada navegador no "Mostrar menos" (🟡2): deduzido do código, não medido.
- O RowList não tem teste de componente porque o vitest roda em node, sem jsdom. É o esperado pelo setup do projeto.
