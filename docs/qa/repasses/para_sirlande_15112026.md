# Repasse para Sirlande — 15/11/2026
Origem: qa-redteam da T-08.5 (`feature/t085-cabecalho-cartoes`). Achados anteriores a essa branch, na trilha da SPEC-08.

### 🟡 [CA-08.e] Dois `primary` visíveis quando a lista está vazia
**Onde:** `frontend/apps/pms/src/features/reservations/ReservationsListPage.tsx:62` e `:110`; `frontend/apps/pms/src/features/rooms/RoomsListPage.tsx:26` e `:41`; `frontend/apps/pms/src/features/rooms/CategoriesListPage.tsx:28` e `:43`
**Cenário:** um período sem reservas (ou um hotel sem quartos/categorias, com admin logado) mostra "Nova reserva" / "Novo quarto" / "Nova categoria" como `primary` no cabeçalho e outra vez no `EmptyState`.
**Regra violada:** SPEC-08 CA-08.e; GUIA_UI_CORPORATIVA §3 regra 1.
**Correção sugerida:** fazer como a T-08.5 fez em `GuestsListPage.tsx`: a ação do `EmptyState` vira `variant="secondary"` (`ButtonLink` / `WriteButton`).

### 🟡 [CA-08.g] `WriteButton` com 32 px a partir de 768 px
**Onde:** `frontend/apps/pms/src/features/rooms/components/Actions.tsx:9` (`RESPONSIVE = 'md:h-8 md:min-h-0 ...'`)
**Cenário:** num tablet de 768 px, "Novo quarto" e "Nova categoria" no cabeçalho, e "Editar" na linha, ficam com 32 px de altura. O CA-08.g pede 48 px em 375 **e** em 768 px.
**Regra violada:** SPEC-08 CA-08.g; RNF-024.
**Correção sugerida:** trocar `md:` por `xl:` (ou `lg:`) no `RESPONSIVE`, ou deixar o compacto só na linha da tabela e manter o botão do cabeçalho sempre em `comfortable`.
