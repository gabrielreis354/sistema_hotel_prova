# Sistema de Gestão de Hotel — Backend API

> Projeto Acadêmico (TCC) — Unifaat 2026
> API REST multi-tenant para gerenciamento hoteleiro.
> Infraestrutura: **Opção A — Docker/Orquestração Local**

---

## Índice

- [Parte 1 — Sobre o Projeto](#parte-1--sobre-o-projeto)
- [Parte 2 — Infraestrutura e Ambiente](#parte-2--infraestrutura-e-ambiente)
  - [Pré-requisitos](#pré-requisitos)
  - [Gestão de Segredos](#gestão-de-segredos-e-configurações)
  - [Como Subir o Ambiente](#como-subir-o-ambiente-how-to-up)
  - [Detalhamento Técnico da Infraestrutura](#detalhamento-técnico-da-infraestrutura)
- [Parte 3 — API e Backend](#parte-3--api-e-backend)
  - [Documentação Swagger](#documentação-swagger)
  - [Autenticação JWT](#autenticação-jwt)
  - [Entidades e Rotas](#entidades-e-rotas)
  - [Estrutura do Projeto](#estrutura-do-projeto)
- [Parte 4 — Banco de Dados e Testes](#parte-4--banco-de-dados-e-testes)
  - [Banco de Dados](#banco-de-dados)
  - [Schema e Migrations](#schema-e-migrations)
  - [Dados de Teste (Seed)](#dados-de-teste-seed)
  - [Testes Automatizados](#testes-automatizados)
- [Evidências de Verificação](#evidências-de-verificação)
- [Troubleshooting](#troubleshooting)
- [Limpeza após Avaliação](#limpeza-após-avaliação)

---

# Parte 1 — Sobre o Projeto

## O que é este sistema

Sistema de gestão hoteleira **SaaS multi-tenant**: múltiplos hotéis utilizam a mesma plataforma de forma completamente isolada. Cada hotel (tenant) gerencia seus próprios quartos, hóspedes, reservas e pagamentos sem acesso aos dados dos demais.

**Funcionalidades principais:**

- Cadastro de hotéis e autenticação de usuários por estabelecimento
- Gerenciamento de quartos por categoria (Standard, Luxo, Suíte, etc.)
- Controle de reservas com máquina de estados protegida
- Check-in e check-out com atualização automática do status do quarto
- Registro de pagamentos vinculados às reservas
- Documentação interativa completa via Swagger

## Stack tecnológica

| Camada | Tecnologia | Versão |
|---|---|---|
| Runtime | Node.js (ESModules) | 24 |
| Framework HTTP | Express | 4 |
| ORM | Sequelize | 6 |
| Banco de Dados | PostgreSQL | 17 |
| Autenticação | JWT (jsonwebtoken) | — |
| Hash de senhas | bcryptjs | — |
| Documentação API | Swagger (OpenAPI 3.0) | — |
| Proxy Reverso | Nginx | 1.27-alpine |
| Cache | Redis | 7-alpine |
| Infraestrutura | Docker + Docker Compose | V2 |

## Infraestrutura — Opção A: Docker/Orquestração Local

Este projeto adota a **Opção A** do Guia de Avaliação Técnica de Infraestrutura, com arquitetura de contêineres Docker gerenciada por Docker Compose. A escolha garante portabilidade total do ambiente entre máquinas de desenvolvimento e permite evolução para orquestração em cluster (Docker Swarm) sem alteração do código.

---

# Parte 2 — Infraestrutura e Ambiente

## Pré-requisitos

Ferramentas necessárias no ambiente WSL2/Linux:

| Ferramenta | Para que serve | Como verificar |
|---|---|---|
| Docker Desktop | Executar os contêineres | `docker --version` |
| Docker Compose V2 | Orquestrar os serviços | `docker compose version` |
| Git | Clonar o repositório | `git --version` |

> Node.js **não precisa** estar instalado localmente. Toda execução da aplicação ocorre dentro dos contêineres Docker.

---

## Gestão de Segredos e Configurações

> **AVISO DE SEGURANÇA:** Nunca commite o arquivo `.env` ou senhas reais no repositório. O `.env` está listado no `.gitignore` e nunca chegará ao GitHub.

O projeto usa variáveis de ambiente para todas as credenciais. Copie o arquivo de exemplo:

```bash
cp .env.example .env
```

Variáveis disponíveis:

| Variável | Descrição | Valor padrão (desenvolvimento) |
|---|---|---|
| `POSTGRES_DB` | Nome do banco de dados | `gestao_hotel` |
| `POSTGRES_USER` | Usuário do PostgreSQL | `hotel_user` |
| `POSTGRES_PASSWORD` | Senha do PostgreSQL | `hotel_password` |
| `POSTGRES_HOST` | Host do banco (nome do serviço Docker) | `postgres` |
| `POSTGRES_PORT` | Porta do PostgreSQL | `5432` |
| `JWT_SECRET` | Chave secreta para assinar tokens JWT | altere em produção |
| `NODE_WEB_PORT` | Porta interna do servidor Node.js | `3000` |
| `REDIS_URL` | URL de conexão com o Redis | `redis://redis:6379` |

Os valores padrão funcionam para desenvolvimento local sem alteração.

---

## Como Subir o Ambiente (How to Up)

Siga os passos na ordem. Do zero ao sistema funcionando em menos de 5 minutos.

### Passo 1 — Clonar o repositório

```bash
git clone https://github.com/gabrielreis354/sistema_hotel_prova.git
cd sistema_hotel_prova
```

### Passo 2 — Configurar variáveis de ambiente

```bash
cp .env.example .env
```

Os valores padrão já funcionam para desenvolvimento. Em produção, altere `JWT_SECRET` e `POSTGRES_PASSWORD` para valores seguros.

### Passo 3 — Subir todos os contêineres

```bash
docker compose up -d --build
```

Este comando executa:
1. Build da imagem Node.js (multi-stage: deps → runner)
2. Inicialização dos 4 serviços: `postgres`, `redis`, `node_web`, `nginx`
3. Aguarda PostgreSQL e Redis ficarem saudáveis antes de liberar o Node.js

Verifique se todos os contêineres estão rodando:

```bash
docker compose ps
```

Resultado esperado:

```
NAME             STATUS
hotel_nginx      Up
hotel_node       Up
hotel_postgres   Up (healthy)
hotel_redis      Up (healthy)
```

### Passo 4 — Executar as migrations

Com os contêineres rodando, crie todas as tabelas no banco:

```bash
docker compose exec node_web node command.js migrate
```

Saída esperada:

```
✅ Conexão com o banco de dados estabelecida.
✅ Migrations executadas com sucesso. Todas as tabelas estão atualizadas.
```

### Passo 5 — (Opcional) Popular com dados de exemplo

```bash
docker compose exec postgres psql -U hotel_user -d gestao_hotel \
  -f /dev/stdin < seed/seed_hotels.sql
```

Cria 165 registros distribuídos entre 2 hotéis (Hotel Aurora e Pousada Sol) com quartos, hóspedes, reservas e pagamentos prontos para uso.

### Passo 6 — Verificar o sistema

```bash
curl http://localhost/health
```

Resposta esperada:

```json
{ "status": "OK", "timestamp": "...", "service": "Sistema de Gestão de Hotel Backend" }
```

Acesse a documentação completa da API em: **http://localhost/api-docs**

---

## Detalhamento Técnico da Infraestrutura

### Serviços e Contêineres

| Serviço | Imagem | Porta no Host | Porta Interna | Função |
|---|---|---|---|---|
| `postgres` | postgres:17 | — (isolado) | 5432 | Banco de dados relacional |
| `redis` | redis:7-alpine | — (isolado) | 6379 | Cache (3ª camada obrigatória) |
| `node_web` | build local | — (isolado) | 3000 | API REST Node.js |
| `nginx` | nginx:1.27-alpine | **80** | 80 | Proxy reverso — único ponto de entrada |

### Arquitetura de Rede

```
Internet / Host (localhost)
        |
     porta 80
        |
    [ Nginx ]  ←── único serviço exposto ao host
        |
    hotel_network (Custom Bridge — isolada)
        |
   [ node_web:3000 ]
        |            |
[ postgres:5432 ]  [ redis:6379 ]
```

`node_web`, `postgres` e `redis` **não possuem portas expostas ao host**. O banco de dados é inacessível diretamente pela internet — acessível apenas dentro da rede `hotel_network`.

### Otimização da Imagem Docker

O `Dockerfile` usa **Multi-stage Build** com dois estágios:

```
Estágio deps   → node:24-alpine  |  npm ci --omit=dev  (apenas produção)
Estágio runner → node:24-alpine  |  copia node_modules e código-fonte
```

Benefícios:
- Imagem final **sem ferramentas de build** (npm, compiladores, cache)
- Node.js 24 Alpine (~50 MB vs ~900 MB do node:24 padrão)
- Execução como usuário não-root (`USER node`) — sem privilégios de root no contêiner
- `.dockerignore` exclui: `node_modules`, `tests`, `docs`, `k8s`, `.git`, `.env`, `*.md`

### Persistência de Dados (Named Volumes)

| Volume | O que persiste |
|---|---|
| `postgres_data` | Banco de dados PostgreSQL completo |
| `redis_data` | Cache Redis com AOF (append-only file) ativado |

Named Volumes são gerenciados pelo Docker daemon. Os dados **sobrevivem** a `docker compose down` e à remoção de contêineres. Somente `docker compose down -v` apaga os dados.

### Rede e Comunicação (Custom Bridge com DNS Interno)

Todos os serviços pertencem à rede `hotel_network` (driver: `bridge`). A comunicação ocorre por **nome de serviço** — nunca por IP estático.

```bash
# node_web conecta ao banco por nome, não por IP:
POSTGRES_HOST=postgres        # resolve internamente
REDIS_URL=redis://redis:6379  # resolve internamente

# Provar a resolução DNS:
docker compose exec node_web ping -c 2 postgres
docker compose exec node_web ping -c 2 redis
```

### Segurança

| Medida | Implementação |
|---|---|
| Credenciais fora do código | Variáveis de ambiente via `.env` — nunca hardcoded |
| `.env` no `.gitignore` | Senhas nunca chegam ao repositório |
| Usuário não-root | `USER node` no Dockerfile |
| Banco isolado | `postgres` sem porta exposta ao host |
| Cache isolado | `redis` sem porta exposta ao host |
| JWT rotacionável | `JWT_SECRET` via variável de ambiente |
| Multi-tenancy | `tenant_id` em todas as tabelas e queries — dados de hotéis nunca se cruzam |

---

# Parte 3 — API e Backend

## Documentação Swagger

A documentação interativa de todos os endpoints está disponível em:

> **http://localhost/api-docs**

Contém todas as rotas documentadas com schemas de requisição/resposta, exemplos de payload e autenticação JWT configurável diretamente na interface (botão **Authorize**).

---

## Autenticação JWT

### Passo 1 — Criar um hotel e usuário administrador

```bash
POST http://localhost/auth/register
Content-Type: application/json

{
  "tenantName": "Hotel Paraíso",
  "name": "Administrador",
  "email": "admin@paraiso.com",
  "password": "senha123"
}
```

Resposta `201`:

```json
{
  "tenant": { "id": "uuid", "name": "Hotel Paraíso", "subdomain": "hotel-paraiso" },
  "user":   { "id": "uuid", "name": "Administrador", "email": "admin@paraiso.com", "role": "ADMIN" }
}
```

### Passo 2 — Fazer login e obter o token JWT

```bash
POST http://localhost/auth/login
Content-Type: application/json

{
  "email": "admin@paraiso.com",
  "password": "senha123",
  "subdomain": "hotel-paraiso"
}
```

> O campo `subdomain` é recomendado em ambientes multi-tenant. Se o mesmo e-mail existir em dois hotéis diferentes, o sistema retorna `409` e exige o subdomain para identificar corretamente o hotel.

Resposta `200`:

```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user":  { "id": "uuid", "name": "Administrador", "email": "admin@paraiso.com", "role": "ADMIN" }
}
```

O token carrega o payload `{ userId, role, tenantId }` com validade de **8 horas**.

### Passo 3 — Usar o token nas requisições

Todas as rotas (exceto `/auth/register` e `/auth/login`) exigem o header:

```
Authorization: Bearer <token_aqui>
```

**No Swagger:** clique em **Authorize** (canto superior direito) → cole o token → confirme. Todas as requisições subsequentes serão autenticadas automaticamente.

**No Insomnia/Postman:** adicione o header `Authorization: Bearer <token>` em cada requisição ou configure-o como variável de ambiente no workspace.

---

## Entidades e Rotas

### Tabela completa de endpoints

| Recurso | Método | Rota | Função |
|---|---|---|---|
| **Auth** | POST | `/auth/register` | Cria hotel + usuário admin |
| | POST | `/auth/login` | Retorna token JWT |
| **Usuários** | GET | `/users` | Lista usuários do hotel |
| | GET | `/users/:id` | Busca usuário por ID |
| | POST | `/users` | Cria usuário |
| | PUT | `/users/:id` | Atualiza usuário |
| | DELETE | `/users/:id` | Remove usuário (soft delete) |
| **Categorias** | GET | `/room-categories` | Lista categorias |
| | GET | `/room-categories/:id` | Busca categoria |
| | POST | `/room-categories` | Cria categoria |
| | PUT | `/room-categories/:id` | Atualiza categoria |
| | DELETE | `/room-categories/:id` | Remove categoria |
| **Quartos** | GET | `/rooms` | Lista quartos |
| | GET | `/rooms/:id` | Busca quarto |
| | GET | `/rooms/available` | Lista quartos disponíveis no período (`?check_in=&check_out=`) |
| | POST | `/rooms` | Cria quarto |
| | PUT | `/rooms/:id` | Atualiza quarto |
| | DELETE | `/rooms/:id` | Remove quarto |
| **Hóspedes** | GET | `/guests` | Lista hóspedes |
| | GET | `/guests/:id` | Busca hóspede |
| | POST | `/guests` | Cadastra hóspede |
| | PUT | `/guests/:id` | Atualiza hóspede |
| | DELETE | `/guests/:id` | Remove hóspede |
| **Reservas** | GET | `/reservations` | Lista reservas |
| | GET | `/reservations/:id` | Busca reserva |
| | POST | `/reservations` | Cria reserva |
| | PUT | `/reservations/:id` | Atualiza reserva |
| | DELETE | `/reservations/:id` | Remove reserva (admin) |
| **Estados** | PUT | `/reservations/:id/check-in` | Realiza check-in |
| | PUT | `/reservations/:id/check-out` | Realiza check-out |
| | PUT | `/reservations/:id/cancel` | Cancela reserva |
| **Pivô N:N** | POST | `/reservations/:id/rooms` | Adiciona quarto extra à reserva |
| | DELETE | `/reservations/:id/rooms/:roomId` | Remove quarto da reserva |
| **Pagamentos** | GET | `/payments` | Lista pagamentos |
| | GET | `/payments/:id` | Busca pagamento |
| | POST | `/payments` | Registra pagamento |
| | PUT | `/payments/:id` | Atualiza pagamento |
| | DELETE | `/payments/:id` | Remove pagamento |

### Máquina de estados — Reservas

```
PENDING ──► CONFIRMED ──► CHECKED_IN ──► CHECKED_OUT
   │              │
   └──► CANCELLED ◄┘
   (apenas PENDING e CONFIRMED podem ser canceladas)
```

### Máquina de estados — Quartos

```
AVAILABLE ──► OCCUPIED  (no check-in)
OCCUPIED  ──► CLEANING  (no check-out)
CLEANING  ──► AVAILABLE (limpeza concluída — via PUT /rooms/:id)
```

---

## Estrutura do Projeto

```
sistema_gestao_hotel/
│
├── _web.js                   # Entrypoint HTTP — inicia o servidor Express
├── command.js                # Entrypoint CLI  — node command.js migrate
│
├── bootstrap/
│   ├── app.js                # Inicialização: dotenv + relações Sequelize
│   └── config.js             # Constantes globais
│
├── app/
│   ├── Controllers/          # Um arquivo por ação (Princípio da Responsabilidade Única)
│   │   ├── AuthApi/          #   Register, Login
│   │   ├── GuestApi/         #   CRUD de hóspedes
│   │   ├── PaymentApi/       #   CRUD de pagamentos
│   │   ├── ReservationApi/   #   CRUD + CheckIn + CheckOut + Cancel + Pivot
│   │   ├── RoomApi/          #   CRUD + ListAvailable
│   │   ├── RoomCategoryApi/  #   CRUD de categorias
│   │   └── UserApi/          #   CRUD de usuários
│   ├── Models/               # Modelos Sequelize (8 tabelas)
│   └── utils/                # Utilitários compartilhados (DRY)
│
├── database/
│   ├── connections/          # Singleton de conexão com PostgreSQL
│   └── relations.js          # Associações entre modelos (hasMany, belongsTo, etc.)
│
├── middlewares/              # authMiddleware · roleMiddleware · tenantMiddleware
│
├── routes/
│   ├── router.js             # Router principal (monta todos os sub-routers)
│   └── apis/                 # Sub-routers por domínio
│
├── config/swagger.js         # Especificação OpenAPI 3.0
│
├── Dockerfile                # Multi-stage build (deps + runner)
├── docker-compose.yml        # 4 serviços: postgres, redis, node_web, nginx
├── .dockerignore             # Exclui arquivos desnecessários do build
├── .env.example              # Template de variáveis de ambiente (sem valores reais)
│
├── db/schema.sql             # Schema SQL completo — fonte de verdade do banco
├── scripts/setup.sql         # DDL de referência comentado (fins acadêmicos)
├── seed/seed_hotels.sql      # 165 registros de exemplo (2 hotéis)
│
├── queries/
│   ├── crud.sql              # Consultas CRUD com isolamento multi-tenant
│   ├── consultas_avancadas.sql # 5 JOINs complexos
│   └── agregacoes.sql        # 5 consultas de agregação (relatórios)
│
├── modelagem/
│   ├── der.png               # Diagrama Entidade-Relacionamento (DER)
│   ├── modelo_logico.png     # Diagrama Lógico
│   └── dicionario_dados.md   # Dicionário de dados completo
│
├── justificativa/
│   └── arquitetura.md        # Justificativa técnica da escolha do banco
│
├── docs/                     # Documentação técnica e histórico de sessões
└── tests/                    # Suite de testes de integração (Vitest + Supertest)
```

---

# Parte 4 — Banco de Dados e Testes

## Banco de Dados

### Escolha tecnológica

**Tipo:** SQL relacional
**Provedor:** PostgreSQL 17

**Justificativa:** O sistema gerencia entidades fortemente relacionadas (reservas vinculam hóspedes, quartos, usuários e pagamentos) e opera em modelo multi-tenant com exigência de isolamento garantido por constraints. PostgreSQL oferece integridade referencial nativa via chaves estrangeiras, suporte a UUID como chave primária, índices compostos para multi-tenancy e a constraint `EXCLUDE USING gist` para impedir double-booking no nível do banco. A análise completa está em `justificativa/arquitetura.md`.

### Requisitos do sistema

| Item | Valor |
|---|---|
| Objetivo | Gerenciar reservas hoteleiras em modelo SaaS multi-tenant |
| Principais entidades | Tenant, User, RoomCategory, Room, Guest, Reservation, ReservationRoom, Payment |
| Volume estimado | ~15.000 reservas/ano (10 tenants × 1.500 reservas) |
| Usuários estimados | ~50 usuários simultâneos (recepcionistas + administradores) |
| Consultas principais | Disponibilidade de quartos por período, painel de check-in/out, relatório financeiro, histórico de hóspede |

### Estrutura do banco — 8 tabelas

| Tabela | Descrição | Chave primária |
|---|---|---|
| `tenants` | Hotel (raiz do sistema SaaS) | UUID |
| `users` | Usuários do hotel (ADMIN ou RECEPTIONIST) | UUID |
| `room_categories` | Categorias de quartos com preço por noite | UUID |
| `rooms` | Quartos físicos com status operacional | UUID |
| `guests` | Hóspedes cadastrados | UUID |
| `reservations` | Reservas de hospedagem com máquina de estados | UUID |
| `reservation_rooms` | Tabela pivô — relação N:N entre reservas e quartos | UUID |
| `payments` | Pagamentos vinculados às reservas | UUID |

Todas as tabelas possuem `tenant_id` como chave estrangeira para isolamento multi-tenant e `deleted_at` para soft delete (dados financeiros nunca são apagados fisicamente).

### Normalização

| Forma Normal | Status | Evidência |
|---|---|---|
| **1FN** | Atendida | Todos os atributos são atômicos; sem grupos repetitivos |
| **2FN** | Atendida | Todas as colunas dependem da chave primária completa (UUID) |
| **3FN** | Atendida | Sem dependências transitivas entre atributos não-chave |
| **Desnormalização intencional** | `tenant_id` em `payments` | Acelera relatórios financeiros sem JOIN adicional com `reservations` |

Análise completa com exemplos em `justificativa/arquitetura.md`.

### Índices

| Tabela | Campo(s) | Tipo | Motivo |
|---|---|---|---|
| `users` | `(email, tenant_id)` | B-Tree UNIQUE | Login multi-tenant sem colisão de e-mail |
| `guests` | `(cpf, tenant_id)` | B-Tree UNIQUE | CPF único por hotel (não global) |
| `tenants` | `subdomain` | B-Tree UNIQUE | Identificação de hotel no login |
| `reservations` | `tenant_id` | B-Tree | Filtro de isolamento em todas as queries |
| `reservations` | `(room_id, check_in_date, check_out_date)` | EXCLUDE USING gist | Impede double-booking no nível do banco |
| `reservations` | `check_in_date` | B-Tree | Painel diário de check-ins |
| `payments` | `reservation_id` | B-Tree | Relatório financeiro por reserva |

### Modelagem visual

Os diagramas estão em `modelagem/`:

| Arquivo | Conteúdo |
|---|---|
| `modelagem/der.png` | Diagrama Entidade-Relacionamento (DER) |
| `modelagem/modelo_logico.png` | Diagrama Lógico com PK/FK/UK |
| `modelagem/dicionario_dados.md` | Dicionário completo: tipo, constraint e descrição de cada coluna |

### Consultas críticas

As consultas estão organizadas em `queries/`:

| Arquivo | Consultas |
|---|---|
| `queries/crud.sql` | CRUD completo de todas as entidades com isolamento por `tenant_id` |
| `queries/consultas_avancadas.sql` | 5 JOINs complexos: painel de check-in/out, histórico de hóspede com saldo, busca por CPF, detecção de conflito de datas |
| `queries/agregacoes.sql` | 5 agregações: receita por mês, taxa de ocupação, ranking de quartos, ticket médio por categoria, top 10 hóspedes |

---

## Schema e Migrations

O schema completo está em `db/schema.sql`. Para criar ou atualizar todas as tabelas:

```bash
# Via Docker (recomendado — não requer Node.js local)
docker compose exec node_web node command.js migrate

# Local (requer Node.js 24)
node command.js migrate
```

O comando usa `sequelize.sync({ alter: true })` — cria tabelas inexistentes e adiciona colunas novas sem derrubar dados existentes.

Para recriar o banco do zero a partir do schema SQL:

```bash
docker compose exec postgres psql -U hotel_user -d gestao_hotel -f /dev/stdin < scripts/setup.sql
```

---

## Dados de Teste (Seed)

O arquivo `seed/seed_hotels.sql` cria **165 registros** distribuídos entre 2 hotéis:

| Tabela | Hotel Aurora | Pousada Sol | Total |
|---|---|---|---|
| `tenants` | 1 | 1 | **2** |
| `room_categories` | 3 | 2 | **5** |
| `rooms` | 15 | 10 | **25** |
| `users` | 3 | 2 | **5** |
| `guests` | 40 | 20 | **60** |
| `reservations` | 25 | 15 | **40** |
| `payments` | 18 | 10 | **28** |

Distribuição de status das reservas (Hotel Aurora): 8 CHECKED_OUT · 5 CONFIRMED · 5 PENDING · 4 CHECKED_IN · 3 CANCELLED.

**Executar o seed:**

```bash
docker compose exec postgres psql -U hotel_user -d gestao_hotel \
  -f /dev/stdin < seed/seed_hotels.sql
```

O seed é **idempotente** — pode ser executado múltiplas vezes sem duplicar registros (usa `ON CONFLICT DO NOTHING`).

---

## Testes Automatizados

A suite usa **Vitest + Supertest** com PostgreSQL real (banco separado `gestao_hotel_test`). Os testes não usam mocks — exercitam rotas HTTP reais, JWT real e transações reais no banco.

### Pré-requisitos para rodar os testes

O PostgreSQL precisa estar acessível em `localhost:5432`. Com o ambiente Docker rodando, exponha a porta temporariamente no `docker-compose.yml`:

```yaml
postgres:
  ports:
    - "5432:5432"
```

E reinicie o serviço:

```bash
docker compose up -d postgres
```

### Executar os testes

```bash
# Requer Node.js 24 — use nvm se necessário
nvm use 24

# Rodar suite completa
npm test
```

O `globalSetup` cria automaticamente o banco `gestao_hotel_test` e sincroniza o schema. Nenhuma configuração manual é necessária.

Resultado esperado:

```
Test Files  7 passed (7)
     Tests  84 passed | 1 skipped (85)
```

### Cobertura dos testes

| Arquivo | O que valida |
|---|---|
| `auth.test.js` | Registro, login, JWT, colisão de e-mail multi-tenant, desambiguação por subdomain |
| `rooms.test.js` | CRUD de quartos, disponibilidade por período, conflito de datas |
| `guests.test.js` | CRUD de hóspedes, soft delete |
| `reservations.test.js` | CRUD, máquina de estados (check-in/out/cancel), conflito de reservas |
| `payments.test.js` | CRUD de pagamentos, soft delete |
| `room-categories.test.js` | CRUD de categorias |
| `tenant-isolation.test.js` | Garante que Tenant B nunca acessa dados do Tenant A |

---

# Evidências de Verificação

Comandos para validar o sistema em execução:

```bash
# 1. Verificar todos os contêineres rodando e saudáveis
docker compose ps

# 2. Inspecionar a rede e confirmar que o banco está isolado
docker inspect hotel_network

# 3. Provar resolução DNS interna (sem IPs estáticos)
docker compose exec node_web ping -c 2 postgres
docker compose exec node_web ping -c 2 redis

# 4. Verificar Named Volumes criados
docker volume ls | grep sistema_gestao_hotel

# 5. Testar persistência: reiniciar o postgres e verificar que os dados permanecem
docker compose restart postgres
curl http://localhost/health

# 6. Confirmar que o banco é inacessível diretamente pelo host
#    (sem port mapping — o comando abaixo deve recusar a conexão)
psql -h localhost -p 5432 -U hotel_user -d gestao_hotel

# 7. Ver logs de todos os serviços
docker compose logs --tail=20

# 8. Verificar a imagem construída (multi-stage, tamanho reduzido)
docker images | grep sistema_gestao_hotel
```

URL de acesso à aplicação: **http://localhost**
Documentação Swagger: **http://localhost/api-docs**
Health check: **http://localhost/health**

---

# Troubleshooting

### API retorna "ECONNREFUSED" ou não conecta ao banco

```bash
# Verificar se o postgres está healthy
docker compose ps

# Ver logs do postgres
docker compose logs postgres

# Reiniciar apenas o postgres
docker compose restart postgres
```

### "relation 'tenants' does not exist"

As migrations não foram executadas após subir os contêineres:

```bash
docker compose exec node_web node command.js migrate
```

### Porta 80 já está em uso

```bash
# Identificar o processo que ocupa a porta
sudo lsof -i :80

# Ou alterar a porta do Nginx no docker-compose.yml:
# ports: "8080:80"
# Após a alteração, acesse em http://localhost:8080
```

### "password authentication failed"

```bash
# Verificar variáveis configuradas
cat .env | grep POSTGRES_

# Se necessário, recriar tudo do zero
docker compose down -v
docker compose up -d --build
docker compose exec node_web node command.js migrate
```

### Contêiner node_web reiniciando em loop

```bash
# Ver a causa do erro
docker compose logs node_web

# Causas comuns: .env ausente, banco ainda iniciando (aguarde o healthcheck)
docker compose ps  # verificar se postgres está "healthy"
```

---

# Limpeza após Avaliação

```bash
# Parar contêineres — dados dos volumes são preservados
docker compose down

# Parar contêineres e remover todos os dados (volumes)
docker compose down -v
```

> **Atenção:** `docker compose down -v` apaga permanentemente todos os dados do banco (`postgres_data`) e do cache (`redis_data`). Esta operação é irreversível.

---

*Sistema de Gestão de Hotel — TCC Unifaat 2026*
*Node.js 24 · Express 4 · Sequelize 6 · PostgreSQL 17 · Redis 7 · Docker · Nginx*
*Grupo: Gabriel · Sirlande · Weslley*
