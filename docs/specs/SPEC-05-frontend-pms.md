# SPEC-05 — Frontend `app-pms`

**Prioridade:** 🟠 Alta — é o que a banca vê funcionando
**Estado:** 🟡 Parcialmente implementado — Fase 0 completa, Fase 1 ~20%
**Criado em:** 26/08/2026
**Depende de:** SPEC-04 (para a Fase 2)

---

## 1. Contexto

Interface web do PMS. O plano completo está em `docs/frontend/PLANEJAMENTO_FRONTEND.md` — esta Spec **não o substitui**, apenas registra o estado real e organiza o que falta em tarefas executáveis.

### 1.1 Estado real, verificado no código em 26/08

**Fase 0 — Fundação: ✅ completa e mergeada**

Monorepo pnpm + Turborepo com `apps/{pms,booking,admin}` e `packages/{ui,api-client,domain,config}`. Design system com tokens de status, dinheiro em centavos inteiros, datas ancoradas em `America/Sao_Paulo`, máquinas de estado em allowlist, cliente tipado gerado do OpenAPI, login e roteamento por papel.

**Fase 1 — Recepção: 🟡 ~20%**

Verificado em `frontend/apps/pms/src/App.tsx`:

| Rota | Estado real |
|------|-------------|
| `/login` | ✅ Implementada |
| `/hospedes` · `/novo` · `/:id` · `/:id/editar` | ✅ Implementadas — CRUD com busca e ficha de histórico |
| `/` (Hoje) | 🔲 **`<Placeholder title="Hoje" />`** |
| `/reservas` | 🔲 **`<Placeholder title="Reservas" />`** |
| `/comanda` | 🔲 **`<Placeholder title="Comanda" />`** |
| `/config/usuarios` | 🔲 **`<Placeholder title="Usuários" />`** |

Não existem telas de quartos, categorias, check-in/out, rack, financeiro, analytics nem B2B.

---

## 2. Objetivo

Completar a interface do PMS até o nível de demonstração ao vivo na defesa, cobrindo o fluxo operacional de recepção e a comanda do garçom.

---

## 3. Decisões já tomadas (não reabrir)

| Decisão | Escolha |
|---------|---------|
| Stack | React 19 + TypeScript + Vite + Tailwind, monorepo pnpm + Turborepo |
| Responsividade | Mobile-first, **exceto** rack e analytics — layout de desktop dedicado |
| Rack no mobile | Componente **separado** (agenda do dia), não o grid espremido |
| Dinheiro | Centavos inteiros; `DECIMAL` chega como **string** do `pg`, nunca `Number()` |
| Datas | `America/Sao_Paulo` fixo via `@hotel/domain` |
| Cortesia | Preço riscado com rótulo, somando zero |
| Integração em dev | Proxy do Vite — CORS não bloqueia desenvolvimento |

---

## 4. Tarefas

> **Revisão 2.0.** O levantamento `docs/frontend/REQUISITOS_TELAS_PMS_09set2026.md` comparou as telas atuais com o padrão de PMS de mercado e produziu 62 requisitos (RT-01 a RT-62). Eles foram distribuídos nas tarefas abaixo; quatro tarefas novas (T-05.9 a T-05.12) cobrem o que não tinha lugar.

| Requisitos de tela | Tarefa |
|---|---|
| RT-01 a RT-07 | T-05.4 — mapa de reservas |
| RT-08 a RT-13 | T-05.3 — painel do dia |
| RT-14 a RT-20 | T-05.2 — reserva e conta |
| RT-21 a RT-25 | T-05.2 — fluxo de nova reserva |
| RT-26 a RT-30 | T-05.10 — ficha do hóspede |
| RT-31 a RT-35 | T-05.9 — governança |
| RT-36 a RT-38 | T-05.5 — comanda |
| RT-39 a RT-43 | ⛔ **SPEC-07** — tarifas por período, majoritariamente backend |
| RT-44 a RT-47 | T-05.11 — fechamento de turno · T-05.6 — financeiro |
| RT-48 a RT-52 | T-05.6 — indicadores |
| RT-53 a RT-54 | T-05.7 — B2B |
| RT-55, RT-57 | T-05.12 — busca e listagens no servidor |
| RT-56, RT-58 a RT-62 | transversais — critérios distribuídos nas tarefas |

---

### T-05.1 — Completar a Fase 1: quartos e categorias 🔲 *(~3 dias)*

Endpoints já existem: `/rooms`, `/room-categories`.

**Critérios de aceitação**
- [ ] **CA-05.1.a** — CRUD de categorias com capacidade e tarifa
- [ ] **CA-05.1.b** — CRUD de quartos com número, andar, categoria e status
- [ ] **CA-05.1.c** — Status do quarto exibido com **cor + rótulo**, nunca só cor
- [ ] **CA-05.1.d** — Escrita restrita a `ADMIN`, refletindo o backend
- [ ] **CA-05.1.e** — Estados de carregamento, vazio e erro em todas as telas
- [ ] **CA-05.1.f** — Alvo de toque ≥ 48px nas ações usadas em mobile

---

### T-05.2 — Reservas e check-in/out 🔲 *(~4 dias)*

Endpoints já existem, incluindo `?from=&to=` e paginação (Fatia 0).

**Critérios de aceitação**
- [ ] **CA-05.2.a** — Lista de reservas com filtro por período e paginação
- [ ] **CA-05.2.b** — Detalhe da reserva com hóspede, quarto, período e valores
- [ ] **CA-05.2.c** — Criação de reserva usando `GET /rooms/available`
- [ ] **CA-05.2.d** — Ações de check-in, check-out e cancelar, respeitando a máquina de estados
- [ ] **CA-05.2.e** — Ação indisponível fica **desabilitada com motivo**, não some
- [ ] **CA-05.2.f** — Conta da reserva (`/bill`) exibida no check-out
- [ ] **CA-05.2.g** — Valores formatados via `@hotel/domain`, sem `Number()` direto
- [ ] **CA-05.2.h** — Conta em **linha do tempo** — diárias, consumos, pagamentos e saldo — e não apenas o total (RT-15)
- [ ] **CA-05.2.i** — Saldo da estadia visível no cabeçalho, em qualquer aba da reserva (RT-14)
- [ ] **CA-05.2.j** — Estorno de consumo exibindo quem autorizou, a partir de `deleted_by` (RT-18)
- [ ] **CA-05.2.k** — Comprovante da conta imprimível ou em PDF, para entregar no check-out (RT-20)
- [ ] **CA-05.2.l** — No fluxo de nova reserva, hóspede reaproveitado da base por CPF, e-mail ou telefone, e cadastrável sem perder o que já foi preenchido (RT-23, RT-24)
- [ ] **CA-05.2.m** — Valor da estadia e número de diárias exibidos **antes** de confirmar (RT-22)

---

### T-05.3 — Painel "Hoje" 🔲 *(~2 dias)*

**DEP:** T-05.2

Tela inicial da recepção. Substitui o placeholder.

**Critérios de aceitação**
- [ ] **CA-05.3.a** — Chegadas, saídas e hóspedes na casa, do dia
- [ ] **CA-05.3.b** — Ação direta de check-in/out a partir da lista
- [ ] **CA-05.3.c** — Alertas relevantes (`/analytics/alerts`)
- [ ] **CA-05.3.d** — Funciona bem no celular — é a tela que o gerente abre andando
- [ ] **CA-05.3.e** — Contagem em cada bloco e, no topo, quartos vendidos, livres e ocupação do dia (RT-08, RT-12)
- [ ] **CA-05.3.f** — Chegada sem pagamento registrado destacada como risco de *no-show* (RT-10)
- [ ] **CA-05.3.g** — Quartos parados em `CLEANING` visíveis, com ação de liberar (RT-11)

---

### T-05.4 — Rack de reservas 🔲 *(~5 dias)* — tela mais complexa

**DEP:** T-05.2

**Critérios de aceitação**
- [ ] **CA-05.4.a** — Desktop: grid quartos × dias, com scroll horizontal virtualizado
- [ ] **CA-05.4.b** — Mobile: **componente separado** — agenda do dia, não o grid espremido
- [ ] **CA-05.4.c** — Cores de status com rótulo acessível
- [ ] **CA-05.4.d** — Consome `?from=&to=`, sem baixar o tenant inteiro
- [ ] **CA-05.4.e** — Clicar numa reserva abre o detalhe
- [ ] **CA-05.4.f** — Navegável por teclado — recepcionista é usuário de teclado
- [ ] **CA-05.4.g** — Clicar em intervalo livre inicia nova reserva com quarto e datas preenchidos (RT-03)
- [ ] **CA-05.4.h** — Quarto em manutenção ou limpeza aparece bloqueado, visualmente distinto de quarto vendido (RT-05)
- [ ] **CA-05.4.i** — Sobreposição recusada explica o motivo — o banco já a impede pela constraint `EXCLUDE` (RT-06)

> **Arrastar para mover ou estender (RT-04) fica fora desta tarefa.** Depende de endpoint que altere quarto e período respeitando a máquina de estados e a constraint de sobreposição, e esse endpoint não existe. O mapa somente-leitura já é o salto de valor; o arrastar entra quando o backend existir.

> Deixada por último **de propósito**: as telas anteriores validam design system, cliente de API, formulários e estados de erro com risco baixo. Se algo estiver errado, aparece antes do rack.

---

### T-05.5 — Comanda do garçom 🔲 *(~4 dias)*

**DEP:** ⛔ **SPEC-04 T-04.3** (endpoints `/accounts` e `/products`)

**Critérios de aceitação**
- [ ] **CA-05.5.a** — Tela inicial do garçom **é** a lista de contas abertas, sem tela intermediária
- [ ] **CA-05.5.b** — Cardápio em grade, categorias como chips, preço visível
- [ ] **CA-05.5.c** — Um toque no produto lança quantidade 1; quantidade só se diferente
- [ ] **CA-05.5.d** — Rodapé fixo com total da conta
- [ ] **CA-05.5.e** — **Fila offline** com `client_item_id` — reconexão não duplica
- [ ] **CA-05.5.f** — Confirmação otimista; erro de rede não aparece como falha
- [ ] **CA-05.5.g** — **Desfazer** em vez de diálogo de confirmação
- [ ] **CA-05.5.h** — Cortesia exibida com **preço riscado e rótulo**, somando zero
- [ ] **CA-05.5.i** — Alvo ≥ 48px; ações na metade inferior — uso com uma mão
- [ ] **CA-05.5.j** — `WAITER` não vê nada além da comanda
- [ ] **CA-05.5.k** — Produtos mais lançados em destaque, acima do cardápio completo — a curva de uso é curta e repetitiva (RT-36)
- [ ] **CA-05.5.l** — Transferir item entre contas e conta inteira entre quartos ou mesas (RT-37)
- [ ] **CA-05.5.m** — Dividir a conta por pessoa **no fechamento**, não só na abertura (RT-38)

> **Critério de aceite do módulo:** se for mais lento que a comanda de papel, falhou.

---

### T-05.6 — Financeiro e analytics 🔲 *(~3 dias)*

Endpoints já existem (7 de analytics + `/payments`).

**Critérios de aceitação**
- [ ] **CA-05.6.a** — Registro e listagem de pagamentos
- [ ] **CA-05.6.b** — Telas de ocupação, receita, sazonalidade e ranking
- [ ] **CA-05.6.c** — Desktop: gráficos; **mobile: 4 números do dia em cartões**
- [ ] **CA-05.6.d** — Relatório de cortesias e perdas (depende de SPEC-04 T-04.7)

---

### T-05.7 — Grupos (B2B) 🔲 *(~3 dias)*

Endpoints já existem.

**Critérios de aceitação**
- [ ] **CA-05.7.a** — CRUD de clientes corporativos
- [ ] **CA-05.7.b** — Orçamentos com serviços e download de PDF
- [ ] **CA-05.7.c** — Contratos com parcelas, assinatura e cancelamento
- [ ] **CA-05.7.d** — Baixa de parcela

---

### T-05.8 — Configurações 🔲 *(~2 dias)*

**Critérios de aceitação**
- [ ] **CA-05.8.a** — CRUD de usuários com papel (substitui o placeholder)
- [ ] **CA-05.8.b** — Dados do hotel (`/tenants/me`), incluindo `booking_enabled` e `deposit_percent`
- [ ] **CA-05.8.c** — Cardápio de produtos

---

### T-05.9 — Governança (*housekeeping*) 🔲 *(~2 dias)*

A tela que **não existe**. Camareira e supervisora não usam a tela da recepção, e este é um dos usos mais frequentes de um PMS.

**Critérios de aceitação**
- [ ] **CA-05.9.a** — Quadro de quartos por andar, com o status de limpeza (RT-31)
- [ ] **CA-05.9.b** — Marcar quarto como limpo direto do quadro, pelo celular (RT-32)
- [ ] **CA-05.9.c** — Prioridade do dia: quartos com saída, com chegada prevista e de hóspede na casa (RT-33)
- [ ] **CA-05.9.d** — Alvo de toque ≥ 48px — é uso em pé, com o celular numa mão

> **Sai quase de graça:** a máquina de estados de quarto já existe (`AVAILABLE → OCCUPIED → CLEANING`) e não é preciso backend novo. Registro de manutenção e histórico de quem limpou (RT-34, RT-35) **ficam fora**: exigem entidade de tarefa com responsável, que não existe.

---

### T-05.10 — Ficha de registro do hóspede 🔲 *(~2,5 dias)* — realiza **RF-055**

**Atravessa a fronteira:** o `GuestModel` tem quatro campos (`full_name`, `cpf`, `phone`, `email`). Esta tarefa inclui os campos no backend, porque sem eles não há o que exibir.

**Critérios de aceitação**
- [ ] **CA-05.10.a** — Campos da ficha no model, no `db/schema.sql` e no Doc. 04: documento e tipo, data de nascimento, nacionalidade, endereço e motivo da viagem (RT-26)
- [ ] **CA-05.10.b** — Formulário organizado em seções, e não uma coluna de vinte campos
- [ ] **CA-05.10.c** — Histórico de estadias do hóspede: quantas vezes voltou, quanto gastou, última estadia (RT-27)
- [ ] **CA-05.10.d** — Observações operacionais — preferência de quarto, alergia, restrição alimentar (RT-28)
- [ ] **CA-05.10.e** — Acompanhantes da estadia, inclusive menores sem documento próprio (RT-29)
- [ ] **CA-05.10.f** — Ação de eliminação definitiva restrita a `ADMIN` (RT-30 · **SPEC-06 T-06.11**)
- [ ] **CA-05.10.g** — Campo novo de dado pessoal só entra se a operação o usa — minimização, não coleta por precaução

> **O requisito mais barato do levantamento e o único com exigência legal.** Meio de hospedagem é obrigado a manter registro de hóspedes; com quatro campos o Gesway não atende. Confirmar com a coordenação o instrumento normativo aplicável antes de citá-lo na defesa.

---

### T-05.11 — Fechamento de caixa por turno 🔲 *(~3 dias)* — realiza **RF-056**

**Atravessa a fronteira:** não existe endpoint de fechamento. A tarefa inclui o backend.

**Critérios de aceitação**
- [ ] **CA-05.11.a** — Lançamentos do turno agrupados por meio de pagamento, com total conferível (RT-44)
- [ ] **CA-05.11.b** — Operador informa o valor conferido; o sistema calcula e **registra** a divergência (RT-45)
- [ ] **CA-05.11.c** — Fechamento nominal: quem fechou e quando; imutável depois de confirmado
- [ ] **CA-05.11.d** — Contas em aberto de hóspedes na casa, para não perder consumo no check-out (RT-46)
- [ ] **CA-05.11.e** — Parcelas de contrato a vencer (RT-47)
- [ ] **CA-05.11.f** — Teste da regra financeira, incluindo o caso de divergência

> É a mais pesada das três tarefas novas, e a que tem valor operacional mais direto: é o que o gerente cobra do recepcionista todo dia.

---

### T-05.12 — Busca global e listagens no servidor 🔲 *(~2 dias)*

**DEP:** ⛔ **SPEC-06 T-06.10** (paginação) e busca por termo no backend

**Problema atual:** `GuestsListPage.tsx` chama `filterGuests(data, term)` — filtra **no cliente**, sobre o `findAll` inteiro. Funciona com 20 hóspedes e falha com 5.000.

**Critérios de aceitação**
- [ ] **CA-05.12.a** — Busca global por hóspede, reserva e quarto, aberta por atalho de teclado (RT-55)
- [ ] **CA-05.12.b** — Listagens paginadas, ordenadas e filtradas **no servidor** (RT-57)
- [ ] **CA-05.12.c** — Nenhuma tela baixa a coleção inteira do tenant para filtrar na memória
- [ ] **CA-05.12.d** — Atalhos de teclado nas telas de recepção (RT-56)

---

## 5. Ressalvas de auditoria ainda abertas

Do `qa-redteam` nas Fases 0 e 1:

| Ressalva | Estado |
|----------|--------|
| Swagger sem schema de resposta em **82%** dos endpoints 2xx (51 de 62, medido em 09/09) — força `as unknown as` no cliente "tipado" | 🔲 Ver **SPEC-06 T-06.2** |
| Ficha do hóspede baixa **todas** as reservas do tenant e filtra no cliente | 🔲 Ver **T-05.12** — é o mesmo defeito da lista de hóspedes |
| `openapi.json` do `api-client` está defasado: 37 paths, sem `/products` | 🔲 Regenerar ao executar a T-06.2; cliente tipado hoje sai de spec antiga |
| `StatusBadge` só cobre status de quarto; reserva ficará sem | 🔲 Generalizar antes da T-05.2 |

---

## 6. Definition of Done

- [ ] Nenhum `<Placeholder>` restante nas rotas principais
- [ ] Fluxo de recepção completo: reserva → check-in → consumo → conta → pagamento → check-out
- [ ] Comanda usável em celular
- [ ] Mapa de reservas legível no desktop e agenda do dia no celular
- [ ] Nenhuma tela baixando coleção inteira do tenant para filtrar no cliente
- [ ] Governança operável pelo celular por quem limpa o quarto
- [ ] Turno fechável com divergência registrada
- [ ] Build de produção limpo e typecheck sem erro
- [ ] Auditoria `qa-redteam` sem achado 🔴

---

## 7. Riscos

| Risco | Impacto | Mitigação |
|-------|---------|-----------|
| Rack subestimado | Alto | Deixado por último; prototipar com dados do seed |
| Comanda travar esperando SPEC-04 | Médio | T-05.1 a T-05.4 e T-05.6/07 não dependem dela |
| `baseUrl` de produção não resolvido | Médio | `VITE_API_URL` já tratado na Fase 0; validar no deploy |
| Casts mascarando erro de tipo | Médio | SPEC-06 T-06.2 elimina a causa |
| **Escopo dobrou na revisão 2.0** — quatro tarefas novas, ~9,5 dias | 🔴 Alto | T-05.9 a T-05.12 vêm **depois** do fluxo de recepção; se o prazo apertar, cortam-se inteiras sem quebrar o que veio antes |
| T-05.10 e T-05.11 exigem backend que ninguém estimou | Médio | Ambas declaram que atravessam a fronteira; estimativa já as inclui |
| Confundir requisito de tela com Spec de tarifas | Médio | RT-39 a RT-43 saíram desta Spec e viraram **SPEC-07** |

---

## 8. Histórico

| Versão | Data | Autor | Alteração |
|--------|------|-------|-----------|
| 1.0 | 26/08/2026 | Gabriel Reis Cunha | Criação. Estado verificado em `App.tsx` — 4 rotas ainda são placeholder |
| 2.0 | 09/09/2026 | Gabriel Reis Cunha | Absorve o levantamento `docs/frontend/REQUISITOS_TELAS_PMS_09set2026.md` (RT-01 a RT-62). Acrescenta o mapa RT → tarefa em §4, novos critérios nas tarefas T-05.2 a T-05.7, e quatro tarefas: **T-05.9** governança, **T-05.10** ficha de registro do hóspede (RF-055), **T-05.11** fechamento de caixa por turno (RF-056) e **T-05.12** busca global e listagens no servidor. Tarifas por período saíram para a **SPEC-07** por serem majoritariamente backend. Ressalva do Swagger atualizada de 79% para **82%**, remedida em 09/09, e registrada a defasagem do `openapi.json` do `api-client` |
