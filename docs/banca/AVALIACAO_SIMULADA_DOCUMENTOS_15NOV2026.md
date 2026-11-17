> **Avaliação simulada, não oficial.** Feita em 15/11/2026 por um subagente de IA no papel de avaliador da banca, a pedido do Gabriel, com contexto restrito (ver o escopo abaixo). Serve para o grupo corrigir antes de 10/12; não é parecer do professor. O encaminhamento de cada achado está no plano de fechamento e na SPEC-10.

> Escopo: só a pasta oficial `UniFAAT-projeto-experimental-2027-1` (Termo, critérios C1–C10, templates, os 8 documentos e as fichas), na versão do `main` do fork de 11/11. Conferido depois pelo Gabriel + IA: o 🔴 do RNF-007 procede no texto do Doc 02.

# Parecer simulado da banca: documentos oficiais do Gesway

**Data da leitura:** 15/11/2026
**Avaliador:** banca simulada (mercado de software + hotelaria), sem acesso ao código. Só os documentos do fork foram lidos.
**Escopo lido:** `aceite-projeto-experimental.md`, `quadro-acompanhamento-criterios.md`, `parecer-final.md`, `registro-nao-conformidades.md`, `README.md` raiz, `templates/01..08`, `Projetos/gesway/01..08`, `README.md` do grupo, `ficha-registro-encontro01/02.md` e `assets/05-arquitetura-nuvem.png`.

Legenda: 🔴 tiraria nota ou geraria não conformidade · 🟡 a banca perguntaria · 🟢 melhoria.

---

## 1. Veredito geral

A documentação está muito acima da média do semestre. A ADR-003 justifica o recorte de serviços por consistência transacional, o MER foi conferido contra o código, o Doc 05 traz custo por sessão com preço oficial, e o Doc 08 separa o que foi planejado do que de fato foi feito. Justamente por ser detalhada, porém, ela se contradiz em pontos que uma banca vai cobrar. Os mais graves:

- o CI/CD **não faz deploy por decisão de projeto**, o que contraria o Termo §5 e o próprio Doc 08;
- o RBAC do RNF-007 impede a recepção de criar reservas;
- a "página pública de reservas" aparece como implementada, mas não existe tela para o hóspede;
- o MER declara chaves estrangeiras que o próprio MER (§7) diz não existirem entre serviços;
- a observabilidade é tratada como a primeira coisa a ser cortada por falta de memória;
- o Doc 08 e as fichas de encontro estão desatualizados ou com erro.

Pela leitura dos documentos, em 29/10 o critério de microsserviços ainda depende de uma branch sem merge.

**Contagem:** 🔴 9 · 🟡 24 · 🟢 13.

---

## 2. Achados 🔴

### 🔴-1. CI/CD sem deploy automatizado, por decisão de projeto
- **Onde:** Doc 05 §3.7 e §5.1 (passo 3), figura do Doc 05 ("não faz deploy"); Doc 08 §3.1 (5º semestre), T-02.5 e §3.2; Doc 02 RNF-022; Termo §5.
- **Conflito:** o Doc 05 diz "**Não faz *deploy***: o cluster só existe durante a sessão". O Termo §5 diz "build e deploy dos microsserviços deve ser obrigatoriamente automatizado". O Doc 08 planeja "T-02.5 e CA-01.5.c deploy pelo CI", e o RNF-022 fala em "Deploy e provisionamento automatizados".
- **Por que é problema:** o documento de arquitetura assume como alvo algo que descumpre o critério C6, e outros dois documentos dizem o contrário dele.
- **Correção:** definir um *workflow* `workflow_dispatch` ou disparado por *tag* que faça `terraform apply`, `kubectl apply -k overlays/aws` com OIDC e um `destroy` agendado ou manual. Também dá para manter o ciclo efêmero com o deploy disparado pelo CI. Alinhar Doc 05, Doc 08 e RNF-022.
- **Responde:** Weslley (DevOps) e Gabriel (dono do Doc 05).

### 🔴-2. O RBAC impede a recepção de criar reservas e hóspedes
- **Onde:** Doc 02 RNF-007, em contraste com RF-009, RF-012, Doc 01 §6, Doc 06 §2 e Doc 08 §3 (roteiro, passo 2).
- **Conflito:** o RNF-007 diz que "criação, edição e exclusão de ... hóspedes, reservas ... exclusivas de `ADMIN`". O Doc 01 §6 diz "Recepcionista: Opera reservas, check-in, check-out", e o roteiro diz "A recepção cria uma reserva ... e faz o check-in".
- **Por que é problema:** é a regra de acesso central do PMS. Do jeito que está escrita, o balcão não funciona.
- **Correção:** reescrever o RNF-007 com uma matriz papel × recurso (por exemplo: recepção cria e edita hóspede e reserva; só ADMIN exclui, estorna, configura quartos e usuários).
- **Responde:** Gabriel (Doc 02).

### 🔴-3. "Página pública de reservas" marcada como implementada, sem interface para o hóspede
- **Onde:** Doc 01 §5.1 ("[x] Página pública de reservas por hotel, com endereço próprio"), Doc 02 RF-024 ("página pública"), Doc 06 §3 ("`app-booking` ... são pós-TCC"), ADR-011, Doc 08 §10 (risco "Passo 6 sem tela de reserva direta").
- **Conflito:** o Doc 08 admite que "o app de reserva do hóspede está vazio", e a proposta é "demonstrar a reserva direta pela API pública".
- **Por que é problema:** o motor de reserva direta é a tese de valor do Doc 01 §3.2. Hóspede não usa API JSON. Fica uma promessa sem lastro.
- **Correção:** desmarcar o item no Doc 01 (ou explicar que o [x] se refere à API), reescrever o RF-024 como "API pública" e criar um RF próprio para a tela do hóspede com prioridade explícita. Outra saída é entregar uma página mínima.
- **Responde:** Gabriel.

### 🔴-4. O MER contradiz o próprio "database per service"
- **Onde:** Doc 04 §4.13 a §4.17 (`tenant_id` "FK → tenants ON DELETE CASCADE") e §4.16 (`reservation_id` "FK → reservations ON DELETE SET NULL"); diagrama do Bloco 3 (`CONTRACTS |o--o| RESERVATIONS`). Do outro lado: Doc 04 §7.2, Doc 03 D-002 ("sem chave estrangeira para o `core-service`") e ADR-003.
- **Por que é problema:** o template §7 exige *database per service*, e a banca vai perguntar qual das duas versões vale. A justificativa que se ouve hoje é "ainda está tudo no `schema.sql` do core", e isso também revela que o B2B ainda não está separado.
- **Correção:** marcar essas FKs como "⚠️ em transição até a T-01.6" ou descrever o alvo sem FK, igual ao §7.2. Tirar a seta do Bloco 3 ou tracejá-la como referência lógica.
- **Responde:** Sirlande (Doc 04).

### 🔴-5. A observabilidade é a primeira coisa a sair se faltar memória
- **Onde:** Doc 05 §2.2 ("a observabilidade (Prometheus e Grafana, 224 Mi) é a primeira a sair") e §3.6; ADR-004, riscos mitigados ("retirando a observabilidade do cluster"). Contraste com o Termo §5 e §8 e o RNF-029 ("acessível no momento da defesa").
- **Por que é problema:** o plano de contingência descarta um critério obrigatório (C8), com só cerca de 125 MiB de folga estimada.
- **Correção:** trocar a ordem de corte (por exemplo, retenção do Prometheus, *limits*, RabbitMQ sem *management*) e declarar que Prometheus e Grafana nunca saem. Se for preciso, rodar a observabilidade fora do nó ou do cluster e justificar.
- **Responde:** Weslley e Gabriel.

### 🔴-6. O critério de microsserviços para o MVP não está comprovado nos documentos
- **Onde:** ADR-003, Contexto ("O backend é hoje um único processo Node/Express"); Doc 08 backlog T-01.4 ("H.2 em branch. H.3 planejada"), M7-a e M7-b; T-01.6 cortada para o 5º semestre. Termo §7: "integração inicial dos microsserviços".
- **Por que é problema:** no último estado registrado (29/10), não há segundo serviço na `develop`. Se o `analytics-service` não estiver rodando de forma separada em 10/12, C1 fica ❌.
- **Correção:** atualizar o Doc 08 com a evidência (PR ou commit) do merge da H.2 e da H.3 e incluir no Doc 06 uma nota de estado real ("core + analytics em produção local; b2b no 5º semestre").
- **Responde:** Gabriel.

### 🔴-7. Doc 08 desatualizado (regressão de artefato)
- **Onde:** Doc 08, cabeçalho e §1 ("Estado conferido no git em 29/10/2026"), Sprint 8 "*(em curso)*", metas M1 a M8 com prazo entre 30/10 e 17/11 sem situação, "O Weslley confirma ... até 04/11", "decisão final ... de 03/11", DOC-04 "v1.3" e DOC-05 "v1.2".
- **Fatos:** o Doc 04 está na v1.4 (30/10) e o Doc 05 na v1.3 (04/11).
- **Por que é problema:** o próprio Doc 08 se declara o registro de execução. Em 15/11 ele está 17 dias atrasado e cita versões que já mudaram. O `registro-nao-conformidades.md` trata "desatualização" como não conformidade.
- **Correção:** registrar as Sprints 8 a 10, a decisão de 03/11, a confirmação do Weslley, a situação de M1 a M10 e as versões atuais dos documentos. Repetir na S12.
- **Responde:** Weslley (dono do Doc 08), com apoio do Gabriel.

### 🔴-8. Fichas de encontro com erro e sem continuidade (C10)
- **Onde:** `ficha-registro-encontro02.md` traz "Número do Encontro: 1"; a pauta repete a da ficha 01 ("Entregaram o README e o Solicitação de sistema"); a URL do PR está quebrada em duas linhas (`pull/5` + `3`). Nas duas fichas, Formato desmarcado, observações vazias e sem assinatura. Só há 2 fichas, contra os 8 encontros do cronograma do README.
- **Por que é problema:** o C10 depende de evidência de participação com evolução, e o que está lá hoje não sustenta isso.
- **Correção:** corrigir número, pauta e URL da ficha 02 e criar fichas para os encontros 3 em diante, com links de PR. Pedir a assinatura do orientador.
- **Responde:** quem registrou os encontros (Gabriel, como PO).

### 🔴-9. Segredos versionados: a ADR-006 contradiz o RNF-011
- **Onde:** ADR-006, Contexto ("a política do projeto de versionar alguns segredos por conveniência acadêmica"); Doc 02 RNF-011 ("Zero segredos versionados ou embutidos na imagem").
- **Por que é problema:** a banca vai pedir para ver o repositório. Um documento admite uma política que outro proíbe.
- **Correção:** declarar que esses são segredos apenas de desenvolvimento local (o `overlay/local` do Doc 05 §5.3), que não valem em nenhum ambiente exposto, e ajustar o RNF-011 com essa exceção explícita. O melhor é eliminar a prática.
- **Responde:** Gabriel.

---

## 3. Achados 🟡

| # | Documentos e seção | Trechos em conflito (curtos) | Por que a banca pergunta | Correção sugerida | Quem responde |
|---|---|---|---|---|---|
| 🟡-1 | README do grupo × Doc 06 §3/§6 × ADR-011 | "React 19" × "React 18.3" / "React 18 com TypeScript" | Versão divergente da tecnologia principal do front | Unificar com o `package.json` | Gabriel |
| 🟡-2 | README do grupo × ADR-003 | "Mensageria: a definir" × RabbitMQ aceito em 14/09 | README desatualizado em decisão central | Atualizar o README (RabbitMQ, k3s, Asaas) | Gabriel |
| 🟡-3 | Doc 06 §4.1 e ADR-008 × Doc 05 §1 e Doc 08 nota ² | "provedores reais Mercado Pago e Asaas" × "o provedor real é o **Asaas**"; Mercado Pago "sem a validação no *sandbox*" | Afirma integração real não validada | Declarar Asaas como o provedor validado e Mercado Pago como implementado e não validado (ou removê-lo) | Weslley |
| 🟡-4 | Doc 01 §5.2 × Doc 08 §3.2 e T-05.7 a 12 | "Módulo de governança e camareira" fora do escopo × "frontend restante: ... governança" | Escopo contraditório | Tirar "governança" do Doc 08 ou criar RF e rever o Doc 01 | Weslley e Gabriel |
| 🟡-5 | Doc 08 (SPEC-07 tarifas por período, "busca global") × Doc 02 | Nenhum RF de tarifa por período ou de busca | Trabalho de 12 dias sem requisito: rastreabilidade quebrada | Criar RF-057 e seguintes ou remover do plano | Gabriel |
| 🟡-6 | Doc 02 RF-007 × RF-039 × Doc 01 §5.2 | Status `CLEANING` existe e gera alerta, mas não há RF de liberação nem de transições do quarto | O hoteleiro pergunta quem libera o quarto e como | Acrescentar o RF da máquina de estados do quarto (check-in → OCCUPIED, check-out → CLEANING, liberação → AVAILABLE, MAINTENANCE) | Gabriel |
| 🟡-7 | RF-026 × Doc 04 §4.6 e §4.8 | Reserva direta nasce `PENDING`; o PIX tem `EXPIRED`; o EXCLUDE só libera `CANCELLED` | Uma reserva com PIX vencido bloqueia o quarto para sempre. A rota pública não tem *rate limit* (o nginx só limita o login), então dá para bloquear todo o inventário | Regra de expiração (cancelar `PENDING` DIRECT quando o PIX expira) e *rate limit* na rota pública | Gabriel e Weslley |
| 🟡-8 | Doc 01 §2.3 e §4 × Doc 04 | "Redução de *no-show*" × nenhum status ou cobrança de *no-show*; reserva de balcão sem sinal | Promessa de valor sem modelagem | Status `NO_SHOW` ou regra explícita; declarar o limite | Gabriel |
| 🟡-9 | RF-039 × RF-027 e RF-011 | "reservas confirmadas ... sem pagamento" × `CONFIRMED` só nasce do PIX pago (ou de contrato); não há endpoint de confirmar | Indicador cuja condição quase não ocorre | Rever a regra (PENDING sem sinal) ou criar o RF de confirmação manual | Gabriel |
| 🟡-10 | Doc 03 F-016, Doc 04 §7.3, ADR-003 × RF-052 e Doc 01 §4 | Eventos sem contas e itens de consumo × "relatório de cortesias e perdas"; parcelas B2B fora de `PAYMENTS` | Os indicadores de receita ignoram A&B, cortesias e B2B | Incluir eventos de conta e item (ou declarar que o relatório fica no core) e decidir como a receita B2B entra | Gabriel |
| 🟡-11 | Doc 04 §7.1 × template 04 §7 | analytics: "sem entidades de domínio"; as projeções não estão modeladas | O D-003 existe sem tabela descrita | Dicionário das projeções do D-003 | Sirlande |
| 🟡-12 | Doc 04 §4.8 × Doc 02 RF-014, RF-015 e ADR-010 | `amount` "CHECK >= 0" × "`amount > 0`"; `reservation_id` "ON DELETE CASCADE" e `deleted_at` × "histórico financeiro nunca é apagado" | Integridade financeira contraditória | Alinhar o CHECK; justificar ou trocar CASCADE por RESTRICT; explicar o `deleted_at` legado | Sirlande |
| 🟡-13 | RF-055 e Doc 04 §4.5 × *soft delete* × Doc 06 §4.3 × Doc 08 T-06.11 | "eliminação a pedido do titular" × exclusão lógica que mantém o dado; anonimização "Hóspede eliminado" só no analytics; T-06.11 cortada | LGPD prometida sem mecanismo; a rota pública de status por id também não tem autenticação | Descrever a anonimização no MER e o prazo; declarar o limite no 4º semestre | Sirlande |
| 🟡-14 | Doc 02 §2 (prioridade Alta = núcleo) × Doc 08 §3.2 | RF-055 (ficha, **Alta**) e o diferencial "conta dividida" (RF-021, Doc 01 §3.1) cortados para o 5º semestre | Prioridade incoerente com o MVP; a FNRH é obrigação legal citada no Doc 01 §2.3 | Rebaixar a prioridade com justificativa ou trazer para o MVP | Gabriel |
| 🟡-15 | Doc 02 RF-010 a 012 e Doc 04 §4.6 | `total_amount` sem regra de cálculo no servidor; reserva sem nº de hóspedes (adultos e crianças) | Risco financeiro; capacidade da categoria nunca é validada | RF de tarifação (diárias × preço da categoria, no servidor) e campo de ocupantes | Gabriel e Sirlande |
| 🟡-16 | Doc 04 §4.6 `source` × Doc 01 §2.1 | Canais `MANUAL/DIRECT/B2B` × "qual canal de venda gera mais receita" | Não distingue Booking, Airbnb ou telefone | Acrescentar `channel` (OTA específica) ou rever a promessa | Sirlande |
| 🟡-17 | Termo §5 × RNF-015 × DoD §7 × Doc 08 §3.1 e §8 | "global ... todos os microsserviços" × "cobertura do core ≥ 60%"; "Cobertura global com dois serviços"; "≥ 60% de linhas" × statements/lines/functions + branches 55% | A métrica muda de documento para documento, e nenhum traz o percentual atual | Uma definição única (global, as 4 métricas) e o número atual com data | Gabriel e Weslley |
| 🟡-18 | Doc 06 §3 × Doc 05 §2 | Prometheus e Grafana ausentes do diagrama de contêineres | C4 e nuvem divergem num critério obrigatório | Incluir os dois contêineres no Nível 2 | Gabriel |
| 🟡-19 | Doc 05 §3.2 e §5.1 × Doc 01 §1 (SaaS) | "Os dados são efêmeros"; sem *backup* e sem ambiente permanente | A banca pergunta onde fica a produção dos hotéis | Declarar explicitamente: ambiente de demonstração, não de produção, e o que mudaria em produção | Gabriel |
| 🟡-20 | Doc 05 §5.1 passo 3 e §4.3 × Termo §4 (IaC) | Script SQL, `kubectl apply`, emissão do certificado e URL do *webhook* no Asaas são manuais; "a demonstração do *webhook* fica para a sessão seguinte" | Etapas manuais e risco no dia da defesa | Automatizar (*user-data*, Job do k8s, cert-manager, API do Asaas) | Weslley |
| 🟡-21 | Doc 08 §3 (roteiro, passo 6 no Compose, "sem nuvem") × Doc 05 §4.3 | O *webhook* exige URL pública; nenhum documento cita túnel ou URL pública local | Como o Asaas chega ao localhost na demo de 10/12? | Documentar o túnel ou o plano B do provedor simulado | Weslley |
| 🟡-22 | Doc 05 §2.2 e §3.6 | Folga estimada de "cerca de 125 MiB"; "limits somam mais que o nó"; logs só por `kubectl logs` | OOM provável; o Termo pede "rastreio de erros" | Medir no primeiro `apply`; considerar Loki leve ou justificar | Weslley |
| 🟡-23 | Doc 08 §2, §5 (S7) e §6 | "Trilha do Weslley: sem entrega na `develop`"; Doc 08 v1.1 "preparada pelo Gabriel"; agentes de IA em paralelo | Termo §2 (papéis equilibrados): a banca vai perguntar a cada integrante o que fez | Registrar as entregas de cada trilha; preparar cada um para defender a sua parte | Os três |
| 🟡-24 | ADR-001, 002, 005, 008, 009 e 011 (datas de 13/05 a 07/08/2026) × Doc 08 (início em 09/09) × Doc 01 v1.0 (23/08); evidências em `sistema_hotel_prova`, PR #97 e PR #99 abertos | Decisões anteriores ao projeto; plano e ADRs vivendo em PR aberto | Origem do código e do plano; a banca não acessa as evidências | Explicar a origem (projeto anterior) num parágrafo; fazer merge dos PRs #97 e #99; citar links públicos | Gabriel |

---

## 4. Achados 🟢

1. **Histórico de revisões:** o Doc 02 tem 11 linhas "1.4", com cabeçalho de 29/10 e mudanças de 30/10, e o Doc 06 repete o padrão. Consolidar numa linha por versão e acertar a data do cabeçalho.
2. **"Decisões que serão registradas no Documento 07"** (Doc 05 §1 e Doc 06 §1): o Doc 07 já existe. Atualizar o texto.
3. **RN-001, RN-002 e RN-004** não existem, e o RN-003 é citado sem definição (Doc 04 §1.2 e §4.6). Criar uma tabela de RNs.
4. **Nomenclatura mista PT/EN** no B2B (`razao_social`, `pessoas`, `valor`) contra o inglês no restante do modelo. Registrar como dívida ou padronizar.
5. **"pós-TCC"** (Doc 06 §3 e ADR-011): o projeto é um Projeto Experimental. Usar "fora do escopo do Projeto Experimental".
6. **Doc 01 §6** traz como orientadores "Prof. Alexandre Tavares / Profa. Katia", que são a coordenação; a ficha diz que o orientador é Alexandre.
7. **Redis nos manifests locais**, que "nenhum código o chama" (Doc 05 §2.3 e Doc 06 §3): remover.
8. **RF-016 e RF-017** ainda descrevem `consumptions`, que hoje é tabela legada. Reescrever sobre contas (ADR-009).
9. **Faltam ADRs** para CI/CD, observabilidade, Terraform/state e estratégia de testes (o template pede "padrões" e as decisões relevantes).
10. **MER §10.1** admite documentação interna com "8 tabelas". É melhor corrigir na origem do que pôr uma ressalva no documento oficial.
11. **Doc 08 usa dias-dev** no lugar de story points. Está justificado, mas falta uma métrica de velocidade ou *throughput* por sprint.
12. **AWS Budgets de US$ 5** com uso previsto "perto de US$ 5/mês" (Doc 05 §6.4): os alertas de 50% e 80% vão disparar todo mês. Recalibrar.
13. **Teste de carga:** o RNF-001 (P95 < 500 ms) não tem tarefa de carga planejada (template 08, T-028).

---

## 5. Aderência aos templates e ao Termo (resumo)

| Doc | Template | Observação |
|---|---|---|
| 01 | Completo | Os [x] de 23/08 criam promessa sem lastro (🔴-3) |
| 02 | Completo, com rastreabilidade RF×RNF | Falta RF para o estado do quarto, tarifação e tela do hóspede; RNF-007 contraditório |
| 03 | Níveis 0, 1 e 2 + dicionários | Eventos sem consumo (🟡-10) |
| 04 | Completo e excelente na justificativa | FKs entre serviços (🔴-4); projeções do D-003 ausentes |
| 05 | Completo, custo exemplar | Sem deploy no CI (🔴-1), observabilidade descartável (🔴-5) |
| 06 | 3 níveis, 3 serviços | Sem Prometheus e Grafana no Nível 2; React divergente |
| 07 | 11 ADRs, acima do mínimo de 5 | Falta ADR de CI/CD e de observabilidade; ADR-006 × RNF-011 |
| 08 | Completo, registro real valioso | Desatualizado (🔴-7); escopo × Doc 01 |

Termo §2 (equipe e papéis): 3 integrantes, dentro do limite, mas com risco de desequilíbrio (🟡-23). §3: atendido no desenho. §4: alvo no 5º semestre, com IaC parcialmente manual. §5: CI/CD sem deploy, cobertura indefinida, monitoramento descartável. §6: 8 documentos presentes. §7: MVP dependente do merge do analytics. §8: contingência Compose prevista, mas o *webhook* local não está explicado.

---

## 6. Critérios C1 a C10 (nota estimada só pelos documentos)

| ID | Critério | Nota | Justificativa |
|---|---|---|---|
| C1 | Microsserviços | 6 | Recorte excelente (ADR-003), mas em 29/10 o segundo serviço estava em branch, e o b2b fica para o 5º semestre |
| C2 | API externa | 8 | ViaCEP e Asaas validados no *sandbox* em 16/10, atrás de interface; Mercado Pago sem validação |
| C3 | Banco com justificativa | 9 | Justificativa técnica forte (EXCLUDE gist, UUID, índices parciais); FKs entre serviços contraditórias |
| C4 | Deploy em nuvem | 3 | Só desenho (alvo do 5º semestre); ambiente efêmero e sem produção |
| C5 | Terraform | 3 | Estrutura de módulos descrita, nada provisionado (T-02.2 cortada) e passos manuais |
| C6 | CI/CD GitHub Actions | 4 | CI com testes e portão de cobertura; deploy explicitamente fora do CI; CI por serviço não iniciado |
| C7 | Cobertura ≥ 60% | 5 | Portão só no core; métrica muda entre documentos; nenhum percentual atual registrado |
| C8 | Prometheus + Grafana | 6 | Funciona no Compose local (PR #90), mas no cluster é a primeira coisa a sair |
| C9 | 8 documentos | 8 | Todos presentes e profundos; contradições e Doc 08 desatualizado |
| C10 | Encontros com evolução | 3 | Só 2 fichas, a segunda com número, pauta e link errados e sem assinatura |

---

## 7. As 10 perguntas mais prováveis em 10/12

1. "Mostrem o `analytics-service` rodando num processo e num banco separados. Se eu derrubar o core agora, o que acontece com os indicadores?"
2. "O Doc 05 diz que o GitHub Actions não faz deploy. O Termo exige deploy automatizado. Como vocês atendem o C6?"
3. "Pelo RNF-007, só o ADMIN cria reserva. Então como a recepcionista faz o *walk-in* no balcão?"
4. "Cadê a página de reserva do hóspede? O Doc 01 diz que está implementada. Hóspede vai usar o Swagger?"
5. "Um robô pode criar mil reservas PENDING pela rota pública sem pagar. Quando esses quartos voltam para a venda? E o *no-show*, que vocês prometem reduzir?"
6. "Como o *webhook* do Asaas chega ao Docker Compose rodando no notebook de vocês na demonstração?"
7. "Qual é a cobertura de testes hoje, global, somando todos os serviços? Mostrem o relatório."
8. "Se faltar memória no `t3.small`, vocês desligam o Prometheus e o Grafana, que são critério obrigatório. Por que essa ordem?"
9. "O MER declara FK de `contracts.reservation_id` para `reservations`, mas a seção 7 diz que estão em bancos separados. Qual das duas é verdade hoje?"
10. "Weslley, o que você entregou na `develop` neste semestre? E por que as ADRs são de maio, se o projeto começou em setembro?"
