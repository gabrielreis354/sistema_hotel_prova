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

## Componentes

| Componente | Para quê | Quando **não** usar |
|---|---|---|
| `Button` | Ação. Variantes `primary`, `secondary`, `ghost`, `danger`; tamanhos `comfortable` (mobile, alvo ≥ 48px) e `compact` (tabela e rack no desktop) | Navegação — use `Link` do router. Um `Button` que só navega quebra abrir em nova aba |
| `Input` | Campo de texto. Foco visível, estado de erro por `aria-invalid` | Sozinho num formulário — envolva em `Field`, senão o campo fica sem rótulo |
| `Field` | Rótulo + controle + mensagem de erro, com `htmlFor` ligado | Texto de ajuda que não é erro; isso ainda não existe e precisa de variante nova |
| `StatusBadge` | Status de **quarto**, com ponto colorido **e** rótulo textual sempre juntos | Qualquer outro status — hoje ele só conhece `RoomStatus`. Status de reserva precisa de generalização, não de cópia |
| `Card` | Contêiner de conteúdo, borda e fundo padrão | Como moldura de tudo. Borda, fundo e sombra dizem "objeto separado" — usar em todo bloco achata a hierarquia |
| `Spinner` | Carregando, com `role="status"` e rótulo acessível | Espera longa em tela cheia — aí o certo é *skeleton*, que ainda não existe |
| `EmptyState` | Lista vazia, com título, descrição e **ação sugerida** | Erro. Vazio e erro são coisas diferentes: vazio ensina o próximo passo, erro diz o que fazer para recuperar |
| `cn` | Junta classes condicionalmente (utilitário, não componente) | — |

---

## O que falta — candidatos naturais a promoção

Registrados porque já se sabe que vão ser precisos por mais de um módulo. Quem chegar
primeiro cria local; o segundo promove.

| Falta | Quem vai precisar | Observação |
|---|---|---|
| `ErrorState` | todos | Hoje cada tela improvisa. `GuestsListPage` resolve com um `<button className="underline">` cru — é exatamente o que a regra 9 do `qa_checks.sh` aponta |
| `StatusBadge` generalizado | reservas, governança | Ressalva registrada na SPEC-05 desde a Fase 1. Reserva e quarto têm status diferentes; a solução é generalizar, não duplicar |
| `Table` | reservas, hóspedes, financeiro, B2B | Cabeçalho, coluna que some no mobile, estado vazio embutido |
| `DateRangePicker` | reservas, rack, indicadores | Todo filtro por período do sistema |
| `Money` | reserva, conta, financeiro, indicadores | `DECIMAL` chega do `pg` como **string**. Um componente central evita `Number()` espalhado |
| `Skeleton` | listas e rack | Espera longa sem tela em branco |

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
