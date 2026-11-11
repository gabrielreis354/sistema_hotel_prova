# QA Red Team — asaas-cobranca-cancelada (🟡-1 do qa-redteam de 16/10)
**Branch:** fix/asaas-cobranca-cancelada · **Dev:** Weslley · **Base:** `5c9fb00` (topo de fix/asaas-ressalvas-2, PR #135; develop@0ff0021) · **Data:** 11/11/2026
**Commits auditados:** `98d3eae` fix(pix): cancelar a reserva cancela a cobranca no Asaas · `097febc` docs(pix): ressalvas do Asaas fechadas no roteiro e na SPEC-03
**Arquivos auditados:** 8 do diff (`CancelReservationController.js`, `AsaasPixProvider.js`, `PixProvider.js`, `cancelPendingCharges.js` (novo), `tests/asaas-pix.test.js`, `tests/asaas-webhook.test.js`, `docs/roteiro/PASSO_6_RESERVA_DIRETA_PIX.md`, `docs/specs/SPEC-03-integracoes-externas.md`). Para validar cenários também li: `PixWebhookController.js`, `services/pix/index.js`, `PaymentModel.js`, `DeleteReservationController.js`, `CancelContractController.js`, `CreateBookingController.js`, `GetBookingStatusController.js`, `reservationRouter.js`, `config/swagger.js` (cancel), `docs/pagamentos/ASAAS_SANDBOX.md`.
**Achados no escopo:** 5 (🔴 0 · 🟡 1 · 🟢 4) · **Repassados:** 2

## Veredito
**APROVADO COM RESSALVAS**

Os critérios de aceite foram cumpridos e conferidos no código. O `DELETE /payments/{id}` roda depois do commit e nunca lança. O `UPDATE ... WHERE status='PENDING'` é atômico e não sobrescreve PAID. Pagamento de outro provider ou com `provider` nulo é pulado com log. A resposta do cancel não mudou e as queries usam o `tenant_id` da reserva já carregada com tenant. A ressalva 🟡 é de documentação: o `ASAAS_SANDBOX.md` ficou dizendo o contrário do código novo. O buraco de dinheiro que sobra fica em código de outra área (`DELETE /reservations/:id`) e foi repassado.

## Achados no escopo

### 🟡 [Docs] `ASAAS_SANDBOX.md` contradiz o código novo sobre a validade do QR e o cancelamento
**Onde:** `docs/pagamentos/ASAAS_SANDBOX.md:203-205`
**Cenário:** o guia operacional diz que "o sistema grava a `expirationDate` do Asaas" e que "PIX pago para reserva cancelada só gera log de aviso". Depois desta branch, o sistema grava `min(agora + expiresInMinutes, expirationDate)` (`AsaasPixProvider.js:173-175`) e cancela a cobrança no Asaas ao cancelar a reserva. Quem configurar ou conciliar pelo guia vai entender errado o campo `pix_expiration` e o que acontece no cancelamento. A SPEC-03 e o roteiro foram atualizados; o guia, não.
**Regra violada:** CLAUDE.md §6 (docs como contrato de output); checklist §6 (documentação do comportamento).
**Correção sugerida:** reescrever as duas linhas. Explicar que `pix_expiration` é o prazo do contrato e não a validade real do QR no Asaas. Explicar que o cancelamento da reserva faz `DELETE /payments/{id}` e que, com o Asaas fora do ar, o id vai para o log com o texto "conciliar".

### 🟢 [Dinheiro/latente] `pix_expiration` deixou de ser a validade real do QR, e um job de expiração ingênuo vira perda silenciosa
**Onde:** `services/core-service/app/services/pix/AsaasPixProvider.js:173-175`; `services/core-service/app/Controllers/WebhookApi/PixWebhookController.js:78`
**Cenário:** o Asaas aceita o pagamento até a data dele (1 ano, no teste real), mas o banco agora grava 30 min. O roteiro e a SPEC-03 deixam pendente "um job que expire sozinho a cobrança `PENDING`". O caminho natural para esse job é `pix_expiration < now() → status EXPIRED`. Se ele fizer só isso, sem `cancelCharge`, o hóspede ainda consegue pagar o QR. O webhook então vê `EXPIRED` como terminal e responde `already_processed` sem gravar log de aviso. Resultado: o dinheiro entra, a reserva não confirma e nada registra o pagamento. Hoje esse job não existe, por isso não há dano agora.
**Regra violada:** CLAUDE.md §7 (risco financeiro); KISS (o nome do campo engana).
**Correção sugerida:** escrever a restrição na pendência do job, na SPEC-03 e no comentário da linha 172: o job precisa chamar `cancelCharge` antes de marcar `EXPIRED`, ou reaproveitar `cancelPendingCharges`. Opcional: o webhook gravar `console.warn` quando um PAID chega para um pagamento `EXPIRED`/`FAILED`.

### 🟢 [Robustez] Cobrança que não foi cancelada no PSP não tem segunda chance
**Onde:** `services/core-service/app/services/pix/cancelPendingCharges.js:44-46`; `services/core-service/app/Controllers/ReservationApi/CancelReservationController.js:40-43`
**Cenário:** com o Asaas fora do ar, o cancel responde 200 e o sinal fica `PENDING`, como pede o critério. Quando a recepção tenta cancelar de novo, recebe 422 ("Reserva já cancelada") antes de chegar ao `cancelPendingCharges`. O único registro fica num `console.error`, e o QR continua pagável por até 1 ano. A recepção não fica sabendo de nada: a resposta é idêntica ao caso de sucesso.
**Regra violada:** nenhuma regra dura. É um desenho aceito pelo critério, com dívida operacional.
**Correção sugerida (próxima iteração):** criar um filtro de conciliação, por exemplo "pagamentos PIX `PENDING` de reserva `CANCELLED`" (é uma query só). Outra opção: no 422 de "já cancelada", chamar `cancelPendingCharges` de novo, porque a função é idempotente. Registrar como pendência.

### 🟢 [Latência] O DELETE ao PSP segura a resposta do cancel por até 10 s por cobrança
**Onde:** `services/core-service/app/Controllers/ReservationApi/CancelReservationController.js:52`; `services/core-service/app/services/pix/AsaasPixProvider.js:8`; `services/core-service/app/services/pix/cancelPendingCharges.js:30-37`
**Cenário:** com o Asaas lento ou com DNS travado, o `await cancelPendingCharges` só termina no `TIMEOUT_MS` = 10 s, e a recepção espera esse tempo com o botão girando. O loop é sequencial: N cobranças pendentes somam N × 10 s. Hoje cada reserva tem 1 sinal, então o pior caso é 10 s. Não há perda de dado, porque o commit vem antes.
**Correção sugerida:** a opção mais simples é aceitável como está. Se incomodar, há duas saídas: um timeout menor só no DELETE, ou rodar sem `await` com `.catch` (a função já não lança). A segunda opção complica os testes, que hoje dependem do `await`.

### 🟢 [Contrato/Docs] O Swagger do cancel não menciona o efeito no PSP
**Onde:** `services/core-service/config/swagger.js:1037`
**Cenário:** a descrição fala só das contas (D-36). O cancel agora também tem efeito externo (o sinal PIX `PENDING` vira `FAILED` quando o PSP confirma) e pode demorar. O schema da resposta não mudou, então o cliente tipado não quebra.
**Correção sugerida:** acrescentar uma frase na `description`: "Sinal PIX pendente é cancelado no PSP depois do commit (Asaas); falha do PSP não impede o cancelamento."

## Repassados a outro dev

| Sev. | Achado | Onde | Dono | Repasse |
|------|--------|------|------|---------|
| 🟡 | `DELETE /reservations/:id` (ADMIN) exclui reserva com sinal PIX `PENDING` sem cancelar a cobrança: o QR do Asaas continua pagável por 1 ano e o dinheiro entra sem reserva | `services/core-service/app/Controllers/ReservationApi/DeleteReservationController.js:19-21` | Gabriel | `docs/qa/repasses/para_gabriel_11112026.md` |
| 🟢 | Check-in direto de `PENDING` (walk-in) de reserva online deixa o QR do sinal pagável: o hóspede paga no balcão e pode pagar o QR depois (cobrança em dobro, só com log) | `services/core-service/app/Controllers/ReservationApi/CheckInController.js:36` | Gabriel | `docs/qa/repasses/para_gabriel_11112026.md` |

## O que foi verificado e está correto
- **Outros caminhos de cancelamento:** `grep 'CANCELLED'` em `app/`. `CancelContractController` cancela só a reserva-bloco B2B, que não tem sinal PIX (a `CreateBookingController` é a única que cria `PENDING` + PIX, sempre com `source: 'DIRECT'`). Não existe job de expiração. O único caminho de fora é o `DELETE`, que foi repassado.
- **Ordem commit → PSP:** `CancelReservationController.js:48-52`. O try/catch externo de `cancelPendingCharges.js:15/48` cobre até `getPixProvider()` lançando por env inválido. O cancel nunca vira 500 por causa do PSP.
- **Update condicional:** `cancelPendingCharges.js:40-43` é um `UPDATE ... WHERE id, tenant_id, status='PENDING'` atômico. O webhook PAID (`PixWebhookController.js:143`) reconfere o status com lock. Nas duas ordens possíveis, ninguém sobrescreve o outro. O `paranoid` do model acrescenta `deleted_at IS NULL`.
- **`PAYMENT_DELETED` chegando depois:** se o FAILED já foi gravado, o webhook responde `already_processed` (linha 78). Se o webhook chega antes, o `getChargeStatus` lê `deleted: true`, grava FAILED (`AsaasPixProvider.js:23`) e o UPDATE da branch não encontra linha para mudar. O teste existente em `asaas-webhook.test.js:301` cobre esse caso.
- **Cobrança já paga no Asaas:** o Asaas recusa o DELETE com 4xx, o código gera `PixProviderUnavailableError`, o sinal fica `PENDING` e o webhook decide (PAID + aviso de estorno). Coberto por teste.
- **`provider` nulo / outro provider:** `null !== activeKey` pula com `console.warn`, sem chamar o PSP ativo. A coluna `provider` é gravada desde a criação do sinal (`CreateBookingController.js:198`).
- **`provider_charge_id` duplicado:** existe o índice único parcial `payments_provider_charge_id_unique` (`applyDbConstraints.js:112`), e o filtro inclui `reservation_id` + `tenant_id`.
- **fake / Mercado Pago:** usam o `cancelCharge` padrão (no-op, `cancelled: false`) e não fazem chamada de rede. Teste em `asaas-pix.test.js`.
- **Tenant isolation:** a reserva é lida com `tenant_id` do JWT, e `cancelPendingCharges` filtra por `reservation.tenant_id`. Há teste de hotel B → 404 e nenhum DELETE.
- **Status público:** `GetBookingStatusController.js:31` devolve `status: CANCELLED` + `deposit.status: FAILED`, o que é coerente. Antes o hóspede via `CANCELLED` + `PENDING`, que sugeria pagar.
- **Log/PII:** os logs novos carregam só o `provider`, o `provider_charge_id` e o `reservation.id`. O `#request` não loga o corpo de erro.
- **ESM, allowlist, sem `require`:** ok. A expiração `min(contrato, Asaas)` está correta, testada com relógio fixo nos dois sentidos.

## Não foi possível verificar
- O comportamento real do Asaas sandbox para `GET /payments/{id}` de uma cobrança removida (200 com `deleted: true` ou 404). Nos dois casos o resultado final é FAILED, mas o 404 gera 503 e um reenvio. Não chamei a API (sem acesso ao `.env`, por regra).
- Se o painel do Asaas permite restaurar uma cobrança removida (`POST /payments/{id}/restore`). Se permitir e alguém restaurar e pagar, o webhook encontra FAILED e responde `already_processed` sem aviso de estorno.
- A suíte não foi executada, por instrução: ela roda à parte.
