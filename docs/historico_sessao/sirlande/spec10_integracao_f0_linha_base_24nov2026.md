# Sessão de 24/11/2026 (noite): SPEC-10, F0 do plano de integração

**Dev:** Sirlande, com o Claude Code como orquestrador. **Branch de trabalho:** `feature/spec-10-identidade`, a integração, na worktree `../wt-integracao`. A `develop` não mudou.

## O que foi feito

| Etapa | Resultado |
|---|---|
| Estado da `develop` | 418d941, CI verde. A integração estava 32 commits atrás e não tinha nada próprio |
| PR #221 (`develop` → integração) | mergeado (ef87d2d). Entraram as correções do QA do roteiro (#217), a T-06.12 (#207), o guia (#210) e os docs #218 a #220 |
| PR #216 (Fase 1: casca, marca e símbolo) | atualizado com a nova base, CI do frontend e do core verde em 7a4ed56, mergeado (00e0861) |
| PR #179 (Gabriel, para a `develop`) | não pode ser mergeado: tem conflito na SPEC-11, que já entrou pelo #212. Ficou um comentário explicando a saída; o PR só traz de novo os 3 arquivos de `docs/banca/` |
| Ambiente de homologação | worktree `../wt-integracao`, com o compose `gesway_integracao` e o nginx na 8088 |
| Linha de base | typecheck verde; testes 49 do `@hotel/domain` e 627 do `app-pms`; e2e 7/7 no compose isolado; nenhum diff em `services/` em relação à `develop` |
| qa-explorador (360, 800 e 1280 px, três papéis) | casca **aprovada com ressalvas**: 0 🔴, 1 🟡 e 10 🟢. Relatório em `docs/qa/exploratorio_linha_base_spec10_24112026.md` (PR #222, para a integração). As 105 capturas de referência ficam fora do git, na worktree, em `docs/qa/evidencias/linha_base_spec10_24112026/` |

## Decisões
- **Merges para a integração por merge commit**, sem squash, para o histórico da `develop` continuar igual dentro dela.
- **A `develop` entra na integração por PR com a própria `develop` como origem**, já que a integração não tem commits próprios. Não houve commit direto na `feature/spec-10-identidade`.

## Como retomar amanhã (25/11)

1. **Mergear o PR #222**, com o relatório da linha de base, na integração.
2. **Trazer a resposta do Gabriel:** o bloco "Em limpeza" do Hoje lê do analytics e some quando o analytics cai. Isso é intencional? A resposta afeta a F3.
3. **Começar a F2, os componentes base do `@hotel/ui`:**
   - branch `feature/t10-fase2-componentes`, saindo da `feature/spec-10-identidade`;
   - sequência: research, depois o plano mostrado ao Sirlande, depois a implementação, e só no fim o PR para a integração.
4. **O que entra na F2:**
   - 🟡 o anel de foco do `Button` nas variantes `secondary` (`ring-gray-400`, 2,5:1) e `ghost` (`ring-gray-300`, cerca de 1,5:1) fica abaixo dos 3:1 da SPEC-10 §10.6. Está em `frontend/packages/ui/src/Button.tsx:16-17`, e a sugestão é `ring-brand`;
   - 🟢 com o "Mais" aberto no celular, o fundo continua rolando e o Tab sai do menu;
   - 🟢 com o "Mais" aberto, duas abas ficam marcadas como ativas;
   - 🟢 o garçom tem barra lateral de 236 px e barra de baixo com um item só;
   - 🟢 o nome longo do hotel é cortado com "…" sem `title`.
5. **Prazo da meta:** 26/11. Se faltar tempo, o corte começa pela F7 (Indicadores) e depois pela F5 (listas e formulários).

**Para religar o ambiente da integração:**
- compose: dentro de `../wt-integracao`, `export COMPOSE_PROJECT_NAME=gesway_integracao` e `./start.sh compose-up`. Os volumes foram mantidos, então não precisa rodar o seed de novo;
- QA: `bash scripts/qa_explorador_ambiente.sh subir`, com a porta 3000 livre, ou seja, o compose parado com `stop`. O eixo Rede do QA lê o registro do Playwright MCP da pasta principal, por isso o `ambiente.env` foi gerado com o caminho dela;
- a worktree tem `.env`, chaves JWT, `.env.test` e o `node_modules` do core em link para a pasta principal. Nada disso entra no git;
- o pnpm vem do corepack: `corepack enable --install-directory <scratchpad>/bin`;
- se o `docker` do WSL der erro de I/O, abrir de novo o `Docker Desktop.exe`.

## Pendências

1. **PR #222** aguardando o merge do Sirlande.
2. **Resposta do Gabriel** sobre o bloco "Em limpeza" (F3) e sobre o conflito do #179.
3. **Referências da F3 e da F7 com dados:** o ambiente do QA não sobe o analytics. Capturar o Hoje e os Indicadores no compose quando chegarmos nessas fases.
4. **Da `develop`, que vêm do relatório anterior:**
   - o ensaio parou no passo 6 (Swagger);
   - falta escrever a seção "Ensaio no computador de um dev" no `GUIA_DEMONSTRACAO.md`.
