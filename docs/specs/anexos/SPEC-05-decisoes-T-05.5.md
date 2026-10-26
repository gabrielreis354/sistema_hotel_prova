# SPEC-05 · Anexo — Decisões da T-05.5 (comanda do garçom, Fase A)

**Responsável:** Sirlande (orquestrando Claude Code) · **Data:** 26/10/2026
**Estado da tarefa:** ✅ Fase A concluída (CA-05.5.a a j), aprovada na 2ª reauditoria delta — Fase B (k, l, m) depende de backend
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
| **C-8** | Recepção e gerência veem bill e fechamento na mesma tela; "Fechar conta" desabilitado com o motivo (conta de diária, conta não aberta, fila pendente) e confirmado em dois toques que expiram em 5 s | Ação irreversível pede confirmação (DESIGN_PMS §5); ação indisponível mostra o motivo (RNF-026) |
| **C-9** | Conta longa mostra os 3 últimos itens e "Ver todos" | O cardápio fica perto do polegar (CA-05.5.i) |
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
| 4 | Instalar o Impeccable e rodar `audit`/`critique` | Antes do congelamento (24/11) |

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
