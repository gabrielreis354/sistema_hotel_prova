# SPEC-10 — Identidade visual do Gesway, do login à administração

**Prioridade:** 🟢 Proposta. Bloco opcional, que pode ser implementado ou não
**Estado:** 🟡 T-10.1 (login) na `develop` desde 18/11 (#181). As outras telas têm plano proposto em 18/11 (§10), sem protótipo e sem código
**Responsável:** Sirlande, com agentes de IA. Revisão: Gabriel
**Criado em:** 16/11/2026
**Janela prevista:** 5º semestre (decisão do Sirlande de 16/11). A T-10.1 foi antecipada para antes de 24/11, com a concordância do Gabriel (§9)
**Protótipo:** https://claude.ai/artifact/BiVJWUscsQhiy3GMP2JTzD (canvas com a V2 clara, a escolhida, e a V1 escura, descartada)

---

## 1. Contexto

O visual atual saiu da SPEC-08: fundo cinza-claro, cartões brancos, marca teal escuro (`#115e59`)
e Inter. É correto e acessível, mas genérico. Em especial a tela de login, que é a primeira coisa
que o hotel e a banca veem, é só uma caixa branca com o nome do produto em texto.

| O que se vê hoje | Onde |
|---|---|
| Login sem logo, sem identidade, caixa branca no fundo cinza | `features/auth/LoginPage.tsx` |
| O produto tem logo (GSW com prédio, cama e abajur), mas ele não aparece em lugar nenhum | — |
| A marca teal e o verde do logo são famílias diferentes | `packages/ui/src/tokens.css` |

Caminhos relativos a `frontend/apps/pms/src/`, salvo indicação.

---

## 2. Objetivo

Dar ao Gesway uma identidade visual própria e consistente, da tela de login à de administração,
**sem perder o que o `DESIGN_PMS.md` exige de uma ferramenta operacional**: densidade, leitura
rápida, contraste, alvo de toque e movimento só com função.

**Nada muda em regra de negócio, rota da API ou contrato.**

---

## 3. Decisões do login (16/11, Sirlande)

Tomadas sobre o protótipo, nesta ordem: V1 escura → V2 clara → testes de fundo → otimização.

| Decisão | Escolha | Motivo |
|---|---|---|
| Tema da tela | **Claro** (V2). A V1 escura foi descartada | Mais clareza e leitura; combina com o restante do app, que é claro |
| Logo | **SVG** do logo GSW, em verde-escuro `#065f46`, 134 × 112 px acima do nome | Vetor: nítido em qualquer tamanho, 7 KB. O PNG tinha 69 KB e serrilhava ampliado |
| Nome e frase | `GESWAY` (com `WAY` em verde) e `GESTÃO HOTELEIRA INTELIGENTE` | Identidade da referência do Sirlande |
| Caixa | Vidro claro: branco a 40%, desfoque de 14 px, borda branca suave | "Um pouco mais transparente" que a primeira proposta |
| Luz na borda | Uma linha de luz verde percorre a borda em **11 s** por volta, com halo fixo pulsando | "Luz suave percorrendo em loop", mais lenta que os 7 s da V1 |
| Fundo | **Parado**: tons suaves de verde e areia, com faixas verdes nos cantos | Testados e **descartados** em 16/11: manchas flutuando (versão 6 do protótipo) e luz que acompanha o mouse (versão 9) |
| Botão Entrar | Verde-escuro `#047857` com texto branco, 52 px de altura | Branco sobre verde claro não passa contraste. `#047857` dá 5,5:1 (CA-08.d pede 4,5:1) |
| Senha | Botão de olho para mostrar e ocultar, com `aria-label` e `aria-pressed` | Pedido da referência. Reduz erro de digitação no balcão |
| Subtítulo | "Use o e-mail e a senha que o hotel cadastrou para você." | O "Gestão hoteleira" repetia a frase de cima |
| Movimento reduzido | Com `prefers-reduced-motion`, a luz e o halo ficam parados | `DESIGN_PMS.md` §4 e acessibilidade |

### 3.1 Otimizações exigidas da luz da borda

A primeira versão animava o ângulo do gradiente (`@property`) e desfocava um anel inteiro com
`filter: blur()`: o navegador redesenhava a borda a cada quadro, o tempo todo. A versão aprovada:

- um quadrado com o gradiente **fixo gira** (`transform: rotate`) atrás de uma máscara em anel.
  Girar é composição na placa de vídeo, sem redesenho;
- o halo é uma `box-shadow` que pulsa por `opacity`, também composta na placa de vídeo;
- o vidro usa `backdrop-filter: blur(14px)`, sem `saturate()`, que custava uma passada a mais.
  **Revisto na implementação (§3.2):** o desfoque saiu.

**Troca aceita:** o halo não viaja mais com a luz; só a linha viaja.

### 3.2 O que a implementação mudou do protótipo (T-10.1, 16/11)

Medido no Chromium sem placa de vídeo, com a CPU 4× mais lenta:

| Mudança | Por quê |
|---|---|
| **Vidro sem `backdrop-filter`**, com 55% de branco no lugar de 40% com desfoque | Com o desfoque, a luz e o halo obrigavam o navegador a refazê-lo a cada quadro: 36 a 45 quadros por segundo. Sem ele, 60. O fundo é parado e já é suave, então o resultado visual é o mesmo (comparado lado a lado) |
| Olho da senha com **48 px**, e não 44 | Alvo de toque do projeto (CA-10.g) |
| Regras do login escopadas em `.login-page` | As utilidades do Tailwind entram depois no bundle e venciam: o botão saía teal e com 48 px |

Resultado:
- 60 quadros por segundo;
- pior evento de digitação em 56 ms;
- 390 px sem rolagem lateral;
- movimento reduzido parando tudo.

---

## 4. Escopo

**Dentro:** `frontend/apps/pms`, `frontend/packages/ui` e `frontend/packages/config`.

| Superfície | Estado |
|---|---|
| Login | ✅ Implementado (#181, 18/11) |
| Casca: menu lateral, cabeçalho, barra inferior do celular | 🔲 Sem protótipo |
| Painel Hoje | 🔲 Sem protótipo |
| Listas: Reservas, Hóspedes, Quartos, Contas | 🔲 Sem protótipo |
| Detalhe da reserva e conta | 🔲 Sem protótipo |
| Comanda (celular, garçom) | 🔲 Sem protótipo |
| Administração: Categorias, Indicadores | 🔲 Sem protótipo |
| Formulários: novo e editar hóspede, quarto e categoria; nova reserva | 🔲 Sem protótipo. Faltava nesta tabela (levantamento de 18/11) |
| Comprovante imprimível (`reservas/:id/comprovante`, fora da casca) | 🔲 Sem protótipo. Faltava nesta tabela (levantamento de 18/11) |
| Usuários (`config/usuarios`) | Fora: hoje é só um espaço reservado (`Placeholder`); entra quando a tela existir |

**Fora:**
- `apps/booking` (público), que tem regras próprias de conversão (`DESIGN_PMS.md` §3);
- tema escuro;
- foto de fundo por hotel. Fica como ideia para quando houver upload de imagem do tenant.

---

## 5. Tarefas

Cada tarefa numa branch própria a partir da `develop`, mergeável sozinha.

| Tarefa | Entrega | Branch | Estimativa | Estado |
|---|---|---|---|---|
| **T-10.1** | Login novo (§3) | `feature/t101-login-visual` | 2 a 3 dias | ✅ #181, na `develop` em 18/11 |
| **T-10.2** | Marca: decidir o verde e levar ao `tokens.css` | `feature/t102-marca-verde` | 1 dia + passada visual nas 13 telas | 🔲 |
| **T-10.3** | Símbolo simplificado (GSW com o círculo) no menu e no favicon | `feature/t103-simbolo` | 0,5 dia | 🔲 Depende do arquivo |
| **T-10.4 em diante** | Uma tarefa por superfície da §4, cada uma com protótipo aprovado antes. Ordem, escopo e estimativa no plano da §10 | — | §10 | 🔲 |

### T-10.1 — Login novo

- **Logo:** `docs/specs/anexos/SPEC-10-logo-gesway.svg` (branco, `fill="#fff"`) entra no app. A cor
  vem do token, por `currentColor` num componente ou pela cor no próprio SVG. Não vai como PNG.
- **Cores em token, não literais:** a regra **9b** do `qa_checks.sh` reprova cor literal em
  `features/`. Vidro, luz, halo e fundo do login viram tokens em `packages/ui/src/tokens.css` e
  `packages/config/tailwind-preset.js`.
- **Campos:** continuam `Field` e `Input` de `@hotel/ui` (regra **9a**). O olho da senha nasce
  local em `features/auth/components/` e sobe para o `ui` só no segundo uso (`CATALOGO.md`).
- **O que não pode se perder do login atual:**
  - o campo **Subdomínio do hotel**, que aparece quando o mesmo e-mail existe em dois hotéis
    (`requiresSubdomain`). O protótipo não mostra esse caso;
  - as mensagens do servidor (`LoginError`) e a validação do `zod`;
  - `autocomplete="username"` e `current-password`;
  - o redirecionamento por papel (`homeForRole`).
- **Testes:** hoje o `LoginPage` **não tem teste de componente**. A tarefa cria:
  - erro de validação;
  - erro do servidor;
  - aparecimento do subdomínio;
  - mostrar e ocultar a senha;
  - redirecionamento depois do login.
- **Fonte:** a Inter embutida (`@fontsource-variable/inter`). O Google Fonts do protótipo não entra.

### T-10.2 — Marca

O login usa verdes-esmeralda (`#047857`, `#065f46`); o resto do app usa teal (`#115e59`). Opções:

1. **Trocar a marca** em `tokens.css` para `#047857`. Uma linha, mas muda todo botão primário e
   item ativo do menu, então exige uma passada visual nas 13 telas.
2. **Manter o teal** no app e o verde só no login. Entrega mais rápida, mas o sistema fica com
   duas famílias de verde.

**Recomendação:** opção 1, junto com a T-10.4 (casca), para a mudança de cor aparecer uma vez só.

---

## 6. Critérios de aceitação

| ID | Critério | Como verificar |
|---|---|---|
| CA-10.a | O login reproduz o protótipo V2 aprovado: logo, vidro, luz da borda, olho da senha | Captura lado a lado com o protótipo |
| CA-10.b | Desempenho do login com a CPU 4× mais lenta: animação a 60 quadros por segundo e resposta à digitação abaixo de 200 ms (INP) | Painel Performance do Chrome, com captura em `docs/qa/` |
| CA-10.c | Com `prefers-reduced-motion: reduce`, nada se move | Emulação no DevTools ou no Playwright |
| CA-10.d | Contraste: texto ≥ 4,5:1, bordas dos campos e foco ≥ 3:1 sobre o vidro | Medição com as cores reais |
| CA-10.e | Nenhum comportamento do login muda: subdomínio, erros, redirecionamento por papel | Testes da T-10.1 + `pnpm e2e` verde |
| CA-10.f | `qa_checks.sh` sem novo aviso das regras 9a, 9b e 9c | `npm run qa:checks --prefix services/core-service` |
| CA-10.g | No celular (390 px), a caixa cabe sem rolagem horizontal e os alvos têm ≥ 48 px | Medição no navegador |
| CA-10.h | O qa-redteam não deixa 🔴 nem 🟡 aberto | Relatório em `docs/qa/` |

---

## 7. Riscos

| Risco | Como evitar |
|---|---|
| Visual "bonito" que atrapalha a operação | Cada superfície só entra com protótipo aprovado e conferido contra o `DESIGN_PMS.md` |
| Animação pesada no computador da recepção | CA-10.b medido, não suposto. Se não passar, a luz vira opcional ou sai |
| Navegador antigo sem `mask-composite` | A luz não aparece (o anel só é mostrado com suporte à máscara); a caixa continua igual |
| Logo gerado por IA, com direito de uso a confirmar | Registrar a origem e a autorização antes de usar em material da banca |
| Detalhes do logo somem em tamanho pequeno | A T-10.3 cria o símbolo simplificado para menu e favicon |

---

## 8. Como será executada

1. Cada superfície ganha um protótipo no mesmo canvas e só vira tarefa depois de aprovada pelo
   Sirlande.
2. A implementação segue o fluxo do projeto: research → plano → TDD → mutação → qa-redteam →
   merge.
3. PR para a `develop`. O merge é do Gabriel, com revisão do Sirlande.

---

## 9. Antecipar a T-10.1 para antes do congelamento de 24/11?

Avaliação de 16/11, a pedido do Sirlande.

**Tecnicamente, o sistema aguenta.** O login é a tela mais isolada do app:

- só o `App.tsx` importa o `LoginPage`. Nenhuma outra tela depende dele;
- ~~o roteiro automatizado (`pnpm e2e`) não passa pela tela de login: o `global-setup.ts` entra
  pela API e grava o token direto. Mudar o visual não quebra o roteiro;~~
  **Errado (corrigido em 18/11).** O `global-setup.ts` entra pela API, mas o `session()` de
  `frontend/e2e/src/helpers.ts` entra **pela tela**. O botão "Mostrar senha" fez o seletor
  `getByLabel(/senha/i)` achar dois elementos, e o roteiro parava no login. Consertado no #186;
- o login só usa `Field`, `Input` e `Button`, que não mudam;
- a SPEC-09 do Gabriel não toca no login. Não há conflito de arquivo.

**O que pesa contra:**

- nos 3 dias, a T-10.1 disputa tempo com as pendências do Sirlande até 24/11: os 2 🟡 da T-08.4
  no painel Hoje (`PLANO_FECHAMENTO_MVP_15NOV2026.md` §3, item 7);
- só o login muda. Depois de entrar, o app continua teal, e a diferença de verde aparece na
  demonstração, a menos que a T-10.2 entre junto, o que exige a passada nas 13 telas;
- é funcionalidade nova perto do congelamento. Precisa da concordância do Gabriel, que mergeia.

**Decisão (16/11):** a T-10.1 foi antecipada com a concordância do Gabriel, depois de os 2 🟡 da
T-08.4 irem para o PR #178. Marca teal no restante (opção 2).

**Recomendação original:** antecipar **só a T-10.1, com a marca teal no restante (opção 2 da T-10.2)**, se
o Gabriel concordar e os 2 🟡 da T-08.4 estiverem resolvidos antes. Se qualquer um dos dois
faltar, fica para o 5º semestre como previsto.

---

## 10. Plano das outras telas (aprovado pelo Sirlande em 18/11)

O login entrou sozinho. Este plano leva a mesma identidade ao resto do `apps/pms` sem ferir o
`DESIGN_PMS.md`. O Sirlande aprovou as recomendações em 18/11 (§10.7). Cada fase só vira código
depois de o protótipo dela ser aprovado.

### 10.1 Quando

**Decisão (18/11): nada do visual novo entra na `develop` antes de 10/12. O trabalho pode ser
adiantado numa branch separada (§10.8).** Protótipo pode ser feito a qualquer momento, porque não
toca no repositório.

- 24/11 é o congelamento (`PLANO_FECHAMENTO_MVP_15NOV2026.md`): depois dele, só correção. Trocar
  a cor da marca e a casca muda todas as telas do roteiro da banca a 6 dias do ensaio.
- O Sirlande ainda tem pendências antes de 24/11. A principal é o 🟡 do seed: o
  `node command.js seed` esconde o aviso de cenário incompleto
  (`docs/qa/repasses/para_sirlande_16112026_seed_notice.md`).
- **Custo aceito:** na banca, o login é verde e o app é teal (opção 2 da T-10.2, decisão de 16/11).

### 10.2 O que do login vai para o resto do app

| Elemento do login | Nas outras telas? | Por quê |
|---|---|---|
| Cor esmeralda | **Sim**, como marca (T-10.2) | É a identidade, e o token da marca já é um só (`--color-brand`) |
| Logo e o nome GESWAY | **Sim**, o símbolo simplificado no menu e no favicon (T-10.3) | O logo completo tem detalhe que some em tamanho pequeno (§7) |
| Inter | Já é a fonte do app | — |
| Fundo verde e areia | **Só num ponto**, a faixa do topo da casca, se o protótipo aprovar | Nas telas de trabalho, o fundo precisa ficar neutro para a tabela e o status lerem rápido (`DESIGN_PMS.md` §2) |
| Vidro claro | **Não** | Num PMS, cartão translúcido sobre tabela densa piora a leitura |
| Luz percorrendo a borda e o halo | **Não**, ficam só no login | Nas telas de operação, movimento precisa ter função (`DESIGN_PMS.md` §4). Animação decorativa é recusada |

### 10.3 A cor da marca e o verde de "Ocupado"

Com a marca em `#047857`, o botão principal e o selo "Ocupado" (`status-occupied`, `#16a34a`)
ficam na mesma família de verde, lado a lado no painel Hoje e na lista de quartos. A regra 2 do
`GUIA_UI_CORPORATIVA.md` diz que a marca significa "faça isto", e a regra 3 diz que status é ponto
e palavra.

**Recomendação:** manter os tons de status, que são a linguagem do rack, e conferir no protótipo
da Fase 1 com o painel Hoje cheio. Se o botão e o selo se confundirem de relance, o ajuste vai no
**tom da marca** (mais escuro, como o `#065f46` do logo), nunca no status. O texto branco dá
5,5:1 sobre `#047857` e 7,7:1 sobre `#065f46` (a regra pede 4,5:1).

### 10.4 Fases

Ordem pelo que a recepção mais usa e pelo que a banca vê primeiro. Cada fase tem protótipo
aprovado, branch própria a partir da `develop` e PR mergeável sozinho.

| Fase | Tarefa | Superfície | Dono da tela (DIVISAO §4) | Estimativa |
|---|---|---|---|---|
| 1 | **T-10.2 + T-10.3 + T-10.4** | Marca no `tokens.css`, símbolo no menu e no favicon, casca (menu lateral, cabeçalho, barra do celular) | Casca: sem dono na DIVISAO (Gabriel e Sirlande já mexeram) | 2 a 3 dias, com a passada visual nas telas |
| 2 | T-10.5 | Painel Hoje | Gabriel | 1 a 2 dias |
| 3 | T-10.6 | Detalhe da reserva e conta, comprovante imprimível | Gabriel | 2 dias |
| 4 | T-10.7 | Listas (Reservas, Hóspedes, Quartos, Contas) e formulários | Gabriel, Sirlande e "quem terminar primeiro" (quartos) | 2 dias |
| 5 | T-10.8 | Comanda no celular (garçom) | Sirlande | 1 a 2 dias |
| 6 | T-10.9 | Administração: Categorias e Indicadores | Indicadores: Gabriel; Categorias: "quem terminar primeiro" | 1 dia |

As estimativas são grosseiras e contam com protótipo aprovado. Total: 9 a 12 dias.

**Por que a Fase 1 junta três tarefas:** a troca da marca muda todo botão principal e item ativo
do menu (28 arquivos do `apps/pms` e do `packages/ui` usam `brand`). Feita junto com a casca, a mudança de cor aparece uma
vez só, como a §5 já recomendava.

### 10.5 Quem implementa

**Recomendação:** o Sirlande implementa todas as fases, porque é o responsável pela SPEC-10 e um
autor só mantém o visual coerente. O **dono de cada tela revisa o PR** dela. A tela não muda de
dono, e regra de negócio continua fora do escopo (§2: nada muda em regra, rota ou contrato).

### 10.6 Como verificar cada fase

Os mesmos critérios do login (§6), adaptados à tela:

- **captura antes e depois** a 390, 768 e 1366 px, em `docs/qa/evidencias/`;
- **a densidade não cai:** o número de linhas visíveis sem rolar fica igual ou maior. No painel
  Hoje vale o limite de 3.000 px em 375 px (CA-08.i);
- **contraste:** texto ≥ 4,5:1 e borda, foco e ícone com função ≥ 3:1, medidos com as cores reais;
  - *borda decorativa (decisão do Sirlande de 25/11, F2):* a borda do botão secundário (`gray-300`,
    1,3:1 sobre o areia) não entra na regra dos 3:1. Quem identifica o botão é o texto (WCAG 1.4.11
    dispensa a borda nesse caso), e o foco tem o anel da marca (≥ 6,6:1). É a mesma borda dos campos
    de texto e do "Sair". Achado 🟡3 do qa-redteam da F2;
- *comanda (decisões do Sirlande de 26/11, F6):* no computador, conta e cardápio em duas colunas
  só a partir de 1280 px (em 1024 com a barra lateral o cardápio ficava com 284 px); categorias e
  Mesa/Balcão no `SegmentedControl`; "Abrir conta" e o total no mesmo rodapé fixo (`StickyFooter`);
  selo "Fechada"/"Paga" no cabeçalho da conta. A hierarquia das ações da recepção ficou para o
  Gabriel (`docs/qa/repasses/para_gabriel_26112026.md`);
- `qa_checks.sh` sem aviso novo nas regras 9a, 9b e 9c;
- **roteiro e2e verde.** Ele passa pelas telas do roteiro, inclusive pelo login (§9);
- `/impeccable audit` e `/impeccable critique` antes do polimento (`DESIGN_PMS.md` §6), depois o
  qa-redteam, sem 🔴 nem 🟡 aberto.

### 10.7 Decisões que o Sirlande precisa tomar

Todas aprovadas pelo Sirlande em 18/11, como recomendado. A P-1 ganhou a branch separada.

| # | Decisão | Decidido em 18/11 |
|---|---|---|
| P-1 | Quando começar | Protótipos e código podem começar já, numa branch separada; nada entra na `develop` antes de 10/12 (§10.1, §10.8) |
| P-2 | O que do login vai para o app | Cor, símbolo e Inter; o fundo só na faixa do topo, se o protótipo aprovar; vidro e luz ficam só no login (§10.2) |
| P-3 | Verde da marca contra o verde de "Ocupado" | Manter os status e, se precisar, escurecer a marca (§10.3) |
| P-4 | Ordem das fases | Casca e marca → Hoje → reserva e conta → listas → comanda → administração (§10.4) |
| P-5 | Quem implementa | O Sirlande implementa, o dono da tela revisa (§10.5) |

### 10.8 Branch separada

Pedido do Sirlande em 18/11: adiantar as fases sem esperar 10/12.

```
develop ──┬────────────────────────────────────────────── (merge depois de 10/12) ──►
          │                                                        ▲
          └─► feature/spec-10-identidade ──────────────────────────┘
                 ├─► feature/t10-fase1-casca-marca  → PR para feature/spec-10-identidade
                 ├─► feature/t10-fase2-hoje         → PR para feature/spec-10-identidade
                 └─► …
```

- **Branch de integração:** `feature/spec-10-identidade`, a partir da `develop`. Cada fase nasce
  dela e volta para ela por PR, com o mesmo fluxo de sempre (TDD, mutação, qa-redteam) e revisão do
  dono da tela (§10.5).
- **A `develop` entra nela toda semana** e depois de cada merge que toque em `frontend/apps/pms` ou
  `frontend/packages/ui`. Até 10/12 a `develop` ainda recebe correções nas mesmas telas, e o conflito
  aparece cedo e pequeno, não todo no fim.
- **CI:** o gatilho `pull_request` dos workflows só vale para PR com base `main` ou `develop`, então o
  PR de uma fase para a branch de integração não dispara o CI. O `push` dispara em `feature/**`
  (`ci-frontend.yml`), e cada push da branch da fase e da de integração roda typecheck, testes e
  build. Não é preciso mudar workflow (área do Weslley).
- **Depois de 10/12:** um PR `feature/spec-10-identidade → develop`, com o roteiro e2e verde e as
  capturas de cada fase.
- **Se o prazo do 5º semestre apertar,** a fase que estiver pronta pode ir sozinha para a `develop`.
  Cada fase continua mergeável sozinha, desde que a Fase 1 (marca e casca) vá antes.

