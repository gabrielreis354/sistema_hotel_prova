# 👨‍🏫 Os Services no Docker Swarm

Explicação educativa sobre os services que compõem a infraestrutura do projeto.

---

## 🎯 Visão Geral

O sistema de hotel será orquestrado por **3 services principais** no Docker Swarm:

1. **PostgreSQL** - Banco de Dados (1 réplica)
2. **Express Backend** - Aplicação (3 réplicas)
3. **Nginx** - Reverse Proxy / Load Balancer (1 réplica)

Esses services trabalham juntos para oferecer as 5 funcionalidades principais:
- Gerenciamento de hóspedes
- Gerenciamento de quartos
- Criação de reservas
- Autenticação de usuários
- Controle de disponibilidade dos quartos

---

## 1️⃣ PostgreSQL Service (Banco de Dados)

### O que é?

```
┌─────────────────────────────────────┐
│     PostgreSQL Service              │
│  "O Arquivo do Hotel"               │
│  Guarda: Hóspedes, Quartos,         │
│           Reservas, Usuários        │
└─────────────────────────────────────┘
```

### Responsabilidades

- Armazenar TODOS os dados do sistema
- Guardar: Usuários, Hóspedes, Quartos, Reservas
- Servir como única fonte de verdade (single source of truth)

### Dados Armazenados

```sql
-- Tabelas principais
Users     → id, name, email, password, role
Guests    → id, fullName, cpf, phone, email
Rooms     → id, number, floor, capacity, pricePerNight, status
Reservations → id, guestId, roomId, checkInDate, checkOutDate, status
```

### Por que 1 Réplica?

- ✅ Replicar banco de dados é complexo (sincronização)
- ✅ Para projeto acadêmico, 1 é suficiente
- ✅ Em produção real usaria: Replicação PostgreSQL ou Clusters gerenciados
- ✅ Dados persistem em disco mesmo se container cair

### Exemplo de Operação

```
Backend pergunta: "Qual é o email do hóspede ID 1?"
    ↓
PostgreSQL consulta tabela Guests
    ↓
PostgreSQL responde: "joao@email.com"
    ↓
Backend usa essa informação
```

---

## 2️⃣ Express Backend Service (Aplicação)

### O que é?

```
┌─────────────────────────────────────┐
│     Express Backend Service         │
│   "Os Gerentes/Funcionários"        │
│   Processam as 5 funcionalidades    │
└─────────────────────────────────────┘
```

### Responsabilidades

Processa as 5 funcionalidades principais do sistema:

#### **1. Autenticação de Usuários**

```
POST /auth/login
├─ Express recebe: email + password
├─ Valida no PostgreSQL
├─ Gera JWT token
└─ Retorna token

POST /auth/register
├─ Express recebe: dados do novo usuário
├─ Criptografa senha com bcrypt
├─ Salva no PostgreSQL
└─ Retorna: "Usuário criado"
```

#### **2. Gerenciamento de Hóspedes**

```
POST /guests
├─ Recebe: fullName, cpf, phone, email
├─ Valida (CPF único? Email válido?)
├─ Salva no PostgreSQL
└─ Responde sucesso

GET /guests
├─ Consulta PostgreSQL
├─ Retorna: Lista de todos os hóspedes
└─ Cliente recebe lista

GET /guests/:id
├─ Consulta hóspede específico
├─ Retorna dados do hóspede
└─ Ou erro se não existe

PUT /guests/:id
├─ Recebe: dados atualizados
├─ Atualiza no PostgreSQL
└─ Responde sucesso

DELETE /guests/:id
├─ Remove do PostgreSQL
└─ Responde sucesso
```

#### **3. Gerenciamento de Quartos**

```
POST /rooms
├─ Recebe: number, floor, capacity, pricePerNight
├─ Valida (quarto já existe?)
├─ Salva no PostgreSQL
└─ Responde sucesso

GET /rooms
├─ Consulta PostgreSQL
├─ Retorna: Lista de todos os quartos com status
└─ Cliente recebe lista

GET /rooms/available ⭐ (Importante!)
├─ Consulta TODOS os quartos
├─ Para CADA quarto, verifica:
│   ├─ Status é AVAILABLE?
│   ├─ Há reservas conflitantes? (usando checkInDate/checkOutDate)
│   └─ Se sim → Inclui na lista
├─ PostgreSQL retorna quartos disponíveis
└─ Express responde: "Quartos 101, 102, 103 disponíveis"

PATCH /rooms/:id
├─ Recebe: dados atualizados
├─ Atualiza no PostgreSQL
└─ Responde sucesso

DELETE /rooms/:id
├─ Remove do PostgreSQL
└─ Responde sucesso
```

#### **4. Criação e Gerenciamento de Reservas (Principal!)**

```
POST /reservations
├─ Recebe: guestId, roomId, checkInDate, checkOutDate
├─ Valida:
│   ├─ Hóspede existe?
│   ├─ Quarto existe?
│   ├─ Quarto está disponível? (verifica conflitos)
│   └─ Datas válidas? (checkOut > checkIn?)
├─ Cria no PostgreSQL (status: PENDING)
├─ Altera status do quarto para OCCUPIED
└─ Responde: "Reserva criada"

GET /reservations
├─ Consulta PostgreSQL
├─ Retorna: Todas as reservas
└─ Responde

GET /reservations/:id
├─ Consulta reserva específica
├─ Retorna dados completos
└─ Responde

PATCH /reservations/:id/check-in
├─ Recebe: ID da reserva
├─ Valida: Status é PENDING?
├─ Altera:
│   ├─ Status da reserva → CHECKED_IN
│   └─ Status do quarto → OCCUPIED
├─ PostgreSQL atualiza
└─ Responde: "Check-in realizado"

PATCH /reservations/:id/check-out
├─ Recebe: ID da reserva
├─ Valida: Status é CHECKED_IN?
├─ Altera:
│   ├─ Status da reserva → CHECKED_OUT
│   └─ Status do quarto → AVAILABLE (libera!)
├─ PostgreSQL atualiza
└─ Responde: "Check-out realizado, quarto liberado"

PATCH /reservations/:id/cancel
├─ Recebe: ID da reserva
├─ Valida: Pode cancelar?
├─ Altera:
│   ├─ Status da reserva → CANCELLED
│   └─ Status do quarto → AVAILABLE (libera!)
├─ PostgreSQL atualiza
└─ Responde: "Reserva cancelada"
```

### Por que 3 Réplicas?

- ✅ **Sem estado** (stateless) - pode ser replicado
- ✅ Cada requisição é independente
- ✅ Se uma cair, as outras continuam processando
- ✅ Distribuem a carga entre elas
- ✅ Escalável: pode aumentar para 5 ou mais conforme necessário

---

## 3️⃣ Nginx Service (Reverse Proxy / Load Balancer)

### O que é?

```
┌─────────────────────────────────────┐
│      Nginx Reverse Proxy            │
│    "Recepcionista do Hotel"         │
│    Distribui requisições            │
└─────────────────────────────────────┘
```

### Responsabilidades

1. **Receber requisições externas** na porta 80 (HTTP) ou 443 (HTTPS)
2. **Rotear para Express** - Encaminha para uma das 3 réplicas
3. **Balancear carga** - Distribui requisições de forma inteligente

### Como Funciona o Load Balancing

```
10 clientes fazem requisições simultâneas:
├─ Cliente A: POST /guests
├─ Cliente B: GET /rooms/available
├─ Cliente C: POST /reservations
├─ Cliente D: PATCH /reservations/5/check-in
├─ Cliente E: GET /guests
├─ Cliente F: POST /rooms
├─ Cliente G: PUT /guests/3
├─ Cliente H: DELETE /rooms/101
├─ Cliente I: PATCH /reservations/10/cancel
└─ Cliente J: POST /auth/login

Nginx distribui (round-robin ou least connections):
├─ Express #1 processa: A, B, C
├─ Express #2 processa: D, E, F
└─ Express #3 processa: G, H, I, J
```

### Por que 1 Réplica?

- ✅ Para este projeto é suficiente
- ✅ Nginx é leve e rápido
- ✅ Pode escalar para 2+ se necessário (redundância)

---

## 🔄 Fluxo Completo: Um Cliente Faz uma Reserva

Este é o fluxo real que o sistema executa:

```
┌─────────────────┐
│ Hotel Admin     │
│ (Cliente)       │
└────────┬────────┘
         │
         │ POST /reservations
         │ { guestId: 1, 
         │   roomId: 101, 
         │   checkInDate: 2026-05-20,
         │   checkOutDate: 2026-05-25 }
         │
    ┌────▼────┐
    │  NGINX  │
    │ :80     │ ◄── Recebe requisição
    └────┬────┘
         │ "Vou encaminhar para o Express #2"
         │
    ┌────▼───────────────┐
    │ Express Backend #2 │
    │ :3000              │
    └────┬───────────────┘
         │
         ├─ "Valida: guestId 1 existe?"
         │  └─ Consulta PostgreSQL → SIM
         │
         ├─ "Valida: roomId 101 existe?"
         │  └─ Consulta PostgreSQL → SIM
         │
         ├─ "Valida: quarto 101 está disponível?"
         │  └─ Verifica reservas conflitantes → NÃO HÁ ✓
         │
         ├─ "Valida: datas são válidas?"
         │  └─ checkOut (25) > checkIn (20)? → SIM ✓
         │
         ├─ CRIA RESERVA no PostgreSQL
         │  └─ INSERT INTO reservations...
         │
         ├─ ALTERA QUARTO para OCCUPIED
         │  └─ UPDATE rooms SET status='OCCUPIED'...
         │
    ┌────▼──────────────────┐
    │   PostgreSQL          │
    │ Armazena tudo!        │
    └──────────────────────┘
         │
         ├─ Retorna: "Reserva criada com ID 42"
         │
    ┌────▼───────────────────────────┐
    │ Express Backend #2              │
    │ Prepara resposta               │
    └────┬───────────────────────────┘
         │ JSON: {
         │   id: 42,
         │   guestId: 1,
         │   roomId: 101,
         │   checkInDate: "2026-05-20",
         │   checkOutDate: "2026-05-25",
         │   status: "PENDING"
         │ }
         │
    ┌────▼────┐
    │  NGINX  │
    │ Retorna │
    └────┬────┘
         │ Resposta HTTP 201 Created
         │
    ┌────▼─────────┐
    │ Hotel Admin  │
    │ Sucesso! ✓   │
    └──────────────┘
```

---

## 📊 Sistema Sob Carga

### Cenário: Hotel Lotado!

```
50 requisições simultâneas:
├─ 15 clientes tentando fazer reserva
├─ 10 clientes consultando hóspedes
├─ 10 clientes consultando quartos disponíveis
├─ 8 clientes fazendo check-in
├─ 7 clientes fazendo check-out

Nginx distribui entre 3 Express:
├─ Express #1 (5 reservas + 5 consultas)
├─ Express #2 (5 reservas + 5 consultas)
└─ Express #3 (5 reservas + 10 consultas + 8 check-in + 7 check-out)

Todos consultam PostgreSQL simultaneamente:
└─ PostgreSQL gerencia 50 conexões em paralelo
   └─ Connection pool do Express previne sobrecarga
   └─ Banco processa transações sequencialmente
```

---

## 🎓 Comparação: Por que essa quantidade de réplicas?

| Service | Réplicas | Motivo |
|---------|----------|--------|
| **PostgreSQL** | 1 | Com estado, replicação complexa, suficiente para acadêmico |
| **Express** | 3 | Sem estado, escalável, distribui carga, resiliência |
| **Nginx** | 1 | Leve, rápido, suficiente; pode escalar para 2+ se necessário |

---

## 🚀 Operações no Docker Swarm

### Ver services rodando
```bash
docker service ls
```

### Ver replicas do backend processando requisições
```bash
docker service ps hotel_backend
```

### Escalar backend (se houver mais carga)
```bash
docker service scale hotel_backend=5
```

### Ver logs de um service
```bash
docker service logs hotel_backend
```

### Testar failover (simular falha)
```bash
# Um container vai cair, Swarm cria outro automaticamente
docker container kill <container_id>

# Ver Swarm recriando o container
docker service ps hotel_backend
```

---

## 🔗 Relacionamento entre Services

```
┌──────────────────────────────────────────────────┐
│          Cliente / Internet                      │
│     (requisição HTTP na porta 80)                │
└──────────────────┬───────────────────────────────┘
                   │
        ┌──────────▼──────────┐
        │      NGINX          │  ◄── Service: nginx (1 réplica)
        │  Porta 80 → 3000    │      Recebe requisições externas
        └──────────┬──────────┘
                   │
        ┌──────────┴──────────┐
        │ Overlay Network     │
        │ (Docker Swarm)      │
        └──────────┬──────────┘
                   │
      ┌────────────┼────────────┐
      │            │            │
   ┌──▼──┐    ┌────▼───┐    ┌──▼──┐
   │Back1│    │ Back2  │    │Back3│  ◄── Service: backend (3 réplicas)
   │:3000│    │ :3000  │    │:3000│      Processam requisições
   └──┬──┘    └────┬───┘    └──┬──┘
      │            │            │
      └────────────┼────────────┘
                   │
                   │ Conexão TCP
        ┌──────────▼──────────┐
        │    PostgreSQL       │  ◄── Service: postgres (1 réplica)
        │  Porta 5432         │      Armazena dados
        │   hotel_db          │
        └─────────────────────┘
```

---

## 📝 Resumo

Os **3 services trabalham em conjunto** para oferecer um sistema de gestão de hotel robusto:

1. **PostgreSQL** - Guarda todas as informações (hóspedes, quartos, reservas)
2. **Express** (3×) - Processa as funcionalidades do sistema (CRUD, autenticação, lógica de negócio)
3. **Nginx** - Distribui requisições entre os 3 Express de forma equilibrada

Este design demonstra conceitos de **infraestrutura moderna**, **escalabilidade** e **resiliência** adequados para um projeto acadêmico de nível empresarial.
