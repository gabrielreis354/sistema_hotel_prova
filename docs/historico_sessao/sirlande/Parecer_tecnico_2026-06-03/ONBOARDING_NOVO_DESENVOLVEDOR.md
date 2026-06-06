# 🎓 GUIA DE ONBOARDING
## Para Novo Desenvolvedor — Sistema de Gestão de Hotel

**Tempo estimado**: 1-2 horas (1ª vez)  
**Pré-requisitos**: Git, Node.js 20+, Docker, VS Code  
**Objetivo**: Clonar, configurar, rodar e entender o projeto

---

## 📋 Sumário

1. [Passo 1: Clonar Repositório](#passo-1-clonar-repositório)
2. [Passo 2: Instalar Dependências](#passo-2-instalar-dependências)
3. [Passo 3: Configurar Ambiente](#passo-3-configurar-ambiente)
4. [Passo 4: Iniciar Banco de Dados](#passo-4-iniciar-banco-de-dados)
5. [Passo 5: Executar Servidor](#passo-5-executar-servidor)
6. [Passo 6: Testar API](#passo-6-testar-api)
7. [Passo 7: Entender Arquitetura](#passo-7-entender-arquitetura)
8. [Passo 8: Criar Primeiro Endpoint](#passo-8-criar-primeiro-endpoint)
9. [Próximos Passos](#próximos-passos)
10. [Troubleshooting](#troubleshooting)

---

## 🔧 Passo 1: Clonar Repositório

```bash
# Clone do GitHub
git clone https://github.com/seu-usuario/sistema_hotel_prova.git

# Entre na pasta
cd sistema_hotel_prova

# Verifique estrutura
ls -la
# Deve mostrar: app/, routes/, db/, seed/, docker-compose.yml, package.json, etc.
```

**Tempo**: ~2 minutos  
**Status esperado**: ✅ Pasta clonada com sucesso

---

## 📦 Passo 2: Instalar Dependências

```bash
# Instalar npm packages
npm install

# Verificar versão
npm --version  # deve ser 10.x+
node --version # deve ser v20.x+
```

**Saída esperada**:
```
added 456 packages, and audited 457 packages in 45s
```

**Status esperado**: ✅ node_modules criada com 456 packages

---

## ⚙️ Passo 3: Configurar Ambiente

### 3.1 Copiar .env.example

```bash
cp .env.example .env
```

### 3.2 Verificar Conteúdo

```bash
cat .env
```

Deve conter:
```ini
NODE_ENV=development
NODE_WEB_PORT=3000
POSTGRES_HOST=localhost        # Mudar para 'postgres' se usar Docker
POSTGRES_PORT=5432
POSTGRES_DB=gestao_hotel
POSTGRES_USER=hotel_user
POSTGRES_PASSWORD=hotel_password
JWT_SECRET=sua_chave_secreta_aqui
```

### 3.3 Para Desenvolvimento (Recomendado: Docker)

Se usar **Docker Compose**, mude:
```ini
POSTGRES_HOST=postgres  # Container name
```

Se usar **PostgreSQL local**, deixe:
```ini
POSTGRES_HOST=localhost
```

**Status esperado**: ✅ Arquivo .env configurado

---

## 🗄️ Passo 4: Iniciar Banco de Dados

### Opção A: Docker Compose (Recomendado)

```bash
# Subir container PostgreSQL
docker compose up -d postgres

# Aguardar ~10 segundos para iniciar
sleep 10

# Verificar se está rodando
docker ps | grep postgres
# Deve retornar: hotel_postgres   postgres:17   ... Up
```

### Opção B: PostgreSQL Local

```bash
# Criar banco (Linux/Mac)
createdb -U postgres gestao_hotel

# Windows: abrir pgAdmin e criar banco manualmente
# Ou usar comando: createdb.exe -U postgres gestao_hotel
```

### 4.2 Executar Schema SQL

```bash
# Via Docker
docker exec hotel_postgres psql -U hotel_user -d gestao_hotel < db/schema.sql

# Via PostgreSQL local
psql -U postgres -d gestao_hotel < db/schema.sql

# Via Docker: alternativa
docker exec -i hotel_postgres psql -U hotel_user -d gestao_hotel -f /dev/stdin < db/schema.sql
```

**Saída esperada**:
```
CREATE EXTENSION
CREATE EXTENSION
CREATE TABLE
CREATE TABLE
... (mais CREATE TABLE)
```

**Status esperado**: ✅ Schema criado (8 tabelas)

### 4.3 Popular com Dados de Teste

```bash
# Via Docker
docker exec hotel_postgres psql -U hotel_user -d gestao_hotel < seed/seed_hotels.sql

# Via PostgreSQL local
psql -U postgres -d gestao_hotel < seed/seed_hotels.sql
```

**Saída esperada**:
```
BEGIN
INSERT 0 2
INSERT 0 2
INSERT 0 1
INSERT 0 1
INSERT 0 1
COMMIT
```

**Verificar dados**:
```bash
# Via Docker
docker exec hotel_postgres psql -U hotel_user -d gestao_hotel -c "SELECT * FROM hotels;"

# Deve retornar:
# id | name          | legal_id
# ---|---------------|------------------
#    | Hotel Aurora  | 00.000.000/0001-01
#    | Pousada Sol   | 00.000.000/0001-02
```

**Status esperado**: ✅ Banco populado

---

## 🚀 Passo 5: Executar Servidor

### 5.1 Iniciar Node.js

```bash
# Desenvolvimento (com hot-reload)
npm run dev

# Saída esperada:
# ==================================================
# 🚀 Servidor Hotel PMS rodando com sucesso!
# 📡 URL Local: http://localhost:3000
# 💾 Banco de Dados PostgreSQL conectado via Sequelize
# ==================================================
```

### 5.2 Em Paralelo: Subir Nginx + PostgreSQL (Docker)

Abrir outro terminal:
```bash
# Se ainda não subiu node + nginx
docker compose up -d nginx

# Ou subir TUDO:
docker compose up --build

# Verificar status
docker compose ps
```

**Status esperado**: ✅ Servidor rodando em http://localhost:3000

---

## 🧪 Passo 6: Testar API

### 6.1 Health Check

```bash
curl http://localhost:3000/health

# Resposta esperada:
# {
#   "status":"OK",
#   "timestamp":"2026-06-03T10:00:00.000Z",
#   "service":"Sistema de Gestão de Hotel Backend"
# }
```

### 6.2 Swagger (Documentação Interativa)

Abrir no navegador:
```
http://localhost/api-docs
```

(ou `http://localhost:3000/api-docs` se sem Docker)

**Esperado**: Página com documentação OpenAPI 3.0 de todos endpoints

### 6.3 Testar Login

```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email":"admin@aurora.example",
    "password":"HASHED_PASSWORD_PLACEHOLDER"
  }'

# Nota: Seed usa placeholder, mas é apenas para demo
# Em produção, testar com password hasheado correto
```

**Se seed falhar**: Criar usuário manual:

```bash
# Entrar no banco
docker exec -it hotel_postgres psql -U hotel_user -d gestao_hotel

# SQL:
INSERT INTO hotels (name, legal_id) VALUES ('Hotel Aurora', '00.000.000/0001-01');

# Copiar ID do hotel (SELECT * FROM hotels;)

INSERT INTO users (hotel_id, name, email, password_hash, role) 
VALUES (
  'HOTEL_ID_AQUI',
  'Admin Local',
  'admin@aurora.example',
  '$2a$10$...',  -- hash bcrypt válido
  'ADMIN'
);

\q  # sair
```

### 6.4 Listar Usuários (com JWT)

```bash
# 1. Fazer login (deve funcionar, volta um token)
TOKEN=$(curl -s -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@aurora.example","password":"senha"}' \
  | grep -o '"token":"[^"]*' | cut -d'"' -f4)

echo "Token: $TOKEN"

# 2. Usar token para acessar /users
curl -H "Authorization: Bearer $TOKEN" \
     http://localhost:3000/users

# Resposta esperada: [{...user objects...}]
```

**Status esperado**: ✅ API responde corretamente

---

## 🏗️ Passo 7: Entender Arquitetura

### 7.1 Ler Documentação

Abrir estes arquivos IN ORDER:

1. **[README_PROFISSIONAL.md](README_PROFISSIONAL.md)** (10 min)
   - Visão geral do projeto
   - Tech stack
   - Estrutura básica

2. **[README_BACKEND_DESENVOLVIMENTO.md](README_BACKEND_DESENVOLVIMENTO.md)** (20 min)
   - Controllers
   - Models
   - Padrões de código

3. **[docs/CODING_STANDARDS.md](docs/CODING_STANDARDS.md)** (10 min)
   - Padrões JavaScript
   - Convenções de nome
   - Estrutura de arquivo

### 7.2 Explorar Código

Abrir em VS Code:

```bash
code .
```

Navegar por:
- `app/Controllers/AuthApi/LoginController.js` — Entender padrão
- `app/Models/UserModel.js` — Entender ORM
- `routes/apis/authRouter.js` — Entender roteamento
- `database/relations.js` — Entender relacionamentos

### 7.3 Diagrama Mental

```
Usuário faz POST /auth/login
         ↓
routes/router.js → authRouter
         ↓
authRouter → LoginController.js
         ↓
Extrai email/password do request
         ↓
UserModel.findOne({ where: { email } })
         ↓
Compara password com bcryptjs
         ↓
Se OK: gera JWT com jwt.sign()
         ↓
Retorna { token, user }
```

**Status esperado**: ✅ Entender fluxo login

---

## 💻 Passo 8: Criar Primeiro Endpoint

### Desafio: Criar GET /guests/count (listar Total de hóspedes)

#### 8.1 Criar Controller

Criar arquivo:
```bash
touch app/Controllers/GuestApi/CountGuestController.js
```

Conteúdo:
```javascript
import GuestModel from '../../Models/GuestModel.js';

export default async function CountGuestController(request, response) {
    try {
        const tenantId = request.user.tenantId;

        const count = await GuestModel.count({
            where: { tenant_id: tenantId }
        });

        return response.json({ total_guests: count });

    } catch (error) {
        console.error(error);
        return response.status(500).json({ error: 'Erro interno' });
    }
}
```

#### 8.2 Adicionar Rota

Editar `routes/apis/guestRouter.js`:

```javascript
import CountGuestController from '../../app/Controllers/GuestApi/CountGuestController.js';

// Após outras rotas:
router.get('/count', CountGuestController);
```

#### 8.3 Testar

```bash
# Com token válido:
curl -H "Authorization: Bearer $TOKEN" \
     http://localhost:3000/guests/count

# Resposta esperada:
# {"total_guests":1}
```

#### 8.4 Documentar (Opcional para aprendizado)

Adicionar em `config/swagger.js`:
```javascript
'/guests/count': {
    get: {
        tags: ['Guests'],
        summary: 'Contar total de hóspedes',
        responses: {
            '200': {
                description: 'Total de hóspedes',
                content: {
                    'application/json': {
                        schema: {
                            type: 'object',
                            properties: {
                                total_guests: { type: 'integer' }
                            }
                        }
                    }
                }
            }
        }
    }
}
```

**Status esperado**: ✅ Novo endpoint funciona

---

## 🎯 Próximos Passos

Após completar onboarding:

1. **Entender 25+ Controllers restantes**
   - Tempo: 2-3 horas
   - Objetivo: Familiarizar com padrões
   - Forma: Ler cada um, nenhum é complexo

2. **Criar 3-5 Endpoints Novos**
   - Objetivo: Ganhar confiança
   - Exemplos:
     - GET /rooms/available (quartos disponíveis)
     - GET /reservations/by-date (reservas por data)
     - POST /guests/{id}/visits (histórico visitas)

3. **Executar Testes Manuais**
   - Usar Swagger ou curl
   - Testar fluxos:
     - Register → Login → Create Guest → Create Reservation → Check-in

4. **Ler Código de Produção**
   - Entender deploy Docker
   - Entender Nginx config
   - Entender variáveis de produção

5. **Contribuir com Melhorias**
   - Sugerir otimizações
   - Relatar bugs
   - Propor novos features

---

## 🔧 Troubleshooting

### ❌ Erro: "Porta 3000 já em uso"

```bash
# Linux/Mac:
lsof -i :3000
kill -9 <PID>

# Windows (PowerShell):
netstat -ano | findstr :3000
taskkill /PID <PID> /F

# Ou mudar porta em .env:
NODE_WEB_PORT=3001
```

---

### ❌ Erro: "relation tenants does not exist"

**Causa**: Schema usa "hotels" mas Model usa "tenants"

**Solução**:
```bash
# Editar Model:
# app/Models/TenantModel.js linha ~18:
tableName: 'hotels',  # ← mude 'tenants' para 'hotels'

# Depois executar schema novamente:
docker exec hotel_postgres psql -U hotel_user -d gestao_hotel < db/schema.sql
```

---

### ❌ Erro: "password authentication failed"

**Causa**: POSTGRES_PASSWORD em .env não combina com docker-compose

**Solução**:
```bash
# Verificar .env
cat .env | grep POSTGRES_PASSWORD

# Verificar docker-compose.yml
cat docker-compose.yml | grep POSTGRES_PASSWORD

# Devem combinar. Se não, editar .env:
POSTGRES_PASSWORD=hotel_password
```

---

### ❌ Erro: "Cannot find module 'express'"

**Causa**: npm install não executado

**Solução**:
```bash
npm install
```

---

### ❌ Swagger não carrega

**Causa**: Erro em config/swagger.js

**Solução**:
```bash
# Ver erro no console
npm run dev 2>&1 | grep swagger

# Revisar config/swagger.js por erros JSON
# Verificar: todas as aspas, vírgulas, chaves
```

---

### ⚠️ Seed Incompleto

**Problema**: seed_hotels.sql usa placeholder "HASHED_PASSWORD_PLACEHOLDER"

**Solução**:

Opção 1: Criar usuário via API
```bash
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "tenantName":"Seu Hotel",
    "name":"Seu Nome",
    "email":"seu@email.com",
    "password":"SenhaForte123!"
  }'
```

Opção 2: Gerar hash bcrypt correto
```bash
# Node.js:
node -e "const bcrypt = require('bcryptjs'); console.log(bcrypt.hashSync('senha123', 10))"

# Copiar hash
# Editar seed_hotels.sql com hash real
# Re-executar seed
```

---

## ✅ Checklist Final

Após completar todos passos:

- [ ] Código clonado e pasta estruturada
- [ ] npm install executado com sucesso
- [ ] .env configurado
- [ ] Docker Compose rodando (ou PostgreSQL local)
- [ ] Schema criado (8 tabelas)
- [ ] Dados seed populados
- [ ] Servidor npm run dev rodando
- [ ] Health check OK
- [ ] Swagger acessível
- [ ] Login funcionando
- [ ] /users endpoint respondendo
- [ ] README_PROFISSIONAL.md lido
- [ ] README_BACKEND_DESENVOLVIMENTO.md lido
- [ ] CODING_STANDARDS.md compreendido
- [ ] Primeiro endpoint criado (GET /guests/count)
- [ ] Novo endpoint testado com sucesso

**Parabéns!** 🎉 Você está pronto para contribuir ao projeto.

---

## 📞 Suporte

Dúvidas?

1. Releia [Troubleshooting](#troubleshooting) acima
2. Consulte [README_BACKEND_DESENVOLVIMENTO.md](README_BACKEND_DESENVOLVIMENTO.md)
3. Verifique logs: `npm run dev` mostra tudo
4. Procure no Google: "[erro específico] Express Sequelize"
5. Abra Issue no repositório

---

**Tempo total estimado**: 90-120 minutos (1ª vez)  
**Tempo em futuras setup**: ~30 minutos

Boa sorte! 💪

