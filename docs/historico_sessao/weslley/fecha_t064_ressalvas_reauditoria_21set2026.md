# Sessão — Fecha as ressalvas da reauditoria de T-06.4 — 21/09/2026

## Contexto

Depois do fechamento de T-06.4 (`fecha_t064_docker_compose_seed_21set2026.md`), rodei uma
auditoria `qa-redteam` própria da branch `feature/docker-compose-rabbitmq` (nunca tinha sido
auditada isoladamente). Veredito: **aprovada com ressalvas** — relatório completo em
`docs/qa/redteam_docker-compose-rabbitmq_21set2026.md`. O auditor rodou o `docker compose up`
ele mesmo (não confiou no relatório anterior) e achou 4 🟡, o mais sério dos quatro:

**O seed não era idempotente de verdade.** A alegação de idempotência no relatório anterior e na
SPEC-06 estava errada. Rodar `seed` duas vezes inseria +5 reservas `CANCELLED` a cada execução
(a EXCLUDE de anti-double-booking tem predicado `WHERE (status <> 'CANCELLED' ...)` — de
propósito, para não travar o quarto — e por isso não dá ao `ON CONFLICT DO NOTHING` nada para
capturar nessas linhas específicas). O auditor verificou contra o banco real, não só o exit code.

## O que foi corrigido nesta sessão

1. **Idempotência real do seed** — `seed/seed_hotels.sql`: as duas inserções de `reservations`
   (Aurora e Sol) ganharam `AND NOT EXISTS (SELECT 1 FROM reservations r WHERE r.room_id = rm.id
   AND r.check_in_date = v.check_in::date)`, mesmo padrão já usado em `event_quotes`/`contracts`
   no mesmo arquivo. Verificado rodando o seed **3 vezes seguidas**: contagem de `reservations`
   por status idêntica nas três (`CANCELLED: 5` nas três rodadas).
2. **Guard de produção** — `command.js`: `seed` recusa rodar com `NODE_ENV=production` (o default
   do compose) a menos que `ALLOW_SEED=1` seja passado explicitamente. Sem isso, um
   `kubectl exec ... node command.js seed` digitado por engano criaria um `ADMIN` com senha
   documentada (`senha123`) num banco de produção real. Testado: recusa sem a flag (exit 1),
   funciona com ela.
3. **`BACKEND_HOST_PORT` documentado** — estava só num comentário do YAML; agora também no
   `.env.example` (raiz, comentado) e no README, com a ressalva de que mudar a porta exige
   ajustar `frontend/apps/pms/vite.config.ts` também.
4. **README corrigido** — mandava `cp services/core-service/.env.example .env` (arquivo errado;
   o compose lê o `.env` da raiz, gerado a partir do `.env.example` da raiz, que tem
   `NODE_ENV=production`). Corrigido para `cp .env.example .env`. Removida a contagem "165
   registros" (o auditor achou ~190 reais — número frágil, não vale repetir sem contar de novo).
5. **Healthcheck do nginx** trocado de `/healthz` (estático, sempre 200) para `/health` (atravessa
   o proxy até o backend real) — mesmo achado 🟢 já sinalizado antes para a *evidência citada na
   doc*, agora corrigido no próprio healthcheck.
6. **`rabbitmq` promovido a `service_healthy`** na dependência do `backend` — já tinha
   healthcheck, só não era usado como condição.

## Evidência real (2ª rodada completa, `BACKEND_HOST_PORT=3010`)

```
$ docker compose ps --format "{{.Name}}: {{.Status}}"
[6 serviços, todos "healthy", incluindo nginx agora checando /health]

$ docker compose exec backend node command.js migrate    → ✅
$ docker compose exec backend node command.js seed       → ✅ (NODE_ENV local = development)
$ docker compose exec -e NODE_ENV=production backend node command.js seed
❌ Recusado: NODE_ENV=production sem ALLOW_SEED=1.
$ docker compose exec -e NODE_ENV=production -e ALLOW_SEED=1 backend node command.js seed
✅ Seed executado com sucesso.
$ docker compose exec backend node command.js seed       → ✅ (3ª execução)

$ psql -c "select status, count(*) from reservations group by status"
CANCELLED: 5 | CHECKED_IN: 6 | CHECKED_OUT: 13 | CONFIRMED: 8 | PENDING: 8
(idêntico nas 3 execuções — idempotência confirmada de verdade, não só pelo exit code)

$ curl http://localhost/health          → 200 OK
$ curl -X POST .../auth/login (admin@aurora.example / senha123) → 200, JWT válido

$ docker compose down -v                → 0 recursos órfãos
```

`bash scripts/qa_checks.sh` → mesmos 3 avisos pré-existentes, nenhum novo.

## Ressalvas que ficam para depois (não bloqueiam, registradas no relatório da auditoria)

- Nenhum job de CI exercita o compose — o "atualizado e funcional" do Termo pode apodrecer em
  silêncio sem ninguém notar.
- `pnpm --filter app-pms dev` apontando pro backend do compose não foi executado ponta a ponta
  (só verificado por leitura de código) — é o único CA que segue sem execução real.
- Porta 3000 hardcoded em mais 3 pontos do código-fonte, fora do compose (trap se algum desses
  precisar mudar junto).
