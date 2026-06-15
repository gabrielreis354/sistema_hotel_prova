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
* Kubernetes;
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
* Kubernetes.

---

# Kubernetes na Infraestrutura

O Kubernetes foi adicionado como uma alternativa moderna para orquestrar os containers do sistema. Ele mantém a mesma ideia da infraestrutura com Docker/Nginx/PostgreSQL, mas organiza cada parte como recurso do cluster.

## Componentes Kubernetes

| Componente | Recurso | Objetivo |
|------------|---------|----------|
| PostgreSQL | Deployment, Service e PVC | Persistência dos dados |
| Backend Express | Deployment e Service | API REST com 3 réplicas |
| Nginx | Deployment e Service | Entrada HTTP do sistema |
| ConfigMap | Configuração | Variáveis não sensíveis |
| Secret | Segurança | Senha do banco e JWT secret |
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
