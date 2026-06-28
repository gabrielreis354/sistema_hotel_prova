# Sessão — Motor de Reserva Direta + PIX (MVP)

**Data:** 27–28/06/2026
**Dev:** Gabriel (orquestrado via Claude Code)
**Branch:** `feature/motor-reserva-direta-pix` (desenvolvida em git worktree isolado)
**Decisões de produto:** PIX **simulado** (plugável p/ PSP real) + cobrança de **sinal % por hotel**

---

## Contexto e valor

Primeiro diferencial estratégico do produto (ver `docs/ANALISE_PRODUTO_DIFERENCIAIS.md`):
permitir que o hotel **venda direto, sem comissão de OTA**, com pagamento PIX e sinal
antecipado para reduzir no-show. Usa o `subdomain` já existente para identificar o hotel.

## O que foi entregue

### Schema (via `sequelize.sync({ alter: true })`)
- `tenants`: + `booking_enabled` (bool, default true) · + `deposit_percent` (int, default 30, 0–100)
- `reservations`: `user_id` agora **nullable** (reserva online não tem recepcionista) · + `source` (`MANUAL`/`DIRECT`)
- `payments`: + `status` (`PENDING/PAID/EXPIRED`) · `kind` (`FULL/DEPOSIT/BALANCE`) · `provider` · `provider_charge_id` · `pix_qr_code` · `pix_expiration`

> Em base nova (a do professor/colegas), o `model` já cria `user_id` nullable. Em base
> existente, o `sync` não derruba NOT NULL — foi necessário um `ALTER TABLE ... DROP NOT NULL` manual.

### Provider PIX (abstração plugável)
- `app/services/pix/PixProvider.js` (contrato), `FakePixProvider.js` (simulado), `index.js` (factory por env `PIX_PROVIDER`, default `fake`).
- Trocar para PSP real (Mercado Pago/Efí/Asaas) = nova classe + env, **sem mexer em controller**.

### Endpoints
```
PÚBLICO (sem auth, tenant resolvido pelo subdomain):
  GET  /public/:subdomain/hotel                → infos do hotel
  GET  /public/:subdomain/availability         → categorias disponíveis + preço
  POST /public/:subdomain/bookings             → cria reserva PENDING + cobrança PIX do sinal
  GET  /public/:subdomain/bookings/:id/status  → polling do status

WEBHOOK:
  POST /webhooks/pix                           → confirma pagamento → PAID + reserva CONFIRMED (idempotente)
```

### Isolamento multi-tenant
`resolveTenantBySubdomain` centraliza subdomain→tenant + valida `ACTIVE`/`booking_enabled`.
Toda rota pública opera apenas no tenant resolvido. Status escopado por tenant.

## Validação (testes one-shot contra o banco do cluster)
- Disponibilidade Aurora: Standard/Suíte/Presidencial com preços corretos e filtro de capacidade.
- Criar reserva: 3 noites Standard = R$450, sinal 30% = R$135, saldo R$315, reserva PENDING.
- Webhook: PENDING→CONFIRMED, pagamento→PAID com `paid_at`; reenvio = `already_processed` (idempotente).

## Documentação
- Swagger: tag **"Reserva Direta (Público)"** + **"Webhooks"** com todos os endpoints e exemplos.
- Seed: Aurora sinal 30%, Sol 50% (demonstra config por hotel).

## Observação operacional importante
A sessão ocorreu com **outro agente trabalhando em paralelo na mesma working tree**
(módulo analytics), o que causou chaveamentos de branch e perda de contexto. A solução
foi mover esta feature para um **git worktree isolado** (`/home/gabri/hotel-booking-wt`).
**Recomendação:** trabalho concorrente de agentes deve usar worktrees separados.

## Pendências / próximos passos
- Frontend da página pública de reservas (fora do escopo deste MVP de backend).
- Assinatura/validação de webhook quando integrar PSP real.
- Expiração automática de cobranças PENDING vencidas (job) + liberação do quarto.
- Cobrança do saldo (`BALANCE`) no check-in.
- Rate limiting nas rotas públicas.
