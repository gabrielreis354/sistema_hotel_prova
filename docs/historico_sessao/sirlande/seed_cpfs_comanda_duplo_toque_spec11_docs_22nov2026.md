### 2026-11-22 — Sirlande (orquestrando Claude Code)

- **Branches:** `fix/seed-cpfs-validos` (#196), `fix/comanda-abrir-conta-duplo-toque` (#197), `docs/sugestoes-doc03-doc04-22nov` (#198) e esta (`docs/sessao-sirlande-22nov`)
- **Horário:** sessão única, 22/11, a dois dias do congelamento de 24/11
- **Objetivo:** fechar a parte do Sirlande que faltava antes do congelamento: os itens 🟡2 e 🟡3 do `estado_fechamento_mvp_19nov2026.md`, os repasses da SPEC-11 e os Docs 03/04 da revisão de 19/11

#### Decisões
| # | Decisão | Escolha | Motivo |
|---|---|---|---|
| 1 | Formato do CPF de teste | `3` (Aurora) ou `4` (Sol) + 6 zeros + número do hóspede + 2 verificadores; representantes com `5` | O número do hóspede continua legível (`300.000.006-20` é o hóspede 6), e todos passam no `isValidCpf` |
| 2 | Banco já semeado | `UPDATE` de-para idempotente no `seed_hotels.sql`, mesmo `id` de hóspede | Sem ele, um novo seed quebrava no e-mail único (visto na mutação) ou duplicava hóspedes |
| 3 | Duplo toque em "Abrir mesa" | Trava síncrona por ref (`submitOnce`), no cliente | Reproduzido no navegador (2 POST). A idempotência no servidor fica para depois do congelamento |
| 4 | Sem rede durante "Abrir mesa" | "Cancelar" desabilitado e botão "Sem conexão…" | Cancelar e abrir de novo deixava duas mutações na espera (🟡 do red team) |
| 5 | Pagamento em reserva `CANCELLED` (repasse de 09/11) | Sem mudança; já estava registrado em 09/11 | `SPEC-05-decisoes-CA-05.6.a.md` §2, linha 60: "para depois do congelamento" |
| 6 | Docs 03/04 oficiais | Texto por seção em `docs/sugestoes-documentos-oficiais/`, sem editar o fork | O fork não está clonado nesta máquina; regra do README da pasta |

#### O que foi feito
1. **Seed com CPFs válidos (#196).** 60 hóspedes e 5 representantes trocados, com `UPDATE` de-para para banco já semeado. O red team pediu (🟡-1) que o `UPDATE` dos representantes só trocasse o CPF antigo: corrigido.
2. **Duplo toque em "Abrir mesa" (#197).** Reproduzido com Playwright (2 POST) e corrigido. A ligação com a mutação tem teste com `QueryClient` e `MutationObserver` reais.
3. **Parecer da SPEC-11** no PR #179 ([comentário](https://github.com/gabrielreis354/sistema_hotel_prova/pull/179#issuecomment-7082022431)). Os 🟡:
   - CA-11.f só pode barrar quando a entrada **muda**, senão estender a estadia `CHECKED_IN` dá 422;
   - CA-11.c no `PUT` só valida quando o CPF muda;
   - a migração do CPF não pode derrubar o `compose-up`.
   Ordem sugerida: T-11.3 → T-11.4 → T-11.2 → T-11.1, com a normalização (D) para o 5º semestre.
4. **Docs 03/04 (#198).** Texto pronto, por seção, para o 🔴-4, os 🟡-10, 🟡-11 e 🟡-12 e a tabela de RNs.
5. **`ultimo_relatorio.md`** criado, apontando para este relatório (pendência 9 de 16/11).

#### Verificação
- **#196:** `seed-cpf-valido` (6) e `seed-hoje` (20) verdes. Suíte do core com 66 arquivos e 1306 testes verdes antes das ressalvas. Mutação dos dois `UPDATE` derruba o teste. CI verde, inclusive o roteiro Playwright.
- **#197:** pms com 57 arquivos e 537 testes verdes, typecheck limpo. Tirar o `onSettled: release` derruba 2 dos 3 casos.
  - No navegador (390 px, garçom): duplo e triplo toque com 1 POST.
  - Depois de um 500, a segunda tentativa abre.
  - Sem rede, "Cancelar" travado e 1 POST quando a rede volta.
  - CI verde, inclusive o roteiro Playwright.
- **`qa_checks.sh`:** 3 avisos, todos anteriores e fora do diff.
- **qa-redteam:** aprovado com ressalvas nos dois PRs de código, todas tratadas:
  - `docs/qa/redteam_seed-cpfs-validos_22nov2026.md`;
  - `docs/qa/redteam_comanda-abrir-conta-duplo-toque_22nov2026.md`.
- **Sem verificar:** o #182 no iPhone (não há aparelho no ambiente) e o seed contra um dump do banco de ensaio.

#### Commits
| Hash | Mensagem |
|---|---|
| `42c2784` | `test(seed): RED dos CPFs validos no seed e da troca num banco ja semeado (repasse da SPEC-11)` |
| `86015fd` | `fix(seed): CPFs de teste com digito verificador valido (repasse da SPEC-11)` |
| `5351425` | `fix(seed): ressalvas do qa-redteam dos CPFs validos (representante corrigido a mao, day-use, comentarios)` |
| `1b6cfd3` | `test(comanda): RED da trava de um envio por vez em Abrir mesa (duplo toque, estado de 19/11)` |
| `296ce7e` | `fix(comanda): duplo toque em Abrir mesa abre uma conta so` |
| `a31b41b` | `test(comanda): RED da trava ligada a mutacao real em Abrir mesa (qa-redteam de 22/11)` |
| `79aff98` | `fix(comanda): trava ligada a mutacao, Cancelar travado e aviso de sem conexao em Abrir mesa (qa-redteam de 22/11)` |
| `c82aa36` | `docs(sugestoes): Doc 04 v1.5 (FKs B2B em transicao, amount, projecoes, RNs) e Doc 03 (consumo interno no core), da revisao de 19/11` |

#### Pendências
| # | Pendência | Prioridade | Observação |
|---|---|---|---|
| 1 | Aprovar e mergear #196 e #197 | 🔴 Alta | Antes do congelamento de 24/11. CI verde nos dois |
| 2 | Conferir o #182 num iPhone de verdade | 🟡 Média | Tocar 3 vezes num produto, tocar no campo e digitar 6: tem que dar 6, não 36. Só o Sirlande pode fazer |
| 3 | Aplicar o #198 no fork da UniFAAT (Doc 04 v1.5) | 🟡 Média | Conferir a numeração das seções na v1.4 oficial e completar RN-001, RN-002 e RN-004. O Doc 03 vai para a próxima reunião com o professor |
| 4 | Resposta do Gabriel ao parecer da SPEC-11 | 🟡 Média | Se a T-11.1 entrar, a migração mexe no `schema.sql` (dono: Sirlande): revisar antes do merge |
| 5 | Idempotência do `POST /accounts` | 🟢 Baixa | Depois do congelamento. A trava do cliente não segura dois aparelhos nem a fila sem rede de outra aba |
| 6 | Levar `submitLock.ts` para `src/lib/` e usar no `PaymentForm` | 🟢 Baixa | Depois do congelamento (🟢 DRY do red team). A T-11.3 pode reaproveitar |
| 7 | CNPJs do seed (`11111111000101`…) também não têm verificador válido | 🟢 Baixa | B2B é do 5º semestre e não aparece no roteiro. Mesmo tratamento dos CPFs, se o B2B passar a validar |
| 8 | `NewReservationPage` e `GuestFormPages` só têm `disabled={isPending}` | 🟢 Baixa | Não conferido se o backend barra o segundo POST. Fora do diff do red team; candidato à T-11.3 |
