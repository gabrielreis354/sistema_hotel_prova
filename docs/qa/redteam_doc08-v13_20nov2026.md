# QA Red Team — Doc 08 v1.3 (Planejamento de Sprints e Tarefas)
**Documento:** `Projetos/gesway/08-planejamento-sprints-tarefas.md` (fork da UniFAAT, worktree `/mnt/c/Users/lucas/unifaat-doc08-v13`, branch `docs/doc08-v1.3`, alteração ainda não commitada sobre `94638ae` = v1.2) · **Dev:** Weslley · **Base do produto:** `origin/develop@859cb30` · **Data:** 20/11/2026
**Arquivos auditados:** 1 (717 linhas), contra o git do produto, o fork (`origin/main`, PR #8, #9 e #10) e as SPECs da `develop`
**Achados no escopo:** 18 (🔴 0 · 🟡 5 · 🟢 13) · **Repassados:** 0

## Veredito
**APROVADO COM RESSALVAS**

Nenhum número de PR ou commit está inventado. Conferi 91 PRs e 23 hashes, e todos existem na `develop`
(ou na `main`, quando o documento diz *release*). Só uma data diverge no fuso de São Paulo. O documento
cumpre o 🔴-3 da revisão de 19/11: a evidência do C1 está visível, com H.2 #105, H.3 #109, R2 e M7-a/b.

As ressalvas são de dois tipos. Primeiro, um resíduo literal do 🔴-3: o "PR #97 ainda aberto" da S6.
Segundo, três ✅ que contrariam a própria regra do Doc 08 ou a especificação sem nota: T-03.3, T-01.3 e
a data do CA-01.5.a. Não há 🔴, porque nada no texto afirma como entregue algo que não existe no
código. Ainda assim, convém corrigir os 🟡 antes do merge no fork: a banca cruza o Doc 08 com as SPECs.

## Achados no escopo

### 🟡-1 [registro real] S6 ainda diz que o PR #97 está "ainda aberto", e a versão do Doc 07 contradiz a S8
**Onde:** Doc 08 linha 423, que diz *"Doc 07 v1.0, com 11 ADRs, no PR #97, aberto em 15/10 e ainda aberto."*
**Evidência:** `gh pr view 97` → criado em 15/10, **mergeado em 29/10/2026 19:58 (BRT)**, com o título *"Doc 07 v1.1 — 11 ADRs para entrega"*.
A linha 479 do mesmo documento diz *"Em 29/10, o Doc 07 v1.1, com 11 ADRs, PR #97"*.
**Cenário:** a banca lê a S6 e encontra exatamente a frase que o 🔴-3 da CONTRADICOES citou como prova
de desatualização (*"ADRs 'no PR #97, aberto'"*). Cinquenta linhas depois, o mesmo PR aparece como
mergeado, e com outra versão do documento.
**Regra violada:** a regra do próprio Doc 08 (§1, linha 21) e o 🔴-3 da revisão de 19/11.
**Correção sugerida:** trocar por *"Doc 07 com 11 ADRs, PR #97, aberto em 15/10 (mergeado em 29/10, na S8)"*.

### 🟡-2 [✅ sem evidência] T-03.3 marcada ✅ com o CA-03.3.a ainda aberto e o parágrafo só num PR aberto do fork
**Onde:** linha 254, que diz `T-03.3 ... | ADR-008 no PR #97 (29/10) | ✅`. Na v1.2 a linha era 🟡.
**Evidência:**
- `docs/specs/SPEC-03-integracoes-externas.md` na `develop`, Situação em 19/11: *"a T-03.3 segue 🟡, porque o CA-03.3.a pede o parágrafo da ADR-008 comparando Asaas e Mercado Pago, ainda não escrito"*. O CA-03.3.a está `[ ]`.
- O parágrafo *"Escolha do provedor do roteiro: Asaas × Mercado Pago"* existe só em `origin/docs/revisao-contradicoes-19nov` (PR #10 do fork, **OPEN**). Ele não está em `origin/main` do fork, e o ADR-008 do PR #97 não traz a comparação.

**Cenário:** o professor abre a SPEC-03 e encontra 🟡 com o CA desmarcado. No Doc 08, a mesma tarefa
aparece ✅, sem a nota de rodapé que o documento usa nos outros casos (¹, ²). A própria regra da linha 21
diz que *"PR aberto aparece como em andamento"*.
**Regra violada:** Doc 08 §1 (linha 21), legenda da linha 233 e DoD §7 (linha 635).
**Correção sugerida:** voltar para 🟡, com a nota *"comparação Asaas × Mercado Pago no PR #10 do fork, aberto"*. Quando o PR #10 entrar, vira ✅.

### 🟡-3 [data e evidência] CA-01.5.a do analytics e o webhook "200 ignored" datados em 09/11, mas entraram na develop em 04/11
**Onde:** linhas 244, 500, 507 e 583, e indiretamente a linha 269.
**Evidência:**
- Os PRs #111 (webhook 200), #112 (*workflow* do analytics) e #113 (RabbitMQ no CI do core) foram mergeados **direto na `main`** em 04/11.
- O PR #121, de 04/11 20:21 BRT (*"sincroniza a main na develop (#111, #112, #113 entraram direto na main)"*), levou esse código à `develop`. O commit `245bb82` é o que **cria** `.github/workflows/ci-analytics-service.yml` na `develop` (`git log --diff-filter=A`).
- Nos commits de merge, o diff real contra o primeiro pai é pequeno: #114 (`9cda046`) mudou 2 arquivos, com +6/−1; #115 (`bd0721e`) mudou 1 arquivo, com +10/−1; #128 (`0ff0021`) mudou 6 arquivos, com +10/−9.
- A SPEC-01, na Situação em 19/11, diz *"(CA-01.5.a) desde 04/11 (#112, #113)"*.

**Cenário:** a banca compara o Doc 08 (09/11, #114/#115) com a SPEC-01 (04/11, #112/#113) e acha duas
datas e dois pares de PR para a mesma entrega. A linha 507 também credita ao #128 o comportamento
entregue pelo #111, e o #128 só fez os ajustes do QA. A sprint (S9) está certa; a data e a evidência, não.
A linha 269 (*"Portão por serviço no CI desde a S8 ... no core e no analytics"*) também erra: na S8 o
analytics tinha limiar no `vitest.config.js` (desde `e122749`, no #105), mas nenhum *workflow* o rodava.
O portão do analytics no CI começa em 04/11, na S9.
**Regra violada:** Doc 08 §1, que pede como evidência o PR ou o merge na `develop`.
**Correção sugerida:** na linha 244, escrever *"S9 · analytics e RabbitMQ no CI do core, PRs #112 e #113 na `main` e sincronizados na `develop` pelo #121 (04/11); ajustes nos #114 e #115 (09/11)"*. Na linha 507, escrever *"#111 (04/11, via #121) e ajustes do QA no #128 (09/11)"*. Na linha 269, escrever *"core desde a S8, analytics desde 04/11 (S9)"*.

### 🟡-4 [coerência com as SPECs] T-01.3 ✅ esconde o CA-01.3.c adiado, e a promessa da linha 23 só vale para 3 tarefas
**Onde:** linha 242 (T-01.3 ✅), linha 23 (*"Quando a especificação está defasada ... este documento segue o git e aponta a diferença"*) e linha 635 (DoD: *"CAs ... marcados na própria especificação"*).
**Evidência:** a SPEC-01 traz `T-01.3 🟡`, com o CA-01.3.c `[ ]` (*"implementação na T-01.6"*, que é do 5º semestre).
O CA-01.3.d está implementado (`rabbitmq-setup.sh:77`, usuários separados) e o CA-01.3.e está na ADR-006 do Doc 07 v1.1, mas os dois seguem desmarcados.
Outros ✅ do Doc 08 também não batem com o marcador da SPEC, e nenhum tem nota de rodapé:
- T-02.1: SPEC-02 🟡, CA-02.1.d `[ ]`;
- T-05.1, T-05.2, T-05.3 e T-05.5: SPEC-05 🟡;
- T-05.6: SPEC-05 🔲;
- T-01.5: SPEC-01 🔲, com os CA-01.5.a a e todos `[ ]`.

Notas existem só para a T-01.2, a T-06.13 (¹) e a T-03.2 (²).
**Cenário:** a T-01.5 foi corretamente separada em *"✅ a · ✂️ b a e"*, mas a T-01.3, com o mesmo padrão (um CA adiado para a T-01.6), aparece ✅ inteira. Pela DoD da linha 635, nenhum desses ✅ cumpre *"CAs marcados na especificação"*.
**Regra violada:** coerência interna (linha 23 contra a linha 635) e R-4 da CONTRADICOES (*"atualizar os status [das SPECs] antes do Doc 08 v1.3"*).
**Correção sugerida:**
- T-01.3: escrever *"✅ a, b, d, e · ✂️ c (T-01.6)"*.
- Acrescentar uma nota geral: *"as SPECs 01, 02 e 05 trazem na 'Situação em 19/11' o estado real; os marcadores por tarefa são históricos"*. A SPEC-01 diz exatamente isso na linha 6.
- Ou suavizar a linha 635 para *"... ou registrados na Situação da especificação"*.

### 🟡-5 [CONTRADICOES 🟡-4] "Governança" saiu só pela metade
**Onde:**
- linha 268: *"governança (T-05.9, fora do escopo pelo Doc 01, §5.2)"* dentro de uma linha marcada ✂️, que a legenda da linha 233 define como *"cortada para o 5º semestre"*;
- linha 188, no Gantt do 5º semestre: *"Frontend restante T-05.4 e T-05.7 a 12"*, que inclui a T-05.9;
- linha 204: *"O 4º semestre não tem tela para camareira nem governança"*, o que sugere que o 5º semestre terá.

O histórico da linha 708 afirma *"'Governança' fora da lista do 5º semestre"*.
**Cenário:** o 🟡-4 pedia *"Tirar 'governança' do Doc 08"*, porque o Doc 01 §5.2 a põe fora do escopo do projeto. Do jeito que está, o Gantt do 5º semestre continua prometendo a T-05.9, e o histórico diz que a correção foi feita.
**Correção sugerida:** linha 268 vira `T-05.7, T-05.8, T-05.10 a T-05.12` (✂️), com uma linha à parte `T-05.9 | fora do escopo (Doc 01 §5.2) | —`. A barra do Gantt vira *"T-05.4, T-05.7, T-05.8 e T-05.10 a 12"*. Na linha 204, trocar "O 4º semestre não tem" por "O projeto não tem".

### 🟢-1 [data] PR #76 está no dia errado no fuso de São Paulo
**Onde:** linhas 275 e 327, com *"PR #76 (15/09)"*.
**Evidência:** `mergedAt 2026-09-15T00:43:27Z` dá **14/09, 21:43 BRT**.
**Correção:** trocar por 14/09. A sprint (S1) não muda.

### 🟢-2 [§2.3 item 11] "free-tier" sobrou na S5
**Onde:** linha 401, que diz *"previa uma instância fora do free-tier, e a regra do projeto não permite"*.
**Cenário:** a frase está no presente e contradiz a ADR-004 v1.1 (t3.small dentro do plano de créditos) e as linhas 204 e 688.
**Correção:** escrever *"... fora do free-tier, que era a regra do projeto na época (hoje: plano de créditos)"*.

### 🟢-3 [fonte] Data de origem do corte da tela "Financeiro"
**Onde:** linha 267, com *"(plano de 15/11)"*.
**Evidência:** `docs/PLANO_FECHAMENTO_MVP_15NOV2026.md:138` diz *"Fora do MVP, por decisão de 21/10 ... o financeiro"*.
**Correção:** escrever *"decisão de 21/10, confirmada no plano de 15/11"*.

### 🟢-4 [afirmação sem merge] O passo 8 é citado como se já estivesse no repositório
**Onde:** linha 73 (*"Roteiro em `docs/roteiro/PASSO_8_GRAFANA.md`"*) e linha 203 (*"... com as métricas do core, do analytics e do RabbitMQ"*).
**Evidência:** `git cat-file -e origin/develop:docs/roteiro/PASSO_8_GRAFANA.md` indica que o arquivo não existe na `develop`. Ele está só no PR #193, aberto.
**Correção:** acrescentar *"(PR #193)"* nos dois pontos, ou *"se o PR #193 entrar até 24/11; senão, a exceção da §10"*.

### 🟢-5 [coerência] DOC-08 tratado diferente dos DOC-01 a 07, e a v1.3 não está na branch citada
**Onde:** linha 292 (🟡) contra as linhas 285 a 291 (✅ vX da `main`) e o Gantt da linha 159 (*"Docs 01 a 08 na main do fork :done"*).
**Evidência:**
- O fork `origin/main` tem o Doc 08 v1.1, vindo do PR #8 de 11/11.
- `origin/entrega-8-sprints` = `94638ae` = v1.2.
- A v1.3 está numa branch local `docs/doc08-v1.3`, sem *push*.

**Correção:** escrever *"✅ v1.1 · v1.2 e v1.3 em …"*, no mesmo padrão das demais linhas, e citar o nome da branch onde a v1.3 for publicada.

### 🟢-6 [Gantt e sprints] A coluna "Sprint planejada" não mostra replanejamentos que a §5 mostra
**Onde:**
- linha 281: ROT-01 consta como "S9", mas a S10 (linha 523) a planeja;
- linha 243: T-01.4 consta como "S5–S6 → S8", mas a H.3 foi replanejada para a S9 (linha 497);
- linha 279: T-06.12 consta como "S9", mas não aparece na tabela da S9 (linhas 495 a 502).

**Correção:** escrever "S9 → S10" e "S5–S6 → S8 → S9", e incluir a T-06.12 na tabela da S9 ou explicar a omissão.

### 🟢-7 [CONTRADICOES §5 item 1] As decisões de 03/11 não foram fechadas no texto
**Onde:** linha 475 (*"A decisão final é do ponto de controle de 03/11"*), linha 481 (*"A confirmação do time é no ponto de controle de 03/11"*) e linha 508.
**Evidência:** `docs/delegacoes/pauta_ponto_controle_03nov2026.md` §3 tem 7 itens. O Doc 08 registra só os itens 5 e 7 e a decisão 10. O item 6 (*fechamento só no balcão; INTERNAL nunca é receita*) e a confirmação dos itens 1, 2 e 4 não aparecem.
**Correção:** uma linha na S9, por exemplo *"03/11: tabela de metas e M5-b/M5-c/M8 com o Sirlande confirmadas; fechamento só no balcão no MVP"*. Antes, confirmar com a ata ou a ficha do encontro.

### 🟢-8 [Gantt × backlog] O painel do RabbitMQ aparece `done` no Gantt e 🟡 no backlog
**Onde:** linha 147 (`:done, w5`) contra a linha 251 (CA-01.4.f 🟡).
**Correção:** renomear a barra para *"Painel do RabbitMQ (fila e DLQ)"*.

### 🟢-9 [CONTRADICOES 🟡-17] A definição de cobertura não é a mesma em todos os pontos
**Onde:** a linha 636 (DoD) diz *"≥ 60% de linhas"*. As linhas 269 e 653 dizem 60/60/60/55, em linhas, *statements*, funções e *branches*.
**Correção:** copiar a definição da linha 653 para a DoD.

### 🟢-10 [exagero] Docs 01 a 07 "corrigidos"
**Onde:** linhas 562 e 681, com *"Os Docs 01 a 07 foram corrigidos no PR #10 do fork"*.
**Evidência:** o PR #10 está OPEN, criado em 19/11 às 21:16 BRT.
**Correção:** escrever *"corrigidos no PR #10 do fork, aberto"*. É o mesmo cuidado da linha 21.

### 🟢-11 [atribuição] O #154 não é do Weslley
**Onde:** linhas 282 e 533, onde o #154 aparece junto do #148 (Weslley) na ROT-02.
**Evidência:** o autor do #154 é `gabrielreis354`, e o título diz *"(revisão do #148)"*.
**Correção:** escrever *"PR #154, revisão do Gabriel"*. A §8 mede entregas por trilha.

### 🟢-12 [SUSPEITA] "O qa-redteam revisa toda branch antes do merge"
**Onde:** linha 625.
**Evidência parcial:** numa amostra de 10 PRs de 16 a 19/11, 8 citam o qa-redteam no corpo. O #186 e o #177 não citam, e não achei relatório correspondente em `docs/qa/`. Não confirmei: pode existir relatório com outro nome.
**Correção:** conferir antes de afirmar "toda", ou escrever "toda branch de código".

### 🟢-13 [metas] As datas vencidas das metas não aparecem
**Onde:** linhas 574 a 583.
**Evidência:**
- M1: meta 30/10, entrega 02/11;
- M2 e M5-a: meta 30/10, entrega 03/11;
- M7-a: meta 29/10, entrega 31/10;
- M5-b: meta 07/11, entrega 09/11.

A métrica da linha 656 é *"Cada meta pronta até a data dela"*.
**Correção:** acrescentar *"(atraso de N dias)"* na situação. Isso reforça a honestidade do registro, que é o argumento do documento.

## Repassados a outro dev
Nenhum novo. Dois desvios fora do Doc 08 já estão registrados e não pedem repasse:
- SPECs com marcadores desatualizados: R-4 da CONTRADICOES.
- PRs #111 a #113 mergeados direto na `main`: reconhecidos no próprio título do #121.

## O que foi verificado e está correto
- **91 PRs citados** (#76 a #192), conferidos em `gh pr list --state merged` quanto a número, base e data em BRT. Todos estão mergeados, e todos os de "develop" estão na `develop`. Os de *release* (#76, #98, #102, #103, #110) estão na `main`. As únicas divergências são as do 🟢-1 e do 🟡-3.
- **23 hashes citados**, todos ancestrais de `origin/develop`, com data e assunto batendo: `ac39409`, `b9e33a4`, `bc4d5c1`, `8840ad5`, `754d278`, `03feba4`, `ee5a685`, `c6742b2`, `6526bcd`, `72ef709`, `a89528b`, `b4966cd`, `9d10b56`, `a6dc1ea`, `1cbc4c0` (17/10 00:07 BRT), `625e0a7`, `8b1f774`, `bb122d1` (cria `ci-core-service.yml` e `ci-frontend.yml`), `94f7abf`, `062734f`, `0f1ec04`, `df8eac2` e `859cb30`.
- **PRs abertos:** #179 (aberto), #193 (aberto em 20/11, `feature/analytics-metrics`), PR #9 e PR #10 do fork (abertos). O PR #8 do fork foi mergeado em 11/11.
- **Versões dos documentos:** as do fork `main` (01 v1.1, 02 v1.4, 03 v1.3, 04 v1.4, 05 v1.3, 06 v1.2, 07 v1.1, 08 v1.1), as do PR #10 (01 v1.2, 02 v1.5, 03 v1.4, 04 v1.5, 05 v1.5, 06 v1.3, 07 v1.2) e a do PR #9 (05 v1.4) batem com as linhas 285 a 292.
- **Autoria por trilha:**
  - Weslley: #114 a #119, #122, #128, #135, #139, #143, #146, #148, #153, #176 e #177;
  - Sirlande: #130, #132, #141, #157, #159 a #162, #167, #170, #172, #173, #180 a #183, #185, #186 e #188.
- **🟡-23 da CONTRADICOES:** a frase da S7 *"Trilha do Weslley: sem entrega na develop"* é **verdadeira**. Não há merge do Weslley em `--first-parent` entre 21 e 27/10. As entregas a partir da S8 estão registradas.
- **Afirmações técnicas conferidas no código:**
  - T-06.12: o consumidor do analytics loga só o id e o tipo (`consumer.js:141`);
  - 7 consultas: 7 *controllers* em `AnalyticsApi/`;
  - limiares 60/60/60/55 no core e no analytics (`vitest.config.js`);
  - "~85% de statements em 04/11": `docs/qa/redteam_t053-painel-hoje_04nov2026.md:128` registra 85,73%;
  - nenhum *push* de imagem, e `ci-e2e.yml:110` usa `push: false`;
  - e2e sem bloquear (comentário no `ci-e2e.yml`), com as execuções de 18 e 19/11 em `success`;
  - *profile* `observability`;
  - plano B do passo 6 exercitado pelo e2e (`roteiro.spec.ts:239`, `services/core-service/scripts/simular_pagamento_pix.js`);
  - passo 3 sem rede no e2e (`setOffline`);
  - aprovação do catálogo em 04/10 (`docs/delegacoes/rodada3_gabriel_04out2026.md:5`).
- **Itens do Doc 08 na §5 da CONTRADICOES:**
  - item 1 atendido, salvo o 🟢-7;
  - item 2 atendido;
  - item 3 atendido: a T-01.5 traz *"a ✅ · b a e ✂️"*. A CONTRADICOES sugeria a+d ✅, e a v1.3 segue a SPEC-01 de 19/11, que põe o d no 5º semestre porque não há deploy. A divergência é justificada na nota ⁵;
  - item 4 atendido (linhas 75 e 77);
  - item 5 parcial (🟡-5 e 🟢-2).
- **🔴-7:** a exceção ao RNF-029 está declarada nas linhas 682 e 695.
- **🟡-21 e 🟡-25:** resolvidos.
- **Tabelas:** a contagem de colunas é a mesma do cabeçalho em todas as linhas. Conferi por script as 717 linhas.
- **Mermaid:** nos dois `gantt`, todas as tarefas têm id único, nenhuma data final vem antes da inicial, `milestone` está com `0d`, e `after c1`/`after c2` referenciam ids existentes.

## Não foi possível verificar
- **Renderização real do Mermaid:** não há `mmdc` nem `mermaid` instalados offline. A validação foi estrutural. Antes do merge no fork, renderizar no GitHub ou no Mermaid Live.
- **Datas de entrega no repositório da UniFAAT (upstream `AleTavares/...`):** o `gh` não resolve o repositório, que é privado ou inacessível. Por isso não confirmei "Doc 03 v1.2 enviado em 27/09" nem "Doc 04 v1.3 em 15/10" do lado do professor. No fork, os commits de 27/09 (`f36daa0`) e de 15/10 (`f475470`) existem.
- **Confirmação das decisões de 03/11:** não achei ata ou ficha do encontro (🟢-7).
- **Relatórios do qa-redteam do #177 e do #186** (🟢-12).

---

## Desfecho (20/11/2026, commit `b5d7f04` do fork, PR gabrielreis354/UniFAAT-projeto-experimental-2027-1#11)

- 🟡-1 corrigido: S6 diz que o PR #97 foi mesclado em 29/10, já como v1.1.
- 🟡-2 corrigido: T-03.3 volta a 🟡, com o CA-03.3.a no PR #10 do fork.
- 🟡-3 corrigido: CI do analytics e o webhook "200 ignored" datados em 04/11 (PRs #111 a #113 na `main`, levados à `develop` pelo #121); #114, #115 e #128 como ajustes de 09/11; portão do analytics desde a S9.
- 🟡-4 corrigido em parte: T-01.3 vira "✅ a e b · ✂️ c". As outras divergências entre o backlog e os CAs das SPECs ficam para a revisão final (S12).
- 🟡-5 corrigido: a T-05.9 sai do produto no backlog, no Gantt do 5º semestre e na Seção 3.2.
- 🟢 corrigidos: PR #76 em 14/09; "free-tier" da S5; #154 do Gabriel; PASSO_8 com o PR #193; PR #10 "ainda sem merge"; corte do Financeiro sem citar o plano de 15/11.
- 🟢 que ficam: coluna "Sprint planejada" sem todos os replanejamentos, metas vencidas sem o atraso, DoD × §8 (linhas × 60/60/60/55), decisões de 03/11 sem ata.
