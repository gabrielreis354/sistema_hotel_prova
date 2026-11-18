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
* Kubernetes (ambiente principal);
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

* Sequelize ORM;
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

* Kubernetes (ambiente principal de execucao).

---

# Kubernetes na Infraestrutura

O Kubernetes e o ambiente de execucao do projeto. Ele organiza cada parte do sistema como recurso do cluster (Deployment, Service, ConfigMap, Secret, PVC), mantendo a mesma arquitetura logica de Docker/Nginx/PostgreSQL.

## Componentes Kubernetes

| Componente | Recurso | Objetivo |
|------------|---------|----------|
| PostgreSQL | Deployment, Service e PVC | Persistência dos dados |
| Backend Express | Deployment e Service | API REST com 3 réplicas |
| Nginx | Deployment e Service | Entrada HTTP do sistema |
| ConfigMap | Configuração | Variáveis não sensíveis |
| Secret | Segurança | `hotel-secret`: senha do banco, webhook PIX, MinIO e RabbitMQ · `jwt-rsa-keys`: par RS256 do JWT, não versionado (ADR-006) |
| Namespace | Organização | Isolamento lógico do projeto |

## Fluxo

```txt
Cliente -> Nginx -> Backend Express -> PostgreSQL
```

## Arquivos

Os manifests ficam na pasta:

```txt
k8s/
```

E a documentação detalhada fica em:

```txt
docs/infra/KUBERNETES.md
```

---

# Estimativa de Custo na AWS

O alvo de nuvem (5º semestre) está descrito no **Doc. 05 — Arquitetura em Nuvem**, no repositório da faculdade (`Projetos/gesway/05-arquitetura-nuvem.md`). A estimativa de custo está registrada no AWS Pricing Calculator:

**<https://calculator.aws/#/estimate?id=f99d8d693468d8c0f53c77c4693409c81a4f06e8>** (link público, válido até 14/11/2027)

Cenário: teto de planejamento do Doc. 05, com 30 sessões de 4 horas por mês (120 horas), em `sa-east-1`. Todo recurso efêmero é destruído ao fim de cada sessão.

| Serviço | Configuração | US$/mês |
|---|---|---|
| Amazon EC2 | `t3.small` On-Demand, 120 h; EBS gp3 de 20 GB | 4,52 |
| Amazon RDS for PostgreSQL | `db.t3.micro` Single-AZ, 120 h; gp3 de 20 GB | 8,94 |
| Amazon VPC | 1 IPv4 público por 120 h | 0,60 |
| Amazon ECR | 1 GB, permanente | 0,10 |
| Amazon S3 | 1 GB Standard | 0,05 |
| **Total** | | **14,21** |

A calculadora cobra o disco do RDS pelo mês inteiro e não aceita menos de 20 GB. No ciclo efêmero, o custo real desse disco é cerca de US$ 0,72, e o total fica em cerca de US$ 10,55 por mês. O consumo é descontado do plano gratuito de créditos da AWS (US$ 100 na criação da conta). Os detalhes estão na §6 do Doc. 05.
