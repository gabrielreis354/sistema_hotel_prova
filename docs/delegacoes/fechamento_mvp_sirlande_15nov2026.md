# Para o Sirlande — fechamento do MVP (15/11/2026)

Oi, Sirlande. O plano completo de fechamento está em `docs/PLANO_FECHAMENTO_MVP_15NOV2026.md`.
Esta mensagem traz só a sua parte, e dá para ler sem abrir o plano.

## Onde estamos

Em 14/11 fizemos o primeiro ensaio completo do roteiro de demonstração. Ele tem 7 passos, do
cadastro de quartos aos indicadores do gerente, e os 7 funcionaram. A sua tela de pagamento no
check-out e as duas correções dela (#141 e #132) já estão na `develop`. Faltam duas coisas suas
para a demonstração ficar redonda, e o congelamento é em **24/11**.

## 1. Dados de demonstração com as datas do dia — até 17/11

**Problema.** Todas as reservas do seed são de janeiro a junho de 2026. No dia da banca, o painel
"Hoje" (chegadas, saídas, risco de *no-show*) e os 4 cartões do gerente (ocupação, diária média,
RevPAR e recebido hoje) aparecem **zerados**. O pedido original é do Weslley, na mensagem de 31/10
(`docs/delegacoes/resposta_weslley_alinhamento_sirlande_31out2026.md`, §3.1).

**O que fazer.** Acrescentar ao seed um bloco com as datas calculadas a partir de `CURRENT_DATE`,
para que os dados façam sentido em qualquer dia em que o seed rodar.

**Critérios de aceite:**
- [ ] pelo menos 1 estadia `CHECKED_IN` cujo período inclui hoje;
- [ ] 1 reserva `CONFIRMED` com entrada hoje e 1 estadia com saída hoje;
- [ ] 1 pagamento `PAID` com `paid_at` de hoje no horário de Brasília. O analytics já conta o dia no fuso do hotel (D-68); o cuidado é o seed não usar o `CURRENT_DATE` em UTC (corrigido no PR #157, item 3.2 da resposta no #156);
- [ ] 1 quarto em `CLEANING`, para mostrar o botão "liberar quarto" do painel Hoje;
- [ ] **o status do quarto bate com a estadia:** toda estadia `CHECKED_IN` deixa o quarto `OCCUPIED`, e todo quarto `OCCUPIED` tem uma estadia `CHECKED_IN`. Hoje as 6 estadias `CHECKED_IN` do seed estão em quartos `AVAILABLE`. Por isso o painel mostra "Livres 15 · Ocupação 0%" com 4 hóspedes na casa, e a Nova reserva oferece quartos ocupados como livres. O detalhe está em `docs/qa/revisao_telas_prontas_15112026.md`, achado 1;
- [ ] rodar o seed duas vezes não duplica nada, e a trava `ALLOW_SEED=1` continua valendo;
- [ ] tudo com `tenant_id`, nos dois hotéis do seed;
- [ ] conferência: depois de `ALLOW_SEED=1 node command.js seed`, o painel Hoje e os 4 cartões mostram números diferentes de zero.

## 2. Fechar a comanda do garçom — até 20/11

A comanda está funcionando, inclusive a fila que guarda os lançamentos quando a rede cai. Da
revisão de 27/10 (`t055_correcoes_impeccable_27out2026.md`), pela leitura do código:

| Item | Situação |
|---|---|
| Aviso quando o nome da mesa se repete ("Mesa 3") | Parece feito, falta conferir |
| Caixa que cortava a primeira linha | Parece feito (`35664e4`), falta conferir |
| Rodapé da conta fixo na tela | Parece feito, falta conferir |
| **Aviso de "sem conexão"** (achado 7). Hoje a fila guarda o lançamento, mas o garçom não vê que está sem rede | **Aberto** |
| **Tempo restante para desfazer.** O garçom tem 5 s para desfazer, e a tela mostra o preço, mas não o tempo que sobra | **Aberto** |

**Duas opções, você escolhe:**
- **(a)** Você faz os dois itens abertos e confere os três primeiros com o agente qa-explorador.
- **(b)** O Gabriel, com os agentes dele, faz os dois itens abertos numa branch `fix/comanda-acabamento`, e você revisa o PR. Você continua conferindo os três primeiros.

A comanda é sua, então ninguém mexe nela sem o seu OK. Responda com (a) ou (b).

## 3. Revisão

- Revisar os PRs de frontend do Gabriel até o congelamento: proxy do Vite (#145) e roteiro automatizado (`feature/e2e-roteiro`).
- Aprovar a versão final `develop → main` em 01/12.

## Datas

| Data | O quê |
|---|---|
| 17/11 | Seed com as datas do dia na `develop` |
| 20/11 | Comanda fechada |
| 24/11 | Congelamento + segundo ensaio com todos |
| 01/12 | Versão final + ensaio geral |
| 10/12 | Apresentação |

## Atualização do fim de 15/11

O que entrou na `develop` hoje e mexe na sua área:

- **SPEC-09** (#149, #150, #151), correções de tela da revisão de 15/11:
  - o item "Usuários" saiu do `routes/nav.ts`. A rota `config/usuarios` continua no `App.tsx`;
  - a `ReservationDetailPage` passou a buscar antes o hotel do comprovante (`useQueryClient().prefetchQuery`);
  - o CPF aparece formatado, por `formatCpf` do `@hotel/domain`, na lista e no detalhe de hóspedes, na reserva e no `GuestPicker`;
  - a linha da lista de Hóspedes ficou inteira clicável (`GuestRow.tsx`).

  Os seus PRs da **SPEC-08** (#159 a #162) mexem nesses mesmos arquivos (ícones no `nav.ts` e hierarquia de ações na reserva). Antes do merge, confira se eles estão em dia com a `develop`.
- **Check-in só dentro do período da reserva** (#147). Isso afeta o seu seed: reserva `PENDING` ou `CONFIRMED` que você quiser mostrar como "chegada de hoje" precisa ter `check_in_date <= hoje < check_out_date`.
- **`./start.sh compose-up --build`** (#154) é o jeito novo de subir o compose. Ele avisa se o `rabbitmq-setup` falhar.

**Recebido no fim do dia:** a sua resposta (#156, comanda pela opção (b)), o seed com as datas do
dia (#157) e a SPEC-08 mínima (#159 a #162). A sua tabela entrou no §5 do plano, e a linha da
SPEC-08 no §6. Os três repasses 🟡 do painel Hoje (`para_gabriel_15112026.md`) ficam com o
Gabriel, depois dos merges da SPEC-08, para não dar conflito.
