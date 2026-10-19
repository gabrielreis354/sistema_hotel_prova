### 2026-10-19 — Sirlande (orquestrando Claude Code)

- **Branch:** `feature/t04-1-accounts` (atualizada com `develop` em `1cbc4c0`) · **Tarefa:** T-04.1, Bloco C (SPEC-04 §5)
- **Objetivo:** abrir, listar e ler contas (comanda) pela API, com as regras por tipo, papel e hotel respondidas com o código certo, nunca 500

#### Contexto de abertura

- `develop` local estava 21 commits atrás do remoto: outbox + RabbitMQ (H.1, PR #96) e PIX via Asaas sandbox, ambos do Gabriel. Atualizado por fast-forward, seguido de `npm ci` (entrou `amqplib`).
- Nada do que chegou toca `accounts`, `schema.sql` ou os models da comanda.
- A branch `feature/t04-1-accounts` não tinha nada além do `develop` e foi atualizada por fast-forward.

#### Decisões desta sessão

Aprovadas pelo Sirlande no plano. Justificativa completa em `docs/specs/anexos/SPEC-04-decisoes-T-04.1.md`.

| # | Decisão | Escolha | Motivo |
|---|---|---|---|
| D-14 | Hóspede da conta `ROOM` | Qualquer hóspede do hotel | O cenário da suíte dividida exige a conta no nome do acompanhante; o banco não sabe quem está em cada quarto |
| D-15 | `label` | Obrigatório, enviado pelo cliente | Rótulo gerado poria o nome do hóspede na tela do garçom (LGPD) |
| D-16 | Vínculo de outro hotel | 404 | Padrão do sistema; não confirma que o id existe |
| D-17 | Recusa do banco | `accountRuleViolation` → 422 | O `uniqueConstraintConflict` dá 409, e a RN-005 é regra de negócio (CA-04.1.k) |
| D-18 | Resposta das contas | Sem objeto de hóspede nem de reserva | O garçom também lista e lê contas |

#### O que foi feito

1. **Research:** SPEC-04, anexo de decisões, `AccountModel`, `applyAccountConstraints`, `roles.js`, `ProductApi` (padrão de referência), `CreateReservationController` e o trigger que copia o quarto principal para `reservation_rooms`.
   - Achado: as FKs de `accounts` só garantem que reserva, quarto e hóspede existem, não que são do hotel. Sem filtrar por `tenant_id`, daria para abrir conta apontando para o hóspede de outro hotel.
2. **TDD:** `tests/accounts.test.js`, 50 casos.
   - Os 404 exigem a mensagem do recurso: sem a rota, o 404 do Express passaria como falso verde.
   - O utilitário é importado dentro do próprio teste, para que a ausência dele não derrube o arquivo inteiro.
   - RED: 50 falhas, todas por rota ou módulo inexistente, nenhuma no setup.
3. **`app/utils/accountRuleViolation.js`:** nome da constraint → 422 com a regra. Constraint fora do mapa segue para o 500.
4. **Controllers e router:** `CreateAccountController`, `ListAccountController`, `GetAccountController`, `accountRouter.js` e uma linha no `router.js`.
   - A ordem das checagens dá o código certo: 400 (formato), 403 (papel, D-8), 422 (regra do tipo), 404 (vínculo de outro hotel), 422 (check-in, quarto da reserva, RN-005).
   - Fora de `ROOM`, `charges_lodging: false` é gravado explicitamente (D-4).
5. **Erro de método, corrigido em commit próprio (`931106d`):**
   - O teste de corrida da RN-005 disparava duas requisições em paralelo. Na prática, a segunda via a primeira na checagem prévia e o `catch` nunca rodava.
   - A primeira mutação também estava errada: comentei só o `return`, mas a chamada ao utilitário continuava enviando o 422.
   - Corrigido com um spy de uma única chamada que faz a checagem prévia não ver a conta já gravada, exatamente o que acontece na corrida. Com a mutação certa (sem a chamada ao utilitário), o teste recebe 500 e falha.

#### Verificação

- `npm test`: **618 passed + 1 skip**, em 34 arquivos.
- `tests/accounts.test.js`: 50/50, contra a API real em processo e o PostgreSQL de teste.
- Mutações, cada uma pega por pelo menos um teste:
  - sem a tradução do `catch` → corrida da RN-005 recebe 500;
  - busca do hóspede sem `tenant_id` → "hóspede de outro hotel" deixa de dar 404;
  - sem a checagem de `reservation_rooms` → "quarto que não é da reserva" deixa de dar 422.
- `qa_checks.sh`: sem erro. Aviso novo: `/accounts` fora do `swagger.js`, previsto para o Bloco D. Os outros 3 avisos são anteriores.
- **Não rodados:** qa-redteam e `/security-review`. Pelo plano, rodam depois do Bloco D, antes do merge.

#### Commits

| Hash | Mensagem |
|------|----------|
| `1c95a55` | `test(accounts): abertura e consulta de contas via API (RED)` |
| `7cf8e36` | `feat(accounts): traduz recusas do banco da comanda em 422` |
| `931106d` | `test(accounts): corrida da RN-005 simulada de forma deterministica` |
| `b820cf0` | `feat(accounts): POST/GET /accounts e GET /accounts/:id` |
| (este) | `docs(accounts): relatorio do Bloco C e decisoes D-14 a D-18` |

#### Pendências

| # | Pendência | Prioridade | Observação |
|---|-----------|-----------|------------|
| 1 | **Bloco D**, na mesma branch: `POST /accounts/:id/items`, idempotência do `client_item_id`, cortesia, excluir item, Swagger | — | CAs a–e, g, i, j, l, n.1 e a parte `account_items` do m. O `accountRuleViolation` precisa ganhar as constraints de `account_items`. Decidir a resposta ao reenvio de item já excluído (D-6) |
| 2 | Swagger de `/accounts` | — | `swagger.js` tem dono único (T-06.2). Confirmar com o Gabriel antes de mexer, no Bloco D |
| 3 | qa-redteam com foco em dados + `/security-review` | 🟡 Média | Antes do merge do Bloco D. Precisa cobrir também o schema do Bloco B, que já está em `develop` |
| 4 | `migrate` sobre banco provisionado pelo `schema.sql` falha em `event_quotes.status` | 🟡 Média | Herdada do relatório de 14/10, sem mudança. Combinar com o Gabriel |
| 5 | Branch não mergeada em `develop` | — | Pelo plano, o merge sai depois do Bloco D e do qa-redteam. A branch está no remoto |
