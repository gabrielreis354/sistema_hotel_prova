# /impeccable critique — reserva, conta, nova reserva e comprovante (F4 da SPEC-10), 25/11/2026

**Execução:**
- duas avaliações isoladas em subagentes: A (design) e B (detector e navegador);
- síntese e correções nesta sessão;
- HEAD avaliado: `575a366`.

**Especificidade:** feita para este produto. O saldo fixo no cabeçalho, a conta como tabela de lançamentos e a ação principal que troca com a situação vêm do balcão.

**Nielsen (A): 28/40.** A menor nota é em flexibilidade (2), porque não há atalhos de teclado, e em ajuda (2).

## Detector e navegador (B)

**Linha de comando:** limpa nos 22 arquivos. A varredura é só por regex em `.tsx`.

**Overlay:** 9 `low-contrast` nos rótulos das fichas (gray-500 sobre o areia, 4,4:1). O componente é anterior à F4, mas foi corrigido aqui.

**Medições:**

| O que | Resultado |
|---|---|
| Primário desabilitado | 6,1:1 |
| Secundário desabilitado | 3,38:1 (corrigido para 4,6:1) |
| RoomNumber | 16:1 |
| Toque em 360 | 48 px, exceto o link do nome do hóspede dentro do texto, que a WCAG 2.5.8 dispensa |
| Transbordo | Nenhum |
| Dobra em 1366×768 | A ação principal fica visível em todas as telas |

## Problemas e o que foi feito

| # | Problema | Feito |
|---|---|---|
| P1 | Com saldo, "Confirmar check-out" e "Registrar pagamento" eram dois primários empilhados, com o de liberar o hóspede primeiro | Com saldo a receber, o confirmar fica secundário (`checkOutConfirmVariant`). A regra não muda |
| P3 | O fim do check-out não levava ao comprovante | "Imprimir comprovante" no aviso de sucesso do check-out |
| B | Rótulos das fichas a 4,4:1 | gray-600 |
| B | Secundário desabilitado a 3,38:1 | gray-500 sobre gray-50 (4,6:1) |
| P2 | Pagamento como "-R$ 750,00" e saldo em "crédito" no meio da estadia | **Aberto, Gabriel** (pendência conhecida desde 24/11: o saldo corrente mostra crédito no meio da conta) |
| P2 | Check-in num toque, sem confirmação nem desfazer | **Aberto, Gabriel**: muda a regra da tela; a SPEC-10 não muda regra |
| P2 | Nova reserva no celular: o "Confirmar" e os bloqueios ficam no fim da página | **Aberto**: barra fixa abaixo do `lg`, candidata para a F5 (formulários) |

## Observações menores, abertas
- O nome na aba Resumo duplica o h1.
- A seção Quartos sem categoria quando a API não manda.
- No comprovante, "Saldo" fica mais claro como "A pagar".
- Atalhos de teclado para pagar, fazer check-out e imprimir: 5º semestre.
