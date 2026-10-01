# Documento 02 — conferência da v1.4 sugerida contra os critérios de aceite

**Documento conferido:** `versao-sugerida_v1.4.md` (nesta pasta) — **não editado**
**Contra:** Termo de Requisitos e Aceite (`aceite-projeto-experimental.md`, §1 a §8) e Termo da
banca do 5º semestre (`termo-aceite-banca-5semestre.md`, C1 a C10), lidos do `upstream/main` do
repositório do professor em 30/09/2026
**Coerência com:** Documento 04 entregue (v1.1, `upstream/main`) e a sugestão `04-mer/versao-sugerida_v1.2.md`
**Evidência de código:** `develop` do repositório do hotel em 30/09/2026, mais o que está em PR
aberto quando indicado
**Autor:** agente executor, trilha do Gabriel (delegação `rodada2_gabriel_28set2026.md`, etapa E)
**Quem decide:** Gabriel, dono do Documento 02

---

## Conclusão

**A v1.4 não está pronta para a reentrega.** Ela corrige o que o ADR-003 tornou falso — e isso
está certo —, mas a conferência encontrou:

- **Uma exigência obrigatória sem requisito nenhum:** monitoramento com **Prometheus e Grafana**
  (Termo §5, critério **C8**). Nenhum RF ou RNF da v1.4 fala em monitoramento.
- **Três exigências cobertas pela metade:** o *deploy* automatizado (C6 — o RNF-022 cobre
  *build* e Terraform, não o *deploy*), a cobertura **global** entre microsserviços (C7) e a
  contingência por Docker Compose (Termo §8).
- **Dois requisitos que contradizem decisões já tomadas:** o **RNF-011** cita `JWT_SECRET`, que
  a ADR-006 eliminou, e promete *"zero segredos versionados"* contra a política acadêmica
  declarada do `secret.yaml`; o **RNF-007** torna criação e edição de hóspedes e reservas
  *"exclusivas de ADMIN"*, o que impediria a recepção de operar (RF-049).
- **Um critério obrigatório apoiado num requisito de prioridade Baixa:** a única API externa
  real hoje é a ViaCEP (**RF-045**, Baixa). O PIX (RF-026) usa um provedor simulado.

Nenhum desses pontos exige refazer o documento: são **sete alterações localizadas**, listadas na
§6. Feitas elas, a v1.4 cobre integralmente as exigências que cabem a um documento de requisitos.

**Achado que não é de documento, mas apareceu aqui:** o controle de acesso por papel do código
não cumpre o RNF-007 em nenhuma das duas leituras — o papel `WAITER` cria e exclui
**pagamentos**, cria reservas, faz check-in e assina contrato (§4.3, L-1). Isso vale correção
de código, independentemente do que for decidido sobre o texto.

---

## 1. Como a conferência foi feita

- Um item por exigência das §1 a §8 do Termo de Requisitos e por critério C1 a C10.
- Para cada um: o requisito da v1.4 que o cobre, se cobre **integralmente**, e a evidência.
- O Doc 02 é **norma** (§1 da própria v1.4): um requisito que o código ainda não cumpre **não é
  erro do documento** se estiver planejado. Por isso as lacunas da §4 separam três casos:
  exigência sem requisito; requisito que contradiz decisão já tomada; e meta que o código não
  sustenta — e, nesta última, se há tarefa planejada (SPEC) ou não.
- Exigências que não cabem a um documento de requisitos (composição da equipe, encontros,
  cronograma) são registradas como **não aplicáveis ao Doc 02**, com o documento que as cobre.

**Legenda:** ✅ coberta integralmente · 🟡 coberta em parte · ❌ sem requisito · — não se aplica ao Doc 02

---

## 2. Termo de Requisitos e Aceite — §1 a §8

| § | Exigência | Cobertura na v1.4 | | Evidência e observação |
|---|---|---|---|---|
| 1 | Não ser "site simples" nem CRUD básico | RF-010/011 (máquina de estados e anti-*double-booking*), RF-026/027 (PIX assíncrono), RF-033 (reserva-bloco entre serviços), RNF-028 (eventos) | ✅ | Complexidade de domínio e de arquitetura explícitas nos critérios de aceite |
| 2 | Grupo de 2 a 5, papéis distribuídos | Cabeçalho lista os 3 integrantes | — | Distribuição de papéis é do **Doc 08** |
| 3 | Arquitetura de **microsserviços** | Coluna *Módulo* (core, b2b, analytics), RNF-014 (banco próprio do analytics), RNF-028 (eventos) | 🟡 | Falta requisito de **independência de *deploy* e de banco** para todos os serviços — só o analytics tem (RNF-014). E a autenticação entre serviços da ADR-006 (só o core emite token; credencial própria na chamada b2b → core) não tem requisito. Ver §4.1, L-4 |
| 3 | Pelo menos uma **API externa** relevante | RF-045 (ViaCEP), RF-026/027 (PSP de PIX) | 🟡 | ViaCEP está implementada de verdade (`app/services/address/ViaCepAddressProvider.js`, T-03.1 ✅), mas o RF-045 tem prioridade **Baixa**. O PIX usa `FakePixProvider` (`app/services/pix/index.js:21`, padrão `PIX_PROVIDER=fake`); a integração real (Mercado Pago, T-03.2) é 🔲. Ver §4.1, L-5 |
| 3 | Banco de dados com **justificativa técnica** | — | — | Não é papel do Doc 02. Coberta no **Doc 04 §2** e na **ADR-002** (Doc 07). Ver §5 |
| 4 | *Deploy* em nuvem de grande porte, sem PaaS/BaaS como *backend* | RNF-022 remete ao Doc 05 | 🟡 | Nenhum requisito diz **onde** o sistema roda nem proíbe PaaS. A decisão existe (AWS, k3s em EC2 — Doc 05, Weslley), mas a norma não a fixa |
| 4 | Infraestrutura via **Terraform**, sem ClickOps | RNF-022 — *"100% dos recursos de nuvem provisionados via Terraform"* | ✅ | Norma completa. No código: nenhum `.tf` ainda (SPEC-02 T-02.2 🔲) |
| 5 | CI/CD em **GitHub Actions**; *build* **e *deploy*** automatizados | RNF-021 (CI), RNF-022 (publicação de imagem) | 🟡 | O Termo exige *deploy* automatizado; o RNF-022 para na publicação da imagem no *registry*. No código: só CI (`.github/workflows/ci.yml`), sem *deploy* (SPEC-02 T-02.5 e SPEC-01 T-01.5 🔲). Ver §4.1, L-2 |
| 5 | Testes automatizados, **≥ 60% global, considerando todos os microsserviços** | RNF-015, RNF-016 | 🟡 | O RNF-015 não diz que a medição é **global entre serviços** (SPEC-01 CA-01.5.e exige), e fixa *branches* em **55%**, abaixo dos 60% do Termo. Hoje a cobertura do core é 79,29 / 74,83 / 88,35 / 81,71 (stmts / branches / funcs / lines) — subir *branches* para 60% não custa nada. Ver §4.1, L-3 |
| 5 | **Prometheus e Grafana** funcionais e acessíveis na defesa | **nenhum** | ❌ | Nenhum RF ou RNF menciona monitoramento, métrica, alerta ou *dashboard*. No código: nada (`prom-client`, `/metrics`, manifest de Prometheus — nenhum encontrado; SPEC-02 T-02.4 🔲). Ver §4.1, L-1 |
| 6 | Os 8 documentos | — | — | Fora do Doc 02, exceto ele próprio: *"levantamento completo e **priorizado**"* — os RF têm prioridade; os RNF não, e o **template oficial** também não prevê (só *Métrica* e *Meta*) |
| 7 | MVP no 4º semestre; solução completa no 5º | — | — | Cronograma é do **Doc 08** |
| 8 | Demonstração ao vivo em nuvem | Indireto: RNF-022 | 🟡 | Mesma lacuna da §4 deste quadro |
| 8 | **Contingência por Docker / Docker Compose**, arquivos atualizados e funcionais | **nenhum** | ❌ | O RNF-019 trata da imagem e o RNF-020 do Kubernetes; nenhum exige o Compose. No código: `docker-compose.yml` existe (T-06.4), mas **não sobe numa máquina limpa** — a imagem do MinIO não baixa (pendência do Weslley, reproduzida em 27/09 e no minikube em 30/09). Ver §4.1, L-6 |

---

## 3. Termo da banca — C1 a C10

| ID | Critério | Requisito da v1.4 | | Observação |
|---|---|---|---|---|
| C1 | Microsserviços implementados | *Módulo*, RNF-014, RNF-028 | 🟡 | Ver §2, linha "Arquitetura". No código: o `analytics-service` sai na T-01.4 (catálogo de eventos aguardando aprovação, PR #87) |
| C2 | API externa relevante | RF-045, RF-026/027 | 🟡 | Ver §2. Depender de um requisito **Baixa** para um critério eliminatório é risco de leitura — L-5 |
| C3 | Banco com justificativa documentada | — | — | Doc 04 §2 + ADR-002 |
| C4 | *Deploy* funcional em AWS/GCP/Azure | RNF-022 (indireto) | 🟡 | L-2 |
| C5 | Terraform | RNF-022 | ✅ | |
| C6 | CI/CD operacional via GitHub Actions | RNF-021, RNF-022 | 🟡 | Falta o "CD" — L-2 |
| C7 | Cobertura ≥ 60% sobre o código-fonte total | RNF-015, RNF-016 | 🟡 | L-3 |
| C8 | Prometheus e Grafana funcional e acessível | **nenhum** | ❌ | **L-1 — a lacuna mais séria** |
| C9 | 8 documentos válidos e atualizados | — | — | Para o Doc 02: as contradições da §4.2 o tornam **inválido** como está, mesmo depois da v1.4 |
| C10 | Encontros e evolução contínua | — | — | Processo, não requisito |

---

## 4. Lacunas

### 4.1 Exigência sem requisito, ou com requisito incompleto

| # | Lacuna | Gravidade | O que a v1.4 precisa |
|---|---|---|---|
| **L-1** | Monitoramento (Termo §5, C8) | 🔴 critério eliminatório sem requisito | RNF novo, na §3.2 ou §3.6: métricas expostas por **todos** os serviços e coletadas pelo Prometheus; *dashboards* no Grafana com latência, taxa de erro e saturação por serviço, e a profundidade da fila de eventos e da fila de mensagens mortas (SPEC-01 CA-01.4.f); **ao menos um alerta** configurado; stack acessível na defesa |
| **L-2** | *Deploy* automatizado (Termo §5, C4, C6) | 🟡 | RNF-022 passa a exigir também o *deploy* no cluster pelo pipeline, a cada entrega na branch de produção, sem passo manual — e a dizer que o alvo é a nuvem do Doc 05, em infraestrutura gerenciada pela equipe (não PaaS/BaaS) |
| **L-3** | Cobertura global (Termo §5, C7) | 🟡 | RNF-015: medição **consolidada de todos os microsserviços**; *branches* de 55% para **60%**, para não depender de interpretação |
| **L-4** | Independência dos serviços e autenticação entre eles (Termo §3, C1) | 🟡 | RNF novo, na §3.4: cada serviço com *deploy* e banco próprios, sem acesso ao banco de outro (generaliza o RNF-014). E um RNF na §3.3 para a ADR-006: só o `core-service` emite token; os demais verificam com a chave pública; chamada entre serviços autenticada por credencial própria |
| **L-5** | API externa apoiada em requisito Baixa (Termo §3, C2) | 🟡 | Ou o RF-045 sobe para **Alta**, ou a v1.4 explicita qual integração atende o C2. A integração real com PSP (Mercado Pago sandbox, T-03.2) fortaleceria o C2, mas não precisa estar no documento para ele valer |
| **L-6** | Contingência por Docker Compose (Termo §8) | 🟡 | RNF novo, na §3.6: o ambiente completo — todos os serviços, bancos e o broker — sobe com um comando do Docker Compose numa máquina limpa, sem acesso à nuvem |

### 4.2 Requisito que contradiz decisão já tomada

| # | Requisito | Contradição | Correção sugerida |
|---|---|---|---|
| **K-1** | **RNF-011** — *"`POSTGRES_PASSWORD` e `JWT_SECRET` injetados via `envFrom`/`secretKeyRef`"* | O `JWT_SECRET` **não existe mais**: a ADR-006 (aprovada em 24/09, implementada no PR #84) trocou por um par RS256, com a privada **fora** do `secret.yaml`. E *"zero segredos versionados"* contradiz a política acadêmica declarada — o `infra/k8s/secret.yaml` versiona seis valores de propósito (README, "variáveis sensíveis") | Meta: *"chave privada do JWT nunca versionada nem embutida na imagem; demais segredos injetados por `Secret`, sem valor no código-fonte da aplicação"*. Se a política acadêmica de versionar o `secret.yaml` continuar, o documento precisa admiti-la como exceção declarada — como o RNF-004 já faz com o Multi-AZ |
| **K-2** | **RNF-007** — *"criação, edição e exclusão de categorias, quartos, usuários, hóspedes, reservas, contratos e clientes corporativos exclusivas de `ADMIN`"* | Contradiz o **RF-049**: a recepção opera o ciclo da reserva (criar, check-in, check-out, cancelar). Se só o `ADMIN` pudesse criar reserva ou hóspede, o papel `RECEPTIONIST` não teria função | Separar: **exclusão** exclusiva de `ADMIN`; criação e edição de hóspedes, reservas, pagamentos e documentos B2B por `ADMIN` e `RECEPTIONIST`; `WAITER` só consumo e leitura do cardápio |
| **K-3** | **RNF-005** — *"renovação sem reautenticação"* | Não contradiz decisão, mas não há tarefa planejada: nenhum *refresh token* no código (`grep refresh` em `app/` e `routes/`: nada) nem em SPEC | Manter (é bom requisito) **e** registrar tarefa; ou retirar a renovação da meta |

### 4.3 Meta que o código não sustenta

O documento é norma; o que está planejado não é defeito do texto. Mas o professor confere o C9
comparando documento e código, e convém saber de antemão onde a resposta é "ainda não".

| # | Requisito | O que o código faz hoje | Planejado? |
|---|---|---|---|
| **L-1 (código)** | **RNF-007** — `WAITER` *"restrito ao lançamento de consumo"* | **Não há `requireRole` em `/payments`** (`routes/apis/paymentRouter.js:15-19`): qualquer papel autenticado cria, edita e **exclui** pagamento. Em `/guests`, `/reservations` (inclusive check-in, check-out e cancelamento), `/corporate-clients` e `/contracts`, só o `DELETE` exige `ADMIN` | **Não.** 🔴 — afeta receita e histórico financeiro. Vale correção de código, com a regra da K-2 |
| M-1 | **RF-010** — a constraint `EXCLUDE` *"impede a sobreposição mesmo sob condição de corrida"* | Vale só para `reservations.room_id`. Os quartos em `reservation_rooms` (RF-013 e reserva-bloco do RF-033) não são protegidos | **Não.** 🔴 — registrado no catálogo de eventos (PR #87, §11, P-1) |
| M-2 | **RNF-002** — paginação em 100% das listagens | 1 de 12 controllers `List*` pagina | Sim — SPEC-06 T-06.10 (não iniciada) |
| M-3 | **RNF-017** — 100% dos endpoints no OpenAPI | As rotas B2B (`/corporate-clients`, `/event-quotes`, `/contracts`) não aparecem em `config/swagger.js` | Parcial — a T-06.2 fez os *schemas* das rotas documentadas; as B2B ficaram de fora |
| M-4 | **RNF-019** — imagem ≤ 150 MB | **Depende de como se mede, e a meta não diz.** Compactada (o que vai ao *registry*, `docker image inspect`): **68–79 MB** ✅. No disco local (`docker images`): **302–366 MB** ❌ | Ajuste de texto: *"tamanho compactado no registry"* |
| M-5 | **RNF-005** — renovação de sessão | Inexistente | **Não** — K-3 |
| M-6 | **RNF-023** — orçamento persistido | Cumprido pelo código a partir do PR da etapa D (`fix/rnf023-pdf-orcamento`). Ressalva: contrato e orçamento ainda **geram sob demanda** quando o envio ao armazenamento falhou, o que diverge do *"download apenas por URL assinada"* | Decisão do Gabriel (registrada no PR da etapa D) |
| M-7 | RF-019 a RF-023 (comanda), RF-055 (ficha), RF-056 (caixa), RF-046 a RF-054 (interface) | Parcial ou não iniciado | Sim — SPEC-04, SPEC-05; RF-055/056 sem SPEC |
| M-8 | RNF-014, RNF-028 | O analytics ainda lê o banco do core | Sim — T-01.4 |
| M-9 | RNF-022 (Terraform) | Nenhum `.tf` | Sim — SPEC-02, 5º semestre |

---

## 5. Coerência com o Documento 04

| # | Ponto | Doc 04 entregue (v1.1) | Sugestão v1.2 | Situação |
|---|---|---|---|---|
| D-1 | Recorte de serviços (§7) | `billing-service`, recorte de 23/08 | Recorte do ADR-003 — **coerente com a v1.4** | Resolvido **se** as duas sugestões forem reentregues juntas. Reentregar só a v1.4 deixa Doc 02 e Doc 04 contraditórios entre si |
| D-2 | Escalabilidade do banco (§2) | *"horizontal via réplicas de leitura para a carga analítica"* — contradiz o RNF-014 da v1.4 | Frase não aparece mais | Mesmo caso da D-1 |
| D-3 | `PRODUCTS` | 🔷 planejado | ✅ implementado | Correto na v1.2 |
| D-4 | **RF-055** (ficha de registro) | Sem entidade nem atributo | Idem | ❌ — `GUESTS` tem 4 campos de dado pessoal; documento, nascimento, nacionalidade, endereço, motivo da viagem e **acompanhantes** (entidade nova) não estão modelados. O RF-055 está na v1.3 **já entregue**: a incoerência existe hoje |
| D-5 | **RF-056** (fechamento de caixa) | Sem entidade | Idem | ❌ — falta a entidade do fechamento (operador, turno, valor conferido, divergência, confirmação) |
| D-6 | *Outbox* de eventos (RNF-028) | — | Citado em §7.3, sem entidade no dicionário | 🟡 — a tabela de *outbox* é entidade do `core-service` (catálogo de eventos, §6), e pode entrar como 🔷 |
| D-7 | `EVENT_QUOTES.pdf_url` (RNF-023) | Ausente (só `CONTRACTS` tem `pdf_url`) | Idem | 🟡 — passa a existir com o PR da etapa D |
| D-8 | Rastreabilidade RF → entidade | — | Todos os RF citados no Doc 04 existem na v1.4 | ✅ — os 28 RF que o Doc 04 não cita são comportamento, interface ou indicador, exceto RF-055 e RF-056 (D-4, D-5) |

Doc 04 é do **Sirlande**. Os itens D-4 a D-7 são insumo para ele, não alteração feita aqui.

---

## 6. O que fazer para a v1.4 ficar pronta

Sete alterações na v1.4, todas localizadas — nenhum identificador existente muda:

| # | Alteração | Fecha |
|---|---|---|
| 1 | RNF novo de **monitoramento** (Prometheus, Grafana, alerta, filas de eventos) | L-1 · C8 |
| 2 | **RNF-022** inclui o *deploy* automatizado e o alvo em nuvem gerenciada pela equipe | L-2 · C4, C6 |
| 3 | **RNF-015**: medição global entre serviços; *branches* ≥ 60% | L-3 · C7 |
| 4 | RNF novo de **independência dos serviços** e RNF de **autenticação entre serviços** (ADR-006) | L-4 · C1 |
| 5 | **RF-045** para Alta, ou nota explícita de qual integração atende o C2 | L-5 · C2 |
| 6 | RNF novo de **contingência por Docker Compose** | L-6 · Termo §8 |
| 7 | **RNF-011** e **RNF-007** reescritos (K-1, K-2); **RNF-019** com o método de medição (M-4); decisão sobre a renovação do **RNF-005** (K-3) | C9 |

E, fora do Doc 02, para a reentrega ser coerente:

- reentregar a **v1.2 do Doc 04 junto**, com D-4 a D-7 resolvidos pelo Sirlande;
- corrigir no **código** o controle de acesso por papel (§4.3, primeira linha) — o professor
  confere documento contra código, e esse é o ponto em que a resposta seria "o requisito é
  falso".

A reunião de reentrega fica para **depois** das sete alterações e de uma nova conferência
rápida contra este relatório.

---

## 7. O que não foi verificado

- O texto oficial da v1.3 entregue não foi comparado linha a linha com a v1.4 — o `MOTIVOS.md`
  já faz isso, e esta conferência parte da v1.4.
- Os Documentos 05, 06 e 08 não foram conferidos; o Doc 07 só quanto à existência da ADR-002.
- Os números de cobertura são do `core-service` nesta data; o frontend tem testes próprios que
  não entram na medição atual — mais um motivo para o L-3.
- O tamanho de imagem foi medido nesta máquina (Docker 29, *containerd image store*).
