# 2026-09-16 — Agente executor (trilha do Gabriel)

- **Branch:** `fix/public-booking-payment-leak`
- **Horário:** sessão única, Etapa 1 da delegação `docs/delegacoes/pendencias_liberadas_gabriel_16set2026.md`
- **Objetivo da sessão:** T-06.5 — integrar e fechar a correção do vazamento público de dados de pagamento (`GET /public/:subdomain/bookings/:id/status`)

## O que foi feito

1. `git checkout fix/public-booking-payment-leak && git merge origin/develop` — 57 commits absorvidos, **sem conflitos**. Os renomes do novo layout (PR #77, `app/` → `services/core-service/app/` etc.) foram detectados automaticamente pelo git.
2. Confirmada a correção original (commits `653b675` e `3c2023f`, de 26/08) intacta no novo layout: `GetBookingStatusController.js` já usava `attributes: ['kind', 'status', 'amount', 'paid_at']` no include de `Payment`.
3. Portão de QA — 1ª rodada: `qa_checks.sh` 0 erros, suíte completa 221/221 + 1 skip, cobertura 74%/71%/84%/76%.
4. Subagente `qa-redteam` auditou o diff (`docs/qa/redteam_public-booking-leak_16set2026.md`). Veredito: **APROVADO COM RESSALVAS**. Achado relevante dentro do escopo: **CA-06.5.c estava cumprido só na letra** — o teste existente valida a resposta serializada (montada campo a campo pelo controller), não a query; removendo o `attributes` do include, a suíte continuava 100% verde.
5. Corrigido antes do merge:
   - Comentário enganoso no controller, que afirmava (falso) que remover o `attributes` "reprovaria o build" — a regra 6 do `qa_checks.sh` é `report_warn`, não bloqueia CI.
   - Novo teste em `tests/public-booking.test.js` que espiona `ReservationModel.findOne` e afirma que o include de `Payment` não traz `pix_qr_code`/`provider_charge_id`/`provider`. Verificado manualmente: revertendo a correção, o teste falha vermelho; com a correção, passa.
6. Portão de QA — 2ª rodada (pós-correção): `qa_checks.sh` 0 erros, suíte completa **222/222 + 1 skip**, cobertura inalterada.
7. SPEC-06 atualizada: T-06.5 e CA-06.5.a–d marcados como concluídos, com nota sobre a pendência nova.
8. PR aberto e mergeado em `develop` (ver hash abaixo).

## Commits gerados

| Hash | Mensagem |
|------|----------|
| `75c2849` | `fix(public-booking): corrige comentário enganoso sobre a regra 6 do qa_checks` |
| `7dbca54` | `test(public-booking): trava os attributes do Payment na query do status público` |
| `5fc7295` | `docs(qa): auditoria qa-redteam do vazamento de pagamento pos-merge de layout` |
| `1569aa5` | `docs(specs): marca T-06.5 como concluida na SPEC-06` |

(+ os 57 commits herdados do merge com `origin/develop`, sem conteúdo novo desta sessão)

## Pendências

| # | Pendência | Prioridade | Observação |
|---|-----------|-----------|------------|
| 1 | `GET /payments` (`ListPaymentController.js`) devolve o `Payment` inteiro — incluindo `provider_charge_id` — a **qualquer usuário autenticado do tenant**, sem `requireRole` na rota. Achado novo, reproduzido pelo `qa-redteam` em 16/09, pré-existente (fora deste diff) | 🔴 Alta | Combinado com a T-06.9 (webhook sem assinatura), qualquer usuário do tenant confirma pagamento falso hoje. Correção sugerida pelo auditor: `defaultScope` no `PaymentModel` excluindo `pix_qr_code`, `provider_charge_id`, `provider` — resolve todos os consumidores atuais e futuros de uma vez. Recomendo abrir task própria na SPEC-06 (ex.: T-06.12). **A T-06.9 (Etapa 2 desta delegação) neutraliza o vetor de forjar pagamento — a exposição do dado em si continua.** |
| 2 | `POST /public/:subdomain/bookings` devolve `provider_charge_id` no corpo público (`CreateBookingController.js:158-161`) | 🟡 Média | Mesmo dado, outro endpoint. A T-06.9 (assinatura do webhook) reduz o risco prático — saber o `provider_charge_id` deixa de ser suficiente para confirmar pagamento — mas a exposição em si seria eliminada junto com a pendência 1 (`defaultScope`). |
| 3 | 5 includes multilinha fora do alcance da regra 6 do `qa_checks.sh`, dois vazando PII de verdade (`GET /reservations/:id` devolve `guest.cpf` sem `requireRole`; `GET /contracts/:id` devolve dados do representante legal) | 🟡 Média | Detalhado em `docs/qa/redteam_public-booking-leak_16set2026.md`, achado "5 includes multilinha". Fora do escopo desta task. |
| 4 | Regra 6 do `qa_checks.sh` é apenas `WARN`, não bloqueia CI, e só enxerga include de uma linha | 🟢 Baixa | Considerar promover a `ERROR` ou trocar por parser multilinha — discussão de política, não urgente isoladamente. |
| 5 | Teste trava a chave (`pix_qr_code`) mas não o valor do QR; `deposit.amount` aceita qualquer `Number`; sem teste de isolamento cross-tenant no endpoint público | 🟢 Baixa | Recomendações de 26/08 reiteradas pelo auditor, ainda em aberto. Baixo custo, próxima sessão que tocar o arquivo. |

**Próxima etapa da delegação:** Etapa 2 — T-06.9 (assinatura do webhook PIX), branch `fix/pix-webhook-signature`. Condição de parada: **avisar o Gabriel após o merge**, antes de seguir para a Etapa 3.
