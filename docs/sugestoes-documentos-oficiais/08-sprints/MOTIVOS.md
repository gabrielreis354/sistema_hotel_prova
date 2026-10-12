# Documento 08 — Planejamento de Sprints: motivos e o que conferir

**Versão sugerida:** `versao-sugerida_v1.0.md` · **Dono:** Weslley Lucas · **Data:** 07/10/2026
**Substitui:** `docs/historico_sessao/weslley/rascunho_doc08_planejamento_sprints_21set2026.md` (rascunho 0.1, não versionado), agora no formato do template da UniFAAT

## Por que este documento importa agora

O Doc 02 v1.3, já entregue, afirma que o acompanhamento da execução está no Doc 08. No repositório do professor, o Doc 08 ainda é o template em branco. O critério 19 da conformidade está ❌.

## Decisões tomadas no rascunho

| Decisão | Por quê |
|---|---|
| Sprint de 1 semana, por trilha | É a cadência que o time usa (`docs/DIVISAO_TRABALHO_TIME_09set2026.md` §12) |
| Estimativa em dias-dev, por épico | É a unidade da divisão de trabalho (~111 dias-dev). Inventar story points por tarefa daria um número sem lastro |
| Grade de Weslley pela lista de 07/10 (S3–S4 Terraform + Doc 08; S5–S6 deploy no CI; S7–S8 k8s, observabilidade, Docs 05 e 06) | É a grade que o Weslley segue. O ASCII da divisão v2.4 §5 coloca o Terraform em S5–S6, e as duas fontes divergem |
| Seção 5 com "planejado" e "registro" separados | O Doc 02 cita o 08 como registro de execução, não só como plano |
| Status das tarefas em 07/10, com evidência | Conferido em `docs/specs/` e `git log` da `develop` |

## Conferir antes de transcrever

- [ ] **Com o Gabriel e o Sirlande:** o rascunho só enxerga o repositório. Reuniões, combinados verbais e trabalho fora do git não entram, sobretudo na trilha do Sirlande (SPEC-04 inteira 🔲)
- [ ] **S9–S10 e a T-03.3 na S6:** são proposta do rascunho, não constam da grade original
- [ ] **Canal de comunicação** (Seção 9), que ficou como "confirmar"
- [ ] **Commits por integrante** (Seção 10): contados só na `develop`. O Sirlande pode ter trabalho em branch não mergeada
- [ ] **Status da S5** (PR #89, `feature/metrics`, PR #80): atualize ao transcrever, porque mudam rápido
