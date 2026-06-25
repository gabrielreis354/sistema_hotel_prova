# Guia de Uso — start.sh

**Data:** 24/06/2026
**Dev:** Weslley Lucas
**Projeto:** Sistema de Gestao de Hotel — SaaS Multi-Tenant

---

## 1. O que e o start.sh?

O `start.sh` e o **script central de operacoes** do projeto. Ele concentra todos os comandos necessarios para subir, configurar, testar e gerenciar o ambiente do sistema — tanto via **Docker Compose** (ambiente completo) quanto **localmente** (desenvolvimento).

Localizado na raiz do projeto:
```
sistema_hotel_prova/
  start.sh          <-- este script
  docker-compose.yml
  Dockerfile
  .env
  ...
```

---

## 2. Pre-requisitos

### Para modo Docker (recomendado)
- Docker e Docker Compose instalados
- Arquivo `.env` configurado na raiz do projeto

### Para modo local
- Node.js 24 instalado
- PostgreSQL 17 rodando e acessivel
- Redis 7 rodando e acessivel
- Arquivo `.env` configurado

### Para Kubernetes
- kubectl instalado e configurado com acesso ao cluster
- Secrets editados em `k8s/secret.yaml` (substituir placeholders)

---

## 3. Configuracao do .env

Antes de usar qualquer comando, o `.env` deve existir na raiz do projeto. Se nao existir, o script cria automaticamente a partir do `.env.example`.

```bash
# Copiar manualmente (opcional — o script faz isso se necessario)
cp .env.example .env
```

**Edite o `.env` e defina o JWT_SECRET:**

```env
NODE_ENV=development
NODE_WEB_PORT=3000

POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=gestao_hotel
POSTGRES_USER=hotel_user
POSTGRES_PASSWORD=hotel_password

JWT_SECRET=coloque_uma_chave_segura_aqui    # OBRIGATORIO

REDIS_URL=redis://localhost:6379
```

> **IMPORTANTE:** O Docker Compose **aborta** se `JWT_SECRET` nao estiver definido. O script valida isso antes de iniciar.

---

## 4. Comandos Disponiveis

### Sintaxe

```bash
./start.sh [COMANDO]
```

### Tabela de comandos

| Comando | Descricao | Quando usar |
|---------|-----------|-------------|
| `docker` | Sobe os 4 servicos via Docker Compose | Para rodar o ambiente completo em containers |
| `local` | Inicia o backend com `npm start` | Para desenvolvimento local (Postgres/Redis ja rodando) |
| `setup-db` | Cria banco, role, extensoes, migrations e seed | Primeira vez configurando o ambiente local |
| `seed` | Aplica apenas o seed de dados | Quando precisa resetar os dados de teste |
| `test` | Roda os 78 testes de integracao | Antes de commitar ou para validar mudancas |
| `stop` | Para e remove os containers Docker | Para liberar recursos ou reiniciar o ambiente |
| `logs` | Mostra logs dos containers em tempo real | Para debugar problemas nos containers |
| `status` | Mostra status dos containers | Para verificar se tudo esta saudavel |
| `k8s` | Aplica manifests Kubernetes no cluster | Para deploy em ambiente de producao |
| `help` | Mostra a lista de comandos | Para consulta rapida |

---

## 5. Guia por Cenario

### 5.1. Primeira vez — subir tudo com Docker (recomendado)

```bash
# 1. Configurar o .env
cp .env.example .env
# Editar .env e definir JWT_SECRET

# 2. Subir o ambiente completo
./start.sh docker
```

O que acontece:
1. Valida que `.env` existe e `JWT_SECRET` esta definido
2. Builda as imagens (Node.js multi-stage + Nginx)
3. Sobe 4 containers: Postgres, Redis, Node.js, Nginx
4. Aguarda healthchecks de todos os servicos
5. Exibe os endpoints disponiveis

**Resultado:**
```
[OK] Ambiente Docker iniciado com sucesso!

[INFO] Endpoints:
[INFO]   API:         http://localhost/api
[INFO]   Swagger:     http://localhost/api-docs
[INFO]   Health:      http://localhost/health
```

### 5.2. Primeira vez — ambiente local (sem Docker)

```bash
# 1. Configurar .env
cp .env.example .env
# Editar .env

# 2. Configurar o banco (cria role, banco, extensoes, migrations, seed)
./start.sh setup-db

# 3. Iniciar o servidor
./start.sh local
```

O que o `setup-db` faz:
1. Cria a role `hotel_app` no PostgreSQL
2. Cria o banco `hotel_db`
3. Concede permissoes (SELECT, INSERT, UPDATE, DELETE)
4. Ativa extensoes `uuid-ossp` e `btree_gist`
5. Instala dependencias (`npm install`)
6. Roda migrations (`node command.js migrate`)
7. Aplica seed (165 registros em 2 tenants)

### 5.3. Rodar os testes

```bash
./start.sh test
```

Executa a suite completa com **Vitest + Supertest** (78 testes de integracao com banco real):

| Arquivo de teste | Testes | O que cobre |
|-----------------|--------|-------------|
| auth.test.js | 12 | Register, login, JWT, multi-tenant |
| room-categories.test.js | 7 | CRUD + 404 |
| rooms.test.js | 12 | CRUD + /available |
| guests.test.js | 9 | CRUD + CPF unico por tenant |
| reservations.test.js | 20 | State machine completa, conflitos |
| payments.test.js | 7 | CRUD + DELETE |
| tenant-isolation.test.js | 13 | Isolamento entre tenants |

### 5.4. Gerenciar containers Docker

```bash
# Ver status dos containers
./start.sh status

# Ver logs em tempo real (Ctrl+C para sair)
./start.sh logs

# Parar tudo
./start.sh stop

# Reiniciar
./start.sh stop && ./start.sh docker
```

### 5.5. Resetar dados de teste

```bash
./start.sh seed
```

Aplica o seed idempotente (`ON CONFLICT DO NOTHING`) com:
- 2 tenants: Hotel Aurora + Pousada Sol
- 5 categorias de quarto
- 25 quartos
- 5 usuarios
- 60 hospedes
- 40 reservas
- 28 pagamentos

### 5.6. Deploy Kubernetes

```bash
# 1. Editar secrets (OBRIGATORIO antes de aplicar)
# Abrir k8s/secret.yaml e substituir os placeholders

# 2. Aplicar todos os manifests
./start.sh k8s
```

Aplica via `kubectl apply -k k8s/` (Kustomize) os 9 manifests:
- Namespace `hotel-system`
- ConfigMap + Secret
- PostgreSQL (StatefulSet + PVC)
- Redis (Deployment + PVC)
- Backend (Deployment, 3 replicas, PDB min 2)
- Nginx (Deployment + LoadBalancer)
- NetworkPolicies (3 regras de segmentacao)

---

## 6. Arquitetura dos Servicos (Docker Compose)

```
                   Porta 80 (unico acesso externo)
                        │
                        ▼
                  ┌───────────┐
                  │   Nginx   │  Reverse proxy + security headers
                  │           │  Rate limiting: 5r/m em /auth/login
                  └─────┬─────┘
                        │
                        ▼
                  ┌───────────┐
                  │  Node.js  │  API REST (31 endpoints)
                  │  :3000    │  JWT auth + tenant isolation
                  └──┬────┬──┘
                     │    │
              ┌──────┘    └──────┐
              ▼                  ▼
        ┌───────────┐     ┌───────────┐
        │ PostgreSQL│     │   Redis   │
        │  :5432    │     │  :6379    │
        │ 17        │     │  7-alpine │
        └───────────┘     └───────────┘

        Somente Nginx expoe porta para o host.
        Node, Postgres e Redis sao internos (hotel_network).
```

---

## 7. Solucao de Problemas

### "JWT_SECRET obrigatorio"
```bash
# Editar .env e definir um valor seguro
nano .env
# JWT_SECRET=minha_chave_secreta_segura_123
```

### Container nao sobe / healthcheck falha
```bash
# Ver logs detalhados
./start.sh logs

# Verificar status
./start.sh status

# Reiniciar do zero
./start.sh stop
docker volume rm sistema_hotel_prova_postgres_data sistema_hotel_prova_redis_data
./start.sh docker
```

### Porta 80 ja em uso
```bash
# Verificar o que esta usando a porta
sudo lsof -i :80

# Parar o servico conflitante ou alterar a porta no docker-compose.yml
```

### Banco nao conecta (modo local)
```bash
# Verificar se Postgres esta rodando
sudo systemctl status postgresql

# Verificar se o banco existe
sudo -u postgres psql -l | grep hotel

# Recriar tudo
./start.sh setup-db
```

### Testes falhando
```bash
# Verificar se .env.test existe e esta configurado
cat .env.test

# Rodar testes com output detalhado
npm test -- --reporter=verbose
```

---

*Guia gerado em 24/06/2026 por Weslley Lucas.*
