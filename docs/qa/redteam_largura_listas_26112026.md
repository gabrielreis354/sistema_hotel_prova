# QA Red Team — largura das listas, grade da comanda e linha do Hoje (SPEC-10, R-7 revista)
**Branch:** fix/t10-largura-listas · **Dev:** Sirlande · **Base:** feature/spec-10-identidade@b522db0 · **Data:** 26/11/2026
**Arquivos auditados:** 10 (9 de código + 1 doc)
**Achados no escopo:** 5 (🔴 0 · 🟡 2 · 🟢 3) · **Repassados:** 0

## Veredito
APROVADO COM RESSALVAS

Nenhum achado 🔴. A mudança é só visual e não toca em `services/`. Os dois 🟡 são estes: o formulário
"Abrir conta" passou a ocupar a coluna inteira no computador, o que contradiz a R-7 revista; e o
e2e deixou de passar pelo caminho do garçom no celular.

## Achados no escopo

### 🟡 [UI/R-7] O formulário "Abrir conta" ficou com a largura da coluna inteira no lg+
**Onde:** `frontend/apps/pms/src/features/accounts/AccountsListPage.tsx:53` (a raiz perdeu o `max-w-xl`) e `:153-160` (o `<div className="pt-1">` do `OpenAccountForm` não tem limite)
**Cenário:** monitor de 1280 px com a barra lateral. O recepcionista clica em "Abrir conta" no cabeçalho. O `OpenAccountForm` (`components/OpenAccountForm.tsx:64`, `space-y-3 … p-4`, sem largura própria) abre esticado na coluna, com cerca de 980 px; com 1440 px de janela chega a uns 1376 px. O campo "Nome na comanda" fica com essa largura, e o `grid grid-cols-2` de `OpenAccountForm.tsx:97` deixa "Cancelar" e "Abrir mesa" com uns 480 a 680 px cada. Antes os dois ficavam presos a 576 px.
**Regra violada:** R-7 (26/11) no `SPEC-10-estudo-responsividade.md:33`: "Formulário e detalhe continuam com a largura de leitura… Campo de formulário com 1400 px fica ilegível". O próprio doc deste diff descreve o defeito.
**Correção sugerida:** `lg:max-w-xl` no wrapper `pt-1`, o mesmo valor da busca (`:114`).

### 🟡 [Testes] O e2e deixou de exercitar o "Abrir conta" do garçom (rodapé fixo)
**Onde:** `frontend/e2e/tests/roteiro.spec.ts:147` e `frontend/e2e/playwright.config.ts:27` (`devices['Desktop Chrome']`, 1280×720)
**Cenário:** antes deste diff, a 1280 px, o único "Abrir conta" do roteiro era o botão do `StickyFooter`. Agora o rodapé tem `lg:hidden` (`AccountsListPage.tsx:163`), e o `.first()` pega o botão do cabeçalho (`:58`), que só aparece no lg+. Suponha uma regressão no rodapé abaixo de 1024 px, que é o celular do garçom, principal usuário da comanda: ele some, fica atrás da barra ou deixa de chamar `setOpening`. Nenhum teste quebraria. O teste unitário de `AppShell.test.tsx:108-113` só confere se a string `<StickyFooter` existe no arquivo. Também nenhum teste unitário renderiza a `AccountsListPage`, então não há teste da regra "cabeçalho só com `data.length > 0 && !opening`" nem do "rodapé só abaixo do lg".
**Regra violada:** checklist §8, teste que passaria com a regra quebrada (o caminho do garçom no celular fica sem cobertura).
**Correção sugerida:** no roteiro, rodar o passo da mesa com `page.setViewportSize({ width: 390, height: 844 })`, ou criar um projeto mobile no Playwright só para a comanda. Outra opção é um teste de render da `AccountsListPage` que confira `lg:hidden` no rodapé e `hidden lg:inline-flex` no cabeçalho.

### 🟢 [UI] No celular sobram 12 px a mais embaixo do título "Comanda"
**Onde:** `AccountsListPage.tsx:56-62`, junto com `packages/ui/src/PageHeader.tsx:23,28`
**Cenário:** com 390 px de largura e contas abertas, `action` recebe um `<Button className="hidden …">`, que é truthy. O `PageHeader` renderiza o `<div className="flex shrink-0 flex-col …">` vazio. Abaixo do `sm`, o header é `flex-col gap-3`, então o item vazio ainda soma o `gap-3`: a distância entre o título e a busca passa de 12 para 24 px, só nessa tela e só no celular. Entre 640 e 1023 px o header vira `sm:flex-row` e o gap fica horizontal, sem efeito visível.
**Correção sugerida:** passar `hidden lg:flex` (ou `lg:contents`) via `className` do wrapper, ou aceitar `actionClassName` no `PageHeader`. Fica fora do escopo mexer no `@hotel/ui` para isso; a outra saída é aceitar o espaço.

### 🟢 [UI/foco] No lg+ a ação fica longe do formulário, e o foco se perde ao cancelar
**Onde:** `AccountsListPage.tsx:57-58` e `:153-160`
**Cenário:** com 20 contas em grade de 3 colunas, o clique em "Abrir conta" no canto superior direito tira o botão do DOM (`!opening`) e abre o formulário no fim da grade. O `autoFocus` (`OpenAccountForm.tsx:81`) rola a página até lá, um salto de várias telas. Quando a pessoa clica em "Cancelar", o formulário desmonta, o botão do cabeçalho volta e o foco cai no `<body>`: quem usa teclado ou leitor de tela recomeça do topo. A perda de foco já existia com o rodapé, mas a distância entre a ação e o formulário é nova.
**Correção sugerida:** no lg+, abrir o formulário logo abaixo do cabeçalho (antes da busca) e devolver o foco ao botão de origem no `onCancel` (ref + `focus()` num `useEffect` quando `opening` volta a `false`). Por ser fluxo de teclado no computador, pode ficar para depois do congelamento.

### 🟢 [Doc] A R-7 revista reabre o "pulo" de largura entre a lista e o detalhe, e o doc não comenta
**Onde:** `docs/specs/anexos/SPEC-10-estudo-responsividade.md:32-33`
**Cenário:** a linha R-7 de 25/11 justificava os 1024 px na lista de reservas porque "o conteúdo pulava de largura ao ir… da lista para o detalhe" (🟡3 do qa-redteam da F4). Com a linha de 26/11, Reservas → detalhe (1024 px) e Comanda (grade de 1376 px) → conta (`AccountPage.tsx:107`, `max-w-xl`, ou `xl:max-w-5xl`) voltam a pular. É uma decisão consciente do Sirlande, mas a nova linha não diz que aceita o efeito, então um revisor pode reabrir o 🟡3 da F4 como regressão.
**Correção sugerida:** acrescentar à justificativa da linha 26/11 algo como "o pulo lista → detalhe é aceito: o detalhe é leitura, a lista é varredura".

## Pontos levantados no pedido e conferidos sem achado
- **Dois "Abrir conta" no DOM:** `hidden` e `lg:hidden` são `display:none` (gerei o CSS com o preset: `.hidden{display:none}` e `@media (min-width:1024px){.lg\:hidden{display:none}}`). O botão escondido sai da árvore de acessibilidade e da ordem de tabulação, então o leitor de tela nunca anuncia dois. No `Button`, o `cn(button(variants), className)` (`packages/ui/src/Button.tsx:66`) deixa o `hidden` vencer o `inline-flex` da base, e o `lg:inline-flex` entra separado. No e2e, o `getByRole` do Playwright já ignora elemento oculto, então o `.first()` sobra mas não faz mal. Nenhum teste unitário consulta o botão pelo papel (busquei "Abrir conta" nos `*.test.tsx`).
- **Estado `opening`:** o botão do cabeçalho some quando o formulário está aberto e quando a lista está vazia. Nesse último caso o `EmptyState` (`:100-106`) tem a própria ação. Não aparecem duas ações visíveis ao mesmo tempo em nenhuma largura.
- **Sombra do `StickyFooter` na `AccountPage`:** `0 1rem 0 0` não tem espalhamento, então é o próprio cartão deslocado 16 px para baixo e cobre a folga de 12 px de `md:bottom-3`. `--color-ground` é `246 244 239` (`packages/ui/src/tokens.css:41`), e `rgb(246 244 239)` é CSS válido, a mesma cor do `bg-ground` da casca (`AppShell.tsx:58`). Quando o rodapé não está preso, os 16 px caem sobre o `md:pb-4` do `<main>`, que também é ground, então nada aparece. No xl, na `AccountPage` (`xl:static`, coluna 1, linha 2 de altura `1fr`), não há nada embaixo na coluna 1, e a sombra pinta ground sobre ground. O `cn` não remove o `md:shadow-*` com as classes que a `AccountPage` passa (`AccountPage.tsx:158`).
- **`RoomNumber` no detalhe da fita:** o `aria-hidden` já estava no span antigo. O texto `Quarto {room.number}` ao lado (`HotelStripView.tsx:281`) continua dando o número inteiro ao leitor de tela. O `cn` troca `h-10` por `h-11`, `min-w-10` por `min-w-11`, `bg-ground` por `bg-white` e `text-sm` por `text-base`, e mantém `max-w-20` e `truncate`. O Tailwind 3.4.19 gera `min-w-11` e `max-w-60` pela escala de spacing (conferido no CSS gerado). A mudança visual (de `ring` para `ring-inset`, e largura entre 44 e 80 px) é desprezível.
- **`sm:max-w-60` nas outras linhas:** as ações são um único botão `ROW_TRIGGER`. Com ícone e "Fazer check-out" em `text-base` dá uns 175 px, abaixo dos 240. O `InHouseItem` não tem ação. No `CleaningItem` cabem "Liberar quarto" e "Liberado". Abaixo de 640 px a classe não vale e o `w-full` continua. Entre 640 e 1279 px só o motivo do `ActionSlot` quebra, que é o objetivo. Nenhuma ação passa de 240 px.
- **Regex do teste novo** (`uiBase.test.tsx:278`): pega o primeiro `return (` seguido de `<div className="…">`. Nos 5 arquivos, os outros `return (` (ReservationsListPage:141 `<Tr`, AccountsListPage:127 `<li`) não batem. Se alguém trocar a raiz por `className={cn(...)}` ou `<section>`, o `expect(raiz).not.toBeNull()` falha de forma visível, então a falha é segura. Falsos negativos possíveis: `max-w-*` num filho logo abaixo da raiz, ou um componente wrapper que limite a largura. O teste também não protege o contrário, ou seja, que os formulários continuem estreitos, e é por isso que o primeiro 🟡 passou.
- **Suíte:** `npx vitest run` em `apps/pms` passou com 70 arquivos e 727 testes.
- **Fora do front:** o diff não toca em `services/`, Swagger nem `tenant_id`. Não cria dado pessoal, log nem `require()`.

## Repassados a outro dev
nenhum

## Não foi possível verificar
- Renderização real no navegador (Playwright/qa-explorador) em 360, 768, 1024, 1280 e 1440 px. As conclusões sobre a sombra, o gap e a largura do formulário vêm da leitura do código e do CSS gerado, não de captura de tela.
- Não rodei o e2e (`roteiro.spec.ts`) porque ele precisa do Docker Compose no ar.
