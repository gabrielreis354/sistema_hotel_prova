# /impeccable audit — F2 da SPEC-10 (componentes base e casca), 25/11/2026

**Escopo:** `packages/ui/src/Button.tsx`, `Input.tsx`, `ErrorState.tsx`, `Notice.tsx` e `apps/pms/src/components/AppShell.tsx`, na `feature/t10-fase2-componentes` (depois das correções do qa-redteam, `9e0c9a0`).
**Evidência:**
- detector do Impeccable 4.8.0 nas fontes (a varredura por URL não rodou: não há Chromium para ele no WSL);
- medições no app rodando (Playwright, compose `gesway_integracao` + Vite): contraste calculado com as cores dos tokens, alvos de toque, transbordo em 320 px e com a fonte em 200%, teclado na folha "Mais";
- capturas em `evidencias/f2_componentes_25112026/`.

## Nota

| # | Dimensão | Nota | Achado principal |
|---|---|---|---|
| 1 | Acessibilidade | 4 | — |
| 2 | Desempenho | 4 | — |
| 3 | Tema (tokens) | 4 | — |
| 4 | Responsivo | 4 | — |
| 5 | Integridade | 3 | Fio lateral (`border-l-4`) do Notice, agora também no ErrorState |
| **Total** | | **19/20** | **Excelente** |

## Integridade: aprovada

Os componentes seguem o sistema do projeto:
- só tokens do preset;
- variantes do `cva`;
- alvo de toque pela variante `desk`;
- nenhum bloco de classes repetido.

O detector achou **um** padrão, o `side-tab` em `Notice.tsx:13`.

## Medições

**Contraste, texto:**

| O que | Contraste |
|---|---|
| Texto do erro (`gray-900`) no fundo tingido | 13,8:1 sobre o areia, 15,2:1 sobre o branco |
| "Excluir" (vermelho) no secundário branco | 4,83:1 |
| Aba inativa (`gray-600`) | 7,6:1 |
| "Mais" aberto (marca sobre `brand/5`) | 7,1:1 |

**Contraste, foco e borda:**

| O que | Contraste |
|---|---|
| Anel de foco da marca | 7,7:1 no branco, 7,0:1 no areia, 6,0:1 no tingido |
| Fio vermelho do erro | 3,8:1 |

**Resto das medições:**
- **Toque em 320 px:** nenhum alvo abaixo de 44 px em `/reservas`.
- **Transbordo:** nenhum em 320 px, nem com a fonte em 200% em 1280.
- **Folha "Mais":**
  - `aria-expanded` correto;
  - o foco entra na folha;
  - o Esc devolve o foco ao botão;
  - o Tab fecha a folha;
  - o fundo não rola;
  - girar a tela fecha a folha.
- **Movimento reduzido:** a folha tem alternativa com `prefers-reduced-motion` (`index.css:33`).

## Achados

### [P3] Fio lateral do erro repetido nos Indicadores
- **Onde:** `Notice.tsx:13` (`noticeFrame`), usado pelo `ErrorState` desde a F2.
- **Categoria:** Integridade.
- **Impacto:** o detector marca o fio lateral grosso como padrão gasto. Aqui ele tem função: marca a gravidade do aviso e vem com o fundo tingido e o texto. Fica como está.
- **O que pesa:** com o analytics fora, os Indicadores mostram 5 faixas vermelhas empilhadas (`indicadores-erro_1366.png`). O peso vem de repetir o mesmo erro em cada bloco, não do componente.
- **Recomendação:** na F7 (Indicadores), um aviso só no topo da página quando todos os blocos falham pela mesma causa, e os blocos ficam com "—".
- **Comando sugerido:** `/impeccable quieter` na F7.

## O que está bom
- O secundário branco com borda conversa com o "Sair" e com os campos, e se separa do areia sem pesar.
- O 404 e a falha de carga passaram a ser o mesmo componente visual: a recepção aprende um só.
- O garçom ganhou a largura toda no tablet e 55 px de cardápio no celular, sem perder o "Sair" e o nome.
- Os testes garantem as regras que a captura não pega:
  - uma varredura confere a ação do cabeçalho;
  - outra varredura proíbe vermelho em ghost;
  - o anel de foco é conferido em todas as variantes.

## Ações recomendadas
1. **[P3] `/impeccable quieter`:** na F7, um erro só nos Indicadores quando todos os blocos caem juntos.
