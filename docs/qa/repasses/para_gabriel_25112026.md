# Repasse para Gabriel — 25/11/2026

Origem: QA Red Team da SPEC-10 F3, painel Hoje (`feature/t10-fase3-hoje`, Sirlande). O achado está em
código anterior à branch e não reprova a F3. Relatório: `docs/qa/redteam_spec10-fase3-hoje_25112026.md`.

### 🟡 [painel do dia] "Vendidos hoje" conta duas vezes o quarto da troca do dia
**Onde:** `frontend/apps/pms/src/features/today/todayLogic.ts:105-107` (`soldToday`, regra D-6 de 04/11)
**Cenário:** o quarto 201 está OCCUPIED com o hóspede A, que sai hoje. A reserva B, com entrada hoje, está no mesmo
201. `soldToday` faz ocupados (inclui o 201) + chegadas não atrasadas (inclui B), e o resultado é **2 para um quarto**.
Toda troca de dia infla o número até o check-out de A. Num hotel pequeno com trocas, "Vendidos hoje" pode passar do
total de quartos. A F3 mantém a fórmula, agora com `strip.counts.occupied` (core) no lugar do analytics.
**Regra violada:** o indicador não mede o que diz ("vendidos" para a noite de hoje); risco de decisão comercial errada
**Correção sugerida:** conte os quartos distintos: ocupados cuja saída não é hoje, mais os quartos das chegadas de hoje
(`Set` por `room.id`). Ou redefina e documente a dica ("ocupados agora + chegadas", sem chamar de vendidos).
