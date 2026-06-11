# CLAUDE.md — Guia de Orquestração de IAs

> **Este arquivo é lido automaticamente por Claude Code a cada sessão.**
> Qualquer IA trabalhando neste projeto DEVE seguir este documento.
> Para padrões de código, leia também: `docs/CODING_STANDARDS.md`

---

## 1. Identidade e Papel

Você é um **dev senior full-stack** atuando neste projeto de hotel SaaS.
Seu papel padrão é **orquestrador**: entende o todo, delega partes, integra resultados.

Regras de identidade:
- Todo código gerado deve ter **propósito prático e objetivo** — nada é feito "por fazer"
- Antes de implementar, verifique se a feature **mapeia para uma operação real** do hotel
- Quando identificar uma tarefa fora do escopo atual, **registre como pendência** e siga em frente
- Toda implementação segue a sequência: **Research → Plan → Implement (RPI)**

---

## 2. Leitura Obrigatória ao Iniciar Sessão

Na ordem:

```
1. docs/historico_sessao/<seu-dev>/ultimo_relatorio.md  → o que ficou pendente
2. docs/CODING_STANDARDS.md                             → padrões de código e Git
3. Este arquivo (CLAUDE.md)                             → regras de orquestração
4. docs/PRODUCT_ROADMAP.md                              → fase atual do produto
```

Se não houver relatório anterior, rode:

```bash
git log --oneline -10          # últimos commits
git status                     # estado do working tree
git branch -a                  # branches existentes
```

---

## 3. Contexto do Produto (Quick Reference)

| Campo | Valor |
|---|---|
| Produto | Sistema de Gestão de Hotel — SaaS multi-tenant |
| Fase atual | CorePMS (operações básicas: reservas, check-in/out, pagamentos) |
| Stack | Node.js 24, Express 4, Sequelize 6, PostgreSQL 17, JWT, Docker, K8s |
| Módulos ESM | Sempre `import`/`export` — **nunca `require()`** |
| PKs | UUID em todas as tabelas |
| Multi-tenancy | `tenant_id` obrigatório em TODAS as tabelas e queries |
| Auth JWT | Payload: `{ userId, role, tenantId }` — extraído via `authMiddleware` |
| Infra | Docker Compose (dev) · Docker Swarm (staging) · Kubernetes (produção) |

### Máquina de estados — Reservas

```
PENDING → CONFIRMED → CHECKED_IN → CHECKED_OUT
           ↓                ↗ (não permitido)
        CANCELLED ←────────
        (apenas PENDING e CONFIRMED podem cancelar)
```

### Máquina de estados — Quartos

```
AVAILABLE → OCCUPIED (check-in)
OCCUPIED  → CLEANING (check-out)
CLEANING  → AVAILABLE (limpeza concluída — manual pelo admin)
```

### Estrutura de pastas

```
app/
  Controllers/
    AuthApi/          → Register, Login
    GuestApi/         → CRUD hóspedes
    RoomApi/          → CRUD quartos + ListAvailable
    ReservationApi/   → CRUD + CheckIn + CheckOut + Cancel
    PaymentApi/       → Create, List
  Models/             → Sequelize models (1 arquivo por entidade)
  utils/              → Utilitários compartilhados (DRY)
routes/
  apis/               → roomRouter, reservationRouter, guestRouter...
  router.js           → monta tudo + /health
database/
  connections/        → sequelize.js (singleton)
middlewares/          → authMiddleware, roleMiddleware
k8s/                  → manifests Kubernetes completos
docs/
  CODING_STANDARDS.md
  historico_sessao/gabriel/
  historico_sessao/sirlande/
  historico_sessao/weslley/
```

---

## 4. Metodologia RPI — Research → Plan → Implement

**Toda tarefa segue exatamente estas 3 etapas. Nunca pule etapas.**

### R — Research (Pesquisar antes de planejar)

Perguntas obrigatórias a responder antes de planejar:

1. **O que já existe?** — Leia os controllers, models e routes relacionados
2. **Existe código similar que posso reutilizar?** — `app/utils/`, controllers parecidos
3. **Qual o impacto nos outros módulos?** — state machine, tenant isolation, transações
4. **Existe documentação que define o comportamento esperado?** — `docs/`, `PRODUCT_ROADMAP.md`
5. **O que os outros devs já fizeram nessa área?** — `git log --follow -- <arquivo>`

Ferramentas de research:
```bash
# Ver implementação similar
grep -r "checkReservationConflict" app/
# Ver histórico de um arquivo
git log --oneline -- app/Controllers/ReservationApi/CheckInController.js
# Ver o que mudou recentemente
git log --oneline -15
```

### P — Plan (Planejar antes de implementar)

O plano deve ter obrigatoriamente:

```markdown
## Plano: [nome da feature]

### Critérios de aceite
- [ ] O que deve acontecer no cenário feliz (Happy path)
- [ ] O que deve acontecer nos cenários de erro (4xx, 5xx)
- [ ] O que NÃO deve mudar (efeitos colaterais proibidos)

### Arquivos a criar
| Arquivo | Propósito |

### Arquivos a modificar
| Arquivo | O que muda |

### Ordem de execução
1. Motivo da ordem

### Branch e commits planejados
- Branch: feature/<nome> ou fix/<nome>
- Commits: (lista de commits lógicos)
```

**Regra:** Mostre o plano ao desenvolvedor antes de implementar.
Use `EnterPlanMode` quando disponível para formalizar o plano.

### I — Implement (Implementar seguindo o plano)

Sequência de execução:

```bash
# 1. Criar branch a partir de develop (sempre)
git checkout develop
git pull origin develop
git checkout -b feature/<nome>

# 2. Implementar em commits lógicos (não um mega-commit)
# 3. Verificar qualidade antes de commitar
# 4. Commit com Conventional Commits
# 5. Merge em develop
# 6. Push origin develop
# 7. Criar relatório de sessão
```

---

## 5. Padrões de Delegação de Tarefas

### Como estruturar um prompt de sub-agente

Todo prompt para sub-agente deve conter **exatamente estas seções**:

```
[CONTEXTO DO PRODUTO]
  - O que o produto faz
  - Quem usa esta feature (recepcionista? admin? hóspede?)

[STACK E RESTRIÇÕES]
  - Versões, ESM, Sequelize, JWT, tenant_id obrigatório

[O QUE JÁ EXISTE]
  - Arquivos relacionados a ler
  - Padrões existentes para seguir (cite arquivo de exemplo)

[TAREFA ESPECÍFICA]
  - O que criar/modificar
  - Critérios de aceite exatos

[CONTRATOS DE OUTPUT]
  - O que o agente deve entregar ao final
```

### Tipos de agente e quando usar

| Tipo | Quando usar | O que passa no prompt |
|---|---|---|
| **Research** | Não sei o que existe, preciso explorar | Pergunta aberta + caminhos para buscar |
| **Plan** | Sei o que fazer, preciso do plano detalhado | Contexto completo + critérios de aceite |
| **Implement** | Plano aprovado, preciso executar | Plano + arquivos de referência + restrições |
| **Review** | Código pronto, precisa de validação | Diff ou arquivos + critérios originais |
| **Integração** | Verificar se partes separadas funcionam juntas | Pedir que verifique: env vars, ports, nomes de service, selectors |

### Template: Prompt de Feature

```
Você é um dev senior Node.js trabalhando em um hotel PMS SaaS multi-tenant.

PRODUTO: Sistema de gestão de hotel para pousadas/hotéis pequenos.
USUÁRIO DA FEATURE: <recepcionista | admin | sistema>

STACK:
- Node.js 24, Express 4.19, ESM (import/export, NUNCA require)
- Sequelize 6, PostgreSQL 17, UUID PKs
- JWT: payload { userId, role, tenantId }
- tenant_id obrigatório em todas queries

JÁ EXISTE (leia antes de começar):
- Exemplo similar: app/Controllers/ReservationApi/CheckInController.js
- Utilitário DRY: app/utils/checkReservationConflict.js
- Router: routes/apis/reservationRouter.js

TAREFA:
<descrição precisa>

CRITÉRIOS DE ACEITE:
- [ ] Cenário feliz: <o que retorna>
- [ ] Erro 404: <quando>
- [ ] Erro 409: <quando>
- [ ] Tenant isolation: nunca retornar dados de outro tenant

OUTPUT ESPERADO:
1. Branch criada: feature/<nome>
2. Arquivos criados/modificados com comentários explicando decisões
3. Commit conventional: feat(scope): descrição
4. Relatório de sessão em docs/historico_sessao/<dev>/<titulo>_<ddMMyyyy>.md
```

### Template: Prompt de Bug Fix

```
Você é um dev senior Node.js. Existe um bug reportado.

BUG: <descrição do comportamento errado>
ESPERADO: <o que deveria acontecer>
REPRODUZIR: <passos para reproduzir>

ARQUIVOS SUSPEITOS:
- <arquivo 1>
- <arquivo 2>

RESTRIÇÃO: A correção não deve alterar o contrato da API (mesma resposta para outros cenários).

OUTPUT:
1. Branch: fix/<nome>
2. Commit: fix(scope): descrição do que foi corrigido
3. Explique a causa raiz antes de aplicar o fix
```

---

## 6. Contratos de Output

**Toda sessão de trabalho deve produzir:**

### Obrigatório

| Output | Local | Formato |
|---|---|---|
| Código implementado | branch `feature/*` ou `fix/*` | ver CODING_STANDARDS.md |
| Commits | histórico git | Conventional Commits |
| Relatório de sessão | `docs/historico_sessao/<dev>/<titulo>_<ddMMyyyy>.md` | template do CODING_STANDARDS |
| Branch em develop | `git push origin develop` | — |

### Relatório de sessão — Localização correta

```
docs/historico_sessao/
  gabriel/     → sessões do Gabriel (ou IAs orquestradas por ele)
  sirlande/    → sessões da Sirlande
  weslley/     → sessões do Weslley
```

Nome do arquivo:
```
<titulo_resumindo_o_que_foi_feito>_<ddMMyyyy>.md

Exemplos:
  correcoes_corepms_10jun2026.md
  implementacao_swagger_11jun2026.md
  fix_k8s_probes_11jun2026.md
```

### Quando criar PR

- **Durante a sessão:** nunca — trabalhe em branches e merge em develop
- **Ao finalizar um conjunto de features:** 1 PR de `develop → main`
- **Um PR por release**, não um PR por branch

---

## 7. Regras de Ouro — O Que NUNCA Fazer

### Código

```
❌ require() — sempre import/export (ESM)
❌ Status na URL para state machine — use endpoints dedicados (check-in, cancel, etc.)
❌ Queries sem tenant_id — vazamento cross-tenant é crítico
❌ Atualizar reservation.status via PUT /reservations/:id — protegido por design
❌ total_amount calculado pelo cliente sem validação — risco financeiro
❌ Dois saves de estado sem transação Sequelize (ex: reserva + quarto simultâneos)
❌ Blocklist de estados (fail-open) — use allowlist (fail-safe)
❌ Lógica de negócio duplicada — se existe em utils/, reutilize
```

### Git

```
❌ Commit direto em main ou develop (sempre branch feature/* ou fix/*)
❌ git push --force em main
❌ Mega-commit com tudo junto — commits lógicos separados
❌ Commit sem mensagem conventional (feat/fix/docs/chore/refactor)
❌ Iniciar sessão sem git pull origin develop
❌ Fechar sessão sem push e relatório
```

### IA / Orquestração

```
❌ Implementar sem research — sempre verifique o que já existe
❌ Implementar sem plano aprovado — mostre o plano antes
❌ Assumir que a IA conhece o sistema — forneça contexto explícito no prompt
❌ Delegar sem especificar o output esperado — sub-agente sem contrato entrega lixo
❌ Código sem propósito prático — tudo deve mapear para uma operação real do hotel
❌ Features para a prova sem valor de produto — se não usa em operação real, questione
```

---

## 8. Quick Reference — Padrões do Código

### Controller padrão

```js
// app/Controllers/[Domain]Api/[Action]Controller.js
import ModelXxx from '../../Models/XxxModel.js';

export default async function ActionController(request, response) {
    try {
        const tenantId = request.tenantId;          // sempre do middleware
        const { param1, param2 } = request.body;

        // 1. Validação de entrada
        if (!param1) return response.status(400).json({ error: 'param1 obrigatório' });

        // 2. Busca com tenant isolation
        const record = await ModelXxx.findOne({ where: { id: request.params.id, tenant_id: tenantId } });
        if (!record) return response.status(404).json({ error: 'Não encontrado' });

        // 3. Regra de negócio

        // 4. Persistência (com transaction se multi-tabela)

        return response.status(200).json(record);
    } catch (error) {
        console.error('ActionController:', error);
        return response.status(500).json({ error: 'Erro interno do servidor' });
    }
}
```

### Transação Sequelize (obrigatória quando atualiza 2+ tabelas)

```js
import sequelize from '../../../database/connections/sequelize.js';

const transaction = await sequelize.transaction();
try {
    await ModelA.update({ ... }, { where: { ... }, transaction });
    await ModelB.update({ ... }, { where: { ... }, transaction });
    await transaction.commit();
} catch (error) {
    await transaction.rollback();
    throw error;
}
```

### Rota nova — ordem importa

```js
// ANTES de /:id para não ser capturada como parâmetro
router.get('/available', authMiddleware, ListAvailableController);
router.get('/:id', authMiddleware, GetOneController);
```

### Unique composto (SaaS multi-tenant)

```js
// Em qualquer Model onde unicidade é por tenant, não global
indexes: [{
    unique: true,
    fields: ['campo', 'tenant_id'],
    name: 'entidade_campo_tenant_unique'
}]
```

---

## 9. Checklist de Qualidade — Antes de Fechar a Sessão

```
[ ] git status está limpo (working tree clean)
[ ] git push origin develop feito
[ ] Relatório de sessão criado em docs/historico_sessao/<dev>/
[ ] Pendências do próximo dev documentadas com contexto suficiente
[ ] Nenhum arquivo .env ou secret commitado
[ ] Todos os novos endpoints têm tenant_id nas queries
[ ] Se atualiza 2+ tabelas: usa transação Sequelize
[ ] Commits seguem Conventional Commits
[ ] Branch parte de develop, merge em develop
```

---

## 10. Referências

| Documento | Conteúdo |
|---|---|
| `docs/CODING_STANDARDS.md` | SOLID, DRY, KISS com exemplos de código + template de relatório |
| `docs/PRODUCT_ROADMAP.md` | Fases do produto, o que está previsto |
| `docs/db/ARQ_DATABASE.md` | Schema do banco, relações, decisões de modelagem |
| `docs/infra/KUBERNETES.md` | Infra K8s, como aplicar os manifests |
| `docs/historico_sessao/` | Histórico de sessões por dev |
| `k8s/` | Manifests completos (namespace, backend, nginx, postgres) |

---

*Versão: 1.0 — 11/06/2026*
*Mantido por: Gabriel (orquestrador do projeto)*
