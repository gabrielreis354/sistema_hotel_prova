# SPEC-05 · Anexo — Decisões da T-05.5 (comanda do garçom, Fase A)

**Responsável:** Sirlande (orquestrando Claude Code) · **Data:** 26/10/2026
**Estado da tarefa:** ✅ Fase A concluída (CA-05.5.a a j), aprovada na 2ª reauditoria delta; correções da revisão Impeccable em 27/10 (§6) — Fase B (k, l, m) depende de backend
**Fonte:** delegação `docs/delegacoes/t055_comanda_frontend_sirlande_21out2026.md` (PR #99) e relatório `docs/historico_sessao/sirlande/t055_comanda_frontend_26102026.md`

> Primeiro anexo de decisões da SPEC-05. Numeração própria desta tarefa (C-1 em diante), para não confundir com a SPEC-04 (D-n).

---

## 1. O que foi produzido

| Entrega | CAs | Onde |
|---|---|---|
| Lista de contas abertas, busca, abrir mesa/balcão | a, i | `features/accounts/AccountsListPage.tsx`, `components/OpenAccountForm.tsx`, `accountFilter.ts` |
| Tela da conta: itens, cardápio em grade com chips, rodapé com total | b, c, d, h, i | `AccountPage.tsx`, `components/{ItemList,MenuGrid}.tsx`, `accountTotals.ts` |
| Fila offline com desfazer | e, f, g | `queueCore.ts` (lógica pura), `queueStore.ts` (aparelho, envio, abas) |
| Bill e fechamento para recepção e gerência | j | `components/StaffActions.tsx` |
| API pelo `api-client` gerado | — | `accountsApi.ts`, `queries.ts`; cliente regenerado com `/accounts` |
| Rotas `/comanda` e `/comanda/:id` | — | `App.tsx` (só o `element` e uma rota filha) |

Testes: 43 no app (Vitest, lógica pura). Verificação no navegador (Playwright, 375 × 812, backend real): 18 checagens do fluxo e 13 das correções da auditoria.

---

## 2. Decisões

| # | Decisão | Por quê |
|---|---|---|
| **C-1** | Fila em módulo próprio com `useSyncExternalStore` e `localStorage`, não em store Zustand | A delegação exige acordo para estado global novo. Só a comanda usa a fila |
| **C-2** | `client_item_id` gerado no toque, UUID v4 por `crypto.getRandomValues` | `crypto.randomUUID` só existe em contexto seguro; o celular abrindo o PMS pelo IP da rede local não teria |
| **C-3** | Janela de **5 s** com "Desfazer" antes do envio; toques no mesmo produto na janela somam na mesma linha | O garçom não exclui item gravado (DELETE é só ADMIN, D-8). Desfeito na janela, o item nunca chega ao servidor. Não conflita com o fechamento: se a recepção fechar a conta, o envio leva 422 e o item sai da fila com o motivo |
| **C-4** | Rede ou 5xx → fila, com espera crescente até 30 s; 422/404/400/403 → recusado, com o motivo em linguagem do balcão; 401 → espera o login; 409 → bug no console; 200 com `deleted_at` → "Excluído pela recepção" | A dúvida de rede nunca tira o item da fila — o reenvio é seguro pelo `client_item_id` (RN-008). Só a recusa explícita do servidor tira |
| **C-5** | Rodapé = total do servidor + pendentes do aparelho, com "inclui R$ X na fila" | A tela não finge que gravou (DESIGN_PMS §5). Na conta da suíte, o rótulo é "Consumo": a diária está no bill |
| **C-6** | Fila separada por usuário: cada um vê, soma, desfaz e envia só o que lançou | Aparelho compartilhado na troca de turno. Enviar a fila de outro com o login atual gravaria `created_by` errado. A lista avisa, sem nome, quando há lançamento de outro usuário esperando |
| **C-7** | Cada lançamento numa chave própria do `localStorage`, com o evento `storage` entre abas | Com uma chave só, duas abas gravavam a fila uma por cima da outra (🟡-5) |
| **C-8** | Recepção e gerência veem bill e fechamento na mesma tela; "Fechar conta" desabilitado com o motivo (conta de diária, conta não aberta, fila pendente) e confirmado em dois toques ~~que expiram em 5 s~~ (revisto em C-12) | Ação irreversível pede confirmação (DESIGN_PMS §5); ação indisponível mostra o motivo (RNF-026) |
| **C-9** | ~~Conta longa mostra os 3 últimos itens e "Ver todos"~~ (substituída por C-11) | O cardápio fica perto do polegar (CA-05.5.i) |
| **C-10** | Movimento: só o "afundar" de 150 ms no toque do produto; nenhuma animação de entrada nos itens | Lançado dezenas de vezes por turno — movimento repetido atrasa (emil-design-eng). Respeita `prefers-reduced-motion` |

**Fora da Fase A, de propósito:** lançar cortesia pela tela (o CA-h pede exibir; a recepção lança pela API) e o `ErrorState` em `packages/ui` (nasceu local; o segundo módulo que precisar promove).

---

## 3. Revisão de design

A delegação pedia **Impeccable** (`audit`, `critique`) e **emil-design-eng**. O Impeccable é plugin de marketplace e não está instalado nesta máquina; a revisão foi feita só com a emil-design-eng, subordinada ao `DESIGN_PMS.md`.

| Antes | Depois | Por quê |
|---|---|---|
| Botão do produto sem resposta ao toque | `active:scale-[0.97]`, 150 ms ease-out, desligado com movimento reduzido | O toque precisa confirmar que foi ouvido |
| `hover:bg` na linha da conta | hover só em `@media (hover: hover)`; `active:` no toque | No celular, o hover fica preso depois do toque |
| (proposta) animar a entrada do item lançado | recusada | Frequência alta: dezenas de vezes por turno |

---

## 4. Pontos em aberto

| # | Ponto | Quando |
|---|---|---|
| 1 | Fase B: mais lançados (k), transferir item/conta (l), dividir no fechamento (m) — dependem de backend | Delegação própria |
| 2 | A fila só anda com a comanda aberta | Se virar problema no ensaio, mover o runner para o layout (é do Gabriel) |
| 3 | Lançamento de outro usuário só sai quando ele logar de novo no aparelho | Operação: o aviso na lista. Mudar exigiria registrar quem lançou à parte de quem envia |
| 4 | ~~Instalar o Impeccable e rodar `audit`/`critique`~~ | Feito em 26/10; correções em 27/10 (§6) |

---

## 5. Auditoria

| Rodada | Veredito | Relatório |
|---|---|---|
| 1ª, diff inteiro | APROVADO COM RESSALVAS (🔴 0 · 🟡 5 · 🟢 7) | `docs/qa/redteam_t055-comanda_26out2026.md` |
| Delta 1 | APROVADO COM RESSALVAS (🔴 0 · 🟡 3 · 🟢 3) | `docs/qa/redteam_t055-comanda_delta_26out2026.md` |
| Delta 2 | **APROVADO** (🔴 0 · 🟡 0 · 🟢 4) | `docs/qa/redteam_t055-comanda_delta2_26out2026.md` |

| Achado | Tratamento |
|---|---|
| 🟡-1 "Desfazer" visível sem efeito com envio pendurado | Botão só no prazo; envio com prazo de 10 s |
| 🟡-2 item gravado sumia da tela até a rodada acabar (risco de lançar de novo) | Item devolvido pelo servidor entra no cache na hora |
| 🟡-3 rede ruim trocava a tela por erro | Última versão com aviso; erro só sem dados |
| 🟡-4 fila de outro usuário aparecia, somava e travava o fechamento | Cada usuário vê só o que lançou (C-6) |
| 🟡-5 duas abas sobrescreviam a fila | Uma chave por lançamento + evento `storage` (C-7) |
| D-1 (regressão do 🟡-4) recepção fechava sem saber dos itens parados no aparelho | Aviso na conta e no fechamento ("Fechar mesmo assim"); lista diz quais contas |
| D-2 `AbortSignal.timeout` inexistente no iOS 15 | Fallback com `AbortController` |
| D-3 "Enviando" largado por aba fechada | Volta à fila depois de 15 s (`recoverStale`) |
| D-5 envio podia sair com o login de outro usuário | A rodada confere o dono antes de cada envio |
| 🟢 entrada malformada, confirmação sem prazo, saldo negativo, rótulo da suíte, acessibilidade | Corrigidos |
| 🟢 `markSending` com início opcional; limite de 15 s sem teste | Início obrigatório; teste do limite e da entrada antiga |

**Limites aceitos (🟢 da delta 2):**
- O aviso do D-1 só existe **no aparelho** onde os itens estão parados. Fechar a conta pelo computador do balcão não avisa. É o preço de avisar sem bloquear: bloquear prenderia a conta se o garçom nunca mais entrasse naquele aparelho.
- Aba congelada por mais de 15 s pode ter o envio refeito pela outra aba. O `client_item_id` impede cobrança em dobro; custa só um POST a mais.
- `flush`, `commit` e `readDisk` são cobertos pelo roteiro do navegador, não por teste unitário (pendência 3 do relatório).

---

## 6. Correções da revisão Impeccable (27/10/2026)

**Origem:** audit 15/20 e critique 24/40 de 26/10 (`docs/historico_sessao/sirlande/t055_revisao_impeccable_26out2026.md`). Escopo aprovado pelo Sirlande: achados 1 a 6 (P0, P1, contraste e busca). Os achados 7 (aviso de offline pelo `onlineManager`) e 8 (formulário abaixo da dobra, bill no rodapé fixo) ficaram de fora.
**Branch:** `feature/t055-correcoes-impeccable`.

| # | Decisão | Por quê |
|---|---|---|
| **C-11** | Itens da conta numa caixa de altura fixa (`h-44`) com rolagem própria, vazia ou cheia; ela rola até o fim ao abrir e a cada toque **deste aparelho** (o `undoUntil` máximo cresce), e só aí | P0: a lista crescia a cada toque, o cardápio descia e o toque seguinte caía no produto errado. Rolar também em envio e refetch puxava quem estava conferindo (🟡-2) |
| **C-12** | Fechar: a confirmação diz "Fechar X? Total R$ Y", troca os botões de lugar ("Sim, fechar" à esquerda, "Voltar" onde estava "Fechar conta", com foco), ignora toques nos primeiros 400 ms (`closeGuard.ts`) e **não expira mais por tempo**: cai com "Voltar", com um bloqueio novo ou se o total mudar com ela aberta | P0: o toque duplo (120 ms) fechava a conta. O prazo de 5 s apagava a confirmação de quem usa leitor de tela e o "Fechando…" em rede lenta (🟡-4, WCAG 2.2.1). O total que muda com a confirmação aberta derruba a confirmação, para ninguém confirmar um valor que não leu (🟢-4 da delta) |
| **C-13** | Depois de fechar, a tela volta para a lista com o **saldo** do bill que o `PUT /close` devolve ("Mesa 3 fechada. Saldo a receber: R$ X" / "Crédito do hóspede" / "Nada a receber") e o link "Ver conta fechada"; o aviso recebe o foco | 🟡-1: a recepção perdia o bill e podia cobrar o total, não o saldo. Nenhuma outra tela lista conta fechada |
| **C-14** | Lista: contas do turno (mesa, balcão, day-use, interna) antes das suítes; a mais antiga primeiro dentro de cada grupo, desempate pelo id; hora de abertura no lugar do tipo | P1: a ordem do backend (mais nova primeiro) mexia a lista quando alguém abria conta. 🟡-5: com "mais antiga primeiro" puro, as suítes do check-in enterravam as mesas |
| **C-15** | Nome igual ao de uma conta aberta **avisa, não bloqueia**, com o link "Ir para essa conta"; comparação sem caixa, acento e espaço sobrando | P1: duas "Mesa 3" iguais. Pode ser outra mesa 3 de fato, e o backend aceita. "Mesa 03" e "Mesa3" não avisam (🟢-2, KISS: entra se acontecer) |
| **C-16** | "Aguardando envio" com ponto neutro no lugar de "Lançado" com ponto verde; "Desfazer 1" em linha com 2× ou mais | P1: verde dizia "gravado" antes do envio; o desfazer tira uma unidade e o botão não dizia |
| **C-17** | Item recusado ou excluído **novo** entra na vista da caixa e o motivo é anunciado (`role="alert"` só na recusa nova); recusas antigas não rolam nem alertam a cada visita | 🟡-3: a recusa podia ficar acima da área visível, e o consumo, sem cobrança. 🟢-2 da delta: N alertas a cada abertura |
| **C-18** | Contraste: preço riscado e placeholder do `Input` compartilhado em `gray-500` (4,8:1); busca com 48 px | P2, WCAG AA e RNF-024. O placeholder vale para todo o app |

**Recusados ou adiados, com motivo:**
- Fonte Inter (`overused-font` do detector): decisão do preset compartilhado.
- "Fechar mesmo assim" quebra em duas linhas a 375 px: só aparece com lançamento de outro usuário parado no aparelho (raro).
- `formatTimeBR` no `@hotel/domain` (🟢-4): `openedAtLabel` usa o `formatDateTimeBR` que já existe; mexer no pacote compartilhado fica para quando outro módulo precisar.
- Teste de componente da ligação dos P0 com a tela (🟢-3): o PMS não tem jsdom nem testing-library. Cobertura pelo roteiro Playwright abaixo.

**Verificação:**
- Vitest: 69 testes no app (eram 42 antes da branch). Mutação manual: 20 mutantes na lógica nova, todos mortos depois de 3 testes acrescentados.
- Playwright, 375 × 812, backend real no banco descartável, 23 checagens: busca com 48 px; contraste do placeholder; hora de abertura; aviso de nome repetido, link e sumiço; cardápio parado em 8 toques e depois do envio; "Aguardando envio"; "Desfazer 1"; caixa no último item; envio que não puxa a caixa; recusa (422 forçado) que entra na vista; mesas antes das suítes; toque duplo de 120 ms não fecha; toque com menos de 400 ms ignorado; total na confirmação; confirmação viva depois de 6 s; foco de volta em "Fechar conta"; aviso com saldo; foco no aviso; link para a conta fechada; aviso que não volta ao recarregar.
- Detector do Impeccable: código limpo; páginas logadas (lista, conta, confirmação, a 375 e 1280) só com `overused-font`.
- `qa_checks.sh`: sem erro bloqueante. O aviso de bloco repetido da comanda virou o componente local `Notice`.

**Auditoria:** qa-redteam `docs/qa/redteam_t055-correcoes-impeccable_27out2026.md` (0 🔴, 5 🟡, 4 🟢: os 🟡 corrigidos) e delta `..._delta_27out2026.md` (0 🔴, 0 🟡, 5 🟢: os 🟢-1 a 4 corrigidos; o 🟢-5, foco que cai no `body` quando a conta é fechada em outro aparelho, ficou registrado).

**Critique depois das correções:** **26/40** (era 24/40), 0 P0. Achados novos que **não** entraram nesta rodada e ficam para decisão do Sirlande:

| # | Sev. | Achado |
|---|---|---|
| 1 | P1 | A confirmação mostra o Total, e a decisão depende do Saldo; depois de fechar, não há caminho para receber |
| 2 | P1 | Contas internas e de day-use antigas ficam no topo, acima das mesas do turno |
| 3 | P2 | Dentro da conta, duas "Mesa 3" são iguais (sem hora de abertura); conta fechada sem selo e com o cardápio desabilitado inteiro |
| 4 | P2 | A caixa de itens corta a primeira linha ao meio; no balcão desperdiça espaço |
| 5 | P2 | A janela de desfazer esconde o preço e não mostra quanto tempo resta |

### 6.1 Rodada dos P1 do critique (27/10/2026)

Escopo escolhido pelo Sirlande depois do critique: só os 2 P1. Decisão de produto: **fechar a conta é fim do consumo**, e pode fechar com saldo em aberto. Branch `feature/t055-saldo-ordem`.

| # | Decisão | Por quê |
|---|---|---|
| **C-19** | A confirmação de fechar busca o bill ao abrir e mostra "Total R$ Y. Saldo a receber: R$ Z" (ou "Crédito do hóspede" / "Nada a receber"). Total e saldo saem do mesmo bill. Só vale um bill buscado **depois** de a confirmação abrir: "Sim, fechar" espera por ele e a trava de 400 ms recomeça quando ele chega. Com erro, a tela diz que o saldo aparece no aviso depois de fechar. Sem rede, diz que o saldo aparece quando a rede voltar e não deixa fechar. `balanceLine` em `accountTotals.ts`, reaproveitado pelo aviso pós-fechamento | P1: com pagamento parcial, o total não é o que falta cobrar. 🟡-1 e 🟡-2 do qa-redteam: cache de 30 s e erro de refetch mostravam saldo velho |
| **C-20** | Ordem da lista por grupo do salão: mesa e balcão → day-use → suítes → internas (tipo desconhecido no fim); a mais antiga primeiro dentro de cada grupo. Substitui o agrupamento de C-14 | P1: contas internas e de day-use antigas ficavam acima das mesas do turno |

**Pendência de produto:** o aviso depois de fechar mostra o saldo, mas não diz **onde receber**. O PMS ainda não tem tela de pagamento: o pagamento existe só na API (`POST /payments` com `account_id`, T-04.4). Não entrou texto apontando para uma tela que não existe.

**Verificação:**
- Vitest: 74 testes. Mutação manual: 7 mutantes, todos mortos.
- Playwright: 24 checagens, incluindo um pagamento parcial de R$ 50 pela API ("Total R$ 256,00. Saldo a receber: R$ 206,00.") e a ordem do salão.
- O cenário do 🟡-1 (bill em cache antes do pagamento) **não reproduziu** no navegador: a versão anterior também mostrou o saldo novo, por causa não identificada. A correção segue a leitura do código do TanStack Query.

**Auditoria:** `docs/qa/redteam_t055-saldo-ordem_27out2026.md` encontrou 0 🔴, 2 🟡 e 7 🟢. Foram corrigidos os 2 🟡 e os 🟢 1, 2, 3 e 6. Ficam:
- 🟢-4: mensagem sem rede e mutação pausada;
- 🟢-5: regra do "Crédito do hóspede" duplicada no "Ver conta";
- 🟢-7: falta teste de componente do `StaffActions`.
