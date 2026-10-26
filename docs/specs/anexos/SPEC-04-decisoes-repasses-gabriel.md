# SPEC-04 · Anexo — Aval aos repasses do Gabriel em `accounts` (PR #101)

**Responsável:** Sirlande (orquestrando Claude Code) · **Data:** 26/10/2026
**Estado:** ✅ aprovado pelo Sirlande, dono de `accounts`
**Fonte:** `docs/historico_sessao/gabriel/repasses_conta_quarto_webhook_21102026.md` e `docs/retomada/fix-repasses-gabriel-out.md`
**Continua:** `SPEC-04-decisoes-T-04.4.md` (D-42 a D-50). A numeração segue daqui.

> O PR #101 (Gabriel, mergeado em `develop` em 24/10) mudou código de `accounts` para fechar repasses do qa-redteam.
> Aqui fica o aval do dono do módulo e as regras que passam a valer para as próximas fatias (T-04.5 em diante).

---

## 1. O que mudou em `accounts`

| Mudança | Onde |
|---|---|
| Troca do quarto principal e remoção de quarto extra levam as contas abertas junto | `app/utils/roomChangeAccounts.js` (novo), `UpdateReservationController`, `RemoveRoomFromReservationController` |
| `POST /accounts` do tipo ROOM trava a reserva antes das checagens | `AccountApi/CreateAccountController.js` |
| Lançamento em conta que some antes da trava responde 404, não 500 | `AccountApi/CreateAccountItemController.js` |
| Um teste meu reconstrói no banco o estado legado "duas contas de diária depois da troca", que a API não gera mais | `tests/account-bill.test.js` |

Conferido em 26/10: os 5 arquivos de teste de contas e quartos passam (207 testes).

---

## 2. Decisões

| # | Decisão | Por quê |
|---|---|---|
| **D-51** | Quem troca ou remove quarto da estadia leva as contas **abertas** daquele quarto, com itens e pagamentos. Na troca do principal, se o quarto novo já tem conta de diária desta reserva, a troca é recusada (409, com `account_ids`). Na remoção do extra, nunca recusa: se o principal já tem conta de diária, a conta movida passa a `charges_lodging: false`, e o rótulo do sistema vira "Suíte 701 · ex-702" | A conta ROOM é do quarto da estadia (D-5), e cada quarto tem no máximo uma conta de diária (RN-005, D-3). Recusar a remoção prenderia a família ao quarto devolvido. O "ex-702" separa as contas no celular do garçom, que lista só pelo rótulo (D-15), sem mandá-lo ao quarto que já saiu da estadia |
| **D-52** | Contas `CLOSED` e `PAID` do quarto que sai **ficam onde estão** | Conta fechada já foi apresentada e não muda mais (D-23, D-39). A de diária nunca está nesse caso, porque só fecha com a estadia encerrada (D-41) |
| **D-53** | `POST /accounts` do tipo ROOM trava a reserva primeiro (aplicação da D-48). O `realignStaleLodgingAccount` (D-32) continua fora da transação, como rede para dado legado | Sem a trava, a criação e a remoção de extra se cruzavam e o banco derrubava uma delas por deadlock (500) |

### Restrição que nasce da D-53

O `realignStaleLodgingAccount` roda numa **segunda conexão** enquanto a primeira segura a trava da reserva. Hoje isso é seguro porque todo caminho trava reserva → contas (D-48). **Um caminho novo que trave conta antes da reserva trava a requisição até o timeout, sem o banco acusar deadlock**, porque a espera entre as duas conexões fica na aplicação e o banco não a enxerga. Vale para a T-04.5, a T-04.6 e o check-out.

---

## 3. Pontos em aberto

| # | Ponto | Quando |
|---|---|---|
| 1 | Com a D-51, o `realignStaleLodgingAccount` só serve para dado anterior a 21/10. Avaliar removê-lo depois que o `migrate` rodar em produção | Depois do deploy da R1 |
