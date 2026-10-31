# Repasses para o Weslley — 31/10/2026

Origem: `docs/qa/redteam_branches-weslley-ci-compose-spec03_31out2026.md`. Os dois achados estão na área do Weslley, mas fora dos diffs auditados (`chore/compose-pix-asaas`, `docs/spec03-asaas`, `feature/ci-por-servico`). Não reprovam nenhuma das três branches.

---

### 🟡 [Infra] k8s não recebe o provedor PIX nem as credenciais do Asaas
**Onde:** `infra/k8s/backend.yaml:33-70` (bloco `env`), `infra/k8s/configmap.yaml`, `infra/k8s/secret.yaml`
**Cenário:** a `chore/compose-pix-asaas` corrigiu o compose, mas o k8s continua sem `PIX_PROVIDER`, `ASAAS_BASE_URL`, `ASAAS_API_KEY` e `ASAAS_WEBHOOK_TOKEN` (`grep -c ASAAS infra/k8s/backend.yaml` → 0). No cluster, local ou AWS, o backend usa sempre o `FakePixProvider`. A ADR-008/Doc 07 (`docs/sugestoes-documentos-oficiais/07-adr/versao-sugerida_v1.0.md:308`) assume o webhook do Asaas apontado para o endereço público da AWS. Na nuvem, a demonstração do passo 6 com o Asaas não funcionaria, e não haveria aviso.
**Regra violada:** paridade compose × k8s (o comentário do topo do `docker-compose.yml` promete os mesmos nomes e a mesma configuração).
**Correção sugerida:** `PIX_PROVIDER` e `ASAAS_BASE_URL` no ConfigMap (padrão `fake`). `ASAAS_API_KEY` e `ASAAS_WEBHOOK_TOKEN` com `secretKeyRef` e `optional: true`, **sem** valor versionado no `secret.yaml`, criados por script como o `jwt-rsa-keys`.

### 🟡 [Integrações / fail-open] `PIX_PROVIDER` desconhecido cai em silêncio no provedor simulado
**Onde:** `services/core-service/app/services/pix/index.js:25-26`
**Cenário:** `PIX_PROVIDER=assas`, ou `Asaas ` com espaço, no `.env` → `PROVIDERS[key] || FakePixProvider`. O backend sobe sem aviso, e a reserva devolve um QR simulado. Quem demonstra acredita estar no Asaas, e a reserva se confirma pelo webhook simulado com `PIX_WEBHOOK_SECRET`. É a blocklist/fail-open que o CLAUDE.md §7 proíbe para escolha de comportamento sensível.
**Regra violada:** CLAUDE.md §7 (allowlist / fail-safe).
**Correção sugerida:** chave desconhecida lança erro na inicialização, ou ao menos `console.error` com o valor recebido e a lista aceita. Aplicar `trim()` antes do `toLowerCase()`. Acompanhar com teste.
