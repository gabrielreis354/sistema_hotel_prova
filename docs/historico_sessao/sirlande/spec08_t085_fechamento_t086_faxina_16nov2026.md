### 2026-11-16 — Sirlande (com Claude Code)

- **Branches:** `feature/t085-cabecalho-cartoes` (PR #167) e `feature/t086-faxina` (PR #170)
- **Objetivo da sessão:** fechar a T-08.5 com QA no navegador e entregar a T-08.6 (faxina), concluindo a SPEC-08 antes do congelamento de 24/11.

#### O que foi feito

| Entrega | Resultado |
|---|---|
| **#167 (T-08.5) reapontado** | Apontava para a `feature/t084-painel-hoje`, já mergeada. Agora aponta para a `develop`. |
| **qa-explorador da T-08.5** | Aprovou com ressalvas: 4 🟡 na ficha do hóspede, 4 🟢 e 2 repasses (`docs/qa/exploratorio_t085-cabecalho-cartoes_16112026.md`). |
| **Correção da ficha do hóspede** | "Excluir" desabilitado, com o motivo em texto, para quem não é ADMIN (espelha o `guestRouter`). O 403 tem mensagem própria. O 404 mostra o aviso com a volta, sem repetir a consulta; 500 e falta de rede mostram "Tentar de novo". O foco volta ao "Excluir" ao fechar a confirmação. O histórico de estadias cabe em 375 px. |
| **qa-redteam da correção** | 2 🟡 corrigidos (motivo visível pelo `ActionSlot`, volta com alvo de toque) e o retry preso por teste. O repasse da tela de edição também foi corrigido (`docs/qa/redteam_t085-ficha-hospede_16112026.md`). |
| **#167 mergeado** | Conflito resolvido em `docs/qa/repasses/para_dono-indefinido_15112026.md`, mantendo os dois repasses. O CI passou e o merge foi feito com autorização do Sirlande. |
| **T-08.6 (#170)**, itens A a F | **A.** 48 px até o xl no tablet: menu lateral, atalhos de período, abas de Quartos, voltas, `Select`, campos de quartos e `PaymentForm`. **B.** Os `Money` e `Notice` locais viraram `DecimalMoney` e `InfoNotice`. **C.** A barra inferior a 375 px foi medida e já estava certa. **D.** `buttonClasses` no `@hotel/ui`; `ButtonLink` e `BackLink` em `apps/pms/src/components/links.tsx`. **E.** `LoadError` único para reserva, hóspede, quarto e categoria. **F.** Com saldo a receber, só "Registrar pagamento" fica em primary na aba Conta. |
| **qa-redteam da T-08.6** | 2 🟡 e 1 🟢 corrigidos. Desfecho em `docs/qa/redteam_t086-faxina_16112026.md`. |
| **#170 mergeado** | CI verde. Merge feito com autorização do Sirlande. |

**Decisões do Sirlande nesta sessão (16/11):**
1. **`ButtonLink`:** o `@hotel/ui` exporta só as classes do `Button` (`buttonClasses`), e o link fica no app. O ui não passa a depender do react-router.
2. **Aba Conta com saldo:** o pagamento é a ação principal e o check-out desce para secondary; com o saldo zerado, ele volta a ser o principal. Vale só na aba Conta. No Resumo o check-out segue principal, porque o formulário de pagamento não aparece ali.

**Verificação:**
- **Testes:** `pnpm typecheck` nos 5 pacotes e `pnpm test`, com 402 testes do `app-pms` e 49 do `@hotel/domain`.
- **Mutação manual em cada correção:** 8 e 3 mutantes na ficha do hóspede, mais 3 na edição; 13 e 3 na T-08.6. Todos morreram.
- **Navegador, no ambiente de QA:**
  - 375, 768 e 1280 px;
  - pagamento real no banco `gestao_hotel_qa`, para ver o check-out voltar a primary.

#### Commits gerados

**PR #167 (T-08.5, correções de 16/11)**

| Hash | Mensagem |
|------|----------|
| `4a32bb8` | `docs(qa): exploratorio da T-08.5 no navegador e repasse (16/11)` |
| `3220029` | `test(pms): RED da ficha do hospede (qa-explorador de 16/11)` |
| `6f8cd54` | `fix(pms): ficha do hospede: exclusao so para admin, hospede inexistente, foco e tabela no celular` |
| `a9c26e1` | `test(pms): RED das ressalvas do qa-redteam na ficha do hospede (16/11)` |
| `f90ebaa` | `fix(pms): ressalvas do qa-redteam na ficha do hospede (16/11)` |
| `402585d` | `docs(qa): red team das correcoes da ficha do hospede, desfecho e repasse (16/11)` |
| `ed37bc4` | `test(pms): RED do erro ao carregar na edicao do hospede (repasse do qa-redteam de 16/11)` |
| `cb28d8f` | `fix(pms): edicao do hospede com o mesmo estado de erro da ficha (repasse do qa-redteam de 16/11)` |
| `d518223` | `docs(qa): desfecho do repasse da edicao do hospede (16/11)` |
| `29db24a` | `Merge remote-tracking branch 'origin/develop' into feature/t085-cabecalho-cartoes` |

**PR #170 (T-08.6)**

| Hash | Mensagem |
|------|----------|
| `8ba9d74` | `test(pms): RED do alvo de toque ate o xl (SPEC-08 CA-08.g, T-08.6)` |
| `bc88abd` | `fix(pms): alvo de toque de 48 px ate o xl no tablet (SPEC-08 CA-08.g, T-08.6)` |
| `a791544` | `test(pms): RED de componente local com nome do @hotel/ui (T-08.6)` |
| `7df4f76` | `refactor(pms): Money e Notice locais renomeados para DecimalMoney e InfoNotice (T-08.6)` |
| `055978e` | `test(pms): RED do ButtonLink e BackLink fora de reservas, com as classes do Button (T-08.6)` |
| `3419e27` | `refactor(pms): ButtonLink e BackLink em components/links com as classes do Button (T-08.6)` |
| `95e3c86` | `test(pms): RED do LoadError, um molde so para registro que nao carregou (T-08.6)` |
| `aa73a1b` | `refactor(pms): LoadError, um molde so para registro que nao carregou (T-08.6)` |
| `c59881b` | `test(pms): RED do pagamento como acao principal com saldo a receber (T-08.6, CA-08.e)` |
| `ce5e72c` | `feat(pms): com saldo a receber, o pagamento e a acao principal da reserva (T-08.6, CA-08.e)` |
| `f02459e` | `test(pms): edicao do quarto com 404 e com falha das categorias (mutante sobrevivente da T-08.6)` |
| `4f081af` | `test(pms): RED das ressalvas do qa-redteam da T-08.6 (16/11)` |
| `ca4222b` | `fix(pms): ressalvas do qa-redteam da T-08.6 (16/11)` |

Merges na `develop`: `5d2eb3d` (#167) e `9d9cd85` (#170).

#### Pendências

| # | Pendência | Prioridade | Observação |
|---|-----------|-----------|------------|
| 1 | Revisar e mergear o #165 (faixa de sem conexão e contagem do desfazer na comanda) | 🟡 Média | Não depende da SPEC-08. Antes do congelamento de 24/11. |
| 2 | Mergear os PRs de documentação #155, #156, #163 e #169 | 🟡 Média | Decisões de bibliotecas, resposta ao plano de fechamento e relatório de 15/11. |
| 3 | Excluir hóspede com estadia em andamento (repasse para dono indefinido) | 🟡 Média | `DeleteGuestController` aceita apagar um hóspede `CHECKED_IN`. Decisão de produto: recusar com 409 ou ler com `paranoid: false`. Ver `docs/qa/repasses/para_dono-indefinido_15112026.md`. |
| 4 | `:id` que não é UUID responde 500 em 9 routers (o de hóspedes inclusive) | 🟡 Média | No mesmo arquivo de repasse. Na tela, um id inválido aparece como "Tentar de novo", não como "não encontrado". |
| 5 | Atalho de período selecionado com o mesmo `bg-brand` do primary | 🟢 Baixa | É estado de seleção (`aria-pressed`), não ação. Repasse de 16/11. Decidir no 5º semestre. |
| 6 | Testes de varredura por regex têm limites conhecidos | 🟢 Baixa | `md:h-auto` e `export { Money }` escapam. Ver o 🟢5 do red team da T-08.6. |
| 7 | 🟢 da T-08.5 não feitos | 🟢 Baixa | Primeiro Tab da confirmação de exclusão cai em "Sim, excluir"; o texto diz "dele" sempre; fio duplo entre as abas da reserva; Reservas sem contexto no cabeçalho. |
| 8 | Imagem `quay.io/minio/minio` com erro 401 | 🔴 Alta | Repassado ao Weslley em 15/11. Num computador limpo o compose não sobe. Não verificado nesta sessão. |
| 9 | Arquivo `ultimo_relatorio.md` | 🟢 Baixa | O CLAUDE.md pede o arquivo, mas ele não existe em `docs/historico_sessao/sirlande/`. |
