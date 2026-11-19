> **Revisão simulada, não oficial.** Feita em 19/11/2026 por um subagente de IA no papel de avaliador da banca, a pedido do Gabriel. Cruza os 8 documentos oficiais (fork, sem mudança desde 11/11) com a documentação do repositório e com a `origin/develop` em `205e3f6`. Confere a situação de cada achado de 15/11 (`AVALIACAO_SIMULADA_DOCUMENTOS_15NOV2026.md`).

# Contradições e inconsistências na documentação do Gesway (19/11/2026)

**Papel:** avaliador da banca do Projeto Experimental de ADS (UniFAAT, 4º semestre). Só leitura.
**Fontes lidas:**
- Documentos oficiais no fork da UniFAAT (`main` local = `origin/main`, último merge em 11/11): Docs 01 a 08, README do grupo, fichas 01 e 02, Termo (`aceite-projeto-experimental.md`).
- Repositório do produto em `origin/develop` (`205e3f6`, 18/11): `README.md`, `CLAUDE.md`, `docs/PLANO_FECHAMENTO_MVP_15NOV2026.md`, `docs/banca/FOLHA_RESPOSTAS_BANCA.md`, `docs/roteiro/PASSO_6_RESERVA_DIRETA_PIX.md`, `frontend/e2e/README.md`, `docs/specs/README.md` e SPECs 01, 05 e 06, `docs/db/ARQ_DATABASE.md`, `docs/PRODUCT_ROADMAP.md`, `docker-compose.yml`, `.github/workflows/*`.
- Código, só para desempatar: routers e `requireRole`, `app/utils/roles.js`, `db/schema.sql`, `package.json`, `docker/prometheus/prometheus.yml`, `infra/k8s/observability.yaml`, `docker/nginx/default.conf`.

> **Atenção:** a árvore local do WSL está em `4a9ecd6` (12/11), atrás da `origin/develop` (`205e3f6`). Tudo foi lido pela `origin/develop`.

Legenda: 🔴 tiraria nota ou geraria não conformidade · 🟡 a banca perguntaria · 🟢 melhoria. **Sem.** indica de qual semestre é a correção (a correção de texto vale sempre para agora).

---

## 1. Resumo executivo

Desde 11/11 nenhum documento oficial mudou: os 8 documentos do fork são os mesmos que a avaliação de 15/11 leu. Por isso, **todo achado de 15/11 que dependia só do texto oficial continua**. O que mudou foi o código. A `develop` já entrega quase tudo o que o Doc 08 prometia para o 4º semestre, e algumas coisas a mais:

- `analytics-service` separado, com banco próprio e eventos pelo RabbitMQ (#105, 31/10; cutover #109, 09/11);
- telas dos passos 1 a 5 e 7;
- CI por serviço e e2e no CI (#176);
- PIX ensaiado no sandbox (#143).

O Doc 08 ainda diz que tudo isso está "em branch" ou "🔲". **A maior contradição hoje é entre o Doc 08 (v1.1, 29/10) e a realidade.** Ele subestima o MVP e esconde a evidência que mais pesa no C1. O antigo 🔴-6 ("microsserviços não comprovados") deixou de ser problema de código e virou problema de documento.

Os 🔴 de regra continuam sem mudança, porque o texto não mudou:

- RNF-007 contra o balcão;
- "página pública [x]";
- FKs do MER entre serviços;
- deploy fora do CI;
- observabilidade descartável;
- segredos versionados;
- fichas de encontro.

Há um 🔴 novo: o `analytics-service` não expõe `/metrics` e o Prometheus não o raspa, mas o RNF-029 diz que "todo serviço expõe `GET /metrics`". É exatamente o serviço que prova o C1, e o passo 8 vai mostrar um Grafana que não o enxerga.

Na documentação do repositório, o `README.md` raiz, o `CLAUDE.md`, o `ARQ_DATABASE.md`, o `PRODUCT_ROADMAP.md`, os status das SPECs e a folha de respostas da banca têm fatos errados que vazariam numa pergunta ao vivo.

**Contagem:** 🔴 9 · 🟡 32 · 🟢 14.

---

## 2. Tabela de achados por severidade

### 2.1 🔴

| # | Conflito | Lado A (fonte, citação curta) | Lado B (fonte, citação curta) | Quem está certo pelo código | Correção sugerida | Sem. | Situação vs 15/11 |
|---|---|---|---|---|---|---|---|
| 🔴-1 | RBAC × balcão | Doc 02 RNF-007: "criação, edição e exclusão de ... hóspedes, reservas ... exclusivas de `ADMIN`" | Doc 01 §6: "Recepcionista: Opera reservas, check-in, check-out"; Doc 08 §3, passo 2: "A recepção cria uma reserva" | **Lado B.** `reservationRouter.js:40` e `guestRouter.js:24` só exigem `ADMIN` no `DELETE`; `POST`/`PUT` ficam abertos a `RECEPTIONIST`; contratos só `sign`/`cancel`/`delete` são ADMIN | Doc 02 RNF-007: matriz papel × recurso igual ao código (ADMIN exclui, estorna, configura quartos, categorias, produtos e usuários, assina e cancela contrato; RECEPTIONIST cria e edita hóspede, reserva, pagamento e cliente corporativo e libera quarto; WAITER pela allowlist de `roles.js`) | 4º | CONTINUA |
| 🔴-2 | Página pública "implementada" | Doc 01 §5.1: "[x] Página pública de reservas por hotel"; Doc 02 RF-024: "página pública de consulta" | Doc 06 §3: "`app-booking` ... pós-TCC"; roteiro do passo 6: "pelo Swagger, sem tela: não existe app do hóspede" | **Lado B.** `frontend/apps/booking` vazio; o passo 6 é pela API | Doc 01: trocar por "[x] API pública de reserva direta" e "[ ] tela do hóspede (5º sem.)". Doc 02 RF-024: "API pública", com RF novo para a tela. Doc 06: "pós-TCC" → "fora do escopo do 4º semestre" | 4º | CONTINUA |
| 🔴-3 | Doc 08 desatualizado e agora **subestimando** o MVP | Doc 08 §1: "Estado conferido no git em 29/10"; T-01.4 "H.2 em branch"; T-05.1/T-05.2 "sem merge"; T-05.3, T-05.6, T-01.5, ROT-01 e ROT-02 "🔲"; ADRs "no PR #97, aberto"; "PR #99 (ainda aberto)"; S8 "(em curso)" | `git log origin/develop`: #97 e #99 em 29/10; H.2 #105 (31/10); T-05.1 #106; T-05.2 #108; CI por serviço e T-05.6 (31/10); Grafana RabbitMQ (30/10); T-05.3 #125, M5-b #124 e M5-c #123 (09/11); cutover #109; e2e #166/#176 | **Git.** Hoje o Doc 08 está 21 dias atrás e afirma como pendente justamente o critério C1 | Doc 08 v1.2/v1.3: registro real das S8 a S11; backlog com ✅ e evidência; M1 a M10 com situação; DOC-04 v1.4 e DOC-05 v1.3; decisões de 03/11; Weslley com entregas; SPEC-08 a SPEC-10. Repetir na S12 | 4º | CONTINUA, agravado. Absorve o antigo 🔴-6 (MUDOU: o código resolveu, o documento não) |
| 🔴-4 | MER × database per service | Doc 04 §4.13–4.17: `tenant_id` "FK → tenants ON DELETE CASCADE"; `reservation_id` "FK → reservations ON DELETE SET NULL"; diagrama `CONTRACTS \|o--o\| RESERVATIONS` | Doc 04 §7, ADR-003: "guardado como identificador, sem chave estrangeira" | **Os dois descrevem coisas diferentes.** O `schema.sql` (linhas 430–498) ainda tem as FKs, porque o B2B está no core até a T-01.6. A ADR-003 descreve o alvo | Doc 04: marcar as FKs B2B como "⚠️ até a T-01.6 (5º sem.); no alvo, identificador sem FK" e tracejar a seta do diagrama | 4º (texto) / 5º (código) | CONTINUA |
| 🔴-5 | CI/CD sem deploy por decisão | Doc 05 §3.7: "**Não faz *deploy***"; §5.1: deploy pela equipe | Termo §5: "build e deploy ... obrigatoriamente automatizado"; Doc 08 5º sem.: "T-02.5 ... deploy pelo CI"; Doc 02 RNF-022 | Hoje nenhum workflow faz deploy, o que está certo para o 4º. O problema é o **texto-alvo** do Doc 05, que declara descumprir o C6 | Doc 05 §3.7: deploy por `workflow_dispatch` (OIDC, `kubectl apply -k overlays/aws`) disparado no início da sessão, e `destroy` manual ou agendado; alinhar ADR-004 e Doc 08 | 5º (texto agora) | CONTINUA |
| 🔴-6 | Observabilidade descartável | Doc 05 §2.2: "a observabilidade ... é a primeira a sair"; ADR-004: "retirando a observabilidade do cluster" | Termo §5: "funcional e acessível no momento da defesa"; Doc 02 RNF-029 | **Termo.** É texto, não código | Doc 05 e ADR-004: ordem de corte sem Prometheus/Grafana (retenção, *limits*, RabbitMQ sem *management*, Redis fora) | 5º (texto agora) | CONTINUA |
| 🔴-7 | `analytics-service` sem métricas (**novo**) | Doc 02 RNF-029: "Todo serviço expõe `GET /metrics`"; Doc 05 §3.6: "Coleta o `/metrics` dos três serviços"; Doc 08 4º sem.: "Prometheus e Grafana no ambiente local" | `services/analytics-service/package.json` sem `prom-client`; `docker/prometheus/prometheus.yml` só tem os jobs `core-service` e `rabbitmq`; `infra/k8s/observability.yaml` também | **Código contradiz o RNF.** O serviço que prova o C1 não aparece no Grafana do passo 8 | Antes de 24/11: instrumentar o analytics (mesmo `metrics.js` do core, protegido por `METRICS_TOKEN`) e incluir o job no Prometheus e no painel. Se não der, declarar a exceção no Doc 08 | 4º | NOVO |
| 🔴-8 | Segredos versionados | ADR-006, contexto: "versionar alguns segredos por conveniência acadêmica" | Doc 02 RNF-011: "Zero segredos versionados" | **ADR-006.** `infra/k8s/secret.yaml` está no `kustomization.yaml`; o README da develop (linha 422) diz "versionado — valores acadêmicos" | Doc 02 RNF-011: exceção explícita "só `overlay/local`, valores de desenvolvimento" ou eliminar o `secret.yaml` | 4º | CONTINUA (confirmado no código) |
| 🔴-9 | Fichas de encontro (C10) | `ficha-registro-encontro02.md`: "Número do Encontro: 1", URL do PR quebrada (`pull/5` + `3`), sem assinatura | README da UniFAAT: "mínimo 4 encontros", com evolução | Ficha sem commit desde 10/09 | Corrigir a ficha 02 e criar as fichas dos encontros seguintes, com PRs e assinatura | 4º | CONTINUA |

### 2.2 🟡

| # | Conflito e fontes | Citações curtas | Quem está certo | Correção | Sem. | vs 15/11 |
|---|---|---|---|---|---|---|
| 🟡-1 | README do grupo × Doc 06 §3/§6 | "React 19" × "React 18.3" | **Doc 06.** `frontend/apps/pms/package.json`: `react ^18.3.1` | README do grupo: React 18.3 | 4º | CONTINUA |
| 🟡-2 | README do grupo × ADR-003 | "Mensageria: a definir" × RabbitMQ aceito em 14/09 | **ADR-003.** RabbitMQ no compose e no k8s | README do grupo: RabbitMQ, Asaas, k3s (alvo) e Compose (MVP) | 4º | CONTINUA |
| 🟡-3 | Doc 06 §4.1 × Doc 08 nota ² | "provedores reais Mercado Pago e Asaas" × Mercado Pago "sem a validação no *sandbox*" | **Doc 08.** O código do Mercado Pago existe; só o Asaas foi ensaiado (#143) | Doc 06: "Asaas validado no sandbox; Mercado Pago implementado, não validado" | 4º | CONTINUA |
| 🟡-4 | Doc 01 §5.2 × Doc 08 §3.2 | "governança e camareira" fora do escopo × "frontend restante: ... governança" | Doc 01 | Tirar "governança" do Doc 08 | 4º | CONTINUA |
| 🟡-5 | Doc 08 × Doc 02 | SPEC-07 "tarifas por período" e "busca global" sem RF | — | RF novo ou remover do plano | 4º | CONTINUA |
| 🟡-6 | Doc 02 RF-007 × CLAUDE.md × README da develop | RF só lista os status do quarto. CLAUDE.md: "`PUT /rooms/:id/release`" e `CLEANING → MAINTENANCE`. README: "CLEANING ──► AVAILABLE ... via PUT /rooms/:id" | **CLAUDE.md.** `roomRouter.js:32`, `release` com `ADMIN` e `RECEPTIONIST` | Doc 02: RF da máquina de estados do quarto; README: rota correta | 4º | CONTINUA, agravado (a regra existe no código e falta no requisito) |
| 🟡-7 | RF-026 × Doc 04 §4.6/4.8 | Reserva direta nasce `PENDING` sem expirar; *rate limit* só no login | **Confirmado no código.** Roteiro do passo 6: "Ainda não há job que expire"; nginx só tem `login_limit` | Declarar o limite no Doc 02 e no Doc 08, ou criar a expiração e o `limit_req` em `/public/` | 5º (texto agora) | CONTINUA |
| 🟡-8 | Doc 01 §4 × Doc 04 | "Redução de *no-show*" × nenhum status `NO_SHOW` | Doc 04 (o código também não tem) | Declarar o limite | 4º | CONTINUA |
| 🟡-9 | RF-039 × RF-027/RF-011 | "confirmadas ... sem pagamento" × `CONFIRMED` só nasce do PIX pago | Não reverificado no código | Rever a regra do alerta | 4º | CONTINUA |
| 🟡-10 | Doc 03 F-016 / ADR-003 × RF-052 | Eventos sem conta e item × "relatório de cortesias e perdas" | Pelo código, o relatório de consumo interno fica no core (`/analytics/internal-consumption`, só ADMIN, nginx `location =`) | Doc 03/06: registrar que esse relatório é do core | 4º | CONTINUA (código esclarece) |
| 🟡-11 | Doc 04 §7.1 | D-003 sem dicionário das projeções | — | Dicionário das projeções | 4º | CONTINUA |
| 🟡-12 | Doc 04 §4.8 × RF-014/RF-015 | "CHECK >= 0" × "`amount > 0`"; "ON DELETE CASCADE" × "nunca é apagado" | **Os dois.** O `schema.sql:218` tem `CHECK (amount >= 0)` e a aplicação valida `> 0` | Doc 04: explicar as duas camadas e justificar o CASCADE | 4º | CONTINUA |
| 🟡-13 | RF-055/Doc 06 §4.3 × T-06.11 ✂️ | "eliminação a pedido do titular" × tarefa cortada | Doc 08 | Declarar o limite do 4º semestre | 4º | CONTINUA |
| 🟡-14 | Doc 02 §1 (Alta = núcleo) × Doc 08 | RF-055 **Alta** cortado para o 5º | — | Rebaixar a prioridade com justificativa | 4º | CONTINUA |
| 🟡-15 | RF-010 a 012 | Sem RF de tarifação no servidor nem de ocupantes | Não reverificado | RF de tarifação | 4º | CONTINUA |
| 🟡-16 | Doc 04 `source` × Doc 01 §2.1 | `MANUAL/DIRECT/B2B` × "qual canal ... gera mais receita" | — | `channel` ou rever a promessa | 5º | CONTINUA |
| 🟡-17 | Termo §5 × RNF-015 × DoD × Doc 08 §8 | "global" × "cobertura do core ≥ 60%" × "≥ 60% de linhas" | **Código:** limiares 60/60/60/55 no core e no analytics, por serviço; frontend sem portão; nenhum número oficial (folha: "Conferir o número no CI") | Uma definição única e o número de 01/12 no Doc 08 | 4º (número) / 5º (global) | CONTINUA |
| 🟡-18 | Doc 06 §3 × Doc 05 §2 | Prometheus e Grafana fora do C4 Nível 2 | Compose e k8s têm os dois | Incluir no Nível 2 | 4º | CONTINUA |
| 🟡-19 | Doc 05 §3.2 × Doc 01 (SaaS) | "dados são efêmeros" | — | Declarar ambiente de demonstração | 5º | CONTINUA |
| 🟡-20 | Doc 05 §5.1 × Termo §4 | Etapas manuais (SQL, `kubectl`, URL do webhook) | — | Automatizar | 5º | CONTINUA |
| 🟡-21 | Doc 08 roteiro × Doc 05 §4.3 | Webhook no localhost | **Repositório resolve:** ngrok no `PASSO_6...md` e ensaio de 12/11 (#143). Os documentos oficiais não citam | Doc 08: plano A (ngrok) e plano B (simulado) | 4º | MUDOU (resolvido no repositório, não nos documentos) |
| 🟡-22 | Doc 05 §2.2 | Folga de "cerca de 125 MiB" | — | Medir no 1º `apply` | 5º | CONTINUA |
| 🟡-23 | Doc 08 §5 (S7) | "Trilha do Weslley: sem entrega na `develop`" | **Git:** 89 commits do Weslley desde 28/10 (Grafana RabbitMQ 30/10, CI por serviço 31/10, MinIO e e2e no CI 16–18/11) | Doc 08: registrar as entregas por trilha; cada um prepara a sua parte | 4º | MUDOU (o fato mudou, o documento não) |
| 🟡-24 | Datas das ADRs (13/05 a 07/08) × início em 09/09; PRs #97/#99 | "ADR-001 ... 13/05/2026" | PRs #97 e #99 **mergeados em 29/10**. Falta explicar a origem das datas | Doc 07 §5: um parágrafo sobre o projeto anterior (`sistema_hotel_prova`) | 4º | PARCIAL (PRs resolvidos; datas não) |
| 🟡-25 | Doc 08 §3.2 ("MVP ... rodando no Docker Compose") × README da develop (**novo**) | "rodando no Docker Compose" × "O compose sobe só o backend ... não há `Dockerfile` em `frontend/`" | **README.** O `app-pms` roda pelo `pnpm dev` (Vite), fora de contêiner. O Termo §8 pede "arquivos de containerização atualizados" para a contingência | Doc 08: dizer que o frontend roda pelo Vite, ou containerizar o `app-pms` (nginx servindo o *build*) antes de 24/11 | 4º | NOVO |
| 🟡-26 | Folha de respostas da banca × código (**novo**) | "ViaCEP ... (`GET /addresses/:cep`)"; webhook "exige ... `PIX_WEBHOOK_SECRET`"; "Três workflows" | Código: `router.use('/address', ...)`; o Asaas autentica pelo `ASAAS_WEBHOOK_TOKEN` (`asaas-access-token`), e o `PIX_WEBHOOK_SECRET` é só do simulado; há 5 workflows (`ci`, `ci-core-service`, `ci-analytics-service`, `ci-frontend`, `ci-e2e`) | `docs/banca/FOLHA_RESPOSTAS_BANCA.md`: corrigir os três pontos | 4º | NOVO |
| 🟡-27 | Doc 08 4º sem. ("CI por serviço (T-01.5)") e RNF-022 × workflows (**novo**) | RNF-022: "Imagem publicada automaticamente no registry"; SPEC-01 CA-01.5.b "publicação em *registry*" | Nenhum workflow faz *push* de imagem (o e2e compila o MinIO com `push: false`) | Doc 08: T-01.5 = CA-01.5.a e d atendidos, b e e no 5º semestre; ou *build*/*push* para o GHCR | 4º (texto) | NOVO |

**Documentação do repositório que vazaria para a banca** (🟡, novos, R-1 a R-5, somados à contagem):

| # | Onde | Contradição | Correção |
|---|---|---|---|
| R-1 🟡 | `README.md` raiz (develop) | "Estrutura do banco — 8 tabelas" (o schema tem 17 + OUTBOX); `users` "ADMIN ou RECEPTIONIST" (falta WAITER); token de exemplo `eyJhbGciOiJIUzI1NiIs...` (HS256, contra o RS256 da ADR-006); `DELETE /payments/:id` "Remove pagamento" (responde 405); reserva sem walk-in; quarto liberado "via PUT /rooms/:id"; estrutura sem `analytics-service`; "Test Files 7 passed / 84"; `CARTAO` (a allowlist é `CARTAO_CREDITO`/`CARTAO_DEBITO`); links para `justificativa/`, `modelagem/` e `queries/`, que foram para `docs/legado/` (quebrados); "Projeto Acadêmico (TCC)" | Reescrever as Partes 3 e 4 ou apontar para o Doc 04 e o Swagger. O Doc 04 §10.1 já admite o "8 tabelas"; corrigir na origem |
| R-2 🟡 | `CLAUDE.md` (develop) | "Docker Swarm (staging)" (a ADR-005 rejeitou o Swarm); "analytics-service → nasce na T-01.4" (já existe); "SPEC-01 a SPEC-07" (há 10); "Fase atual: CorePMS" | Atualizar o Quick Reference |
| R-3 🟡 | `docs/db/ARQ_DATABASE.md` e `docs/PRODUCT_ROADMAP.md` (ambos citados no CLAUDE.md como referência) | "8 tabelas", role "ADMIN ou RECEPTIONIST"; roadmap "Demo → TCC → Mercado", com o frontend React só na Fase 3 "pós-TCC" | Marcar como legado (mover para `docs/legado/`) ou atualizar; o Doc 04 prevalece |
| R-4 🟡 | `docs/specs/README.md` e as SPECs | SPEC-03 "🔲" (entregue); SPEC-01 "só T-01.1 ✅" e CA-01.5.a–e todos `[ ]`; SPEC-05 T-05.6 "🔲" (merge em 31/10); SPEC-06 "🔲"; SPEC-08 "🔲" (#159 a #162 entregues) | O Doc 08 usa as SPECs como critério de conclusão: atualizar os status antes do Doc 08 v1.3 |
| R-5 🟡 | `docs/roteiro/PASSO_6_RESERVA_DIRETA_PIX.md` | "Ensaio no compose ainda não feito" (feito em 12/11, #143); "A atual vence em **15/11/2026**" (vencida); "pelo Swagger" × plano de 15/11: "pela API, com o QR" | Atualizar com o ensaio, a nova validade da chave e a forma decidida |

> **Contagem de 🟡:** 27 na tabela (🟡-1 a 🟡-24 de 15/11, dos quais 🟡-21 e 🟡-23 mudaram e 🟡-24 é parcial, mais 3 novos) + 5 do repositório (R-1 a R-5). Total: **32**.

### 2.3 🟢

1. **Histórico de revisões:** o Doc 02 tem 11 linhas "1.4" e o Doc 06 tem 6 linhas "1.2". Consolidar uma linha por versão. *(CONTINUA)*
2. "Decisões que serão registradas no Documento 07" (Doc 05 §1, Doc 06 §1): o Doc 07 já existe. *(CONTINUA)*
3. RN-001, RN-002 e RN-004 inexistentes; RN-003 citado sem tabela. *(CONTINUA)*
4. Nomenclatura PT/EN no B2B. *(CONTINUA)*
5. "pós-TCC" (Doc 06 §3, ADR-011, README raiz, ROADMAP): usar "fora do escopo do Projeto Experimental / 5º semestre". *(CONTINUA)*
6. Doc 01 §6: orientador "Prof. Alexandre Tavares / Profa. Katia", que é a coordenação. *(CONTINUA)*
7. Redis no compose (`redis:7-alpine`) e no `kustomization.yaml` sem uso. *(CONTINUA)*
8. RF-016/RF-017 sobre `consumptions` legado. *(CONTINUA)*
9. Faltam ADRs de CI/CD, observabilidade e testes. *(CONTINUA)*
10. Versões cruzadas: os Docs 01, 02, 06 e 07 citam "Documento 05 v1.2"; o oficial é a v1.3, e a v1.4 (calculadora, #146 na develop) está só na branch `origin/docs/doc05-calculadora-aws` do fork, sem merge. *(NOVO)*
11. Doc 08 §3.2 e §10: "free-tier ou créditos", termo que o Doc 02 v1.4 trocou por "plano de créditos". *(NOVO)*
12. RF-043/§2.7: indicadores "restritos a ADMIN e RECEPTIONIST", mas `top-guests` é só ADMIN (`analytics-service/routes/router.js:68`). Anotar como decisão de LGPD. *(NOVO)*
13. Doc 01 §5.1: "[ ] Interface web responsiva", "[ ] PIX integrado" e "[ ] ViaCEP" já estão entregues; as marcações congeladas em 23/08 confundem a banca. *(NOVO)*
14. `PLANO_FECHAMENTO_MVP_15NOV2026.md`: "🔴 em aberto: a imagem do MinIO" (resolvido no #176), seed do k8s (resolvido no #177) e "roteiro no CI" (feito); Doc 05 §1 cita "minikube" e a ADR-005 cita k3s. Atualizar o plano. *(NOVO)*

---

## 3. Achados de 15/11: situação

| 15/11 | Situação em 19/11 | Observação |
|---|---|---|
| 🔴-1 CI/CD sem deploy | CONTINUA (🔴-5) | Texto do Doc 05 sem mudança |
| 🔴-2 RNF-007 | CONTINUA (🔴-1) | Confirmado no código: recepção cria reserva e hóspede |
| 🔴-3 Página pública | CONTINUA (🔴-2) | |
| 🔴-4 FKs do MER | CONTINUA (🔴-4) | `schema.sql` mantém as FKs B2B |
| 🔴-5 Observabilidade descartável | CONTINUA (🔴-6) | |
| 🔴-6 Microsserviços não comprovados | **MUDOU** | Resolvido no código (#105, #109, compose com `analytics-postgres`); falta evidência no Doc 08 → incorporado ao 🔴-3 |
| 🔴-7 Doc 08 desatualizado | CONTINUA, agravado (🔴-3) | Agora subestima o MVP |
| 🔴-8 Fichas | CONTINUA (🔴-9) | |
| 🔴-9 Segredos versionados | CONTINUA (🔴-8) | |
| 🟡-1 a 🟡-20 e 🟡-22 | CONTINUAM | Texto oficial sem mudança; 🟡-6 agravado; 🟡-10 com esclarecimento do código |
| 🟡-21 Webhook no localhost | **MUDOU** | Resolvido no repositório (ngrok, ensaio de 12/11); falta nos documentos oficiais |
| 🟡-23 Trilha do Weslley | **MUDOU** | Há entregas; o Doc 08 ainda diz que não |
| 🟡-24 ADRs e PRs abertos | **PARCIAL** | #97 e #99 mergeados em 29/10; as datas continuam sem explicação |
| 🟢-1 a 🟢-12 | CONTINUAM | 🟢-13 (teste de carga) também continua; fica fora da lista acima por já estar registrado |

**Itens de contexto de 16 a 18/11 conferidos:**

- MinIO compilado do fonte e e2e no CI (#176, 18/11): ✅ (`docker/minio`, `ci-e2e.yml`, que não bloqueia o merge).
- Seed do dia no k8s (#177): ✅.
- Comanda com quantidade e pagamento (#182, #183): ✅ no frontend. É pagamento dividido **por valor** na mesa e no *day-use*, que não é a conta dividida do RF-021 (CA-04.6.b continua ✂️). Não confundir na defesa.
- SPEC-10, login (#181): ✅.
- 404 para id inválido (#172) e hóspede com estadia ativa não se exclui (#173): ✅. Nenhum documento oficial cita os dois; pode entrar como critério nos RF-009 e RF-012 (🟢).

---

## 4. Promessa do Doc 08 (4º semestre) × o que a develop entrega

| Promessa (Doc 08 §3.2 e §5) | Develop em 18/11 | Leitura |
|---|---|---|
| core + analytics em processos e bancos separados, RabbitMQ com *outbox* | ✅ #105 (31/10), cutover #109 (09/11), `analytics-postgres` no compose e `analytics.yaml` no k8s | Doc 08 **subestima** (diz "em branch") |
| Roteiro de 7 passos no Compose | ✅ passos 1 a 5 e 7 com tela; passo 6 pela API; `pnpm e2e` no CI (#176); 1º ensaio em 14/11 | Subestima. Mas o frontend roda fora do Compose (🟡-25) |
| ViaCEP e PIX Asaas no sandbox | ✅ (#143, ensaio de 12/11) | Ok |
| Prometheus e Grafana locais | 🟡 Só o core e o RabbitMQ; o analytics não tem métricas; *profile* "opcional" | **Superestima** (🔴-7) |
| CI por serviço (T-01.5) | 🟡 core, analytics, frontend e e2e ✅; *build*/*push* de imagem ❌; cobertura global ❌ | Subestima em parte e superestima em parte (🟡-27) |
| T-05.6 financeiro e indicadores | Indicadores ✅ (31/10); tela "Financeiro" fora do MVP (plano de 15/11) | Ajustar o texto |
| T-06.12 (dado pessoal fora do log), P1 na S9 | 🔲 na SPEC-06 | **Superestima**: fazer até 24/11 ou mover para o 5º |
| T-06.1 cobertura "conforme o Termo" (S11) | 🔲. Core ~85% de statements (relatório de 04/11), por serviço | Registrar o número e a definição |
| Fora do Doc 08, mas entregue | SPEC-08, 09 e 10; janela do check-in (#147); liberação do quarto `/release`; pagamento dividido na comanda; MinIO do fonte | **Subestima**: registrar |

---

## 5. Correções priorizadas por documento (cabem antes de 10/12)

Ordem: o que muda nota primeiro. Os documentos oficiais estão congelados desde 11/11, então cada correção vira PR no `main` do fork e só depois PR ao professor, com autorização.

**Doc 08 (Weslley, com apoio do Gabriel). Prioridade 1**
1. v1.3: registro real das S8 a S11 com PR e commit (lista da §4 acima), M1 a M10 com situação, decisões de 03/11 e 15/11, entregas do Weslley, SPEC-08 a SPEC-10, passo 8 do Grafana.
2. DOC-01 a DOC-08 com as versões vigentes (Doc 04 v1.4, Doc 05 v1.3 ou v1.4).
3. T-01.5: separar CA-01.5.a/d (✅) de b/e (5º). T-06.12 e T-06.1: situação real.
4. Plano A/B do passo 6 (ngrok × simulado); frontend pelo Vite (ou containerizado).
5. Tirar "governança"; trocar "free-tier" por "plano de créditos".

**Doc 02 (Gabriel)**
1. RNF-007 com a matriz papel × recurso igual ao código. 🔴
2. RF-024 como "API pública" e RF novo para a tela do hóspede (5º). 🔴
3. RNF-011 com a exceção do `overlay/local`. 🔴
4. RF da máquina de estados do quarto (`/release`, `CLEANING → MAINTENANCE`).
5. RNF-015 com a definição única de cobertura; RNF-022 e RNF-029 coerentes com o que o 4º semestre entrega.
6. Prioridade do RF-055 justificada; consolidar o histórico da v1.4.

**Doc 01 (Gabriel)**
1. §5.1: "[x] API pública de reserva direta" e "[ ] tela do hóspede"; atualizar as marcações ou remover a legenda de "implementado". 🔴
2. §4 *no-show*: declarar o limite. §6: orientador.

**Doc 04 (Sirlande)**
1. FKs B2B como "em transição até a T-01.6"; seta tracejada. 🔴
2. `amount` com as duas camadas; dicionário das projeções do D-003; tabela de RNs.

**Doc 05 (Gabriel)**
1. §2.2 e §3.6: observabilidade nunca sai (nova ordem de corte). 🔴
2. §3.7: deploy por `workflow_dispatch` com OIDC. 🔴
3. Merge da v1.4 (calculadora) no `main` do fork; "minikube" → como o time roda hoje.

**Doc 06 (Gabriel)**
1. Prometheus e Grafana no Nível 2; Mercado Pago "não validado"; "pós-TCC" → "5º semestre"; remover a frase "serão registradas no Documento 07".

**Doc 07 (Gabriel)**
1. ADR-006 coerente com o RNF-011; ADR-004 sem "retirando a observabilidade".
2. §5: parágrafo sobre a origem das ADRs anteriores a 09/09.

**Doc 03 (Sirlande)**
1. Nota de que o relatório de consumo interno (cortesias e perdas) fica no core.

**README do grupo (Gabriel)**
1. React 18.3; RabbitMQ; Asaas; Compose no MVP.

**Fichas de encontro (Gabriel, PO). Prioridade 1 para o C10**
1. Ficha 02 corrigida e fichas dos encontros 3 em diante, com PRs e assinatura.

**Código (antes do congelamento de 24/11, pequeno, impacto no C8 e no C1)**
1. `prom-client` e `/metrics` no `analytics-service`, com o job no Prometheus (compose e k8s) e no painel. 🔴-7

**Repositório do produto (vaza na demonstração)**
1. `FOLHA_RESPOSTAS_BANCA.md`: `/address/:cep`, `ASAAS_WEBHOOK_TOKEN`, 5 workflows.
2. `PASSO_6_RESERVA_DIRETA_PIX.md`: ensaio feito, validade da chave.
3. `README.md` raiz: Partes 3 e 4; links de `docs/legado/`.
4. `CLAUDE.md`, `ARQ_DATABASE.md` e `PRODUCT_ROADMAP.md`: atualizar ou marcar como legado.
5. Status das SPECs e do `docs/specs/README.md`; `PLANO_FECHAMENTO` com a situação de 18/11.

---

## 6. O que NÃO deve ser mexido

- **A ADR-003 e o recorte por consistência transacional.** É o ponto mais forte da documentação; a contradição está no Doc 04, não na ADR.
- **A natureza normativa do Doc 02 e do Doc 06** (sem coluna de status). Corrija as regras, não acrescente status; o estado fica no Doc 08.
- **A nuvem, o Terraform e a cobertura global no 5º semestre** (Termo §7). Não antecipar implementação; só alinhar o texto-alvo (🔴-5, 🔴-6).
- **A máquina de estados da reserva com o walk-in.** Docs 01, 02 e 06, CLAUDE.md e o código estão coerentes.
- **O Doc 05 §6 (custo).** Só fazer o merge da v1.4; não reabrir a decisão do `t3.small`.
- **A numeração de RF/RNF/ADR.** Não renumerar (o Doc 04 referencia); acrescentar sempre com o próximo número livre.
- **Os critérios de pagamento já alinhados ao código** (estorno `VOIDED`, allowlist de `method`, webhook por token do Asaas). Doc 02, Doc 06 e código batem.
- **O código congelado depois de 24/11**, salvo a correção do 🔴-7 se entrar antes.
