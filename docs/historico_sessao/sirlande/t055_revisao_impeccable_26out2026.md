### 2026-10-26 — Sirlande (orquestrando Claude Code)

- **Branch:** `feature/t055-revisao-impeccable` · **Tarefa:** fechar a delegação da T-05.5 Fase A — item 4 do output (revisão com a **Impeccable**, `audit` e `critique`)
- **Estado:** ⏸️ **revisão feita, correções NÃO começadas** — sessão encerrada a pedido; retomar pelo §"Próxima sessão"

#### O que foi feito
1. Impeccable 4.8.0 instalado (plugin de marketplace, escopo do usuário: `/plugin marketplace add pbakaus/impeccable` + `/plugin install impeccable@impeccable`).
2. `/impeccable init` → `frontend/apps/pms/PRODUCT.md`: resumo do `DESIGN_PMS.md`, que prevalece em conflito. Respostas do Sirlande: arquivo em `apps/pms`, versionado; posicionamento "pousada pequena BR"; TCC sem clientes reais (nada pode ser inventado); acessibilidade RNF-024 a RNF-027 + WCAG 2.1 AA.
3. `/impeccable audit` e `/impeccable critique` da comanda (`features/accounts/`), com backend real no banco descartável `gestao_hotel_t047`, Chromium a 375 × 812 e 1280 × 800, detector no código e nas páginas renderizadas (modo `--cdp`). O critique rodou com as duas avaliações isoladas que o Impeccable exige.
4. `.impeccable/` no `.gitignore` (decisão do Sirlande: o registro local não é versionado; o que importa está aqui).

#### Resultado
- **Audit: 15/20 (bom).** Acessibilidade 3, desempenho 3, tokens 3, celular 3, coerência 3. Console sem erro.
- **Critique: 24/40.** Prevenção de erro foi a pior heurística (1).

| # | Sev. | Achado | Onde | Correção prevista |
|---|---|---|---|---|
| 1 | P0 | O cardápio desce a cada lançamento: o toque seguinte cai no produto errado (reproduzido) | `AccountPage.tsx:102-109` (ItemList acima do MenuGrid); `ItemList.tsx` (itens da fila sem limite) | **Decidido:** lista de itens com altura máxima e rolagem própria, itens da fila dentro do limite; ordem da tela mantida |
| 2 | P0 | Toque duplo fecha a conta: "Confirmar fechamento" nasce no mesmo lugar, já habilitado (reproduzido com 120 ms) | `StaffActions.tsx:94-105` | Ignorar toques ~400 ms depois de aparecer; confirmação em linha própria, mostrando o total; voltar para `/comanda` com "Conta fechada" (`feedback.tsx`) |
| 3 | P1 | Contas indistinguíveis: duas "Mesa 3" abertas, subtítulo de tipo redundante, ordem instável | `OpenAccountForm.tsx`, `AccountsListPage.tsx` | Avisar rótulo já aberto (cache da lista), hora de abertura (`opened_at`) no lugar do tipo, ordem estável. **Total por conta exige backend** (o `GET /accounts` não devolve) |
| 4 | P1 | "Lançado" com ponto verde nos 5 s antes do envio; "Desfazer" numa linha 2× tira só 1 sem dizer | `ItemList.tsx:13` | "Aguardando envio" com ponto neutro; "Desfazer 1" quando a linha tem mais de 1 |
| 5 | P2 | Contraste 2,5:1: preço riscado da cortesia (`ItemList.tsx:79`, `:92`) e placeholder (padrão do Tailwind, vale para todo `Input` do `@hotel/ui`) | `ItemList.tsx`, `packages/ui` Input | `text-gray-500` (4,8:1); placeholder no `Input` compartilhado |
| 6 | P2 | Busca com 42 px (RNF-024 pede 48) | `AccountsListPage.tsx:77` | Tamanho `comfortable` |
| 7 | P2 | Aviso de "sem conexão" só aparece depois de uma consulta refeita | `AccountPage.tsx:67`, `AccountsListPage.tsx:59` | Ler o `onlineManager` do TanStack Query |
| 8 | P2 | Formulário de abrir conta abaixo da dobra; "Ver conta" no rodapé fixo cobre o cardápio | `AccountsListPage.tsx`, `StaffActions.tsx` | Rolar até o formulário; bill fora do rodapé fixo |

**Recusados, com motivo:**
- Fonte Inter (`overused-font`): decisão do preset compartilhado; tipografia só muda por token (DESIGN_PMS §4).
- "Mais lançados": é a Fase B (CA-05.5.k).
- Total na linha da lista: precisa de backend.

**Repasse ao Gabriel (AppShell):** "Sair" com 36 px de altura; menu inferior do garçom com um item só ("Comanda"), ocupando 48 px sem função.

**Perguntas de produto abertas, que a revisão levantou:**
- O fechamento de conta devia ficar só no balcão?
- Conta INTERNAL deve aceitar item faturável lançado pelo garçom? Hoje aceita, e o total deixa de ser R$ 0,00.

#### Próxima sessão
1. **Decidir o escopo** (pergunta em aberto). Recomendação: P0 + P1 + itens 5 e 6, só no frontend da comanda, cerca de 1 dia.
2. Branch nova a partir da `develop` (`feature/t055-correcoes-impeccable`). Ler o `reference/craft-floor.md` do Impeccable antes de editar a interface. Testes de lógica (Vitest) antes da correção, quando houver lógica.
3. Recriar o banco descartável (`gestao_hotel_t047`) antes das capturas, porque os testes do navegador gravaram itens na Mesa 3 e uma segunda "Mesa 3" fechada: `DROP DATABASE` → `CREATE` → `node command.js migrate` → `node command.js seed`.
4. Verificar no navegador a 375 × 812, rodar `impeccable detect --cdp` de novo, `qa_checks.sh`, qa-redteam e um novo `/impeccable critique` para comparar a nota (24/40).
5. Registrar no anexo da SPEC-05 (`SPEC-05-decisoes-T-05.5.md`) o que foi aceito e recusado, e fechar o item 4 da delegação.

**Como rodar o navegador nesta máquina (WSL, sem sudo):** Chromium do `~/.cache/ms-playwright`, Playwright do cache npx. Bibliotecas que faltam (`libnspr4`, `libnss3`, `libasound2t64`): `apt-get download` + `dpkg-deb -x` numa pasta e `LD_LIBRARY_PATH`. Detector na página logada: Chromium com `--remote-debugging-port`, depois `impeccable detect --cdp <porta> --target localhost:5173 --json`.
