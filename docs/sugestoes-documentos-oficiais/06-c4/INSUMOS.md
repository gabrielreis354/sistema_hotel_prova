# Documento 06 — Insumos para o C4 Model

**Documento oficial:** `Projetos/gesway/06-c4-model.md` — hoje idêntico ao template
**Dono:** **Weslley Lucas**
**Data:** 28/09/2026 · **Preparado por:** Gabriel Reis Cunha
**Entrega:** 6º encontro, pela tabela do README do professor

---

## O que é este arquivo

O que o repositório mostra para os três níveis do C4, organizado como o template pede — **para
você produzir o documento**. O inventário de infraestrutura (portas, recursos, requests) está no
`05-arquitetura-nuvem/INSUMOS.md` e não se repete aqui.

Os caminhos valem para a branch **`develop`** do repositório do hotel.

---

## 0. A regra que mais importa: bater com o Doc 03

O Doc 03 (DFD) v1.2 do Sirlande está em entrega, no PR #15 do repositório do professor. **O C4
e o DFD descrevem o mesmo sistema**, e a banca vai ler os dois. Divergência entre eles é o
primeiro achado de qualquer revisor.

| O que tem que ser igual | Onde está no Doc 03 |
|---|---|
| As entidades externas do Nível 1 | §3, Nível 0: Hóspede, Operador do Hotel, PSP, ViaCEP |
| Os três serviços e seus nomes | §4: `core-service`, `b2b-service`, `analytics-service` |
| Os armazenamentos | §7: D-001 a D-005 |
| A comunicação entre serviços | §6: F-014 e F-015 (REST síncrono b2b → core), F-016 e F-017 (eventos via RabbitMQ) |

Use **os mesmos nomes**, com a mesma grafia.

---

## 1. Nível 1 — Contexto

**Pessoas.** O Doc 03 agrupa a operação num único "Operador do Hotel". No C4 vale separar pelos
papéis do sistema, porque cada um usa o produto de um jeito diferente:

| Pessoa | Papel no sistema | Como usa |
|---|---|---|
| **Recepcionista** | `RECEPTIONIST` | Balcão, oito horas por turno: reservas, check-in e check-out, pagamentos |
| **Administrador** | `ADMIN` | Configura o hotel, usuários, quartos; lê indicadores |
| **Garçom** | `WAITER` | Celular, lançamento de consumo |
| **Hóspede** | sem login | Reserva direta e pagamento do sinal via PIX, pela rota pública |

Os papéis estão em `services/core-service/app/utils/roles.js`.

**Sistemas externos:**

| Sistema | O que fornece | Onde está |
|---|---|---|
| **PSP (provedor PIX)** | Cobrança e confirmação por *webhook* assinado | `app/services/pix/` — hoje um provedor simulado atrás da interface `PixProvider` |
| **ViaCEP** | Endereço a partir do CEP | `app/services/address/ViaCepAddressProvider.js` |

**Não desenhe o "Serviço de E-mail" do exemplo do template:** o Gesway não envia e-mail, nem há
plano para isso. Notificação ao hóspede aparece na ADR-003 como evolução fora do escopo.

---

## 2. Nível 2 — Contêineres

| Contêiner | Tecnologia | Responsabilidade | Porta |
|---|---|---|---|
| **app-pms** | React 18.3 + TypeScript 5.6, Vite 5.4, Tailwind 3.4 | Interface da equipe do hotel — SPA | servido pelo nginx |
| **nginx** | nginx 1.27 | Única entrada pública; proxy para os serviços | 80 |
| **core-service** | Node.js 24 + Express 4.19, Sequelize 6 | Identidade, hospedagem, pagamentos, consumo, reserva direta. **Único emissor de token** | 3000 |
| **b2b-service** | Node.js 24 + Express | Clientes corporativos, orçamentos, contratos, PDFs | — |
| **analytics-service** | Node.js 24 + Express | Indicadores, a partir de projeções alimentadas por evento | — |
| **PostgreSQL** | PostgreSQL 17 | Persistência — um database por serviço (ver Doc 05) | 5432 |
| **RabbitMQ** | RabbitMQ 4 | Eventos de domínio do `core` para o `analytics` | 5672 |
| **Armazenamento de objetos** | MinIO, compatível com S3 | PDFs de contrato e de orçamento | 9000 |

**Três armadilhas do template:**

- **Não há "Auth Service".** A autenticação vive no `core-service`. A ADR-006, em proposta no
  PR #84, decide que ele é o único a assinar tokens (RS256) e que os outros serviços apenas
  verificam com a chave pública. Um contêiner de autenticação à parte contradiria essa decisão.
- **Não há cache.** O Redis está em `infra/k8s/redis.yaml`, mas nenhum código o usa. Não
  desenhe.
- **O nginx não é um API Gateway** no sentido do template (Kong, rate limit, autenticação). É
  proxy — a ADR-006 registra por que ele não participa da validação de token.

**Duas relações que precisam estar no diagrama**, porque são as decisões da ADR-003:

- `b2b-service → core-service`: REST síncrono, rotas internas, criar e cancelar a reserva-bloco
  do contrato
- `core-service → RabbitMQ → analytics-service`: eventos com *outbox* transacional; o
  `analytics-service` **não** lê o banco do `core-service`

---

## 3. Nível 3 — Componentes

O template pede um diagrama por microsserviço relevante. Os três são relevantes.

**Hoje tudo roda dentro do `core-service`** — o backend saiu da raiz em 15/09 como primeiro passo
da divisão, mas ainda é um processo só. O C4, como o DFD, descreve o **alvo** da ADR-003. Os
componentes abaixo estão agrupados pelo serviço a que pertencem nesse alvo, com a contagem real
de controllers de cada domínio.

### 3.1 `core-service`

| Componente | O que faz | Onde está |
|---|---|---|
| Autenticação | Login e cadastro do hotel; assina o JWT | `AuthApi/` (2), `TenantApi/` (2) |
| Usuários | CRUD com papel | `UserApi/` (5) |
| Hospedagem | Categorias, quartos, hóspedes | `RoomCategoryApi/` (5), `RoomApi/` (6), `GuestApi/` (5) |
| Reservas | Ciclo de vida, check-in, check-out, conta | `ReservationApi/` (11) |
| Anti-*double-booking* | Conflito na aplicação e `EXCLUDE USING gist` no banco | `app/utils/checkReservationConflict.js` + `db/schema.sql` |
| Pagamentos | Registro e listagem | `PaymentApi/` (5) |
| Webhook PIX | Confirmação do PSP com assinatura HMAC | `WebhookApi/` (1), `app/utils/pixWebhookSignature.js` |
| Provedor PIX | Interface `PixProvider` + implementação | `app/services/pix/` |
| Reserva direta | Rotas públicas, tenant pelo subdomínio | `PublicBookingApi/` (4), `app/utils/resolveTenantBySubdomain.js` |
| Consumo | Catálogo e lançamentos | `ProductApi/` (5), `ConsumptionApi/` (3) |
| Middlewares | Token, tenant, papel, CORS | `middlewares/` — `auth`, `tenant`, `role`, `cors` |
| Publicador do *outbox* | Grava o evento na mesma transação e publica no RabbitMQ | **não existe ainda** — T-01.4 |

### 3.2 `b2b-service`

| Componente | O que faz | Onde está hoje |
|---|---|---|
| Clientes corporativos | CRUD | `CorporateClientApi/` (5) |
| Endereço | Consulta ao ViaCEP | `AddressApi/` (1), `app/services/address/` |
| Orçamentos | CRUD, confirmação, cancelamento | `EventQuoteApi/` (8) |
| Contratos | Geração, assinatura, cancelamento, parcelas | `ContractApi/` (9) |
| PDFs | Geração e envio ao armazenamento de objetos | `generateContractPdf.js`, `generateQuotePdf.js`, `uploadToMinIO.js` |
| Cliente do `core-service` | Cria e cancela a reserva-bloco | **não existe ainda** — T-01.6. Hoje é a mesma transação |

O **Endereço** está no `b2b-service` pela ADR-003: ele alimenta `CORPORATE_CLIENTS`. O Doc 02
v1.4 sugerida foi realinhado para isso em 28/09 (RF-045).

### 3.3 `analytics-service`

| Componente | O que faz | Onde está hoje |
|---|---|---|
| Consultas de indicadores | Receita, ocupação, ADR, alertas, sazonalidade, mix de pagamento, ranking | `AnalyticsApi/` (7) — **hoje leem o banco do core** |
| Consumidor de eventos | Consome a fila, idempotente, com fila de mensagens mortas | **não existe ainda** — T-01.4 |
| Projeções | Cópias de leitura dos dados do núcleo | **não existe ainda** — T-01.4 |

O catálogo de eventos que alimenta as projeções está sendo escrito na etapa C da delegação
`docs/delegacoes/rodada2_gabriel_28set2026.md`.

---

## 4. §5 do template — ADRs resumidos

O template pede um resumo das ADRs. Hoje o Doc 07 do fork tem **só a ADR-003 preenchida** — as
ADR-001, 002, 004 e 005 ainda são o texto do template, com `[Nomes]` e `___/___/2026`.

As decisões, porém, **já foram tomadas**. Falta escrevê-las no Doc 07:

| ADR | Decisão | Evidência |
|---|---|---|
| 001 — Backend | Node.js 24 + Express 4, ESM | `services/core-service/package.json`, CLAUDE.md |
| 002 — Banco | PostgreSQL 17. Motivo forte: a constraint `EXCLUDE USING gist` garante o anti-*double-booking* no próprio banco — é recurso do PostgreSQL, e a regra não depende só da aplicação | `db/schema.sql` |
| 003 — Recorte de serviços | Critério de consistência transacional; RabbitMQ; REST síncrono b2b → core | Doc 07, já escrita |
| 004 — Nuvem | AWS, k3s em EC2 single-node, ciclo efêmero | **Sua análise de 16/09**, com o insumo pronto |
| 005 — Containers | Docker + Kubernetes (k3s), com Docker Compose de contingência | `infra/k8s/`, `docker-compose.yml` (T-06.4, seu) |
| 006 — Identidade entre serviços | RS256, `core` único emissor | Proposta no PR #84, aprovada em 28/09 |

O Doc 06 vem **antes** do Doc 07 pela ordem numérica. Para não depender de um documento ainda
não entregue, use a mesma solução do Sirlande no Doc 03 v1.2: resuma no próprio Doc 06 o que
ele precisa de cada decisão.

---

## 5. §6 do template — Tecnologias

Versões conferidas nos arquivos em 28/09:

| Camada | Tecnologia | Versão | Onde conferir |
|---|---|---|---|
| Frontend | React + TypeScript | 18.3 / 5.6 | `frontend/apps/pms/package.json` |
| Build e estilo | Vite, Tailwind CSS | 5.4 / 3.4 | idem |
| Estado no cliente | TanStack Query, Zustand | 5 / 5 | idem |
| Backend | Node.js + Express | 24 / 4.19 | `services/core-service/package.json` |
| ORM | Sequelize | 6.37 | idem |
| Banco relacional | PostgreSQL | 17 | `infra/k8s/postgres.yaml` |
| Mensageria | RabbitMQ | 4 | `infra/k8s/rabbitmq.yaml` |
| Objetos | MinIO (API S3) | — | `infra/k8s/minio.yaml` |
| Proxy | nginx | 1.27 | `infra/k8s/nginx.yaml` |
| Monitoramento | Prometheus + Grafana | — | obrigatório; T-02.4, não iniciada |
| IaC | Terraform | — | obrigatório; T-02.2, não iniciada |
| CI/CD | GitHub Actions | — | `.github/workflows/ci.yml` |
| Containers | Docker, k3s | — | `infra/k8s/`, `docker-compose.yml` |

As linhas **"Banco NoSQL"** e **"Cache"** do template não se aplicam: o Gesway não usa nenhum dos
dois. Diga isso, em vez de preencher.

---

## 6. Um aviso prático sobre os diagramas

O template usa a sintaxe C4 do Mermaid (`C4Context`, `C4Container`, `C4Component`). Ela é
**experimental** no Mermaid e o layout automático costuma sobrepor rótulos de relações.

O Doc 03 passou por isso: o Sirlande fez três commits só de legibilidade, e o nível 1 chegou a
ter 1994 px de largura, reduzido a 45% no GitHub. Antes de entregar:

- **renderize de verdade e olhe** — o preview do GitHub no próprio PR serve
- se os rótulos sobrepuserem, o Mermaid C4 aceita `UpdateRelStyle` para deslocar o texto de uma
  relação e `UpdateLayoutConfig` para mudar quantos elementos cabem por linha
- **menos relações por diagrama** ajuda mais que qualquer ajuste: no nível 3, desenhe os
  componentes e as relações principais, não todas

---

## 7. O documento é normativo

Como o 02, o 03 e o 05: o C4 descreve a arquitetura-alvo. Os componentes marcados aqui como
"não existe ainda" entram no diagrama normalmente, **sem marcação de status**. O
acompanhamento de execução é do Doc 08.
