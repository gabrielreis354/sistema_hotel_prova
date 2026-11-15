# QA Red Team — M8: seed com as datas do dia
**Branch:** feature/m8-seed-datas-do-dia · **Dev:** Sirlande · **Base:** develop@835f48d · **Data:** 15/11/2026
**Arquivos auditados:** 6 (`seed/seed_hoje.sql`, `seed/seed_hotels.sql`, `seed/seed_consumo.sql`, `command.js`, `tests/seed-hoje.test.js`, `tests/seed-consumo.test.js`)
**Achados no escopo:** 10 (🔴 0 · 🟡 5 · 🟢 5) · **Repassados:** 1 (o 🟡-3 também foi repassado, porque o arquivo é do Weslley)

Método: li o diff e conferi o que ele toca: constraints e triggers em `applyDbConstraints.js`, `GetAlertsController`/`GetOccupancyController` do analytics, `start.sh`, `docker-compose.yml` e o schema de `payments`. Seis cenários foram **reproduzidos** no banco de teste local, com um arquivo de teste temporário que já apaguei (`git status` limpo). Os números abaixo saíram dessas execuções.

## Veredito
**APROVADO COM RESSALVAS**

Nenhum 🔴 no escopo. Num banco limpo, os critérios do M8 se cumprem nos dois hotéis: totais, sinal, fuso das 22h30, mesmo dia sem duplicar e sem gerar evento no outbox. As ressalvas aparecem quando o seed roda **num banco que já passou por uma demonstração ou um ensaio**, que é justamente o cenário de "não desfaz a demonstração". Ali o seed aborta (🟡-1), lança consumo na conta de outro hóspede (🟡-2) ou deixa o painel incompleto (🟡-4). Corrigir antes do congelamento.

## Achados no escopo

### 🟡-1 [Idempotência / EXCLUDE] Seed rodado depois da demonstração aborta inteiro por double-booking
**Onde:** `services/core-service/seed/seed_hoje.sql:96-98` (INSERT das reservas novas) e `:108` (UPDATE das datas)
**Cenário (reproduzido):** seed em 10/12. A recepção cria uma reserva CONFIRMED no 201 para 12/12–13/12, o que é válido, porque o 201 do cenário ocupa só [10/12, 12/12). Em 11/12 alguém roda o seed de novo. O 201 do cenário vai para [11/12, 13/12) e sobrepõe a reserva nova. O `reservations_room_id_daterange_excl` (e o do pivô) recusa e o bloco `DO` inteiro volta atrás. O `command.js:107` imprime só `❌ Erro ao executar o seed: Exclusion constraint error`, sem dizer qual quarto. O `seed_hotels.sql` e o `seed_consumo.sql` já foram commitados, então o seed fica pela metade. Rodar de novo falha sempre, até alguém achar a reserva na mão. A mesma coisa acontece com:
- qualquer reserva que a demo ou o qa-explorador tenha criado nos quartos 201/102/5 para o dia (o INSERT da linha 96 colide);
- um walk-in feito no 105 depois do release (a saída do cenário "anda" para cima dele);
- reserva futura no 106/203/302/4 dentro das noites que a estadia ganha ao andar.

**Regra violada:** critério do M8 "rodado em outro dia continua coerente; não desfaz a demonstração".
**Correção sugerida:** antes do INSERT/UPDATE, testar sobreposição contra `reservation_rooms` (`blocks_room`, outro `reservation_id`, `daterange && daterange(v_ci, v_co,'[)')`). Se houver, pular a linha com `RAISE NOTICE 'seed_hoje: quarto % ocupado por reserva da demonstração — cenário dele não foi movido'`. Assim o resto do cenário se aplica e o operador sabe o que faltou. Teste: o mesmo cenário acima, esperando que o seed termine e que o NOTICE apareça.

### 🟡-2 [Dinheiro / coerência] Consumo da Suíte 106 vai para a conta de qualquer hóspede que esteja no 106
**Onde:** `services/core-service/seed/seed_consumo.sql:126` (alterado nesta branch: `r.status = 'CHECKED_IN'` no lugar de `r.check_in_date = '2026-06-15'`)
**Cenário (reproduzido):** seed em 10/12. Na demo, o hóspede do cenário (CPF 30000000006) sai antes do previsto e a conta "Suíte 106" fecha. Um walk-in (CPF 30000000031) faz check-in no 106 e a API abre uma nova conta "Suíte 106" OPEN. O seed roda de novo. O `alvo` acha a conta OPEN do walk-in, a guarda `NOT EXISTS (account_id, description)` passa porque a conta é nova, e entram nela:
`Cerveja long neck 48,00 · Porção de fritas 32,00 · Lavanderia 45,00` (**R$ 125,00 faturáveis**), mais a cortesia do vinho de 89,00. Todos com `consumed_at` em **15–16/06/2026**, seis meses antes da conta abrir. O `seed_hoje.sql` não os move, porque essa reserva não é do cenário. O walk-in sai cobrado pelo que não consumiu, e o invariante `itemsBeforeOpening` que o próprio `seed-hoje.test.js:95` define quebra.
**Por que 🟡 e não 🔴:** só alcança banco de demonstração (trava `ALLOW_SEED`) e precisa de saída antecipada, mais um check-in novo no 106, mais um re-seed.
**Correção sugerida:** prender o alvo à reserva do cenário. Na CTE, `JOIN guests g ON g.id = r.guest_id AND g.cpf = '30000000006'`, que é a mesma identidade (hóspede, quarto) que o `seed_hoje.sql` e a guarda nova do `seed_hotels.sql` já usam. Acrescentar um teste com o cenário acima.

### 🟡-3 [Entrega incompleta] `./start.sh seed` não aplica o `seed_hoje.sql`
**Onde:** `start.sh:188` e `start.sh:192`, com a lista `seed_hotels.sql seed_consumo.sql`. O comentário em `start.sh:184` diz "A ordem é a do `node command.js seed`".
**Cenário:** no cluster (o caminho que o `infra_up.sh:104` manda usar), `ALLOW_SEED=1 ./start.sh seed` roda só os dois arquivos antigos. As 6 estadias CHECKED_IN continuam em junho e em quartos AVAILABLE, o painel Hoje aparece zerado e o achado 1 da revisão de 15/11 segue aberto ali. O caminho do Compose (`docker compose exec -e ALLOW_SEED=1 backend node command.js seed`, `docker-compose.yml:9`) está certo.
**Regra violada:** DRY. A lista de arquivos do seed existe em 2 lugares, e esta branch só atualizou um.
**Correção sugerida:** incluir `seed_hoje.sql` nos dois laços do `start.sh`. O `start.sh` é da área do Weslley (DIVISAO §3), por isso **repassei** (ver tabela). Como a divergência nasceu nesta branch, cabe ao M8 avisar ou combinar a mudança.

### 🟡-4 [Idempotência] Ensaio na véspera deixa o painel da banca incompleto e uma estadia vencida "na casa"
**Onde:** `services/core-service/seed/seed_hoje.sql:100-101` (`ELSIF r.status <> s.status THEN CONTINUE`) e o cabeçalho `:27-31`, que promete "em outro dia: leva o cenário para o novo dia"
**Cenário (reproduzido):** seed em 09/12 e ensaio do roteiro: check-in do 201 e check-out do 107. Na banca, em 12/12, o seed roda de novo. No Aurora:
- chegadas = 1 (só o no-show 102); a chegada com sinal do passo 2 não existe mais;
- saídas do dia = 0 (o 107 ficou CHECKED_OUT em 09/12);
- o 201 está **CHECKED_IN com saída em 11/12 < hoje**. Isso viola o critério "CHECKED_IN dentro da janela" e o invariante `stayOutsideToday` do próprio teste.

O seed termina "com sucesso" e nada avisa que o roteiro vai falhar.
**Regra violada:** critério do M8 "rodado em outro dia continua coerente".
**Correção sugerida:** a mais barata é deixar explícito no runbook e no cabeçalho que, depois de ensaio, se recria o banco (`down -v`, migrate, seed). Além disso, fechar o `seed_hoje.sql` com um `RAISE NOTICE` que resuma o dia (chegadas / na casa / saídas / no-show / limpeza por hotel) e um `WARNING` quando faltar algum item do roteiro. Assim o operador fica sabendo antes da banca.

### 🟡-5 [Dado que a API não produz] Sinal gravado como pagamento cheio (`kind = 'FULL'`)
**Onde:** `services/core-service/seed/seed_hoje.sql:128-129`. O INSERT não informa `kind` e o default do schema é `'FULL'`.
**Cenário:** os sinais de 210,00 (Aurora 201) e 120,00 (Sol 5) entram como `FULL`, sem `provider`. A API só cria sinal como `kind = 'DEPOSIT'` (`CreateBookingController.js:208`). No passo do roteiro "check-in da chegada com sinal", a linha do tempo do PMS mostra **"Pagamento · PIX"** e não "Sinal · PIX" (`frontend/apps/pms/src/features/reservations/reservationLogic.ts:346`). O `GetBookingStatusController.js:37` não acha o sinal.
**Correção sugerida:** acrescentar a coluna `kind` ao VALUES: `'DEPOSIT'` para os pagamentos `hoje` das CONFIRMED e `'FULL'` para os de entrada e de check-out. Fixar isso no teste.

### 🟢-1 [Máquina de estados] Re-seed tira quarto de MAINTENANCE para CLEANING
**Onde:** `services/core-service/seed/seed_hoje.sql:135` (`WHERE status <> 'OCCUPIED'`)
**Cenário (reproduzido):** o admin põe o 105 em MAINTENANCE (CLEANING → MAINTENANCE, decisão 10). Rodando o seed no dia seguinte, o 105 vai para CLEANING, uma transição que não existe na máquina de quartos.
**Correção sugerida:** trocar a condição por uma allowlist: `AND status IN ('AVAILABLE', 'CLEANING')`.

### 🟢-2 [Dado que a API não produz] No-show CONFIRMED sem nenhum pagamento
**Onde:** `services/core-service/seed/seed_hoje.sql:66`
**Cenário:** pelo CLAUDE.md, CONFIRMED nasce do sinal pago ou do contrato B2B. Uma CONFIRMED sem pagamento nenhum só existe pelo seed. A D-3 do analytics também conta como no-show o sinal **estornado** (VOIDED), que é um estado que a API produz de verdade.
**Correção sugerida:** gravar o sinal do 102 como VOIDED, com `void_reason`, `voided_by` (admin) e `voided_at` exigidos pelo `payments_voided_has_trail`. Ou registrar a escolha como decisão no anexo da spec.

### 🟢-3 [Coerência temporal] Reserva criada depois do próprio sinal e da própria entrada
**Onde:** `services/core-service/seed/seed_hoje.sql:96` (`created_at` fica no default `now()`)
**Cenário:** com o seed às 15h, o sinal do 201 tem `paid_at` às 11h e a reserva tem `created_at` às 15h. A saída do 105 entrou em H−2 mas foi "criada" em H. O `created_at` viaja no evento `reservation.*` (`outbox_payload`), e qualquer métrica de antecedência ou o `pending_too_long` herda isso.
**Correção sugerida:** `created_at = LEAST(v_paid, (v_ci + time '10:00') AT TIME ZONE tz) - interval '1 day'` no INSERT.

### 🟢-4 [Não desfaz a demo] Mesa e day-use da demonstração também têm o horário reescrito
**Onde:** `services/core-service/seed/seed_hoje.sql:157-161`
**Cenário:** toda conta TABLE/DAY_USE OPEN de mais de um dia nos dois hotéis é movida, não só a "Mesa 3" e o "Day-use — piscina" do seed. Uma mesa aberta pelo garçom no ensaio tem `opened_at` e todos os `consumed_at` reescritos.
**Correção sugerida:** restringir com `AND ac.label IN ('Mesa 3', 'Day-use — piscina')`.

### 🟢-5 [Testes] Os cenários que quebram não estão cobertos, e os cartões do gerente não são lidos do analytics
**Onde:** `services/core-service/tests/seed-hoje.test.js`
**Cenário:** a suíte passaria com 🟡-1, 🟡-2, 🟡-4, 🟡-5 e 🟢-1 presentes. Os "4 cartões diferentes de zero" são conferidos só pelo espelho em SQL do core (`scenario()`, linhas 37-65), não pela projeção do analytics (outbox → `proj_*` → `GetOccupancyController`/`GetAlertsController`). A interpolação de `agora` no SQL (linha 25) é aceitável por ser só de teste.
**Correção sugerida:** um teste por achado acima. Para os cartões, aplicar os eventos do outbox com o `applyEvent` do analytics, ou registrar como verificação manual no relatório de sessão.

## Repassados a outro dev

| Sev. | Achado | Onde | Dono | Repasse |
|------|--------|------|------|---------|
| 🟡 | `./start.sh seed` não aplica o `seed_hoje.sql` (lista duplicada do `command.js`) | `start.sh:188,192` | Weslley | `docs/qa/repasses/para_weslley_15112026.md` |

## O que foi verificado e está correto
- **Diária × noites** nas 11 linhas do cenário. Na casa: 106 (5×150 = 750), 107 (3×150 = 450), 203 (4×350 = 1400), 302 (4×800 = 3200), Sol 4 (3×120 = 360), Sol 10 (4×220 = 880). Os offsets mantêm as noites do `seed_hotels.sql`. Novas: 201 (2×350 = 700), 102 (3×150 = 450), Sol 5 (2×120 = 240), 105 (2×150 = 300), Sol 3 (3×120 = 360).
- **Sinal** 210 = 30% de 700 (Aurora) e 120 = 50% de 240 (Sol), batendo com o `deposit_percent` dos tenants. O pagamento do check-out quita o total (saldo zero).
- **D-3**: com o 201 e o Sol 5 pagos e o 102 sem pagamento, sai exatamente 1 no-show, a mesma regra do `GetAlertsController.js:37-49`.
- **Fuso**: `hoje := (agora AT TIME ZONE tz)::date` e `(data + time) AT TIME ZONE tz` estão corretos. 22h30 BRT = 01h30 UTC grava o dia de Brasília. Às 00h20 o `LEAST(agora, 11h)` impede pagamento no futuro.
- **Tenant isolation**: toda busca do loop filtra por `tenant_id`; os UPDATEs são por id; as sincronizações finais e o laço de contas ficam restritos a `aurora`/`sol`.
- **Mesmo dia**: o re-seed gera **0 eventos** no outbox (189 → 189, reproduzido) e não cria linhas.
- **Outro dia, banco não tocado**: move sem criar linhas. Os eventos saem como `reservation.updated`, `payment.updated` e `room.updated`, com a versão crescente do trigger AFTER. O upsert por `aggregate_version` do analytics aplica a mudança de datas.
- **Guarda nova do `seed_hotels.sql`**: impede que as CHECKED_IN de junho sejam recriadas depois de movidas. Os pagamentos de junho não duplicam, porque o join por `check_in_date` não acha mais a reserva.
- **Reserva de vários quartos**: OCCUPIED/AVAILABLE sincronizados pelo pivô (teste da linha 208). O trigger `reservations_sincroniza_quartos` cria o pivô das 5 reservas novas.
- **Datas fixas do `seed_hotels.sql`** não colidem com o cenário nos 11 quartos (só CANCELLED em 2027 nos mesmos quartos, que não bloqueiam).
- **`ALLOW_SEED`** intacto (`command.js:81`). ESM, BEGIN/COMMIT por arquivo, sem `require()`.

## Não foi possível verificar
- Ponta a ponta pelo RabbitMQ até o analytics, e os 4 cartões renderizados. Sem Docker neste WSL; conferi só o contrato do trigger e do `applyEvent`.
- Renderização do painel Hoje (`frontend/apps/pms/src/features/today`) com o seed novo.
- Se o `migrateConsumptions`, rodado num migrate posterior ao seed, cria a conta ROOM CLOSED das saídas 105/Sol 3 (SUSPEITA de que hoje elas ficam sem conta de diária no extrato; falta rodar migrate → seed → migrate e ver o extrato).

## Desfecho (Sirlande, 15/11)

| Achado | Desfecho | Onde |
|---|---|---|
| 🟡-1 double-booking aborta o seed | Corrigido: antes de mover ou criar, confere sobreposição no `reservation_rooms`; se o quarto foi vendido, pula a linha com `NOTICE` dizendo o quarto e o período | `seed_hoje.sql`; teste "🟡-1" |
| 🟡-2 consumo da Suíte 106 em conta alheia | Corrigido: a CTE `alvo` prende à estadia do CPF 30000000006 | `seed_consumo.sql`; teste "🟡-2" |
| 🟡-3 `start.sh seed` sem o `seed_hoje.sql` | Repassado ao Weslley (dono do `start.sh`) | `docs/qa/repasses/para_weslley_15112026.md` |
| 🟡-4 ensaio na véspera | Corrigido: resumo do dia por `NOTICE` e `WARNING` quando o cenário não fecha; runbook "depois de ensaio, recriar o banco" no cabeçalho do arquivo | `seed_hoje.sql` |
| 🟡-5 sinal como FULL | Corrigido: sinal da chegada é `DEPOSIT`, check-out é `FULL` | `seed_hoje.sql`; teste "🟡-5" |
| 🟢-1 MAINTENANCE → CLEANING | Corrigido: allowlist `AVAILABLE`/`CLEANING` | teste "🟢" |
| 🟢-2 no-show sem pagamento | Mantido: é a regra D-3 do analytics; um sinal VOIDED exigiria rever o efeito do estorno na reserva. Fica para o 5º semestre | — |
| 🟢-3 `created_at` depois do sinal | Corrigido: reserva nova nasce 7 dias antes da entrada, às 10h | teste com dia no passado |
| 🟢-4 mesa da demo reescrita | Corrigido: só `Mesa 3` e `Day-use — piscina` | teste "🟢" |
| 🟢-5 cobertura e cartões | Corrigido: um teste por achado, todos conferidos por mutação. Os cartões foram lidos do analytics de verdade: compose com RabbitMQ real, `GET /analytics/occupancy` pelo nginx = 26,67% · ADR 338,89 · RevPAR 90,37 · recebido hoje 510,00 · 1 no-show · 1 em limpeza | relatório de sessão |
