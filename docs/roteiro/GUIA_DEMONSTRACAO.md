# Guia da demonstração do Gesway — passo a passo

> Para quem vai apresentar o MVP ao orientador ou à banca. Este guia pode ser seguido sem nenhum
> outro documento. Os detalhes dos passos 6 (PIX) e 8 (Grafana) estão em
> [`PASSO_6_RESERVA_DIRETA_PIX.md`](PASSO_6_RESERVA_DIRETA_PIX.md) e
> [`PASSO_8_GRAFANA.md`](PASSO_8_GRAFANA.md). As respostas às perguntas prováveis da banca estão
> em [`docs/banca/FOLHA_RESPOSTAS_BANCA.md`](../banca/FOLHA_RESPOSTAS_BANCA.md).
>
> Conferido contra a `develop` em 22/11/2026. No ensaio técnico de 22/11 o sistema subiu a frio na
> 1ª tentativa, em 36 s, e o roteiro automatizado passou nos 7 passos em 54 s.

## O que a demonstração mostra

O MVP é o roteiro abaixo, ao vivo, no computador do grupo (Docker Compose, sem nuvem). Leva de 10
a 15 minutos.

| # | Quem | O que acontece | Onde |
|---|---|---|---|
| 1 | Administrador | Cadastra uma categoria e um quarto | App, Quartos |
| 2 | Recepção | Cria a reserva no balcão, vê o valor antes de confirmar e faz o check-in | App, Reservas |
| 3 | Garçom, no celular | Lança consumo na conta da suíte e numa mesa, inclusive sem rede | App, Comanda |
| 4 | Recepção | Abre o painel do dia: chegadas, saídas e risco de *no-show* | App, Hoje |
| 5 | Recepção | No check-out, vê a conta em linha do tempo, registra o pagamento e fecha a estadia | App, detalhe da reserva |
| 6 | Hóspede | Reserva direto e paga o sinal por PIX; o pagamento confirma a reserva | Swagger, e a reserva confirmada no app |
| 7 | Gerente | Abre os indicadores, servidos por outro serviço (`analytics-service`) | App, Indicadores |
| 8 | — | 30 s de monitoramento: os dois serviços no ar e os eventos aplicados | Grafana |

O passo 6 não tem tela do hóspede: o site público é do 5º semestre. Ele é mostrado pela API, no
Swagger, e o resultado aparece na tela de reservas do app.

---

## Parte 1 — Na véspera (uma vez, ~30 min)

### 1.1 O que o computador precisa ter

- Docker Desktop com o Compose (ensaio de 22/11: Docker 29.5.3, Compose v5.1.4), ligado.
- WSL com a pasta do repositório na `develop` atualizada (`git pull`).
- Node 24 e pnpm 9, para a tela do app. Na primeira vez: `pnpm -C frontend install`.
- Para o garçom no celular: o celular na **mesma rede Wi-Fi** do computador.

### 1.2 Configurar o ambiente

Na raiz do repositório:

```bash
cp .env.example .env                                   # só se ainda não existir
node services/core-service/scripts/gerar_chaves_jwt.js # chaves do login (só na 1ª vez)
```

No `.env`, preencha as senhas que o compose exige. Ele recusa subir sem elas, e a mensagem diz qual
falta: `PIX_WEBHOOK_SECRET`, as do MinIO, as do RabbitMQ e as do banco do analytics. Para o passo 8,
também `METRICS_TOKEN` (`openssl rand -hex 32`) e `GRAFANA_ADMIN_PASSWORD`.

**PIX:** deixe `PIX_PROVIDER=fake` (plano B, sem internet). O plano A, com o sandbox do Asaas, só
vale se o ensaio da véspera passou com ele: ver o guia do passo 6.

### 1.3 Subir o sistema e carregar os dados

```bash
./start.sh compose-up --build                       # sobe tudo e confere o rabbitmq-setup
docker compose --profile observability up -d        # Prometheus e Grafana (passo 8)
docker compose exec backend node command.js migrate
docker compose exec -e ALLOW_SEED=1 backend node command.js seed
docker compose exec backend node command.js outbox-initial-load
```

- O `migrate` cria as tabelas. Sem ele, o seed falha num banco novo.
- O `seed` cria os hotéis de demonstração, o cardápio da comanda e o **cenário de hoje**. No Hotel
  Aurora: 4 estadias na casa; duas chegadas de hoje, a 201 com o sinal pago e a 102 sem sinal (o
  risco de *no-show*); a saída de hoje da 107, com R$ 300,00 a cobrar no check-out; e a 105, que
  já saiu hoje e está em limpeza. Sem ele, o painel Hoje e os indicadores aparecem zerados. Ele exige
  `ALLOW_SEED=1` porque cria usuários com senha conhecida.
- O `outbox-initial-load` manda ao analytics o retrato do que o seed gravou, para os indicadores
  terem histórico.

> O cenário de hoje é ancorado na data em que o seed roda. **Rode o seed no dia da apresentação**,
> não na véspera; ele pode rodar de novo sem duplicar.

### 1.4 Subir a tela do app

O compose sobe o backend, o analytics, os bancos, o RabbitMQ, o MinIO e o nginx, mas **não serve a
tela**. Em outro terminal:

```bash
pnpm -C frontend --filter app-pms dev --host
```

- No computador: `http://localhost:5173`.
- No celular do garçom: `http://<IP do computador na rede>:5173`. O `--host` é o que deixa o
  celular entrar; sem ele, só o computador abre.

### 1.5 Ensaiar uma vez

Faça os passos da Parte 3 uma vez, do começo ao fim. **Depois do ensaio, recrie o banco.** O que o
ensaio criou fica nele, e rodar o seed de novo não desfaz: a categoria do passo 1 (o nome é único por
hotel), o CPF do hóspede do passo 2 (o sistema recusa CPF repetido) e as reservas do cenário que
mudaram de situação. Sem recriar, os passos 1 e 2 falham no dia, e o painel Hoje e os indicadores
mostram dados do ensaio.

No dia da apresentação, antes da Parte 2:

```bash
docker compose --profile observability down -v   # apaga os bancos do ensaio
```

e depois a subida do §1.3 inteira, com `migrate`, `seed` e `outbox-initial-load`.

> O roteiro automatizado (`frontend/e2e`, `pnpm e2e`) também confere os 7 passos, mas **só num
> compose descartável** (`gesway-ensaio`): ele grava dados "E2E" que apareceriam na demonstração.
> Ver `frontend/e2e/README.md`.

---

## Parte 2 — 15 minutos antes

1. **Docker:** `docker compose ps`. Todos `running`, e `backend`, `nginx` e `analytics-service`
   com `healthy`.
2. **Seed do dia:** se houve ensaio, o banco já foi recriado no dia (§1.5). Se não houve,
   `docker compose exec -e ALLOW_SEED=1 backend node command.js seed`.
3. **Tela:** o `pnpm ... dev --host` no ar, e `http://localhost:5173` abre o login.
4. **Abas abertas no navegador, nesta ordem:**
   1. App logado como **administrador**.
   2. App numa janela anônima, logado como **recepção** (cada janela guarda um login).
   3. Swagger: `http://localhost:3000/api-docs`, seção **Reserva Direta (Público)**.
   4. Grafana: `http://localhost:3002`, pasta **Gesway** → **Saúde do core e do analytics**, intervalo
      **Last 1 hour**. Em outra aba, **Mensageria (RabbitMQ)**.
   5. GitHub Actions, com a última execução verde da `develop`.
5. **Celular:** app aberto e logado como **garçom**, na tela **Comanda**.
6. **Logins** (usuários do seed do Hotel Aurora; a senha é a do seed, em
   `services/core-service/seed/seed_hotels.sql`; hotel/subdomínio `aurora`):

   | Papel | Usuário |
   |---|---|
   | Administrador e gerente | `admin@aurora.example` |
   | Recepção | `recep1@aurora.example` |
   | Garçom | `garcom@aurora.example` |

---

## Parte 3 — A demonstração

Para cada passo: o que fazer, o que a banca deve ver e uma frase para dizer.

### Passo 1 — Administrador cadastra categoria e quarto (1 min) · aba do administrador

1. **Quartos → Categorias → Nova categoria.** Nome (ex.: "Suíte Demonstração"), preço da diária e
   capacidade. Salvar.
2. **Quartos → Novo quarto.** Número (ex.: 902) e a categoria recém-criada. Salvar.

**A banca vê:** o quarto novo na lista, disponível.
**Dizer:** "O preço é da categoria. A reserva calcula o valor no servidor, não na tela."

### Passo 2 — Recepção cria a reserva e faz o check-in (2 min) · aba da recepção

1. **Reservas → Nova reserva.** Cadastre um hóspede novo (nome e CPF válido; o sistema recusa CPF
   com dígito errado e CPF repetido).
2. Entrada **hoje**, saída **amanhã**. Escolha o quarto 902.
3. **Mostre o valor** que aparece antes de confirmar. **Confirmar reserva.**
4. No detalhe da reserva, **Fazer check-in.**

**A banca vê:** a reserva passa a "hospedado", e o quarto, a ocupado.
**Dizer:** "É o *walk-in* do balcão: a reserva nasce pendente e vai direto ao check-in. O check-in
abre a conta da suíte, onde o garçom vai lançar. Um duplo clique em confirmar grava uma vez só."

### Passo 3 — Garçom lança na suíte e numa mesa, inclusive sem rede (3 min) · celular

1. Em **Comanda**, na lista **Contas abertas**, toque na conta do quarto 902.
2. No cardápio, toque num item (ex.: Caipirinha). Aparece o desfazer por alguns segundos.
3. **Sem rede:** ligue o **modo avião** do celular **com a comanda já aberta**. Aparece o aviso de
   sem conexão. Lance mais um item: ele fica na fila.
4. Desligue o modo avião. O item da fila é enviado sozinho.
5. Volte a **Comanda → Abrir conta → Mesa**, dê um nome (ex.: "Mesa 4") e lance um item.

**A banca vê:** os lançamentos na conta da suíte, inclusive o feito sem rede, e a conta da mesa.
**Dizer:** "No restaurante a rede cai. O lançamento não se perde: fica na fila do aparelho e sobe
quando a rede volta."

> ⚠️ **Não recarregue a página sem rede.** O app ainda não guarda as telas no aparelho (PWA é do
> 5º semestre): recarregado sem rede, ele não abre.

### Passo 4 — Painel do dia (1 min) · aba da recepção

1. Abra **Hoje** (a página inicial).

**A banca vê:** os números do dia, a lista de **Atenção** (a chegada sem pagamento da 102 — risco
de *no-show*), **Chegadas**, **Saídas** (a 107 sai hoje com R$ 300,00 a cobrar) e quem está na
casa, com os dados do seed de hoje. Há um quarto em limpeza com o botão para liberar.
**Dizer:** "É a primeira tela da recepção de manhã: o que precisa de ação hoje. Sem rede, o painel
diz 'Sem conexão' e não finge que o dado está atualizado."

### Passo 5 — Check-out com a conta e o pagamento (2 min) · aba da recepção

1. Abra a reserva do quarto 902 (pela busca em Reservas, ou em **Hoje → Na casa**).
2. Mostre a **conta em linha do tempo**: a diária e os consumos lançados pelo garçom no passo 3.
3. **Registrar pagamento**: o valor já vem preenchido com o saldo, conferido no servidor. Escolha o
   meio (ex.: cartão).
4. **Fazer check-out → Confirmar check-out.**

**A banca vê:** a conta quitada e fechada, a estadia encerrada e o quarto em limpeza.
**Dizer:** "O saldo vem do servidor, não da tela: outro balcão pode ter recebido no meio. O quarto
vai para limpeza, e a recepção o libera no painel quando a camareira termina."

### Passo 6 — Reserva direta com PIX (3 min) · Swagger

Na seção **Reserva Direta (Público)**, sem token, subdomínio `aurora`. Detalhes e erros no
[guia do passo 6](PASSO_6_RESERVA_DIRETA_PIX.md).

1. **`GET /public/aurora/availability`**: as categorias livres, com o preço calculado no servidor.
   Copie um `category_id`.
2. **`POST /public/aurora/bookings`**, com o `category_id` copiado: resposta 201, reserva
   `PENDING`, sinal de 30% e o QR do PIX. Guarde o `reservation.id` e o `pix.provider_charge_id`.
3. **Pagamento (plano B)**, num terminal:
   ```bash
   docker compose exec backend node scripts/simular_pagamento_pix.js <pix.provider_charge_id> http://localhost:3000
   ```
4. **`GET /public/aurora/bookings/{id}/status`**: `CONFIRMED`, sinal `PAID`.
5. No app, **Reservas**, filtro **Próximos 30 dias**: a reserva aparece confirmada, com o sinal PIX
   no extrato.

**Dizer:** "O hóspede reserva sem passar pela recepção. Quem confirma a reserva é o aviso do
pagamento, autenticado, e não o hóspede."

### Passo 7 — Indicadores do gerente (1 min) · aba do administrador

1. Abra **Indicadores.**

**A banca vê:** receita recebida por mês, sazonalidade (reservas por mês de check-in), receita por
categoria, meios de pagamento e hóspedes frequentes, incluindo o que foi feito nos passos anteriores.
**Dizer:** "Esta tela não vem do sistema da recepção. Ela vem do `analytics-service`, outro serviço,
com banco próprio. Cada check-in e pagamento virou um evento no RabbitMQ, e ele aplicou esses
eventos. Se o analytics cair, a recepção continua funcionando."

### Passo 8 — Monitoramento (30 s) · Grafana

Siga a tabela de "Durante a demonstração" do [guia do passo 8](PASSO_8_GRAFANA.md):

1. **Backend no ar** e **Analytics no ar** = 1, requisições e taxa de erro 5xx.
2. **Eventos aplicados**, que subiram durante a demonstração.
3. Aba **Mensageria**: **Mensagens mortas (DLQ)** = 0.
4. Aba do GitHub Actions: a execução verde.

---

## Se algo der errado

| Sintoma | O que fazer |
|---|---|
| O compose não sobe e diz que falta variável | Preencha no `.env` a variável que a mensagem cita e rode `./start.sh compose-up` de novo |
| `compose-up` avisa que o `rabbitmq-setup` falhou | Confira as senhas do RabbitMQ no `.env`. O broker guarda a senha do 1º boot no volume: se ela mudou, só com `docker compose down -v` (apaga os dados; rode `migrate`, `seed` e `outbox-initial-load` de novo) |
| Login diz "Muitas tentativas de entrar a partir desta rede" | O nginx limita a 5 logins por minuto por IP. Espere um minuto |
| Painel Hoje ou Indicadores zerados | Rode o `seed` de novo (é do dia) e, para os indicadores, o `outbox-initial-load` |
| Celular não abre o app | O `pnpm ... dev` precisa do `--host`; celular e computador na mesma rede; o firewall do Windows pode pedir para liberar a porta 5173 |
| Indicadores com erro | `docker compose ps`: o `analytics-service` está no ar? Se não, `docker compose up -d analytics-service`. Os outros passos não dependem dele |
| Algo do passo 6 | Tabela "Se algo der errado" do [guia do passo 6](PASSO_6_RESERVA_DIRETA_PIX.md) |
| Grafana vazio ("No data") | Intervalo **Last 3 hours**; o profile precisa ter subido antes do passo 1 ([guia do passo 8](PASSO_8_GRAFANA.md)) |

## Depois da demonstração

Desligue para não deixar o computador carregado:

```bash
docker compose --profile observability down   # mantém os dados para a próxima vez
```

Use `down -v` só se quiser começar do zero na próxima vez (apaga os bancos). A demonstração não usa
nuvem, então não há recurso pago para desligar.

## O que fica de fora do MVP (se a banca perguntar)

Decidido em 21/10 e registrado no Documento 08: site público de reserva com tela, tela de usuários,
mapa visual de reservas (rack), financeiro, grupos e B2B, e o app instalável (PWA). A nuvem (AWS)
é do 5º semestre (Documento 05, ADR-004 e ADR-005).
