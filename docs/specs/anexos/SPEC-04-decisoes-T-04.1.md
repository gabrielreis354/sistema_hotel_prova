# SPEC-04 · Anexo — Decisões da T-04.1 (`Account` + `AccountItem` + CRUD)

**Responsável:** Sirlande (orquestrando Claude Code) · **Período:** 07/10/2026 a 19/10/2026
**Estado da tarefa:** ✅ concluída — Blocos A a D em `develop`, auditados pelo qa-redteam (`docs/qa/redteam_t041-accounts_19out2026.md`)
**Fontes:** relatórios `docs/historico_sessao/sirlande/t041_bloco_a_waiter_least_privilege_07out2026.md` `t041_bloco_b_accounts_schema_14out2026.md` `t041_bloco_c_accounts_api_19out2026.md` e `t041_bloco_d_account_items_19out2026.md`

> Este anexo reúne num só lugar o que foi decidido e **por quê**. A SPEC-04 diz o que entregar; a MER (entidades 4.11 e 4.12) diz o desenho; aqui ficam as escolhas que nenhum dos dois fixava e que os Blocos C e D precisam respeitar.

---

## 1. O que foi produzido

| Bloco | Entrega | CAs | Onde |
|---|---|---|---|
| **A** ✅ | Garçom (`WAITER`) restrito a uma allowlist de rotas: cardápio e comandas. Papel desconhecido é negado | CA-04.1.n.2, n.3 | `app/utils/roles.js`, `authMiddleware`, `tests/waiter-least-privilege.test.js` |
| **B** ✅ | Tabelas `accounts` e `account_items`, com as regras de negócio garantidas pelo banco | CA-04.1.m e k (camada de banco) | `AccountModel.js`, `AccountItemModel.js`, `accountEnums.js`, `applyDbConstraints.js`, `schema.sql`, `tests/accounts-db.test.js` |
| **C** ✅ | Abrir, listar e ler contas, com as regras por tipo, papel e hotel respondidas em 422, 403 e 404 | f, h, k, m (contas) | `AccountApi/`, `accountRouter.js`, `accountRuleViolation.js`, `tests/accounts.test.js` |
| **D** ✅ | Lançar e excluir item, idempotência da fila offline, cortesia, soma da conta, Swagger de `/accounts` | a–e, g, i, j, l, m (itens), n.1 | `CreateAccountItemController`, `DeleteAccountItemController`, `accountTotal.js`, `config/swagger.js`, `tests/account-items.test.js` |

**Garantias que já valem no banco**, provadas por 51 testes que contornam a aplicação:

- Conta de mesa, balcão, day-use ou interna nunca cobra diária.
- Conta de suíte sempre tem estadia, quarto e hóspede.
- Mesa e conta interna não têm hóspede.
- Só uma conta cobra a diária de cada quarto de cada estadia.
- O total de um item é sempre quantidade × preço.
- Cortesia sempre tem motivo, e o valor dela continua gravado.
- O mesmo lançamento do celular do garçom nunca entra duas vezes, nem depois de excluído.
- Toda linha pertence a um hotel (`tenant_id` obrigatório) e some junto com ele.

---

## 2. Decisões

### D-1 — Bloqueio do garçom por allowlist no `authMiddleware`
- **Alternativa descartada:** colocar `requireRole` em cada router que o garçom não pode ver, que era o que existia (só 3 routers barravam o garçom).
- **Justificativa:** no modelo antigo, todo router novo nascia **aberto** para o garçom até alguém lembrar de fechar. Foi assim que ele chegou a `/reservations`, `/guests` e `/payments`, com dados pessoais de hóspedes. A allowlist inverte isso: router novo nasce **fechado**. É a regra "allowlist, nunca blocklist" do `CLAUDE.md`.

### D-2 — Bloco A separado e antes da comanda
- **Justificativa:** o vazamento já estava em produção e independia da comanda. Esperar os Blocos B–D o deixaria aberto por mais dias, sem ganho nenhum.

### D-3 — RN-005 vale por estadia: `(reservation_id, room_id)`
- **A regra da MER:** "duas contas no mesmo `room_id` não podem ambas cobrar diária".
- **Alternativa descartada:** um índice único só por `room_id`.
- **Justificativa:** ao pé da letra, a conta da estadia anterior (mesmo fechada e paga) impediria a próxima estadia no mesmo quarto de cobrar diária. O quarto ficaria travado para sempre. O que a RN-005 quer evitar é cobrar **a mesma estadia** duas vezes. O índice é parcial: conta excluída não disputa. Na reserva com vários quartos, cada quarto tem a sua diária, como a MER já previa.

### D-4 — `charges_lodging` só pode ser `true` em conta `ROOM`
- **Justificativa:** não existe diária em mesa, balcão, day-use ou conta interna. O servidor grava `false` nesses tipos e o banco recusa o contrário.
- **Cuidado para o Bloco C:** o padrão da coluna é `true` (MER). Um INSERT de conta `TABLE` sem informar o campo é recusado pelo banco, então o controller precisa gravar `false` explicitamente.

### D-5 — Vínculos exigidos por tipo de conta
| Tipo | Reserva | Quarto | Hóspede |
|---|---|---|---|
| `ROOM` | obrigatória, e precisa estar `CHECKED_IN` (verificado no Bloco C) | obrigatório, e precisa ser quarto da reserva | obrigatório |
| `DAY_USE` | proibida | livre | opcional |
| `TABLE` | proibida | livre | proibido |
| `DIRECT` | proibida | livre | opcional |
| `INTERNAL` | proibida | livre | proibido |

- **Justificativa:** é a tabela de cenários da MER 4.11. Só a conta de suíte é ligada a uma estadia, e é isso que permite consumo sem hospedagem (RF-020). Conta interna não tem responsável porque é custo do hotel, não venda (RN-006).

### D-6 — Índice de `client_item_id` é único **total**
- **Alternativa descartada:** o índice parcial (`WHERE deleted_at IS NULL`), que é a regra do projeto para todo model com soft delete.
- **Justificativa:** o celular do garçom reenvia lançamentos quando a rede volta (RN-008). Com índice parcial, um item excluído pela recepção **liberaria** o mesmo `client_item_id`, e o reenvio da fila recriaria o item, cobrando o hóspede de novo. Aqui, um valor excluído **não pode** voltar. É a única exceção à regra dos paranoid no projeto, e está nomeada no teste de guarda (`db-constraints.test.js`).
- **Comportamento da API (Bloco D):** o reenvio responde 200 com o item existente. Para item já excluído, a resposta ainda está em aberto: devolver o item com `deleted_at` ou responder 409.

### D-7 — `deleted_by` no `AccountItem`
- **Justificativa:** apagar um lançamento é um ato financeiro, e a trilha de auditoria precisa dizer quem fez. O `consumptions` atual já tem `deleted_by`, e a T-04.2 precisa migrá-lo sem perder (CA-04.2.c). A MER ainda não tem a coluna; vai como sugestão para a próxima versão do Doc 04.

### D-8 — Quem pode o quê em `/accounts`
| Ação | WAITER | RECEPTIONIST | ADMIN |
|---|---|---|---|
| Listar e ler contas | ✅ | ✅ | ✅ |
| Abrir conta `TABLE` e `DIRECT` | ✅ | ✅ | ✅ |
| Abrir conta `ROOM`, `DAY_USE` e `INTERNAL` | — | ✅ | ✅ |
| Lançar item faturável | ✅ | ✅ | ✅ |
| Lançar cortesia (`billable: false`) | — | ✅ | ✅ |
| Excluir item | — | — | ✅ |

- **Justificativa:** o garçom lança o que vende, mas não decide o que o hotel dá de graça (CA-04.1.l) nem apaga o que foi cobrado. Excluir lançamento fica só com o ADMIN pelo mesmo motivo da D-7: é ato financeiro.

### D-9 — Endpoints fora do escopo
- **Fora:** `PUT /accounts/:id` e `DELETE /accounts/:id`. **Dentro:** excluir item.
- **Justificativa:** nenhum critério de aceite pede editar ou apagar a conta (YAGNI). Fechar a conta é a T-04.3; dividir é a T-04.6. Excluir item entra porque lançamento errado acontece todo dia no balcão.

### D-10 — CHECK `total = quantity × unit_price`
- **Alternativa descartada:** só `total >= 0`, como está na MER.
- **Justificativa:** o total é o dinheiro que o hóspede paga. O CA-04.1.c já exige que o servidor calcule; o CHECK garante que nem um bug no controller nem um INSERT manual gravem um total divergente.
- **Conferido contra os requisitos, sem conflito:**
  - T-04.2: o consumo antigo migra como `quantity 1`, com `unit_price = amount`.
  - T-04.6: a divisão é de **contas**, não de itens.
  - RN-007: a cortesia mantém o total.
  - Nenhum RF tem desconto por item.
  - Inteiro × `NUMERIC(10,2)` é exato, então não há falso positivo por centavo.
- **Custo aceito:** se um dia surgir desconto por item, o CHECK precisa ser revisto. A revisão vai ser explícita, e não um defeito silencioso.

### D-11 — O índice da D-6 fica fora do model
- **Justificativa:** a regra 8 do `qa_checks.sh` (nenhum model paranoid com índice único total) continua sem exceção para models. A única exceção do projeto fica num lugar só (`applyDbConstraints.js` e `schema.sql`) e nomeada no teste. Um comentário no `AccountItemModel` aponta para lá.

### D-12 — As regras de D-4 e D-5 também viram CHECK no banco
- **Alternativa descartada:** validar só no controller.
- **Justificativa:** é o mesmo raciocínio do `EXCLUDE` anti-double-booking das reservas. Regra que mexe com dinheiro não depende só de cada controller lembrar de validar. Os 422 com mensagem continuam sendo do Bloco C; o banco é a segunda barreira.

### D-13 — Sem CHECK próprio para `total >= 0`
- **Justificativa:** já é consequência de `quantity > 0`, `unit_price >= 0` e `total = quantity × unit_price`. Um CHECK redundante também impediria provar cada regra isoladamente: um preço negativo seria recusado pela regra errada e o teste não saberia distinguir.

### D-14 — Hóspede da conta `ROOM`: qualquer hóspede do hotel
- **Alternativa descartada:** só o titular da reserva.
- **Justificativa:** o cenário "pessoas diferentes na mesma suíte, contas separadas" (SPEC-04 §3) exige abrir a conta no nome do acompanhante. O banco não registra quem está hospedado em cada quarto, então não há como restringir mais do que "hóspede deste hotel". A busca filtra por `tenant_id`.

### D-15 — `label` obrigatório e enviado pelo cliente, em todos os tipos
- **Alternativa descartada:** gerar automaticamente ("Suíte 201 — João").
- **Justificativa:** o garçom lista as contas. Um rótulo gerado colocaria o nome do hóspede na tela dele sem ninguém ter escolhido isso (LGPD). Quem abre a conta decide como ela aparece.

### D-16 — Reserva, quarto ou hóspede de outro hotel → 404
- **Justificativa:** é o padrão do sistema (`CreateReservationController`) e não confirma que o id existe em outro hotel. As FKs de `accounts` só garantem que o registro existe, não de qual hotel ele é, então o controller busca cada vínculo filtrando por `tenant_id`.

### D-17 — Recusa do banco da comanda vira 422 num utilitário próprio
- **Alternativa descartada:** reaproveitar o `uniqueConstraintConflict`.
- **Justificativa:** ele responde 409, e a RN-005 é regra de negócio (CA-04.1.k pede 422), não duplicata de cadastro. O `accountRuleViolation` mapeia o nome de cada constraint da comanda para a mensagem da regra. Constraint sem entrada segue para o 500, para não mascarar um defeito de verdade.

### D-18 — Resposta das contas sem hóspede nem reserva
- **Justificativa:** o garçom também lista e lê contas (D-8). A resposta traz só os ids e o `label`, nunca o objeto do hóspede ou da reserva. Quem precisa dos dados pessoais usa `/guests`, que o garçom não alcança (D-1).

### D-19 — Reenvio de item já excluído → 200 com `deleted_at` (fecha o ponto aberto da D-6)
- **Alternativa descartada:** 409.
- **Justificativa:** a fila do celular só precisa saber que o lançamento foi recebido, para parar de reenviar. Um 409 seria tratado como erro: a fila tentaria de novo ou alertaria o garçom sem motivo. Com o `deleted_at` preenchido, o app ainda pode mostrar "excluído pela recepção". O reenvio é reconhecido **antes** de checar papel e status da conta: um item que entrou antes do fechamento continua aceito no reenvio. O mesmo `client_item_id` em outra conta do hotel dá 409 (bug do app, não reenvio).

### D-20 — `quantity` entre 1 e 9999, padrão 1
- **Justificativa:** o padrão 1 é o caso comum ("uma cerveja"). O teto existe porque um valor acima do `INTEGER` do banco derrubava a API com 500 (achado do qa-redteam). Mais de 9999 num lançamento só é erro de digitação.

### D-21 — Garçom só lança item do cardápio, faturável
- **Alternativa descartada:** aceitar avulso do garçom com preço maior que zero.
- **Justificativa:** o qa-redteam mostrou que o garçom lançava avulso a preço 0 (cortesia sem motivo, fora do relatório) ou a R$ 0,01 (venda abaixo do cardápio). Exigir preço > 0 ainda deixaria o garçom definir o preço. Lançamento avulso e cortesia ficam com ADMIN e RECEPTIONIST: quem define o preço define também se o item sai de graça. Com `product_id`, o preço e a descrição enviados pelo cliente são ignorados, e valem os do cardápio, pelo mesmo princípio do CA-04.1.c.

### D-22 — Conta `ROOM` só recebe item com a reserva `CHECKED_IN`
- **Justificativa:** depois do check-out o hóspede já saiu, e o qa-redteam reproduziu o garçom lançando na suíte mesmo assim. Fechar a conta automaticamente no check-out é da T-04.3; até lá, esta regra impede a cobrança indevida.

### D-23 — Recusas de regra em 422
- **`reason` em item faturável → 422.** "Cobrado, com motivo cortesia" é contraditório e confundiria o relatório de consumo interno (T-04.7).
- **Excluir item de conta `CLOSED` ou `PAID` → 422.** A conta já foi apresentada ou paga; mudá-la alteraria o que o hóspede recebeu.
- **Preço com mais de 2 casas → 400.** Antes era arredondado sem aviso.

### D-24 — `total` de conta `INTERNAL` no GET soma os itens; o total zero é regra do fechamento
- **Achado do qa-redteam:** a CA-04.3.f pede que a conta `INTERNAL` feche com `total: 0`.
- **Decisão:** a regra se aplica no `/bill` da T-04.3, não na tela da comanda. Ali, saber quanto custou a refeição da equipe é informação útil para o gestor (RN-006 trata de **receita**, não do custo exibido).

---

## 3. Pontos em aberto, herdados pelos próximos blocos

| # | Ponto | Quando |
|---|---|---|
| 1 | ~~Resposta ao reenvio de `client_item_id` de item já excluído (D-6)~~ ✅ D-19 | Bloco D |
| 2 | ~~Recusas do banco viram 422 com mensagem, nunca 500~~ ✅ D-17 | Bloco C |
| 3 | ~~Conta `ROOM` confere o quarto em `reservation_rooms`~~ ✅ testado com reserva multiquarto | Bloco C |
| 4 | `consumptions.amount` é `(12,2)` e `account_items.total` é `(10,2)`: a migração confere antes (CA-04.2.a) | T-04.2 |
| 5 | Sugerir na MER: `deleted_by` (D-7) e o escopo por estadia da RN-005 (D-3) | Próxima versão do Doc 04 |
| 6 | Conta `INTERNAL` fecha com total 0 (D-24, CA-04.3.f) e conta `ROOM` fecha no check-out (D-22) | T-04.3 |
| 7 | `GET /accounts` sem paginação: o garçom recebe o histórico inteiro de rótulos (achado 🟢 do qa-redteam) | T-06.10 (paginação de todas as listagens) |
