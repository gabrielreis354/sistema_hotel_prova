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
| 1 | ~~Aprovar e mergear #196 e #197~~ | ✅ | Mergeados em 22/11 (`50806a4`, `65f2089`). Testes das duas mudanças verdes de novo na `develop` |
| 2 | Conferir o #182 num iPhone de verdade | 🟡 Média | **Com o Gabriel** (combinado em 22/11). Tocar 3 vezes num produto, tocar no campo e digitar 6: tem que dar 6, não 36 |
| 3 | ~~Aplicar o #198 no fork da UniFAAT~~ | ✅ | No `main` do fork pelos #12, #10 e #11 (ver a parte 2). Antes: | O PR #10 do Gabriel no fork já cobre o Doc 03 (F-021) e o 🔴-4 e o 🟡-12 do Doc 04, conferidos contra o código. Faltavam a §6.1 (RNs; não existem RN-001, RN-002 nem RN-004) e a §7.5 (projeções): no PR #12 do fork (`docs/doc04-projecoes-rns`), aberto contra a branch do #10. Falta o Gabriel mergear o #12 no #10 |
| 4 | Resposta do Gabriel ao parecer da SPEC-11 | 🟡 Média | Se a T-11.1 entrar, a migração mexe no `schema.sql` (dono: Sirlande): revisar antes do merge |
| 5 | Idempotência do `POST /accounts` | 🟢 Baixa | Depois do congelamento. A trava do cliente não segura dois aparelhos nem a fila sem rede de outra aba |
| 6 | Levar `submitLock.ts` para `src/lib/` e usar no `PaymentForm` | 🟢 Baixa | Depois do congelamento (🟢 DRY do red team). A T-11.3 pode reaproveitar |
| 7 | CNPJs do seed (`11111111000101`…) também não têm verificador válido | 🟢 Baixa | B2B é do 5º semestre e não aparece no roteiro. Mesmo tratamento dos CPFs, se o B2B passar a validar |
| 8 | `NewReservationPage` e `GuestFormPages` só têm `disabled={isPending}` | 🟢 Baixa | Não conferido se o backend barra o segundo POST. Fora do diff do red team; candidato à T-11.3 |

---

### 2026-11-22 (parte 2) — merges, ensaio no Docker e correções do QA

- **Branches:** `fix/qa-22nov-login-comanda` (#201), mais os merges de PRs prontos de outros devs
- **Objetivo:** mergear o que estava pronto, testar o compose da demonstração no Docker de ponta a ponta e corrigir o que o QA achou

#### Decisões
| # | Decisão | Escolha | Motivo |
|---|---|---|---|
| 1 | PRs prontos de outros devs | Mergeados pelo Sirlande, depois de testar o resultado combinado numa branch local | Os autores não tinham feito o merge, e o congelamento é em 24/11 |
| 2 | Ambiente do ensaio | Projeto compose separado (`gesway_teste`), com volumes novos | Testa a subida a frio sem apagar os volumes `sistema_hotel_prova_*` que já existiam |
| 3 | Docker | O Sirlande autorizou usar e iniciar o Docker por comando sem pedir | Registrado na memória do agente |
| 4 | `Input` base do `@hotel/ui` sem altura mínima | Corrigido só o campo apontado pelo QA | Mudar o componente base alteraria todos os formulários antes do congelamento |

#### O que foi feito
1. **Merges de 22/11.**
   - Na `develop`: #196 (`50806a4`), #197 (`65f2089`), #193 (`27b36e4`, `/metrics` do analytics e passo 8), #194 (`45ed67c`), #195 (`4a63408`) e #201 (`b82bca2`).
   - No `main` do fork: #12 (`eeb46a5`, dentro do #10), #10 (`2482eb8`) e #11 (`4b3bff7`, Doc 08 v1.3).
   - O #200 (Weslley) mergeou a execução verde do Actions para o passo 8 e fechou esse 🔴 do painel.
   - Antes dos três merges do Weslley, os três PRs foram juntados numa branch local:
     - analytics com 190 testes verdes, inclusive os novos de métricas;
     - pms com 545 testes verdes;
     - YAML do k8s, do Prometheus e do compose, e o JSON do painel do Grafana, sem erro de sintaxe.

     A `develop` ficou idêntica à árvore testada.
2. **Ensaio técnico no Docker Compose**, com Docker Desktop 29.5.3, Compose v5.1.4 e `PIX_PROVIDER=fake`:
   - `./start.sh compose-up --build` subiu a frio na 1ª tentativa, em 36 s, com o `rabbitmq-setup` concluído;
   - migração, seed (Aurora com 2 chegadas, 4 hóspedes na casa e 1 saída) e carga inicial (137 eventos) sem erro, já com os CPFs novos;
   - pelo nginx: ocupação de 4 de 15 quartos (26,67%), ADR de R$ 338,89 e RevPAR de R$ 90,37;
   - `/metrics` fechado para fora: 404, e `/analytics/metrics` dá 401 mesmo com o token;
   - Prometheus com os três alvos `up` (core, analytics e RabbitMQ) e Grafana com os dois painéis;
   - **roteiro e2e: 7 de 7 passos em 54 s.** Os eventos aplicados no analytics subiram de 361 para 375, sem nenhum na fila de mortas.
3. **QA exploratório no compose** (login, comanda e Indicadores): aprovado com ressalvas, 4 🟡 e 6 🟢.
   - Relatório: `docs/qa/exploratorio_login-comanda-indicadores_22112026.md`.
   - O 🟡 dos Indicadores sem rede foi repassado ao Weslley em `docs/qa/repasses/para_weslley_22112026.md`.
4. **#201: os três 🟡 do Sirlande corrigidos.**
   - **Login:** mensagem por status, com lista fechada; só 400 e 401 dizem "Credenciais inválidas.".
   - **Quantidade da comanda:** o que aparece é o que vai para a fila; o zero tem aviso em texto; colar "R$ 10" dá 10.
   - **"Nome na comanda":** 48 px.
   - O red team ficou em aprovado com ressalvas, e as seis ressalvas foram tratadas (`docs/qa/redteam_qa-22nov-login-comanda_22nov2026.md`).
5. **Painel de fechamento** atualizado com o estado de hoje e uma seção só do teste no Docker: https://claude.ai/artifact/SnX3tbukjvyTNrK1hc74fk
6. **Ambiente derrubado** com `down -v`, só do `gesway_teste`. Os volumes antigos ficaram.

#### Verificação
- **#201:**
  - pms com 59 arquivos e 567 testes, typecheck limpo, `qa_checks` sem aviso novo;
  - CI do PR e da `develop` verdes, inclusive o roteiro Playwright;
  - no navegador, garçom em 375 px com Água a R$ 5:
    - "10000" fica 1000, e o total vai a R$ 5.000,00;
    - "2,5" fica 25;
    - "0" fica marcado, com o aviso;
    - colar "R$ 10" dá 10;
    - os dois campos têm 48 px;
    - o 429 mostra a mensagem nova.
- **Sem verificar:**
  - o passo 8 apresentado pela tela com o grupo, que fica para o ensaio de 24/11;
  - leitor de tela de verdade;
  - iPhone e Safari.

#### Commits do #201
| Hash | Mensagem |
|---|---|
| `b1df5fc` | `test(auth): RED da mensagem de login por status (429 e 5xx nao sao credenciais invalidas)` |
| `9669e92` | `fix(auth): login diz quando e limite de tentativas (429) ou sistema fora (5xx), nao credenciais invalidas` |
| `e3a40a6` | `test(comanda): RED do campo de quantidade que mostra so o que pode ser lancado` |
| `ed24c10` | `fix(comanda): campo de quantidade mostra so o que vai para a fila` |
| `263b50b` | `test(comanda): RED do alvo de 48 px no Nome na comanda` |
| `60c76c8` | `fix(comanda): Nome na comanda com alvo de 48 px no celular` |
| `02529f5` | `docs(qa): exploratorio do login, comanda e indicadores no compose (22/11) e repasse ao Weslley` |
| `f88628a` | `test(auth,comanda): RED das ressalvas do qa-redteam (lista fechada do login, ligacao do login e do onChange, aviso do zero)` |
| `c68aded` | `fix(auth,comanda): ressalvas do qa-redteam (lista fechada do login, aviso do zero em texto, colar sem cortar, teto derivado)` |

#### Pendências novas
| # | Pendência | Prioridade | Observação |
|---|---|---|---|
| 9 | Indicadores sem rede mostram vazio falso | 🟡 Média | Repassado ao Weslley (`para_weslley_22112026.md`). Antes de 24/11, se der |
| 10 | `Input` base do `@hotel/ui` sem altura mínima | 🟢 Baixa | Os outros formulários também ficam com 42 px no celular. Depois do congelamento |
| 11 | O zero na quantidade como "desfazer a linha" | 🟢 Baixa | Decisão de produto, com o Gabriel. Hoje ele só é avisado |
| 12 | 🟢 do QA de 22/11 sem correção | 🟢 Baixa | São quatro: "hóspede"/"cliente" na mesa, Esc que não fecha "Abrir conta", sessão vencida sem explicação e a faixa "Sem conexão" quando quem falha é o servidor. Ver o relatório |
| 13 | Fichas dos encontros 3 em diante no fork | 🔴 Alta | Com o Gabriel (PO). É o critério C10, e no fork só existem as fichas 01 e 02 |
| 14 | Chave do Asaas no sandbox real | 🟡 Média | Com o Weslley; a troca não foi confirmada |
| 15 | Ensaio dos passos 1 a 8 com o grupo em 24/11 | 🟡 Média | Como subir o compose e o roteiro neste WSL está na memória do agente. Recriar o seed antes |
