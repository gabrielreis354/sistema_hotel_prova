### 2026-11-09 — Sirlande (orquestrando Claude Code)

- **Branch:** `feature/m5b-pagamento-checkout` · **Tarefa:** M5-b, CA-05.6.a (SPEC-05)
- **Horário:** sessão única, 09/11
- **Objetivo:** tela para a recepção registrar o pagamento no check-out (passo 5 do roteiro da banca)

#### Decisões
Detalhe, alternativas e justificativas em `docs/specs/anexos/SPEC-05-decisoes-CA-05.6.a.md`.

| # | Decisão | Escolha | Motivo |
|---|---|---|---|
| P-1 | Pagar pela reserva ou por conta | Pela reserva | O saldo da tela é o da estadia; o backend reparte (D-45) |
| P-2 | Quando mostrar o formulário | CHECKED_IN/CHECKED_OUT, saldo > 0, ADMIN/RECEPTIONIST (allowlist) | Fail-safe; sinal no balcão fora do roteiro |
| P-3 | Parcial e a maior | Parcial livre; a maior com confirmação | Backend aceita (D-44); um dígito a mais virava estorno |
| P-4 | Trava de papel no `POST /payments` | Retirada | O garçom já é barrado pela allowlist do WAITER (testado) |
| P-5 | `amount` no Swagger | Texto decimal | Valor não passa por float no cliente |
| P-6 | Link C-19 | Só conta da suíte | Mesa e day-use não têm tela de pagamento |
| P-7 | Pagamento duplicado | Trava na tela; chave no servidor depois | Perto do congelamento |
| — | Repasse 🟡 (consumo antigo, D-31) | Fechado sem mudança | `settleAccount` não marca PAID com consumo pendente (`accountBill.js:79`) |
| — | Repasse 🟢 (reserva cancelada aceita pagamento) | Depois do congelamento | Fora do roteiro; a tela não oferece |

#### O que foi feito
1. Pesquisa: o backend (T-04.4) já cobria o passo 5. A entrega é quase toda frontend, mais o `amount` do Swagger em texto e o `api-client` regenerado.
2. `paymentLogic.ts` com TDD (RED → GREEN): quem vê o formulário, leitura do valor sem float, passo do envio e corpo do pedido.
3. `createPayment` e `useCreatePayment`: falha de rede e 502/503/504 sem resposta do backend mandam conferir a conta antes de repetir.
4. `PaymentForm` na aba Conta da reserva, e link "Receber na reserva" no aviso de conta da suíte fechada (C-19).
5. Mutação manual, Playwright em desktop e 375×812, qa-redteam (4 achados corrigidos) e `/security-review` (limpo).

#### Verificação
- Testes: PMS com 233 passed, backend com 1130 passed, tipos limpos · qa_checks.sh: OK (3 avisos anteriores, fora do diff) · CI: a conferir no PR de release · qa-redteam (diff): aprovado com ressalvas, corrigidas → `docs/qa/redteam_m5b-pagamento-checkout_09nov2026.md`
- Navegador: 11 checagens no celular e 10 no desktop, mais o C-19 (anexo §3).
- **Falta:** revisão da tela pelo Gabriel e revisão humana (dinheiro) antes do merge na `develop`.

#### Commits
| `cd22f08` | `fix(pms): achados do qa-redteam no pagamento do check-out (M5-b)` |
|---|---|
| `ca006cd` | `test(pms): RED dos achados do qa-redteam do M5-b (Enter na confirmacao, gateway, conta sem recarga)` |
| `db05834` | `docs(qa): qa-redteam do M5-b e repasse ao Sirlande (pagamento so por reserva)` |
| `3eaa9b8` | `test(pms): valor do pagamento sempre com duas casas (achado da mutacao)` |
| `21fdb1e` | `fix(pms): rotulo do valor acima do campo no desktop (M5-b)` |
| `ee9d3bc` | `feat(pms): aviso de conta fechada leva a receber na reserva (C-19, M5-b)` |
| `4500d87` | `test(pms): RED do link para receber o saldo da conta da suite (C-19)` |
| `69fbced` | `feat(pms): registrar pagamento na conta da reserva (M5-b, CA-05.6.a)` |
| `496d702` | `feat(pms): createPayment e useCreatePayment para o check-out (M5-b)` |
| `d9d0c97` | `feat(pms): regras do pagamento no check-out (M5-b)` |
| `3b97972` | `test(pms): RED das regras do pagamento no check-out (M5-b)` |
| `d8088a6` | `chore(api-client): regenera com o amount do POST /payments em texto` |
| `4de1c4c` | `docs(swagger): amount do POST /payments em texto decimal (M5-b)` |

#### Pendências
| # | Pendência | Prioridade | Observação |
|---|---|---|---|
| 1 | Revisão da tela (Gabriel) e revisão humana, depois o merge na `develop` | Alta | Prazo da M5-b era 07/11 |
| 2 | M5-c: endpoint de itens estornados com `deleted_by` (CA-05.2.j) | Alta | Prazo 10/11 |
| 3 | M8: seed com as datas do dia | Alta | Prazo 17/11; sem ele, os passos 4 e 7 aparecem zerados |
| 4 | Chave contra repetição no `POST /payments`; pagamento de conta avulsa; allowlist de status da reserva no servidor | Baixa | 5º semestre (anexo §4) |
| 5 | Trocar o `TOUCH` local do `PaymentForm` pelo componente promovido | Baixa | Segundo módulo a usar o ajuste de `rooms/components/touch.ts` (regra do CATALOGO.md) |
| 6 | Erro desta sessão: um `git checkout` para desfazer mutante apagou correções ainda não commitadas | — | Reaplicadas e reverificadas. Daqui em diante: commitar antes da mutação, ou restaurar o mutante pelo `git stash` |
