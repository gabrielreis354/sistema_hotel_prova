# QA Red Team — SPEC-10, F5 (listas: reservas, hóspedes, quartos; Table e SegmentedControl no @hotel/ui)
**Branch:** feature/t10-fase5-listas · **Dev:** Sirlande (visual; telas do Gabriel) · **Base:** feature/t10-fase4-reserva@d3eefba · **HEAD:** 91ba1a1 · **Data:** 25/11/2026
**Arquivos auditados:** 18 (diff `feature/t10-fase4-reserva...HEAD`; nada fora de commit na worktree)
**Achados no escopo:** 9 (🔴 0 · 🟡 5, sendo 1 SUSPEITA · 🟢 4) · **Repassados:** 0

## Veredito
APROVADO COM RESSALVAS

Não há 🔴. O diff não toca em `services/` nem no contrato de API. Os períodos mandam para a API os mesmos parâmetros de antes. Não aparece dado pessoal novo em `title`, `aria` ou log. Os cinco 🟡 são de UI e acessibilidade. O mais concreto é a barra do "Confirmar" da nova reserva, que flutua 54 px acima do rodapé no tablet (768–1023 px).

Rodado na worktree: `tsc --noEmit` em `apps/pms` e `packages/ui` passou limpo. `vitest run` em `apps/pms` deu 69 arquivos e 699 testes verdes.

## Achados no escopo

### 🟡-1 [UI / tablet] A barra fixa da nova reserva flutua 54 px acima do rodapé entre 768 e 1023 px
**Onde:** `frontend/apps/pms/src/features/reservations/NewReservationPage.tsx:236`. A causa está em `frontend/apps/pms/src/components/AppShell.tsx:59`: `[--tabbar:3rem]` não é zerado no `md`, e a barra do celular fica num `md:hidden` (`AppShell.tsx:245`, `:297`). O total da comanda já resolveu isso com `md:bottom-0` (`features/accounts/AccountPage.tsx:139`).
**Cenário:** um tablet de balcão de 820 px abre "Nova reserva". A tabbar não aparece, porque é `md:hidden`, mas `--tabbar` continua valendo 3rem. A barra `lg:hidden` com o valor e o "Confirmar" gruda em `bottom: calc(3rem + 6px)`. Fica uma faixa de cerca de 54 px por onde o conteúdo rola visível **embaixo** da barra. No `md` o `<main>` tem só `md:pb-4`. É justamente a largura que o comentário de `:213` chama de "tablet".
**Agravante:** o teste `ReservationsListPage.test.tsx:67` fixa a string de classe exata com regex e não aceita `md:bottom-*` antes do `lg:hidden`. Do jeito que está escrito, ele congela o defeito.
**Regra violada:** R-4 da SPEC-10 (preso ao que existe embaixo) e consistência com o padrão da comanda.
**Correção sugerida:** acrescentar `md:bottom-0` à barra, como na comanda. Se preferir corrigir na origem, `md:[--tabbar:0px]` na casca. Depois afrouxar o regex do teste para `/sticky bottom-\[calc\(var\(--tabbar/` mais `md:bottom-0` e `lg:hidden`.

### 🟡-2 [UI / feedback] A barra mostra o valor e o "Confirmar" desabilitado sem dizer por quê, e quando diz, corta o motivo sem `title`
**Onde:** `NewReservationPage.tsx:240-244` (o motivo só aparece quando `!quote.ok`) e `:243` (`truncate`). Os bloqueios são montados em `:47-52`.
**Cenário A:** a recepcionista escolhe datas e o quarto 101, mas ainda não escolheu o hóspede. `quoteStay` não depende do hóspede, então `quote.ok` dá true. A barra mostra "Valor da estadia R$ 300,00" e o "Confirmar reserva" cinza. O motivo ("Escolha ou cadastre o hóspede.") existe só na lista `#confirm-blockers` do resumo, fora da tela. O comentário de `:232` diz que "o primeiro bloqueio aparece aqui", e isso não vale para esse caso. Quem enxerga não recebe nenhuma pista. O `aria-describedby` só ajuda o leitor de tela.
**Cenário B:** em 360 px, o botão "Confirmar reserva" com `shrink-0` ocupa cerca de 150 px. Sobram uns 170 px para o texto, e "Escolha ao menos um quarto livre." ou a mensagem de entrada no passado viram "Escolha ao menos um qu…". O `<p>` não tem `title`, e no toque o `title` nem apareceria.
**Regra violada:** checklist §7, "erro que diz o que falhou mas não o que fazer" (aqui nem diz o que falhou). Também o comentário do próprio código.
**Correção sugerida:** mostrar o motivo sempre que `blockers.length > 0`. Por exemplo, o valor em cima (quando `quote.ok`) e `blockers[0]` embaixo em `text-xs`, com `line-clamp-2` no lugar de `truncate`. Outra saída é o rótulo do botão virar o motivo curto.

### 🟡-3 [A11y / estado só por cor] O segmento ativo do SegmentedControl se distingue do inativo só por um tingido de 1,14:1
**Onde:** `frontend/packages/ui/src/SegmentedControl.tsx:45` (`active ? 'bg-brand/10 text-brand' : 'text-gray-700 hover:bg-gray-100'`)
**Cenário:** na lista de Reservas, "Próximos 7 dias" está ativo. O fundo `brand/10` sobre branco dá cerca de #E6F2EE, com contraste de cerca de **1,14:1** contra o segmento vizinho. O peso da fonte é o mesmo (`font-medium` nos dois), e não há borda, ícone nem sombra. O que sobra é o matiz do texto: emerald-700 contra gray-700, de luminância parecida para quem tem deuteranopia. Antes era o primário sólido contra o secundário, e a diferença era evidente. O `aria-pressed` resolve para o leitor de tela, não para o olho. O `hover:bg-gray-100` dos inativos ainda tem quase o mesmo peso visual do ativo. Os testes (`uiBase.test.tsx`, bloco F5; `ReservationsListPage.test.tsx:39-43`) só conferem que o ativo **não** é o primário. Nenhum garante que ele se distingue.
**Regra violada:** WCAG 1.4.1 (uso de cor) e 1.4.11 (contraste não textual do indicador de estado, 3:1). Checklist §7, "estado codificado somente por cor".
**Correção sugerida:** dar ao ativo um segundo sinal que não dependa de matiz. Por exemplo `font-semibold` com `ring-1 ring-inset ring-brand`, ou o padrão "segmento branco elevado" (trilho `bg-gray-100`, ativo `bg-white shadow-sm ring-1 ring-gray-300`). Conferir o 3:1 do anel contra o fundo.

### 🟡-4 [UI / toque] O selo do quarto, o elemento mais visível da linha no celular, fica fora do link
**Onde:** `frontend/apps/pms/src/features/reservations/ReservationsListPage.tsx:144` (`RoomNumber` irmão do `Link`), `:145` (comentário "o alvo de toque é a reserva inteira") e `:176-178` (o status também fica fora)
**Cenário:** em 360 px, a recepcionista procura o quarto 204 e toca no selo "204" à esquerda, que é o maior elemento da linha e foi colocado ali "porque a recepção acha a reserva pelo quarto". Nada acontece. O selo tem 40 px de largura, mais o `gap-2`, e o selo de status também é zona morta. Só o bloco do nome e do período abre a reserva. A lista de hóspedes resolveu o mesmo problema com `onClick` na `tr` (`GuestRow.tsx:22-31`). Esta lista não.
**Regra violada:** o comentário do próprio código e a regra de alvo de toque do DESIGN_PMS.md (a linha é o alvo).
**Correção sugerida:** levar o `RoomNumber` para dentro do `Link`, com o link `flex-row` e o `min-w-0` no bloco do texto. Ele continua `aria-hidden`, e o `sr-only` já diz o quarto. Outra opção é aplicar na `Tr` o mesmo padrão de clique da `GuestRow`.

### 🟡-5 [A11y / foco encoberto] SUSPEITA: a barra fixa pode encobrir o campo focado ao navegar por Tab
**Onde:** `NewReservationPage.tsx:234-236`. Não há `scroll-padding-bottom` no documento nem no `<main>` (`AppShell.tsx:167`).
**Cenário:** no tablet com teclado físico, a pessoa avança com Tab pelos quartos do `RoomPicker`. O navegador rola só o suficiente para o item focado encostar na borda de baixo da viewport, e ali estão a barra sticky (cerca de 70 px) e, no celular, a tabbar. O foco pode ficar atrás da barra. O mesmo pode acontecer com o `errorRef.focus()` do `Notice` de erro do envio (`:55`), que fica no fim do resumo, logo acima da barra.
**O que falta para confirmar:** abrir no navegador em 820 px e em 390 px, navegar por Tab até os últimos quartos e provocar um 409 de conflito. Se o foco ficar encoberto, vira 🟡 confirmado.
**Regra violada:** WCAG 2.2, 2.4.11 (Focus Not Obscured, AA).
**Correção sugerida:** `scroll-padding-bottom` no elemento que rola, com a altura da barra mais `--tabbar` (por exemplo `[scroll-padding-bottom:calc(var(--tabbar)+5rem)]` no `html`, só nesta página ou de forma global abaixo do `lg`).

### 🟢-1 [UI / DRY] Cabeçalho e células da lista de hóspedes desalinhados em 4 px
**Onde:** `frontend/packages/ui/src/Table.tsx:41` (`Th` com `px-3`) contra `frontend/apps/pms/src/features/guests/GuestRow.tsx:32`, `:41-43` (`td` com `px-4`)
**Cenário:** com a troca do cabeçalho manual pelo `THead`/`Th` em `GuestsListPage.tsx:55-60`, o título "Nome" começa 12 px da borda e o nome do hóspede, 16 px. A `GuestRow` não adotou `Tr`/`Td`, então a promoção do `Table` ficou pela metade nessa lista.
**Correção sugerida:** a `GuestRow` usar `Td` (a `tr` mantém o `onClick` e o `h-12`), ou pelo menos `px-3`.

### 🟢-2 [DRY / doc] A lista de reservas não usa o `Table`, e o CATALOGO diz que usa
**Onde:** `ReservationsListPage.tsx:117-124` (`Card` com `<table>` e `<caption>` montados à mão) e `frontend/packages/ui/CATALOGO.md:49` ("quartos, categorias, reservas, hóspedes")
**Cenário:** a lista precisa do `opacity-60` do `isPlaceholderData`, e o `Table` não aceita `className`. Por isso ela repete o `<table className="w-full text-left text-sm">` com a `caption`. Também usa `overflow-hidden`, onde o `Table` usa `overflow-x-auto`: se uma coluna estourar em 360 px, aqui ela é cortada, não rola. A próxima mudança no `Table` não chega nesta lista.
**Correção sugerida:** dar ao `Table` um `className` para o `Card`, usar o `Table` aqui e corrigir a frase do CATALOGO.

### 🟢-3 [UI / dado mostrado] O período curto do celular perde o ano, e o filtro aceita qualquer intervalo
**Onde:** `ReservationsListPage.tsx:220-224` (`shortPeriod`, com o comentário "a lista já é de um período curto")
**Cenário:** os campos "De"/"Até" (`:75-87`) aceitam, por exemplo, 01/11/2026 a 30/11/2027. No celular, uma reserva de 24/11/2026 e outra de 24/11/2027 aparecem as duas como "24/11 → 26/11". Os atalhos vão até 30 dias, mas o intervalo livre não tem limite. A virada de ano (30/12 → 02/01) também fica ambígua.
**Correção sugerida:** omitir o ano só quando `from` e `to` do filtro estão no mesmo ano. Caso contrário, usar o `period()` completo.

### 🟢-4 [Testes] Testes novos frouxos: regex sobre o código-fonte e nenhum clique no SegmentedControl
**Onde:**
- `frontend/apps/pms/src/components/uiBase.test.tsx:236`: `/className="mx-auto /` só pega `mx-auto` como **primeira** classe de um literal. Uma tela com `className="space-y-4 mx-auto max-w-3xl"`, com `cn('mx-auto …')` ou com `className={'mx-auto …'}` volta a centralizar e o teste continua verde. A exceção `features/accounts/` exclui o módulo inteiro, não só a comanda.
- `ReservationsListPage.test.tsx:62-75` e `touchTargets.test.ts:72-73`: conferem a string do `.tsx` com regex, não o comportamento. O teste da barra exige a classe exata, e qualquer ajuste legítimo, como a correção do 🟡-1, quebra o teste sem que nada tenha regredido.
- Nenhum teste dispara o `onChange` do `SegmentedControl` (todos usam `renderToString`). Se o `onClick` de `SegmentedControl.tsx:41` for apagado, ou se `IndicatorsPage.tsx:107` passar a mandar `v` como string, ou ainda se o `applyPreset` deixar de ser ligado (`ReservationsListPage.tsx:73`), as 699 asserções seguem verdes. É exatamente o ponto "o período continua mandando os mesmos parâmetros" pedido nesta auditoria. Hoje isso está garantido pelo tipo e pela leitura do código, não por teste.
**Correção sugerida:** um teste com `@testing-library/react` (ou `react-dom/client` e `act`) que clique em "Próximos 30 dias" e confira `?de=hoje&ate=hoje+30`, e outro que clique em "24 meses" e confira o `monthlyWindow(today, 24)` pedido. No R-7, procurar `\bmx-auto\b` em qualquer posição de `className`.

## Repassados a outro dev
Nenhum.

## O que foi verificado e está correto
- **Parâmetros da API inalterados.** Reservas: `onChange={applyPreset}` recebe o mesmo `PeriodPreset` de antes, e `applyPreset`/`presetRange`/`update` não mudaram (`ReservationsListPage.tsx:41-44`). O `activePreset ?? null` deixa nenhum segmento marcado em intervalo livre, como antes. Indicadores: `String(n)` na ida e `Number(v)` na volta mantêm `months: number` e `monthlyWindow(today, months)` (`IndicatorsPage.tsx:45-46`, `:105-107`). O `tsc` confirma os tipos.
- **Table movida sem resto.** `grep` sem nenhum import de `components/Table` sobrando. Quartos e categorias importam do `@hotel/ui`, e o `index.ts` exporta `Table, THead, Th, Tr, Td` e `SegmentedControl`. A única mudança de comportamento é o cabeçalho, de gray-500 para gray-600, que é de propósito.
- **SegmentedControl.** `role="group"` com `aria-label`, botões `type="button"` com `aria-pressed`, Tab por botão e anel `focus-visible:ring-brand`. O `min-h-touch` vira `desk:h-9 desk:min-h-0` só com `pointer: fine` e 1280 px ou mais, então o toque de 48 px fica preservado até o tablet. Toggle buttons com `aria-pressed` não pedem navegação por setas. Contraste do texto ativo (brand sobre brand/10): cerca de 4,75:1, AA.
- **Botão duplicado do Confirmar.** `hidden lg:inline-flex`: o `cn` com tailwind-merge remove o `inline-flex` da base, e abaixo do `lg` o botão sai da árvore de acessibilidade. As duas cópias usam o mesmo `disabled`, o mesmo `create.isPending` ("Reservando…") e o mesmo `confirm()`. O valor da barra vem do mesmo `quote.totalCents` do resumo.
- **A barra não cobre o último conteúdo.** Ela é sticky e ocupa lugar no fluxo, e o `<main>` tem `pb` de `--tabbar + 2rem` no celular.
- **Linha da reserva no celular.** O nome quebra sem corte, período e diárias ficam em `whitespace-nowrap` com ponto de quebra entre eles, e o `RoomNumber` corta com "…" e mantém o `title`. O `sr-only` com "Quarto N" só aparece onde a coluna Quarto some (o pai é `sm:hidden`).
- **Link do hóspede.** `min-h-touch` e `desk:min-h-0`, com anel de foco. O clique de dentro do link continua ignorado pela `tr` (`GuestRow.tsx:23`).
- **R-7.** Hóspedes (lista, ficha, novo e editar), quartos, categorias e `FormShell` perderam o `mx-auto`. Os únicos `mx-auto` que sobraram em `features/` são a comanda (F6), o comprovante e o `Placeholder`, todos exceções declaradas.
- **LGPD e multi-tenancy.** Nenhum `console.*` novo. O único `title` novo é o número do quarto. A `caption` é "Hóspedes cadastrados", sem CPF. O CPF da lista de hóspedes já aparecia antes e não mudou neste diff. Não há chamada de API nova.

## Não foi possível verificar
- **Layout real no navegador** (360, 390, 820 e 1280 px), incluindo o 🟡-5 e o tamanho exato do corte no 🟡-2. A auditoria foi de leitura de código, testes e tipos, sem Playwright nesta rodada.
- **Teclado virtual.** No Chrome Android (`resizes-visual`), a barra sticky e a tabbar ficam atrás do teclado e não sobem com ele. No iOS Safari, o comportamento do sticky durante a digitação no `GuestPicker` não foi observado. Precisa de aparelho ou emulação.
- **Contraste exato.** As contas usam `--color-brand` = rgb(4 120 87) (emerald-700), que é o valor presumido. Se o tenant trocar a cor da marca (o token é variável), o contraste do 🟡-3 muda junto.

## Resolução (25/11, mesma sessão)

Junto com o critique da F5 (`impeccable_critique_spec10-fase5_25112026.md`), que achou várias destas mesmas falhas medindo no navegador.

| Achado | O que foi feito | Commit |
|---|---|---|
| 🟡1 barra solta 54 px no tablet | `md:bottom-0`, como a conta; o teste passa a exigir isso. Medido em 768×1024: a barra termina em 1024 | `3866217` |
| 🟡2 Confirmar desabilitado sem motivo | Com bloqueio, a barra mostra o motivo em `line-clamp-2` (e o valor menor em cima, se houver). Pronta, mostra "Isabela Castro · 1 diária · 101". Teste renderiza a página e confere o motivo | `3866217` |
| 🟡3 ativo só por cor | `font-semibold` no ativo (600 contra 500), com teste | `22c17c6` |
| 🟡4 selo do quarto fora do link | O `RoomNumber` entrou no `Link`; o sublinhado do hover fica só no nome. Teste | `8aeeecb` |
| 🟡5 (suspeita) foco atrás da barra | `scroll-padding-bottom` no `html` enquanto a barra existe (9rem; 6rem no md). Medido em 390 px: focar cada um dos 8 quartos deixa todos acima da barra | `3866217` |
| 🟢1 cabeçalho de hóspedes 4 px fora | `px-3` na `GuestRow`; medido: Th e Td começam no mesmo x | `07b49ae` |
| 🟢2 Reservas fora do `Table` | Usa o `Table`; o `CATALOGO.md` passa a estar certo | `8aeeecb` |
| 🟢3 período curto sem ano | Ano com dois dígitos quando o período filtrado ou a estadia atravessam a virada (decisão do Sirlande de 25/11). 4 testes | `8aeeecb` |
| 🟢4 testes frouxos | Teste que toca no `SegmentedControl` e confere o `onChange`; o da R-7 pega `mx-auto` em qualquer posição. O `Number(v)` dos Indicadores segue garantido só pelo tipo | `22c17c6` |

Verificação: 708 testes, typecheck, build, `qa_checks` (0 erros) e e2e 7/7. Navegador em 390, 768 e 1366 px.
