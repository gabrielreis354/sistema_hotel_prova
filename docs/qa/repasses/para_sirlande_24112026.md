# Repasses para o Sirlande — 24/11/2026

Origem: QA explorador do roteiro da demonstração (`docs/qa/exploratorio_roteiro-demonstracao_24112026.md`), na `develop` `bf9cafe`. Evidências em `docs/qa/evidencias/roteiro-demonstracao_24112026/`, pasta fora do git.

> **Atualização de 24/11:** corrigido na `fix/qa-roteiro-24nov`. Ver "Correções de 24/11" no relatório.

## 🟡 O `GET /reservations/:id/bill` não devolve a quantidade dos consumos
- **O que acontece:** `consumptions[]` traz só `description` e `amount`, por exemplo `{"description":"Caipirinha","amount":66}` para 3 × R$ 22,00. A linha do tempo da conta e o comprovante, mostrados no passo 5 do roteiro, viram "Caipirinha R$ 66,00".
- **Sugestão:** acrescentar `quantity` e `unit_price` a cada item. Só acrescenta campos e não muda os existentes.
- **A tela:** repasse ao Gabriel.

## 🟢 Comanda
- **Nome do item cortado em 360 px.** O item em "Aguardando envio" aparece como "Cerveja l…" (`p3_mesa_lancamento_360.png`, `ItemList`).
- **Aviso impreciso com o servidor fora.** Com 502 do servidor, a faixa diz "Sem conexão: os lançamentos serão enviados quando a rede voltar.". O item fica honestamente na fila e sobe depois, mas o garçom vai conferir o Wi-Fi. Sugestão: "O sistema não respondeu: o lançamento fica na fila." (`p3_502_1_apos_502.aria.yml`).

## 🟢 Guia da demonstração (coautoria com o Gabriel)
A fala do passo 7 ("Se o analytics cair, a recepção continua funcionando") não vale para o painel Hoje do passo 4. Detalhe em `para_gabriel_24112026.md`.
