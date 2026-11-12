# Ensaio do PIX ao vivo com o Asaas sandbox (M6) — 12/11/2026

Dev: Weslley (IA orquestrada). Base: `develop@4f7c537`. Nenhuma mudança de código nesta sessão.

## Objetivo

Fechar a última pendência das 3 🟡 do Asaas (PRs #135 e #139): provar contra o **sandbox real**
o que até 11/11 só tinha sido provado com o provider fake e com mocks:

1. cancelar a reserva no PMS cancela a cobrança no Asaas (🟡1, `cancelCharge`);
2. o próprio Asaas chama o `POST /webhooks/pix` e a reserva vai para `CONFIRMED`.

## Ambiente

- Banco `gestao_hotel_manual` no container `hotel-test-pg` (porta 55432), hotel Aurora
  (`admin@aurora.example`).
- Backend na porta 3000 com as variáveis do `.env.test`, mais `POSTGRES_DB=gestao_hotel_manual`,
  `PIX_PROVIDER=asaas`, `ASAAS_BASE_URL=https://api-sandbox.asaas.com/v3`, a chave de sandbox
  nova (vence depois de 15/11) e um `ASAAS_WEBHOOK_TOKEN` gerado na hora. A chave e o token
  ficaram num arquivo fora do repo; o `.env` não foi lido.
- Túnel público: `cloudflared tunnel --url http://localhost:3000` (quick tunnel, sem conta).
  O ngrok não estava instalado.

## Resultado

### 1. Cancelamento → cobrança removida no Asaas — ✅

| Passo | Resultado |
|---|---|
| `POST /public/aurora/bookings` (Standard, 20–22/12, CPF válido) | 201; reserva `447a34a6…` `PENDING`; sinal R$ 90 `PENDING`; cobrança `pay_0_bt96d13ihylc0r` com vencimento em 30 min |
| `PUT /reservations/447a34a6…/cancel` como ADMIN | 200, reserva `CANCELLED` |
| `GET /v3/payments/pay_0_bt96d13ihylc0r` no Asaas | `deleted: true` |
| Banco | reserva `CANCELLED`, Payment `FAILED` |

### 2. Webhook chamado pelo Asaas → reserva confirmada — ✅

| Passo | Resultado |
|---|---|
| `POST /v3/webhooks` no sandbox apontando para `<túnel>/webhooks/pix`, com `authToken` | webhook `825858ca…` ativo |
| `POST /public/aurora/bookings` (Standard, 23–25/12) | reserva `13d926f6…` `PENDING`; cobrança `pay_0_fnwa7uaq89qada` |
| Weslley clicou em "Confirmar pagamento" no painel do sandbox | Asaas: `RECEIVED` |
| Reserva e sinal no PMS | reserva `CONFIRMED`; Payment `PAID` (`paid_at` 22:14:02 UTC) |

Nada consultou o status por outro caminho: a confirmação veio do webhook entregue pelo Asaas.

Depois do teste, o webhook foi removido (`DELETE /v3/webhooks/825858ca…` → `deleted: true`) e o
túnel foi fechado (a URL passou a responder 530).

## Achados

- **Pelo painel, "Aguardando pagamento" confunde.** A lista de cobranças não mostra o botão de
  simular o pagamento: é preciso abrir os detalhes da cobrança. Vale uma linha no roteiro do M6.
- **Ambiente WSL:** no meio da sessão a interop com o Windows caiu
  (`UtilAcceptVsock:281: accept4 failed 110`). Nenhum `.exe` rodou mais (`docker.exe`,
  `cmd.exe`, `winget.exe`), e o Docker Desktop parou junto (o backend passou a responder 500 com
  `ECONNREFUSED 127.0.0.1:55432`). O container foi religado pelo Docker Desktop no Windows. A
  correção da interop é `wsl --shutdown`.
- **Túnel:** o `cloudflared` (quick tunnel) dispensa conta e funcionou. O ngrok continua sendo o
  documentado em `docs/pagamentos/ASAAS_SANDBOX.md` §5.

## Pendências

- **Trocar a chave de sandbox depois do M6 (17/11).** Ela foi colada no chat da sessão.
- Job que expire a cobrança `PENDING` de reserva abandonada: tem que chamar `cancelCharge` antes
  de marcar `EXPIRED`.
- Compose do roteiro inteiro, com o analytics (M8, com o Sirlande).
- Revisar a infra da H.3 e tirar as marcas `[revisão do Weslley]` de `docker-compose.yml` e
  `infra/k8s/` (`analytics.yaml`, `nginx.yaml`, `networkpolicy.yaml`, `kustomization.yaml`).
- Roteiro de 7 passos no Playwright, como job não bloqueante (M9).
- Revisar o PR #142 do Gabriel, que usa o `cancelPendingCharges` no `DELETE` e no walk-in.
