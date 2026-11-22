> **Avaliação simulada, não oficial.** Feita em 15/11/2026 por um subagente de IA no papel de avaliador da banca, a pedido do Gabriel, com contexto restrito (ver o escopo abaixo). Serve para o grupo corrigir antes de 10/12; não é parecer do professor. O encaminhamento de cada achado está no plano de fechamento e na SPEC-11.

> Escopo: o sistema rodando num compose descartável (`gesway-ensaio`, `origin/develop` em 15/11, apagado no fim com `down -v`), os documentos oficiais e o roteiro. Sem acesso aos relatórios internos de QA. As capturas ficaram fora do repositório. Conferido depois: o 403 do garçom em `/tenants/me` vem do cabeçalho da T-08.2, e a correção (no app, sem mexer na allowlist do backend) está na branch `fix/garcom-tenants-me`.

# Avaliação simulada da banca — MVP do Gesway (4º semestre)

**Data:** 15/11/2026 · **Código avaliado:** `origin/develop` @ `38936fe` (worktree limpo `~/wt-banca`, já removido)
**Ambiente:** Docker Compose `gesway-ensaio` (core, analytics, 2 Postgres, RabbitMQ, Redis, MinIO, nginx :8088) + profile `observability` (Prometheus, Grafana) + Vite do `app-pms` (:5173). PIX com `PIX_PROVIDER=fake`. Tudo em localhost.
**Papéis usados:** admin (como "gerente"), recepção, garçom do Hotel Aurora; admin e recepção da Pousada Sol.
**Viewports:** 1366×768 (desktop), 390×844 (celular: garçom e recepção), 683×384 (equivale a zoom de 200%).
**Ferramenta:** os tools `browser_*` do Playwright MCP não estavam disponíveis nesta sessão. Usei scripts com o `playwright-core` já instalado na máquina e o Chrome do sistema; os scripts ficam em `scratchpad/banca_scripts/`. O roteiro automatizado do repositório (`pnpm e2e`) também rodou: **7/7 verdes em 55 s**.
**Evidências:** `scratchpad/banca_evidencias/` (capturas `.png`, árvore de acessibilidade `.aria.txt`, logs `sN*.log.txt`).

---

## Veredito

**APROVARIA COM RESSALVAS.** Os 7 passos do roteiro funcionam pela tela, de ponta a ponta, no Compose. Isso vale também para o garçom sem rede (a fila reenvia sem duplicar) e para o PIX simulado (o webhook confirma a reserva sem clique e a reserva aparece no PMS com o sinal no extrato). O isolamento entre os dois hotéis resistiu a tudo o que tentei pela tela e pela API. O analytics é de fato um serviço separado: derrubei o analytics e o broker, o core continuou gravando e, ao religar, o evento chegou ao Indicadores em 7,5 s.

Não achei nenhum 🔴: nenhum centavo errado e nenhum dado de outro hotel. As ressalvas são de acabamento e de promessa × entrega:
- duplo clique ou duplo toque que cria registro em dobro ou mostra erro falso;
- validação de CPF incoerente;
- o painel operacional "Hoje" depende do serviço analítico;
- o analytics não tem métricas no Prometheus, embora o RNF-029 diga "todo serviço";
- um termo técnico ("CARTAO") na tela do gerente;
- o Documento 08 está defasado em relação ao que está entregue.

**Contagem:** 🔴 0 · 🟡 12 · 🟢 11.

---

## Nota estimada C1–C10 (lente do 4º semestre: Termo §7, documentação + MVP + integração inicial dos microsserviços)

| Critério | Nota (0–10) | Uma linha |
|---|---|---|
| C1 Microsserviços | 8,5 | `analytics-service` com banco próprio, alimentado pelo outbox via RabbitMQ. Sobreviveu à queda do broker e do serviço (7,5 s para alcançar). Perde ponto porque o painel operacional depende dele |
| C2 API externa | 7,5 | PIX ponta a ponta no provedor simulado, com webhook assinado (sem assinatura dá 401) e idempotente. Asaas real e ViaCEP não foram exercitados aqui. O passo 6 é pelo Swagger, sem tela |
| C3 Banco com justificativa | 8 | PostgreSQL com `EXCLUDE` de sobreposição: a corrida de duas recepções no mesmo quarto resultou em 1×201 e 1×409. Mas o CPF "único" fura por formato (🟡-4) |
| C4 Deploy em nuvem | n/a | 5º semestre por decisão registrada (Termo §7 e Doc 08 §3.2). Não avaliado |
| C5 Terraform | n/a | 5º semestre. Não avaliado |
| C6 CI/CD | 7 | 4 workflows (core, analytics, frontend, geral), com `node --check`, Postgres efêmero e coverage. Não vi rodadas no GitHub (fora de localhost); o deploy (CD) está planejado para o 5º semestre |
| C7 Cobertura ≥ 60% | 6,5 (não medida) | Limiar 60/60/60/55 imposto no `vitest.config.js` dos dois serviços, com testes `tenant-isolation` e `waiter-least-privilege`. Não rodei a suíte; a cobertura global com o frontend não foi conferida |
| C8 Prometheus + Grafana | 6,5 | Sobem pelo profile, sem acesso anônimo (a API respondeu 401), com 2 dashboards e 2 alertas provisionados, e o `/metrics` fora do nginx (404). Mas só o core e o RabbitMQ são coletados: o analytics não tem `/metrics` (🟡-8). Ficam fora do `up` padrão |
| C9 Documentação (8 docs) | 7 | Os 8 documentos existem. O Doc 08 está "conferido em 29/10": marca T-05.3/T-05.6/T-01.5 como 🔲 e T-05.1/T-05.2 como "sem merge", e tudo isso está funcionando (🟡-12) |
| C10 Encontros com evolução | sem base | Só há as fichas 01 e 02 na pasta do grupo. O histórico de PRs mostra evolução contínua, mas a banca julga pelas fichas |

---

## Roteiro passo a passo (o que a banca veria)

| Passo | Funciona? | Convence? | O que um hoteleiro estranharia |
|---|---|---|---|
| 1. Admin cadastra categoria e quarto | Sim. Validação clara: diária "1.234,56" aceita, "-50" e capacidade 0 recusadas, número de quarto repetido recusado. Os status "Ocupado" e "Limpeza" aparecem desabilitados com o motivo | Sim | Duplo clique em "Cadastrar" diz "já existe" mesmo tendo gravado (🟡-1). A recepção que abre `/quartos/novo` volta ao início sem aviso |
| 2. Recepção cria reserva, vê o valor, faz check-in | Sim. Prévia "Quarto 969 · R$ 1.234,56 × 2 = R$ 2.469,12" igual ao total gravado. Conflito de quarto tratado com mensagem humana. Check-in em 1 clique | Muito | Aceita datas passadas (🟡-5) e CPF inválido (🟡-3). O check-in não pede confirmação, enquanto check-out e cancelamento pedem |
| 3. Garçom no celular, suíte e mesa, sem rede | Sim. Toque → "Aguardando envio / Desfazer" → enviado. Sem rede, 2 toques ficam "Na fila" e o total diz "inclui R$ 44,00 na fila". Ao voltar a rede, chegam exatamente 3 unidades em 8,6 s. O garçom não alcança nenhuma outra tela (as URLs voltam para `/comanda`; a API devolve 403) | Muito: é o melhor momento da demo | Duplo toque em "Abrir conta" cria 2 mesas iguais (🟡-2). O cabeçalho não traz o nome do hotel, e cada tela gera um 403 no console (🟡-9). Os itens não se agrupam ("Caipirinha" + "2× Caipirinha") |
| 4. Painel do dia | Sim. Chegadas, saídas, na casa, em limpeza, alerta "sem pagamento · risco de no-show". Números iguais aos do analytics no mesmo instante. Bom no celular | Sim | Sem rede, fica "Carregando…" para sempre (🟡-6). Com o analytics fora, os 5 cartões e "Atenção" somem (🟡-10) |
| 5. Check-out: conta, pagamento, fechamento | Sim. Linha do tempo com diárias, consumos do garçom e pagamentos. Pagamento parcial de R$ 0,01 com duplo clique gravou 1 vez. Valor acima do saldo pede confirmação ("fica como a devolver"). "0", "-10", "abc" e "1.234,567" foram recusados. O check-out confirma, fecha a conta e manda o quarto para limpeza. O comprovante mascara o CPF e diz "sem valor fiscal" | Muito | O saldo corrido mostra "R$ 1.234,56 crédito" no meio da linha do tempo porque a 2ª diária é datada no dia seguinte. Esc não fecha a confirmação de check-out |
| 6. Reserva direta + PIX (simulado) | Sim, pela API/Swagger: hotel → disponibilidade → reserva `PENDING` com QR e sinal de 30% (R$ 135 de R$ 450) → webhook → `CONFIRMED`. Em 2 s. Reenviar o webhook não duplica o pagamento | Sim, mas é Swagger | Não há tela do hóspede (decisão registrada). Aceita reserva no passado (pendência já conhecida no `docs/roteiro`) |
| 7. Gerente abre os indicadores | Sim. Ocupação, ADR, RevPAR, recebido hoje, receita por mês, sazonalidade, receita por categoria (a categoria criada no passo 1 aparece), meios de pagamento e hóspedes frequentes com aviso de LGPD. As 6 chamadas `/api/analytics/*` respondem 200 | Sim | "CARTAO" cru ao lado de "Cartão de crédito" (🟡-7). Gráficos sem eixo de valor. "Última saída" mostra data futura para hóspede na casa |

---

## Promessa × entrega (o que o Doc 08 põe no MVP do 4º semestre)

| Promessa (Doc 02 / Doc 08 §3.2) | Visto | Observação |
|---|---|---|
| RF-002 login JWT; RF-046 menu e ações por papel | ✅ funcionando | Senha errada → "Credenciais inválidas.". Token adulterado → volta ao login. O menu muda por papel; o garçom recebe 403 na API |
| RF-005 / RNF-008 isolamento multi-tenant | ✅ funcionando | Admin do Sol abrindo reserva, comprovante, conta e check-in da Aurora: 404 pela tela e pela API. `/public/sol` com categoria da Aurora: 404. Existem `tenant-isolation.test.js` e `tenant-fk-isolation.test.js` |
| RF-006/007/048 categorias e quartos | ✅ | Ver 🟡-1 |
| RF-008/010/011/049 disponibilidade, sem sobreposição, máquina de estados | ✅ | Corrida: 1×201 e 1×409 com mensagem. Ações bloqueadas aparecem com o motivo (RNF-026 ✅) |
| RF-009 hóspede com CPF único | ⚠️ parcial | CPF inválido aceito; CPF repetido aceito quando o formato difere (🟡-3, 🟡-4) |
| RF-014/015/016 pagamentos e conta | ✅ | Valores exatos ao centavo. Estorno não exercitado nesta avaliação |
| RF-019/020/023/051 comanda, mesa, offline idempotente | ✅ | Ver 🟡-2. Cortesia (RF-022) não exercitada pela tela |
| RF-024 a RF-028 reserva direta + PIX + webhook | ✅ (simulado) / não visto (Asaas real) | Webhook sem assinatura dá 401; webhook repetido não duplica |
| RF-037 a RF-043 / RF-052 indicadores do analytics | ✅ | O Doc 02 diz que ADMIN e RECEPTIONIST acessam; a tela é só do ADMIN (🟢-11) |
| RF-047 painel do dia | ✅ | Ver 🟡-6 e 🟡-10 |
| RF-050 rack | ✂️ cortado (Doc 08) | — |
| RF-053 B2B · RF-054 usuários e configurações | ✂️ 5º semestre | `config/usuarios` é placeholder e não está no menu |
| RF-044 Swagger | ✅ | `/api-docs` 200 no nginx e no backend |
| RNF-014 / RNF-028 analítico separado, outbox, sem perda | ✅ | Broker e analytics fora → core segue (201) → religados, o evento chega em 7,5 s |
| RNF-029 Prometheus + Grafana | ⚠️ parcial | Core e RabbitMQ coletados (`up`). Analytics sem `/metrics` (🟡-8). Grafana sem acesso anônimo; 2 dashboards e 2 alertas |
| RNF-015/021 CI com cobertura imposta | ✅ (arquivos) / não visto rodando | 4 workflows com limiar no vitest |
| RNF-002 paginação | ✂️ (T-06.10 no 5º semestre) | `GET /guests?page=1&limit=2` devolve os 42 hóspedes |
| RNF-024 toque ≥ 48 px e sem rolagem lateral | ✅ | Nenhum alvo < 44 px no painel e na comanda; 0 rolagem lateral em 390 px e em zoom de 200% |
| RNF-025 cor + rótulo, teclado | ✅ / parcial | Status sempre com rótulo. Login navegável por Tab com foco visível. Não testei o fluxo de reserva inteiro só pelo teclado |
| RNF-027 estados carregando, vazio, erro | ⚠️ parcial | Com 502: "Não foi possível… Tentar de novo" (6 botões). Sem rede: carregando indefinido (🟡-6) |
| API externa: ViaCEP | não visto | Não exercitado (só faz sentido no B2B, que é do 5º semestre) |

---

## Achados

### 🟡-1 [Tempo] Duplo clique em "Cadastrar categoria" ou "Cadastrar quarto" grava e mostra erro de duplicado
**Onde:** `/quartos/categorias/nova` e `/quartos/novo`, botão de envio.
**Passos:** 1. Logar como admin. 2. Preencher Nome, Capacidade 2 e Diária 99,90. 3. Dar duplo clique em "Cadastrar categoria".
**Esperado:** um envio e a navegação para a lista (critério de tela pronta: não aceitar clique repetido no gravar).
**Obtido:** `201 POST /api/room-categories` e depois `409`. A tela fica no formulário com "Já existe uma categoria com esse nome neste hotel. Use outro nome.", embora a categoria tenha sido gravada. O mesmo acontece com o quarto (`201` + `409`). O admin tende a trocar o nome e gravar de novo, criando duplicata real.
**Evidência:** `12b_cat_duplo_clique.png`, `s1b.log.txt`.
**Sugestão:** desabilitar o botão enquanto a mutação está pendente, como já é feito no "Registrar pagamento" (0,01 com duplo clique gravou 1 vez).

### 🟡-2 [Tempo] Duplo toque em "Abrir conta" cria duas mesas iguais
**Onde:** `/comanda` → "Abrir conta" → Mesa → botão de envio (celular 390×844, garçom).
**Passos:** 1. Garçom → Abrir conta → Mesa. 2. Nome "Mesa 12". 3. Dar duplo toque no botão de envio.
**Esperado:** uma conta. É o caso típico do garçom com Wi-Fi lento (DESIGN_PMS §1).
**Obtido:** `201 POST /api/accounts` duas vezes. Ficam duas contas "Mesa 12 …" abertas na lista.
**Evidência:** `s3_comanda.log.txt` ("mesas abertas com o nome: 2"), `36_mesa.png`.
**Sugestão:** travar o botão durante o envio, ou mandar um id de idempotência na abertura de conta, como os itens já mandam.

### 🟡-3 [Entrada/Domínio] O cadastro de hóspede no PMS aceita CPF com dígito verificador inválido
**Onde:** `/reservas/nova` → "Cadastrar novo hóspede" (e `/hospedes/novo`).
**Passos:** 1. Nome qualquer, CPF `123.456.789-00`. 2. "Cadastrar e usar".
**Esperado:** recusa (o próprio sistema tem `utils/isValidCpf.js` e recusa esse CPF na reserva pública).
**Obtido:** o hóspede é gravado com `123.456.789-00`. O `isValidCpf` só é usado em `CreateBookingController`.
**Evidência:** `s2dbg.log.txt`, `22d_cpf_invalido.png` (o 2º cadastro com o mesmo CPF dá 409, prova de que o 1º gravou).
**Sugestão:** validar no `POST/PUT /guests` com o mesmo utilitário.

### 🟡-4 [Domínio] CPF "único por hotel" fura quando o formato difere
**Onde:** cadastro de hóspede; o seed grava `30000000001` e a tela grava `300.000.000-01`.
**Passos:** 1. Cadastrar novo hóspede com CPF `300.000.000-01` (o mesmo número de "Ana Souza", do seed).
**Esperado:** 409 (RF-009: CPF único por hotel).
**Obtido:** gravado. A lista de Hóspedes passa a ter dois hóspedes com o mesmo CPF.
**Evidência:** `s2_reserva` (2ª execução) e `q2.mjs`: `['Ana Souza','30000000001']` e `['Marina Teste 48813','300.000.000-01']`.
**Sugestão:** normalizar o CPF (só dígitos) antes de gravar e de comparar, e ajustar o seed. Os CPFs do seed também têm DV inválido, o que dá munição à banca.

### 🟡-5 [Domínio] O PMS cria reserva com datas no passado
**Onde:** `/reservas/nova`.
**Passos:** Entrada = hoje − 6, Saída = hoje − 4 → a tela lista quartos "livres de 09/11 a 11/11" → Confirmar.
**Esperado:** recusa ou aviso explícito de reserva retroativa (pergunta ao grupo: é intencional?).
**Obtido:** `201 POST /api/reservations`, reserva pendente no passado.
**Evidência:** `90_reserva_passado.png`, `s8.log.txt`. Para a reserva pública, a pendência já está registrada em `docs/roteiro/PASSO_6…` ("já conhecido"); para o PMS, não encontrei registro.

### 🟡-6 [Rede/Estados] Recepção sem rede: o painel "Hoje" fica "Carregando…" indefinidamente
**Onde:** `/` (recepção, desktop).
**Passos:** 1. Abrir `/reservas`. 2. Tirar a rede. 3. Clicar em "Hoje" e esperar 20 s.
**Esperado:** estado de erro ou "sem conexão" com "Tentar de novo" (critério de tela pronta; RNF-027).
**Obtido:** os cartões ficam "—" e os blocos ficam "Carregando alertas… / chegadas… / saídas…" depois de 20 s. Com 502 simulado, a tela mostra o erro certo, com 6 "Tentar de novo".
**Evidência:** `95b_recepcao_sem_rede_20s.png` contra `94_hoje_502.png`.
**Sugestão:** tratar a query pausada por estar offline (`fetchStatus === 'paused'`) como "Sem conexão".

### 🟡-7 [Leitura] "CARTAO" em código cru na tela do gerente
**Onde:** `/indicadores` → "Meios de pagamento".
**Obtido:** as linhas "CARTAO (1 · R$ 3.200,00)" e "Cartão de crédito (1 · R$ 300,00)" aparecem lado a lado. O Doc 02 só admite PIX, CARTAO_CREDITO, CARTAO_DEBITO e DINHEIRO.
**Evidência:** `70_indicadores_desktop.png`.
**Sugestão:** corrigir o dado do seed, que grava "CARTAO" fora da allowlist, e rotular os desconhecidos como "Outro".

### 🟡-8 [Monitoramento] O analytics-service não expõe métricas e não é coletado pelo Prometheus
**Onde:** `docker/prometheus/prometheus.yml` (jobs `core-service` e `rabbitmq` apenas); não há `metrics` no código do analytics.
**Esperado:** RNF-029: "Todo serviço expõe `GET /metrics`".
**Obtido:** alvos ativos: `core-service up` e `rabbitmq up`. É justamente o serviço que a banca vê como "o microsserviço" que não aparece no Grafana.
**Evidência:** saída de `/api/v1/targets` (seção Comandos).

### 🟡-9 [Console/Papéis] O garçom recebe 403 em `/api/tenants/me` em toda tela
**Onde:** qualquer tela do garçom.
**Obtido:** `HTTP 403 GET /api/tenants/me` mais um `console.error` a cada carregamento. O cabeçalho mostra "Gesway / Garcom Aurora · Garçom", sem o nome do hotel (a recepção vê "Hotel Aurora").
**Evidência:** `s0_login.log.txt`, `s3_comanda.log.txt`, `01_home_garcom_aurora.png`.
**Sugestão:** não chamar a rota para o WAITER, ou incluir o nome do hotel no login. Banca com DevTools aberto vê erro vermelho no passo 3.

### 🟡-10 [Arquitetura/Operação] O painel operacional "Hoje" depende do analytics-service
**Passos:** parar `analytics-service` e `rabbitmq` → abrir `/`.
**Obtido:** os cartões (vendidos, ocupados, livres, limpeza, ocupação) e "Atenção" (risco de no-show) ficam "—" ou "Carregando…", com respostas 502/504. As listas, que vêm do core, seguem. A recepção perde o alerta de no-show quando o serviço gerencial cai. Isso contradiz o espírito do RNF-014 ("consulta analítica não concorre com a operação de recepção").
**Evidência:** `b1_hoje_analytics_fora.png`, `b0_indicadores_analytics_fora.png`, `s10.log.txt`.
**Pergunta para o grupo:** a decisão está registrada em alguma ADR?

### 🟡-11 [LGPD] A lista de Hóspedes mostra o CPF completo de todos os hóspedes
**Onde:** `/hospedes`.
**Obtido:** a coluna CPF vem completa, com telefone e e-mail, na listagem geral. A busca e o comprovante mascaram; o detalhe mostra completo por decisão da tela.
**Pergunta:** existe decisão para a listagem? Se não, a lista não precisa do CPF inteiro.
**Evidência:** `a0_hospedes_lista.png`.

### 🟡-12 [Documentação] O Doc 08 está defasado em relação ao que está entregue
O Doc 08 v1.1 está "conferido no git em 29/10". Ele marca T-05.3 (painel Hoje), T-05.6 (indicadores), T-01.5 (CI por serviço) e ROT-01 como 🔲, e T-05.1/T-05.2 como "sem merge". Tudo isso está funcionando na `develop` que avaliei. A banca compara o documento com a demonstração; o registro de execução, que o próprio Doc 08 se propõe a ser, parece desatualizado. Os documentos são a metade da nota do 4º semestre (C9).

### Melhorias (🟢)
1. **Check-in sem confirmação**, enquanto check-out, cancelamento e liberar quarto pedem. A recepcionista ganha agilidade, mas um clique errado ocupa o quarto sem volta pela tela.
2. **Esc não fecha** a confirmação inline de check-out. Teclado é o modo do balcão (RNF-025).
3. **Gráficos de Indicadores sem eixo de valor:** o gerente precisa abrir "Ver tabela" para saber quanto é cada barra (+1 clique por gráfico).
4. **"Última saída" com data futura** (ex.: 17/11 para hóspede na casa) em Hóspedes frequentes: o rótulo engana o gerente.
5. **Itens da comanda não agrupados** ("Caipirinha" + "2× Caipirinha"): o garçom precisa somar de cabeça ao conferir com o cliente.
6. **Saldo corrido mostra "crédito"** no meio da linha do tempo, porque a 2ª diária é datada no dia seguinte ao pagamento. Pode confundir na hora de explicar a conta ao hóspede.
7. **Rota sem permissão volta ao início sem aviso** (recepção em `/quartos/novo`; garçom em `/reservas`). Um aviso "Sem permissão para esta tela" explicaria.
8. **Comprovante de outro hotel** diz "Não foi possível montar o comprovante. Tentar de novo", em vez de "não encontrado". Tentar de novo não resolve.
9. **Rótulo duplicado** "Diária: Diária 1 de 2" no texto acessível da linha do tempo.
10. **Passo 6 só pelo Swagger:** prepare uma frase pronta para "e o hóspede, onde reserva?".
11. **Doc 02 diz que a recepção acessa Indicadores; a tela é só do admin.** Alinhar o documento ou a tela. Também não existe papel "gerente": o admin faz esse papel, então convém dizer isso na apresentação.

### Pontos fortes que vale mostrar à banca
Fila offline honesta ("inclui R$ 44,00 na fila"). Conflito de quarto com mensagem humana. Pagamento acima do saldo pede confirmação. XSS no nome do hóspede aparece como texto. Comprovante com CPF mascarado. Outbox que se recupera da queda do broker. Isolamento entre hotéis sem furo. `pnpm e2e` com 7/7 em 55 s.

---

## As 10 perguntas que eu faria na apresentação
1. Se o `analytics-service` cair durante o turno, por que a recepção perde o alerta de no-show no painel "Hoje"? O operacional não deveria vir do core?
2. Como vocês garantem que um evento não se perde nem duplica entre o core e o analytics? Mostrem o outbox e a idempotência do consumidor.
3. O RNF-029 diz "todo serviço expõe /metrics". Onde estão as métricas do analytics no Grafana?
4. Por que o sistema recusa um CPF inválido na reserva do site, mas aceita no balcão? E por que dois hóspedes podem ter o mesmo CPF?
5. Como um teste automatizado prova que o hotel A nunca lê dado do hotel B? Ele roda no CI e quebra o build?
6. O passo do PIX roda no simulado. O que muda no Asaas real, e o que acontece com a cobrança PENDING que ninguém paga?
7. Qual é a cobertura atual de cada serviço, e o frontend entra na conta dos 60% globais?
8. Por que o Documento 08 ainda marca como não iniciadas tarefas que acabaram de ser demonstradas? Ele é o registro de execução de vocês.
9. O que impede o garçom de abrir duas vezes a mesma mesa, ou o admin de cadastrar duas vezes a mesma categoria, com rede lenta?
10. Por que um hóspede pode ser reservado com datas que já passaram? Isso é regra de negócio (lançamento retroativo) ou falta de validação?

---

## Mapa de cobertura
| Eixo | Tentado? | Como | Resultado |
|---|---|---|---|
| Entrada | Sim | Dinheiro "1.234,56", "150.5", "0,01", "0", "-10", "abc", "99999999,99", "1.234,567"; nome com HTML e emoji; CPF inválido e repetido | Dinheiro sólido; CPF falho (🟡-3, 🟡-4) |
| Tempo | Sim | Duplo clique em categoria, quarto, confirmar reserva, pagamento, check-out e abrir mesa; F5 depois de gravar; voltar e avançar do navegador; duas abas no mesmo quarto | 🟡-1 e 🟡-2; o resto ok |
| Rede | Sim | Garçom offline sem recarregar; recepção offline; 502 nas rotas do painel; broker e analytics parados | 🟡-6, 🟡-10 |
| Sessão e papéis | Sim | Token adulterado; garçom em 6 URLs da recepção e 6 rotas de API; recepção em telas de admin; admin do Sol em URLs da Aurora | Ok (403/404/redirect) |
| Tela | Sim | 1366×768, 390×844, 683×384 | Sem rolagem lateral; sem alvo < 44 px |
| Teclado | Parcial | Tab no login (foco visível); Esc na confirmação de check-out | 🟢-2; o fluxo completo só pelo teclado não foi feito |
| Leitura | Sim | `ariaSnapshot` de cada tela: abas com papel de aba, erros como `alert`, botões nomeados | Ok |
| Estados | Sim | Erro 502, offline, reserva inexistente, rota inexistente | 🟡-6 |
| Domínio | Sim | Saldo = soma das linhas; máquina de estados; quarto → limpeza → liberar; sinal 30%; webhook repetido | Ok, exceto 🟡-5 |
| Multi-tenant | Sim | Tela e API cruzadas entre Aurora e Sol, inclusive as rotas públicas | Sem vazamento |

## Não foi possível testar
- Os tools `browser_*` do Playwright MCP não estavam disponíveis; usei scripts com `playwright-core` e o Chrome do sistema. As evidências são equivalentes.
- Asaas sandbox real e ViaCEP: fora de localhost, proibido no escopo.
- Rodadas reais do CI no GitHub e cobertura medida: não rodei as suítes.
- Grafana pela interface: conferi pela API de dentro do contêiner, sem ler a senha.
- Fluxo inteiro só pelo teclado; leitor de tela real; estorno e cortesia pela tela.
- Limite de 5 logins/min: não estressado de propósito.

## Comandos rodados pelo Bash (resumo, na ordem)
1. `git fetch` + `git worktree add --detach ~/wt-banca origin/develop`
2. `banca_up.sh`: cópia de `banca_up` do e2e_up, apontando para `~/wt-banca`; copia `.env` e chaves de `~/wt-ensaio`; compose-up, migrate, seed, outbox-initial-load
3. `docker compose --profile observability up -d`
4. `pnpm install --frozen-lockfile`; `pnpm --filter app-pms dev` (Vite :5173, em segundo plano)
5. `node banca_scripts/s0_login.mjs` (5 logins espaçados de 13 s), `s1_quartos`, `s1b_dblclick`, `s2_reserva`, `s2dbg`, `s3_comanda`, `s4_painel_conta`, `s5_checkout`, `s5b`, `s6_pix` (com `docker compose exec backend node scripts/simular_pagamento_pix.js`), `s7_indic`, `s8_quebrar`, `s9`, `s10_resil` (`docker compose stop/start analytics-service rabbitmq`); `q.mjs`/`q2.mjs` (consultas à API local)
6. `docker compose exec prometheus wget …/api/v1/targets`; `docker compose exec grafana wget …/api/search` (com a senha lida dentro do contêiner)
7. `pnpm e2e` (7/7 verdes)
8. `fuser -k 5173/tcp`; `banca_down.sh` (`docker compose -p gesway-ensaio down -v --remove-orphans`, `rm .env` e chaves, `git worktree remove --force ~/wt-banca`); `rm -rf banca_states` (sessões com JWT)
9. Conferência final: **0 contêineres, 0 volumes, 0 redes `gesway-ensaio`; worktree removido; porta 5173 livre.**
