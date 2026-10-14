# Sessão — Integração do fix do vazamento público (T-06.5) — parada antes do PR

**Data:** 16/09/2026
**Dev:** agente executor (orquestrado via Claude Code, trilha do Gabriel)
**Branch:** `fix/public-booking-payment-leak` (local, **não pushado**)
**Etapa executada:** Etapa 1 de `docs/delegacoes/pendencias_liberadas_gabriel_16set2026.md` — T-06.5
**Resultado:** correção íntegra pós-merge, mas **PR não aberto** — achado 🔴 do `qa-redteam` cai
dentro dos critérios de aceite desta própria tarefa (CA-06.5.b não cumprido).

---

## Contexto

`GET /public/:subdomain/bookings/:id/status` é público (sem autenticação) e devolvia o `Payment`
inteiro via `include` sem `attributes`, expondo `pix_qr_code`, `provider_charge_id` e `provider`.
Com o `provider_charge_id`, qualquer pessoa aciona `POST /webhooks/pix` (que não verifica
assinatura — falha separada, T-06.9) e confirma uma reserva sem pagar.

A correção já existia, pronta e auditada em 26/08/2026, na branch `fix/public-booking-payment-leak`
— mas 64 commits atrás de `develop` e no layout antigo do repositório (antes do backend mudar para
`services/core-service/`, PR #77). A tarefa desta sessão era só integrar: merge, confirmar que a
correção sobreviveu à mudança de layout, rodar o portão de QA e abrir PR.

## O que foi feito

1. **Checkout da branch e merge com `origin/develop`**
   ```
   git checkout -b fix/public-booking-payment-leak origin/fix/public-booking-payment-leak
   git merge origin/develop --no-edit
   ```
   Merge **automático, sem conflitos** — o Git detectou os renomes `app/ → services/core-service/app/`
   (e equivalentes para `routes/`, `database/`, `middlewares/`, `tests/`, etc.) e aplicou o patch da
   correção no destino certo sozinho.

2. **Confirmação de que a correção sobreviveu ao merge**
   ```
   git diff -M origin/fix/public-booking-payment-leak HEAD -- <4 arquivos de código/teste>
   → 0 insertions(+), 0 deletions(-)
   ```
   Puro rename de pasta — a lógica da correção de 26/08 chegou intacta em:
   - `services/core-service/app/Controllers/PublicBookingApi/GetBookingStatusController.js`
   - `services/core-service/app/Controllers/ReservationApi/GetBillController.js`
   - `services/core-service/app/utils/resolveTenantBySubdomain.js`
   - `services/core-service/tests/public-booking.test.js`

3. **Portão de QA**

   **a) `bash scripts/qa_checks.sh`** — saída real:
   ```
   ⚠ AVISO — Router sem entrada no Swagger (5 recursos, pré-existente)
   ⚠ AVISO — Elemento interativo cru em features/ (frontend, pré-existente)
   ⚠ AVISO — Bloco de classes repetido em features/ (frontend, pré-existente)

   ⚠ 3 aviso(s). Nenhum erro bloqueante.
   EXIT_CODE=0
   ```
   **Nenhum** aviso da regra 6 ("include de model com dado sensível, sem attributes") — CA-06.5.d
   cumprido.

   **b) Suíte de testes com cobertura** — `npm run test:coverage` dentro de `services/core-service`.
   Sem Postgres nem Docker disponíveis neste ambiente (sem sudo, sem WSL-integration do Docker
   Desktop nesta distro), subi um Postgres 17.10 local via `embedded-postgres` (pacote npm,
   binário oficial, sem precisar de root) em `127.0.0.1:55433`, com `.env.test` local (gitignored,
   nunca commitado) apontando pra ele. Saída real:
   ```
    Test Files  17 passed (17)
         Tests  227 passed | 1 skipped (228)
      Duration  8.85s

    % Coverage report from v8
   -------------------|---------|----------|---------|---------|
   All files          |   74.39 |    71.29 |   83.42 |   76.76 |
   -------------------|---------|----------|---------|---------|
   Statements   : 74.39% ( 1421/1910 )
   Branches     : 71.29% ( 611/857 )
   Functions    : 83.42% ( 146/175 )
   Lines        : 76.76% ( 1315/1713 )
   ```
   Acima do portão de 60% (branches 71,29% > 60% exigido pela T-06.1). O teste específico do
   CA-06.5.c passou:
   ```
   ✓ tests/public-booking.test.js > ... > o status público não expõe dados sensíveis do pagamento
   ```

   **c) `qa-redteam` sobre o diff** — relatório completo em
   `docs/qa/redteam_public-booking-leak_16set2026_rodada-pos-merge.md`. **Veredito: APROVADO COM RESSALVAS.**

   Achado central (🔴, dentro do escopo dos critérios desta tarefa):
   **CA-06.5.b não está cumprido.** `POST /public/:subdomain/bookings` (endpoint público, sem
   autenticação) continua devolvendo `pix.provider_charge_id` no corpo do `201`
   (`CreateBookingController.js:158-162`). Esse é o mesmo tipo de dado que a T-06.5 tirou do
   `GET .../status` — e com ele, qualquer pessoa sem login cria uma reserva, pega o id da cobrança
   e confirma o próprio pagamento via `POST /webhooks/pix` (que não verifica assinatura — T-06.9),
   sem pagar. O `qa-redteam` verificou que esse comportamento é **anterior** a esta branch (está em
   `develop` desde a criação do motor de reserva direta) e que removê-lo hoje quebra dois
   consumidores declarados do campo: o próprio `tests/public-booking.test.js:108-116` (que simula
   o PSP com esse valor) e a descrição do Swagger (`config/swagger.js:190`, que documenta o disparo
   manual do webhook com esse id). É mudança de contrato que precisa ser feita junto com a T-06.9,
   não um ajuste de uma linha nesta branch.

   Achados 🟡/🟢 adicionais (não bloqueiam, registrados no relatório completo):
   - A proteção da regra 6 do `qa_checks.sh` é só `report_warn` — nunca reprovaria o CI mesmo sem
     `attributes`. O comentário no código (`GetBookingStatusController.js:26-28`) afirma o
     contrário ("deixaria de reprovar o build") — factualmente incorreto sobre o próprio mecanismo.
   - O `include` do `GetBillController.js` é multilinha e por isso **fora do alcance** do regex da
     regra 6 — a proteção contra regressão ali depende só do comentário.
   - O teste do CA-06.5.c trava o **nome** dos campos sensíveis, mas não o **valor** do QR code —
     um refactor que devolvesse `{ payload: <base64 do QR> }` passaria.
   - `attributes` do status sem `id`; `.find(kind === 'DEPOSIT')` sem `order` (não dá problema hoje,
     mas não é à prova de reemissão futura de PIX).

   Achados fora do escopo desta branch, repassados:
   - 🔴 `GET /payments` devolve o `PaymentModel` cru (mesmos campos sensíveis) para **qualquer
     usuário autenticado do tenant**, sem `requireRole` — `docs/qa/repasses/para_gabriel_16092026.md`.
   - 🟡 Webhook PIX busca pagamento sem `tenant_id` (mesma pasta de repasse).
   - 🟡 `CorporateClientModel` sem `attributes` vaza CPF/RG do representante em 5 controllers de
     B2B, dono indefinido na divisão de trabalho — `docs/qa/repasses/para_indefinido_16092026.md`.

## Por que parei em vez de abrir o PR

A instrução da sessão foi explícita: *"Se o veredito do qa-redteam for REPROVADO, ou APROVADO COM
RESSALVAS com algum 🔴 no escopo desta correção: PARE e reporte o que falhou — não tente corrigir
por conta própria além do que já está descrito aqui, e NÃO abra PR."*

O 🔴 encontrado está descrito pelo próprio `qa-redteam` como o **CA-06.5.b desta tarefa não
cumprido** — não é um achado genérico de outra área, é um dos quatro critérios de aceite que a
delegação me deu para T-06.5. Mesmo sendo um defeito pré-existente (não introduzido por este
merge) e mesmo o `qa-redteam` recomendando que "pode entrar em `develop`", marcar a T-06.5 como
concluída e abrir PR alegando os critérios cumpridos seria impreciso: um dos quatro não está.

Corrigir esse achado por conta própria também não seria seguro dentro do escopo desta sessão:
remover `provider_charge_id` da resposta pública de criação quebra o `tests/public-booking.test.js`
existente e a descrição do Swagger, e a correção correta depende de decisão conjunta com a T-06.9
(assinatura do webhook) — que é a próxima etapa da mesma delegação, ainda não executada.

## Estado de cada critério de aceite (CA-06.5.a a CA-06.5.d)

| CA | Estado | Evidência |
|---|---|---|
| CA-06.5.a — `attributes` explícito no include/consulta de `Payment` | ✅ | `GetBookingStatusController.js:29` e `GetBillController.js:24`; único par de consumidores de `as: 'payments'` no repo, ambos corrigidos |
| CA-06.5.b — `pix_qr_code`/`provider_charge_id` nunca sem autenticação | ❌ | `CreateBookingController.js:158-162` devolve `provider_charge_id` no `201` público — achado 🔴 do `qa-redteam` |
| CA-06.5.c — teste garantindo ausência dos campos sensíveis | ⚠️ cumprido na letra | `tests/public-booking.test.js:126-143` passa, mas trava só o nome do campo, não o valor do QR (achado 🟢) |
| CA-06.5.d — `qa_checks.sh` sem o aviso da regra 6 | ✅ | `bash scripts/qa_checks.sh` → exit 0, 3 avisos, nenhum deles da regra 6 |

## Pendências

| # | Pendência | Prioridade | Observação |
|---|-----------|-----------|------------|
| 1 | Decidir, junto com a T-06.9, se `provider_charge_id` sai do `201` de `POST /public/:subdomain/bookings` (`CreateBookingController.js:158-162`) — e atualizar `tests/public-booking.test.js:108-116` e `config/swagger.js:190` na mesma passagem | 🔴 Alta | Bloqueia fechar a T-06.5 como concluída; melhor resolver junto com a assinatura do webhook, porque ambos mexem no mesmo fluxo de confirmação de pagamento |
| 2 | `GET /payments` sem `requireRole` devolve `PaymentModel` cru a qualquer usuário do tenant | 🔴 Alta | Repasse em `docs/qa/repasses/para_gabriel_16092026.md`; mesma família de vazamento desta tarefa, um nível acima (autenticado, não público) |
| 3 | Corrigir o comentário em `GetBookingStatusController.js:26-28` — afirma que remover `attributes` "reprovaria o build", mas a regra 6 do `qa_checks.sh` é só aviso (`report_warn`), nunca reprova | 🟡 Média | Comentário engana o próximo dev sobre a rede de segurança real |
| 4 | `include` do `GetBillController.js` é multilinha e fica fora do alcance do regex da regra 6 — proteção depende só do comentário | 🟡 Média | Colapsar o include numa linha por item resolve, ou tornar o regex do `qa_checks.sh` multilinha |
| 5 | Teste do CA-06.5.c não trava o valor do QR code, só o nome dos campos sensíveis | 🟢 Baixa | Guardar `qr_code` da criação numa variável e afirmar `not.toContain` no teste de status fecha em uma linha |
| 6 | `CorporateClientModel` sem `attributes` vaza CPF/RG do representante em 5 controllers de B2B, dono indefinido | 🟡 Média | Repasse em `docs/qa/repasses/para_indefinido_16092026.md`; área B2B não está na divisão de trabalho atual do time |
| 7 | Branch `fix/public-booking-payment-leak` está com o merge + o commit de documentação da auditoria, **local, não pushada** | 🔴 Alta (para continuar a etapa) | Próximo passo, depois de decidir a pendência 1: resolver `provider_charge_id`, rodar o portão de novo, e só então push + PR |

## Commits desta sessão

| Hash | Mensagem |
|------|----------|
| `<merge automático>` | `merge: origin/develop em fix/public-booking-payment-leak` (merge commit, sem edição de mensagem) |
| `a679647` | `docs(qa): auditoria pos-merge da T-06.5 e repasses de achados fora do escopo` |

Nenhum dos dois foi pushado — a branch permanece local neste worktree até a pendência 1 ser
resolvida ou até o Gabriel decidir que o achado 🔴 não bloqueia o PR.

## Notas de ambiente

- Este worktree não tinha Postgres nem Docker utilizável (sem `sudo` interativo; a integração
  WSL do Docker Desktop não está ativada nesta distro). Para rodar a suíte, usei o pacote npm
  `embedded-postgres` (binário oficial do Postgres 17.10, sem precisar de root) só nesta sessão,
  numa pasta fora do repositório (`/tmp/.../scratchpad/pgtest`). Não alterei `package.json` do
  projeto nem commitei nada relacionado a isso. O `.env.test` criado em
  `services/core-service/.env.test` está no `.gitignore` e não foi commitado.
- Não fiz `git push` em nenhum momento desta sessão.

## Checklist de qualidade

- [x] `git status` limpo (working tree clean) na branch de trabalho
- [ ] `git push` — **não feito**, pendência 7
- [x] Relatório de sessão criado (este arquivo)
- [x] Pendências documentadas com contexto suficiente
- [x] Nenhum `.env` ou segredo commitado
- [x] Endpoints tocados já tinham `tenant_id` nas queries (não alterado por esta sessão)
- [x] N/A — nenhuma alteração de 2+ tabelas nesta sessão (só leitura/`attributes`)
- [x] Commits seguem Conventional Commits
- [x] Branch partiu de `develop` (via merge) — **não mergeada de volta**, por decisão de parar
