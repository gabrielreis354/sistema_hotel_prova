# Rascunho — Documento 08: Planejamento de Sprints e Tarefas

> **Isto não é o documento oficial.** É o insumo produzido nesta sessão (21/09/2026), no mesmo
> padrão do que foi feito para o ADR-004 em `viacep_e_decisao_k8s_16set2026.md`: conteúdo pronto
> para o Weslley conferir e transcrever para `Projetos/gesway/08-...md` no fork da UniFAAT.
>
> **Por que este documento existe:** o Documento 02 (Requisitos), já entregue ao professor,
> **afirma** que o acompanhamento de execução do projeto mora no Documento 08. Até 21/09/2026,
> o Documento 08 é só o template padrão da UniFAAT — a afirmação do Doc 02 não tinha lastro.
> Este rascunho fecha essa lacuna.
>
> **Fontes usadas (todas lidas nesta sessão, não de memória):** `docs/DIVISAO_TRABALHO_TIME_09set2026.md`
> v2.4, `docs/trilhas-do-gesway.html`, `docs/specs/README.md` e o histórico de cada `docs/specs/SPEC-*.md`,
> `docs/ANALISE_CONFORMIDADE_ACEITE_PROJETO_EXPERIMENTAL_23ago2026.md`, e `git log`/`git branch -a`
> do estado real do repositório em 21/09/2026.

---

## 1. Metodologia

O Gesway usa **sprints semanais** com três trilhas paralelas (uma por integrante), não um board
único. Cada trilha tem backend, frontend e documentação próprios, divididos por **afinidade**:
quem constrói a API constrói a tela dela.

- **Cadência:** uma reunião por semana. Pauta fixa: o que fechou · o que está travando · o que
  vai colidir na semana seguinte · alguma Spec mudou · revisão de componentes novos do design
  system. `bash scripts/estado.sh` responde metade da pauta antes da reunião.
- **Duas regras acima da reunião:** bloqueio não espera a reunião — avisa no dia em que trava; os
  dois pontos de encontro entre trilhas (R1 e R2, ver §4) são anunciados por quem os conclui, não
  descobertos pelos outros.
- **Portão de QA por escopo:** o `qa-redteam` roda antes de todo merge e julga só o diff da
  branch. Achado fora do escopo da branch não reprova — vai para `docs/qa/repasses/`, endereçado
  ao dono da área.
- **Revisão humana** (além do QA automatizado) só onde o erro é irreversível: migração de dado
  financeiro, qualquer coisa que mexa em valor ou pagamento, recurso de nuvem com custo, e
  promoção para `main`.
- **Horizonte:** 10 semanas, ~111 dias-dev somados (~37 por pessoa) — um semestre sem folga para
  quem também estuda. A ordem de corte de escopo já está declarada de antemão (§6), para não
  precisar decidir sob pressão de prazo.

## 2. Papéis e trilhas

| Pessoa | Backend | Frontend | Documentos |
|---|---|---|---|
| **Gabriel** | SPEC-01 Microsserviços · T-06.2, T-06.5, T-06.9 · portão de QA de todas as frentes | Reservas · Rack · Painel do dia | 01 e 02 |
| **Sirlande** | SPEC-04 Consumo (comanda) · T-06.10, T-06.11 · revisão de T-06.3 e T-06.6 | Comanda · Ficha do hóspede | 03 (DFD) e 04 (MER) · dona de `db/schema.sql` e `app/Models/` |
| **Weslley** | SPEC-03 Integrações · SPEC-02 Cloud/IaC · T-06.4 docker-compose | Financeiro · Fechamento de caixa · B2B · Configurações | 05 a 08, incluindo o ADR-003 no 07 · dono do CI e de `infra/` |

**Mapa de colisão por arquivo** (não por dependência de tarefa — por arquivo compartilhado):

| Arquivo | Quem mexe | Regra |
|---|---|---|
| `.github/workflows/` | Gabriel (T-01.5) e Weslley (T-02.5) | Weslley é o dono; Gabriel entrega, Weslley integra |
| `services/core-service/config/swagger.js` | Todos | T-06.2 reescreve o arquivo inteiro — uma pessoa, uma vez, ninguém mexe durante |
| `services/core-service/db/schema.sql` · `app/Models/` | Sirlande e Gabriel | Sirlande é a dona; Gabriel avisa antes |
| `infra/k8s/` · `terraform/` · `docker-compose.yml` | Weslley | — |

## 3. Backlog priorizado (Specs)

| Spec | Frente | Prioridade | Estado em 21/09 | Bloqueia |
|---|---|---|---|---|
| SPEC-01 | Arquitetura de Microsserviços | 🔴 Crítica | 🟡 T-01.1 concluída (ADR-003) | SPEC-02, docs C4/DFD, MER v1.2 |
| SPEC-02 | Cloud, IaC e Observabilidade | 🔴 Crítica | 🟡 T-02.1 decidida, falta ADR-004 formal | Defesa do 5º semestre |
| SPEC-03 | Integrações com APIs Externas | 🔴 Crítica | 🟡 T-03.1 concluída; T-03.2 em branch local, sem push | — |
| SPEC-04 | Módulo de Consumo (Comanda) | 🟠 Alta | 🔲 Não iniciada | Frontend Fase 2 |
| SPEC-05 | Frontend — app-pms | 🟠 Alta | 🟡 Fase 0 completa, Fase 1 ~20% | Demonstração da defesa |
| SPEC-06 | Qualidade e Dívida Técnica | 🟡 Média | 🟡 T-06.4, T-06.5, T-06.8 concluídas; T-06.3/T-06.6 em branch | Portão de cobertura do CI |
| SPEC-07 | Tarifas por Período | 🟠 Alta p/ produto | 🔲 Buffer — primeiro item de corte | — |

## 4. Grade de 10 semanas (planejada em 09/09/2026, v2.0 da divisão)

`S1`–`S10` = semanas. Hoje (21/09/2026) o projeto está na **semana 2**.

| Semana | Gabriel | Sirlande | Weslley |
|---|---|---|---|
| S1 | T-01.1 · T-01.0 — recorte e layout · release T-06.8 | Revisão · T-04.1 · Docs 03/04 — revisar T-06.3/T-06.6 · `Account`+`AccountItem` · DFD e MER | Revisão · T-03.1 · T-02.1 — infra e ADR-003 · ViaCEP · decidir K8s e custo |
| S2 *(hoje)* | T-06.9 — webhook PIX sem assinatura (atrasada) | T-04.2 · T-04.3 — migração de dado financeiro · bill da conta · frontend começa | T-03.2 · T-06.4 · RabbitMQ — Mercado Pago · docker-compose · broker no cluster · frontend começa |
| S3–S4 | T-06.2 · T-06.5 · T-01.2 · T-01.3 — Swagger (antecipada), integrar correção, contratos, RS256 · frontend começa | T-04.4 · T-04.5 — `Payment ↔ Account`, branch isolada (crítico) | T-02.2 · Doc 08 — Terraform base · planejamento de sprints |
| S5–S6 | T-01.4 — extrair `analytics-service` (reestimar) | T-04.6 · T-04.7 — check-in cria conta · fecha SPEC-04 | T-02.5 — deploy automatizado no CI |
| S7–S8 | T-01.5 — CI/CD por serviço, entrega ao Weslley | SPEC-07 — tarifas, só se o cronograma segurar | T-02.3 · T-02.4 — portar k8s · observabilidade · Docs 05 e 06 |
| S9–S10 | Folga — reserva para T-01.4 (ficou maior) | — | — |

## 5. Pontos de encontro

As únicas duas dependências entre pessoas do plano inteiro — quem fecha, anuncia:

- **R1 · fim da S4** — T-04.3 (Sirlande) fecha o bill da conta e destrava a comanda no frontend.
- **R2 · fim da S6** — T-01.4 (Gabriel) extrai o `analytics-service` com RabbitMQ e destrava a
  T-02.3 (Weslley) e a versão final dos Documentos 03 e 06.

## 6. O que se corta primeiro (contingência de escopo)

Ordem já declarada, para não decidir sob pressão:

1. **SPEC-07 — Tarifas por período** (~12 dias) — buffer explícito; o produto funciona sem
   tarifa por período, só fica menos completo.
2. **T-05.9 a T-05.12** (~9,5 dias) — governança, ficha do hóspede, fechamento de caixa e busca
   global. Saem inteiras sem quebrar o resto.
3. **T-04.3 como ponto de parada seguro** — se o prazo apertar no meio da comanda, para ali; a
   conta da reserva já funciona.

## 7. Riscos e mitigação

| Risco | Severidade | Mitigação |
|---|---|---|
| Duas trilhas sem avanço desde 09/09 | Alto | Retomar pelas tarefas sem bloqueio; pauta da reunião semanal |
| T-01.4 maior que o previsto, com RabbitMQ | Alto | Reestimar na reunião; S9–S10 do Gabriel viraram folga |
| Escopo não caber até a defesa | Alto | Ordem de corte do §6 já declarada |
| Custo de nuvem escapar do free-tier | Alto | Regra absoluta: recurso sobe, recurso desce no fim do uso; nunca o usuário `root` |
| Três pessoas aprendendo React ao mesmo tempo | Médio | Princípios comuns; cada um orquestra um agente no próprio módulo |
| Branch de agente executor divergir do layout novo (pós PR #77) | Médio | Ao sincronizar, mover para `services/core-service/` e resolver conflito em `qa_checks.sh` |

## 8. Registro de execução — o que de fato aconteceu

> Esta seção é o que separa "planejamento" de "acompanhamento de execução" — é o motivo do
> Documento 02 citar o Documento 08 como fonte. Atualizar a cada sprint fechado.

### Semana 1 (09/09 a 15/09/2026) — concluído

| Item | Quem | Evidência |
|---|---|---|
| T-01.1 — recorte dos serviços | Gabriel | ADR-003, SPEC-01 v1.2, commit `git log --oneline -- docs/specs/SPEC-01-microsservicos.md` |
| T-01.0 — repositório em layout de serviços | Gabriel | PR #77 — `services/core-service/` e `infra/k8s/` |
| T-06.8 — promover `develop` para `main` | Gabriel | PR #76 (mergeado por ele), previsto para S9–S10, saiu antecipado |
| Material para Documentos 03 e 04 | Gabriel → Sirlande | PR #75 — insumos do DFD, sugestão do MER, briefing |
| Documento 02 v1.3 | Gabriel | PR #5, aceito no repositório do professor |
| T-03.1 — ViaCEP | Weslley | Branch `feature/viacep-integration`, relatório `viacep_e_decisao_k8s_16set2026.md`, SPEC-03 v1.1 |
| T-02.1 — decisão Kubernetes/custo | Weslley | k3s em EC2 single-node, não EKS; SPEC-02 v1.1. **Pendente:** transcrever para ADR-004 no fork (CA-02.1.d ainda aberto em 21/09) |

### Semana 2 (16/09 a 22/09/2026) — em andamento, snapshot em 21/09

| Item | Quem | Estado real em 21/09 |
|---|---|---|
| T-06.5 — vazamento de pagamento no endpoint público | Gabriel (via agente executor) | ✅ Corrigido e mergeado — PR #78, auditado em `docs/qa/redteam_public-booking-leak_16set2026.md` |
| T-06.3 · T-06.6 — índice único parcial em model `paranoid` | Gabriel (via agente executor), dono é Sirlande | Implementado em `fix/paranoid-unique-constraints` (16 commits) — **aguardando revisão da Sirlande e nova auditoria `qa-redteam`** |
| T-06.4 — docker-compose de contingência | Weslley | ✅ Implementado e testado ponta a ponta (build, healthcheck, `migrate`) em `feature/docker-compose-rabbitmq`, pushado. Fecha o critério 20 do Termo — registrado em `docs/ANALISE_CONFORMIDADE_ACEITE_PROJETO_EXPERIMENTAL_23ago2026.md` |
| RabbitMQ no cluster | Weslley | 🟡 Só infra provisionada (`infra/k8s/rabbitmq.yaml`, commit `57c0ec3`) — **sem outbox, publish ou consume**. É avanço parcial de T-01.4 (trilha do Gabriel), não uma conclusão da tarefa do Weslley |
| T-03.2 — Mercado Pago (PIX real) | Weslley | 🟡 Implementado em `feature/mercadopago-pix` (5 commits: provider, verificação de webhook, correção de transação, testes, `.env.example`) — **commits só locais, sem push. Risco de perda ainda não resolvido em 21/09** |
| Doc 08 — planejamento de sprints | Weslley | 🔲 Sem avanço até 21/09 — este rascunho é o primeiro insumo |
| Commits de Weslley e Sirlande desde 09/09 | — | Registrado em 16/09 como **zero** até aquela data; Weslley retomou em 16/09 (ViaCEP, K8s, docker-compose, RabbitMQ infra) |

## 9. Histórico de versões deste rascunho

| Versão | Data | Autor | Alteração |
|---|---|---|---|
| 0.1 | 21/09/2026 | Weslley (orquestrando Claude Code) | Criação — primeiro insumo do Documento 08, cobrindo metodologia, papéis, backlog, grade de 10 semanas, riscos e registro de execução das semanas 1 e 2 |

---

**Próximo passo:** conferir este rascunho contra o que o Gabriel e a Sirlande sabem das próprias
trilhas (este documento só enxerga o que está registrado no repositório do hotel — reuniões e
combinados verbais não entram aqui), depois transcrever para
`Projetos/gesway/08-planejamento-sprints-tarefas.md` no fork da UniFAAT. A partir da próxima
sprint fechada, atualizar a §8 em vez de reescrever o documento inteiro.
