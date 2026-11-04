# Repasse — Gabriel (H.3 / analytics) — 04/11/2026

Origem: qa-redteam da T-05.3, painel "Hoje" (`docs/qa/redteam_t053-painel-hoje_04nov2026.md`). Este achado não reprova a branch. O bug de fuso do mesmo endpoint já está em `para_gabriel_h3_04112026.md` e não foi repetido aqui.

---

### 🟢 [LGPD · minimização] `/analytics/alerts` do core ainda envia `guest_phone` e o nome do hóspede, e agora todo aparelho da recepção busca isso a cada 60 s
**Onde:** `services/core-service/app/Controllers/AnalyticsApi/GetAlertsController.js:10-12` (`g.full_name AS guest`, `g.phone AS guest_phone`) e `:47-52`.

**Cenário:** o painel "Hoje" (`features/today/queries.ts`, `refetchInterval: 60_000`) chama `/analytics/alerts` o turno inteiro, em cada aparelho da recepção. A tela não lê `guest_phone` nem `guest`: `RawAlerts` ignora os dois e o nome vem da listagem de reservas. Mesmo assim, o telefone de toda chegada CONFIRMED sem pagamento do dia trafega e fica no cache do navegador e nos DevTools, sem nenhum uso.

**Regra violada:** LGPD art. 6º, III (necessidade/minimização).

**Correção sugerida:** a H.3 (PR #109) já tira `guest_phone` do contrato. Se o cutover atrasar para depois da demonstração de 10/12, tirar `g.phone` e `g.full_name` do SELECT do core também. O painel não depende de nenhum dos dois.
