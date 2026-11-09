# QA Red Team — passo6-swagger
**Branch:** feature/passo6-swagger (4a8a5f6) · **Dev:** Weslley (M6) · **Base:** develop@245bb82 · **Data:** 04/11/2026
**Arquivos auditados:** 4 no diff (`config/swagger.js`, `openapi.json`, `schema.d.ts`, `docs/roteiro/PASSO_6_RESERVA_DIRETA_PIX.md`), mais 14 de contexto
**Achados no escopo:** 9 (🔴 0 · 🟡 3 · 🟢 6) · **Repassados:** 0

## Veredito
**APROVADO COM RESSALVAS**

O contrato está coerente e o cliente gerado bate byte a byte. A branch não muda nenhum comportamento da API.
Não há dado pessoal real. As três ressalvas 🟡 ficam no roteiro: seguido ao pé da letra, ele quebra em
três pontos (banco novo, troca do plano A para o B, passo 6 no PMS). Corrija antes do ensaio da semana 5.

## Achados no escopo

### 🟡 [Roteiro] "Antes da demonstração" não sobe um ambiente novo
**Onde:** `docs/roteiro/PASSO_6_RESERVA_DIRETA_PIX.md:26-30` e `:36`
**Cenário:** máquina limpa ou `docker compose down -v`. O roteiro manda `docker compose up -d --build` e depois o seed.
- Sem `.env`, o compose não sobe. São obrigatórios `PIX_WEBHOOK_SECRET`, `MINIO_ROOT_PASSWORD`, `MINIO_PRESIGN_PASSWORD`, `RABBITMQ_CORE_PASSWORD` e `RABBITMQ_ANALYTICS_PASSWORD`, todos com `:?` (`docker-compose.yml:52,67-68,107-110,150,170,174-175`). A linha 36 diz "só o `PIX_WEBHOOK_SECRET`", o que está errado.
- Sem as chaves do JWT (`gerar_chaves_jwt.js`), o backend recusa subir: o comentário do compose fala em "fail-fast em _web.js".
- Não há passo de `migrate`. O `_web.js` não faz sync, e o `seed_hotels.sql` exige o schema ("PRÉ-REQUISITO: o schema já deve existir", linha 14). Num volume novo, o seed falha com `relation "tenants" does not exist`.

O texto diz "como no `docker-compose.yml`", mas o cabeçalho do compose (linhas 5-9) tem cinco comandos e o roteiro copia só dois.
**Regra violada:** critério da tarefa, "funciona do começo ao fim sem conhecimento extra".
**Correção sugerida:** copiar a sequência inteira do cabeçalho do compose: `cp .env.example .env` (e preencher os segredos), `node services/core-service/scripts/gerar_chaves_jwt.js`, `up -d --build`, `exec backend node command.js migrate` e o seed. Trocar "só o `PIX_WEBHOOK_SECRET`" por "nada além do que o compose já exige".

### 🟡 [Roteiro] O passo 6 no PMS não mostra a reserva nos ensaios
**Onde:** `docs/roteiro/PASSO_6_RESERVA_DIRETA_PIX.md:60-61`
**Cenário 1:** o filtro padrão da lista é "Próximos 7 dias" (`ReservationsListPage.tsx:21`, `presetRange('next7', today)`). O servidor filtra por sobreposição (`ListReservationController.js:22-25`). Os ensaios do plano vão de 18/11 a 01/12, e nesse intervalo a janela de hoje+7 nunca chega a 15/12. Quem segue o roteiro abre a lista e **não encontra** a reserva. Só funciona a partir de 08/12, por acaso.
**Cenário 2:** o compose não serve o PMS. O nginx só faz proxy do backend, e o comentário do compose diz "frontend local (Vite, fora deste compose)". O roteiro não diz como subir o PMS nem qual URL abrir.
**Cenário 3:** "com o sinal pago na conta" não bate com o código. Uma reserva PENDING/CONFIRMED vinda do site não tem conta: a conta nasce no check-in (`openStayAccount`), e o `settlePaymentAccount` não encontra conta para ratear. O sinal aparece no **detalhe** da reserva, como linha "Sinal · PIX" do extrato (`reservationLogic.ts:285`), e não na lista nem numa conta.
**Regra violada:** critério da tarefa, "sem instrução errada que quebre a demonstração".
**Correção sugerida:** indicar o comando que sobe o PMS e a URL. Mandar abrir direto `/reservas/<reservation.id>`, ou ajustar o período da lista para 15/12 a 18/12. Trocar "sinal pago na conta" por "o sinal aparece pago no extrato da reserva".

### 🟡 [Roteiro] A troca do plano A para o B "em 1 minuto" não está descrita e não reaproveita a reserva
**Onde:** `docs/roteiro/PASSO_6_RESERVA_DIRETA_PIX.md:19`, `:69`, `:70`
**Cenário:** o plano A falha depois do POST, por exemplo com o túnel caído (linha 70). O apresentador obedece "plano B" e roda o script com o `pay_...` do Asaas. Com `PIX_PROVIDER=asaas` ativo, o `verifyWebhook` do Asaas exige `asaas-access-token` e o script manda `x-pix-signature`. Resultado: **401 "Assinatura inválida"** (`PixWebhookController.js:46-55`). A única saída é editar o `.env` (`PIX_PROVIDER=fake` ou remover a linha), rodar `docker compose up -d backend` e **refazer o POST**: a reserva antiga é do Asaas e continua PENDING, ocupando um quarto. Nada disso está escrito.
**Regra violada:** critério da tarefa, contingência que não funciona como descrita.
**Correção sugerida:** criar uma subseção "Trocar para o plano B" com três passos: editar o `.env`, `docker compose up -d backend` e refazer a partir do passo 3 com uma nova reserva. Vale citar a alternativa sem túnel que já existe em `ASAAS_SANDBOX.md` (curl com `asaas-access-token`), que mantém o Asaas quando só o túnel caiu.

### 🟢 [Swagger] O comentário "nunca mostram reserva no passado" tem prazo
**Onde:** `services/core-service/config/swagger.js:10`
**Cenário:** depois de 15/12/2026, na demonstração do 5º semestre, o exemplo 2026-12-15 fica no passado. A API aceita data no passado (ver abaixo) e a reserva é criada sem aviso.
**Correção sugerida:** escrever "até 15/12/2026; revisar as constantes antes do 5º semestre". Também dá para registrar a revisão como pendência no roteiro.

### 🟢 [Swagger/LGPD] O CPF de exemplo 529.982.247-25
**Onde:** `services/core-service/config/swagger.js:557` e `docs/roteiro/PASSO_6_RESERVA_DIRETA_PIX.md:50`
**Verificação:** os dígitos verificadores estão corretos. DV1: soma 295, 295 mod 11 = 9, 11−9 = **2**. DV2: soma 347, 347 mod 11 = 6, 11−6 = **5**. É o CPF fictício mais divulgado em tutoriais e já aparece em `tests/asaas-pix.test.js` e `tests/asaas-webhook.test.js`.
**Risco:** não existe faixa de CPF reservada para teste. Um CPF válido pode pertencer a alguém, e o exemplo o associa a "Maria Oliveira". Ele também é enviado ao sandbox do Asaas. O risco é baixo: o número é público, o contexto é de exemplo e não há nenhum dado verdadeiro do titular. Para a LGPD, é aceitável como exemplo.
**Correção sugerida:** acrescentar no comentário e no roteiro "CPF fictício de domínio público, usado só como exemplo". Não usar CPF de nenhum integrante.

### 🟢 [Swagger/Roteiro] "Muda a cada seed" é impreciso
**Onde:** `swagger.js:523` (description), `PASSO_6_RESERVA_DIRETA_PIX.md:45`
**Cenário:** o seed é idempotente (`ON CONFLICT ... DO NOTHING`, `seed_hotels.sql:6-8,66`). Rodar o seed de novo **não** muda o `category_id`. Ele só muda quando o banco é recriado. O apresentador pode achar que um id copiado num ensaio "venceu" sem motivo.
**Correção sugerida:** escrever "muda a cada banco novo".

### 🟢 [Roteiro] Tabela de falhas com uma linha impossível e lacunas
**Onde:** `PASSO_6_RESERVA_DIRETA_PIX.md:71`
**Cenário:** com o compose, "PIX_WEBHOOK_SECRET não configurado" não acontece, porque o compose recusa subir sem ele (`:?`). Faltam três sintomas prováveis:
- 404 "Categoria não encontrada", quando o UUID de exemplo do Swagger UI não é trocado;
- 401 do script, que é o achado 🟡 anterior;
- 409 depois de vários ensaios: cada ensaio deixa uma reserva PENDING nas mesmas datas, e o EXCLUDE conta PENDING. A Presidencial tem 2 quartos e a Suite tem 5.

**Correção sugerida:** trocar a linha impossível por essas três. Acrescentar ao "Antes da demonstração" um item para limpar o banco (ou cancelar as reservas de ensaio) antes da apresentação.

### 🟢 [Contrato] O 503 do POST /bookings não está documentado
**Onde:** `swagger.js:561-567` (respostas do POST). Já existia antes da branch, mas é a mesma operação que a branch editou e o mesmo dono.
**Cenário:** o controller devolve 503 "Serviço de pagamento indisponível no momento" (`CreateBookingController.js:117-118`), e o roteiro (linha 69) se apoia nesse 503. O contrato não o lista, e o cliente tipado não o conhece.
**Correção sugerida:** acrescentar `503: { description: 'PSP indisponível', schema Error }` e rodar `pnpm gen:api`.

### 🟢 [Roteiro] O plano B "prova o mesmo caminho" omite a conferência de valor
**Onde:** `PASSO_6_RESERVA_DIRETA_PIX.md:21-22`
**Cenário:** no plano B, o `FakePixProvider.getChargeStatus` devolve PAID com `amountVerifiable: false`, e a conferência de valor é pulada (`PixWebhookController.js:96-98`). Se a banca perguntar, a frase não é exata.
**Correção sugerida:** acrescentar "exceto a conferência de valor com o PSP, que só o plano A exercita".

## Afirmação 3: "a reserva pública aceita data no passado"
**CONFIRMADA.**
- `CreateBookingController.js:48-50` e `GetAvailabilityController.js:19-21` só comparam `check_in >= check_out` como string.
- Nenhum utilitário do caminho tem guarda de "hoje": `getAvailableCategories`, `calculateStayTotal` (que só repete a mesma comparação) e `checkReservationConflict` não comparam com a data atual.
- `ReservationModel` não tem validador, e nenhuma constraint de `applyDbConstraints.js` compara com `CURRENT_DATE`.

Exemplo: `POST /public/aurora/bookings` com `check_in=2026-01-05`, `check_out=2026-01-08` em quarto livre responde 201 e cobra o sinal. O defeito já existia antes da branch e o roteiro (linhas 76-79) já o registra como pendência. Por isso não foi repassado.

## Repassados a outro dev
Nenhum. Toda a área tocada (roteiro, Swagger do passo 6, Asaas/PIX) é do Weslley.

## O que foi verificado e está correto
- **Cliente gerado:** `swagger.js` foi gerado em diretório temporário pelo mesmo procedimento do `dump-openapi.mjs`, sem sobrescrever o versionado, e passado pelo `openapi-typescript` 7.13.0. `openapi.json` e `src/schema.d.ts` saíram **idênticos** aos da branch. O job "Contrato da API em dia" passa.
- A branch não muda comportamento: só description, example e uma constante.
- Swagger em `/api-docs` (`routes/router.js:72`), na porta publicada em `127.0.0.1:${BACKEND_HOST_PORT:-3000}`.
- O seed exige `ALLOW_SEED=1`, porque o compose usa `NODE_ENV=production` por padrão (`command.js` seed). O comando `exec -e ALLOW_SEED=1` está correto.
- O script do plano B existe na imagem (`scripts/` não está no `.dockerignore`). `dotenv` é dependência de produção. Dentro do contêiner, `localhost:3000` é a porta do processo (`NODE_WEB_PORT`). `PIX_WEBHOOK_SECRET` vem do ambiente do compose.
- Aurora: `deposit_percent` 30 (`seed_hotels.sql:47`). Login `admin@aurora.example` / `senha123`. Nenhuma reserva do seed cai entre 15/12 e 18/12/2026.
- Respostas conferidas:
  - 201: `reservation.id/status`, `payment.amount`, `pix.qr_code`, `pix.provider_charge_id`.
  - 400 com Asaas: `{ errors: ['guest.cpf obrigatório para pagamento PIX'] }`.
  - 409: `NO_AVAILABILITY`.
  - 503: PSP indisponível.
  - status: `reservation_id`, `status`, `confirmed`, `deposit.status`.
  - `categories[].category_id`.
- O webhook promove PENDING para CONFIRMED com o pagamento PAID na mesma transação, com lock.
- Os exemplos de nome, e-mail e telefone usam `example.com` e (11) 99999-9999. Não há dado real.
- A validade da chave do sandbox (15/11/2026) confere com `historico_sessao/weslley/integracao_asaas_pix_sandbox_15out2026.md:69`.

## Não foi possível verificar
- O roteiro não foi executado no Docker: sem compose no ambiente da auditoria. O próprio roteiro registra que o ensaio está pendente.
- Plano A ao vivo: depende da chave e do painel do Asaas. O caminho "Ações de Sandbox → Confirmar pagamento" foi conferido só pela documentação (`ASAAS_SANDBOX.md:143`).
- A geração usou Node 22.22.1 local, não o 24 do CI. A saída é JSON determinístico e não deve divergir.
