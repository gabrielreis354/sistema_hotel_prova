# Sistema de Gestão de Hotel — Backend API

> Projeto Acadêmico (TCC) — Unifaat 2026
> API REST multi-tenant para gerenciamento hoteleiro.
> Infraestrutura: **Kubernetes (orquestração local via Docker Desktop ou Minikube)**

---

## Índice

- [Parte 1 — Sobre o Projeto](#parte-1--sobre-o-projeto)
- [Parte 2 — Infraestrutura e Ambiente](#parte-2--infraestrutura-e-ambiente)
  - [Pré-requisitos](#pré-requisitos)
  - [Configuração (ConfigMap e Secret)](#configuração-configmap-e-secret)
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
| Orquestração | Kubernetes | — |
| Infraestrutura local | Docker Desktop (K8s integrado) ou Minikube | — |

## Infraestrutura — Kubernetes

O ambiente de execução é **Kubernetes**, aplicado via `kustomize` a partir dos manifests em `k8s/`. Cada componente do sistema roda como um recurso K8s dedicado — Deployment, Service, ConfigMap, Secret, PVC — dentro do namespace `hotel-system`.

O `docker-compose.yml` ainda está disponível no repositório exclusivamente como apoio para rodar os **testes automatizados** localmente (os testes precisam de PostgreSQL em `localhost:5432`).

---

# Parte 2 — Infraestrutura e Ambiente

## Pré-requisitos

| Ferramenta | Para que serve | Como verificar |
|---|---|---|
| Docker Desktop | Construir a imagem da aplicação | `docker --version` |
| Kubernetes habilitado | Executar o cluster local | `kubectl version --client` |
| kubectl | Aplicar e inspecionar os manifests | `kubectl cluster-info` |
| Git | Clonar o repositório | `git --version` |

**Duas opções de cluster local:**

- **Docker Desktop** (recomendado no Windows/WSL2): vá em _Settings → Kubernetes → Enable Kubernetes_ e aguarde o cluster subir. Não precisa de configuração extra.
- **Minikube**: alternativa multiplataforma. Onde o passo a passo difere para Minikube, há uma nota indicando o comando alternativo.

> Node.js **não precisa** estar instalado para rodar a aplicação — apenas para executar os testes automatizados.

---

## Configuração (ConfigMap e Secret)

No Kubernetes, variáveis de ambiente são separadas em dois recursos:

**`k8s/configmap.yaml` — variáveis não sensíveis:**

| Variável | Valor |
|---|---|
| `NODE_ENV` | `production` |
| `NODE_WEB_PORT` | `3000` |
| `POSTGRES_HOST` | `postgres` (nome do Service interno) |
| `POSTGRES_PORT` | `5432` |
| `POSTGRES_DB` | `gestao_hotel` |
| `POSTGRES_USER` | `hotel_user` |

**`k8s/secret.yaml` — variáveis sensíveis:**

| Variável | Valor padrão (acadêmico) |
|---|---|
| `POSTGRES_PASSWORD` | `hotel_password` |
| `JWT_SECRET` | `pms_hotel_secreto_academico_2026` |

> Em produção, substitua os valores do `secret.yaml` por credenciais reais e **nunca commite o arquivo com senhas reais**. Para este projeto acadêmico os valores estão no repositório para facilitar a avaliação.

Não é necessário criar arquivo `.env` para rodar no Kubernetes — a configuração está inteiramente nos manifests `k8s/`.

---

## Como Subir o Ambiente (How to Up)

Siga os passos na ordem. Do zero ao cluster funcionando em menos de 5 minutos.

### Passo 1 — Clonar o repositório

```bash
git clone https://github.com/gabrielreis354/sistema_hotel_prova.git
cd sistema_hotel_prova
```

### Passo 2 — Construir a imagem do backend

O Kubernetes não faz build automático — a imagem precisa existir localmente antes de aplicar os manifests.

```bash
docker build -t sistema-gestao-hotel-backend:latest .
```

O `Dockerfile` usa **Multi-stage Build**:

```
Estágio deps   → node:24-alpine  |  npm ci --omit=dev  (só dependências de produção)
Estágio runner → node:24-alpine  |  copia node_modules + código-fonte
```

Resultado: imagem enxuta (~120 MB), sem ferramentas de build, rodando como usuário não-root (`USER node`).

> **Se estiver usando Minikube**, a imagem precisa ser carregada no cluster antes de aplicar:
> ```bash
> minikube image load sistema-gestao-hotel-backend:latest
> ```
> No Docker Desktop isso não é necessário — o cluster usa o mesmo daemon Docker do host.

### Passo 3 — Aplicar todos os manifests com Kustomize

```bash
kubectl apply -k k8s/
```

Este único comando cria em sequência:
1. Namespace `hotel-system`
2. ConfigMap `hotel-config` (variáveis de ambiente)
3. Secret `hotel-secret` (credenciais)
4. PostgreSQL: PVC (1 Gi) + Deployment + Service (ClusterIP)
5. Backend: Deployment (3 réplicas) + Service (ClusterIP)
6. Nginx: ConfigMap + Deployment + Service (LoadBalancer, porta 80)
7. PodDisruptionBudget do backend (mínimo 2 réplicas disponíveis)
8. NetworkPolicies de isolamento de rede

### Passo 4 — Aguardar os Pods ficarem prontos

```bash
kubectl get pods -n hotel-system -w
```

Aguarde até todos aparecerem como `Running` e `Ready`:

```
NAME                        READY   STATUS    RESTARTS
postgres-xxxxxxx            1/1     Running   0
backend-xxxxxxx             1/1     Running   0
backend-xxxxxxx             1/1     Running   0
backend-xxxxxxx             1/1     Running   0
nginx-xxxxxxx               1/1     Running   0
```

Ou espere automaticamente com timeout:

```bash
kubectl wait --for=condition=ready pod --all -n hotel-system --timeout=120s
```

### Passo 5 — Executar as migrations

Com o cluster rodando, crie todas as tabelas no banco:

```bash
kubectl exec -n hotel-system deploy/backend -- node command.js migrate
```

Saída esperada:

```
✅ Conexão com o banco de dados estabelecida.
✅ Migrations executadas com sucesso. Todas as tabelas estão atualizadas.
```

### Passo 6 — (Opcional) Popular com dados de exemplo

```bash
kubectl exec -n hotel-system -i deploy/postgres -- \
  psql -U hotel_user -d gestao_hotel < seed/seed_hotels.sql
```

Cria 165 registros distribuídos entre 2 hotéis com quartos, hóspedes, reservas e pagamentos prontos para uso.

### Passo 7 — Verificar o sistema

**No Docker Desktop** (LoadBalancer resolve automaticamente em `localhost`):

```bash
curl http://localhost/health
```

**No Minikube** (precisa de tunnel para LoadBalancer):

```bash
# Em um terminal separado (mantém o túnel aberto):
minikube tunnel

# Em outro terminal:
curl http://localhost/health
```

Resposta esperada:

```json
{ "status": "OK", "timestamp": "...", "service": "Sistema de Gestão de Hotel Backend" }
```

Acesse a documentação completa da API: **http://localhost/api-docs**

---

## Detalhamento Técnico da Infraestrutura

### Recursos Kubernetes e suas funções

| Recurso | Nome | Réplicas | Função |
|---|---|---|---|
| Namespace | `hotel-system` | — | Isolamento lógico de todos os recursos do projeto |
| ConfigMap | `hotel-config` | — | Variáveis de ambiente não sensíveis |
| Secret | `hotel-secret` | — | Credenciais do banco e JWT secret |
| PVC | `postgres-data` | — | Volume persistente de 1 Gi para o PostgreSQL |
| Deployment + Service | `postgres` | 1 | Banco de dados (ClusterIP:5432) |
| Deployment + Service | `backend` | **3** | API REST Node.js (ClusterIP:3000) |
| Deployment + Service | `nginx` | 1 | Proxy reverso — único ponto de entrada (LoadBalancer:80) |
| PodDisruptionBudget | `backend-pdb` | — | Garante mínimo de 2 réplicas durante atualizações |
| NetworkPolicy | `postgres-ingress` | — | Permite conexão ao banco somente do backend |
| NetworkPolicy | `backend-ingress` | — | Permite conexão ao backend somente do nginx |

### Arquitetura de rede dentro do cluster

```
Externo (localhost:80)
        |
   [ nginx Service — LoadBalancer ]
        |
   [ nginx Pod ]
        | (NetworkPolicy: só nginx → backend)
   [ backend Service — ClusterIP:3000 ]
        |
   [ backend Pod ] × 3 réplicas
        | (NetworkPolicy: só backend → postgres)
   [ postgres Service — ClusterIP:5432 ]
        |
   [ postgres Pod ]
        |
   [ PVC postgres-data — 1 Gi ]
```

- **Nginx** é o único componente acessível de fora do cluster (via LoadBalancer)
- **Backend e PostgreSQL** são `ClusterIP` — invisíveis ao host
- **NetworkPolicies** garantem que nem nginx nem outros pods possam acessar diretamente o banco

### Por que 3 réplicas no backend?

O backend é **stateless** (não guarda estado entre requisições — toda sessão está no JWT). Isso permite replicação horizontal sem risco de inconsistência. O Kubernetes distribui as requisições entre as 3 réplicas automaticamente via o `backend` Service.

O PodDisruptionBudget (`minAvailable: 2`) garante que durante uma atualização ou falha de nó, pelo menos 2 réplicas continuem respondendo — zero downtime.

### Persistência de dados (PersistentVolumeClaim)

O PostgreSQL usa um PVC de 1 Gi gerenciado pelo cluster. Os dados **sobrevivem** à remoção e recriação do Pod — o volume só é apagado ao deletar explicitamente o PVC:

```bash
kubectl delete pvc postgres-data -n hotel-system
```

### Configuração e segredos no Kubernetes

| Tipo | Recurso | O que armazena |
|---|---|---|
| ConfigMap | `hotel-config` | Variáveis não sensíveis (host, porta, nome do banco) |
| Secret | `hotel-secret` | `POSTGRES_PASSWORD` e `JWT_SECRET` |

Os Pods leem essas variáveis via `envFrom` (ConfigMap) e `env.valueFrom.secretKeyRef` (Secret). Nenhuma credencial está hardcoded nas imagens.

### Otimização da imagem Docker (Multi-stage Build)

```
Estágio deps   → node:24-alpine  |  npm ci --omit=dev
Estágio runner → node:24-alpine  |  copia node_modules + código-fonte
                                    USER node (não-root)
                                    EXPOSE 3000
```

O `.dockerignore` exclui do build: `node_modules/`, `tests/`, `docs/`, `k8s/`, `.git/`, `.env`, `*.md`.

### Segurança

| Medida | Implementação |
|---|---|
| Banco inacessível externamente | `postgres` Service é ClusterIP — sem porta no host |
| Backend inacessível externamente | `backend` Service é ClusterIP |
| Isolamento via NetworkPolicy | postgres só aceita de backend; backend só aceita de nginx |
| Credenciais em Secret K8s | Separadas do código e do ConfigMap |
| Imagem não-root | `USER node` no Dockerfile |
| Multi-tenancy | `tenant_id` em todas as tabelas e queries |

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
├── Dockerfile                # Multi-stage build (deps + runner) — gera a imagem do backend
├── docker-compose.yml        # Ambiente alternativo — usado apenas para testes automatizados
├── .dockerignore             # Exclui arquivos desnecessários do build
├── .env.example              # Template de variáveis de ambiente (para uso com Docker Compose)
│
├── k8s/                      # Manifests Kubernetes (ambiente principal)
│   ├── kustomization.yaml    #   Ponto de entrada do kustomize (kubectl apply -k k8s/)
│   ├── namespace.yaml        #   Namespace hotel-system
│   ├── configmap.yaml        #   Variáveis de ambiente não sensíveis
│   ├── secret.yaml           #   Credenciais (POSTGRES_PASSWORD, JWT_SECRET)
│   ├── postgres.yaml         #   PVC + Deployment + Service do PostgreSQL
│   ├── backend.yaml          #   Deployment (3 réplicas) + Service do Node.js
│   ├── nginx.yaml            #   ConfigMap nginx + Deployment + Service LoadBalancer
│   ├── pdb.yaml              #   PodDisruptionBudget (mínimo 2 réplicas do backend)
│   └── networkpolicy.yaml    #   Políticas de rede (postgres ← backend ← nginx apenas)
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
# Via Kubernetes (ambiente principal)
kubectl exec -n hotel-system deploy/backend -- node command.js migrate

# Via Docker Compose (ambiente alternativo, para desenvolvimento local)
docker compose exec node_web node command.js migrate
```

O comando usa `sequelize.sync({ alter: true })` — cria tabelas inexistentes e adiciona colunas novas sem derrubar dados existentes.

Para recriar o banco do zero a partir do schema SQL:

```bash
# Via Kubernetes
kubectl exec -n hotel-system -i deploy/postgres -- \
  psql -U hotel_user -d gestao_hotel < scripts/setup.sql
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
# Via Kubernetes (ambiente principal)
kubectl exec -n hotel-system -i deploy/postgres -- \
  psql -U hotel_user -d gestao_hotel < seed/seed_hotels.sql

# Via Docker Compose (ambiente alternativo)
docker compose exec postgres psql -U hotel_user -d gestao_hotel \
  -f /dev/stdin < seed/seed_hotels.sql
```

O seed é **idempotente** — pode ser executado múltiplas vezes sem duplicar registros (usa `ON CONFLICT DO NOTHING`).

---

## Testes Automatizados

A suite usa **Vitest + Supertest** com PostgreSQL real (banco separado `gestao_hotel_test`). Os testes não usam mocks — exercitam rotas HTTP reais, JWT real e transações reais no banco.

### Pré-requisitos para rodar os testes

Os testes usam `Supertest` que executa a API em processo, mas precisam de **PostgreSQL real acessível em `localhost:5432`**. Com o ambiente Kubernetes rodando, exponha o banco via port-forward:

```bash
# Abre o túnel postgres → localhost:5432 (mantenha este terminal aberto)
kubectl port-forward -n hotel-system svc/postgres 5432:5432
```

Alternativa com Docker Compose (mais simples para testes):

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

Comandos para validar o sistema em execução no Kubernetes:

```bash
# 1. Listar todos os Pods e confirmar que estão Running e Ready
kubectl get pods -n hotel-system

# 2. Listar os Services e confirmar os tipos (ClusterIP vs LoadBalancer)
kubectl get svc -n hotel-system

# 3. Ver detalhes do Deployment do backend (3 réplicas)
kubectl describe deployment backend -n hotel-system

# 4. Confirmar as NetworkPolicies ativas
kubectl get networkpolicy -n hotel-system

# 5. Verificar o PVC do PostgreSQL (status: Bound)
kubectl get pvc -n hotel-system

# 6. Testar persistência: deletar e recriar o Pod do postgres
#    Os dados devem permanecer no PVC
kubectl delete pod -n hotel-system -l app=postgres
kubectl wait --for=condition=ready pod -l app=postgres -n hotel-system --timeout=60s
curl http://localhost/health

# 7. Confirmar que o banco é inacessível diretamente pelo host
#    (Service é ClusterIP — sem porta exposta. O comando abaixo deve recusar a conexão)
psql -h localhost -p 5432 -U hotel_user -d gestao_hotel

# 8. Ver logs do backend (todos os Pods)
kubectl logs -n hotel-system -l app=backend --tail=20

# 9. Ver logs do Nginx
kubectl logs -n hotel-system -l app=nginx --tail=20

# 10. Verificar a imagem construída (multi-stage, tamanho reduzido)
docker images | grep sistema-gestao-hotel-backend
```

URL de acesso à aplicação: **http://localhost**
Documentação Swagger: **http://localhost/api-docs**
Health check: **http://localhost/health**

---

# Troubleshooting

### Pods ficam em `Pending` ou `CrashLoopBackOff`

```bash
# Ver o status detalhado do Pod com falha
kubectl describe pod -n hotel-system <nome-do-pod>

# Ver logs do Pod
kubectl logs -n hotel-system <nome-do-pod>
```

Causas comuns:
- **`ImagePullBackOff`**: a imagem não foi construída ou não está disponível no cluster. Refaça o build:
  ```bash
  docker build -t sistema-gestao-hotel-backend:latest .
  # Se Minikube:
  minikube image load sistema-gestao-hotel-backend:latest
  ```
- **`Pending` sem nó disponível**: cluster sem recursos. Verifique `kubectl describe node`.

### "relation 'tenants' does not exist"

As migrations não foram executadas após subir o cluster:

```bash
kubectl exec -n hotel-system deploy/backend -- node command.js migrate
```

### Backend não consegue conectar ao PostgreSQL

```bash
# Verificar se o Pod do postgres está Ready
kubectl get pods -n hotel-system -l app=postgres

# Ver logs do postgres
kubectl logs -n hotel-system -l app=postgres

# Verificar se o Service existe
kubectl get svc postgres -n hotel-system
```

O backend conecta ao PostgreSQL pelo nome de Service `postgres` — resolvido internamente pelo DNS do cluster. Não use IPs fixos.

### http://localhost não responde

**No Docker Desktop:** o Service LoadBalancer resolve em `localhost` automaticamente. Verifique se o Pod do nginx está `Running`:
```bash
kubectl get pods -n hotel-system -l app=nginx
```

**No Minikube:** o LoadBalancer precisa de tunnel ativo:
```bash
minikube tunnel
```
Deixe o comando rodando em um terminal separado.

### "password authentication failed" no PostgreSQL

```bash
# Ver o conteúdo do Secret (decodificado)
kubectl get secret hotel-secret -n hotel-system -o jsonpath='{.data.POSTGRES_PASSWORD}' | base64 -d
```

Se precisar recriar tudo do zero:
```bash
kubectl delete -k k8s/
kubectl apply -k k8s/
kubectl wait --for=condition=ready pod --all -n hotel-system --timeout=120s
kubectl exec -n hotel-system deploy/backend -- node command.js migrate
```

---

# Limpeza após Avaliação

```bash
# Remover todos os recursos do cluster — PVC e dados do banco são preservados
kubectl delete -k k8s/

# Remover tudo incluindo o PVC (apaga os dados do banco permanentemente)
kubectl delete -k k8s/
kubectl delete pvc postgres-data -n hotel-system
```

> **Atenção:** deletar o PVC `postgres-data` apaga permanentemente todos os dados do banco PostgreSQL. Esta operação é irreversível.

---

*Sistema de Gestão de Hotel — TCC Unifaat 2026*
*Node.js 24 · Express 4 · Sequelize 6 · PostgreSQL 17 · Kubernetes · Nginx*
*Grupo: Gabriel · Sirlande · Weslley*
