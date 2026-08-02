# Planejamento — Frontend e Módulo de Consumo

**Para:** Weslley Lucas · Sirlande Martins
**De:** Gabriel
**Data:** 02/08/2026
**Base:** `develop` @ `169f99a`

---

## 1. O que está sendo proposto

Duas frentes que se completam:

| Frente | O que é | Por que agora |
|---|---|---|
| **Módulo de Consumo** | Comanda, cardápio e conta — cobre F&B e day-use | O sistema só sabe cobrar diária. Toda receita de bar, restaurante e day-use hoje se perde |
| **Frontend** | Interface web mobile-first para recepção, gerência e garçom | Sem interface o produto não é demonstrável nem vendável |

O objetivo desta revisão é deixar o sistema **preparado para a operação real de um hotel
pequeno**, não só para o caminho feliz de uma reserva individual.

---

## 2. Os cenários que precisamos cobrir

Esta é a parte central. O modelo de dados hoje assume:

> **1 reserva = 1 hóspede = 1 conta = 1 pagamento**

A operação de um hotel não é assim. Seis cenários reais, e o que acontece em cada um hoje:

| # | Cenário | Hoje | Depois |
|---|---|---|---|
| 1 | Família numa suíte paga hospedagem **+ consumo** | ⚠️ Parcial — consumo existe, mas sem cardápio e preso à reserva | ✅ Conta única com diárias + consumos, um pagamento |
| 2 | Família com **mais de uma suíte** | ❌ Total calculado só do quarto principal | ✅ Conta única do grupo **ou** uma por suíte, à escolha |
| 3 | Mesma suíte, pessoas de famílias diferentes, **contas separadas** | ❌ Reserva tem 1 hóspede só | ✅ N contas na mesma suíte, com regra de quem paga a diária |
| 4 | **Day-use** — sem suíte, almoça e consome | ❌ Impossível: consumo e pagamento exigem reserva | ✅ Conta avulsa, sem reserva |
| 5 | **Walk-in** — chegou no dia, sem reserva prévia, e consumiu | ⚠️ Dá para fazer, mas em várias telas | ✅ Fluxo de uma tela: cadastra, hospeda e abre conta |
| 6 | **Consumo interno** — refeição de funcionário, cortesia, perda | ❌ Não existe. Se lançar como consumo normal, **infla a receita** | ✅ Tipo próprio, fora do faturamento |

### 2.1 Como cada cenário fica resolvido

A abstração que resolve os seis é a **Conta** (`Account`) — a comanda:

```
Conta
  tipo:     QUARTO | DAY_USE | MESA | INTERNO
  situação: ABERTA | FECHADA | PAGA
  reserva:  (pode ser nula — day-use e consumo interno não têm)
  quarto:   (pode ser nulo)
  hóspede:  (pode ser nulo — "Mesa 5" já identifica)
  rótulo:   "Suíte 201 — João"  |  "Mesa 5"  |  "Piscina — Ana"
```

**Cenário 1 — Família, uma suíte**
Uma conta tipo `QUARTO`, ligada à reserva. Diárias e consumos somam na mesma conta.
Um pagamento fecha tudo.

**Cenário 2 — Família, várias suítes**
No check-in a recepção escolhe:
- *Não informar nada* → **uma conta** para o grupo inteiro, com a diária de todas as suítes
- *Informar uma conta por suíte* → contas separadas, cada uma com a diária do seu quarto

**Cenário 3 — Mesma suíte, contas separadas**
Duas contas com o mesmo `quarto`, hóspedes diferentes. Aqui aparece uma pergunta que o
plano original não respondia: **quem paga a diária?**
Resolvido com um campo novo — só a conta marcada como responsável carrega a hospedagem;
as demais são só de consumo. Detalhe em §3.

**Cenário 4 — Day-use**
Conta tipo `DAY_USE`, sem reserva e sem quarto. A conta fecha com `hospedagem = 0`.
A entrada do day-use, se for cobrada, entra como um produto de categoria `SERVIÇO`.

**Cenário 5 — Walk-in**
Não é um caso novo de modelo de dados: é uma reserva criada para hoje com check-in
imediato. O que muda é a **interface** — hoje seriam 4 telas (cadastrar hóspede, criar
reserva, confirmar, fazer check-in). Vira uma só.

**Cenário 6 — Consumo interno**
É o caso que mais muda o desenho, e vale explicar por quê.

---

## 3. O que é novo nesta revisão

Dois pontos que o planejamento anterior não cobria e que só apareceram ao levantar os
cenários reais.

### 3.1 Consumo interno — e por que ele não pode ser "só mais um consumo"

Refeição de funcionário, cortesia para um hóspede e produto perdido **saem do estoque mas
não são receita**. Se forem lançados como consumo comum:

- A receita do mês fica inflada com dinheiro que nunca entrou
- ADR e RevPAR ficam errados
- Não dá para responder "quanto demos de cortesia este mês?"

E são três eventos de negócio diferentes, não um só:

| Situação | Onde é lançado | Efeito |
|---|---|---|
| Refeição de funcionário | Conta tipo `INTERNO` | Custo, nunca cobrado |
| Perda, quebra, vencimento | Conta tipo `INTERNO`, motivo `PERDA` | Custo, e alimenta controle de estoque no futuro |
| **Cortesia a um hóspede** | Conta **do hóspede**, item marcado como cortesia | Fica visível na conta dele ("a casa oferece"), mas não soma no total |

Por isso a proposta é:

```
Conta        → ganha o tipo INTERNO
Item da conta → ganha "faturável" (sim/não) e "motivo"
                 motivos: CORTESIA | FUNCIONARIO | PERDA | USO_INTERNO
```

**Regra:** o total da conta e todos os relatórios de receita somam **apenas itens
faturáveis**. Os não faturáveis continuam registrados — é exatamente o que permite medir
quanto se deu de cortesia e quanto se perdeu.

### 3.2 Quem paga a diária quando a conta é dividida

No cenário 3 (mesma suíte, contas separadas), alguém precisa carregar a hospedagem.
Sem uma regra explícita, a diária ou é cobrada duas vezes ou some.

```
Conta → ganha "cobra_hospedagem" (sim/não), padrão: sim
```

Ao dividir, a recepção marca qual conta carrega a diária. As demais nascem só de consumo.
No cenário 2 com uma conta por suíte, cada conta cobra a diária **do seu próprio quarto**.

### 3.3 Impacto no que já estava planejado

| Item | Ajuste |
|---|---|
| `Account` | + tipo `INTERNO` · + campo `cobra_hospedagem` |
| `AccountItem` | + `faturável` · + `motivo` |
| Cálculo da conta | Soma só itens faturáveis |
| `GET /analytics/revenue` | Exclui contas internas e itens não faturáveis |
| Fatia 2a e 3a | Ganham estes campos e as regras de soma |
| Relatório novo | "Cortesias e perdas do período" — pequeno, alto valor para o dono |

Nenhum desses ajustes muda a ordem das fatias nem o prazo de forma relevante:
**~19 dias → ~21 dias.**

---

## 4. Frontend — o que pesquisamos e o que decidimos

### 4.1 Referências de mercado

| Produto | O que aprendemos |
|---|---|
| **Cloudbeds** | Painel do dia com Chegadas / Saídas / Na casa. Calendário com arrastar-e-soltar para trocar quarto sem abrir a reserva |
| **Mews** | Ficha de hóspede forte: histórico, preferências, notas |
| **Hospedin** (concorrente mais direto — pousadas BR, a partir de R$ 59,90/quarto) | "Mapa de reservas" como tela central. Preço por quarto, modelo que cabe no nosso público |
| **Consumer / Saipos** (comanda de restaurante) | Seleciona comanda → toca no produto → envia. Um princípio vale por tudo: *se for mais lento que o papel, falhou* |

O dado que mais orientou as decisões: pesquisas de usabilidade de PMS apontam que
recepcionistas levam **mais de 4 meses** para usar o sistema com confiança, recebendo cerca
de **2 semanas** de treinamento. **A curva de aprendizado é o problema do setor.**

Nosso posicionamento: não competir em amplitude com Cloudbeds. Competir em **operação de
pousada pequena com bar e restaurante** — rack simples + comanda no celular. É o buraco
entre um PMS puro e um sistema de restaurante.

### 4.2 Quem usa, e de onde

| Pessoa | Onde está | Dispositivo | Tela crítica |
|---|---|---|---|
| Recepcionista | Balcão | Desktop | Rack + check-in/out |
| Dono / gerente | Circulando | **Celular** | Painel do dia |
| **Garçom** | Salão, piscina | **Celular, uma mão livre** | Comanda |
| Camareira | Andares | **Celular** | Lista de quartos |
| Hóspede | Qualquer lugar | **Celular** | Site de reservas |

Quatro das cinco em celular — por isso **mobile-first**.

**Com uma ressalva honesta:** o rack de reservas é uma matriz de 20–80 quartos × 30 dias.
Não cabe num celular. A saída não é espremer, é entregar coisas diferentes:
desktop recebe o grid; celular recebe a **agenda do dia** (chegadas, saídas, na casa), que
é o que alguém em pé realmente quer saber.

### 4.3 Stack

**React + TypeScript + Vite**, monorepo com três aplicações:

| App | Para quem | Tecnologia |
|---|---|---|
| `pms` | Recepção, gerência, garçom | React + Vite (SPA + PWA) |
| `booking` | Hóspede (site público do hotel) | Next.js — precisa de SEO |
| `admin` | Nós, gerenciando os hotéis | React + Vite |

Duas escolhas que valem justificar:

**TypeScript** — é o que separa projeto de faculdade de produto mantível. Renomear um campo
em 40 telas sem tipos é inviável, e adotar depois custa cerca de 10× mais.

**Cliente de API gerado do Swagger** — o backend já expõe OpenAPI. Gerando o cliente a
partir dele, um campo que muda no backend vira **erro de compilação** no frontend, em vez
de `undefined` em produção. Isso cria um incentivo saudável: **manter o Swagger em dia
deixa de ser burocracia e passa a ser pré-requisito.**

---

## 5. O que descobrimos que trava o frontend

Levantamento feito no código, não suposição:

| Gap | Onde | Gravidade |
|---|---|---|
| **CORS não existe** em lugar nenhum | `bootstrap/app.js` | 🔴 A primeira requisição do frontend falha |
| `GET /reservations` **sem filtro de data nem paginação** | `ListReservationController.js:9` — `findAll` do tenant inteiro com 3 joins | 🔴 O rack não tem como ser construído |
| **Não existe a role `WAITER`** | `UserModel.js:29` — só `ADMIN` e `RECEPTIONIST` | 🔴 O garçom veria o sistema inteiro |
| JWT de 8h sem refresh | `LoginController.js:51` | 🟡 Sessão cai no meio do turno |
| Endpoint público devolve `Payment` inteiro | `GetBookingStatusController.js:21` | 🟡 Expõe `pix_qr_code` sem autenticação |
| 5 routers fora do Swagger | `config/swagger.js` | 🟡 Some do cliente tipado |

Os três primeiros viram a **Fatia 0**, antes de qualquer tela.

---

## 6. Como vamos trabalhar

### Git worktree — um repositório, três áreas isoladas

```
~/sistema_gestao_hotel   develop     → integração
~/hotel-j2               backend     → módulo de consumo
~/hotel-j3               frontend    → app-pms
        └── mesmo .git compartilhado
```

Isso substitui os clones separados, que já causaram dois problemas reais: um agente
trabalhou 106 commits atrasado e concluiu que não existia módulo de consumo; depois outro
não encontrou a própria documentação. Com worktree há um só conjunto de referências.

Efeito colateral útil: como `develop` fica ocupada pelo repositório de integração,
**é impossível commitar em `develop` por engano** — o git recusa.

### Portão de qualidade em duas camadas

| Camada | O quê | Quando |
|---|---|---|
| **1 — Automática** | `npm run qa:checks` — 7 verificações objetivas | No CI, a cada push. Reprova o build |
| **2 — Auditoria** | Revisor adversarial: SOLID, DRY, KISS, LGPD, UI/UX | Ao terminar cada fatia, antes do merge |

A camada 1 pega, por exemplo: `require()` em projeto ESM, `findByPk()` sem `tenant_id`
(vazamento entre hotéis), `tenant_id` lido do body em vez do token, rota literal declarada
depois de `/:id`, log com dado pessoal, endpoint fora do Swagger.

O CI agora também roda em branches `feature/**` e `fix/**` — antes só rodava em `main` e
`develop`, então código quebrado só aparecia no merge.

---

## 7. Cronograma

```
BACKEND (consumo)                        FRONTEND
────────────────────────────────────────────────────────────────
0   CORS, filtro de datas, role WAITER   Fase 0  monorepo + design system
              │                                       │
              └────────── desbloqueia ────────────────┤
                                                      ▼
1   Catálogo de produtos                 Fase 1  rack, reservas,
2a  Conta + itens (+ interno)                    check-in/out, hóspedes
2b  Migração do consumo atual
3a  Conta e fechamento  ← parada segura              │
              │                                       │
              └────────── desbloqueia ────────────────┤
                                                      ▼
3b  Pagamento ↔ conta   [risco: PIX]     Fase 2  comanda do garçom
3c  Bill da reserva delegando            Fase 3  financeiro + analytics
4   Split bill + day-use + walk-in       Fase 4  grupos (B2B)
5   Seed, Swagger, testes
```

**Backend:** ~21 dias · **Frontend até a Fase 4:** ~8 semanas

Duas decisões de sequenciamento que valem explicar:

**A Fatia 3b vai sozinha numa branch.** É o único ponto que pode quebrar o motor de reserva
direta e o PIX. Isolada, se o teste ficar vermelho a causa é inequívoca.

**A Fatia 3a é ponto de parada seguro.** Parar ali ainda entrega catálogo, comanda e conta
— tudo que o app do garçom precisa. Day-use e split bill podem ficar para depois sem deixar
nada quebrado pela metade.

---

## 8. Onde cada um pode entrar

Sugestão, aberta a discussão:

| Frente | Perfil | Por quê |
|---|---|---|
| **Backend do consumo** | Quem já mexeu em `Payment`, `Consumption` e no fechamento de conta | O Weslley fez os gaps B2B/financeiro e o delete de consumo com auditoria — é a área dele |
| **Revisão e testes** | Quem já fez o review funcional do B2B | A Sirlande fez o review de contratos e orçamentos e as correções que saíram dele |
| **Frontend Fase 0/1** | Quem tiver mais interesse em React | Ninguém tem posse ainda — é frente nova |

A Fase 0 do frontend (monorepo, design system, tipos) é boa porta de entrada: não depende
da API e dá para trabalhar em paralelo com todo o resto.

---

## 9. O que precisamos decidir juntos

1. **Consumo interno entra agora ou depois?** Ele muda `Account` e `AccountItem`, então é
   muito mais barato fazer junto da Fatia 2a do que voltar depois. Recomendo agora.
2. **Cortesia zera o valor ou mostra riscado?** Preferência de operação — muda a tela e o PDF.
3. **Estoque entra no escopo?** Consumo interno é a porta de entrada natural para controle de
   estoque. Recomendo **não** agora — vira um módulo inteiro. Mas o modelo já fica preparado.
4. **Divisão das frentes** — §8.
5. **O relatório de cortesias e perdas** entra na Fatia 5 ou fica para depois?

---

## 10. Documentos de apoio

| Documento | Conteúdo |
|---|---|
| `docs/frontend/PLANEJAMENTO_FRONTEND.md` | Análise de mercado completa, mapa de telas ligado aos endpoints, design system, roadmap |
| `docs/historico_sessao/gabriel/planejamento_modulo_consumo_02ago2026.md` | Especificação das 9 fatias do backend |
| `docs/delegacoes/modulo_consumo_02ago2026.md` | Contrato de execução: ordem, armadilhas, critérios de aceite |
| `docs/COORDENACAO_AGENTES.md` | Worktrees, portão de QA, propriedade de arquivos |
| `docs/BRIEFING_AGENTE_EXECUTOR_02ago2026.md` | Estado real da base de código |
