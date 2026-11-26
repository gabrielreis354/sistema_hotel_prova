# Repasse para Gabriel — 26/11/2026

Origem: critique da F6 da SPEC-10 (`docs/qa/impeccable_critique_spec10-fase6_26112026.md`). A SPEC-10 não muda regra de tela da recepção; por isso a decisão é sua (decisão do Sirlande de 26/11).

### Pergunta — hierarquia das ações da conta na comanda
**Onde:** `frontend/apps/pms/src/features/accounts/components/StaffActions.tsx` (rodapé da conta, recepção e admin).
**Hoje:** "Receber", "Ver conta" e "Fechar conta" são três botões secundários iguais. Nada diz qual é o próximo passo, e no celular o rodapé fixo ocupa ~165 px.
**Sugestão do critique:** "Receber" primário quando o saldo é maior que zero, "Fechar conta" primário quando o saldo é zero, "Ver conta" discreto (ghost ou link).
**Pergunta:** a hierarquia pelo saldo está certa para o balcão? A fila de mesa paga antes de fechar, ou fecha e recebe depois?

---

## Respostas do Gabriel às perguntas da SPEC-10 (26/11)

Respostas às 7 perguntas do Sirlande sobre as telas novas (F3, F4 e F6), conferidas no código da
`feature/spec-10-identidade` e da `develop` em 26/11.

### Painel Hoje (F3)

**1. "Em limpeza" depende do analytics.** Era intencional, por um motivo só: o analytics guarda a hora
em que o quarto entrou em limpeza (`proj_rooms.cleaning_since`). O core não tem esse dado, porque o
`updated_at` do quarto muda com qualquer edição.
- **Decisão:** a lista passa a ler o status `CLEANING` do core, que a fita já carrega.
- O "em limpeza desde" fica como complemento, só quando o analytics estiver no ar.
- **Por quê:** "Liberar quarto" é ação de balcão e não pode sumir quando o analytics cai. É a regra
  que a demonstração promete: sem o analytics, a recepção continua.

**2. "Vendidos hoje" conta duas vezes a troca do dia.** É defeito da D-6.
- **Decisão:** contar quartos distintos para a noite de hoje: os ocupados cuja saída não é hoje, mais
  os quartos das chegadas de hoje, sem repetir quarto (`Set` por `room.id`).
- O nome "Vendidos hoje" fica, porque passa a medir o que diz.
- **Teste:** o número nunca passa do total de quartos, inclusive com troca do dia.

**3. Quarto em limpeza no "Atenção".** Não entra na hora: ir para limpeza depois do check-out é o
normal do dia.
- **Decisão:** o quarto em limpeza entra no "Atenção" só quando há chegada marcada para hoje naquele
  quarto, que é a urgência real da recepção. O dado vem do core e funciona com o analytics fora.
- O alerta por tempo parado em limpeza fica para depois, porque depende do `cleaning_since` do analytics.

### Reserva e conta (F4)

**4. Check-in sem confirmação.** Entra a confirmação na linha, igual à do check-out. No painel Hoje o
check-in já tem (#140); o detalhe da reserva nunca teve. O check-in não se desfaz: o quarto fica
ocupado e a cobrança de sinal pendente é cancelada.

**5. "-R$" e "crédito" na conta.** Muda, nos três pontos:
- **Pagamento na linha do tempo:** sem o sinal de menos. A linha já diz "Pagamento · PIX" e tem o
  marcador de anel.
- **Saldo corrente:** sai das linhas. Fica só o saldo final, com palavras: "A pagar R$ X", "Quitada"
  ou "Pago a mais R$ X". O saldo corrente é o que gerava o "crédito" no meio da estadia, quando o
  pagamento entra antes de uma diária futura (pendência de 24/11).
- **Comprovante:** a mesma regra, sem "-R$". Os pagamentos ficam numa seção própria e, no fim, vêm
  Total, Pago e Saldo.

**6. Foco no "Cancelar reserva".** É defeito, corrigir com o padrão do check-out: uma `ref` no painel
de confirmação e o foco indo para ele quando abre, como o arquivo já faz com o `checkOutRef`.

### Comanda (F6)

**7. Ordem das ações da conta.** Concordo com a hierarquia pelo saldo, na mesa, no balcão e no day-use:
- saldo maior que zero: "Receber" é o botão principal;
- saldo zero: "Fechar conta" é o principal;
- "Ver conta" fica discreto (ghost ou link).

Sobre "a mesa paga antes de fechar, ou fecha e recebe depois?": no balcão, paga antes e fecha depois.
O backend aceita fechar com saldo, e a conta fica fechada até o pagamento chegar (D-43). Isso é
exceção, para quem vai pagar depois: continua possível, só não como botão principal. A conta da suíte
não muda, porque ela recebe pela reserva e fecha no check-out, como o `closeBlockedReason` já faz.

### Prazo (congelamento de 24/11)

- **Correções, podem entrar antes da banca:** 1, 2, 4 e 6.
- **Mudam regra ou texto de tela:** 3, 5 e 7. Entram na F4 e na F6 só se não puserem em risco o
  roteiro da demonstração; senão, ficam para depois de 10/12. Combinar comigo antes de começar.
- Cada uma passa pelo qa-redteam antes do merge.
