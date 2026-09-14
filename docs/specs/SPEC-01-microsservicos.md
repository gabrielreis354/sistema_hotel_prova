# SPEC-01 — Arquitetura de Microsserviços

**Prioridade:** 🔴 Crítica — condição de aprovação do projeto
**Estado:** 🟡 Em andamento — T-01.1 concluída em 14/09/2026 (ADR-003)
**Criado em:** 26/08/2026
**Bloqueia:** SPEC-02 · documentos C4 e DFD · MER v1.2

---

## 1. Contexto

O Termo de Aceite exige, sem margem de interpretação:

> *"O projeto deve ser concebido e implementado utilizando arquitetura de **Microsserviços**. Monólitos simples não serão aprovados."*

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
- Decisão sobre propriedade de dados (banco por serviço vs. schema isolado)
- Resolução das chaves estrangeiras que atravessam fronteira
- Padrão de comunicação entre serviços
- Autenticação e propagação de identidade entre serviços
- Extração de pelo menos **um** serviço do monólito, funcionando de ponta a ponta
- Pipeline de CI/CD por serviço

### 3.2 Fora do escopo

- Decomposição completa nos 3 serviços neste semestre — o Termo pede *"integração inicial dos microsserviços"* no 4º semestre
- *Service mesh* (Istio, Linkerd) — complexidade desproporcional para 3 serviços
- *Saga pattern* / transações distribuídas — o recorte do ADR-003 mantém toda invariante transacional dentro de uma única fronteira
- Mensageria assíncrona — **descartada no ADR-003**: nenhum fluxo do recorte exige consistência eventual

---

## 4. Restrições

| Restrição | Origem |
|-----------|--------|
| Equipe de 3 pessoas, dois semestres | Composição real do grupo |
| Não pode quebrar as 220 funcionalidades já testadas | Suíte de testes existente |
| A invariante anti-*double-booking* depende de constraint de banco (`EXCLUDE USING gist`) e **não pode** ser distribuída | `db/schema.sql` |
| Multi-tenancy por `tenant_id` precisa continuar íntegro em todos os serviços | Decisão arquitetural do produto |
| ESM puro, Node 24, Sequelize 6 | Convenção do repositório |

---

## 5. Recorte decidido — ADR-003, 14/09/2026

O critério de fronteira é a **consistência transacional**, não o tipo de dado: o que precisa ser confirmado junto fica no mesmo serviço e no mesmo banco.

| Serviço | Entidades | Banco |
|---------|-----------|-------|
| **core-service** | tenants, users, room_categories, rooms, guests, reservations, reservation_rooms, payments, consumptions, products, accounts 🔷, account_items 🔷 | PostgreSQL próprio |
| **b2b-service** | corporate_clients, event_quotes, quote_services, contracts, contract_installments | PostgreSQL próprio |
| **analytics-service** | *(nenhuma — somente leitura)* | Réplica de leitura do `core-service` |

**Comunicação:**

- `b2b-service → core-service` — REST síncrono, rotas internas fora do *gateway*, **idempotente por `contract_id`**. Duas operações: criar a reserva-bloco ao assinar contrato (o núcleo verifica disponibilidade e cria na mesma transação) e cancelá-la ao cancelar.
- `analytics-service` — nenhuma chamada a serviço. Lê a réplica com credencial somente leitura, mantendo o filtro por `tenant_id`. Localmente, a réplica é um usuário somente leitura no mesmo servidor de banco.
- Sem mensageria.

**Referências cruzando a fronteira:** seis, todas partindo do `b2b-service` — o `tenant_id` das cinco tabelas B2B (identificador sem FK, garantido pela regra de tenant vindo do JWT) e `contracts.reservation_id`.

**Indisponibilidade:** `b2b` fora → hotel opera integralmente; `analytics` fora → operação intacta, indicadores indisponíveis; `core` fora → operação para, e o `b2b` recusa assinar/cancelar com `503`, sem estado parcial.

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

### 5.2 Correção da recomendação anterior desta Spec

A versão 1.0 recomendava a alternativa **A** e descrevia a **C** como *"fronteira artificial"*. A evidência acima inverte essa leitura: a fronteira desenhada pela consistência transacional é a canônica, e a do tipo de dado é a que produz transação distribuída sem ganho.

### 5.3 Impacto nas outras frentes

| Frente | O que muda |
|---|---|
| **SPEC-04** — Consumo | `accounts` e `account_items` ficam no core. Modelar com FK normal para `reservations`, `rooms` e `guests`; a T-04.4 (`Payment ↔ Account`) é transação no mesmo banco. **Pode começar sem esperar mais nada desta Spec** |
| **SPEC-02** — Cloud | Planejar dois bancos (core e b2b) e uma réplica de leitura do core |
| **Documentos 03 (DFD) e 06 (C4)** | Contexto e contêineres podem ser desenhados a partir deste recorte **agora** — a T-01.4 valida, não define |
| **SPEC-07** — Tarifas | `rate_periods` fica no core, junto do cálculo de estadia. Nenhuma referência cruzada |

---

## 6. Tarefas

### T-01.1 — Decidir o recorte e a propriedade dos dados ✅

**Concluída em 14/09/2026.** Registro formal: **ADR-003** no Documento 07.

**Critérios de aceitação**
- [x] **CA-01.1.a** — Cada uma das 17 entidades tem um serviço proprietário declarado — 12 no core, 5 no b2b
- [x] **CA-01.1.b** — Alternativa escolhida registrada com justificativa e consequências — recorte por consistência transacional, variante da **C**
- [x] **CA-01.1.c** — Decisão formalizada como **ADR-003**
- [x] **CA-01.1.d** — Comportamento com serviço indisponível explícito — ver §5

---

### T-01.2 — Definir o padrão de comunicação 🟡

**DEP:** T-01.1 ✅

O protocolo foi decidido junto do recorte, porque decorre dele. Falta detalhar o contrato e os números de falha.

**Critérios de aceitação**
- [x] **CA-01.2.a** — Protocolo definido com justificativa — REST síncrono idempotente, ADR-003
- [ ] **CA-01.2.b** — Contrato das duas rotas internas do core (`criar reserva-bloco`, `cancelar reserva-bloco`) documentado no OpenAPI
- [ ] **CA-01.2.c** — *Timeout*, número de tentativas e resposta ao usuário em falha definidos
- [x] **CA-01.2.d** — Mensageria — **descartada** no ADR-003; nenhum fluxo exige consistência eventual

> A T-01.2 só tem trabalho real na T-01.6: o `analytics-service` não chama serviço nenhum. Não bloqueia a T-01.4.

---

### T-01.3 — Definir autenticação entre serviços 🔲

**DEP:** T-01.1 ✅

Hoje o JWT é validado por *middleware* local (`middlewares/auth.middleware.js`), com `tenant_id` extraído do *payload*. Com serviços separados, é preciso decidir como a identidade e o tenant se propagam.

**Critérios de aceitação**
- [ ] **CA-01.3.a** — Estratégia definida: cada serviço valida o JWT, ou existe *gateway* que valida e propaga
- [ ] **CA-01.3.b** — `tenant_id` continua sendo obrigatório e impossível de forjar em todos os serviços
- [ ] **CA-01.3.c** — Chamada serviço-a-serviço (sem usuário) tem mecanismo próprio de autenticação
- [ ] **CA-01.3.d** — Decisão registrada como **ADR-006**

> **Achado da pesquisa de 14/09 — o CA-01.3.b não é atingível com o esquema atual.** O token usa HS256 com um único `JWT_SECRET`. Distribuído a três serviços, qualquer um deles passa a poder **emitir** token válido de qualquer tenant. A candidata natural é **RS256**: o core assina com chave privada, os demais só verificam com a pública.
>
> **Achado lateral:** o `JWT_SECRET` está em texto puro em `k8s/secret.yaml`, versionado — o que contradiz o RNF-011 do Documento 02. Resolver junto, já que a T-01.3 muda a forma de distribuir o segredo.
>
> **O que já ajuda:** o Nginx já é o ponto único de entrada (`k8s/nginx.yaml`), e existe `NetworkPolicy`. Rotear `/analytics/` para outro serviço é uma entrada de `location`.

---

### T-01.4 — Extrair o `analytics-service` 🔲

**DEP:** T-01.1 ✅, T-01.3

Primeiro serviço a sair. Escolhido por ser **somente leitura** — não altera estado, então a extração não arrisca invariante nenhuma.

**Abordagem definida no ADR-003:** leitura por réplica, com credencial somente leitura. Verificado em 14/09: as 7 consultas já filtram `tenant_id` no próprio SQL e, no recorte decidido, **todas leem apenas tabelas do core** — a extração não exige reescrever consulta.

**Critérios de aceitação**
- [ ] **CA-01.4.a** — Serviço roda em processo próprio, com `package.json` e `Dockerfile` próprios
- [ ] **CA-01.4.b** — Os 7 endpoints de analytics respondem a partir do novo serviço
- [ ] **CA-01.4.c** — Deployment Kubernetes independente
- [ ] **CA-01.4.d** — Isolamento multi-tenant preservado
- [ ] **CA-01.4.e** — `tests/analytics.test.js` passa contra o novo serviço
- [ ] **CA-01.4.f** — O monólito não responde mais `/analytics`
- [ ] **CA-01.4.g** — Suíte completa continua verde
- [ ] **CA-01.4.h** — O serviço acessa o banco com usuário **sem** permissão de escrita, comprovado por teste

> **Cuidado com o teste:** `tests/analytics.test.js` semeia dados pelos endpoints do core (`registerAndLogin`, `factories`). Contra o serviço separado, a semeadura continua pelo app do core e a consulta vai ao app do analytics, no mesmo banco de teste.
>
> **Coordenação:** a suíte usa um único banco de teste com `truncateAll`. Duas suítes rodando ao mesmo tempo — de worktrees diferentes — se sabotam. Combinar antes de rodar.

---

### T-01.5 — Pipeline de CI/CD por serviço 🔲

**DEP:** T-01.4

O Termo exige: *"O processo de build e deploy **dos microsserviços** deve ser obrigatoriamente automatizado."*

**Critérios de aceitação**
- [ ] **CA-01.5.a** — Cada serviço tem *workflow* próprio, disparado só por mudança no seu diretório
- [ ] **CA-01.5.b** — *Build* da imagem e publicação em *registry* automatizados
- [ ] **CA-01.5.c** — *Deploy* automatizado para o cluster
- [ ] **CA-01.5.d** — Testes rodam por serviço, e falha bloqueia o *deploy*

> `.github/workflows` tem dono na divisão de trabalho: o Weslley. A T-01.5 entrega o que o serviço precisa, e ele integra.

---

### T-01.6 — Extrair o `b2b-service` 🔲 *(5º semestre)*

**DEP:** T-01.4 validado, T-01.2, T-01.3

Menos arriscado do que previa a versão anterior desta Spec: o fluxo de pagamento não sai do core, e restam duas operações entre serviços.

**Critérios de aceitação**
- [ ] **CA-01.6.a** — Rotas internas do core para criar e cancelar reserva-bloco, idempotentes por `contract_id`
- [ ] **CA-01.6.b** — A verificação de disponibilidade dos quartos acontece **dentro** da transação do core que cria a reserva-bloco
- [ ] **CA-01.6.c** — `tests/b2b-smoke.test.js` passa contra os dois serviços
- [ ] **CA-01.6.d** — `tests/public-booking.test.js` passa **sem alteração** — o PIX não é tocado por esta extração
- [ ] **CA-01.6.e** — Core fora do ar: assinar e cancelar respondem `503` e o contrato permanece no status anterior
- [ ] **CA-01.6.f** — Repetir uma assinatura interrompida não cria segunda reserva-bloco

---

## 7. Definition of Done da Spec

- [x] ADR-003 escrito e aprovado
- [ ] Pelo menos 2 serviços rodando separados e se comunicando de verdade
- [ ] Documentos C4 e DFD produzidos a partir da arquitetura real
- [ ] MER v1.2 com a Seção 7 fechada
- [ ] Suíte de testes verde
- [ ] Pipeline por serviço funcionando

---

## 8. Escopo mínimo para o 4º semestre

O Termo pede *"MVP funcional demonstrando a viabilidade da proposta e a **integração inicial dos microsserviços**"*.

**Mínimo aceitável:** T-01.1 até T-01.5 — decisão formalizada e `analytics-service` extraído, rodando separado e integrado.

Isso permite responder na defesa: *"por que estes serviços?"*, *"como conversam?"*, *"o que acontece se um cair?"* — com implementação real por trás, não só diagrama.

---

## 9. Riscos

| Risco | Impacto | Mitigação |
|-------|---------|-----------|
| Decompor demais e não terminar nada | Alto | Escopo mínimo bem definido (§8); `b2b-service` fica para o 5º semestre |
| Quebrar a invariante anti-*double-booking* | **Crítico** — perda de integridade | `reservations` fica inteira no `core`; a constraint nunca atravessa fronteira |
| Vazamento entre tenants na comunicação entre serviços | **Crítico** — LGPD | CA-01.3.b; teste de isolamento cobrindo o novo serviço |
| Segredo JWT simétrico compartilhado permitir forjar token | **Crítico** | T-01.3 — assinatura assimétrica (RS256) |
| Banca questionar o tamanho do core como "mini-monólito" | Médio | Resposta registrada no ADR-003: a fronteira é a unidade transacional, não o número de tabelas |
| Banca confundir réplica de leitura com banco compartilhado | Médio | ADR-003: o analytics não possui esquema, não escreve e usa credencial somente leitura; CA-01.4.h prova isso |
| Banca identificar banco compartilhado como anti-padrão | Alto | Alternativa descartada no ADR-003 |

---

## 10. Histórico

| Versão | Data | Autor | Alteração |
|--------|------|-------|-----------|
| 1.0 | 26/08/2026 | Gabriel Reis Cunha | Criação a partir do inventário de 26/08 |
| 1.1 | 14/09/2026 | Gabriel Reis Cunha | **T-01.1 concluída — ADR-003.** O recorte de 23/08 foi confrontado com o código: quatro transações atômicas e doze FKs atravessariam a fronteira, e duas consultas de analytics ficariam sem solução em SQL. Recorte refeito pela consistência transacional: pagamento, consumo, produtos e contas vão para o core; o domínio contratual vira `b2b-service`; analytics lê réplica. Corrigida a recomendação da v1.0, que preferia a alternativa A e chamava a C de artificial. T-01.2 com protocolo decidido; T-01.3 com o achado de que HS256 compartilhado não satisfaz o CA-01.3.b; T-01.6 renomeada e com critérios refeitos; impacto nas outras Specs em §5.3 |
