# 🗺️ Product Roadmap — PMS Hotel
## Progressão: Demo → TCC → Produto de Mercado

**Público-alvo**: Hotéis e pousadas pequenos/médios (5–80 quartos)
**Modelo**: SaaS Multi-Tenant
**Data**: Maio 2026

---

## 📊 Cobertura por Fase

```
FUNCIONALIDADE                       DEMO   TCC   MERCADO
──────────────────────────────────────────────────────────
── CORE ──
Auth + Roles                          ✅     ✅     ✅
CRUD Quartos + Categorias             ✅     ✅     ✅
CRUD Hóspedes                         ✅     ✅     ✅
Reservas + Check-in/out               ✅     ✅     ✅
Regras de conflito                    ✅     ✅     ✅
Multi-tenant schema + repositories    ✅     ✅     ✅
──────────────────────────────────────────────────────────
── MÓDULO FINANCEIRO ──
Pagamentos por reserva                ✗      ✅     ✅
Consumos extras                       ✗      ✅     ✅
Fechamento de conta (bill)            ✗      ✅     ✅
── MÓDULO RELATÓRIOS ──
Relatório diário                      ✗      ✅     ✅
Ocupação por período                  ✗      ✅     ✅
Receita por período                   ✗      ✅     ✅
── MÓDULO TARIFAS ──
RatePlan (preços por período)         ✗      ✅     ✅
── MÓDULO HÓSPEDE ──
Histórico de estadias                 ✗      ✅     ✅
Notas internas (VIP, preferências)    ✗      ✅     ✅
── ONBOARDING ──
Cadastro self-service de hotel        ✗      ✅     ✅
Testes automatizados                  ✗      ✅     ✅
──────────────────────────────────────────────────────────
Frontend web                          ✗      ✗      ✅
Housekeeping                          ✗      ✗      ✅
Notificações (email/WhatsApp)         ✗      ✗      ✅
Configurações do hotel                ✗      ✗      ✅
Channel Manager (Booking/Airbnb)      ✗      ✗      ✅
Nota Fiscal (NFS-e)                   ✗      ✗      ✅
Billing / Planos SaaS                 ✗      ✗      ✅
──────────────────────────────────────────────────────────
COBERTURA                            44%    74%    95%+
```

---

## 🎓 Fase 1 — Demo (Projeto ADS)

**Objetivo**: Provar competência técnica em backend + infraestrutura.

### O que entregar

```
Core PMS
├── Auth: register, login, JWT com tenantId, roles (ADMIN, RECEPTIONIST)
├── Quartos: CRUD + categorias + status + disponibilidade por datas
├── Hóspedes: CRUD completo
└── Reservas: criar, check-in, check-out, cancelar + regras de negócio

Multi-tenant Schema (fundação completa — sem retrabalho no TCC)
├── Tabela tenants com 1 registro seedado
├── tenantId em todos os models + UUID PKs + soft delete
├── Repositories já filtrando por tenantId
└── Middleware lendo tenantId do JWT

Infraestrutura
├── Docker Compose (local)
├── Docker Swarm com 3 réplicas do backend
├── Nginx como reverse proxy
└── PostgreSQL containerizado

Qualidade
├── TypeScript sem erros
├── Swagger documentado
└── Código organizado (SOLID, DRY, KISS)
```

### O que NÃO faz parte da Demo

```
✗ Módulos complementares (Financeiro, Relatórios, Tarifas, Hóspede)
✗ Onboarding self-service de novos hotéis (POST /tenants)
✗ Frontend
✗ Testes automatizados
```

### Timeline

| Semana | Entrega |
|--------|---------|
| 1-2 | Setup + Docker + PostgreSQL + Models + seed do tenant |
| 3-4 | Auth com JWT (tenantId) + CRUD Quartos + Categorias |
| 5-6 | CRUD Hóspedes + Reservas + Regras de negócio |
| 7-8 | Docker Swarm + Swagger + Apresentação |

---

## 📚 Fase 2 — TCC

**Objetivo**: Evoluir o Core PMS com módulos de negócio complementares — a mesma estrutura que, no produto, se transforma em planos pagos.

A lógica de módulos: o Core funciona sozinho para um hotel básico. Cada módulo agrega valor específico que justifica um plano superior. O TCC implementa todos, mas a arquitetura já está preparada para ativação seletiva por tenant.

---

### Módulo Financeiro

**Por que é módulo separado**: pousadas simples não precisam. Hotéis com restaurante, bar ou spa precisam urgentemente registrar consumos e fechar contas.

```
Entidades novas:
  Payment:     id, tenantId, reservationId, amount, method (PIX/DINHEIRO/CARTÃO), paidAt
  Consumption: id, tenantId, reservationId, description, amount, date

Endpoints:
  POST /reservations/:id/payments      → registrar pagamento
  POST /reservations/:id/consumptions  → lançar consumo extra
  GET  /reservations/:id/bill          → conta fechada (reserva + consumos − pagamentos)
```

---

### Módulo Relatórios

**Por que é módulo separado**: donos de hotel tomam decisões por Excel hoje. Qualquer relatório automático já é um salto enorme — e justifica assinar um plano superior.

```
Endpoints:
  GET /reports/today      → hóspedes no hotel agora, check-ins/outs do dia, quartos disponíveis

  GET /reports/occupancy?from=&to=
      → taxa de ocupação (%), diárias vendidas, quartos mais/menos ocupados

  GET /reports/revenue?from=&to=
      → receita bruta, ticket médio, receita por categoria de quarto
```

---

### Módulo Tarifas (RatePlan)

**Por que é módulo separado**: hotéis em destinos sazonais (litoral, serra, feriados) cobram preços diferentes por período — revenue management básico.

```
Entidade nova:
  RatePlan: id, tenantId, categoryId, name, pricePerNight, startDate, endDate

Lógica ao criar reserva:
  → busca RatePlan vigente para o período
  → se existe: usa pricePerNight do RatePlan por noite
  → se não existe: usa pricePerNight da RoomCategory (fallback)
```

---

### Módulo Hóspede

**Por que é módulo separado**: fundamental para hotéis com fidelização. Identifica VIPs, preferências e histórico de gasto — base para um programa de relacionamento.

```
Novos campos em Guest:
  notes (texto livre: "prefere andar alto", "alérgico a penas", "hóspede VIP")

Novo endpoint:
  GET /guests/:id/history
      → todas as reservas, total de noites, total gasto, primeira e última estadia
```

---

### Onboarding Multi-Tenant

**Por que é TCC e não Demo**: na demo existe 1 hotel seedado. O onboarding é a feature que "abre" o sistema para novos hotéis se cadastrarem de forma autônoma.

```
Novos endpoints:
  POST /tenants     → cria hotel + usuário admin inicial
  GET  /tenants/:id → dados do tenant (para admin do sistema)

O middleware e os repositories não mudam — o código é idêntico.
Só o dado muda: sai o tenant seedado, entram hotéis reais.
```

---

### Qualidade e Infraestrutura

```
Testes automatizados (mínimo 60% coverage):
  ├── RN-01: conflito de reservas
  ├── RN-05: cálculo de totalAmount com e sem RatePlan
  ├── Isolamento de tenant (hotel A nunca vê dados do hotel B)
  └── Transições de status (check-in, check-out, cancelar)

GitHub Actions: roda lint + testes a cada push
Docker Swarm: stack completo com health checks e restart policy
```

### Timeline

| Mês | Entrega |
|-----|---------|
| 1 | Onboarding (POST /tenants) + testes de isolamento |
| 2 | Módulo Financeiro (Payment + Consumption + bill) |
| 3 | Módulo Relatórios + Módulo Tarifas (RatePlan) |
| 4 | Módulo Hóspede + testes + CI/CD |
| 5-6 | Documentação técnica + Swagger completo + defesa |

---

## 🚀 Fase 3 — Produto de Mercado

**Objetivo**: Vender para hotéis reais. Receita mensal recorrente (MRR).

### O que adicionar

#### Frontend (React / Next.js) — Bloqueador principal
```
Telas essenciais:
  Dashboard   → ocupação do dia, check-ins/outs de hoje, receita da semana
  Reservas    → calendário visual por quarto e data
  Formulário  → criar reserva com UX simples para recepcionista
  Check-in/out → tela rápida de confirmação
```

#### Notificações
```
  Email de confirmação ao criar reserva
  Lembrete 1 dia antes do check-in
  WhatsApp Business API (maior diferencial BR)
```

#### Configurações do Hotel
```
Entidade: HotelSettings
  nome, logo, CNPJ, endereço, telefone
  horário padrão check-in / check-out
  política de cancelamento
  formas de pagamento aceitas
```

#### Housekeeping
```
Entidade: HousekeepingTask
  roomId, type (CLEANING/INSPECTION), assignedTo, status, completedAt

Fluxo automático:
  check-out → cria task de limpeza
  camareira confirma → quarto volta para AVAILABLE
```

#### Channel Manager — Maior diferencial de retenção
```
  Booking.com Connectivity API → sincroniza disponibilidade + recebe reservas
  Airbnb API                   → sincroniza calendário + recebe reservas

  Uma vez integrado, o hotel não abandona o sistema.
```

#### Nota Fiscal (NFS-e)
```
  Emissão de NFS-e municipal (serviço de hospedagem)
  Integração com prefeitura via WebService
  Relatório fiscal mensal
```

#### Billing SaaS
```
Planos:
  FREE     → até 5 quartos, 20 reservas/mês, 1 usuário       R$ 0/mês
  BÁSICO   → até 30 quartos, ilimitado, 3 usuários           R$ 299-499/mês
  PREMIUM  → ilimitado + integrações + suporte prioritário   R$ 799-1.299/mês

Integração: PagSeguro ou Stripe
Cobrança automática mensal + portal do cliente
```

### Timeline

| Período | Entrega |
|---------|---------|
| Mês 1-3 pós-TCC | Frontend básico (dashboard + reservas + check-in/out) |
| Mês 4-5 | Notificações + Configurações do hotel + Billing |
| Mês 6 | Beta fechado com 5 hotéis reais (gratuito) |
| Mês 7-9 | Feedback + correções + Channel Manager |
| Mês 10-12 | Lançamento comercial, primeiros pagantes |

### Modelo de Receita (Projeção)

```
Com 50 clientes no plano BÁSICO:  R$ 15.000-25.000/mês MRR
Com 10 clientes no PREMIUM:       R$ 8.000-13.000/mês MRR
Total estimado (60 clientes):     R$ 23.000-38.000/mês
```

---

## 🏨 Contexto de Mercado

| Sistema | Segmento | Preço |
|---------|----------|-------|
| Cloudbeds | Pequeno/Médio | $150-500/mês |
| Little Hotelier | Pequeno | $100-300/mês |
| Hits Hotel (BR) | Pequeno/Médio | R$ 200-800/mês |
| Totvs Hotelaria (BR) | Médio | R$ 500-2.000/mês |
| Oracle OPERA | Grande/Enterprise | $1.000-5.000+/mês |

**Nicho alvo**: 30.000-50.000 pousadas e hotéis independentes no Brasil que ainda usam Excel ou sistemas ultrapassados.

---

## 🏗️ Fundação SaaS — O que aplicar desde a Demo

A decisão certa é implementar o schema e os repositories com multi-tenant completo desde a demo. O custo é mínimo — são as mesmas tabelas e o mesmo código — mas o benefício é eliminar 100% do retrabalho de banco e ORM no TCC.

**O que muda entre as fases não é o código — é o dado.** Na demo há 1 tenant seedado. No TCC, qualquer hotel pode se cadastrar.

### Decisões que custam zero e salvam a reescrita

| Decisão | Por que agora? | Custo de fazer depois |
|---------|---------------|-----------------------|
| UUID como PK em todos os models | Auto-increment colide entre tenants, expõe volume de dados | Migration + refatoração de todas as FKs |
| `tenant_id` em todas as tabelas com 1 tenant seedado | Estrutura idêntica em demo e produção | Migration em cada tabela + queries espalhadas no código |
| Soft delete (`paranoid: true`) | SaaS nunca deleta dados — auditoria, LGPD, recuperação | Adicionar `deletedAt` em produção com dados é arriscado |
| Timestamps em tudo (`createdAt`, `updatedAt`) | Base para relatórios, auditoria e histórico | Sem histórico retroativo, sem relatórios precisos |

### Decisões arquiteturais que moldam a manutenibilidade

**Repository Pattern** — toda query ao banco passa pelo repository, que já recebe `tenantId` como parâmetro desde a demo. O contrato é o mesmo em todas as fases:

```
// Demo, TCC e Produto — mesmo código
findAll(tenantId: string): Promise<Room[]>
findById(id: string, tenantId: string): Promise<Room | null>
```

**Tenant middleware** — lê `tenantId` do JWT desde a demo. Na demo o JWT aponta para o tenant seedado. No TCC aponta para o hotel cadastrado. O middleware não muda.

**JWT payload com `tenantId`** — estrutura do token é a mesma nas 3 fases. Só o valor do `tenantId` muda de acordo com o tenant cadastrado.

**Módulo de configuração centralizado** — sem `process.env.X` espalhado pelo código. Um `config.ts` tipado que centraliza tudo. Facilita adicionar configurações por tenant depois.

**Estrutura modular por domínio** — pastas organizadas por módulo (`rooms/`, `guests/`, `reservations/`) em vez de por camada. Cada módulo é independente e pode evoluir sem tocar nos outros.

### Como cada decisão evolui por fase

```
                DEMO                    TCC                     PRODUTO
                ─────────────────────────────────────────────────────────
tenant_id       Schema completo,        igual                    igual
                1 tenant seedado
Repository      findAll(tenantId)       igual + paginação        + cache + índices
Middleware      Lê tenantId do JWT      igual                    + valida plano e limites
JWT payload     {userId, role,          igual                    + features do plano
                 tenantId}
UUIDs           ✅                      ✅                       ✅
Soft delete     ✅                      ✅                       ✅
```

O código da demo é idêntico ao do TCC. A única diferença é que o banco tem 1 hotel seedado em vez de N hotéis cadastrados.

---

## 🔑 Decisões Arquiteturais por Fase

| Aspecto | Demo | TCC | Produto |
|---------|------|-----|---------|
| Tenants | Schema completo, 1 seedado | + Onboarding self-service | + Billing + planos |
| Banco | Shared + tenant_id | igual + índices | Shared → DB dedicado (premium) |
| Infra | Compose + Swarm | Swarm stack completo | Cloud (AWS/GCP) + K8s |
| Auth | JWT com tenantId | igual | + 2FA + OAuth |
| Deploy | Manual | GitHub Actions | CI/CD automático |
| Testes | Manual | 60%+ cobertura | 80%+ cobertura |

---

**Versão**: 2.0 | **Maio 2026**

