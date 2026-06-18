# Sessão: README completo + fix auth multi-tenant

**Data:** 18/06/2026
**Dev:** Gabriel (orquestrador / Claude)
**Branch de trabalho:** develop
**Status ao fechar:** working tree limpo, develop pushed, PR a abrir manualmente

---

## O que foi feito nesta sessão

### 1. fix(db) — Divergência de FKs no diagrama_logico.md
**Commit:** `43a8726`

O agente BD havia apontado que as FKs `guest_id`, `room_id` e `user_id` da tabela `reservations` estavam descritas como `nullable + ON DELETE SET NULL` no `modelagem/diagrama_logico.md`, mas o `db/schema.sql` as define como `NOT NULL + ON DELETE RESTRICT`. Corrigido o arquivo de documentação para refletir o comportamento real do banco.

**Arquivo alterado:** `modelagem/diagrama_logico.md` (linhas 43–45)

---

### 2. docs(back) — Arquitetura do backend documentada
**Commit:** `10a7a53`

Criado `docs/back/arquitetura_backend.md` (239 linhas) explicando as 8 camadas do backend com motivação técnica de cada decisão:
- Entrypoints separados (`_web.js` vs `command.js`)
- Bootstrap como ponto único de inicialização
- Singleton de conexão com PostgreSQL (IIFE + module cache)
- Relations separadas dos Models (evita dependência circular)
- UUID PKs e soft delete nos Models
- Pipeline de middlewares (auth → role → controller)
- Dois níveis de routers (router.js + sub-routers por domínio)
- Um Controller por ação (SRP)
- Utils compartilhados (DRY)

---

### 3. fix(auth) — Vulnerabilidade de colisão de e-mail em login multi-tenant
**Commit:** `e3726e0`

O `LoginController` usava `findOne({ where: { email } })` quando nenhum subdomain era informado. Em ambiente SaaS, o mesmo e-mail pode existir em múltiplos hotéis — o `findOne` retornaria o primeiro resultado aleatoriamente, fazendo login no hotel errado.

**Solução implementada:**
- Com `subdomain`: busca o tenant primeiro, depois o user com `tenant_id` restrito (sem mudança de comportamento)
- Sem `subdomain`: `findAll({ where: { email } })` com detecção de ambiguidade:
  - 0 resultados → 401
  - 1 resultado → prossegue normalmente (backward compatible)
  - 2+ resultados → 409 `{ error: "...", requires: "subdomain" }`

**Arquivo alterado:** `app/Controllers/AuthApi/LoginController.js`

**Swagger atualizado:** `config/swagger.js` — resposta 409 documentada no `POST /auth/login`

---

### 4. test(auth) — 5 novos casos de teste para login multi-tenant
**Commit:** `6791ff1`

Adicionados ao `tests/auth.test.js`:
- Login com subdomain explícito correto → 200
- Login com subdomain inexistente → 401
- Novo `describe` "colisão de e-mail multi-tenant":
  - 409 sem subdomain quando e-mail existe em 2 hotéis
  - 200 com subdomain correto desambiguando tenant
  - JWT `tenantId` diferente para cada hotel (verificação real do payload)
  - 401 com subdomain de hotel que não existe

**Resultado da suite:** 84 passed, 1 skipped (85 total)

---

### 5. docs(readme) — README completamente reescrito
**Commit:** `298a99a`

README reescrito do zero em 4 blocos conceituais, cobrindo os 3 documentos de requisitos:

**Parte 1 — Sobre o Projeto**
- Identificação, Opção A (Docker), stack completa

**Parte 2 — Infraestrutura e Ambiente**
- Pré-requisitos WSL2
- Gestão de segredos (.env.example)
- How to Up em 6 passos (clone → .env → up → migrate → seed → verify)
- Detalhamento técnico: multi-stage build, Named Volumes, Custom Bridge Network, segurança

**Parte 3 — API e Backend**
- Swagger em http://localhost/api-docs
- JWT: como registrar, logar e usar o token (com exemplos de curl/body)
- Tabela completa de 35+ endpoints
- Máquinas de estado (reservas e quartos)
- Estrutura de pastas completa

**Parte 4 — Banco de Dados e Testes**
- Escolha PostgreSQL com justificativa técnica
- 8 tabelas com volume estimado
- Normalização (1FN/2FN/3FN)
- Índices (B-Tree, UNIQUE composto, EXCLUDE USING gist)
- Links para modelagem/, queries/
- Schema e migrations (docker exec)
- Seed: 165 registros, tabela de distribuição por hotel
- Testes: pré-requisitos, como rodar, cobertura dos 7 arquivos de teste

**Seções extras:**
- Evidências de Verificação (comandos para o avaliador)
- Troubleshooting (5 cenários documentados)
- Limpeza (`docker compose down -v`)

---

## Commits desta sessão

| Hash | Tipo | Descrição |
|---|---|---|
| `43a8726` | fix(db) | Corrigir divergência de FKs no diagrama_logico.md |
| `10a7a53` | docs(back) | Adicionar explicação da arquitetura do backend por camadas |
| `e3726e0` | fix(auth) | Fechar vulnerabilidade de colisão de e-mail em login multi-tenant |
| `6791ff1` | test(auth) | Cobrir cenários de login multi-tenant com subdomain |
| `298a99a` | docs(readme) | Reescrever README com 4 blocos conceituais |

---

## Estado do Git ao fechar

```
Branch: develop
Push: origin/develop atualizado (298a99a)
Working tree: limpo (apenas arquivos de outras sessões não comitados)
PR: a abrir manualmente (gh CLI sem autenticação no terminal WSL)
```

**Como abrir o PR:**

Acesse: https://github.com/gabrielreis354/sistema_hotel_prova/compare/main...develop

Título sugerido:
```
release: CorePMS — fix auth multi-tenant, docs backend e README completo
```

---

## Pendências para a próxima sessão

1. **Abrir PR develop → main** (Gabriel faz manualmente pelo GitHub)
2. **CI/CD pipeline** (`github/workflows/docker-ecr.yml`) — delegação para Weslley em `docs/delegacoes/implementacao_requisitos_infra_17jun2026.md`
3. **Working tree com muitas modificações não commitadas** — os outros devs (Sirlande, Weslley) têm modificações locais que precisam ser commitadas em branches próprias antes de merge em develop

---

*Relatório criado em 18/06/2026 — Gabriel (orquestrador / Claude)*
