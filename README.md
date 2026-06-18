# Sistema de Gestão de Hotel — Backend API

API REST multi-tenant para gerenciamento hoteleiro, desenvolvida em Node.js (ESModules) com Express, Sequelize (PostgreSQL) e autenticação JWT. Containerizada com Docker (Nginx + Node.js + PostgreSQL + Redis) e preparada para orquestração com Kubernetes.

**Caminho de Infraestrutura:** Opção A — Docker / Orquestração Local

---

## Entidades e Relacionamentos

| Tabela              | Descrição                                          |
|---------------------|----------------------------------------------------|
| `tenants`           | Hotel (cliente SaaS). Raiz de todo o sistema.      |
| `users`             | Usuários do hotel (ADMIN ou RECEPTIONIST)          |
| `room_categories`   | Categorias de quartos (Standard, Luxo, etc.)       |
| `rooms`             | Quartos físicos do hotel                           |
| `guests`            | Hóspedes cadastrados                               |
| `reservations`      | Reservas feitas por hóspedes                       |
| `reservation_rooms` | **Tabela pivô** — relação N:N entre reservas e quartos |
| `payments`          | Pagamentos vinculados a reservas                   |

### Relacionamentos

```
Tenant 1:N Users
Tenant 1:N RoomCategories
Tenant 1:N Rooms
RoomCategory 1:N Rooms
Tenant 1:N Guests
Tenant 1:N Reservations
Guest 1:N Reservations
Room 1:N Reservations (quarto principal)
User 1:N Reservations (responsável)
Reservation N:N Rooms  ← via tabela pivô reservation_rooms
Reservation 1:N Payments
```

### Relação N:N

A entidade **Reservation** possui relação muitos-para-muitos com **Room**, gerenciada pela **tabela pivô `reservation_rooms`**. Uma reserva pode contemplar múltiplos quartos, e o mesmo quarto pode aparecer em diversas reservas (em períodos distintos).

---

## CRUDs Disponíveis

| Recurso           | Rotas                                                 |
|-------------------|-------------------------------------------------------|
| Auth              | `POST /auth/register` · `POST /auth/login`            |
| Usuários          | `GET/POST /users` · `GET/PUT/DELETE /users/:id`       |
| Categorias        | `GET/POST /room-categories` · `GET/PUT/DELETE /room-categories/:id` |
| Quartos           | `GET/POST /rooms` · `GET/PUT/DELETE /rooms/:id`       |
| Hóspedes          | `GET/POST /guests` · `GET/PUT/DELETE /guests/:id`     |
| Reservas          | `GET/POST /reservations` · `GET/PUT/DELETE /reservations/:id` |
| Check-in/out      | `PUT /reservations/:id/check-in` · `PUT /reservations/:id/check-out` |
| Quartos na Reserva (pivô) | `POST /reservations/:id/rooms` · `DELETE /reservations/:id/rooms/:roomId` |

---

## Autenticação JWT

Todas as rotas (exceto `/auth/login` e `/auth/register`) exigem o header:

```
Authorization: Bearer <token>
```

O token é gerado no login com duração de **8 horas** e carrega o payload:

```json
{ "userId": "uuid", "role": "ADMIN|RECEPTIONIST", "tenantId": "uuid" }
```

O middleware `authMiddleware` valida o token em cada requisição e injeta `request.user` com os dados do usuário autenticado. Rotas de exclusão exigem `role: ADMIN`.

---

## Containers Docker

| Serviço    | Imagem            | Porta externa | Rede interna    |
|------------|-------------------|---------------|-----------------|
| `postgres` | postgres:17       | nenhuma       | `hotel_network` |
| `redis`    | redis:7-alpine    | nenhuma       | `hotel_network` |
| `node_web` | (build local)     | nenhuma       | `hotel_network` |
| `nginx`    | nginx:1.27-alpine | **80:80**     | `hotel_network` |

Fluxo de rede:
```
Host → Nginx (porta 80) → node_web:3000 → postgres:5432
                                         → redis:6379
```

O container `node_web` **não expõe portas ao host**, acessível apenas via Nginx.

---

## Infraestrutura — Opção A: Docker/Orquestração Local

Este projeto utiliza a **Opção A (Docker/Orquestração Local)** como caminho de infraestrutura.

A arquitetura é composta por **4 serviços** containerizados, orquestrados via Docker Compose:

| Serviço    | Papel                     |
|------------|---------------------------|
| `postgres` | Banco de dados relacional |
| `redis`    | Cache (camada obrigatória)|
| `node_web` | Aplicação Node.js (API)   |
| `nginx`    | Proxy reverso (entrada)   |

```
                    ┌─────────────────────────────────────────┐
                    │          hotel_network (bridge)          │
                    │                                         │
  Host :80 ──────►  │  nginx ──► node_web:3000 ──► postgres   │
                    │                          ──► redis      │
                    │                                         │
                    └─────────────────────────────────────────┘
```

---

## Detalhamento Técnico da Infraestrutura

### Otimização da Imagem Docker

O `Dockerfile` utiliza **Multi-stage build** para separar dependências de produção (stage `deps`) da imagem final (stage `runner`):

- **Stage 1 (`deps`):** Instala apenas dependências de produção com `npm ci --omit=dev`, excluindo devDependencies
- **Stage 2 (`runner`):** Copia `node_modules` do stage anterior e o código-fonte, resultando em uma imagem leve
- **Base image:** `node:24-alpine` (~50MB vs ~900MB do `node:24` full)
- **Segurança:** Executa como usuário não-root com `USER node`, impedindo escalonamento de privilégios dentro do container
- **`.dockerignore`:** Exclui `node_modules`, `tests/`, `docs/`, `k8s/`, `.git/`, `.env` — reduz contexto de build e evita vazamento de dados sensíveis na imagem

### Persistência de Dados (Named Volumes)

Named Volumes são gerenciados pelo Docker daemon e sobrevivem a `docker compose down` (sem `-v`):

| Volume          | Montado em                     | Propósito                                    |
|-----------------|--------------------------------|----------------------------------------------|
| `postgres_data` | `/var/lib/postgresql/data`     | Dados do banco PostgreSQL                    |
| `redis_data`    | `/data`                        | Persistência Redis com AOF (append-only file)|

- **Bind mounts** foram evitados para dados persistentes, conforme boas práticas de produção
- Redis usa `appendonly yes` para garantir durabilidade dos dados em cache mesmo após reinicialização

### Rede e Comunicação (Custom Bridge)

- **`hotel_network`** é uma Custom Bridge Network (`driver: bridge`)
- **DNS Interno:** Serviços se comunicam por nome (ex: `node_web` conecta a `postgres`, não a `172.x.x.x`)
- **IPs estáticos proibidos** — resolução via Service Discovery nativo do Docker
- **Isolamento perimetral:** `node_web`, `postgres` e `redis` não possuem `ports:` expostos ao host — são acessíveis **somente** dentro da rede `hotel_network`
- **Nginx** é o único ponto de entrada externo (porta 80), atuando como proxy reverso

### Segurança

- **Variáveis de ambiente** via arquivo `.env` — nunca hardcoded no código ou no `docker-compose.yml`
- **`.env.example`** documenta as variáveis necessárias sem valores reais — `.env` está no `.gitignore`
- **`USER node`** no Dockerfile — container não executa como root
- **`node_web`** e **`postgres`** sem portas expostas ao host — isolamento perimetral contra acesso direto
- **`JWT_SECRET`** rotacionável via variável de ambiente, sem recompilação da imagem

---

## Gestão de Segredos e Configurações

### Configuração inicial

```bash
cp .env.example .env
```

Edite o arquivo `.env` com os valores adequados ao seu ambiente:

| Variável            | Descrição                                      | Exemplo                              |
|---------------------|-------------------------------------------------|--------------------------------------|
| `NODE_ENV`          | Ambiente de execução                            | `production`                         |
| `NODE_WEB_PORT`     | Porta interna da aplicação Node.js              | `3000`                               |
| `POSTGRES_HOST`     | Hostname do banco (nome do serviço no Compose)  | `postgres`                           |
| `POSTGRES_PORT`     | Porta do PostgreSQL                             | `5432`                               |
| `POSTGRES_DB`       | Nome do banco de dados                          | `gestao_hotel`                       |
| `POSTGRES_USER`     | Usuário do PostgreSQL                           | `hotel_user`                         |
| `POSTGRES_PASSWORD` | Senha do PostgreSQL                             | *(definir no .env)*                  |
| `JWT_SECRET`        | Chave secreta para assinar tokens JWT           | *(definir no .env)*                  |
| `REDIS_URL`         | URL de conexão com o Redis                      | `redis://redis:6379`                 |

> **NUNCA commite o arquivo `.env` ou senhas reais no repositório.** O `.gitignore` já bloqueia `.env`, mas verifique antes de cada push.

### Pipeline CI/CD — Secrets no GitHub

O pipeline `.github/workflows/docker-ecr.yml` depende de 3 secrets configurados no GitHub:

| Secret                  | Descrição                       |
|-------------------------|---------------------------------|
| `AWS_ACCESS_KEY_ID`     | Chave de acesso IAM da AWS      |
| `AWS_SECRET_ACCESS_KEY` | Chave secreta IAM da AWS        |
| `AWS_REGION`            | Região da AWS (ex: `us-east-1`) |

Configure em: **GitHub → Settings → Secrets and variables → Actions**

---

## Evidências de Funcionamento

Comandos que o avaliador pode executar para validar a infraestrutura:

```bash
# Verificar todos os containers rodando (4 serviços: postgres, redis, node_web, nginx)
docker compose ps

# Inspecionar a rede e verificar DNS interno
docker inspect hotel_network

# Testar resolução DNS interna (prova que não usa IPs estáticos)
docker compose exec node_web ping -c 2 postgres
docker compose exec node_web ping -c 2 redis

# Verificar Named Volumes criados
docker volume ls | grep sistema

# Testar persistência: reiniciar postgres e verificar que a API ainda responde
docker compose restart postgres
curl http://localhost/health

# Ver logs de todos os serviços
docker compose logs --tail=20

# Verificar pipeline CI/CD (existência e conteúdo)
cat .github/workflows/docker-ecr.yml

# Verificar que .env NÃO está no repositório
git ls-files .env
# Esperado: nenhuma saída (arquivo não rastreado)
```

**Acesso à aplicação:** `http://localhost` (via Nginx na porta 80)

---

## Limpeza após Avaliação

```bash
# Parar e remover containers (mantém dados nos volumes)
docker compose down

# Parar, remover containers E destruir volumes (dados do banco e cache)
docker compose down -v
```

> **`docker compose down -v` remove todos os dados do banco e cache — operação irreversível.** Use apenas quando quiser resetar completamente o ambiente.

---

## Kubernetes

A pasta `k8s/` contém os manifests para executar a mesma arquitetura no Kubernetes:

| Recurso | Função |
|---------|--------|
| `namespace.yaml` | Isola os recursos no namespace `hotel-system` |
| `configmap.yaml` | Guarda variáveis não sensíveis da aplicação |
| `secret.yaml` | Guarda senha do banco e segredo JWT |
| `postgres.yaml` | Cria PostgreSQL com volume persistente e Service interno |
| `backend.yaml` | Cria 3 réplicas da API Express e Service interno |
| `nginx.yaml` | Cria Nginx como ponto de entrada HTTP |
| `kustomization.yaml` | Aplica todos os manifests em conjunto |

Fluxo no cluster:

```
Cliente → Nginx Service → Backend Service → PostgreSQL Service
```

Aplicação dos manifests:

```bash
docker build -t sistema-gestao-hotel-backend:latest .
kubectl apply -k k8s
kubectl get pods -n hotel-system
```

Mais detalhes em `docs/infra/KUBERNETES.md`.

Para o exercício básico do Lab 9, também há manifests simples em `docker/kubernetes/`:

```bash
kubectl apply -f docker/kubernetes/deployment.yaml
kubectl apply -f docker/kubernetes/service.yaml
```

---

## Bibliotecas Utilizadas

| Biblioteca         | Finalidade                                |
|--------------------|-------------------------------------------|
| `express`          | Framework HTTP                            |
| `sequelize`        | ORM para PostgreSQL                       |
| `pg` / `pg-hstore` | Driver PostgreSQL                         |
| `jsonwebtoken`     | Geração e validação de tokens JWT         |
| `bcryptjs`         | Hash de senhas (10 rounds)                |
| `dotenv`           | Variáveis de ambiente via `.env`          |
| `swagger-ui-express` | Interface visual da documentação Swagger |
| `swagger-jsdoc`    | Geração da spec OpenAPI 3.0               |

---

## Documentação Swagger

Disponível em: **`http://localhost/api-docs`**

Contém todos os endpoints documentados com schemas, exemplos e autenticação JWT configurada.

---

## Como Executar

### Pré-requisitos

- Docker e Docker Compose instalados

### 1. Configurar variáveis de ambiente

```bash
cp .env.example .env
# Edite .env com suas configurações
```

Variáveis necessárias:

```ini
POSTGRES_DB=gestao_hotel
POSTGRES_USER=hotel_user
POSTGRES_PASSWORD=hotel_password
POSTGRES_HOST=postgres
POSTGRES_PORT=5432
JWT_SECRET=seu_segredo_jwt_aqui
NODE_WEB_PORT=3000
```

### 2. Subir os containers

```bash
docker compose up --build
```

A API ficará disponível em `http://localhost`.

### 3. Executar migrations

Em outro terminal, com os containers rodando:

```bash
docker compose exec node_web node command.js migrate
```

Ou, para desenvolvimento local (com Node.js instalado):

```bash
node command.js migrate
```

O comando `migrate` usa `sequelize.sync({ alter: true })` para criar/atualizar todas as tabelas automaticamente.

### 4. Outros comandos úteis

```bash
# Parar os containers
docker compose down

# Acompanhar logs em tempo real
docker compose logs -f

# Ver logs de um serviço específico
docker compose logs -f node_web
```

---

## Desenvolvimento Local (sem Docker)

```bash
npm install
node command.js migrate   # cria as tabelas
node _web.js              # inicia o servidor
```

---

## Estrutura do Projeto

```
├── _web.js                  # Entrypoint do servidor Express
├── command.js               # CLI: node command.js migrate
├── Dockerfile               # Multi-stage build Node.js 24 Alpine
├── docker-compose.yml       # 4 serviços: postgres, redis, node_web, nginx
├── k8s/                     # Manifests Kubernetes
├── docker/kubernetes/       # Deployment e Service simples do Lab 9
├── docker/nginx/            # Configuração do Nginx reverse proxy
├── config/swagger.js        # Spec OpenAPI 3.0
├── app/
│   ├── Controllers/         # Lógica de cada rota (CRUD + auth)
│   └── Models/              # Modelos Sequelize (8 tabelas)
├── bootstrap/app.js         # Inicialização dotenv + relações
├── database/
│   ├── connections/         # Singleton Sequelize
│   └── relations.js         # Associações entre modelos
├── middlewares/             # authMiddleware, requireRole
└── routes/                  # Router principal + sub-routers
```

---

## Troubleshooting

### Problema: "ECONNREFUSED 127.0.0.1:5432"

**Causa:** PostgreSQL não está rodando.

**Solução:**
```bash
# Com Docker Compose:
docker compose up -d

# Verificar se o container postgres está saudável:
docker compose ps
```

### Problema: "password authentication failed"

**Causa:** Credenciais incorretas no `.env`.

**Solução:**
```bash
# Verifique as variáveis no .env:
cat .env | grep POSTGRES_

# Se necessário, recrie as tabelas:
docker compose exec node_web node command.js migrate
```

### Problema: "relation 'tenants' does not exist"

**Causa:** Migrations não foram executadas após subir os containers.

**Solução:**
```bash
docker compose exec node_web node command.js migrate
```

### Problema: Porta 80 já em uso

**Causa:** Outro serviço (Apache, outro Nginx) está usando a porta 80.

**Solução:**
```bash
# Identificar o processo que usa a porta:
sudo lsof -i :80

# Parar o serviço conflitante, ou alterar a porta no docker-compose.yml:
# ports: "8080:80"
```

### Problema: "Cannot find module" ou erro de import

**Causa:** Dependências não instaladas.

**Solução:**
```bash
npm install
```
