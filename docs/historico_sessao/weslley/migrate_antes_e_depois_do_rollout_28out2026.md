# Migrate antes e depois do rollout — 28/10/2026

**Dev:** Weslley (sessão orquestrada com Claude Code)
**Branch:** `fix/migrate-antes-e-depois-do-rollout` (a partir de `origin/develop` em `a6dc1ea`)
**Status:** implementado, testado num cluster kind real e auditado pelo qa-redteam (APROVADO COM RESSALVAS, `docs/qa/redteam_migrate-antes-e-depois-do-rollout_28out2026.md`); os 6 🟡 e o 🟢-1 corrigidos na própria branch; mesclado em `develop`

## Contexto

Repasse de 19/10 (`docs/qa/repasses/para_weslley_19102026.md`): desde a T-04.2 o `migrate` também
migra **dados** (`consumptions` → `account_items`), e o `./start.sh migrate` fazia `kubectl exec` nos
pods que já estavam no ar. O repasse pedia o migrate **antes** do rollout, **de novo depois**, e o
código 1 tratado como falha do deploy. Item da semana 3 do `PLANO_MVP_ATE_10DEZ2026.md`.

A sessão começou pelo parecer do Sirlande de 28/10 sobre o plano do MVP, que lista a frente do
Weslley (T-05.6, T-01.5, Doc 08, compose) e diz "sem atividade visível desde 17/10".

## O que foi feito

| Arquivo | Mudança |
|---|---|
| `infra/k8s/jobs/backend-migrate.yaml` | Job do migrate com a imagem do deploy (`__IMAGE__`), `backoffLimit: 0`, `activeDeadlineSeconds: 600`, pod guardado 1 h para o log. Fora do `kustomization` |
| `infra/k8s/networkpolicy.yaml` | `postgres-ingress` libera `app: backend-migrate` |
| `start.sh` | `migrate` usa o Job; `deploy [imagem]` = migrate → rollout → espera os pods antigos saírem → migrate. Loop lê as condições do Job, falha na hora com `ErrImagePull`, teto de 660 s |
| `docs/infra/KUBERNETES.md` | Seção "Atualizar o backend": etapas, tabela de falha por etapa, aviso do `apply -k`, regra expand/contract |
| `README.md`, `docs/db/ARQ_DATABASE.md` | Trocam `kubectl exec deploy/backend ... migrate` por `./start.sh migrate` |

## Evidências (cluster kind `gesway-migrate`, Kubernetes v1.34.0, 28/10)

| Cenário | Resultado |
|---|---|
| `./start.sh migrate` | Job concluído, migrations e constraints aplicadas |
| Pod com `app=outro` → `postgres:5432` | Bloqueado pela NetworkPolicy |
| Pod com `app=backend-migrate` → `postgres:5432` | Conectou |
| `./start.sh deploy` | migrate → rollout → espera dos antigos → migrate; 2 min 12 s |
| `./start.sh deploy postgres:17` (Job falha) | `BackoffLimitExceeded` mostrado, exit 1, imagem do Deployment intacta |
| `./start.sh deploy nao-existe/imagem:0` | `ErrImagePull`, exit 1 em 6 s (antes: 600 s calado) |
| ResourceQuota `pods: 0` + Job com deadline 20 s | Contadores vazios para sempre (o loop antigo travaria); condição `Failed: DeadlineExceeded`, que o loop novo pega |

## Pendências

- 🟢 do qa-redteam não corrigidos: tag imutável fora do kind (documentado no runbook), Job sem
  `securityContext` e com token de ServiceAccount (mesma lacuna do backend), `qa_checks.sh` não amarra
  o label do Job à NetworkPolicy.
- Decisão do Weslley: o **CA-05.6.a** (tela de registrar pagamento no check-out) fica com ele ou passa
  para o Sirlande, como o parecer de 28/10 propõe. Sem isso a T-05.6 não começa.
- Próximos da frente do Weslley no plano: T-05.6 (indicadores), T-01.5 (CI por serviço), Doc 08
  (rascunho em `rascunho_doc08_planejamento_sprints_21set2026.md`, não versionado), compose do roteiro
  inteiro (M8, 17/11).
- Só o Weslley: confirmar a revogação da chave de produção do Asaas no painel.
