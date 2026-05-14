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
│   ├── middlewares/
│   ├── database/
│   ├── utils/
│   ├── app.ts
│   └── server.ts
│
├── prisma/
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

* id;
* name;
* email;
* password;
* role.

---

# 2. Quartos

### Funcionalidades

* cadastrar quarto;
* listar quartos;
* atualizar quarto;
* remover quarto;
* listar quartos disponíveis.

### Entidade

Room:

* id;
* number;
* floor;
* capacity;
* pricePerNight;
* status.

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

* id;
* fullName;
* cpf;
* phone;
* email.

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

* id;
* guestId;
* roomId;
* checkInDate;
* checkOutDate;
* status.

### Status

* PENDING;
* CONFIRMED;
* CHECKED_IN;
* CHECKED_OUT;
* CANCELLED.

---

# Regras de Negócio

## Regra 1

Não permitir reservas conflitantes no mesmo quarto.

---

## Regra 2

Check-in altera status do quarto.

---

## Regra 3

Check-out libera quarto.

---

## Regra 4

Cancelamento libera disponibilidade.

---

# Endpoints Principais

## Auth

```http
POST /auth/login
POST /auth/register
```

---

## Rooms

```http
GET /rooms
POST /rooms
PATCH /rooms/:id
DELETE /rooms/:id
GET /rooms/available
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

# Relacionamentos

```txt
Guest 1:N Reservation
Room 1:N Reservation
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

## Fase 1

* setup Docker;
* PostgreSQL;
* Express.

---

## Fase 2

* Prisma ORM;
* autenticação JWT.

---

## Fase 3

* CRUD hóspedes;
* CRUD quartos.

---

## Fase 4

* reservas;
* regras de negócio.

---

## Fase 5

* Swagger;
* testes;
* documentação.

---

## Fase 6

* Docker Swarm;
* Kubernetes (complementar).

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
