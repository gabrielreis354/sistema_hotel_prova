# Banco do Gesway no Amazon RDS (conta do Workshop Studio) — 31/10/2026

**Dev:** Weslley (sessão orquestrada com Claude Code)
**Conta:** AWS do Workshop Studio, `us-east-1`, papel `WSParticipantRole/Participant`. A conta é temporária e some quando o evento acaba.
**Código:** `develop` em `4234915` (merge do PR #104), clonado do GitHub dentro do CloudShell.
**Status:** banco no ar, com schema e seed aplicados. Banco, conexão TLS e API testados. **Nada no repositório mudou.**

## Por que assim

Esta é uma experiência fora da grade: a nuvem é do 5º semestre (decisão de 21/10). O objetivo foi ver o banco do Gesway rodando num PostgreSQL gerenciado, com o mesmo `command.js` do Docker, sem custo para o time.

Três bloqueios mudaram o caminho:
1. **Credenciais da CLI vencidas no PC** (`ExpiredToken`; o `~/.aws/credentials` era de 30/10). O link de login do Workshop Studio só abre o console e não vira credencial de terminal.
2. **Tirar credenciais do CloudShell para o PC foi barrado** pelo bloqueio automático de segurança do Claude Code. Foi melhor assim: as credenciais nunca saíram da AWS.
3. **O papel do workshop não pode enviar arquivos ao CloudShell** (`cloudshell:GetFileUploadUrls` negado). O código veio por `git clone` do repositório público.

Por isso tudo rodou **dentro do CloudShell**, digitado pelo console.

## O que foi criado

| Recurso | Valor |
|---|---|
| Instância RDS | `gesway-db`, PostgreSQL **17.11**, `db.t4g.micro`, 20 GB gp2 |
| Banco / usuário | `gestao_hotel` / `hotel_admin` |
| Endpoint | `gesway-db.cwxymkwoywd4.us-east-1.rds.amazonaws.com:5432` |
| Rede | VPC padrão `vpc-0d9948ce2bad3b95e`, acesso público **só por IP** |
| Security group | `sg-066fade1da1fab28e`: 5432 liberada para o CloudShell (`100.28.230.139/32`) e o PC do dev (`138.99.162.83/32`) |
| Backup / Multi-AZ / proteção contra exclusão | desligados (banco descartável) |
| Tag | `projeto=gesway` |
| Senha | gerada no CloudShell (`openssl rand`), em `~/gesway/senha.txt` com `chmod 600`. Não saiu da AWS nem entrou no git |

O backend não configura SSL. O RDS com PostgreSQL 17 exige SSL, e o driver `pg` lê a variável `PGSSLMODE`. Com `PGSSLMODE=no-verify`, conectou sem mudar código. O certificado não é validado, o que serve para teste, mas não para produção: lá, o caminho é `verify-full` com o bundle de CA da AWS.

## Como foi feito (no CloudShell)

```bash
# 1. Rede: security group com a 5432 só para dois IPs
aws ec2 create-security-group --group-name gesway-rds-sg ...
aws ec2 authorize-security-group-ingress --group-id $SG --protocol tcp --port 5432 --cidr <ip>/32

# 2. RDS
aws rds create-db-instance --db-instance-identifier gesway-db --engine postgres --engine-version 17.11 \
  --db-instance-class db.t4g.micro --allocated-storage 20 --storage-type gp2 \
  --master-username hotel_admin --master-user-password "$(cat senha.txt)" --db-name gestao_hotel \
  --vpc-security-group-ids $SG --publicly-accessible --no-multi-az --backup-retention-period 0 --no-deletion-protection

# 3. Código e dependências (Node 20 do CloudShell)
git clone --depth 1 -b develop https://github.com/gabrielreis354/sistema_hotel_prova.git repo
cd repo/services/core-service && npm ci --omit=dev

# 4. Schema e seed, com o mesmo CLI do Docker
export POSTGRES_HOST=<endpoint> POSTGRES_DB=gestao_hotel POSTGRES_USER=hotel_admin POSTGRES_PASSWORD=... PGSSLMODE=no-verify
node command.js migrate
ALLOW_SEED=1 node command.js seed
```

A criação do RDS levou cerca de 5 minutos (18:27 a 18:32).

## Testes

**Banco** (consultas diretas com `pg`):

| # | Teste | Resultado |
|---|---|---|
| T1 | Versão | PostgreSQL 17.11 |
| T2 | Conexão cifrada | `ssl: true`, TLSv1.3 |
| T3 | Tabelas no `public` | 17 |
| T4 | Seed | 2 hotéis, 6 usuários, 5 categorias, 25 quartos, 60 hóspedes, 40 reservas, 28 pagamentos, 9 contas, 12 itens de conta, 14 produtos |
| T5 | Hotéis | Hotel Aurora (`aurora`), Pousada Sol (`sol`) |
| T6 | Usuários | ADMIN, RECEPTIONIST e WAITER do Aurora; ADMIN e RECEPTIONIST do Sol |
| T7 | Chaves estrangeiras | 34 |

**API** (backend rodando no CloudShell contra o RDS, chaves JWT geradas lá com `scripts/gerar_chaves_jwt.js`):

| # | Teste | Resultado |
|---|---|---|
| A1 | `GET /health` | 200 |
| A2 | Login `admin@aurora.example` | token JWT RS256 emitido |
| A3 | `/rooms`, `/guests`, `/reservations`, `/analytics/occupancy`, `/analytics/revenue`, `/analytics/top-guests` | 200 em todos; receita de 2026 = R$ 19.500 |
| A4 | Recepção em `/analytics/top-guests` | 403 (RT-51) |
| A5 | Isolamento entre hotéis | o ADMIN do Sol vê 20 hóspedes, o do Aurora vê 40 |

**Do PC do dev:** a porta 5432 do endpoint abre a partir de `138.99.162.83`. Ficou só nesse teste de porta, porque a senha está no CloudShell.

## Achados

1. **O `command.js` funciona sem mudança contra um PostgreSQL gerenciado.** Isso vale para o 5º semestre: o mesmo `migrate` e `seed` servem para o RDS.
2. **O SSL fica a cargo da variável de ambiente.** O `sequelize.js` não tem opção de SSL. Para produção, convém um `dialectOptions.ssl` explícito com `verify-full`, sem depender de `PGSSLMODE`. Fica como pendência para a SPEC-02.
3. **O Node do CloudShell é o 20**, e o projeto pede o 24. O `migrate`, o `seed` e a API rodaram no 20, sem erro.
4. **`db.t4g.micro` é suficiente** para o seed de demonstração. O Doc 05 prevê `t3.small` para a aplicação; o banco gerenciado é uma alternativa a avaliar no ADR-004.

## Custo e limpeza

A conta é do workshop, sem cobrança para o time, e é apagada com o evento. Se for usar a conta para outra coisa, apague antes, no CloudShell:

```bash
aws rds delete-db-instance --db-instance-identifier gesway-db --skip-final-snapshot --delete-automated-backups
aws rds wait db-instance-deleted --db-instance-identifier gesway-db
aws ec2 delete-security-group --group-id sg-066fade1da1fab28e
```

## Pendências

- Apagar o RDS e o security group se a conta continuar ativa depois do uso.
- Decidir na SPEC-02 se o SSL vai para o `sequelize.js` com `verify-full`.
- Levar o achado 4 (RDS × Postgres no EC2) para a revisão do ADR-004 / Doc 05, no 5º semestre.
