# Passo 6 do roteiro — hóspede reserva direto e paga o sinal por PIX

> Roteiro de demonstração do `docs/PLANO_MVP_ATE_10DEZ2026.md` §2, passo 6. Pela decisão 5, o
> passo é mostrado **pelo Swagger, sem tela**: não existe app do hóspede no 4º semestre.
> Dono: Weslley (M6). Versão de 04/11/2026.

**O que a banca precisa ver:** a reserva nasce `PENDING` com o QR do sinal. Depois do pagamento,
o **webhook** do PSP confirma a reserva sozinho, e ela aparece `CONFIRMED` no PMS da recepção. Ninguém
clica em "confirmar" no sistema.

## Qual plano usar

| | Plano A — Asaas sandbox | Plano B — PIX simulado |
|---|---|---|
| `PIX_PROVIDER` | `asaas` | `fake` (padrão do compose) |
| Quem paga | botão "Confirmar pagamento" no painel do sandbox do Asaas | `scripts/simular_pagamento_pix.js` |
| Quem chama o webhook | o próprio Asaas, pelo túnel (ngrok) | o script, assinando com `PIX_WEBHOOK_SECRET` |
| Depende de | internet, chave do sandbox válida, túnel no ar | só o compose |
| Quando usar | se o ensaio da véspera passou | sempre que o A falhar na hora: troca em 1 minuto |

O plano B prova o mesmo caminho do código: a notificação autenticada, a consulta do status ao
provider, o pagamento `PAID` e a reserva `CONFIRMED` na mesma transação. Muda só quem paga.

## Antes da demonstração

1. Suba o compose e rode o seed, como no `docker-compose.yml`:
   ```bash
   docker compose up -d --build
   docker compose exec -e ALLOW_SEED=1 backend node command.js seed
   ```
2. Abra o Swagger em `http://localhost:3000/api-docs` (backend direto, porta `BACKEND_HOST_PORT`).
3. **Plano A:**
   - Confira se a chave do sandbox ainda vale. A atual vence em **15/11/2026**.
   - Configure o `.env` e o túnel como em `docs/pagamentos/ASAAS_SANDBOX.md` §4 e §5.
   - O webhook do painel precisa apontar para `https://<túnel>/webhooks/pix`.
4. **Plano B:** só o `PIX_WEBHOOK_SECRET` no `.env`, que o compose já exige para subir.

## Durante a demonstração

Todas as chamadas estão na seção **Reserva Direta (Público)** do Swagger, sem token. O subdomínio é
`aurora`. As datas de exemplo já vêm preenchidas: 15/12 a 18/12/2026.

1. **`GET /public/aurora/hotel`**: mostra o nome do hotel e o percentual do sinal (30%).
2. **`GET /public/aurora/availability`**: mostra as categorias livres com o preço da estadia, que é
   calculado no servidor. **Copie o `category_id`** de uma categoria. Ele muda a cada seed, por isso
   o Swagger não traz um exemplo fixo.
3. **`POST /public/aurora/bookings`**: cole o `category_id` no corpo de exemplo e execute.
   - Resposta 201: `reservation.status = PENDING`, `payment.amount` = 30% do total e `pix.qr_code`.
   - Guarde o `reservation.id` e o `pix.provider_charge_id`.
   - Com o Asaas, o CPF é obrigatório. O exemplo `529.982.247-25` tem dígitos válidos.
4. **Pagamento:**
   - Plano A: no painel do sandbox, abra a cobrança e clique em **Confirmar pagamento**. O Asaas
     chama o webhook em segundos.
   - Plano B:
     ```bash
     docker compose exec backend node scripts/simular_pagamento_pix.js <pix.provider_charge_id> http://localhost:3000
     ```
5. **`GET /public/aurora/bookings/{id}/status`**, com o `reservation.id`:
   `status = CONFIRMED`, `confirmed = true`, `deposit.status = PAID`.
6. **No PMS** (login `admin@aurora.example` / `senha123`): a reserva aparece na lista como
   confirmada, com o sinal pago na conta.

## Se algo der errado

| Sintoma | Causa provável | O que fazer |
|---|---|---|
| `POST /bookings` responde 409 | sem quarto livre na categoria no período | escolha outra categoria ou outras datas |
| `POST /bookings` responde 400 `guest.cpf obrigatório` | plano A sem CPF no corpo | use o CPF do exemplo |
| `POST /bookings` responde 503 | Asaas fora do ar, ou chave vencida ou errada | troque para o plano B |
| O status continua `PENDING` depois de pagar no sandbox | o túnel caiu ou o webhook está pausado no painel | confira os logs do webhook no painel. Se não resolver, plano B |
| O script do plano B diz `PIX_WEBHOOK_SECRET não configurado` | o `.env` não chegou ao contêiner | `docker compose up -d backend` depois de corrigir o `.env` |

## Pendências conhecidas

- **Ensaio no compose ainda não feito.** Este roteiro foi escrito em 04/11 a partir do código, sem
  Docker. Ensaiar os dois planos e registrar o resultado aqui.
- **A reserva pública aceita data no passado.** O `CreateBookingController` e o
  `GetAvailabilityController` só conferem se `check_out` vem depois de `check_in`. Um hóspede
  consegue reservar uma estadia que já passou. É um defeito de produto, fora do escopo deste roteiro
  porque muda o contrato da API. As datas de exemplo do Swagger evitam o problema na demonstração.
- **Asaas, 🟡-1 e 🟡-3 do qa-redteam de 16/10, ainda abertas:**
  - a cobrança fica pagável por 1 ano e não é cancelada quando a reserva é cancelada;
  - CPF malformado vira 503 em vez de 400.

  Nenhuma das duas aparece no roteiro se ele for seguido como está escrito.
