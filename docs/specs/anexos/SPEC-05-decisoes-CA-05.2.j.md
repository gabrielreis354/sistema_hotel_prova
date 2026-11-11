# SPEC-05 · Anexo — Decisões do CA-05.2.j (estorno visível, meta M5-c, parte do backend)

**Responsável:** Sirlande (orquestrando Claude Code) · **Data:** 09/11/2026
**Estado:** ✅ backend pronto na `feature/m5c-estorno-visivel`. qa-redteam aprovado com ressalvas: os 🟢 foram corrigidos e o 🟡 ficou documentado, por decisão do Sirlande (§2). **A tela é do Gabriel** e ainda não existe.
**Fonte:** parecer de 28/10 (§4, M5-c), aceito no ponto de controle de 03/11; relatório `docs/historico_sessao/sirlande/m5c_estorno_visivel_09nov2026.md`; auditoria `docs/qa/redteam_m5c-estorno-visivel_09nov2026.md`.

> Numeração D-n, continuando a do backend de conta da SPEC-04 (a última era D-68).

---

## 1. O que foi produzido

O CA-05.2.j (RT-18) pede: *"Estorno de consumo exibindo quem autorizou, a partir de `deleted_by`"*. Ele estava bloqueado no backend, porque nenhuma leitura devolvia item excluído.

| Entrega | Onde |
|---|---|
| `GET /reservations/:id/bill` devolve `voided_consumptions`: os consumos estornados, com `deleted_by: { id, name }` | `app/utils/itemAsConsumption.js` (`reservationVoidedItems`), `app/utils/reservationBill.js` |
| Schema `Bill` documentado; `voided_consumptions` e `deleted_by.{id,name}` obrigatórios no cliente tipado | `config/swagger.js`, `frontend/packages/api-client` regenerado |
| 14 testes novos e o guardião do contrato (CA-04.5.b) atualizado de propósito | `tests/bill-voided-consumptions.test.js`, `tests/reservation-bill-accounts.test.js` |

Formato de cada entrada: `id`, `description`, `amount` (número, como o resto do bill da reserva), `consumed_at`, `deleted_at` e `deleted_by` (`{ id, name }` ou `null`).

**Para a tela (Gabriel):** a linha do tempo (`buildBillTimeline`, `reservationLogic.ts`) pode tratar o item estornado como já trata o pagamento VOIDED: valor riscado, rótulo "estornado por <nome>", fora do saldo. Quando `deleted_by` vier nulo, o rótulo é "estornado (sem registro de quem autorizou)". O comprovante do hóspede não deve mostrar o estorno, pelo mesmo motivo do pagamento VOIDED (`receiptEntries`).

---

## 2. Decisões

| # | Decisão | Alternativa descartada | Por quê |
|---|---|---|---|
| **D-69** | **Campo novo no bill da reserva** (`voided_consumptions`) | Endpoint separado (`GET /reservations/:id/voided-items`) | A tela já busca o bill. Com o campo novo, é uma requisição só, lida na mesma transação REPEATABLE READ (D-57): o estorno e os totais saem da mesma foto. Segue o modelo do pagamento estornado, que já vem no bill (CA-06.13.g). É um acréscimo: os campos de antes não mudam, e o guardião CA-04.5.b foi atualizado de propósito |
| **D-70** | **Só itens faturáveis** | Todo item excluído | É o mesmo filtro dos consumos. Uma cortesia excluída nunca foi cobrada, então não houve estorno de valor |
| **D-71** | De quem autorizou, **só `id` e `name`**, buscando **também usuário removido**, e só do próprio hotel | Objeto do usuário inteiro; esconder quem saiu do sistema | Auditoria financeira: o nome de quem autorizou não pode sumir quando a pessoa sai do hotel. E-mail e papel não servem à tela. Um `deleted_by` de outro hotel (dado inconsistente) vira `null`, e nunca o nome de lá |
| **D-72** | **Bill da conta** (`/accounts/:id/bill`) **fica fora** | Expor também ali | A linha do tempo do roteiro é a da reserva. A comanda não mostra estorno |

### Correções da auditoria (qa-redteam de 09/11)

| Achado | Correção |
|---|---|
| 🟢 `deleted_by.id`/`name` e `voided_consumptions` saíam opcionais no cliente tipado | `required` no Swagger. A tela não precisa tratar `undefined` |
| 🟢 A descrição de `deleted_by` nulo cobria só o caso do legado | Passa a citar também o usuário de outro hotel |
| 🟢 Faltavam testes do estorno na conta do acompanhante e pela rota antiga `DELETE /reservations/:id/consumptions/:id` | Os dois testes entraram e passaram (protegem contra regressão) |
| 🟡 Estorno antigo ainda não migrado de `consumptions` some da lista sem aviso | **Decisão do Sirlande: documentar e deixar pendente (opção A)** — ver abaixo |

**Por que o 🟡 ficou documentado, e não corrigido:**
- Os totais não mudam; só o histórico fica incompleto, e apenas até o `migrate` rodar. O deploy já roda o `migrate` antes e depois do rollout.
- A correção completa faria o `pendingLegacyConsumption` também barrar consumo excluído. Essa trava é usada pela comanda e pelos pagamentos, não só pelo bill. Se uma linha antiga inválida deixasse a reserva fora da migração (risco que a própria auditoria levantou em `migrateConsumptions.js`), a reserva ficaria em 503 para sempre na comanda e no pagamento, a duas semanas do congelamento.
- A limitação está escrita no JSDoc de `reservationVoidedItems` e na descrição do campo no Swagger.

---

## 3. Verificação

- **Testes:** backend inteiro com 1140 verdes; 14 novos do estorno no bill (caso feliz, só `id` e `name`, totais intactos, cortesia, usuário removido, `deleted_by` nulo, `deleted_by` de outro hotel, conta do acompanhante, rota antiga, ordem, outro hotel em 404, lista vazia, tenant, Swagger igual à resposta). PMS com 203 verdes e tipos limpos com o cliente regenerado.
- **Mutação manual:** 7 mutantes, 6 mortos. O sobrevivente (`deleted_by: c.deleter ?? null`) é equivalente: a consulta já busca do usuário só `id` e `name`. Fica como defesa em duas camadas.
- **API real:** estorno feito por ADMIN pela API. O item aparece em `voided_consumptions` com o nome de quem autorizou, e `consumptions_total`, `grand_total` e `balance_due` não mudam.
- **Segurança:** o bill exige login e o filtro de hotel; o garçom é barrado em `/reservations`; o `tenant_id` filtra item, conta e usuário; nenhum dado de hóspede é exposto. Nenhum achado.
- **qa-redteam:** aprovado com ressalvas (§2).

---

## 4. Em aberto

| # | Pendência | Dono | Quando |
|---|---|---|---|
| 1 | ✅ Tela: estorno na linha do tempo, com quem autorizou. Feita em 11/11 como sugerido no §1 | Gabriel | `feature/m5c-estorno-tela` |
| 2 | Estorno antigo não migrado aparece no histórico (🟡, opção B) | Sirlande | depois do congelamento |
| 3 | Investigar se `migrateConsumptions.js:44-56` deixa a reserva para trás quando há linha inválida já excluída | Sirlande | depois do congelamento |
| 4 | Dado de demonstração: o seed do roteiro (M8) inclui um estorno, para o passo 5 mostrar quem autorizou | Sirlande | M8, 17/11 |
