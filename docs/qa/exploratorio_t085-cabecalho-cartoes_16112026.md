# QA explorador — T-08.5 Cabeçalho e cartões (SPEC-08)
**Branch:** feature/t085-cabecalho-cartoes (e697497) · **Tela(s):** `/`, `/reservas`, `/reservas/:id` (Resumo e Conta), `/hospedes`, `/hospedes/:id`, `/hospedes/novo`, `/quartos`, `/quartos/categorias`, `/comanda/:id`, `/indicadores` · **Data:** 16/11/2026 · **Papéis usados:** RECEPTIONIST, ADMIN, WAITER
**Viewports:** 1280×800, 768×1024, 640×400 (equivale a 1280 com zoom de 200%), 375×812 · **Achados no escopo:** 8 (🔴 0 · 🟡 4 · 🟢 4) · **Repassados:** 2

## Veredito
**APROVADO COM RESSALVAS**

Nenhum 🔴. O `PageHeader` cumpre o que promete nas 7 telas: título, contexto embaixo e uma ação principal. No celular a ação ocupa a largura toda (343 px de 375) com 48 px de altura, e não há rolagem lateral em nenhuma tela medida. As `Section` não perderam nenhum campo da leitura da reserva nem da ficha do hóspede. Trocar de aba e recarregar não deixou tela em branco. O garçom não alcança nenhuma das telas, e a reserva de outro hotel dá 404 com mensagem.

As ressalvas ficam na ficha do hóspede, a tela que a T-08.5 mais mexeu:
- a recepção vê "Excluir" habilitado, passa pela confirmação nova e só então recebe um 403, com "Tente novamente";
- no celular, o status novo (ponto e rótulo) sai cortado no histórico;
- o foco se perde ao fechar a confirmação;
- o estado de erro da ficha não tem saída.

## Achados no escopo

### 🟡 [Papéis / CA-08.f] A recepção vê "Excluir" habilitado, confirma e só então recebe 403 com "Tente novamente"
**Onde:** `/hospedes/:id`, botão "Excluir" no `PageHeader` → alertdialog "Confirmar exclusão do hóspede" → botão "Sim, excluir hóspede"
**Passos:**
1. Entrar como `recepcao@qa.test` / `senha123`.
2. Cadastrar um hóspede fictício em `/hospedes/novo` (por exemplo "Zeca Teste", `zeca@qa.test`).
3. Na ficha dele, clicar em "Excluir" e depois em "Sim, excluir hóspede".

**Esperado:** a ação indisponível para o papel continua visível, mas desabilitada e com o motivo em texto (SPEC-08 CA-08.f). O backend só deixa o ADMIN excluir (`guestRouter.js:20`, `requireRole('ADMIN')`). Um erro precisa dizer o que fazer (critério do time: erro com saída).
**Obtido:**
- "Excluir" aparece habilitado para a recepção.
- A confirmação abre normalmente, e o `DELETE /api/guests/:id` responde **403** `{"error":"Acesso não autorizado"}`.
- A tela mostra "Não foi possível remover o hóspede. Tente novamente." (`guestsApi.ts:66-71`, que só diferencia o 409). Tentar de novo nunca vai funcionar, e a confirmação continua aberta.
- O parágrafo de erro não tem `role="alert"`, então o leitor de tela não anuncia a falha.

Com `admin@qa.test`, o mesmo fluxo exclui (204), e o duplo clique gera um único DELETE.
**Evidência:** requisição 156 da sessão, `[DELETE] /api/guests/480e9084-… => [403]`, corpo `{"error":"Acesso não autorizado"}`. Na árvore de acessibilidade, logo depois, aparece `paragraph: Não foi possível remover o hóspede. Tente novamente.`, com o alertdialog ainda aberto (`evidencias/t085-cabecalho-cartoes_16112026/mcp_auto/page-2026-11-16T16-33-45-001Z.yml`).
**Sugestão:**
- Para quem não é ADMIN, renderizar "Excluir" desabilitado, com o motivo em texto ("Só o administrador exclui cadastros"), no padrão do `WriteButton` de quartos.
- No `deleteGuest`, tratar o 403 com essa mesma frase.
- Pôr `role="alert"` no `delError`.

### 🟡 [Tela / status] No celular, o status do histórico de estadias sai cortado
**Onde:** `/hospedes/:id`, seção "Histórico de estadias", coluna Status (`ReservationStatusBadge`, novo na T-08.5)
**Passos:**
1. Entrar como `recepcao@qa.test`.
2. Janela de 375×812.
3. Abrir a ficha de "Ana Hospedada" (`/hospedes/5c0617c5-d113-4fca-880e-313954f21c34`).

**Esperado:** o status com cor **e** rótulo legível (critério do time; DESIGN_PMS §5). Nada some sem rolagem.
**Obtido:**
- A tabela mede 368 px dentro de um `Card` de 341 px com `overflow-hidden`.
- O selo "● Hospedado" é cortado na borda direita (aparece "● Hospedad"), sem rolagem para ver o resto.
- O selo de ponto e rótulo, que entrou nesta branch, é cerca de 28 px mais largo que o texto puro de antes. É ele que empurra a tabela para fora do cartão.
- Em 640 px e acima cabe (606/606).

**Evidência:**
- `evidencias/t085-cabecalho-cartoes_16112026/hospede_historico_cortado_375.png`: o cartão do histórico, com o selo verde cortado na borda direita;
- `hospede_confirmacao_375.png`: a tela inteira;
- medição: `table.scrollWidth = 368`, `wrapper.clientWidth = 341`, `overflow-x: hidden`.

**Sugestão:** trocar o `overflow-hidden` do cartão do histórico por `overflow-x-auto`, ou empilhar Entrada/Saída numa só coluna abaixo de `sm`, como a lista de reservas já faz no celular.

### 🟡 [Teclado / leitor de tela] O foco cai no `<body>` ao fechar a confirmação com "Manter hóspede"
**Onde:** `/hospedes/:id`, alertdialog "Confirmar exclusão do hóspede" → "Manter hóspede"
**Passos:**
1. Entrar como `recepcao@qa.test`, janela de 768×1024, abrir a ficha de "Ana Hospedada".
2. Focar "Excluir" e apertar Enter. O foco vai para o alertdialog (a correção do 🟡-2 do red team funciona).
3. Tab, Tab (até "Manter hóspede") e Enter.

**Esperado:** o foco volta para o botão que abriu a confirmação ("Excluir"), como pede o padrão de diálogo (CATALOGO.md: "a recepção opera no teclado").
**Obtido:**
- `document.activeElement` passa a ser o `BODY`, e o leitor de tela não anuncia nada.
- O próximo Tab vai para "← Voltar para hóspedes", pulando "Editar" e "Excluir". É a sequência de foco do Chrome a partir do nó removido.
- O red team corrigiu a abertura, mas o fechamento ficou de fora.

**Evidência:** saída do `browser_evaluate` depois do Enter em "Manter hóspede": `{"open": false, "active": "BODY:…"}`. Em seguida, depois de um Tab: `"A:← Voltar para hóspedes"`.
**Sugestão:** guardar a ref do botão "Excluir" e chamar `focus()` nele quando `confirming` voltar a `false`. Para ficar mais simples: manter "Excluir" montado e desabilitado enquanto a confirmação está aberta, como o "Cancelar reserva".

### 🟡 [Estados] Ficha de hóspede inexistente: 8 s de "Carregando…" e depois uma linha solta, sem "Tentar de novo" e sem volta
**Onde:** `/hospedes/:id`, ramo `isError || !guest` (`GuestDetailPage.tsx:52`)
**Passos:**
1. Entrar como `recepcao@qa.test`.
2. Abrir `/hospedes/480e9084-1d7d-4118-aafc-64977c38e62f` (o hóspede excluído neste teste) ou qualquer UUID que não exista.

**Esperado:** erro com "Tentar de novo" e um caminho de volta, dentro do layout da página (critério do time: quatro estados). A T-08.5 já fez isso na lista (`ErrorState`), e a reserva inexistente mostra um `alert` com "← Voltar para reservas".
**Obtido:**
- Cerca de 8 s de "Carregando…", porque o React Query repete o 404 três vezes.
- Depois, só `<p>Hóspede não encontrado.</p>`: sem `PageHeader`, sem `role="alert"`, sem "Tentar de novo" e sem link de volta.
- O mesmo texto aparece para um 500 ou para a falta de rede, e aí "não encontrado" é falso.

**Evidência:** `evidencias/t085-cabecalho-cartoes_16112026/hospede_nao_encontrado_1280.png`, a área principal vazia com uma linha vermelha no topo. O `browser_evaluate` mostra que o texto apareceu em cerca de 9 s de página.
**Observação:** o defeito é anterior à branch (a linha 52 não está no diff), mas está na tela que a T-08.5 reformou e quebra o critério de "tela pronta".
**Sugestão:** separar o 404 (mensagem e "← Voltar para hóspedes") dos outros erros (`ErrorState` com `onRetry`). Usar `retry: false` para o 404 no `useGuest`.

## Melhorias de uso (🟢)

1. **Na confirmação de exclusão, o primeiro Tab cai em "Sim, excluir hóspede".** Com o foco no alertdialog, Tab e Enter excluem. Focar "Manter hóspede" ao abrir, como sugeriu o red team, deixa o caminho seguro como padrão.
   - Quem ganha: a recepcionista com fila, que opera no teclado e aperta Enter por reflexo.
   - Quanto: nenhum clique a mais, uma exclusão acidental a menos.

   Nem Esc fecha a confirmação, apesar do `role="alertdialog"`. O "Cancelar reserva" também não fecha com Esc, então hoje o app é coerente. Se um dos dois ganhar Esc, os dois devem ganhar.
2. **O texto da confirmação não se adapta ao hóspede.**
   - Para um hóspede **sem** reservas, a tela diz "As reservas dele continuam…".
   - Para uma hóspede, diz "dele".
   - Para quem está **hospedado agora**, o histórico logo abaixo mostra "● Hospedado", mas a confirmação não avisa que a estadia em andamento vai virar "Hóspede removido".

   A página já tem `stays.data` e pode escolher o texto. Quem ganha: a recepcionista, que decide com a informação na frente, em uma leitura. O risco de fundo (o backend aceitar excluir com CHECKED_IN) já é conhecido: `docs/qa/repasses/para_dono-indefinido_15112026.md`.
3. **Fio duplo entre as abas e a primeira seção da reserva.** A `tablist` tem `border-b`, e a `Section` "Hóspede" logo abaixo tem `border-t`, com cerca de 20 px entre as duas. Ficam duas linhas cinza seguidas. Ver `evidencias/t085-cabecalho-cartoes_16112026/reserva_chegada_1280.png`, em y ≈ 432 e 453. Sugestão: tirar o fio da primeira `Section` do painel (`first:border-t-0`).
4. **"Reservas" não tem contexto no cabeçalho, e "Hóspedes" tem ("5 hóspedes").** O período e a contagem estão no pé da tabela ("Página 1 de 1 · 5 reservas"). Pôr "5 reservas · 16/11 a 23/11" no `context` dá ao gerente o número sem rolar, e alinha as duas listas. Melhoria de consistência: zero cliques.

Observação sem ação: depois de excluir como ADMIN, o app ainda faz dois `GET /api/guests/:id` que respondem 404 antes de navegar para a lista. Não aparece nada na tela, só dois erros no console.

## Repassados a outro dev
| Sev. | Achado | Onde | Dono | Repasse |
|------|--------|------|------|---------|
| 🟡 | CA-08.g em 768 px: menu lateral e atalhos de período com 36 px, abas Quartos/Categorias com 38 px | `AppShell.tsx:196`, `ReservationsListPage.tsx:69`, `RoomsHeader.tsx` | Sirlande (SPEC-08) | `docs/qa/repasses/para_sirlande_16112026.md` |
| 🟡 | CA-08.e: "Fazer check-out" e "Registrar pagamento" como primary juntos na aba Conta; atalho selecionado com a cor do primary | `/reservas/:id?aba=conta`, `/reservas`, `/indicadores` | Sirlande (SPEC-08) | `docs/qa/repasses/para_sirlande_16112026.md` |

**Já conhecidos (não contam):**
- excluir hóspede com estadia ativa (`para_dono-indefinido_15112026.md`);
- filtro de hóspedes no navegador (SPEC-05, item da T-05.12);
- `Section` sem `aria-labelledby` e "Contato" com CPF (🟢 do red team de 15/11);
- linha a mais no topo da conta do garçom (🟢 do red team);
- `/api/analytics/*` respondendo 500 neste ambiente: o analytics-service não sobe no `qa_explorador_ambiente.sh`, então os números de Hoje e Indicadores ficam em "—". Isso serviu para ver o `ErrorState` com "Tentar de novo" em Indicadores.

## Mapa de cobertura
| Eixo (§3) | Tentado? | Como | Resultado |
|---|---|---|---|
| Entrada | Parcial | Nome com `<b>x</b>`; nome de 70 caracteres com hifens em 375 e 768 px | Mostrado como texto; o título quebra sem rolagem lateral. Sem dinheiro no escopo |
| Tempo | Sim | Duplo clique em "Sim, excluir hóspede" (ADMIN); F5 em `?aba=conta`; troca Conta→Resumo; voltar do navegador | Um único DELETE; nenhuma tela em branco |
| Rede | Não | — | `ambiente.env` traz `QA_REDE_INDISPONIVEL` (sem registro do Playwright MCP no worktree) |
| Sessão e papéis | Sim | WAITER abrindo `/hospedes/:id`, `/reservas/:id`, `/quartos/categorias`, `/indicadores`, `/`; RECEPTIONIST abrindo a reserva `de_outro_hotel`; RECEPTIONIST excluindo hóspede | O garçom sempre volta para `/comanda`; a reserva de outro hotel dá 404 com "Reserva não encontrada" e link de volta; a exclusão pela recepção dá 403 (🟡 acima) |
| Tela | Sim | 1280, 768, 640 (zoom de 200%) e 375 px em Hoje, Reservas, Hóspedes, ficha, reserva (3 estados), Quartos, Categorias, Comanda e Indicadores; medição de altura dos alvos e de `scrollWidth` | Ação do cabeçalho com 343×48 em 375 px; `scrollWidth` igual à largura em todas; status cortado na ficha (🟡); alvos de 36–38 px em 768 px (repasse) |
| Teclado | Sim | Enter em "Excluir", Tab dentro da confirmação, Esc, Enter em "Manter hóspede" | O foco entra na confirmação; ao fechar, se perde (🟡); Esc não fecha (🟢, coerente com a reserva) |
| Leitura | Sim | `browser_snapshot` das telas | h1 por página, h2 por `Section`, `tablist`/`tab`/`tabpanel` na reserva, alertdialog com nome; o `delError` não é `alert` (🟡) |
| Estados | Sim | Vazio (Reservas em 01–05/06/2027, busca "zzz" em Hóspedes), carregando, erro (Indicadores com o analytics fora, ficha de hóspede inexistente) | O vazio de Reservas tem um único primary (CA-08.e corrigido); `ErrorState` com "Tentar de novo" em Indicadores; a ficha inexistente fica sem saída (🟡) |
| Domínio | Parcial | Soma da conta (3 × 333,33 = 999,99; 200 + 12,50 + 200 = 412,50); ações indisponíveis por status (PENDING, CHECKED_IN, CHECKED_OUT) | Saldos batem; toda ação indisponível aparece desabilitada e com motivo, exceto a exclusão de hóspede (🟡) |

## Não foi possível testar
- **Rede** (sem rede, lenta, 5xx injetado): o `ambiente.env` marca `QA_REDE_INDISPONIVEL`, e o MCP foi registrado na pasta da raiz. Por isso o `ErrorState` da lista de hóspedes (novo nesta branch) não foi provocado. O erro só foi visto em Indicadores, onde o 500 é real.
- **Lista de hóspedes vazia:** o tenant de QA tem hóspedes, e excluir todos estragaria o cenário de reservas.
- **Tema escuro e movimento reduzido:** não tentados, fora do que a T-08.5 mudou.
- **Dado residual:** ficou no banco `gestao_hotel_qa` o hóspede fictício "Maria-Aparecida-Conceicao-dos-Santos-Albuquerque-Cavalcanti-Teste Longo" (`maria.longo@qa.test`), sem reserva. O "Zeca Teste <b>x</b> Exclusão" foi excluído pelo ADMIN.

## Comandos rodados pelo Bash
```
cat /tmp/gesway-qa-explorador-338567352/dados.json; sed 's/=.*/=.../' /tmp/gesway-qa-explorador-338567352/ambiente.env; grep -i REDE …/ambiente.env; git -C wt-spec08b branch/log/diff --stat; ls docs/qa docs/qa/repasses
sed -n 100,130p docs/specs/SPEC-08-acabamento-corporativo.md; cat docs/qa/repasses/*_15112026.md; git diff origin/develop...HEAD -- GuestDetailPage.tsx PageHeader.tsx
cat packages/ui/src/Button.tsx; cat apps/pms/src/features/rooms/components/Actions.tsx; ls /tmp/gesway-qa-explorador-338567352/
cat > <scratchpad>/medir.js (função de medição usada no browser_evaluate)
grep -o '^[A-Z_]*' …/ambiente.env; ls ~/.npm/_npx/*/node_modules/ | grep playwright; ls ~/.cache/ms-playwright
grep -rhn "path=" apps/pms/src/routes App.tsx
git diff origin/develop...HEAD -- (ReservationsListPage, rooms/, TodayPage, accounts, analytics, GuestsListPage); grep -rln "768" docs/qa/repasses docs/specs/SPEC-08*
grep -rln "filterGuests…" docs/qa docs/specs; grep -n … SPEC-05
git diff origin/develop...HEAD -- ReservationDetailPage.tsx primitives.tsx
grep -rn "Registrar pagamento" docs/specs docs/qa …; ls docs/specs/anexos; ls docs/qa | grep t08; grep -n -i "primary|pagamento" docs/qa/redteam_spec08-minima_15nov2026.md docs/qa/revisao_telas_prontas_15112026.md
grep -n "delete|router." services/core-service/routes/apis/guestRouter.js; grep -rn "remover o hóspede" frontend/…/guests; grep (repasses e SPEC-05 por exclusão de hóspede)
sed -n 55,75p frontend/apps/pms/src/features/guests/guestsApi.ts
grep -rln "excluir hóspede…" docs/; grep -rn "403" docs/qa/*.md | grep hósped; grep -n -i "excluir|403|admin" docs/qa/redteam_frontend_fase1_hospedes_07ago2026.md
sed -n 18,40p RoomsHeader.tsx; grep -n "min-h|h-9|py-" AppShell.tsx; grep -n "compact" ReservationsListPage.tsx
grep -rn "ACCOUNT_TYPE_LABEL" -A8 frontend/apps/pms/src/features/accounts
sed -n 4p docs/qa/evidencias/console-2026-11-16T16-35-37-574Z.log
sed -n 30,55p GuestDetailPage.tsx; grep -rn "Hóspede não encontrado|GuestDetailPage" docs/specs docs/qa/repasses …; grep -n -i "hósped" docs/qa/revisao_telas_prontas_15112026.md
git check-ignore -v docs/qa/evidencias/x.png (raiz e worktree); ls docs/qa/evidencias
mkdir -p wt-spec08b/docs/qa/evidencias/t085-cabecalho-cartoes_16112026/mcp_auto; mv (capturas e snapshots automáticos do MCP da raiz para essa pasta)
ls docs/qa/repasses | grep 1611; grep -n "§3|§7" docs/DIVISAO_TRABALHO_TIME_09set2026.md
```
Nenhum comando alterou código, configuração ou o ambiente. Os dados foram criados só pela tela, no `gestao_hotel_qa`.
