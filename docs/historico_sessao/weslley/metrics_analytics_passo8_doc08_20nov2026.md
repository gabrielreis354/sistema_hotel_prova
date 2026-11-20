# Sessão de 20/11/2026 — `/metrics` do analytics, passo 8 no Grafana e Doc 08 v1.3

**Dev:** Weslley (com Claude Code) · **Pedido:** os três itens do caminho crítico até o congelamento de 24/11 (revisão de 19/11), mais a confirmação da chave do Asaas.

## Entregue

| Item | Onde | Situação |
|---|---|---|
| 1. `/metrics` no `analytics-service` (RNF-029, 🔴-7) | PR #193, branch `feature/analytics-metrics` | Aberto para a `develop`, CI rodando |
| 2. Passo 8 no roteiro | `docs/roteiro/PASSO_8_GRAFANA.md`, no PR #193 | Aberto |
| 3. Doc 08 v1.3 | PR #11 do fork (`docs/doc08-v1.3`); a v1.2 subiu na `entrega-8-sprints` | Aberto para a `main` do fork |
| Chave do Asaas | `PASSO_6_RESERVA_DIRETA_PIX.md` | Trocada em 16/11, vale até 31/07/2027; primeiro ensaio com ela em 24/11 |
| Rótulo `CARTAO` nos Indicadores (🟡 5 do estado de 19/11) | PR #194, `fix/rotulo-cartao-indicadores` | Aberto, CI verde |
| Sazonalidade com os meses vazios | PR #195, `fix/sazonalidade-meses-vazios` | Aberto, CI verde |
| Limpeza | PR #129 fechado (rascunho do Doc 08 e red team de 21/09, superados pela v1.3); cópias locais apagadas | Feito; a branch `docs/registros-21set` ficou no remoto |

## Item 1 em detalhe

- `prom-client` no analytics, com o mesmo desenho do core: `app/utils/metrics.js`, `middlewares/metrics.middleware.js`, `app/Controllers/MetricsApi/GetMetricsController.js` e o Router `caseSensitive`/`strict`.
- Novo: `analytics_events_total{outcome}` no consumidor, com as séries nascendo em 0.
- Prometheus do compose e do k8s, `METRICS_TOKEN` no analytics, NetworkPolicy e painel do Grafana (os painéis do core passam a filtrar `job="core-service"`).
- TDD: RED em `c707100`; 190 testes verdes no analytics.
- Conferido no compose com `--profile observability`: alvos up, 401 sem token, 404 pelo nginx, eventos do outbox aplicados e painéis com dados.
- Achado no teste ao vivo: sem as séries em 0, o painel "Eventos aplicados" mostrava 0 com 196 eventos (`increase()` não enxerga a série nascendo). Corrigido em `54a2bad`.
- qa-redteam: APROVADO COM RESSALVAS; 🟡-1 e 🟡-2 corrigidas (`0b8d133`). `/security-review`: sem achados.

## Indicadores (passo 7): #194 e #195

- **#194:** o seed grava o meio antigo `'CARTAO'`, e "Meios de pagamento" mostrava o código cru. Agora aparece "Cartão", o mesmo rótulo da conta da reserva. TDD; 30 testes verdes.
- **#195:** a branch `fix/sazonalidade-meses-vazios` estava **só local**. O `35fe391` criava o `fillSeasonality`, mas a tela **não usava** a função, então o eixo seguia pulando meses. A ligação está no `7ca13fa`.
- O qa-redteam (`docs/qa/redteam_indicadores-cartao-sazonalidade_20nov2026.md`) achou uma regressão: o estado vazio nunca aparecia. Corrigida no `e137cba`, junto com "1 reserva" e "—". 36 testes verdes; `tsc` limpo.
- O rótulo do meio de pagamento está repetido em `shares.ts`, `reservationLogic.ts` e `paymentLogic.ts`. Juntar num mapa só fica para depois do congelamento.

## Fim da tarde: painéis, `.env` e ensaio do plano B

- Prints no Edge: o tradutor automático trocava "No ar" por "Sem ar", porque o Grafana se declarava `lang="en-US"`. Agora o Grafana sobe em pt-BR (`GF_USERS_DEFAULT_LANGUAGE`, compose e k8s, `6a2bed6`).
- Painéis do core sem o `/health` do healthcheck, e p95 sem tráfego mostrando 0 em vez de NaN (`d66b8f6`). Conferido no Edge: core, analytics e RabbitMQ aparecem no Grafana.
- `.env` da raiz: `METRICS_TOKEN` e `GRAFANA_ADMIN_PASSWORD` acrescentados ao fim do arquivo, sem ler o resto. Senha do admin do Grafana resetada no volume (`grafana cli admin reset-admin-password`), porque a variável só vale na primeira subida.
- `PASSO_8_GRAFANA.md`: execução provisória do Actions do PR #193 (`d66b8f6`, CI 44814903344). Trocar pela da `develop` depois do merge.
- Plano B do passo 6 ensaiado no compose: os 6 passos deram certo, e o evento chegou ao analytics (registro no `PASSO_6_RESERVA_DIRETA_PIX.md`). O plano A segue para 24/11: precisa da chave do Asaas no `.env`, do túnel autorizado e do webhook cadastrado no painel.

## Armadilhas do ambiente

- O `docker compose build` falhou duas vezes no credential helper do Docker Desktop pelo WSL (`error getting credentials`). Contorno: `DOCKER_CONFIG` temporário com `{}` (imagens públicas).
- O primeiro `up` que falhou deixou o contêiner do RabbitMQ **sem rede** (`no such host`). Contorno: `docker compose up -d --force-recreate rabbitmq rabbitmq-setup`.
- O `.env` da raiz não tinha `METRICS_TOKEN` nem `GRAFANA_ADMIN_PASSWORD`. Para o teste foram usados valores aleatórios passados pelo ambiente do shell; o `.env` não foi alterado. **Antes do ensaio de 24/11, defina os dois no `.env`.**
- O `.env.test` do analytics foi criado (não versionado), apontando para o `hotel-test-pg` na 55432.
- O `node_modules` do frontend estava sem o `lucide-react`, e o `tsc` falhava. Reinstalado com `pnpm install --frozen-lockfile --config.confirmModulesPurge=false` (o comando sem a flag para numa pergunta interativa).
- O Grafana do compose lê o painel direto do arquivo do repositório. Trocar de branch troca o painel que aparece.

## Pendências para o próximo dev

- Merge do PR #193 na `develop` depois do CI verde, e anotar no `PASSO_8_GRAFANA.md` a execução verde do Actions que vai ser aberta na apresentação.
- Merge do PR #11 do fork (Doc 08) e, junto com o PR #10, decidir o PR ao professor.
- 🟢 do qa-redteam do analytics (estado do consumidor como gauge, contagem da falha de envio à DLQ, teste da pausa por infraestrutura): pós-congelamento.
- 🟢 do qa-redteam do Doc 08 que ficaram: replanejamentos na coluna "Sprint planejada", atraso das metas vencidas, DoD × §8, ata de 03/11.
- Seed: trocar `'CARTAO'` por `CARTAO_CREDITO` nas linhas novas do `seed_hoje.sql` (dono: Sirlande).
- Conferir o painel do Grafana no Edge antes do ensaio. Nesta sessão ele só foi conferido pela API e pelo Prometheus. O print sem interação do Edge para na tela de carregamento do Grafana, e abrir o Edge com depuração remota foi bloqueado pelo controle de permissões.
