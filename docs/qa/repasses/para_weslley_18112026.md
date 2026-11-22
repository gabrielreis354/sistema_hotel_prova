# Repasses para Weslley — 18/11/2026

Origem: `docs/qa/redteam_seed-avisos_18112026.md`, auditoria da `fix/seed-mostra-avisos` (Sirlande).
O achado abaixo **não** é da branch auditada. É do `start.sh` (§3 da divisão de trabalho).

### 🟢 [observabilidade] `./start.sh seed` fecha com sucesso verde mesmo depois do WARNING de cenário incompleto
**Onde:** `start.sh:233-238`
**Cenário:** na véspera da banca, alguém roda `ALLOW_SEED=1 ./start.sh seed` num banco já usado no ensaio. O psql
mostra `WARNING: seed_hoje: o cenário de aurora não ficou completo…` e sai com 0. Em seguida o script imprime
`[✓] Seed aplicado. Login: …`. O aviso aparece, mas a última linha diz o contrário. É o mesmo problema que a
`fix/seed-mostra-avisos` corrigiu no `node command.js seed`, onde agora a última linha vira
"⚠️ Seed aplicado com N aviso(s)".
**Regra violada:** a falha precisa avisar o operador (contrato do próprio `seed_hoje.sql:38-41`).
**Correção sugerida:** capturar o stderr do psql do `seed_hoje.sql` (por exemplo, `2> >(tee "$tmp" >&2)`) e,
se houver `WARNING:`, trocar o `log` final por um `warn "Seed aplicado com aviso: confira acima antes da banca."`.
