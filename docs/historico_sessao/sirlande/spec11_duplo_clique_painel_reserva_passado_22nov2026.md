### 2026-11-22 (parte 3) — Sirlande (orquestrando Claude Code): SPEC-11

- **Branches:** `fix/spec11-duplo-clique` (#202), `fix/spec11-painel-hoje` (#203), `fix/spec11-reserva-passado` (#204) e esta (`docs/sessao-sirlande-spec11-22nov`)
- **Objetivo:** assumir a SPEC-11 inteira (proposta no #179), na ordem do parecer de 22/11: T-11.3 → T-11.4 → T-11.2 → T-11.1
- **Resultado:** T-11.3, T-11.4 e T-11.2 mergeadas na `develop`. A T-11.1 foi feita e mergeada pelo Gabriel no #205, enquanto o plano dela esperava aprovação nesta sessão. **A SPEC-11 está inteira na `develop`.**

#### Tabela de prioridade usada
| Ordem | Tarefa | Itens | PR |
|---|---|---|---|
| 1 | T-11.3, duplo clique e 422 sem código interno | A, B | #202 |
| 2–3 | T-11.4, painel Hoje sem rede e cartões em dia | G, F | #203 |
| 4 | T-11.2, reserva com entrada no passado | E | #204 |
| 5 | T-11.1, CPF inválido no balcão | C (+ D, só dígitos) | #205 (Gabriel) |
| 6 | Migração de normalização do CPF | CA-11.e | 5º semestre |

#### Decisões
| # | Decisão | Escolha | Motivo |
|---|---|---|---|
| 1 | Trava de duplo clique | `submitOnce` do #197 levado para `src/lib/submitLock.ts`, com `mutateOnce` e `promiseOnce` | O `isPending` chega à tela depois do 2º clique. Reaproveita a trava da comanda (DRY) |
| 2 | Detalhe da reserva e exclusão | Também passam pela trava | A spec não citava esses lugares, mas o objetivo dela é "nenhum clique duplo vira erro falso". A exclusão entrou pelo 🟡2 do red team |
| 3 | 422 de transição | O motivo do servidor só aparece se não tiver palavra em CAIXA_ALTA | Esconde `'CHECKED_IN'` e mantém "Reserva já cancelada" (o padrão é esconder) |
| 4 | Painel sem rede | O estado de carga conta o dado (`loadState`); o erro só aparece sem dado | "Carregando…" e o vazio mentem sem rede; com Wi-Fi sem internet a lista ficava trocada pelo erro |
| 5 | Cartões atrasados | `refetchInterval` de 60 s na ocupação e 2º refetch 3 s depois da ação | Consistência eventual (ADR-003), sem otimismo no cache. O parâmetro do `useOccupancy` é opcional: os Indicadores (área do Weslley) não mudam |
| 6 | Entrada no passado no PUT | Só barra quando a entrada **muda** (parecer 🟡1) | Estender a saída de quem entrou ontem e trocar o quarto da chegada atrasada continuam 200 |
| 7 | 422 da entrada no passado | Com `code: CHECK_IN_IN_PAST` | Mesmo molde do `CHECK_IN_TOO_EARLY`; a tela decide pelo código |
| 8 | Datas fora de `YYYY-MM-DD` | 400 antes de qualquer regra (`app/utils/isIsoDate.js`) | 🔴 do red team: `2026-11-3` passava pela comparação de texto e gravava 27 noites |
| 9 | T-11.4 antes do merge da T-11.3 | Worktree separado, com o PR apontando para a branch da T-11.3 | As duas mexem no `rows.tsx`, e o red team da T-11.3 lia a árvore principal |

#### Verificação
- **#202:**
  - pms com 61 arquivos e 579 testes;
  - mutação do `submitLock` derruba teste;
  - o `singleSubmit.test.ts` falha se alguma tela voltar ao `mutate` direto.
  - No navegador, triplo clique deu um pedido só em cinco ações: cadastrar categoria, cadastrar quarto, check-in no painel, check-out no detalhe e excluir quarto. Na `develop` antiga, a categoria saía com 3 POST (201, 409, 409).
- **#203:**
  - pms com 63 arquivos e 590 testes;
  - 8 mutantes derrubam teste, inclusive os da ligação no `TodayPage`, pelo render no servidor com o `onlineManager` offline.
  - No navegador (`context.setOffline`), três cenários:
    - sem dado e sem rede: a faixa e "Sem conexão" em cada bloco;
    - a rede volta: o painel se recupera;
    - com dado carregado e a rede caindo: a faixa aparece e o dado fica.
- **#204:**
  - core com 67 arquivos e 1335 testes, 27 deles novos;
  - 4 mutantes derrubam teste.
- CI dos três verde, inclusive o roteiro Playwright.
- **qa-redteam:**
  - T-11.3 e T-11.4: aprovado com ressalvas, tudo tratado;
  - T-11.2: **reprovado** por um 🔴 (datas fora do formato), corrigido no #204 sem nova rodada do red team.
  - Relatórios em `docs/qa/redteam_spec11-*_22nov2026.md`.
- **Sem verificar:**
  - ~~CA-11.g (cartões em até 10 s) e "Liberar quarto" no navegador~~: conferidos no compose depois do merge (ver "Conferência no compose", abaixo);
  - `pnpm e2e` local (Docker Desktop fechado); ficou só o CI;
  - leitor de tela de verdade.

#### Commits
| PR | Commits |
|---|---|
| #202 | `bceb8e7`, `c74ca0f`, `bf80b0f`, `2891f1c`, `b507d02`, `5edb750`, `81fa695` |
| #203 | `77969b3`, `b48d500`, `d0cd3d4`, `50b30ca`, `554f5f3`, `0438ea6` (mais o `d8c0276` do Gabriel) |
| #204 | `0120386`, `42d2d99`, `5e56d5e`, `9e68b78`, `c472004`, `b472352`, `43cf2cb` |

#### Pendências
| # | Pendência | Prioridade | Observação |
|---|---|---|---|
| 1 | ~~Conferir CA-11.g e "Liberar quarto" no compose~~ | ✅ | Conferido em 22/11 (ver "Conferência no compose") |
| 2 | ~~Nova rodada do red team na correção do 🔴 da T-11.2~~ | ✅ | Aprovada em 22/11; o 🟢-3 dela virou o teste do #209 |
| 3 | Reserva-bloco B2B pode nascer no passado | 🟢 Baixa | Repassado ao Gabriel (`docs/qa/repasses/para_gabriel_22112026.md`); pode ser decisão de produto |
| 4 | 3º clique no detalhe da reserva entre a resposta e o refetch | 🟢 Baixa | Dá 422 e troca o sucesso pelo erro. Já existia antes; depois do congelamento |
| 5 | Check-in sem rede fica pausado e envia sozinho quando a rede volta | 🟢 Baixa | Decisão de produto com o Gabriel: envio tardio ou aviso imediato |
| 6 | `DATE_RE` repetido em `ListReservationController` e `GetInternalConsumptionController` | 🟢 Baixa | Trocar pelo `isIsoDate` depois do congelamento (DRY) |
| 7 | `useOnline` só vê a interface de rede | 🟢 Baixa | Com Wi-Fi sem internet a faixa do painel não aparece; o dado fica e o erro some |

#### Conferência no compose (22/11, depois do merge do #202 ao #204)
- **Ambiente:**
  - `./start.sh compose-up --build` a frio, no projeto `gesway_teste` (volumes próprios), com Docker 29.5.3 e `PIX_PROVIDER=fake`;
  - depois `migrate`, `seed` e `outbox-initial-load`;
  - Vite do pms apontando para o nginx do compose.
- **Como:** como `recep1@aurora.example`, uma ação no painel Hoje e leitura dos cartões e dos blocos a cada 500 ms.

| Ação | Antes | Depois | Cartões batem com os blocos em |
|---|---|---|---|
| Check-in de uma chegada | 4 ocupados, 4 na casa | 5 e 5 | 3,5 s |
| Check-out de uma saída | 5 na casa, 1 em limpeza | 4 na casa, 2 em limpeza | 3,5 s |
| Liberar quarto | 9 livres, 2 em limpeza | 10 livres, 1 em limpeza | 3,5 s |

- **CA-11.g atendido:** os cartões batem com os blocos em até 10 s nas três ações.
- **O segundo refetch é o que faz isso funcionar.** Nas três ações, a consulta de ocupação na hora (0,1 s) ainda trouxe o número antigo, porque o analytics não tinha projetado o evento. A de 3 s depois trouxe o novo. Sem ela, os cartões só se acertariam no ciclo de 60 s.
- **"Liberar quarto" com triplo clique no confirmar:** 1 PUT (200) e a mensagem "Quarto 105 liberado — voltou para a venda.". Fecha o caso da T-11.3 que tinha ficado sem teste no navegador.
- **Depois:** o `gesway_teste` foi derrubado com `down -v`, e os volumes `sistema_hotel_prova_*` ficaram intactos.
