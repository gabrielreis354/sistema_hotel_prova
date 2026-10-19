# Delegação — Pendências liberadas da trilha do Gabriel

**Para:** agente executor · **De:** Gabriel Reis Cunha (orquestrador) · **Data:** 16/09/2026
**Worktree:** `/home/gabri/sistema_gestao_hotel` — hoje na branch `fix/paranoid-unique-constraints`, limpa
**Base:** `origin/develop` @ `ee953f5` ou posterior

---

## 1. Prompt de abertura — cole isto na sessão do agente

```
Você é o agente executor do Gesway, na trilha do Gabriel.

Antes de qualquer coisa:
  cd /home/gabri/sistema_gestao_hotel
  git fetch origin
  git show origin/develop:docs/delegacoes/pendencias_liberadas_gabriel_16set2026.md

Leia a delegação inteira e siga as etapas NA ORDEM. Cada etapa termina com
commit, push, relatório e a condição de parada indicada. Não avance para a
próxima etapa se a atual falhou — pare e reporte com a saída real.

Leia também, nesta ordem: CLAUDE.md, docs/CODING_STANDARDS.md,
docs/specs/SPEC-06-qualidade-divida-tecnica.md e docs/specs/SPEC-01-microsservicos.md.
```

---

## 2. Contexto

**Produto.** O Gesway é um PMS SaaS multi-tenant para hotéis pequenos, entregue também como projeto acadêmico (UniFAAT). Os critérios de aceite exigem microsserviços implementados, e o monólito está sendo dividido (SPEC-01, ADR-003).

**O que mudou desde a sua última sessão — leia com atenção:**

- **O repositório mudou de layout** (PR #77). O backend saiu da raiz:

  | Antes | Agora |
  |---|---|
  | `app/`, `routes/`, `middlewares/`, `database/`, `config/`, `bootstrap/` | `services/core-service/…` |
  | `db/`, `seed/`, `tests/`, `command.js`, `_web.js`, `package.json` | `services/core-service/…` |
  | `k8s/` | `infra/k8s/` |
  | `docker/`, `modelagem/`, `queries/` | `docs/legado/` |

- **Setup:** `npm ci` e os testes rodam **dentro de** `services/core-service/`. Os arquivos `.env` e `.env.test` ficam nessa pasta. `scripts/qa_checks.sh` funciona da raiz ou por `npm run qa:checks`.
- **Recorte decidido** (ADR-003): `core-service` fica com a operação do hotel, incluindo pagamentos e PIX; `analytics-service` terá banco próprio, alimentado por eventos via RabbitMQ; `b2b-service` sai no 5º semestre.
- **A divisão de trabalho define donos por área** (`docs/DIVISAO_TRABALHO_TIME_09set2026.md`). O que você alterar na área de outra pessoa **não é aprovado por você nem pelo Gabriel** — vai para revisão do dono:

  | Área | Dono |
  |---|---|
  | `infra/`, `.github/workflows/` | **Weslley** |
  | `services/core-service/db/schema.sql`, `app/Models/` | **Sirlande** |
  | Documento 07 (ADR), documentos 05 a 08 | **Weslley** |
  | Documentos 03 e 04 | **Sirlande** |

---

## 3. Stack e restrições

| Regra | Detalhe |
|---|---|
| Node 24, Express 4, Sequelize 6, PostgreSQL 17 | Em shell não interativo, carregue o nvm: `export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"; nvm use 24` |
| **ESM puro** | Nunca `require()` |
| **`tenant_id` sempre do JWT** | Nunca de body, query ou params |
| `DECIMAL` chega do `pg` como **string** | Nunca `Number()` em valor monetário |
| **Uma branch por etapa**, a partir de `origin/develop` | `git fetch origin && git checkout -b <nome> origin/develop` |
| **`git add` arquivo por arquivo** | Nunca `git add .` nem `git add -A` |
| Conventional Commits, com corpo | Terminar com `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>` |
| **Suíte de testes: uma de cada vez** | O banco de teste é compartilhado e o `truncateAll` de uma suíte apaga os dados da outra. Antes de rodar, confira: `pgrep -af vitest` |
| **`npm ci \| tail` mascara falha** | Rode sem pipe, ou use `set -o pipefail` |
| **Nunca** mexer na `main`, nem `push --force` | PRs sempre para `develop` |
| **Nunca** commitar `.env`, chave privada ou segredo real | |
| **Nunca** editar documentos oficiais da UniFAAT | Sugestões vão para `docs/sugestoes-documentos-oficiais/` |

### Portão de QA — obrigatório em toda etapa com código

1. `bash scripts/qa_checks.sh` — 0 erros
2. Suíte completa em `services/core-service` — `npm run test:coverage` verde, com cobertura ≥ 60%
3. Subagente **`qa-redteam`** sobre o diff da branch, com relatório em `docs/qa/`
4. CI verde no PR

O `qa-redteam` julga **só o diff da branch**. Achado em área de outra pessoa é repassado ao dono, em `docs/qa/repasses/`, e não reprova a branch.

**Merge em `develop`:** permitido apenas quando os quatro passos passarem **e** o veredito for APROVADO, ou APROVADO COM RESSALVAS sem nenhum 🔴 no escopo. Caso contrário, pare e reporte.

---

## 4. As etapas

| # | Etapa | Tipo | Termina em |
|---|---|---|---|
| **1** | T-06.5 — integrar a correção do vazamento público | segurança | merge em `develop` |
| **2** | T-06.9 — assinatura do webhook PIX 🔴 | segurança | merge em `develop` + relatório ao Gabriel |
| **3** | Branch `fix/paranoid-unique-constraints` — preparar para revisão | verificação | **PR aberto, sem merge** |
| **4** | T-06.2 — schema de resposta no Swagger | qualidade | merge em `develop` |
| **5** | T-01.3 — autenticação entre serviços (RS256) | arquitetura | **proposta → PARAR** → implementação após aprovação |
| **6** | T-01.2 — catálogo de eventos e política de falhas | arquitetura | documento para aprovação do Gabriel |
| **7** | Documento 02 — conferência contra os critérios de aceite | análise | relatório, sem editar o documento oficial |

As etapas 1 e 2 vêm primeiro porque são as duas falhas de segurança abertas — e ambas já estão na `main`.

---

### ETAPA 1 — T-06.5: integrar a correção do vazamento público

**Problema.** `GET /public/:subdomain/bookings/:id/status` é público e devolve o `Payment` inteiro, incluindo `pix_qr_code`, `provider_charge_id` e `provider`. Com o `provider_charge_id`, qualquer pessoa pode acionar o webhook PIX — o que torna esta falha e a da etapa 2 uma combinação perigosa.

**O que já existe.** A correção está pronta na branch `fix/public-booking-payment-leak` (2 commits, de 26/08), 54 commits atrás da `develop` e ainda no layout antigo. A auditoria original está em `docs/qa/redteam_public-booking-leak_26ago2026.md`.

**Tarefa**
1. `git checkout fix/public-booking-payment-leak && git merge origin/develop` — os renomes do layout são detectados; a simulação feita em 15/09 não apontou conflito
2. Confirmar que a correção continua aplicada em `services/core-service/app/Controllers/PublicBookingApi/GetBookingStatusController.js`
3. Portão de QA completo
4. PR para `develop` e merge

**Critérios de aceite** — CA-06.5.a a CA-06.5.d da SPEC-06
- `attributes` explícito, expondo só o necessário ao status
- `pix_qr_code` e `provider_charge_id` **não** retornam sem autenticação
- Teste garantindo que os campos sensíveis não aparecem
- `qa_checks.sh` sem o aviso *"include de model com dado sensível, sem attributes"*

**Não pode mudar:** o fluxo de reserva direta e o formato de resposta dos demais campos.

---

### ETAPA 2 — T-06.9: assinatura do webhook PIX 🔴

**Branch:** `fix/pix-webhook-signature`

**Problema.** `POST /webhooks/pix` aceita qualquer requisição. Quem souber a URL e um `provider_charge_id` marca o pagamento como `PAID` e promove a reserva de `PENDING` para `CONFIRMED` **sem ter pago**.

**O que já existe**
- `services/core-service/app/Controllers/WebhookApi/PixWebhookController.js` — já idempotente e transacional; **manter esse comportamento**
- `services/core-service/app/services/pix/FakePixProvider.js` e `index.js` — provedor simulado, selecionado por `PIX_PROVIDER`
- `services/core-service/routes/router.js` — aplica `express.json()` **globalmente**, antes das rotas
- `services/core-service/tests/public-booking.test.js` — hoje chama o webhook **sem** assinatura, nas linhas ~108 a 130

**Armadilha principal.** O HMAC é calculado sobre os **bytes crus** do corpo. Quando a requisição chega ao controller, o `express.json()` já consumiu esses bytes. É preciso preservá-los — por exemplo, com a opção `verify` do `express.json()` guardando o buffer em `request.rawBody`. **Nunca** recalcular a assinatura a partir de `JSON.stringify(request.body)`: a serialização pode diferir do que foi enviado.

**Desenho**
- Segredo em `PIX_WEBHOOK_SECRET`, lido do ambiente e **nunca** versionado; acrescente-o ao `.env.example` sem valor real
- Assinatura no cabeçalho `x-pix-signature`, no formato `sha256=<hex>`
- Verificação com `crypto.createHmac('sha256', segredo)` sobre o corpo cru, comparando com `crypto.timingSafeEqual` — **checar o tamanho antes**, porque o `timingSafeEqual` lança erro com buffers de tamanhos diferentes
- **Falha fechada:** sem `PIX_WEBHOOK_SECRET` configurado, o webhook **recusa** todas as requisições e registra o erro de configuração. Nunca aceite sem verificar
- Verificação **antes** de qualquer consulta ao banco
- `FakePixProvider` ganha um método para **assinar** uma notificação, para que os testes e a demonstração exercitem o mesmo caminho de um provedor real
- Um script de apoio para a demonstração, que envie uma notificação assinada — por exemplo, `services/core-service/scripts/simular_pagamento_pix.js`

**Critérios de aceite** — CA-06.9.a a CA-06.9.f da SPEC-06
- [ ] Assinatura HMAC-SHA256 válida → pagamento `PAID`, reserva `CONFIRMED`
- [ ] Assinatura inválida → `401`, **nenhum** estado alterado
- [ ] Cabeçalho ausente → `401`, nenhum estado alterado
- [ ] Corpo alterado depois de assinado → `401`
- [ ] Segredo não configurado → requisição recusada, erro de configuração registrado
- [ ] Reenvio assinado do mesmo pagamento continua idempotente
- [ ] `provider_charge_id` continua fora das respostas públicas (etapa 1)
- [ ] Testes cobrindo todos os casos acima

**Área de outra pessoa — marcar no PR para revisão do Weslley:**
- `PIX_WEBHOOK_SECRET` no ambiente de teste do CI (`.github/workflows/ci.yml`)
- `PIX_WEBHOOK_SECRET` no cluster (`infra/k8s/secret.yaml` e `infra/k8s/backend.yaml`)

**Condição de parada:** depois do merge, escreva o relatório e **avise o Gabriel** antes de seguir — é a correção de maior risco desta delegação.

---

### ETAPA 3 — `fix/paranoid-unique-constraints`: preparar para revisão

**Contexto.** Esta branch implementa a **T-06.3** e a **T-06.6**, que pertencem à trilha do **Sirlande**. Ela foi feita por um agente da trilha do Gabriel e, por isso, **quem aprova é o Sirlande**. A sua tarefa é deixá-la verificada e pronta para a revisão dele — **não** fazer o merge.

A auditoria de 31/08 a reprovou (`docs/qa/redteam_paranoid-unique_27ago2026.md`). Commits posteriores atacaram os achados, mas **nenhuma nova auditoria foi feita** e a suíte não foi executada desde então.

**Tarefa**
1. Já está nesta branch: `git merge origin/develop`
2. Resolver o que a simulação de 15/09 previu:
   - Mover para `services/core-service/` três arquivos novos da branch: `app/utils/uniqueConstraintConflict.js`, `tests/paranoid-unique-recreate.test.js` e `tests/unique-constraint-conflict.test.js`. O git indica o destino
   - Conflito em `scripts/qa_checks.sh` — **já existia antes da mudança de layout.** Preservar as duas contribuições: a regra 8 estrutural desta branch e a regra 9 do frontend, que está na `develop`, usando os caminhos com `$CORE`
3. Portão de QA completo, com **nova** auditoria do `qa-redteam`
4. Conferir cada achado 🔴 da auditoria de 31/08: resolvido ou não, com evidência
5. PR para `develop` com o título iniciado por **`[revisão do Sirlande]`**

**Condição de parada:** PR aberto e CI verde. **Não faça o merge.** A descrição do PR deve listar:
- os critérios CA-06.3.a a d e CA-06.6.a a c da SPEC-06, cada um com a evidência
- o estado de cada achado da auditoria de 31/08
- o que o Sirlande precisa conferir

---

### ETAPA 4 — T-06.2: schema de resposta no Swagger

**Branch:** `docs/swagger-response-schemas`

**Problema.** Das 62 respostas 2xx documentadas, **51 não têm schema** (medido em 09/09). O cliente TypeScript gerado devolve `never` no corpo, e o frontend compensa com `as unknown as`. A divisão do frontend entre os três só começa depois desta etapa.

**O que já existe**
- `services/core-service/config/swagger.js` — já tem `components.schemas` para Tenant, User, Product, RoomCategory, Room, Guest, Reservation e Error
- `frontend/packages/api-client/scripts/dump-openapi.mjs` — lê o `swagger.js` do core-service
- Regeneração: `pnpm -C frontend gen:api` (exige `npm ci` em `services/core-service` e `pnpm install` em `frontend`)
- Seis casts a remover: `frontend/apps/pms/src/features/guests/guestsApi.ts` (4), `GuestDetailPage.tsx` (1) e `features/auth/loginApi.ts` (1)

**Medir antes e depois** — rode dentro de `services/core-service`:

```bash
node --input-type=module -e '
const { default: s } = await import("./config/swagger.js");
let t = 0, sem = 0;
for (const i of Object.values(s.paths)) for (const [m, op] of Object.entries(i)) {
  if (!["get","post","put","delete","patch"].includes(m)) continue;
  for (const [c, r] of Object.entries(op.responses || {})) if (/^2/.test(c) && c !== "204") { t++; if (!r.content) sem++; }
}
console.log(`respostas 2xx: ${t} | sem schema: ${sem}`);'
```

**Critérios de aceite** — CA-06.2.a a CA-06.2.e da SPEC-06
- [ ] Toda resposta 2xx com corpo declara `content` com `$ref`
- [ ] Schemas reutilizáveis em `components.schemas`, sem duplicação literal
- [ ] Os schemas batem com o que os controllers **realmente** devolvem — confira cada um contra o código, não contra o nome do model
- [ ] Cliente regenerado, sem `never` nos módulos cobertos, com `openapi.json` e `schema.d.ts` commitados
- [ ] Os seis casts removidos e `pnpm -C frontend typecheck` limpo

**Coordenação.** Esta etapa reescreve o `swagger.js` inteiro. Durante ela, **ninguém mais edita esse arquivo** — o Gabriel avisa o time. A T-06.10 (paginação, do Sirlande) também mexe no contrato das listagens: se ela já tiver começado, pare e reporte antes de continuar.

---

### ETAPA 5 — T-01.3: autenticação entre serviços

**Branch:** `feat/jwt-rs256`

**Problema.** O token usa HS256, com um único `JWT_SECRET`. Distribuído a três serviços, qualquer um deles passaria a poder **emitir** token válido de qualquer hotel. Isso torna impossível cumprir o **CA-01.3.b** (`tenant_id` impossível de forjar). Além disso, o `JWT_SECRET` está em texto puro em `infra/k8s/secret.yaml`, versionado.

**O que já existe**
- Assinatura: `services/core-service/app/Controllers/AuthApi/LoginController.js`, linha ~48
- Verificação: `services/core-service/middlewares/auth.middleware.js`, linha ~12
- Os testes obtêm token pelo login e não assinam tokens diretamente

**Esta etapa tem duas fases.**

#### 5a — Proposta. PARAR para aprovação do Gabriel

Escreva `docs/sugestoes-documentos-oficiais/07-adr/ADR-006-proposta.md` e o `MOTIVOS.md` ao lado. O Documento 07 é do **Weslley**: a proposta fica como sugestão, **não** é escrita no documento oficial. Ela precisa decidir:
- **CA-01.3.a** — cada serviço valida o token localmente com a chave pública, ou um *gateway* valida e repassa. Recomendação da SPEC-01: validação local com RS256
- **CA-01.3.c** — como uma chamada entre serviços, sem usuário, se autentica (o b2b chamando o core, na T-01.6)
- **CA-01.3.d** — credenciais do RabbitMQ separadas por serviço
- Como as chaves chegam a cada ambiente — local, testes, CI e cluster — **sem versionar a chave privada**
- O que acontece com os tokens HS256 já emitidos

**Pare aqui** e reporte ao Gabriel.

#### 5b — Implementação, só depois da aprovação

- Core assina com a chave privada, em RS256, com `kid` no cabeçalho
- `auth.middleware` verifica com a chave pública e **fixa** `algorithms: ['RS256']` — sem isso, o token fica exposto à troca de algoritmo
- Chaves de teste geradas no setup da suíte, efêmeras, nunca versionadas
- Script para gerar o par de chaves localmente, com o destino no `.gitignore`
- Testes: token RS256 válido aceito; token HS256 recusado; token assinado com outra chave recusado; `tenant_id` adulterado recusado

**Área do Weslley — marcar no PR:** chaves no CI (`.github/workflows/ci.yml`) e no cluster (`infra/k8s/`), e a retirada do `JWT_SECRET` em texto puro de `infra/k8s/secret.yaml`.

---

### ETAPA 6 — T-01.2: catálogo de eventos e política de falhas

**Branch:** `docs/catalogo-eventos`

Documentação. Nenhum código.

Escreva `docs/specs/anexos/SPEC-01-catalogo-eventos.md` com:

- **Envelope comum** a todos os eventos: `event_id`, `type`, `version`, `occurred_at`, `tenant_id` (obrigatório), `aggregate_id` e `aggregate_version`
- **Um item por evento** listado na SPEC-01, §5 — nome, *routing key*, esquema do *payload* e quais indicadores o consomem
- O *payload* contém **apenas** o que as 7 consultas de `services/core-service/app/Controllers/AnalyticsApi/` usam. Confira consulta por consulta
- **Hóspede: somente id, `tenant_id` e nome** — minimização de dado pessoal. Inclua o evento de eliminação a pedido do titular (T-06.11)
- **Política do consumidor:** tentativas, intervalo entre elas, quando uma mensagem vai para a fila de mensagens mortas, e como o consumidor ignora eventos repetidos
- **Chamada síncrona b2b → core:** *timeout*, tentativas e a resposta ao usuário em caso de falha (CA-01.2.d)
- **Contrato das duas rotas internas** do core — criar e cancelar reserva-bloco, idempotentes por `contract_id` (CA-01.2.b). Apenas o contrato: as rotas só serão implementadas na T-01.6

**Condição de parada:** PR para `develop` com o documento. **O Gabriel aprova antes do merge** — este catálogo define o contrato da T-01.4.

---

### ETAPA 7 — Documento 02: conferência contra os critérios de aceite

**Branch:** `docs/conferencia-doc02`

Análise. **Não edite o documento oficial**, nem a versão sugerida.

O Documento 02 foi entregue ao professor. A v1.4 sugerida (`docs/sugestoes-documentos-oficiais/02-requisitos/versao-sugerida_v1.4.md`) só vai à reunião de reentrega com **certeza absoluta** de que cobre todos os critérios.

Escreva `docs/sugestoes-documentos-oficiais/02-requisitos/CONFERENCIA_CRITERIOS.md`:

- **Um item por exigência** das seções 1 a 8 do Termo de Requisitos (`UniFAAT-projeto-experimental-2027-1/aceite-projeto-experimental.md`) e dos critérios C1 a C10 do Termo da banca (`termo-aceite-banca-5semestre.md`)
- Para cada um: qual RF ou RNF da v1.4 o cobre, se cobre integralmente, e a evidência
- **Lacunas:** exigência sem requisito correspondente, requisito que contradiz a arquitetura decidida no ADR-003, ou meta que o código não sustenta
- **Coerência com o Documento 04** (MER entregue e a sugestão v1.2)
- Conclusão objetiva: a v1.4 está pronta para reentrega, ou o que falta

**Condição de parada:** PR para `develop` com o relatório. O Gabriel decide o que fazer com ele.

---

## 5. Output esperado

Ao fim de **cada** etapa:

1. Branch com commits Conventional, com corpo explicando o quê e o porquê
2. PR para `develop`, com:
   - o que foi feito e os critérios de aceite, um a um, com evidência
   - a saída real do portão de QA
   - uma seção **"Para revisão do dono"**, quando houver alteração em área de outra pessoa
3. Estado da tarefa atualizado na Spec correspondente (🔲 → 🟡 → ✅)
4. Relatório de sessão em `docs/historico_sessao/gabriel/<titulo>_<ddmmaaaa>.md`

Ao final da delegação, um resumo com:

| Etapa | Estado | PR | Pendências | Revisão de outro dono |
|---|---|---|---|---|

---

## 6. Quando parar e perguntar

- Qualquer teste que já passava e passou a falhar
- Veredito REPROVADO do `qa-redteam` depois de uma tentativa de correção
- Conflito de merge fora dos previstos na etapa 3
- Qualquer mudança que exija alterar a máquina de estados da reserva, o cálculo de valores ou o fluxo de reserva direta
- Necessidade de recurso de nuvem — **regra absoluta do projeto:** permanecer no free-tier e nunca usar o usuário `root` da AWS. Nenhuma etapa desta delegação precisa de nuvem
- Nas condições de parada explícitas das etapas 2, 3, 5a e 6

---

## 7. Fora desta delegação

- **T-01.4** — extrair o analytics. Fica liberada quando as etapas 5 e 6 forem aprovadas, e terá delegação própria
- **Frontend** — reservas, rack e painel do dia. Fica liberado depois da etapa 4 e da canonização de `features/guests`
- **Tarefas das trilhas do Sirlande e do Weslley**
- **Documentos oficiais da UniFAAT** — nenhum é editado
- A senha de banco em texto puro em `scripts/setup_db.sh` — registrada para tratamento separado
