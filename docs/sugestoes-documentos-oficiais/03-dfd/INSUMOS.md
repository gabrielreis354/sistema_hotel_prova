# Documento 03 — Insumos para o Diagrama de Fluxo de Dados

**Documento oficial:** `Projetos/gesway/03-diagrama-fluxo-de-dados.md` — modelo em branco
**Dono:** **Sirlande Martins**
**Data:** 14/09/2026 · **Preparado por:** Gabriel Reis Cunha

---

## O que é este arquivo

Tudo o que o código mostra sobre como a informação transita no Gesway, organizado nas seções que
o modelo oficial pede — **para você produzir o documento**. Não há diagrama pronto aqui de
propósito: o documento é seu.

Cada fluxo aponta o arquivo onde ele acontece, para você conferir antes de desenhar.

---

## A regra que decide o que entra no diagrama

O critério **C1** exige a arquitetura *implementada*, e o **C9** exige documentação *"válida e
atualizada"*. Juntos, significam: **o DFD só pode mostrar o que existe no código**.

A arquitetura está mudando — o monólito está sendo dividido. Por isso cada item abaixo diz em
que momento passa a existir:

| Marca | Significa |
|---|---|
| ✅ **Hoje** | Existe no código atual, dentro do monólito |
| 🟡 **Após T-01.4** | Passa a existir quando o `analytics-service` for extraído, com o RabbitMQ |
| 🔵 **Após T-01.6** | Passa a existir quando o `b2b-service` for extraído (5º semestre) |
| ⛔ **Não desenhar** | Planejado ou previsto, mas sem implementação |

> **Combinar a data de entrega do DFD com a T-01.4.** Desenhado antes dela, o Nível 1 mostra um
> único processo de backend; desenhado depois, mostra dois serviços e o broker. As duas versões
> são válidas — desde que batam com o código na data da entrega.

Decisão de arquitetura por trás de tudo isto: **ADR-003** (Documento 07) e **SPEC-01**
(`docs/specs/SPEC-01-microsservicos.md`).

---

## 1. Entidades externas — para o Nível 0

| Entidade | Quem é | Interage por | Existe |
|---|---|---|---|
| **Recepcionista** | Papel `RECEPTIONIST` | Aplicação web `pms` | ✅ |
| **Administrador** | Papel `ADMIN` | Aplicação web `pms` | ✅ |
| **Garçom** | Papel `WAITER` | Aplicação web `pms` — lançamento de consumo | ✅ papel existe · comanda completa depende da SPEC-04 |
| **Hóspede** | Pessoa que reserva direto com o hotel, sem login | **Somente API** `/public/:subdomain/*` | ✅ API · ⛔ não há site público |
| **Provedor de pagamento PIX** | Gera a cobrança e avisa quando foi paga | Chamada de saída + *webhook* de entrada | ✅ **simulado** (`FakePixProvider`) |
| **ViaCEP** | Endereço a partir do CEP | — | ⛔ planejado na SPEC-03 |
| **Mercado Pago** | PSP real | — | ⛔ planejado na SPEC-03 |

**Sobre o frontend:** só `frontend/apps/pms` tem código (24 arquivos). `apps/booking` e
`apps/admin` existem como pastas **vazias**. Não desenhe site público de reserva como aplicação.

**Sobre o provedor PIX:** hoje é simulado. Se o diagrama o mostrar como sistema externo real,
precisa estar identificado como simulado até a SPEC-03.

---

## 2. Processos — para o Nível 1

O modelo pede *"um processo por microsserviço ou módulo bem definido"*. Os módulos do código são
estes, já agrupados pelo serviço a que pertencem no recorte decidido:

| Serviço | Módulo | Onde está no código | Existe como serviço separado |
|---|---|---|---|
| **core-service** | Autenticação e cadastro de hotel | `routes/apis/authRouter.js`, `tenantRouter.js`, `userRouter.js` | ✅ dentro do monólito |
| **core-service** | Hospedagem — categorias, quartos, hóspedes, reservas, check-in e check-out | `roomCategoryRouter.js`, `roomRouter.js`, `guestRouter.js`, `reservationRouter.js` | ✅ dentro do monólito |
| **core-service** | Pagamentos e PIX | `paymentRouter.js`, `webhookRouter.js`, `app/services/pix/` | ✅ dentro do monólito |
| **core-service** | Consumo e catálogo | `reservationRouter.js` (consumos, conta), `productRouter.js` | ✅ dentro do monólito · comanda 🔷 SPEC-04 |
| **core-service** | Reserva direta pública | `publicBookingRouter.js` | ✅ dentro do monólito |
| **b2b-service** | Clientes corporativos, orçamentos e contratos | `corporateClientRouter.js`, `eventQuoteRouter.js`, `contractRouter.js` | 🔵 após T-01.6 |
| **analytics-service** | Indicadores | `analyticsRouter.js`, `app/Controllers/AnalyticsApi/` | 🟡 após T-01.4 |

Todas as rotas são montadas em `routes/router.js`. A entrada pública é o **Nginx**
(`k8s/nginx.yaml`), que hoje encaminha tudo para o backend único.

---

## 3. Armazenamentos — para o dicionário de armazenamentos

| Armazenamento | Tipo | Guarda | Serviço responsável | Existe |
|---|---|---|---|---|
| **Banco do núcleo** | PostgreSQL | Hotéis, usuários, quartos, hóspedes, reservas, pagamentos, consumo, produtos | `core-service` | ✅ hoje é o banco único do monólito |
| **Outbox de eventos** | Tabela no banco do núcleo | Eventos gravados na mesma transação da alteração, até serem publicados | `core-service` | 🟡 |
| **Fila de eventos** | RabbitMQ | Eventos do núcleo a caminho do analytics, com fila de mensagens mortas | — (infraestrutura) | 🟡 |
| **Banco de indicadores** | PostgreSQL | Projeções de leitura e registro de eventos já processados | `analytics-service` | 🟡 |
| **Banco de grupos e eventos** | PostgreSQL | Clientes corporativos, orçamentos, contratos, parcelas | `b2b-service` | 🔵 hoje essas tabelas estão no banco único |
| **Armazenamento de PDFs** | MinIO (objetos) | PDF de **contrato** | hoje o monólito · após T-01.6, `b2b-service` | ✅ |

**Não desenhar:**
- O **Redis** existe em `k8s/redis.yaml`, mas nenhuma linha de código o usa.
- A **"Fila de Mensagens"** genérica do modelo oficial só entra quando o RabbitMQ existir (T-01.4).

---

## 4. Fluxos de dados — para o dicionário de fluxos

### 4.1 Autenticação e operação do balcão

| Origem → Destino | Dado | Formato | Onde acontece | Existe |
|---|---|---|---|---|
| Usuário → Autenticação | E-mail, senha e, se necessário, subdomínio do hotel | JSON | `app/Controllers/AuthApi/LoginController.js` | ✅ |
| Autenticação → Usuário | Token com `userId`, `role`, `tenantId` — validade 8 h | JWT (Bearer) | `LoginController.js` | ✅ |
| Administrador → Autenticação | Dados do hotel e do administrador | JSON | `app/Controllers/AuthApi/RegisterController.js` | ✅ |
| Recepcionista → Hospedagem | Dados da reserva: hóspede, quarto, período | JSON | `app/Controllers/ReservationApi/CreateReservationController.js` | ✅ |
| Hospedagem → Banco do núcleo | Reserva e quartos, na mesma transação | SQL | idem | ✅ |
| Recepcionista → Hospedagem | Check-in / check-out | JSON | `CheckInController.js`, `CheckOutController.js` | ✅ — o check-out coloca o quarto em limpeza na mesma transação |
| Recepcionista → Pagamentos | Valor, meio e natureza do pagamento | JSON | `app/Controllers/PaymentApi/` | ✅ |
| Recepcionista/Garçom → Consumo | Item consumido na estadia | JSON | `reservationRouter.js` — rotas `/consumptions` | ✅ · por conta 🔷 SPEC-04 |
| Consumo → Recepcionista | Conta consolidada: diárias + consumos | JSON | `app/Controllers/ReservationApi/GetBillController.js` | ✅ |

### 4.2 Reserva direta e PIX

Este é o fluxo mais rico do sistema, e o que melhor mostra fronteira externa.

| Origem → Destino | Dado | Formato | Onde acontece | Existe |
|---|---|---|---|---|
| Hóspede → Reserva direta | Categoria, período, dados pessoais | JSON | `app/Controllers/PublicBookingApi/CreateBookingController.js` | ✅ |
| Reserva direta → Banco do núcleo | Hóspede, reserva `PENDING` e pagamento, **numa única transação** | SQL | idem | ✅ |
| Reserva direta → Provedor PIX | Valor do sinal (`deposit_percent` do hotel) | chamada ao provedor | `app/services/pix/FakePixProvider.js` → `createCharge` | ✅ simulado |
| Provedor PIX → Reserva direta → Hóspede | Cobrança e código PIX | JSON | idem | ✅ |
| **Provedor PIX → Pagamentos** | Confirmação de pagamento (*webhook*) | JSON | `app/Controllers/WebhookApi/PixWebhookController.js` | ✅ |
| Pagamentos → Banco do núcleo | Pagamento `PAID` + reserva `PENDING → CONFIRMED`, na mesma transação | SQL | idem | ✅ |
| Hóspede → Reserva direta | Consulta de status da reserva | JSON | `GetBookingStatusController.js` | ✅ |

> ⚠️ **Fronteira sem validação.** O *webhook* PIX é público e **hoje não verifica assinatura** do
> provedor (SPEC-06, T-06.9). Se o diagrama marcar fronteiras de confiança, esta é a mais
> sensível do sistema.

### 4.3 Grupos e eventos (B2B)

| Origem → Destino | Dado | Formato | Onde acontece | Existe |
|---|---|---|---|---|
| Administrador → B2B | Cliente corporativo, orçamento, serviços | JSON | `CorporateClientApi/`, `EventQuoteApi/` | ✅ |
| B2B → Administrador | PDF do **orçamento** — gerado na hora, **não é armazenado** | PDF | `app/utils/generateQuotePdf.js`, `DownloadQuotePdfController.js` | ✅ |
| B2B → Armazenamento de PDFs | PDF do **contrato** | PDF | `app/utils/generateContractPdf.js` + `app/utils/uploadToMinIO.js` | ✅ |
| B2B → Administrador | Link temporário para baixar o contrato — expira em 5 minutos | URL assinada | `DownloadContractPdfController.js` | ✅ |
| B2B → Hospedagem | Assinar contrato cria a reserva-bloco dos quartos do evento | hoje: mesma transação · após T-01.6: **REST interno, idempotente** | `SignContractController.js` | ✅ transação · 🔵 chamada entre serviços |
| B2B → Hospedagem | Cancelar contrato cancela a reserva-bloco | idem | `CancelContractController.js` | ✅ transação · 🔵 chamada entre serviços |

### 4.4 Indicadores

| Origem → Destino | Dado | Formato | Onde acontece | Existe |
|---|---|---|---|---|
| Administrador/Recepcionista → Indicadores | Período consultado | JSON | `app/Controllers/AnalyticsApi/` — 7 endpoints | ✅ |
| Indicadores → Banco | Consultas de receita, ocupação, sazonalidade, mix de pagamento, ranking e alertas | SQL | idem | ✅ hoje lendo o banco único |
| Hospedagem/Pagamentos → **Outbox** | Evento da alteração, na mesma transação | registro no banco | — | 🟡 |
| Outbox → **RabbitMQ** | Eventos publicados | mensagem (JSON) | — | 🟡 |
| RabbitMQ → Indicadores → **Banco de indicadores** | Evento consumido e projetado | mensagem → SQL | — | 🟡 |

Eventos que o núcleo vai publicar: criação, alteração e remoção de hotel, categoria de quarto,
quarto, hóspede, reserva e pagamento, com as mudanças de status. Lista completa, com o uso de
cada um, na SPEC-01 §5.

---

## 5. Fronteiras e dados sensíveis

Úteis se você quiser marcar fronteiras de confiança ou dados pessoais nos diagramas.

**Fronteiras**
- **Nginx** é a única entrada pública (`k8s/nginx.yaml`)
- **`NetworkPolicy`** restringe quem fala com quem dentro do cluster (`k8s/networkpolicy.yaml`)
- **Rotas públicas sem login:** `/public/:subdomain/*` e `/webhooks/pix`
- **Rotas internas** b2b → core não serão expostas pelo Nginx 🔵

**Dados pessoais em trânsito (LGPD)**
- Hóspede: nome, CPF, e-mail, telefone
- Representante de cliente corporativo: nome e CPF
- PDF de contrato contém dados pessoais — por isso só sai por URL assinada
- **Projeção de hóspede no analytics:** somente id e nome 🟡

---

## 6. Fora do diagrama — não desenhar

| Item | Por quê |
|---|---|
| Notificação ao hóspede | Evolução prevista no ADR-003, sem implementação |
| Channel manager (Booking, Expedia) | Evolução prevista no ADR-003, sem implementação |
| ViaCEP e Mercado Pago | Planejados na SPEC-03, sem implementação |
| Redis | Provisionado, mas não usado por nenhum código |
| Site público e painel `admin` | Pastas de frontend vazias |
| Envio de e-mail | Não existe no código |

---

## 7. Como conferir

```bash
# todas as rotas montadas
cat routes/router.js

# o que cada módulo expõe
ls routes/apis/

# transações que gravam em mais de uma tabela
grep -rlE "sequelize\.transaction" app/Controllers
```

Qualquer dúvida sobre o que existe, confira no código antes de desenhar — é o critério pelo qual
o documento será avaliado.
