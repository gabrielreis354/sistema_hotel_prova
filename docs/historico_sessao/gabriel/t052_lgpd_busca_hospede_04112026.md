# T-05.2 pós-merge — LGPD e contrato da busca de hóspede — 04/11/2026

**Desenvolvedor:** Gabriel (orquestrador) / Claude Code
**Branch:** `fix/t052-lgpd-busca-hospede` (a partir de `origin/develop`), sem PR
**Origem:** 🟢-1, 🟢-2 e 🟢-3 da reauditoria delta 2 (`docs/qa/redteam_t052-reservas_delta2_02nov2026.md`)

## O que mudou

| Achado | Correção |
|---|---|
| 🟢-3 contrato | `GET /guests?q=` com menos de 3 caracteres (depois do trim) → 400 `{ error, code: 'INVALID_INPUT', field: 'q' }` (reusa `invalidInputBody`). Swagger com `minLength: 3`. Sem `q`, contrato antigo intacto. |
| 🟢-1 dado mínimo | Modo busca devolve só `id`, `full_name`, `cpf` (`***.456.789-**`) e `phone` (`****-1111`), via `app/utils/guestSearchResult.js`. O filtro roda no servidor sobre os dados completos. Schema `GuestSearchResult` no Swagger; api-client regenerado. `GuestPicker` exibe o que o servidor manda, sem e-mail. |
| 🟢-2 UX | 404 cujo corpo é "Hóspede não encontrado" vira `GuestNotFoundError`: seleção limpa, "Confirmar" desabilitado até nova escolha, mensagem de hóspede. 404 de quarto mantém o texto de quarto. |

## Commits (RED e GREEN separados)
1. `test(guests)`: RED do contrato e do dado mínimo
2. `fix(guests)`: busca exige 3 caracteres e devolve só o necessário
3. `chore(pms)`: jsdom e testing-library (o app não tinha teste de componente)
4. `test(reservations)`: RED do 404 de hóspede
5. `fix(reservations)`: 404 limpa a seleção; GuestPicker mascarado
6. `docs`: SPEC-05 e este relatório

## Verificação (saída real)
- Core, `npx vitest run`: 53 arquivos, **1130 passed | 1 skipped**.
- Frontend, `pnpm turbo run typecheck test build`: **7/7 tarefas verdes** (pms: 201 testes, incluindo o de componente).
- `bash scripts/qa_checks.sh`: 0 erros, 3 avisos (2 são `<button>` cru no dublê do teste e na tela de hóspedes, preexistente; 1 é bloco de classes repetido, preexistente).
- `/security-review`: nenhum achado com confiança ≥ 8.

## Decisões e pendências
- O formato da resposta manteve `full_name`/`cpf`/`phone` (não `name`/`cpf_masked`) para o `Guest` do api-client continuar servindo.
- O 404 da criação de reserva não tem `code`; a distinção hóspede×quarto lê o texto de `CreateReservationController`. **Pendência:** dar `code` (`GUEST_NOT_FOUND`/`ROOM_NOT_FOUND`) a esse 404 e trocar a leitura do texto.
- A ficha selecionada após cadastrar hóspede novo mostra o CPF/telefone que a recepcionista acabou de digitar (resposta do POST).
- Atribuição dos commits: `Co-Authored-By: Claude Sonnet 5.5` (a delegação pedia Opus 5.5; o modelo real da sessão foi Sonnet 5.5).
- Próximo passo do Gabriel: disparar o `qa-redteam` e abrir o PR.

## Ambiente
PG próprio `pg-t052lgpd` (porta 5466) removido no fim. Nenhum comando AWS ou Terraform.
