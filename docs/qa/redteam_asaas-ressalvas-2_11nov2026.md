# QA Red Team — asaas-ressalvas-2 (CPF malformado e PIX_PROVIDER fail-safe)
**Branch:** fix/asaas-ressalvas-2 · **Dev:** Weslley (commits de Lucaskenway) · **Base:** develop@0ff0021 · **Data:** 11/11/2026
**Arquivos auditados:** 7 do diff (+ PixWebhookController, AsaasPixProvider, GuestModel, GuestApi, swagger.js, compose, k8s, .env.example, roteiro do passo 6 para contexto)
**Achados no escopo:** 7 (🔴 0 · 🟡 1 · 🟢 6) · **Repassados:** 2

Origem das ressalvas: 🟡3 de `docs/qa/redteam_asaas-pix_16out2026.md` (CPF malformado vira 503) e o 2º achado de `docs/qa/repasses/para_weslley_31102026.md` (PIX_PROVIDER desconhecido cai no fake).

## Veredito
**APROVADO COM RESSALVAS**

Os cinco critérios de aceite estão atendidos no código. Nenhum achado 🔴. A ressalva principal é documental: o roteiro da demonstração ainda descreve o comportamento antigo.

| Critério | Situação | Evidência |
|---|---|---|
| CPF malformado com asaas → 400 `guest.cpf inválido`, sem chamar o Asaas | ✅ | `CreateBookingController.js:104-106` vem antes do `createCharge` (`:109`). Teste `asaas-webhook.test.js:121-126` confere `fetchMock` não chamado |
| fake/mercadopago: CPF opcional e não validado | ✅ no código, ⚠️ sem teste | condição `pix.requiresPayerCpf &&`. Fake e MP herdam `false` de `PixProvider.js:13`. Ver 🟢-3 |
| vazio/ausente → fake; espaço/maiúscula normaliza; fora da lista → erro; `_web.js` sai | ✅ | `index.js:29-35`, `_web.js:30-38`. Conferido em execução: `"  "`→fake, `"fake\t"`→fake, `"constructor"`/`"__proto__"`/`"toString"`→erro (o `Object.hasOwn` barra chave do protótipo) |
| `Payment.provider` grava o nome normalizado | ✅ no código, ⚠️ sem teste que pegue a regressão | `CreateBookingController.js:198`. Ver 🟢-2 |
| Nada mais no contrato muda | ✅ com uma borda | o corpo do 400 segue o formato `ValidationErrors` já documentado. Borda: CPF numérico com asaas (🟢-6) |

## Achados no escopo

### 🟡 [Documentação / demonstração] Roteiro do passo 6 ainda diz que CPF malformado vira 503 e não cobre os dois modos de falha novos
**Onde:** `docs/roteiro/PASSO_6_RESERVA_DIRETA_PIX.md:115-119` (pendências) e `:95-103` (tabela de sintomas)
**Cenário:** quem ensaia a defesa lê em "Pendências conhecidas" que "CPF malformado vira 503 em vez de 400", que deixou de ser verdade. Na tabela de sintomas não há linha para o 400 `guest.cpf inválido` nem para o backend que não sobe. O segundo caso é o que mais assusta ao vivo: alguém digita `PIX_PROVIDER=assas` no `.env`, roda `docker compose up -d backend`, e o container entra em `Restarting`. A tabela não diz onde olhar. O log diz (`❌ PIX_PROVIDER desconhecido: ...`), mas o roteiro não manda abrir o log.
**Regra violada:** CLAUDE.md §9 (pendências documentadas com contexto). A própria ressalva 🟡3 está listada como aberta no documento que a demonstração segue.
**Correção sugerida:** tirar o item "CPF malformado vira 503" das pendências. Acrescentar duas linhas à tabela:
- `400 guest.cpf inválido`: CPF digitado errado, use o CPF do exemplo.
- backend em `Restarting` depois de trocar de plano: valor errado em `PIX_PROVIDER`. Rode `docker compose logs backend` e corrija para `fake` ou `asaas`.

Vale o mesmo aviso em `docs/pagamentos/ASAAS_SANDBOX.md`, perto da linha 102, onde estão os outros sintomas.

### 🟢 [Swagger] Descrição do 400 de `POST /public/{subdomain}/bookings` não menciona CPF inválido
**Onde:** `services/core-service/config/swagger.js:583` (400: "Campos obrigatórios ausentes…") e `:577` (`cpf`: "Obrigatório com PIX_PROVIDER=asaas")
**Cenário:** um integrador lê no Swagger que o 400 vem só de campo ausente e não espera `guest.cpf inválido` para um CPF presente. O schema (`ValidationErrors`) cobre o corpo, então o cliente tipado não quebra. Só a descrição ficou incompleta.
**Regra violada:** CLAUDE.md §6, endpoint documentado no Swagger. É só texto, o contrato tipado está intacto.
**Correção sugerida:** `cpf`: "Obrigatório e com dígitos verificadores válidos com PIX_PROVIDER=asaas". 400: "…ausentes ou CPF inválido (formato ValidationErrors)…". Depois, regerar `frontend/packages/api-client/openapi.json`. Atenção à regra do §7 da divisão de trabalho sobre `swagger.js` (T-06.2).

### 🟢 [Testes] Normalização do `Payment.provider` não tem teste que pegue a regressão
**Onde:** `services/core-service/tests/asaas-webhook.test.js:66` (`stubEnv('PIX_PROVIDER', 'asaas')`) e `:139` (`expect(payment.provider).toBe('asaas')`)
**Cenário:** o env do teste já é o nome canônico. Se alguém voltar a linha 198 para `process.env.PIX_PROVIDER || 'fake'`, todos os testes continuam verdes, e `' Asaas '` volta a ser gravado cru no banco.
**Regra violada:** checklist §8 do red team, teste que passaria com a regra quebrada.
**Correção sugerida:** um caso com `stubEnv('PIX_PROVIDER', ' Asaas ')` + `resetPixProviderForTests()` que crie a reserva e confira `payment.provider === 'asaas'`.

### 🟢 [Testes] Critério "fake não valida CPF" sem teste de regressão
**Onde:** `services/core-service/tests/public-booking.test.js:289-317` usa só CPFs válidos (`52998224725`, `16899535009`). Os CPFs inválidos da suíte (`12345678901`, `123.456.789-00`) estão nos testes do CRUD de hóspede, não na reserva pública.
**Cenário:** se a condição `pix.requiresPayerCpf &&` da linha 104 for removida, o fake passa a recusar CPF inválido e nenhum teste falha. O critério 2 desta branch fica sem trava.
**Correção sugerida:** em `public-booking.test.js` (fake), reservar com `cpf: '123.456.789-00'` e esperar 201.

### 🟢 [Consistência] `resolvePixProviderKey()` relê o env, enquanto o provider ativo é um singleton
**Onde:** `services/core-service/app/services/pix/index.js:38-43` e `CreateBookingController.js:198`
**Cenário:** `getPixProvider()` fixa a instância na primeira chamada, mas a linha 198 relê `process.env.PIX_PROVIDER` a cada reserva. Se os dois divergirem, a cobrança sai num PSP e o `Payment.provider` grava outro. Isso acontece com env alterado depois da subida, ou com a suíte `isolate:false` trocando o env sem `resetPixProviderForTests()`. Um caso pior: se o env mudar para um valor inválido em runtime, a linha 198 lança **dentro da transação, depois de a cobrança existir no PSP**, e a cobrança fica órfã. Em produção o env não muda depois da subida, então é teórico. Também é uma segunda fonte de verdade para o mesmo dado.
**Correção sugerida:** guardar a chave junto com a instância, por exemplo `instanceKey` setado em `getPixProvider()`, e expor `getPixProviderKey()` que devolve essa chave. Outra opção é ler a chave uma vez antes do `createCharge` e reusar na linha 198.

### 🟢 [LGPD / segredo em log] Mensagem de erro ecoa o valor cru de `PIX_PROVIDER`
**Onde:** `services/core-service/app/services/pix/index.js:32` + `_web.js:36`
**Cenário:** alguém cola a chave na linha errada do `.env`, por exemplo `PIX_PROVIDER=$aact_hmlg_...`. Conferido em execução: a mensagem sai `PIX_PROVIDER desconhecido: "$aact_hmlg_SEGREDO"` e vai para o `console.error`, ou seja, para o log do container. O `ASAAS_SANDBOX.md:71` promete que "a chave nunca é impressa". É chave de sandbox e o cenário depende de erro humano, por isso 🟢.
**Correção sugerida:** não ecoar o valor, ou ecoar truncado (primeiros 8 caracteres). A lista de valores aceitos basta para diagnosticar.

### 🟢 [Validação] `isValidCpf` aceita qualquer lixo em volta dos dígitos e recusa CPF numérico
**Onde:** `services/core-service/app/utils/isValidCpf.js:10-11`
**Cenário 1:** `"CPF: 529-982-247/25 xyz"` → `true` (conferido em execução). Ao Asaas vai `onlyDigits`, então a cobrança sai certa. Mas o hóspede é gravado com o texto cru (`CreateBookingController.js:171`, `cpf: guest.cpf ?? null`), e esse comportamento já existia. Validar não é o mesmo que normalizar.
**Cenário 2:** `guest.cpf: 52998224725` (número) com asaas. Antes, `onlyDigits(String(v))` aceitava e a cobrança saía. Agora volta 400 `guest.cpf inválido`. O Swagger declara `type: string`, então o contrato publicado não muda, mas o comportamento observável mudou para esse cliente.
**Correção sugerida:** opcional. Restringir o formato a `^\d{11}$|^\d{3}\.\d{3}\.\d{3}-\d{2}$` antes da conta dos verificadores. O caso numérico pode ficar como está, com a mensagem documentada.

### 🟢 [Testes] Fail-fast do `_web.js` sem teste
**Onde:** `services/core-service/_web.js:30-38`
**Cenário:** se alguém mover o bloco para depois do `web.listen` ou trocar `process.exit(1)` por um `console.warn`, nada falha. Hoje há teste do factory (`asaas-pix.test.js:77-81`), mas não da recusa de subir. O JWT tem o mesmo padrão e também só testa o `assertKeyPair`, então é uma melhoria, não uma lacuna nova.
**Correção sugerida:** opcional. Um teste que faz `spawn` de `node _web.js` com `PIX_PROVIDER=assas` e espera exit code 1, no estilo de `tests/helpers/analyticsPipeline.js`.

## Repassados a outro dev

| Sev. | Achado | Onde | Dono | Repasse |
|------|--------|------|------|---------|
| 🟡 | Find-or-create do hóspede compara CPF cru: `529.982.247-25` não acha o hóspede gravado como `52998224725` e cria um duplicado. O índice parcial não pega, porque as strings diferem | `CreateBookingController.js:153-157,171` | DONO INDEFINIDO | `docs/qa/repasses/para_dono-indefinido_11112026.md` |
| 🟢 | CRUD de hóspede aceita CPF com dígito verificador inválido e grava cru | `GuestApi/CreateGuestController.js:12-20`, `UpdateGuestController.js:20` | DONO INDEFINIDO | `docs/qa/repasses/para_dono-indefinido_11112026.md` |

## O que foi verificado e está correto
- **Quem mais chama o factory:** `git grep` em `services`, `scripts`, `infra`, `.github` e `frontend`. Só `CreateBookingController.js:97,198`, `PixWebhookController.js:40` e testes chamam `getPixProvider`/`resolvePixProviderKey`. `command.js`, outbox, analytics-service e `scripts/simular_pagamento_pix.js` não importam o factory, então migrate/seed não são afetados pela recusa.
- **Webhook:** usa a instância já criada na subida, então não passa a lançar em runtime. Se lançasse, cairia no `catch` externo (500), sem efeito no banco.
- **Construtores dos providers não lançam:** a validação de chave/URL do Asaas fica em `getAsaasConfig()` e roda só na chamada. Com `PIX_PROVIDER=asaas` e chave vazia o backend sobe e responde 503, como antes. A subida não ficou mais restrita do que o critério pede.
- **Ambientes:** o compose usa `${PIX_PROVIDER:-fake}` (`docker-compose.yml:153`). O k8s não define a variável, então cai no fake e sobe. Os dois `.env.example` usam `fake`. Nenhum workflow de CI define `PIX_PROVIDER`.
- **Isolamento de testes:** o `afterEach` de `asaas-pix.test.js` faz `unstubAllEnvs` e depois `resetPixProviderForTests`. O caso `assas` não contamina os arquivos seguintes da suíte `isolate:false`.
- **Algoritmo do `isValidCpf`:** correto para os dois verificadores, incluindo resto 10 → 0. Conferido em execução: `12345678909` e `00000000191` → true. Sequências iguais → false. Dígitos de largura total (`５`) → false, porque `\D` é ASCII.
- **Ordem da validação:** o 400 vem depois da checagem de "obrigatório" e antes de qualquer escrita ou chamada de rede. Não sobra cobrança órfã.
- **ESM:** sem `require`. Nenhum log novo imprime CPF. Tenant: o diff não acrescenta query.
- **Allowlist:** `Object.hasOwn(PROVIDERS, key)` fecha o caminho de `__proto__`/`constructor`, que um `PROVIDERS[key]` simples deixaria passar como truthy.

## Não foi possível verificar
- A suíte de testes não foi rodada, por instrução: ela roda à parte. A análise de mutação (🟢-2, 🟢-3) foi feita lendo o código, não executada.
- O comportamento real do Asaas sandbox com CPF que passa no `isValidCpf` mas é recusado por outra regra deles (CPF bloqueado, por exemplo). Esse caso ainda viraria 503.
- A subida via `docker compose` com `PIX_PROVIDER=assas` não foi executada. O caminho do `process.exit(1)` foi conferido só por leitura.
