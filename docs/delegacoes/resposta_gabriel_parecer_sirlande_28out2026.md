# Resposta do Gabriel ao parecer do Sirlande sobre o plano do MVP

> **Data:** 28/10/2026
> **Parecer respondido:** "Parecer do Sirlande sobre o plano do MVP" (28/10), que revisa `docs/PLANO_MVP_ATE_10DEZ2026.md`
> **Decisão final:** ponto de controle de **03/11** (02/11 é feriado)

Concordo com o diagnóstico: a grade estava cerca de 2 semanas atrás do trabalho feito, e o gargalo é integração, não implementação. Abaixo está a posição sobre cada pedido e o que já está em execução do meu lado.

---

## 1. Pedidos feitos ao Gabriel

| Pedido | Posição |
|---|---|
| Confirmar a ordem e as datas da integração | **Confirmado**, com a mesma ordem e as mesmas datas (§2) |
| Aceitar a tabela de metas (M1 a M10) como forma de acompanhar | **Aceito.** O `PAINEL_DE_ANDAMENTO_MVP.md` passa a ser organizado por meta, e não mais por tarefa |
| Risco de o Gabriel estar no caminho crítico | **Aceito como risco.** Mitigações no §4 |

## 2. Integração: ordem e situação em 28/10

As 4 branches estavam 109 commits atrás da `develop`, porque T-04.5, T-04.6, T-04.7 e T-05.5 entraram depois delas. Cada uma está recebendo agora um merge da `develop`, com a suíte rodando de novo. O merge na `develop` só acontece depois que o qa-redteam der o veredito.

| Ordem | Branch | Meta | Data | Situação em 28/10 |
|---|---|---|---|---|
| 1 | `fix/tenant-fk-validation` (vazamento de FK entre tenants, R-1 a R-6) | segurança | 29/10 | 901 testes verdes; qa-redteam rodando; recebendo a `develop` |
| 2 | `feature/analytics-service` (H.2) | M7-a | 29/10 | Aprovada com ressalvas, já corrigidas; reauditoria delta rodando; recebendo a `develop` |
| 3 | `feature/t051-quartos-categorias` | M1 | 30/10 | Aprovada com ressalvas; recebendo a `develop`, com `pnpm gen:api` depois |
| 4 | `feature/t052-reservas` (inclui o walk-in e a conta em linha do tempo) | M2 e M5-a | 30/10 | Fechando as ressalvas da reauditoria; recebendo a `develop` |

Regras desta integração:
- **Contrato gerado não se resolve à mão.** O conflito em `openapi.json` e `schema.d.ts` é resolvido regenerando o `api-client` depois de cada merge, nunca editando o arquivo.
- **`App.tsx`:** a t051 tenta isolar as rotas de quartos num módulo próprio antes do merge, para que a t052 não precise mexer na mesma região. O conflito com a comanda (T-05.5) se resolve preservando as duas.
- **A t051 e a t052 recebem a `develop` duas vezes:** agora, e de novo depois que a branch anterior da fila entrar.
- **M5-b (tela de pagamento) começa sobre a `develop` já com a t052**, como o parecer propõe. Reviso a tela antes de 07/11.

## 3. Minhas metas e datas

| Meta | O que é | Data | Como fica |
|---|---|---|---|
| M7-a | H.2 na `develop` | 29/10 | Em integração (§2) |
| M1, M2, M5-a | t051 e t052 na `develop` | 30/10 | Em integração (§2) |
| — | PR de release com o que estiver integrado | 03/11 | Abro depois que as 4 branches entrarem; o Sirlande aprova no GitHub |
| M4 | Painel Hoje (T-05.3) | 10/11 | Começa em 31/10, sobre a `develop` com a t052, porque o painel consome as reservas do dia |
| M7-b | H.3 (indicadores) | 14/11 | Começa em 30/10, logo depois da M7-a, com 2 ou 3 indicadores próprios. Os da T-05.6 entram se chegarem (§4) |
| Docs 05 e 07 | Versão final | até 07/11 | Doc 05 v1.2 em redação (1× t3.small); Doc 07 recebendo a `develop` e revisão das ADRs (PR #97 deixa de estar parado) |
| — | Revisão da M5-b | antes de 07/11 | Comprometido |
| — | Apoio a M5-c e M8 | 10/11 e 17/11 | Comprometido |
| M9 | Congelamento e ensaio, com zero 🔴 aberto | 24/11 | Lidero |
| M10 | Release `develop → main` | 01/12 | Lidero; o Sirlande aprova |

## 4. Mitigação do caminho crítico

1. **H.3 não depende da T-05.6.** Ela nasce com 2 ou 3 indicadores calculados no próprio analytics-service: ocupação do dia, chegadas e saídas, e receita do dia. Se a T-05.6 não tiver branch até 04/11, o corte que o parecer prevê já está embutido.
2. **Integração com dia marcado.** As branches deixam de esperar o fim das outras frentes: 29/10 e 30/10 são dedicados a ela.
3. **Nenhum PR aberto por mais de 2 dias.** O PR #99 entra assim que esta resposta for registrada. O PR #97 entra com a versão final do Doc 07.
4. **Passo 5 (pagamento no check-out).** Concordo que o Sirlande assuma a M5-b, o que tira o CA-05.6.a da T-05.6 e reduz a carga do Weslley.

## 5. Posição do Gabriel nas decisões de 03/11

São propostas para a reunião, não decisões tomadas.

| # | Decisão | Proposta |
|---|---|---|
| 1 | Tabela de metas | Aceitar |
| 2 | M5-b, M5-c e M8 com o Sirlande | Aprovar |
| 3 | Ordem e datas de integração | Confirmada (§2) |
| 4 | Escopo do Weslley | Ele confirma ou devolve até 04/11. Se devolver a T-05.6, a H.3 já cobre o mínimo |
| 5 | Passo 6: como o hóspede faz a reserva direta | **Chamada pela API pública** (Swagger ou `test_rotas.sh`) na demonstração. O app `booking` continua no pós-TCC; uma tela mínima agora competiria com o congelamento de 24/11 |
| 6 | Fechamento de conta só no balcão? Conta INTERNAL aceita item faturável? | Fechamento **só no balcão** no MVP. Para a conta INTERNAL, **manter o comportamento atual**, sem regra nova antes do congelamento: o item é gravado, mas a conta nunca soma receita. Hoje o bill e o total dão 0, `POST /payments` recusa com 422 (RN-006, CA-04.3.f) e o relatório da T-04.7 conta todos os itens da conta como consumo interno. Recusar `billable: true` em conta INTERNAL fica como melhoria pós-MVP, se o time preferir |
| 7 | `e2e/` com Playwright no CI | **Sim, como job não bloqueante** até o congelamento, cobrindo o roteiro de 7 passos. O workflow fica com o Weslley; o roteiro E2E já está no painel |

## 6. Lembretes para outros responsáveis

- **Weslley:** confirmar no painel do Asaas a revogação da chave de produção (exclusão registrada em 16/10). Até a confirmação, o item continua 🔴.
- **Sirlande:** registrar como D-xx na SPEC-04 as mudanças em `accounts`, quartos e categorias que vêm da `fix/tenant-fk-validation`: códigos de erro e 409 de categoria em uso.
