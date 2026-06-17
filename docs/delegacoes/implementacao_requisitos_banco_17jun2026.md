# Prompt de Delegação — Implementação dos Requisitos de Banco de Dados
**Data:** 17/06/2026
**Para:** Agente IA (implementação)
**Contexto:** Projeto TCC — Sistema de Gestão de Hotel SaaS Multi-Tenant

---

## PROMPT PARA COPIAR E COLAR

```
Você é um dev senior especialista em banco de dados PostgreSQL trabalhando em um projeto acadêmico (TCC).

════════════════════════════════════════════════════════════
CONTEXTO DO PROJETO
════════════════════════════════════════════════════════════

Sistema: SaaS de gestão hoteleira multi-tenant
Stack: Node.js 24, Express 4, Sequelize 6, PostgreSQL 17, ESM (import/export, nunca require)
Repositório: /home/gabri/sistema_gestao_hotel (WSL Ubuntu)
Branch de trabalho: develop

O banco tem 8 tabelas: tenants, users, room_categories, rooms, guests, reservations, reservation_rooms, payments.
Todas as tabelas têm tenant_id (isolamento multi-tenant) e UUID como PK.

════════════════════════════════════════════════════════════
ESTADO ATUAL — O QUE JÁ EXISTE (NÃO RECRIAR)
════════════════════════════════════════════════════════════

Arquivos JÁ CRIADOS nesta sessão mas ainda não commitados (working tree):
- justificativa/arquitetura.md        → justificativa técnica + 1FN/2FN/3FN + tabela de índices
- modelagem/dicionario_dados.md       → dicionário de dados completo (8 tabelas)
- queries/crud.sql                    → operações CRUD comentadas
- queries/consultas_avancadas.sql     → 5 consultas com JOINs complexos e filtros por data

Arquivos JÁ COMMITADOS (não alterar conteúdo, apenas scripts/setup.sql tem bug):
- db/schema.sql                       → DDL oficial e correto (fonte de verdade)
- modelagem/DER.mmd                   → diagrama ER em formato Mermaid
- modelagem/diagrama_logico.md        → diagrama lógico em texto
- queries/queries.sql                 → queries originais (manter, não deletar)
- seed/seed_hotels.sql                → seed atual (~7 registros — precisa expansão)
- scripts/setup.sql                   → DDL alternativo (tem bug: usa 'hotels' em vez de 'tenants')

════════════════════════════════════════════════════════════
SUA TAREFA — 5 ITENS OBRIGATÓRIOS
════════════════════════════════════════════════════════════

Execute EXATAMENTE nesta ordem. Confirme cada item antes de avançar.

────────────────────────────────────────────────────────────
ITEM 1 — Criar queries/agregacoes.sql
────────────────────────────────────────────────────────────
Crie o arquivo queries/agregacoes.sql com EXATAMENTE 5 consultas de agregação,
todas comentadas explicando: o que faz, por que é importante e qual índice ela usa.

As 5 consultas obrigatórias são:

  1. Receita total por tenant agrupada por mês/ano
     - Usa: SUM(amount), date_trunc('month', paid_at), GROUP BY
     - Índice utilizado: tenant_id em payments
     - Por que importa: relatório financeiro mensal para o gestor do hotel

  2. Taxa de ocupação por data (% de quartos ocupados em um dia específico)
     - Usa: COUNT + ROUND + NULLIF, LEFT JOIN com filtro de período
     - Índice utilizado: idx_reservations_tenant_checkin
     - Por que importa: KPI operacional — mede eficiência do hotel

  3. Ranking de quartos mais reservados (por número de reservas)
     - Usa: COUNT(r.id), GROUP BY room_id, ORDER BY DESC, LIMIT
     - Faz JOIN com rooms e room_categories
     - Por que importa: identifica quartos de alta demanda para precificação

  4. Ticket médio por categoria de quarto
     - Usa: AVG(total_amount), GROUP BY category_id, JOIN com room_categories
     - Por que importa: análise de receita por segmento para decisão de preços

  5. Hóspedes com maior número de estadias (top 10 por tenant)
     - Usa: COUNT(reservations.id), GROUP BY guest_id, ORDER BY DESC, LIMIT 10
     - Faz JOIN com guests
     - Por que importa: identificar clientes recorrentes para programa de fidelidade

Formato de cada consulta:
  -- ====================================================
  -- CONSULTA N: [título]
  -- Importância: [por que é relevante para o negócio]
  -- Índice utilizado: [nome do índice ou coluna indexada]
  -- Parâmetros: $1 = tenant_id [, outros parâmetros]
  -- ====================================================
  [SQL aqui]

────────────────────────────────────────────────────────────
ITEM 2 — Expandir seed/seed_hotels.sql para 100+ registros
────────────────────────────────────────────────────────────
Substitua completamente o conteúdo de seed/seed_hotels.sql por um seed robusto
com MÍNIMO DE 120 registros distribuídos entre as 8 tabelas.

REGRAS OBRIGATÓRIAS para o seed:
  - Usar BEGIN; ... COMMIT; (transação única)
  - Usar INSERT com ON CONFLICT DO NOTHING em todas as inserções (idempotente)
  - Usar sub-SELECTs (SELECT id FROM tenants WHERE subdomain = '...') para
    referenciar IDs — NUNCA hardcode de UUID
  - Todos os dados devem ser fictícios mas coerentes com o domínio hoteleiro
  - O seed deve rodar sem erro em banco limpo E em banco já populado

DISTRIBUIÇÃO MÍNIMA exigida (contar como registros):

  Tenant 1 — "Hotel Aurora" (subdomain: aurora):
  - 1 registro em tenants
  - 3 categorias: Standard (R$150/noite, 2 pessoas), Suite (R$350/noite, 4 pessoas), Presidencial (R$800/noite, 6 pessoas)
  - 15 quartos: 8 Standard (101-108), 5 Suite (201-205), 2 Presidencial (301-302)
  - 3 usuários: 1 ADMIN + 2 RECEPTIONIST com password_hash = '$2b$10$placeholder.hash.for.seed.only'
  - 40 hóspedes com full_name, cpf único por tenant, phone, email
  - 25 reservas com datas variadas entre 2026-01-01 e 2027-12-31,
    status distribuído: 8 CHECKED_OUT, 5 CONFIRMED, 5 PENDING, 4 CHECKED_IN, 3 CANCELLED
  - 18 pagamentos vinculados às reservas CONFIRMED, CHECKED_IN e CHECKED_OUT

  Tenant 2 — "Pousada Sol" (subdomain: sol):
  - 1 registro em tenants
  - 2 categorias: Básico (R$120/noite, 2 pessoas), Conforto (R$220/noite, 3 pessoas)
  - 10 quartos: 7 Básico (1-7), 3 Conforto (8-10)
  - 2 usuários: 1 ADMIN + 1 RECEPTIONIST
  - 20 hóspedes (diferentes dos do Hotel Aurora)
  - 15 reservas com status distribuído
  - 10 pagamentos

  Total esperado: ≥ 120 registros somando todas as tabelas

ATENÇÃO — reservation_rooms:
  Não precisa popular reservation_rooms no seed (tabela de quartos extras).
  O campo room_id em reservations já cobre o quarto principal.

────────────────────────────────────────────────────────────
ITEM 3 — Corrigir scripts/setup.sql
────────────────────────────────────────────────────────────
O arquivo scripts/setup.sql está desatualizado: usa tabela 'hotels' e coluna 'hotel_id'
em vez de 'tenants' e 'tenant_id'. Ele também não tem soft delete nem os campos
deleted_at/updated_at em todas as tabelas.

Substitua o conteúdo COMPLETAMENTE, espelhando exatamente db/schema.sql
(que é a fonte de verdade), mas com comentários explicativos mais detalhados para fins acadêmicos.

O novo scripts/setup.sql deve ter:
  - As mesmas 8 tabelas de db/schema.sql com os mesmos nomes e colunas
  - Comentários em cada coluna explicando seu propósito
  - Os mesmos índices de db/schema.sql
  - Os mesmos triggers de db/schema.sql
  - Um cabeçalho explicando que este é o DDL de referência para setup de novos ambientes

────────────────────────────────────────────────────────────
ITEM 4 — Gerar imagens dos diagramas
────────────────────────────────────────────────────────────
O requisito acadêmico exige arquivos .png dos diagramas. Siga esta sequência:

PASSO 4a — Gerar modelagem/der.png a partir de modelagem/DER.mmd:
  Tente em ordem:
  1. npx @mermaid-js/mermaid-cli mmdc -i modelagem/DER.mmd -o modelagem/der.png
  2. Se npx não funcionar: npm install -g @mermaid-js/mermaid-cli && mmdc -i modelagem/DER.mmd -o modelagem/der.png
  3. Se nenhum funcionar: registre o erro e siga para 4b

PASSO 4b — Gerar modelagem/modelo_logico.png:
  O arquivo modelagem/diagrama_logico.md contém o modelo lógico em texto.
  Crie um arquivo modelagem/modelo_logico.mmd com o diagrama lógico em Mermaid,
  usando o formato erDiagram, incluindo as 8 tabelas com seus campos principais.
  Depois renderize: npx @mermaid-js/mermaid-cli mmdc -i modelagem/modelo_logico.mmd -o modelagem/modelo_logico.png

SE a geração de PNG falhar completamente por falta de ferramentas:
  Crie modelagem/INSTRUCOES_DIAGRAMAS.md com:
  - O conteúdo Mermaid dos dois diagramas (pronto para renderizar)
  - Instrução: "Abrir https://mermaid.live, colar o código, exportar como PNG e salvar como der.png / modelo_logico.png"
  - Não falhe o restante da implementação por causa das imagens

────────────────────────────────────────────────────────────
ITEM 5 — Commitar tudo e fazer push
────────────────────────────────────────────────────────────
Após concluir os 4 itens anteriores:

  git checkout develop
  git pull origin develop

  # Adicionar apenas os arquivos relevantes (nunca git add .)
  git add justificativa/arquitetura.md
  git add modelagem/dicionario_dados.md
  git add modelagem/der.png modelagem/modelo_logico.png       # se gerados
  git add modelagem/modelo_logico.mmd                         # se criado
  git add modelagem/INSTRUCOES_DIAGRAMAS.md                   # se gerado
  git add queries/crud.sql
  git add queries/consultas_avancadas.sql
  git add queries/agregacoes.sql
  git add seed/seed_hotels.sql
  git add scripts/setup.sql

  git commit -m "docs(db): implementar requisitos acadêmicos — dicionário, seed 120+ registros, queries e diagramas

  - justificativa/arquitetura.md: arquitetura, volume estimado, 1FN/2FN/3FN, índices
  - modelagem/dicionario_dados.md: dicionário completo das 8 tabelas
  - queries/crud.sql: operações CRUD comentadas
  - queries/consultas_avancadas.sql: 5 JOINs complexos com filtros de período
  - queries/agregacoes.sql: 5 agregações (receita, ocupação, ranking, ticket médio, fidelidade)
  - seed/seed_hotels.sql: expansão para 120+ registros em 2 tenants
  - scripts/setup.sql: corrigido hotels→tenants, sincronizado com db/schema.sql

  Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"

  git push origin develop

════════════════════════════════════════════════════════════
RESTRIÇÕES ABSOLUTAS — NÃO FAÇA
════════════════════════════════════════════════════════════

- NÃO altere db/schema.sql (é a fonte de verdade — não tocar)
- NÃO altere app/Controllers/, app/Models/, routes/, middlewares/
- NÃO altere nenhum arquivo de teste em tests/
- NÃO use git add . ou git add -A (pode incluir arquivos sensíveis)
- NÃO faça push para main (apenas develop)
- NÃO use UUIDs hardcoded no seed (use sub-SELECTs)
- NÃO crie arquivos fora das pastas: justificativa/, modelagem/, queries/, seed/, scripts/
- NÃO remova o arquivo queries/queries.sql original (apenas adicione os novos)
- NÃO instale dependências no package.json sem verificar se já existem

════════════════════════════════════════════════════════════
CRITÉRIOS DE ACEITE — VERIFICAR ANTES DE ENCERRAR
════════════════════════════════════════════════════════════

Execute cada verificação e confirme o resultado esperado:

  # 1. Seed tem 100+ registros? Contar linhas INSERT
  grep -c "^INSERT" seed/seed_hotels.sql
  # Esperado: número >= 100 (cada INSERT pode ter múltiplos VALUES, aceitar >= 15 INSERTs)

  # 2. scripts/setup.sql não tem mais referência a 'hotels'?
  grep -in "hotels\|hotel_id" scripts/setup.sql
  # Esperado: nenhuma ocorrência

  # 3. queries/agregacoes.sql tem 5 consultas?
  grep -c "^-- CONSULTA" queries/agregacoes.sql
  # Esperado: 5

  # 4. Todos os arquivos obrigatórios existem?
  ls justificativa/arquitetura.md modelagem/dicionario_dados.md queries/crud.sql queries/consultas_avancadas.sql queries/agregacoes.sql
  # Esperado: todos listados sem erro

  # 5. Working tree limpo após o commit?
  git status
  # Esperado: "nothing to commit, working tree clean"

  # 6. Push foi feito?
  git log origin/develop --oneline -3
  # Esperado: commit com mensagem "docs(db): implementar requisitos acadêmicos" no topo

════════════════════════════════════════════════════════════
OUTPUT ESPERADO AO FINAL
════════════════════════════════════════════════════════════

1. Arquivos criados/modificados commitados em develop e pushados para origin
2. Relatório de sessão em docs/historico_sessao/sirlande/requisitos_banco_17062026.md com:
   - O que foi feito (lista de arquivos)
   - Resultado dos 6 critérios de aceite acima (com a saída real dos comandos)
   - Problemas encontrados (ex: imagens não geradas) e como foram resolvidos
```

---

## Perguntas de Conferência — Para o Dev Sirlande fazer ao Agente

Após o agente finalizar, faça estas perguntas para confirmar que tudo foi realmente implementado. O agente deve responder com a **saída real dos comandos**, não com "foi feito".

---

### Grupo A — Verificação de Arquivos

**1.** Rode `ls -la queries/` e me mostre a saída. Eu quero ver os arquivos crud.sql, consultas_avancadas.sql, agregacoes.sql e queries.sql todos presentes.

**2.** Rode `wc -l seed/seed_hotels.sql` e me mostre quantas linhas tem o arquivo. Depois rode `grep -c "INSERT INTO" seed/seed_hotels.sql` e me mostre quantos INSERTs existem.

**3.** Rode `ls modelagem/` e confirme se der.png e modelo_logico.png existem. Se não existirem, mostre o conteúdo de modelagem/INSTRUCOES_DIAGRAMAS.md.

---

### Grupo B — Verificação de Conteúdo

**4.** Rode `grep -n "hotels\|hotel_id" scripts/setup.sql` e me mostre o resultado. A resposta correta é **nenhuma linha encontrada**.

**5.** Rode `grep "^-- CONSULTA" queries/agregacoes.sql` e liste os títulos das 5 consultas.

**6.** Rode `grep -c "tenant_id" scripts/setup.sql` e me mostre o número. Deve ser maior que 5 (uma por tabela que tem FK para tenants).

---

### Grupo C — Verificação do Git

**7.** Rode `git log origin/develop --oneline -5` e me mostre os últimos 5 commits. O commit `docs(db): implementar requisitos acadêmicos` deve aparecer no topo.

**8.** Rode `git status` e me confirme que o resultado é "nothing to commit, working tree clean".

**9.** O relatório de sessão foi criado? Rode `ls docs/historico_sessao/sirlande/` e me mostre o arquivo `requisitos_banco_17062026.md` na listagem.

---

### Grupo D — Verificação de Qualidade do Seed

**10.** Rode o comando abaixo e me mostre a saída:
```bash
grep "INSERT INTO tenants" seed/seed_hotels.sql
grep "INSERT INTO guests" seed/seed_hotels.sql | head -5
grep "INSERT INTO reservations" seed/seed_hotels.sql | head -5
```
Quero confirmar que os guests têm nomes fictícios reais (não "Hóspede 1", "Hóspede 2") e que as reservas têm datas variadas.

---

*Documento criado por Gabriel em 17/06/2026 — para delegação à Sirlande*
