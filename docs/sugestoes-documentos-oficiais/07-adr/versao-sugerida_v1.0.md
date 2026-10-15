# Registro de Decisões Arquitetônicas (ADR)

---

**Projeto:** Gesway — Sistema de Gestão Hoteleira (PMS SaaS)
**Grupo:** Gesway — Gabriel Reis Cunha (6325149)
· Sirlande Martins (6325269)
· Weslley Lucas (6325226)
**Data:** 14/10/2026
**Versão:** 1.0

---

## 1. Objetivo

Este documento registra formalmente as decisões arquitetônicas relevantes tomadas ao longo do projeto. Cada ADR captura o contexto, a decisão, as alternativas consideradas e as consequências previstas, servindo como memória técnica do projeto e facilitando o entendimento futuro por novos membros ou avaliadores.

Os Documentos 05 (arquitetura em nuvem) e 06 (C4 Model) resumem estas decisões e remetem a elas. Quando uma decisão mudar, a ADR original recebe o status "Substituída" e aponta para a nova, e os dois documentos são revistos.

---

## 2. Formato de cada ADR

Cada decisão deve seguir a estrutura abaixo:

```
### ADR-[NNN]: [Título da Decisão]

**Data:** ___/___/2026
**Status:** [Proposta | Aceita | Substituída | Depreciada]
**Autores:** [Nomes dos responsáveis pela decisão]

#### Contexto
[Descreva a situação, problema ou necessidade que motivou esta decisão.
Inclua restrições técnicas, de negócio ou de prazo relevantes.]

#### Decisão
[Declare claramente O QUE foi decidido.]

#### Alternativas Consideradas
| Alternativa | Prós | Contras |
|-------------|------|---------|
| [Opção A]   | [...] | [...]  |
| [Opção B]   | [...] | [...]  |
| [Opção C]   | [...] | [...]  |

#### Consequências
- **Positivas:** [O que melhora com esta decisão]
- **Negativas:** [Trade-offs aceitos, riscos assumidos]
- **Riscos mitigados:** [Como a equipe pretende lidar com os pontos negativos]
```

---

## 3. Registro de Decisões

---

### ADR-001: Linguagem e Framework do Backend

**Data:** 13/05/2026
**Status:** Aceita
**Autores:** Equipe Gesway — Gabriel Reis Cunha, Sirlande Martins, Weslley Lucas

#### Contexto

O backend do Gesway expõe uma API REST para a equipe do hotel e para a reserva direta do hóspede. A carga é de entrada e saída — consultas ao banco, chamadas ao provedor de pagamento e ao ViaCEP —, com pouco processamento pesado. O Termo de Aceite exige microsserviços em contêineres, o que pede um *runtime* leve e o mesmo para todos os serviços. A equipe tem três pessoas e dois semestres, e já domina JavaScript, a mesma linguagem do frontend.

#### Decisão

Utilizaremos **Node.js 24 com Express 4**, em **módulos ES** (`import`/`export`, nunca `require`), e **Sequelize 6** como ORM. O mesmo *runtime* vale para os três serviços da ADR-003.

A estrutura que o Express não impõe é definida por convenção do projeto (`docs/CODING_STANDARDS.md` no repositório do sistema): um *controller* por ação, *middlewares* de autenticação, tenant e papel, utilitários compartilhados e transação explícita sempre que uma operação altera mais de uma tabela. O contrato da API é publicado em OpenAPI, em `/api-docs`.

#### Alternativas Consideradas

| Alternativa | Prós | Contras |
|-------------|------|---------|
| **Node.js + Express — escolhida** | Conhecido pela equipe; mesma linguagem do frontend; leve em contêiner; I/O assíncrono adequado à carga | Estrutura mínima — a organização depende de convenção da equipe; sem tipagem no backend |
| Node.js + NestJS | Tipagem com TypeScript, módulos e injeção de dependência prontos | Curva de aprendizado e mais código cerimonial para uma API de porte médio; o projeto já tinha base em Express quando a arquitetura foi revista |
| Java + Spring Boot | Robusto e maduro, forte em ambiente corporativo | Verboso; *startup* e memória altos em contêiner — pesa num nó de 1 GiB (ADR-004) |
| Go | Alta performance, binários leves | Ecossistema web menor e linguagem nova para a equipe |
| Python + FastAPI | Produtividade e boa documentação automática | Linguagem diferente do frontend; desempenho inferior em alta concorrência |

#### Consequências

- **Positivas:**
  - Uma linguagem só em todo o sistema, do backend ao frontend.
  - Imagem pequena e *startup* rápido, compatíveis com os nós de 1 GiB da ADR-004.
  - Transações explícitas no Sequelize nas operações que atravessam tabelas.
- **Negativas:**
  - Sem tipagem estática no backend: erros de forma de dado aparecem em teste, não em compilação.
  - O Express não impõe arquitetura; sem disciplina, cada *controller* seguiria um padrão.
  - O driver `pg` devolve `DECIMAL` como texto; tratá-lo como número arredondaria valores monetários.
- **Riscos mitigados:**
  - Estrutura garantida por convenção escrita e por checagens automáticas no CI (`scripts/qa_checks.sh`).
  - Falta de tipagem compensada por testes de integração contra PostgreSQL real, com cobertura mínima imposta pelo CI (RNF-015, RNF-016).
  - Valor monetário nunca convertido com `Number()` ou `parseFloat` — regra do projeto, verificada em revisão.

---

### ADR-002: Escolha do Banco de Dados

**Data:** 21/05/2026
**Status:** Aceita
**Autores:** Equipe Gesway — schema inicial por Sirlande Martins

#### Contexto

O domínio hoteleiro é relacional e transacional. Uma reserva liga hóspede, quarto, categoria, usuário e hotel; um check-out soma diárias e consumos e registra o pagamento de uma vez. A regra mais crítica do negócio — **o mesmo quarto não pode ter duas reservas com datas sobrepostas** — precisa valer mesmo sob concorrência ou falha de código. O sistema é SaaS: dezenas a centenas de hotéis na mesma base, cada um isolado dos demais. A justificativa detalhada está na seção 2 do Documento 04.

#### Decisão

Utilizaremos **PostgreSQL 17** como banco relacional de todos os serviços, com:

- **Anti-*double-booking* no banco**, pela constraint `EXCLUDE USING gist` sobre quarto e intervalo de datas (`daterange`), com a extensão `btree_gist`.
- **Multi-tenancy por discriminador**: schema compartilhado, `tenant_id` obrigatório em toda tabela de negócio e em toda consulta, extraído sempre do token e nunca aceito do cliente (RNF-008).
- **UUID** como chave primária em todas as tabelas, para não expor volume de negócio nem permitir enumeração entre hotéis.
- ***Soft delete*** (`deleted_at`) com **índices únicos parciais**, para que um registro excluído não ocupe para sempre um identificador único.

Não há cache nem banco NoSQL: nenhuma consulta do sistema exigiu.

#### Alternativas Consideradas

| Alternativa | Prós | Contras |
|-------------|------|---------|
| **PostgreSQL — escolhida** | ACID; `EXCLUDE USING gist` para a regra de ocupação; UUID nativo; índices parciais | Escalabilidade horizontal da escrita mais complexa — sem impacto no volume previsto |
| MySQL | Relacional, ACID e muito difundido | Sem constraint de exclusão por intervalo: a regra anti-*double-booking* dependeria só da aplicação |
| MongoDB | Schema flexível, escalabilidade nativa | Sem integridade referencial; consistência entre documentos feita na aplicação, num domínio financeiro |
| DynamoDB | Gerenciado, escalável, integrado à AWS | Modelo de consulta limitado para relatórios; *vendor lock-in*; não roda no Docker Compose de contingência |
| Um schema ou um banco por hotel | Isolamento físico entre inquilinos | Multiplica *migrations* e monitoramento por hotel, sem ganho proporcional no volume esperado |
| Redis como cache de leitura | Leitura mais rápida em consultas repetidas | Nenhuma consulta medida exigiu cache; um componente a mais para manter coerente |

#### Consequências

- **Positivas:**
  - A venda dupla do mesmo quarto é recusada pelo banco, mesmo que dois atendentes confirmem ao mesmo tempo.
  - Um único mecanismo de isolamento entre hotéis, verificável por teste em toda rota.
  - O histórico financeiro é preservado: nada é apagado fisicamente.
- **Negativas:**
  - Um esquecimento de `tenant_id` numa consulta vaza dados entre hotéis — o isolamento depende de disciplina em todo acesso.
  - O *soft delete* exige que toda unicidade seja pensada com índice parcial.
  - A regra de ocupação no banco obriga a tratar a recusa da constraint como `409`, e não como erro interno.
- **Riscos mitigados:**
  - Teste de isolamento entre tenants na suíte, cobrindo as rotas de cada módulo.
  - Regra do CI que recusa índice único total em modelo com *soft delete*, salvo exceção nomeada e justificada.
  - Teste de concorrência que dispara reservas simultâneas do mesmo quarto e espera `409`, nunca `500`.

---

### ADR-003: Recorte de Serviços, Propriedade de Dados e Comunicação

**Data:** 14/09/2026
**Status:** Aceita
**Autores:** Gabriel Reis Cunha — revisão da proposta de recorte aprovada pela equipe em 23/08/2026

#### Contexto

O Termo de Aceite exige arquitetura de microsserviços. O backend é hoje um único processo Node/Express, organizado internamente por domínio. Em 23/08/2026 a equipe aprovou como proposta três serviços — `core`, `billing` e `analytics` — separando as entidades por **tipo**: operacionais no `core`, financeiras e contratuais no `billing`.

Antes de formalizar, a proposta foi confrontada com o código-fonte. Três fatos a invalidam:

- **Quatro transações atômicas atravessariam a fronteira.** A reserva direta pelo site grava hóspede, reserva e cobrança PIX na mesma transação; a confirmação do PIX por *webhook* marca o pagamento como `PAID` e promove a reserva a `CONFIRMED` juntos; assinar e cancelar contrato alteram contrato e reserva-bloco juntos. Separá-los exigiria transação distribuída justamente no fluxo de pagamento.
- **Doze chaves estrangeiras existentes cruzariam a fronteira**, e não duas — contando `CONSUMPTIONS`, lançamento financeiro que a proposta não chegou a alocar. Além de `payments.reservation_id` e `contracts.reservation_id`, cruzariam `consumptions.reservation_id`, `consumptions.deleted_by` e o `tenant_id` com `ON DELETE CASCADE` das oito tabelas financeiras e contratuais.
- **Duas das sete consultas de indicadores fazem `JOIN` entre pagamento e reserva.** Com bancos separados, não há consulta SQL que as execute.

Na direção oposta, o domínio de grupos e eventos mostrou fronteira real: nenhuma rotina de reserva, hospedagem, pagamento ou indicadores lê tabela de cliente corporativo, orçamento ou contrato, e esse domínio só toca o núcleo ao assinar e ao cancelar um contrato.

Restrições que a decisão precisa respeitar: a invariante anti-*double-booking* é uma constraint de banco (`EXCLUDE USING gist`) e não pode ser distribuída; o isolamento por `tenant_id` precisa valer em todos os serviços; a equipe tem três pessoas e dois semestres.

Uma segunda questão era **como o serviço de indicadores obteria os dados**. Ler o banco do núcleo, mesmo por réplica, faria um serviço depender do esquema de outro. E, como produto, um PMS precisa que o que acontece no balcão possa alimentar outros consumidores sem alterar o núcleo — notificação ao hóspede e sincronização com canais de venda são as evoluções naturais do sistema.

#### Decisão

O critério de fronteira é a **consistência transacional**, não o tipo de dado: o que precisa ser confirmado junto fica no mesmo serviço e no mesmo banco. Onde um atraso de segundos é aceitável, a comunicação é **por eventos**.

| Serviço | Entidades | Banco |
|---|---|---|
| **core-service** | TENANTS, USERS, ROOM_CATEGORIES, ROOMS, GUESTS, RESERVATIONS, RESERVATION_ROOMS, PAYMENTS, CONSUMPTIONS, PRODUCTS, ACCOUNTS 🔷, ACCOUNT_ITEMS 🔷 | PostgreSQL próprio |
| **b2b-service** | CORPORATE_CLIENTS, EVENT_QUOTES, QUOTE_SERVICES, CONTRACTS, CONTRACT_INSTALLMENTS | PostgreSQL próprio |
| **analytics-service** | nenhuma entidade de domínio — mantém projeções de leitura | PostgreSQL próprio, alimentado por eventos do `core-service` |

**Referências que cruzam a fronteira.** Restam seis, todas partindo do `b2b-service`:

- `tenant_id` das cinco tabelas B2B — guardado como identificador, sem chave estrangeira. A integridade segue garantida pela regra já vigente: o `tenant_id` vem sempre do token de autenticação, nunca do cliente. Como o sistema não oferece exclusão de hotel, a perda do `ON DELETE CASCADE` não tem efeito funcional.
- `contracts.reservation_id` — identificador da reserva-bloco devolvido pelo `core-service` na assinatura.

O `analytics-service` guarda **cópias** de dados do núcleo em suas projeções, identificadas pelos mesmos `id` e `tenant_id`, sem chave estrangeira.

**Comunicação.**

- **`b2b-service` → `core-service`: REST síncrono**, em rotas internas não publicadas pelo *gateway*. São duas operações: criar a reserva-bloco ao assinar o contrato — o núcleo verifica a disponibilidade dos quartos e cria a reserva na mesma transação — e cancelá-la ao cancelar o contrato. Ambas são **idempotentes** pela chave `contract_id`: repetir a assinatura devolve a reserva já criada, e cancelar reserva já cancelada é sucesso sem efeito. O contrato só muda de status depois da resposta do núcleo.
- **`core-service` → `analytics-service`: eventos de domínio via RabbitMQ.** O núcleo registra cada evento **na mesma transação** da alteração que o originou (*outbox* transacional), e um publicador os entrega a uma *exchange* do RabbitMQ. O `analytics-service` consome de uma fila durável, com fila de mensagens mortas, e atualiza suas projeções. A entrega é **pelo menos uma vez**, e o consumidor ignora evento já processado.
- **Eventos publicados**, derivados do que os indicadores consomem: criação, alteração e remoção de hotel, categoria de quarto, quarto, hóspede, reserva e pagamento, incluindo as mudanças de status da reserva e do pagamento. Todo evento carrega `tenant_id`.
- **Não há mensageria entre `b2b-service` e `core-service`:** o bloqueio de quartos de um evento exige consistência imediata.

A propagação de identidade entre serviços é tratada em decisão própria, a ser registrada como ADR-006.

**Indisponibilidade.**

| Fora do ar | Efeito |
|---|---|
| `b2b-service` | A operação do hotel segue integralmente. Ficam indisponíveis clientes corporativos, orçamentos e contratos |
| `analytics-service` | Operação intacta. Os eventos acumulam na fila e são processados quando o serviço volta |
| `core-service` | A operação do hotel para. O `b2b-service` continua consultando orçamentos e contratos, mas recusa assinar ou cancelar com `503`, mantendo o contrato no status anterior, sem estado parcial |
| RabbitMQ | Operação intacta: os eventos permanecem no *outbox* do núcleo e são publicados quando o broker volta. Os indicadores ficam desatualizados até lá |
| Consumo com atraso | Indicadores refletem o núcleo com atraso de segundos, aceitável para indicadores do dia |

**Evolução prevista — fora do escopo atual.** Os mesmos eventos permitem acrescentar consumidores sem alterar o núcleo: **notificação ao hóspede** (confirmação de reserva e de pagamento) e **sincronização com canais de venda** (*channel manager*). Não fazem parte da implementação atual e não constam dos diagramas de arquitetura.

#### Alternativas Consideradas

| Alternativa | Prós | Contras |
|-------------|------|---------|
| Recorte de 23/08, validando a referência por chamada de API | Fronteira nominal simples de explicar | Quatro transações atômicas viram fluxos distribuídos, incluindo reserva direta e confirmação do PIX; duas consultas de indicadores ficam sem solução em SQL; falha do núcleo interrompe o faturamento |
| Recorte de 23/08, replicando dados da reserva por eventos | Desacoplamento real entre serviços | Consistência eventual no pagamento; exige compensação que a equipe teria de construir e operar; o problema das consultas de indicadores permanece |
| **Recorte por consistência transacional — escolhida** | Nenhum fluxo de pagamento atravessa serviços; anti-*double-booking* intacta; uma única referência de negócio cruzando a fronteira | O núcleo concentra doze entidades; o `b2b-service` depende do núcleo para assinar e cancelar contratos |
| Banco compartilhado entre serviços separados | Nenhuma referência cruzando a fronteira | Não é microsserviço: os serviços ficam acoplados pelo esquema. Anti-padrão reconhecido, descartado de início |
| Indicadores lendo réplica do banco do núcleo | Dispensa mensageria; consultas sem reescrita | O serviço de indicadores depende do esquema de outro serviço, e o núcleo não ganha canal para novos consumidores |
| **RabbitMQ para os eventos do núcleo — escolhida** | Filas duráveis, fila de mensagens mortas e painel de gestão; roda no cluster e no Docker Compose de contingência, sem serviço pago na nuvem | Um componente a mais para operar |
| Redis Streams | Aproveita o Redis já provisionado no cluster | Sem fila de mensagens mortas pronta; menos reconhecido como broker de mensagens |
| Amazon SQS | Serviço gerenciado | Não roda no Docker Compose de contingência sem emulador; exige verificação do free-tier antes de provisionar |
| Mensageria também entre `b2b-service` e `core-service` | Desacoplamento total entre os serviços | O bloqueio de quartos passaria a ter consistência eventual, abrindo janela para venda dupla do mesmo quarto |
| gRPC entre serviços | Contrato tipado, desempenho | Duas operações síncronas de baixa frequência não justificam o ferramental; o projeto já mantém contratos em OpenAPI |

#### Consequências

- **Positivas:**
  - A reserva direta e a confirmação do PIX continuam atômicas, dentro de um único banco.
  - O `analytics-service` tem banco próprio e não depende do esquema de nenhum outro serviço.
  - Os eventos do núcleo formam a base para novos consumidores — notificação ao hóspede e canais de venda — sem alteração do núcleo.
  - O módulo de comanda (`ACCOUNTS`, `ACCOUNT_ITEMS`) é modelado com chaves estrangeiras normais para reserva, quarto e hóspede.
  - A verificação de disponibilidade dos quartos do evento passa para dentro da mesma transação que cria a reserva-bloco.
  - A extração do `b2b-service` envolve duas operações entre serviços, em vez de quatro transações distribuídas.
- **Negativas:**
  - O `core-service` concentra doze das dezessete entidades e é o maior dos três serviços.
  - Assinar e cancelar contrato dependem do núcleo estar disponível.
  - O `tenant_id` das tabelas B2B perde a garantia referencial do banco.
  - Os indicadores passam a ter consistência eventual, com atraso de segundos.
  - Há um componente a mais para operar — o RabbitMQ — além de *outbox*, publicador e projeções a manter. As sete consultas de indicadores são adaptadas para ler as projeções.
  - O nome `billing-service`, usado em documentos anteriores, deixa de existir: pagamento e consumo passam ao núcleo, e o domínio contratual passa ao `b2b-service`.
- **Riscos mitigados:**
  - *O núcleo seria um monólito menor?* O tamanho não é o critério de fronteira. Reservar, hospedar e cobrar formam uma única unidade transacional; dividi-la exigiria transação distribuída sem ganho funcional.
  - *Por que eventos só para os indicadores?* Consistência imediata onde o balcão precisa dela — disponibilidade, bloqueio de quartos, pagamento — e eventos onde um atraso de segundos é aceitável.
  - *Evento perdido se o broker cair.* O *outbox* grava o evento na mesma transação da alteração; nada é publicado sem antes estar registrado no núcleo.
  - *Evento entregue duas vezes.* O consumidor registra os eventos processados e ignora repetições; nenhum indicador conta em dobro.
  - *Mensagem que falha sempre.* Vai para a fila de mensagens mortas, sem travar as demais.
  - *Dado pessoal copiado para os indicadores.* A projeção de hóspede guarda apenas identificador e nome, e a eliminação a pedido do titular é propagada por evento.
  - *Falha no meio da assinatura de contrato.* A idempotência por `contract_id` torna a repetição segura, e o contrato só avança após a resposta do núcleo.
  - *Vazamento entre hotéis nos indicadores.* Todo evento carrega `tenant_id`, as projeções mantêm o filtro em toda consulta, e o teste de isolamento entre tenants passa a cobrir o novo serviço.

---

### ADR-004: Provedor de Nuvem e Serviços

**Data:** 16/09/2026 — revista em 10/10/2026
**Status:** Aceita
**Autores:** Weslley Lucas — revisão de 10/10 com a equipe

#### Contexto

O Termo de Aceite exige deploy em nuvem pública com infraestrutura provisionada por Terraform. O projeto tem uma regra absoluta: **permanecer sempre no free-tier**, sem exceção por valor, e destruir os recursos ao fim de cada uso. A arquitetura da ADR-003 leva ao cluster três serviços, o RabbitMQ, o nginx e a observabilidade; só os `requests` de memória somam mais de 1 GiB, antes do consumo do próprio Kubernetes.

A primeira versão desta decisão, de 16/09, previa um nó único que começaria em `t3.micro` e passaria a `t3.small` quando o RabbitMQ e a observabilidade entrassem. A `t3.small` não tem garantia de estar no free-tier, o que conflita com a regra do projeto. A revisão de 10/10 resolve o conflito.

#### Decisão

Utilizaremos **AWS, região `sa-east-1`**, com:

- **k3s em dois EC2 de 1 GiB** — um *server* e um *agent* —, e não EKS. O tipo é `t2.micro` ou `t3.micro`, o que for elegível ao free-tier da conta, conferido antes do primeiro `terraform apply`.
- **RDS PostgreSQL 17** (`db.t3.micro`, Single-AZ) em subnet privada, com um *database* e um usuário por serviço.
- **S3** para os PDFs, no lugar do MinIO local, e para o *state* do Terraform.
- **ECR** para as imagens dos serviços.
- **Sem NAT Gateway, sem ALB e sem Multi-AZ.** O nginx dentro do cluster é a entrada única.
- **Ciclo efêmero**: `terraform apply` no início de cada sessão e `terraform destroy` ao fim. O que precisa sobreviver entre sessões — o *state* do Terraform e o alerta de custo — fica num *bootstrap* criado uma única vez.
- **AWS Budgets** com alerta a partir de US$ 1, e uso de usuário IAM, nunca o `root` da conta.

O desenho completo, com rede, Security Groups e custos, está no Documento 05.

#### Alternativas Consideradas

| Alternativa | Prós | Contras |
|-------------|------|---------|
| **AWS com k3s em dois EC2 de 1 GiB — escolhida** | Dentro do free-tier; Kubernetes real; sem custo de *control plane* | Memória apertada por nó; a equipe opera o cluster |
| AWS EKS | Kubernetes gerenciado, padrão de mercado | *Control plane* custa cerca de US$ 73/mês mesmo parado, e nunca entra no free-tier |
| AWS ECS Fargate | Contêineres sem gerenciar servidor | Cobrança por vCPU e memória, fora do free-tier; não é Kubernetes, o que afasta a nuvem dos manifests locais |
| k3s num único EC2, faseado de `t3.micro` para `t3.small` (decisão de 16/09) | Um nó só, mais simples de operar | A `t3.small` não tem elegibilidade garantida ao free-tier — conflito com a regra absoluta do projeto |
| GCP (GKE) | Boa experiência de desenvolvedor, Kubernetes nativo | Menor familiaridade da equipe; o free-tier cobre um cluster *autopilot* com limites diferentes dos que o projeto já mediu |
| Azure (AKS) | Créditos acadêmicos | Menor familiaridade da equipe; créditos têm prazo e não substituem a regra de free-tier |

#### Consequências

- **Positivas:**
  - Custo zero dentro do free-tier, com alerta se algo escapar.
  - O banco fica em subnet privada, fora do cluster, e libera memória dos nós.
  - Os mesmos manifests do ambiente local rodam na nuvem.
- **Negativas:**
  - Os nós têm pouca folga de memória; o k3s precisa ser instalado sem componentes dispensáveis.
  - Os dados da nuvem são efêmeros: banco e PDFs são recriados a cada sessão pelo `seed`.
  - Na nuvem, cada serviço roda com uma réplica, abaixo das três que o RNF-003 prevê para o ambiente Kubernetes local.
  - O endereço público muda a cada sessão.
- **Riscos mitigados:**
  - Falta de memória se resolve retirando a observabilidade ou réplicas, nunca aumentando o tipo da instância.
  - Recurso esquecido ligado: `destroy` ao fim de cada sessão e alerta do AWS Budgets.
  - Nuvem indisponível no dia da defesa: o sistema sobe localmente pelo Docker Compose (ADR-005).

---

### ADR-005: Estratégia de Containerização e Orquestração

**Data:** 10/06/2026 — contingência acrescentada em 16/09/2026
**Status:** Aceita
**Autores:** Weslley Lucas (manifests Kubernetes e Compose de contingência), Gabriel Reis Cunha (imagem do backend)

#### Contexto

O Termo de Aceite pede microsserviços em contêineres e orquestração. O sistema precisa rodar igual na máquina de cada integrante, no CI e na nuvem. A defesa perante a banca não pode depender de a nuvem estar disponível no dia.

#### Decisão

- Todo serviço é empacotado como **imagem Docker** *multi-stage*, executada como usuário sem privilégio (`node`), sem segredo dentro da imagem (RNF-011, RNF-019).
- A orquestração é **Kubernetes**, descrita de forma declarativa com `kustomize` em `infra/k8s/` (RNF-020): `Deployment`, `StatefulSet`, `NetworkPolicy`, `PodDisruptionBudget`, *probes* e limites de recurso.
- Localmente, o cluster é o **minikube**; na nuvem, o **k3s** (ADR-004). Os manifests são os mesmos.
- O **Docker Compose** é a **contingência**: sobe o sistema completo — serviços, PostgreSQL, RabbitMQ, MinIO e nginx — numa única máquina, sem Kubernetes, para desenvolvimento rápido e para a defesa sem nuvem.

#### Alternativas Consideradas

| Alternativa | Prós | Contras |
|-------------|------|---------|
| **Docker + Kubernetes, com Compose de contingência — escolhida** | Padrão de mercado; mesmos manifests local e nuvem; plano B que não depende de nuvem | Duas descrições do ambiente para manter em sincronia |
| ECS Fargate | Contêineres sem gerenciar servidor | Fora do free-tier (ADR-004); específico da AWS, sem equivalente local |
| EKS | Kubernetes gerenciado | Custo do *control plane* fora do free-tier (ADR-004) |
| Docker Swarm | Mais simples que Kubernetes | Pouco usado no mercado; não atende à expectativa de Kubernetes do projeto |
| EC2 com Docker Compose, sem orquestrador | Simples de operar | Sem *probes*, reinício orquestrado nem `NetworkPolicy`; gerenciamento manual |

#### Consequências

- **Positivas:**
  - O mesmo artefato roda no CI, no cluster local e na nuvem.
  - Isolamento de rede entre serviços por `NetworkPolicy` (RNF-010).
  - A defesa tem um plano B que roda em qualquer máquina com Docker.
- **Negativas:**
  - Manifests Kubernetes e `docker-compose.yml` precisam evoluir juntos: variável nova, porta ou segredo entra nos dois.
  - Kubernetes exige mais conhecimento operacional da equipe do que o Compose.
- **Riscos mitigados:**
  - Divergência entre os dois ambientes: toda mudança de infraestrutura atualiza os dois no mesmo *pull request*, conferido na revisão.
  - Segredo vazado em imagem: `.dockerignore` e montagem de chaves por volume somente leitura.

---

### ADR-006: Propagação de Identidade entre Serviços

**Data:** 24/09/2026
**Status:** Aceita — JWT RS256 implementado em 28/09/2026 e usuários do RabbitMQ por serviço em 15/10/2026; as rotas internas com `X-Internal-Token` entram com o `b2b-service`
**Autores:** Gabriel Reis Cunha

#### Contexto

Até a ADR-003 havia um único processo, e o JWT era assinado e verificado com **HS256** e um segredo compartilhado. HS256 é simétrico: quem verifica um token também consegue assinar um. Com três serviços, se todos compartilhassem o segredo, qualquer um deles — inclusive o `analytics-service`, que só lê projeções — poderia emitir um token válido de qualquer hotel, com qualquer papel. O `tenant_id` deixaria de ser impossível de forjar.

A ADR-003 também criou duas comunicações sem usuário: a chamada `b2b-service → core-service` para criar e cancelar a reserva-bloco, e a troca de eventos pelo RabbitMQ. Nenhuma das duas tinha autenticação.

Um terceiro ponto: a política do projeto de versionar alguns segredos por conveniência acadêmica é aceitável para segredos simétricos de rotação barata, mas não para uma chave privada, cujo propósito é nunca circular.

#### Decisão

- **JWT em RS256, com o `core-service` como único emissor.** Só ele tem a chave privada; os demais serviços verificam localmente com a chave pública, sem *gateway* de autenticação. O token traz `kid` no cabeçalho, preparando a rotação de chave.
- **Verificador fixado em `algorithms: ['RS256']`**, como defesa em profundidade: o contrato fica em um algoritmo só, independente do comportamento da versão da biblioteca.
- **O servidor recusa subir sem um par de chaves válido**: no *boot*, assina e verifica um token de teste com o par carregado.
- **A chave privada nunca é versionada.** É gerada por ambiente e entregue por `Secret` do Kubernetes criado no provisionamento, montada somente leitura. A chave pública vai por `ConfigMap`, também criado por ambiente.
- **Chamada `b2b-service → core-service`:** rotas internas, não publicadas pelo nginx, autenticadas pelo cabeçalho `X-Internal-Token` comparado em tempo constante — o mesmo padrão já usado na assinatura do *webhook* PIX.
- **RabbitMQ com um usuário por serviço:** o `core-service` só publica na *exchange* de eventos; o `analytics-service` só lê a sua fila. O usuário administrador fica fora das aplicações.
- **Troca de HS256 para RS256 sem período de transição.** Tokens antigos passam a ser recusados e o usuário faz login de novo; manter os dois algoritmos ativos manteria o segredo simétrico vivo.

#### Alternativas Consideradas

| Alternativa | Prós | Contras |
|-------------|------|---------|
| **RS256 com validação local por serviço — escolhida** | Só o `core-service` emite token; nenhum componente novo de infraestrutura | Manejo da chave privada por ambiente; dois artefatos em vez de um segredo |
| *Gateway* central que valida e propaga a identidade | Um único ponto de verificação | Componente novo para construir e operar; volta a existir confiança num cabeçalho propagado |
| HS256 com segredo por serviço | Menor mudança de código | Não resolve: para verificar, cada serviço precisaria do segredo do emissor — e com HS256 quem verifica também assina |
| **Serviço a serviço: credencial estática em cabeçalho — escolhida** | Reaproveita padrão já testado; proporcional a duas chamadas de baixa frequência | Segredo de vida longa, trocado manualmente se vazar |
| Serviço a serviço: token RS256 de curta duração | Unifica toda a verificação; o token expira sozinho | Endpoint de emissão, cache e política de expiração — desproporcional para duas rotas |
| Chave pública distribuída por JWKS | Permite rotação sem *redeploy* | Endpoint e cache em cada verificador, sem necessidade de rotação hoje |
| mTLS entre serviços | Autenticação no transporte | Gestão de certificados por serviço, normalmente via *service mesh*, desproporcional para três serviços |
| RabbitMQ com usuário único | Já provisionado | Um defeito no `analytics-service` permitiria publicar eventos falsos em nome do núcleo |

#### Consequências

- **Positivas:**
  - O `tenant_id` não pode ser forjado por nenhum serviço que só verifica.
  - Chave ausente, inválida ou de outro par aparece no *deploy*, não no primeiro login.
  - Nenhum componente novo de infraestrutura para autenticação.
- **Negativas:**
  - A chave privada exige um passo de provisionamento que os demais segredos não têm.
  - A troca de algoritmo derrubou as sessões ativas no momento do *deploy*.
  - A credencial estática do `b2b-service` não expira sozinha.
  - Rotacionar a chave exige reiniciar os serviços; sem JWKS, cada verificador conhece uma única chave pública.
- **Riscos mitigados:**
  - Credencial estática vazada: as rotas internas não são publicadas pelo nginx e só são alcançáveis de dentro do cluster, restritas por `NetworkPolicy`.
  - Reintrodução acidental do HS256: o verificador só aceita RS256.
  - Testes provam o pino do algoritmo — tokens RS512 e PS256 assinados com a chave correta são recusados —, além de token com outra chave e `tenant_id` adulterado.

---

### ADR-007: Uma Reserva por Quarto, dentro de um Agrupador

**Data:** 12/10/2026
**Status:** Proposta
**Autores:** Gabriel Reis Cunha

#### Contexto

Hoje uma reserva tem um hóspede, um período, um status e um total, e ocupa um quarto principal; quartos adicionais entram por uma tabela de ligação (RF-013). Uma família com dois quartos, ou um grupo de evento com dez — a reserva-bloco do contrato B2B —, é uma reserva só, com um status para todos os quartos.

Esse modelo produziu defeitos com a mesma causa: os quartos de uma reserva não têm vida própria. A venda dupla de quarto adicional e a cobrança só do quarto principal foram corrigidas em 10/10/2026, mas a correção exigiu cópia de período por *trigger*, *lock* e tratamento de *deadlock*. Continuam impossíveis: o preço congelado por quarto, o check-out antecipado de um quarto do grupo, o cancelamento de contrato com parte do grupo hospedada e a receita por categoria correta.

Nos PMS de mercado, a unidade de ocupação é a reserva de **um** quarto, com tarifa, hóspede e status próprios, e uma compra com vários quartos é um **agrupador** dessas reservas.

#### Decisão

Proposta: **agrupador (`bookings`) contendo uma reserva por quarto (`reservations`)**.

- O agrupador guarda o titular, a origem (balcão, reserva direta ou contrato) e o vínculo com o contrato.
- Cada reserva tem um quarto, o hóspede daquele quarto, período, status e o **valor congelado** da estadia.
- A tabela de ligação de quartos deixa de existir, e a garantia contra venda dupla volta a ser uma constraint simples sobre a reserva.

Pontos a decidir se for aceita: onde mora o pagamento (proposta: no agrupador, com a reserva opcional), se o status do agrupador é derivado das reservas (proposta: sim, nunca gravado) e como dividir o total das reservas antigas na migração (proposta: proporcional ao preço de cada categoria).

**Gatilho de decisão:** antes de começar o módulo de reservas do frontend, o motor de tarifas por período ou o consumidor de eventos do `analytics-service`. Depois de qualquer um deles, a mudança fica mais cara.

#### Alternativas Consideradas

| Alternativa | Prós | Contras |
|-------------|------|---------|
| Manter o modelo atual, já corrigido | Implementado e auditado; nenhuma migração | Preço por quarto, check-out e cancelamento por quarto continuam impossíveis; complexidade de *trigger* e *lock* em toda mudança futura |
| Reservas por quarto sem agrupador, ligadas por código de grupo | Mudança menor | Titular, origem, sinal e contrato ficam sem dono; o código vira um agrupador sem integridade |
| **Agrupador com uma reserva por quarto — proposta** | Modelo de mercado; elimina a tabela de ligação e os *triggers*; resolve os casos acima | Migração com divisão de valores; mudança de contrato da API, dos eventos e das rotas internas |

#### Consequências

- **Positivas:**
  - Venda dupla garantida por uma constraint simples.
  - Cada quarto guarda o próprio preço; mudar um não reprecifica os outros.
  - Check-in, check-out e cancelamento por quarto; receita por categoria correta.
- **Negativas:**
  - Migração de dados com divisão estimada do total das reservas antigas.
  - Mudança de contrato da API de reservas, dos eventos e das rotas internas do `b2b-service`.
  - Uma entidade a mais no modelo de dados (Documento 04).
- **Riscos mitigados:**
  - Diferença de centavos na migração: o arredondamento fica num único quarto e o total do grupo é preservado.
  - Custo crescente com o tempo: a decisão tem gatilho definido, antes das frentes que dependem do modelo.

---

### ADR-008: Integrações Externas atrás de Interface

**Data:** 27/06/2026 — Mercado Pago acrescentado em 07/10/2026
**Status:** Aceita
**Autores:** Gabriel Reis Cunha (contrato PIX), Weslley Lucas (ViaCEP e Mercado Pago)

#### Contexto

O Gesway depende de dois serviços externos: o **PSP** (provedor de pagamento PIX), para cobrar o sinal da reserva direta e confirmar o pagamento, e o **ViaCEP**, para preencher o endereço de cliente corporativo. Os dois ficam fora do controle da equipe: podem mudar de API, ficar fora do ar ou ser trocados por outro provedor. A suíte de testes precisa rodar no CI sem rede e sem credencial real.

#### Decisão

Cada integração fica **atrás de uma interface própria**, com a implementação escolhida por variável de ambiente:

- **`PixProvider`** — criar cobrança, validar a assinatura do *webhook* e consultar o status da cobrança. Implementações: um **provedor simulado**, padrão em desenvolvimento e testes, e o **Mercado Pago** (`PIX_PROVIDER=mercadopago`).
- **`AddressProvider`** — consultar CEP. Implementação: **ViaCEP**.

Regras comuns:

- *Controllers* conhecem só a interface, nunca o provedor.
- Erros do provedor viram **erros tipados**, traduzidos em respostas previsíveis — CEP inexistente em `404`, provedor indisponível em `503`.
- Toda chamada externa tem **tempo limite**.
- O *webhook* do PSP só tem efeito depois de validada a assinatura, e o status do pagamento é **confirmado no próprio PSP** antes de ser gravado (RNF-012).
- Os testes **não usam rede**: o provedor simulado cobre os fluxos, e o `fetch` é substituído por *mock* nos testes das implementações reais.

#### Alternativas Consideradas

| Alternativa | Prós | Contras |
|-------------|------|---------|
| **Interface com implementação por ambiente — escolhida** | Troca de provedor sem mudar *controller*; testes sem rede; provedor simulado para desenvolvimento | Uma camada a mais de código |
| Chamada direta ao provedor nos *controllers* | Menos código | Teste depende de rede ou de *mock* espalhado; trocar de provedor reescreve *controllers* |
| Testes contra o *sandbox* do provedor | Exercita a API real | CI instável e dependente de credencial; lento |
| Servidor de *mock* de HTTP para todos os testes | Testa a camada HTTP inteira | Ferramenta a mais, e ainda acoplaria os testes de fluxo ao formato de cada provedor |

#### Consequências

- **Positivas:**
  - A suíte inteira roda no CI sem rede.
  - O Mercado Pago entrou sem mudar o contrato que os fluxos de reserva direta já usavam com o provedor simulado.
  - Falha do serviço externo é tratada de forma degradada: o sistema responde `503`, sem estado parcial.
- **Negativas:**
  - O provedor simulado precisa acompanhar o contrato; se divergir do real, um teste verde pode esconder um defeito.
  - Os critérios que exigem cobrança real no *sandbox* só se comprovam fora da suíte automatizada.
- **Riscos mitigados:**
  - Divergência entre simulado e real: o contrato é um só, e as implementações reais têm testes próprios, com o `fetch` substituído por *mock*.
  - Provedor real configurado por engano em teste: o padrão é sempre o simulado, e a credencial real só existe no ambiente.

---

### ADR-009: Módulo de Consumo por Contas

**Data:** 07/08/2026
**Status:** Aceita — em implementação
**Autores:** Equipe Gesway — implementação conduzida por Sirlande Martins

#### Contexto

O consumo de bar e restaurante era registrado como item de uma reserva. Esse vínculo não comporta cenários comuns na operação de um hotel: o hóspede de *day-use*, que consome sem se hospedar; a mesa do restaurante; pessoas diferentes na mesma suíte com contas separadas; e o consumo interno — cortesia, refeição de funcionário, perda — que precisa ser medido sem virar receita. O garçom lança pelo celular, às vezes sem rede, e o reenvio não pode cobrar duas vezes.

#### Decisão

O consumo passa a ser registrado em **contas** (`ACCOUNTS`) com **itens** (`ACCOUNT_ITEMS`), que absorvem o registro de consumo atual:

- **Tipos de conta:** suíte (`ROOM`), *day-use*, mesa, venda direta e interna. Só a conta de suíte é ligada a uma estadia, e só ela pode cobrar a diária.
- **Só uma conta cobra a diária de cada quarto em cada estadia** (RN-005), para que a diária não seja cobrada duas vezes.
- **Item não faturável** (cortesia, funcionário, perda) mantém preço e total gravados e exige motivo; não soma na conta (RN-007), e contas internas nunca entram na receita (RN-006).
- **Idempotência do lançamento** pelo identificador gerado no celular, inclusive para item já excluído (RN-008).
- **Regras financeiras garantidas no banco**, por constraints, além da validação na aplicação — o total do item é sempre quantidade × preço.
- **O garçom só alcança o cardápio e as contas**, por *allowlist* de rotas: rota nova nasce fechada para ele. Cortesia fica com recepção e administração; excluir item, só com a administração.

A migração do consumo existente preserva valores, datas e a trilha de exclusão, e o contrato atual da API de consumo da reserva continua respondendo.

#### Alternativas Consideradas

| Alternativa | Prós | Contras |
|-------------|------|---------|
| **Contas com itens, absorvendo o consumo — escolhida** | Cobre os quatro cenários; uma única forma de registrar consumo | Migração de dados; uma entidade a mais |
| Manter o consumo ligado à reserva | Nenhuma mudança | *Day-use*, mesa, contas separadas e consumo interno ficam sem solução |
| Tabelas paralelas para mesa e *day-use*, mantendo o consumo da reserva | Não migra dados | Duas formas de lançar consumo, duas regras de fechamento e relatórios somando fontes diferentes |
| Bloqueio do garçom por papel em cada rota | Simples de entender | Toda rota nova nasce aberta até alguém lembrar de fechar — foi assim que o garçom chegou a dados pessoais de hóspedes |

#### Consequências

- **Positivas:**
  - Consumo sem hospedagem, contas separadas na mesma suíte e consumo interno mensurável.
  - Regras de dinheiro valem mesmo que um *controller* erre, porque o banco recusa.
  - Menor privilégio do garçom garantido por padrão.
- **Negativas:**
  - Migração de dados do consumo existente.
  - O identificador de lançamento com unicidade total é a única exceção à regra de índices parciais do projeto.
  - Desconto por item, se um dia existir, exigirá rever a constraint de total.
- **Riscos mitigados:**
  - Quebra de contrato na migração: o teste existente do consumo da reserva precisa passar sem alteração.
  - Exceção de índice esquecida ou copiada: fica num único lugar, nomeada no teste de guarda.

---

### ADR-010: Lançamento Financeiro Estornado, nunca Apagado

**Data:** 04/10/2026
**Status:** Aceita — implementação planejada
**Autores:** Gabriel Reis Cunha

#### Contexto

A exclusão de pagamento remove o registro das listagens sem dizer por quê nem quem o fez — o oposto do que o fechamento de caixa (RF-056) e uma auditoria precisam. Os indicadores de receita continuavam somando o pagamento excluído, e qualquer papel podia excluir. Nos PMS de mercado, lançamento financeiro não se apaga: corrige-se com outro lançamento, que deixa rastro.

Há duas operações diferentes que precisam ser separadas: **anular** um lançamento feito por engano, que não movimenta caixa, e **devolver** dinheiro que de fato entrou, que movimenta.

#### Decisão

- A exclusão de pagamento deixa de existir. Em seu lugar, **estorno** (`VOIDED`), com **motivo obrigatório**, autor e data registrados. O pagamento original permanece.
- A transição é por *allowlist*: só pagamento pago pode ser estornado, uma única vez.
- **Pagamento recebido pelo PSP não é estornado no sistema**: tirar da receita um dinheiro que o PSP recebeu exige **devolução** (`REFUNDED`) pelo próprio PSP, registrada como necessidade futura.
- Estorno exige papel de administração.
- Indicadores de receita desconsideram pagamentos estornados.

#### Alternativas Consideradas

| Alternativa | Prós | Contras |
|-------------|------|---------|
| Exclusão lógica (`deleted_at`), como era | Simples | Sem motivo nem autor; o registro some das listagens; fácil de esquecer o filtro nos relatórios |
| **Estorno com motivo e autor — escolhida** | Trilha completa; o fechamento de caixa reconcilia | Mudança de contrato da API; novo status a tratar nos relatórios |
| Um único status para anulação e devolução | Menos estados | Mistura no fechamento de caixa o que não movimenta dinheiro com o que movimenta |
| Lançamento negativo de compensação | Padrão contábil | Mais complexo para a equipe e para a recepção sem ganho no porte atual |

#### Consequências

- **Positivas:**
  - Todo ajuste financeiro deixa rastro de quem, quando e por quê.
  - Receita e mix de pagamento ficam corretos.
  - Anulação e devolução não se confundem no caixa.
- **Negativas:**
  - Clientes da rota antiga de exclusão precisam migrar — hoje nenhum fluxo do sistema a usa.
  - A devolução pelo PSP ainda não existe; até lá, um estorno feito diretamente no PSP precisa ser tratado à mão.
- **Riscos mitigados:**
  - Cliente antigo falhando em silêncio: a rota removida responde indicando o estorno.
  - Estorno duplo ou de pagamento não pago: recusado pela *allowlist* de transições.

---

### ADR-011: Frontend em SPA e Monorepo

**Data:** 07/08/2026
**Status:** Aceita
**Autores:** Gabriel Reis Cunha

#### Contexto

O sistema tem públicos diferentes: a equipe do hotel, que usa o PMS durante o turno, no balcão e no celular do garçom; o hóspede, na reserva direta; e a administração da plataforma. As três interfaces compartilham regras — status de reserva, dinheiro, datas, papéis — que não podem divergir entre si nem do servidor.

#### Decisão

- **React 18 com TypeScript, Vite e Tailwind CSS**, em aplicações de página única (SPA). TanStack Query para o estado do servidor e Zustand para o estado local.
- **Monorepo com pnpm e Turborepo**: aplicações `pms`, `booking` e `admin`, e pacotes compartilhados de interface (design system), cliente da API, regras de domínio e configuração.
- **Cliente da API gerado do OpenAPI** do backend, com tipos.
- **Regras de domínio num pacote único**: dinheiro em centavos inteiros (o `DECIMAL` chega como texto e nunca é convertido com `Number()`), datas no fuso `America/Sao_Paulo` e máquinas de estado em *allowlist*.
- **Toda validação de negócio fica no servidor**; a interface apenas antecipa o que o servidor vai recusar.
- No escopo atual, só o `app-pms` é construído; `booking` e `admin` têm a estrutura criada e ficam para depois do TCC.

#### Alternativas Consideradas

| Alternativa | Prós | Contras |
|-------------|------|---------|
| **SPA React em monorepo — escolhida** | Regras e componentes compartilhados entre as três aplicações; tipos gerados da API | Ferramental de monorepo para configurar |
| Next.js com renderização no servidor | Melhor indexação para o site público | Servidor a mais para operar; o PMS é uso autenticado e não precisa de SSR. Pode valer para o `booking` no futuro |
| Angular | Estrutura completa e opinativa | Menor familiaridade da equipe; mais pesado para a comanda no celular |
| Vue | Curva de aprendizado suave | Menor familiaridade da equipe; ecossistema de componentes menor para o design system |
| Um repositório por aplicação | Independência entre aplicações | Duplicação de regras de dinheiro, datas e status — divergência entre as telas |

#### Consequências

- **Positivas:**
  - Dinheiro, datas e status se comportam igual em todas as telas.
  - Mudança no contrato da API aparece como erro de tipo no frontend.
  - Design system único para uma aparência profissional e consistente.
- **Negativas:**
  - O monorepo exige ferramental próprio (pnpm, Turborepo) além do npm do backend.
  - SPA depende de JavaScript no navegador; o site público, quando construído, pode precisar de outra estratégia.
- **Riscos mitigados:**
  - Regra de negócio duplicada no frontend: o servidor é a fonte da verdade, e a interface só antecipa recusas.
  - Defasagem do cliente da API: ele é regenerado a partir do OpenAPI publicado.

---

## 4. Índice de ADRs

| ID | Título | Status | Data |
|----|--------|--------|------|
| ADR-001 | Linguagem e Framework do Backend | Aceita | 13/05/2026 |
| ADR-002 | Escolha do Banco de Dados | Aceita | 21/05/2026 |
| ADR-003 | Recorte de Serviços, Propriedade de Dados e Comunicação | Aceita | 14/09/2026 |
| ADR-004 | Provedor de Nuvem e Serviços | Aceita | 16/09/2026 (revista em 10/10/2026) |
| ADR-005 | Containerização e Orquestração | Aceita | 10/06/2026 |
| ADR-006 | Propagação de Identidade entre Serviços | Aceita | 24/09/2026 |
| ADR-007 | Uma Reserva por Quarto, dentro de um Agrupador | Proposta | 12/10/2026 |
| ADR-008 | Integrações Externas atrás de Interface | Aceita | 27/06/2026 |
| ADR-009 | Módulo de Consumo por Contas | Aceita | 07/08/2026 |
| ADR-010 | Lançamento Financeiro Estornado, nunca Apagado | Aceita | 04/10/2026 |
| ADR-011 | Frontend em SPA e Monorepo | Aceita | 07/08/2026 |

---

## 5. Observações

- Recomenda-se um **mínimo de 5 ADRs** para projetos neste nível de complexidade.
- ADRs podem ser adicionados ao longo do desenvolvimento. Decisões que mudam devem ter o status atualizado para "Substituída" com referência à nova ADR.
- O formato é baseado no modelo proposto por Michael Nygard ([Documenting Architecture Decisions](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions)).
- As ADRs são numeradas na ordem em que foram registradas neste documento, não na ordem cronológica das decisões. A data de cada uma é a da decisão.

---

## 6. Histórico de Revisões

| Versão | Data | Autor | Descrição da Alteração |
|--------|------|-------|------------------------|
| 0.1 | 14/09/2026 | Gabriel Reis Cunha | Versão parcial. Registra o **ADR-003** — recorte em `core-service`, `b2b-service` e `analytics-service`, propriedade de dados e comunicação entre serviços. ADR-001, ADR-002, ADR-004 e ADR-005 permanecem como modelo, a preencher; a propagação de identidade entre serviços será registrada como ADR-006 |
| 1.0 | 14/10/2026 | Gabriel Reis Cunha | Registra ADR-001, 002, 004 e 005 e a ADR-006 (identidade entre serviços); acrescenta ADR-007 (proposta: uma reserva por quarto), ADR-008 (integrações externas), ADR-009 (consumo por contas), ADR-010 (estorno financeiro) e ADR-011 (frontend). ADR-004 já incorpora a revisão de 10/10, com dois nós de 1 GiB no lugar do `t3.small` |

---

**Aprovado por:**

___________________________________________________
Professor(a) Orientador(a)

Data: ___/___/2026
