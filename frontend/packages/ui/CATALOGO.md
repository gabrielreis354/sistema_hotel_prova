# Catálogo do design system

**O que existe hoje em `@hotel/ui`.** Antes de criar um componente, olhe aqui e no
`src/index.ts` — o que está exportado lá é o que existe de verdade.

A coluna **quando não usar** é a mais importante da tabela. É ela que faz você perceber
que o seu caso é outro — ou que não é.

---

## A regra de promoção

> Componente nasce **local**, em `features/<módulo>/components/`.
> **Sobe para `packages/ui` quando o segundo módulo precisar dele.**

Ninguém pede autorização para criar. Quem precisa do componente pela **segunda** vez é quem
promove: move o arquivo, exporta no `index.ts`, acrescenta a linha aqui.

Isso é DRY com prova de reúso, em vez de adivinhação na primeira vez — e evita o gargalo de
ter uma pessoa aprovando componente dos outros.

---

## Bibliotecas por baixo

Até 10/12, nenhuma além de `lucide-react` para ícones (com texto ao lado e `aria-hidden`) e da fonte Inter. A partir do 5º semestre, componente com comportamento de teclado e leitor de tela (Tabs, Combobox, Dialog, DropdownMenu) nasce sobre o Radix, no modelo do shadcn, e segue a regra de promoção acima. Decisão de 15/11 na SPEC-08, seção 9.

---

## Componentes

| Componente | Para quê | Quando **não** usar |
|---|---|---|
| `Button` | Ação. Variantes `primary`, `secondary` (branco com borda, desde a F2 da SPEC-10), `ghost`, `danger`, com o anel de foco da marca; tamanhos `comfortable` (mobile, alvo ≥ 48px) e `compact` (48 px no toque, 36 px com mouse: tabela, rack e a ação do `PageHeader`) | Navegação — use `Link` do router. Um `Button` que só navega quebra abrir em nova aba. Link com cara de botão: `ButtonLink` do app (`apps/pms/src/components/links.tsx`) |
| `buttonClasses` | As classes do `Button` (mesmas variantes) para outro elemento. Existe para o `ButtonLink` do app, que é `<a>` do roteador — o `@hotel/ui` não depende de react-router (T-08.6) | Para recriar um botão com `<div>` ou `<span>`: use o `Button` |
| `Input` | Campo de texto. 48 px no toque e altura natural com mouse (F2 da SPEC-10: não repita o alvo na tela). Foco visível, estado de erro por `aria-invalid` | Sozinho num formulário — envolva em `Field`, senão o campo fica sem rótulo |
| `Field` | Rótulo + controle + mensagem de erro, com `htmlFor` ligado | Texto de ajuda que não é erro; isso ainda não existe e precisa de variante nova |
| `StatusBadge` | Status com ponto colorido **e** rótulo textual sempre juntos. Quarto: `status={room.status}`. Outro status (reserva, parcela): `tone` (`StatusTone` de `@hotel/domain`) + `label`, escolhidos pelo módulo dono do status | Para *escolher* status num formulário — selo é leitura, não controle. Nem com cor fora dos `StatusTone`: tom novo entra primeiro no preset e no `STATUS_TONES` |
| `Card` | Contêiner de conteúdo, borda e fundo padrão | Como moldura de tudo. Borda, fundo e sombra dizem "objeto separado" — usar em todo bloco achata a hierarquia |
| `Spinner` | Carregando, com `role="status"` e rótulo acessível | Espera longa em tela cheia — aí o certo é *skeleton*, que ainda não existe |
| `EmptyState` | Lista vazia, com título, descrição, **ação sugerida** e, se quiser, um ícone que diz de que lista é o vazio | Erro. Vazio e erro são coisas diferentes: vazio ensina o próximo passo, erro diz o que fazer para recuperar |
| `ErrorState` | Erro com mensagem (`role="alert"`) e botão "Tentar de novo", na mesma faixa do `Notice` de erro (`noticeFrame`) | Erro de campo de formulário — isso é o `error` do `Field`. Vazio — isso é o `EmptyState` |
| `Money` | Valor em reais a partir de **centavos** (`decimalToCents` antes): tabular, duas casas, sem quebrar. Promovido na T-05.3 | Para converter o DECIMAL — isso é do `@hotel/domain`. Nem para percentual ou quantidade |
| `Notice` | Aviso de resultado de uma ação (`success` → `role="status"`, `error` → `role="alert"`), focável para o leitor de tela anunciar. Promovido na T-05.3 | Erro de carregamento com "tentar de novo" — isso é o `ErrorState` |
| `ActionSlot` | Ação + o **motivo** quando está desabilitada, ligado por `aria-describedby` (RNF-026). Promovido na T-05.3 | Ação que o papel nunca terá — essa não aparece; o slot é para "agora não dá" |
| `cn` | Junta classes condicionalmente (utilitário, não componente) | — |
| `PageHeader` | Topo de toda página (T-08.5): título de 20 px, contexto curto embaixo (data, contagem) e a ação principal à direita, sempre `size="compact"` (um teste varre isso); no celular a ação desce, na largura toda | Título de seção dentro da página — use `Section`. E não ponha duas ações `primary` nele: a segunda é `secondary` (GUIA, regra 1) |
| `Section` | Bloco só de leitura: título de seção e um fio em cima, sem cartão (ficha do hóspede, resumo da reserva) | O que pede atenção ou recebe dado — formulário, confirmação, pagamento: isso é `Card` |

---

## O que falta — candidatos naturais a promoção

Registrados porque já se sabe que vão ser precisos por mais de um módulo. Quem chegar
primeiro cria local; o segundo promove.

> **Primeira versão local já existe** para `Table` e `Select` em
> `apps/pms/src/features/rooms/components/` (T-05.1, 21/10). Quem precisar no segundo módulo
> promove de lá, em vez de recriar. O `Money` local de quartos virou `DecimalMoney` na T-08.6
> (recebe o DECIMAL em texto; o `Money` daqui recebe centavos), e o `Notice` local da comanda
> virou `InfoNotice` (aviso neutro). Nenhum componente do app repete nome daqui
> (`apps/pms/src/components/uiNames.test.ts`).

| Falta | Quem vai precisar | Observação |
|---|---|---|
| `Table` | reservas, hóspedes, financeiro, B2B | Cabeçalho, coluna que some no mobile, estado vazio embutido |
| `DateRangePicker` | reservas, rack, indicadores | Todo filtro por período do sistema |
| `Skeleton` | listas e rack | Espera longa sem tela em branco |
| `Select` | reservas, comanda, configurações | Lista de escolha com o visual do `Input`. Hoje só existe a versão local da T-05.1 |

---

## Regras que valem para todo componente daqui

Não são preferência — são RNF do documento oficial de requisitos:

- **Status nunca só por cor.** Cor **e** rótulo, sempre (`RNF-025`)
- **Ação indisponível fica desabilitada com o motivo**, não desaparece (`RNF-026`)
- **Alvo de toque ≥ 48px** no que se usa em celular (`RNF-024`)
- **Foco visível** em tudo que recebe teclado — a recepção opera no teclado
- **Nada de cor literal.** Só token do Tailwind (`brand`, `status-*`, `gray-*`)
- **Classe dinâmica não sobrevive ao build.** O Tailwind faz *purge* estático: `bg-status-${x}`
  some. Use mapa explícito, como o `DOT_CLASS` do `StatusBadge`

---

## Faxina semanal

Dez minutos na reunião, olhando o que nasceu na semana. O que nenhuma regra automática pega
são dois componentes **quase** iguais em módulos diferentes, cada dono achando que o seu é
específico.

Um minuto de conversa quando é semanal. Uma refatoração quando é semestral.
