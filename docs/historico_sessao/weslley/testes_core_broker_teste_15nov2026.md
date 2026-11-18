# Suíte do core-service com o pipeline do analytics — 15/11/2026 (continuação)

Dev: Weslley (IA orquestrada). Branch: `develop@2ec2446`. Nenhuma mudança de código nesta parte.

Esta é a continuação de `compose_primeiro_up_rabbitmq_15nov2026.md`, o relatório do PR #148 (já
mesclado). Foi registrada num arquivo novo porque o `CODING_STANDARDS` não deixa editar relatório
passado.

## Objetivo

Rodar a suíte do core-service no `develop` atualizado, inclusive os casos do pipeline dos
indicadores (`tests/analytics.test.js`), que eram pulados nesta máquina.

## O que foi feito

1. **Volta ao `develop` e pull.** Entraram os merges #144, #145 e #147. O #147 adiciona a janela do
   check-in (`app/utils/checkInWindow.js`).
2. **Compose derrubado** com `docker compose down`, sem `-v`: os volumes ficaram.
3. **1ª rodada da suíte: falhou.** O erro foi `connect ECONNREFUSED 127.0.0.1:55432`, porque o banco
   de teste `hotel-test-pg` estava parado havia 3 semanas. O `No test files found` que aparece junto é
   efeito colateral do `globalSetup`, e não falta de arquivo de teste. A correção foi
   `docker start hotel-test-pg`.
4. **2ª rodada: passou, mas pulou o analytics.** Resultado: `Test Files 60 passed (60)`,
   `Tests 1215 passed | 21 skipped`. Dos 21 pulados, 20 eram do `analytics.test.js`, porque o
   `.env.test` não tinha `RABBITMQ_HOST` nem `RABBITMQ_*_PASSWORD`.
5. **Broker de teste dedicado.** O RabbitMQ do compose não expõe a 5672 para o host (só a 15672),
   então foi criado um broker só para os testes, no mesmo esquema do `hotel-test-pg` e do CI
   (`ci-core-service.yml`):
   - container `hotel-test-rmq`, imagem `rabbitmq:4-management-alpine`, `--user rabbitmq`,
     `--restart unless-stopped`, porta `127.0.0.1:5673` → 5672;
   - topologia e usuários criados pelo `infra/k8s/rabbitmq-setup.sh`: `hotel_core_publisher`,
     `hotel_analytics_consumer` e o administrador `hotel_broker`.
6. **`.env.test` (não versionado).** Bloco acrescentado no final: `RABBITMQ_HOST=localhost`,
   `RABBITMQ_PORT=5673`, os dois usuários, as senhas geradas com `openssl rand -hex 16`,
   `RABBITMQ_DEFAULT_USER`/`RABBITMQ_DEFAULT_PASS` (só para rodar o setup de novo) e
   `ANALYTICS_PIPELINE_PORT=3063`.
7. **`npm ci` no `services/analytics-service`**, que não tinha `node_modules`. O teste do pipeline sobe
   o analytics como processo filho.
8. **3ª rodada: passou com o analytics.**

| Rodada | Arquivos | Testes |
|---|---|---|
| `tests/analytics.test.js` sozinho | 1 passed (1) | 28 passed (28) |
| Suíte inteira | 60 passed (60) | 1235 passed, 1 skipped (1236) |

O único pulado é `cancela reserva CONFIRMED com sucesso`, que depende do
`POST /reservations/:id/confirm` (não implementado).

9. **Containers de teste parados** com `docker stop hotel-test-rmq hotel-test-pg`. Eles não foram
   removidos, então os dados ficaram. Para voltar: `docker start hotel-test-pg hotel-test-rmq`.

## Commits

Nenhum nesta parte.

## Pendências

| # | Pendência | Prioridade | Observação |
|---|---|---|---|
| 1 | Revisão e merge do PR deste relatório | 🟢 Baixa | Só documentação |
| 2 | Recriar o `hotel-test-rmq` se ele for removido | 🟢 Baixa | Ele não tem volume nomeado. É preciso recriar o container com as credenciais do `.env.test` e rodar o `rabbitmq-setup.sh` de novo, como no passo 5 |
| 3 | Documentar o broker de teste local em `.env.test.example` | 🟢 Baixa | Hoje o modelo só diz que precisa da topologia, sem dizer como subir o broker na máquina |
