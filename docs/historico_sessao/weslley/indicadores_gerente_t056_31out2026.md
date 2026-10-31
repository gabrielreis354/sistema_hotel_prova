# Indicadores do gerente (T-05.6) — 30 e 31/10/2026

**Dev:** Weslley (sessão orquestrada com Claude Code)
**Branch:** `feature/t056-indicadores`, a partir de `develop` em `e6d135b`. Mesclada em `develop` em 31/10.
**Status:** CA-05.6.b e CA-05.6.c entregues. O qa-redteam deu "mergear com ressalvas", sem 🔴 no escopo, e os 🟡 da tela foram corrigidos antes do merge. CA-05.6.a (pagamentos) e CA-05.6.d (cortesias e perdas) passaram para o Sirlande em 28/10 (`e6d135b`).

## O que foi feito

| Commit | Mudança |
|---|---|
| `c0306fc` | API dos indicadores, período e cartões do dia (`features/analytics/`) |
| `041a525` | `ErrorState` sobe de `apps/pms` para o `@hotel/ui` |
| `dad07bb` | Tela `/indicadores`, só ADMIN (rota e menu). Desktop: receita por mês, sazonalidade, categoria × meio de pagamento e ranking. Celular: 4 cartões do dia |
| `e991361` | `/analytics/top-guests` só para ADMIN no backend (RT-51) |
| `f9397ba` | Swagger do webhook PIX descreve a autenticação de cada provider |
| `d2d51c8` | `/top-guests` não devolve o e-mail do hóspede (minimização, LGPD). Teste novo: outro hotel recebe o ranking vazio |
| `a3b394f` | Swagger do webhook PIX lista `not_approved` e `pending` |
| `fba66fd` | `fillMonths`: o gráfico de receita mostra os meses sem pagamento com zero |
| `8aafc0c` | Chaves do React Query começam pelo `user.id`. No celular, os blocos do desktop saem do DOM e não consultam |
| `e30c721` e o seguinte | Auditoria, repasse ao Gabriel, SPEC marcada e este relatório |

## Evidências

| Verificação | Resultado |
|---|---|
| Suíte inteira do core-service (Postgres 17 em Docker, porta 55432) | 45 arquivos, 991 passam, 1 skipped. Rodada antes dos ajustes de 31/10; `analytics.test.js` rodou de novo depois: 14 passam |
| RED do e-mail no ranking | Falhou com `expected { …(6) } to not have property "email"` antes do fix |
| Testes do `apps/pms` | 101 passam (3 novos do `fillMonths`). `tsc --noEmit` sem erro |
| API com seed (`gestao_hotel_manual`) | ADMIN: 200 nos 7 endpoints. RECEPTIONIST: 403 só em `/top-guests` |
| Tela como ADMIN, 1440 px (Playwright) | 4 cartões (6,7%, R$ 150,00, R$ 10,00, R$ 200,00), gráficos, tabelas e ranking |
| Tela como RECEPTIONIST (Edge, pelo Weslley) | Menu sem Indicadores |

Os cartões do dia só mostram valor com estadia e pagamento em hoje. O seed não tem nenhum dos dois: as reservas `CHECKED_IN` dele são de junho. Para a verificação foi criada, pela API, uma reserva walk-in no quarto 101 (31/10 a 03/11) com check-in e PIX de R$ 200, só no banco local.

## Pendências

1. **Conferir no Edge com o código final.** O Vite no `/mnt/c` não recarrega sozinho (sem aviso de arquivo alterado). Até 13h27 de 31/10, a tela no navegador rodava o código anterior aos ajustes. Depois do restart, falta ver como ADMIN: gráfico de 12 meses e celular a 375 px só com os cartões.
2. **🟢 do qa-redteam na tela, não corrigidos:**
   - formatador de percentual em 3 cópias (`kpis.ts`, `shares.ts`, `IndicatorsPage.tsx`);
   - "Última saída" pode mostrar data futura (`TopGuests.tsx:36`);
   - estado vazio do ranking fala em período, e o bloco não tem período (`Block.tsx:26`);
   - `aria-pressed` com rótulo que muda e uma parada de Tab por barra (`BarChart.tsx:42`);
   - `ErrorState` dentro de `Card` com borda dupla;
   - RT-52 cumprido em parte (ranking e cartões sem troca de período).
3. **Com o Gabriel** (`docs/qa/repasses/para_gabriel_31102026.md`): logout sem `queryClient.clear()` (🔴), barra de baixo com 6 abas espremida em 375 px, `GuestsListPage` sem `ErrorState` e o fuso de `paid_at::date`, que joga pagamento depois das 21h no dia seguinte.
4. **Próximos da trilha:** Doc 08 (prazo 10/11), CA-01.5.a (job do frontend no CI), compose do roteiro inteiro (item 18 do painel), PIX real com ngrok e as 3 ressalvas 🟡 do Asaas.

## Ambiente local usado

- `hotel-test-pg`: imagem `postgres:17` (a `17-alpine` não está local), credenciais do `.env.test`, porta 55432.
- Banco `gestao_hotel_manual`: `node command.js migrate` e `ALLOW_SEED=1 node command.js seed`, com as variáveis do `.env.test` e `POSTGRES_DB` trocado.
- Backend: `node _web.js` na 3000. Frontend: `corepack pnpm --filter app-pms dev` (o `pnpm` não está no PATH do WSL).
- Vitest do `apps/pms`: `--maxWorkers=1` quebra o 2.1.9 ("minThreads and maxThreads must not conflict"). Com pouca memória, use `--poolOptions.forks.singleFork`.
