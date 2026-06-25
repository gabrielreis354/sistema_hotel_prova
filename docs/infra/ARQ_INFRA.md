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
