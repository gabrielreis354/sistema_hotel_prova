### 2026-08-26 — Gabriel (agente executor / Claude Code)

- **Branches:** `fix/public-booking-payment-leak` · `fix/paranoid-unique-constraints`
- **Base:** `develop` @ `a25c972`
- **Objetivo da sessão:** executar `DELEGACAO_DIVIDA_TECNICA.md` (SPEC-06) — PASSOS 0 a 5.
- **Encerramento:** antecipado pelo orquestrador, com o PASSO 2 já implementado mas **em auditoria interrompida**.

---

## Resumo executivo

| Passo | Escopo | Estado |
|---|---|---|
| **0** | Baseline verificado | ✅ Concluído — suíte **verde** |
| **1** | Vazamento no endpoint público | ✅ Concluído, auditado, ressalvas fechadas, **push feito** |
| **2** | `paranoid` + unique total | ✅ Implementado · ⚠️ **auditoria interrompida, sem push** |
| **3** | Portão de cobertura 60% | 🔲 Não iniciado — mas já se sabe que **passa folgado** |
| **4** | Schema de resposta no Swagger | 🔲 Não iniciado — **medição já reproduzida** |
| **5** | Docker Compose de contingência | 🔲 Não iniciado |

Dois achados desta sessão são maiores que o previsto na SPEC-06 e mudam o planejamento:
o PASSO 2 tinha **7 defeitos, não 1**, e apareceu um **🔴 de segurança pré-existente**
(webhook PIX forjável) que bloqueia a promoção para `main`.

---

## PASSO 0 — Baseline verificado ✅

A suíte não rodava desde 07/08 (19 dias). O resultado real, medido:

| Checagem | Resultado |
|---|---|
| `npm run qa:checks` | **exit 0** — 0 erros, 2 avisos |
| `npm test` | **16/16 arquivos**, 220 passam, 1 skip, **0 falhas** |
| Statements | **74,05%** (1384/1869) |
| Branches | **70,96%** (594/837) |
| Functions | **84,02%** (142/169) |
| Lines | **76,4%** (1279/1674) |

**Conclusão:** `develop` está verde. Nenhuma condição de parada foi acionada, e `branches`
está **10,96 pontos acima** do portão exigido pelo Termo — o PASSO 3 vira confirmação, não trabalho.

### ⚠️ Armadilha encontrada — não estava na delegação

A primeira execução da suíte falhou com **15 de 16 arquivos vermelhos**:

```
Error: Cannot find package '@aws-sdk/s3-request-presigner'
  imported from app/utils/uploadToMinIO.js
```

**Não era código quebrado.** O pacote está no `package.json` mas faltava no `node_modules`
local — provavelmente de um `npm install` parcial em sessão anterior. `npm ci` resolveu e
tudo ficou verde. Nenhum código-fonte foi tocado para isso.

> **Para a próxima sessão:** rode `npm ci` antes de concluir que a suíte quebrou. O sintoma
> (15/16 vermelhos, todos com `ERR_MODULE_NOT_FOUND`) parece catástrofe e é ambiente.

---

## PASSO 1 — Vazamento de pagamento em endpoint público ✅

**Branch:** `fix/public-booking-payment-leak` — **enviada para `origin`**

### O que era, de verdade

`GetBookingStatusController.js:21` fazia `include: [{ model: PaymentModel, as: 'payments' }]`
sem `attributes`, num endpoint **sem autenticação**.

Ao investigar, o vazamento **não chegava ao HTTP**: o controller já montava a resposta campo
a campo. O defeito real era carregar `pix_qr_code`, `provider` e `provider_charge_id` para a
memória do handler — um `return reservation.payments` futuro viraria vazamento imediato.
Isso foi declarado no commit em vez de vendido como correção de vazamento ativo.

### A ressalva que importa (achada pelo `qa-redteam`)

O primeiro commit quebrou o `include` em 5 linhas. **A regra 6 do `qa_checks.sh` é um `grep`
de uma linha só** — o arquivo saiu do alcance do detector, e o aviso sumiu do relatório por
**formatação, não por correção**. Remover o `attributes` não reprovaria mais nada.

Corrigido: o `include` voltou para **uma linha** (agora casa o regex e só passa por conter
`attributes`), com comentário no código explicando por que não quebrar a linha. Verificado
nos dois sentidos.

### Também corrigido na mesma branch

| Arquivo | Problema |
|---|---|
| `ReservationApi/GetBillController.js:21` | Mesmo `include` cru de `PaymentModel` — era o outro dos **dois únicos** consumidores de `as: 'payments'` no repo |
| `utils/resolveTenantBySubdomain.js:17` | Carregava o tenant inteiro, incluindo `legal_id` (CNPJ), nos 4 endpoints públicos |

### Auditoria

`docs/qa/redteam_public-booking-leak_26ago2026.md` — **APROVADO COM RESSALVAS**, todas as
3 ressalvas 🟡 fechadas no commit `3c2023f`.

### Commits

| Hash | Mensagem |
|---|---|
| `653b675` | `fix(public-booking): limita attributes do Payment no status publico` |
| `3c2023f` | `fix(lgpd): fecha ressalvas da auditoria do vazamento de pagamento` |

---

## PASSO 2 — `paranoid` + unique total ✅ (implementado, auditoria interrompida)

**Branch:** `fix/paranoid-unique-constraints` — **NÃO enviada**

### O defeito é 7×, não 1×

A SPEC-06 (T-06.3) listava apenas `room_categories`. A auditoria de **todos** os models com
`paranoid: true` e índice `unique` encontrou:

| Model | Índice | Antes |
|---|---|---|
| `ProductModel` | `(tenant_id, name)` | ✅ já corrigido — referência |
| `UserModel` | `(email, tenant_id)` | ❌ total |
| `RoomCategoryModel` | `(tenant_id, name)` | ❌ total |
| `RoomModel` | `(tenant_id, number)` | ❌ total |
| `GuestModel` | `(cpf, tenant_id)` e `(email, tenant_id)` | ❌ ❌ |
| `CorporateClientModel` | `(cnpj, tenant_id)` e `(cpf, tenant_id)` | ❌ ❌ |

**Impacto operacional concreto:** um hóspede antigo removido **não conseguiria se recadastrar
com o próprio CPF**; um funcionário readmitido perderia o e-mail. E não há endpoint de restore.

### Complicação no `db/schema.sql`

As unicidades lá eram `UNIQUE (...)` **de tabela**, que no PostgreSQL **não aceitam predicado**.
Não bastava acrescentar um `WHERE` — tiveram que virar `CREATE UNIQUE INDEX ... WHERE
deleted_at IS NULL`. Remover as `UNIQUE` de dentro do `CREATE TABLE` deixou **duas vírgulas
pendentes** (`guests` e `corporate_clients`), que quebrariam o SQL — pegas ao aplicar o schema
num banco descartável (`qa_schema_probe`, já dropado), não por leitura.

### O entregável mais valioso — regra 8 do `qa_checks.sh`

O padrão já apareceu **quatro vezes** no projeto. Corrigir a ocorrência não resolve. A regra
nova é **ERRO bloqueante**: em model `paranoid`, cada `unique: true` precisa de um
`deleted_at: null`. Pega também `unique` em **coluna**, que gera constraint total.

Testada nos dois sentidos, não só na base atual:

| Cenário | Resultado |
|---|---|
| Base limpa | exit **0** — sem falso positivo |
| Defeito reintroduzido em `RoomModel` | exit **1** — aponta o arquivo |

### Testes

- `tests/paranoid-unique-recreate.test.js` (novo) — ciclo criar → deletar → **recriar com o
  mesmo valor** nos 5 models, mais 5 casos de duplicata entre registros **vivos**, que precisam
  continuar 409. Sem esse segundo bloco, trocar *"queima o nome"* por *"aceita duplicata"*
  passaria despercebido.
- `tests/db-constraints.test.js` — predicado verificado no **banco** (`pg_indexes`) nos 7
  índices, mais varredura que reprova qualquer índice único sem predicado em tabela com
  `deleted_at`. É a contraparte no banco da regra 8, que olha o código.

**Validação anti-teste-vazio:** com os models revertidos para `develop`, **13 dos 24 testes
falham**. Não são guardas vazias. (Essa verificação virou hábito depois da ressalva do PASSO 1.)

### Refatoração DRY

10 controllers precisavam do mesmo `catch`. Em vez de repeti-lo, o mapeamento ficou em
`app/utils/uniqueConstraintConflict.js`. A mensagem vem do **nome do índice**, não do
controller — um `INSERT` em `guests` pode violar o índice de CPF ou o de e-mail, e só o
Postgres sabe qual foi. Segue a convenção que o repo já usa para allowlists (`roles.js`,
`productCategories.js`). Os dois controllers de `Product` passaram a usar o utilitário, com
mensagem idêntica à anterior.

`RegisterController` ficou de fora **de propósito**: a mensagem `"E-mail ou subdomain já em
uso"` é deliberadamente vaga porque duas causas distintas levam ao mesmo 409, e o cadastro
público não deve revelar qual foi.

### Portões

`npm run qa:checks` exit **0** · suíte **17 arquivos / 238 testes / 1 skip**, exit **0**.

### Commits

| Hash | Mensagem |
|---|---|
| `8537054` | `fix(db): indice unico parcial em todos os models paranoid` |
| `e5d8d4f` | `fix(api): violacao de indice unico responde 409, nao 500` |
| `c3adbf0` | `test(qa): regra de build contra unique total em model paranoid` |

---

## PASSOS 3, 4 e 5 — não iniciados (research aproveitável)

### PASSO 3 — portão de cobertura

**Já se sabe o resultado.** `branches` real é **70,96%** contra portão pedido de 60%. A
mudança é trocar `branches: 55` por `branches: 60` no `vitest.config.js` e rodar. Não será
preciso escrever teste nenhum — o cenário de "parar e reportar" previsto na delegação **não
se aplica**.

> Detalhe para atualizar junto: o comentário no `vitest.config.js` diz *"~77% stmts / ~80%
> lines"*. Os números reais de 26/08 são **74,05% / 76,4%**. O comentário está otimista.

### PASSO 4 — Swagger

Medição reproduzida com script próprio: **42 de 53 respostas 2xx (79%)** sem `content` —
exatamente o número da delegação. Já existem **8 schemas** reutilizáveis em
`components.schemas`: `Tenant`, `User`, `Product`, `RoomCategory`, `Room`, `Guest`,
`Reservation`, `Error`.

O `config/swagger.js` é **um objeto JS único** (733 linhas), não anotações jsdoc espalhadas —
o trabalho é concentrado num arquivo só.

**Achado colateral — falso positivo na regra 7 do `qa_checks.sh`:** dos 5 "routers sem Swagger"
reportados, **2 são falso positivo**. A regra deriva o kebab no singular (`room-category`,
`public-booking`) mas as rotas são `/room-categories` e `/public/{subdomain}/...`.
Genuinamente fora do Swagger estão só `contract`, `corporate-client` e `event-quote` (módulo
B2B). A regra merece ajuste junto com o PASSO 4.

### PASSO 5 — Docker Compose

Nenhum trabalho iniciado. Confirmado que **não existe** `docker-compose*.yml` no repositório.

---

## Pendências

| # | Pendência | Prioridade | Observação |
|---|---|---|---|
| 1 | **Webhook PIX é forjável — confirma reserva sem pagamento** | 🔴 **Alta** | Ver seção abaixo. **Bloqueia a promoção `develop → main` (T-06.8).** Código pré-existente, fora do diff desta sessão |
| 2 | Auditoria `qa-redteam` do PASSO 2 não concluída | 🔴 Alta | Interrompida pelo orquestrador. A branch **não deve ser mergeada** sem ela. Prompt pronto na seção "Como retomar" |
| 3 | `fix/paranoid-unique-constraints` sem push | 🟡 Média | 3 commits locais. Push depende da decisão sobre a pendência 2 |
| 4 | PASSO 3 — portão de cobertura | 🟢 Baixa | Trabalho de 1 linha; resultado já conhecido (70,96% > 60%) |
| 5 | PASSO 4 — schema de resposta no Swagger | 🟡 Média | Maior bloco restante, mas mecânico. Medição e schemas já mapeados |
| 6 | PASSO 5 — `docker-compose.yml` de contingência | 🟡 Média | Exigido pelo Termo de Aceite. *"Escrito mas não testado" não conta* |
| 7 | Regra 7 do `qa_checks.sh` dá 2 falsos positivos | 🟢 Baixa | Singular vs. plural na derivação do kebab |
| 8 | Comentário de cobertura desatualizado no `vitest.config.js` | 🟢 Baixa | Diz ~77%/~80%; real é 74,05%/76,4% |
| 9 | `applyDbConstraints.js` não recria índice sem predicado (R4 / T-06.6) | 🟢 Baixa | Fora do escopo da delegação. Risco baixo hoje, mas agora afeta **7 índices**, não 1 — reavaliar |

### Pendência 1, em detalhe — 🔴 webhook PIX forjável

Achado pelo `qa-redteam` durante a auditoria do PASSO 1. É **pré-existente**, fora do diff, e
por isso não reprovou aquela branch — mas é o achado mais grave da sessão.

**Arquivos:** `app/Controllers/WebhookApi/PixWebhookController.js:18-34` ·
`app/Controllers/PublicBookingApi/CreateBookingController.js:158-162`

**Cadeia de exploração, sem autenticação nenhuma:**

1. `POST /public/aurora/bookings` → a resposta devolve `pix.provider_charge_id`
2. `POST /webhooks/pix` com esse `provider_charge_id`
3. → `reservation_status: CONFIRMED`, pagamento `PAID`, quarto bloqueado, **zero dinheiro**

Nenhuma assinatura é validada em nenhum ponto.

Isso **reforça** a correção do PASSO 1: o QR que saiu do endpoint público é `base64` de uma
string contendo `txid=${providerChargeId}` (`FakePixProvider.js:20-28`) — vazar o QR era
vazar a credencial de forja.

**Decisão é do orquestrador.** Não corrigi por conta própria: está fora do escopo da
delegação e é decisão de arquitetura (validação de assinatura de provedor), não dívida técnica.

---

## Como retomar

```bash
# Ambiente (o PATH deste WSL resolve node v18 e o npm do Windows sem isto)
minikube start
./start.sh up
kubectl port-forward -n hotel-system svc/postgres 5432:5432 &
export NVM_DIR="$HOME/.nvm" && . "$NVM_DIR/nvm.sh" && nvm use 24
npm ci                      # <- ver a armadilha do PASSO 0
```

**Primeira coisa a fazer:** concluir a auditoria do PASSO 2.

```
Agent com subagent_type "qa-redteam":

"Audite a branch fix/paranoid-unique-constraints comparando com develop (3 commits:
8537054, e5d8d4f, c3adbf0). Feature: correção sistêmica do padrão 'model paranoid +
índice único total' — 7 índices em 5 models, mais regra 8 no qa_checks.sh que reprova
o build. Critérios de aceite: [colar os do PASSO 2 da delegação].
Verifique especialmente: (a) a heurística de contagem da regra 8 é burlável?
(b) o índice parcial afrouxou a unicidade entre registros vivos? (c) error.parent.constraint
traz mesmo o nome do índice, e o fallback errors[0].path é código morto?
(d) os 3 controllers com CRLF editados por script ficaram íntegros?
(e) migrate e schema.sql produzem o mesmo resultado?
Grave em docs/qa/redteam_paranoid-unique_26ago2026.md."
```

Depois: PASSO 3 (1 linha) → PASSO 4 (maior bloco) → PASSO 5.

### Estado do ambiente ao encerrar

- Working tree **limpo**; branch ativa `fix/paranoid-unique-constraints`
- `minikube` e a stack `hotel-system` ficaram **no ar**, com port-forward do Postgres em `:5432`
- Sem custo de nuvem envolvido — tudo local. Para liberar recursos da máquina: `minikube stop`
- Bancos descartáveis **dropados**: `qa_schema_probe` (meu) e `qa_rt_probe` / `qa_rt_probe2`,
  que a auditoria interrompida do PASSO 2 deixou para trás. Restam apenas `gestao_hotel` e
  `gestao_hotel_test`

---

## Notas de método

Duas lições desta sessão, registradas porque valem para as próximas:

1. **Teste que passa antes e depois da correção não é prova de nada.** O teste do PASSO 1
   passava sem a correção — declarei isso no commit em vez de contar como critério cumprido.
   No PASSO 2 a verificação virou rotina: reverter a correção e confirmar que os testes ficam
   vermelhos (13 de 24 ficaram).

2. **Critério cumprido por formatação não é critério cumprido.** O aviso do `qa_checks.sh`
   sumiu no PASSO 1 porque o `include` multilinha escapou de um `grep` de linha única — não
   porque o código melhorou. Quem achou isso foi o `qa-redteam`, não eu. O portão de QA
   adversarial pagou o próprio custo já na primeira etapa.
