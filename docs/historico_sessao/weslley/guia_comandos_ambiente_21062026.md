# Guia Passo a Passo — Subindo o Ambiente do Hotel PMS

**Data:** 21/06/2026  
**Responsavel:** Weslley  
**Projeto:** Sistema de Gestao de Hotel — SaaS Multi-Tenant  
**Stack:** Node.js 24, Express 4, Sequelize 6, PostgreSQL 17, Redis 7, Nginx, Docker

---

## Contexto

Este guia documenta todos os comandos necessarios para subir o ambiente do projeto do zero, organizados na ordem correta de execucao: primeiro a infraestrutura, depois o banco de dados, e por fim a validacao dos resultados.

---

## PARTE 1 — INFRAESTRUTURA

### Passo 1: Verificar pre-requisitos

Antes de comecar, verificar se as ferramentas estao instaladas:

| Ferramenta | Versao Minima | Comando |
|---|---|---|
| Node.js | 24.x | `node -v` |
| npm | 10.x | `npm -v` |
| Docker | 24.x | `docker --version` |
| Docker Compose | 2.x | `docker compose version` |
| Git | 2.x | `git --version` |

---

### Passo 2: Clonar o repositorio

```bash
git clone https://github.com/seu-usuario/sistema_hotel_prova.git
cd sistema_hotel_prova
```

---

### Passo 3: Configurar variaveis de ambiente

```bash
cp .env.example .env
```

Conteudo do `.env`:

```env
NODE_ENV=development
NODE_WEB_PORT=3000
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=gestao_hotel
POSTGRES_USER=hotel_user
POSTGRES_PASSWORD=hotel_password
JWT_SECRET=sua_chave_secreta_aqui
```

> **IMPORTANTE:** O `.env` nunca deve ser commitado no Git.

---

### Passo 4: Instalar dependencias do Node.js

```bash
npm install
```

---

### Passo 5: Buildar e subir os containers Docker

```bash
docker compose up --build -d
```

Containers criados por esse comando:

| Container | Servico | Porta | Acesso |
|---|---|---|---|
| `hotel_postgres` | PostgreSQL 17 | 5432 | Rede interna Docker |
| `hotel_redis` | Redis 7 | 6379 | Rede interna Docker |
| `hotel_node` | Node.js 24 (Express) | 3000 | Rede interna Docker |
| `hotel_nginx` | Nginx 1.27 (proxy reverso) | 80 | Acesso externo |

Arquitetura:

```
[Navegador] --> :80 --> [Nginx] --> :3000 --> [Node.js]
                                                  |
                                          [PostgreSQL :5432]
                                          [Redis :6379]
```

---

### Passo 6: Verificar se os containers estao rodando

```bash
docker compose ps
```

Resultado esperado:

```
NAME              STATUS
hotel_postgres    running (healthy)
hotel_redis       running (healthy)
hotel_node        running
hotel_nginx       running
```

Se algum container nao estiver "running", verificar os logs:

```bash
docker compose logs -f postgres
docker compose logs -f redis
docker compose logs -f node_web
docker compose logs -f nginx
```

---

### Passo 7: Comandos de gerenciamento dos containers

| Acao | Comando |
|---|---|
| Parar todos os containers | `docker compose down` |
| Parar e apagar volumes (dados do banco) | `docker compose down -v` |
| Reiniciar apenas o Node.js | `docker compose restart node_web` |
| Rebuildar e reiniciar o Node.js | `docker compose up --build -d node_web` |
| Ver logs em tempo real | `docker compose logs -f <servico>` |
| Acessar shell do container Node.js | `docker exec -it hotel_node sh` |
| Ver variaveis de ambiente do Node.js | `docker exec hotel_node env \| grep -E "POSTGRES\|NODE\|JWT\|REDIS"` |

---

### Passo 8 (Alternativa): Subir local SEM Docker

Para rodar sem Docker, e necessario ter PostgreSQL e Redis instalados na maquina.

```bash
npm install
npm run dev
```

O servidor sobe na porta 3000 com hot-reload (nodemon).

Para modo producao:

```bash
npm start
```

---

### Passo 9: Kubernetes (ambiente de producao)

Aplicar todos os manifests de uma vez:

```bash
kubectl apply -k k8s/
```

Ou aplicar na ordem correta, um por um:

```bash
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/configmap.yaml
kubectl apply -f k8s/secret.yaml
kubectl apply -f k8s/networkpolicy.yaml
kubectl apply -f k8s/postgres.yaml
kubectl apply -f k8s/backend.yaml
kubectl apply -f k8s/nginx.yaml
kubectl apply -f k8s/pdb.yaml
```

Verificar o estado do cluster:

```bash
kubectl get all -n hotel-pms
kubectl get pods -n hotel-pms
kubectl logs -f <nome-do-pod> -n hotel-pms
```

---

## PARTE 2 — BANCO DE DADOS

### Passo 10: Criar o banco de dados (modo local, sem Docker)

> **Nota:** Com Docker, o banco ja e criado automaticamente pelo container `hotel_postgres`. Estes passos sao apenas para quem esta rodando sem Docker.

Conectar ao PostgreSQL:

```bash
psql -U postgres
```

Dentro do psql, executar:

```sql
CREATE DATABASE gestao_hotel;
CREATE USER hotel_user WITH PASSWORD 'hotel_password';
GRANT ALL PRIVILEGES ON DATABASE gestao_hotel TO hotel_user;
\q
```

---

### Passo 11: Criar as tabelas (schema)

Via npm script:

```bash
npm run setup:db
```

Ou manualmente:

```bash
psql -h localhost -U hotel_user -d gestao_hotel -f db/schema.sql
```

---

### Passo 12: Popular com dados iniciais (seed)

Via npm script:

```bash
npm run seed:db
```

Ou manualmente:

```bash
psql -h localhost -U hotel_user -d gestao_hotel -f seed/seed_hotels.sql
```

---

### Passo 13: Verificar conexao com o banco

| Verificacao | Comando |
|---|---|
| Testar PostgreSQL local | `psql -h localhost -U hotel_user -d gestao_hotel -c "SELECT 1;"` |
| Acessar psql dentro do container | `docker exec -it hotel_postgres psql -U hotel_user -d gestao_hotel` |
| Testar Redis local | `redis-cli ping` (resposta esperada: `PONG`) |
| Acessar Redis dentro do container | `docker exec -it hotel_redis redis-cli` |

---

### Passo 14: Comandos uteis de debug

| Acao | Comando |
|---|---|
| Verificar porta 3000 em uso (Linux) | `lsof -i :3000` |
| Verificar porta 3000 em uso (Windows) | `netstat -ano \| findstr :3000` |
| Ver env do container Node.js | `docker exec hotel_node env \| grep -E "POSTGRES\|NODE\|JWT\|REDIS"` |
| Entrar no shell do container | `docker exec -it hotel_node sh` |

---

## PARTE 3 — RESULTADO FINAL

### Passo 15: Testar se o ambiente esta funcionando

Com Docker (acesso via Nginx na porta 80):

```bash
curl http://localhost/health
```

Sem Docker (acesso direto na porta 3000):

```bash
curl http://localhost:3000/health
```

Resposta esperada:

```json
{ "status": "ok" }
```

---

### Passo 16: Endpoints disponiveis

| Metodo | Rota | Descricao |
|---|---|---|
| GET | `/health` | Health check do servidor |
| POST | `/api/auth/register` | Registrar novo usuario |
| POST | `/api/auth/login` | Login (retorna token JWT) |
| GET | `/api/rooms` | Listar quartos |
| POST | `/api/rooms` | Criar quarto |
| GET | `/api/rooms/available` | Listar quartos disponiveis |
| GET | `/api/rooms/:id` | Buscar quarto por ID |
| GET | `/api/guests` | Listar hospedes |
| POST | `/api/guests` | Criar hospede |
| GET | `/api/guests/:id` | Buscar hospede por ID |
| GET | `/api/reservations` | Listar reservas |
| POST | `/api/reservations` | Criar reserva |
| GET | `/api/reservations/:id` | Buscar reserva por ID |
| POST | `/api/reservations/:id/check-in` | Fazer check-in |
| POST | `/api/reservations/:id/check-out` | Fazer check-out |
| POST | `/api/reservations/:id/cancel` | Cancelar reserva |
| POST | `/api/payments` | Registrar pagamento |
| GET | `/api/payments` | Listar pagamentos |
| GET | `/api-docs` | Documentacao Swagger |

> **Nota:** Todos os endpoints (exceto `/health`, register e login) exigem o header `Authorization: Bearer <token>`.

---

### Passo 17: Testar fluxo completo

**17.1 — Registrar usuario:**

```bash
curl -X POST http://localhost/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Admin Hotel","email":"admin@hotel.com","password":"senha123","role":"admin"}'
```

**17.2 — Fazer login e pegar o token:**

```bash
curl -X POST http://localhost/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@hotel.com","password":"senha123"}'
```

Copiar o `token` da resposta.

**17.3 — Listar quartos (usando o token):**

```bash
curl http://localhost/api/rooms \
  -H "Authorization: Bearer SEU_TOKEN_AQUI"
```

**17.4 — Acessar Swagger no navegador:**

```
http://localhost/api-docs
```

---

### Resumo rapido — Copiar e colar

**Docker (do zero):**

```bash
git clone https://github.com/seu-usuario/sistema_hotel_prova.git
cd sistema_hotel_prova
cp .env.example .env
docker compose up --build -d
docker compose ps
curl http://localhost/health
```

**Local (sem Docker):**

```bash
git clone https://github.com/seu-usuario/sistema_hotel_prova.git
cd sistema_hotel_prova
cp .env.example .env
npm install
npm run setup:db
npm run seed:db
npm run dev
curl http://localhost:3000/health
```

---

### Checklist de validacao

| Item | Verificacao | Status |
|---|---|---|
| Containers rodando | `docker compose ps` — todos "running" | |
| PostgreSQL saudavel | container com status "healthy" | |
| Redis saudavel | container com status "healthy" | |
| Health check | `curl http://localhost/health` retorna `{"status":"ok"}` | |
| Swagger acessivel | `http://localhost/api-docs` abre no navegador | |
| Login funciona | POST `/api/auth/login` retorna token JWT | |

---

**Fim do Relatorio**
