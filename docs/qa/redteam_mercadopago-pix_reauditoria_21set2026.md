# QA Red Team — Mercado Pago PIX (T-03.2 / SPEC-03) — **REAUDITORIA do fix**

**Branch:** `feature/mercadopago-pix` (`6f844da`) · **Dev:** Weslley (dono da SPEC-03, §3.3 e §7 da
divisão de trabalho) · **Base:** `develop@9ae6c87` · **Data:** 21/09/2026
**Auditoria anterior:** `docs/qa/redteam_mercadopago-pix_21set2026.md` (commit `d13bd4b`) — **REPROVADO**
**Escopo desta reauditoria:** `git diff c8018e1..6f844da` — 6 arquivos, +284/−7
**Achados no escopo (novos, introduzidos pelo fix):** 5 (🔴 0 · 🟡 3 · 🟢 2) · **Repassados:** 1 (adendo)

---

## Veredito

**APROVADO COM RESSALVAS**

O achado 🔴 da auditoria anterior **foi corrigido de verdade** — verificado por três vias
independentes, não pelo texto do commit:

1. **Leitura do código.** `PixWebhookController.js:56-88` consulta `provider.getChargeStatus()` e só
   entra no bloco de persistência de `PAID` quando `status === 'approved'` e o valor confere.
2. **Sonda executável própria** (10 cenários, ponta a ponta, worktree descartada ao fim). A
   notificação assinada com `status: 'pending'` — o cenário exato que quebrou na primeira auditoria —
   agora devolve `200 {"status":"pending"}` e **não escreve nada**: `payment: PENDING`,
   `reservation: PENDING`.
3. **Teste de mutação.** Reintroduzi o bug no controller (`chargeStatus = { status: 'approved',
   amount: null }` logo após a consulta, simulando "ignora o status real") e rodei
   `tests/mercadopago-webhook.test.js`: **2 dos 4 testes falharam** — o de `pending`
   (`expected 'confirmed' to be 'pending'`) e o de `rejected`. Os testes novos **pegariam a
   regressão**; não são teatro. Controller restaurado, `git diff` vazio, worktree removida.

Suíte completa na branch: **19 arquivos · 241 passam · 1 skip** (Postgres 17 em container temporário,
Node 22.22). Cobertura **74,63% stmts · 77% lines · 71,75% branches · 82,25% funcs** — acima do portão
60/60/55/60. `WebhookApi` subiu de 75% para **78,26%** de linhas. `bash scripts/qa_checks.sh` → exit 0,
os mesmos 3 avisos pré-existentes, nenhum introduzido aqui.

O fix não introduziu nenhum 🔴 — **e é por isso que a branch passa**. Mas introduziu três 🟡 reais,
dois deles reproduzidos com sonda, todos no mesmo bloco de ~20 linhas: um caminho que grava estado
**terminal irreversível** a partir de uma cobrança ainda viva (`S4`), uma **porta de escape fail-open
na conferência de valor** (`S5`), e um 503 que, sem nenhuma reconciliação no sistema, transforma
indisponibilidade do PSP em pagamento preso em `PENDING` para sempre, em silêncio (`S2`/`S3`). Nenhum
deles é explorável por terceiro — todos exigem que o Mercado Pago responda de um jeito específico —
por isso não reprovam. Mas os três valem antes do deploy real de CA-03.2.c.

Os 🟡/🟢 da auditoria anterior foram reconferidos: **lista inalterada**, com duas exceções para
melhor (testes) e uma para pior (delta de contrato cresceu). Detalhe no §"Reconferência".

---

## Parte 1 — O 🔴 foi corrigido?

### Sim. Evidência por cenário (sonda executável, provider Mercado Pago mockado, sem rede)

| # | Cenário | HTTP | Payment | Reserva | Veredito |
|---|---|---|---|---|---|
| S-pend | notificação **assinada**, MP diz `pending` (é o `payment.created`) | 200 `{"status":"pending"}` | `PENDING` | `PENDING` | ✅ **o 🔴 morreu** |
| S-apr | assinada, MP diz `approved`, valor bate | 200 `confirmed` | `PAID` | `CONFIRMED` | ✅ |
| S-rej | assinada, MP diz `rejected` | 200 `not_approved` | `FAILED` | `PENDING` | ✅ |
| S8 | assinada, MP diz `in_mediation` | 200 `pending` | `PENDING` | — | ✅ fail-safe |
| S8b | assinada, MP diz `algum_status_novo_do_mp` (status futuro do MP) | 200 `pending` | `PENDING` | — | ✅ **allowlist, não blocklist** |

Sobre o **mapeamento de status**, que era a preocupação levantada: a estrutura é allowlist de verdade.
Só `approved` promove; só `cancelled`/`rejected` matam. **Qualquer outro valor — inclusive um status
que o Mercado Pago invente depois — cai na inação** (`PixWebhookController.js:85`), que é o lado
seguro. `authorized`, `in_process`, `in_mediation`, `refunded` e `charged_back` recebendo o pagamento
ainda `PENDING` não causam efeito nenhum. **Nenhum status cai em caminho perigoso** — confirmado por
execução, não por leitura.

### A comparação de valor não quebra silenciosamente

Era a suspeita explícita do pedido. Sonda `S1`, valores reais do banco:

```
payment.amount (Postgres DECIMAL) : "90.00"  typeof: string
Number("90.00").toFixed(2)        : "90.00"
Number(90).toFixed(2)             : "90.00"   ← número, como o MP devolve em JSON
```

`Number(string).toFixed(2) === Number(number).toFixed(2)` casa corretamente os dois lados, e
`toFixed(2)` neutraliza ruído de ponto flutuante. Reforço: `depositAmount` já é arredondado na origem
(`CreateBookingController.js:78-79`, `Number((...).toFixed(2))`), então o valor gravado e o valor
enviado ao MP nascem idênticos. **Este ponto está correto** — o problema está no que acontece quando
eles *não* batem (🟡 nº 1) e em quando o valor não vem (🟡 nº 2).

### `resetPixProviderForTests()` não é alcançável de produção

- `git grep -n "resetPixProviderForTests"` na branch inteira → **2 usos**: a definição
  (`app/services/pix/index.js:32`) e o arquivo de teste. **Zero** em `routes/`, `middlewares/`,
  `Controllers/`, `command.js`, `_web.js`.
- Os consumidores de produção (`PixWebhookController.js:4`, `CreateBookingController.js:7`) importam
  só o **default** (`getPixProvider`). O named export não é montado em nenhum router nem exposto por
  CLI.
- Não há como chamá-lo por HTTP. **Não é vetor.**

Ressalva menor registrada como 🟢 nº 1 abaixo (hook de teste em módulo de produção, sem guarda de
`NODE_ENV`).

---

## Parte 2 — Achados novos, introduzidos pelo fix

### 🟡 nº 1 [financeiro] Valor divergente mata uma cobrança **ainda viva** em estado terminal — e o pagamento que chegar depois é ignorado

**Onde:** `services/core-service/app/Controllers/WebhookApi/PixWebhookController.js:70-83`
(a condição interna `|| !amountMatches`) · efeito amplificado por `:52`

**Cenário — reproduzido** (sonda S4, provider mercadopago, notificações assinadas):

```
S4a  MP responde status=pending, transaction_amount divergente do payment.amount
     → 200 {"status":"not_approved"}   payment: FAILED        ← cobrança ainda era pagável

S4b  o hóspede paga de verdade; MP responde status=approved, valor correto
     → 200 {"status":"already_processed"}   payment: FAILED   reserva: PENDING
```

O dinheiro entra no Mercado Pago e a reserva **nunca** é confirmada. O `FAILED` do passo (a) cai na
lista de estados terminais da idempotência (`:52`), então toda notificação seguinte — inclusive a da
aprovação legítima — sai por `already_processed` sem sequer consultar o status. Não há log, não há
alerta, não há endpoint de reprocessamento: o único caminho de volta é `UPDATE` manual no banco.

A causa é a ordem das condições. O código pergunta "não é aprovado **ou** valor não bate?" e, dentro,
"é cancelado/rejeitado **ou** valor não bate?". O `|| !amountMatches` interno faz a divergência de
valor **atropelar** a informação de que o status ainda é não-terminal. Fail-closed é a escolha certa
para valor divergente quando o status é `approved` (sonda S6 confirma: `approved` + R$ 0,01 → `FAILED`,
reserva intocada — **isso está correto e deve continuar**). Errado é aplicar o mesmo desfecho a uma
cobrança que o PSP diz estar apenas `pending`.

Honestidade sobre a probabilidade: com o QR de valor fixo do MP e o arredondamento na origem, o
gatilho é estreito — exige o MP reportar um `transaction_amount` diferente do gravado. Ele existe hoje
em um caminho já mapeado: a busca do `Payment` por `provider_charge_id` **sem `tenant_id` e sem índice
único** (achado repassado à Sirlande na auditoria anterior). Se um dia essa busca casar a linha errada,
o valor diverge e este bloco destrói o pagamento errado, de forma irreversível.

**Regra violada:** CLAUDE.md §7 (risco financeiro) · KISS (condição de dupla negação onde o bug se
esconde) · ausência de caminho de recuperação em operação de dinheiro.

**Correção sugerida (a menor que resolve):** trocar o `||` interno por `&&` com o status terminal, e
tratar divergência de valor em status não-terminal como "sem efeito + log":

```js
const terminalReprovado = ['cancelled', 'rejected'].includes(chargeStatus.status);
if (terminalReprovado || (chargeStatus.status === 'approved' && !amountMatches)) { → FAILED }
```

### 🟡 nº 2 [financeiro / fail-open] Se o MP não devolver `transaction_amount`, a conferência de valor **se desliga sozinha** e o pagamento é confirmado

**Onde:** `services/core-service/app/services/pix/MercadoPagoPixProvider.js:143`
(`amount: data.transaction_amount ?? null`) · `PixWebhookController.js:67-68`
(`chargeStatus.amount == null || ...`)

**Cenário — reproduzido** (sonda S5): `GET /v1/payments/{id}` responde `{ status: 'approved' }` **sem**
o campo `transaction_amount`:

```
→ 200 {"status":"confirmed", ... ,"reservation_status":"CONFIRMED"}
   payment: PAID   reserva: CONFIRMED   (nenhum valor foi conferido)
```

O `?? null` do provider e o `== null` do controller se encontram e produzem `amountMatches === true`.
A porta de escape foi criada para o `FakePixProvider` ("não há como conferir aqui" — comentário
`FakePixProvider.js:39-41`, legítimo), mas ela é **genérica**: vale para qualquer provider, inclusive
o real. Qualquer resposta do MP fora da forma esperada — mudança de contrato, resposta parcial, campo
nulo em um meio de pagamento diferente — **desliga a única verificação de dinheiro do webhook em
silêncio**, sem log e sem sinal de que ela não rodou. É exatamente a classe de falha que o fix
existia para eliminar, num degrau abaixo.

`SUSPEITA` sobre o gatilho: não tenho como confirmar sem o sandbox se o MP alguma vez omite
`transaction_amount` em `GET /v1/payments/{id}` — na prática ele o inclui. O que **não** é suspeita é
o desenho: a ausência do dado desliga a checagem em vez de bloquear.

**Regra violada:** fail-safe (aceita por ausência de prova) · CLAUDE.md §7 (risco financeiro).

**Correção sugerida:** tornar a incapacidade de conferir **explícita do provider**, não inferida de um
`null`: `getChargeStatus` devolve `{ status, amount, amountVerifiable }` — `false` só no
`FakePixProvider`. No MP, `transaction_amount` ausente vira `PixProviderUnavailableError` (cai no 503,
que já existe) em vez de virar confirmação.

### 🟡 nº 3 [disponibilidade / financeiro] 503 sem reconciliação: PSP indisponível vira pagamento preso em `PENDING` para sempre, e ninguém fica sabendo

**Onde:** `PixWebhookController.js:57-65` · `MercadoPagoPixProvider.js:129-140`

**Cenário — reproduzido** (sondas S2 e S3):

```
S2  fetch rejeita (MP fora do ar)          → 503  payment: PENDING   (correto: não confirma no escuro)
S3  MP responde 404 na consulta de status  → 503  payment: PENDING   (falha PERMANENTE tratada como transitória)
```

O comportamento de S2 está **certo** e foi a decisão correta do fix: sem saber o status, não escreve
nada. O problema é o que vem depois, e são três camadas:

1. **`!response.ok` colapsa tudo em 503** (`MercadoPagoPixProvider.js:138-140`): 404 (cobrança não
   existe naquela conta), 401 (token rotacionado/expirado) e 400 recebem o mesmo tratamento de "tente
   de novo mais tarde" que um 502 transitório. As duas primeiras não melhoram com retry.
2. **Nada registra a falha.** O `catch {}` de `:135` é sem binding — o erro real evapora — e o
   controller devolve 503 **antes** do `catch` que tem o `console.error`. O caminho 503 inteiro é
   mudo. Com um `MERCADOPAGO_ACCESS_TOKEN` rotacionado, **100% dos pagamentos param de confirmar e o
   log não diz uma palavra**. O sintoma visível é "as reservas pararam de confirmar", sem causa.
3. **Não existe rede de recuperação.** Verificado: `grep -rl "cron\|reconcilia\|setInterval"` em
   `app/`, `routes/`, `bootstrap/`, `command.js` → **nada**. `GetBookingStatusController.js` (o polling
   da página pública) lê **só o banco** — não consulta o PSP. Quando o MP esgotar as tentativas de
   reenvio, o pagamento fica `PENDING` em definitivo: hóspede pagou, tela dele nunca confirma, a
   reserva pode ser cancelada por falta de sinal.

**Regra violada:** CLAUDE.md §7 (risco financeiro) · ausência de compensação/reconciliação em operação
distribuída · observabilidade nula em caminho de dinheiro.

**Correção sugerida:** (a) `console.error('MercadoPagoPixProvider.getChargeStatus:', response.status,
providerChargeId)` antes de lançar — sem imprimir corpo, que carrega PII; (b) `catch (error)` com
binding, como já sugerido no 🟢 da auditoria anterior para `createCharge`; (c) a rede barata:
`GetBookingStatusController` consultar `getChargeStatus` quando o depósito estiver `PENDING` e a
cobrança ainda não tiver expirado — o hóspede está com a tela aberta justamente nesse momento e isso
fecha o buraco sem cron nem fila.

### 🟢 nº 1 [KISS / produção] Hook de teste exportado por módulo de produção, sem guarda

**Onde:** `services/core-service/app/services/pix/index.js:32`

`resetPixProviderForTests()` é solução legítima para o `isolate: false` do `vitest.config.js` e **não é
alcançável por rota** (verificado). Mas vive num módulo que produção carrega, sem
`if (process.env.NODE_ENV !== 'test') throw ...`. Custo de fechar: uma linha. Alternativa mais limpa a
médio prazo: o factory aceitar injeção do provider, e o teste injetar — elimina o singleton mutável.

### 🟢 nº 2 [DRY / observabilidade] `getChargeStatus` duplica o boilerplate de `createCharge`, inclusive o `catch {}` cego

**Onde:** `MercadoPagoPixProvider.js:122-140` vs. `:35-65`

Leitura do token, `AbortController` + `TIMEOUT_MS`, `try/catch {}` sem binding, `finally
{ clearTimeout }` e o `if (!response.ok) throw` estão escritos duas vezes, quase idênticos. O 🟢 da
auditoria anterior sobre o `catch {}` que engole `TypeError` como indisponibilidade do PSP **agora tem
duas ocorrências** — e é o que torna o 🟡 nº 3 invisível. Um `#request(url, options)` privado na
classe resolve os dois de uma vez.

Nota de menor peso no mesmo arquivo: `FakePixProvider.getChargeStatus()` ignora o argumento e devolve
`approved` para **qualquer** id — coerente com o papel de simulador, mas soma-se ao 🔴 já repassado a
Gabriel (T-06.9): com o provider default, sonda S9 confirma que `POST /webhooks/pix` **anônimo, sem
assinatura nenhuma**, continua produzindo `payment: PAID` / `reserva: CONFIRMED`. Pré-existente, fora
do escopo, sem mudança de severidade — registrado aqui só para que ninguém leia o fix como "o webhook
agora é seguro em todos os modos". Ele é seguro **com `PIX_PROVIDER=mercadopago`**.

---

## Reconferência dos achados anteriores (🟡 e 🟢)

Reconferido arquivo a arquivo contra o diff `c8018e1..6f844da` (6 arquivos tocados).
**A lista continua a mesma.** Duas mudanças de severidade, ambas justificadas:

| Achado anterior | Tocado pelo fix? | Situação |
|---|---|---|
| 🟡 nº 2 — cobrança órfã no PSP quando a transação falha | Não (`CreateBookingController.js` fora do diff) | Reconferido, **sem mudança** |
| 🟡 nº 3 — sem verificação de tópico e sem janela de `ts` (replay) | Não | Reconferido, **sem mudança** — sonda S10: notificação assinada com `ts` de **30 dias atrás** foi aceita e confirmou o pagamento |
| 🟡 nº 4 — typo em `PIX_PROVIDER` cai no fake em silêncio; campo `provider` grava a env crua | `index.js` tocado, mas só para **acrescentar** o reset; `PROVIDERS[key] \|\| FakePixProvider` intacto | Reconferido, **sem mudança** |
| 🟡 nº 5 — credencial Mercado Pago única para todos os tenants | Não (o novo `getChargeStatus` lê o mesmo env global) | Reconferido, **sem mudança** — o fix reforça o acoplamento, não o agrava |
| 🟡 nº 6 — nenhum teste ponta a ponta do caminho novo | **Sim — endereçado** | **Rebaixado para 🟢.** Existem 4 testes de integração que pegam a regressão (provado por mutação). Lacunas que sobram: caminho 503, divergência de valor, `amount` ausente, idempotência de estado terminal, factory com `PIX_PROVIDER=mercadopago` (CA-03.2.b segue sem teste) |
| 🟡 nº 7 — delta de contrato fora do Swagger | Indiretamente: **o delta cresceu** | **Mantido 🟡**, repasse a Gabriel atualizado (ver abaixo) |
| 🟡 nº 8 — CPF ao MP sem validação nem registro (LGPD art. 6º, III/VI) | Não | Reconferido, **sem mudança** |
| 🟢 `catch {}` sem binding | Não corrigido e **duplicado** | Ver 🟢 nº 2 acima |
| 🟢 `pix_expiration` do relógio local · 🟢 `date_of_expiration` de 30 min no limite · 🟢 sem relatório/SPEC/ADR | Não | Reconferidos, **sem mudança** |

Critérios de aceite: **CA-03.2.d passa de ❌ para ✅** (o webhook agora processa a notificação do
provedor **e** consulta a fonte de verdade). **CA-03.2.c segue ❌ sem evidência** — nenhum print,
log de sandbox ou anotação na SPEC prova que já existiu uma cobrança real com QR válido; toda a
verificação desta branch continua sendo contra mock. Os demais CA ficam como estavam.

---

## Repassados a outro dev

| Sev. | Achado | Onde | Dono | Repasse |
|------|--------|------|------|---------|
| 🟡 | **Adendo** ao delta de contrato de `POST /webhooks/pix` já repassado: o fix acrescenta **503** `{ error: 'Não foi possível confirmar o status do pagamento' }` e dois valores novos no corpo de 200 — `not_approved` e `pending` — além de `already_processed`, que agora também cobre `FAILED`/`EXPIRED` | `PixWebhookController.js:57-88` · `config/swagger.js:186-199` (congelado por §7) | Gabriel (T-06.2) | ver nota abaixo |

**Nota operacional sobre este repasse:** o arquivo `docs/qa/repasses/para_gabriel_21092026.md` existe
**apenas em `feature/mercadopago-pix`** (criado no commit `d13bd4b`); a árvore de trabalho está em
`docs/conformidade-t064-rabbitmq`. Gravá-lo aqui criaria um arquivo não rastreado que **bloquearia o
checkout** da branch do Weslley — dano maior que o benefício. O adendo fica registrado neste relatório
e deve ser colado no fim daquele arquivo quando a branch for mesclada. Conteúdo a acrescentar, na
seção de `POST /webhooks/pix`:

> **Adendo (reauditoria do fix `6f844da`):** além dos headers `x-signature`/`x-request-id`, do
> `?data.id` e do 401 já listados, o endpoint agora responde **503** quando não consegue confirmar o
> status no PSP, e o corpo do 200 passa a ter quatro formas: `confirmed`, `not_approved` (pagamento
> cancelado/rejeitado ou valor divergente), `pending` (status ainda não terminal — o cliente deve
> continuar aguardando) e `already_processed`. O cliente tipado precisa tratar `pending` como "não
> é erro e não é confirmação".

Os três repasses da auditoria anterior (Sirlande: `provider_charge_id` sem índice/unique · Gabriel:
T-06.9 webhook forjável com o provider fake · Gabriel: delta de contrato) **continuam válidos e
intocados** pelo fix.

---

## O que foi verificado e está correto

Cobertura desta reauditoria, não elogio:

- **O 🔴 anterior está morto**, provado por sonda executável e por teste de mutação (2 de 4 testes
  falham quando o bug é reintroduzido).
- **Mapeamento de status é allowlist real:** status desconhecido/futuro do MP → inação
  (verificado com `algum_status_novo_do_mp`). `in_mediation`, `authorized`, `in_process` → sem efeito.
- **Comparação de valor não quebra com o `DECIMAL` do Postgres:** `payment.amount` chega como string
  `"90.00"` e `Number(...).toFixed(2)` casa com o número do JSON do MP (sonda S1).
- **`approved` com valor menor que o devido é bloqueado** (sonda S6: R$ 0,01 → `FAILED`, reserva
  intocada) — a conferência de valor faz o trabalho dela no caminho que importa.
- **503 não escreve nada** quando o PSP está fora do ar (sonda S2) — a decisão de não confirmar no
  escuro está correta; o problema é só a ausência de rede depois dela.
- **`resetPixProviderForTests` não é alcançável por HTTP:** dois usos no repositório inteiro, nenhum
  em rota, CLI ou controller; os consumidores de produção importam só o default.
- **Sem SSRF pelo `providerChargeId` interpolado na URL** (`MP_API_URL}/${providerChargeId}`): o id só
  chega ali depois de passar pela assinatura HMAC **e** de existir como `provider_charge_id` no banco
  (o 404 vem antes, `:47-50`) — é sempre um id que nós mesmos gravamos.
- **Máquina de estados respeitada:** só `PENDING → CONFIRMED`; `rejected` marca o `Payment` como
  `FAILED` e **não** toca a reserva (verificado). Nada promove `CHECKED_IN`/`CANCELLED`.
- **Isolamento multi-tenant:** a busca da reserva segue com `{ id, tenant_id: payment.tenant_id }`
  (`:91-93`); nenhum `findByPk` novo em `app/` (os do arquivo de teste são de asserção, aceitáveis).
- **ESM puro:** zero `require()` nos 6 arquivos do diff.
- **Transação Sequelize nos dois caminhos que escrevem**, com `rollback` no `catch` — inclusive no
  novo caminho de `FAILED` (que escreve em uma tabela só; transação desnecessária ali, mas inofensiva
  e consistente com o resto).
- **PII:** nenhum `console.*` novo, nenhum objeto de request/model/corpo de cobrança logado; nenhum
  dado pessoal em query string nos caminhos novos. Nenhum campo novo coletado, nenhuma migração.
- **Suíte e portões:** 241 passam · 1 skip; cobertura 74,63/77/71,75/82,25 contra portão 60/60/55/60;
  `qa_checks.sh` exit 0 com os mesmos 3 avisos pré-existentes.
- **Os testes novos não vazam estado:** `afterAll` chama `resetPixProviderForTests()` e `afterEach`
  desfaz stubs de env e de `fetch` — necessário com `isolate: false` e verificado na prática (a suíte
  inteira, com `mercadopago-webhook.test.js` no meio, continua verde).

## Não foi possível verificar

- **Comportamento real do Mercado Pago em sandbox** — segue valendo tudo o que a auditoria anterior
  registrou. Especificamente para esta reauditoria: se `GET /v1/payments/{id}` alguma vez omite
  `transaction_amount` (gatilho do 🟡 nº 2) e qual é exatamente a política de reenvio do MP para
  respostas não-2xx (dimensiona o 🟡 nº 3). O desenho fail-open do nº 2 e a ausência de reconciliação
  do nº 3 **não** dependem dessas respostas.
- **CA-03.2.c** continua sem nenhuma evidência de cobrança real: toda a verificação, minha e a dos
  testes, é contra mock.
- **Comportamento sob concorrência** — duas notificações do MP para a mesma cobrança chegando em
  paralelo. A idempotência é lida e escrita sem `SELECT ... FOR UPDATE`; o pior caso aparente é
  escrever `PAID` duas vezes (inofensivo), mas não reproduzi corrida real.
