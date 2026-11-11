### 2026-11-11 — Gabriel (orquestrando Claude Code)

- **Branch:** `feature/confirma-acoes-painel`
- **Horário:** 20:00 ~ 20:30
- **Objetivo da sessão:** confirmação na linha antes de "Fazer check-in" e "Liberar quarto" no painel Hoje (🟢-1 do qa-redteam da T-05.3, `docs/qa/redteam_t053-painel-hoje_04nov2026.md`)

#### O que foi feito

| Entrega | Onde |
|---|---|
| `ConfirmPanel`: confirmação na própria linha, com título, texto, "Confirmar…" e "Voltar". Extraído do painel de check-out que já existia, e agora usado pelas três ações sem volta | `features/today/components/rows.tsx` |
| **Check-in**: o primeiro toque abre "Confirmar check-in de <hóspede> no quarto <n>". Só o segundo botão executa | `ArrivalItem` |
| **Liberar quarto**: o primeiro toque abre "Confirmar que o quarto <n> está limpo", e o botão de execução diz "Liberar para a venda". Em erro, o painel fecha e o aviso aparece | `CleaningItem` |
| **Check-out**: mesmo comportamento de antes (saldo fresco, "Abrir conta", "Voltar"), agora pelo painel comum | `DepartureItem` |
| `Row` ganhou `panel`, para a confirmação ficar embaixo da linha | `rows.tsx` |

Decisões:
- **Confirmação, não "desfazer".** O qa-redteam sugeriu também uma janela de desfazer. Ela adia a chamada ao servidor e complica o estado da linha a duas semanas do congelamento. A confirmação reaproveita o padrão que a recepção já conhece do check-out.
- **Só no painel.** No detalhe da reserva o check-in continua com um toque: ali a pessoa já abriu a reserva certa, e o risco do toque na linha vizinha não existe.

#### Verificação

- PMS: 285 testes verdes, typecheck e build limpos. O Vitest roda sem DOM, então o componente não tem teste automático.
- **Tela real**, com Postgres 17 temporário, core e Vite locais. Só `/analytics/alerts` foi simulado, para a lista "Em limpeza", com um quarto que estava de fato em limpeza no core. 17 de 17 checagens passaram (as 2 últimas entraram depois do qa-redteam): o primeiro toque não altera reserva nem quarto, "Voltar" fecha sem executar, a confirmação executa, o check-out mantém saldo e "Abrir conta", o `aria-expanded` é anunciado e o "Voltar" tem 48 px no celular. O container foi removido ao final.

#### Commits gerados

| Hash | Mensagem |
|------|----------|
| `f3101f0` | `feat(pms): confirmacao na linha antes de check-in e de liberar quarto` |
| `6a88895` | `docs(historico): confirmacao das acoes do painel Hoje` |
| `bac4eba` | `docs(qa): red team das confirmacoes do painel Hoje` |
| `efec5ca` | `fix(pms): quarto liberado nao aceita segundo envio enquanto segue na lista` |
| (este) | `docs(qa): desfecho do red team das confirmacoes do painel Hoje` |

#### Pendências

| # | Pendência | Prioridade | Observação |
|---|-----------|-----------|------------|
| 1 | ✅ qa-redteam: aprovado com ressalvas (1 🟡, 3 🟢). O 🟡 e um 🟢 foram corrigidos | — | `docs/qa/redteam_confirma-acoes-painel_11nov2026.md` |
| 3 | Foco do teclado se perde ao abrir e fechar a confirmação (já acontecia no check-out) | 🟢 Baixa | Levar o foco ao painel ao abrir e devolvê-lo ao botão ao fechar |
| 2 | Teste de componente para as confirmações | 🟢 Baixa | Depende de ambiente com DOM no Vitest (jsdom), que o projeto ainda não tem |
