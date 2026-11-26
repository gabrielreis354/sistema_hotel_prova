# Sessão de 26/11/2026 — scripts do PIX no repositório, cobrança órfã e ensaio do passo 6

**Dev:** Weslley (com Claude Code) · **Pedido:** revisar o PR #231, preparar o plano A do passo 6 e
fechar as duas ressalvas do repasse do Sirlande de 24/11 (`docs/qa/repasses/para_weslley_24112026.md`).

## Entregue

| Item | Onde | Situação |
|---|---|---|
| Revisão do PR #231 (datas do passo 6 no Swagger) | PR #231 | Aprovado; o merge depende do aceite do Sirlande |
| 🟡 do repasse: scripts do plano A e do plano B só na máquina do Weslley | `scripts/pix/`, `PASSO_6_RESERVA_DIRETA_PIX.md`, branch `chore/scripts-pix-ensaio` | PR para a `develop` |
| 🟢 do repasse: cobrança órfã no Asaas quando o QR falha | `AsaasPixProvider.js`, branch `fix/asaas-cobranca-orfa` | PR para a `develop`; **merge só depois do congelamento**, com o aceite do Sirlande |
| qa-redteam das duas branches | `docs/qa/redteam_pix_scripts_e_orfa_26112026.md` | Sem 🔴. Scripts aprovados com ressalvas (2 🟡, corrigidos); fix aprovado |
| Ensaio do passo 6 | sandbox do Asaas + compose | Planos A e B de ponta a ponta (abaixo) |

## Scripts do PIX (`scripts/pix/`)

- `1_preparar_plano_a.sh [URL]`: confere o backend e o provider, sobe o quick tunnel (ou usa a URL
  passada), aponta o webhook `gesway-ensaio-plano-a`, reativa a fila, regrava o token e testa o QR.
- `2_plano_b.sh`: fecha o túnel e sobe o backend com `PIX_PROVIDER=fake`, sem mexer no `.env`.
- `3_fechar.sh`: fecha o túnel e devolve o backend ao `.env`.
- Nenhum segredo: a chave e o token são lidos do container do backend. O `asaas_webhook_e_qr.mjs`
  repete a trava de sandbox do `getAsaasConfig`. Testado com URL de produção, com host parecido
  (`api-sandbox.asaas.com.evil.io`) e com chave `$aact_prod_`: os três param antes da rede.
- **Saída 144 do `3_fechar.sh` em 24/11:** o `pkill -f "cloudflared tunnel"` casava com o shell que
  chamou o script, cujo texto do comando tem essas palavras, e o matava. Agora o script fecha pelo
  PID do túnel que ele mesmo subiu. Conferido: o `3_fechar.sh` sai com 0.
- A porta vem do `BACKEND_HOST_PORT` do `.env`, como no compose. Testada com o `.env` vazio, com
  aspas e comentário, com a linha comentada e com o valor no shell.

## Cobrança órfã

- Se o `GET /payments/{id}/pixQrCode` falha (timeout, não-2xx ou sem payload), o `createCharge`
  chama o `cancelCharge` como melhor esforço. Ele loga o id com o resultado e relança o erro do QR.
  O contrato não muda: continua 503.
- TDD: o teste falhou no `1d0a831`; o fix é o `b6328ce`; o teste de timeout é do 🟢-4 do qa-redteam.
  49 testes no `asaas-pix.test.js`; a suíte completa do core deu 1411 verdes e 1 pulado.
- **Teste ao vivo:** o provider da branch foi copiado para o container com outro nome e apagado no
  fim. O `fetch` do `pixQrCode` foi forçado a 400, e o resto foi contra o sandbox. A cobrança
  `pay_0_uf1v7wbodhx9zt` ficou `deleted: true` no Asaas. O erro devolvido foi
  `Asaas respondeu 400`, e o log trouxe "cobrança sem QR Code cancelada no Asaas" com o id.
- Pior caso de latência no caminho de falha: ~40 s, que já terminava em 503. Nenhuma transação fica
  aberta nesse tempo, e o nginx corta em 60 s.

## Ensaio do passo 6 (26/11, compose)

- **Plano A:** QR do sandbox em 357 a 605 ms. Reserva `e5a08d1d…` (Standard, 20 a 22/12),
  cobrança `pay_0_f7awluxi0sk957`. O pagamento foi confirmado pelo
  `POST /v3/sandbox/payment/{id}/confirm`, que faz o mesmo que o botão do painel, e o Asaas chamou o
  webhook pelo túnel. Status: `CONFIRMED`, `deposit.status = PAID`.
- **Plano B:** `2_plano_b.sh`, depois a reserva `ff727899…` com o `simular_pagamento_pix.js`.
  Resultado: `CONFIRMED`/`PAID`. Depois o `3_fechar.sh` devolveu o backend a `PIX_PROVIDER=asaas`.
- As datas de 20 a 22/12 foram escolhidas para não ocupar as do roteiro (15 a 18/12).

## Pendências para o próximo dev

- Merge do PR dos scripts. O do fix só entra depois do congelamento, com o aceite do Sirlande.
- **Banco da demonstração:** ficaram duas reservas de teste `CONFIRMED` em 20 a 22/12 (Standard).
  Recriar o banco antes da banca (§1.5 do guia).
- **Webhook do sandbox:** depois do `3_fechar.sh`, ele aponta para uma URL de túnel que já não
  existe. Rode o `1_preparar_plano_a.sh` antes do próximo ensaio.
- 🟢 do qa-redteam, fora do diff: em três outros pontos a cobrança órfã fica só no log, sem cancelar.
  São eles: o quarto excluído antes da gravação (`CreateBookingController.js:138-143`), o rollback
  da transação (`:246-251`) e o `POST /payments` que estoura o tempo do nosso lado mas foi criado
  no Asaas. Fica para o 5º semestre.
- Os scripts antigos em `/mnt/c/Users/lucas/gesway_ensaio/` foram substituídos pelos de
  `scripts/pix/` e podem ser apagados.
