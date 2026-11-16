# Plano de fechamento do MVP do Gesway — de 15/11 até a entrega em 10/12/2026

> Este documento pode ser lido sem nenhum outro. Os códigos internos das tarefas (M3, T-05.5 etc.)
> aparecem só entre parênteses, para quem quiser achar o assunto no repositório.
>
> **Atualizado na noite de 15/11** com a resposta do Sirlande (PR #156) e com o estado real do git
> (§2). A versão HTML (`PLANO_FECHAMENTO_MVP_15NOV2026.html`) é a da tarde de 15/11; quando os dois
> divergirem, vale este arquivo.

## 1. Por que este plano existe

O Gesway é um sistema de gestão para hotéis e pousadas pequenos: reservas, check-in e check-out,
comanda do garçom, pagamento e indicadores do gerente. O MVP do 4º semestre foi definido como
**um roteiro de demonstração de 7 passos** (mais o passo 8, de 30 s, no Grafana), apresentado ao
vivo para a banca no computador do grupo (Docker Compose, sem nuvem). Tudo que não aparece no
roteiro fica para o 5º semestre.

Datas que não mudam:
- **24/11:** congelamento. Depois dele não entra funcionalidade nova, só correção.
- **01/12:** versão final publicada na `main` e ensaio geral.
- **10/12:** entrega e apresentação.

Em 14/11 o grupo fez o **primeiro ensaio completo**: os 7 passos funcionaram de ponta a ponta,
mas com problemas que ainda impediam uma demonstração tranquila. Este plano lista o que falta,
quem faz cada parte e como saber que ficou pronto.

## 2. Estado do time no git (noite de 15/11)

### Sirlande: muito ativo em 15/11
Da manhã ao fim da tarde, entregou e respondeu ao plano:
- **Resposta ao plano** (PR #156, aberto): concorda com a direção, escolhe a opção (b) da comanda,
  põe a SPEC-08 na carga dele e ajusta 3 pontos do seed (incorporados neste arquivo).
- **Seed com as datas do dia** (#157): ✅ na `develop` em 15/11, dois dias antes do prazo.
- **SPEC-08 mínima** (#159 a #162: Inter, marca Gesway, ícones, ação principal da reserva, abas
  com setas, foco da folha "Mais" e painel Hoje): ✅ na `develop` em 15/11, com o OK do Gabriel.
  O commit `17db690` corrigiu a tela de detalhe da reserva, que ficava em branco por um hook depois
  do `return` antecipado; ele entrou junto.
- **T-08.5** (#167, aberto, CI verde): `PageHeader` e `Section` no `@hotel/ui`, menos cartões nas telas.
- Docs abertos: decisões de bibliotecas (#155), relatório de 15/11 (#163), status (#133) e
  parecer de 28/10 (#134).

### Weslley: última atividade às 14:30 de 15/11
- **1º `up` a frio** (#148): ✅ na `develop`. O `./start.sh compose-up` (#154, do Gabriel) passou a
  avisar quando o `rabbitmq-setup` falha.
- Docs abertos: relatório da suíte com o broker de teste (#153), estimativa AWS (#146) e rascunho do
  Doc 08 (#129).
- **Nenhum commit** ainda em: imagem do MinIO (🔴, abaixo), roteiro no CI, `seed_hoje.sql` no
  `./start.sh seed` (k8s), passo 8 no Grafana e Doc 08 v1.3. A troca da chave do Asaas não tem
  registro no git (é feita no painel do Asaas): confirmar com ele.

### Gabriel (com os agentes de IA), em 15/11
- ✅ Na `develop`:
  - SPEC-09 (#149 a #151);
  - teste do proxy do Vite rodando de verdade (#152);
  - `compose-up` (#154);
  - 404 para id de reserva inválido (#164);
  - roteiro automatizado (#166);
  - relatório da sessão e folha de respostas da banca (#158).
- Abertos:
  - comanda (#165), aguardando a revisão do Sirlande;
  - red team da T-08.4 (#168), só documentação.

## 3. Situação do frontend, passo a passo do roteiro

O frontend é o app `app-pms`: React + TypeScript, um app só para recepção, garçom e gerente.

| # | Passo do roteiro | Tela | Situação |
|---|---|---|---|
| 1 | Administrador cadastra categorias e quartos | Quartos / Categorias | ✅ Pronto |
| 2 | Recepção cria a reserva, vê o valor antes de confirmar e faz o check-in | Nova reserva, Detalhe da reserva | ✅ Pronto. Walk-in vai direto ao check-in; o check-in só abre dentro do período da reserva (#147); uma ação principal por tela (SPEC-08) |
| 3 | Garçom, pelo celular, lança consumo na conta da suíte e numa mesa, **inclusive sem rede** | Comanda | 🟡 Os 2 acabamentos estão no **#165**, aguardando a revisão do Sirlande |
| 4 | Recepção abre o painel do dia: chegadas, saídas e risco de *no-show* | Hoje | ✅ Com dados do dia (#157) e mais enxuto (T-08.4). Restam 2 🟡 da T-08.4 (§3, item 7) e 2 🟡 do painel com o Gabriel (§5) |
| 5 | No check-out, a conta aparece em linha do tempo, o pagamento é registrado, e a conta e a estadia fecham | Detalhe da reserva → Pagamento | ✅ Pronto (inclui o estorno) |
| 6 | Hóspede faz reserva direta e paga o sinal por PIX; o pagamento confirma a reserva | Sem tela: pela API pública | ✅ Decidido: API + sandbox real do Asaas (§7). O provedor simulado fica para queda de rede |
| 7 | Gerente abre os indicadores, servidos pelo serviço separado de analytics (a parte de microsserviços que a banca avalia) | Indicadores | ✅ O 404 no `pnpm dev` acabou (#145) e os cartões têm números do dia (#157) |

O roteiro inteiro roda sozinho com `pnpm e2e` (#166): 7 passos, duas rodadas seguidas num ambiente
novo. Veja `frontend/e2e/README.md`.

### O que falta no frontend para a demonstração

1. ~~**Comanda, aviso de "sem conexão"**~~ e 2. ~~**tempo restante para desfazer**~~: **feitos no #165**
   (opção (b) do Sirlande). Faltam a revisão dele e a passada do qa-explorador.
3. **Comanda, conferir os 3 acabamentos dados como feitos:** o aviso de mesa com nome repetido, a
   caixa que cortava a primeira linha e o rodapé fixo da conta (Sirlande, com o qa-explorador, até 20/11).
4. ~~**Proxy do ambiente de desenvolvimento**~~: resolvido no #145.
5. ~~**Passo 6, reserva direta**~~: decidido em 15/11, opção (a) com o sandbox real do Asaas
   (webhook pelo ngrok, como no ensaio de 12/11).
6. **Risco aceito, sem tarefa:** o app ainda não é um PWA. Se o garçom **recarregar a página sem
   rede**, o app não abre. No passo 3, desligar a rede com a comanda já aberta e não recarregar.
   Fica para o 5º semestre.
7. **Painel Hoje, 2 🟡 da T-08.4** (Sirlande, até 24/11; comentados no #162):
   - no celular de 375 px, a lista de chegadas ainda passa do limite de 3.000 px no pior caso (3.091 px);
   - "Ver todas" e "Mostrar menos" perdem o lugar na tela e o foco do teclado.
8. **T-08.5** (#167): revisar antes do congelamento.

Bibliotecas (decisão de 15/11, #155): **só a Inter e o `lucide-react` entram antes de 10/12**.
As duas já estão na `develop`.

### Revisão das telas "prontas" (15/11)

As telas marcadas como ✅ foram revisadas uma a uma, por papel, no computador e no celular
(`docs/qa/revisao_telas_prontas_15112026.md`). Situação dos pontos achados:
- ~~O seed põe hóspedes "na casa" em quartos marcados como livres~~: resolvido no #157.
- ~~O check-in não confere as datas~~: resolvido no #147. O hóspede de madrugada no dia da saída
  fica como limitação aceita no MVP.
- ~~O gráfico de sazonalidade pula meses; o comprovante não diz qual hotel o emitiu; o CPF aparece de
  três jeitos~~: resolvidos na SPEC-09 (#149 a #151).
- ~~Nome "Hotel PMS"; botões desabilitados na reserva encerrada; "Sair" com 36 px~~: resolvidos na
  SPEC-08 (#160 e #161; o "Sair" tem 48 px até o desktop).

### Reavaliação do MVP contra o Termo e os documentos entregues (15/11)

**Conclusão: o MVP faz sentido e cumpre o Termo do 4º semestre.** O Termo pede os 8 documentos e
"um MVP funcional do sistema, demonstrando a viabilidade da proposta e a integração inicial dos
microsserviços". O passo 7 mostra o `analytics-service` separado, recebendo eventos do core pelo
RabbitMQ.

Os documentos estão coerentes com esse recorte:
- o Doc 08 define o MVP como o roteiro de 7 passos;
- o Doc 06 (C4) se declara arquitetura-alvo;
- o Doc 02 explica que as rotas B2B ficam no core até a extração do `b2b-service`, no 5º semestre.

| # | Ponto | Critério do Termo | O que fazer | Dono | Situação |
|---|---|---|---|---|---|
| R1 | A única API externa visível é o PIX | Integração externa (C2) | Passo 6 com o **sandbox real do Asaas**; o simulado só se a rede cair. O ViaCEP fica como evidência, pelo Swagger | Gabriel e Weslley | Decidido |
| R2 | Prometheus e Grafana estão no compose, mas nenhum passo abre o Grafana | Monitoramento (C8) | **Passo 8, de 30 s:** o painel do Grafana com as métricas do core e a fila do RabbitMQ | Weslley | A fazer |
| R3 | Os workflows existem, mas a banca não os vê | CI/CD (C6) | Uma execução verde do GitHub Actions aberta na apresentação | Weslley | A fazer |
| R4 | O Doc 08 entregue é a v1.1 (29/10) | Documentação (C9) | Doc 08 v1.3 com o estado real, antes de 10/12 | Weslley | A fazer |
| R5 | O menu "Usuários" mostrava "em breve" | — | Esconder o item no MVP | Gabriel | ✅ SPEC-09 (#149 a #151) |
| R6 | Perguntas prováveis da banca (funcionários, hotel novo, FNRH, caixa) | — | Folha de respostas | Gabriel | ✅ `docs/banca/FOLHA_RESPOSTAS_BANCA.md` (#158) |

Fora do MVP, por decisão de 21/10 (não fazer agora): a tela de Usuários, o rack, o financeiro,
grupos e B2B, e o site público completo.

## 4. O que falta fora do frontend

- ✅ **Dados de demonstração com as datas do dia** (#157). Critérios da resposta do Sirlande (#156, §3):
  - **Os indicadores acendem pelos triggers do outbox.** O `migrate` cria os triggers antes do
    seed, então o que o seed grava chega ao analytics pelo mesmo caminho da API. O
    `outbox-initial-load` só é necessário num banco populado antes dos triggers.
    **No ensaio de 24/11: conferir que o publicador e o consumidor estão de pé quando o seed roda.**
  - **O fuso é do seed, não do analytics.** O analytics já conta o dia no fuso do hotel (D-68). O
    seed calcula "hoje" no horário de São Paulo, então rodar depois das 21h em Brasília não grava amanhã.
  - **Idempotência com datas relativas.** Rodado de novo, o seed reescreve datas e status, sem criar
    linhas, e respeita a janela do check-in (#147). **Critério: rodar o seed em dois dias diferentes
    mantém o painel Hoje com números diferentes de zero nos dois.**
  - Pendência (Weslley): o `./start.sh seed` (k8s) ainda não aplica o `seed_hoje.sql`. No compose,
    o seed já o aplica.
- **O sistema sobe na primeira tentativa** (Weslley):
  - ✅ a espera do RabbitMQ (#148), e o `./start.sh compose-up` avisa se o setup falhar (#154);
  - 🔴 **em aberto: a imagem do MinIO.** O `docker-compose.yml` (linhas 48 e 67) usa
    `quay.io/minio/minio:latest`, que deu 401 num computador limpo. **É o maior risco para o ensaio
    de 24/11.**
- **Trocar a chave de teste do Asaas** (Weslley, já). A chave apareceu num chat em 12/11. Sem
  registro no git: confirmar.
- ✅ **Roteiro automatizado no repositório** (#166). Falta **rodar no CI** como verificação que avisa
  mas não bloqueia (Weslley, até 22/11). Os cuidados com o artefato do trace estão no README do e2e.

## 5. Divisão do trabalho

### Gabriel (com os agentes de IA)
- ✅ Até 16/11: merge do #145 (proxy) e do #144 (ensaio de 14/11).
- **Ainda a decidir:** os PRs de documentação #133, #134, #146 e #129, e os PRs de documentação
  do Sirlande (#155, #156 e #163) e do Weslley (#153).
- ✅ Roteiro automatizado (#166), com o qa-redteam antes do merge.
- ✅ Comanda, opção (b): aviso de sem conexão e tempo para desfazer (#165, aguardando o Sirlande).
- ✅ SPEC-09 (#149 a #151) e folha de respostas da banca (#158).
- Até 24/11, os 2 🟡 do painel Hoje que estão com ele (`docs/qa/repasses/para_gabriel_15112026.md`):
  - os cartões do topo ficam uma ação atrás;
  - o duplo clique em "Confirmar check-in" envia dois PUT.
- No roteiro: o passo 6 no sandbox real (R1).
- Decisões que só ele pode tomar:
  - se o balcão passa a validar o CPF (dígito verificador);
  - registrar no CLAUDE.md a regra de que, no walk-in, o check-in cancela a cobrança de sinal pendente.
- 01/12: publicar a versão final na `main`, com aprovação do Sirlande.

### Sirlande
Resposta dele em 15/11: PR #156.

| O quê | Prazo | Situação |
|---|---|---|
| Dados de demonstração com as datas do dia (§4) | 17/11 | ✅ #157, em 15/11 |
| Comanda, opção (b): revisar o #165 e conferir os outros 3 acabamentos com o qa-explorador | 20/11 | A fazer (0,5 dia) |
| SPEC-08 mínima: T-08.1, T-08.2, T-08.3 e T-08.4 | 24/11 | ✅ #159 a #162, em 15/11. Faltam os 2 🟡 da T-08.4 (§3, item 7) |
| Setas do teclado nas abas da reserva e foco da folha "Mais" | 24/11 | ✅ no #161 |
| T-08.5, cabeçalho e seções | 24/11 | #167 aberto |
| Revisão do roteiro automatizado | antes de 24/11 | O #166 já entrou; a revisão dele continua bem-vinda e vira correção |
| Aprovação da versão final `develop → main` | 01/12 | — |

A T-08.6 ("Sair" com 36 px) foi resolvida dentro do #161, com o botão de 48 px até o desktop.

### Weslley
- Já: trocar a chave do Asaas (confirmar).
- 🔴 Até 17/11: a imagem do MinIO que dá 401 num computador limpo (§4). Conferir com 3 ciclos de
  `docker compose down -v` seguido de `./start.sh compose-up --build` sem erro.
- Até 22/11: o roteiro (`pnpm e2e`) no CI, como job separado que não bloqueia o merge. O job de CI do
  frontend (tipos, testes e build) já existe (`ci-frontend.yml`).
- Até 24/11:
  - o passo 8 no Grafana (R2) e uma execução verde do Actions pronta para mostrar (R3);
  - o `seed_hoje.sql` no `./start.sh seed` (k8s);
  - o rótulo `CARTAO` em `shares.ts`.
- Antes de 10/12: Doc 08 v1.3 com o estado real (R4).
- Documentos acadêmicos: estimativa de custo AWS (#146) e Doc 08, conferidos contra os critérios de
  aceite antes de cada reentrega.

### Todos
- **24/11, congelamento.** Segundo ensaio completo, num ambiente recém-criado, com os dados do dia. Critérios:
  - os 7 passos funcionam (`pnpm e2e` verde), mais o passo 8 no Grafana;
  - o passo 6 no sandbox real do Asaas;
  - o publicador e o consumidor do outbox de pé quando o seed roda;
  - o painel Hoje e os indicadores com números diferentes de zero;
  - nenhum defeito 🔴 em aberto.
- **25 a 30/11:** só correções. Cada uma passa pela revisão do qa-redteam.
- **01/12:** versão final e ensaio geral.
- **10/12:** apresentação.

## 6. Calendário

| Data | O que precisa estar pronto | Quem | Situação |
|---|---|---|---|
| 15–16/11 | Merge do proxy (#145) e do relatório do ensaio (#144); chave do Asaas trocada | Gabriel · Weslley | ✅ merges · chave a confirmar |
| 17/11 | Dados do dia; sistema sobe na 1ª tentativa | Sirlande · Weslley | ✅ seed · 🔴 MinIO em aberto |
| 20/11 | Comanda fechada; roteiro automatizado no repositório | Sirlande (+Gabriel) · Gabriel | #165 na revisão · ✅ #166 |
| 22/11 | Roteiro rodando no CI | Weslley | A fazer |
| 24/11 | SPEC-08 mínima na `develop` | Sirlande | ✅ em 15/11; 2 🟡 e a T-08.5 em aberto |
| 24/11 | Congelamento + 2º ensaio, zero 🔴 | todos | — |
| 01/12 | Versão final na `main` + ensaio geral | Gabriel, com aprovação do Sirlande | — |
| 10/12 | Apresentação | todos | — |

## 7. Decisões e o que segue em aberto

- **Decidido em 15/11:** o passo 6 é mostrado pela API, com o QR e a reserva confirmando no app,
  no sandbox real do Asaas.
- **Decidido em 15/11:** a SPEC-09 foi aprovada (`a122664`); na lista de hóspedes, o CPF aparece
  completo e formatado.
- **Decidido em 15/11:** comanda pela opção (b) (#156) e SPEC-08 mínima na carga do Sirlande.
- **Em aberto (Gabriel):** validar o CPF no balcão; "-R$" na coluna Valor da conta; quem cuida da
  normalização do CPF.

## 8. Documentos ligados a este plano

- Resposta do Sirlande: `docs/delegacoes/resposta_sirlande_fechamento_mvp_15nov2026.md` (PR #156)
- Mensagem ao Sirlande: `docs/delegacoes/fechamento_mvp_sirlande_15nov2026.md`
- Mensagem ao Weslley: `docs/delegacoes/fechamento_mvp_weslley_15nov2026.md`
- Painel de andamento, que acompanha o dia a dia: `docs/PAINEL_DE_ANDAMENTO_MVP.md`
- Relatório do primeiro ensaio (14/11): `docs/qa/ensaio_roteiro_14112026.md`
- Roteiro automatizado: `frontend/e2e/README.md`
- Folha de respostas da banca: `docs/banca/FOLHA_RESPOSTAS_BANCA.md`

Próximo passo do Gabriel: os 2 🟡 do painel Hoje (§5) depois da revisão do #165, e o qa-explorador
nas telas da SPEC-09 (390 px e impressão).

## 9. Como verificar

- **Documentos:** conferir cada número de PR e cada situação com `git log origin/develop` e `gh pr list` antes do commit.
- **Roteiro automatizado:** `pnpm e2e` num ambiente de compose recém-criado, só para o ensaio
  (`gesway-ensaio`); passar os 7 passos duas vezes seguidas; apagar o ambiente no fim
  (`docker compose -p gesway-ensaio down -v`).
- **Dados do dia:** depois do seed, o painel Hoje e os 4 cartões do gerente mostram valores
  diferentes de zero, também quando o seed roda em outro dia.
