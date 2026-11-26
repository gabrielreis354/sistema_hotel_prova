# Passo 6 do roteiro — hóspede reserva direto e paga o sinal por PIX

> Roteiro de demonstração do `docs/PLANO_MVP_ATE_10DEZ2026.md` §2, passo 6. O passo é mostrado
> **pela API, sem tela do hóspede**: as chamadas saem do Swagger, o QR do sinal aparece na resposta
> e a reserva confirma sozinha no app da recepção. Não existe app do hóspede no 4º semestre.
> Decisão de 15/11 (`docs/PLANO_FECHAMENTO_MVP_15NOV2026.md` §7): **plano A, sandbox real do
> Asaas**; o plano B só se a rede cair.
> Dono: Weslley (M6). Versão de 04/11/2026, revisada pelo qa-redteam
> (`docs/qa/redteam_passo6-swagger_04112026.md`); situação atualizada em 20/11/2026.

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
   ./start.sh compose-up --build   # docker compose up -d --build + confere o rabbitmq-setup
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
   - Confira se a chave do sandbox ainda vale antes de cada ensaio. A chave usada em 12/11 foi
     colada num chat e foi trocada depois do M6 (confirmação do Weslley em 16/11). A chave nova
     vence em **31/07/2027 às 00:00**. O primeiro ensaio com ela no compose é o de 24/11.
   - No `.env`, use `PIX_PROVIDER=asaas`, a chave e o `ASAAS_WEBHOOK_TOKEN`, como em
     `docs/pagamentos/ASAAS_SANDBOX.md` §4.
   - Rode `docker compose up -d backend` para o backend ler o `.env` novo.
   - Na véspera e de novo antes de começar, rode:
     ```bash
     bash scripts/pix/1_preparar_plano_a.sh          # sobe um quick tunnel do cloudflared
     bash scripts/pix/1_preparar_plano_a.sh <URL>    # ou usa um túnel já no ar (ngrok etc.)
     ```
     O script faz quatro coisas:
     1. confere se o backend está no ar;
     2. confere se ele está com `PIX_PROVIDER=asaas`, a chave e o token;
     3. sobe o túnel. O quick tunnel muda de URL a cada subida, então não reaproveite a URL de
        um ensaio anterior;
     4. aponta o webhook `gesway-ensaio-plano-a` do sandbox para `https://<túnel>/webhooks/pix`,
        reativa a fila se o Asaas a pausou e testa o QR com uma cobrança de R$ 5, que é apagada
        em seguida.

     Saída `PRONTO: plano A` significa que pode seguir. `QR_FALHOU` significa que o sandbox não
     está gerando o QR (como em 22/11): vá de plano B.
   - O `cloudflared` dispensa conta. Se não estiver instalado, use o ngrok do §5 e passe a URL.
   - **Token do webhook:** o script regrava o token do webhook no Asaas com o
     `ASAAS_WEBHOOK_TOKEN` do backend. Em 22/11 os dois não batiam, porque o `.env` tinha sido
     trocado, e o Asaas recebia 401. Para conferir à mão, veja o "Token de autenticação" do
     webhook em Integrações → Webhooks. Ele tem de ser igual ao `ASAAS_WEBHOOK_TOKEN` do `.env`.
   - No painel do sandbox, o botão de confirmar o pagamento fica nos **detalhes da cobrança**, não
     na lista.
   - No fim do ensaio ou da demonstração: `bash scripts/pix/3_fechar.sh`. O script fecha o túnel e
     devolve o backend ao `.env`.

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
aceita a autenticação do provider ativo. Para trocar sem mexer no `.env`:

1. `bash scripts/pix/2_plano_b.sh`. O script fecha o túnel, sobe o backend com `PIX_PROVIDER=fake`
   e espera o backend ficar saudável.
2. Refazer o passo 3 com uma **reserva nova**. A cobrança criada no Asaas não existe no simulado.
3. No fim, `bash scripts/pix/3_fechar.sh` devolve o backend ao `.env`.

Sem os scripts, o caminho é o mesmo à mão: `PIX_PROVIDER=fake docker compose up -d backend`, e
`docker compose up -d backend` para voltar.

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
| O status continua `PENDING` depois de pagar no sandbox | o túnel caiu, o webhook está pausado no painel ou o token não bate (401 nos logs do webhook) | rode `bash scripts/pix/1_preparar_plano_a.sh` de novo; ele reaponta, reativa e regrava o token. Se não resolver, plano B |
| A reserva não aparece no PMS | filtro em "Hoje" ou "Próximos 7 dias" | filtro **Próximos 30 dias** |

## Pendências conhecidas

- **Plano A ensaiado em 12/11/2026** contra o sandbox real
  (`docs/historico_sessao/weslley/ensaio_pix_asaas_sandbox_m6_12nov2026.md`, #143): o Asaas chamou
  o webhook pelo túnel e a reserva foi a `CONFIRMED` com o sinal `PAID`, e cancelar a reserva
  removeu a cobrança no Asaas. O ensaio foi com o backend fora do compose.
- **Plano B ensaiado em 14/11/2026** no compose, dentro do roteiro inteiro
  (`docs/qa/ensaio_roteiro_14112026.md`): o webhook simulado confirmou a reserva em 2 s. O plano A
  no compose foi ensaiado em 20/11 (abaixo); o 2º ensaio completo é em 24/11.
- **Plano B ensaiado de novo em 20/11/2026** no compose, com as imagens do backend e do analytics
  refeitas e `PIX_PROVIDER=fake` passado pelo shell (o `.env` não foi alterado). Os 6 passos deram
  certo: reserva `9268e0bd…` `PENDING` com sinal de R$ 135,00 (30% de R$ 450,00) e QR; o script
  confirmou o pagamento; o status voltou `CONFIRMED` com `deposit.status = PAID`; a reserva aparece
  confirmada no PMS, com o PIX pago no extrato; e o evento chegou ao `analytics-service`
  (`analytics_events_total{outcome="applied"}` subiu, visível no passo 8). Para repetir sem 409,
  as datas de 15 a 18/12 já têm essa reserva na Standard, mas ainda sobram 7 quartos.
- **Plano A ensaiado no compose em 20/11/2026**, com a chave nova do sandbox e o webhook entregue
  pelo próprio Asaas por um quick tunnel do `cloudflared` (`https://<túnel>/webhooks/pix`, eventos
  `PAYMENT_CREATED`, `CONFIRMED`, `RECEIVED` e `OVERDUE`, token `whsec_` igual ao
  `ASAAS_WEBHOOK_TOKEN` do `.env`). Reserva `3faba6bc…` `PENDING` com o sinal de R$ 135,00 e a
  cobrança `pay_0_7o1nggd01q33ie`; depois de "Confirmar pagamento" no painel, `CONFIRMED` com
  `deposit.status = PAID`, o PIX pago no extrato do PMS e o evento no `analytics-service`. O backend
  não registra no log o webhook aceito: a prova pelo lado do Asaas fica em Integrações → Webhooks →
  Logs. Na reserva pública, o hóspede com o mesmo CPF reaproveita o cadastro existente (#142).
  O túnel rápido muda de URL a cada subida: o `scripts/pix/1_preparar_plano_a.sh` atualiza a URL
  no painel.
- **Plano A ensaiado no compose em 24/11/2026**, depois da falha de 22/11 (o `pixQrCode` do
  sandbox levava ~30 s e voltava 400): reserva `8472bf37…` `CONFIRMED` com o sinal `PAID`.
  Em 26/11 os scripts do ensaio passaram para `scripts/pix/`, e o teste do QR levou 357 ms.
- **As datas de exemplo valem até 15/12/2026.** Depois disso, o exemplo do Swagger vira data
  passada. Troque as constantes `PASSO6_CHECK_IN`/`OUT` em `config/swagger.js` antes de reusar.
- **Data no passado e data inválida: corrigido em 24/11** (QA do roteiro, `fix/qa-roteiro-24nov`).
  A disponibilidade e o booking respondem 400 para entrada antes de hoje (no fuso do hotel) e para
  data que não existe (`2027-02-30`), que antes dava 500. CPF preenchido com dígito errado também
  é 400 com qualquer provider, a mesma regra do balcão. Por isso, depois de 15/12 as datas de
  exemplo do Swagger passam a responder 400: troque-as antes de reusar.
- **Asaas, 🟡-1 e 🟡-3 do qa-redteam de 16/10, fechadas em 11/11:** cancelar a reserva cancela a
  cobrança no Asaas (o sinal vira `FAILED`), o prazo devolvido ao hóspede é de 30 min, e CPF
  malformado responde 400. Ainda não há job que expire sozinho a cobrança `PENDING` de reserva
  que ninguém cancelou: no Asaas, o QR dela continua pagável e, se pago, confirma a reserva.
