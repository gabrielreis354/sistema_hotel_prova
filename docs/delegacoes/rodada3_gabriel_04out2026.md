# Delegação — Rodada 3 da trilha do Gabriel

**Para:** agente executor (worktree `sistema_gestao_hotel-etapa3`)
**Data:** 04/10/2026 · **Continua:** `rodada2_gabriel_28set2026.md`
**Decisões do Gabriel nesta data:** PR #86 mergeado; catálogo de eventos (PR #87) **aprovado** com
as decisões da §9.1; P-1 a P-4 corrigidas **antes** da T-01.4

---

## 1. Prompt de abertura — cole isto na sessão do agente

```
Você é o agente executor do Gesway, na trilha do Gabriel.

Antes de qualquer coisa:
  git fetch origin
  git show origin/develop:docs/delegacoes/rodada3_gabriel_04out2026.md

A ETAPA 0 vem antes de tudo: a etapa D da rodada 2 tem commits sem push e
o relatório de QA fora do git.

Siga as etapas NA ORDEM. Cada uma termina na condição de parada indicada.
Se uma etapa falhar, pare e reporte com a saída real — não avance.
```

---

## 2. O critério das decisões desta rodada

O Gabriel passou a decidir pelo que **um PMS SaaS de mercado faria** — prática geral de produtos
como OPERA Cloud, Mews, Apaleo e Cloudbeds. Três consequências aparecem nesta rodada:

- **Lançamento financeiro não se apaga — se estorna.** Base da decisão D-2.
- **Garantia recebida e saldo devedor são indicadores diferentes.** Base da D-3 refinada.
- **Cada quarto é uma reserva própria, dentro de um agrupador.** O modelo atual — `room_id`
  principal mais o pivô `reservation_rooms` — é a causa comum da P-1, da P-4 e da D-4. A troca de
  modelo fica registrada como ADR candidata (etapa G); **esta rodada não a implementa**.

Stack, restrições e portão de QA: os da §3 de `pendencias_liberadas_gabriel_16set2026.md`, com o
bloco **FERRAMENTAL DA TAREFA** do `estado.sh` em cada etapa com código.

---

## 3. As etapas

| # | Etapa | Termina em |
|---|---|---|
| **0** | Terminar a etapa D da rodada 2 (RNF-023) | PR aberto, CI verde, merge pelo portão |
| **F** | Corrigir P-1 a P-4 — reservas com vários quartos e contratos | merge em `develop` |
| **G** | Registrar as duas tarefas novas | merge em `develop` |
| **H** | T-01.4 — extrair o `analytics-service` | três PRs, merge a cada um |

**F vem antes de H por um motivo concreto:** a T-01.4 grava eventos exatamente nos controllers de
reserva e de contrato que a F corrige. Construir o *outbox* sobre o defeito obrigaria a refazer.

---

### ETAPA 0 — Terminar a etapa D (RNF-023)

A branch `fix/rnf023-pdf-orcamento` tem **3 commits sem push** (`699eff0`, `6de9056`, `681afef`)
e o relatório `docs/qa/redteam_rnf023-pdf-orcamento_30set2026.md` está *untracked*.

1. Commite o relatório.
2. `git push origin fix/rnf023-pdf-orcamento`
3. Abra o PR para `develop` com os CA-D.1 a CA-D.7 um a um.
4. Portão completo; merge pelo portão.

**Condição de parada:** merge, ou reporte se o portão falhar.

---

### ETAPA F — Corrigir P-1 a P-4

**Branch:** `fix/reserva-multiquarto-contrato`

As quatro pendências estão descritas na §11 do catálogo
(`docs/specs/anexos/SPEC-01-catalogo-eventos.md`), com a evidência de linha. O Gabriel conferiu
P-1, P-3 e P-4 no código em 04/10.

#### F.1 — P-1: quarto extra vendido duas vezes 🔴

**O defeito.** O `EXCLUDE USING gist` (`db/schema.sql:132`, recriado por
`database/applyDbConstraints.js`) cobre só `reservations.room_id`, e `checkReservationConflict`
consulta só essa coluna. Os quartos extras vivem apenas em `reservation_rooms`:

- `CreateReservationController.js:45-52` confere que o quarto extra **existe**, não que está livre
- `SignContractController.js:73` confere a disponibilidade de cada quarto do contrato com
  `checkReservationConflict` — que não enxerga quartos extras de outras reservas — e a `:97` grava
  os quartos 2..N só no pivô

Resultado: um quarto que está só no pivô é invisível para a próxima reserva, e pode ser vendido
duas vezes no mesmo período.

**Critérios de aceite:**

- **CA-F.1.a** — **Todo** quarto de uma reserva — o principal e os extras — é conferido contra
  **todos** os quartos ocupados no período, os de `reservations.room_id` e os de
  `reservation_rooms`. Vale para criação, alteração de datas ou quartos, e assinatura de contrato
- **CA-F.1.b** — **Garantia no banco, não só na aplicação.** É o mesmo princípio do
  `EXCLUDE` atual: a aplicação pode errar, o banco não deixa. Ver a recomendação abaixo
- **CA-F.1.c** — **Teste de concorrência:** duas reservas disputando o mesmo quarto **extra** no
  mesmo período, em paralelo — exatamente uma vence; a outra recebe `409`, nunca `500`
- **CA-F.1.d** — Cancelar uma reserva libera **todos** os seus quartos, inclusive os extras
- **CA-F.1.e** — Nenhum teste existente de reserva ou de contrato muda de resultado

**Recomendação para o CA-F.1.b — avalie e justifique no PR.** O `CreateReservationController`
já grava o quarto principal **também** no pivô (`:74`). Isso permite fazer do pivô a fonte única
de ocupação: `reservation_rooms` ganha cópia do período (`check_in_date`, `check_out_date`) e do
que torna a linha ativa, e um `EXCLUDE USING gist (room_id WITH =, daterange(...) WITH &&)` com o
**mesmo predicado** do atual. O preço é manter essas colunas em sincronia na mesma transação em
toda alteração de datas, de status e de exclusão. Mantenha o `EXCLUDE` atual de `reservations`
também, como segunda barreira.

Se encontrar caminho mais simples com a mesma garantia de banco, use — e explique. Se a única
saída exigir mudar a máquina de estados da reserva, **pare e pergunte**.

**Confira também, e registre no PR:** o `EXCLUDE` atual desconsidera só `CANCELLED`, enquanto
`checkReservationConflict` desconsidera `CANCELLED` **e** `CHECKED_OUT`. Se um check-out
antecipado não ajusta `check_out_date`, as diárias restantes ficam bloqueadas no banco e livres
para a aplicação — o que viraria `500`. Diga o que o código faz hoje; corrija só se for parte do
mesmo defeito.

#### F.2 — P-2: cancelar contrato com o hóspede já hospedado

`CancelContractController.js:21-26` cancela a reserva-bloco com `Model.update`, sem conferir o
status — inclusive `CHECKED_IN`.

- **CA-F.2.a** — Cancelamento só em `PENDING` e `CONFIRMED`, em **allowlist** (regra do CLAUDE.md).
  Reserva-bloco em `CHECKED_IN` ou `CHECKED_OUT` → `409` com mensagem clara, e o contrato fica no
  status anterior
- **CA-F.2.b** — Contrato e reserva-bloco mudam juntos, na mesma transação

No mercado, cancelar um bloqueio de grupo libera os quartos **não ocupados** e trata quem já está
hospedado individualmente. Isso fica para quando houver o modelo de uma reserva por quarto
(etapa G). Agora, o `409` basta.

#### F.3 — P-3: qualquer papel assina e cancela contrato

`routes/apis/contractRouter.js:22-23` não tem `requireRole`: um `WAITER` assina e cancela.

- **CA-F.3.a** — `PUT /contracts/:id/sign` e `/cancel` com `requireRole('ADMIN')` — vendas e eventos
  é decisão de gerência, nunca do A&B
- **CA-F.3.b** — Teste: `WAITER` e `RECEPTIONIST` recebem `403`

Confira se outras rotas de escrita do `contractRouter` têm o mesmo problema (`POST /`, `PUT /:id`,
pagamento de parcela) e registre no PR. **Corrija só sign e cancel** — as outras pedem decisão do
Gabriel sobre quem cria contrato.

#### F.4 — P-4: reserva com vários quartos cobra só um

`CreateReservationController.js:54-57`: `total_amount = preço da categoria do quarto principal × noites`.

- **CA-F.4.a** — O total soma **todos** os quartos: para cada quarto, preço da sua categoria × noites
- **CA-F.4.b** — Dinheiro em `DECIMAL`, sem `parseFloat` no cálculo — a linha atual usa
  `parseFloat(room.category.price_per_night)`. Some como string decimal, ou em centavos inteiros
- **CA-F.4.c** — A alteração de datas ou de quartos recalcula o total pela mesma regra
- **CA-F.4.d** — Teste com dois quartos de categorias diferentes

**Uma única função de cálculo.** Criação e alteração usam o mesmo código — não duas cópias. A
SPEC-07 (tarifas por período) vai substituir essa função pelo motor de cálculo da estadia; deixe-a
num lugar só, para a troca ser num lugar só.

**Condição de parada da etapa F:** portão completo **mais `/security-review`** (há mudança de
autorização). Merge em `develop`. Se o caminho do CA-F.1.b mudar o schema, cole no PR a saída do
`migrate` num banco que já tem reservas.

---

### ETAPA G — Registrar as duas tarefas novas

**Branch:** `docs/tarefas-estorno-e-modelo-reserva`. Documentação — nenhum código.

**G.1 — Estorno no lugar da exclusão de pagamento.** Acrescente à
`docs/specs/SPEC-06-qualidade-divida-tecnica.md` a tarefa **T-06.12** 🔲:

- `DELETE /payments/:id` deixa de existir. Pagamento errado é **estornado**: novo status
  (`REFUNDED` ou `VOIDED` — decida e justifique), **motivo obrigatório**, usuário e horário
- O pagamento original permanece no histórico; a receita é a soma dos efetivados menos os estornos
- O evento `payment.status_changed` do catálogo já cobre a transição
- **Pesquise antes de escrever** se algum fluxo, teste ou tela usa o `DELETE` hoje, e cite

**G.2 — ADR candidata: uma reserva por quarto.** Escreva
`docs/sugestoes-documentos-oficiais/07-adr/ADR-007-candidata.md`, no formato das ADRs
(Contexto → Decisão → Alternativas → Consequências):

- **Contexto:** o modelo atual e os três defeitos que nascem dele — P-1, P-4 e D-4 —, com a
  evidência da §11 do catálogo
- **Decisão proposta:** agrupador (*booking*) contendo uma reserva por quarto, cada uma com
  tarifa, hóspede e status próprios — o padrão dos PMS de mercado
- **Alternativas:** manter o pivô com a correção da etapa F; pivô com período desnormalizado
  como fonte única
- **Relação com a SPEC-07** (motor de cálculo da estadia) e com a SPEC-04 (contas)
- **Status:** candidata. Não é decisão tomada — o Gabriel decide quando e se

**Condição de parada:** PR para `develop`, merge pelo portão.

---

### ETAPA H — T-01.4: extrair o `analytics-service`

Os critérios são os **CA-01.4.a a q** da `docs/specs/SPEC-01-microsservicos.md`. O contrato é o
catálogo aprovado, `docs/specs/anexos/SPEC-01-catalogo-eventos.md` **v1.0** — leia a §9.1 antes de
começar: as decisões mudam o comportamento de três consultas.

**Divida em três PRs**, cada um passando pelo portão — é a maior tarefa da trilha, e um PR único
seria irrevisável:

| PR | Branch | Escopo | CAs |
|---|---|---|---|
| **H.1** | `feature/outbox-core` | Tabela de *outbox*, gravação nos controllers, publicador, topologia do RabbitMQ, credenciais por serviço | a, b, c, d, e |
| **H.2** | `feature/analytics-service` | `services/analytics-service/` com `package.json`, `Dockerfile`, banco próprio, consumidor, projeções e carga inicial | g, h, i, j, l, m |
| **H.3** | `feature/analytics-cutover` | As 7 consultas sobre as projeções, roteamento do nginx, remoção do `/analytics` do core, Deployment no k8s e serviço no compose | k, n, o, p, q |

**Regras que o catálogo v1.0 acrescentou — não estão nos CAs:**

- O *outbox* é gravado **depois** da escrita de domínio, na mesma transação (§6). Teste
- As consultas sobre a projeção mantêm `NUMERIC` até a resposta — **sem** o `::float` das
  consultas atuais
- **D-3 refinada:** risco de *no-show* = reserva sem nenhum pagamento `PAID`; valores em aberto =
  saldo > 0 (`total_amount` − soma dos `PAID`)
- **D-1:** `email` e `guest_phone` saem das respostas de `/top-guests` e `/alerts`

**O CA-01.4.p precisa de cuidado:** *"`analytics.test.js` passa contra o novo serviço"* foi escrito
antes das decisões. Com D-1, D-2 e D-3, três comportamentos mudam de propósito. Atualize os testes
para o comportamento decidido e **liste no PR cada asserção alterada, com a decisão que a justifica**.
Teste que muda sem justificativa reprova.

**Do P-5 do catálogo:** escritas em lote com `Model.update` + `where` não disparam *hook* por
linha. Os pontos estão listados na §11 — cada um precisa gravar no *outbox* explicitamente.

**Áreas de outro dono — marcar `[revisão do Weslley]` no PR:** `infra/k8s/`, `docker-compose.yml` e
o CI. O CA-01.4.f (métricas no Grafana) depende da T-02.4 dele, ainda não iniciada: entregue o
*endpoint* de métricas do RabbitMQ e registre o painel como pendência dele. **Não bloqueie a H por
causa disso.**

**Capacidade:** a própria SPEC-01 avisa que a T-01.4 entrou maior que a estimativa. Ao fim da H.1,
reporte ao Gabriel uma estimativa para H.2 e H.3 com base no que encontrou.

**Nenhuma etapa desta rodada precisa de nuvem.** Regra absoluta do projeto: free-tier sempre, nunca
o usuário `root` da AWS.

---

## 4. Output esperado

O mesmo da §5 de `pendencias_liberadas_gabriel_16set2026.md`: um PR por etapa — na H, um por
sub-etapa —, critérios um a um com evidência, saída real do portão, Spec atualizada, relatório de
sessão em `docs/historico_sessao/gabriel/`, e a tabela-resumo ao final.

## 5. Quando parar e perguntar

- Qualquer arquivo de chave em `git status` ou num diff
- Qualquer teste que já passava e passou a falhar, **exceto** as asserções do CA-01.4.p justificadas
  pelas decisões D-1 a D-3
- Se a correção da P-1 exigir mudar a máquina de estados da reserva
- Veredito REPROVADO do `qa-redteam` depois de uma tentativa de correção
- `/security-review` com achado de severidade alta
- Ao fim da H.1, para a estimativa de H.2 e H.3

## 6. Fora desta delegação

- **Implementar** o estorno (T-06.12) e o modelo de uma reserva por quarto (ADR-007) — a etapa G só
  os registra
- **T-01.5** (CI por serviço) e **T-01.6** (`b2b-service`)
- **Frontend** — o módulo de reservas, rack e painel do dia terá delegação própria
- **Documentos oficiais da UniFAAT** — nenhum é editado
