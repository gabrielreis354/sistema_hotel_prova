### 2026-11-15 — Sirlande (orquestrando Claude Code)

- **Branches:** `docs/decisoes-bibliotecas`, `docs/resposta-fechamento-mvp`, `feature/m8-seed-datas-do-dia`, `feature/t081-fundamentos` → `t082-marca-casca` → `t083-hierarquia-acoes` → `t084-painel-hoje`
- **Tarefas:** decisões do estudo de bibliotecas · resposta ao plano de fechamento do Gabriel · M8 (seed com as datas do dia) · SPEC-08 mínima e T-08.4
- **Horário:** sessão única, 15/11

#### Decisões

| # | Decisão | Escolha | Motivo |
|---|---|---|---|
| — | Biblioteca de componentes | Radix por baixo do `@hotel/ui`, só no 5º semestre, com ADR | Mantém o que existe e traz teclado e leitor de tela; tema pronto brigaria com o preset (doc do estudo, SPEC-08 §9) |
| — | Antes de 10/12 | Só Inter e lucide-react; setas das abas e foco da folha "Mais" à mão | Muda a percepção de todas as telas com pouco risco |
| — | Comanda do plano de fechamento | Opção (b): o Gabriel faz o aviso sem conexão e o tempo para desfazer | Com a SPEC-08 na minha carga, a opção (a) não cabia até 24/11 (PR #156) |
| — | "Hoje" do seed | `(now() AT TIME ZONE 'America/Sao_Paulo')::date` | O `CURRENT_DATE` em UTC gravaria amanhã depois das 21h (D-68) |
| — | Rodar o seed de novo | Mesmo dia: nada muda · outro dia: move o cenário · nunca desfaz a demo | Banca e ensaio rodam em dias diferentes; a demo não pode ser apagada por um re-seed |
| — | Saída do dia (107) | Só o sinal pago na entrada | Sem saldo, o passo 5 do roteiro ("o pagamento é registrado") não mostrava pagamento (qa-explorador) |
| — | Corte do painel Hoje | 8 por bloco, com "Ver todas (N)" | GUIA_UI_CORPORATIVA §5 e CA-08.i |

#### O que foi feito
- **Decisões de bibliotecas** registradas no doc do estudo e no repositório (PR #155).
- **Resposta ao plano de fechamento** em `.md` e `.html` (PR #156). O ponto 3.1 foi corrigido na mesma sessão: o seed já alimenta o analytics pelos triggers do outbox.
- **M8** (PR #157): `seed_hoje.sql` monta, nos dois hotéis, chegadas com e sem sinal, saída do dia, hóspedes na casa, quarto em limpeza e recebidos de hoje, com quarto ocupado coerente com a estadia.
- **SPEC-08** (PRs #159 a #162):
  - T-08.1: Inter, marca por variável e escala;
  - T-08.2: marca Gesway, favicon, ícones, nome do hotel e login com `@hotel/ui`;
  - T-08.3: uma ação principal, abas com setas e foco na folha "Mais";
  - T-08.4: ação de linha secundária e corte de 8.
- **Ambiente:** Docker Desktop aberto pelo terminal e stack completa com RabbitMQ e analytics reais (projeto `gesway-m8`, descartável).

#### Verificação
- **Core:** 1235 testes passam. `seed-hoje.test.js` tem 20 testes, e cada achado do red team tem teste conferido por mutação.
- **Ponta a ponta pelo nginx com RabbitMQ real:**
  - Aurora: 26,67% · ADR R$ 338,89 · RevPAR R$ 90,37 · recebido hoje R$ 510,00 · 1 no-show · 1 em limpeza;
  - Sol: 20% · recebido hoje R$ 480,00.
- **app-pms:** 354 testes, `tsc` e build ok, `qa_checks` sem erro.
- **No navegador:**
  - Inter carregada e troca da `--color-brand` refletida (CA-08.b e CA-08.c);
  - 768 px sem rolagem lateral;
  - "Sair" com 48 px em 375 px;
  - painel Hoje em 375 px com 2.951 px no caso realista e 3.091 px no pior caso.
- **QA:**
  - qa-redteam do M8: aprovado com ressalvas, desfecho no relatório;
  - qa-explorador do M8: aprovado com ressalvas;
  - qa-redteam da SPEC-08 mínima: aprovado com ressalvas, todas as 🟡 corrigidas.

#### Commits
Ver os PRs #155, #156, #157 e #159 a #162.

#### Pendências

| # | Pendência | Prioridade | Observação |
|---|---|---|---|
| 1 | 🔴 Imagem `quay.io/minio/minio` dá 401: o compose não sobe num computador limpo | Alta | Repassado ao Weslley (`docs/qa/repasses/para_weslley_15112026.md`). Afeta o ensaio de 24/11 e a banca |
| 2 | Revisão e merge dos PRs #155, #156, #157 e #159 a #162 (estes em ordem) | Alta | Revisão humana |
| 3 | `./start.sh seed` sem o `seed_hoje.sql` | Média | Repassado ao Weslley |
| 4 | Cartões do painel Hoje uma ação atrás, duplo clique no check-in | Média | Repassado ao Gabriel (`para_gabriel_15112026.md`) |
| 5 | CA-08.i no pior caso (3.091 px) | Baixa | O selo de no-show é texto fixado pela CA-05.3.f |
| 6 | SPEC-08: T-08.5 e T-08.6 | Média | Antes de 24/11 se der tempo; T-08.6 tem o "Sair" já resolvido |
| 7 | "Em limpeza desde" mostra a hora em que o seed rodou | Baixa | Vem do `occurred_at` do outbox |
| 8 | Depois de ensaio, recriar o banco antes da banca | — | O seed avisa com `WARNING`; está no cabeçalho do `seed_hoje.sql` |
