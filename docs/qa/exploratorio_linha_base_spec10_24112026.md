# QA explorador — Linha de base da SPEC-10 (F0): o app inteiro com a casca da Fase 1
**Branch:** `feature/spec-10-identidade` (`00e0861`, develop `418d941` + PR #216) · **Tela(s):** `/login`, `/`, `/reservas`, `/reservas/:id` (resumo e conta), `/reservas/nova`, `/reservas/:id/comprovante`, `/hospedes`, `/hospedes/:id`, `/hospedes/novo`, `/quartos`, `/quartos/:id/editar`, `/quartos/categorias`, `/quartos/categorias/nova`, `/comanda`, `/comanda/:id` (suíte e mesa), `/indicadores`, `/config/usuarios` · **Data:** 24/11/2026 · **Papéis usados:** ADMIN (`admin@qa.test`), RECEPTIONIST (`recepcao@qa.test`), WAITER (`garcom@qa.test`); reserva do hotel vizinho pela URL
**Viewports:** 360×800 (toque), 800×1280 (toque), 1280×800 (mouse), 1280×800 com toque (R-3), 640×400 e 800×450 com escala 2 (zoom de 200% em 1280×800 e 1600×900) · **Achados no escopo:** 11 (🔴 0 · 🟡 1 · 🟢 10) · **Já conhecidos (não contam):** 4 · **Repassados:** 0

## Ambiente
- Ambiente do `scripts/qa_explorador_ambiente.sh` já no ar (tela `:5173`, backend `:3000`, banco `gestao_hotel_qa`), pasta de estado `/tmp/gesway-qa-explorador-534648379`. Não rodei `subir` nem `parar`.
- **O analytics-service não sobe nesse ambiente** (o script zera o RabbitMQ e o proxy `/api/analytics` não tem destino). Por isso todo `/api/analytics/*` responde 500: os Indicadores e os números e alertas do Hoje aparecem **no estado de erro** nas capturas. Para a linha de base isso é útil (o estado de erro fica registrado), mas as fases F3 e F7 vão precisar de uma captura com dados num ambiente com o analytics (o compose).
- **Dados que criei no banco QA:** três produtos pela API (`Água mineral` R$ 4,50, `Refrigerante lata` R$ 7,00, `Pão de queijo` R$ 9,90), porque o cardápio vinha vazio e sem ele não dava para lançar na comanda. Pela tela: check-in de "Carla Chegada" (quarto 103) e um lançamento de "Água mineral" na Mesa 1. O nome do hotel virou "Pousada Recanto das Águas Claras do Vale Encantado da Serra" para testar a R-6 e **voltou para "Hotel QA"** logo depois.
- **Ordem das capturas:** as 3 larguras de todas as telas saíram **antes** do check-in e dos produtos (Carla aparece como "Pendente"). As telas de comanda com produto (`comanda-*`) foram refeitas depois de criar os produtos; as `contas*` não mudam com isso.
- **Atenção ao comparar capturas de página inteira (`fullPage`) no celular:** a barra de baixo é `fixed`, e na captura de página inteira ela aparece no meio da imagem (na altura da janela de 800 px), por cima do conteúdo. Isso é artefato da captura, não defeito. A prova de que ela não cobre nada no uso real está em `casca_fim-da-rolagem_360.png` e nas medidas abaixo.
- **Data nos `<input type="date">`:** o Chromium sem interface mostra `11/24/2026` (mês/dia) mesmo com o contexto em `pt-BR`, porque o controle nativo segue o idioma do navegador, não o da página. Num Chrome em português aparece `24/11/2026`. Não é achado; nas comparações das fases, use o mesmo navegador.

## Veredito
**APROVADO COM RESSALVAS.**

**A casca da Fase 1 não tem 🔴 nem 🟡.** O que ela promete funciona nas três larguras, no zoom de 200% e só com teclado:
- **Nenhuma rolagem lateral** em nenhuma das 75 combinações de papel × tela × largura, nem com zoom de 200% (`medidas.json`, `lateral = 0` em todas).
- **Teclado:** o 1º Tab mostra "Pular para o conteúdo"; o Enter leva o foco ao `main`, e o Tab seguinte cai na 1ª ação da tela ("Nova reserva"). Ordem do Tab: atalho → logo → Hoje → Reservas → Hóspedes → Quartos → Comanda → Indicadores → Sair → conteúdo. O item ativo tem `aria-current="page"`. O anel de foco na barra esmeralda (`#a7f3d0`) dá 4,3:1 sobre `#047857` e 6,1:1 sobre o item ativo; o do "Sair" é da marca (6,6:1 sobre a faixa).
- **Contraste da barra** (calculado com as cores dos tokens): texto 5,2:1, rótulo de grupo e papel 4,8:1, item ativo branco sobre `#035e44` 7,8:1. Tudo acima de 4,5:1.
- **Alvo de toque (R-3):** com toque, os itens da barra lateral e o "Sair" têm 48 px no tablet de 800 e em 1280 com toque (`pointer: coarse`); com mouse em 1280, 40 px e 36 px. As abas de baixo têm 72×48 no celular.
- **Celular:** o usuário aparece no topo ("Admin QA · Administrador"), não no pé; o "Mais" abre a folha com o foco no 1º item, o Esc fecha e devolve o foco ao "Mais", o toque no fundo fecha, e navegar por um item do "Mais" fecha a folha e acende o "Mais".
- **Nada da casca cobre conteúdo:** no fim da rolagem da conta (360), o último texto termina em 695 px e a barra começa em 745. Na comanda sem rede, o total fixo termina exatamente onde a barra começa (745 px).
- **Área segura:** o `index.html` tem `viewport-fit=cover`, e a barra de baixo calcula `padding-bottom: 6px` (o piso do `max(6px, env(...))`). O efeito no iPhone com entalhe não dá para ver no Chromium (ver "Não foi possível testar").
- **Fluxos pela casca nova:** check-in completo no Hoje (pede confirmação, avisa "Check-in de Carla Chegada feito. O quarto passou a ocupado.", a Carla passa para "Na casa") e lançamento na comanda **sem rede** (faixa "Sem conexão…", item "Aguardando envio", total "inclui R$ 4,50 na fila"; na volta da rede, **um** POST só e o total certo, R$ 14,40).
- **Papéis e outro hotel:** o garçom que abre `/reservas` volta para `/comanda`; a recepção que abre `/indicadores` volta para o Hoje; a reserva do hotel vizinho dá "Reserva não encontrada" (404 na API, nada vaza). Depois do "Sair", abrir `/reservas` leva ao login.

A ressalva é um 🟡 **anterior à SPEC-10**, no componente base (`Button` do `@hotel/ui`): o anel de foco dos botões secundário e ghost fica abaixo de 3:1. Vai para a F2.

## Achados no escopo

### 🟡 [Teclado/Acessibilidade — F2] O anel de foco dos botões `secondary` e `ghost` do `@hotel/ui` fica abaixo de 3:1
**Onde:** `frontend/packages/ui/src/Button.tsx:16-17` (`focus-visible:ring-gray-400` no secondary, `ring-gray-300` no ghost). Aparece em toda tela: "Hoje" e "Próximos 30 dias" em `/reservas`, "Tentar de novo" no Hoje e nos Indicadores, "Cadastrar novo hóspede" em `/reservas/nova`, as abas "Resumo" e "Conta" do detalhe da reserva (ghost).
**Passos:** 1. Entrar como admin em 1280×800 e abrir `http://localhost:5173/reservas`. 2. Apertar Tab 11 vezes (o foco chega ao botão "Hoje" do filtro de período). 3. Comparar com o "Próximos 7 dias" (primário) ao lado.
**Esperado:** foco visível com contraste ≥ 3:1 contra o fundo (SPEC-10 §10.6: "borda, foco e ícone com função ≥ 3:1"; critério do time "foco sempre visível"; WCAG 1.4.11).
**Obtido:** o anel do secondary é `#9ca3af` sobre branco: **2,5:1** (2,3:1 sobre o fundo areia). O do ghost é `#d1d5db`: **~1,5:1**. Na captura, o "Hoje" focado tem só uma borda cinza fina, fácil de perder; nas abas "Resumo"/"Conta" é pior. Com mouse não aparece (é `focus-visible`), então quem sofre é quem opera o balcão pelo teclado.
**Evidência:** `evidencias/linha_base_spec10_24112026/casca_foco-secundario_1280.png` (o "Hoje" focado ao lado do primário); `foco_secundario.mjs` reproduz e lista os botões ghost da conta (`["Resumo","Conta"]`); `casca_saida.txt` passos 11 e 13 (a sombra do foco sai `rgb(156, 163, 175)`).
**Não é regressão da Fase 1:** o `Button.tsx` não mudou nesta branch. Não achei registro disso nas pendências da SPEC-05/SPEC-10 nem nos relatórios do `qa-redteam` (o da Fase 1 tratou só o anel do "Sair").
**Sugestão:** na F2, trocar os dois anéis por `ring-brand` (6,6–7,7:1), como o "Sair" já faz por cima do ghost.

### 🟢 [Casca] Com a folha "Mais" aberta, o fundo escurecido continua rolando e o Tab sai da folha
**Onde:** celular 360, botão "Mais" da barra de baixo (`AppShell.tsx`, `MobileTabs`).
**Passos:** 1. Admin, 360×800 com toque, `/reservas`, rolar um pouco. 2. Tocar em "Mais". 3. Rolar com o dedo (ou a roda) em cima do fundo escuro. 4. Com teclado, Tab duas vezes.
**Obtido:** `scrollY` passou de 300 para 400 com a folha aberta (`body overflow: visible`); o Tab saiu de "Indicadores" para "Hoje", "Reservas"… da barra de baixo, com a folha ainda aberta. **Quem ganha:** a recepcionista no celular que rola sem querer e perde onde estava. O fundo escuro diz "isto é modal", mas a folha se comporta como não modal. É escolha de projeto, não quebra regra escrita.
**Evidência:** `casca_saida.txt` (bloco C), `casca_mais-aberto_360.png`.
**Sugestão:** travar a rolagem do `body` enquanto a folha estiver aberta e fechar a folha quando o foco sair dela.

### 🟢 [Casca] Com a folha "Mais" aberta, duas abas aparecem como "você está aqui"
**Onde:** barra de baixo no celular. Em `/reservas`, ao abrir o "Mais", a aba "Reservas" e o "Mais" ficam ambas com o fio de 3 px e a cor da marca.
**Quem ganha:** quem olha a barra de relance (garçom e recepção no celular): o fio deveria marcar um lugar só. **Evidência:** `casca_mais-aberto_360.png`. **Sugestão:** no "Mais" aberto, usar só `aria-expanded` e um fundo, sem o fio; o fio fica para "estou numa tela do Mais" (`inMore`).

### 🟢 [Casca] O garçom recebe uma barra lateral de 236 px (tablet) e uma barra de baixo (celular) com um item só
**Onde:** `/comanda` como WAITER, 800×1280 e 360×800.
**Obtido:** no tablet, a barra lateral ocupa 236 de 800 px para mostrar só "Comanda" (o conteúdo fica com 564 px); no celular, a barra de baixo gasta 55 px de altura com uma aba que leva à tela em que ele já está. **Quem ganha:** o garçom (DESIGN_PMS §1, uma mão livre): no tablet, a lista de produtos ganharia ~40% de largura; no celular, 55 px de cardápio. **Evidência:** `contas-garcom_800.png`, `comanda-mesa-garcom_800.png`, `comanda-mesa-garcom_360.png`. **Sugestão:** decidir na F6 se o papel com um destino só dispensa a navegação (o "Sair" e o nome já estão no topo).

### 🟢 [Casca/R-6] Nome do hotel cortado com "…" sem jeito de ler o nome inteiro
**Onde:** topo, 360 e 800 (em 1280 o nome coube).
**Passos:** nome do hotel com 59 caracteres (trocado pela API e restaurado depois), entrar como recepção.
**Obtido:** o nome corta com "…" e o topo não quebra (R-6 cumprida, 65 px de altura); mas o elemento não tem `title`, ao contrário do nome do usuário no pé da barra. **Evidência:** `casca_nome-longo_360.png`, `casca_nome-longo_800.png`, `nome_longo.mjs`. **Sugestão:** `title={tenant?.name}` no nome do hotel, como no do usuário.

### 🟢 Fase futura — F2 (componentes base)
- Botões de cabeçalho de lista com dois tamanhos: "Nova reserva" tem 48 px e o "Novo quarto" é compacto (36 px) em 1280 (`reservas_1280.png` × `quartos_1280.png`).
- Os "Tentar de novo" são botões cinza grandes dentro de caixas brancas com texto vermelho, repetidos até 6 vezes por tela (`indicadores_1280.png`), num visual que não conversa com a casca nova.
- A faixa de erro de "Reserva não encontrada" usa vermelho sobre rosa com fio à esquerda, estilo diferente do `ErrorState` das outras telas (`reserva-outro-hotel_1280.png`).

### 🟢 Fase futura — F3 (Hoje)
- O conteúdo ocupa toda a largura (até 1440 px), enquanto o detalhe da reserva e a comanda ficam numa coluna centralizada mais estreita: ao trocar de tela, o miolo "pula" de largura (`hoje_1280.png` × `reserva-conta_1280.png`). Ligado à R-7, já conhecida (ver abaixo).
- Sem o analytics, o erro da ocupação ocupa um bloco inteiro acima dos 5 cartões, que ficam com "—"; e o bloco "Em limpeza" mostra o erro dos **alertas** (ele lê a lista de faxina do analytics, `TodayPage.tsx:205`). **Pergunta ao dono (Gabriel):** a recepção perder a lista de quartos em limpeza quando o analytics cai é intencional? O status do quarto está no core.
- Durante o carregamento (os ~7 s de novas tentativas da consulta), os cartões mostram "—" sem indicar que estão carregando (`casca_zoom200-640x400_hoje.png`, sem erro ainda).

### 🟢 Fase futura — F4 (reserva, conta, nova reserva)
- Detalhe e conta numa coluna centralizada que não alinha com o "Hotel QA" e o "Sair" do topo (R-7, já conhecida).
- As três ações ("Fazer check-in", "Fazer check-out", "Cancelar reserva") aparecem lado a lado, duas desabilitadas em cinza com o motivo embaixo; em 360 viram uma coluna longa (`reserva-conta_360.png`).
- Nova reserva: o "Confirmar reserva" desabilitado é verde lavado (marca a 50%) e o "Voltar à lista" é um botão cinza no lugar onde as outras telas têm o botão principal (`reserva-nova_1280.png`).

### 🟢 Fase futura — F5 (listas e formulários)
- Reservas no celular: hóspede e datas empilhados em 4 linhas por reserva (nome em 2 linhas, data, seta, data), com o valor escondido (`reservas_360.png`). Cabem ~5 reservas por tela.
- Hóspedes: o link do nome tem 17 px de altura (a linha inteira abre com o toque, mas só o nome é foco de teclado), e a coluna CPF mostra "—" para todos (`hospedes_360.png`).
- Quartos e Categorias usam abas sublinhadas; Reservas usa botões de filtro preenchidos — dois padrões para o mesmo papel de "filtro do topo".

### 🟢 Fase futura — F6 (comanda)
- A faixa do total é branca, de borda a borda da coluna, e passa um pouco das laterais do conteúdo; sobre o fundo areia ela parece um corpo estranho (`comanda-admin_1280.png`, `comanda-mesa-garcom_800.png`).
- Os produtos são cartões cinza-claro sem borda; com nome comprido, o item lançado quebra em 2 linhas ao lado do campo de quantidade ("Água / mineral", `fluxo_comanda-sem-rede_360.png`).
- O topo do garçom mostra "Gesway" no lugar do hotel (decisão conhecida, ver abaixo), e o cabeçalho da conta repete "Mesa 1 / Mesa".

### 🟢 Fase futura — F7 (Indicadores e administração)
- Sem o analytics, o erro de "ocupação" aparece duas vezes (cartão "—" + bloco de erro) e o de "receita" também (`indicadores_1280.png`).
- O período "De/Até" com "Aplicar período" fica solto entre dois blocos, fora de um cartão.
- `/config/usuarios` (só por URL, não está no menu) mostra texto de desenvolvedor: "Tela prevista para Fase 1 — Configurações. A fundação (auth, rotas por papel, cliente de API tipado e design system) já está no ar." (`usuarios_1280.png`). Se a banca cair nessa URL, o texto confunde, e a "Fase 1" dele não é a Fase 1 da SPEC-10.

### Já conhecidos (não contam)
| O quê | Onde está registrado |
|---|---|
| `Input` do `@hotel/ui` com 42 px no toque (busca de hóspedes, formulário de hóspede, busca da nova reserva) | `docs/qa/redteam_t051-quartos-categorias_21out2026.md:126`; também `exploratorio_login-comanda-indicadores_22112026.md:103` |
| Em janela baixa (< 560 px de altura, ex.: 1600×900 com zoom de 200% = 800×450), o usuário no pé da barra só aparece rolando a barra (pé em y = 496 px numa janela de 450) | `docs/qa/redteam_spec10-fase1-casca_22nov2026.md:26` e tabela de respostas (linha 85) |
| Telas com `max-w` próprio não alinham com o topo de 1440 px (R-7) | `redteam_spec10-fase1-casca_22nov2026.md:31`, "decisão 2 do plano" (linha 86) |
| O garçom vê "Gesway" no topo, não o nome do hotel | `frontend/apps/pms/src/features/tenant/queries.ts` (comentário de `TENANT_READERS`, avaliação simulada de 15/11) |

## Melhorias de uso (🟢)
Os 10 🟢 estão acima: 4 da casca (folha "Mais" com rolagem e Tab; duas abas ativas; navegação do garçom com um item; nome do hotel sem `title`) e 6 de fase futura, um por fase (F2–F7).

## Repassados a outro dev
| Sev. | Achado | Onde | Dono | Repasse |
|---|---|---|---|---|
| — | Nenhum. Tudo o que achei cai em fases do próprio plano da SPEC-10 (o Sirlande implementa; o dono da tela revisa, §10.5). A pergunta da F3 ("Em limpeza" depende do analytics) está no achado e é para o Gabriel responder na revisão da F3. | | | |

## Mapa das fases
O que cada fase encontra hoje, e as capturas de referência (todas em `docs/qa/evidencias/linha_base_spec10_24112026/`, nome `<tela>_<largura>.png`, larguras 360, 800 e 1280).

| Fase | O que a tela mostra hoje (com a casca da Fase 1) | Capturas de referência |
|---|---|---|
| **Fase 1 (casca, já feita)** | Barra esmeralda com OPERAÇÃO/GESTÃO (a recepção e o garçom só têm OPERAÇÃO), item ativo escuro com fio menta, usuário no pé; topo com faixa verde→areia, hotel à esquerda e "Sair" à direita; no celular, logo + hotel + "usuário · papel" no topo e barra de baixo com 5 abas (admin/recepção) ou 1 (garçom) | `casca_foco-menu_1280`, `casca_atalho_1280`, `casca_mais-aberto_360`, `casca_mais-ativo_360`, `casca_fim-da-rolagem_360`, `casca_zoom200-640x400_{hoje,reserva-conta}`, `casca_zoom200-800x450_{hoje,reserva-conta}`, `casca_nome-longo_{360,800,1280}`, `login_*` |
| **F2 — componentes base** | Botão primário `#065f46`; secundário cinza `gray-100` com anel de foco fraco (🟡); ghost sem borda; `Input` de 42 px no toque; `ErrorState` com texto vermelho e botão cinza; dois tamanhos de botão no cabeçalho das listas | `casca_foco-secundario_1280`, `reservas_*`, `quartos_*`, `indicadores_*`, `reserva-outro-hotel_*` |
| **F3 — Hoje** | Título + data; 5 cartões de número (4+1 em 800, 1+2+2 em 360); Atenção; Chegadas/Saídas/Na casa/Em limpeza em 2 colunas (1 no celular). Altura da página: 1818 px em 360, 1550 em 800, 995 em 1280. Nas capturas, ocupação e alertas em erro (sem analytics) | `hoje_*` (admin), `hoje-recepcao_*`, `fluxo_checkin-confirmacao_1280` |
| **F4 — reserva, conta e nova reserva** | Cabeçalho com nome, status (ponto + rótulo), quarto, datas e saldo; ações com o motivo de bloqueio embaixo; abas Resumo/Conta; formulário de pagamento com 4 meios; extrato com valor e saldo por linha; nova reserva em 3 passos + resumo lateral (em 1280) | `reserva-detalhe_*`, `reserva-conta_*`, `reserva-nova_*`, `comprovante_*` |
| **F5 — listas e formulários** | Reservas (filtro de período + tabela; no celular sem coluna de valor), Hóspedes (busca + tabela nome/CPF), Quartos e Categorias (abas + tabela com status), formulários de hóspede, quarto e categoria numa coluna | `reservas_*`, `hospedes_*`, `hospede-detalhe_*`, `hospede-novo_*`, `quartos_*`, `quartos-recepcao_*`, `quarto-editar_*`, `categorias_*`, `categoria-nova_*` |
| **F6 — comanda** | Lista de contas abertas com busca e "Abrir conta"; conta com itens, chips de categoria (Tudo/Bebidas/Comidas), cartões de produto e total fixo em faixa branca acima da barra; faixa âmbar "Sem conexão…" com item "Aguardando envio" | `contas_*`, `contas-garcom_*`, `comanda-admin_*`, `comanda-frigobar-garcom_*`, `comanda-mesa-garcom_*`, `fluxo_comanda-cardapio_360`, `fluxo_comanda-sem-rede_360`, `fluxo_comanda-rede-voltou_360` |
| **F7 — Indicadores e administração** | 4 cartões (Ocupação, ADR, RevPAR, Recebido hoje), receita por mês (6/12/24 meses), sazonalidade, período De/Até, receita por categoria, meios de pagamento, hóspedes frequentes — tudo em erro nas capturas (sem analytics). Altura: 1923 px em 800, 1517 em 1280. Usuários é só um aviso de "tela prevista" | `indicadores_*`, `indicadores-recepcao_*` (a recepção é mandada para o Hoje), `usuarios_*` |

Telas de papel errado, para conferir que o bloqueio continua depois de cada fase: `garcom-abre-reservas_*` (vai para `/comanda`), `indicadores-recepcao_*` (vai para `/`), `reserva-outro-hotel_*` (não encontrada).

**Medidas para comparar** (`medidas.json` e `medidas_refeitas.json`, por tela e largura): altura da página, rolagem lateral, alvos < 44 px em largura de toque, erros de console e respostas ≥ 400. Linha de base: rolagem lateral 0 em todas; alvos pequenos só em `reserva-detalhe` (link do nome do hóspede no cabeçalho, 17 px), `reserva-nova` (busca, 42 px), `hospedes` (busca 42 px + 5 links de 17 px) e `hospede-novo` (4 campos de 42 px); erros de console só os 500 do analytics e os 404 da reserva do outro hotel.

## Mapa de cobertura
| Eixo (§3) | Tentado? | Como | Resultado |
|---|---|---|---|
| Entrada | Parcial | Nome do hotel com 59 caracteres no topo | Corta com "…" sem quebrar; sem `title` (🟢). Valores de dinheiro não estressados (fora do foco da linha de base) |
| Tempo | Não | — | Fora do foco (pedido: só confirmar que a casca não quebrou fluxos) |
| Rede | Sim | `comanda_offline.mjs`: `setOffline(true)`, toque em produto, `setOffline(false)` | Fila honesta, total com "na fila", 1 POST na volta da rede. Sem analytics, o Hoje e os Indicadores mostram erro com "Tentar de novo" |
| Sessão e papéis | Sim | Garçom em `/reservas`, recepção em `/indicadores`, admin na reserva do hotel vizinho, "Sair" e reabrir `/reservas` | Redireciona; 404 sem vazamento; logout leva ao login |
| Tela | Sim | 360×800, 800×1280, 1280×800, 1280 com toque, zoom 200% (640×400 e 800×450 com escala 2) | Sem rolagem lateral; casca não cobre conteúdo; pé da barra fora da janela baixa (já conhecido) |
| Teclado | Sim | Tab do início em `/reservas` (14 passos), atalho + Enter, Enter num item do menu, Tab e Esc na folha "Mais" | Ordem certa, foco visível na barra; anel fraco no secondary/ghost (🟡) |
| Leitura | Sim | `browser_snapshot` do Hoje (recepção) | `complementary`, `navigation "Menu"` com `group` por seção, `banner`, `main`, `aria-current`, `aria-expanded` no "Mais"; aviso do check-in em `status` e erros em `alert` |
| Estados | Parcial | Erro (analytics fora), vazio ("Nenhuma saída hoje", "Nenhuma chegada" depois do check-in), dados | Erro e vazio com próximo passo; carregamento do Hoje só com "—" (🟢 F3) |
| Domínio | Parcial | Check-in pelo Hoje; lançamento offline na comanda | Confirmação antes do check-in, status e listas atualizam; total R$ 9,90 + R$ 4,50 = R$ 14,40 |
| Contraste | Sim | Cálculo com as cores dos tokens (`tokens.css`) | Barra e topo ≥ 4,8:1 no texto e ≥ 4,3:1 no anel; anel do secondary 2,5:1 e do ghost ~1,5:1 (🟡) |

## Não foi possível testar
- **Área segura real (entalhe e barra de gestos do iPhone):** o Chromium devolve 0 para `env(safe-area-inset-*)`. Conferi só a meta `viewport-fit=cover` e o piso de 6 px calculado. Precisa de um iPhone ou do simulador do Safari.
- **Indicadores e números do Hoje com dados:** o analytics-service não sobe no ambiente do `qa_explorador_ambiente.sh`. As capturas da F3 e da F7 com dados precisam do compose.
- **Tablet deitado com `pointer: coarse` de verdade:** o Playwright não emula a media query `pointer` diretamente; o contexto com `hasTouch` em 1280 saiu `pointer: fine = false` e mostrou 48 px, o que bate com a R-3, mas não é um aparelho real.
- **Tema escuro e movimento reduzido:** não tentei; o app não tem tema escuro, e o movimento da casca é só o `transition-colors` do hover e o atalho (já com `motion-reduce`).
- **Tempo (duplo clique, duas abas) e entrada de dinheiro:** fora do pedido desta linha de base.

## Comandos rodados pelo Bash
```
cd /home/sirla/faculdade/TCC/wt-integracao && git branch --show-current && git log --oneline -3; ls docs/specs/ | grep -i 10; ls docs/qa/ | tail -20; cat /tmp/gesway-qa-explorador-534648379/ambiente.env; python3 -c "<imprime dados.json>"
cd /home/sirla/faculdade/TCC/wt-integracao && grep -n "^#\|R-[0-9]" docs/specs/SPEC-10-identidade-visual.md | head -120; wc -l ...; ls -t docs/qa/exploratorio* | head -3
sed -n 226,346p docs/specs/SPEC-10-identidade-visual.md; grep -rln "R-10\b\|R-3 " docs/ frontend/*.md
grep -n "R-[0-9]*\b" docs/specs/anexos/SPEC-10-estudo-responsividade.md; grep -n "🔴\|🟡\|🟢\|pend" docs/qa/redteam_spec10-fase1-casca_22nov2026.md
grep/sed de leitura em frontend/apps/pms/src (App.tsx, AppShell.tsx, LoginPage.tsx, tenant/queries.ts, accounts/*.tsx, today/TodayPage.tsx), packages/ui/src (Button.tsx, Input.tsx, tokens.css), services/core-service/routes (router.js, tenantRouter.js, productRouter.js), scripts/qa_explorador_ambiente.sh, apps/pms/index.html
curl -X POST localhost:3000/api/auth/login (404: rota errada) e GET localhost:3000/api/{guests,rooms,...} (404)
curl -X POST localhost:3000/auth/login (admin@qa.test); GET localhost:3000/{guests,rooms,room-categories,accounts?status=OPEN,users}
curl GET localhost:3000/analytics/occupancy; curl localhost:3001/health; curl localhost:3100/health; ss -ltnp
curl GET localhost:3000/products; curl -X POST localhost:3000/products x3 (1ª rodada recusada: categoria inválida; 2ª criou Água mineral, Refrigerante lata, Pão de queijo)
python3 (cálculo de contraste das cores dos tokens) x2
mkdir -p docs/qa/evidencias/linha_base_spec10_24112026; cat > capturas.mjs; node capturas.mjs <estado>/dados.json   (com set -a; source <estado>/ambiente.env; LD_LIBRARY_PATH=$QA_LD_LIBRARY_PATH)
cat > casca.mjs; node casca.mjs <estado>/dados.json
cat > comanda_offline.mjs; node comanda_offline.mjs <estado>/dados.json; mv <repo principal>/docs/qa/evidencias/fluxo_checkin-confirmacao_1280.png .
cat > foco_secundario.mjs; node foco_secundario.mjs <estado>/dados.json
python3 (acrescenta filtro opcional ao capturas.mjs); node capturas.mjs <estado>/dados.json '^comanda'
curl GET/PUT localhost:3000/tenants/me (nome longo); cat > nome_longo.mjs; node nome_longo.mjs <estado>/dados.json; curl PUT localhost:3000/tenants/me (volta "Hotel QA")
mv <repo principal>/docs/qa/evidencias/{page,console}-2026-11-25* docs/qa/evidencias/linha_base_spec10_24112026/mcp/; git check-ignore -v ...; ls
```
Pelo MCP (navegador): login da recepção em 1280, snapshot do Hoje, check-in da Carla com confirmação, "Sair" e reabrir `/reservas`.
