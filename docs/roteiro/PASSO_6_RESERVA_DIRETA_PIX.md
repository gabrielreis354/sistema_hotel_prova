# Passo 6 do roteiro — hóspede reserva direto e paga o sinal por PIX

> Roteiro de demonstração do `docs/PLANO_MVP_ATE_10DEZ2026.md` §2, passo 6. Pela decisão 5, o
> passo é mostrado **pelo Swagger, sem tela**: não existe app do hóspede no 4º semestre.
> Dono: Weslley (M6). Versão de 04/11/2026, revisada pelo qa-redteam
> (`docs/qa/redteam_passo6-swagger_04112026.md`).

**O que a banca precisa ver:** a reserva nasce `PENDING` com o QR do sinal. Depois do pagamento,
o **webhook** do PSP confirma a reserva sozinho, e ela aparece confirmada no PMS da recepção. Ninguém
clica em "confirmar" no sistema.

## Qual plano usar

| | Plano A — Asaas sandbox | Plano B — PIX simulado |
|---|---|---|
| `PIX_PROVIDER` no `.env` | `asaas` | `fake` (padrão do compose) |
| Quem paga | botão "Confirmar pagamento" no painel do sandbox do Asaas | `scripts/simular_pagamento_pix.js` |
| Quem chama o webhook | o próprio Asaas, pelo túnel (ngrok) | o script, assinando com `PIX_WEBHOOK_SECRET` |
| Depende de | internet, chave do sandbox válida, túnel no ar | só o compose |
| Quando usar | se o ensaio da véspera passou | quando o A falhar na hora (ver "Trocar do A para o B") |

O plano B passa pelo mesmo caminho do código: notificação autenticada, consulta do status ao
provider, pagamento `PAID` e reserva `CONFIRMED` na mesma transação. A diferença é que o provider
simulado não confere o valor pago contra o cobrado; o Asaas confere.

## Antes da demonstração

Na raiz do repositório, como no cabeçalho do `docker-compose.yml`:

1. **Ambiente:**
   ```bash
   cp .env.example .env
   node services/core-service/scripts/gerar_chaves_jwt.js
   ```
   O compose recusa subir sem as variáveis obrigatórias do `.env`: `PIX_WEBHOOK_SECRET`, as senhas
   do MinIO e as do RabbitMQ. A mensagem de erro diz qual falta.
2. **Subir, criar as tabelas e semear:**
   ```bash
   docker compose up -d --build
   docker compose exec backend node command.js migrate
   docker compose exec -e ALLOW_SEED=1 backend node command.js seed
   ```
   Sem o `migrate`, o seed falha num banco novo: o backend não cria tabelas ao subir.
3. **Swagger:** `http://localhost:3000/api-docs` (backend direto, porta `BACKEND_HOST_PORT`).
4. **PMS da recepção:** o compose não serve o frontend. Em outro terminal:
   ```bash
   export PATH=$HOME/.local/bin:$PATH
   pnpm -C frontend --filter app-pms dev
   ```
   Abra `http://localhost:5173`. O login é `admin@aurora.example` / `senha123`, subdomínio `aurora`.
5. **Plano A:**
   - Confira se a chave do sandbox ainda vale. A atual vence em **15/11/2026**.
   - No `.env`, use `PIX_PROVIDER=asaas`, a chave e o `ASAAS_WEBHOOK_TOKEN`, como em
     `docs/pagamentos/ASAAS_SANDBOX.md` §4.
   - Suba o túnel e cadastre o webhook apontando para `https://<túnel>/webhooks/pix` (§5).
   - Rode `docker compose up -d backend` para o backend ler o `.env` novo.

## Durante a demonstração

Todas as chamadas estão na seção **Reserva Direta (Público)** do Swagger, sem token. O subdomínio é
`aurora`. As datas de exemplo já vêm preenchidas: 15/12 a 18/12/2026.

1. **`GET /public/aurora/hotel`**: mostra o nome do hotel e o percentual do sinal (30%).
2. **`GET /public/aurora/availability`**: mostra as categorias livres com o preço da estadia, que é
   calculado no servidor. **Copie o `category_id`** de uma categoria. O id é gerado quando o banco é
   criado, por isso o Swagger não traz um exemplo fixo.
3. **`POST /public/aurora/bookings`**: troque o `category_id` do exemplo pelo copiado e execute.
   - Resposta 201: `reservation.status = PENDING`, `payment.amount` = 30% do total e `pix.qr_code`.
   - Guarde o `reservation.id` e o `pix.provider_charge_id`.
   - Com o Asaas, o CPF é obrigatório. O exemplo `529.982.247-25` é fictício, com dígitos válidos.
4. **Pagamento:**
   - Plano A: no painel do sandbox, abra a cobrança e clique em **Confirmar pagamento**. O Asaas
     chama o webhook em segundos.
   - Plano B:
     ```bash
     docker compose exec backend node scripts/simular_pagamento_pix.js <pix.provider_charge_id> http://localhost:3000
     ```
5. **`GET /public/aurora/bookings/{id}/status`**, com o `reservation.id`:
   `status = CONFIRMED`, `confirmed = true`, `deposit.status = PAID`.
6. **No PMS**, em Reservas, escolha o filtro **Próximos 30 dias**. O padrão, "Próximos 7 dias", não
   alcança 15/12. A reserva aparece como confirmada. No detalhe dela, o extrato mostra o
   **Sinal · PIX** pago. A conta da hospedagem só nasce no check-in, então ainda não existe aqui.

## Trocar do A para o B na hora

Com `PIX_PROVIDER=asaas` ativo, o script do plano B recebe 401 "Assinatura inválida": o webhook só
aceita a autenticação do provider ativo. Para trocar:

1. No `.env`, `PIX_PROVIDER=fake`.
2. `docker compose up -d backend` e esperar o backend ficar saudável (`docker compose ps`).
3. Refazer o passo 3 com uma **reserva nova**. A cobrança criada no Asaas não existe no simulado.

## Se algo der errado

| Sintoma | Causa provável | O que fazer |
|---|---|---|
| `POST /bookings` responde 404 | o `category_id` do exemplo não foi trocado | copie o id do `GET /availability` |
| `POST /bookings` responde 409 | sem quarto livre, inclusive por reservas `PENDING` de ensaios anteriores nas mesmas datas | escolha outra categoria ou mude as datas |
| `POST /bookings` responde 400 `guest.cpf obrigatório` | plano A sem CPF no corpo | use o CPF do exemplo |
| `POST /bookings` responde 400 `guest.cpf inválido` | plano A com CPF digitado errado (dígito verificador não bate) | use o CPF do exemplo |
| O backend fica em `Restarting` no `docker compose ps` | `PIX_PROVIDER` com valor fora de `fake`, `mercadopago`, `asaas` (ex.: `assas`) | `docker compose logs backend` mostra `PIX_PROVIDER desconhecido`; corrija o `.env` e suba de novo |
| `POST /bookings` responde 503 | Asaas fora do ar, ou chave vencida ou errada | troque para o plano B |
| O script responde 401 | `PIX_PROVIDER=asaas` ainda ativo | siga "Trocar do A para o B na hora" |
| O status continua `PENDING` depois de pagar no sandbox | o túnel caiu ou o webhook está pausado no painel | confira os logs do webhook no painel. Se não resolver, plano B |
| A reserva não aparece no PMS | filtro em "Hoje" ou "Próximos 7 dias" | filtro **Próximos 30 dias** |

## Pendências conhecidas

- **Ensaio no compose ainda não feito.** Este roteiro foi escrito em 04/11 a partir do código, sem
  Docker. Ensaiar os dois planos e registrar o resultado aqui.
- **As datas de exemplo valem até 15/12/2026.** Depois disso, o exemplo do Swagger vira data
  passada. Troque as constantes `PASSO6_CHECK_IN`/`OUT` em `config/swagger.js` antes de reusar.
- **A reserva pública aceita data no passado.** O `CreateBookingController` e o
  `GetAvailabilityController` só conferem se `check_out` vem depois de `check_in`. Um hóspede
  consegue reservar uma estadia que já passou. É um defeito de produto, fora do escopo deste roteiro
  porque muda o contrato da API. As datas de exemplo do Swagger evitam o problema na demonstração.
- **Asaas, 🟡-1 e 🟡-3 do qa-redteam de 16/10, fechadas em 11/11:** cancelar a reserva cancela a
  cobrança no Asaas (o sinal vira `FAILED`), o prazo devolvido ao hóspede é de 30 min, e CPF
  malformado responde 400. Ainda não há job que expire sozinho a cobrança `PENDING` de reserva
  que ninguém cancelou: no Asaas, o QR dela continua pagável e, se pago, confirma a reserva.
