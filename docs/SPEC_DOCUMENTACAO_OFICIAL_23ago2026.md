# SPEC — Documentação Oficial do Projeto Experimental

**Projeto:** Gesway — Sistema de Gestão Hoteleira (PMS SaaS)
**Data:** 23/08/2026
**Equipe:** Gabriel Reis Cunha (6325149) · Sirlande Martins (6325269) · Weslley Lucas (6325226)
**Semestre:** 4º — entrega de documentação técnica + MVP
**Repositório dos documentos:** `UniFAAT-projeto-experimental-2027-1/gesway/`

---

## 1. Objetivo desta SPEC

Consolidar o plano de execução dos entregáveis de documentação exigidos pelo Termo de Aceite, definindo para cada um: dependências, critérios de conclusão e responsável.

Esta SPEC **não é** um dos documentos oficiais — é o instrumento interno de controle que garante que os oito documentos sejam produzidos na ordem correta, sem retrabalho.

---

## 2. Convenções de Identificação

| Prefixo | Significado |
|---------|-------------|
| `E-xx` | **Entregável** — um dos oito documentos oficiais |
| `T-xx` | **Tarefa** de execução |
| `RQ-xx` | **Requisito desta SPEC** — condição que a entrega precisa satisfazer |
| `DEP` | Dependência bloqueante |

**Estados:** 🔲 Não iniciado · 🟡 Em andamento · ✅ Concluído · ⛔ Bloqueado

---

## 3. Requisitos da Entrega

Condições que todo entregável desta SPEC deve satisfazer. Servem de *Definition of Done*.

| ID | Requisito | Verificação |
|----|-----------|-------------|
| **RQ-01** | Nenhum documento contém texto de *template* não preenchido (`[Nome do Projeto]`, `___`, exemplos genéricos) | Busca textual por marcadores de template |
| **RQ-02** | Toda afirmação técnica é verificável no repositório de código | Revisão cruzada com `app/`, `db/`, `k8s/` |
| **RQ-03** | Entidades, requisitos e decisões possuem identificadores rastreáveis entre documentos | `RF-xxx`, `RN-xxx`, `ADR-xxx` referenciados de forma consistente |
| **RQ-04** | Todo conteúdo que descreve estado futuro está explicitamente marcado como planejado | Legenda de status presente e aplicada |
| **RQ-05** | Diagramas renderizam sem erro de sintaxe | Validação automatizada dos blocos Mermaid |
| **RQ-06** | Cada documento tem política de versionamento e histórico de revisões preenchido | Seções finais completas |
| **RQ-07** | Documentos não se contradizem entre si | Revisão de consistência ao fim de cada fase |

---

## 4. Mapa de Entregáveis

| ID | Documento | Status | Bloqueado por | Fase |
|----|-----------|--------|---------------|------|
| **E-00** | README do grupo | ✅ Concluído | — | A |
| **E-04** | Modelo Entidade-Relacionamento | ✅ Concluído (v1.0) | — | A |
| **E-01** | Solicitação do Sistema | ✅ Concluído (v1.0) | — | A |
| **E-02** | Requisitos Funcionais e Não Funcionais | 🔲 | E-04 (âncora de rastreabilidade) | B |
| **E-07** | Registro de Decisões Arquitetônicas (ADR) | 🔲 parcial | ADR-003 depende de T-10 | B / C |
| **E-06** | C4 Model | 🔲 | **T-10** (plano de decomposição) | C |
| **E-03** | Diagrama de Fluxo de Dados | 🔲 | **T-10** · E-06 | C |
| **E-08** | Planejamento de Sprints e Tarefas | 🔲 | E-02 · T-10 | C |
| **E-05** | Arquitetura em Nuvem | 🔲 | **T-10** · decisão de infraestrutura (5º sem.) | D |

---

## 5. FASE A — Fundação documental *(sem dependências)*

> **Objetivo:** ter material suficiente para marcar o primeiro encontro com o orientador.

### T-01 — README do grupo ✅

**Entregável:** E-00
**Concluído em:** 23/08/2026

- [x] Nome do projeto definido: **Gesway**
- [x] Integrantes com RA
- [x] Descrição com problema, público-alvo e diferenciais técnicos
- [x] Stack tecnológica declarada

---

### T-02 — Modelo Entidade-Relacionamento ✅

**Entregável:** E-04
**Concluído em:** 23/08/2026

- [x] Justificativa técnica da escolha do banco (RQ-02)
- [x] 17 entidades documentadas: 15 implementadas + 2 planejadas
- [x] Diagramas ER em três blocos, validados (RQ-05)
- [x] Dicionário de dados completo por entidade
- [x] Regras de negócio no nível de banco identificadas (`RN-003` anti-*double-booking*, `RN-005` a `RN-008`)
- [x] Índices justificados
- [x] Legenda de status aplicada (RQ-04)
- [x] Política de versionamento definida (RQ-06)
- [ ] Seção 7 (microsserviços) — **preliminar**, fecha na v1.1 com T-10

**Observação de escopo:** o modelo foi extraído por leitura direta de `app/Models/` e `db/schema.sql`, não de documentação anterior — que estava desatualizada (descrevia 8 tabelas).

---

### T-03 — Documento de Solicitação do Sistema ✅

**Entregável:** E-01
**Concluído em:** 23/08/2026
**Fonte de matéria-prima:** `docs/ANALISE_PRODUTO_DIFERENCIAIS.md`, `docs/PRODUCT_ROADMAP.md`, README do grupo

**Critérios de conclusão:**

- [x] Visão geral do sistema e público-alvo
- [x] Problema identificado, com impacto operacional e financeiro descrito de forma concreta
- [x] Justificativa incluindo análise da lacuna de mercado (dois grupos de concorrentes e a interseção que o produto ocupa)
- [x] Tabela de valor agregado com benefícios tangíveis
- [x] Escopo explícito — o que **está** e o que **não está** incluído
- [x] Stakeholders identificados (6 papéis, incluindo os três perfis de usuário final)
- [x] Premissas e restrições (conta AWS, prazo, equipe de 3, *sandbox* de pagamento, cobertura de 60%)
- [x] Integrantes com papéis principais atribuídos
- [x] Seção 3.3 mapeando cada exigência do Termo ao que o domínio justifica naturalmente
- [x] Validado contra RQ-01 e RQ-06 por verificação automatizada

**Decisão de conteúdo:** o escopo funcional foi marcado com **[x] implementado** e **[ ] planejado**, seguindo a mesma convenção do MER (RQ-04). Isso evita que o documento afirme como pronto algo que ainda será construído.

**Escopo negativo declarado:** controle de estoque · *channel manager* · NFS-e · aplicativo nativo · governança/camareira · precificação dinâmica · WhatsApp · CRM de marketing. Cada item com a razão da exclusão.

---

## 6. FASE B — Requisitos e decisões consolidadas

### T-04 — Documento de Requisitos (RF/RNF) 🔲

**Entregável:** E-02
**Dependências:** E-04 (a tabela de rastreabilidade do MER define os IDs `RF-001` a `RF-030`)

**Critérios de conclusão:**

- [ ] Requisitos funcionais extraídos dos endpoints implementados — o código é a fonte da verdade
- [ ] Cada RF com critério de aceite verificável
- [ ] Cada RF com prioridade (Alta/Média/Baixa) e módulo/microsserviço associado
- [ ] RNF cobrindo as seis categorias do template
- [ ] RNF alinhados às exigências do Termo: cobertura ≥ 60%, Terraform, Prometheus/Grafana, CI/CD
- [ ] Matriz de rastreabilidade RF ↔ RNF preenchida
- [ ] Glossário do domínio hoteleiro (ADR, RevPAR, *day-use*, *rack*, PMS)
- [ ] IDs consistentes com os declarados no MER (RQ-03)

**Ponto de atenção:** o template exige que cada RF indique o microsserviço responsável. Enquanto T-10 não estiver pronto, usar os nomes propostos (`core-service`, `billing-service`, `analytics-service`) e marcar como preliminar.

---

### T-05 — ADRs independentes de arquitetura 🔲

**Entregável:** E-07 *(parcial)*
**Dependências:** nenhuma para estes três

Decisões já tomadas, fundamentadas e com consequências conhecidas:

- [ ] **ADR-001** — Linguagem e framework do backend (Node.js 24 + Express + ESM)
- [ ] **ADR-002** — Escolha do banco de dados (PostgreSQL 17) — reaproveitar a justificativa já escrita no MER §2
- [ ] **ADR-005** — Containerização e orquestração (Docker + Kubernetes)

**Formato obrigatório por ADR:** Contexto · Decisão · Alternativas consideradas · Consequências (positivas e negativas).

**Ponto de atenção:** ADR sem "alternativas consideradas" honestas é o erro mais comum. Cada ADR deve registrar o que foi descartado e por quê — inclusive as consequências negativas da escolha feita.

---

## 7. FASE C — Arquitetura *(bloqueada por T-10)*

### T-10 — Plano de Decomposição em Microsserviços ⛔ **CAMINHO CRÍTICO**

**Entregável:** documento técnico interno (não é um dos oito)
**Bloqueia:** E-06, E-03, E-08, ADR-003, ADR-004, MER v1.1

**Por que é o gargalo:** quatro entregáveis oficiais dependem de saber quais serviços existem, onde cada dado mora e como os serviços conversam.

**Critérios de conclusão:**

- [ ] Fronteira de cada serviço definida — quais entidades e endpoints pertencem a cada um
- [ ] Propriedade dos dados resolvida (*database per service* ou schema compartilhado)
- [ ] **Decisão sobre as FKs que atravessam fronteira** — `payments.reservation_id`, `contracts.reservation_id`, `accounts.reservation_id`, `accounts.room_id`, `accounts.guest_id`
- [ ] Padrão de comunicação definido (síncrono REST, assíncrono por eventos, ou híbrido)
- [ ] Estratégia de autenticação entre serviços — hoje o JWT é validado por *middleware* local
- [ ] Estratégia de migração: ordem de extração, o que sai primeiro
- [ ] Escopo do MVP do 4º semestre: **quais serviços precisam existir já**

**Restrição de escopo do 4º semestre:** o Termo exige "integração inicial dos microsserviços" no MVP deste semestre. Não é necessário o *split* completo — mas é necessário que **pelo menos dois serviços rodem separados e se comuniquem de verdade**. Candidato natural: extrair o `analytics-service`, por ser somente leitura e ter a menor superfície de risco.

---

### T-06 — C4 Model 🔲

**Entregável:** E-06 · **DEP:** T-10

- [ ] **Nível 1 — Contexto:** sistema, atores (recepcionista, garçom, gerente, hóspede) e sistemas externos (PSP de pagamento, ViaCEP)
- [ ] **Nível 2 — Contêineres:** os serviços definidos em T-10, frontend, bancos, MinIO, Redis
- [ ] **Nível 3 — Componentes:** detalhar ao menos dois serviços. Reaproveitar `docs/back/arquitetura_backend.md`
- [ ] Tecnologias declaradas por contêiner
- [ ] Diagramas validados (RQ-05)

---

### T-07 — Diagrama de Fluxo de Dados 🔲

**Entregável:** E-03 · **DEP:** T-10, E-06

- [ ] DFD Nível 0 (contexto) — fronteiras do sistema e entidades externas
- [ ] DFD Nível 1 — processos principais e armazenamentos
- [ ] DFD Nível 2 — detalhamento de um processo crítico (sugestão: **check-out com fechamento de conta**, por atravessar reserva, consumo e pagamento)
- [ ] Dicionário de fluxos e de armazenamentos

---

### T-08 — ADRs dependentes de arquitetura 🔲

**Entregável:** E-07 *(complemento)* · **DEP:** T-10

- [ ] **ADR-003** — Estratégia de comunicação entre microsserviços, incluindo a decisão sobre FKs entre fronteiras
- [ ] **ADR-004** — Provedor de nuvem e serviços (AWS)
- [ ] **ADR-006** — Estratégia do módulo de consumo: por que `Account` absorve `Consumption`
- [ ] Índice de ADRs consolidado

---

### T-09 — Planejamento de Sprints 🔲

**Entregável:** E-08 · **DEP:** E-02, T-10

- [ ] Papéis formais da equipe (Arquitetura, DevOps, Backend, Frontend, QA) distribuídos entre os três integrantes
- [ ] *Roadmap* por semestre alinhado ao Termo
- [ ] *Product backlog* priorizado, derivado dos RF do E-02
- [ ] Sprints detalhadas com tarefa → responsável → sprint de entrega
- [ ] *Definition of Done* global
- [ ] Riscos e mitigações

**Ponto de atenção:** o Termo exige distribuição equilibrada de papéis. Com três integrantes, cada um acumula funções — isso deve estar explícito, não implícito.

---

### T-11 — MER v1.1 🔲

**Entregável:** E-04 *(revisão)* · **DEP:** T-10

- [ ] Seção 7 consolidada com o recorte final de serviços
- [ ] Decisão sobre FKs entre fronteiras refletida
- [ ] Histórico de revisões atualizado

---

## 8. FASE D — Infraestrutura *(entrega do 5º semestre)*

### T-12 — Arquitetura em Nuvem 🔲

**Entregável:** E-05 · **DEP:** T-10, decisão de infraestrutura

Formalmente exigido no 5º semestre. Pode ser esboçado antes, com AWS como alvo, sem provisionar recursos.

- [ ] Visão geral da arquitetura na AWS
- [ ] Inventário de recursos (computação, banco, rede, armazenamento, monitoramento, CI/CD)
- [ ] Estratégia de rede e segurança
- [ ] Estrutura dos módulos Terraform e *state management*
- [ ] Estimativa de custos

---

## 9. Ordem de Execução

```
FASE A  ─── T-01 ✅ README
        ├── T-02 ✅ MER v1.0
        └── T-03 ✅ Solicitação do Sistema
                    │
                    └──►  ✅ FASE A COMPLETA
                          PRIMEIRO ENCONTRO COM O ORIENTADOR LIBERADO
                          (3 documentos completos como evidência)

FASE B  ─── T-04 🔲 Requisitos RF/RNF        (dep: MER)
        └── T-05 🔲 ADR-001, 002, 005        (sem dependência)

        ╔══════════════════════════════════════════════╗
        ║  T-10 ⛔ PLANO DE DECOMPOSIÇÃO               ║
        ║  gargalo de 4 entregáveis oficiais           ║
        ╚══════════════════════════════════════════════╝
                    │
FASE C  ────────────┼── T-06 🔲 C4 Model
                    ├── T-07 🔲 DFD
                    ├── T-08 🔲 ADR-003, 004, 006
                    ├── T-09 🔲 Sprints          (dep também de E-02)
                    └── T-11 🔲 MER v1.1

FASE D  ─── T-12 🔲 Arquitetura em Nuvem      (5º semestre)
```

---

## 10. Riscos

| Risco | Impacto | Mitigação |
|-------|---------|-----------|
| T-10 atrasa e trava quatro entregáveis | Alto | Fases A e B não dependem dele — executar em paralelo. T-10 é a próxima prioridade após T-03 |
| Documentar arquitetura de microsserviços sem implementar nada | **Reprovação** — o Termo exige integração inicial no MVP do 4º semestre | Definir em T-10 um escopo mínimo executável e implementá-lo neste semestre |
| Divergência entre documentos | Médio | RQ-03 (IDs rastreáveis) e RQ-07 (revisão de consistência por fase) |
| Documentos envelhecerem com a evolução do código | Médio | Política de versionamento por documento (RQ-06) e marcação de status (RQ-04) |
| Equipe de 3 pessoas para escopo de 5 | Médio | Priorização explícita; escopo negativo declarado em E-01 |

---

## 11. Evidências para o Encontro com o Orientador

O template `ficha-registro-encontro.md` solicita links de commits e *pull requests* como comprovação de evolução.

**Pendência identificada:** o repositório de código possui **4 commits locais não enviados** ao remoto (módulo de catálogo de produtos, mergeado em `develop` mas nunca publicado). Precisam ser enviados antes do encontro para constituir evidência verificável.

**Artefatos verificáveis disponíveis hoje:**

- [x] Documentação técnica — README, MER (E-00, E-04)
- [x] Esteira de CI/CD funcional em GitHub Actions
- [x] Testes automatizados com portão de cobertura
- [ ] Commits publicados no remoto ← **pendente**
- [ ] Novas funcionalidades acessíveis no sistema ← depende de subir o ambiente

---

## 12. Histórico

| Versão | Data | Autor | Alteração |
|--------|------|-------|-----------|
| 1.0 | 23/08/2026 | Gabriel Reis Cunha | Versão inicial. Consolida o plano dos oito entregáveis após conclusão de E-00 e E-04 |
