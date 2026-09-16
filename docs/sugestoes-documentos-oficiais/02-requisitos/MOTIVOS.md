# Documento 02 — Motivos da versão sugerida v1.4

**Documento oficial:** `Projetos/gesway/02-requisitos-funcionais-nao-funcionais.md` — **v1.3, entregue ao professor**
**Dono:** Gabriel Reis Cunha
**Versão sugerida:** `versao-sugerida_v1.4.md`, nesta pasta
**Data:** 14/09/2026
**Situação:** 🔍 **em revisão** — o documento oficial **não** foi alterado

> **Antes de levar ao professor.** A reunião de reentrega só acontece com certeza absoluta sobre
> a revisão. Esta v1.4 corrige o que a decisão de arquitetura tornou falso, mas **ainda não foi
> conferida contra todos os critérios de aceite** — as seções 1 a 8 do Termo de Requisitos e os
> critérios C1 a C10 do Termo da banca. Essa conferência vem antes de qualquer agendamento, e pode
> acrescentar mudanças a esta lista.

---

## Em uma frase

A v1.3 atribui 21 requisitos a um `billing-service` que **não vai existir**. O ADR-003 decidiu
outro recorte, e o critério C9 exige documentação *"válida e atualizada"*.

---

## O que muda

| # | Onde | Na v1.3 entregue | Na v1.4 sugerida |
|---|---|---|---|
| 1 | Coluna **Módulo** de RF-014 a RF-018, RF-019 a RF-023, RF-026, RF-027 e RF-056 — **13 requisitos** | `billing-service` | `core-service` |
| 2 | Coluna **Módulo** de RF-029 a RF-036 — **8 requisitos** | `billing-service` | `b2b-service` |
| 3 | Critério de aceite do **RF-033** | Contrato assinado cria a reserva-bloco | Acrescenta que a reserva-bloco é criada pelo `core-service`, por chamada idempotente |
| 4 | Meta do **RNF-014** — isolamento da carga analítica | *"banco ou réplica dedicada ao `analytics-service`"* | `analytics-service` com **banco próprio, alimentado por eventos** do `core-service` |
| 5 | **RNF-028**, novo — entrega confiável de eventos | — | Nenhum evento perdido com o broker fora; evento repetido não altera o resultado; mensagem que falha sempre é isolada |
| 6 | Rastreabilidade | RF-037 a RF-043 → RNF-001, RNF-007, RNF-014 | Acrescenta RNF-028 |

**O que não muda:** nenhum identificador RF ou RNF existente é alterado, nenhum requisito é
removido, nenhuma prioridade muda.

---

## Por que o `billing-service` deixou de existir

A proposta de 23/08 separava as entidades por **tipo de dado** e colocava pagamento, produtos,
contas e contratos num `billing-service`. Confrontada com o código, ela faria atravessar a
fronteira entre serviços:

| Evidência | Onde verificar |
|---|---|
| **Quatro transações atômicas** que gravam ao mesmo tempo dados do núcleo e do financeiro | `services/core-service/app/Controllers/PublicBookingApi/CreateBookingController.js` · `services/core-service/app/Controllers/WebhookApi/PixWebhookController.js` · `services/core-service/app/Controllers/ContractApi/SignContractController.js` · `services/core-service/app/Controllers/ContractApi/CancelContractController.js` |
| **Doze chaves estrangeiras** existentes cruzando a fronteira, incluindo o `tenant_id` com `ON DELETE CASCADE` de oito tabelas | `services/core-service/db/schema.sql` |
| **Duas consultas de indicadores** que fazem `JOIN` entre pagamento e reserva | `services/core-service/app/Controllers/AnalyticsApi/GetAlertsController.js` · `GetRevenueController.js` |

Separar isso exigiria transação distribuída justamente na reserva direta com PIX e na
confirmação do PIX por webhook. O recorte decidido mantém a operação do hotel — reservar,
hospedar e cobrar — num único serviço.

O domínio de grupos e eventos, ao contrário, mostrou fronteira real: nenhum código de reserva,
pagamento ou indicadores lê tabela de contrato, orçamento ou cliente corporativo. Virou o
`b2b-service`.

---

## Por que o RNF-014 e o RNF-028

A v1.3 permite que o analytics leia *"réplica"* do banco. O ADR-003 decidiu diferente: o
analytics tem **banco próprio**, alimentado por eventos do núcleo via RabbitMQ. Ler o banco de
outro serviço criaria dependência de esquema entre eles.

Adotar eventos cria uma exigência que o documento não tinha: **o evento não pode se perder nem
contar em dobro**. Sem isso, o indicador de receita pode divergir do caixa real. O RNF-028 torna
essa garantia verificável — e o critério de aceite correspondente já está na SPEC-01, T-01.4.

---

## O que acontece se não mudar

- O professor avalia o C9 comparando documento e código. A partir da T-01.4 o código terá
  `core-service`, `b2b-service` e `analytics-service`, e o documento continuará falando em
  `billing-service`.
- O RNF-014 continuará permitindo uma solução — réplica — que a arquitetura rejeitou.
- A garantia de entrega de eventos ficará sem requisito que a sustente.

---

## Como revisar

```bash
diff --strip-trailing-cr "<UniFAAT>/Projetos/gesway/02-requisitos-funcionais-nao-funcionais.md" \
     "docs/sugestoes-documentos-oficiais/02-requisitos/versao-sugerida_v1.4.md"
```

Decisão de origem: **ADR-003**, Documento 07 · **SPEC-01**, `docs/specs/SPEC-01-microsservicos.md`
