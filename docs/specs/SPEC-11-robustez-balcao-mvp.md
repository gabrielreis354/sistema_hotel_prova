# SPEC-11 — Robustez do balcão antes do congelamento

**Prioridade:** 🟠 Alta. São defeitos que uma banca curiosa acha em minutos
**Estado:** 🔵 Proposta, aguardando aprovação do Gabriel
**Responsável:** Gabriel, com agentes de IA. Revisão: Sirlande
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

## 3. Decisões propostas (o Gabriel aprova ou troca)

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

Cada tarefa vai em branch própria, com qa-redteam antes do merge e `pnpm e2e` verde no fim.

## 7. Riscos

- A migração do CPF pode achar duplicatas reais no banco de demonstração. Por isso ela para e lista, sem decidir sozinha.
- Validar CPF no balcão pode barrar um hóspede estrangeiro sem CPF. O campo continua opcional; o documento estrangeiro é da ficha FNRH (RF-055), no 5º semestre.
