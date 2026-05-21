# 🏨 Análise de Cobertura de Funcionalidades
## Público-Alvo: Hotéis Pequenos e Médios (5-80 quartos)

**Data**: Maio 2026
**Contexto**: Avaliação do que o sistema atual cobre vs o que o mercado exige

---

## 🎯 O que um Hotel Pequeno/Médio realmente precisa

Antes de listar funcionalidades, é importante entender o **dia a dia operacional** do nosso público-alvo:

```
Rotina de uma recepcionista de pousada típica:

06:00 ─ Ver check-outs previstos para hoje
07:00 ─ Preparar lista de quartos que precisam limpeza
09:00 ─ Processar check-outs
10:00 ─ Atualizar status de quartos para limpeza
11:00 ─ Ver check-ins previstos para hoje
12:00 ─ Responder reservas que chegaram pelo WhatsApp/Booking.com
14:00 ─ Processar check-ins
15:00 ─ Cobrar hospedagem, emitir recibo
16:00 ─ Lançar consumos extras do hóspede (frigobar, serviços)
18:00 ─ Fechar caixa do dia (relatório de receita)
```

Cada um desses momentos representa uma **funcionalidade necessária**.

---

## ✅ O que o Sistema Atual JÁ Atende

### Cobertura Atual: 38% das funcionalidades de mercado

```
█████████░░░░░░░░░░░░░░░░░  38% de cobertura
```

| Módulo | Funcionalidade | Status | Observação |
|--------|---------------|--------|------------|
| **Auth** | Login | ✅ Implementado | JWT |
| **Auth** | Registro de usuário | ✅ Implementado | - |
| **Auth** | Controle de roles | ✅ Implementado | ADMIN, RECEPTIONIST |
| **Auth** | Proteção de rotas | ✅ Implementado | - |
| **Quartos** | Cadastrar quarto | ✅ Implementado | - |
| **Quartos** | Categorias de quarto | ✅ Implementado | RoomCategory |
| **Quartos** | Listar quartos | ✅ Implementado | - |
| **Quartos** | Atualizar quarto | ✅ Implementado | - |
| **Quartos** | Remover quarto | ✅ Implementado | - |
| **Quartos** | Listar quartos disponíveis | ✅ Implementado | - |
| **Quartos** | Status (AVAILABLE, OCCUPIED, MAINTENANCE, CLEANING) | ✅ Implementado | - |
| **Hóspedes** | Cadastrar hóspede | ✅ Implementado | CPF único |
| **Hóspedes** | Listar hóspedes | ✅ Implementado | - |
| **Hóspedes** | Buscar hóspede | ✅ Implementado | - |
| **Hóspedes** | Atualizar hóspede | ✅ Implementado | - |
| **Hóspedes** | Remover hóspede | ✅ Implementado | - |
| **Reservas** | Criar reserva | ✅ Implementado | Com totalAmount |
| **Reservas** | Listar reservas | ✅ Implementado | - |
| **Reservas** | Buscar reserva | ✅ Implementado | - |
| **Reservas** | Cancelar reserva | ✅ Implementado | - |
| **Reservas** | Check-in | ✅ Implementado | Muda status quarto |
| **Reservas** | Check-out | ✅ Implementado | Libera quarto |
| **Regras** | Conflito de reservas | ✅ Implementado | - |
| **Regras** | Status automático no check-in/out | ✅ Implementado | - |

### Avaliação do que está implementado

O núcleo operacional está correto. O sistema consegue sustentar o **fluxo principal**: Hóspede chega → Reserva → Check-in → Check-out. Isso é a espinha dorsal de qualquer PMS.

---

## ❌ O que está FALTANDO para o mercado

### Análise por Prioridade

---

### 🔴 PRIORIDADE ALTA — Bloqueadores de venda

> Sem essas funcionalidades, a maioria dos hotéis **não adotaria** o sistema.

#### 1. Frontend / Interface Visual

```
Situação atual: Apenas API (Swagger)
Impacto: CRÍTICO — recepcionista não usa terminal

O que falta:
├─ Dashboard principal com resumo do dia
├─ Calendário visual de reservas (timeline/mapa)
├─ Formulário de reserva com UX simples
├─ Mapa de quartos (visual do andar)
└─ Interface de check-in/check-out

Tecnologia sugerida: Next.js ou React
Esforço estimado: 2-3 meses
```

#### 2. Financeiro Básico — Pagamentos e Recibos

```
Situação atual: totalAmount calculado, mas sem controle de pagamento
Impacto: ALTO — hotel precisa registrar se foi pago

O que falta:
├─ Status de pagamento na reserva (PENDING, PARTIAL, PAID)
├─ Registro de pagamento (forma: PIX, dinheiro, cartão)
├─ Emissão de recibo simples (PDF)
├─ Consumos extras (frigobar, lavanderia, tours)
└─ Fechamento de caixa do dia

Entidades novas:
├─ Payment: id, reservationId, amount, method, date
└─ Consumption: id, reservationId, description, amount, date

Esforço estimado: 3-4 semanas
```

#### 3. Relatório de Ocupação

```
Situação atual: Nenhum relatório
Impacto: ALTO — gestor precisa saber performance do negócio

O que falta:
├─ Taxa de ocupação (% quartos ocupados no período)
├─ Receita por período (diária/semanal/mensal)
├─ Hóspedes ativos hoje
├─ Check-ins e check-outs previstos para hoje
└─ Quartos disponíveis por categoria

Esforço estimado: 1-2 semanas (backend)
```

---

### 🟡 PRIORIDADE MÉDIA — Importantes para retenção

> Sem essas, o hotel **até adota**, mas tende a trocar por um concorrente que tem.

#### 4. Preço Dinâmico / Gestão de Tarifas

```
Situação atual: Preço fixo por categoria (pricePerNight)
Impacto: MÉDIO — hotéis pequenos cobram diferente em alta/baixa temporada

O que falta:
├─ Tabela de preços por período (RatePlan)
├─ Preço por dia da semana (fim de semana mais caro)
├─ Promoções e descontos
└─ Preço calculado dinamicamente na reserva

Entidade nova:
└─ RatePlan: id, categoryId, name, startDate, endDate, pricePerNight

Esforço estimado: 2-3 semanas
```

#### 5. Governança de Quartos (Housekeeping)

```
Situação atual: Status CLEANING existe, mas sem fluxo de trabalho
Impacto: MÉDIO — camareira precisa saber o que limpar

O que falta:
├─ Lista de quartos para limpeza (após check-out)
├─ Atribuição de camareira por quarto
├─ Confirmação de limpeza concluída
└─ Inspeção antes de liberar quarto

Esforço estimado: 2-3 semanas
```

#### 6. Gestão de Usuários Mais Completa

```
Situação atual: Roles ADMIN e RECEPTIONIST, mas sem permissões granulares
Impacto: MÉDIO — em hotéis com equipe maior precisa controlar acessos

O que falta:
├─ Permissões por módulo (pode ver relatório? pode deletar hóspede?)
├─ Log de ações por usuário (auditoria)
├─ Múltiplos usuários por role
└─ Redefinição de senha

Esforço estimado: 2 semanas
```

#### 7. Histórico de Hóspede

```
Situação atual: Dado do hóspede existe, mas sem histórico de visitas
Impacto: MÉDIO — fidelização é essencial no setor

O que falta:
├─ Todas as reservas de um hóspede
├─ Total de noites hospedadas
├─ Preferências do hóspede (quarto preferido, observações)
├─ Classificação (VIP, frequente)
└─ Notas internas sobre o hóspede

Entidade: guest_notes, guest_preferences
Esforço estimado: 1-2 semanas
```

---

### 🟢 PRIORIDADE BAIXA — Diferenciais competitivos

> Funcionalidades que colocam o produto **acima dos concorrentes** diretos.

#### 8. Notificações Automáticas

```
O que falta:
├─ Email de confirmação de reserva
├─ Lembrete de check-in (1 dia antes)
├─ Email de agradecimento pós check-out
└─ WhatsApp Business API (grande diferencial BR)

Esforço estimado: 2-3 semanas
```

#### 9. Channel Manager (Integração com OTAs)

```
O que falta:
├─ Integração com Booking.com
├─ Integração com Airbnb
├─ Sincronização de disponibilidade em tempo real
└─ Sincronização de tarifas

Impacto: MUITO ALTO para hotéis que dependem de OTAs
Esforço estimado: 2-3 meses (complexo)
Observação: Este é o maior gap de produto mas o mais difícil
```

#### 10. Configuração do Hotel

```
O que falta:
├─ Perfil do hotel (nome, logo, CNPJ, endereço)
├─ Horários padrão de check-in e check-out
├─ Política de cancelamento
├─ Forma de pagamento aceitas
└─ Configurações de e-mail

Esforço estimado: 1 semana
```

#### 11. Relatórios Gerenciais Avançados

```
O que falta:
├─ RevPAR (Revenue per Available Room)
├─ ADR (Average Daily Rate)
├─ Ranking de quartos mais ocupados
├─ Relatório de hóspedes recorrentes
├─ Comparativo mês a mês
└─ Exportação CSV/PDF

Esforço estimado: 2-3 semanas
```

#### 12. Nota Fiscal Eletrônica (NF-e/NFS-e)

```
O que falta:
├─ Integração com SEFAZ (NF-e)
├─ NFS-e Municipal (nota de serviço)
└─ Relatório fiscal mensal

Impacto: Obrigatório para hotéis formais no Brasil
Esforço estimado: 3-4 semanas (integração complexa)
```

---

## 📊 Mapa Completo de Cobertura

```
MÓDULO                     COBERTURA ATUAL
─────────────────────────────────────────────────────
Autenticação               ██████████ 100%
Quartos (CRUD)             ██████████ 100%
Quartos (Status)           ██████████ 100%
Categorias de Quarto       ██████████ 100%
Hóspedes (CRUD)            ██████████ 100%
Reservas (CRUD)            ██████████ 100%
Check-in / Check-out       ██████████ 100%
Regras de Conflito         ██████████ 100%
──────────────────── LINHA DO QUE TEMOS ──────────────
Financeiro/Pagamentos      ██░░░░░░░░  20%  (totalAmount existe)
Relatórios                 ░░░░░░░░░░   0%
Tarifas Dinâmicas          ░░░░░░░░░░   0%
Housekeeping               ██░░░░░░░░  20%  (status existe)
Histórico de Hóspede       ░░░░░░░░░░   0%
Notificações               ░░░░░░░░░░   0%
Configurações do Hotel     ░░░░░░░░░░   0%
Rel. Gerenciais (KPIs)     ░░░░░░░░░░   0%
Channel Manager            ░░░░░░░░░░   0%
Nota Fiscal (NF-e)         ░░░░░░░░░░   0%
Frontend / Interface       ░░░░░░░░░░   0%
─────────────────────────────────────────────────────
TOTAL                      ████░░░░░░  38%
```

---

## 🗓️ Roadmap de Evolução por Fase

### Demo (Agora) — 38% ✅

Manter o foco no que está sendo construído. Não adicionar complexidade.

```
Entrega Demo:
✅ Auth completo
✅ CRUD Quartos + Categorias
✅ CRUD Hóspedes
✅ Reservas + Check-in/out
✅ Docker Swarm
✅ Swagger
```

---

### TCC — Meta: 65%

Adicionar camadas de negócio que transformam o CRUD em um sistema real:

```
Adicionar no TCC:
┌──────────────────────────────────────────────┐
│  Financeiro Básico                           │
│  ├─ Entidade Payment (forma + status)        │
│  ├─ Consumos extras (Consumption)            │
│  └─ Endpoint de fechamento de caixa          │
│                                              │
│  Relatórios                                  │
│  ├─ GET /reports/occupancy?from=&to=         │
│  ├─ GET /reports/revenue?from=&to=           │
│  └─ GET /reports/today                       │
│                                              │
│  Tarifas Dinâmicas                           │
│  ├─ Entidade RatePlan                        │
│  └─ Cálculo automático por período           │
│                                              │
│  Histórico de Hóspede                        │
│  └─ GET /guests/:id/history                  │
│                                              │
│  Multi-Tenant (fundação)                     │
│  ├─ tenant_id em todas as entidades          │
│  └─ Middleware de isolamento                 │
└──────────────────────────────────────────────┘
```

---

### Produto Beta (pós-TCC) — Meta: 80%

Adicionar o que é necessário para os primeiros clientes pagantes:

```
Adicionar no Beta:
┌──────────────────────────────────────────────┐
│  Frontend (React/Next.js)                    │
│  ├─ Dashboard principal                      │
│  ├─ Calendário de reservas                   │
│  └─ Formulários básicos                      │
│                                              │
│  Notificações                                │
│  ├─ Email de confirmação de reserva          │
│  └─ WhatsApp (diferencial BR)                │
│                                              │
│  Configurações do Hotel                      │
│  └─ Perfil, horários, políticas              │
│                                              │
│  Billing/SaaS                                │
│  ├─ Planos (FREE/BÁSICO/PREMIUM)             │
│  └─ Cobrança via PagSeguro/Stripe            │
└──────────────────────────────────────────────┘
```

---

### Produto Maduro (v1.0) — Meta: 95%

```
Adicionar para competir com Cloudbeds/Hits:
┌──────────────────────────────────────────────┐
│  Channel Manager                             │
│  ├─ Booking.com API                          │
│  └─ Airbnb API                               │
│                                              │
│  Nota Fiscal (NF-e/NFS-e)                   │
│  └─ Integração SEFAZ                         │
│                                              │
│  Relatórios Avançados                        │
│  ├─ RevPAR, ADR                              │
│  └─ Exportação PDF                           │
│                                              │
│  Housekeeping Completo                       │
│  └─ App para camareira                       │
└──────────────────────────────────────────────┘
```

---

## 💡 Prioridade de Implementação Sugerida

Se houvesse que escolher **as próximas 3 funcionalidades** a adicionar (além do que existe), seriam:

```
1º  💳 Financeiro Básico (Pagamentos)
    └─ Motivo: Hotel não vive sem saber se foi pago.
       É o gap mais crítico que impede uso real.

2º  📊 Relatório do Dia / Ocupação
    └─ Motivo: Gestor precisa do resumo do dia.
       Feature de alto valor, baixo esforço.

3º  🎨 Frontend Mínimo (Dashboard)
    └─ Motivo: Recepcionista não usa API.
       Sem interface, ninguém adota o sistema.
```

---

## 📝 Conclusão

O sistema atual tem uma **base sólida e bem estruturada**. O núcleo operacional — reservas, quartos, hóspedes, check-in/out — está coberto corretamente.

Para a **Demo acadêmica**: o projeto está no caminho certo e é tecnicamente impressionante pelo foco em infra/backend.

Para o **TCC**: a prioridade é financeiro básico, relatórios e tarifas dinâmicas — funcionalidades que diferenciam um sistema de um CRUD avançado.

Para o **Produto de mercado**: o Channel Manager e o frontend são os maiores saltos de valor. O Channel Manager especialmente é o que faz hotéis pequenos **dependerem** do sistema — sem ele, ainda precisam acessar Booking.com manualmente.

---

| Fase | Cobertura | Hotéis que adotariam |
|------|-----------|---------------------|
| Demo (atual) | 38% | Nenhum (sem frontend) |
| TCC | 65% | Entusiastas técnicos |
| Produto Beta | 80% | Pousadas e hotéis pequenos |
| Produto Maduro | 95% | Hotéis pequenos e médios pleno |

**Documento**: Análise de Cobertura de Funcionalidades | **Versão**: 1.0 | **Maio 2026**
