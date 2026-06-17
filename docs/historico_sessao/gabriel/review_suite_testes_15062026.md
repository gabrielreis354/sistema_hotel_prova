# Code Review — Suite de Testes de Integração (Vitest + Supertest)
**Data:** 15/06/2026
**Revisado por:** Gabriel (orquestrador)
**Commit de referência:** `ae30d00 feat(tests): adicionar suite completa de integração (Vitest + Supertest) — 75 testes`
**Escopo:** `tests/` (7 suites + 4 helpers + 2 setups)

---

## Resultado Geral

A suite está **bem fundamentada**. A infraestrutura de testes, o design de helpers e a cobertura de isolamento multi-tenant são o ponto alto do trabalho. Há problemas de médio e alto risco que tornam alguns testes frágeis ou semanticamente inválidos — esses precisam ser corrigidos antes de o CI depender desta suite como gate de qualidade.

---

## Parte 1 — O que foi entregue com qualidade

### Infraestrutura de setup ✅
A separação entre `globalSetup.js` (roda uma vez por processo, cria o banco e sincroniza o schema) e `env.js` (roda antes de cada arquivo, inicializa relações no worker) é arquiteturalmente correta. O uso de `sequelize.close()` no globalSetup evita conexões penduradas, e o guard `globalThis.__hotelRelationsInit` em `env.js` previne double-initialization em workers paralelos.

### Estratégia de limpeza entre suites ✅
`TRUNCATE TABLE tenants CASCADE` em `helpers/db.js` é a abordagem certa: uma única operação limpa todas as tabelas filho em cascata, explorando as FKs do schema. Isso é mais confiável e performático do que truncar tabela por tabela.

### Padrão de factories ✅
O arquivo `helpers/factories.js` resolve o problema de boilerplate corretamente. As funções aceitam `overrides`, têm valores sensatos como default e usam `Date.now()` para unicidade de emails — padrão adequado para testes paralelos e para prevenir colisões de unique constraints.

### Cobertura de tenant isolation ✅
`tenant-isolation.test.js` é o arquivo mais importante da suite e foi bem executado. Cobre os vetores críticos de vazamento: listagem, busca por ID, e mutações de estado (check-in, cancelamento) cruzando tenants. O teste de CPF único por tenant (não global) verifica a regra de negócio SaaS corretamente.

### Testes de máquina de estados ✅
`reservations.test.js` testa o fluxo completo em sequência: PENDING → CHECKED_IN → CHECKED_OUT, com verificação do estado do quarto em cada transição. Os testes de rejeição (check-in duplo, cancelar CHECKED_IN, check-out duplo) cobrem os casos de 422 corretamente. O teste de propagação de status para quartos extras (`reservation_rooms`) verifica o comportamento crítico do pivot.

### Verificação de cálculo de `total_amount` ✅
O teste `'cria reserva e calcula total_amount automaticamente (price × noites)'` verifica que o servidor calcula o valor sem depender do cliente — proteção correta contra adulteração financeira.

---

## Parte 2 — Problemas identificados

Os problemas estão classificados por severidade: **Alto** (pode produzir falsos negativos/positivos), **Médio** (fragilidade que quebra em edge cases), **Baixo** (omissão de cenário, não causa falso positivo).

---

### ALTO — helpers/auth.js: ausência de asserção no register e no login

```js
// helpers/auth.js — situação atual
const regRes  = await request(app).post('/auth/register').send({ ... });
const loginRes = await request(app).post('/auth/login').send({ email, password });

return { jwt: loginRes.body.token, ... };  // se login falhou, jwt é undefined
```

Se o registro falhar (banco em estado inesperado, constraint violada, bug), `regRes.body.tenant` é `undefined`, e `loginRes.body.token` também. Todos os testes que dependem do `jwt` retornado falham com mensagens do tipo `"Cannot read property 'id' of undefined"`, que não indicam a causa raiz.

**Impacto:** diagnóstico de falhas fica extremamente difícil em CI. Uma falha no auth derruba toda a suite silenciosamente.

---

### ALTO — reservations.test.js linha 254: asserção vacuosa no cancelamento de CONFIRMED

```js
// Linha 254 — situação atual
expect([200, 422]).toContain(cancelRes.status);
```

Este `expect` aceita tanto sucesso quanto falha. O teste nunca pode reprovar. Ao aceitar 422, o teste passa mesmo que o sistema não consiga cancelar uma reserva CONFIRMED — que é um requisito funcional documentado na máquina de estados.

**Impacto:** falso positivo garantido. O teste não verifica nada além de que a rota respondeu.

---

### ALTO — `globalSetup.js`: `sequelize.sync()` não cria constraints de banco

`sequelize.sync({ force: true })` recria as tabelas baseado nos Models em memória. O `EXCLUDE USING gist` da tabela `reservations` (que impede double-booking a nível de banco) **não é criado**, pois o Sequelize não tem esse constraint definido. Os testes de conflito de reserva testam apenas a lógica de aplicação (`checkReservationConflict.js`), não a constraint de banco.

**Impacto:** se a lógica de aplicação for removida e o constraint de banco existir no schema real, os testes passariam mesmo sem proteção de aplicação — e vice-versa. Os dois mecanismos não são testados como conjunto.

---

### MÉDIO — Mutação de variáveis de módulo dentro de `it()` em múltiplos arquivos

Padrão recorrente em `guests.test.js`, `rooms.test.js`, `room-categories.test.js` e `payments.test.js`:

```js
// Exemplo em guests.test.js
let guestId;   // declarado no módulo

it('cria hóspede e retorna 201', async () => {
    const res = await request(app).post('/guests')...;
    guestId = res.body.id;   // atribuído dentro do it()
});

it('retorna hóspede por ID', async () => {
    const res = await request(app).get(`/guests/${guestId}`)...;   // depende do it() anterior
    expect(res.body.id).toBe(guestId);
});
```

A atribuição dentro de `it()` cria dependência implícita de ordem entre testes. Qualquer reroder, timeout ou falha no primeiro `it()` faz o segundo falhar com uma mensagem enganosa (geralmente uma URL com `undefined`).

**Correção:** mover a criação do recurso principal para `beforeAll` e atribuir o ID lá.

---

### MÉDIO — rooms.test.js linha 107: asserção de contagem absoluta frágil

```js
it('lista ambos os quartos disponíveis sem reservas', async () => {
    // ...
    expect(res.body.length).toBe(2);
});
```

Esta asserção assume que exatamente 2 quartos estão disponíveis. Se um test anterior no mesmo arquivo criou mais quartos (como o `it('cria segundo quarto')`), o count pode estar errado dependendo da ordem. A contagem exata de registros em testes de integração é uma asserção frágil.

**Correção:** usar `toBeGreaterThanOrEqual(2)` ou validar que os IDs específicos estão presentes.

---

### MÉDIO — reservations.test.js: ausência do fluxo CONFIRMED → CHECKED_IN

O ciclo documentado é `PENDING → CONFIRMED → CHECKED_IN`. Os testes cobrem `PENDING → CHECKED_IN` diretamente, pulando o estado `CONFIRMED`. Isso deixa sem cobertura o caso em que um operador tenta confirmar a reserva antes do check-in — e se o sistema bloquear essa transição indevidamente, os testes não detectam.

---

### BAIXO — payments.test.js: cobertura muito superficial

O arquivo tem apenas 5 testes e cobre apenas `POST` e listagem por ID + lista. Ausente:
- `PUT /payments/:id` (atualização)
- `DELETE /payments/:id` (soft delete)
- `GET /payments/:id` com ID inexistente (404)
- Validação de `amount` negativo ou zero
- Pagamento vinculado a reserva CANCELLED

---

### BAIXO — Ausência de testes de unicidade a nível de constraint

Nenhum arquivo testa a unicidade de `room_categories.name` por tenant, nem `rooms.number` por tenant. Os testes de `POST /room-categories` com nome duplicado e `POST /rooms` com número duplicado retornariam 409, mas esse caminho não é exercido.

---

### BAIXO — tenant-isolation.test.js: sem teste de mutação cross-tenant via PUT

O arquivo testa que Tenant B não consegue **ler** recursos do Tenant A. Mas não testa que Tenant B não consegue **atualizar** um recurso do Tenant A via `PUT /rooms/:id`, `PUT /guests/:id` etc. O padrão de tenant isolation nos controllers deve ser verificado também nos endpoints de escrita.

---

## Parte 3 — Resumo das Correções Necessárias

| # | Arquivo | Problema | Prioridade |
|---|---|---|---|
| 1 | `tests/helpers/auth.js` | Adicionar asserção `expect(regRes.status).toBe(201)` e `expect(loginRes.status).toBe(200)` antes do return | Alta |
| 2 | `tests/reservations.test.js:254` | Substituir `expect([200, 422])` por fluxo determinístico (criar reserva, confirmá-la via endpoint correto, cancelar) | Alta |
| 3 | `tests/setup/globalSetup.js` | Documentar explicitamente que `EXCLUDE USING gist` não é criado pelo sync e adicionar comentário explicando a limitação | Alta |
| 4 | `tests/guests.test.js` | Mover criação do guest principal (com CPF) para `beforeAll`; remover atribuição de `guestId` dentro do `it()` | Média |
| 5 | `tests/rooms.test.js` | Idem para `roomId` e `roomId2`; substituir `toBe(2)` por `toBeGreaterThanOrEqual(2)` | Média |
| 6 | `tests/room-categories.test.js` | Mover criação da categoria para `beforeAll`; remover atribuição de `categoryId` dentro do `it()` | Média |
| 7 | `tests/payments.test.js` | Idem para `paymentId`; adicionar testes para PUT, DELETE e 404 | Média |
| 8 | `tests/reservations.test.js` | Adicionar teste de fluxo PENDING → CONFIRMED → CHECKED_IN | Baixa |
| 9 | `tests/room-categories.test.js` | Adicionar teste de criação de categoria com nome duplicado (409) | Baixa |
| 10 | `tests/rooms.test.js` | Adicionar teste de quarto com número duplicado (409) e teste de AVAILABLE exclui quartos OCCUPIED/MAINTENANCE | Baixa |
| 11 | `tests/tenant-isolation.test.js` | Adicionar testes de PUT cross-tenant (quartos, hóspedes) | Baixa |

---

## Parte 4 — Prompt para IA

Copie o bloco abaixo para iniciar a sessão de correção dos testes.

---

```
Você é um dev senior Node.js trabalhando em um hotel PMS SaaS multi-tenant.

CONTEXTO DO PROJETO:
- Stack: Node.js 24, Express 4, Vitest 4, Supertest 7, Sequelize 6, PostgreSQL 17, ESM
- Testes de integração em tests/ com banco real (gestao_hotel_test)
- Helpers em tests/helpers/, setup em tests/setup/
- Todos os testes rodam sequencialmente (singleFork: true, concurrent: false)

TAREFA: Corrigir a suite de testes existente. NÃO reescrever — corrigir os problemas identificados abaixo.
NÃO altere arquivos fora de tests/. NÃO altere controllers, models, routes, middlewares.

═══════════════════════════════════════════════════
CORREÇÃO 1 — ALTA PRIORIDADE: tests/helpers/auth.js
═══════════════════════════════════════════════════
Problema: ausência de asserção nos resultados de register e login.
Se o register falhar, a função retorna jwt: undefined e todas as suites falham silenciosamente.

FAZER: Adicionar verificação explícita após cada request, lançando erro descritivo:

  const regRes = await request(app).post('/auth/register').send({ ... });
  if (regRes.status !== 201) {
      throw new Error(`[registerAndLogin] Register falhou: ${regRes.status} — ${JSON.stringify(regRes.body)}`);
  }
  const loginRes = await request(app).post('/auth/login').send({ email, password });
  if (loginRes.status !== 200) {
      throw new Error(`[registerAndLogin] Login falhou: ${loginRes.status} — ${JSON.stringify(loginRes.body)}`);
  }

═════════════════════════════════════════════════════════════════
CORREÇÃO 2 — ALTA PRIORIDADE: tests/reservations.test.js linha ~228
═════════════════════════════════════════════════════════════════
Problema: o teste "cancela reserva CONFIRMED" usa expect([200, 422]).toContain() — asserção que nunca reprova.

O problema raiz: o teste tenta avançar para CONFIRMED via PUT /reservations/:id com { status: 'CONFIRMED' },
mas este campo é protegido por design (não pode ser alterado via PUT direto).

FAZER: Substituir o describe 'cancela reserva CONFIRMED' pelo seguinte:
- Criar uma reserva
- Tentar cancelá-la enquanto está PENDING → deve retornar 200 com status CANCELLED
- NÃO tentar avançar status via PUT direto (isso é protegido por design)
- Adicionar um it() separado que documenta explicitamente:
  "PUT /reservations/:id com campo status é ignorado — status não muda"
  Que faz: cria reserva, envia PUT com { status: 'CONFIRMED' }, verifica que status continua PENDING

O teste de CONFIRMED → cancel deve ser removido ou marcado como TODO com skip
(it.skip) até que exista um endpoint POST /reservations/:id/confirm.

═════════════════════════════════════════════════════════════════════════
CORREÇÃO 3 — MÉDIA PRIORIDADE: mutation de ID dentro de it() em 4 arquivos
═════════════════════════════════════════════════════════════════════════
Arquivos afetados: guests.test.js, rooms.test.js, room-categories.test.js, payments.test.js

Problema: variáveis como guestId, roomId, categoryId, paymentId são atribuídas dentro de it(),
criando dependência de ordem entre testes. Se o primeiro it() falha, os seguintes falham com
erros enganosos (URL com 'undefined').

FAZER em cada arquivo: mover a criação do recurso principal para beforeAll e atribuir o ID lá.

Exemplo para guests.test.js:

  ANTES:
    let guestId;
    it('cria hóspede e retorna 201', async () => {
        const res = await request(app).post('/guests')...;
        guestId = res.body.id;   // ← problema
    });

  DEPOIS:
    let guestId;
    beforeAll(async () => {
        await truncateAll();
        ({ jwt } = await registerAndLogin(app, { tenantName: 'Hotel Hóspedes' }));
        // Criar o hóspede principal no beforeAll
        const res = await request(app)
            .post('/guests')
            .set('Authorization', `Bearer ${jwt}`)
            .send({ full_name: 'João da Silva', cpf: '12345678901', email: 'joao@test.com', phone: '11999990000' });
        guestId = res.body.id;
    });

    // O it() de criação ainda pode existir para verificar o response body,
    // mas NÃO deve ser a única fonte de guestId para outros testes.
    it('confirma que criação retorna 201 e body correto', async () => {
        const res = await request(app)
            .post('/guests')
            .set('Authorization', `Bearer ${jwt}`)
            .send({ full_name: 'Outro Hóspede', cpf: '99999999999', email: 'outro@test.com' });
        expect(res.status).toBe(201);
        expect(res.body).toMatchObject({ full_name: 'Outro Hóspede' });
    });

Aplicar o mesmo padrão para rooms.test.js (roomId, roomId2), room-categories.test.js (categoryId)
e payments.test.js (paymentId).

═══════════════════════════════════════════════════════════
CORREÇÃO 4 — MÉDIA PRIORIDADE: rooms.test.js linha ~107
═══════════════════════════════════════════════════════════
Problema: expect(res.body.length).toBe(2) — contagem absoluta frágil.

FAZER: Substituir por:
  const ids = res.body.map(r => r.id);
  expect(ids).toContain(roomId);
  expect(ids).toContain(roomId2);
  // Verificar estrutura do primeiro resultado
  expect(res.body[0]).toHaveProperty('category');

═══════════════════════════════════════════════════════════
CORREÇÃO 5 — MÉDIA PRIORIDADE: tests/setup/globalSetup.js
═══════════════════════════════════════════════════════════
Problema: sequelize.sync() não cria EXCLUDE USING gist (constraint de banco para sobreposição de datas).
Isso não é um bug a corrigir agora, mas deve ser documentado explicitamente.

FAZER: Adicionar comentário após o sync:
  await sequelize.sync({ force: true });
  // NOTA: sequelize.sync não cria constraints customizadas (ex: EXCLUDE USING gist em reservations).
  // A proteção de double-booking é testada via lógica de aplicação (checkReservationConflict.js).
  // Para testar a constraint de banco, seria necessário rodar db/schema.sql aqui.

═══════════════════════════════════════════════════════════
ADIÇÃO 1 — BAIXA PRIORIDADE: payments.test.js — aumentar cobertura
═══════════════════════════════════════════════════════════
Adicionar ao arquivo payments.test.js:

  describe('GET /payments/:id — erros', () => {
      it('retorna 404 para ID inexistente', async () => {
          const res = await request(app)
              .get('/payments/00000000-0000-0000-0000-000000000000')
              .set('Authorization', `Bearer ${jwt}`);
          expect(res.status).toBe(404);
      });
  });

  describe('DELETE /payments/:id', () => {
      it('remove pagamento (soft delete) e retorna 204', async () => {
          const createRes = await request(app)
              .post('/payments')
              .set('Authorization', `Bearer ${jwt}`)
              .send({ reservation_id: reservationId, amount: 50, method: 'DINHEIRO' });
          const res = await request(app)
              .delete(`/payments/${createRes.body.id}`)
              .set('Authorization', `Bearer ${jwt}`);
          expect(res.status).toBe(204);
      });
  });

═══════════════════════════════════════════════════════════
ADIÇÃO 2 — BAIXA PRIORIDADE: tenant-isolation.test.js — mutação cross-tenant
═══════════════════════════════════════════════════════════
Adicionar ao final do arquivo tenant-isolation.test.js:

  describe('Mutação cross-tenant bloqueada', () => {
      it('Tenant B recebe 404 ao tentar atualizar quarto do Tenant A via PUT', async () => {
          const res = await request(app)
              .put(`/rooms/${roomIdA}`)
              .set('Authorization', `Bearer ${jwtB}`)
              .send({ status: 'MAINTENANCE' });
          expect(res.status).toBe(404);
      });

      it('Tenant B recebe 404 ao tentar atualizar hóspede do Tenant A via PUT', async () => {
          const res = await request(app)
              .put(`/guests/${guestIdA}`)
              .set('Authorization', `Bearer ${jwtB}`)
              .send({ phone: '00000000000' });
          expect(res.status).toBe(404);
      });
  });

═══════════════════════════════════════════════════════════
FLUXO GIT OBRIGATÓRIO:
═══════════════════════════════════════════════════════════
1. git checkout develop && git pull origin develop
2. git checkout -b fix/tests-suite-corrections-15jun2026
3. Aplicar as correções acima na ordem de prioridade (Alta → Média → Baixa)
4. Rodar: npm test — confirmar que todos os testes passam
5. git add tests/
6. git commit -m "fix(tests): corrigir asserções frágeis e dependências de ordem na suite de integração"
7. git checkout develop && git merge fix/tests-suite-corrections-15jun2026
8. git push origin develop

RESTRIÇÕES ABSOLUTAS:
- Não altere nenhum arquivo fora de tests/
- Não altere controllers, models, routes, middlewares, helpers de app
- Não adicione dependências ao package.json
- Não altere vitest.config.js
- Cada correção deve manter o número total de testes igual ou maior — não remova testes
  (exceto o it() de 'cancela reserva CONFIRMED' que deve virar it.skip com comentário explicativo)

OUTPUT ESPERADO:
- Branch: fix/tests-suite-corrections-15jun2026
- npm test: todos os testes passam (verde)
- Relatório de sessão em docs/historico_sessao/<seu-dev>/<titulo>_15062026.md
```

---

## Checklist de aceite da correção

- [ ] `npm test` passa completamente (0 falhas)
- [ ] `helpers/auth.js` lança erro descritivo se register ou login falhar
- [ ] Nenhum `it()` atribui variáveis de que outros `it()` dependem (IDs em beforeAll)
- [ ] `expect([200, 422])` removido — nenhuma asserção aceita múltiplos status
- [ ] `rooms.test.js` não usa `toBe(2)` para contagem absoluta
- [ ] `globalSetup.js` tem comentário documentando a limitação do sync
- [ ] Branch em develop, push feito
- [ ] Relatório de sessão criado

---

*Documento gerado por Gabriel em 15/06/2026 — review pós-merge do commit `ae30d00`*
