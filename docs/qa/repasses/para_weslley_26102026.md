# Repasses para Weslley — 26/10/2026

Origem: `docs/qa/redteam_t047-consumo-interno_26out2026.md` (branch `feature/t047-consumo-interno-seed`, Sirlande).

### 🟡 [Infra/seed] `./start.sh seed` não encontra o seed e não aplica o seed da comanda
**Onde:** `start.sh:101-104`
**Cenário:** o `start.sh` faz `cd "$(dirname "$0")"` (linha 7), que é a raiz do repo, e testa `[ -f seed/seed_hotels.sql ]`. Desde a SPEC-01 (15/09), o seed fica em `services/core-service/seed/` e `ls seed` na raiz falha. Resultado: `./start.sh seed` aborta com "seed/seed_hotels.sql não encontrado". Mesmo com o caminho corrigido, ele só envia `seed_hotels.sql` ao psql. O `seed_consumo.sql` (cardápio, contas, garçom `garcom@aurora.example`) da T-04.7 fica de fora, e a demonstração no K8s sobe sem a comanda.
**Correção sugerida:** apontar para `services/core-service/seed/` e enviar os dois arquivos, nesta ordem: `seed_hotels.sql` e depois `seed_consumo.sql`. A alternativa é rodar `node command.js seed` dentro do pod do backend. Atualizar também `README.md:255,837` e `infra_up.sh:98`.

---

### ℹ️ [aviso, sem ação] Índice único em `payments.provider_charge_id` — Sirlande, 26/10/2026
Origem: repasses `para_sirlande_21092026.md` e `para_sirlande_17102026.md` (auditorias das branches `feature/mercadopago-pix` e `feature/asaas-pix`).

Desde a branch `fix/repasses-payments-products`, o banco tem `payments_provider_charge_id_unique`: `(provider_charge_id) WHERE deleted_at IS NULL`, global (sem `tenant_id`). **Nenhum arquivo do PIX foi alterado** (`app/services/pix/`, `WebhookApi/`, `PublicBookingApi/`).

O que muda para o fluxo do PIX: o `findOne({ where: { provider_charge_id } })` do webhook passa a ter no máximo uma linha viva para achar, e não lê mais a tabela inteira. Se um provider devolver um id de cobrança que já existe num pagamento vivo, o INSERT do `CreateBookingController` falha em vez de gravar a duplicata. Hoje os providers geram ids únicos (Fake: `fake_<uuid>`; Mercado Pago e Asaas: id do PSP), então isso não acontece. Os testes `public-booking`, `payments`, `asaas-webhook` e `mercadopago-webhook` passam sem alteração.

Antes do deploy, vale rodar no banco real: `SELECT provider_charge_id, count(*) FROM payments WHERE deleted_at IS NULL AND provider_charge_id IS NOT NULL GROUP BY 1 HAVING count(*) > 1;` — se voltar linha, o `migrate` acusa o índice e é preciso decidir qual pagamento fica.
