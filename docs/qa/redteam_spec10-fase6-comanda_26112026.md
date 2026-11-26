# QA Red Team — SPEC-10, F6 (comanda: `/comanda` e `/comanda/:id`)
**Branch:** feature/t10-fase6-comanda · **Dev:** Sirlande · **Base:** feature/spec-10-identidade@ec851b8 · **HEAD:** 10fb4a5 · **Data:** 26/11/2026
**Arquivos auditados:** 8 (diff `origin/feature/spec-10-identidade...HEAD`, 4 commits; nada fora de commit na worktree)
**Achados no escopo:** 6 (🔴 0 · 🟡 2 · 🟢 4) · **Repassados:** 1

## Veredito
APROVADO COM RESSALVAS

Não há 🔴. O diff não toca em `services/`, em rota nem em contrato de API. Nenhum dado pessoal novo aparece em `aria`, `title` ou log. As proteções de comportamento da comanda continuam no lugar: fila offline, desfazer de 5 s, campo de quantidade, trava de 400 ms no fechamento e Receber. Conferi isso no ambiente vivo. Os dois 🟡 são de leiaute e foram medidos no compose `gesway_integracao`. O primeiro aparece na hora em que o garçom confere o que tocou: a linha de desfazer quebrada perde o nome do produto dentro da caixa de altura fixa. O segundo aparece entre 1024 e cerca de 1100 px com a barra lateral: a coluna do cardápio fica estreita demais.

Rodado na worktree:
- `tsc --noEmit` em `apps/pms` passou limpo.
- `vitest run` em `apps/pms`: 69 arquivos e 713 testes verdes.
- `scripts/qa_checks.sh` não trouxe aviso novo nas regras 9a, 9b e 9c. Os 4 avisos que aparecem são de fora de `features/accounts/`.

Ao vivo, com Playwright headless em `http://localhost:5173`, usei admin e garçom em 360, 375, 390, 700, 768, 1024, 1100, 1280 e 1366 px. Os lançamentos de teste foram feitos na conta "E2E Mesa 193440" e todos foram desfeitos dentro da janela. Pela API, a conta continua só com a Caipirinha do e2e. Capturas em `docs/qa/evidencias/spec10_fase6_comanda_26112026/redteam/`.

## Achados no escopo

### 🟡-1 [UX / comanda] Na janela de desfazer, abaixo de 640 px, a linha de cima mostra quantidade e "Desfazer" sem o nome do produto
**Onde:** `frontend/apps/pms/src/features/accounts/components/ItemList.tsx:144` (`flex-wrap` quando `wrap`) e `:254` (`basis-full` no nome), dentro da caixa de altura fixa de `:220` (`h-44`, 176 px). A caixa rola até o fim a cada toque, em `:187-190`.
**Cenário:** o garçom, a 390 px, toca em "Água mineral" duas vezes e depois em "Cerveja long neck". Cada linha da janela passa a ter **113 px**: nome e "Aguardando envio" numa linha, campo e "Desfazer" na de baixo. Sem quebra (700 px), a linha tem 65 px. A caixa de 176 px rola até o fim. A linha de cima fica cortada e mostra só `[ 2 ]  Desfazer 1 (5 s)`, sem dizer de que produto é (`redteam/garcom_wrap_390.png`). Antes, com o nome ao lado dos controles, todo controle visível vinha com o nome na mesma linha. Agora o garçom vê um "2" e um "Desfazer 1" órfãos. Para saber de quem são, ele precisa rolar uma caixa pequena, com o relógio de 5 s correndo. Se mexer no campo ou no Desfazer achando que é outra linha, o item errado muda de quantidade, e isso vira cobrança errada se ninguém reparar. Durante a janela, a caixa também mostra cerca de 1,5 linha, contra cerca de 2,5 antes (§10.6: "a densidade não cai"). A medida de densidade da fase (`medidas.json`) não cobre esse estado: o antes não tem captura da janela de desfazer.
**Regra violada:** SPEC-10 §10.6 (densidade) e a regra do app do garçom de conferir o que tocou, que foi o motivo da própria mudança.
**Correção sugerida:** o menor ajuste é a rolagem do toque alinhar a caixa ao **topo** da linha tocada (`scrollTop = row.offsetTop`), e não ao fim. Assim, a parte visível de cada linha começa pelo nome. Outro caminho é tirar o "Aguardando envio" de baixo do nome e pô-lo à esquerda da linha dos controles, o que reduz a linha a uns 90 px e deixa a segunda linha com contexto. Vale um teste que ao menos fixe o `basis-full` só com `undoable`.

### 🟡-2 [UI / lg com barra lateral] Entre 1024 e cerca de 1100 px, a coluna do cardápio fica com 284 px: as categorias vazam da coluna e os nomes dos produtos se cortam
**Onde:** `frontend/apps/pms/src/features/accounts/AccountPage.tsx:116` (`lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]`), com `components/MenuGrid.tsx:59` (`sm:grid-cols-3` é breakpoint da **janela**, não da coluna) e o `sm:inline-flex sm:w-auto` do `SegmentedControl` (`packages/ui/src/SegmentedControl.tsx:32`).
**Cenário:** o admin abre a Mesa 3 num notebook ou iPad na horizontal, com 1024 px. A barra lateral ocupa 236 px, a coluna da conta 416 px e o espaço entre as colunas 24 px. Sobram 284 px para o cardápio. Medido ao vivo:
- O controle de categorias, que no `sm+` tem a largura natural, termina em x=1017. A grade de produtos termina em 992. O controle passa 25 px da coluna e entra no respiro da página (`redteam/admin_mesa_1024.png`).
- Com a quinta categoria, "Outros" (simulei clonando o botão no DOM, com as mesmas classes), ele termina em x=1086. A página ganha 62 px de **rolagem lateral** e "Outros" fica fora da tela (`redteam/cinco_1024.png`). O seed tem só 4 categorias, por isso o roteiro não mostra isso. Um hotel real com produto `OTHER` mostra.
- Três colunas de cerca de 89 px cortam os nomes em "Cerveja long…", "Água miner…" e "Porção de…". Esse é o mesmo corte que o 🟢-4 do QA de 24/11 eliminou na lista de itens. "Refrigerante" e "Lavanderia" passam da borda do botão.
- No Receber, "Cartão de débito" e "Cartão de crédito" quebram em três linhas (`redteam/admin_receber_1024.png`).

Antes, em coluna única de 576 px, os nomes cabiam inteiros. A 1366 px fica bom (`redteam/admin_mesa_1366.png`). O §10.6 só mede 390, 768 e 1366 e por isso deixa esse caso passar.
**Regra violada:** SPEC-10 §10.6 (densidade e legibilidade) e `DESIGN_PMS.md`. A tela não pode criar rolagem lateral.
**Correção sugerida:** abrir as duas colunas no `xl` (1280 px) em vez do `lg`. Outro caminho é manter o `lg` e mudar três coisas no cardápio quando ele estiver na coluna: `lg:grid-cols-2 xl:grid-cols-3`, o `SegmentedControl` com `w-full` também no `sm+` (por `className`, ou `overflow-x-auto` no invólucro) e a coluna da conta mais estreita no `lg` (`minmax(0,22rem)`).

### 🟢-1 [A11y / ordem] No lg, o Tab vai dos itens (esquerda) ao cardápio inteiro (direita) e só depois volta ao total (esquerda, embaixo)
**Onde:** `AccountPage.tsx:116-148`. A ordem do DOM é itens, cardápio, total. A grade reposiciona o total para `col-start-1 row-start-2`.
**Cenário:** medido a 1366 px: "Itens lançados", as 4 categorias, os 9 produtos e só então "Receber", "Ver conta" e "Fechar conta". São 13 Tabs entre a lista e o "Receber", que fica visualmente logo abaixo dela. Não é falha da WCAG 2.4.3: a sequência é a mesma de antes e preserva o sentido. O leitor de tela lê na ordem do DOM, que é coerente. O que se perde é a correspondência entre a ordem visual e a do foco, que antes existia porque o total ficava visualmente embaixo do cardápio. O comentário de `:114-115` assume o custo de propósito. Fica registrado.
**Correção sugerida:** nada obrigatório. Se incomodar quem opera o balcão com teclado, um link "Ir para o total" no fim da lista resolve, ou a ordem do DOM pode mudar só no `lg`, renderizando o rodapé duas vezes com `hidden lg:block` / `lg:hidden`. Essa segunda saída custa duplicar ids (`close-blocked-reason`, `receive-blocked-reason`) e não compensa.

### 🟢-2 [UI / 360 px] Com cinco categorias, o controle não tem folga a 360 px e vaza a 320 px
**Onde:** `components/MenuGrid.tsx:52-54`. O comentário diz que "no máximo cinco opções dividem a largura".
**Cenário:** com a quinta categoria simulada, a largura mínima dos botões soma 332 px mais 6 px de moldura, para 328 px úteis a 360 px. "Outros" encosta na borda da moldura (`redteam/cinco_360.png`). A 320 px a página rola 31 px para o lado. Como palavra inteira não quebra, a promessa do comentário só vale até 360 px, e mesmo ali no limite.
**Correção sugerida:** `overflow-x-auto` no grupo, ou o rótulo "Tudo" com `px-1`. Pelo menos, ajustar o comentário para o limite real.

### 🟢-3 [Texto] `accountContext` não equipara hífen e espaço: "Day use piscina" ganha "Day-use" embaixo
**Onde:** `accountFilter.ts:31-36` (`normalize` só tira acento, caixa e espaço das pontas).
**Cenário:** a conta DAY_USE chamada "Day use piscina" ou "Dayuse" não começa por "day-use" e mostra o tipo repetido. O mesmo vale para "Mesa1" (sem espaço) em conta TABLE: o `1` é `\p{N}`, então "Mesa" aparece embaixo. Os casos do enunciado estão certos e têm teste: "Mesanino 2" mostra "Mesa", "  suite 203" não mostra nada e "Piscina, balcão" mostra "Balcão". O problema é só de repetição visual.
**Correção sugerida:** normalizar `[-\s]+` para um espaço antes de comparar, ou aceitar como está.

### 🟢-4 [Testes] O leiaute novo não tem teste que o segure
**Onde:** `AccountPage.tsx:148` (`md:bottom-3 md:mx-0 lg:static`), `ItemList.tsx:144/254` (quebra só na janela).
**Cenário:** o `AppShell.test.tsx:111` confere só o `bottom-[calc(var(--tabbar…` do total. Um refactor que tire o `lg:static`, e com ele o sticky solto ao lado do cardápio, ou que aplique `flex-wrap` a toda linha passa com os 713 testes verdes. Os testes de categoria e tipo não regrediram porque nunca existiram para o clique, só o seletor do e2e (`roteiro.spec.ts:148`), que segue casando com `group "Tipo da conta"` / `button "Mesa"`.
**Correção sugerida:** um teste de classe no estilo do `ReservationsListPage.test.tsx:84` para o total, e um render do `ItemList` com uma entrada `undo` e outra `queued`, conferindo que só a primeira leva `basis-full`.

## Repassados a outro dev

| Sev. | Achado | Onde | Dono | Repasse |
|------|--------|------|------|---------|
| 🟢 | Desfazer a última unidade desmonta o botão focado e o foco cai no `<body>` (é anterior a esta branch) | `ItemList.tsx:282-286` | Sirlande (comanda, fora do diff) | `docs/qa/repasses/para_sirlande_26112026.md` |

## O que foi verificado e está correto
- **Total fixo, ao vivo:** o garçom a 390 px fica com o total a 6 px do pé (`--tabbar:0`). O admin a 390 px fica a 54 px (48 da barra + 6). A 768 px o total vira cartão a `bottom: 12px`, na largura da coluna (268–736), sem a faixa de 54 px que o 🟡-1 da F5 achou na nova reserva. A partir de 1024 px ele fica `static`, embaixo dos itens. A lista tem altura fixa (`h-44`), então o total não desce com ela.
- **O sticky no wrapper novo:** o pai do total passou a ser a grade, que começa abaixo do cabeçalho. Como o total é o último filho, ele continua preso ao pé enquanto a grade está na tela. Não muda nada perceptível.
- **Receber no leiaute novo:** em 390, 768, 1024 e 1366 px o foco vai para o `h2` "Receber". No lg ele fica no topo da coluna 2, à vista. "Esconder pagamento" devolve o foco ao "Receber". Saindo do painel pelo Tab, o próximo foco é o rodapé, por causa da ordem do DOM.
- **Confirmação de fechar:** nas 4 larguras, "Fechar conta" põe o foco em "Voltar", e "Voltar" devolve o foco a "Fechar conta". A trava de 400 ms e o saldo fresco não foram tocados.
- **Campo de quantidade:** com Enter, o foco vai para "Itens lançados" a 390, 360 e 700 px. O `QuantityField` só mudou de invólucro, e a limpeza de desmontagem (`onLostFocus`) continua a mesma.
- **SegmentedControl:** mantém `role="group"` com nome e `aria-pressed` nos botões, como os chips e os botões de antes. Todos são `type="button"`, então nenhum envia o formulário de abrir conta. O ativo tem 6,56:1 (`rgb(6 95 70)` sobre `brand/10`) e o inativo 10,3:1. O ativo também ganha peso (`font-semibold`), então não depende só da cor. O alvo tem 48 px no toque e 36 px só com mouse a partir de 1280 px (`desk`).
- **BackLink compartilhado:** 48 px no toque (`min-h-touch`) e compacto só com `desk`.
- **R-7:** saiu `mx-auto` das 3 ocorrências da comanda, e o teste `uiBase.test.tsx` agora cobre `features/accounts/`.
- **accountContext:** palavra inteira e sem acento: "Mesanino 2" mostra "Mesa", "suite 203" não mostra nada e "E2E Mesa 193440" mostra "Mesa" (conferido ao vivo). Sem `type`, devolve `undefined`.
- **Sem regressão de contrato:** nenhum arquivo de `services/`, de `api-client` ou de rotas no diff.

## Não foi possível verificar
- **Leitor de tela real** (TalkBack, VoiceOver, NVDA). A ordem de leitura foi inferida do DOM e da sequência de Tab.
- **Aparelho real com `safe-area-inset-bottom`** (iPad em modo app). O `md:bottom-3` ignora a folga da barra de gestos, como o `md:bottom-0` de antes já ignorava, então não é regressão.
- **Quinta categoria com dado real:** o seed não tem produto `OTHER`. O 🟡-2 e o 🟢-2 foram medidos com um botão clonado no DOM, com as mesmas classes. É fiel ao leiaute, mas não é o render do React.
- **A janela de desfazer antes da mudança:** não há captura do estado antigo. Os cerca de 2,5 linhas visíveis do 🟡-1 vêm da medida a 700 px (65 px por linha, sem quebra) e da largura do nome ao lado dos controles a 390 px.

## Resolução (26/11, mesma sessão)

Junto com o critique da F6 (`impeccable_critique_spec10-fase6_26112026.md`).

| Achado | O que foi feito | Commit |
|---|---|---|
| 🟡-1 linha de desfazer sem o nome | No celular, o estado ("Aguardando envio") desce para a linha dos controles: a linha cai de 113 para 89 px. Medido em 360 px com dois lançamentos na janela: os dois nomes ficam inteiros na caixa. O "(5 s)" não quebra mais | `f6e62fa` |
| 🟡-2 cardápio de 284 px entre 1024 e 1100 px | As duas colunas passam do `lg` para o `xl` (1280 px). Em 1024 a tela é a coluna do tablet; medido sem rolagem lateral | `f6e62fa` |
| 🟢-1 ordem do Tab no lg | Fica: é a ordem do DOM do celular, que o sticky do total exige. Registrado | — |
| 🟢-2 cinco categorias a 320 px | Fica: o seed não tem `OTHER` e o alvo da SPEC-10 é 360/390 px. Registrado | — |
| 🟢-3 hífen e número no `accountContext` | Hífen vale espaço e número colado ao tipo é o tipo ("Day use piscina", "Mesa1", "Mesa-2"); "Mesanino" continua com "Mesa". Teste | `97399e1` |
| 🟢-4 leiaute sem teste | Fica: os testes de tela renderizam sem CSS; o leiaute foi conferido nas capturas de 390, 768, 1024 e 1366 | — |
