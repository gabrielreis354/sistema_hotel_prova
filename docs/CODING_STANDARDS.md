# 📋 Guia de Desenvolvimento com IA - SOLID, DRY, KISS e Git/GitHub

**Documento de Referência para Desenvolvimento Orientado a IAs**

> Este documento define os padrões de codificação, princípios arquiteturais e workflows de colaboração que todas as IAs (e desenvolvedores humanos) devem seguir ao trabalhar neste projeto.

---

## 📌 Índice

1. [Visão Geral](#visão-geral)
2. [Desenvolvimento Orientado a IAs](#desenvolvimento-orientado-a-ias)
3. [Princípios SOLID](#princípios-solid)
4. [DRY - Don't Repeat Yourself](#dry---dont-repeat-yourself)
5. [KISS - Keep It Simple, Stupid](#kiss---keep-it-simple-stupid)
6. [Git/GitHub Workflow](#gitgithub-workflow)
7. [Checklist de Qualidade](#checklist-de-qualidade)
8. [Relatório de Sessão](#relatório-de-sessão)

---

## 🎯 Visão Geral

Este projeto segue **3 pilares fundamentais** para manter código de qualidade, escalável e fácil de manter:

| Pilar | Objetivo | Foco |
|-------|----------|------|
| **SOLID** | Arquitetura flexível e manutenível | Estrutura de classes e responsabilidades |
| **DRY** | Eliminar duplicação de código | Reutilização e abstração |
| **KISS** | Simplicidade e clareza | Legibilidade e compreensão |

### Por que isso importa para desenvolvimento com IA?

- ✅ **Contexto claro**: IAs precisam de código bem estruturado para entender intenções
- ✅ **Menos ambiguidade**: Código simples reduz erros de interpretação
- ✅ **Fácil manutenção**: Quando a IA gera código, deve ser fácil para humanos revisar
- ✅ **Escalabilidade**: Princípios SOLID facilitam adicionar novas funcionalidades

---

## 🤖 Desenvolvimento Orientado a IAs

### Como usar IAs neste projeto

1. **Sempre forneça contexto completo**
   ```
   ❌ ERRADO: "Cria um endpoint de reservas"
   ✅ CERTO: "Cria um endpoint POST /reservations que:
      - Valida guestId existe no PostgreSQL
      - Verifica disponibilidade do quarto (sem conflitos)
      - Segue padrão de erro da aplicação
      - Usa middlewares de autenticação
      - Implementa a regra de negócio: não permitir reservas conflitantes"
   ```

2. **Explique as regras de negócio**
   - Não assuma que a IA conhece o sistema
   - Forneça links para documentação
   - Cite entidades relacionadas

3. **Defina o padrão esperado**
   - Mostre exemplos existentes
   - Cite convenções do projeto
   - Especifique erros e validações

4. **Revise o código gerado**
   - Sempre um humano revisa PRs da IA
   - Verifique se segue SOLID/DRY/KISS
   - Teste antes de fazer merge

---

## 💎 Princípios SOLID

SOLID é um acrônimo com **5 princípios** que melhoram design de software.

### 1️⃣ **S - Single Responsibility Principle (SRP)**

**Definição:** Uma classe deve ter **uma única razão para mudar** (uma única responsabilidade).

#### ❌ ERRADO - Responsabilidades Múltiplas

```typescript
class ReservationService {
  // ❌ Responsabilidade 1: Validação de reservas
  validateReservation(data) { }
  
  // ❌ Responsabilidade 2: Persistência no banco
  saveReservation(data) { }
  
  // ❌ Responsabilidade 3: Envio de email
  sendConfirmationEmail(email) { }
  
  // ❌ Responsabilidade 4: Log de auditoria
  logAudit(action) { }
}
```

**Problemas:**
- Difícil de testar (4 razões para mudar)
- Reuso limitado
- Mudanças em email quebram lógica de validação

#### ✅ CERTO - Responsabilidade Única

```typescript
// Service 1: Apenas validação
class ReservationValidator {
  validate(data: CreateReservationDTO): ValidationResult {
    // Apenas validação de regras de negócio
    if (!this.isDateValid(data.checkInDate)) {
      throw new InvalidDateError();
    }
    if (this.hasConflict(data.roomId, data.checkInDate)) {
      throw new RoomNotAvailableError();
    }
    return { valid: true };
  }
}

// Service 2: Apenas persistência
class ReservationRepository {
  async create(data: Reservation): Promise<Reservation> {
    // Apenas operações de banco
    return this.db.reservations.create(data);
  }
}

// Service 3: Apenas notificações
class ReservationNotificationService {
  async sendConfirmation(email: string, reservation: Reservation): Promise<void> {
    // Apenas envio de email
    await this.emailService.send(email, this.buildConfirmationEmail(reservation));
  }
}

// Service 4: Apenas auditoria
class AuditLogger {
  async log(action: AuditAction): Promise<void> {
    // Apenas registro de ações
    await this.db.auditLogs.create(action);
  }
}

// Controller: Orquestra os services
class ReservationController {
  constructor(
    private validator: ReservationValidator,
    private repository: ReservationRepository,
    private notificationService: ReservationNotificationService,
    private auditLogger: AuditLogger
  ) {}

  async create(req: Request): Promise<Response> {
    const data = req.body;
    
    // Orquestra responsabilidades
    this.validator.validate(data);
    const reservation = await this.repository.create(data);
    await this.notificationService.sendConfirmation(data.email, reservation);
    await this.auditLogger.log({ action: 'RESERVATION_CREATED', reservation });
    
    return res.status(201).json(reservation);
  }
}
```

**Benefícios:**
- ✅ Cada class tem uma razão para mudar
- ✅ Fácil de testar (mock de cada service)
- ✅ Reutilizável em outros contextos
- ✅ Responsabilidades bem definidas

---

### 2️⃣ **O - Open/Closed Principle (OCP)**

**Definição:** Classes devem ser **abertas para extensão** mas **fechadas para modificação**.

#### ❌ ERRADO - Modificar classe existente

```typescript
class RoomAvailabilityChecker {
  checkAvailability(roomId: string, checkIn: Date, checkOut: Date): boolean {
    const reservations = this.db.getReservations(roomId);
    
    // ❌ Lógica hardcoded
    // E se precisar adicionar: regra de limpeza? manutenção? bloqueios?
    // Preciso modificar essa classe!
    
    for (const reservation of reservations) {
      if (this.datesConflict(reservation, checkIn, checkOut)) {
        return false;
      }
    }
    return true;
  }
}
```

#### ✅ CERTO - Estender sem modificar

```typescript
// Interface: Abstração que permite extensão
interface AvailabilityRule {
  isAvailable(room: Room, checkIn: Date, checkOut: Date): Promise<boolean>;
}

// Implementação 1: Verificar conflitos de reserva
class ReservationConflictRule implements AvailabilityRule {
  async isAvailable(room: Room, checkIn: Date, checkOut: Date): Promise<boolean> {
    const conflicts = await this.db.getConflictingReservations(room.id, checkIn, checkOut);
    return conflicts.length === 0;
  }
}

// Implementação 2: Verificar se quarto está em manutenção
class MaintenanceRule implements AvailabilityRule {
  async isAvailable(room: Room, checkIn: Date, checkOut: Date): Promise<boolean> {
    return room.status !== 'MAINTENANCE';
  }
}

// Implementação 3: Verificar se precisa limpeza
class CleaningRule implements AvailabilityRule {
  async isAvailable(room: Room, checkIn: Date, checkOut: Date): Promise<boolean> {
    return room.status !== 'CLEANING';
  }
}

// ✅ Classe aberta para extensão, fechada para modificação
class RoomAvailabilityChecker {
  private rules: AvailabilityRule[];

  constructor(rules: AvailabilityRule[]) {
    this.rules = rules;
  }

  // Apenas passa pelos rules - não precisa modificar!
  async isAvailable(room: Room, checkIn: Date, checkOut: Date): Promise<boolean> {
    for (const rule of this.rules) {
      if (!(await rule.isAvailable(room, checkIn, checkOut))) {
        return false;
      }
    }
    return true;
  }
}

// Uso:
const checker = new RoomAvailabilityChecker([
  new ReservationConflictRule(),
  new MaintenanceRule(),
  new CleaningRule(),
  // Adicionar nova regra no futuro? Só criar nova classe, sem modificar RoomAvailabilityChecker!
]);
```

**Benefícios:**
- ✅ Adicionar novos rules sem modificar código existente
- ✅ Testa cada rule independentemente
- ✅ Flexível para mudanças de negócio

---

### 3️⃣ **L - Liskov Substitution Principle (LSP)**

**Definição:** Objetos de uma classe filha podem **substituir objetos da classe pai** sem quebrar o programa.

#### ❌ ERRADO - Viola substituição

```typescript
class PaymentProcessor {
  process(payment: Payment): boolean {
    return payment.execute();
  }
}

class CreditCardPayment {
  execute(): boolean {
    // Processa normalmente
    return true;
  }
}

class GiftCardPayment extends CreditCardPayment {
  execute(): boolean {
    // ❌ PROBLEMA: Giftcard retorna Promise, não boolean!
    // Viola contrato da classe pai
    return new Promise((resolve) => {
      resolve(true);
    }) as any; // Tipo errado!
  }
}

// Isso quebra em runtime!
const processor = new PaymentProcessor();
processor.process(new GiftCardPayment()); // Type error, comportamento inesperado
```

#### ✅ CERTO - Respeita contrato

```typescript
// Interface clara
interface Payment {
  execute(): Promise<boolean>;
  getType(): string;
}

class CreditCardPayment implements Payment {
  async execute(): Promise<boolean> {
    // Processa creditcard
    return true;
  }
  getType(): string {
    return 'CREDIT_CARD';
  }
}

class GiftCardPayment implements Payment {
  async execute(): Promise<boolean> {
    // Processa giftcard com mesma interface
    return true;
  }
  getType(): string {
    return 'GIFT_CARD';
  }
}

class PaymentProcessor {
  async process(payment: Payment): Promise<boolean> {
    return payment.execute(); // Funciona com qualquer Payment
  }
}

// ✅ Ambas classes respeitam o contrato
const processor = new PaymentProcessor();
processor.process(new CreditCardPayment());
processor.process(new GiftCardPayment());
```

**Benefícios:**
- ✅ Substituição segura entre classes
- ✅ Menos bugs em tempo de execução
- ✅ Contrato explícito

---

### 4️⃣ **I - Interface Segregation Principle (ISP)**

**Definição:** Clientes não devem depender de interfaces que não usam.

#### ❌ ERRADO - Interface gorda

```typescript
interface UserService {
  createUser(data: any): Promise<User>;
  updateUser(id: string, data: any): Promise<User>;
  deleteUser(id: string): Promise<void>;
  resetPassword(email: string): Promise<void>;
  sendEmail(to: string, subject: string, body: string): Promise<void>;
  generateReport(startDate: Date, endDate: Date): Promise<Report>;
  scheduleBackup(): Promise<void>;
}

// ❌ Quem implementa precisa implementar TUDO, mesmo se não usa
class AdminUserService implements UserService {
  // 8 métodos para implementar
  // Mas talvez precise apenas de createUser, updateUser, deleteUser
}

class GuestUserService implements UserService {
  // 8 métodos para implementar
  // Mas talvez precise apenas de createUser
}
```

#### ✅ CERTO - Interfaces específicas

```typescript
// Segrega em interfaces menores e específicas
interface UserCRUD {
  createUser(data: any): Promise<User>;
  updateUser(id: string, data: any): Promise<User>;
  deleteUser(id: string): Promise<void>;
}

interface UserAuthentication {
  resetPassword(email: string): Promise<void>;
}

interface UserNotification {
  sendEmail(to: string, subject: string, body: string): Promise<void>;
}

interface UserReporting {
  generateReport(startDate: Date, endDate: Date): Promise<Report>;
}

interface SystemMaintenance {
  scheduleBackup(): Promise<void>;
}

// ✅ Implementa apenas o que precisa
class AdminUserService implements UserCRUD, UserAuthentication, UserReporting {
  async createUser(data: any): Promise<User> { }
  async updateUser(id: string, data: any): Promise<User> { }
  async deleteUser(id: string): Promise<void> { }
  async resetPassword(email: string): Promise<void> { }
  async generateReport(startDate: Date, endDate: Date): Promise<Report> { }
}

class GuestUserService implements UserCRUD, UserAuthentication {
  async createUser(data: any): Promise<User> { }
  async updateUser(id: string, data: any): Promise<User> { }
  async deleteUser(id: string): Promise<void> { }
  async resetPassword(email: string): Promise<void> { }
}
```

**Benefícios:**
- ✅ Cada cliente implementa apenas o necessário
- ✅ Menos método "dummy" (vazios sem uso)
- ✅ Interfaces mais coesas

---

### 5️⃣ **D - Dependency Inversion Principle (DIP)**

**Definição:** Dependa de **abstrações**, não de **implementações concretas**.

#### ❌ ERRADO - Depende de concreto

```typescript
class ReservationService {
  private db: PostgresqlDatabase; // ❌ Depende de concreto

  constructor() {
    this.db = new PostgresqlDatabase(); // ❌ Hardcoded
  }

  async createReservation(data: any) {
    // Se precisar trocar de banco? Precisa modificar essa classe!
    return this.db.insert('reservations', data);
  }
}
```

**Problemas:**
- Difícil de testar (não pode fazer mock)
- Acoplado a implementação específica
- Mudança de banco quebra código

#### ✅ CERTO - Depende de abstração

```typescript
// Abstração (interface)
interface Database {
  insert(table: string, data: any): Promise<any>;
  query(sql: string): Promise<any[]>;
}

// Implementação PostgreSQL
class PostgresqlDatabase implements Database {
  async insert(table: string, data: any): Promise<any> { }
  async query(sql: string): Promise<any[]> { }
}

// Implementação MySQL (futuro)
class MysqlDatabase implements Database {
  async insert(table: string, data: any): Promise<any> { }
  async query(sql: string): Promise<any[]> { }
}

// ✅ Depende de abstração
class ReservationService {
  constructor(private db: Database) {} // Injeção de dependência

  async createReservation(data: any) {
    return this.db.insert('reservations', data);
  }
}

// Uso:
const postgresDb = new PostgresqlDatabase();
const reservationService = new ReservationService(postgresDb);

// Trocar de banco? Trivial!
const mysqlDb = new MysqlDatabase();
const reservationService2 = new ReservationService(mysqlDb);

// Testar? Usar mock!
const mockDb: Database = {
  insert: jest.fn(),
  query: jest.fn(),
};
const testService = new ReservationService(mockDb);
```

**Benefícios:**
- ✅ Fácil de testar com mocks
- ✅ Fácil trocar implementação
- ✅ Menos acoplamento

---

## 🔄 DRY - Don't Repeat Yourself

**Definição:** **Nunca duplicar código** - Toda lógica deve existir em um único lugar.

### 1. Identificar Duplicação

#### ❌ ERRADO - Código duplicado

```typescript
// Controller de Reservas
class ReservationController {
  async create(req: Request, res: Response) {
    // ❌ Validação duplicada em 3 controllers
    if (!req.body.guestId) {
      return res.status(400).json({ error: 'guestId is required' });
    }
    if (!req.body.roomId) {
      return res.status(400).json({ error: 'roomId is required' });
    }
    if (!req.body.checkInDate) {
      return res.status(400).json({ error: 'checkInDate is required' });
    }
    // ... resto
  }
}

// Controller de Hóspedes
class GuestController {
  async create(req: Request, res: Response) {
    // ❌ Mesma validação
    if (!req.body.guestId) {
      return res.status(400).json({ error: 'guestId is required' });
    }
    if (!req.body.roomId) {
      return res.status(400).json({ error: 'roomId is required' });
    }
    // ...
  }
}

// Funções com lógica duplicada
function getAvailableRooms(date1: Date, date2: Date) {
  const rooms = [];
  for (const room of allRooms) {
    // ❌ Lógica de conflito duplicada
    let hasConflict = false;
    for (const reservation of allReservations) {
      if (reservation.roomId === room.id &&
          reservation.checkInDate <= date2 &&
          reservation.checkOutDate >= date1) {
        hasConflict = true;
        break;
      }
    }
    if (!hasConflict) rooms.push(room);
  }
  return rooms;
}

function checkRoomConflict(roomId: string, date1: Date, date2: Date) {
  // ❌ MESMA lógica duplicada aqui
  for (const reservation of allReservations) {
    if (reservation.roomId === roomId &&
        reservation.checkInDate <= date2 &&
        reservation.checkOutDate >= date1) {
      return true;
    }
  }
  return false;
}
```

### ✅ CERTO - Código centralizado

```typescript
// 1. Criar validador reutilizável
class ReservationValidator {
  validateRequired(data: any, fields: string[]): void {
    for (const field of fields) {
      if (!data[field]) {
        throw new ValidationError(`${field} is required`);
      }
    }
  }
}

// 2. Criar função utilitária para lógica duplicada
class DateRangeHelper {
  hasConflict(range1Start: Date, range1End: Date, range2Start: Date, range2End: Date): boolean {
    return range1Start <= range2End && range1End >= range2Start;
  }
}

// 3. Criar repository com lógica centralizada
class ReservationRepository {
  async hasConflict(roomId: string, checkIn: Date, checkOut: Date): Promise<boolean> {
    const conflicts = await this.db.query(
      `SELECT COUNT(*) FROM reservations 
       WHERE roomId = $1 AND checkInDate <= $2 AND checkOutDate >= $3`,
      [roomId, checkOut, checkIn]
    );
    return conflicts[0].count > 0;
  }
}

// 4. Usar em qualquer lugar (DRY!)
class ReservationService {
  constructor(
    private validator: ReservationValidator,
    private repository: ReservationRepository
  ) {}

  async createReservation(data: any) {
    // ✅ Validação centralizada
    this.validator.validateRequired(data, ['guestId', 'roomId', 'checkInDate', 'checkOutDate']);
    
    // ✅ Lógica de conflito centralizada
    const hasConflict = await this.repository.hasConflict(data.roomId, data.checkInDate, data.checkOutDate);
    if (hasConflict) {
      throw new RoomNotAvailableError();
    }
    
    return this.repository.create(data);
  }

  async checkAvailability(roomId: string, checkIn: Date, checkOut: Date) {
    // ✅ REUTILIZA a mesma lógica!
    return !(await this.repository.hasConflict(roomId, checkIn, checkOut));
  }
}
```

### 2. Estratégias para Evitar DRY

| Estratégia | Quando Usar | Exemplo |
|-----------|-----------|---------|
| **Funções** | Lógica simples | `validateEmail(email: string)` |
| **Classes Utilitárias** | Funções relacionadas | `DateHelper`, `StringUtils` |
| **Middlewares** | Lógica transversal | Autenticação, validação |
| **Decorators** | Comportamento repetido | `@Validate()`, `@RequireAuth()` |
| **Herança** | Comportamento comum | `BaseRepository` |

---

## 💡 KISS - Keep It Simple, Stupid

**Definição:** Código deve ser **simples, direto e compreensível** - Evite complexidade desnecessária.

### 1. Simplicidade em Nomes

#### ❌ ERRADO - Nomes complexos

```typescript
class RsvnPrcssr { } // Abreviação excessiva
const gst_blkd_dts = []; // Nomes confusos
function chkDtCnflct() { } // Ilegível
const x = getUserDataByIdAndFilterByRoleAndSortByCreatedDateDescendingThenByNameAscending(); // Muito longo
```

#### ✅ CERTO - Nomes claros

```typescript
class ReservationProcessor { } // Claro
const blockedDates = []; // Legível
function checkDateConflict() { } // Entendível
const users = getUsersByRoleAndSortByName(); // Objetivo
```

### 2. Simplicidade em Lógica

#### ❌ ERRADO - Lógica complexa

```typescript
// Verificar se quarto está disponível (MUITO complexo)
function isRoomAvailable(roomId, checkIn, checkOut) {
  return !db.query(
    `SELECT * FROM reservations WHERE roomId = ? AND 
     ((checkInDate <= ? AND checkOutDate > ?) OR 
      (checkInDate < ? AND checkOutDate >= ?) OR 
      (checkInDate >= ? AND checkOutDate <= ?))`
  ).some(r => 
    (r.status !== 'CANCELLED' && r.status !== 'CHECKED_OUT') ||
    (r.status === 'CHECKED_OUT' && new Date() - r.checkOutDate < 3600000)
  ) || db.query('SELECT * FROM rooms WHERE id = ? AND status = ?', [roomId, 'MAINTENANCE']).length > 0;
}
```

#### ✅ CERTO - Lógica simples e clara

```typescript
async function isRoomAvailable(roomId: string, checkIn: Date, checkOut: Date): Promise<boolean> {
  // 1. Verificar se quarto está em manutenção
  const room = await this.getRoomById(roomId);
  if (room.status === 'MAINTENANCE') {
    return false;
  }

  // 2. Verificar se há conflito de reserva
  const hasConflict = await this.hasReservationConflict(roomId, checkIn, checkOut);
  return !hasConflict;
}

// Cada método faz UMA coisa simples
private async hasReservationConflict(roomId: string, checkIn: Date, checkOut: Date): Promise<boolean> {
  const conflicts = await this.db.query(
    `SELECT COUNT(*) as count FROM reservations 
     WHERE roomId = $1 AND checkInDate < $2 AND checkOutDate > $3 AND status != 'CANCELLED'`,
    [roomId, checkOut, checkIn]
  );
  return conflicts[0].count > 0;
}

private async getRoomById(roomId: string): Promise<Room> {
  return this.db.query(`SELECT * FROM rooms WHERE id = $1`, [roomId]);
}
```

### 3. Evitar Over-engineering

#### ❌ ERRADO - Complexidade desnecessária

```typescript
// Para um simples CRUD, cria padrão de saga complexo
class ReservationSagaOrchestrator {
  private eventBus = new EventBus();
  private stateManager = new StateManager();
  private compensationHandler = new CompensationHandler();
  
  async executeReservationSaga() {
    // Implementação de 200 linhas para um POST simples
  }
}
```

#### ✅ CERTO - Simplicidade apropriada

```typescript
// Para CRUD simples, use padrão simples
class ReservationService {
  async createReservation(data: CreateReservationDTO): Promise<Reservation> {
    // Validação
    await this.validateReservation(data);
    
    // Criar
    const reservation = await this.repository.create(data);
    
    // Notificar (opcional, simples)
    await this.sendConfirmationEmail(data.email);
    
    return reservation;
  }
}
```

### 4. Checklist de Simplicidade

Antes de commitar, pergunte-se:

- [ ] Posso explicar esse código em uma frase?
- [ ] Uma pessoa nova entenderia sem documentação?
- [ ] Há algoritmos complexos que poderiam ser mais simples?
- [ ] Há mais de 3 níveis de indentação?
- [ ] Estou usando padrões de design quando simples seria melhor?
- [ ] Os nomes das variáveis são auto-explicativos?

---

## 🔀 Git/GitHub Workflow

### 1. Convenção de Branches

```
main
├── develop (integração)
│   ├── feature/auth-login (feature)
│   ├── feature/reservations-crud (feature)
│   ├── fix/password-validation (fix)
│   └── docs/infrastructure (docs)
└── hotfix/critical-bug (hotfix urgente)
```

#### Nomenclatura:

```
feature/<feature-name>       # Nova funcionalidade
fix/<bug-name>               # Correção de bug
docs/<documentation-name>    # Documentação
refactor/<component-name>    # Refatoração
test/<test-description>      # Testes
chore/<task-name>            # Tarefas administrativas
```

#### Exemplos:

```bash
git checkout -b feature/user-authentication
git checkout -b fix/reservation-conflict-validation
git checkout -b docs/api-endpoints
git checkout -b refactor/extract-date-utils
```

### 2. Commits com Mensagens Claras

#### ❌ ERRADO - Mensagens vagas

```
git commit -m "fix stuff"
git commit -m "updates"
git commit -m "work in progress"
git commit -m "aaa"
```

#### ✅ CERTO - Mensagens descritivas

Siga o padrão **Conventional Commits**:

```
<type>(<scope>): <subject>

<body>

<footer>
```

##### Tipos:

| Tipo | Descrição | Exemplo |
|------|-----------|---------|
| `feat` | Nova funcionalidade | `feat(reservations): add check-in endpoint` |
| `fix` | Correção de bug | `fix(auth): fix JWT token expiration validation` |
| `docs` | Documentação | `docs(infra): add Docker Swarm setup guide` |
| `style` | Estilo (sem mudança lógica) | `style(code): format code with prettier` |
| `refactor` | Refatoração | `refactor(database): extract date validation logic` |
| `test` | Testes | `test(reservations): add tests for conflict detection` |
| `chore` | Tarefas administrativas | `chore(deps): upgrade TypeScript to 5.0` |

##### Exemplos Completos:

```
feat(guests): add guest registration endpoint

- Create POST /guests endpoint
- Add email validation using isEmail()
- Add CPF validation with CPF library
- Return 201 with created guest

Closes #42
```

```
fix(reservations): prevent double booking

- Fix date conflict logic to check boundaries correctly
- Add test case for edge case (same checkout/checkin date)
- Update validation error message

Fixes #88
```

### 3. Fluxo de Pull Request (PR)

#### Passo 1: Criar Branch

```bash
git checkout develop
git pull origin develop
git checkout -b feature/my-feature
```

#### Passo 2: Fazer Commits Lógicos

```bash
# ✅ Bom: commits pequenos e lógicos
git add src/validators/reservationValidator.ts
git commit -m "feat(reservations): add date conflict validation"

git add src/services/reservationService.ts
git commit -m "feat(reservations): implement create reservation logic"

git add tests/reservations.test.ts
git commit -m "test(reservations): add tests for date conflict"
```

```bash
# ❌ Ruim: um commit gigante com tudo
git add .
git commit -m "added reservation feature"
```

#### Passo 3: Push e Criar PR

```bash
git push origin feature/my-feature

# Abrir PR no GitHub com título descritivo
# Title: "feat: add reservation creation with conflict validation"
# Description: (veja template abaixo)
```

#### Passo 4: Template de PR

```markdown
## 📋 Descrição

Implementa criação de reservas com validação de conflito de datas.

## 🎯 Objetivo

Closes #42

## 📝 Mudanças

- [ ] Validação de conflito de datas
- [ ] Endpoint POST /reservations
- [ ] Testes unitários
- [ ] Swagger documentation

## ✅ Checklist

- [ ] Segue SOLID/DRY/KISS
- [ ] Testes passando
- [ ] Sem duplicação de código
- [ ] Documentado
- [ ] TypeScript sem erros

## 🧪 Como Testar

1. Criar 2 reservas no mesmo quarto com datas conflitantes
2. Segunda deve retornar erro 409 Conflict
```

### 4. Evitar Conflitos

#### ✅ BOAS PRÁTICAS:

```bash
# 1. Pull sempre antes de começar
git pull origin develop

# 2. Faça commits frequentes (não um mega commit no final)
git commit -m "feature: part 1"
git commit -m "feature: part 2"

# 3. Push regularmente
git push origin feature/my-feature

# 4. Se colleague fez merge, pull antes de continuar
git pull origin develop
git rebase origin/develop

# 5. Antes de PR, sincronize com develop
git fetch origin
git rebase origin/develop

# 6. Se teve conflito, resolva:
# - Abra arquivo com <<<<< ===== >>>>>
# - Escolha qual versão manter
# - git add arquivo.ts
# - git rebase --continue
```

#### ❌ O QUE EVITAR:

```bash
# ❌ Não faça push diretamente em main/develop
git push origin feature/x origin:main  # NUNCA!

# ❌ Não trabalhe por semanas sem pull
# Faz rebase do develop, vai gerar conflitos enormes

# ❌ Não ignora warnings do git
# Leia as mensagens de conflito com atenção

# ❌ Não faz mega commits
# Faz fácil para revisor entender o que mudou
```

### 5. Code Review - O que Revisor Deve Verificar

Checklist para revisor de PR:

```markdown
## SOLID
- [ ] Cada classe tem uma única responsabilidade? (SRP)
- [ ] Classes são abertas para extensão, fechadas para modificação? (OCP)
- [ ] Subclasses respeitam contrato da superclasse? (LSP)
- [ ] Interfaces não têm métodos desnecessários? (ISP)
- [ ] Depende de abstrações, não implementações? (DIP)

## DRY
- [ ] Há código duplicado? 
- [ ] Lógica está centralizada ou espalhada?
- [ ] Funções utilitárias poderiam extrair duplicação?

## KISS
- [ ] Código é simples e direto?
- [ ] Há complexidade desnecessária (over-engineering)?
- [ ] Nomes são claros e descritivos?
- [ ] Lógica pode ser mais legível?

## Geral
- [ ] TypeScript: sem `any` a menos que justificado?
- [ ] Testes: cobertura adequada?
- [ ] Documentação: comentários onde necessário?
- [ ] Performance: queries N+1? loops infinitos?
- [ ] Segurança: input validation? SQL injection protection?
- [ ] Erros: mensagens úteis para usuario?

## Git
- [ ] Commits são lógicos e com mensagens claras?
- [ ] Branch está atualizado com develop?
- [ ] Sem merge commits desnecessários?
```

### 6. Configuração de Proteção de Branch

No GitHub, configure para evitar problemas:

```
Settings → Branches → Branch protection rules

✅ Require a pull request before merging
✅ Dismiss stale pull request approvals when new commits are pushed
✅ Require status checks to pass before merging
   - Tests (CI/CD)
   - Lint
   - Type checking
✅ Require branches to be up to date before merging
✅ Require code reviews before merging (1-2 reviewers)
✅ Require conversation resolution before merging
```

---

## ✅ Checklist de Qualidade

### Antes de Fazer Commit

- [ ] Código segue SOLID
- [ ] Sem duplicação (DRY)
- [ ] Simples e legível (KISS)
- [ ] TypeScript compila sem erros
- [ ] Testes passando (`npm test`)
- [ ] Linter passou (`npm run lint`)
- [ ] Mensagem de commit é descritiva

### Antes de Push

- [ ] Sincronizou com develop (`git pull origin develop`)
- [ ] Sem conflitos
- [ ] Commits são lógicos
- [ ] Não tem arquivos sensíveis (.env, secrets)

### Antes de Criar PR

- [ ] Branch está atualizado com develop
- [ ] Preencheu template de PR
- [ ] Ligou issue correta (Closes #X)
- [ ] Documentou mudanças significativas
- [ ] Preparou exemplos de testes

### Antes de Fazer Merge

- [ ] Todos os testes passando
- [ ] Code review aprovado
- [ ] Sem comentários não resolvidos
- [ ] Branch está atualizado com main/develop
- [ ] Squash ou rebase (sem merge commit)

---

## 📚 Resumo de Boas Práticas

| Princípio | Objetivo | Benefício |
|-----------|----------|-----------|
| **SOLID** | Arquitetura flexível | Fácil manutenção e extensão |
| **DRY** | Eliminar duplicação | Menos bugs, mais reutilização |
| **KISS** | Simplicidade | Mais compreensível, menos erro |
| **Git Workflow** | Organização | Menos conflitos, histórico claro |
| **Code Review** | Qualidade | Conhecimento compartilhado |

---

## 📝 Relatório de Sessão

### Quando criar

Um relatório de sessão **deve ser criado** em dois momentos:

1. **Ao final de uma sessão de trabalho** — sempre que o dev encerrar o dia ou trocar de contexto
2. **Após uma entrega importante** — após um commit ou PR que encerra uma feature/fix significativa

> O objetivo é garantir rastreabilidade entre múltiplos devs (humanos e IAs) sem depender de memória ou comunicação verbal.

### Localização e nomenclatura

```
docs/historico_sessao/YYYY-MM-DD_<nome>.md
```

Exemplos:
- `docs/historico_sessao/2026-05-21_gabriel.md`
- `docs/historico_sessao/2026-05-22_sirlande.md`
- `docs/historico_sessao/2026-05-22_gabriel_hotfix.md` ← sufixo opcional para entregas avulsas

> Se dois devs trabalharem no mesmo dia, cada um cria seu próprio arquivo.

### Template obrigatório

```markdown
### YYYY-MM-DD — <Nome do Dev>

- **Branch:** `<branch trabalhada>`
- **Horário:** <início ~ fim estimado>
- **Objetivo da sessão:** <resumo em 1 linha>

#### O que foi feito

<lista ou tabela das entregas>

#### Commits gerados

| Hash | Mensagem |
|------|----------|
| `abc1234` | `tipo(escopo): descrição` |

#### Pendências

| # | Pendência | Prioridade | Observação |
|---|-----------|-----------|------------|
| 1 | Descrição | 🔴 Alta / 🟡 Média / 🟢 Baixa | Dica para quem pegar |
```

### Prioridades de pendência

| Símbolo | Nível | Critério |
|---------|-------|----------|
| 🔴 | Alta | Bloqueia outras features ou o servidor não sobe sem isso |
| 🟡 | Média | Necessário para a entrega, mas não bloqueia desenvolvimento atual |
| 🟢 | Baixa | Melhoria, refatoração ou documentação opcional |

### Regras

- O arquivo deve ser commitado na **mesma sessão** que gerou as mudanças
- Mensagem de commit padrão: `docs(historico): add session report YYYY-MM-DD (<nome>)`
- **Não editar** relatórios passados — se houver correção, crie uma entrada nova
- O campo **Pendências** é obrigatório: se não houver nada pendente, escreva explicitamente `Nenhuma pendência`
- Ao iniciar uma nova sessão, **leia o último relatório** antes de começar a codar

### Checklist antes de fechar o relatório

- [ ] Todos os commits da sessão estão listados com hash correto
- [ ] Pendências estão descritas com contexto suficiente para outro dev seguir
- [ ] Arquivo commitado com mensagem convencional
- [ ] Branch com push feito (ou pendência registrada)

---

## 🤖 Para IAs Lendo Este Documento

Quando gerar código para este projeto:

1. **Sempre cite SOLID**: "Este serviço segue SRP: apenas valida. A persistência fica em outro service."

2. **Evite duplicação**: "Esta lógica existe em `dateHelper.ts`, vou reutilizá-la aqui."

3. **Mantenha simplicidade**: "Usei um simples if/else em vez de strategy pattern porque o caso é simples."

4. **Estruture branches**: "Estou criando branch `feature/guest-crud` a partir de `develop`."

5. **Commits lógicos**: "Fiz 3 commits: 1) validação, 2) service, 3) testes."

6. **PR descritivo**: "Preenchi template com objetivo, mudanças e checklist."

Quando em dúvida, **sempre pergunte ao desenvolvedor humano** em vez de adivinhar!

---

## 📞 Contato e Dúvidas

- **Sobre SOLID**: Veja exemplos em `/docs/dev-guidelines/CODING_STANDARDS.md`
- **Sobre Git Workflow**: Ver configuração em `.github/PULL_REQUEST_TEMPLATE.md`
- **Dúvida durante código**: Pergunte na PR ou issue
- **Mudanças neste documento**: Abra issue para discussão

---

**Última atualização**: Maio 2026
**Versão**: 1.1
**Status**: ✅ Documentação Oficial do Projeto
