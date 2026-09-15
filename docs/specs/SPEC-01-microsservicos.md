# SPEC-01 — Arquitetura de Microsserviços

**Prioridade:** 🔴 Crítica — condição de aprovação do projeto (critério C1: *"Arquitetura de Microsserviços implementada"*)
**Estado:** 🟡 Em andamento — T-01.1 concluída em 14/09/2026 (ADR-003)
**Criado em:** 26/08/2026
**Bloqueia:** SPEC-02 · documentos 03 (DFD), 04 (MER) e 06 (C4)

---

## 1. Contexto

O Termo de Aceite exige, sem margem de interpretação:

> *"O projeto deve ser concebido e implementado utilizando arquitetura de **Microsserviços**. Monólitos simples não serão aprovados."*

O Termo da banca do 5º semestre transforma isso no critério **C1 — Arquitetura de Microsserviços *implementada***, avaliado junto dos demais *"sem exceção"*. E o **C9** exige os 8 documentos *"válidos e atualizados"*: **tudo o que os documentos mostrarem precisa existir no código.**

**Estado atual verificado em 26/08:** existe um único backend. Todo `app/`, `routes/` e `database/` roda num só processo Node/Express, com um `package.json`, um `Dockerfile`, um `command.js` e um deployment Kubernetes (`k8s/backend.yaml`) com 3 réplicas do **mesmo** container.

Isso é um monólito — bem organizado internamente por domínio, o que facilita a separação, mas ainda assim um monólito.

**Este é o maior risco de reprovação do projeto.**

---

## 2. Objetivo

Decompor o backend em microsserviços independentes, com fronteiras de dados definidas, comunicação explícita e pipeline de build/deploy por serviço.

---

## 3. Escopo

### 3.1 Dentro do escopo

- Definição formal das fronteiras de serviço
- Decisão sobre propriedade de dados
- Resolução das chaves estrangeiras que atravessam fronteira
- Padrão de comunicação entre serviços — síncrono e por eventos
- Autenticação e propagação de identidade entre serviços
- **Implementação dos três serviços documentados**: `core-service`, `b2b-service` e `analytics-service`
- Broker de mensagens (RabbitMQ) e pipeline de eventos do core para o analytics
- Pipeline de CI/CD por serviço

### 3.2 Fora do escopo

- *Service mesh* (Istio, Linkerd) — complexidade desproporcional para 3 serviços
- *Saga pattern* / transações distribuídas — o recorte do ADR-003 mantém toda invariante transacional dentro de uma única fronteira
- Mensageria entre `b2b-service` e `core-service` — o bloqueio de quartos exige consistência imediata
- **Notificação ao hóspede** e **channel manager** — evolução prevista no ADR-003 como consumidores futuros dos eventos do core. Não são implementados e **não entram nos diagramas**

---

## 4. Restrições

| Restrição | Origem |
|-----------|--------|
| Equipe de 3 pessoas, dois semestres | Composição real do grupo |
| Não pode quebrar as 220 funcionalidades já testadas | Suíte de testes existente |
| A invariante anti-*double-booking* depende de constraint de banco (`EXCLUDE USING gist`) e **não pode** ser distribuída | `db/schema.sql` |
| Multi-tenancy por `tenant_id` precisa continuar íntegro em todos os serviços **e em todos os eventos** | Decisão arquitetural do produto |
| Tudo que for documentado precisa estar implementado | Critérios C1 e C9 |
| ESM puro, Node 24, Sequelize 6 | Convenção do repositório |
| Free-tier da AWS e destruição de recurso ao fim do uso | Regra absoluta do projeto |

---

## 5. Recorte decidido — ADR-003, 14/09/2026

O critério de fronteira é a **consistência transacional**, não o tipo de dado: o que precisa ser confirmado junto fica no mesmo serviço e no mesmo banco. Onde um atraso de segundos é aceitável, a comunicação é **por eventos**.

| Serviço | Entidades | Banco |
|---------|-----------|-------|
| **core-service** | tenants, users, room_categories, rooms, guests, reservations, reservation_rooms, payments, consumptions, products, accounts 🔷, account_items 🔷 — mais a tabela de *outbox* de eventos | PostgreSQL próprio |
| **b2b-service** | corporate_clients, event_quotes, quote_services, contracts, contract_installments | PostgreSQL próprio |
| **analytics-service** | *(nenhuma entidade de domínio)* — projeções de leitura e registro de eventos processados | PostgreSQL próprio, alimentado por eventos |

**Comunicação:**

| De → Para | Como | Por quê |
|---|---|---|
| `b2b-service` → `core-service` | REST síncrono, rotas internas fora do *gateway*, **idempotente por `contract_id`** | Criar e cancelar reserva-bloco. Bloqueio de quarto não tolera atraso |
| `core-service` → `analytics-service` | **Eventos via RabbitMQ**, com *outbox* transacional no core, fila durável e fila de mensagens mortas | Indicadores toleram segundos de atraso, e o analytics não depende do esquema do core |

**Eventos publicados pelo core** — o conjunto mínimo derivado das 7 consultas de indicadores:

| Agregado | Eventos | Usado por |
|---|---|---|
| Hotel (`tenants`) | criado · alterado | Verificação de hotel ativo no analytics |
| Categoria de quarto | criada · alterada · removida | Receita por categoria, alertas |
| Quarto | criado · alterado (inclui status) · removido | Ocupação, alertas de limpeza |
| Hóspede | criado · alterado · removido · eliminado | Ranking de hóspedes, alertas — **projeção só com id e nome** |
| Reserva | criada · alterada · status alterado · removida | Receita, ocupação, sazonalidade, ranking, alertas |
| Pagamento | criado · alterado · status alterado · removido | Receita, mix de pagamento, alertas de *no-show* |

`users` e `consumptions` não geram eventos agora: nenhuma consulta de indicadores os lê.

**Referências cruzando a fronteira:** seis, todas partindo do `b2b-service` — o `tenant_id` das cinco tabelas B2B (identificador sem FK, garantido pela regra de tenant vindo do JWT) e `contracts.reservation_id`. As projeções do analytics guardam cópias com os mesmos ids, sem FK.

**Indisponibilidade:**

| Fora do ar | Efeito |
|---|---|
| `b2b-service` | Hotel opera integralmente; só vendas de grupo ficam indisponíveis |
| `analytics-service` | Operação intacta; eventos acumulam na fila |
| `core-service` | Operação para; o `b2b` recusa assinar/cancelar com `503`, sem estado parcial |
| RabbitMQ | Operação intacta; eventos ficam no *outbox* e saem quando o broker volta; indicadores desatualizados até lá |

### 5.1 O que mudou em relação à proposta de 23/08

A equipe havia aprovado como proposta um corte por **tipo de dado**: `core` operacional, `billing` com pagamento, produtos, contas e todo o domínio contratual. A pesquisa de 14/09 no código mostrou que ele não se sustenta:

| Evidência | Corte de 23/08 | Corte decidido |
|---|---:|---:|
| Transações atômicas atravessando a fronteira | **4** | 2 — viram chamadas idempotentes |
| Fluxo PIX atravessando serviços | sim | não |
| Chaves estrangeiras existentes cruzando | **12** | 6, sendo 5 `tenant_id` |
| Consultas de analytics sem solução em SQL | **2** | 0 |

As quatro transações eram: reserva direta (`CreateBookingController` — hóspede, reserva e pagamento), webhook PIX (`PixWebhookController` — pagamento e reserva), assinatura e cancelamento de contrato (`SignContractController`, `CancelContractController` — contrato e reserva-bloco).

As doze FKs incluíam o `tenant_id` com `ON DELETE CASCADE` das oito tabelas de billing, que a análise de 26/08 não contou, e `consumptions`, entidade que a proposta não chegou a alocar a nenhum serviço.

Na direção oposta, o domínio B2B mostrou fronteira limpa: **nenhum** controller de core, analytics, webhook ou reserva pública lê tabela B2B, e os controllers B2B só tocam o core nos dois fluxos de contrato.

### 5.2 Correções de rota desta Spec

**v1.0 → v1.1.** A versão 1.0 recomendava a alternativa **A** e descrevia a **C** como *"fronteira artificial"*. A evidência acima inverteu essa leitura.

**v1.1 → v1.2.** A versão 1.1 descartava mensageria e fazia o analytics ler uma réplica do banco do core. Revisto após leitura integral dos critérios de aceite, pelo olhar de produto: ler o banco de outro serviço cria dependência de esquema, e um PMS precisa de um canal para que o balcão alimente outros consumidores sem alterar o núcleo. **Os critérios não exigem mensageria** — ela entra por mérito de arquitetura, e só onde a consistência eventual é aceitável.

### 5.3 Impacto nas outras frentes

| Frente | O que muda |
|---|---|
| **SPEC-04** — Consumo | `accounts` e `account_items` ficam no core, com FK normal para `reservations`, `rooms` e `guests`; a T-04.4 é transação no mesmo banco. **Pode começar sem esperar esta Spec** |
| **SPEC-02** — Cloud | Três bancos (core, b2b, analytics) e o RabbitMQ no cluster. O **Redis provisionado em `k8s/redis.yaml` não é usado por nenhuma linha de código**: sai do cluster ou ganha propósito declarado |
| **SPEC-06 T-06.4** — Docker Compose | O compose de contingência precisa subir os três serviços, os três bancos e o RabbitMQ |
| **SPEC-06 T-06.11** — LGPD | A eliminação de hóspede precisa ser propagada ao analytics por evento |
| **SPEC-07** — Tarifas | `rate_periods` fica no core. Nenhuma referência cruzada |
| **Documentos 03 (DFD) e 04 (MER)** — Sirlande | Insumos em `docs/sugestoes-documentos-oficiais/`. O DFD mostra só o que estiver implementado |
| **Documento 06 (C4)** | Contêineres: três serviços, três bancos, RabbitMQ e Nginx como *gateway* |

---

## 6. Tarefas

### T-01.1 — Decidir o recorte e a propriedade dos dados ✅

**Concluída em 14/09/2026.** Registro formal: **ADR-003** no Documento 07.

**Critérios de aceitação**
- [x] **CA-01.1.a** — Cada uma das 17 entidades tem um serviço proprietário declarado — 12 no core, 5 no b2b
- [x] **CA-01.1.b** — Alternativa escolhida registrada com justificativa e consequências — recorte por consistência transacional
- [x] **CA-01.1.c** — Decisão formalizada como **ADR-003**
- [x] **CA-01.1.d** — Comportamento com serviço indisponível explícito, incluindo o broker — ver §5

---

### T-01.2 — Definir o padrão de comunicação 🟡

**DEP:** T-01.1 ✅

Protocolos decididos no ADR-003. Faltam os contratos e os números de falha.

**Critérios de aceitação**
- [x] **CA-01.2.a** — Protocolos definidos com justificativa — REST síncrono idempotente (b2b → core) e eventos via RabbitMQ (core → analytics)
- [ ] **CA-01.2.b** — Contrato das duas rotas internas do core documentado no OpenAPI
- [ ] **CA-01.2.c** — **Catálogo de eventos** documentado: nome, *routing key*, esquema do *payload* e versão de cada evento
- [ ] **CA-01.2.d** — *Timeout* e tentativas da chamada síncrona; política de nova tentativa e envio à fila de mensagens mortas no consumidor
- [x] **CA-01.2.e** — Broker escolhido e justificado — **RabbitMQ**, ADR-003

---

### T-01.3 — Definir autenticação entre serviços 🔲

**DEP:** T-01.1 ✅

Hoje o JWT é validado por *middleware* local (`middlewares/auth.middleware.js`), com `tenant_id` extraído do *payload*. Com serviços separados, é preciso decidir como a identidade e o tenant se propagam.

**Critérios de aceitação**
- [ ] **CA-01.3.a** — Estratégia definida: cada serviço valida o JWT, ou existe *gateway* que valida e propaga
- [ ] **CA-01.3.b** — `tenant_id` continua sendo obrigatório e impossível de forjar em todos os serviços
- [ ] **CA-01.3.c** — Chamada serviço-a-serviço (sem usuário) tem mecanismo próprio de autenticação
- [ ] **CA-01.3.d** — Credenciais do RabbitMQ separadas por serviço: o core só publica, o analytics só consome
- [ ] **CA-01.3.e** — Decisão registrada como **ADR-006**

> **Achado da pesquisa de 14/09 — o CA-01.3.b não é atingível com o esquema atual.** O token usa HS256 com um único `JWT_SECRET`. Distribuído a três serviços, qualquer um deles passa a poder **emitir** token válido de qualquer tenant. A candidata natural é **RS256**: o core assina com chave privada, os demais só verificam com a pública.
>
> **Achado lateral:** o `JWT_SECRET` está em texto puro em `k8s/secret.yaml`, versionado — o que contradiz o RNF-011 do Documento 02. Resolver junto, já que a T-01.3 muda a forma de distribuir segredos.
>
> **O que já ajuda:** o Nginx já é o ponto único de entrada (`k8s/nginx.yaml`), e existe `NetworkPolicy`.

---

### T-01.4 — Extrair o `analytics-service` com pipeline de eventos 🔲

**DEP:** T-01.1 ✅, T-01.2, T-01.3

Primeiro serviço a sair: não altera estado do hotel, então a extração não arrisca invariante nenhuma. **É também a tarefa que implanta o broker** — o que a torna maior do que a v1.1 desta Spec previa.

**No core**
- [ ] **CA-01.4.a** — Tabela de *outbox* no banco do core; cada evento é gravado **na mesma transação** da alteração que o originou
- [ ] **CA-01.4.b** — Publicador entrega os eventos pendentes à *exchange* do RabbitMQ e marca como publicados
- [ ] **CA-01.4.c** — Com o RabbitMQ fora do ar, o core continua operando e os eventos acumulam no *outbox* — **comprovado por teste**
- [ ] **CA-01.4.d** — Todos os eventos da §5 publicados, com `tenant_id`

**No broker**
- [ ] **CA-01.4.e** — RabbitMQ no `k8s/` e no Docker Compose, com fila durável do analytics e fila de mensagens mortas
- [ ] **CA-01.4.f** — Métricas do RabbitMQ expostas ao Prometheus — profundidade de fila e atraso de consumo aparecem no Grafana (critério C8)

**No analytics**
- [ ] **CA-01.4.g** — Serviço em processo próprio, com `package.json`, `Dockerfile` e banco PostgreSQL próprios
- [ ] **CA-01.4.h** — Consumidor idempotente: evento repetido não altera nenhum indicador — **comprovado por teste**
- [ ] **CA-01.4.i** — Evento que falha repetidamente vai para a fila de mensagens mortas sem bloquear os demais
- [ ] **CA-01.4.j** — Carga inicial das projeções a partir dos dados já existentes no core
- [ ] **CA-01.4.k** — Os 7 endpoints de indicadores respondem a partir das projeções
- [ ] **CA-01.4.l** — Projeção de hóspede guarda apenas id, `tenant_id` e nome
- [ ] **CA-01.4.m** — Isolamento multi-tenant preservado, com o teste de isolamento cobrindo o novo serviço

**Integração**
- [ ] **CA-01.4.n** — Deployment Kubernetes independente
- [ ] **CA-01.4.o** — O monólito não responde mais `/analytics`, e o Nginx roteia `/analytics/` para o novo serviço
- [ ] **CA-01.4.p** — `tests/analytics.test.js` passa contra o novo serviço
- [ ] **CA-01.4.q** — Suíte completa continua verde

> **Cuidado com o teste:** `tests/analytics.test.js` semeia dados pelos endpoints do core (`registerAndLogin`, `factories`). Com eventos, o teste semeia pelo core, aguarda o consumo e consulta o analytics — é teste de integração do pipeline, não só do endpoint.
>
> **Coordenação:** a suíte usa um único banco de teste com `truncateAll`. Duas suítes rodando ao mesmo tempo, de worktrees diferentes, se sabotam. Combinar antes de rodar.
>
> **Capacidade:** a estimativa desta tarefa precisa ser refeita na conversa de capacidade do time — ela entrou maior do que a divisão de trabalho de 09/09 considerou.

---

### T-01.5 — Pipeline de CI/CD por serviço 🔲

**DEP:** T-01.4

O Termo exige: *"O processo de build e deploy **dos microsserviços** deve ser obrigatoriamente automatizado."*

**Critérios de aceitação**
- [ ] **CA-01.5.a** — Cada serviço tem *workflow* próprio, disparado só por mudança no seu diretório
- [ ] **CA-01.5.b** — *Build* da imagem e publicação em *registry* automatizados
- [ ] **CA-01.5.c** — *Deploy* automatizado para o cluster
- [ ] **CA-01.5.d** — Testes rodam por serviço, e falha bloqueia o *deploy*
- [ ] **CA-01.5.e** — Cobertura medida de forma **global, considerando todos os microsserviços** (critério C7)

> `.github/workflows` tem dono na divisão de trabalho: o Weslley. A T-01.5 entrega o que o serviço precisa, e ele integra.

---

### T-01.6 — Extrair o `b2b-service` 🔲 *(5º semestre)*

**DEP:** T-01.4 validado, T-01.2, T-01.3

O fluxo de pagamento não sai do core, e restam duas operações entre serviços.

**Critérios de aceitação**
- [ ] **CA-01.6.a** — Rotas internas do core para criar e cancelar reserva-bloco, idempotentes por `contract_id`
- [ ] **CA-01.6.b** — A verificação de disponibilidade dos quartos acontece **dentro** da transação do core que cria a reserva-bloco
- [ ] **CA-01.6.c** — `tests/b2b-smoke.test.js` passa contra os dois serviços
- [ ] **CA-01.6.d** — `tests/public-booking.test.js` passa **sem alteração** — o PIX não é tocado por esta extração
- [ ] **CA-01.6.e** — Core fora do ar: assinar e cancelar respondem `503` e o contrato permanece no status anterior
- [ ] **CA-01.6.f** — Repetir uma assinatura interrompida não cria segunda reserva-bloco
- [ ] **CA-01.6.g** — Banco próprio, deployment próprio e rota `/contracts`, `/event-quotes` e `/corporate-clients` servidas pelo novo serviço

---

## 7. Definition of Done da Spec

- [x] ADR-003 escrito e aprovado
- [ ] Os três serviços documentados rodando separados, cada um com banco próprio
- [ ] Pipeline de eventos core → analytics operando com entrega garantida e consumidor idempotente
- [ ] Chamada síncrona b2b → core idempotente
- [ ] Documentos 03, 04 e 06 produzidos pelos donos a partir da arquitetura **implementada**
- [ ] Suíte de testes verde, com cobertura global ≥ 60%
- [ ] Pipeline por serviço funcionando
- [ ] Docker Compose de contingência subindo tudo

---

## 8. Escopo por semestre

| Semestre | O Termo pede | O que esta Spec entrega |
|---|---|---|
| **4º** | *"MVP funcional demonstrando a viabilidade da proposta e a **integração inicial dos microsserviços**"* | T-01.1 a T-01.5 — core e analytics separados e integrados por eventos |
| **5º** | *"Desenvolvimento completo da solução"* e C1 *"implementada"* | T-01.6 — os três serviços |

Isso permite responder na defesa: *"por que estes serviços?"*, *"como conversam?"*, *"o que acontece se um cair?"*, *"por que eventos só aqui?"* — com implementação real por trás, não só diagrama.

---

## 9. Riscos

| Risco | Impacto | Mitigação |
|-------|---------|-----------|
| Quebrar a invariante anti-*double-booking* | **Crítico** — perda de integridade | `reservations` fica inteira no `core`; a constraint nunca atravessa fronteira |
| Vazamento entre tenants na comunicação entre serviços | **Crítico** — LGPD | CA-01.3.b; todo evento carrega `tenant_id`; teste de isolamento no novo serviço |
| Segredo JWT simétrico compartilhado permitir forjar token | **Crítico** | T-01.3 — assinatura assimétrica (RS256) |
| Evento perdido com o broker fora | Alto — indicador errado | *Outbox* transacional, CA-01.4.a e CA-01.4.c |
| Indicador contado em dobro por reentrega | Alto | Consumidor idempotente, CA-01.4.h |
| Documentar o que não foi implementado | Alto — critério C9 | Diagramas só mostram serviços e fluxos existentes; notificação e channel manager ficam fora |
| Operar RabbitMQ com equipe de 3 pessoas | Médio | Nó único, manifesto versionado, métricas no Grafana, fila de mensagens mortas |
| Cópia de dado pessoal no analytics | Médio — LGPD | Projeção mínima (CA-01.4.l); eliminação propagada por evento (SPEC-06 T-06.11) |
| T-01.4 maior que o previsto estourar a capacidade | Alto | Reestimar na conversa de capacidade; T-01.6 fica no 5º semestre |
| Banca questionar o tamanho do core como "mini-monólito" | Médio | Resposta registrada no ADR-003: a fronteira é a unidade transacional |

---

## 10. Histórico

| Versão | Data | Autor | Alteração |
|--------|------|-------|-----------|
| 1.0 | 26/08/2026 | Gabriel Reis Cunha | Criação a partir do inventário de 26/08 |
| 1.1 | 14/09/2026 | Gabriel Reis Cunha | **T-01.1 concluída — ADR-003.** Recorte refeito pela consistência transacional: pagamento, consumo, produtos e contas vão para o core; o domínio contratual vira `b2b-service`; analytics lê réplica. Corrigida a recomendação da v1.0 |
| 1.2 | 14/09/2026 | Gabriel Reis Cunha | **Mensageria adotada.** Após leitura integral dos critérios de aceite, o analytics deixa de ler réplica e passa a ter banco próprio, alimentado por eventos do core via **RabbitMQ**, com *outbox* transacional e consumidor idempotente. B2B → core continua síncrono. Notificação ao hóspede e channel manager registrados como evolução, fora dos diagramas. Escopo passa a incluir os três serviços (C1 *"implementada"*). T-01.4 reescrita com o pipeline de eventos; T-01.2 ganha catálogo de eventos; T-01.3 ganha credenciais por serviço no broker; impactos em SPEC-02, T-06.4 e T-06.11 |
