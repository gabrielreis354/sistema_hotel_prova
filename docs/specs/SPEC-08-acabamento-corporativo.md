# SPEC-08 — Acabamento corporativo do `app-pms`

**Prioridade:** 🟠 Alta — é a primeira impressão da banca e do hotel, mas vem depois do que faz o roteiro funcionar
**Estado:** 🔲 Não iniciado — aguarda revisão do Sirlande
**Responsável:** Sirlande
**Criado em:** 09/11/2026
**Depende de:** merge da T-05.3 (`feature/t053-painel-hoje`), que altera `AppShell`, navegação e o painel Hoje
**Prazo:** 21/11, antes do congelamento de 24/11. O seed com datas do dia (M8, 17/11) vem antes desta Spec
**Regras permanentes para as próximas telas:** [`frontend/GUIA_UI_CORPORATIVA.md`](../../frontend/GUIA_UI_CORPORATIVA.md)

---

## 1. Contexto

O MVP funciona, mas ainda parece protótipo. Os defeitos abaixo foram observados em 09/11 na tela de conta da reserva (ambiente local) e nas capturas do painel Hoje (T-05.3, 1366 px e 375 px).

| # | O que se vê hoje | Onde |
|---|---|---|
| A | O produto se chama "Hotel PMS" no menu e "PMS — Gestão de Hotel" no login e na aba do navegador. O nome Gesway não aparece em lugar nenhum | `apps/pms/src/components/AppShell.tsx:28`, `features/auth/LoginPage.tsx`, `apps/pms/index.html` |
| B | A fonte Inter é declarada, mas **nunca é carregada**: não há `@fontsource` nem `<link>`. Cada computador mostra a fonte do sistema | `packages/config/tailwind-preset.js`, `apps/pms/src/index.css` |
| C | O menu lateral é só texto, sem agrupamento, com item ativo discreto | `AppShell.tsx` (`NavItemLink`) |
| D | O login usa `<input>` feito à mão e um `Field` local, em vez dos componentes de `@hotel/ui` | `features/auth/LoginPage.tsx` |
| E | Três botões grandes e iguais no topo da reserva. Dois deles apagados ocupam o mesmo espaço da única ação possível | `features/reservations/ReservationDetailPage.tsx` (grade `sm:grid-cols-3`) |
| F | Todo bloco é um `Card` do mesmo peso, o que achata a hierarquia. O próprio `CATALOGO.md` já alerta para isso | `packages/ui/src/feedback.tsx`, telas em geral |
| G | Painel Hoje: um botão verde sólido em cada linha. Com 29 chegadas, vira uma parede de botões e nenhum deles se destaca | `features/today/` (T-05.3) |
| H | Painel Hoje: cada linha ocupa três linhas de texto e as listas não têm limite. Com dados de teste volumosos, a tela no celular passa de 18 mil px de altura | `features/today/` (T-05.3) |
| I | `brand` é um valor fixo e aparece em tudo: ação, menu ativo, aba, marca. A cor perde o significado de "faça isto", e o hotel não consegue ter a própria cor | `tailwind-preset.js` |

Os neutros (`gray-*`) já são frios e ficam como estão. O problema de cor é onde o `brand` é usado, não a paleta inteira.

---

## 2. Objetivo

Fazer o `app-pms` parecer um produto profissional, **sem perder velocidade de operação** e sem exigir treinamento. O público é a equipe de hotéis pequenos e médios; o detalhamento está no guia.

---

## 3. Decisões já tomadas (não reabrir)

| Decisão | Escolha | Motivo |
|---|---|---|
| Densidade | Mantida. Corporativo aqui é ordem e consistência, não espaço vazio | `DESIGN_PMS.md` §2 |
| Ação indisponível | Continua visível, desabilitada e com o **motivo em texto** | RNF-026 e CA-05.2.e. Dica ao passar o mouse não serve: não existe no toque |
| Status | Sempre ponto **e** rótulo | RNF-025 |
| Confirmação | Na própria linha ou no próprio cartão, sem modal | Padrão já usado na reserva e no painel |
| Cor da marca | Por token, com variável CSS | SaaS: cada hotel poderá ter a sua (`DESIGN_PMS.md` §5) |
| Tema escuro | Fora | Sem demanda; dobra o trabalho de contraste |

---

## 4. Escopo

**Dentro:** `apps/pms` e `packages/ui`, `packages/config`, nas telas Login, Hoje, Reservas, Reserva, Hóspedes, Quartos, Comanda (só a parte da recepção) e Indicadores.

**Fora:**
- `apps/booking`, que é superfície de conversão e tem outro critério;
- comportamento, regra de negócio e contrato da API. Se uma mudança visual exigir mudar regra, vira pendência;
- a tela do garçom, exceto o que vier de graça pelos tokens. Celular no salão tem prioridade de toque;
- redesenho tela a tela. O ganho vem da casca, dos tokens e dos componentes compartilhados.

---

## 5. Tarefas

Cada tarefa cabe numa branch própria e pode ser mergeada sozinha, nesta ordem.

| Tarefa | Entrega | Resolve | Estimativa |
|---|---|---|---|
| **T-08.1** Fundamentos | Inter carregada de verdade, marca por variável CSS, escala de tipografia | B, I | 1 dia |
| **T-08.2** Marca e casca | Gesway no menu, login e aba; ícones no menu; login com `@hotel/ui` | A, C, D | 1 dia |
| **T-08.3** Hierarquia de ações | Um único destaque por tela; reserva reorganizada | E | 1 dia |
| **T-08.4** Painel Hoje e listas | Linha densa, ação de linha discreta, limite com "Ver todas" | G, H | 2 dias |
| **T-08.5** Cabeçalho e cartões | `PageHeader` e menos cartões nas telas do escopo | F | 1 a 2 dias |
| **T-08.6** Faxina | Pendências que caem nos mesmos componentes | — | 0,5 dia |

### T-08.1 — Fundamentos

- Instalar `@fontsource-variable/inter` no `apps/pms` e importar em `main.tsx`. A fonte fica no próprio bundle, sem depender de Google Fonts.
- Em `tailwind-preset.js`, trocar `brand.DEFAULT` por `rgb(var(--color-brand) / <alpha-value>)`, porque o código usa `brand/10`. Definir o padrão em `packages/ui/src/styles.css`.
- Escurecer o padrão de `#0f766e` para `#115e59`: mesma família de cor, mais sóbria. O texto branco sobre ele vai de 5,5:1 para 7,6:1.
- Fixar a escala no preset:

  | Papel | Tamanho | Peso |
  |---|---|---|
  | Título da página | 20 px | 600 |
  | Título de seção | 14 px | 600 |
  | Corpo | 14 px (16 px em formulário no celular) | 400 |
  | Apoio | 12 px, nunca abaixo disso | 400 |
  | Valor de destaque | 24 px, tabular | 600 |

### T-08.2 — Marca e casca

- Nome **Gesway** no menu, no login e no `<title>` (`Gesway — Gestão hoteleira`).
- Instalar `lucide-react` e pôr um ícone de traço fino antes de cada rótulo em `routes/nav.ts`. Rótulo sempre visível, ícone nunca sozinho.
- Item ativo: fundo `brand/10`, texto `brand`, fio de 2 px à esquerda.
- Login com `Input` e `Field` de `@hotel/ui`, eliminando o `Field` local.
- Mostrar o nome do hotel no cabeçalho. **Atenção:** o `AuthUser` e o JWT não trazem esse nome. Se exigir mudança no backend, registre como pendência e siga sem ele.

### T-08.3 — Hierarquia de ações

- Regra: **no máximo um botão `primary` por tela ou cartão.**
- Reserva: a ação possível fica como `primary` à direita do cabeçalho, junto do saldo. As demais viram `secondary` ou `ghost` em tamanho menor, mantendo o `ActionSlot` com o motivo em texto.
- Cancelar nunca ocupa o lugar da ação principal. A confirmação continua no cartão.

### T-08.4 — Painel Hoje e listas

- No desktop, cada item ocupa **uma linha**: nome, quarto, status, sinal (se houver), ação alinhada à direita.
- Ação de linha em `secondary`, com ícone e rótulo. O `primary` fica reservado para a ação principal da tela.
- Mostrar os **8 primeiros** itens de cada bloco, com "Ver todas (N)" expandindo no próprio lugar. Atrasados e itens com alerta vêm antes do corte.
- A ordem fixa dos blocos (D-4 da T-05.3) não muda.

### T-08.5 — Cabeçalho e cartões

- Criar `PageHeader` (título, contexto, ação principal). Nasce local e sobe no segundo módulo, conforme o `CATALOGO.md`; como já serve a vários, a promoção deve ser imediata.
- Trocar `Card` dentro de `Card` e blocos só de leitura por seções separadas por título e fio.
- `Card` fica para o que é objeto próprio ou exige atenção: formulário de pagamento, confirmação.

### T-08.6 — Faxina

- `PaymentForm`: trocar `md:min-h-0` pelo corte correto, mantendo 48 px no tablet. Só usar o tamanho compacto a partir de `xl` (1280 px), o mesmo corte da T-05.3.
- Resolver o 🟡4 da T-05.3: as cópias locais de `Money` (`rooms/components/Money.tsx`) e `Notice` (`accounts/components/Notice.tsx`) têm contrato diferente da versão de `@hotel/ui`. Unificar ou renomear.

---

## 6. Critérios de aceitação

| ID | Critério | Como verificar |
|---|---|---|
| CA-08.a | "Hotel PMS" e "PMS — Gestão de Hotel" não existem mais no `apps/pms` | `grep` |
| CA-08.b | A Inter é a fonte renderizada, mesmo com a rede bloqueada para fontes externas | DevTools, painel de fontes |
| CA-08.c | Trocar `--color-brand` em um lugar muda a cor em todo o app | Alterar a variável no DevTools |
| CA-08.d | Texto e ações têm contraste ≥ 4,5:1 | Ferramenta de acessibilidade |
| CA-08.e | Nenhuma tela do escopo tem mais de um `primary` visível ao mesmo tempo, exceto o bloco de confirmação | Revisão visual |
| CA-08.f | Toda ação indisponível continua visível, desabilitada e com motivo em texto | Reserva em cada status |
| CA-08.g | Alvo de toque ≥ 48 px em 375 px **e** em 768 px | Medição no navegador |
| CA-08.h | Em 1366×768, sem rolar, a recepção vê os números do dia e as primeiras chegadas | Captura |
| CA-08.i | Painel Hoje com 30 chegadas em 375 px: altura total abaixo de 3.000 px antes de expandir | Medição com carga |
| CA-08.j | Nada muda em regra, rota ou contrato: testes existentes passam sem ajuste de lógica | `pnpm test`, `pnpm typecheck`, CI |
| CA-08.k | `qa_checks.sh` sem erro novo (regras 9a, 9b e 9c) | Execução |
| CA-08.l | Uma pessoa que nunca viu o sistema faz um check-in e registra um pagamento sem ajuda | Teste de corredor, anotando onde travou |

---

## 7. Se o prazo apertar

Cortar de baixo para cima: T-08.6, T-08.5, T-08.4. **T-08.1, T-08.2 e T-08.3 são o mínimo**, porque mudam a percepção de todas as telas com pouco risco. O critério para interromper é o congelamento de 24/11: depois dele só entra correção de defeito.

---

## 8. Riscos

| Risco | Como evitar |
|---|---|
| Conflito com a T-05.3 | Só começar depois do merge dela |
| Teste quebrar por mudança de texto ou de papel do botão | Ajustar seletor e texto, nunca a lógica (CA-08.j). Se a lógica precisar mudar, parar e registrar |
| Polir antes de o comportamento estar certo | Ordem do `DESIGN_PMS.md` §6: comportamento, auditoria, crítica e só então polimento |
| Dependência nova pesar no celular do garçom | Importar ícones individualmente e conferir o tamanho do bundle antes e depois |

---

## 9. Bibliotecas de componentes — sugestão

> **Esta seção é uma sugestão de Gabriel, registrada em 09/11. A decisão é do Sirlande,** que cuida do frontend. Se ele escolher outro caminho, basta registrar o motivo aqui.

**Estudo do Sirlande (09/11), ainda para o grupo decidir:** manter o `@hotel/ui` e adotar o Radix por baixo dele, no modelo do shadcn/ui, um componente por vez e **só no 5º semestre**, com ADR. A direção é a mesma desta sugestão. Ordem proposta: Tabs (as abas da reserva não tratam as setas do teclado), Combobox (o `GuestPicker` não tem semântica para leitor de tela), Dialog, DropdownMenu e Toast (Sonner).

Pontos que o grupo precisa fechar:

| Ponto | Estudo do Sirlande | Sugestão abaixo | Impacto |
|---|---|---|---|
| Dependência nova antes de 10/12 | Nenhuma | `lucide-react` e fonte Inter | Se valer "nenhuma", T-08.1 e T-08.2 perdem esses dois itens: o menu segue só com texto, ou com ícones em SVG próprio, e a fonte fica a do sistema |
| Dialog nas confirmações | Substituir as confirmações inline | Confirmar no próprio lugar (seção 3) | Decidir no 5º semestre. Até lá vale a confirmação inline |
| Toast | Sonner | `Notice` já atende | Decidir no 5º semestre |
| Setas nas abas | À mão antes da entrega, se a revisão de acessibilidade apontar | Não tratado | Correção pequena, sem dependência |

**Sugestão:** não adotar uma biblioteca completa. Seguir o que o `docs/frontend/PLANEJAMENTO_FRONTEND.md` já previa, Tailwind com shadcn/ui sobre Radix, trazendo componente só quando uma tela precisar. O `@hotel/ui` já usa `class-variance-authority`, `clsx` e `tailwind-merge`, a mesma base do shadcn, e o código copiado continua obedecendo aos tokens e às regras do projeto.

| Opção | Sugestão | Motivo |
|---|---|---|
| shadcn/ui + Radix | Adotar aos poucos | Sem amarra a um fornecedor, e o Radix resolve foco, teclado e leitor de tela |
| React Aria | Alternativa válida | Boa acessibilidade, com menos afinidade com o que já existe |
| MUI, Ant Design | Não adotar | Visual e tema próprios competem com o Tailwind e exigem reescrever as telas |
| Mantine | Não adotar | A versão atual exige React 19.2; o projeto está no 18.3 |

**Antes do congelamento de 24/11:** só `lucide-react` e `@fontsource-variable/inter`, já previstas nas T-08.1 e T-08.2.

**Depois do congelamento, quando a tela pedir:**

| Necessidade | Biblioteca | Quando |
|---|---|---|
| Janela, menu, popover | Radix, via shadcn | No primeiro caso real. A folha "Mais" é candidata |
| Seleção de período | `react-day-picker` | Filtros de reservas, rack e indicadores |
| Rack quartos × dias | `@tanstack/react-virtual` | Quando o rack for construído |
| Ordenar e paginar tabela | `@tanstack/react-table` | Financeiro. Lista simples continua com o `Table` local |
| Busca rápida no balcão | `cmdk` | Evolução futura |

**Sugestão de manter como está:** `<select>` nativo, que funciona melhor em celular simples; `Notice` e `feedback.tsx` em vez de `sonner`; o `BarChart` próprio enquanto não surgir gráfico mais complexo.

**A conferir antes de instalar:** caminho do shadcn para Tailwind 3.4, porque as versões recentes priorizam o Tailwind 4, e o peso de cada dependência no bundle. Em 09/11, licença (MIT/ISC) e compatibilidade com React 18 foram conferidas no npm para `lucide-react` e para as bibliotecas das tabelas acima; instalação e bundle não foram testados.
