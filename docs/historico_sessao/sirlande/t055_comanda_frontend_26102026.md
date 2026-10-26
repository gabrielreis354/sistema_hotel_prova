### 2026-10-26 — Sirlande (orquestrando Claude Code)

- **Branch:** `feature/t055-comanda` · **Tarefa:** T-05.5 Fase A (SPEC-05), CA-05.5.a a j
- **Horário:** sessão única, 26/10 (mesma sessão da T-04.5 e da T-04.6)
- **Objetivo:** comanda do garçom no celular, com fila offline, sobre o backend da SPEC-04

#### Decisões
| # | Decisão | Escolha | Motivo |
|---|---|---|---|
| C-1 | Onde vive a fila | Módulo + `useSyncExternalStore` + `localStorage`, sem Zustand | Estado global novo exige acordo (delegação) |
| C-2 | `client_item_id` | UUID v4 gerado no toque, por `getRandomValues` | `randomUUID` não existe fora de HTTPS (celular pelo IP da rede) |
| C-3 | Desfazer | Janela de 5 s antes do envio | Garçom não exclui item gravado (D-8) |
| C-4 | Respostas | Rede/5xx → fila; 422/404/403 → recusado com motivo; 401 → espera login; 409 → bug | Só a recusa do servidor tira o item da fila (RN-008) |
| C-5 a C-10 | Rodapé, fila por usuário, uma chave por item, fechamento, conta longa, movimento | Ver anexo | — |

Detalhe e justificativas: `docs/specs/anexos/SPEC-05-decisoes-T-05.5.md`.

#### O que foi feito
1. `api-client` regenerado: o cliente não tinha `/accounts`.
2. Lógica pura antes da tela (TDD): fila (`queueCore`), total com cortesia (`accountTotals`), busca (`accountFilter`) — 46 testes.
3. Telas `/comanda` e `/comanda/:id`, com os quatro estados, Button/Input/Field de `@hotel/ui` e dinheiro só por `@hotel/domain`.
4. Verificação no navegador (Playwright, 375 × 812) com o backend real num banco descartável (`gestao_hotel_t055`). Para o Chromium abrir no WSL, 3 bibliotecas foram baixadas para o scratchpad, sem instalar nada no sistema.
5. Revisão de design com a emil-design-eng (o Impeccable não está instalado nesta máquina).
6. qa-redteam em 3 rodadas; 5 🟡 na 1ª e 3 🟡 na 2ª, todos corrigidos e provados no navegador.

#### Verificação
- Vitest: 47 · `tsc`: ok · `vite build`: ok · `qa_checks.sh`: 3 avisos pré-existentes, nenhum da comanda
- Navegador: roteiro do fluxo 18/18 (várias execuções) e roteiro dos achados 15/15 — offline com recarga sem duplicata, servidor pendurado, envio seguinte travado, rede caindo com a conta aberta, aparelho compartilhado, duas abas, aba fechada no meio do envio
- Capturas: `docs/historico_sessao/sirlande/capturas_t055_26102026/`
- qa-redteam: `docs/qa/redteam_t055-comanda_26out2026.md` (APROVADO COM RESSALVAS), `_delta_` (APROVADO COM RESSALVAS), `_delta2_` (**APROVADO**)

#### Commits
| Commit | Mensagem |
|---|---|
| `3482f59` | `fix(comanda): inicio do envio obrigatorio e teste do limite de 15 s (🟢 da reauditoria)` |
| `51dba9a` | `fix(comanda): achados da reauditoria delta da T-05.5` |
| `49b0131` | `test(comanda): envio largado por aba fechada e prazo sem AbortSignal.timeout` |
| `bea0a0e` | `fix(comanda): achados do qa-redteam da T-05.5 (fila com rede ruim e aparelho compartilhado)` |
| `dc1b76f` | `test(comanda): desfazer so pelo dono e no prazo; entrada da fila validada` |
| `0553b8b` | `fix(comanda): ajustes da verificacao no celular e da revisao de design` |
| `8f464a7` | `feat(comanda): telas da lista de contas e da conta (CA-05.5.a a j)` |
| `e42c2a5` | `feat(comanda): API das contas, queries e motor da fila offline` |
| `b36b7a7` | `feat(comanda): logica da fila offline e do total da conta (CA-05.5.c a h)` |
| `ed19355` | `test(comanda): fila offline e total com cortesia (T-05.5)` |
| `d4b480e` | `chore(api-client): regenera o cliente com /accounts e /reservations/{id}/accounts` |
| _(este)_ | `docs(spec-05): T-05.5 Fase A concluida, decisoes C-1 a C-10, auditorias e relatorio` |

#### Pendências
| # | Pendência | Prioridade | Observação |
|---|---|---|---|
| 1 | Fase B: mais lançados (k), transferir (l), dividir no fechamento (m) | 🟢 | Precisa de backend antes |
| 2 | Instalar o Impeccable e rodar `audit`/`critique` | 🟢 | Pedido da delegação; antes do congelamento (24/11) |
| 3 | `flush`/`commit`/`readDisk` sem teste unitário (só no navegador) | 🟢 | Achado 🟢 do qa-redteam |
| 4 | A fila só anda com a comanda aberta; o runner no layout é do Gabriel | 🟢 | Avaliar no ensaio |
| 5 | Projeto não declara navegadores-alvo (`build.target`) | 🟢 | O fallback do prazo cobre iOS 15; declarar evita a próxima surpresa |
| 6 | Banco descartável `gestao_hotel_t055` ficou no Postgres local | 🟢 | `DROP DATABASE gestao_hotel_t055;` quando não precisar mais das telas de demonstração |
