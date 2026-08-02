# Planejamento de Frontend — PMS Hotel SaaS
**Desenvolvedor:** Gabriel (orquestrador)
**Data:** 02/08/2026
**Base:** `develop` @ `227d905`
**Escopo desta entrega:** análise de mercado, arquitetura de frontend, mapa de telas e roadmap

---

## 1. Sumário executivo

| Decisão | Escolha | Motivo |
|---|---|---|
| Stack | **React + TypeScript + Vite** (monorepo pnpm + Turborepo) | Maior pool de talento e de componentes para as telas densas (rack, tabelas). TS é o que sustenta manutenção além do TCC. |
| Divisão | **3 apps num monorepo** — `app-pms`, `app-booking`, `app-admin` | Públicos com segurança e ciclo de vida diferentes. Compartilham design system e cliente de API. |
| Abordagem responsiva | **Mobile-first com duas exceções deliberadas** | 4 das 6 personas usam celular. Rack e analytics exigem densidade de desktop — recebem layout próprio, não espremido. |
| Escopo TCC | **`app-pms`: recepção + comanda do garçom** | Núcleo operacional e melhor demonstração do diferencial de consumo. |
| Site público e backoffice | Estrutura criada agora, implementação pós-TCC | Evita entregar 4 superfícies pela metade. |

**Antes de escrever a primeira linha de frontend, 3 correções de backend são bloqueantes** — ver §9.

---

## 2. Alerta de sincronismo entre agentes

Os documentos `analise_gaps_consumo_02ago2026.md` e `planejamento_modulo_consumo_02ago2026.md` foram escritos contra o clone `C:\Users\gabri\sistema_hotel_prova`, que está na `main` em **`55eaae0` (PR #36)**. A `origin/main` atual está em **`0c463fd` (PR #70)** — cerca de 34 PRs de diferença.

Consequência direta: o plano afirma *"Não existe `ConsumptionModel`"*, mas a `develop` **já tem** um módulo de consumo funcionando:

| Já existe na `develop` | Arquivo |
|---|---|
| `ConsumptionModel` (com `reservation_id` NOT NULL e `deleted_by` para auditoria) | `app/Models/ConsumptionModel.js` |
| `POST/GET/DELETE /reservations/:id/consumptions` | `routes/apis/reservationRouter.js:41-43` |
| `GET /reservations/:id/bill` (fechamento de conta) | `app/Controllers/ReservationApi/GetBillController.js` |
| Testes cobrindo o fluxo | `tests/bill-consumptions.test.js` |

**Ação necessária:** o repositório canônico é `~/sistema_gestao_hotel` (WSL). O clone Windows deve ser sincronizado ou abandonado antes de qualquer execução do plano de consumo, senão o Sprint 3 reimplementa o `/bill` que já existe e o merge colide com o trabalho do Weslley.

A reconciliação técnica está em §8.1.

---

## 3. Análise de mercado

### 3.1 Os players e o que cada um ensina

| Produto | Posicionamento | O que copiar | O que evitar |
|---|---|---|---|
| **Cloudbeds** | PMS + channel manager + pagamentos num pacote. ~USD 15–17/quarto/mês | Dashboard de recepção com Chegadas / Saídas / Hóspedes na casa / Atividade do dia / Previsão 14 dias. Calendário drag-and-drop que resolve upgrade e troca de quarto sem abrir a reserva | Amplitude de features que exige meses de treino |
| **Mews** | PMS core + marketplace de integrações | Perfil de hóspede forte (CRM): histórico, preferências, notas. Fluxo de check-in enxuto | Depender de marketplace para funcionalidade básica |
| **Hospedin** | **Concorrente mais direto.** Pousadas e hostels pequenos no Brasil, a partir de R$ 59,90/mês por quarto, 2.500+ clientes | "Mapa de reservas" como tela central, tarifário dinâmico, indicadores e relatórios prontos. Preço por quarto — modelo que cabe no nosso público | — |
| **Omnibees** | Distribuição pesada, 750+ conexões OTA/GDS. Hotéis a partir de ~50 quartos | Nada no curto prazo — distribuição é fase de mercado | Escopo de channel manager agora |
| **Desbravador** | Tradicional brasileiro, do pequeno à rede | Cobertura fiscal e de relatórios que o mercado BR exige | Peso e legado de interface |

### 3.2 O que é consenso de interface (e portanto obrigatório)

1. **Mapa/rack de reservas é a tela-âncora.** Em todos os PMS o usuário abre o sistema nela. Grid de quartos × dias, com cores por status.
2. **Cor codifica estado, não decoração.** Livre / Reservado / Ocupado / Limpeza / Manutenção precisam ser distinguíveis num relance — e não só por cor (acessibilidade).
3. **Drag-and-drop no rack** resolve mudar quarto, estender diária e bloquear manutenção sem navegar por telas.
4. **Dashboard operacional do dia**: chegadas, saídas, hóspedes na casa, pendências financeiras.
5. **Mínimo de cliques em check-in/check-out.** É a operação mais repetida do dia.
6. **Ficha do hóspede centralizada**: histórico de estadias, preferências, notas internas.
7. **Módulo de grupos** separado do fluxo individual — blocos de quartos, faturamento. É exatamente o nosso módulo B2B de orçamentos e contratos.
8. **Housekeeping em mobile**, com atualização de status por quarto.

### 3.3 Onde os PMS falham — nossa oportunidade

A pesquisa de UX de PMS aponta um número que define a nossa estratégia:

> Recepcionistas costumam precisar de **4+ meses** para usar o sistema com confiança, embora recebam cerca de **2 semanas** de treinamento.

As falhas recorrentes:

| Falha | Nossa contra-medida |
|---|---|
| Curva de aprendizado alta | Fluxos de 1 tela para as 5 operações diárias. Nada essencial atrás de 3 cliques |
| Falta de automação — muitos cliques e digitação manual | Check-in a partir do rack, conta criada automaticamente, total calculado no servidor |
| Integrações ruins geram retrabalho | API única, sem digitar o mesmo dado duas vezes |
| UX complexa transforma funcionário experiente em instrutor | Interface que um garçom aprende em um turno |

**Posicionamento:** não competimos em amplitude com Cloudbeds. Competimos em *operação de pousada pequena com F&B* — o rack simples + a comanda no celular, que é exatamente o buraco entre um PMS puro e um sistema de restaurante.

### 3.4 O que aprender dos apps de comanda

O módulo de consumo é, na prática, um POS. Referências: Consumer (12 mil restaurantes), Saipos, App Garçon.

Padrão consolidado: **seleciona a comanda → toca no produto → quantidade → envia**. Um princípio vale por toda a especificação:

> A interface precisa ser intuitiva — uma ferramenta complicada atrasa mais o atendimento do que o papel.

Isso é o critério de aceite do app do garçom: **se for mais lento que a comanda de papel, falhou.**

---

## 4. Personas, contexto e dispositivo

| Persona | Onde está | Dispositivo real | Tela crítica | Frequência |
|---|---|---|---|---|
| **Recepcionista** | Atrás do balcão | Desktop, monitor modesto (1366×768 é realista) | Rack + check-in/out | O turno inteiro |
| **Dono / gerente** (pousada pequena) | Circulando pela propriedade | **Celular** | Dashboard, rack em leitura | Várias vezes ao dia |
| **Garçom** | Salão, piscina, quarto | **Celular na mão, uma mão livre** | Comanda | Dezenas de vezes por hora |
| **Camareira** | Andares | **Celular** | Lista de quartos por status | A cada quarto |
| **Hóspede** | Casa, em qualquer lugar | **Celular** (maioria do tráfego hoteleiro) | Motor de reservas | Uma vez |
| **Nós (gestão SaaS)** | Escritório | Desktop | Backoffice de tenants | Diário |

Detalhe operacional que a interface precisa respeitar: em pousada pequena **a mesma pessoa acumula papéis**. O dono é recepcionista de manhã e conferente de caixa à noite. Trocar de contexto tem que ser barato — não pode exigir logout.

---

## 5. A decisão mobile-first, qualificada

**Sim para mobile-first como disciplina padrão.** Quatro das seis personas trabalham em pé com celular. Mobile-first força hierarquia de informação, alvos de toque adequados e economia de requisições — e isso melhora também o desktop.

**Mas há duas telas em que "mobile-first" seria a decisão errada se aplicada literalmente:**

### O rack de reservas
Um rack é uma matriz de 20–80 quartos × 14–30 dias. Isso não cabe num celular sem virar inútil. A saída **não é espremer o grid** — é reconhecer que a pessoa no celular quer outra coisa:

| Dispositivo | Representação | Por quê |
|---|---|---|
| Desktop (≥1280px) | Grid quartos × dias, drag-and-drop, scroll horizontal virtualizado | O recepcionista precisa enxergar ocupação e buracos de uma vez |
| Tablet (768–1279px) | Grid com 7 dias, sem drag-and-drop (toque longo abre menu) | Compromisso |
| Celular (<768px) | **Agenda do dia**: Chegadas / Saídas / Na casa, em lista | Quem está no celular quer saber "quem chega hoje", não a matriz do mês |

São dois componentes distintos consumindo o mesmo endpoint, não um layout responsivo. Tentar unificar produz um rack ruim no desktop e inutilizável no celular.

### Analytics
Gráficos comparativos e tabelas de ADR/RevPAR pedem tela larga. No celular entregamos **os 4 números do dia em cartões** e um link "ver análise completa". O dono no celular quer saber se o dia foi bom, não cruzar sazonalidade.

**Regra de ouro do projeto:** mobile-first por padrão; densidade de desktop onde a tarefa exige — e quando exigir, projetar duas telas em vez de uma elástica.

---

## 6. Arquitetura de frontend

### 6.1 Monorepo e os três apps

```
hotel-frontend/
├── apps/
│   ├── pms/          → React + Vite (SPA + PWA)   — recepção, gerência, garçom, camareira
│   ├── booking/      → Next.js (SSR/SSG)          — site público do hotel, por subdomínio
│   └── admin/        → React + Vite (SPA)         — nosso backoffice de tenants
├── packages/
│   ├── ui/           → design system (Tailwind + shadcn/ui)
│   ├── api-client/   → cliente tipado gerado do OpenAPI
│   ├── domain/       → tipos e regras compartilhadas (máquinas de estado, dinheiro, datas)
│   └── config/       → eslint, tsconfig, tailwind preset
├── pnpm-workspace.yaml
└── turbo.json
```

Por que `booking` é separado e usa Next.js: é a única superfície **pública e indexável**. Página de reservas de hotel vive de SEO e de velocidade de carregamento — conversão cai com LCP alto. Um SPA React puro entrega HTML vazio para o Google. As outras duas são atrás de login, onde SSR não agrega e só custa complexidade de deploy.

Por que `admin` é separado: é código nosso, de gestão da plataforma. Não deve ser baixado pelo navegador de um cliente, nem compartilhar bundle com o app dele.

Por que `pms` acumula recepção **e** garçom: compartilham auth, cliente de API, design system e o mesmo tenant. A diferença é a rota e o role — não justifica um quarto app com deploy e login próprios. O app do garçom é a rota `/comanda` com layout mobile dedicado.

### 6.2 Stack — escolhas e justificativa

Critério: sobreviver ao TCC e continuar sendo mantível por um time pequeno por anos.

| Camada | Escolha | Por que esta e não outra |
|---|---|---|
| Linguagem | **TypeScript** | O ponto que mais separa "projeto de faculdade" de "produto mantível". Renomear um campo em 40 telas sem tipos é inviável. Adotar depois custa 10× |
| Monorepo | **pnpm workspaces + Turborepo** | Padrão de mercado, cache de build, simples. Nx é mais poderoso e mais pesado do que precisamos |
| Build | **Vite** | Dev server instantâneo, config mínima |
| SSR (só booking) | **Next.js** | SEO e roteamento por subdomínio do hotel |
| UI | **Tailwind + shadcn/ui** | shadcn copia o componente para o seu repo — sem lock-in de biblioteca. Base Radix garante acessibilidade e alvos de toque. Serve tabela densa e botão de dedo |
| Estado de servidor | **TanStack Query** | Cache, revalidação, retry, atualização otimista, polling. Um PMS é 90% estado de servidor — resolve o problema central |
| Estado de UI | **Zustand** | Pouco boilerplate. Redux não se justifica quando o servidor é a fonte da verdade |
| Formulários | **React Hook Form + Zod** | Zod espelha a validação do backend e gera os tipos |
| Tabelas | **TanStack Table** + **TanStack Virtual** | Rack e listas longas sem travar |
| Rack | **Componente próprio em CSS Grid** | Tape chart é específico demais para biblioteca pronta; as boas (Bryntum) são pagas e pesadas |
| Gráficos | **Recharts** | Suficiente para as 7 telas de analytics |
| Datas | **date-fns + date-fns-tz** | Diária vira dia errado se o fuso escorregar. Fixar `America/Sao_Paulo` |
| Dinheiro | **inteiros em centavos** na UI | O `pg` devolve `DECIMAL` como **string**. Converter para `Number` introduz erro de ponto flutuante em conta de hotel |
| Testes | **Vitest + Testing Library + Playwright** | Vitest já é o runner do backend — mesma ferramenta nos dois lados |
| PWA | **vite-plugin-pwa (Workbox)** | Fila offline do garçom (§8.2) |
| i18n | **react-i18next** | pt-BR agora. Estruturar desde o início é barato; retrofit é caro |

### 6.3 Cliente de API tipado, gerado do Swagger

O backend já expõe OpenAPI via `swagger-jsdoc` (`config/swagger.js`, servido em `/api-docs`). Isso permite algo que vale muito na manutenção:

```
config/swagger.js  →  openapi.json  →  openapi-typescript  →  packages/api-client (tipado)
```

Um campo que muda no backend vira **erro de compilação** no frontend, em vez de `undefined` em produção. É o maior ganho de manutenibilidade disponível a custo quase zero, e cria um incentivo saudável para manter o Swagger correto.

Requer: garantir que o Swagger cubra os endpoints novos (B2B e consumo hoje estão incompletos).

---

## 7. Arquitetura de informação — `app-pms`

### 7.1 Navegação

Desktop: barra lateral fixa. Celular: bottom tabs com os 4 destinos mais usados.

```
┌─ Hoje              → dashboard operacional (tela inicial)
├─ Rack              → mapa de reservas
├─ Reservas          → lista, busca, nova reserva
├─ Hóspedes          → ficha e histórico
├─ Comanda           → contas abertas e cardápio          [garçom entra direto aqui]
├─ Financeiro        → pagamentos, contas em aberto, caixa
├─ Grupos (B2B)      → clientes corporativos, orçamentos, contratos
├─ Analytics         → ocupação, receita, ADR/RevPAR, alertas
└─ Configurações     → quartos, categorias, usuários, dados do hotel
```

Por role:

| Role | Vê |
|---|---|
| `ADMIN` | Tudo |
| `RECEPTIONIST` | Hoje, Rack, Reservas, Hóspedes, Comanda, Financeiro, Grupos |
| `WAITER` *(a criar — §9)* | Somente Comanda |
| `HOUSEKEEPING` *(a criar — futuro)* | Somente lista de quartos |

### 7.2 Mapa tela → endpoint

Todas as telas abaixo se apoiam em endpoints que **já existem**, exceto onde marcado.

| Tela | Rota | Endpoints |
|---|---|---|
| Login | `/login` | `POST /auth/login` |
| Cadastro de hotel | `/registrar` | `POST /auth/register` |
| **Hoje** | `/` | `GET /reservations` ⚠️ *precisa filtro de data*, `GET /analytics/alerts`, `GET /analytics/occupancy` |
| **Rack** | `/rack` | `GET /reservations?from=&to=` ⚠️ *a criar*, `GET /rooms`, `PUT /reservations/:id` |
| Lista de reservas | `/reservas` | `GET /reservations` ⚠️ *precisa paginação* |
| Detalhe da reserva | `/reservas/:id` | `GET /reservations/:id`, `PUT /reservations/:id`, `POST /:id/rooms`, `DELETE /:id/rooms/:roomId` |
| Nova reserva | `/reservas/nova` | `GET /rooms/available`, `GET /guests`, `POST /reservations` |
| Check-in | modal no rack | `PUT /reservations/:id/check-in` |
| Check-out | modal no rack | `GET /reservations/:id/bill`, `PUT /reservations/:id/check-out` |
| Cancelar | modal | `PUT /reservations/:id/cancel` |
| Hóspedes | `/hospedes` | `GET /guests`, `POST /guests`, `PUT /guests/:id` |
| Ficha do hóspede | `/hospedes/:id` | `GET /guests/:id`, `GET /reservations` (filtrado) |
| **Comanda — contas** | `/comanda` | `GET /accounts?status=OPEN` 🆕 |
| **Comanda — lançar** | `/comanda/:id` | `GET /products` 🆕, `POST /accounts/:id/items` 🆕 |
| **Conta / fechamento** | `/comanda/:id/conta` | `GET /accounts/:id/bill` 🆕, `PUT /accounts/:id/close` 🆕, `POST /accounts/:id/pay` 🆕 |
| Cardápio | `/config/produtos` | CRUD `/products` 🆕 |
| Pagamentos | `/financeiro` | `GET /payments`, `POST /payments` |
| Clientes corporativos | `/grupos/clientes` | CRUD `/corporate-clients` |
| Orçamentos | `/grupos/orcamentos` | CRUD `/event-quotes`, `PUT /:id/confirm`, `PUT /:id/cancel`, `GET /:id/pdf` |
| Contratos | `/grupos/contratos` | CRUD `/contracts`, `PUT /:id/sign`, `PUT /:id/cancel`, `GET /:id/pdf`, `PUT /:id/installments/:iid/pay` |
| Analytics | `/analytics` | `GET /analytics/{revenue,occupancy,alerts,seasonality,revenue-by-category,payment-mix,top-guests}` |
| Quartos e categorias | `/config/quartos` | CRUD `/rooms`, `/room-categories` |
| Usuários | `/config/usuarios` | CRUD `/users` (ADMIN) |
| Dados do hotel | `/config/hotel` | `GET /tenants/me`, `PUT /tenants/me` |

🆕 depende do módulo de consumo · ⚠️ depende de ajuste no backend (§9)

---

## 8. Módulo de Consumo no frontend

### 8.1 Reconciliação com o que já existe

O plano propõe `Product` + `Account` + `AccountItem`. A `develop` já tem `Consumption` preso a uma reserva. **As duas abstrações resolvem o mesmo problema e não podem coexistir** — teríamos dois caminhos para lançar consumo e um `/bill` que soma errado.

| Opção | Avaliação |
|---|---|
| Manter as duas | ❌ Duplicação de fonte da verdade. O `/bill` de reserva e o de conta divergem |
| Descartar `Account`, evoluir `Consumption` | ❌ Não resolve day-use nem split bill — que são a razão do módulo. `reservation_id` é NOT NULL |
| **`Account` absorve `Consumption`** | ✅ **Recomendado** |

Migração recomendada:

1. `Account` tipo `ROOM` passa a ser a conta da estadia; `Consumption` vira `AccountItem`.
2. Migração de dados: para cada `consumption`, criar/localizar a `Account` da reserva e inserir o item correspondente.
3. `GET /reservations/:id/bill` continua existindo, mas passa a **delegar** para as contas da reserva — mantém compatibilidade e não quebra `tests/bill-consumptions.test.js`.
4. `POST /reservations/:id/consumptions` marcado como *deprecated*, respondendo via `Account`. O frontend nasce falando só `/accounts`.

**Impacto no plano de consumo:** o Sprint 3 ("Bill e Fechamento") precisa ser reescrito — não é implementar do zero, é refatorar o `GetBillController` existente. E o Sprint 2 ganha o passo de migração. As estimativas atuais estão subdimensionadas por partirem de uma base errada.

### 8.2 O fluxo do garçom

O critério é ser mais rápido que papel. Isso impõe decisões concretas:

```
1. Abre o app → JÁ está na lista de contas abertas (sem tela intermediária)
   [ Suíte 201 · João        R$ 180,00 ]
   [ Mesa 3 · Day-use Ana    R$  46,00 ]
   [ + Nova conta avulsa                ]

2. Toca na conta → cardápio em grade, categorias como chips
   [Bebidas] [Comidas] [Serviços]
   ┌────────┬────────┬────────┐
   │Cerveja │ Refri  │ Água   │   ← alvo grande, preço visível
   │ 12,00  │  8,00  │  5,00  │
   └────────┴────────┴────────┘

3. Toca no produto → quantidade 1 já preenchida → confirma
   Um toque = um item. Quantidade só se for diferente de 1.

4. Rodapé fixo com o total da conta, sempre visível.
```

Decisões de interface que vêm desse critério:

- **Sem tela de login diária.** JWT persistido; a sessão tem que atravessar o turno (ver §9, item 4).
- **Fila offline.** Wi-Fi de hotel cai perto da piscina. O lançamento entra numa fila local (IndexedDB) e sincroniza sozinho. O garçom **nunca** vê "erro de rede" — vê o item lançado com indicador de pendente.
- **Confirmação otimista.** O item aparece na hora; o servidor confirma depois. TanStack Query já dá isso.
- **Total sempre calculado no servidor.** A UI mostra a prévia, a verdade é do backend.
- **Desfazer, não confirmar.** Em vez de diálogo "tem certeza?" a cada item, lançar direto e oferecer desfazer por alguns segundos. Menos atrito, mesma segurança.
- **Alvos de no mínimo 48px** e ações principais na metade inferior da tela — uso com uma mão.

### 8.3 Telas do módulo

| Tela | Quem usa | Layout |
|---|---|---|
| Contas abertas | Garçom | Lista, mobile |
| Cardápio / lançamento | Garçom | Grade de produtos, mobile |
| Detalhe da conta | Garçom, recepção | Itens + total, mobile e desktop |
| Fechamento e pagamento | Recepção | Conta consolidada, desktop |
| Nova conta avulsa (day-use) | Recepção, garçom | Formulário curto |
| Cardápio (CRUD) | Admin | Tabela, desktop |

---

## 9. Gaps de backend que o frontend vai exigir

Verificados no código em `develop @ 227d905`.

| # | Gap | Evidência | Severidade |
|---|---|---|---|
| 1 | **CORS não existe** | Nenhuma ocorrência de `cors` no projeto; `bootstrap/app.js` só chama `initRelations()` | 🔴 **Bloqueante.** Primeira requisição do frontend falha |
| 2 | **`GET /reservations` sem filtro de data e sem paginação** | `ListReservationController.js:9` — `findAll` do tenant inteiro com 3 joins | 🔴 **Bloqueante para o rack.** Cresce sem limite |
| 3 | **Não existe role `WAITER`** | `UserModel.js:29-33` — só `ADMIN` e `RECEPTIONIST` (default) | 🔴 Sem isso o garçom entra como recepcionista e vê o sistema todo |
| 4 | **JWT de 8h sem refresh token** | `LoginController.js:51` — `expiresIn: '8h'` | 🟡 Sessão cai no meio do turno; garçom perde comanda em andamento |
| 5 | **Não existe super-admin** | Todo `User` tem `tenant_id` NOT NULL | 🟡 Bloqueia `app-admin` (pós-TCC) |
| 6 | **`DECIMAL` chega como string** | Padrão do driver `pg` | 🟡 Tratar em `packages/domain`, nunca `Number()` direto |
| 7 | **Sem upload de imagem** | — | 🟢 MinIO já existe; reaproveitar `uploadToMinIO.js` para fotos de quarto no site público |
| 8 | **Sem realtime** | — | 🟢 Polling do TanStack Query resolve a v1. Dois recepcionistas simultâneos são raros em pousada pequena |

Os itens 1, 2 e 3 devem virar uma branch `fix/backend-prep-frontend` **antes** da Fase 1.

---

## 10. Design system

| Item | Definição |
|---|---|
| Cores de status | Livre (cinza) · Reservado (azul) · Ocupado (verde) · Limpeza (âmbar) · Manutenção (vermelho). **Sempre com ícone ou label junto** — nunca só cor |
| Tipografia | Uma família (Inter). Números tabulares em valores e no rack |
| Densidade | Duas escalas: `compact` (rack, tabelas desktop) e `comfortable` (mobile) |
| Alvos de toque | Mínimo 48×48px no mobile |
| Breakpoints | `sm 640` · `md 768` · `lg 1024` · `xl 1280` |
| Feedback | Skeleton no carregamento, toast em ação concluída, desfazer em vez de confirmar |
| Vazio e erro | Todo estado vazio tem ação sugerida. Todo erro diz o que fazer, não só o que falhou |
| Acessibilidade | Contraste AA, navegação por teclado no rack e no check-in (recepcionista é usuário de teclado) |

---

## 11. Roadmap

**Fase 0 — Fundação** *(~1 semana)*
Correções de backend (CORS, filtro de datas, role `WAITER`) · monorepo · design system base · autenticação e rota protegida · cliente de API gerado do OpenAPI

**Fase 1 — Recepção** *(~3 semanas)*
Hoje · Rack (grid desktop + agenda mobile) · Reservas · Check-in/out · Hóspedes · Quartos e categorias

**Fase 2 — Consumo e comanda** *(~2 semanas)*
Depende do backend do módulo de consumo (§8.1 revisado)
Cardápio · Contas abertas · Lançamento mobile com fila offline · Fechamento e pagamento

**Fase 3 — Financeiro e analytics** *(~1,5 semana)*
Pagamentos · Contas em aberto · 7 telas de analytics · cartões do dia no mobile

**Fase 4 — Grupos (B2B)** *(~1 semana)*
Clientes corporativos · Orçamentos com PDF · Contratos, assinatura e parcelas

**→ Entrega do TCC ao fim da Fase 4**

**Pós-TCC:** `app-booking` (site público, SEO, PIX) · `app-admin` (backoffice de tenants, exige super-admin no backend) · housekeeping · realtime

---

## 12. Riscos

| Risco | Mitigação |
|---|---|
| Clone Windows desatualizado gerar trabalho duplicado | Sincronizar ou abandonar antes de executar o plano de consumo (§2) |
| Rack subestimado — é a tela mais complexa do projeto | Prototipar na Fase 1 com dados do seed antes de integrar |
| Módulo de consumo atrasar e travar a Fase 2 | Fases 3 e 4 não dependem dele; podem ser antecipadas |
| Time sem experiência em TypeScript | Começar sem `strict`, ativar por pacote. `packages/domain` primeiro |
| Escopo de 4 superfícies | Já cortado: TCC entrega só `app-pms` |

---

## 13. Referências

- [PMS UX explained: How good design transforms hotel operations — Cloudbeds](https://www.cloudbeds.com/articles/pms-user-experience/)
- [Hotel PMS UX: Improve Revenue & Staff Workflow — Hotelogix](https://blog.hotelogix.com/pms-user-experience/)
- [Cloudbeds PMS vs Mews — Hotel Tech Report](https://hoteltechreport.com/compare/cloudbeds-myfrontdesk-vs-mews)
- [Cloudbeds Dashboard — documentação oficial](https://myfrontdesk.cloudbeds.com/hc/en-us/articles/115000400634-Dashboard-Everything-you-need-to-know)
- [Top 12 Hotel Front Desk Software 2026 — Cloudbeds](https://www.cloudbeds.com/articles/front-desk-software/)
- [Hospedin — sistema para hotéis e pousadas](https://hospedin.com/)
- [Sistema hoteleiro: 9 PMS para hotéis e pousadas — Hotel Academy](https://www.hotelacademy.com.br/sistema-hoteleiro-lista-e-caracteristicas-de-9-sistemas-pms-para-hoteis-e-pousadas/)
- [Os 10 melhores sistemas de gestão hoteleira PMS 2026 — Amenitiz](https://amenitiz.com/en/blog/best-hotel-property-management-systems-in-2026)
- [Comanda Eletrônica Consumer — app de comanda mobile](https://consumer.com.br/comanda-mobile)
- [App do Garçom / comanda digital — Saipos](https://saipos.com/sistema/comanda-digital)

---

## Documentos relacionados

- `docs/historico_sessao/gabriel/analise_gaps_consumo_02ago2026.md` — análise de gaps (base desatualizada, ver §2)
- `docs/historico_sessao/gabriel/planejamento_modulo_consumo_02ago2026.md` — sprints do backend de consumo (revisar Sprints 2 e 3)
- `docs/PRODUCT_ROADMAP.md` — fases do produto
- `docs/CODING_STANDARDS.md` — padrões de código
