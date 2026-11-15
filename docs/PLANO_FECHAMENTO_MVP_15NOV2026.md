# Plano de fechamento do MVP do Gesway — de 15/11 até a entrega em 10/12/2026

> Este documento pode ser lido sem nenhum outro. Os códigos internos das tarefas (M3, T-05.5 etc.)
> aparecem só entre parênteses, para quem quiser achar o assunto no repositório.

## 1. Por que este plano existe

O Gesway é um sistema de gestão para hotéis e pousadas pequenos: reservas, check-in e check-out,
comanda do garçom, pagamento e indicadores do gerente. O MVP do 4º semestre foi definido como
**um roteiro de demonstração de 7 passos**, apresentado ao vivo para a banca no computador do grupo
(Docker Compose, sem nuvem). Tudo que não aparece no roteiro fica para o 5º semestre.

Datas que não mudam:
- **24/11:** congelamento. Depois dele não entra funcionalidade nova, só correção.
- **01/12:** versão final publicada na `main` e ensaio geral.
- **10/12:** entrega e apresentação.

Em 14/11 o grupo fez o **primeiro ensaio completo**: os 7 passos funcionaram de ponta a ponta,
mas com problemas que ainda impedem uma demonstração tranquila. Este plano lista o que falta,
quem faz cada parte e como saber que ficou pronto.

## 2. Em que o Sirlande está trabalhando (levantado no git em 15/11)

- **Última atividade: 11/11.** Entre 27/10 e 11/11 ele trabalhou em duas coisas:
  - a **tela de pagamento no check-out**, que já está na `develop`;
  - o **agente de QA exploratório**, que usa o sistema no navegador como uma recepcionista usaria e reporta defeitos.
- **Comanda do garçom: nenhum commit desde 27/10.** A comanda é dele e ainda tem 2 pendências (ver §3, passo 3).
- Os únicos PRs abertos dele são de documentação: o registro de status (#133) e o parecer sobre o plano (#134).
- **Próximo item na lista dele, com prazo em 17/11:** fazer os dados de demonstração usarem as datas do dia. Hoje todas as reservas do seed são de janeiro a junho de 2026. Por isso, no dia da apresentação, o painel "Hoje" e os cartões do gerente aparecem **zerados**.

## 3. Situação do frontend, passo a passo do roteiro

O frontend é o app `app-pms`: React + TypeScript, um app só para recepção, garçom e gerente. Ele já tem as telas de login, painel Hoje, reservas, hóspedes, quartos e categorias, comanda e indicadores.

| # | Passo do roteiro | Tela | Situação |
|---|---|---|---|
| 1 | Administrador cadastra categorias e quartos | Quartos / Categorias | ✅ Pronto |
| 2 | Recepção cria a reserva, vê o valor antes de confirmar e faz o check-in | Nova reserva, Detalhe da reserva | ✅ Pronto (o walk-in do balcão vai direto ao check-in) |
| 3 | Garçom, pelo celular, lança consumo na conta da suíte e numa mesa, **inclusive sem rede** | Comanda | 🟡 Funciona, inclusive a fila que guarda os lançamentos sem rede. Faltam 2 acabamentos (abaixo) |
| 4 | Recepção abre o painel do dia: chegadas, saídas e risco de *no-show* | Hoje | 🟡 A tela está pronta, mas **aparece vazia** porque o seed não tem dados de hoje |
| 5 | No check-out, a conta aparece em linha do tempo, o pagamento é registrado, e a conta e a estadia fecham | Detalhe da reserva → Pagamento | ✅ Pronto (inclui o estorno) |
| 6 | Hóspede faz reserva direta e paga o sinal por PIX; o pagamento confirma a reserva | **Sem tela.** O site público é só uma pasta com README | 🟡 O backend funciona e foi ensaiado no sandbox do Asaas em 12/11. **Falta decidir como mostrar à banca** (abaixo) |
| 7 | Gerente abre os indicadores, servidos pelo serviço separado de analytics (a parte de microsserviços que a banca avalia) | Indicadores | 🟡 Pronto, mas em desenvolvimento local dá erro 404 enquanto o **PR #145** não entra. Também aparece zerado sem dados de hoje |

### O que falta no frontend para a demonstração

1. **Comanda, aviso de "sem conexão"** (achado 7 da revisão de 27/10). Quando a rede cai, a fila guarda o lançamento, mas o garçom não vê nenhum aviso de que está sem rede. Falta uma faixa "Sem conexão: os lançamentos serão enviados quando a rede voltar", ligada ao detector de conexão da biblioteca de dados (`onlineManager` do TanStack Query).
2. **Comanda, tempo restante para desfazer.** Depois de um toque, o garçom tem 5 segundos para desfazer. A tela mostra o preço do item, mas não quanto tempo ainda resta.
3. **Comanda, conferir os 3 acabamentos dados como feitos:** o aviso de mesa com nome repetido, a caixa que cortava a primeira linha e o rodapé fixo da conta. Basta uma passada do agente de QA exploratório.
4. **Proxy do ambiente de desenvolvimento (PR #145, aberto).** Corrige o erro 404 dos indicadores no `pnpm dev`. Precisa de merge.
5. **Passo 6, reserva direta.** Existem duas saídas:
   - **(a)** Mostrar pela API pública, com uma chamada pronta, o QR do PIX e a reserva mudando para "confirmada" na tela de reservas do app. Custo: quase zero. Foi a proposta da pauta de 03/11 (decisão 5), ainda não registrada.
   - **(b)** Construir uma página pública mínima de reserva. Custo: uns 3 a 4 dias, perto do congelamento.

   **Recomendação: (a).** Ver a pergunta ao Gabriel no §7.
6. **Risco conhecido, sem tarefa:** o app ainda não é um PWA, ou seja, não tem um *service worker* que guarde as telas no aparelho. Se o garçom **recarregar a página sem rede**, o app não abre. Na demonstração, o passo 3 deve **desligar a rede com a comanda já aberta e não recarregar**. Fica registrado para o 5º semestre.

### Revisão das telas "prontas" (15/11)

As telas marcadas como ✅ foram revisadas uma a uma, por papel, no computador e no celular
(`docs/qa/revisao_telas_prontas_15112026.md`). Funcionam todas, sem erro de JavaScript e sem
requisição com falha, mas a revisão achou pontos a corrigir antes do congelamento:
- **O seed põe hóspedes "na casa" em quartos marcados como livres.** O painel Hoje mostra "Livres 15 · Ocupação 0%" com 4 hóspedes na casa. Vai junto da tarefa do seed (Sirlande).
- **O check-in não confere as datas.** Uma reserva vencida em setembro ainda pode receber check-in e lançar diárias de noites que não aconteceram. A regra é decisão do Gabriel.
- **O gráfico de sazonalidade pula meses**, e o **comprovante não diz qual hotel o emitiu**.
- **O CPF aparece de três jeitos:** completo, mascarado e formatado, conforme a tela.
- Seis acabamentos menores, como o nome "Hotel PMS" no lugar de Gesway e alvos de toque pequenos no celular.

Fora do MVP, por decisão de 21/10 (não fazer agora):
- a tela de Usuários, que hoje mostra só "em breve";
- o rack (mapa visual de reservas);
- o financeiro;
- grupos e B2B;
- o site público completo.

## 4. O que falta fora do frontend

- **Dados de demonstração com as datas do dia** (Sirlande, até 17/11). Precisa ter:
  - uma estadia em andamento que cubra hoje;
  - uma chegada e uma saída marcadas para hoje;
  - um pagamento recebido hoje, no horário de Brasília;
  - um quarto "em limpeza", para mostrar o botão "liberar quarto".

  Rodar o seed duas vezes não pode duplicar dados, e ele continua exigindo `ALLOW_SEED=1`.
- **O sistema sobe na primeira tentativa** (Weslley). Hoje, num computador limpo, o primeiro `docker compose up` falha porque o backend não espera a fila de mensagens (RabbitMQ) ficar pronta. Isso precisa resolver antes da banca.
- **Trocar a chave de teste do Asaas** (Weslley, já). A chave apareceu num chat em 12/11.
- **Roteiro automatizado.** O ensaio de 14/11 foi feito por um script de navegador (Playwright) que passa pelos 7 passos. Esse script precisa entrar no repositório (Gabriel) e rodar no CI como verificação que avisa mas não bloqueia (Weslley). Assim, qualquer quebra no roteiro aparece no dia em que acontece, e não no ensaio.

## 5. Divisão do trabalho

### Gabriel (com os agentes de IA)
- Até 16/11:
  - revisar e fazer o merge do #145 (proxy) e do #144 (relatório do ensaio de 14/11), atualizando antes o painel de andamento que vai no #144;
  - decidir sobre os PRs de documentação #133, #134, #146 e #129.
- Até 20/11: colocar o roteiro automatizado no repositório (`frontend/e2e/`, comando `pnpm e2e`), com revisão do agente qa-redteam antes do merge.
- **Só se o Sirlande concordar** (a comanda é dele): implementar os itens 1 e 2 do §3, o aviso de sem conexão e o tempo restante para desfazer.
- Decisões que só ele pode tomar:
  - como mostrar o passo 6 (§3, item 5);
  - se o balcão passa a validar o CPF;
  - registrar no CLAUDE.md a regra de que, no walk-in, o check-in cancela a cobrança de sinal pendente.
- 01/12: publicar a versão final na `main`, com aprovação do Sirlande.

### Sirlande
- Até 17/11: dados de demonstração com as datas do dia (§4).
- Até 20/11: fechar a comanda. Pode fazer os itens 1 a 3 do §3 ele mesmo, ou combinar com o Gabriel que os itens 1 e 2 passam para ele.
- Revisar os PRs de frontend do Gabriel e aprovar a versão final de 01/12.

### Weslley
- Já: trocar a chave do Asaas.
- Até 17/11: fazer o sistema subir na primeira tentativa. Conferir com 3 ciclos de `docker compose down -v` seguido de `up -d` sem erro.
- Até 22/11:
  - colocar no CI o roteiro automatizado, sem bloquear o merge;
  - criar o job de CI do frontend (lint, tipos e testes).
- Documentos acadêmicos: estimativa de custo AWS (#146) e Doc 08, conferidos contra os critérios de aceite antes de cada reentrega.

### Todos
- **24/11, congelamento.** Segundo ensaio completo, num ambiente recém-criado, com os dados do dia. Critérios:
  - os 7 passos funcionam;
  - o painel Hoje e os indicadores mostram números diferentes de zero;
  - nenhum defeito 🔴 em aberto.
- **25 a 30/11:** só correções. Cada uma passa pela revisão do qa-redteam.
- **01/12:** versão final e ensaio geral.
- **10/12:** apresentação.

## 6. Calendário

| Data | O que precisa estar pronto | Quem |
|---|---|---|
| 15–16/11 | Merge do proxy (#145) e do relatório do ensaio (#144); chave do Asaas trocada | Gabriel · Weslley |
| 17/11 | Dados de demonstração com as datas do dia; sistema sobe na 1ª tentativa | Sirlande · Weslley |
| 20/11 | Comanda fechada; roteiro automatizado no repositório | Sirlande (+Gabriel) · Gabriel |
| 22/11 | Roteiro rodando no CI | Weslley |
| 24/11 | Congelamento + 2º ensaio, zero 🔴 | todos |
| 01/12 | Versão final na `main` + ensaio geral | Gabriel, com aprovação do Sirlande |
| 10/12 | Apresentação | todos |

## 7. Pergunta aberta ao Gabriel

Como mostrar o passo 6 (reserva direta com PIX)? A recomendação é mostrar pela API, com o QR e a
reserva confirmando no app, em vez de construir uma página pública às vésperas do congelamento.

## 8. Documentos ligados a este plano

- Mensagem ao Sirlande: `docs/delegacoes/fechamento_mvp_sirlande_15nov2026.md`
- Mensagem ao Weslley: `docs/delegacoes/fechamento_mvp_weslley_15nov2026.md`
- Painel de andamento, que acompanha o dia a dia: `docs/PAINEL_DE_ANDAMENTO_MVP.md`
- Relatório do primeiro ensaio (14/11): `docs/qa/ensaio_roteiro_14112026.md`

Próximo passo do Gabriel: o roteiro automatizado (`feature/e2e-roteiro`), a partir da `develop`,
depois que o #145 entrar.

## 9. Como verificar

- **Documentos:** conferir cada número de PR e cada situação com `git log origin/develop` e `gh pr list` antes do commit.
- **Roteiro automatizado:**
  - rodar num ambiente de compose recém-criado, só para o ensaio;
  - passar os 7 passos duas vezes seguidas;
  - apagar o ambiente no fim (`docker compose -p gesway-ensaio down -v`).
- **Dados do dia:** depois do seed, o painel Hoje e os 4 cartões do gerente mostram valores diferentes de zero.
