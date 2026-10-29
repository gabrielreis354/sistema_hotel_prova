# ADR-007 (candidata): Uma reserva por quarto, dentro de um agrupador

**Status:** **candidata — adiada para o 5º semestre** por decisão do Gabriel em 21/10/2026. O
analytics-service (T-01.4) e o frontend de reservas seguem o modelo atual e o catálogo de eventos v1.0;
a adoção futura entra como versão nova dos eventos de reserva. Registrada no Documento 07 (ADR-007).
**Data:** 12/10/2026 · **Origem:** decisão D-4 do catálogo de eventos
(`docs/specs/anexos/SPEC-01-catalogo-eventos.md` §9.1) e etapa G da rodada 3
(`docs/delegacoes/rodada3_gabriel_04out2026.md`)
**Relaciona:** SPEC-07 (motor de cálculo da estadia) · SPEC-04 (contas) · SPEC-01 T-01.4 (eventos) e
T-01.6 (rotas internas do b2b) · ADR-003

---

## Contexto

### O modelo atual

Uma reserva (`reservations`) tem **um** hóspede, **um** período, **um** status e **um** total, e ocupa
um quarto principal (`reservations.room_id`). Quartos adicionais entram pelo pivô `reservation_rooms`
(RF-013). Uma família que reserva dois quartos, ou um grupo de evento com dez (a reserva-bloco do
contrato B2B, RF-033), é **uma** reserva com **um** status para todos os quartos.

### O que esse modelo produziu

Três defeitos registrados na §11 do catálogo, todos com a mesma causa — os quartos de uma reserva não
têm vida própria:

| # | Defeito | Estado em 12/10/2026 |
|---|---|---|
| **P-1** | Quarto extra vendido duas vezes: a disponibilidade e o `EXCLUDE` só enxergavam `reservations.room_id` | **Corrigido** na etapa F (PR #93) — o pivô virou fonte única de ocupação, com período copiado por *trigger* e `EXCLUDE` próprio |
| **P-4** | Reserva com vários quartos cobrava só o principal | **Corrigido** na etapa F — `calculateStayTotal` soma cada quarto |
| **D-4** | Receita por categoria atribui o total inteiro ao quarto principal | **Aberto** — o total é um número só, não há como dividi-lo por categoria sem recalcular |

A etapa F corrigiu os sintomas dentro do modelo, mas encontrou limites que **só o modelo resolve**
(`docs/historico_sessao/gabriel/reserva_multiquarto_contrato_10out2026.md`, pendências):

- **Preço congelado por quarto.** Adicionar ou remover um quarto reprecifica a reserva **inteira**
  pelo preço de hoje: o total é um valor só, sem o preço de cada quarto no momento da venda.
- **Check-out antecipado de um quarto.** O grupo sai em dias diferentes, mas o status e as datas são
  da reserva toda — não dá para encerrar um quarto e manter os outros.
- **Cancelar o contrato com parte do grupo hospedada.** O mercado libera os quartos ainda não
  ocupados e trata quem está na casa individualmente. Hoje a única resposta possível é `409` (P-2).
- **Hóspede por quarto.** A ficha de registro (RF-055) é por hóspede hospedado; um grupo tem um
  hóspede responsável em cada quarto, e a reserva tem um só `guest_id`.

E a complexidade que a correção de P-1 exigiu é ela mesma um sinal: *triggers* para copiar período e
status, *lock* `FOR SHARE` para não copiar valor velho, tratamento de *deadlock* com quartos em papéis
trocados, proibição de remover o "principal" pela rota de extras. Tudo isso existe porque **um quarto
ocupado não é uma linha com período próprio**.

### Como o mercado modela

Nos PMS de mercado (OPERA Cloud, Mews, Apaleo, Cloudbeds — o critério adotado pelo Gabriel na rodada
3), a unidade de ocupação é a **reserva de um quarto**, com tarifa, hóspede e status próprios. Uma
compra com vários quartos é um **agrupador** (*booking*, *group* ou *reservation group*) que reúne
essas reservas, carrega o titular, a origem e o pagamento do grupo.

---

## Decisão proposta

**Agrupador (`bookings`) contendo uma reserva por quarto (`reservations`).**

| Entidade | Guarda | Muda em relação a hoje |
|---|---|---|
| `bookings` (nova) | `tenant_id`, titular (`guest_id`), origem (`MANUAL`/`DIRECT`/`B2B`), referência externa (contrato), `created_by` | Assume o que hoje é "a reserva" do ponto de vista de quem comprou |
| `reservations` | `booking_id`, **um** `room_id`, hóspede do quarto, período, status, e o **valor congelado** da estadia daquele quarto (total e, quando a SPEC-07 existir, o detalhamento por noite) | Perde o pivô: cada linha é um quarto com vida própria |
| `reservation_rooms` | — | **Some.** Com um quarto por reserva, o `EXCLUDE` volta a ser só o de `reservations` — sem cópia, sem *trigger* |

Consequências diretas no comportamento:

- **Disponibilidade e garantia contra venda dupla** voltam a ser uma regra simples: o `EXCLUDE` de
  `reservations` (`room_id` × período), sem *trigger*, sem pivô.
- **Total do grupo** é a soma das reservas; **cada quarto guarda o próprio preço**, congelado na venda.
  Adicionar um quarto cria uma reserva nova com o preço de hoje; os outros não mudam.
- **Check-in, check-out e cancelamento por quarto.** O grupo pode sair em dias diferentes; cancelar o
  contrato B2B cancela as reservas ainda não ocupadas e deixa as hospedadas seguirem.
- **Receita por categoria (D-4)** sai certa sem nenhum ajuste: cada reserva tem um quarto, de uma
  categoria, com o próprio valor.

### Pontos a decidir se a ADR for aceita

1. **Onde mora o pagamento.** Sinal de grupo (PIX da reserva direta, parcela de contrato) é do
   *booking*; pagamento no balcão costuma ser de um quarto. Proposta: `payments.booking_id`
   obrigatório e `reservation_id` opcional.
2. **Status do *booking*.** Derivado das reservas (ex.: "parcialmente hospedado") ou só informativo.
   Proposta: derivado, nunca gravado — evita uma segunda máquina de estados para manter em sincronia.
3. **Migração dos dados existentes.** Cada reserva com N quartos vira um *booking* com N reservas. O
   total atual precisa ser dividido entre elas: proporcional ao preço da categoria de cada quarto, com
   o arredondamento de centavos no primeiro quarto. Pagamentos existentes passam para o *booking*.

---

## Alternativas Consideradas

| Alternativa | Prós | Contras |
|---|---|---|
| **Estado atual — pivô como fonte única de ocupação** (etapa F, PR #93, 10/10/2026) | Já implementado e auditado; P-1 e P-4 corrigidos; garantia no banco com `EXCLUDE` e teste de concorrência; nenhuma migração de dados | D-4 continua aberto; preço por quarto, check-out antecipado e cancelamento parcial continuam impossíveis; *triggers*, *lock* e casos de *deadlock* para manter uma cópia — complexidade que cada mudança futura em reserva precisa respeitar |
| Manter o pivô **sem** o período copiado, só com a correção na aplicação | Menos lógica no banco | Foi o que gerou a P-1: a garantia dependeria de todo controller lembrar de checar. Recusada na etapa F pelo Gabriel |
| Reservas por quarto **sem** agrupador, ligadas por um código de grupo | Menor mudança que a proposta | O titular, a origem, o sinal e o vínculo com o contrato não têm dono; o código de grupo vira um agrupador implícito, sem integridade |
| **Agrupador + uma reserva por quarto — proposta** | Modelo de mercado; elimina o pivô e os *triggers*; resolve D-4, preço congelado, check-out e cancelamento por quarto; casa com o motor da SPEC-07 | Migração de dados com divisão de valores; mudança de contrato da API de reservas e dos eventos; reescrita de testes |

> *Nota:* a delegação da etapa G listava "manter o pivô com a correção da etapa F" e "pivô com período
> desnormalizado como fonte única" como alternativas distintas. A etapa F implementou exatamente a
> segunda, então hoje as duas são a mesma — o estado atual da primeira linha.

---

## Relação com outras frentes

**SPEC-07 — motor de cálculo da estadia.** O motor (T-07.3) recebe **categoria e intervalo** e devolve
o valor noite a noite. Com uma reserva por quarto, ele se aplica sem adaptação: uma reserva, uma
categoria, um cálculo — e o detalhamento por noite (CA-07.3.b) fica gravado na reserva, que é o que
congela o preço. No modelo atual, a T-07.5 teria de somar o motor de várias categorias dentro de uma
reserva e continuaria sem onde guardar o preço de cada quarto. **Se a ADR for aceita, vale fazê-la
antes da T-07.5**, para que o motor seja adotado uma vez só.

**SPEC-04 — contas.** O desenho já fechado (`Account` com `reservation_id`, `room_id` e
`charges_lodging`) tem a regra RN-005: duas contas no mesmo quarto não podem ambas cobrar a diária.
Com uma reserva por quarto, a conta `ROOM` é a conta **da reserva**, e "quem cobra a diária deste
quarto" passa a ser uma pergunta sobre uma linha — não sobre um quarto dentro de uma reserva de vários.
A T-04.6 (check-in cria conta) fica mais simples: um check-in, uma reserva, uma conta.

**SPEC-01 T-01.4 — eventos.** O catálogo v1.0 descreve `reservation.*` no modelo atual (um `room_id`).
Com a ADR, `reservation.*` passa a ser de um quarto e surge `booking.*` — mudança **incompatível**,
que pela §7 do catálogo exige versão nova do evento. Se a ADR for aceita **depois** da T-01.4, o
analytics recebe a versão 2 com o consumidor implantado antes; **antes**, o catálogo já nasce no modelo
novo.

**SPEC-01 T-01.6 — rotas internas do b2b.** O contrato das rotas de reserva-bloco (catálogo §10)
devolve um `reservation_id`. Com a ADR, devolve um `booking_id`, e o cancelamento libera só as reservas
não ocupadas — o comportamento de mercado que hoje é `409` (P-2).

**Frontend.** O módulo de reservas, *rack* e painel do dia do app-pms ainda não foi construído (RF-047
a RF-050). Mudar o contrato da API **antes** dele custa uma fração de mudar depois.

---

## Consequências

- **Positivas:**
  - Venda dupla garantida por um `EXCLUDE` simples, sem *trigger* nem cópia de dados.
  - Preço congelado por quarto: alterar um quarto não reprecifica os outros.
  - Check-out antecipado, cancelamento parcial de grupo e hóspede por quarto passam a ser possíveis.
  - D-4 resolvido sem regra especial na receita por categoria.
  - Encaixe direto com o motor da SPEC-07 e com as contas da SPEC-04.
- **Negativas:**
  - Migração de dados com divisão do total entre quartos — o valor de cada quarto em reservas antigas
    será uma estimativa proporcional, não o preço realmente praticado.
  - Mudança de contrato em `POST /reservations` (vários quartos viram um *booking*), nos eventos e nas
    rotas internas do b2b.
  - Reescrita dos testes de reserva com vários quartos (`reservation-multiroom.test.js` e o bloco de
    quartos extras de `reservations.test.js`).
  - Uma entidade a mais para a equipe entender e documentar (Doc 04 — MER).
- **Riscos:**
  - Fazer depois do frontend de reservas ou da T-01.4 multiplica o custo. A janela barata é **antes**
    dos dois.
  - Dividir valores na migração pode gerar diferença de centavos em relatórios antigos — mitigado
    gravando o arredondamento num quarto só e preservando o total do grupo.

---

## Estimativa e quando decidir

Ordem de grandeza, a confirmar num plano: **4 a 6 dias** — modelo e migração (1,5), controllers e
regras de reserva (2), contrato B2B e reserva pública (1), testes e documentação (1 a 1,5).

**Gatilho de decisão:** antes de começar qualquer um destes — o módulo de reservas do frontend, a
T-07.5 da SPEC-07 ou a H.2 da T-01.4 (consumidor do analytics). Decidir depois de qualquer um deles
encarece a mudança.
