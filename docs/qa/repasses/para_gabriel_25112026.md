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

**Resposta do Gabriel (26/11):** é defeito da D-6. Contar quartos distintos para a noite de hoje, como na correção sugerida, e manter o nome "Vendidos hoje". Detalhe na pergunta 2 de `para_gabriel_26112026.md`.

---

Origem: QA Red Team da SPEC-10 F4, detalhe da reserva (`feature/t10-fase4-reserva`, Sirlande). O achado está em
código anterior à branch (já existia em feature/spec-10-identidade@066d0c4) e não reprova a F4. Relatório:
`docs/qa/redteam_spec10-fase4-reserva_25112026.md`.

### 🟡 [reservas / foco] "Cancelar reserva" desabilita o próprio botão no clique e o foco cai no `body`
**Onde:** `frontend/apps/pms/src/features/reservations/ReservationDetailPage.tsx:243-247` (`disabled={… || confirming === 'cancel'}`
junto de `setConfirming('cancel')`) e `:255-270` (painel sem `ref` e sem foco)
**Cenário:** a recepção, no teclado, foca "Cancelar reserva" e aperta Enter. No mesmo render, o botão focado fica `disabled`.
Pela regra de correção de foco do HTML, o foco vai para o `body`. O painel "Sim, cancelar reserva / Manter reserva" aparece
logo abaixo, mas nada o foca ou anuncia. O próximo Tab recomeça no menu, e o leitor de tela fica mudo. O check-out já resolve
esse caso com `checkOutRef` (`:54`, `:99-103`). O cancelar não recebeu a mesma correção. O padrão já tinha sido apontado em
`redteam_spec08-minima_15nov2026.md:19` e `redteam_t085-cabecalho-cartoes_15nov2026.md:25`.
**Regra violada:** WCAG 2.4.3 (ordem do foco); padrão do próprio arquivo (o foco vai para o bloco que nasce)
**Correção sugerida:** um `cancelRef` no `<p>` do painel (`tabIndex={-1}`) e um `useEffect` igual ao do check-out para
`confirming === 'cancel'`. Ou então não desabilitar o botão com o painel aberto e mandar o foco para "Manter reserva".

**Resposta do Gabriel (26/11):** é defeito, corrigir com o mesmo padrão do check-out (`cancelRef` e foco no painel ao abrir). Detalhe na pergunta 6 de `para_gabriel_26112026.md`.
