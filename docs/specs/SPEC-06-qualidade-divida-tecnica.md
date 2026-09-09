# SPEC-06 — Qualidade e Dívida Técnica

**Prioridade:** 🟡 Média — mas contém item que **quebra o portão do CI**
**Estado:** 🔲 Não iniciado
**Criado em:** 26/08/2026
**Depende de:** nada — **pode começar imediatamente**

---

## 1. Contexto

Reúne dívida técnica acumulada e itens de conformidade que não pertencem a nenhuma frente de produto. Vários vêm de auditorias `qa-redteam` de sessões anteriores, com achado confirmado e correção pendente.

---

## 2. Tarefas

### T-06.1 — Cobertura de testes conforme o Termo 🔲

**Problema:** o Termo exige cobertura mínima de **60%**. O `vitest.config.js` define:

```js
thresholds: { statements: 60, lines: 60, functions: 60, branches: 55 }
```

**`branches` está em 55% — abaixo do exigido.**

**Critérios de aceitação**
- [ ] **CA-06.1.a** — `branches` elevado para 60 no `vitest.config.js`
- [ ] **CA-06.1.b** — Suíte completa executada e **cobertura real confirmada** acima do portão
- [ ] **CA-06.1.c** — Se ficar abaixo, escrever testes até passar — **não baixar o portão**
- [ ] **CA-06.1.d** — CI verde com o portão novo

> **Nota honesta:** a cobertura real não é verificada desde 07/08. Um comentário no próprio arquivo registra ~77% *statements* / ~80% *lines*, mas isso precisa ser reconfirmado — e `branches` é justamente a métrica mais provável de ficar apertada.

> **Impacto de microsserviços:** o Termo pede cobertura *"global, considerando todos os microsserviços"*. Após SPEC-01, a métrica precisa ser **agregada entre serviços**, não medida só no monólito.

---

### T-06.2 — Schema de resposta no Swagger 🔲

**Problema medido em 26/08:** de 53 respostas 2xx (excluindo 204), **42 não declaram `content`** — **79% sem schema**.

Consequência direta: o cliente TypeScript gerado do OpenAPI devolve `never` no corpo, forçando `as unknown as Guest` no frontend. **A promessa de tipagem ponta a ponta só vale para 21% da API.**

Endpoints sem schema incluem o núcleo: `/auth/login`, `/guests`, `/reservations`, `/rooms`, `/users`.

**Critérios de aceitação**
- [ ] **CA-06.2.a** — Todas as respostas 2xx dos endpoints usados pelo frontend declaram `content` com `$ref` de schema
- [ ] **CA-06.2.b** — Schemas reutilizáveis em `components.schemas`, sem duplicação literal
- [ ] **CA-06.2.c** — Cliente regenerado (`pnpm gen:api`) sem `never` nos módulos cobertos
- [ ] **CA-06.2.d** — Casts `as unknown as` removidos de `guestsApi.ts`
- [ ] **CA-06.2.e** — Typecheck do frontend limpo após a remoção

> **Maior retorno por esforço de toda esta Spec.** É trabalho mecânico no backend que elimina uma classe inteira de bug no frontend e valida a decisão de stack que sustentou a escolha do cliente tipado.

---

### T-06.3 — `RoomCategoryModel` com `paranoid` + unique total 🔲

**Problema:** mesmo defeito corrigido em `ProductModel`. Verificado em 26/08: `RoomCategoryModel` tem unique `(tenant_id, name)` **sem** filtro parcial, num model `paranoid: true`.

**Efeito:** excluir uma categoria **queima o nome para sempre**. A linha morta continua no índice, o guard da aplicação não a enxerga (escopo paranoid) e quem barra é o Postgres — virando **500**.

**Critérios de aceitação**
- [ ] **CA-06.3.a** — Índice parcial `WHERE deleted_at IS NULL` no model e no `db/schema.sql`
- [ ] **CA-06.3.b** — `UniqueConstraintError` mapeado para **409**, não 500
- [ ] **CA-06.3.c** — Teste do ciclo criar → deletar → recriar com o mesmo nome
- [ ] **CA-06.3.d** — Auditar os demais models `paranoid` com unique, aplicando o mesmo padrão

---

### T-06.4 — `docker-compose.yml` para contingência da defesa 🔲

**Problema:** o Termo prevê:

> *"Em caso de falha de conectividade [...] a equipe poderá demonstrar a aplicação localmente utilizando **Docker / Docker Compose**, sem penalidade. Para isso, o grupo deve manter os arquivos de containerização **atualizados e funcionais** no repositório."*

Verificado: **não existe nenhum `docker-compose*.yml`** no repositório. O projeto migrou totalmente para Kubernetes.

**Critérios de aceitação**
- [ ] **CA-06.4.a** — `docker-compose.yml` subindo backend, Postgres, Redis e MinIO
- [ ] **CA-06.4.b** — `docker compose up` funciona a partir de repositório limpo
- [ ] **CA-06.4.c** — `migrate` e `seed` executáveis no compose
- [ ] **CA-06.4.d** — Frontend incluído ou com instrução clara de como subir
- [ ] **CA-06.4.e** — Testado de verdade, não só escrito
- [ ] **CA-06.4.f** — README documentando o procedimento de contingência

> **Não é opcional.** É a rede de segurança da defesa. Se a internet cair e o compose não funcionar, não há demonstração — e o Termo já concedeu o direito a essa contingência.

---

### T-06.5 — Endpoint público vazando dados de pagamento 🔲

**Problema:** `GetBookingStatusController.js:21` faz `include: [{ model: PaymentModel, as: 'payments' }]` **sem `attributes`**, num endpoint **público, sem autenticação**.

Devolve o `Payment` inteiro — incluindo `pix_qr_code`, `provider_charge_id` e `provider`.

**Critérios de aceitação**
- [ ] **CA-06.5.a** — `attributes` explícito, expondo apenas o necessário ao status
- [ ] **CA-06.5.b** — `pix_qr_code` e `provider_charge_id` não retornados sem autenticação
- [ ] **CA-06.5.c** — Teste garantindo que campos sensíveis não aparecem
- [ ] **CA-06.5.d** — `npm run qa:checks` sem o aviso correspondente

> **Risco de LGPD e segurança.** Foi identificado pelo `qa_checks.sh` e continua em aberto.

---

### T-06.6 — Ressalva R4: índice parcial não aplicado em banco existente 🔲

**Problema:** um banco que **já tem** a tabela `products` não recebe o índice parcial, e tanto `migrate` quanto `schema.sql` reportam sucesso — `sync({alter})` não substitui índice de mesmo nome e o `IF NOT EXISTS` do SQL é *no-op*.

**Risco hoje é baixo** — a tabela não existe no cluster. Mas é silencioso, e o projeto não tem mecanismo de migração de índice.

**Critérios de aceitação**
- [ ] **CA-06.6.a** — `applyDbConstraints.js` detecta índice sem o predicado e o recria
- [ ] **CA-06.6.b** — Teste validando o predicado após migrar um banco com índice antigo
- [ ] **CA-06.6.c** — Padrão aplicável aos demais índices parciais

---

### T-06.7 — JWT sem refresh token 🔲

**Problema:** `LoginController.js:51` usa `expiresIn: '8h'`, sem refresh. A sessão cai no meio do turno — e o garçom perde comanda em andamento.

**Critérios de aceitação**
- [ ] **CA-06.7.a** — Estratégia decidida: refresh token, sessão deslizante, ou expiração maior com justificativa
- [ ] **CA-06.7.b** — Frontend renova sem derrubar o usuário
- [ ] **CA-06.7.c** — Decisão registrada em ADR

> Menos urgente que os demais, mas afeta diretamente a usabilidade da comanda — e é o tipo de detalhe que a banca percebe numa demonstração longa.

---

### T-06.8 — Promover `develop` para `main` 🔲

**Problema:** `origin/main` está em `0c463fd` (PR #70). `origin/develop` tem **62 commits não promovidos**, incluindo o frontend inteiro, o catálogo de produtos e a correção do bug da EXCLUDE.

Quem abrir a `main` do repositório vê o estado de julho.

**Critérios de aceitação**
- [ ] **CA-06.8.a** — Suíte completa verde em `develop` antes do PR
- [ ] **CA-06.8.b** — PR `develop → main` aberto, com descrição da release
- [ ] **CA-06.8.c** — CI verde no PR
- [ ] **CA-06.8.d** — Merge realizado

> Convenção do projeto: *"1 PR de `develop → main` por release"*. Estávamos acumulando corretamente — a release é que nunca foi fechada.

---

### T-06.9 — Webhook PIX sem validação de assinatura 🔴 🔲

**Problema:** `routes/apis/webhookRouter.js` monta `POST /webhooks/pix` **sem autenticação** — correto, o PSP não tem JWT — mas o controller não verifica assinatura alguma. O próprio comentário do router admite a lacuna: *"em produção, cada webhook deve validar a assinatura do provedor antes de confiar"*.

**Cenário de falha:** qualquer pessoa que descubra a URL e um `provider_charge_id` marca um pagamento como `PAID` e promove a reserva de `PENDING` para `CONFIRMED` — sem ter pago. É perda de receita direta, com o quarto bloqueado por uma reserva confirmada e não paga.

**Por que é uma tarefa própria:** o RNF-012 do Doc. 02 exige assinatura verificada em **100%** dos webhooks. A SPEC-03 T-03.2 só a menciona como "avaliar" ao integrar o PSP real — o que deixa a vulnerabilidade **atual** sem dono. Esta tarefa fecha o requisito independentemente da integração externa.

**Critérios de aceitação**
- [ ] **CA-06.9.a** — Assinatura HMAC-SHA256 verificada com `crypto.timingSafeEqual` antes de qualquer efeito colateral
- [ ] **CA-06.9.b** — Segredo lido de variável de ambiente, nunca versionado (`.env.example` atualizado)
- [ ] **CA-06.9.c** — Requisição sem assinatura ou com assinatura inválida responde `401` e **não altera estado**
- [ ] **CA-06.9.d** — `FakePixProvider` assina a notificação, para que o fluxo de teste exercite o caminho real
- [ ] **CA-06.9.e** — Teste cobrindo: assinatura válida promove; inválida recusa; ausente recusa; idempotência preservada (RF-027)
- [ ] **CA-06.9.f** — `provider_charge_id` continua fora de resposta pública (ver T-06.5)

> Rastreia **RNF-012**. Achado de auditoria `qa-redteam` ainda em aberto — a maior severidade desta Spec.

---

### T-06.10 — Paginação nas listagens 🔲

**Problema:** o RNF-002 do Doc. 02 exige `?page=` e `?limit=` em **100%** das rotas de listagem. Hoje só `ListReservationController.js` pagina (`limit`/`offset`); as demais devolvem `findAll` completo.

**Consequência:** o tempo de resposta cresce com o volume do tenant, contra o RNF-001 (P95 < 500 ms). E a SPEC-05 T-05.2 já assume paginação disponível — a suposição vale hoje apenas para reservas.

**Critérios de aceitação**
- [ ] **CA-06.10.a** — Utilitário único de paginação em `app/utils/`, reaproveitado pelos controllers (DRY)
- [ ] **CA-06.10.b** — Todas as rotas de listagem aceitam `?page=` e `?limit=`, com teto por página e valor padrão
- [ ] **CA-06.10.c** — Contrato de resposta uniforme, expondo o total para o cliente montar a navegação
- [ ] **CA-06.10.d** — Retrocompatível: ausência dos parâmetros não quebra consumidor existente
- [ ] **CA-06.10.e** — `limit` inválido, negativo ou acima do teto responde `400`, não ignora silenciosamente
- [ ] **CA-06.10.f** — Swagger atualizado com os parâmetros e o novo formato (converge com T-06.2)
- [ ] **CA-06.10.g** — Teste de paginação em pelo menos duas listagens de volume relevante

> Rastreia **RNF-002**. Fazer junto ou imediatamente após a T-06.2 — as duas mexem no contrato das mesmas rotas, e separá-las significa documentar o Swagger duas vezes.

---

## 3. Ordem sugerida

```
 1. T-06.9  assinatura do webhook   — 🔴 perda de receita, vulnerabilidade atual
 2. T-06.5  vazamento no endpoint   — segurança, correção pequena
 3. T-06.8  promover para main      — dá visibilidade imediata ao trabalho
 4. T-06.1  cobertura               — pode reprovar o CI do PR acima
 5. T-06.2  schema no Swagger       — maior retorno por esforço
 6. T-06.10 paginação               — mesmo contrato da T-06.2, fazer junto
 7. T-06.4  docker-compose          — rede de segurança da defesa
 8. T-06.3  RoomCategoryModel       — bug confirmado, correção conhecida
 9. T-06.6  R4                      — risco baixo hoje
10. T-06.7  refresh token           — decisão antes de implementação
```

> T-06.1 antes de T-06.8 se houver dúvida sobre a cobertura — subir o portão e descobrir que reprova **durante** o PR é pior que descobrir antes.
>
> T-06.9 subiu ao topo por ser a única vulnerabilidade **explorável hoje**: não depende de integração externa nem de dado de produção. Promover `main` antes dela publicaria o furo na branch de release.

---

## 4. Definition of Done

- [ ] Portão de cobertura conforme o Termo, com cobertura real confirmada
- [ ] Cliente tipado do frontend sem `as unknown as`
- [ ] Nenhum endpoint público expondo dado sensível
- [ ] Nenhum webhook aceitando notificação sem assinatura verificada (RNF-012)
- [ ] Todas as rotas de listagem paginadas (RNF-002)
- [ ] `docker compose up` funcionando e testado
- [ ] `main` refletindo o estado atual do projeto
- [ ] `npm run qa:checks` sem erro nem aviso pendente

---

## 5. Histórico

| Versão | Data | Autor | Alteração |
|--------|------|-------|-----------|
| 1.0 | 26/08/2026 | Gabriel Reis Cunha | Criação. Consolida achados de auditorias `qa-redteam` e itens de conformidade do Termo |
| 1.1 | 09/09/2026 | Gabriel Reis Cunha | Acrescenta **T-06.9** (assinatura do webhook PIX, RNF-012) e **T-06.10** (paginação nas listagens, RNF-002), apuradas no cruzamento do Doc. 02 v1.2 com as Specs: os dois requisitos exigiam 100% de cobertura e não tinham tarefa em nenhuma Spec. A T-06.9 vai ao topo da ordem por ser a única vulnerabilidade explorável hoje, sem dependência de integração externa |
