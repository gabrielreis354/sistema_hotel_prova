### 2026-11-11 — Sirlande (orquestrando Claude Code)

- **Branch:** `fix/m5b-saldo-velho` · **Tarefa:** 🔴 do qa-explorador no pagamento do check-out (M5-b, CA-05.6.a)
- **Horário:** sessão única, 11/11
- **Objetivo:** sincronizar o ambiente, organizar os PRs abertos, estrear o `qa-explorador` e corrigir o que ele achou

#### Decisões
Detalhe, alternativas e justificativas em `docs/specs/anexos/SPEC-05-decisoes-CA-05.6.a.md` (P-8).

| # | Decisão | Escolha | Motivo |
|---|---|---|---|
| P-8 | Como evitar o "a maior" com saldo velho | Conferir o saldo no servidor (`getBill` direto) antes de gravar; diferença ou falha → não grava | O "a maior" era decidido com o cache, que não recarrega no foco. Recarregar no foco não cobre dois computadores |
| — | `fetchQuery` ou chamada direta | Chamada direta + `setQueryData` | O `fetchQuery` pegava carona numa busca pausada sem rede (🟡-1 do qa-redteam) |
| — | 409 no servidor com o saldo esperado | 5º semestre | Muda o contrato da API; fecha a janela de ms que sobra (Em aberto, item 7) |
| — | Parecer de 28/10 | PR #134 como registro histórico | A `develop` tinha a resposta do Gabriel e a pauta de 03/11, mas não o parecer |

#### O que foi feito
1. **Sincronização e PRs:** `develop` em dia; revisão de #126, #131 e #129 (sem bloqueio; #131 já entrou); PR #134 do parecer de 28/10; merge do #130 (`qa-explorador`); limpeza de branch sem diff líquido e de dois worktrees antigos.
2. **Estudo de bibliotecas:** a resposta do Gabriel ficou registrada no doc do estudo (Claude Docs). O PR para trazer o doc ao repositório espera a análise do Sirlande; a `develop` já recebeu o estudo na SPEC-08 (`f08cfaf`, Gabriel).
3. **Primeira rodada do `qa-explorador`** no pagamento do check-out: reprovado por 🔴 (saldo velho). Relatório `docs/qa/exploratorio_pagamento-checkout_11112026.md`; o 🟡 de rede dele já estava corrigido no #132.
4. **Correção com TDD:** `freshBalanceStep` e `confirmBalanceThenSend` (puras, testadas), ligadas no `PaymentForm`; "Corrigir o valor" devolve o foco ao campo.
5. **qa-redteam:** aprovado com ressalvas (2 🟡, 2 🟢), todas corrigidas na branch, com desfecho no relatório.

#### Verificação
- Testes: PMS com 296 passed, typecheck limpo · qa_checks.sh: OK (4 avisos anteriores, fora do diff) · CI: a conferir no PR
- Mutação manual: 9 mutantes, 1 sobrevivente (sinal do valor a devolver) morto com teste novo
- Navegador: `docs/qa/evidencias/saldo-velho_11112026/verifica_saldo_velho.mjs` (fora do git), 11/11 OK em 1280 e em 375, com o banco de QA recriado antes de cada rodada
- qa-redteam (diff): aprovado com ressalvas, corrigidas → `docs/qa/redteam_m5b-saldo-velho_11nov2026.md`
- Merge simulado com o #132 (mesmo anexo): limpo
- **Não verificado:** o roteiro da busca pausada + troca de aba no navegador. A causa (`fetchQuery`) saiu do código e o "não grava fora da tela" está testado

#### Commits
| `7519ef6` | `docs(qa): desfecho do red team da fix/m5b-saldo-velho e P-8 atualizada` |
|---|---|
| `e15dce6` | `fix(pms): conferencia do saldo sem carona em busca pausada e sem gravar fora da tela (M5-b)` |
| `3c30e5d` | `fix(pms): confirmBalanceThenSend prende a ordem conferir e gravar e nao grava fora da tela (M5-b)` |
| `0c77732` | `test(pms): RED da sequencia conferir e gravar e da mensagem de falha (qa-redteam de 11/11)` |
| `0a3a0b6` | `docs(qa): qa-redteam da fix/m5b-saldo-velho (aprovado com ressalvas)` |
| `c792c9b` | `docs(m5b): P-8, saldo conferido no servidor antes de gravar o pagamento` |
| `db9c60d` | `test(pms): valor a devolver sempre positivo na mensagem do saldo conferido (achado da mutacao)` |
| `f9cc116` | `fix(pms): pagamento confere o saldo no servidor antes de gravar e Corrigir o valor devolve o foco (M5-b)` |
| `69acd58` | `fix(pms): freshBalanceStep decide se o pagamento grava com o saldo conferido (M5-b)` |
| `46e6f3b` | `test(pms): RED do saldo conferido no servidor antes de gravar o pagamento (M5-b)` |
| `a7b7e13` | `docs(qa): qa-explorador do pagamento no check-out (M5-b) e repasse ao Gabriel` |

#### Pendências
| # | Pendência | Prioridade | Observação |
|---|---|---|---|
| 1 | Revisão e merge deste PR, do #132 (pagamento sem rede) e do #133 (status M5-b/M5-c) | Alta | Mexem em dinheiro: revisão humana. Os três entram sem conflito entre si |
| 2 | M8: seed com as datas do dia | Alta | Prazo 17/11; pedido detalhado na resposta do Weslley de 31/10 (§3.1) |
| 3 | PR do estudo de bibliotecas para o repositório | Média | Só com o OK do Sirlande; conferir antes se a SPEC-08 (`f08cfaf`) já cobre |
| 4 | 409 no `POST /payments` com o saldo esperado (P-8) | Baixa | 5º semestre (Em aberto, item 7) |
| 5 | 🟢 do qa-explorador: Esc na confirmação, mensagem do valor negativo, método só por cor | Baixa | Depois do congelamento (Em aberto, item 8) |
| 6 | Pasta de saída do Playwright MCP | Baixa | O MCP solta `.yml`/`.log` na raiz de `docs/qa/evidencias/` (ignorada, mas acumula) |
