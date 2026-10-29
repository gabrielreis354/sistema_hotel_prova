# Alinhamento de contexto — tarefas do Weslley até 10/12

**De:** Sirlande · **Para:** Weslley · **Data:** 28/10/2026 (semana 2 do plano)
**Base:** `docs/PLANO_MVP_ATE_10DEZ2026.md` (Gabriel, PR #99), o parecer de 28/10 (`docs/PARECER_PLANO_MVP_SIRLANDE_28out2026.md`, branch `docs/parecer-plano-mvp-sirlande`), as specs e os repasses do qa-redteam. Tudo foi conferido no repositório (`origin`) em 28/10.

> **Para que serve.** Reúne num lugar só o que está com você, o que já foi entregue e a ordem de importância. Não é cobrança. O objetivo é que você retome sem ler 10 arquivos. Se algo não couber até 04/11, devolva no ponto de controle de **03/11** (02/11 é feriado). Devolver cedo é melhor do que travar perto do congelamento.

---

## 1. O contexto em 5 linhas

1. O 4º semestre exige **os 8 documentos e um MVP funcional, com integração inicial dos microsserviços**. Nuvem e Terraform ficam para o 5º semestre.
2. O MVP é um **roteiro de 7 passos**, demonstrado ao vivo no Docker Compose, sem nuvem. O que não aparece no roteiro fica para o 5º semestre.
3. **Datas:** congelamento de funcionalidades em **24/11** (depois só correção e ensaio), release em 01/12 e entrega em **10/12**.
4. **Você está em três passos do roteiro:** o 6 (PIX), o 7 (indicadores) e a subida do roteiro inteiro no compose.
5. **Hoje (28/10) você fechou duas pendências:** o `migrate` antes e depois do rollout, já na `develop`, e o painel do RabbitMQ no Grafana, na branch. Desde 17/10 entraram na `develop` o T-04.5, o T-04.6, o T-04.7 e a comanda (T-05.5). O Gabriel tem 4 branches prontas para entrar até 30/10.

### O roteiro, com o seu papel

| Passo | O que a banca vê | Dono | Você |
|---|---|---|---|
| 1 | Admin cadastra categorias e quartos | Gabriel | — |
| 2 | Recepção cria reserva e faz check-in | Gabriel | — |
| 3 | Garçom lança consumo no celular, inclusive sem rede | Sirlande | — |
| 4 | Painel do dia | Gabriel | — |
| 5 | Check-out com conta em linha do tempo e pagamento | Gabriel + Sirlande | — |
| 6 | **Hóspede reserva direto e paga o sinal por PIX; o webhook confirma** | **Weslley** | Ensaio e plano B |
| 7 | **Gerente abre os indicadores, servidos pelo `analytics-service`** | Gabriel (H.3) + **Weslley** (T-05.6) | A tela |
| todos | **`docker compose up` sobe o roteiro inteiro** | **Weslley** (compose) + Sirlande (seed) | A subida |

---

## 2. O que você já entregou

| Entrega | Situação |
|---|---|
| T-03.1, ViaCEP | ✅ |
| T-06.4, `docker-compose.yml` de contingência | ✅ |
| PIX Asaas no sandbox | ✅ na `develop` em 17/10; teste real no sandbox em 16/10 (`RECEIVED`) |
| Chaves expostas no chat | ✅ a de sandbox foi trocada e a de produção foi excluída em 16/10 (seu relatório de 15/10, §Pendências). **Esse risco está resolvido**: o boletim e o parecer ainda pediam confirmação |
| `migrate` antes e depois do rollout (repasse de 19/10) | ✅ na `develop` em 28/10: Job de migrate no k8s, `start.sh deploy`, runbook e qa-redteam |
| Painel do RabbitMQ no Grafana (CA-01.4.f) e alertas de DLQ e RabbitMQ fora | ✅ feito e validado em 28/10 (13 consultas pelo Grafana), na branch `feature/grafana-rabbitmq`. Falta o qa-redteam e o merge (ver 2.2) |
| Doc 08, v1.0 sugerida | Rascunho de 07/10 em `docs/sugestoes-documentos-oficiais/08-sprints/`, mais o seu rascunho de 21/09, que não está versionado |

---

## 3. Tarefas por nível de importância

### 🔴 Nível 1 — Crítico: sem isso, um passo do roteiro ou um documento obrigatório falha

#### 1.1 Responder no ponto de controle de 03/11
- **O quê:** confirmar o que você consegue entregar e devolver o que não cabe: T-05.6, T-01.5, Doc 08 e compose.
- **Por quê:** o plano já tem mitigação se a T-05.6 atrasar (a H.3 entrega 2 ou 3 indicadores e outra pessoa faz a tela), mas ela só funciona se o aviso vier até **04/11**.
- **Esforço:** nenhum código.

#### 1.2 T-05.6 — Financeiro e indicadores (passo 7)
- **Spec:** `docs/specs/SPEC-05-frontend-pms.md`, T-05.6. **Prazo proposto:** 14/11 (meta M7-b).
- **Critérios que ficam com você:**
  - **CA-05.6.b:** telas de ocupação, receita, sazonalidade e ranking;
  - **CA-05.6.c:** no desktop, gráficos; no celular, **4 números do dia em cartões**;
  - **CA-05.6.d:** relatório de cortesias e perdas. O backend já existe: `GET /analytics/internal-consumption` (T-04.7, na `develop`).
- **CA-05.6.a (registro de pagamento):** o parecer propõe que vá para o Sirlande, porque é o pagamento do check-out (passo 5) e usa as regras de conta da SPEC-04. Seu relatório de 28/10 diz que a T-05.6 espera essa decisão. **Ela não precisa esperar 03/11:** se você concordar, avise o Sirlande e ela fica fechada. E os critérios b, c e d não dependem do critério a. Dá para começar por eles de qualquer jeito.
- **Dá para começar já:** os 7 endpoints de analytics do core existem. A tela pode nascer sobre eles e trocar para o `analytics-service` quando a H.3 do Gabriel entrar. Combine com ele o formato da resposta.
- **Regras do frontend:**
  - leia `frontend/DESIGN_PMS.md` antes;
  - regenere o `api-client` (nunca edite à mão);
  - em `App.tsx` e `nav.ts`, só acrescente rotas;
  - verifique no navegador, em desktop e em 375 px.
- **Padrão para copiar:** `frontend/apps/pms/src/features/accounts/` (comanda) e a `features/reservations` da branch `feature/t052-reservas`.

#### 1.3 Passo 6 — PIX na demonstração
- **Falta testar o webhook chamado pelo próprio Asaas:** ngrok e cadastro em Integrações → Webhooks. É a pendência 1 do seu relatório de 15/10. O guia está em `docs/pagamentos/ASAAS_SANDBOX.md`.
- **Plano B:** ensaiar com o `FakePixProvider`, para a demonstração não depender da rede. Está previsto no plano (§7).
- **Decisão nova:** por onde o hóspede faz a reserva direta? O app `frontend/apps/booking` está vazio e marcado como pós-TCC. As opções são:
  - (a) uma tela mínima de reserva com o QR Code;
  - (b) chamar `POST` da reserva pública pelo Swagger durante a demonstração.

  Traga a sua proposta em 03/11.
- **Prazo proposto:** 17/11 (meta M6).

#### 1.4 Doc 08 — Planejamento de sprints
- **Por quê:** é documento oficial. O Doc 02, já entregue, diz que o acompanhamento da execução está no 08, e no repositório do professor o 08 ainda é o template. O critério 19 da conformidade está ❌.
- **O quê:** reescrever o v1.0 de 07/10 com a grade do plano de 21/10 e o registro real das sprints. Use o `git log` e os relatórios em `docs/historico_sessao/`. A seção "Conferir antes de transcrever" do `MOTIVOS.md` lista o que checar.
- **Fato a corrigir no rascunho:** ele diz "SPEC-04 inteira 🔲". Hoje T-04.1 a T-04.7 estão na `develop`, faltando só o CA-04.6.b (5º semestre).
- **Prazo do plano:** semana 3 (até 10/11).

#### 1.5 O roteiro inteiro sobe no compose (meta M8)
- **Critério de pronto:** banco vazio → `docker compose up` → seed → os 7 passos funcionam, **com o `analytics-service`** e sem passo manual.
- **Bug já mapeado** (repasse de 26/10, `docs/qa/repasses/para_weslley_26102026.md`): `./start.sh seed` procura `seed/` na raiz, mas desde 15/09 ele fica em `services/core-service/seed/`. Além disso, não aplica o `seed_consumo.sql`. Ainda está assim na `develop` de 28/10, depois do seu merge do `migrate`: veja `cmd_seed` em `start.sh:177-182`. Corrija também `scripts/infra_up.sh:98` e o `README.md` (linhas 255 e 833 em diante).
- **Divisão:** o seed é do Sirlande, a subida é sua. Combinem a ordem dos arquivos: `seed_hotels.sql` e depois `seed_consumo.sql`.
- **Prazo proposto:** 17/11 (semana 4, a "contingência" do plano).

---

### 🟡 Nível 2 — Importante: qualidade e critérios do Termo; fechar antes de 24/11

#### 2.1 T-01.5 — CI por serviço
- **Spec:** `docs/specs/SPEC-01-microsservicos.md`, T-01.5. Você é dono de `.github/workflows`.
- **Por quê:** o Termo diz que "o build e deploy dos microsserviços deve ser obrigatoriamente automatizado". O 4º semestre cobra de T-01.1 a T-01.5.
- **Para o 4º semestre:**
  - **CA-01.5.a:** workflow por serviço, disparado pelo diretório;
  - **CA-01.5.d:** testes por serviço, com falha bloqueando;
  - **CA-01.5.e:** cobertura global (critério C7), que se liga à T-06.1 do Gabriel.
- **Dá para deixar para o 5º semestre:** **CA-01.5.b/c** (registry e deploy no cluster dependem da nuvem). Confirme isso com o Gabriel.
- **Pré-requisito:** o `analytics-service` entrar na `develop` (previsto para 29/10).

#### 2.2 Painel do RabbitMQ no Grafana (CA-01.4.f, T-02.4 local)
- **Por quê:** no passo 7, é a forma de a banca ver os microsserviços conversando: profundidade da fila e atraso de consumo.
- **Estado:** o painel e os alertas foram feitos e validados em 28/10, na branch `feature/grafana-rabbitmq` (3 commits, merge limpo com a `develop`).
- **Falta:**
  - o qa-redteam e o merge (pendência 5 do seu relatório);
  - depois que o `analytics-service` entrar, conferir o **atraso de consumo** com o consumidor real. Sem consumidor, esse número não existe (CA-01.4.f).

#### 2.3 Swagger do webhook PIX
- `POST /webhooks/pix` ainda descreve só o HMAC do provedor fake (pendência 3 do seu relatório). O `api-client` e a documentação leem o Swagger como contrato.

#### 2.4 Decidir o `e2e/` com Playwright no CI
- Cada frente verifica as telas com um roteiro Playwright que fica fora do repo. Você, como dono dos workflows, decide se entra uma pasta `e2e/` rodando no CI. Traga a opinião em 03/11, mesmo que seja "não neste semestre".

---

### 🟢 Nível 3 — Pode esperar: registrar agora, fazer no 5º semestre

| # | Tarefa | Onde está | Por que pode esperar |
|---|---|---|---|
| 3.1 | Atualizar a SPEC-03: a T-03.2 ainda fala de Mercado Pago 🟡 e não registra o Asaas | `docs/specs/SPEC-03-integracoes-externas.md` | Só documentação, mas o Doc 08 e a banca leem as specs. Leva 15 minutos e pode ir junto com o 1.4 |
| 3.2 | Ressalvas 🟡 do qa-redteam do Asaas: validade de 1 ano da cobrança, 404 que pode pausar a fila, CPF malformado → 503 | Seu relatório de 15/10, pendência 2 | Precisam ser resolvidas **antes de produção**, não da demonstração |
| 3.3 | Herdadas: PIX pago em reserva cancelada só gera log; `payment-mix` soma reserva cancelada e não filtra `deleted_at`; não há job de expiração de reserva `PENDING` | Seu relatório de 15/10, pendência 5 | **Reverificar na `develop`** (não foi reverificado). Se o `payment-mix` estiver errado, ele afeta os indicadores da T-05.6 e sobe para o nível 1 |
| 3.4 | T-03.3: ADR das integrações | SPEC-03 | Confira se as 11 ADRs do PR #97 (Doc 07) já cobrem. Se cobrirem, é só marcar |
| 3.5 | 🟢 do qa-redteam do `migrate`: tag imutável fora do kind, Job sem `securityContext`, label do Job fora do `qa_checks.sh` | Seu relatório de 28/10 | Já documentado no runbook; o risco é de cluster em nuvem |
| 3.6 | Conta AWS e tamanho do nó | Plano §1 | A nuvem é do 5º semestre. Criar a conta perto dele faz os créditos durarem até a defesa |
| 3.7 | SPEC-02: Terraform, k8s na nuvem e deploy pelo CI (T-02.2, T-02.3, T-02.5) | SPEC-02 | Cortado para o 5º semestre pelo plano |
| 3.8 | Telas de B2B, configurações e fechamento de caixa (T-05.7, T-05.8, T-05.11) | SPEC-05 | Fora do roteiro, 5º semestre |
| 3.9 | Cartão de crédito | Seu relatório de 15/10 | Fora do escopo |

---

## 4. Calendário sugerido

| Semana | Datas | Foco |
|---|---|---|
| 2 | 28/10–03/11 | **1.1** (CA-05.6.a pode ser fechado antes) · qa-redteam e merge do **2.2** Grafana · começar **1.2** pelos critérios b, c e d · **1.5**, o bug do `start.sh seed`, que é pequeno |
| 3 | 04/11–10/11 | **1.2** · **1.4** Doc 08 (entrega) · **2.1** CI por serviço · **3.1** junto com o Doc 08 |
| 4 | 11/11–17/11 | Fechar **1.2** (14/11) · **1.3** webhook real e plano B · **1.5** compose com o roteiro inteiro · atraso de consumo no Grafana (2.2) |
| 5 | 18/11–24/11 | 🧊 Congelamento em 24/11 · **2.3**, **2.4** · ensaio do roteiro |
| 6–7 | 25/11–10/12 | Ensaio geral, correções, entrega |

---

## 5. Regras de toda entrega (lembrete)

- Branch `feature/*` ou `fix/*` a partir da `develop` atualizada. Merge na `develop` em PRs pequenos, e **nenhum PR parado mais de 2 dias**.
- `bash scripts/qa_checks.sh` verde, cobertura ≥ 60%, **qa-redteam** antes do merge e relatório em `docs/historico_sessao/weslley/`.
- **Frontend:** verificação no navegador, em desktop e em celular.
- **Commit e push a cada passo lógico.** Uma queda de sessão em 21/10 fez o time perder trabalho.
- **Sempre `tenant_id`** nas consultas, inclusive no `analytics-service`.

## 6. Com quem falar

| Assunto | Pessoa |
|---|---|
| H.3, formato das consultas do `analytics-service`, T-06.1 (cobertura), merge das branches | Gabriel |
| Seed do roteiro, pagamento no check-out (CA-05.6.a), relatório de consumo interno, regras de conta | Sirlande |
