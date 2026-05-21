# Resumo do Projeto — Sistema de Gestão de Hotel

## Objetivo do Projeto

Desenvolver um sistema backend para gerenciamento de hotel/pousada com foco em:

* APIs REST;
* banco de dados relacional;
* Docker;
* Docker Swarm;
* Kubernetes (demonstração complementar);
* arquitetura backend;
* infraestrutura moderna.

O projeto inicialmente NÃO terá frontend. O foco principal será backend + infraestrutura.

---

# Tema Escolhido

## Sistema de Gestão de Hotel/Pousada

O sistema permitirá:

* gerenciamento de hóspedes;
* gerenciamento de quartos;
* criação de reservas;
* autenticação de usuários;
* controle de disponibilidade dos quartos.

---

# Stack Tecnológica

| Área                  | Tecnologia     |
| --------------------- | -------------- |
| Backend               | Node.js        |
| Framework             | Express        |
| Linguagem             | TypeScript     |
| Banco de Dados        | PostgreSQL     |
| ORM                   | Sequelize ORM  |
| Containerização       | Docker         |
| Orquestração          | Docker Swarm   |
| Autenticação          | JWT            |
| Criptografia          | bcrypt         |
| Documentação          | Swagger        |

---

# Arquitetura Escolhida

## Arquitetura Monolítica Modular Simples

O backend será organizado de forma simples para evitar complexidade excessiva.

Estrutura principal:

```txt
backend/
│
├── src/
│   ├── routes/
│   ├── controllers/
│   ├── services/
│   ├── models/
│   ├── middlewares/
│   ├── database/
│   │   └── migrations/
│   ├── utils/
│   ├── app.ts
│   └── server.ts
│
├── Dockerfile
└── package.json
```

---

# Infraestrutura

## Desenvolvimento Local

Será utilizado:

* Docker Compose.

Objetivo:

* subir backend + PostgreSQL rapidamente.

---

## Ambiente Principal

Será utilizado:

* Docker Swarm.

Objetivo:

* demonstrar orquestração;
* replicas;
* escalabilidade;
* balanceamento de carga.

---

## Kubernetes

Será utilizado apenas como demonstração complementar acadêmica.

Não será a infraestrutura principal do projeto.

---

# Escopo do Backend

## 1. Autenticação

### Funcionalidades

* login;
* registro;
* JWT;
* proteção de rotas.

### Entidade

User:

* id (UUID);
* name;
* email (Unique);
* password;
* role (ADMIN, RECEPTIONIST).

---

# 2. Quartos

### Funcionalidades

* cadastrar categoria de quarto;
* cadastrar quarto;
* listar quartos;
* atualizar quarto;
* remover quarto;
* listar quartos disponíveis.

### Entidades

RoomCategory (Nova):

* id (UUID);
* name;
* capacity;
* pricePerNight.

Room:

* id (UUID);
* number (Unique);
* floor;
* status;
* categoryId.

### Status

* AVAILABLE;
* OCCUPIED;
* MAINTENANCE;
* CLEANING.

---

# 3. Hóspedes

### Funcionalidades

* cadastrar hóspede;
* listar hóspedes;
* buscar hóspede;
* atualizar hóspede;
* remover hóspede.

### Entidade

Guest:

* id (UUID);
* fullName;
* cpf (Unique);
* phone;
* email (Unique).

---

# 4. Reservas (Módulo Principal)

### Funcionalidades

* criar reserva;
* listar reservas;
* buscar reserva;
* cancelar reserva;
* check-in;
* check-out.

### Entidade

Reservation:

* id (UUID);
* guestId;
* roomId;
* userId;
* checkInDate;
* checkOutDate;
* status;
* totalAmount.

### Status

* PENDING;
* CONFIRMED;
* CHECKED_IN;
* CHECKED_OUT;
* CANCELLED.

---

# Regras de Negócio

## Regra 1 — Sem conflito de reservas

Não permitir reservas com datas sobrepostas no mesmo quarto.

```
criar reserva:
  ├── quarto existe e está disponível?
  ├── datas conflitam com outra reserva ativa?
  ├── checkOutDate > checkInDate?
  └── calcula totalAmount (nº diárias × pricePerNight da categoria)
```

---

## Regra 2 — Check-in

```
  ├── reserva deve estar com status PENDING
  └── altera status do quarto para OCCUPIED
```

---

## Regra 3 — Check-out

```
  ├── reserva deve estar com status CHECKED_IN
  └── altera status do quarto para AVAILABLE
```

---

## Regra 4 — Cancelamento

```
  ├── não pode cancelar reservas CHECKED_IN ou CHECKED_OUT
  └── altera status do quarto para AVAILABLE
```

---

# Endpoints Principais

## Auth

```http
POST /auth/login
POST /auth/register
```

---

## Room Categories

```http
GET    /room-categories
POST   /room-categories
PATCH  /room-categories/:id
DELETE /room-categories/:id
```

---

## Rooms

```http
GET    /rooms
GET    /rooms/available
POST   /rooms
PATCH  /rooms/:id
DELETE /rooms/:id
```

---

## Guests

```http
GET /guests
GET /guests/:id
POST /guests
PUT /guests/:id
DELETE /guests/:id
```

---

## Reservations

```http
POST /reservations
GET /reservations
GET /reservations/:id
PATCH /reservations/:id/cancel
PATCH /reservations/:id/check-in
PATCH /reservations/:id/check-out
```

---

# Banco de Dados

## Banco Escolhido

PostgreSQL.

---

# Diagrama de Entidades

```txt
┌──────────────────┐       ┌──────────────────────┐
│  room_categories │       │        users          │
├──────────────────┤       ├──────────────────────┤
│ id (UUID) PK     │       │ id (UUID) PK          │
│ name             │       │ name                  │
│ capacity         │       │ email UNIQUE          │
│ pricePerNight    │       │ password (bcrypt)     │
│ created_at       │       │ role (ADMIN/RECEP.)   │
│ updated_at       │       │ created_at            │
└────────┬─────────┘       └──────────┬────────────┘
         │ 1:N                        │ 1:N
         ▼                            ▼
┌──────────────────┐       ┌──────────────────────┐
│      rooms       │       │     reservations      │
├──────────────────┤       ├──────────────────────┤
│ id (UUID) PK     │       │ id (UUID) PK          │
│ number UNIQUE    │       │ guestId FK            │
│ floor            │       │ roomId FK             │
│ status           │       │ userId FK             │
│ categoryId FK ───┘       │ checkInDate           │
│ created_at       │◄──────┤ checkOutDate          │
│ updated_at       │  1:N  │ totalAmount           │
└──────────────────┘       │ status                │
                           │ created_at            │
┌──────────────────┐       │ updated_at            │
│      guests      │       └──────────────────────┘
├──────────────────┤               ▲
│ id (UUID) PK     │               │ 1:N
│ fullName         │───────────────┘
│ cpf UNIQUE       │
│ phone            │
│ email UNIQUE     │
│ created_at       │
│ updated_at       │
└──────────────────┘
```

# Relacionamentos

```txt
Guest         1:N  Reservation
Room          1:N  Reservation
RoomCategory  1:N  Room
User          1:N  Reservation
```

---

# Objetivos Acadêmicos

O projeto busca demonstrar:

* APIs REST;
* modelagem relacional;
* autenticação;
* Docker;
* Docker Swarm;
* infraestrutura moderna;
* backend com Node.js;
* persistência de dados;
* escalabilidade básica.

---

# Roadmap Resumido

## Fase 1 — Setup e Infra

* setup Express + TypeScript;
* Docker Compose funcionando;
* PostgreSQL conectado via Sequelize;
* migrations criando as 5 tabelas;
* variáveis de ambiente (.env).

---

## Fase 2 — Autenticação

* registro de usuário com bcrypt;
* login com JWT;
* middleware de proteção de rotas;
* controle de roles (ADMIN, RECEPTIONIST).

---

## Fase 3 — Quartos e Categorias

* CRUD de categorias de quarto;
* CRUD de quartos;
* listagem de quartos disponíveis;
* controle de status.

---

## Fase 4 — Hóspedes

* CRUD de hóspedes;
* validação de CPF e email únicos.

---

## Fase 5 — Reservas (módulo principal)

* criar reserva com validação de conflito;
* cálculo automático do totalAmount;
* check-in e check-out;
* cancelamento com liberação de quarto.

---

## Fase 6 — Qualidade e Documentação

* Swagger documentado;
* seed de dados para demo;
* README atualizado.

---

## Fase 7 — Infraestrutura Docker Swarm

* Dockerfile do backend;
* docker-stack.yml com 3 serviços;
* Nginx como reverse proxy;
* 3 réplicas do backend;
* Kubernetes como demonstração complementar.

---

# Checklist de Implementação

## Backend

* [ ] Setup Express + TypeScript;
* [ ] Conexão Sequelize + PostgreSQL;
* [ ] Models: User, RoomCategory, Room, Guest, Reservation;
* [ ] Migrations (criar tabelas);
* [ ] Auth: register, login, JWT middleware;
* [ ] CRUD Room Categories;
* [ ] CRUD Rooms + listar disponíveis;
* [ ] CRUD Guests;
* [ ] Reservas: criar, listar, buscar;
* [ ] Check-in / Check-out / Cancelar;
* [ ] Regras de negócio (conflito, status, totalAmount);
* [ ] Swagger documentado.

## Banco de Dados

* [ ] 5 tabelas criadas via migration;
* [ ] Relacionamentos com FK;
* [ ] Índices em email, cpf, status;
* [ ] Seed de dados para demo.

## Infraestrutura

* [ ] Dockerfile do backend;
* [ ] docker-compose.yml (local);
* [ ] docker-stack.yml (Swarm);
* [ ] nginx.conf (reverse proxy);
* [ ] .env para variáveis de ambiente;
* [ ] Swarm funcionando com 3 réplicas do backend.

---

# Decisão Arquitetural Final

## Compose

Apenas desenvolvimento local.

---

## Swarm

Infraestrutura principal do projeto.

---

## Kubernetes

Somente demonstração complementar.

---

# Objetivo Final

Entregar um backend:

* funcional;
* dockerizado;
* organizado;
* escalável;
* bem modelado;
* com autenticação;
* utilizando Docker Swarm;
* com banco PostgreSQL;
* pronto para apresentação acadêmica.
