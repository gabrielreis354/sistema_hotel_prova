# Passo 8 do roteiro — monitoramento no Grafana (30 s)

> Roteiro de demonstração do `docs/PLANO_FECHAMENTO_MVP_15NOV2026.md` (R2 e R3): depois dos 7
> passos, 30 segundos no Grafana mostram que os dois serviços estão no ar, que os eventos do core
> chegaram ao analytics pelo RabbitMQ e que nada foi para a fila de mensagens mortas. Fecha com uma
> execução verde do GitHub Actions.
> Critérios da banca: monitoramento (C8) e microsserviços (C1). Requisito: RNF-029 do Doc 02
> ("todo serviço expõe `GET /metrics`").
> Dono: Weslley. Versão de 20/11/2026.

**O que a banca precisa ver:** o painel lê dados reais da demonstração que acabou de acontecer.
Os check-ins e pagamentos dos passos anteriores aparecem como requisições no core e como eventos
aplicados no analytics. Ninguém precisa abrir terminal.

## Antes da demonstração

Na raiz do repositório, com o compose do passo 6 já configurado:

1. **`.env`:** além das variáveis do passo 6, defina as duas da observabilidade. O compose recusa
   subir o Prometheus e o Grafana sem elas.
   ```bash
   METRICS_TOKEN=<openssl rand -hex 32>
   GRAFANA_ADMIN_PASSWORD=<senha forte>
   ```
   O mesmo `METRICS_TOKEN` vai para o backend, o analytics e o Prometheus. Sem ele os serviços
   sobem normalmente, e só o `/metrics` responde 503.
2. **Subir tudo junto, desde o começo do ensaio:**
   ```bash
   docker compose --profile observability up -d
   ```
   Suba com o profile **antes do passo 1**. Assim o painel tem os dados dos 7 passos quando chegar a
   hora. O Prometheus guarda 2 dias (`--storage.tsdb.retention.time=2d`).
3. **Abrir as abas** (`docs/banca/FOLHA_RESPOSTAS_BANCA.md`, checklist):
   - Grafana: `http://localhost:3002`, login `admin` + `GRAFANA_ADMIN_PASSWORD`, pasta **Gesway** →
     **Saúde do core e do analytics**. Intervalo de tempo: **Last 1 hour**.
   - Na mesma pasta, em outra aba: **Mensageria (RabbitMQ)**.
   - GitHub Actions: a execução verde (ver "Qual execução do Actions abrir").
4. **Conferir os três "no ar".** No painel, **Backend no ar** e **Analytics no ar** = 1. No painel
   do RabbitMQ, **Broker no ar** = 1. Se algum estiver 0, veja "Se algo der errado".

## Durante a demonstração (30 s)

| Tempo | Onde | O que mostrar | O que dizer |
|---|---|---|---|
| 0–8 s | Saúde do core e do analytics, linha de cima | **Backend no ar** = 1, **Requisições por segundo**, **Taxa de erro 5xx** | "O core, que atende a recepção, está no ar. As requisições são as dos passos que acabamos de fazer, e a taxa de erro está em zero." |
| 8–18 s | Mesma tela, linha **analytics-service** (role a página) | **Analytics no ar** = 1, **Eventos aplicados (última hora)** e o gráfico **Eventos do core por resultado** | "O analytics é outro serviço, com banco próprio. Cada check-in e pagamento virou um evento no RabbitMQ, e ele aplicou esses eventos. Esse número subiu durante a demonstração." |
| 18–25 s | Aba **Mensageria (RabbitMQ)** | **Mensagens mortas (DLQ)** = 0, **Consumidores do analytics** ≥ 1 | "Nenhum evento se perdeu: a fila de mensagens mortas está vazia." |
| 25–30 s | Aba do GitHub Actions | A execução verde | "Cada push roda os testes do core, do analytics e do frontend, e o roteiro e2e." |

Se houver tempo para uma pergunta, **Requisições por hotel (tenant)** mostra o isolamento
multi-tenant nas métricas.

## Qual execução do Actions abrir

Abra o workflow **CI** filtrado pela `develop`:
`https://github.com/gabrielreis354/sistema_hotel_prova/actions/workflows/ci.yml?query=branch%3Adevelop`

Escolha a execução verde mais recente **depois do merge do `/metrics` do analytics** (PR deste
passo). Ela mostra os jobs do `ci.yml` e, na mesma lista de Actions, os workflows por serviço
(`CI — core-service`, `CI — analytics-service`, `CI — frontend` e `CI — roteiro e2e`), que só rodam
quando o diretório do serviço muda. Na véspera do ensaio, anote o número da execução escolhida
aqui:

| Data | Execução | Commit | Workflows verdes |
|---|---|---|---|
| 20/11 (**provisória**, do PR #193, antes do merge) | [CI 44814903344](https://github.com/gabrielreis354/sistema_hotel_prova/actions/runs/44814903344) · [analytics](https://github.com/gabrielreis354/sistema_hotel_prova/actions/runs/44814903288) · [core](https://github.com/gabrielreis354/sistema_hotel_prova/actions/runs/44814903175) · [e2e](https://github.com/gabrielreis354/sistema_hotel_prova/actions/runs/44814903276) | `d66b8f6` | CI, CI — analytics-service, CI — core-service, CI — roteiro e2e |
| _depois do merge do #193: trocar pela execução da `develop`_ | | | |

Não deixe para escolher na hora: um push novo pode estar rodando e mostrar a bolinha amarela.

## Se algo der errado

| Sintoma | Causa provável | O que fazer |
|---|---|---|
| Prometheus ou Grafana não sobem | falta `METRICS_TOKEN` ou `GRAFANA_ADMIN_PASSWORD` no `.env` | `docker compose logs prometheus grafana` mostra qual falta |
| **Backend no ar** ou **Analytics no ar** = 0 | serviço fora, ou token diferente entre o serviço e o Prometheus | `docker compose ps`; depois `docker compose --profile observability up -d` para todos relerem o `.env` (o Prometheus só grava o token quando sobe) |
| Painel vazio ("No data") | o profile subiu depois dos passos, ou o intervalo está curto | aumente o intervalo para **Last 3 hours**; sem dados, mostre só os três "no ar" e a DLQ |
| **Eventos aplicados** = 0 | consumidor do analytics sem broker | painel do RabbitMQ: **Consumidores do analytics**. Se for 0, `docker compose restart analytics-service` |
| Grafana não abre | porta 3002 ocupada | `GRAFANA_HOST_PORT` no `.env` |
| Título "Backend **sem** ar" ou unidade "requisito/s" | tradutor automático do Edge: o Grafana declara a página em inglês (`lang="en-US"`), e o Edge traduz "no ar" como o "no" do inglês | desde 20/11 o compose e o k8s sobem o Grafana com `GF_USERS_DEFAULT_LANGUAGE=pt-BR`, e a página se declara em português. Se ainda aparecer, escolha **Nunca traduzir este site** no ícone de tradução da barra de endereço |
| Painéis em "Carregando o painel de plugin…", URL com `chunkNotFound`, ou log `lstat /var/lib/grafana/dashboards/gesway-dashboard.json: no such file or directory` | troca de branch (`git checkout`) com o Grafana rodando: o arquivo do painel é montado do repositório e a montagem se perde | `docker compose restart grafana` e recarregar a página. No dia, não troque de branch depois de subir o compose |

**Plano B (Grafana não sobe de jeito nenhum):** mostrar o texto do `/metrics` do analytics pelo
terminal, de dentro da rede do compose:
```bash
docker compose exec analytics-service sh -c \
  'wget -qO- --header "Authorization: Bearer $METRICS_TOKEN" http://localhost:3001/metrics' \
  | grep analytics_events_total
```
A linha `analytics_events_total{outcome="applied"}` com um número maior que zero prova o mesmo
fluxo do painel.

## O que existe por trás

- `GET /metrics` no core (T-02.4) e no analytics (RNF-029), com `prom-client`, protegidos por
  `METRICS_TOKEN`. O nginx não leva `/metrics` para fora (404).
- `analytics_events_total{outcome}`: eventos tratados pelo consumidor do analytics (`applied`,
  `duplicate`, `stale`, `retry`, `dead_letter`).
- Prometheus: `docker/prometheus/prometheus.yml` (compose) e `infra/k8s/observability.yaml` (k8s),
  jobs `core-service`, `analytics-service` e `rabbitmq`.
- Painéis: `infra/k8s/observability/gesway-dashboard.json` e `rabbitmq-dashboard.json`, os mesmos
  no compose e no k8s.
- Alerta de mensagens mortas e de broker sem coleta: `infra/k8s/observability/grafana-alerting.yml`.

## Pendências conhecidas

- No k8s, o acesso ao Grafana é por `kubectl -n hotel-system port-forward svc/grafana 3002:3000`.
  A demonstração do 4º semestre é no compose.
- Ainda não há alerta de "analytics sem coleta". Hoje só o broker tem esse alerta.
