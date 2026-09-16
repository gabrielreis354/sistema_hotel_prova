# Delegação — Vulnerabilidade no Webhook PIX 🔴

**Data:** 26/08/2026
**Orquestrador:** Gabriel (J1)
**Para:** Agente Executor — raiz do projeto (`~/sistema_gestao_hotel`)
**Prioridade:** 🔴 **Acima dos PASSOS 4 e 5 da `DELEGACAO_DIVIDA_TECNICA.md`** — é dinheiro
**Origem:** achado 🔴 da auditoria `docs/qa/redteam_public-booking-leak_26ago2026.md`

---

## Prompt de abertura — cole isto na janela do agente

```
Você é o Agente Executor do projeto Gesway (PMS hoteleiro SaaS).

Trabalhe na raiz do projeto: ~/sistema_gestao_hotel. Rode git sempre pelo WSL.

Leia, nesta ordem:
1. DELEGACAO_WEBHOOK_PIX.md    ← esta delegação, leia inteira
2. docs/qa/redteam_public-booking-leak_26ago2026.md  (o achado 🔴, seção "Achados")
3. CLAUDE.md e docs/CODING_STANDARDS.md

CONTEXTO: a auditoria do PASSO 1 encontrou uma vulnerabilidade financeira
PRÉ-EXISTENTE e a reproduziu com a própria suíte do projeto: qualquer pessoa,
sem autenticação, confirma uma reserva sem pagar. Isto tem prioridade sobre os
PASSOS 4 e 5 da delegação de dívida técnica.

Este é o fluxo mais delicado do sistema — mexe em pagamento e na máquina de
estados da reserva. Vá devagar, e não altere nada além do escopo da seção 5.

Ao terminar: npm run qa:checks, npm test, depois o subagente qa-redteam.
NÃO faça merge em develop — quem integra é o orquestrador.
```

---

## 1. A vulnerabilidade

**Reproduzida pela auditoria usando `tests/public-booking.test.js:74-116`:**

```
1. POST /public/aurora/bookings                     (sem auth)
   → 201 { pix: { provider_charge_id: "fake_abc-123", qr_code: "...", ... } }

2. POST /webhooks/pix { provider_charge_id: "fake_abc-123" }
   (sem auth, sem assinatura, sem nada)

3. → 200 { status: 'confirmed', reservation_status: 'CONFIRMED' }
     payment.status = PAID · paid_at preenchido · quarto bloqueado
     ── SEM UM CENTAVO ENTRAR ──
```

### Por que acontece

`app/Controllers/WebhookApi/PixWebhookController.js:20-23` aceita qualquer `POST` e trata `provider_charge_id` como credencial suficiente:

```js
const { provider_charge_id } = request.body;
if (!provider_charge_id) return response.status(400).json(...);
const payment = await PaymentModel.findOne({ where: { provider_charge_id } });
// ...marca PAID e promove a reserva para CONFIRMED
```

Não há verificação de assinatura, IP, HMAC ou origem. O próprio comentário do arquivo (linhas 8-10) reconhece a lacuna: *"Em produção, um PSP real assina a requisição"*.

### Por que o atacante tem a credencial

`CreateBookingController.js:158-162` devolve o `provider_charge_id` **ao cliente anônimo**:

```js
pix: {
    provider_charge_id: charge.providerChargeId,   // ← a credencial de forja
    qr_code: charge.qrCode,
    expiration: charge.expiration
}
```

E mesmo removendo esse campo, **o QR contém o mesmo valor**: `FakePixProvider.js:20-28` monta o payload com `txid=${providerChargeId}` e faz `base64`. Decodificar é trivial.

> **Consequência de desenho:** esconder o `provider_charge_id` **não resolve sozinho**. A correção real é exigir assinatura no webhook — aí saber o txid deixa de bastar.

---

## 2. Objetivo

Tornar impossível confirmar um pagamento sem que a requisição venha comprovadamente do provedor PIX.

---

## 3. Restrições

| Restrição | Motivo |
|---|---|
| **Não quebrar o fluxo de reserva direta** | `tests/public-booking.test.js` é o critério — hoje 221 testes passam |
| Manter o contrato do `PixProvider` | Inversão de dependência é o que permitirá plugar o Mercado Pago (SPEC-03) |
| Idempotência preservada | Reprocessar o mesmo charge não pode duplicar efeito |
| Máquina de estados preservada | Só `PENDING → CONFIRMED`. Nunca tocar `CHECKED_IN`, `CHECKED_OUT`, `CANCELLED` |
| Segredo fora do versionamento | `.env` no `.gitignore`; atualizar `.env.example` |
| Transação Sequelize no fluxo financeiro | Já existe — manter |

---

## 4. Desenho da correção

### 4.1 Assinatura HMAC — correção primária

O contrato `PixProvider` ganha um método de verificação. Cada provider implementa do seu jeito — o `Fake` com HMAC simétrico, um PSP real com o esquema dele.

```
PixProvider (contrato)
  + verifySignature({ rawBody, headers }) → boolean

FakePixProvider
  + assina em createCharge, expondo como o caller deve montar o header
  + verifySignature: HMAC-SHA256 do corpo cru com PIX_WEBHOOK_SECRET
```

**Pontos de atenção técnicos:**

1. **Assinar o corpo cru, não o objeto parseado.** `JSON.stringify(req.body)` pode reordenar chaves e mudar o hash. É preciso capturar o `rawBody` antes do `express.json()`.
2. **Comparação em tempo constante** — `crypto.timingSafeEqual`, nunca `===`. Comparação ingênua vaza informação por tempo de resposta.
3. **Falha de assinatura → 401**, sem revelar se o charge existe. Responder 404 para charge inexistente e 401 para assinatura inválida permite enumerar cobranças.

### 4.2 Parar de expor o `provider_charge_id` — defesa em profundidade

O hóspede precisa do **QR code** para pagar. Não precisa do txid.

- Remover `provider_charge_id` da resposta de `CreateBookingController`
- O acompanhamento do status já usa o **id da reserva** (`GET /public/:subdomain/bookings/:id/status`), não o txid — então nada quebra

> Sozinha, esta medida **não** fecha a falha (o txid está dentro do QR). Ela reduz a superfície; quem fecha é a assinatura.

---

## 5. Tarefas

**Branch:** `fix/pix-webhook-signature`

### T-W.1 — Contrato de verificação no `PixProvider` 🔲

- [ ] **CA-W.1.a** — `PixProvider` declara `verifySignature({ rawBody, headers })`
- [ ] **CA-W.1.b** — `FakePixProvider` implementa com HMAC-SHA256 sobre o corpo cru
- [ ] **CA-W.1.c** — Segredo lido de `PIX_WEBHOOK_SECRET`; **falta do segredo derruba a aplicação no boot**, não silenciosamente em runtime (*fail fast*)
- [ ] **CA-W.1.d** — `.env.example` atualizado com a variável e comentário explicativo
- [ ] **CA-W.1.e** — Comparação com `crypto.timingSafeEqual`

---

### T-W.2 — Webhook exige assinatura válida 🔲

- [ ] **CA-W.2.a** — `PixWebhookController` rejeita requisição sem assinatura válida com **401**
- [ ] **CA-W.2.b** — Corpo cru disponível para verificação (ajuste no `express.json` da rota de webhook)
- [ ] **CA-W.2.c** — Resposta de erro **não distingue** assinatura inválida de charge inexistente — nada de enumeração
- [ ] **CA-W.2.d** — Idempotência preservada: reprocessar charge já `PAID` continua devolvendo `already_processed`
- [ ] **CA-W.2.e** — Máquina de estados intacta: só `PENDING → CONFIRMED`
- [ ] **CA-W.2.f** — Transação Sequelize mantida
- [ ] **CA-W.2.g** — Log de tentativa rejeitada **sem** o corpo da requisição (LGPD — pode conter dado do PSP)

---

### T-W.3 — Remover o `provider_charge_id` da resposta pública 🔲

- [ ] **CA-W.3.a** — `CreateBookingController` não devolve mais `pix.provider_charge_id`
- [ ] **CA-W.3.b** — `qr_code` e `expiration` continuam sendo devolvidos — o hóspede precisa deles
- [ ] **CA-W.3.c** — Nenhum consumidor quebrado: conferir `frontend/` e `tests/`
- [ ] **CA-W.3.d** — Swagger atualizado, se documentar o campo

---

### T-W.4 — Testes que provam a correção 🔲

> **A auditoria do PASSO 1 mostrou que um teste pode passar sem a correção existir.** Aqui isso não pode se repetir: cada teste abaixo tem que **falhar** se a correção for revertida. Verifique isso na prática — reverta, rode, confirme que quebra, restaure.

- [ ] **CA-W.4.a** — Webhook **sem** assinatura → **401**, e o pagamento continua `PENDING`
- [ ] **CA-W.4.b** — Webhook com assinatura **inválida** → **401**, pagamento continua `PENDING`
- [ ] **CA-W.4.c** — Webhook com assinatura **válida** → confirma normalmente (fluxo feliz preservado)
- [ ] **CA-W.4.d** — Reenvio assinado do mesmo charge → `already_processed`, sem duplicar
- [ ] **CA-W.4.e** — **Teste de regressão do ataque:** reproduzir os 3 passos da seção 1 e afirmar que agora falha
- [ ] **CA-W.4.f** — Resposta da criação de reserva não contém `provider_charge_id` em lugar nenhum
- [ ] **CA-W.4.g** — Suíte completa verde

---

### T-W.5 — Corrigir falso positivo da regra 7 do `qa_checks.sh` 🔲

Tarefa menor, aproveitando o contexto. A auditoria identificou:

> *"A regra deriva o nome do recurso do arquivo (`public-booking`), que não é o path. `roomCategoryRouter` tem o mesmo falso positivo (o path é `/room-categories`). Dois dos cinco avisos são ruído."*

- [ ] **CA-W.5.a** — A regra deriva o recurso do **path montado em `routes/router.js`**, não do nome do arquivo
- [ ] **CA-W.5.b** — `publicBookingRouter` e `roomCategoryRouter` deixam de aparecer como aviso
- [ ] **CA-W.5.c** — Os avisos **reais** continuam aparecendo: `contracts`, `corporate-clients`, `event-quotes`
- [ ] **CA-W.5.d** — Sem falso negativo: um router novo sem Swagger ainda é detectado

> ⚠️ Coordene com o PASSO 2 da outra delegação: se a branch `fix/paranoid-unique-constraints` ainda não tiver sido integrada, `scripts/qa_checks.sh` estará modificado lá. **Faça esta tarefa por último**, ou em branch separada depois do merge, para não conflitar.

---

## 6. Definition of Done

- [ ] O ataque da seção 1 não funciona mais, com teste provando
- [ ] Fluxo de reserva direta com PIX íntegro ponta a ponta
- [ ] `tests/public-booking.test.js` verde
- [ ] Suíte completa verde
- [ ] `npm run qa:checks` exit 0
- [ ] `qa-redteam` sem achado 🔴
- [ ] Nenhum segredo versionado

---

## 7. Quando parar e escalar

- Se a correção exigir mudar o **contrato público** de `/public/:subdomain/bookings` além de remover o `provider_charge_id`
- Se a captura do corpo cru quebrar outra rota que depende de `express.json()`
- Se algum teste existente só passar depois de você **editar o teste**
- Se aparecer outro caminho de confirmação de pagamento que a auditoria não mapeou

---

## 8. Fora do escopo

| Item | Por quê |
|---|---|
| Integrar Mercado Pago real | É a SPEC-03; esta delegação só prepara o terreno |
| *Rate limit* nos endpoints públicos | Registrado pela auditoria como "não foi possível verificar"; vira item próprio |
| Rotina de purge para LGPD art. 18, VI | Pendência de produto, não desta branch |
| Ordenação do `.find(kind === 'DEPOSIT')` | 🟢 da auditoria, preventivo — pode entrar se for trivial, mas não é o foco |

---

## 9. Referências

| Documento | Para quê |
|---|---|
| `docs/qa/redteam_public-booking-leak_26ago2026.md` | O achado 🔴 original, com a reprodução passo a passo |
| `DELEGACAO_DIVIDA_TECNICA.md` | Delegação irmã — PASSOS 2 a 5 |
| `docs/specs/SPEC-03-integracoes-externas.md` | Onde o provedor real entra depois |
| `app/services/pix/PixProvider.js` | Contrato a estender |
