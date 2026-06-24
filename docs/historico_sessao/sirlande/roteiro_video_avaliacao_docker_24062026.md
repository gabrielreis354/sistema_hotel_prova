# Roteiro de Vídeo — Avaliação Técnica: Infraestrutura de Sistemas Web
## Opção A: Docker / Orquestração Local

**Data:** 24/06/2026
**Autora:** Sirlande
**Branch:** develop
**Duração alvo:** 6–8 minutos

---

## Papéis no Projeto (quem fez o quê)

| Dev | Área de responsabilidade |
|---|---|
| **Gabriel** | Arquitetura do sistema, API REST (controllers, rotas, autenticação JWT), modelagem de negócio (máquina de estados, multi-tenancy), testes de integração, orquestração geral do projeto |
| **Weslley** | Infraestrutura Docker (Dockerfile multi-stage, docker-compose.yml, script infra_up.sh), Kubernetes, configuração de rede e segurança de contêineres |
| **Sirlande** | Banco de dados (modelos Sequelize, schema, migrations, seed), segurança do banco (isolamento por tenant_id, constraints, extensões PostgreSQL), reviews de segurança |

---

## Estrutura do Vídeo

```
[00:00] INTRODUÇÃO     — Gabriel        ~1 min
[01:00] INFRA DOCKER   — Weslley       ~2,5 min
[03:30] BD + SEGURANÇA — Sirlande      ~2 min
[05:30] SISTEMA VIVO   — Gabriel       ~1,5 min
[07:00] CONCLUSÃO      — Sirlande      ~30–45 s
```

---

---

## [00:00 – 01:00] INTRODUÇÃO — Gabriel (≈ 1 minuto)

### O que mostrar na tela
Repositório Git aberto no GitHub ou terminal com `git log --oneline -5`.

### Fala

> "Olá, professor Alexandre. Sou o Gabriel, e aqui estão meus colegas Weslley e Sirlande.
>
> Nosso projeto é o **Sistema de Gestão de Hotel** — uma API REST para pousadas e hotéis,
> construída como SaaS multi-tenant: cada hotel cadastrado opera em isolamento total,
> sem acesso aos dados dos outros.
>
> Escolhemos a **Opção A: Docker / Orquestração Local**. Toda a infraestrutura roda
> via Docker Compose — quatro serviços em rede bridge customizada com DNS interno.
>
> Vou passar a palavra para o Weslley, que vai mostrar a infraestrutura."

### Comandos a rodar (tela do terminal)

```bash
# Mostrar os últimos commits para contextualizar
git log --oneline -5

# Mostrar os arquivos principais de infraestrutura
ls Dockerfile docker-compose.yml scripts/infra_up.sh .dockerignore .env.example
```

---

---

## [01:00 – 03:30] INFRA DOCKER — Weslley (≈ 2,5 minutos)

### O que mostrar na tela
Terminal + editor de texto mostrando os arquivos de infra.

### Fala — Parte 1: Dockerfile (≈ 45 s)

> "Boa tarde. Sou o Weslley, responsável pela infraestrutura Docker.
>
> Vamos começar pelo Dockerfile. Usamos **multi-stage build** com dois estágios:
> o primeiro instala apenas as dependências de produção — sem devDependencies —
> e o segundo copia só o artefato pronto para a imagem final.
>
> As instruções estão ordenadas para maximizar o cache do Docker:
> o `package.json` é copiado antes do código-fonte, então o `npm ci` só roda
> de novo quando as dependências mudam, não a cada alteração de código.
>
> A imagem final roda como usuário `node`, nunca como root."

### Comandos a rodar

```bash
# Mostrar o Dockerfile inteiro
cat Dockerfile
```

**Saída esperada (mostrar ao professor):**
```
# Stage 1: deps
FROM node:24-alpine AS deps
WORKDIR /app
COPY package*.json ./          ← package.json ANTES do COPY . .
RUN npm ci --omit=dev          ← só produção, sem devDependencies

# Stage 2: runner
FROM node:24-alpine AS runner
COPY --from=deps /app/node_modules ./node_modules
COPY . .
USER node                      ← não-root
EXPOSE 3000
HEALTHCHECK ...
```

```bash
# Mostrar o .dockerignore — o que NÃO vai para o daemon
cat .dockerignore
```

---

### Fala — Parte 2: docker-compose.yml e rede (≈ 45 s)

> "No docker-compose.yml declaramos quatro serviços em estrutura multicamada:
> PostgreSQL como banco, Redis como cache, Node.js como API, e Nginx como
> proxy reverso — o único ponto de entrada externo.
>
> Todos na mesma rede bridge customizada `hotel_network`. A comunicação entre serviços
> usa o **nome do serviço** como hostname — DNS interno do Docker. Nenhum IP fixo.
>
> O banco e o Redis não têm nenhuma porta mapeada no host — são invisíveis externamente.
> Somente o Nginx expõe a porta 80."

### Comandos a rodar

```bash
# Mostrar o docker-compose.yml completo
cat docker-compose.yml
```

**Pontos para destacar ao professor:**
```yaml
networks:
  hotel_network:
    driver: bridge    ← rede bridge customizada

volumes:
  postgres_data:      ← named volume (não bind mount)
  redis_data:

services:
  postgres:
    # sem "ports:" — inacessível do host
  redis:
    # sem "ports:" — inacessível do host
  node_web:
    environment:
      POSTGRES_HOST: postgres   ← DNS interno, não IP
      REDIS_URL: redis://redis:6379
    # sem "ports:" — acessível só via nginx
  nginx:
    ports:
      - "80:80"                 ← único ponto de entrada externo
```

---

### Fala — Parte 3: Pipeline infra_up.sh (≈ 60 s)

> "Para fechar, o script `infra_up.sh` é nosso pipeline local de CI/CD.
> Ele executa em quatro fases: build da imagem com tag versionada,
> geração das tags, deploy com docker compose, e migrations automáticas.
> Vou rodar agora."

### Comandos a rodar

```bash
# Executar o pipeline completo
bash scripts/infra_up.sh
```

**Saída esperada (mostrar ao professor):**
```
=== FASE 1: BUILD DA IMAGEM ===
[INFO]  Versão: build-20260624-...
Step 1/N : FROM node:24-alpine AS deps
...
Successfully built <hash>
[OK]    Build concluído: sistema-gestao-hotel-backend:build-...
[INFO]  Tamanho da imagem: ~120 MB (multi-stage build)

=== FASE 2: REGISTRO DE TAGS ===
REPOSITORY                        TAG      IMAGE ID   SIZE
sistema-gestao-hotel-backend      latest   abc123     120MB

=== FASE 3: DEPLOY — docker compose up ===
[+] Running 4/4
 ✔ Container hotel_postgres  Started
 ✔ Container hotel_redis     Started
 ✔ Container hotel_node      Started
 ✔ Container hotel_nginx     Started

=== FASE 4: MIGRATIONS ===
✅ Migrations executadas com sucesso.

============================================================
INFRAESTRUTURA PRONTA
```

```bash
# Confirmar serviços rodando
docker compose ps
```

---

---

## [03:30 – 05:30] BANCO DE DADOS E SEGURANÇA — Sirlande (≈ 2 minutos)

### O que mostrar na tela
Terminal com comandos Docker + resultado das consultas.

### Fala — Parte 1: Named Volumes e Persistência (≈ 60 s)

> "Olá, sou a Sirlande, responsável pelo banco de dados.
>
> Os dados do PostgreSQL e do Redis ficam em **Named Volumes** gerenciados pelo Docker —
> nunca em bind mounts. Isso garante que os dados sobrevivam à recriação dos contêineres.
>
> Vou demonstrar: primeiro verifico quantos registros temos no banco,
> depois reinicio o PostgreSQL e confirmo que os dados persistiram."

### Comandos a rodar

```bash
# Ver os volumes nomeados
docker volume ls | grep -E "postgres_data|redis_data"
```

**Saída esperada:**
```
local     sistema_hotel_prova_postgres_data
local     sistema_hotel_prova_redis_data
```

```bash
# Contar registros ANTES do restart
docker compose exec postgres psql -U hotel_user -d gestao_hotel \
  -c "SELECT COUNT(*) AS total_registros FROM tenants;"
```

**Saída esperada:**
```
 total_registros
-----------------
               2
```

```bash
# Reiniciar o container do PostgreSQL
docker compose restart postgres

# Aguardar 5 segundos o banco voltar
sleep 5

# Contar registros DEPOIS do restart — deve ser o mesmo valor
docker compose exec postgres psql -U hotel_user -d gestao_hotel \
  -c "SELECT COUNT(*) AS total_registros FROM tenants;"
```

**Saída esperada (igual à anterior):**
```
 total_registros
-----------------
               2
```

> "O número é idêntico. Os dados sobreviveram à reinicialização — o Named Volume garante isso."

---

### Fala — Parte 2: Segurança — Banco Inacessível Externamente (≈ 60 s)

> "Agora vou demonstrar o isolamento de rede.
>
> O PostgreSQL não tem nenhuma porta mapeada no host. Qualquer tentativa de
> conectar diretamente na porta 5432 do localhost deve ser recusada.
> O banco só é acessível pelos contêineres dentro da rede `hotel_network`."

### Comandos a rodar

```bash
# Tentativa de conexão DIRETA ao banco — deve FALHAR (connection refused)
# Pressione Ctrl+C após ver o erro
psql -h localhost -p 5432 -U hotel_user -d gestao_hotel
```

**Saída esperada (comportamento CORRETO):**
```
psql: error: connection to server on socket... failed:
Connection refused
```

```bash
# Inspecionar a rede — confirmar DNS e contêineres conectados
docker network inspect sistema_hotel_prova_hotel_network \
  --format '{{range .Containers}}  • {{.Name}} → {{.IPv4Address}}{{"\n"}}{{end}}'
```

**Saída esperada:**
```
  • hotel_nginx    → 172.20.0.5/16
  • hotel_node     → 172.20.0.4/16
  • hotel_redis    → 172.20.0.3/16
  • hotel_postgres → 172.20.0.2/16
```

> "Todos os serviços estão na rede bridge interna com IPs privados.
> O banco é acessível SOMENTE por nome de serviço, dentro da rede,
> pelos outros contêineres — nunca diretamente da internet."

---

---

## [05:30 – 07:00] SISTEMA EM FUNCIONAMENTO — Gabriel (≈ 1,5 minutos)

### O que mostrar na tela
Terminal + navegador abrindo o Swagger.

### Fala

> "Com a infra validada, vou mostrar o sistema funcionando de ponta a ponta.
>
> O Nginx é o único ponto de entrada — porta 80. Todas as requisições passam por ele
> antes de chegar à API Node.js."

### Comandos a rodar

```bash
# Health check — API respondendo via Nginx
curl http://localhost/health
```

**Saída esperada:**
```json
{"status":"OK","timestamp":"2026-06-24T...","service":"Sistema de Gestão de Hotel Backend"}
```

```bash
# Verificar logs do Nginx (prova que requisição passou por ele)
docker compose logs nginx --tail=5
```

**Saída esperada:**
```
hotel_nginx  | 172.20.0.1 - - [24/Jun/2026] "GET /health HTTP/1.1" 200 ...
```

### No navegador (mostrar ao professor)

Abrir `http://localhost/api-docs` — Swagger interativo completo.

> "Aqui está a documentação completa de todos os endpoints.
> Vou fazer um registro rápido para provar que o sistema está 100% funcional."

```bash
# Registrar um hotel (tenant) e usuário admin
curl -s -X POST http://localhost/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "tenantName": "Hotel Avaliação",
    "name": "Admin Teste",
    "email": "admin@avaliacao.com",
    "password": "senha123"
  }' | jq '.tenant.name, .user.role'
```

**Saída esperada:**
```
"Hotel Avaliação"
"ADMIN"
```

```bash
# Login e captura do token JWT
TOKEN=$(curl -s -X POST http://localhost/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@avaliacao.com",
    "password": "senha123"
  }' | jq -r '.token')

echo "Token obtido: ${TOKEN:0:30}..."

# Listar quartos (rota autenticada)
curl -s http://localhost/rooms \
  -H "Authorization: Bearer $TOKEN" | jq 'length'
```

---

---

## [07:00 – 07:45] CONCLUSÃO — Sirlande (≈ 45 segundos)

### Fala

> "Para encerrar, um resumo do que demonstramos e como cada critério da avaliação
> foi atendido."

### Mostrar na tela — tabela de critérios (pode ser o documento aberto)

| Critério (peso) | Como atendemos | Status |
|---|---|---|
| **Eficiência da Imagem (20%)** | Multi-stage build, .dockerignore, layer caching, USER node | ✅ |
| **Arquitetura de Rede (25%)** | Custom bridge `hotel_network`, DNS interno por nome, DB sem porta exposta | ✅ |
| **Persistência de Dados (20%)** | Named Volumes `postgres_data` e `redis_data`, testado ao vivo | ✅ |
| **Segurança (20%)** | .env + :? obrigatório, banco inacessível externamente, imagem não-root | ✅ |
| **Automação CI/CD (15%)** | `scripts/infra_up.sh` — build → tag → deploy → migrate | ✅ |

> "O ambiente pode ser destruído com `docker compose down -v` e reconstruído
> do zero com `bash scripts/infra_up.sh` — infraestrutura como código, reproduzível.
>
> Obrigada, professor. Nosso repositório está público com todos os artefatos:
> `Dockerfile`, `docker-compose.yml`, `.dockerignore`, `readmevideo.md` e o script `infra_up.sh`."

---

---

## Checklist Pré-Gravação

- [ ] Docker Desktop rodando e com compose plugin instalado
- [ ] `.env` criado com `POSTGRES_PASSWORD` e `JWT_SECRET` definidos
- [ ] `docker compose down -v` rodado antes para começar do zero
- [ ] `docker images | grep sistema` limpo antes da gravação
- [ ] `jq` instalado no WSL2 (`sudo apt install jq`)
- [ ] Swagger testado no navegador antes da gravação
- [ ] Microfone e screen capture testados

---

## Comandos de Backup (se algo falhar durante a gravação)

```bash
# Se infra_up.sh travar — subir manualmente
docker compose up -d
sleep 15
docker compose exec node_web node command.js migrate

# Se psql não estiver instalado no host para o teste de segurança
# Use nc (netcat) como alternativa:
nc -zv localhost 5432
# Resultado esperado: "Connection refused"

# Se curl não retornar JSON formatado (jq não instalado)
curl http://localhost/health
# Retorno bruto também é válido como evidência
```

---

*Relatório de sessão — Sirlande — 24/06/2026*
*Branch: develop*
*Artefatos criados: `scripts/infra_up.sh`, `readmevideo.md`*
