# Backend Database Scaffold

Este diretório contém a estrutura mínima para executar migrations e seeders do Sequelize.

## Como usar

1. Copie `.env.example` para `.env` e ajuste os valores de conexão com PostgreSQL.

2. Instale dependências:

```bash
cd backend
npm install
```

3. Aplique migrations:

```bash
npm run migrate
```

4. Execute seeders:

```bash
npm run seed
```

5. Para desfazer todas as migrations:

```bash
npm run migrate:undo
```

## Estrutura

- `src/database/config.js` — configuração de conexão do Sequelize.
- `src/database/migrations/20260521-create-schema.js` — migration principal do schema.
- `src/database/seeders/20260521-seed-hotels.js` — seed inicial idempotente.
- `.sequelizerc` — aponta paths de config, migrations e seeders.
