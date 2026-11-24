# Repasses sem dono definido — 24/11/2026

Origem: QA explorador do roteiro da demonstração (`docs/qa/exploratorio_roteiro-demonstracao_24112026.md`), na `develop` `bf9cafe`.

## 🟡 A recepção vê "Novo quarto", "Nova categoria" e "Editar", e o clique a leva para "Hoje" sem aviso
- **Onde:** `/quartos` e `/quartos/categorias`, para RECEPTIONIST. Área da T-05.1, "de quem terminar primeiro"; o histórico tem commits do Gabriel e do Sirlande.
- **O que acontece:** as rotas de escrita estão só no gate de ADMIN (`roomsAdminRoutes`), mas os botões e links aparecem para a recepção. O clique cai em `/` sem explicação, e a API responde 403.
- **Sugestão:** renderizar essas ações só para ADMIN em `RoomsListPage` e `CategoriesListPage`.
- **Evidência:** `docs/qa/evidencias/roteiro-demonstracao_24112026/p8_papeis_rotas.mjs` (saída `recep /quartos/novo -> /`).
