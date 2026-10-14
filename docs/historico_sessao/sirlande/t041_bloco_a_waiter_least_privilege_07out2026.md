### 2026-10-07 — Sirlande (orquestrando Claude Code)

- **Branch:** `fix/waiter-least-privilege` · **Tarefa:** T-04.1, Bloco A (SPEC-04 §6 — CA-04.1.n.2, n.3)
- **Horário:** noite de 07/10, depois da revisão do PR #82
- **Objetivo:** fechar o vazamento de dados pessoais pelo papel `WAITER`, antes das comandas existirem

#### Spec da T-04.1 — divisão em blocos (aprovada em 07/10)

| Bloco | Conteúdo | CAs | Branch |
|---|---|---|---|
| **A** ✅ | Least privilege do `WAITER` | n.2, n.3 | `fix/waiter-least-privilege` |
| B | `AccountModel`, `AccountItemModel`, `schema.sql`, `relations.js`, constraints + testes de banco | m, parte de k | `feature/t04-1-accounts` |
| C | `POST/GET /accounts`, `GET /accounts/:id`, regras por tipo, RN-005 | f, h, k, m | idem |
| D | `POST /accounts/:id/items`, `DELETE …/items/:itemId`, idempotência, cortesia, swagger + api-client | a–e, g, i, j, l, n.1 | idem → qa-redteam → merge |

#### Decisões (D-1 a D-9 aprovadas pelo Sirlande; as que guiam os blocos B–D ficam aqui para a próxima sessão)

| # | Decisão | Escolha | Motivo |
|---|---|---|---|
| D-1 | Bloqueio do WAITER | Allowlist no `authMiddleware` (fail-safe) | Router novo nasce fechado; regra do CLAUDE.md |
| D-2 | Bloco A separado e antes | Sim | Vazamento já em produção, independe da comanda |
| D-3 | Escopo da RN-005 | Uma conta com `charges_lodging` por `(reservation_id, room_id)` viva — índice parcial + 422 | Ao pé da letra trava o quarto entre estadias |
| D-4 | `charges_lodging` fora de `ROOM` | Servidor força `false` | Não há diária em DAY_USE/TABLE/DIRECT/INTERNAL |
| D-5 | Regras por tipo | `ROOM` exige reserva `CHECKED_IN` + quarto da reserva + `guest_id`; DAY_USE/TABLE/DIRECT sem reserva; INTERNAL sem reserva e sem hóspede | MER 4.11 |
| D-6 | Índice de `client_item_id` | Único **total**, exceção documentada à regra 8 e ao teste "nenhum paranoid com índice total"; reenvio → 200 com o item existente | Idempotência precisa sobreviver à exclusão |
| D-7 | `deleted_by` no `AccountItem` | Adicionar; sugerir no MER | Auditoria financeira; a T-04.2 precisa preservar o `deleted_by` do consumo |
| D-8 | Papéis em `/accounts` | WAITER: lista/lê, abre TABLE/DIRECT, lança item faturável. RECEPTIONIST/ADMIN: tudo. Excluir item: só ADMIN | Garçom não dá cortesia nem apaga lançamento |
| D-9 | Endpoints fora do CA | Fora `PUT` e `DELETE /accounts/:id`; dentro excluir item | YAGNI; close é T-04.3, split é T-04.6 |

#### O que foi feito

1. Research: o WAITER alcançava `/reservations` (com dados de hóspede), `/guests`, `/payments`, check-in/out, `/bill`, B2B, `/tenants` e `/room-categories`. Só `/rooms`, `/users` e `/analytics` o barravam.
2. TDD: teste com um 403 por router autenticado, usando IDs reais. RED com 19 falhas, que provam o vazamento.
3. Allowlist em `app/utils/roles.js` (`isRouteAllowedForRole`), aplicada no `authMiddleware` depois da verificação do JWT.
4. `/security-review`: nenhuma vulnerabilidade. `qa-redteam` (`docs/qa/redteam_waiter-least-privilege_07out2026.md`): aprovado com ressalvas, sem nenhum bypass entre 13 tentativas (path traversal, encoding, maiúsculas, absolute-form, method override).
5. Ressalvas corrigidas: regras de `/accounts` por rota (o prefixo deixaria o garçom herdar `/bill` e `/close`); papel desconhecido negado; teste unitário da função, provado por mutação (tirar a âncora quebra 2 testes, liberar papel desconhecido quebra 1).

#### Verificação

- Testes: 328 passed + 1 skip · `qa_checks.sh`: sem erro · `/security-review`: limpo · qa-redteam: aprovado com ressalvas, todas corrigidas · CI: **pendente** (sem rede no fim da sessão)

#### Commits

| Hash | Mensagem |
|------|----------|
| `6ec4c85` | `fix(auth): WAITER restrito a allowlist (cardapio e comandas)` |
| `318b1db` | `fix(auth): allowlist do WAITER por rota e papel desconhecido negado` |
| (este) | `docs(historico): relatorio do Bloco A da T-04.1 (07/10)` |

#### Pendências

| # | Pendência | Prioridade | Observação |
|---|-----------|-----------|------------|
| 1 | **Push da branch → CI verde → merge em develop → push** | 🔴 Alta | Ficou sem rede. O vazamento só fecha em produção depois disso |
| 2 | 403 do WAITER não documentado no `swagger.js` | 🟢 Baixa | Combinar com o Gabriel (regra de colisão). Não quebra contrato: ADMIN/RECEPTIONIST não mudam e a `/comanda` do front não chama API |
| 3 | `HEAD /products` e `/Products` → 403 para o WAITER | 🟢 Baixa | Nega a mais, nunca libera. Se um gateway (ADR-003) não remover o prefixo, o garçom leva 403 em tudo — verificar na T-01.4 |
| 4 | Usuário rebaixado a WAITER mantém o papel antigo até o JWT expirar | 🟢 Baixa | Anterior a esta branch; risco residual, liga com a T-06.7 (refresh token) |
| 5 | Ao criar o router `/accounts` (Bloco C/D) | — | A allowlist já tem as regras de `/accounts`. Os testes unitários dizem o que o garçom pode; o `requireRole` e a D-8 cobrem o resto |
| 6 | Próximo: **Bloco B** da T-04.1 numa sessão nova | — | Decisões D-3 a D-9 acima |
