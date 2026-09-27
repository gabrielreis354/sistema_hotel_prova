# Design do Gesway — como as skills de design operam aqui

**Para:** quem mexe no `frontend/` — Gabriel, Sirlande, Weslley
**Criado:** 27/09/2026

---

## Por que este arquivo existe

O projeto passou a usar três skills de design de terceiros, instaladas em `.claude/skills/` e
versionadas com o repositório. Elas são boas no que fazem e têm um limite em comum:

> **Nenhuma delas sabe o que é um PMS.**

São calibradas para o front-end que a internet mais produz — página de produto, portfólio,
landing page. Um PMS é o oposto disso: ferramenta operacional, usada oito horas por dia, com
densidade alta e um custo real por clique. Sem contexto de domínio, elas empurram a interface
para o lado errado com muita confiança.

Este arquivo é o contexto que falta. É a entrada de domínio que as skills leem antes de opinar.

---

## 1. Quem usa o Gesway, e em que condições

| Quem | Onde | Condição real de uso |
|---|---|---|
| **Recepcionista** | `apps/pms` | Turno de 8h no balcão, **com fila atrás do hóspede**. Dois picos: check-out entre 7h e 11h, check-in entre 14h e 18h. Cada clique a mais é hóspede esperando de pé |
| **Garçom** | `apps/pms`, celular | Uma mão livre, salão cheio, Wi-Fi ruim. Lança consumo entre mesas |
| **Administrador / dono** | `apps/pms` | Configura o hotel e lê indicadores. Não opera o balcão |
| **Hóspede** | `apps/booking` | Celular, sem login, decide em segundos. **É a única superfície de conversão do sistema** |

O operador é **usuário experiente e repetitivo**: faz a mesma tarefa centenas de vezes por
semana. Isso inverte várias intuições de design de produto voltado ao consumidor —
descobribilidade importa menos, velocidade e previsibilidade importam muito mais. Teclado antes
de mouse.

---

## 2. A regra que mais importa: densidade não é sujeira

O mapa de reservas (RF-050) é uma grade de **quartos × dias**. O painel do dia (RF-047) é
chegadas, saídas e hóspedes na casa, com ação direta na linha. A conta da reserva (RF-016)
combina diárias e consumos. Um PMS **vive em tabela densa**.

As skills de gosto visual otimizam o contrário. A `gpt-taste` do pacote Taste, por exemplo,
impõe literalmente *"massive section spacing"*, *"strict AIDA page structure"* e ScrollTriggers
de GSAP. Isso é excelente para uma landing page e destrutivo para um rack.

**Por isso ela não foi instalada, e a `design-taste-frontend` não manda no `apps/pms`.**

---

## 3. Onde cada skill manda

| Superfície | Quem lidera | Por quê |
|---|---|---|
| `apps/pms` — operação | **Impeccable** (`audit`, `critique`, `polish`) + `emil-design-eng` | Processo e qualidade técnica, sem impor estética de marketing |
| `apps/booking` — público | **`design-taste-frontend`** | É conversão: hierarquia, tipografia e primeira impressão pagam de verdade |
| Movimento, em qualquer uma | **`animate`**, **`review-animations`** | Curva, duração, interrupção, `prefers-reduced-motion` |
| Nome de um efeito | **`animation-vocabulary`** | Glossário reverso, para pedir a coisa certa |

Em conflito entre duas skills numa mesma tela, **vale a coluna "quem lidera" da superfície**.
Em conflito entre uma skill e este arquivo, **vale este arquivo**.

---

## 4. O que não aceitar delas

O `packages/ui` não tem curador — os três devs criam componente quando precisam. O que impede o
design system de rachar são regras objetivas, não bom senso. As skills precisam obedecê-las:

| Elas vão propor | A regra do projeto |
|---|---|
| Paleta e escala tipográfica próprias | Só `packages/config/tailwind-preset.js`. A **regra 9b** do `qa_checks.sh` reprova cor literal |
| Componente novo direto no `packages/ui` | Nasce **local** em `features/<módulo>/components/`, sobe no **segundo** módulo que precisar (`packages/ui/CATALOGO.md`) |
| `<button>`, `<input>` estilizados na mão | `Button`, `Input`, `Field` de `@hotel/ui`. **Regra 9a** |
| Bloco de classes repetido tela a tela | Repetido 3+ vezes é componente disfarçado. **Regra 9c** |
| GSAP, ScrollTrigger, hero de tela cheia, estrutura AIDA | Só em `apps/booking`. Nunca no `apps/pms` |
| Animação decorativa | Aqui movimento tem **função**: confirmar que o estado mudou, mostrar de onde o painel veio, sinalizar item na fila offline |

Antes de aceitar qualquer proposta de skill, rode o portão que já existe:

```bash
npm run qa:checks --prefix services/core-service   # a regra 9 vive aqui
```

---

## 5. Regras de domínio que nenhuma skill conhece

Estas não são preferência de estilo. São consequência do domínio hoteleiro e do banco.

**Dinheiro.** `DECIMAL` chega do `pg` como **string** — nunca `Number()`. Na tela: alinhado à
direita, algarismos tabulares (`font-variant-numeric: tabular-nums`), símbolo e duas casas
sempre visíveis. Coluna de valor que "dança" entre linhas é erro de leitura no fechamento de
caixa.

**Status é a linguagem visual do PMS.** Quarto: `AVAILABLE`, `OCCUPIED`, `CLEANING`. Reserva:
`PENDING → CONFIRMED → CHECKED_IN → CHECKED_OUT`, mais `CANCELLED`. **Nunca só cor** — ponto
colorido *e* rótulo textual, como o `StatusBadge` já faz. Recepcionista com daltonismo lendo um
rack de 40 quartos é caso real, não hipótese de acessibilidade.

**Ação irreversível pede confirmação.** Check-out, cancelamento de reserva, baixa de parcela.
Errar aqui é quarto errado ou dinheiro errado, não um undo.

**Data é dia, não instante.** Diária ancorada em `America/Sao_Paulo`. Um check-in não é um
timestamp qualquer: é a noite que o hóspede paga.

**Multi-tenant.** A identidade visual do hotel vem de **token**, não de classe fixa. Um hotel
vai querer a cor dele; o sistema é SaaS.

**Offline no salão.** O lançamento do garçom enfileira e reenvia pelo `client_item_id`
(RF-023). A tela precisa mostrar **"na fila"** com honestidade — nunca fingir que já gravou.

**Alvo de toque.** O `Button` tem `comfortable` (≥ 48px, celular e comanda) e `compact`
(tabela e rack no desktop). Não é decoração: são dois contextos físicos diferentes.

---

## 6. Como usar no dia a dia

```
/impeccable audit            # qualidade técnica da tela
/impeccable critique         # revisão de UX
/impeccable polish           # passada final, depois que o comportamento está certo
/impeccable typeset          # tipografia — mas o resultado vira token no preset, não classe solta
```

Movimento: peça `animate` para construir e `review-animations` para criticar o que já existe.
Se você não sabe o nome do efeito que quer, `animation-vocabulary` traduz a descrição.

**Ordem que funciona:** comportamento correto e testado → `audit` → `critique` → só então
`polish`. Polir tela com regra de negócio errada é retrabalho garantido.

---

## 7. Para quem clonar o repositório

As cinco skills estão versionadas em `.claude/skills/` — não precisa instalar nada. Se alguma
sumir, o `skills-lock.json` na raiz restaura:

```bash
npx skills@latest experimental_install
```

O **Impeccable** é a exceção: ele é um plugin de marketplace, e cada dev instala no seu
ambiente, uma vez, num terminal interativo:

```bash
/plugin marketplace add pbakaus/impeccable
```

Depois abra `/plugin` e instale o Impeccable na lista. Quando rodar `/impeccable init`, aponte
para **este arquivo** como contexto de produto — é o que evita que ele infira o produto errado
a partir do código.

---

## 8. O que ficou de fora, de propósito

| Skill | Por que não |
|---|---|
| `gpt-taste`, `industrial-brutalist-ui`, `minimalist-ui` | Estética imposta, incompatível com densidade operacional |
| `brandkit`, `imagegen-*`, `image-to-code` | Geram imagem de referência; não é o gargalo aqui |
| `write-swift`, `mobile-native`, `animate-expo` | App nativo. O Gesway é React web |
| `apple-design` | Bom em gesto, material e profundidade — útil **se** o rack ganhar arrastar-e-soltar. Primeiro candidato a entrar depois |
| `find-animation-opportunities` | Procura lugares para animar. Num PMS o incentivo está invertido |
| `prototype`, `pick-ui-library` | A stack e os componentes já foram escolhidos |
| `ask-sonner` | Só se adotarmos o Sonner para toast. Hoje existe `packages/ui/src/feedback.tsx` |
