### 2026-11-16 (adendo) — Sirlande (com Claude Code)

> Entrada nova, conforme o `CODING_STANDARDS` (relatório passado não se edita). Continua
> `spec08_t085_fechamento_t086_faxina_16nov2026.md`, que foi mergeado antes destes itens.

- **Branches:** `fix/comanda-acabamento` (#165, resolução de conflito), `fix/id-invalido-404-routers` (#172), `fix/excluir-hospede-com-estadia` (#173)
- **Objetivo:** resolver as pendências do relatório de 16/11 que dependiam do Sirlande (itens 1 a 4).

#### O que foi feito

| Pendência | Resultado |
|---|---|
| 1. Revisar o #165 (comanda: faixa de sem conexão e contagem do desfazer) | **Revisado:** a faixa usa o mesmo sinal que pausa as consultas e também o envio que falhou. A contagem não repete no leitor de tela. Fila, API e backend não mudaram. **Conflito com a T-08.6** no `AccountPage`, resolvido juntando o `PageHeader` com a faixa; um comentário passou a apontar para o `InfoNotice`. Mergeado com o CI verde. |
| 2. PRs de documentação | Mergeados #155, #156, #163, #169 e #171. Nenhum se sobrepunha a outro. |
| 3. Excluir hóspede com estadia em andamento | **#173:** `DELETE /guests/:id` responde 409 com reserva PENDING, CONFIRMED ou CHECKED_IN. Checagem e exclusão rodam numa transação, com o hóspede travado. `ACTIVE_RESERVATION_STATUSES` fica em `reservationStatuses.js`, e o quarto usa a mesma lista. Swagger e cliente da API atualizados. A ficha mostra o motivo que o servidor manda. |
| 4. `:id` que não é UUID respondendo 500 | **#172:** a guarda `notFoundUnlessUuid` (`app/utils/`) responde 404 com a mensagem de cada controller. Cobre hóspedes, quartos, categorias, pagamentos, usuários, contratos (incluindo a parcela), clientes corporativos e orçamentos. O `reservationRouter` passa a usar o mesmo utilitário. |

**Decisões do Sirlande (16/11):**
1. **Exclusão de hóspede com reserva ativa:** recusar com 409, em vez de manter o nome do hóspede excluído nas leituras.
2. **Correção do 500 por id inválido:** feita agora, por ele, e não repassada.
3. **Conta DAY_USE ou DIRECT aberta com o hóspede:** **não** bloqueia a exclusão e fica como está. As telas de conta não mostram o hóspede.

**Verificação:**
- **#172:** o RED pegou as 26 rotas do repasse. Mutação: 4 de 4 mutantes mortos.
- **#173:** os 5 status de reserva e o hóspede sem reserva, mais o 409 na tela. Mutação: 3 de 3 mutantes mortos.
- **Suítes, já com os dois na `develop`:** backend com 1293 testes, frontend com 427 no app e 49 no `@hotel/domain`.
- **CI:** verde nos três PRs de código antes do merge.
- **qa-redteam:** aprovou o #172 e o #173 sem 🔴 nem 🟡 (`docs/qa/redteam_core-404-e-exclusao-hospede_16112026.md`).

#### Commits gerados

| Hash | Mensagem |
|------|----------|
| `10a8d32` | `Merge origin/develop into fix/comanda-acabamento` (conflito do #165) |
| `1f22760` | `test(core): RED do :id que nao e UUID nos oito routers restantes (repasse de 15/11)` |
| `2a5afd1` | `fix(core): :id que nao e UUID responde 404, nao 500, em todos os routers (repasse de 15/11)` |
| `b01a9db` | `test(core): RED da exclusao de hospede com reserva ativa (decisao de 16/11)` |
| `64f138f` | `test(pms): RED do 409 da exclusao de hospede com o motivo do servidor` |
| `cbc074f` | `fix(core): hospede com reserva ativa nao se exclui (409), decisao de 16/11` |
| `1d9874a` | `docs(core): limitacao da corrida completa no DeleteGuestController e red team de 16/11` |

Merges na `develop`:
- `b1636d4` (#155), `abe364a` (#156), `b8a1816` (#163), `b44df72` (#169) e `a829f9e` (#171);
- `e18779c` (#165), `be2bf32` (#172) e `e1b69da` (#173).

#### Pendências

Substitui os itens 1 a 4 do relatório anterior. Os itens 5 a 9 de lá continuam valendo.

| # | Pendência | Prioridade | Observação |
|---|-----------|-----------|------------|
| 1 | Exclusão de hóspede: corrida com quem grava referência sem KEY SHARE | 🟢 Baixa | `CreateReservation`, `UpdateReservation:47`, `SignContract:101` e `CreateBooking:189`. Só escapa quando a exclusão chega primeiro; documentado no `DeleteGuestController`. |
| 2 | 🟢 do red team do core | 🟢 Baixa | Id inválido com papel sem permissão recebe 404 antes do 403. `DELETE /payments/<não-uuid>` dá 404 em vez de 405. O 409 do hóspede sai sem `code`. Falta teste de tenant no caminho transacional novo. |
| 3 | PRs antigos de documentação | 🟢 Baixa | #129, #133, #146 e #153 continuam abertos. Não são desta sessão. |
