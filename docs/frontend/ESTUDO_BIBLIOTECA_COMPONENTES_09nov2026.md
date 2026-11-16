# Biblioteca de componentes do Gesway: estudo e recomendação

09/11/2026 · Sirlande · decisões fechadas em 15/11/2026

> Exportado do doc de trabalho no Claude Docs em 15/11/2026. Este arquivo é o registro
> no repositório; a seção 9 da `docs/specs/SPEC-08-acabamento-corporativo.md` resume as decisões.

**Recomendação:** manter o `@hotel/ui` e adotar o **Radix UI** (primitivos sem estilo) por baixo dele, no modelo do shadcn/ui, um componente por vez e **só depois do congelamento de 24/11**. Bibliotecas com tema próprio (MUI, Mantine, Chakra, Ant Design) ficam descartadas.

## O que o estudo encontrou

O `@hotel/ui` já segue o modelo do shadcn/ui; falta só a camada de comportamento acessível que o shadcn traz do Radix.

- **O modelo já é o do shadcn.** O pacote usa `class-variance-authority` e `cn` (`clsx` + `tailwind-merge`) sobre o Tailwind, com os tokens do `tailwind-preset.js`. O plano inicial (`COORDENACAO_AGENTES.md`) previa "Tailwind + shadcn/ui"; o shadcn nunca foi instalado, mas o código ficou no formato dele.
- **Temos hoje:** `Button`, `Input`, `Field`, `Card`, `Spinner`, `EmptyState`, `ErrorState` e `StatusBadge`.
- **As regras do projeto derrubam bibliotecas com estilo próprio:**
  - cor só do preset (a regra 9b do `qa_checks.sh` reprova cor literal);
  - identidade do hotel por token, porque o sistema é SaaS;
  - densidade de PMS, com os tamanhos `compact` e `comfortable`;
  - componente nasce no módulo e sobe no segundo uso (`CATALOGO.md`).
- **Fazemos à mão o que uma biblioteca resolveria:**
  - **Abas da reserva** (`ReservationDetailPage`): têm `role="tab"`, mas o app não trata as setas do teclado em lugar nenhum. O padrão de abas da W3C pede essa navegação.
  - **Busca de hóspede** (`GuestPicker`): funciona como campo com lista, mas sem a semântica de combobox. O leitor de tela não anuncia as opções.
  - **Ainda não existem:** modal, popover, menu de ações da linha, aviso temporário (toast) e escolha de período para o rack (T-05.4).
- **Acessibilidade vai ser avaliada** (RNF-024 a 027). O `FERRAMENTAL.md` registra que ela nunca foi verificada, e os erros de teclado e leitor de tela costumam ficar justamente em abas, combobox, modal e menu.

## Opções comparadas

Só as bibliotecas sem estilo próprio cabem no projeto; entre elas, o Radix é o que menos muda o que já existe.

| Opção | Tipo | Encaixe no Gesway | Veredito |
| --- | --- | --- | --- |
| **Radix UI, no modelo shadcn** | Primitivos sem estilo | Entra por baixo do `@hotel/ui` com o nosso Tailwind e os nossos tokens. Componente copiado para o repositório: o time é dono do código e a regra de promoção continua valendo. Um pacote por componente, adoção aos poucos | **Recomendado** |
| React Aria Components (Adobe) | Primitivos sem estilo | A acessibilidade mais completa, inclusive calendário e intervalo de datas em português. API diferente da que usamos e curva maior para três devs | Segunda opção, se o rack precisar de calendário avançado |
| Base UI (do time do MUI) | Primitivos sem estilo | Mesma ideia do Radix, porém mais nova, com menos exemplos e menos material | Sem vantagem sobre o Radix aqui |
| MUI, Mantine, Chakra, Ant Design | Componentes com tema próprio | Brigam com o preset e com a regra 9b, dificultam a cor por hotel e puxam para a estética de produto de consumo, não de PMS denso. Trocar o que existe vira reescrita | **Descartadas** |

## Por que o Radix

Ele resolve teclado e leitor de tela sem mexer no visual nem no que já está pronto.

- **O que já existe não muda:** `Button`, `Input`, `Field` e `StatusBadge` ficam como estão.
- **Fecha as lacunas encontradas:** navegação por teclado, foco preso dentro do modal, papéis ARIA e anúncio no leitor de tela.
- **O visual continua nosso:** cores, tamanhos e densidade vêm do preset do Tailwind, como hoje.
- **Defensável na banca:** biblioteca própria com tokens de PMS sobre primitivos acessíveis amplamente usados, e não um tema pronto adaptado.

## Onde entraria, em ordem

A ordem segue o que hoje falha em acessibilidade e o que as próximas telas vão pedir.

1. **Tabs**: navegação por setas nas abas da reserva, que corrige a falha atual.
2. **Combobox** (Popover + lista): busca de hóspede com a semântica certa.
3. **Dialog**: confirmações que hoje são inline e o futuro rack.
4. **DropdownMenu**: ações da linha no painel Hoje e no rack.
5. **Toast**: o Sonner, que já está citado no `DESIGN_PMS.md`.

Cada um nasce local, sobe para o `@hotel/ui` no segundo uso e ganha linha no `CATALOGO.md`.

## Quando

Nada muda antes da entrega de 10/12, exceto a fonte e os ícones: trocar componente de base no meio do roteiro abre risco em tela que já está pronta e auditada.

| Período | O que fazer |
| --- | --- |
| Até 24/11 (congelamento) e 10/12 (entrega) | Nenhuma dependência nova, exceto Inter e lucide-react (ver a resposta do Gabriel). Corrigir à mão, até 24/11, as setas das abas da reserva e o foco da folha "Mais" |
| 5º semestre | Registrar a decisão num ADR e adotar na ordem acima, começando pelas Tabs e pelo Combobox |

## Resposta do Gabriel (recebida em 11/11)

O Gabriel concorda com a direção e propõe uma exceção para antes de 10/12: a fonte Inter e os ícones do lucide-react. A exceção fica aceita, com as condições da tabela de decisões.

### Mapa de bibliotecas para o 5º semestre

É o mapa do Gabriel, com as duas falhas que o estudo põe em primeiro lugar (abas e busca de hóspede) acrescentadas no topo.

| Necessidade | Biblioteca | Quando |
| --- | --- | --- |
| Abas da reserva com navegação por setas | Radix Tabs | Primeiro: corrige a falha atual |
| Busca de hóspede com semântica de combobox (`GuestPicker`) | Radix Popover + cmdk | Junto das abas. É o combobox do shadcn |
| Janelas, menus e popovers | Radix, via shadcn | No primeiro caso real. A folha "Mais" é candidata, porque o qa-redteam achou falha de foco nela |
| Seleção de período (falta no catálogo) | react-day-picker | Filtros de reservas, rack e indicadores |
| Rack quartos × dias | @tanstack/react-virtual | Quando o rack for feito: o planejamento prevê grade virtualizada |
| Ordenar e paginar tabelas | @tanstack/react-table | Financeiro. Para listas simples, o Table local basta |
| Busca rápida no balcão | cmdk | Evolução futura, reaproveitando o mesmo cmdk do combobox |

O react-day-picker e o cmdk são as bases do Calendar e do Command do shadcn. Os dois @tanstack são da mesma família do @tanstack/react-query, que o PMS já usa. O mapa continua no modelo "Radix por baixo do `@hotel/ui`".

### Decisões

| Ponto | Decisão | Condições e motivo |
| --- | --- | --- |
| Direção: Radix por baixo do @hotel/ui | Aceita (15/11) | Um componente por vez, só no 5º semestre, com ADR. MUI, Mantine, Chakra e Ant Design descartadas. O Gabriel concordou em 11/11 |
| Fonte Inter antes de 10/12 | Aceita | O `apps/pms/src/index.css:7` já declara Inter, mas a fonte nunca é carregada, e o balcão cai na fonte do sistema. Hospedar a fonte com o app (`@fontsource-variable/inter`), sem CDN, porque a comanda funciona sem rede. Reconferir as telas de 375px já auditadas |
| lucide-react antes de 10/12 | Aceita | Hoje o PMS não tem nenhum ícone. Ícone só onde carrega significado (navegação, status), sempre com texto ao lado e `aria-hidden`. Import de um ícone por vez. Pronto até 24/11 |
| Setas nas abas da reserva | Corrigir à mão até 24/11 | Correção pequena e sem dependência nova. A acessibilidade vai ser avaliada (RNF-024 a 027), e esperar a revisão apontar pode empurrar a correção para depois do congelamento. O Radix Tabs substitui no 5º semestre |
| Foco da folha "Mais" | Aceita: corrigir à mão até 24/11 | É o 🟢-3 do qa-redteam da T-05.3 (`docs/qa/redteam_t053-painel-hoje_04nov2026.md`): o foco não entra na folha quando ela abre. Basta levar o foco para dentro. O Dialog/Sheet do Radix estreia nela no 5º semestre |
| Confirmações em janela (Dialog) | Manter inline | Mais rápido no balcão. Rever no 5º semestre |
| Toast (Sonner) | Adiar | O `Notice` do `@hotel/ui` atende hoje. Rever no 5º semestre |
| Quem aplica a Inter e o lucide-react | Sirlande | Depois do M8 (seed, prazo 17/11) e antes do congelamento de 24/11. Faz junto as setas das abas e o foco da folha "Mais" |

## Para o grupo decidir

- [x] Resolvido em 15/11: Radix por baixo do `@hotel/ui`, sem biblioteca com tema.
- [x] Resolvido em 11/11: nada antes de 10/12, exceto Inter e lucide-react, com as condições da tabela de decisões.
- [ ] Quem escreve o ADR no 5º semestre? Sugestão: o Gabriel, dono do shell do `apps/pms`.
- [x] Resolvido em 15/11: setas das abas corrigidas à mão até 24/11.
- [x] Resolvido em 15/11: o Sirlande aplica a Inter e o lucide-react depois do M8, até 24/11.
