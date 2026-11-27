# Sessão de 26/11/2026 (madrugada): SPEC-10, fases F6 e F7 da integração

**Dev:** Sirlande, com o Claude Code como orquestrador.
**Branch de trabalho:** `feature/spec-10-identidade` (a integração), na worktree `../wt-integracao`. Cada fase saiu numa branch própria e voltou por PR. A `develop` só recebeu relatórios.

## O que foi feito

| Fase | PR | Estado | Resumo |
|---|---|---|---|
| Integração recebe a `develop` | #233 | mergeado | A `develop` em `c8a829b` (só relatórios) |
| F6: comanda | #234 | mergeado | Duas colunas no computador (conta e cardápio, a partir do `xl`); `StickyFooter` com o total e o "Abrir conta"; categorias e Mesa/Balcão no `SegmentedControl`; selo Fechada/Paga no cabeçalho; foco do Desfazer corrigido. Hover do botão secundário e do ghost só com mouse (`@hotel/ui`, vale para o app inteiro). Red team 0 🔴 e 2 🟡, delta 0 🔴 e 1 🟡, todos resolvidos; critique 28/40 |
| F7: Indicadores | #235 | mergeado | Seções com o período no título ("Mês a mês", "No período", "Todo o histórico"); De/Até sem "Aplicar", com espera de 600 ms; um aviso só quando o analytics cai, com "Tentar de novo" para tudo; teto de 3 s para erro de bloco. Red team 0 🔴 e 4 🟡, delta 0 🔴 e 1 🟡, todos resolvidos; critique 26/40 |

Com isso, **todas as fases de tela da SPEC-10 (F0 a F7) estão na integração**.

**Relatórios de QA, na integração:**
- `docs/qa/redteam_spec10-fase6-comanda_26112026.md` e a delta;
- `docs/qa/redteam_spec10-fase7-indicadores_26112026.md` e a delta;
- `docs/qa/impeccable_critique_spec10-fase{6,7}_26112026.md`.

## Decisões do Sirlande
- **Comanda no computador:** duas colunas. Passou de `lg` para `xl` pelo 🟡-2 do red team: em 1024 px as colunas ficavam apertadas.
- **Janela de desfazer no celular:** o nome do produto ocupa a linha toda, e os controles ficam embaixo.
- **"Abrir conta" fixo no pé** da lista, no mesmo rodapé do total da conta.
- **Selo Fechada/Paga** no cabeçalho da conta.
- **Hierarquia das ações da conta:** virou pergunta ao Gabriel (`docs/qa/repasses/para_gabriel_26112026.md`). Foi respondida no mesmo dia (PR #236).

## Observações
- **Merge do #235:** quem fez foi o Sirlande, pelo `! gh pr merge`. O classificador do Claude Code bloqueou o merge feito pelo agente.
- **Script de teste:** os scripts de captura não devem clicar "Desfazer" por índice. Um deles deixou um item gravado na Mesa 3, que foi excluído pela API.
- **Ambiente:** o `gesway_ensaio` foi derrubado com `down -v` no início. O `gesway_integracao` ficou parado com `stop` no fim.

## Pendências deixadas para a sessão seguinte
1. **Decisões do Sirlande sobre os Indicadores:**
   - escrever o valor nas barras;
   - o mês futuro da sazonalidade;
   - agrupar as categorias em "Outras";
   - mostrar o "atualizado às".
2. **Repasse:** o "Cancelar" do formulário de abrir conta mandava o foco para o `body`. Foi resolvido na sessão da noite (PR #239).
3. **Perguntas ao Gabriel:** respondidas no PR #236, na noite do mesmo dia.
4. **Para fechar a SPEC-10:**
   - a passada final do qa-explorador e o red team;
   - a revisão do Gabriel e do Weslley;
   - o PR da integração para a `develop`.

   A passada final e o red team foram feitos à noite; ver o relatório seguinte.
