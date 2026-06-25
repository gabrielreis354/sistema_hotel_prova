# Arquitetura do Backend — Por Que Está Assim

> **Documento de referência técnica**
> Explica as decisões arquiteturais do backend, camada por camada.
> Destinado a devs que precisam entender o projeto de verdade, não só executá-lo.

---

## O Fluxo Completo de uma Requisição

Antes de explicar as camadas, veja o que acontece quando alguém faz `PUT /reservations/:id/check-in`:

```
HTTP Request
    ↓
_web.js  →  bootstrap/app.js  →  routes/router.js
    ↓
reservationRouter.js
    ↓
auth.middleware.js  →  (valida JWT, coloca user no request)
    ↓
CheckInController.js  →  ReservationModel + RoomModel
    ↓
PostgreSQL (dentro de uma transação)
    ↓
HTTP Response
```

Cada parada dessa cadeia tem um motivo. As seções abaixo explicam cada uma.

---

## Camada 1 — Entrypoints (`_web.js` e `command.js`)

O projeto tem **dois pontos de entrada** deliberadamente separados:

```js
// _web.js — inicia o servidor HTTP
app();               // bootstrap primeiro
web.use('/', router);
web.listen(3000);

// command.js — CLI
if (command === 'migrate') { migrate(); }
```

**Por que separar?** Porque o servidor HTTP e um comando CLI são coisas fundamentalmente diferentes. Se você misturar tudo em um arquivo, quando você rodar `node command.js migrate` ele tentaria subir o Express também. Separando, cada entrypoint faz exatamente o que precisa fazer — nada a mais.

---

## Camada 2 — Bootstrap (`bootstrap/app.js`)

```js
export default function app() {
    dotenv.config();   // carrega .env
    initRelations();   // registra associações do Sequelize
}
```

Ambos os entrypoints chamam isso primeiro. **Por que existe?** Porque o `_web.js` e o `command.js` precisam das mesmas inicializações. Se você colocasse `dotenv.config()` e `initRelations()` diretamente no `_web.js`, o `command.js` ficaria sem elas ou teria código duplicado. O bootstrap é o ponto único de inicialização — muda aqui, muda pra todos.

---

## Camada 3 — Banco de Dados (`database/`)

### Singleton de conexão

```js
// database/connections/sequelize.js
export default (() => {
    return new Sequelize(DB, USER, PASS, { host, dialect: 'postgres' });
})();
```

Esse padrão com `(() => { ... })()` é um **IIFE** (função que se executa imediatamente). O resultado — uma única instância do Sequelize — é o que o módulo exporta. Como o Node.js **faz cache de módulos**, todo arquivo que importar `sequelize.js` vai receber exatamente a mesma conexão. Você não cria 30 conexões com o banco — cria uma, e todo mundo compartilha.

### Relações separadas dos Models

```js
// database/relations.js
TenantModel.hasMany(ReservationModel, { foreignKey: 'tenant_id' });
ReservationModel.belongsToMany(RoomModel, { through: ReservationRoomModel });
// ...
```

As associações do Sequelize ficam **fora** dos Models. Por quê? Se `ReservationModel` importasse `RoomModel` e `RoomModel` importasse `ReservationModel`, você teria uma dependência circular — os dois precisam um do outro para existir, mas nenhum consegue ser criado antes do outro. Colocando tudo em `relations.js`, você registra as associações **depois** que todos os models já foram carregados.

---

## Camada 4 — Models (`app/Models/`)

```js
const ReservationModel = sequelize.define('ReservationModel', {
    id:        { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    tenant_id: { type: DataTypes.UUID, allowNull: false },
    status:    { type: DataTypes.TEXT, defaultValue: 'PENDING' },
    // ...
}, {
    tableName: 'reservations',
    paranoid: true,   // soft delete
    deletedAt: 'deleted_at'
});
```

Três decisões importantes aqui:

**1. UUID como chave primária**

Em um SaaS onde vários hotéis usam o mesmo banco, IDs sequenciais (1, 2, 3...) são perigosos. Um usuário mal-intencionado poderia tentar `GET /reservations/1`, `GET /reservations/2` e navegar por dados de outros hotéis. UUID é imprevisível e globalmente único — a reserva `8f3a2c1d-...` de um hotel não tem relação com nenhuma outra.

**2. `tenant_id` em todo modelo**

Cada tabela carrega o identificador do hotel dono daquele dado. É a fundação do multi-tenancy — sem isso, um hotel veria os dados do outro.

**3. Soft delete (`paranoid: true`)**

Quando você deleta uma reserva, ela não some do banco — o campo `deleted_at` recebe a data. Por quê? Hotel lida com dados financeiros e jurídicos. Você nunca pode destruir um histórico de pagamento ou estadia. O Sequelize filtra automaticamente registros com `deleted_at` preenchido em todas as queries — você não precisa se lembrar de filtrar manualmente.

---

## Camada 5 — Middlewares (`middlewares/`)

O projeto tem três middlewares que formam uma **pipeline de segurança**:

```
auth.middleware.js   → "Quem é você?" (valida JWT)
     ↓
role.middleware.js   → "Você pode fazer isso?" (verifica ADMIN/STAFF)
     ↓
Controller           → "Aqui está o que você pediu"
```

```js
// auth.middleware.js
const payload = jwt.verify(token, process.env.JWT_SECRET);
request.user = payload; // { userId, role, tenantId }
next();
```

O JWT é decodificado **uma vez** e o `tenantId` vai direto no `request.user`. Todo controller depois disso pega `request.user.tenantId` — o usuário **jamais** pode enviar seu próprio `tenantId` no body da requisição. O servidor decide de qual hotel aquele token pertence. Isso é segurança por design.

---

## Camada 6 — Routers (`routes/`)

```js
// router.js — o maestro
router.use('/reservations', reservationRouter);
router.use('/rooms',        roomRouter);
// ...

// reservationRouter.js — especialista em reservas
router.get('/',              authMiddleware, ListReservationController);
router.put('/:id/check-in', authMiddleware, CheckInController);
router.put('/:id/cancel',   authMiddleware, CancelReservationController);
```

Dois níveis de router. **Por quê?** Se você colocar todas as rotas em um arquivo só, com 7 domínios × 5–8 rotas cada, você tem 50+ linhas de rotas misturadas. Com dois níveis, o `router.js` só sabe que `/reservations` existe — quem sabe o que `/reservations` faz é o `reservationRouter.js`.

---

## Camada 7 — Controllers (`app/Controllers/`)

Aqui está a decisão mais importante da arquitetura: **um arquivo por ação**.

```
ReservationApi/
  ListReservationController.js    ← só lista
  GetReservationController.js     ← só busca um
  CreateReservationController.js  ← só cria
  CheckInController.js            ← só faz check-in
  CancelReservationController.js  ← só cancela
```

Por que não um único `ReservationController.js` com 10 métodos? Porque quando o `CheckInController` tem um bug, você abre **um arquivo de ~40 linhas** que faz exatamente uma coisa. Se estivesse em um controller monolítico com 300 linhas, você procuraria o bug no meio de código de cancelamento, listagem e criação.

Isso se chama **Princípio da Responsabilidade Única (SRP)**: cada arquivo tem um único motivo para existir e um único motivo para mudar.

### Máquina de estados protegida

```js
// CheckInController.js
if (!['PENDING', 'CONFIRMED'].includes(reservation.status)) {
    return response.status(422).json({ error: `Check-in não permitido no status '${reservation.status}'` });
}
```

O status da reserva **não pode ser alterado** via `PUT /reservations/:id`. Existe um endpoint dedicado para cada transição — `/check-in`, `/check-out`, `/cancel`. Por quê? Porque check-in não é só mudar um campo de texto. Ele precisa mudar o status da reserva **e** o status do quarto **ao mesmo tempo**, dentro de uma transação. Se você deixasse o cliente enviar `{ status: "CHECKED_IN" }`, ele jamais lembraria de atualizar o quarto também.

### Transação Sequelize

```js
// CheckInController.js
await sequelize.transaction(async (t) => {
    reservation.status = 'CHECKED_IN';
    room.status = 'OCCUPIED';
    await reservation.save({ transaction: t });
    await room.save({ transaction: t });
    // Se qualquer save falhar → ROLLBACK automático dos dois
});
```

Dois saves, uma transação. O banco garante que os dois acontecem juntos ou nenhum acontece. Sem isso, se o servidor cair entre o primeiro e o segundo save, você teria uma reserva em CHECKED_IN mas um quarto ainda AVAILABLE — um estado inconsistente que nenhum código conseguiria detectar.

---

## Camada 8 — Utils (`app/utils/`)

```js
// checkReservationConflict.js
export async function checkReservationConflict(roomId, checkIn, checkOut, ...) {
    // lógica de sobreposição de datas
}
```

Esta função é usada em dois lugares: `CreateReservationController.js` e `ListAvailableRoomsController.js`. A regra de conflito ("um quarto não pode ter duas reservas no mesmo período") existe em **um único arquivo**. Se a regra mudar — por exemplo, reservas CANCELLED passarem a bloquear novas — você muda aqui e os dois controllers se atualizam automaticamente. Isso é **DRY** (Don't Repeat Yourself).

---

## Resumo — Por que isso é bom

| Decisão | Benefício prático |
|---|---|
| Um Controller por ação | Você sabe exatamente onde está o bug |
| Middlewares em pipeline | Auth nunca fica misturada com lógica de negócio |
| Singleton de conexão | Um pool de conexões com o banco, não 30 |
| Relations separadas dos Models | Sem dependência circular |
| UUID nas PKs | Usuários não conseguem adivinhar IDs de outros tenants |
| `tenant_id` em toda query | Impossível vazar dados entre hotéis |
| Soft delete (`paranoid`) | Histórico financeiro nunca é destruído |
| Endpoints de estado (check-in, cancel) | Regras de negócio são obrigatórias, não opcionais |
| Transações para 2+ tabelas | Banco nunca fica em estado inconsistente |
| Utils compartilhados | Regra de negócio muda em um lugar, vale pra todos |

A estrutura não é assim por acidente ou por seguir tutorial — cada decisão existe porque o contrário causaria um problema real numa aplicação de hotel em produção.

---

*Documento criado em 18/06/2026 — Gabriel (dev senior / orquestrador)*
