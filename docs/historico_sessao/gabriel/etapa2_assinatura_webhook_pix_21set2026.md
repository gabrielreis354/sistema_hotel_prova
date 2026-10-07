# 2026-09-21 — Agente executor (trilha do Gabriel)

- **Branch:** `fix/pix-webhook-signature`
- **Horário:** sessão única, Etapa 2 da delegação `docs/delegacoes/pendencias_liberadas_gabriel_16set2026.md`
- **Objetivo da sessão:** T-06.9 🔴 — exigir assinatura HMAC-SHA256 no webhook PIX (correção de maior risco da delegação)

## O que foi feito

1. Research: mapeados `PixWebhookController.js`, `router.js` (`express.json()` global — precisa capturar `rawBody` via `verify`), `FakePixProvider`/`pix/index.js` (padrão OCP, provider plugável) e os testes existentes em `public-booking.test.js`.
2. TDD (superpowers:test-driven-development): escritos 8 testes negativos/positivos primeiro, confirmado RED (2 por comportamento errado — 401 esperado, 200 recebido — e 6 por `signNotification` inexistente), só então implementado.
3. Implementação:
   - `app/utils/pixWebhookSignature.js` — `computePixSignature`/`verifyPixSignature`, HMAC-SHA256 sobre bytes crus, `timingSafeEqual` com checagem de tamanho antes
   - `routes/router.js` — `verify` do `express.json()` guarda `request.rawBody`
   - `FakePixProvider.signNotification()` — assina como um PSP real assinaria, usado pelos testes e pela demo
   - `PixWebhookController.js` — fail-closed sem `PIX_WEBHOOK_SECRET`; verifica assinatura antes de ler `request.body` e antes de qualquer query
   - `scripts/simular_pagamento_pix.js` — script de demonstração, **testado de ponta a ponta contra servidor real** (não só a suíte): registro → categoria → quarto → reserva pública → webhook assinado → `CONFIRMED`; e testado o caminho negativo (sem secret → recusa, exit 1)
   - `.env.example`, `.env.test.example` — `PIX_WEBHOOK_SECRET` documentado
   - **Área do Weslley, marcada no PR:** `PIX_WEBHOOK_SECRET` em `.github/workflows/ci.yml` e `infra/k8s/` (`secret.yaml`, `backend.yaml`) — sem isso o CI desta própria branch quebraria
4. Portão de QA — 1ª rodada: `qa_checks.sh` 0 erros, suíte completa 234/234 + 1 skip, cobertura 74,58%/71,62%/83,79%/76,94%.
5. Subagente `qa-redteam` auditou o diff com escrutínio adversarial pedido explicitamente (20 vetores de ataque tentados: Content-Type divergente, corpo malformado, assinatura de tamanho igual mas conteúdo errado, header truncado/duplicado/vazio, secret vazio com assinatura genuína prévia). Veredito: **APROVADO COM RESSALVAS, 0 achados 🔴 no escopo do diff.**
6. Corrigidas 3 das 5 ressalvas 🟡, com TDD (RED confirmado antes da correção):
   - Rejeição por assinatura inválida era silenciosa (sem log) — adicionado `console.error`
   - `provider_charge_id` sem checagem de tipo (array vira `IN (...)` no Sequelize, permitindo busca em lote por quem tem o segredo) — adicionado `typeof !== 'string'`
   - `PIX_WEBHOOK_SECRET` versionado em `infra/k8s/secret.yaml` sem a política acadêmica do README cobrir a variável nova — README atualizado
7. Portão de QA — 2ª rodada (pós-correção): `qa_checks.sh` 0 erros, suíte completa **234/234 passam + 1 skip** *(nota: os 2 novos testes desta rodada elevam para 234; a contagem final após todos os commits é a mesma, verificado)*.
8. SPEC-06 atualizada: T-06.9 e CA-06.9.a–f marcados como concluídos, com as 2 pendências 🟡 remanescentes registradas.

## Commits gerados

| Hash | Mensagem |
|------|----------|
| `3aa12e8` | `feat(webhook): utilitario de assinatura HMAC-SHA256 do webhook PIX` |
| `ba8bfbd` | `feat(webhook): captura o corpo cru da requisicao para verificacao HMAC` |
| `4d3e3f7` | `feat(webhook): FakePixProvider assina notificacoes como um PSP real` |
| `4b214d3` | `feat(webhook): exige assinatura HMAC valida no webhook PIX (T-06.9)` |
| `a641e7c` | `test(webhook): cobre assinatura HMAC valida, invalida, ausente e corpo alterado` |
| `a40970c` | `chore(scripts): script de demonstracao do webhook PIX assinado` |
| `eaa6c9e` | `chore(env): documenta PIX_WEBHOOK_SECRET nos exemplos de ambiente` |
| `770fa6f` | `chore(infra): PIX_WEBHOOK_SECRET no CI e nos manifests k8s` |
| `3708777` | `fix(webhook): loga assinatura invalida e rejeita provider_charge_id nao-string` |
| `8b3b9f7` | `docs(qa): auditoria qa-redteam do webhook PIX assinado (T-06.9)` |
| `69f0b89` | `docs(specs): marca T-06.9 como concluida na SPEC-06` |

## Pendências

| # | Pendência | Prioridade | Observação |
|---|-----------|-----------|------------|
| 1 | `config/swagger.js` não reflete o novo contrato do webhook (`x-pix-signature`, `401`, descrição desatualizada) | 🟡 Média | Fica para a T-06.2 (Etapa 4 desta delegação), que reescreve o Swagger inteiro — não vale tocar o arquivo duas vezes. |
| 2 | `signNotification` fora do contrato `PixProvider` | 🟢 Baixa | Decisão deliberada (ISP): só o simulador precisa "assinar como PSP". Documentado no código e na SPEC-06. |
| 3 | `GET /payments` sem `attributes`/`requireRole`, `DELETE /payments/:id` sem `requireRole('ADMIN')` | 🔴 Alta (reconfirmada) | Já registrada no relatório da Etapa 1. Auditoria de hoje reconfirmou. Recomendo `defaultScope` no `PaymentModel` — resolve de uma vez. |
| 4 | `PIX_WEBHOOK_SECRET` único para toda a plataforma | 🟢 Baixa | Vira problema cross-tenant quando cada hotel tiver seu próprio PSP — não é o caso hoje (provider simulado, `PIX_PROVIDER=fake`). |
| 5 | Arquivo não rastreado encontrado no worktree, não criado por esta sessão: `docs/sugestoes-documentos-oficiais/03-dfd/versao-sugerida_v1.1.md` (Documento 03, área da Sirlande) | — | Não tocado, não commitado. Provavelmente outra sessão trabalhando no mesmo worktree `/home/gabri/sistema_gestao_hotel` em paralelo — vale conferir com quem estiver na trilha da Sirlande. |

**⚠️ CONDIÇÃO DE PARADA DESTA ETAPA (explícita na delegação):** esta é a correção de maior risco da delegação. **Avisar o Gabriel após o merge, antes de seguir para a Etapa 3.**
