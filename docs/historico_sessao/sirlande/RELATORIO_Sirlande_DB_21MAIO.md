# Relatório Técnico — Atualização 21 de Maio

## Visão Geral
Este relatório documenta as alterações recentes do projeto `sistema_hotel_prova` com foco em banco de dados, backend e setup local. As mudanças tratam de correções de infraestrutura de dados, framework de migrations/seeders, controle de configuração e segurança de dependências.

## Novas funcionalidades adicionadas
- Criação de scaffold de backend PostgreSQL usando Sequelize com migrations e seeders.
- Seed inicial idempotente para hotéis, categorias de quartos, quartos, usuários e hóspedes.
- Script `scripts/setup_db.sh` para provisionar o banco de dados, criar usuário dedicado, instalar extensões e executar migrations + seed.
- `.env.example` e `.env.local` para orientação de configuração local segura.
- Novo relatório técnico em `docs/RELATORIO_Sirlande_DB_21MAIO/RELATORIO_Sirlande_DB_21MAIO.md`.

## Alterações importantes
- Ajuste do schema para garantir `hotels.name` como valor único, suportando `ON CONFLICT` no seeder.
- Inclusão de permissões `CREATE` no schema `public` para o usuário do aplicativo (`hotel_app`).
- Criação de `backend/package.json` com overrides de dependências para mitigar vulnerabilidades detectadas pelo `npm audit`.
- Atualização do `.gitignore` para ignorar arquivos sensíveis e pastas de dependências locais (`node_modules`).
- Adição de `backend/.env` com parâmetros de conexão padrão e recomendação de uso de usuário de banco dedicado.

## Correções realizadas
- Resolução de `permission denied for schema public` ao garantir privilégios mínimos adequados para `hotel_app`.
- Correção de `ERROR: there is no unique or exclusion constraint matching the ON CONFLICT specification` adicionando índice `UNIQUE` para `hotels.name`.
- Correção de migration PostgreSQL inválida ao eliminar `ADD CONSTRAINT IF NOT EXISTS` e usar bloco `DO $$ ... END $$;`.
- Ajuste no `package.json` do backend para aplicar overrides válidos de `@mapbox/node-pre-gyp`, `tar` e `uuid`.

## Mudanças na estrutura do projeto
- `backend/` agora contém:
  - `package.json`
  - `package-lock.json`
  - `backend/.env`, `.env.example`, `.env.local`
  - `src/database/config.js`
  - `src/database/migrations/20260521-create-schema.js`
  - `src/database/migrations/20260522-add-unique-constraint-hotels-name.js`
  - `src/database/seeders/20260521-seed-hotels.js`
  - `.sequelizerc`
- Adicionado `scripts/setup_db.sh` no diretório raiz para automação de setup local.
- Atualizado `.gitignore` no nível do projeto para ignorar chaves locais e dependências.

## Novas dependências instaladas
- `dotenv` (configuração de ambiente)
- `pg` e `pg-hstore` (conexão PostgreSQL)
- `sequelize` e `sequelize-cli` (migrations e ORM)
- `bcrypt` (hash de senha)
- `jsonwebtoken` (JWT)

### Observação de segurança
- O backend usa `package.json` com `overrides` para fixar versões seguras de dependências transitivas vulneráveis.

## Como instalar dependências
1. Navegue até o backend:

```bash
cd /home/sirlande/faculdade/TCC/sistema_hotel_prova/backend
```

2. Instale dependências:

```bash
npm install
```

3. Se houver alterações no `package.json`, execute novamente `npm install` para atualizar o `package-lock.json`.

## Como executar o projeto
### Opção recomendada (setup automático)
No diretório raiz do projeto:

```bash
cd /home/sirlande/faculdade/TCC/sistema_hotel_prova
bash scripts/setup_db.sh
```

Esse script:
- cria o usuário `hotel_app` e define senha;
- cria o banco `hotel_db`;
- concede privilégios em `public`;
- instala extensões `uuid-ossp` e `btree_gist`;
- executa `npm install`, `npm run migrate` e `npm run seed`.

### Opção manual
1. Copie o arquivo de exemplo:

```bash
cp backend/.env.local backend/.env
```

2. Ajuste os valores em `backend/.env`.
3. No diretório `backend`:

```bash
npm install
npm run migrate
npm run seed
```

## Variáveis de ambiente necessárias
- `DB_HOST` — host do PostgreSQL, padrão `127.0.0.1`
- `DB_PORT` — porta do PostgreSQL, padrão `5432`
- `DB_NAME` — nome do banco de dados, padrão `hotel_db`
- `DB_USER` — usuário do banco, recomendado `hotel_app`
- `DB_PASSWORD` — senha do usuário do banco

## Mudanças de configuração
- `backend/src/database/config.js` agora carrega `.env` com `dotenv` e define configuração para `development`, `test` e `production`.
- `.gitignore` passou a ignorar arquivos de ambiente e `node_modules` no nível do projeto e em `backend/`.
- `package.json` do backend aplica `overrides` para versões seguras de dependências transitivas.
- `scripts/setup_db.sh` automatiza criação de role, banco, privilégios e extensões no PostgreSQL.

## Novos comandos adicionados
- `npm run migrate` — aplica migrations do Sequelize.
- `npm run seed` — executa seeders do Sequelize.
- `npm run migrate:undo` — desfaz todas as migrations.
- `bash scripts/setup_db.sh` — instala dependências, provisiona o banco e executa migrations + seed.

## Tecnologias utilizadas
- Node.js
- TypeScript
- Sequelize ORM
- PostgreSQL
- dotenv
- bcrypt
- jsonwebtoken
- uuid-ossp
- btree_gist
- npm

## Exemplos de uso
### 1. Configuração local
```bash
cp backend/.env.local backend/.env
# editar backend/.env com credenciais locais
```

### 2. Setup completo
```bash
cd /home/sirlande/faculdade/TCC/sistema_hotel_prova
bash scripts/setup_db.sh
```

### 3. Executar migrations manualmente
```bash
cd backend
npm install
npm run migrate
npm run seed
```

## Observações finais
- O ambiente local agora suporta setup automático com um usuário dedicado ao banco.
- A segurança de dependências foi melhorada com overrides válidos em `backend/package.json`.
- O relatório técnico foi adicionado em `docs/RELATORIO_Sirlande_DB_21MAIO/RELATORIO_Sirlande_DB_21MAIO.md`.
