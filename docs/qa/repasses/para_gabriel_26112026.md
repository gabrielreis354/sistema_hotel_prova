# Repasse para Gabriel — 26/11/2026

Origem: critique da F6 da SPEC-10 (`docs/qa/impeccable_critique_spec10-fase6_26112026.md`). A SPEC-10 não muda regra de tela da recepção; por isso a decisão é sua (decisão do Sirlande de 26/11).

### Pergunta — hierarquia das ações da conta na comanda
**Onde:** `frontend/apps/pms/src/features/accounts/components/StaffActions.tsx` (rodapé da conta, recepção e admin).
**Hoje:** "Receber", "Ver conta" e "Fechar conta" são três botões secundários iguais. Nada diz qual é o próximo passo, e no celular o rodapé fixo ocupa ~165 px.
**Sugestão do critique:** "Receber" primário quando o saldo é maior que zero, "Fechar conta" primário quando o saldo é zero, "Ver conta" discreto (ghost ou link).
**Pergunta:** a hierarquia pelo saldo está certa para o balcão? A fila de mesa paga antes de fechar, ou fecha e recebe depois?
