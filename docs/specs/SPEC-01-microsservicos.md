# SPEC-01 — Arquitetura de Microsserviços

**Prioridade:** 🔴 Crítica — condição de aprovação do projeto
**Estado:** 🔲 Não iniciado
**Criado em:** 26/08/2026
**Bloqueia:** SPEC-02 · documentos C4, DFD e ADR-003 · MER v1.1

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
- *Saga pattern* / transações distribuídas — evitar mantendo invariantes transacionais dentro de uma única fronteira
- Mensageria assíncrona, **caso** a decisão de T-01.4 seja comunicação síncrona

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

## 5. Recorte proposto

Proposta aprovada pela equipe em 23/08: **3 serviços**.

| Serviço | Entidades | Justificativa |
|---------|-----------|---------------|
| **core-service** | tenants, users, room_categories, rooms, guests, reservations, reservation_rooms | Núcleo transacional. Concentra as invariantes rígidas que exigem ACID numa única fronteira |
| **billing-service** | payments, products, accounts 🔷, account_items 🔷, corporate_clients, event_quotes, quote_services, contracts, contract_installments | Domínio financeiro e contratual. Isola o risco de indisponibilidade do provedor de pagamento externo |
| **analytics-service** | *(sem entidades próprias)* | Somente leitura. Não compete por recursos com a carga transacional |

---

## 6. Problema central a resolver

**Cinco chaves estrangeiras atravessam a fronteira proposta:**

| Origem (billing) | Destino (core) | Criticidade |
|---|---|---|
| `payments.reservation_id` | `reservations` | Alta — fluxo de pagamento |
| `contracts.reservation_id` | `reservations` | Média — reserva-bloco do evento |
| `accounts.reservation_id` 🔷 | `reservations` | Alta — conta da estadia |
| `accounts.room_id` 🔷 | `rooms` | Média |
| `accounts.guest_id` 🔷 | `guests` | Média |

Com bancos separados, o SGBD deixa de garantir essas referências. **A decisão sobre isso é o núcleo desta Spec** — tudo o mais decorre dela.

### Alternativas em avaliação

| # | Abordagem | Prós | Contras |
|---|-----------|------|---------|
| **A** | Manter só o identificador, validar por chamada de API na escrita | Simples; fronteira limpa | Acoplamento em tempo de execução; `core` fora do ar bloqueia `billing` |
| **B** | Replicar subconjunto da reserva no `billing` via eventos | Desacoplamento real; resiliente | Consistência eventual; exige mensageria; mais peças |
| **C** | Mover `payments` e o módulo de contas para o `core` | Elimina 4 das 5 FKs; `billing` fica só com B2B | `billing` perde relevância; fronteira fica artificial |
| **D** | Banco compartilhado, serviços separados | Zero problema de FK | **Anti-padrão** — a banca vai questionar; não é microsserviço de verdade |

---

## 7. Tarefas

### T-01.1 — Decidir o recorte e a propriedade dos dados 🔲

**Critérios de aceitação**
- [ ] **CA-01.1.a** — Cada uma das 17 entidades tem um serviço proprietário declarado
- [ ] **CA-01.1.b** — A alternativa escolhida (A, B, C ou D) para as FKs entre fronteira está registrada com justificativa e consequências
- [ ] **CA-01.1.c** — A decisão está formalizada como **ADR-003**
- [ ] **CA-01.1.d** — Fica explícito o que acontece quando um serviço está indisponível

> **Recomendação técnica:** a alternativa **A** é a de melhor relação custo/benefício para o prazo. **B** é arquiteturalmente superior e rende mais na defesa, mas exige mensageria e consistência eventual — escopo que a equipe de 3 pode não absorver. **D** deve ser descartada: a banca reconhece banco compartilhado como anti-padrão e o Termo pede microsserviços de verdade.

---

### T-01.2 — Definir o padrão de comunicação 🔲

**DEP:** T-01.1

**Critérios de aceitação**
- [ ] **CA-01.2.a** — Protocolo definido (REST síncrono, eventos, ou híbrido) com justificativa
- [ ] **CA-01.2.b** — Contrato de cada chamada entre serviços documentado no OpenAPI
- [ ] **CA-01.2.c** — Comportamento em falha definido: *timeout*, tentativa, degradação
- [ ] **CA-01.2.d** — Se houver mensageria, a tecnologia está escolhida e justificada (o README do grupo declara "a definir")

---

### T-01.3 — Definir autenticação entre serviços 🔲

**DEP:** T-01.1

Hoje o JWT é validado por *middleware* local (`middlewares/auth.middleware.js`), com `tenant_id` extraído do *payload*. Com serviços separados, é preciso decidir como a identidade e o tenant se propagam.

**Critérios de aceitação**
- [ ] **CA-01.3.a** — Estratégia definida: cada serviço valida o JWT, ou existe *gateway* que valida e propaga
- [ ] **CA-01.3.b** — `tenant_id` continua sendo obrigatório e impossível de forjar em todos os serviços
- [ ] **CA-01.3.c** — Chamada serviço-a-serviço (sem usuário) tem mecanismo próprio de autenticação

---

### T-01.4 — Extrair o `analytics-service` 🔲

**DEP:** T-01.1, T-01.2, T-01.3

Primeiro serviço a sair. Escolhido por ser **somente leitura** — não altera estado, então a extração não arrisca invariante nenhuma.

**Critérios de aceitação**
- [ ] **CA-01.4.a** — Serviço roda em processo próprio, com `package.json` e `Dockerfile` próprios
- [ ] **CA-01.4.b** — Os 7 endpoints de analytics respondem a partir do novo serviço
- [ ] **CA-01.4.c** — Deployment Kubernetes independente
- [ ] **CA-01.4.d** — Isolamento multi-tenant preservado
- [ ] **CA-01.4.e** — `tests/analytics.test.js` passa contra o novo serviço
- [ ] **CA-01.4.f** — O monólito não responde mais `/analytics`
- [ ] **CA-01.4.g** — Suíte completa continua verde

---

### T-01.5 — Pipeline de CI/CD por serviço 🔲

**DEP:** T-01.4

O Termo exige: *"O processo de build e deploy **dos microsserviços** deve ser obrigatoriamente automatizado."*

**Critérios de aceitação**
- [ ] **CA-01.5.a** — Cada serviço tem *workflow* próprio, disparado só por mudança no seu diretório
- [ ] **CA-01.5.b** — *Build* da imagem e publicação em *registry* automatizados
- [ ] **CA-01.5.c** — *Deploy* automatizado para o cluster
- [ ] **CA-01.5.d** — Testes rodam por serviço, e falha bloqueia o *deploy*

---

### T-01.6 — Extrair o `billing-service` 🔲 *(5º semestre)*

**DEP:** T-01.4 validado

Mais arriscado que o analytics: altera estado e concentra as FKs entre fronteira.

**Critérios de aceitação**
- [ ] **CA-01.6.a** — Decisão de T-01.1 aplicada às 5 FKs
- [ ] **CA-01.6.b** — Fluxo de pagamento PIX íntegro ponta a ponta
- [ ] **CA-01.6.c** — `tests/b2b-smoke.test.js` e `tests/public-booking.test.js` passam
- [ ] **CA-01.6.d** — Falha do `core` não corrompe dado financeiro no `billing`

---

## 8. Definition of Done da Spec

- [ ] ADR-003 escrito e aprovado
- [ ] Pelo menos 2 serviços rodando separados e se comunicando de verdade
- [ ] Documentos C4 e DFD produzidos a partir da arquitetura real
- [ ] MER v1.1 com a Seção 7 fechada
- [ ] Suíte de testes verde
- [ ] Pipeline por serviço funcionando

---

## 9. Escopo mínimo para o 4º semestre

O Termo pede *"MVP funcional demonstrando a viabilidade da proposta e a **integração inicial dos microsserviços**"*.

**Mínimo aceitável:** T-01.1 até T-01.5 — decisão formalizada e `analytics-service` extraído, rodando separado e integrado.

Isso permite responder na defesa: *"por que estes serviços?"*, *"como conversam?"*, *"o que acontece se um cair?"* — com implementação real por trás, não só diagrama.

---

## 10. Riscos

| Risco | Impacto | Mitigação |
|-------|---------|-----------|
| Decompor demais e não terminar nada | Alto | Escopo mínimo bem definido (§9); `billing` fica para o 5º semestre |
| Quebrar a invariante anti-*double-booking* | **Crítico** — perda de integridade | `reservations` fica inteira no `core`; a constraint nunca atravessa fronteira |
| Vazamento entre tenants na comunicação entre serviços | **Crítico** — LGPD | CA-01.3.b; teste de isolamento cobrindo chamada serviço-a-serviço |
| Escolher mensageria e não conseguir operar | Médio | Preferir síncrono (alternativa A) salvo decisão explícita em contrário |
| Banca identificar banco compartilhado como anti-padrão | Alto | Descartar a alternativa D |

---

## 11. Histórico

| Versão | Data | Autor | Alteração |
|--------|------|-------|-----------|
| 1.0 | 26/08/2026 | Gabriel Reis Cunha | Criação a partir do inventário de 26/08 |
