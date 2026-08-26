# Análise de Conformidade — Termo de Aceite de Projeto Experimental (UniFAAT)

**Data:** 23/08/2026
**Documento de referência:** `UniFAAT-projeto-experimental-2027-1/aceite-projeto-experimental.md`
**Base do código analisada:** `develop` @ `1ee43ca` (local, não enviado ao remoto)
**Método:** leitura direta do código, configs e documentação — nenhuma conclusão por suposição

---

## 0. Resumo executivo

| # | Critério (documento oficial) | Status | Gravidade |
|---|---|---|---|
| 1 | Equipe entre 2 e 5 integrantes | ✅ Atende | — |
| 2 | Papéis distribuídos e documentados | ⚠️ Parcial | Baixa |
| 3 | **Arquitetura de microsserviços** | ❌ Não atende | 🔴 Crítica |
| 4 | Integração com API externa real | ❌ Não atende | 🔴 Crítica |
| 5 | Escolha de banco justificada | ✅ Atende | — |
| 6 | **Deploy em nuvem pública (AWS/GCP/Azure)** | ❌ Não atende | 🔴 Crítica |
| 7 | Não usar BaaS/PaaS como backend principal | ✅ Atende (por padrão, ainda sem nuvem) | — |
| 8 | **Infraestrutura como Código via Terraform** | ❌ Não atende | 🔴 Crítica |
| 9 | CI/CD com build **e deploy** automatizados | ⚠️ Parcial (só CI) | Alta |
| 10 | Testes automatizados, cobertura ≥ 60% | ⚠️ Parcial (ver nota) | Média |
| 11 | **Monitoramento com Prometheus + Grafana** | ❌ Não atende | 🔴 Crítica |
| 12 | Documento de Solicitação do Sistema | ✅ **Atende** *(concluído 23/08)* | — |
| 13 | Documento de Requisitos (RF/RNF) | ❌ Não atende | Alta |
| 14 | Diagrama de Fluxo de Dados (DFD) | ❌ Não atende | Alta |
| 15 | Modelo Entidade-Relacionamento (MER) | ✅ **Atende** *(v1.0 entregue 23/08 — 17 entidades)* | — |
| 16 | Desenho de Arquitetura em Nuvem | ❌ Não atende | Alta |
| 17 | C4 Model (Contexto/Contêineres/Componentes) | ❌ Não atende | Alta |
| 18 | ADR (Registro de Decisões Arquiteturais) | ❌ Não atende como artefato formal | Alta |
| 19 | Planejamento de Sprints (tarefas + responsáveis + sprint) | ❌ Não atende | Alta |
| 20 | Docker/Docker Compose como contingência da defesa | ❌ Não atende (não existe `docker-compose.yml`) | Média |

**7 critérios atendidos, 4 parciais, 9 não atendidos.** Os quatro 🔴 críticos (microsserviços, nuvem, Terraform, monitoramento) são interdependentes — resolver um sem os outros três não fecha o aceite, e são também os que mais tempo consomem.

---

> ### 🔄 Revalidação em 26/08/2026
>
> **O que mudou em três dias:** apenas o eixo documental. Concluídos os documentos **01 (Solicitação do Sistema)** e **04 (MER)**, o que moveu o critério 12 de ❌ para ✅ e consolidou o 15. Placar: **6 → 7 atendidos**, **10 → 9 não atendidos**.
>
> **O que NÃO mudou:** todos os quatro críticos permanecem exatamente como estavam. Reverificado no código em 26/08:
>
> - `find . -iname "*.tf"` → **nenhum arquivo Terraform**
> - `grep -ril "prometheus\|grafana" k8s/` → **nenhuma ocorrência**
> - `grep` por cliente HTTP em `app/` → **nenhuma integração externa real**; `PROVIDERS = { fake: FakePixProvider }`
> - Um único `package.json` de backend, um `Dockerfile`, um deployment → **ainda monolítico**
>
> **Plano de execução:** as lacunas viraram Specs formais em `docs/specs/`, com tarefas e critérios de aceitação verificáveis. Ver `docs/specs/README.md` para o índice e o grafo de dependências.

---

## 1. Equipe (Seção 2 do termo)

**Evidência:** `git log --all --format="%an" | sort -u` retorna, agrupando variantes do mesmo nome:

- Gabriel (Gabriel Reis)
- Weslley Lucas (também aparece como `Lucas Kenway`/`lucaskenway` — apelido/conta de git da mesma pessoa, confirmado pelo time em 23/08)
- Sirlande Martins (Martins de Oliveira Junior / "Sir-Jr")

**3 integrantes confirmados.** Está dentro do intervalo de 2 a 5 exigido pelo termo. ✅

*(Correção em relação à primeira versão desta análise: eu tinha contado `Lucas Kenway` como uma quarta pessoa distinta, por não reconhecer o apelido. O time confirmou que é o mesmo Weslley Lucas.)*

**Distribuição de papéis (ex.: Arquitetura, DevOps, Backend, Frontend/Mobile, QA):** o `CLAUDE.md` define papéis operacionais (orquestrador, dev backend, dev frontend) e o projeto já usa a divisão informal Gabriel (orquestração/integração) · Weslley (backend — confirma o histórico de commits em gaps B2B/financeiro) · Sirlande (review funcional e banco de dados — confirma os relatórios de review e o roteiro de banco). **Isso não está formalizado como documento de equipe** — não há um arquivo que diga "fulano = Arquitetura, fulano = DevOps" nominalmente, que é o que a banca vai querer ver. ⚠️ Parcial — fácil de fechar, é só documentar o que já existe na prática. Com **3 pessoas** (não 4), a distribuição de trabalho da Seção 12 abaixo precisa ser mais enxuta do que eu havia planejado inicialmente.

---

## 2. Arquitetura de Microsserviços (Seção 3) — 🔴 CRÍTICO

**O que o termo exige:** *"O projeto deve ser concebido e implementado utilizando arquitetura de Microsserviços. Monólitos simples não serão aprovados."*

**Evidência do estado atual:**
```
find . -maxdepth 3 -name "package.json" -not -path "*/node_modules/*"
  ./package.json          → "sistema-gestao-hotel-backend"
  ./frontend/package.json → monorepo de apps FRONTEND (pms/booking/admin)
```

Existe **um único backend**: todo `app/`, `routes/`, `database/` vive num só processo Node/Express, com um só `Dockerfile`, um só `command.js`, um só deployment no K8s (`k8s/backend.yaml`, 3 réplicas do **mesmo** container). Isso é, por definição, um monólito — ainda que bem organizado internamente (Controllers/Models/services/utils por domínio, o que ajuda bastante na hora de separar).

**Isto é o maior risco de reprovação do projeto.** O termo usa linguagem que não deixa margem: "não serão aprovados".

**O que já ajuda a separar (boa notícia):** o backend já é organizado por domínio de negócio, e dá para enxergar fronteiras naturais nos 15 routers existentes hoje:

| Domínio candidato a serviço | Routers que entrariam |
|---|---|
| **Identidade** | `authRouter`, `userRouter`, `tenantRouter` |
| **Estoque/Cadastro** | `roomRouter`, `roomCategoryRouter`, `guestRouter` |
| **Reservas** (núcleo) | `reservationRouter`, `publicBookingRouter` |
| **Financeiro** | `paymentRouter`, `webhookRouter` (PIX), o módulo de consumo em andamento (`productRouter`, futuro `accountRouter`) |
| **B2B** | `corporateClientRouter`, `eventQuoteRouter`, `contractRouter` |
| **Analytics** | `analyticsRouter` (só leitura — bom candidato a serviço independente, inclusive assíncrono) |

**Recomendação:** não recomendo decompor em 6 serviços — para uma equipe de 4 pessoas, no prazo de um semestre, isso é risco alto de não terminar nada direito. Recomendo um corte de **3 serviços**, que ainda é genuinamente distribuído (a banca vai perguntar sobre comunicação entre serviços, consistência, falhas parciais — dá para responder de verdade com 3):

1. **`core-service`** — auth, tenants, users, rooms, categorias, hóspedes, reservas. É o domínio transacional principal.
2. **`billing-service`** — pagamentos, webhook do PIX (a única integração externa real do projeto), contratos B2B, e o módulo de consumo. Fronteira natural: é onde a integração externa mora e tem regras de consistência financeira próprias.
3. **`analytics-service`** — só leitura, agregando dados dos outros dois. Bom argumento arquitetural: pode ser alimentado de forma assíncrona (fila ou polling), o que dá material real para discutir em defesa (CQRS, eventual consistency).

Cada serviço com seu próprio banco (ou schema isolado, se o time preferir não fragmentar dados agora) e sua própria pipeline de CI/CD — é o que o termo pede explicitamente ("O processo de build e deploy **dos microsserviços**").

---

## 3. Integração com API Externa (Seção 3) — 🔴 CRÍTICO

**O que o termo exige:** consumir e integrar com pelo menos uma API externa relevante para a regra de negócio.

**Evidência:**
```js
// app/services/pix/index.js
const PROVIDERS = { fake: FakePixProvider };
// comentário no código: "Default: 'fake' (simulado) — adequado para demo/TCC."
```

A única tentativa de integração externa é o PIX, e está **explicitamente simulada**. Não existe nenhuma chamada real a serviço de terceiro em lugar nenhum do código (`grep` por `axios`, `node-fetch`, `https.request` não retornou nada em `app/`).

**Boa notícia:** a arquitetura já está pronta para isso — existe um contrato (`PixProvider.js`) com inversão de dependência, então plugar um provider real é abrir um arquivo novo e registrar no switch, não redesenhar nada.

**Recomendação:** implementar um provider real em modo sandbox — não precisa ser produção de verdade, só uma chamada HTTP real a um serviço de terceiro que responda de verdade. Candidatos que resolvem isso rápido e ficam relevantes ao negócio:
- **Mercado Pago Sandbox** (PIX de verdade, sandbox gratuito) — fecha a lacuna do PIX que já existe e é o de maior valor, porque já é a peça central do fluxo de pagamento
- **ViaCEP** (consulta de endereço por CEP no cadastro de hóspede/cliente corporativo) — trivial de implementar, mas conta como integração externa relevante
- Ideal: fazer os dois. ViaCEP é meia hora de trabalho e não custa nada não fazer também.

---

## 4. Banco de Dados (Seção 3) — ✅ Atende

**Evidência:** `docs/db/ARQ_DATABASE.md` já traz justificativa técnica clara para PostgreSQL: ACID para operações financeiras, UUID nativo, índices GiST com `EXCLUDE` para anti-double-booking, soft delete, multi-tenancy via `tenant_id`. É justificativa de verdade, amarrada em necessidades específicas do projeto — exatamente o que o termo pede.

**Ação:** nenhuma correção necessária. Só manter atualizado se o split em microsserviços mudar a topologia de dados (schema único vs. banco por serviço).

---

## 5. Nuvem, Restrição de PaaS e Terraform (Seção 4) — 🔴 CRÍTICO (2 dos 3 itens)

**Deploy em nuvem pública:** ❌ Não atende. Tudo roda hoje em **minikube local** (confirmei nesta sessão: `minikube status` mostra o cluster parado; quando subido, é sempre local — `./start.sh up` aplica manifests num cluster na própria máquina, nunca num provedor). Não há nenhuma conta AWS/GCP/Azure em uso.

**Restrição de BaaS/PaaS:** ✅ Não violado — o projeto não usa Vercel/Supabase/Firebase/Heroku. Mas isso é consequência de não ter nenhum deploy em nuvem ainda, não de uma escolha ativa correta feita em produção.

**Terraform:** ❌ Não atende. `find . -iname "*.tf"` não retornou **nenhum arquivo** no repositório inteiro. Toda a infraestrutura hoje é `kubectl apply -k k8s/` — que é IaC para os objetos *dentro* do cluster, mas não provisiona o cluster em si, rede, IAM, nada que o Terraform cobriria numa nuvem real.

**Recomendação:** este é o pacote de trabalho mais caro do projeto e depende de decisão do time:
1. **Provedor:** AWS (EKS) tem o material didático mais abundante e o free tier mais previsível para estudante; GCP (GKE) costuma ser mais barato para clusters pequenos. Preciso saber se alguém do grupo já tem conta/créditos em algum dos três antes de recomendar.
2. **Terraform provisiona:** o cluster gerenciado (EKS/GKE/AKS), a VPC/rede, e IAM mínimo. Os manifests K8s que já existem (`k8s/*.yaml`) continuam sendo aplicados por dentro do cluster — não precisam virar Terraform, só o que está *fora* do Kubernetes (a nuvem em si) precisa.
3. Isso é trabalho de infraestrutura que dá para começar **antes** do split em microsserviços estar pronto — o cluster provisionado por Terraform pode já hospedar o monólito atual enquanto o split avança em paralelo.

---

## 6. CI/CD (Seção 5) — ⚠️ Parcial

**O que existe:** `.github/workflows/ci.yml` roda em push/PR: checagem determinística de qualidade (`qa_checks.sh`) e testes com cobertura. **É CI real, funcional, não é fachada.**

**O que falta:** o termo pede build **e deploy** automatizado dos microsserviços. Hoje não existe nenhum job de deploy — nem para o cluster local, nem (ainda) para nuvem. Quando a nuvem e o Terraform estiverem prontos, falta o job que builda a imagem, publica no registry (ECR/GCR/ACR) e aplica no cluster.

**Ação:** estender o workflow existente com um job `deploy` condicionado a push em `main` — não precisa reescrever nada do que já funciona.

---

## 7. Testes e Cobertura (Seção 5) — ⚠️ Parcial, precisa reverificação

**Evidência:** `vitest.config.js` define os portões:
```js
thresholds: { statements: 60, lines: 60, functions: 60, branches: 55 }
```

`branches` está em **55%, abaixo do mínimo de 60%** que o termo exige. Os outros três métricas estão na régua exata (60%), sem folga.

**Importante — não reverifiquei o número real nesta sessão.** O cluster que hospeda o Postgres de teste estava parado (a máquina reiniciou desde a última sessão, há duas semanas), e subir tudo de novo só para ler um número não era o foco desta análise. Um comentário no próprio arquivo de configuração, de sessão anterior, registrava cobertura real de ~77% statements / ~80% lines — bem acima do portão — mas isso precisa ser confirmado rodando `npm run test:coverage` de fato antes de qualquer entrega, e principalmente **depois** do split em microsserviços, porque o termo pede cobertura "global, considerando todos os microsserviços" — ou seja, a métrica precisa ser agregada entre os serviços novos, não só herdada do monólito.

**Ação:** subir `branches` para 60 no `vitest.config.js` e rodar a suíte fresca antes de qualquer entrega formal.

---

## 8. Monitoramento — Prometheus e Grafana (Seção 5) — 🔴 CRÍTICO

**Evidência:** `grep -ri "prometheus\|grafana"` em todo o repositório só retorna menções em **documentos de análise** (`SAAS_TRANSFORMATION_ANALYSIS.md`, relatórios de sessão) — nunca em manifests reais. `ls k8s/` confirma: existem manifests para `backend`, `minio`, `nginx`, `postgres`, `redis` — **nenhum para Prometheus nem Grafana**.

**O que o termo exige, especificamente:** não basta existir — precisa estar **funcional e acessível no momento da defesa**.

**Recomendação:** isto é о item mais barato dos quatro críticos de resolver tecnicamente (comparado a microsserviços e nuvem). Existe um caminho padrão e bem documentado:
- `kube-prometheus-stack` via Helm sobe Prometheus + Grafana + Alertmanager com dashboards prontos em poucos comandos
- Cada serviço novo (do split em microsserviços) expõe `/metrics` — Express tem middleware pronto (`prom-client`) para isso
- Um dashboard Grafana básico (latência, taxa de erro, uso de recursos por pod) já satisfaz o termo

**Ordem sugerida:** fazer isso **depois** do cluster estar em nuvem (senão monitora um ambiente que vai ser trocado), mas **antes** do split completo em microsserviços (dá para validar a stack de monitoramento no monólito primeiro, sem esperar tudo).

---

## 9. Documentação Obrigatória (Seção 6) — 6 de 8 itens não atendidos

Este projeto tem uma quantidade enorme de documentação técnica interna — mais de 50 arquivos `.md` em `docs/`. O problema não é falta de conteúdo, é que **quase nada está no formato/nome que a banca vai procurar**, e alguns dos artefatos certos genuinamente não existem ainda.

| # | Item exigido | Situação | Evidência |
|---|---|---|---|
| 1 | Documento de Solicitação do Sistema | ❌ Não existe como documento único | Existe material espalhado (`ANALISE_PRODUTO_DIFERENCIAIS.md`, `SAAS_TRANSFORMATION_ANALYSIS.md`) que serve de matéria-prima, mas não está consolidado no formato "visão geral, problema, justificativa, valor agregado" |
| 2 | Documento de Requisitos (RF/RNF) | ❌ Não existe | O único arquivo chamado "requisitos" (`docs/requisitos/requisitos_web_atualizados.md`) é de **uma prova de bimestre não relacionada** ("Prova do 2º Bimestre — Desenvolvimento Web"), não do projeto experimental. RF/RNF de verdade precisam ser extraídos do que já foi implementado (o código é a fonte da verdade hoje) e formalizados |
| 3 | Diagrama de Fluxo de Dados (DFD) | ❌ Não existe | Nenhuma ocorrência em nenhum lugar do repositório |
| 4 | MER | ✅ Existe e é sólido | `modelagem/DER.mmd`, `der.png`, `diagrama_logico.md`, `dicionario_dados.md` (13KB, dicionário de dados completo) — só precisa incluir a tabela `products` (Fatia 1, ainda não commitada no remoto) |
| 5 | Desenho de Arquitetura em Nuvem | ❌ Não existe | Depende do item crítico #6 (nuvem) estar resolvido primeiro — não dá para desenhar arquitetura de um provedor que ainda não foi escolhido |
| 6 | C4 Model | ❌ Não existe | `docs/back/arquitetura_backend.md` tem diagramas de fluxo em ASCII, que servem de base para o nível de Componentes, mas não há Contexto nem Contêineres em notação C4 |
| 7 | ADR | ❌ Não existe como artefato formal | Há **muitas** decisões arquiteturais bem documentadas espalhadas (`ARQ_DATABASE.md`, relatórios de sessão, `qa-redteam` reports) — é conteúdo rico, só falta empacotar no formato ADR padrão (Contexto/Decisão/Alternativas/Consequências, numerado, um arquivo por decisão) |
| 8 | Planejamento de Sprints e Tarefas | ❌ Não existe no formato exigido | `PRODUCT_ROADMAP.md` é um roadmap de features por fase (Demo/TCC/Mercado), não um cronograma de sprints com tarefa → responsável → sprint de entrega |

**Isto é trabalho grande mas de baixo risco técnico** — é sobretudo síntese e formatação do que já existe (exceto DFD, C4 e arquitetura em nuvem, que são artefatos genuinamente novos).

**Decisão do time em 23/08:** esta é a prioridade **atual** do projeto — "ajustar o sistema para a documentação do produto". Isso muda a ordem de trabalho da Seção 12: em vez de tocar documentação em paralelo à técnica, a documentação lidera agora, e o corte em microsserviços entra primeiro como **plano** (que alimenta C4 e ADR diretamente), não como código.

---

## 10. Cronograma — Em que ponto estamos? (Seção 7)

O termo divide entregas em dois semestres:

- **4º Semestre:** toda a documentação (itens 1–8) **+ MVP funcional demonstrando a integração inicial dos microsserviços**
- **5º Semestre:** solução completa, deploy em nuvem via Terraform, cobertura de testes atingida, monitoramento operacional, defesa

**Confirmado em 23/08: o grupo está no 4º semestre.** Isso muda a urgência de cada item:

- **Nuvem, Terraform e monitoramento** (os 3 críticos mais caros) são formalmente entrega do **5º semestre** — têm fôlego, não precisam estar prontos agora
- **Toda a documentação (itens 1–8 da Seção 6)** é entrega **deste** semestre — é o que o time decidiu priorizar, e está alinhado com o termo
- **A arquitetura de microsserviços precisa aparecer como MVP inicial já neste semestre** — o termo pede explicitamente "demonstrando a viabilidade da proposta e a integração inicial dos microsserviços". Não precisa ser o split completo e produtivo (isso é entrega do 5º), mas precisa existir algo real: pelo menos 2 serviços rodando separados, se comunicando, com o mínimo de tráfego real entre eles. Isso também é o que dá conteúdo verdadeiro para o C4 Model e o ADR do split.

---

## 11. Formato da Defesa (Seção 8)

**Contingência via Docker/Docker Compose:** ❌ Não atende hoje. `find . -iname "docker-compose*.yml"` não retornou nenhum arquivo — apesar do `CLAUDE.md` (linha 54) ainda citar "Docker Compose (dev)" como parte da estratégia de infra, isso está desatualizado: o projeto migrou totalmente para Kubernetes e nunca voltou a ter um compose file. Isso precisa existir e funcionar, porque é a rede de segurança exigida pelo termo caso a internet falhe no dia da banca.

---

## 12. O que fazer agora — plano priorizado (atualizado em 23/08 com as decisões do time)

**Decisões já tomadas pelo time:**

| Pergunta | Resposta |
|---|---|
| Semestre | 4º — foco atual é ajustar o sistema para a documentação do produto |
| Equipe | 3 pessoas: Gabriel, Weslley Lucas, Sirlande Martins |
| Nuvem | AWS por ora (o time está aprendendo), aberto a outra se a necessidade pedir |
| Corte de microsserviços | Aceito o corte em 3 (core/billing/analytics), **mas exige planejamento formal antes de qualquer código** |
| API externa | ViaCEP primeiro (rápido); Mercado Pago depois (mais valor, mais trabalho) |

**Isso reordena o plano.** Nuvem/Terraform/Prometheus-Grafana são entrega do 5º semestre — não fazem parte do trabalho imediato. O trabalho imediato é 100% documentação, e o corte de microsserviços entra como **artefato de planejamento**, não como implementação.

```
FASE A — Plano de decomposição em microsserviços (documento, sem código)
  Já é o próximo passo desta sessão. Este único documento alimenta
  diretamente dois dos oito itens obrigatórios:
    → C4 Model (Contexto + Contêineres saem quase prontos dele)
    → ADR (a decisão "monólito → 3 serviços" com alternativas e consequências)

FASE B — Os 8 documentos obrigatórios (Seção 6 do termo)
  Ordem sugerida, do que depende de menos coisa para o que depende de mais:
  1. MER — atualizar com a tabela `products` (já quase pronto)
  2. Documento de Requisitos RF/RNF — extrair do código existente
  3. Documento de Solicitação do Sistema — sintetizar material já escrito
  4. C4 Model — Contexto e Contêineres vêm da Fase A;
     Componentes vem do que já existe em arquitetura_backend.md
  5. ADR — primeiro registro é exatamente a decisão da Fase A;
     aproveitar decisões já tomadas e documentadas ao longo do projeto
     (escolha do Postgres, motor de reserva, MinIO, etc.) como ADRs retroativos
  6. DFD — novo, mas natural depois do C4 estar pronto
  7. Planejamento de Sprints — novo, organiza o que falta (Fase C) em sprints
  8. Desenho de Arquitetura em Nuvem — o único que pode esperar,
     porque depende de decisão de infraestrutura que é entrega do 5º semestre
     (mas dá para esboçar já com AWS como alvo, sem provisionar nada ainda)

FASE C — MVP de microsserviços (entrega exigida já no 4º semestre)
  O termo pede "integração inicial dos microsserviços" como parte do MVP
  deste semestre — não é só documentação, precisa existir algo rodando.
  Escopo mínimo defensável: extrair 1 dos 3 serviços (o mais isolado,
  candidato: analytics — só leitura, menor superfície de risco) e
  demonstrar os dois se comunicando de verdade. Isso também vira a
  evidência viva por trás do C4 e do ADR, em vez de diagrama sem lastro.

FASE D — Integração externa real
  ViaCEP primeiro (baixo esforço, fecha o requisito). Mercado Pago
  sandbox depois, quando o billing-service existir (Fase C completa
  para os 3 serviços) — faz mais sentido a integração de pagamento
  morar já no serviço certo, em vez de implementar duas vezes.
```

**Reverificação técnica pendente, sem prazo definido pelo time:** cobertura de testes com suíte fresca e ajuste do threshold de `branches` para 60% em `vitest.config.js` — baixo esforço, fazer quando o ambiente K8s local voltar a subir.

---

## 13. Próximo artefato a produzir

Com as decisões acima fechadas, o próximo passo concreto é o **plano de decomposição em microsserviços** (Fase A) — documento técnico detalhando fronteiras de cada serviço, dono dos dados, padrão de comunicação entre eles, estratégia de migração e o registro formal da decisão (alternativas consideradas, por que 3 e não outro número, consequências). Esse documento é tratado como plano de arquitetura antes de qualquer código, conforme pedido do time, e serve de matéria-prima direta para C4 Model e ADR.
