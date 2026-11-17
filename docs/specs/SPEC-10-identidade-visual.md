# SPEC-10 — Identidade visual do Gesway, do login à administração

**Prioridade:** 🟢 Proposta. Bloco opcional, que pode ser implementado ou não
**Estado:** 🟡 T-10.1 (login) implementada em 16/11 (`feature/t101-login-visual`); as outras telas ainda não têm protótipo
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
| Login | ✅ Decidido (§3) |
| Casca: menu lateral, cabeçalho, barra inferior do celular | 🔲 Sem protótipo |
| Painel Hoje | 🔲 Sem protótipo |
| Listas: Reservas, Hóspedes, Quartos, Contas | 🔲 Sem protótipo |
| Detalhe da reserva e conta | 🔲 Sem protótipo |
| Comanda (celular, garçom) | 🔲 Sem protótipo |
| Administração: Categorias, Indicadores | 🔲 Sem protótipo |

**Fora:**
- `apps/booking` (público), que tem regras próprias de conversão (`DESIGN_PMS.md` §3);
- tema escuro;
- foto de fundo por hotel. Fica como ideia para quando houver upload de imagem do tenant.

---

## 5. Tarefas

Cada tarefa numa branch própria a partir da `develop`, mergeável sozinha.

| Tarefa | Entrega | Branch | Estimativa | Estado |
|---|---|---|---|---|
| **T-10.1** | Login novo (§3) | `feature/t101-login-visual` | 2 a 3 dias | 🔲 |
| **T-10.2** | Marca: decidir o verde e levar ao `tokens.css` | `feature/t102-marca-verde` | 1 dia + passada visual nas 13 telas | 🔲 |
| **T-10.3** | Símbolo simplificado (GSW com o círculo) no menu e no favicon | `feature/t103-simbolo` | 0,5 dia | 🔲 Depende do arquivo |
| **T-10.4 em diante** | Uma tarefa por superfície da §4, cada uma com protótipo aprovado antes | — | A estimar | 🔲 |

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
- o roteiro automatizado (`pnpm e2e`) **não passa pela tela de login**: o `global-setup.ts` entra
  pela API e grava o token direto. Mudar o visual não quebra o roteiro;
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
