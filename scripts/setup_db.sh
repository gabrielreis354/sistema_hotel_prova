#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

PASSWORD='Ew8/kDNfo46M3~*~PV;dv273N!pU'

sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname = 'hotel_app'" | grep -q 1 || \
  sudo -u postgres psql -c "CREATE ROLE hotel_app WITH LOGIN PASSWORD '$PASSWORD';"

sudo -u postgres psql -c "ALTER ROLE hotel_app WITH LOGIN PASSWORD '$PASSWORD';"

sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname = 'hotel_db'" | grep -q 1 || \
  sudo -u postgres createdb hotel_db

sudo -u postgres psql -d hotel_db -c "GRANT CONNECT ON DATABASE hotel_db TO hotel_app;"
sudo -u postgres psql -d hotel_db -c "GRANT USAGE, CREATE ON SCHEMA public TO hotel_app;"
sudo -u postgres psql -d hotel_db -c "GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO hotel_app;"
sudo -u postgres psql -d hotel_db -c "GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO hotel_app;"
sudo -u postgres psql -d hotel_db -c "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO hotel_app;"
sudo -u postgres psql -d hotel_db -c "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE ON SEQUENCES TO hotel_app;"

sudo -u postgres psql -d hotel_db -c "CREATE EXTENSION IF NOT EXISTS \"uuid-ossp\";"
sudo -u postgres psql -d hotel_db -c "CREATE EXTENSION IF NOT EXISTS btree_gist;"

cd backend
npm install
npm run migrate
npm run seed
