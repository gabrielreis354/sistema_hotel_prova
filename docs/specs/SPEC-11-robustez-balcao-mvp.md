# SPEC-11 — Robustez do balcão antes do congelamento

**Prioridade:** 🟠 Alta. São defeitos que uma banca curiosa acha em minutos
**Estado:** ✅ Concluída em 22/11/2026 (T-11.1 a T-11.4 na `develop`). O CA-11.e fica para o 5º semestre
**Responsável:** proposta do Gabriel. T-11.2 a T-11.4 assumidas pelo Sirlande e T-11.1 feita pelo Gabriel, com agentes de IA
**Parecer:** Sirlande, 22/11 ([comentário no #179](https://github.com/gabrielreis354/sistema_hotel_prova/pull/179#issuecomment-7082022431))
**Criado em:** 16/11/2026
**Prazo:** 22/11, antes do congelamento de 24/11
**Origem:**
- `docs/banca/AVALIACAO_SIMULADA_MVP_15NOV2026.md` (🟡 1, 3, 4, 5 e 6);
- `docs/qa/repasses/para_gabriel_15112026.md` (os 2 🟡 do painel Hoje do qa-explorador de 15/11).

---

## 1. Contexto

A avaliação simulada da banca de 15/11 rodou o roteiro inteiro e aprovou com ressalvas, sem 🔴.
Os 🟡 abaixo são da área do Gabriel e têm a mesma raiz: **o sistema confia no clique e no dado
digitado.**

| # | O que se vê hoje | Onde |
|---|---|---|
| A | Duplo clique em "Cadastrar" (categoria ou quarto): o 1º grava (201), o 2º leva 409 e a tela diz "Já existe…" num cadastro que deu certo | Formulários de `features/rooms/` |
| B | Duplo clique em "Confirmar check-in" no painel Hoje: saem dois PUT (200 e 422) e a tela mostra só o erro, com o código interno `'CHECKED_IN'` | `features/today/components/rows.tsx` (ConfirmPanel) |
| C | O balcão aceita CPF com dígito verificador inválido (`123.456.789-00`). O `isValidCpf` existe, mas só a reserva pública o usa | `services/core-service/app/utils/isValidCpf.js`; controllers de `GuestApi/` |
| D | O mesmo CPF entra duas vezes no mesmo hotel quando muda o formato (`30000000001` × `300.000.000-01`): a unicidade compara o texto | Model e controllers de hóspede |
| E | O PMS cria reserva com entrada no passado (201) | `ReservationApi/CreateReservationController.js:22-25` |
| F | Os cartões do topo do painel Hoje ficam uma ação atrás, porque o analytics ainda não projetou o evento quando o app pergunta de novo | `features/today/` (consulta de ocupação) |
| G | Sem rede, o painel Hoje fica "Carregando…" para sempre, sem aviso | `features/today/TodayPage.tsx` |

## 2. Objetivo

Na demonstração e na mão de uma banca curiosa: **nenhum clique duplo vira erro falso ou registro
duplicado, nenhum CPF inválido ou repetido entra pelo balcão, nenhuma reserva nasce no passado e
o painel do dia diz quando está sem conexão.**

## 3. Decisões propostas

> As decisões **executadas** estão na §8. Esta tabela é a proposta de 16/11, mantida como registro.

| Decisão | Proposta | Motivo |
|---|---|---|
| Duplo clique (A, B) | O botão que grava fica `disabled` enquanto a mutação está pendente. Um 422 de transição que chega depois de um sucesso da mesma tela é descartado; a mensagem nunca mostra o código interno do status | É o padrão do restante do app. Não muda a API |
| CPF inválido (C) | `POST` e `PUT` de hóspede validam com o `isValidCpf` que já existe, devolvendo 400 com mensagem em português. Campo vazio continua permitido (o CPF é opcional) | Reaproveita o utilitário (DRY). Mesma regra da reserva pública |
| CPF repetido (D) | O servidor grava **só os dígitos**; a tela formata com o `formatCpf` (SPEC-09). Uma migração normaliza as linhas existentes, e se achar duplicata ela **para e lista** em vez de apagar | Unicidade por valor, não por formato. Dado de hóspede nunca é apagado por migração |
| Seed com CPFs inválidos | Fica fora. O seed grava por SQL e não passa pela validação. Repassar ao Sirlande trocar por CPFs válidos de teste | O seed é dele (M8) |
| Reserva no passado (E) | `check_in_date` antes de hoje, no fuso do hotel (`America/Sao_Paulo`), dá 422 na criação e na troca de datas. Hoje continua permitido (walk-in) | Mesma régua do check-in por período (#147) |
| Cartões atrasados (F) | A consulta de ocupação ganha o mesmo `refetchInterval` dos alertas e um segundo refetch alguns segundos depois do sucesso de uma ação | Consistência eventual assumida (ADR-003), sem otimismo no cache, que poderia mostrar número que o analytics não confirma |
| Painel sem rede (G) | Uma faixa de "sem conexão" no painel, reaproveitando o `useOnline` da comanda (#165) | Mesmo componente e mesmo texto da comanda. Depende do #165 entrar |

## 4. Escopo

**Dentro:** `frontend/apps/pms` (rooms, today), `services/core-service` (hóspede e criação/edição de
reserva) e uma migração de normalização do CPF.

**Fora:**

| Item | Onde fica |
|---|---|
| Duplo toque em "Abrir conta" da mesa cria duas contas | Comanda, do Sirlande (repasse) |
| CPFs inválidos do seed | Seed, do Sirlande (repasse) |
| `/metrics` no analytics, `CARTAO` cru nos Indicadores | Weslley |
| Painel Hoje sem os cartões quando o analytics cai | 5º semestre (fallback do core) |
| Correções nos documentos oficiais (RNF-007, MER, Doc 05, fichas) | Revisão dos 8 documentos, por PR no fork |

## 5. Critérios de aceite

- **CA-11.a** Duplo clique em "Cadastrar categoria", "Cadastrar quarto" e "Confirmar check-in" faz uma requisição só e mostra a mensagem de sucesso.
- **CA-11.b** Nenhuma mensagem de erro mostra código interno de status (`CHECKED_IN`, `PENDING` etc.).
- **CA-11.c** `POST /guests` e `PUT /guests/:id` com CPF de dígito inválido → 400; com CPF válido em qualquer formato → grava só os dígitos.
- **CA-11.d** O mesmo CPF em formatos diferentes no mesmo hotel → 409; em hotéis diferentes → permitido.
- **CA-11.e** A migração de normalização é idempotente e, se achar duplicata, termina sem alterar nada e lista os ids.
- **CA-11.f** `POST /reservations` e a troca de datas com entrada antes de hoje (fuso do hotel) → 422; com entrada hoje → 201.
- **CA-11.g** Depois de check-in, check-out ou liberação no painel Hoje, os cartões do topo batem com os blocos em até 10 s, sem recarregar.
- **CA-11.h** Sem rede, o painel Hoje mostra a faixa de sem conexão em vez de "Carregando…".
- **CA-11.i** O que não muda: contratos da API para entradas válidas, a reserva pública, a allowlist do garçom e o roteiro automatizado (`pnpm e2e` verde).

## 6. Tarefas

| Tarefa | O quê | CA |
|---|---|---|
| T-11.1 | Backend do CPF: validação, gravação só com dígitos, migração com parada em duplicata, testes | c, d, e |
| T-11.2 | Backend da reserva no passado, na criação e na troca de datas, com testes | f |
| T-11.3 | Frontend: botões que gravam travados enquanto pendentes (rooms, ConfirmPanel) e mensagem de transição sem código interno | a, b |
| T-11.4 | Frontend do painel Hoje: refetch dos cartões e faixa de sem conexão (depois do #165) | g, h |

Ordem de execução (parecer de 22/11): T-11.3 → T-11.4 → T-11.2 → T-11.1.

Cada tarefa vai em branch própria, com qa-redteam antes do merge e `pnpm e2e` verde no fim.

## 7. Riscos

- A migração do CPF pode achar duplicatas reais no banco de demonstração. Por isso ela para e lista, sem decidir sozinha.
- Validar CPF no balcão pode barrar um hóspede estrangeiro sem CPF. O campo continua opcional; o documento estrangeiro é da ficha FNRH (RF-055), no 5º semestre.

## 8. Entrega (22/11/2026)

### 8.1 Tarefas
| Tarefa | Quem | PR | Commit do merge | Red team |
|---|---|---|---|---|
| T-11.3 | Sirlande | #202 | `705717e` | Aprovado com ressalvas, todas tratadas (`docs/qa/redteam_spec11-duplo-clique_22nov2026.md`) |
| T-11.4 | Sirlande | #203 | `4cee1eb` | Aprovado com ressalvas, tratadas (`docs/qa/redteam_spec11-painel-hoje_22nov2026.md`) |
| T-11.2 | Sirlande | #204 e #209 | `c7de38e`, `e2aae47` | 1ª rodada reprovada (datas fora de `AAAA-MM-DD`) e corrigida; 2ª rodada aprovada (`docs/qa/redteam_spec11-reserva-passado_22nov2026.md`) |
| T-11.1 | Gabriel | #205 | `7261bf5` | `docs/qa/redteam_spec11-cpf-hospede_22nov2026.md` |

### 8.2 Critérios de aceite
| CA | Estado | Evidência |
|---|---|---|
| a | ✅ | Trava `src/lib/submitLock.ts`. Triplo clique deu 1 pedido em categoria, quarto, check-in, check-out, excluir quarto e liberar quarto; na `develop` anterior, a categoria saía com 201, 409 e 409. O `singleSubmit.test.ts` falha se uma tela voltar ao `mutate` direto |
| b | ✅ | O 422 de transição perde o motivo do servidor quando ele traz código em CAIXA_ALTA. Textos legíveis ("Reserva já cancelada") ficam |
| c | ✅ | #205: 400 para CPF inválido e gravação só com os dígitos. No `PUT`, só o CPF que muda é conferido |
| d | ✅ | #205: duplicata procurada pelos dígitos (`idx_guests_tenant_cpf_digits`) → 409; em outro hotel é permitido |
| e | ⏭️ 5º semestre | Migração de normalização adiada pelo parecer (🟢4): o seed já grava só dígitos (#196), e a busca acha os dois formatos |
| f | ✅ | 422 `CHECK_IN_IN_PAST` no `POST` e no `PUT` que muda a entrada. Estender a saída de quem está na casa e trocar o quarto da chegada atrasada continuam 200 |
| g | ✅ | Conferido no compose em 22/11: os cartões bateram com os blocos em 3,5 s após check-in, check-out e liberar quarto |
| h | ✅ | Sem rede e sem dado, cada bloco e os cartões dizem "Sem conexão", com a faixa no topo. Com dado carregado, o dado fica |
| i | ✅ | Roteiro Playwright verde no CI de todos os PRs. Nenhum contrato mudou para entradas válidas |

### 8.3 Decisões executadas (o que mudou da proposta)
| Decisão | Proposta (§3) | Executado | Motivo |
|---|---|---|---|
| Duplo clique | `disabled` enquanto pendente e descarte do 422 tardio | Trava síncrona por ref (`submitOnce`, `mutateOnce`, `promiseOnce`). Nenhum 422 tardio precisa ser descartado, porque o 2º pedido não sai | O `isPending` chega à tela depois do 2º clique. Reaproveita a trava do "Abrir mesa" (#197) |
| Alcance da trava | Rooms e `ConfirmPanel` | Também o detalhe da reserva, a exclusão de quarto e categoria e o liberar quarto | Mesmo defeito, e o objetivo (§2) é "nenhum clique duplo vira erro falso" |
| Código interno no 422 | Nunca mostrar | O motivo do servidor só aparece se não tiver palavra em CAIXA_ALTA | O padrão é esconder, e mensagens humanas do cancelamento continuam |
| Reserva no passado | 422 na criação e na troca de datas | 422 `CHECK_IN_IN_PAST` só quando a entrada **muda** (parecer 🟡1), e 400 para data fora de `AAAA-MM-DD` | Estender a saída de quem está na casa dava 422. A comparação de texto deixava passar `2026-11-3` (🔴 do red team) |
| CPF no `PUT` | Validar sempre | Só quando o CPF muda (parecer 🟡2) | A tela reenvia o CPF, e o cadastro antigo com CPF inválido ficaria sem edição |
| Normalização (D) | Gravar só dígitos com migração | Só dígitos nas gravações novas (#205); migração no 5º semestre | Sem risco para a demonstração (parecer 🟢4) |
| Painel sem rede | Faixa com o `useOnline` | Faixa mais "Sem conexão" em cada bloco sem dado; erro só quando não há dado | "Carregando…" e o vazio mentem sem rede; o Wi-Fi sem internet trocava a lista pelo erro (🟡 do red team) |
| Cartões atrasados | `refetchInterval` + 2º refetch | 60 s na ocupação e 2º refetch 3 s depois da ação. `useOccupancy` com o parâmetro opcional | A tela de Indicadores (área do Weslley) não muda |

### 8.4 Pendências (depois do congelamento)
| Pendência | Observação |
|---|---|
| CA-11.e, migração de normalização do CPF | 5º semestre. Se achar duplicata, para e lista os ids |
| 3º clique no detalhe da reserva entre a resposta e o refetch | Dá 422 e troca o sucesso pelo erro. Já existia antes da SPEC-11 |
| Check-in sem rede fica pausado e envia sozinho quando a rede volta | Decisão de produto: envio tardio ou aviso imediato |
| `useOnline` só vê a interface de rede | Com Wi-Fi sem internet, a faixa do painel não aparece. O dado fica e o erro some |
| Reserva-bloco B2B pode nascer no passado | Repassado ao Gabriel (`docs/qa/repasses/para_gabriel_22112026.md`); pode ser legítimo |
| Teto de estadia | Saída como `9999-12-31` estoura o `NUMERIC(12,2)` do total (500). Já existia antes |

O relatório completo da sessão está em `docs/historico_sessao/sirlande/spec11_duplo_clique_painel_reserva_passado_22nov2026.md`.
