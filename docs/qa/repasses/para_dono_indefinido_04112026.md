# Repasse — DONO INDEFINIDO — 04/11/2026

Origem: qa-redteam da T-05.3, painel "Hoje" (`docs/qa/redteam_t053-painel-hoje_04nov2026.md`). Este achado **não** reprova a branch `feature/t053-painel-hoje`, porque o defeito é anterior a ela.

A área é o backend da máquina de estados de reserva/quarto. Ela não tem dono declarado em `docs/DIVISAO_TRABALHO_TIME_09set2026.md` §3/§7. O histórico do arquivo tem commits do Gabriel (correções de qa-redteam) e da Sirlande (T-04.6). O orquestrador decide quem pega.

---

### 🔴 [Máquina de estados · venda dupla] O check-in não confere o status do quarto
**Onde:** `services/core-service/app/Controllers/ReservationApi/CheckInController.js:31-35`. O quarto é lido sem lock e sem checar o status, e depois recebe `room.status = 'OCCUPIED'` direto. O mesmo vale para os quartos extras (`:39-50`).

**Cenário (o painel "Hoje" deixa isso a um toque):**
1. A reserva A está no quarto 12, CHECKED_IN, com saída ontem: saída atrasada.
2. A reserva B, também no quarto 12, entra hoje. Ela foi criada sem conflito, porque o `checkReservationConflict` compara datas e os períodos não se sobrepõem.
3. `PUT /reservations/B/check-in` responde 200: o quarto já estava OCCUPIED e continua OCCUPIED. Agora há **dois** CHECKED_IN no quarto 12.
4. A faz check-out e o quarto vai para CLEANING com B dentro. `PUT /rooms/12/release` leva o quarto a AVAILABLE e ele volta para `/rooms/available`. **O quarto é vendido de novo com hóspede dentro.**
5. O mesmo vale para check-in em quarto MAINTENANCE (com defeito) ou CLEANING (ainda sujo), sem nenhum aviso.

**Regra violada:** CLAUDE.md §3, máquina de estados do quarto. O check-in só leva AVAILABLE → OCCUPIED. Também CLAUDE.md §7 (allowlist, fail-safe). É a mesma consequência que o R-3 de 21/10 fechou no PUT /rooms/:id.

**Correção sugerida:**
- Ler o quarto com `lock: transaction.LOCK.UPDATE` e responder 409 com `code` quando `room.status !== 'AVAILABLE'`. A mensagem deve dizer o motivo: "Quarto 12 ainda ocupado (saída atrasada de <hóspede>)", "em limpeza" ou "em manutenção".
- Fazer o mesmo para cada quarto extra.
- Se o hotel quiser permitir check-in em quarto em limpeza, isso vira decisão explícita, nunca o comportamento padrão.
- Testes: check-in com o quarto em OCCUPIED, CLEANING e MAINTENANCE responde 409 e não muda reserva nem quarto.
- Atenção: o painel e o detalhe da reserva tratam o erro como `ApiError` genérico. Conferir se a mensagem 409 chega legível ao balcão.
