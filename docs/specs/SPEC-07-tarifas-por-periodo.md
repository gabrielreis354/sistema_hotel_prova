# SPEC-07 — Tarifas por Período

**Prioridade:** 🟠 Alta para o produto · 🟢 Não exigida pelo Termo de Aceite
**Estado:** 🔲 Não iniciado
**Criado em:** 09/09/2026
**Depende de:** nada — pode começar a qualquer momento
**Origem:** `docs/frontend/REQUISITOS_TELAS_PMS_09set2026.md` §3.8 (RT-39 a RT-43)

---

## 1. Contexto

A tarifa do Gesway é **um número por categoria**: `RoomCategoryModel.price_per_night`, do tipo `DECIMAL(10,2)`. Não há período, não há dia da semana, não há mínimo de noites.

Nenhum hotel opera assim. Um fim de semana custa mais que uma terça-feira; um feriado prolongado custa mais que o fim de semana e costuma exigir estadia mínima; a alta temporada é outro patamar. Um sistema que só sabe um preço obriga o hotel a **editar a categoria toda vez que a estação muda** — e a perder o histórico do que foi cobrado.

Esta Spec nasceu separada da SPEC-05 de propósito. O levantamento de telas descreveu o calendário de tarifas como requisito de interface (RT-42), mas a maior parte do trabalho é servidor: entidade nova, regra de precedência e motor de cálculo. Enfiar isso na Spec de frontend faria a estimativa estourar sem que ninguém entendesse por quê.

---

## 2. Objetivo

Permitir que o hotel defina o preço da diária por período e por categoria, com precedência clara sobre a tarifa base, e que **todo cálculo de valor de estadia no sistema passe pelo mesmo motor** — reserva de balcão, reserva direta pelo site e orçamento de grupo.

---

## 3. Escopo

### 3.1 Dentro

- Entidade de tarifa por período, por categoria de quarto
- Regra de precedência sobre a tarifa base da categoria
- Preço diferenciado para fim de semana dentro do período
- Mínimo de noites por período
- Fechamento de venda de uma data sem apagar a tarifa
- Motor único de cálculo de estadia, reutilizado por todos os caminhos de venda
- Exposição da tarifa aplicada na consulta pública de disponibilidade

### 3.2 Fora

| Fora | Motivo |
|---|---|
| Preço dinâmico por demanda (*revenue management*) | Precisa de histórico de ocupação que o sistema ainda não tem |
| Tarifa por canal de venda | Só faz sentido com *channel manager*, fora do escopo do projeto |
| Tarifa por ocupação (individual, casal, terceira pessoa) | Padrão de mercado, mas dobra a modelagem; entra depois se houver prazo |
| Cupom e promoção | Desconto já existe no orçamento de evento (RF-030) |
| Pacote (diária + refeição) | O orçamento de grupo já resolve o caso B2B |

---

## 4. Restrições

- **A tarifa base não desaparece.** `price_per_night` da categoria continua sendo o preço válido quando nenhum período cobre a data. Remover isso quebraria todo hotel sem tarifa cadastrada.
- **Preço nunca vem do cliente.** Vale para reserva direta e para orçamento — regra já estabelecida em RF-030.
- **`DECIMAL` chega do `pg` como string.** `Number()` em valor monetário é bug financeiro.
- **Períodos da mesma categoria não podem se sobrepor.** O projeto já resolve sobreposição de intervalo no banco, com `EXCLUDE USING gist` — o mesmo padrão se aplica aqui.

---

## 5. Tarefas

### T-07.1 — Modelagem da tarifa por período 🔲 *(~2 dias)*

Entidade `rate_periods`: `tenant_id`, `category_id`, `start_date`, `end_date`, `price_per_night`, `weekend_price_per_night` (opcional), `min_nights`, `closed`.

**Critérios de aceitação**
- [ ] **CA-07.1.a** — Model Sequelize com UUID, `tenant_id` obrigatório e soft delete
- [ ] **CA-07.1.b** — Índice único parcial onde couber unicidade, com `WHERE deleted_at IS NULL` — o padrão da SPEC-06 vale aqui desde o primeiro dia
- [ ] **CA-07.1.c** — `EXCLUDE USING gist` impedindo dois períodos sobrepostos para a mesma categoria, ignorando linhas excluídas
- [ ] **CA-07.1.d** — `end_date` posterior a `start_date`, validado no banco e na aplicação
- [ ] **CA-07.1.e** — Entidade acrescentada ao `db/schema.sql` e ao Documento 04 (MER)

---

### T-07.2 — CRUD de tarifas 🔲 *(~1,5 dia)*

**DEP:** T-07.1

**Critérios de aceitação**
- [ ] **CA-07.2.a** — `GET/POST/PUT/DELETE /rate-periods`, escrita restrita a `ADMIN`
- [ ] **CA-07.2.b** — Consulta filtrável por categoria e por intervalo de datas
- [ ] **CA-07.2.c** — Sobreposição recusada com `409` e mensagem que diz qual período conflita
- [ ] **CA-07.2.d** — `tenant_id` sempre do JWT
- [ ] **CA-07.2.e** — Swagger com schema de requisição **e de resposta** (o débito da T-06.2 não se repete em código novo)

---

### T-07.3 — Motor de cálculo de estadia 🔲 *(~2 dias)* — **o coração da Spec**

**DEP:** T-07.1

Utilitário único em `app/utils/`, que recebe categoria e intervalo e devolve o valor noite a noite.

**Critérios de aceitação**
- [ ] **CA-07.3.a** — Para cada noite, aplica nesta ordem: preço de fim de semana do período, preço do período, tarifa base da categoria
- [ ] **CA-07.3.b** — Devolve o detalhamento por noite, não só o total — é o que a tela precisa mostrar antes de confirmar (RT-22)
- [ ] **CA-07.3.c** — Estadia atravessando dois períodos calcula cada trecho com sua tarifa
- [ ] **CA-07.3.d** — Valor monetário tratado como *string*/inteiro em centavos, nunca `Number()`
- [ ] **CA-07.3.e** — Data ancorada em `America/Sao_Paulo`, para que a virada do dia não mude o preço
- [ ] **CA-07.3.f** — Teste com estadia de uma noite, estadia atravessando o fim de semana, estadia atravessando dois períodos e estadia sem período cadastrado

---

### T-07.4 — Restrições de venda 🔲 *(~1,5 dia)*

**DEP:** T-07.3

**Critérios de aceitação**
- [ ] **CA-07.4.a** — Reserva com menos noites que o mínimo do período é recusada com `409` e o motivo
- [ ] **CA-07.4.b** — Data marcada como fechada não aparece como disponível
- [ ] **CA-07.4.c** — As duas regras valem também na reserva pública (RF-026) — é onde o hóspede tenta sozinho
- [ ] **CA-07.4.d** — Fechar uma data **não** apaga a tarifa nem cancela reserva existente

---

### T-07.5 — Adoção nos caminhos de venda 🔲 *(~2 dias)* — 🔴 **maior risco**

**DEP:** T-07.3 · **branch isolada**

Substituir o cálculo de total onde ele hoje existe, para que passe a haver um só.

**Critérios de aceitação**
- [ ] **CA-07.5.a** — `POST /reservations` usa o motor
- [ ] **CA-07.5.b** — `POST /public/:subdomain/bookings` usa o motor, e o sinal PIX continua sendo o percentual `deposit_percent` sobre o novo total
- [ ] **CA-07.5.c** — Disponibilidade pública devolve a tarifa aplicada ao período consultado
- [ ] **CA-07.5.d** — Orçamento de evento (RF-030) segue funcionando — decidir e registrar se ele passa a usar o motor ou mantém tarifa negociada própria
- [ ] **CA-07.5.e** — `public-booking.test.js` e os testes de reserva verdes **sem alteração de expectativa** quando não há período cadastrado

> A CA-07.5.e é o critério que protege a compatibilidade: hotel sem tarifa cadastrada tem que continuar cobrando exatamente o que cobrava.

---

### T-07.6 — Calendário de tarifa e disponibilidade 🔲 *(~3 dias)*

**DEP:** T-07.2, T-07.4 · Realiza RT-39 a RT-43

**Critérios de aceitação**
- [ ] **CA-07.6.a** — Calendário por categoria exibindo tarifa e disponibilidade lado a lado
- [ ] **CA-07.6.b** — Edição de tarifa de um período direto do calendário
- [ ] **CA-07.6.c** — Fechamento e reabertura de data em um clique, com o estado visível
- [ ] **CA-07.6.d** — Mínimo de noites visível na data em que se aplica
- [ ] **CA-07.6.e** — Layout de desktop dedicado; no celular, consulta e edição de uma data por vez

---

## 6. Definition of Done

- [ ] Um único motor de cálculo de estadia em todo o sistema
- [ ] Hotel sem tarifa cadastrada cobra exatamente o que cobrava antes
- [ ] Sobreposição de período impedida pelo banco, não só pela aplicação
- [ ] Mínimo de noites e data fechada respeitados também na venda pública
- [ ] Documento 04 (MER) atualizado com a entidade nova
- [ ] Swagger completo, com schema de resposta

---

## 7. Riscos

| Risco | Severidade | Mitigação |
|---|---|---|
| Mudar o cálculo de total quebrar a reserva direta e o PIX | 🔴 Alto | T-07.5 em branch isolada; `public-booking.test.js` como critério de aceite |
| Regra de precedência ambígua na virada de período | Médio | CA-07.3.c cobre estadia atravessando dois períodos |
| Orçamento de evento divergir do motor | Médio | CA-07.5.d obriga decisão explícita, registrada |
| Escopo crescer para tarifa por ocupação | Médio | Declarado fora do escopo em §3.2; entra como Spec nova se houver prazo |

---

## 8. Histórico

| Versão | Data | Autor | Alteração |
|--------|------|-------|-----------|
| 1.0 | 09/09/2026 | Gabriel Reis Cunha | Criação. Deriva de RT-39 a RT-43 do levantamento de requisitos de tela; separada da SPEC-05 porque a maior parte do trabalho é backend |
