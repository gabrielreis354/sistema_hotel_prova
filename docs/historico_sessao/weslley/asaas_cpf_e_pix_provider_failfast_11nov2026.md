# Asaas: CPF inválido vira 400 e PIX_PROVIDER desconhecido não sobe — 11/11/2026

Sessão do Weslley com o Claude Code. Fecha a 🟡-3 do qa-redteam de 16/10
(`docs/qa/redteam_asaas-pix_16out2026.md`) e o repasse "PIX_PROVIDER desconhecido cai no fake"
(`docs/qa/repasses/para_weslley_31102026.md`). O plano foi apresentado em 10/11; nesta sessão o
Weslley escolheu impedir a subida (em vez de só registrar no log) e mandou seguir.

Início: `git pull` da `develop` (101 commits atrás, fast-forward). A `feature/passo6-swagger` já
estava na develop pelo #122.

## O que foi feito

Branch `fix/asaas-ressalvas-2`, a partir da develop `0ff0021`.

| Commit | O que muda |
|---|---|
| `8ec77f2` | `app/utils/isValidCpf.js` (11 dígitos, não todos iguais, 2 verificadores). A reserva pública responde 400 `guest.cpf inválido` antes de chamar o PSP, só quando `provider.requiresPayerCpf` (Asaas). Fake e Mercado Pago continuam sem validar |
| `d0c640b` | `pix/index.js`: allowlist com `trim()` e minúsculas; vazio continua `fake`; valor fora da lista lança erro. `_web.js` chama `getPixProvider()` no fail-fast, junto do JWT, e sai com `process.exit(1)` |
| `c47f0be` | Ressalvas do qa-redteam: a mensagem de erro não repete o valor do env; `Payment.provider` vem de `getPixProviderKey()` (a mesma instância que cobrou); `isValidCpf` aceita só `52998224725` ou `529.982.247-25`; testes novos |
| `107e69d` | Roteiro do passo 6 e `ASAAS_SANDBOX.md` com o 400 novo e o `Restarting` do backend; relatório do qa-redteam e repasse |

## Verificação

- TDD: os testes novos falharam antes da implementação, pelo motivo certo (201 em vez de 400,
  fake em vez de Asaas, nenhum erro lançado).
- O teste da normalização foi conferido contra a linha antiga: falha com `Received: " Asaas "`.
- Suíte completa do core-service depois do último commit: 59 arquivos, 1178 verdes, 21 pulados (já existiam), 0 falhas.
- Subida real: `PIX_PROVIDER=assas node _web.js` sai com código 1 e
  `❌ PIX_PROVIDER desconhecido. Use um destes: fake, mercadopago, asaas — servidor não vai subir.`
  No `/mnt/c` o carregamento dos módulos leva ~78 s antes de chegar ao erro.

## qa-redteam

`docs/qa/redteam_asaas-ressalvas-2_11nov2026.md`: APROVADO COM RESSALVAS, sem 🔴.

- Corrigidos: 🟡-1 (roteiro desatualizado), 🟢-3 e 🟢-4 (testes que passariam com a regra
  quebrada), 🟢-5 (duas fontes para o provider), 🟢-6 (valor cru do env no log), 🟢-7 (formato
  do CPF).
- Não corrigidos:
  - 🟢-2: descrição do 400 no `config/swagger.js` não cita "CPF inválido". O schema
    `ValidationErrors` já cobre o corpo; mexer no swagger exige regerar o `openapi.json` e o
    cliente tipado. Fica para a próxima mudança no swagger.
  - 🟢-8: teste do fail-fast do `_web.js` com `spawn`. Conferido à mão nesta sessão.
- Repasse em `docs/qa/repasses/para_dono-indefinido_11112026.md`: o find-or-create da reserva
  pública compara o CPF cru (formatado × só dígitos cria hóspede duplicado), e o CRUD de hóspede
  aceita CPF com verificador inválido. Os dois já existiam antes desta branch.

## Pendências

- Merge da `fix/asaas-ressalvas-2` na develop (PR, como os anteriores).
- Asaas 🟡-1 continua aberta: expiração da cobrança + `cancelCharge` no cancelamento da reserva.
- PIX ao vivo no roteiro (M6, 17/11): a chave do sandbox vence em 15/11; pedir a nova ao Weslley.
- Compose do roteiro inteiro (M8).

## Ambiente

- Docker Desktop estava parado: `docker.exe desktop start` e `docker.exe start hotel-test-pg`.
