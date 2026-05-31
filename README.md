# 🏨 Sistema de Gestão de Hotel

## Sobre o Projeto

**Sistema backend** para gerenciar: hóspedes, quartos, reservas e autenticação.

### Stack
- **Backend**: Node.js + Express + TypeScript
- **Banco**: PostgreSQL
- **Docker**: Containerização + Swarm para produção
- **Autenticação**: JWT + bcrypt

### Caminho: **Opção A (Docker Swarm)**

---

## Arquitetura

```
┌──────────────────────────────────────┐
│       Docker Swarm Cluster            │
├──────────────────────────────────────┤
│  Nginx (porta 80)                    │
│    ↓                                  │
│  Express App (3 réplicas)             │
│    ↓                                  │
│  PostgreSQL (rede privada)            │
│    ↓                                  │
│  Named Volume (pg_data)               │
└──────────────────────────────────────┘
```

**3 Serviços**:
1. `nginx` → Load Balancer (porta 80 exposta)
2. `app` → 3 réplicas da API (porta 3000 interna)
3. `db` → PostgreSQL (porta 5432 privada)

---

## Instalação

### Pré-requisitos
```bash
# Instalar Docker Desktop (inclui Compose)
# Instalar Git
# Instalar Node.js (opcional, apenas para dev local)

# Verificar instalação
docker --version
git --version
docker-compose --version
```

### Iniciar Swarm (1x)
```bash
docker swarm init
docker info | grep Swarm  # Deve mostrar: "Swarm: active"
```

---

## Como Rodar

### Passo 1: Configurar .env
```bash
cp .env.example .env
nano .env  # Editar valores
```

**Variáveis principais**:
```ini
DB_HOST=db
DB_PASSWORD=sua_senha_aqui
JWT_SECRET=sua_chave_secreta
NODE_ENV=production
```

### Passo 2: Build da Imagem
```bash
docker-compose build
```

### Passo 3: Deploy no Swarm
```bash
docker stack deploy -c docker-compose.yml hotel
```

### Passo 4: Aguardar Inicialização
```bash
# Esperar 20-30 segundos

# Verificar status (todos em "Running")
docker stack ps hotel
```

### Passo 5: Migrations (opcional)
```bash
docker exec $(docker ps -q -f name=hotel_app.1) npm run migrate
```

---

## Validar Sistema

```bash
# Health check
curl http://localhost/api/health

# Swagger (documentação)
# Browser: http://localhost/api-docs

# Status do stack
docker stack ps hotel

# Logs da aplicação
docker service logs hotel_app

# Logs do banco
docker service logs hotel_db
```

---

## Teste Completo

```bash
# 1. Registrar usuário
curl -X POST http://localhost/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"João","email":"joao@hotel.com","password":"123456"}'

# 2. Fazer login (copiar token retornado)
TOKEN=$(curl -s -X POST http://localhost/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"joao@hotel.com","password":"123456"}' | jq -r '.token')

# 3. Listar usuários (com autenticação)
curl -X GET http://localhost/api/users \
  -H "Authorization: Bearer $TOKEN"
```

---

## Teste de Persistência

```bash
# 1. Criar um dado no banco
curl -X POST http://localhost/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Maria","email":"maria@hotel.com","password":"123456"}'

# 2. Verificar que está lá
curl http://localhost/api/users | grep Maria

# 3. Matar container do banco (simula falha)
docker kill $(docker ps -q -f name=hotel_db.1)

# 4. Docker reinicia automaticamente (aguarde 5 seg)
sleep 5

# 5. Verificar que dados ainda existem
curl http://localhost/api/users | grep Maria
# ✅ DADOS PERSISTIRAM!
```

---

## Teste de Segurança

```bash
# Banco NÃO deve ser acessível diretamente
curl localhost:5432
# Esperado: Conexão recusada ✅

# API deve ser acessível via Nginx
curl http://localhost/api/health
# Esperado: {"status":"ok"} ✅

# Verificar que app roda como usuário "node" (não root)
docker exec $(docker ps -q -f name=hotel_app.1) whoami
# Esperado: node ✅
```

---

## Troubleshooting

### PostgreSQL não inicia
```bash
# Ver logs
docker service logs hotel_db | tail -50

# Solução: deletar volume danificado
docker stack rm hotel
docker volume rm pg_data
docker stack deploy -c docker-compose.yml hotel
```

### App não conecta ao banco
```bash
# Testar DNS
docker exec $(docker ps -q -f name=hotel_app.1) nslookup db

# Ver credenciais
docker exec $(docker ps -q -f name=hotel_app.1) env | grep DB_

# Reiniciar app
docker service update --force hotel_app
```

### Porta 80 em uso
```bash
# Encontrar processo
sudo lsof -i :80

# Parar serviço conflitante
sudo systemctl stop nginx

# Re-deploy
docker stack deploy -c docker-compose.yml hotel
```

---

## Limpeza Completa

```bash
# Remover tudo (containers + volumes + dados)
docker stack rm hotel
docker volume rm pg_data
docker image rm sistema-hotel-prova_app

# Verificar limpeza
docker stack ls        # vazio
docker volume ls       # pg_data gone
docker image ls | grep hotel  # vazio
```

---

## Arquivos Necessários

Você precisa criar:

1. **`backend/Dockerfile`** — Multi-stage build
2. **`docker-compose.yml`** — 3 serviços (nginx, app, db)
3. **`.env.example`** — Template (COMMITAR)
4. **`.env`** — Valores reais (NÃO commitar)
5. **`.dockerignore`** — Ignorar node_modules, logs, etc
6. **Backend Node.js** — Express + TypeScript + Sequelize

---

## Checklist de Entrega

- [ ] Dockerfile com multi-stage build
- [ ] docker-compose.yml com 3 serviços
- [ ] .env.example commitado (sem valores reais)
- [ ] Backend rodando em Node.js + Express
- [ ] `docker stack ps hotel` mostra 5 tasks em Running
- [ ] `curl http://localhost/api/health` retorna 200
- [ ] Dados persistem após kill do container
- [ ] DB não acessível externamente (segurança)
- [ ] README.md com instruções completas ✅
- [ ] Vídeo narrado mostrando sistema rodando

---

## Referências

- [Docker Docs](https://docs.docker.com)
- [Docker Swarm](https://docs.docker.com/engine/swarm)
- [Express.js](https://expressjs.com)
- [PostgreSQL Docker](https://hub.docker.com/_/postgres)
- [Sequelize ORM](https://sequelize.org)

---

**Última atualização**: 30 de Maio de 2025  
**Status**: ✅ Pronto para Desenvolvimento
