### 2026-11-16 (noite) e 2026-11-17 — Sirlande (com Claude Code)

> Entrada nova, conforme o `CODING_STANDARDS` (relatório passado não se edita). Continua
> `adendo_pendencias_core_16nov2026.md`. Cobre a noite de 16/11 (parte 3 do dia) e a retomada de 17/11.

- **Branches:**
  - `fix/t084-ressalvas-painel-hoje` (#178);
  - `docs/spec-10-identidade-visual` (#180);
  - `feature/t101-login-visual` (#181);
  - `feature/comanda-quantidade` (#182);
  - `feature/comanda-pagamento` (#183, na worktree `../wt-comanda-pag`).
- **Horário:** 16/11 ~20h30 a ~22h; 17/11 ~22h40 a ~23h30.
- **Objetivo:** fechar os 🟡 da T-08.4, registrar a SPEC-10 e entregar o login novo e as duas mudanças da comanda combinadas com o Gabriel em 16/11, todas antes do congelamento de 24/11:
  - a quantidade digitada na linha;
  - o pagamento da mesa, dividido por valor.

#### O que foi feito

| Entrega | Resultado |
|---|---|
| **#178:** ressalvas 🟡 da T-08.4 no painel Hoje | **Mergeado em 16/11.** Em 375 px, com 30 chegadas, o painel cabe abaixo de 3.000 px: de 3.067 para 2.891 px sem pagamento, e de 3.215 para 2.879 px com chegada atrasada. O "Mostrar menos" volta para a vista abaixo do aviso fixo e mantém o foco. O red team das correções foi tratado em `c76c21b`. |
| **#180:** SPEC-10, identidade visual | **Mergeado em 16/11.** Spec com o login decidido em 16/11, mais o que a implementação da T-10.1 mudou do protótipo (`b9dfd68`). |
| **#181:** T-10.1, login com a identidade da SPEC-10 | **Pronto, aguarda revisão.** O `Field` ganhou rótulo com ícone, e há tokens do login no `@hotel/ui` e um olho da senha de 48 px com `aria-pressed`. O vidro não usa `backdrop-filter`: ficou a 60 fps com a CPU 4x mais lenta. A página tem 21 testes (antes não tinha nenhum). Mutação: 17 de 17 mortos. Os 4 🟡 do red team foram tratados. |
| **#182:** quantidade digitada na linha da comanda | **Pronto, aguarda revisão.** A linha na janela de desfazer ganha um campo de 1 a 9.999, e a janela não fecha enquanto o campo tem o foco. O envio continua idempotente pelo `client_item_id`, também sem rede. Mutação: 11 de 11 mortos. Os 4 🟡 e os 2 🟢 do red team foram tratados. |
| **#183:** receber na mesa, no balcão e no day-use, dividido por valor | **Aberto em 17/11, com o CI verde.** Detalhes abaixo. |

**#183, pagamento da mesa.** Um pagamento por pagante, com o mesmo `PaymentForm` da reserva e o alvo `{ accountId }`. Nenhum endpoint novo.

Decisões do Sirlande (16/11), registradas como C-21 a C-26 em `docs/specs/anexos/SPEC-05-decisoes-T-05.5.md` §7:
1. quem recebe é a recepção e o admin;
2. valor acima do saldo é **recusado** na mesa, porque o troco não entra no sistema;
3. mesa **fechada continua recebendo**, com o link "Receber na conta" no aviso do fechamento.

Na retomada de 17/11:
- **Ajuste do PAID.** Quando o último pagamento quita a mesa fechada, ela vira `PAID`. O painel continua aberto com o aviso e "Conta quitada.", e o "Esconder pagamento" não some junto. A regra do painel virou `receivePanelOpen`, em `receive.ts`.
- **Testes do `ReceivePanel`** (🟢-1 do red team), mais um teste das props que ele passa ao `PaymentForm`.
- **Mutação manual:** 18 mutantes, 16 mortos. Os 2 vivos são ligações de página que o `renderToString` não alcança (o projeto não tem jsdom), e os dois foram conferidos no navegador.
- **Chromium a 390 px, como recepção, numa mesa de R$ 198,00:**
  1. 200,00 é recusado, e o servidor não grava nada;
  2. 120,00 em PIX é registrado;
  3. ao fechar, a confirmação mostra o saldo de 78,00;
  4. a lista traz o link "Receber na conta";
  5. 78,00 no débito leva a conta a `PAID` no servidor.
- **Red team:** a tabela de tratamento está em `docs/qa/redteam_comanda-pagamento_16112026.md`: 4 🟡 e 3 🟢 tratados, e a suspeita de backend registrada como pendência.
- **Portões:** 472 testes do pms, typecheck limpo, `qa_checks` sem aviso novo e CI verde.

#### Commits gerados

| Hash | Mensagem |
|------|----------|
| `e7a9f7d` | `test(today): RED dos selos curtos da chegada e do foco do Ver todas (ressalvas da T-08.4)` |
| `1ef5196` | `fix(pms): painel Hoje cabe em 3.000 px e Ver todas nao perde o foco (ressalvas da T-08.4)` |
| `c76c21b` | `fix(pms): ressalvas do qa-redteam nas correcoes da T-08.4` |
| `df88412` | `docs(specs): SPEC-10 identidade visual, com o login decidido em 16/11` |
| `b9dfd68` | `docs(specs): SPEC-10 com o que a implementacao da T-10.1 mudou do prototipo` |
| `fa75d11` | `test(auth): RED do login novo da SPEC-10 (T-10.1)` |
| `b0e6886` | `feat(ui): tokens do login e rotulo com icone no Field (SPEC-10, T-10.1)` |
| `9ae2311` | `feat(pms): login com a identidade da SPEC-10 (T-10.1)` |
| `941a246` | `test(auth): RED das ressalvas do qa-redteam do login (T-10.1)` |
| `561e58f` | `fix(pms): ressalvas do qa-redteam do login (T-10.1)` |
| `ba72329` | `test(comanda): RED da quantidade digitada na linha (combinado com o Gabriel em 16/11)` |
| `9e3ef86` | `feat(comanda): quantidade digitada na linha (combinado com o Gabriel em 16/11)` |
| `b53df0c` | `test(comanda): RED das ressalvas do qa-redteam da quantidade` |
| `9bcb1d8` | `fix(comanda): ressalvas do qa-redteam da quantidade digitada` |
| `deeb439` | `test(comanda): RED do pagamento da mesa e do day-use dividido por valor (16/11)` |
| `29a0111` | `feat(comanda): receber na mesa e no day-use, dividido por valor (combinado com o Gabriel em 16/11)` |
| `bcc5b4f` | `test(comanda): RED das ressalvas do qa-redteam do pagamento (decisoes de 16/11)` |
| `b9d2aab` | `fix(comanda): ressalvas do qa-redteam do pagamento (em andamento)` |
| `e4fc745` | `test(comanda): RED do painel Receber quando a mesa quita e vira PAID` |
| `538bfe1` | `fix(comanda): painel Receber continua aberto quando a mesa quita e vira PAID` |
| `a91d36d` | `test(comanda): RED dos mutantes que sobreviveram no pagamento da mesa` |
| `174401b` | `refactor(comanda): rotulo do link de receber vira receiveLabel` |
| `c70d804` | `docs(comanda): comentario do cardapio escondido diz que a protecao real e a P-8` |
| `d343458` | `docs(qa): tratamento do red team do pagamento da mesa` |
| `d84e45e` | `docs(spec-05): decisoes do pagamento da mesa dividido por valor (C-21 a C-26)` |

Merges na `develop`: `a0aaef4` (#178) e `51e7b03` (#180).

#### Pendências

Os itens 5 a 9 do relatório `spec08_t085_fechamento_t086_faxina_16nov2026.md` continuam valendo e não são repetidos aqui.

| # | Pendência | Prioridade | Observação |
|---|-----------|-----------|------------|
| 1 | Revisão e merge do #181, do #182 e do #183 | 🟡 Média | Antes do congelamento de 24/11. Os três estão com o CI verde. O #183 foi aberto a partir da `develop` em `51e7b03`, sem conflito com os outros dois até agora. |
| 2 | Conferir o #182 num iPhone de verdade | 🟡 Média | Tocar 3 vezes em um produto, tocar no campo e digitar 6: tem que dar 6, não 36. O red team suspeita que o iOS não selecione o texto no toque. A correção está no código, mas não há aparelho no ambiente. |
| 3 | Dois balcões recebendo o mesmo saldo ao mesmo tempo | 🟢 Baixa | Suspeita do red team, no backend. A P-8 lê o saldo e só depois envia o POST. A janela já existia na reserva. Proposta para o 5º semestre: `expected_balance` opcional no `POST /payments`, com 409 dentro da trava. |
| 4 | "Receber na conta" poderia já abrir o painel | 🟢 Baixa | Hoje ele e "Ver conta fechada" levam à mesma URL. |
| 5 | Borda lateral do aviso "Saldo em aberto" em `rows.tsx` | 🟢 Baixa | Repassar ao Gabriel (dono do painel Hoje). |
| 6 | `formatDayMonth` no `@hotel/domain` | 🟢 Baixa | A data do painel Hoje é formatada à mão (🟢4 do red team da T-08.4). |
| 7 | `Field` com `<label>` envolvendo o controle | 🟢 Baixa | Dono indefinido, a repassar. |
| 8 | `GET /analytics/occupancy` respondendo 500 no ambiente de QA | 🟢 Baixa | Visto no painel Hoje em 17/11, com o banco `gestao_hotel_qa`. Fora do diff, não investigado. |
| 9 | Usuário duplicado `recep1@aurora.example` no tenant `sol` do banco de QA | 🟢 Baixa | Criado para testar o subdomínio do login. Só existe no banco de QA, que o script recria do zero. |
