# QA Red Team — SPEC-10 Fase 1 (casca, marca e símbolo)
**Branch:** feature/t10-fase1-casca · **Dev:** Sirlande · **Base:** origin/feature/spec-10-identidade@39f47a7 · **Data:** 22/11/2026
**Arquivos auditados:** 24 (diff `origin/feature/spec-10-identidade...feature/t10-fase1-casca`, 7 commits, 6fdd1c3..34f52c6)
**Achados no escopo:** 8 (🔴 0 · 🟡 2 · 🟢 6) · **Repassados:** 0

## Veredito
**APROVADO COM RESSALVAS**

Não há 🔴. A troca `xl:` → `desk:` está completa e a variante sai no CSS na ordem certa. Os contrastes declarados batem com o cálculo, e o roteiro e2e não depende de nenhum nome que mudou. Ficam duas ressalvas. A primeira: a folga da barra de gestos (R-4) não tem efeito no navegador do iPhone. A segunda: a R-3 ficou incompleta nos botões `size="compact"`.

## Achados no escopo

### 🟡 [UI/R-4] A folga da barra de gestos não funciona: falta `viewport-fit=cover`, e o piso de 6 px também falta
**Onde:** `frontend/apps/pms/index.html:5` (`width=device-width, initial-scale=1.0`, sem `viewport-fit=cover`). O código que depende disso está em `frontend/apps/pms/src/components/AppShell.tsx:217` (`pb-[env(safe-area-inset-bottom)]`), `:190` (folha "Mais") e `:129` (`main`). O teste é `AppShell.test.tsx:84`.
**Cenário:** um iPhone com barra de gestos abre o PMS no Safari. Sem `viewport-fit=cover`, o WebKit devolve 0 para `env(safe-area-inset-*)`, então as três folgas valem 0 e a barra de abas fica igual à da `develop`. A R-4 (`SPEC-10-estudo-responsividade.md:28`) pede `padding-bottom: max(6px, env(safe-area-inset-bottom))`, e o piso de 6 px não foi implementado. O teste só procura a string `safe-area-inset-bottom` no HTML, por isso fica verde com a regra sem efeito. (Não testei num aparelho. A conclusão vem do `index.html` e do comportamento documentado do WebKit.)
**Efeito colateral latente:** quando o `viewport-fit=cover` entrar, a barra de abas cresce cerca de 34 px. O rodapé fixo do total da comanda está em `features/accounts/AccountPage.tsx:136` (`sticky bottom-12 z-10`) e não acompanhou a folha "Mais", que já usa `calc(3rem+env(...))`. Com isso, uns 34 px do total ficam embaixo da barra de abas (`z-40`).
**Regra violada:** R-4 do estudo de responsividade. Teste que passa com a regra quebrada (§8).
**Correção sugerida:** acrescentar `viewport-fit=cover` à meta viewport e usar `pb-[max(6px,env(safe-area-inset-bottom))]` na barra. Trocar o `AccountPage.tsx:136` para `bottom-[calc(3rem+env(safe-area-inset-bottom))]`. O teste deve conferir também o `viewport-fit=cover` no `index.html`.

### 🟡 [UI/R-3] Os botões `size="compact"` continuam com 36 px para o dedo; a varredura não os pega
**Onde:** `features/analytics/IndicatorsPage.tsx:106` (meses do gráfico), `:178` (submit do período) e `features/analytics/components/BarChart.tsx:42` ("Ver tabela"). A varredura está em `components/touchTargets.test.ts:42-53`.
**Cenário:** o gerente abre Indicadores num tablet de 1280 px deitado, ou num celular. O `size="compact"` do Button (`packages/ui/src/Button.tsx:23`, `h-9`) não depende de largura nem de ponteiro, então esses alvos têm 36 px em qualquer aparelho. A R-3 diz "com dedo, 48 px em qualquer largura", e o commit 10b358f a dá como aplicada. A regex do teste só procura `xl:`/`2xl:` com `min-h-0` ou `h-N`, então `size="compact"` e as formas `xl:h-[..]`, `xl:size-N` e `xl:min-h-[..]` passam sem alerta. Hoje não existe nenhuma dessas três formas no código. O `MenuGrid.tsx:51` usa compact, mas sobrepõe com `min-h-touch` e fica certo. Isso não é regressão desta branch: é a R-3 entregue pela metade.
**Regra violada:** R-3. Alvo de toque menor que 48 px (§7).
**Correção sugerida:** nos três pontos, trocar por `className="desk:h-9 desk:min-h-0 xl:px-3 xl:text-sm"` sem `size="compact"`, como nos atalhos de período. Ampliar a regex para `(?:xl|2xl):(?:min-h-|h-|size-)`. Se ficar para depois, registrar como pendência da R-3.

### 🟢 [UI] Com a janela abaixo de 560 px de altura, o usuário no pé da barra só aparece no fim da rolagem; e com 560 px a barra não tem folga nenhuma
**Onde:** `components/AppShell.tsx:51` (`sticky top-0 flex h-screen min-h-[560px] flex-col overflow-y-auto`)
**Cenário:** um notebook de 1366×768 com zoom de 125% no navegador tem cerca de 1093×520 de área útil. O `min-h-[560px]` vence o `h-screen`, e o bloco preso no topo fica mais alto que a janela. O pé com nome e papel só aparece quando a página chega ao fim, e no desktop o topo não mostra mais o usuário. Pelas minhas contas, o ADMIN no tablet (itens de 48 px) ocupa exatamente 560 px: 93 do logo, 1 do divisor, 403 do menu e 63 do usuário. O primeiro item novo (Usuários, no 5º semestre) passa disso. Não há rolagem dupla: o `overflow-y-auto` nunca é acionado, porque a altura mínima já comporta o conteúdo.
**Correção sugerida:** tirar o `min-h-[560px]` e deixar o `overflow-y-auto` resolver as telas baixas, com o pé visível e o menu rolando por dentro. Outra saída é baixar o piso para algo como 420 px.

### 🟢 [UI/R-7] O topo segue a coluna de 1440 px, mas as telas com `max-w` próprio ficam mais estreitas, e o "Sair" não alinha com os cartões
**Onde:** `components/AppShell.tsx:108` e `:129` contra `features/reservations/ReservationsListPage.tsx:62` (`max-w-5xl`), `ReservationDetailPage.tsx:141` (`max-w-4xl`), `GuestsListPage.tsx:16` e `AccountPage.tsx:95` (`max-w-xl`).
**Cenário:** em 1366 px, o conteúdo útil do `main` tem 1066 px. A lista de reservas (1024 px, centralizada) fica 21 px para dentro do hotel e do "Sair". O detalhe (896 px) fica 85 px para dentro. Em 1920 px a diferença passa de 200 px. A R-7 nasceu justamente de "o Sair desalinhava dos cartões". Só o painel Hoje (`max-w-6xl`) alinha. Por outro lado, não há padding duplo: o `md:pb-4` vence o `pb-[calc(...)]`, e as páginas não somam padding próprio ao do `main`.
**Correção sugerida:** decidir uma largura de coluna só (ou poucas) e passar o `max-w` para o `main`. Se não, registrar que a R-7 vale só para o Hoje nesta fase.

### 🟢 [Testes] A asserção do papel no pé da barra não testa nada
**Onde:** `components/AppShell.test.tsx:59`
**Cenário:** o nome no dublê é "Recepção Aurora 1" e o papel esperado é "Recepção". Se alguém remover o `{role}` de `AppShell.tsx:97`, o `toContain('Recepção')` continua verde por causa do nome, e o mutante sobrevive.
**Correção sugerida:** usar um nome que não contenha o rótulo (ex.: "Ana Souza") ou conferir o `<span>` do papel diretamente.

### 🟢 [Multi-tenant] A marca é token, mas a barra mistura token com `text-white` fixo
**Onde:** `components/AppShell.tsx:53`, `:55`, `:94` e `:268` (`text-white` sobre `bg-nav`/`bg-nav-active`). O `public/favicon.svg:3` tem `#065f46` fixo.
**Cenário:** a marca continua trocável por hotel (`--color-brand` e `--color-nav-*` em `tokens.css`; hoje não existe troca em tempo de execução, `setProperty` não aparece em lugar nenhum). Mas se um hotel trocar `--color-nav` por uma cor clara, o logo, o nome, o usuário e o item ativo continuam brancos e perdem o contraste. Os pares de contraste conferidos em `tokens.css:19-23` só valem para essa combinação de cores. O favicon não segue o token. Isso é aceitável para a marca do produto, mas precisa ficar registrado.
**Correção sugerida:** criar um `--color-nav-strong` (texto forte da barra) no lugar de `text-white`, e anotar em `tokens.css` que os cinco tokens da barra se trocam juntos.

### 🟢 [Acessibilidade] O anel de foco do "Sair" quase some sobre a faixa nova
**Onde:** `components/AppShell.tsx:119-121` (Button `ghost`). O estilo é `packages/ui/src/Button.tsx:17` (`focus-visible:ring-gray-300`, com offset branco).
**Cenário:** quem navega por teclado foca o "Sair". O anel gray-300 dá 1,5:1 contra o offset branco e cerca de 1,3:1 contra a faixa `strip-from`. A WCAG 2.4.11/1.4.11 pede 3:1. O defeito já existia no topo branco. Esta branch troca o fundo e não corrige.
**Correção sugerida:** no Sair, `focus-visible:ring-brand`, igual ao "Mais" (`AppShell.tsx:239`).

### 🟢 [Manutenção] Comentários parados no "xl" e um comentário duplicado
**Onde:** `components/AppShell.tsx:40-44` (o comentário do `minmax(0,1fr)` aparece duas vezes, e a primeira cópia está em cima do `const role`). Comentários que ainda falam em "xl" depois da troca para `desk`: `AppShell.tsx:118`, `:264`, `components/links.tsx:25`, `ReservationDetailPage.tsx:424`, `rooms/components/Actions.tsx:8`, `today/components/rows.tsx:37`.
**Cenário:** quem ler vai entender que o corte é por largura (xl), quando agora é largura mais ponteiro fino, e pode reintroduzir `xl:min-h-0` (a varredura pega, mas o comentário engana).
**Correção sugerida:** apagar a primeira cópia e trocar "até o xl" por "até o compacto com mouse (desk)".

## Repassados a outro dev
nenhum

## O que foi verificado e está correto
- **R-3, troca mecânica:** não sobra nenhum `xl:`/`2xl:` de altura em `apps/pms/src` nem em `packages/ui/src`. O que sobrou de `xl:` é `px`, `text-sm`, `py` e layout. Os `xl:py-*` restantes (`links.tsx:30`, `TodayPage.tsx:250`, `RoomsHeader.tsx:26`, `ReservationsListPage.tsx:147`, `ReservationDetailPage.tsx:401`) estão em elementos com `min-h-touch`, então com o dedo o alvo continua com 48 px. Contei 20 ocorrências de `desk:` em 14 arquivos.
- **Variante `desk` no CSS gerado:** rodei o tailwindcss do pms para o scratchpad. Saiu `@media (min-width: 1280px) and (pointer: fine)` com `desk:h-8/9/10` e `desk:min-h-0`, emitido depois do bloco `min-width: 1280px`. Não há variante `max-*` (que deixaria de funcionar com o screen `raw`). O `dist/` que está em disco é antigo e não tem nem o `xl`, então não serve de evidência do build.
- **Contrastes (WCAG, calculados):** `nav-fg`/`nav` 5,21. `nav-muted`/`nav` 4,84, que passa o AA para 10,5 e 11 px. Branco sobre `nav-active` 7,81. Anel `nav-accent` sobre `nav` 4,28 e sobre `nav-active` 6,09, os dois acima de 3:1. "WAY" em `nav-accent` 4,28, texto grande. Avatar `brand`/`nav-fg` 7,29. Hover `black/15` 6,64. Aba ativa `brand` sobre `brand/5` 7,12. `gray-600`/faixa 6,53. Marca/branco 7,68.
- **Grupos e nomes acessíveis:** os `NavLink` continuam sendo links com o rótulo como nome, porque os ícones são `aria-hidden`. Os grupos "Operação" e "Gestão" não colidem com o `getByRole('group', { name: 'Tipo da conta' })` do roteiro (`roteiro.spec.ts:148`). O roteiro não usa o menu, o topo, o "Sair" nem o nome do usuário. A `<aside>` fica `display:none` abaixo do md e sai da árvore de acessibilidade, então não duplica com a "Navegação principal".
- **Topo entre 640 e 767 px:** a linha do usuário é `md:hidden` e aparece até 767. A partir de 768 px, a barra lateral mostra o usuário. Não existe faixa sem sessão visível, ao contrário do `sm:` antigo.
- **`GeswayLogo`:** é um rename puro (similaridade de 97%). Os dois imports (`LoginPage.tsx:12`, `AppShell.tsx:8`) apontam para `components/`, não restou referência ao caminho antigo, e o `tsc --noEmit` passou limpo.
- **`main`:** o `md:pb-4` vence o `pb-[calc(...)]` no md. O `md:px-8` não se soma a padding das páginas. A única sangria (`-mx-4`, `AccountPage.tsx:136`) fica dentro de `max-w-xl` e não estoura.
- **`navGroupsForRole`:** preserva a ordem e o conjunto do `navItemsForRole` (teste em `nav.test.ts`). O grupo vazio some.
- **Testes:** `vitest run src/components src/routes` deu 12 arquivos e 57 testes verdes.
- Nenhuma regra de negócio, rota ou contrato de API foi tocada. O diff é só frontend e tokens.

## Não foi possível verificar
- O comportamento real de `env(safe-area-inset-bottom)` sem `viewport-fit=cover`: não tenho iPhone nem simulador. A conclusão vem da documentação do WebKit.
- O e2e (o autor ainda vai rodar) e as capturas em `docs/qa/evidencias/spec10-fase1-casca_22112026/`. Não abri as imagens.
- A medição real das alturas da barra lateral no navegador: a conta dos 560 px foi feita a partir das classes.
- Leitor de tela de verdade (NVDA/VoiceOver) nos grupos `role="group"` e na leitura de "GES" + "WAY" com `tracking`. Pode sair soletrado. Um `aria-label="Gesway"` no bloco resolveria.

---

## Tratamento das ressalvas (Sirlande, 22/11)

| # | Achado | O que foi feito | Commit |
|---|---|---|---|
| 🟡1 | Folga da barra de gestos sem efeito no iPhone | `viewport-fit=cover` no `index.html`; barra com `max(6px, safe-area)`; a folha do Mais, o padding do `main` e o total da comanda (`AccountPage`) somam `calc(3rem + max(6px, safe-area))`; laterais seguras no iPhone deitado. O teste agora confere a meta do viewport e a soma nos três lugares | `c4d01a7`, `f15e8f6` |
| 🟡2 | `size="compact"` com 36 px no toque | Corrigido na origem: o `compact` do `Button` passa a ser `min-h-touch` e só encolhe com `desk:`. Cobre os Indicadores (3 usos) e o cardápio da comanda (1). Teste no `touchTargets` | `c4d01a7`, `f15e8f6` |
| 🟢 | Tela baixa (< 560 px) | Sem mudança: o usuário fica alcançável rolando a barra. Registrado | — |
| 🟢 | R-7 com telas de `max-w` próprio | Sem mudança: decisão 2 do plano. O alinhamento fecha quando cada tela for refeita (Fase 2 em diante) | — |
| 🟢 | Teste do papel sem efeito | O teste usa um nome que não contém o papel ("Ana Lima") | `c4d01a7` |
| 🟢 | Branco fixo sobre `bg-nav` | Token `nav-strong` | `a624f41` |
| 🟢 | Anel de foco do Sair fraco na faixa | `focus-visible:ring-brand` no Sair. O `ghost` do `@hotel/ui` não mudou | `a624f41` |
| 🟢 | Comentários desatualizados | Atualizados para o `desk`; duplicata do `minmax` removida | `a624f41` |
| — | `favicon.svg` com cor literal | Sem mudança: arquivo estático, não lê token | — |

Suíte do pms depois do tratamento: 64 arquivos e 613 testes verdes, typecheck limpo, `desk` no CSS gerado como `@media (min-width: 1280px) and (pointer: fine)`.
