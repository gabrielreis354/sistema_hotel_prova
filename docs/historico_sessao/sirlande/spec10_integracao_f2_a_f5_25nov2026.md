# Sessão de 25/11/2026: SPEC-10, fases F2 a F5 da integração

**Dev:** Sirlande, com o Claude Code como orquestrador. **Branch de trabalho:** `feature/spec-10-identidade`, a integração, na worktree `../wt-integracao`. Cada fase saiu numa branch própria e voltou por PR. A `develop` não mudou.

## O que foi feito

| Fase | PR | Estado | Resumo |
|---|---|---|---|
| F2: componentes base do `@hotel/ui` | #224 | mergeado | Anel de foco `ring-brand`, secundário branco com borda, `Input` com 48 px no toque, `ErrorState` na faixa do `Notice`, ações de cabeçalho compactas, folha "Mais" modal, garçom sem navegação. Red team 0 🔴 e 4 🟡, todos resolvidos; audit 19/20 |
| F3: painel Hoje | #225 | mergeado | Fita do hotel no lugar dos cartões, números lidos do core, Atenção em chips. Red team 0 🔴 e 6 🟡 (5 resolvidos); critique 31/40 |
| F4: reserva, conta e nova reserva | #226 | mergeado | `RoomNumber` no `@hotel/ui`, ações secundárias no cabeçalho, telas à esquerda (R-7), desabilitados legíveis, confirmar check-out secundário quando há saldo. Red team 0 🔴 e 3 🟡; critique 28/40 |
| F5: listas e formulários | #227 | **aguarda merge** | `Table` e `SegmentedControl` no `@hotel/ui`, reserva em duas linhas abaixo do `lg`, barra fixa da nova reserva, hóspedes e quartos no tablet. Red team 0 🔴, 5 🟡 e 4 🟢; critique 27/40, P1 e P2 resolvidos. 708 testes, e2e 7/7, CI verde |

**Relatórios de QA, na integração:** `docs/qa/redteam_spec10-fase{4,5}-*_25112026.md` e `docs/qa/impeccable_critique_spec10-fase{4,5}_25112026.md`.

## Decisões do Sirlande (25/11)
- **Secundário** branco com borda, como o "Sair". A borda é decorativa e está registrada na SPEC-10 §10.6.
- **Garçom sem navegação** já na F2.
- **"Em limpeza" do Hoje** continua lendo o analytics até o Gabriel responder.
- **Detalhe da fita** só informa; **Livre** com contorno tracejado.
- **Telas encostadas à esquerda**, com `max-w-5xl` (R-7).
- **Ações secundárias** no cabeçalho, compactas.
- **Período curto da lista de reservas:** o ano só aparece, com dois dígitos, quando o período filtrado ou a estadia atravessam a virada do ano.
- **Tablet com barra lateral (768 px):** tratado como celular nas tabelas. As colunas extras só abrem no `lg`, porque sobram cerca de 466 px úteis.

## Como retomar (26/11)

1. **Mergear o PR #227** (F5) na integração.
2. **Começar a F6, a comanda.**
   - Fluxo: branch `feature/t10-fase6-comanda` saindo da integração; research; plano mostrado ao Sirlande; implementação; red team; critique; PR.
   - Na F6 entra a exceção da R-7: `features/accounts/` ainda centraliza.
3. **Prazo da meta:** 26/11. Se faltar tempo, corta-se a F7 (Indicadores).

**Para religar o ambiente:**
- **Docker:** se o `docker` não existir no WSL, abrir o `Docker Desktop.exe`.
- **Compose:** em `../wt-integracao`, rodar `COMPOSE_PROJECT_NAME=gesway_integracao docker compose up -d`. Os volumes foram mantidos, então não precisa de seed.
- **Vite:**
  - comando: `frontend/apps/pms/node_modules/.bin/vite --port 5173 --host localhost`, porque o `pnpm` não está no PATH do shell não interativo;
  - porta: o Playwright MCP só aceita `localhost:5173`, por isso a 5273 não serve para conferir no navegador.
- **e2e:** em `frontend/e2e`, rodar `COMPOSE_PROJECT_NAME=gesway_integracao E2E_APP_URL=http://localhost:5173 ./node_modules/.bin/playwright test`.
- **Login do seed:** `admin@aurora.example`, com a senha do `seed_hotels.sql`.

## Pendências

1. **PR #227** aguardando o merge do Sirlande. Depois vem a revisão do Gabriel no PR final da integração (D3).
2. **Perguntas ao Gabriel**, regras das telas dele que a SPEC-10 não muda. O Sirlande traz as respostas:
   - o "Em limpeza" deve depender do analytics?
   - o `soldToday` conta duas vezes o quarto da troca do dia (repasse em `docs/qa/repasses/para_gabriel_25112026.md`);
   - a limpeza deveria entrar no Atenção só depois de um tempo parada?
   - o check-in executa sem confirmação;
   - a conta mostra "-R$" e "crédito" no meio da estadia;
   - o foco cai no `body` ao abrir "Cancelar reserva";
   - o conflito do #179 na SPEC-11.
3. **Funcionalidade fora da SPEC-10**, levantada no critique da F5:
   - busca por nome na lista de reservas;
   - histórico do hóspede com link para a reserva e o quarto;
   - foco na busca de hóspedes ao abrir a tela.
4. **F7:** os Indicadores têm dois modelos de período. Os meses aplicam na hora; o De/Até pede "Aplicar", e esse botão fica abaixo da dobra.
5. **Em aberto desde a F2:** o garçom vê "Gesway" no topo, porque o `useMyTenant` fica desligado para o WAITER.
6. **Da `develop`, que vêm do relatório de 24/11:**
   - o ensaio parou no passo 6 (Swagger);
   - falta escrever a seção "Ensaio no computador de um dev" no `GUIA_DEMONSTRACAO.md`.
