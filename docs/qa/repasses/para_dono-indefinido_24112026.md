# Repasses sem dono definido — 24/11/2026

Origem: QA explorador do roteiro da demonstração (`docs/qa/exploratorio_roteiro-demonstracao_24112026.md`), na `develop` `bf9cafe`.

> **Atualização de 24/11 (Sirlande):** o achado **não se confirma pela tela**. Logado como `recep1`, "Novo quarto", "Nova categoria" e "Editar" aparecem **desabilitados**, com o motivo no `title` e a faixa "Modo consulta". É o desenho do princípio 11 (a ação proibida fica visível e desabilitada com o motivo). O que leva ao painel Hoje é digitar `/quartos/novo` na barra: a `RequireRole` manda cada papel para a página inicial dele, no app inteiro. Por isso não houve mudança de código.

## 🟡 A recepção vê "Novo quarto", "Nova categoria" e "Editar", e o clique a leva para "Hoje" sem aviso
- **Onde:** `/quartos` e `/quartos/categorias`, para RECEPTIONIST. Área da T-05.1, "de quem terminar primeiro"; o histórico tem commits do Gabriel e do Sirlande.
- **O que acontece:** as rotas de escrita estão só no gate de ADMIN (`roomsAdminRoutes`), mas os botões e links aparecem para a recepção. O clique cai em `/` sem explicação, e a API responde 403.
- **Sugestão:** renderizar essas ações só para ADMIN em `RoomsListPage` e `CategoriesListPage`.
- **Evidência:** `docs/qa/evidencias/roteiro-demonstracao_24112026/p8_papeis_rotas.mjs` (saída `recep /quartos/novo -> /`).
