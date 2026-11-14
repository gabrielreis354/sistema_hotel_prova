### 2026-11-14 — Gabriel (orquestrando Claude Code)

- **Branch:** `docs/ensaio-roteiro-14nov`
- **Objetivo da sessão:** seguir a recomendação do orquestrador:
  - primeiro ensaio de ponta a ponta do roteiro de demonstração (M8/M9);
  - revisão dos PRs do M5-b (#132, #141);
  - merge dos PRs prontos;
  - painel em dia.

#### O que foi feito

| Entrega | Onde |
|---|---|
| Ensaio dos 7 passos pela tela, em compose limpo: **7 de 7**, com um 🔴 achado no caminho | `docs/qa/ensaio_roteiro_14112026.md` |
| Revisão humana do #141 (conferência do saldo antes de gravar) e do #132 (pagamento sem rede) | comentário desta sessão |
| qa-redteam do #132, sozinho e combinado com o #141: aprovado (só 🟢 juntos). O #132 não tinha relatório | `docs/qa/redteam_m5b-pagamento-sem-rede_14nov2026.md` |
| Painel atualizado: metas M4 a M9 conferidas contra o git, PRs abertos e fila | `docs/PAINEL_DE_ANDAMENTO_MVP.md` |

#### Achados do ensaio

- 🔴 Com o `vite.config.ts` do repositório, o PMS chama os indicadores no core (porta 3000), e
  não no nginx. Desde a H.3, os indicadores e os alertas do painel Hoje dão 404. Verificado na
  tela e pela API.
- 🟡 No primeiro `up` a frio no WSL, o compose desiste porque o RabbitMQ demora a ficar saudável.
  O segundo `up` resolve.
- 🟢 O site de reserva ainda é só README. O passo 6 é pela API pública, como previa a pauta de
  03/11.

#### Verificação

- O analytics refletiu o ensaio. A receita de novembro (R$ 804,00) bate com os pagamentos do
  ensaio, e a ocupação mostra os quartos do ensaio.
- Ambiente derrubado ao final (`down -v`). Nada em nuvem.

#### Pendências

| # | Pendência | Prioridade | Observação |
|---|-----------|-----------|------------|
| 1 | Corrigir o proxy do Vite (`/api/analytics` para o nginx) | 🔴 Alta | Plano no relatório do ensaio. Aguarda aprovação do Gabriel |
| 2 | Merge de #141, #132 e #142 | 🟡 | Revisados e com CI verde. O merge pela sessão foi recusado pela política de permissões: precisa ser feito pelo Gabriel |
| 3 | 1º `up` a frio do compose | 🟡 | Weslley (M8) |
| 4 | Trocar a chave de sandbox do Asaas exposta em 12/11 | 🟡 | Weslley, depois do M6 |
| 5 | Decisões do encontro de 03/11 ainda sem registro no painel (§2) | 🟢 | Gabriel |
