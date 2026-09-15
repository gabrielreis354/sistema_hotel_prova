# Análise de Gaps — Módulo de Consumo e Contas
**Desenvolvedor:** Gabriel (orquestrador / Claude Code)
**Data:** 02/08/2026
**Contexto:** Análise das dores reais do cliente (hotéis pequenos/médios) que o sistema atual não resolve.

---

> ## ⚠️ Nota de correção — 02/08/2026
>
> Esta análise foi produzida contra o clone `C:\Users\gabri\sistema_hotel_prova`, que estava na
> `main` em `55eaae0` (PR #36) — **106 commits atrás** da `origin/develop`.
>
> Por isso a afirmação *"Não existe `ConsumptionModel`"* (Cenário 1) **está incorreta** para a base atual.
> A `develop` já possui um módulo de consumo parcial. Ver `docs/BRIEFING_AGENTE_EXECUTOR_02ago2026.md`
> para o estado real e `planejamento_modulo_consumo_02ago2026.md` para as sprints revisadas.
>
> **O diagnóstico de produto abaixo continua válido** — os 5 cenários são reais e o `ConsumptionModel`
> existente resolve apenas o Cenário 1 parcialmente. A abstração `Account` segue sendo a resposta certa.
> O que mudou é o ponto de partida da implementação, não o destino.

---

## O que o sistema resolve hoje

| Cenário | Status |
|---|---|
| Reservar 1 suíte para 1 hóspede | ✅ Funciona |
| Reservar múltiplos quartos em 1 reserva | ✅ Funciona (via pivot) |
| Check-in / Check-out | ✅ Funciona |
| Registrar 1 pagamento por reserva | ✅ Funciona |

---

## Causa raiz dos gaps

O modelo de dados assume que `1 reserva = 1 hóspede = 1 conta = 1 pagamento`.
A realidade de um hotel não é assim.

---

## Gaps por cenário

### Cenário 1 — Família reservando 1 suíte
- ~~Não existe `ConsumptionModel`~~ → **corrigido:** existe, mas é preso a `reservation_id` NOT NULL
- `PaymentModel` anota pagamento feito, não itens consumidos
- Não existe catálogo: cada consumo é digitado como texto livre + valor

### Cenário 2 — Família reservando múltiplas suítes
- `total_amount` calculado só para o quarto principal
- Não existe conta por quarto dentro de uma reserva multi-quarto
- Impossível dizer "R$80 vai para Suíte 101 e R$50 para Suíte 201"

### Cenário 3 — Mesma suíte, hóspedes de famílias diferentes, contas separadas
- Reserva tem 1 `guest_id` — sem hóspede adicional no modelo
- Não existe conceito de split bill ou conta individual por hóspede na mesma suíte

### Cenário 4 — Day-use (buraco mais grave)
- `PaymentModel.reservation_id` é obrigatório — sem reserva, sem pagamento
- `ConsumptionModel.reservation_id` também é obrigatório — sem reserva, sem consumo
- Impossível registrar consumo ou pagamento de quem não dorme no hotel
- Criar "reserva fake" quebraria a integridade do sistema

### Cenário 5 — Garçom anotando consumo com eficiência
- Não existe catálogo de produtos/cardápio
- O endpoint atual (`POST /reservations/:id/consumptions`) exige descrição e valor digitados
- Sem associação pedido → suíte/mesa
- Não existe role `WAITER` — garçom entraria como `RECEPTIONIST` e veria o sistema inteiro

---

## A abstração que resolve tudo: `Account` (Conta/Comanda)

```
Account (Conta)
  id
  tenant_id
  type:          ROOM | DAY_USE | TABLE | DIRECT
  status:        OPEN | CLOSED | PAID
  reservation_id (nullable — null para day-use/externo)
  room_id        (nullable — para débito direto na suíte)
  guest_id       (nullable — responsável pela conta)
  label          "Suíte 201 — João" | "Mesa 5" | "Piscina — Ana"

AccountItem (Linha de consumo)
  id
  account_id
  product_id     (opcional — do catálogo)
  description    "Cerveja Heineken 600ml"
  quantity       2
  unit_price     12.00
  total          24.00
  created_by     (user_id do garçom)

Product (Cardápio)
  id
  tenant_id
  name           "Cerveja 600ml"
  price          12.00
  category       FOOD | DRINK | SERVICE | OTHER
  active         true
```

### Como cada cenário fica resolvido

| Cenário | Solução |
|---|---|
| Família 1 suíte | 1 Account tipo ROOM ligada à reserva |
| Família múltiplas suítes | 1 Account por suíte, todas ligadas à mesma reserva |
| Dois hóspedes, contas separadas | 2 Accounts ligadas à mesma reserva, cada uma com guest diferente |
| Day-use | Account tipo DAY_USE com reservation_id=null |
| Garçom eficiente | Seleciona Account por label, clica produto, informa quantidade |

---

## Fluxo do garçom (como ficaria)

```
1. Abre app → vê lista de Accounts abertas
   ["Suíte 201 - João", "Mesa 3 - Day-use Ana"]

2. Toca em "Suíte 201 - João" → abre cardápio

3. Toca "Cerveja 600ml" → quantidade: 2 → confirma
   POST /accounts/:id/items  { product_id, quantity: 2 }
   Sistema calcula: 2 × 12.00 = 24.00

4. No check-out:
   GET /accounts/:id/bill → diárias + consumos = Total
   POST /accounts/:id/close
   POST /payments { account_id, amount, method }
```

---

## Prioridade de implementação

| Prioridade | Feature | Impacto |
|---|---|---|
| 1 (crítico) | Product + AccountItem | Sem isso, nenhum consumo é registrado com catálogo |
| 2 (crítico) | Account tipo ROOM + migração do `Consumption` existente | Vincula consumo à estadia sem duplicar fonte da verdade |
| 3 (alto) | Day-use (Account tipo DAY_USE) | Receita que hoje se perde |
| 4 (alto) | Múltiplas Accounts por reserva | Split bill |
| 5 (médio) | GuestReservation (hóspedes adicionais) | Útil mas não bloqueia financeiro |
| 6 (médio) | ~~Endpoint /bill consolidado~~ → **refatorar o existente** | `GET /reservations/:id/bill` já existe |

---

## Documentos relacionados

- `docs/BRIEFING_AGENTE_EXECUTOR_02ago2026.md` — **leia primeiro**: estado real da base
- `docs/historico_sessao/gabriel/planejamento_modulo_consumo_02ago2026.md` — sprints revisadas
- `docs/frontend/PLANEJAMENTO_FRONTEND.md` — como este módulo aparece na interface (§8)
