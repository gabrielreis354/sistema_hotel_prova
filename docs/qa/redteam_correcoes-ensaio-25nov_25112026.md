# QA Red Team — correções do ensaio de 25/11 (três branches)
**Branches:** `fix/pagamento-erro-meio` (dc24a47) · `fix/seed-acentos-cartao` (6ce868d) · `docs/api-exemplos-passo6` (be6aedd)
**Dev:** Sirlande · **Base:** develop@74e028a · **Data:** 25/11/2026
**Arquivos auditados:** 14 (3 + 7 + 4)
**Achados no escopo:** 7 (🔴 0 · 🟡 0 · 🟢 7) · **Repassados:** 0

## Veredito

| Branch | Veredito |
|---|---|
| `fix/pagamento-erro-meio` | **APROVADO COM RESSALVAS** (3 🟢) |
| `fix/seed-acentos-cartao` | **APROVADO COM RESSALVAS** (2 🟢) |
| `docs/api-exemplos-passo6` | **APROVADO COM RESSALVAS** (1 🟢) |

Nenhuma branch tem achado 🔴 ou 🟡. As ressalvas são melhorias e não bloqueiam o merge na develop congelada.

### Execução real (worktrees temporárias em scratchpad, já removidas; a árvore compartilhada não foi tocada)
- Branch 1: `vitest run src/features/reservations src/features/accounts` → 22 arquivos, 299 testes verdes; `tsc --noEmit` do `apps/pms` → exit 0.
- Branch 2: `vitest run` de seed-hoje, seed-avisos, seed-cpf-valido e seed-consumo → 4 arquivos, 48 testes verdes (Postgres local, `gestao_hotel_test`).
- Branch 3: `npm run generate` do `@hotel/api-client` (o mesmo passo do CI) → nenhuma diferença em `openapi.json`/`schema.d.ts` (o portão "Conferir que nada mudou" de `.github/workflows/ci-frontend.yml:118-123` passa); testes `swagger*.test.js` → 3 arquivos, 8 testes verdes.

## Achados no escopo

### Branch 1 — `fix/pagamento-erro-meio`

#### 🟢 [Testes] A regressão do 🟡-2 está coberta só na função pura, não na ligação do formulário
**Onde:** `frontend/apps/pms/src/features/reservations/paymentLogic.test.ts:161-175`; ligação em `PaymentForm.tsx:60-61,176,181,194,221`
**Cenário:** alguém volta a passar `error={error?.text}` ao `Field` do valor (ou `aria-invalid={!!error}`). Sem o meio escolhido, o aviso volta para baixo do valor, que fica vermelho: o bug original. Os 299 testes continuam verdes, porque só `submitStep` devolve `field` e nada confere em qual lugar o componente mostra o erro.
**Regra violada:** guia §8 ("teste que passaria mesmo com a regra quebrada"). É a limitação conhecida do `renderToString`, que não chega ao envio.
**Correção sugerida:** extrair `errorFor(error, field)` (ou as duas derivações das linhas 60-61) para o `paymentLogic.ts` e testar lá. Outra saída: um passo no e2e do roteiro (registrar sem meio e conferir que o `alert` está no `fieldset`).

#### 🟢 [UI/UX] Escolher um meio apaga também o erro do valor, que continua errado
**Onde:** `PaymentForm.tsx:212-215`
**Cenário:** na mesa (`allowOverpay=false`), saldo de R$ 198,00, a recepcionista digita 250 com Dinheiro e toca em Registrar. Aparece o erro "Acima do saldo…" no valor. Depois ela toca em PIX: o erro some e o valor perde o vermelho, mas continua 250. Só o próximo envio mostra o erro de novo. O comportamento já existia antes da branch, mas agora que o erro sabe de que campo é, a correção custa uma linha.
**Regra violada:** guia §7 (estado de erro coerente com o que está errado).
**Correção sugerida:** no `onChange` do radio, apagar só o erro do meio: `setError((e) => (e?.field === 'method' ? null : e))`.

#### 🟢 [UI/UX / DRY] Sem foco no grupo dos meios, e o padrão "o hóspede" aparece em dois lugares
**Onde:** `PaymentForm.tsx:97` (foco) · `paymentLogic.ts:106` e `PaymentForm.tsx:39` (padrão duplicado)
**Cenário:** quem usa o teclado aperta Enter no campo do valor sem ter escolhido o meio. O `role="alert"` anuncia o aviso, mas o foco fica no valor, e ela precisa de Tab até os radios. Se o padrão de `payer` mudar só em um dos dois lugares, a pergunta e o aviso passam a dizer quem paga de jeitos diferentes. Hoje o `PaymentForm` sempre passa `payer`, então o segundo ponto é só latente.
**Regra violada:** KISS/DRY (leve). Acessibilidade de navegação (leve).
**Correção sugerida:** focar o primeiro radio quando `step.field === 'method'`. Em `submitStep`, deixar `payer` obrigatório e sem valor padrão.

Conferido e correto nesta branch: os 4 caminhos de erro (valor inválido → `amount`; sem meio → `method`; valor a maior na mesa → `amount`; confirmação aberta → `wait`, sem erro). Quando há dois erros, o do valor tem precedência (testado). `role="alert"` + `aria-describedby` com `useId` aparecem só quando há erro, no mesmo estilo do `Field` do `@hotel/ui`. O erro some ao digitar (`:188`) e ao escolher o meio (`:214`). O texto usa o `payer` ("Escolha como o cliente pagou." na mesa). O único consumidor de `submitStep`/`SubmitStep` é o `PaymentForm`. O `ReceivePanel` e o `ReceivePanelProps.test.tsx` (que usa um substituto do `PaymentForm`) não mudam. O tipo compila.

### Branch 2 — `fix/seed-acentos-cartao`

#### 🟢 [Operação] A correção vale só para banco recriado; o compose `gesway_ensaio` que está no ar continua com "Recepcao" e `CARTAO`
**Onde:** `services/core-service/seed/seed_hotels.sql:165-171,397-401` e `seed_consumo.sql:42-46` (`ON CONFLICT … DO NOTHING`) · guarda dos pagamentos em `seed_hotels.sql:327-333,505-511` e `seed_hoje.sql:160-165` (sem `method`)
**Cenário:** rodar `node command.js seed` de novo sobre o banco do ensaio de hoje. Os usuários já existem e não são renomeados. Os pagamentos antigos com `CARTAO` também ficam, porque a guarda `NOT EXISTS` compara só reserva + valor + data. Isso é bom: nada é duplicado. A consequência é que a barra do topo continua "Recepcao Aurora 1" e os Indicadores continuam com duas linhas de cartão. Confirmei que a idempotência está certa: nenhuma guarda depende de `method`, e por isso a troca não cria pagamento novo num banco já semeado.
**Regra violada:** nenhuma de código. É risco de roteiro: o ensaio da véspera precisa usar banco novo.
**Correção sugerida:** nenhuma no SQL. No guia (`GUIA_DEMONSTRACAO.md`), registrar que estas correções só aparecem depois de `docker compose down -v` + migrate + seed. O cabeçalho do `seed_hoje.sql:38-42` já pede para recriar o banco.

#### 🟢 [Testes/Comentário] O título do teste de rótulo continua dizendo que o seed "ainda grava" CARTAO
**Onde:** `frontend/apps/pms/src/features/analytics/shares.test.ts:12` (não entrou no diff, mas a branch reescreveu o comentário equivalente em `shares.ts:9`)
**Cenário:** quem lê o teste conclui que o seed ainda grava `CARTAO` e não remove o rótulo legado, ou não entende por que ele existe. É só divergência de documentação.
**Correção sugerida:** trocar o título para "que bancos semeados antes de 25/11 ainda têm".

Conferido e correto nesta branch: nenhum teste depende do `CARTAO` do seed. Os usos restantes são o rótulo legado (`shares.test.ts`), o teste de rejeição da API (`payment-void.test.js:455`) e a projeção do analytics com o evento montado no próprio teste (`projections.test.js:110`). Nenhum e2e, script ou doc procura "Recepcao" ou "Garcom". O e2e loga por e-mail (`USERS.*`). Encoding: o `runSeed` lê os arquivos em `utf-8` (`runSeed.js`), e o seed já tinha literais acentuados que chegavam ao banco ("São Paulo", "Pastor João Silva"). O caminho do k8s (`start.sh:232-235`, `psql < arquivo`, sem TTY) usa a codificação do servidor. O teste novo confirma "Garçom"/"Recepção" depois da gravação. A ordem esperada pelo `ORDER BY email` está certa. O cenário do dia não mudou: só o valor de `method` foi trocado, e contagens, sinal da 107 (150 de 450) e 105 seguem cobertos pelos 22 testes do `seed-hoje`, todos verdes. O teste novo de meio confere a tabela inteira de `payments` contra `PAYMENT_METHODS`, então pega qualquer `CARTAO` que volte em qualquer um dos três arquivos.

### Branch 3 — `docs/api-exemplos-passo6`

#### 🟢 [Testes] O teste confere noites × datas, mas não valor × noites × diária nem o sinal
**Onde:** `services/core-service/tests/swagger-public-booking.test.js:27-31`; exemplos em `config/swagger.js:483,501,507,526,530`
**Cenário:** alguém muda `nights`/datas para 4 noites e esquece o `total_amount: 450` ou o `deposit.amount: 135`. O teste passa, e a banca vê "4 noites, R$ 450,00" no Example Value. Hoje os números batem: 3 × 150 = 450 e 30% = 135, os mesmos do `PASSO_6_RESERVA_DIRETA_PIX.md:127`.
**Correção sugerida:** acrescentar `expect(total).toBe(nights * price_per_night)` e `expect(deposit).toBe(total * deposit_percent / 100)`.

Conferido e correto nesta branch: o cliente regerado mudou só nos 6 `example` de data (a regeração local não deu diferença, então o check de deriva do `ci-frontend.yml` passa). O `scripts/qa_checks.sh` não compara o `openapi.json`. As constantes `PASSO6_CHECK_IN/OUT` (`swagger.js:12-13`) já existiam e são as mesmas dos parâmetros (`:570-571`) e do corpo do POST (`:592-593`), coerentes com o guia do passo 6 (15/12 a 18/12, 3 noites). `Date.parse` de `YYYY-MM-DD` é UTC, então a conta de noites do teste não sofre com horário de verão. Não há rota nem contrato novo.

## Repassados a outro dev
nenhum

## O que foi verificado e está correto
- Multi-tenancy: nenhuma query nova em código de produção. O teste novo do seed lê `payments`/`users` num banco de teste que só tem o seed.
- ESM: sem `require()` nos arquivos do diff.
- LGPD: nenhum log nem resposta nova com PII. As mensagens de erro do formulário não trazem dado pessoal.
- Contrato da API: só o `example` mudou, e os tipos gerados (`schema.d.ts`) mudam só em comentários JSDoc.
- Dinheiro: o formulário continua em centavos (`Cents`), sem `Number()` em DECIMAL. O seed não muda nenhum valor.

## Não foi possível verificar
- Leitor de tela real (NVDA/Orca) lendo o `aria-describedby` do `fieldset`: há diferença conhecida entre leitores. O `role="alert"` garante o anúncio, mas não testei com leitor.
- Seed num banco já semeado do compose `gesway_ensaio`: a conclusão vem da leitura das guardas, não de uma execução. Não rodei o seed sobre o banco do ensaio para não alterar o ambiente compartilhado.
- Interação real do formulário no navegador (sem Playwright nesta auditoria).
