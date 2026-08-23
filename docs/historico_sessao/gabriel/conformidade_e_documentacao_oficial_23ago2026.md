# Relatório de Sessão — Conformidade Acadêmica e Documentação Oficial

**Desenvolvedor:** Gabriel (orquestrador / Claude Code)
**Data:** 23/08/2026
**Branch:** `develop`
**Repositórios tocados:** `sistema_gestao_hotel` · `UniFAAT-projeto-experimental-2027-1`

---

## 1. Contexto

A faculdade divulgou o **Termo de Requisitos e Aceite de Projeto Experimental**, que define os critérios obrigatórios para o projeto ser aprovado como trabalho acadêmico. A sessão foi dedicada a medir onde estamos em relação a esse termo e a começar a produzir a documentação oficial exigida.

Ponto de partida: a sessão anterior (07/08) parou no meio da verificação final da Fatia 1, com 4 commits em `develop` local nunca enviados ao remoto.

---

## 2. O que foi feito

### 2.1 Análise de conformidade com o Termo de Aceite

Auditoria de 20 critérios, com evidência levantada por leitura direta de código, configs e documentação — nenhuma conclusão por suposição.

**Resultado: 6 atendem · 4 parciais · 10 não atendem.**

Quatro críticos, interdependentes:

| Critério | Estado | Evidência |
|---|---|---|
| Arquitetura de microsserviços | ❌ | Um único backend: um `package.json`, um `Dockerfile`, um deployment K8s. O Termo diz "monólitos simples não serão aprovados" |
| Deploy em nuvem pública | ❌ | Tudo em minikube local. Nenhuma conta AWS/GCP/Azure em uso |
| Terraform | ❌ | `find . -iname "*.tf"` não retorna nada no repositório |
| Prometheus + Grafana | ❌ | Só aparece em documentos de análise; `k8s/` não tem manifest de nenhum dos dois |

Achado adicional relevante: **a integração PIX é simulada** — `app/services/pix/index.js` registra apenas `FakePixProvider`, com comentário explícito "adequado para demo/TCC". O Termo exige integração com API externa real.

Documento: `docs/ANALISE_CONFORMIDADE_ACEITE_PROJETO_EXPERIMENTAL_23ago2026.md`

### 2.2 Decisões tomadas com o time

| # | Questão | Decisão |
|---|---|---|
| 1 | Semestre atual | **4º** — foco em documentação + MVP |
| 2 | Composição da equipe | **3 integrantes**. `Lucas Kenway` no `git log` é o mesmo Weslley Lucas |
| 3 | Provedor de nuvem | **AWS** (equipe em aprendizado), sem impedir outro se necessário |
| 4 | Decomposição em microsserviços | **Aceita** — corte de 3 serviços, mas com planejamento formal antes de executar |
| 5 | API externa | **ViaCEP** primeiro (mais rápida); Mercado Pago depois |

### 2.3 Documento 04 — Modelo Entidade-Relacionamento

Antes de escrever, levantei o schema real dos *models* Sequelize e do `db/schema.sql`, em vez de confiar na documentação existente. **Foi a decisão certa: o banco tem 15 tabelas, não 8** como a documentação interna ainda afirma.

Mudanças no schema que não estavam registradas em lugar nenhum:

| Mudança | Origem |
|---|---|
| `contracts.reservation_id` | Reserva-bloco criada ao assinar contrato |
| `contract_installments.status` + `paid_at` | Baixa de parcela |
| `reservations.source` (`MANUAL`/`DIRECT`/`B2B`) | Motor de reserva direta |
| `reservations.user_id` passou a nullable | Reserva online não tem recepcionista |
| `products` | Fatia 1, com índice único **parcial** |
| `role` inclui `WAITER` | Terceiro perfil |
| `guests` tem unique em `email` além de `cpf` | — |

Documento entregue com 17 entidades (15 implementadas, 2 planejadas), dicionário de dados completo, diagramas ER em três blocos validados por script, e justificativa técnica da escolha do PostgreSQL amarrada em três recursos concretos: `EXCLUDE USING gist`, UUID como PK e índices parciais.

### 2.4 Estratégia de congelamento da documentação oficial

Discussão levantada pelo time: *sendo documentação oficial, o que dá para preencher sem ficar revisando?*

Conclusões que orientaram o resto do trabalho:

1. **Revisão é esperada, não proibida.** O template tem Histórico de Revisões e versionamento. O risco não é errar, é revisar toda semana.
2. **O documento descreve o alvo, não a foto de hoje.** O Termo entrega documentação no 4º semestre e solução completa no 5º — documentar só o existente deixaria o 5º sem alvo.
3. **13 das 15 tabelas são estáveis** porque são o domínio do negócio. Hotel tem quarto, hóspede e reserva; isso não muda.
4. **Só a Seção 7 (microsserviços) está genuinamente em aberto.**

Consequência prática: incluí `ACCOUNTS` e `ACCOUNT_ITEMS` no MER como **planejadas**, já que o desenho está fechado desde 07/08. Deixar de fora garantiria uma revisão em poucas semanas.

### 2.5 MER v1.0 — status e rastreabilidade

Acrescentado ao documento:

- **Legenda de status** por entidade: ✅ Implementado · 🔷 Planejado · ⚠️ Em transição
- **Índice de entidades** com módulo e requisitos
- **IDs rastreáveis** (`RF-xxx`, `RN-xxx`, `ADR-xxx`) para ligar o MER aos documentos 02 e 07
- **Regras de negócio numeradas** para o que não é óbvio no schema: `RN-005` (rateio da diária na conta dividida), `RN-006` (conta interna não é receita), `RN-007` (cortesia registrada mas não cobrada), `RN-008` (idempotência do lançamento offline)
- **Política de versionamento** definindo quando é preciso nova versão aprovada

Efeito colateral que vale registrar: ao documentar `ACCOUNTS`, a tabela de chaves estrangeiras que atravessam fronteira de serviço **cresceu de 3 para 5 linhas** — `accounts` referencia `reservations`, `rooms` e `guests`. Isso agrava o problema de decomposição e é insumo direto para o ADR-003.

### 2.6 SPEC de execução da documentação

Criada uma SPEC interna consolidando os oito entregáveis oficiais: 12 tarefas (`T-01`…`T-12`), 9 entregáveis (`E-00`…`E-08`) e 7 requisitos de qualidade (`RQ-01`…`RQ-07`) que funcionam como *Definition of Done*.

Documento: `docs/SPEC_DOCUMENTACAO_OFICIAL_23ago2026.md`

**Caminho crítico identificado: `T-10` — Plano de Decomposição em Microsserviços.** Trava quatro entregáveis oficiais (C4, DFD, Sprints, ADR-003) mais a v1.1 do MER.

### 2.7 Documento 01 — Solicitação do Sistema

Escrito a partir de `docs/ANALISE_PRODUTO_DIFERENCIAIS.md` e do README do grupo.

Decisões de conteúdo:

- **Escopo marcado com [x] implementado / [ ] planejado**, mesma convenção do MER — evita afirmar como pronto o que ainda será construído
- **Seção 3.3 mapeia cada exigência do Termo ao domínio**, antecipando a pergunta "microsserviços aqui não é *over-engineering*?"
- **Escopo negativo com 8 itens**, cada um com a razão da exclusão: estoque, *channel manager*, NFS-e, app nativo, governança, precificação dinâmica, WhatsApp e CRM

Ambos os documentos validados por script contra RQ-01 (resíduo de *template*) e RQ-06 (histórico de revisões).

---

## 3. Estado dos entregáveis

| Fase | Entregáveis | Status |
|---|---|---|
| **A** — Fundação | E-00 README · E-04 MER · E-01 Solicitação | ✅ Completa |
| **B** — Requisitos e ADRs | E-02 RF/RNF · ADR-001/002/005 | 🔲 Pendente |
| **C** — Arquitetura | E-06 C4 · E-03 DFD · E-08 Sprints · ADR-003/004/006 · MER v1.1 | ⛔ Travada por T-10 |
| **D** — Nuvem | E-05 Arquitetura em Nuvem | 🔲 5º semestre |

**A Fase A completa libera o primeiro encontro com o orientador** — três documentos como evidência.

---

## 4. Verificações realizadas

| Verificação | Resultado |
|---|---|
| Schema real levantado de `app/Models/` e `db/schema.sql` | 15 tabelas confirmadas |
| Diagramas Mermaid validados por script | 3 blocos, 27 relacionamentos, nenhuma entidade órfã |
| Documentos oficiais contra RQ-01 e RQ-06 | Limpos |
| Busca por Terraform | Nenhum arquivo `.tf` |
| Busca por Prometheus/Grafana em manifests | Nenhuma ocorrência |
| Autores no histórico git | 3 pessoas (após consolidar apelidos) |

**Não verificado nesta sessão:** cobertura real de testes. O cluster minikube estava parado (máquina reiniciada desde 07/08) e subir todo o ambiente apenas para ler um número não era o foco. O `vitest.config.js` define portão de 60% para *statements*/*lines*/*functions* e **55% para *branches* — abaixo do mínimo exigido pelo Termo**. Precisa ser ajustado e reverificado antes de qualquer entrega formal.

---

## 5. Pendências para a próxima sessão

### Bloqueantes

1. **T-10 — Plano de Decomposição em Microsserviços.** Caminho crítico. Precisa definir: fronteira de cada serviço, propriedade dos dados, decisão sobre as 5 FKs que atravessam fronteira, padrão de comunicação, autenticação entre serviços e **escopo mínimo executável para o MVP deste semestre**.

   O Termo exige "integração inicial dos microsserviços" no 4º semestre. Não é necessário o *split* completo, mas é necessário que ao menos dois serviços rodem separados e se comuniquem de verdade. Candidato natural: extrair o `analytics-service`, por ser somente leitura.

### Não bloqueantes

2. **T-04 — Requisitos RF/RNF.** IDs `RF-001` a `RF-030` já ancorados no MER; é extrair dos endpoints e formalizar.
3. **T-05 — ADR-001, 002 e 005.** Decisões já tomadas; a de banco pode reaproveitar a justificativa do MER §2.
4. **Ajustar `branches` para 60%** no `vitest.config.js` e rodar a suíte para confirmar a cobertura real.
5. **Integração ViaCEP** — decidida como primeira API externa, ainda não implementada.
6. **`docker-compose.yml`** — exigido pelo Termo como contingência da defesa. Não existe hoje; o projeto migrou totalmente para K8s.

### Registradas de sessões anteriores

7. `RoomCategoryModel` tem o mesmo defeito `paranoid` + unique total corrigido em `products`.
8. Ressalva **R4** do `qa-redteam`: banco que já tem a tabela `products` não recebe o índice parcial, e ambos os comandos reportam sucesso.
9. Frontend: Swagger sem schema de resposta em **79%** dos endpoints 2xx, o que força casts no cliente tipado.
10. Least privilege do `WAITER` incompleto — bloqueia a Fase 2 do frontend.

---

## 6. Arquivos entregues

**`sistema_gestao_hotel`**
```
docs/ANALISE_CONFORMIDADE_ACEITE_PROJETO_EXPERIMENTAL_23ago2026.md
docs/SPEC_DOCUMENTACAO_OFICIAL_23ago2026.md
docs/historico_sessao/gabriel/conformidade_e_documentacao_oficial_23ago2026.md
```

**`UniFAAT-projeto-experimental-2027-1`**
```
gesway/README.md
gesway/01-solicitacao-do-sistema.md
gesway/04-modelo-entidade-relacionamento.md
```

Também enviados nesta sessão os **4 commits da Fatia 1** (catálogo de produtos) que estavam retidos em `develop` local desde 07/08.
