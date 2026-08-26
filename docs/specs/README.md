# Specs — Índice Mestre

**Criado em:** 26/08/2026
**Metodologia:** SDD (Spec-Driven Development) · Fluxo RPI
**Base do inventário:** `develop` @ `a28cefd`

---

## 1. Para que serve este diretório

Cada Spec descreve **uma frente de trabalho não concluída**, com objetivo, escopo, restrições, tarefas e critérios de aceitação. A Spec é a **fonte autoritativa**: se a realidade divergir, atualiza-se a Spec — não se ignora.

Substituem as pendências espalhadas em relatórios de sessão, que não eram executáveis.

---

## 2. Convenções

| Elemento | Formato | Significado |
|----------|---------|-------------|
| Spec | `SPEC-xx` | Uma frente de trabalho |
| Tarefa | `T-xx.y` | Unidade executável dentro de uma Spec |
| Requisito de aceitação | `CA-xx.y` | Condição verificável de conclusão |
| Estado | 🔲 · 🟡 · ✅ · ⛔ | Não iniciado · Em andamento · Concluído · Bloqueado |

**Regra de granularidade:** toda tarefa deve caber em ≤ 3 dias e ser mergeável isoladamente. Tarefa maior que isso é fatiada.

---

## 3. Mapa das Specs

| Spec | Frente | Prioridade | Estado | Bloqueia |
|------|--------|-----------|--------|----------|
| [SPEC-01](SPEC-01-microsservicos.md) | Arquitetura de Microsserviços | 🔴 **Crítica** | 🔲 | SPEC-02, docs C4/DFD/ADR-003, MER v1.1 |
| [SPEC-02](SPEC-02-cloud-iac-observabilidade.md) | Cloud, IaC e Observabilidade | 🔴 **Crítica** | 🔲 | Defesa do 5º semestre |
| [SPEC-03](SPEC-03-integracoes-externas.md) | Integrações com APIs Externas | 🔴 **Crítica** | 🔲 | — |
| [SPEC-04](SPEC-04-modulo-consumo.md) | Módulo de Consumo (Comanda) | 🟠 Alta | 🔲 | Frontend Fase 2 |
| [SPEC-05](SPEC-05-frontend-pms.md) | Frontend — app-pms | 🟠 Alta | 🟡 Parcial | Demonstração da defesa |
| [SPEC-06](SPEC-06-qualidade-divida-tecnica.md) | Qualidade e Dívida Técnica | 🟡 Média | 🔲 | Portão de cobertura do CI |
| [SPEC_DOC](../SPEC_DOCUMENTACAO_OFICIAL_23ago2026.md) | Documentação Acadêmica | 🟠 Alta | 🟡 Fase A completa | — |

---

## 4. Por que estas prioridades

As três 🔴 críticas não são escolha de produto — são **condição de aprovação**. O Termo de Aceite usa linguagem sem margem: *"Monólitos simples não serão aprovados"*, *"NÃO será aceito o uso exclusivo de plataformas BaaS/PaaS"*, *"deve consumir e integrar-se com pelo menos uma API externa"*.

SPEC-04 e SPEC-05 entregam **produto**, não conformidade. São o que a banca vê funcionando na demonstração.

SPEC-06 é dívida acumulada que, se ignorada, quebra o CI ou aparece como falha na defesa.

---

## 5. Grafo de dependências

```
SPEC-03 (integrações)      ──────────────► independente, pode começar já
        │
SPEC-06 (qualidade)        ──────────────► independente, pode começar já
        │
SPEC-01 (microsserviços)  ═══► GARGALO
        │
        ├──► SPEC-02 (cloud/IaC/observabilidade)
        ├──► docs 06 (C4), 03 (DFD), 07 (ADR-003)
        └──► MER v1.1
        │
SPEC-04 (consumo backend) ──┐
                            ├──► SPEC-05 Fase 2 (comanda no frontend)
                            │
SPEC-05 (frontend) ─────────┘
```

**Leitura prática:** SPEC-03 e SPEC-06 não dependem de nada e destravam critérios do Termo rapidamente. SPEC-01 é o gargalo real e deve começar em paralelo, não depois.

---

## 6. Estado de conformidade com o Termo de Aceite

Revalidado em 26/08/2026 (análise original de 23/08):

| | Quantidade | Mudança desde 23/08 |
|---|---|---|
| ✅ Atende | **7** | +1 — Documento de Solicitação do Sistema concluído |
| ⚠️ Parcial | **4** | sem mudança |
| ❌ Não atende | **9** | −1 |

Detalhamento em `docs/ANALISE_CONFORMIDADE_ACEITE_PROJETO_EXPERIMENTAL_23ago2026.md`.

**Nada mudou no plano técnico** nesses três dias: Terraform continua ausente, Prometheus/Grafana não existem em manifest algum, a integração PIX segue simulada e o backend segue monolítico. O avanço foi documental.

---

## 7. Rastreabilidade

Cada Spec declara quais critérios do Termo de Aceite ela fecha:

| Critério do Termo | Spec responsável |
|-------------------|------------------|
| Arquitetura de microsserviços | SPEC-01 |
| Integração com API externa | SPEC-03 |
| Deploy em nuvem pública | SPEC-02 |
| Infraestrutura como Código (Terraform) | SPEC-02 |
| CI/CD com deploy automatizado | SPEC-01 (por serviço) + SPEC-02 |
| Cobertura de testes ≥ 60% | SPEC-06 |
| Monitoramento (Prometheus + Grafana) | SPEC-02 |
| Docker Compose para contingência | SPEC-06 |
| Documentação técnica (8 documentos) | SPEC_DOC |

---

## 8. Histórico

| Versão | Data | Autor | Alteração |
|--------|------|-------|-----------|
| 1.0 | 26/08/2026 | Gabriel Reis Cunha | Criação. Inventário levantado por leitura direta do código |
