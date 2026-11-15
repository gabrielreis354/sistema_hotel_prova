# Revisão do PR #148 (1º up a frio do compose) — 15/11/2026

**Pedido do Gabriel:** revisar o #148 do Weslley.
**Situação ao revisar:** o PR já estava mergeado na `develop` (`df04d4a`, pelo autor, às 17:12 de
15/11), sem qa-redteam e sem revisão de outra pessoa. Esta revisão é, portanto, posterior ao merge.

## O que o PR fez
- `docker-compose.yml`: o `rabbitmq-setup` passou a depender do broker com `service_started`, não
  mais `service_healthy`.
- `infra/k8s/rabbitmq-setup.sh`: o script espera a API do RabbitMQ por até 90 tentativas de 2 s
  (antes eram 60).

## Veredito: correção certa, com um 🟡 de visibilidade

**O que está certo:**
- A causa foi bem identificada. No 1º boot a frio, o healthcheck do broker estourava o prazo, a
  dependência `service_healthy` do setup falhava e o `up` inteiro abortava.
- Nenhum outro serviço depende de o RabbitMQ estar saudável:
  - o backend e o analytics esperam só "iniciado" e reconectam sem limite, com espera crescente de
    até 30 s (`analytics-service/app/consumer/consumer.js`, `createConsumer`);
  - o nginx depende do backend; o Prometheus e o Grafana dependem do backend e do Prometheus.
  Tirar a espera do setup não cria nova corrida.
- O critério de aceite da delegação foi cumprido: 3 ciclos seguidos de `down -v` e `up -d --build`,
  sem segundo `up`.
- O relatório de sessão cita as senhas geradas para o `.env` local, mas não os valores. Nada de
  segredo foi commitado.
- No k8s, o mesmo script roda dentro de um `until ... do` que repete o setup. O prazo maior não
  atrapalha.

## Achados

### 🟡-1 A falha do setup ficou silenciosa
- **Antes:** o setup falhando aparecia no próprio `docker compose up`.
- **Agora:** o `up -d` termina com sucesso, e o setup pode sair com erro depois, até 3 min mais
  tarde. Causas possíveis: senha errada no `.env` ou broker lento demais.
- **Efeito:** o analytics fica sem usuário e sem fila, não consome nada, e o passo 7 do roteiro
  (Indicadores) aparece zerado. Na frente da banca, isso parece defeito do analytics.
- **Correção (feita nesta mesma branch, com o OK do Gabriel):** `./start.sh compose-up [args do up]`
  roda o `docker compose up -d`, espera o `rabbitmq-setup` terminar e para com o log dele se o
  código de saída não for 0 ou se passar de 200 s. O README passa a indicá-lo no "Subir tudo".

### 🟢-2 A validação não conferiu o analytics
A tabela do PR mostra o `rabbitmq-setup`, o backend e o nginx. Quem prova a integração dos
microsserviços é o analytics consumindo os eventos do core. No ensaio de 24/11, conferir também o
`analytics-service` saudável e os Indicadores com números.

### 🟢-3 Processo
O CLAUDE.md pede qa-redteam antes de merge na `develop`. A correção é pequena e está certa, mas o
passo fica registrado para os próximos PRs.

## Verificação do `compose-up`
- **Docker simulado**, com o estado do `rabbitmq-setup` controlado:
  - `exited 0` → saída 0;
  - `exited 1` → saída 1, com o log do setup;
  - contêiner não criado, com prazo de 4 s → saída 1 por tempo esgotado;
  - `running` até o prazo → saída 1 por tempo esgotado.
- **Compose real**, no projeto isolado `gesway-ensaio`, a partir da `develop` (`94eee74`):
  - `./start.sh compose-up --build` terminou com saída 0 em 28 s, com as imagens em cache;
  - o `rabbitmq-setup` saiu com código 0;
  - backend, analytics, RabbitMQ e os bancos ficaram saudáveis.
  O ambiente foi apagado no fim com `down -v`.
- Não testado: o 1º boot com imagens frias. A espera do `compose-up` não depende disso, mas o tempo
  total sobe.
