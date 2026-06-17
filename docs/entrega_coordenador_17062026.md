# Documento de Entrega — Sistema de Gestão Hoteleira
**Data:** 17 de junho de 2026
**Aluno:** Gabriel Reis Cunha
**Disciplina:** Projeto Integrador / TCC
**Repositório:** https://github.com/gabrielreis354/sistema_hotel_prova

---

## 1. Visão Geral do Projeto

Sistema de gestão hoteleira desenvolvido como SaaS multi-tenant, com foco em arquitetura backend escalável. O sistema permite que múltiplos hotéis utilizem a mesma aplicação de forma isolada, com cada hotel operando seus próprios dados de reservas, hóspedes, quartos e pagamentos de forma completamente separada.

**Problema resolvido:** Pousadas e hotéis pequenos dependem de planilhas ou sistemas ultrapassados para gerenciar reservas, check-in, check-out e pagamentos. Este sistema entrega uma API REST completa que pode ser consumida por qualquer frontend ou aplicativo móvel.

---

## 2. Stack Tecnológica

| Camada | Tecnologia | Versão |
|--------|-----------|--------|
| Runtime | Node.js | 24.x |
| Linguagem | JavaScript ESModules | `"type": "module"` |
| Framework Web | Express | 4.x |
| ORM | Sequelize | 6.x |
| Banco de Dados | PostgreSQL | 17 |
| Autenticação | JWT (jsonwebtoken) | 9.x |
| Hashing | bcryptjs | 2.x |
| Documentação | Swagger UI / OpenAPI 3.0 | — |
| Testes | Vitest 4 + Supertest | 4.x / 7.x |
| Containers | Docker + Docker Compose | — |
| Orquestração | Kubernetes (manifests completos) | — |

---

## 3. Funcionalidades Implementadas

### 3.1 Autenticação e Autorização

- Registro de hotel + usuário admin (`POST /auth/register`)
- Login com retorno de JWT (`POST /auth/login`)
- Middleware de autenticação em todas as rotas protegidas
- Controle de roles: `ADMIN` e `RECEPTIONIST`
- Token com duração de 8 horas, payload `{ userId, role, tenantId }`

### 3.2 Gestão de Quartos

- CRUD completo de categorias de quartos (`/room-categories`)
- CRUD completo de quartos (`/rooms`)
- Listagem de quartos disponíveis por período (`GET /rooms/available?check_in=&check_out=`)
- Máquina de estados do quarto: `AVAILABLE → OCCUPIED → CLEANING → AVAILABLE`

### 3.3 Gestão de Hóspedes

- CRUD completo de hóspedes (`/guests`)
- CPF único por hotel (não global) — suporte multi-tenant correto
- Soft delete (dados preservados para histórico)

### 3.4 Reservas

- Criação de reserva com cálculo automático de `total_amount` (sem depender do cliente)
- Detecção de conflito de datas — impede double-booking
- Associação de múltiplos quartos a uma reserva (tabela pivô `reservation_rooms`)
- Máquina de estados com endpoints dedicados:
  - `PUT /reservations/:id/check-in` → `PENDING → CHECKED_IN`
  - `PUT /reservations/:id/check-out` → `CHECKED_IN → CHECKED_OUT`
  - `PUT /reservations/:id/cancel` → `PENDING/CONFIRMED → CANCELLED`
- Proteção contra transições inválidas (ex: cancelar reserva com hóspede no quarto retorna 422)
- Check-in e check-out propagam o status para todos os quartos da reserva (incluindo extras)

### 3.5 Pagamentos

- Registro de pagamentos vinculados a reservas (`/payments`)
- Métodos: PIX, DINHEIRO, CARTAO
- CRUD completo com soft delete

### 3.6 Usuários

- CRUD completo de funcionários do hotel (`/users`)
- Exclusão restrita a ADMIN

---

## 4. Arquitetura

### Padrão Single-Action Controller

Cada endpoint tem seu próprio arquivo de controller com responsabilidade única, seguindo os princípios SOLID. Exemplo:

```
app/Controllers/ReservationApi/
  ├── CreateReservationController.js
  ├── CheckInController.js
  ├── CheckOutController.js
  ├── CancelReservationController.js
  └── ...
```

### Multi-Tenancy

`tenant_id` presente em todas as tabelas e em todas as queries. O JWT carrega o `tenantId` e o middleware injeta em `request.tenantId` — nenhuma rota consegue acessar dados de outro hotel.

### Banco de Dados — 8 Tabelas

| Tabela | Função |
|--------|--------|
| `tenants` | Hotel (raiz do sistema) |
| `users` | Funcionários do hotel |
| `room_categories` | Tipos de quarto com preço por noite |
| `rooms` | Quartos físicos |
| `guests` | Hóspedes cadastrados |
| `reservations` | Reservas com máquina de estados |
| `reservation_rooms` | Pivô N:N entre reservas e quartos |
| `payments` | Pagamentos por reserva |

Todas as tabelas usam UUID como chave primária e possuem soft delete (`paranoid: true`).

---

## 5. Infraestrutura

### Docker Compose (Desenvolvimento / Demo)

Três containers comunicando-se por rede interna:

| Container | Imagem | Porta externa |
|-----------|--------|---------------|
| `postgres` | postgres:17 | nenhuma |
| `node_web` | build local | nenhuma |
| `nginx` | nginx:1.27-alpine | **80** |

O Node.js não fica exposto diretamente — todo acesso passa pelo Nginx.

```bash
# Subir o sistema completo:
docker compose up --build

# Criar as tabelas:
docker compose exec node_web node command.js migrate

# Acessar a API:
http://localhost

# Documentação Swagger:
http://localhost/api-docs
```

### Kubernetes (Produção)

Pasta `k8s/` contém manifests completos para deploy em cluster:

| Manifest | Função |
|----------|--------|
| `namespace.yaml` | Namespace `hotel-system` |
| `configmap.yaml` | Variáveis de configuração |
| `secret.yaml` | Senha do banco e JWT secret |
| `postgres.yaml` | PostgreSQL com volume persistente |
| `backend.yaml` | 3 réplicas da API com health checks |
| `nginx.yaml` | Ingress HTTP |
| `pdb.yaml` | PodDisruptionBudget — garante disponibilidade |
| `networkpolicy.yaml` | Isolamento de rede entre pods |
| `kustomization.yaml` | Aplica tudo em um comando |

```bash
docker build -t sistema-gestao-hotel-backend:latest .
kubectl apply -k k8s
kubectl get pods -n hotel-system
```

---

## 6. Testes Automatizados

Suite de integração com banco de dados real (PostgreSQL), sem mocks.

| Arquivo de teste | Domínio | Testes |
|-----------------|---------|--------|
| `auth.test.js` | Autenticação | 9 |
| `room-categories.test.js` | Categorias | 7 |
| `rooms.test.js` | Quartos | 12 |
| `guests.test.js` | Hóspedes | 9 |
| `reservations.test.js` | Reservas | 20 |
| `payments.test.js` | Pagamentos | 7 |
| `tenant-isolation.test.js` | Isolamento multi-tenant | 15 |
| **Total** | | **78 passed / 1 skipped** |

O teste pulado (`it.skip`) documenta o cenário `CONFIRMED → CANCELLED`, que depende de um endpoint de confirmação de reserva ainda não implementado.

**Cobertura dos cenários críticos:**
- Cálculo automático de `total_amount` (proteção financeira)
- Detecção de conflito de datas (double-booking)
- Máquina de estados completa com transições inválidas
- Propagação de status para quartos extras no check-in/check-out
- Isolamento multi-tenant: tenant B não consegue ler, criar, editar ou cancelar dados do tenant A

```bash
npm test
# Test Files  7 passed (7)
# Tests  78 passed | 1 skipped (79)
# Duration  ~5s
```

---

## 7. Documentação

| Documento | Localização |
|-----------|------------|
| README (como executar) | `README.md` |
| Swagger / OpenAPI 3.0 | `http://localhost/api-docs` |
| Padrões de código | `docs/CODING_STANDARDS.md` |
| Roadmap do produto | `docs/PRODUCT_ROADMAP.md` |
| Arquitetura de banco | `docs/db/ARQ_DATABASE.md` |
| Infra Kubernetes | `docs/infra/KUBERNETES.md` |

---

## 8. Como Executar para Avaliação

### Pré-requisitos
- Docker e Docker Compose instalados

### Passo a passo

```bash
# 1. Clonar o repositório
git clone https://github.com/gabrielreis354/sistema_hotel_prova.git
cd sistema_hotel_prova

# 2. Subir os containers
docker compose up --build

# 3. Em outro terminal — criar as tabelas
docker compose exec node_web node command.js migrate

# 4. Acessar a documentação Swagger
# Abrir no navegador: http://localhost/api-docs

# 5. Fazer login via Swagger ou curl
curl -X POST http://localhost/auth/register \
  -H "Content-Type: application/json" \
  -d '{"tenantName":"Hotel Teste","name":"Admin","email":"admin@teste.com","password":"senha123"}'

curl -X POST http://localhost/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@teste.com","password":"senha123"}'

# 6. Usar o token retornado no header de qualquer rota protegida:
# Authorization: Bearer <token>
```

---

## 9. Equipe

| Membro | Contribuições principais |
|--------|------------------------|
| Gabriel | Arquitetura do projeto, máquina de estados das reservas, multi-tenancy, testes automatizados, Docker/K8s, orquestração geral |
| Sirlande | Módulo de pagamentos, correções de schema SQL, seed de dados |
| Weslley | Docker Compose inicial, configuração de infraestrutura |

---

## 10. Métricas do Projeto

| Métrica | Valor |
|---------|-------|
| Endpoints implementados | 40+ |
| Controllers | 39 arquivos |
| Models Sequelize | 8 tabelas |
| Testes automatizados | 78 passing |
| Branches de feature/fix | 20+ |
| Commits no repositório | 50+ |
| Cobertura da fase Demo | 100% das funcionalidades previstas |

---

*Documento gerado em 17/06/2026*
