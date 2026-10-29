### 2026-10-27 — Sirlande (orquestrando Claude Code)

- **Branch:** `feature/t055-correcoes-impeccable` → `develop` · **Tarefa:** corrigir os achados 1 a 6 da revisão Impeccable da comanda (T-05.5), escopo aprovado pelo Sirlande (P0 + P1 + contraste e busca)
- **Estado:** ✅ correções feitas, auditadas e mergeadas na `develop` · item 4 da delegação fechado

#### O que foi feito
1. **P0, cardápio que descia:** caixa de itens com altura fixa e rolagem própria (`ItemList.tsx`). Rola só com toque deste aparelho; recusa nova entra na vista.
2. **P0, toque duplo que fechava a conta:** confirmação com o total, botões trocados de lugar, toques ignorados nos primeiros 400 ms (`closeGuard.ts`, `StaffActions.tsx`). Depois de fechar, a lista mostra o **saldo** do bill e o link "Ver conta fechada".
3. **P1, contas iguais:** ordem estável (turno antes das suítes, mais antiga primeiro), hora de abertura na linha, aviso de nome já aberto com link (`accountFilter.ts`, `OpenAccountForm.tsx`).
4. **P1, "Lançado" antes do envio:** "Aguardando envio" com ponto neutro; "Desfazer 1".
5. **P2:** contraste 4,8:1 no preço riscado e no placeholder do `Input` compartilhado; busca com 48 px.
6. `Notice` local para os avisos da comanda (aviso de bloco repetido do `qa_checks.sh`).

Decisões C-11 a C-18 em `docs/specs/anexos/SPEC-05-decisoes-T-05.5.md` §6. C-8 e C-9 foram revistas.

#### Verificação
- **Vitest:** 69 testes no `apps/pms` (eram 42). TDD: commits RED antes de cada lógica nova.
- **Mutação manual:** 20 mutantes na lógica nova; 3 sobreviveram e ganharam teste.
- **Playwright** a 375 × 812, backend real no banco descartável `gestao_hotel_t047` (recriado no início): 23 checagens, todas OK (lista no anexo §6). O roteiro não está no repositório (ver pendências).
- **Detector do Impeccable:** código limpo; páginas logadas só com `overused-font` (Inter, recusada).
- **qa-redteam:** 1ª rodada 0 🔴 / 5 🟡 / 4 🟢 (os 🟡 corrigidos); delta 0 🔴 / 0 🟡 / 5 🟢 (4 corrigidos). Relatórios em `docs/qa/redteam_t055-correcoes-impeccable_27out2026.md` e `..._delta_27out2026.md`.
- **Critique do Impeccable** (duas avaliações isoladas): **26/40**, era 24/40; P0 de 2 para 0. O snapshot fica em `.impeccable/critique/`, que não é versionado.

#### Decisões que mudam o comportamento combinado
- A confirmação de fechar **não expira mais** (era 5 s, C-8). Motivo: leitor de tela e rede lenta. Ela cai com "Voltar", com um bloqueio novo ou se o total mudar.
- `closeAccount` (`accountsApi.ts`) passou a devolver o bill do `PUT /close`. Nenhuma mudança no backend.
- O placeholder do `Input` de `@hotel/ui` mudou de cor em todo o app (4,8:1). O qa-redteam não achou regressão.

#### Pendências
1. **Achados novos do critique** (os 2 P1 foram resolvidos na segunda rodada, abaixo; os P2 seguem abertos):
   - P1: a confirmação mostra o Total, e a decisão depende do Saldo;
   - P1: contas internas e de day-use antigas ficam acima das mesas;
   - P2: duas "Mesa 3" iguais dentro da conta;
   - P2: a caixa corta a primeira linha;
   - P2: a janela de desfazer esconde o preço e o tempo.
2. 🟢-5 da delta: se a conta for fechada em outro aparelho com a confirmação aberta, o foco cai no `body`.
3. Fora do escopo desta rodada: achados 7 (aviso de offline pelo `onlineManager`) e 8 (formulário abaixo da dobra; bill no rodapé fixo) da revisão de 26/10.
4. **Ferramenta:** o PMS não tem teste de componente, e o roteiro Playwright fica fora do repositório. Vale decidir se entra `e2e/` com Playwright no CI.
5. **Repasse ao Gabriel (AppShell), ainda aberto:** "Sair" com 36 px; barra inferior do garçom com um item só; marca "Hotel PMS" no desktop.
6. **Perguntas de produto ainda abertas:** o fechamento deve ficar só no balcão? Conta INTERNAL deve aceitar item faturável?
7. Banco descartável `gestao_hotel_t047`: tem contas "Mesa 9 (verif n)" e "Balcão crit A" dos testes. `DROP DATABASE` quando não precisar mais.

#### Segunda rodada: os 2 P1 do critique (mesma sessão)
O Sirlande escolheu corrigir só os P1. Decisão de produto: fechar a conta é **fim do consumo**.
- **Saldo na confirmação de fechar (C-19):** a tela mostra o total e o saldo, tirados do mesmo bill, buscado depois de a confirmação abrir.
- **Ordem do salão (C-20):** mesa e balcão → day-use → suítes → internas.
- **Branch:** `feature/t055-saldo-ordem`, mergeada na `develop`.
- **Verificação:** 74 testes, 7 mutantes mortos e 24 checagens no Playwright.
- **qa-redteam** (`docs/qa/redteam_t055-saldo-ordem_27out2026.md`): 0 🔴, 2 🟡 e 7 🟢. Corrigidos os 2 🟡 e 4 dos 🟢.
- **Não reproduzido:** o cenário do 🟡-1 (saldo velho do cache) não apareceu no navegador nem com o código anterior. A correção segue a leitura do TanStack.

Pendências desta rodada:
- **Onde receber:** o aviso depois de fechar mostra o saldo, mas o PMS não tem tela de pagamento (só a API). Falta decidir quem faz essa tela e em que fase.
- 🟢-4, 🟢-5 e 🟢-7 do qa-redteam: mensagem sem rede, regra do crédito duplicada no "Ver conta", teste de componente.
- Os 3 P2 do critique continuam abertos: "Mesa 3" igual dentro da conta, caixa que corta a primeira linha, desfazer sem preço e sem tempo.

#### Próxima sessão
O plano de frontend novo do Sirlande. Os P2 do critique e a tela de pagamento entram quando ele decidir.
