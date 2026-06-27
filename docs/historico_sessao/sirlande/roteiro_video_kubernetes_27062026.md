# Roteiro de Vídeo — Avaliação Técnica: Infraestrutura de Sistemas Web
## Opção A: Docker / Orquestração Local — Kubernetes

**Data:** 27/06/2026
**Autora:** Sirlande
**Branch:** develop
**Duração alvo:** 7–8 minutos

---

## Papéis no Projeto (quem fez o quê)

| Dev | Área de responsabilidade |
|---|---|
| **Gabriel** | Arquitetura do sistema, API REST (controllers, rotas, autenticação JWT), modelagem de negócio (máquina de estados, multi-tenancy), testes de integração, orquestração geral do projeto |
| **Weslley** | Infraestrutura (Dockerfile multi-stage, manifests Kubernetes, kustomize, NetworkPolicies, pipeline de deploy) |
| **Sirlande** | Banco de dados (modelos Sequelize, schema, migrations, seed), segurança do banco (isolamento por tenant_id, constraints), PersistentVolumeClaim, reviews de segurança |

---

## Estrutura do Vídeo

```
[00:00] INTRODUÇÃO         — Gabriel        ~1 min
[01:00] INFRA KUBERNETES   — Weslley        ~3 min
[04:00] BD + SEGURANÇA     — Sirlande       ~2 min
[06:00] SISTEMA VIVO       — Gabriel        ~1,5 min
[07:30] CONCLUSÃO          — Sirlande       ~30 s
```

---

## [00:00 – 01:00] INTRODUÇÃO — Gabriel (~1 minuto)

### O que mostrar na tela
Repositório no GitHub (ou terminal com `git log`) e em seguida a listagem dos arquivos de infra.

### Fala

> "Olá, professor Alexandre. Sou o Gabriel, e aqui estão meus colegas Weslley e Sirlande.
>
> Nosso projeto é o **Sistema de Gestão de Hotel** — uma API REST para pousadas e hotéis,
> construída como SaaS multi-tenant: cada hotel opera em isolamento total,
> sem acesso aos dados dos outros.
>
> Escolhemos a **Opção A: Docker / Orquestração Local**, implementada com **Kubernetes**.
> Construímos a imagem com Docker multi-stage e orquestramos todos os serviços com
> manifests Kubernetes via kustomize — namespace, ConfigMap, Secret, PVC, Deployments,
> Services e NetworkPolicies.
>
> Vou passar a palavra para o Weslley, que vai mostrar a infraestrutura."

### Comandos a rodar

```bash
# Contexto: commits recentes
git log --oneline -5

# Arquivos principais de infraestrutura
ls Dockerfile .dockerignore k8s/
```

**Saída esperada:**
```
k8s/:
backend.yaml  configmap.yaml  kustomization.yaml  namespace.yaml
networkpolicy.yaml  nginx.yaml  pdb.yaml  postgres.yaml  redis.yaml  secret.yaml
```

---

## [01:00 – 04:00] INFRAESTRUTURA KUBERNETES — Weslley (~3 minutos)

### O que mostrar na tela
Terminal + editor mostrando os arquivos de infra.

---

### Fala — Parte 1: Dockerfile (~45 s)

> "Boa tarde. Sou o Weslley, responsável pela infraestrutura.
>
> O ponto de entrada é o Dockerfile com **multi-stage build** em dois estágios.
> O primeiro estágio — chamado `deps` — instala apenas as dependências de produção,
> sem devDependencies. O segundo estágio, `runner`, copia somente o artefato
> pronto para a imagem final.
>
> As instruções estão ordenadas para maximizar o cache: `package.json` é copiado
> antes do código-fonte, então o `npm ci` só roda novamente quando as dependências
> mudam — não a cada alteração de código.
>
> A imagem final roda como usuário `node`, nunca como root."

### Comandos a rodar

```bash
cat Dockerfile
```

**Pontos para destacar:**
```dockerfile
# Stage 1: deps — node:24-alpine
COPY package*.json ./          ← package.json ANTES do COPY . .  (layer caching)
RUN npm ci --omit=dev          ← só produção, sem devDependencies

# Stage 2: runner — node:24-alpine
COPY --from=deps /app/node_modules ./node_modules  ← artefato pronto
COPY . .
USER node                      ← não-root
EXPOSE 3000
HEALTHCHECK ...
```

```bash
cat .dockerignore
```

**Pontos para destacar:**
```
node_modules/   ← nunca enviado ao daemon
.env / .env.*   ← nunca na imagem
docs/ k8s/ tests/ seed/   ← não pertencem ao runtime
```

---

### Fala — Parte 2: Pipeline de Deploy (~75 s)

> "Agora o pipeline de deploy. Temos um script `infra_up.sh` que automatiza
> as quatro fases: build → apply → wait → migrate. Vou rodar e depois mostro
> cada fase separadamente."

```bash
bash scripts/infra_up.sh
```

**Saída esperada (resumida):**
```
============================================================
  Sistema de Gestão de Hotel — Pipeline K8s
  build → apply → wait → migrate
============================================================

[INFO]  Pré-requisitos OK.
[INFO]  Ambiente: Docker Desktop — daemon compartilhado com o host.

[INFO]  === FASE 1: BUILD ===
Successfully built <hash>
[OK]    Imagem 'sistema-gestao-hotel-backend:latest' construída.

[INFO]  === FASE 2: APPLY ===
namespace/hotel-system created
...
networkpolicy.networking.k8s.io/backend-ingress created
[OK]    Manifests aplicados no namespace 'hotel-system'.

[INFO]  === FASE 3: WAIT ===
pod/postgres-0 condition met
pod/backend-xxxxxxxxx condition met
...
[OK]    Todos os pods estão Running e Ready.

[INFO]  === FASE 4: MIGRATE ===
✅ Migrations executadas com sucesso.
[OK]    Pipeline concluído com sucesso!
```

> "Quatro fases, um comando. Vou detalhar cada fase ao professor."

> "**Fase 1 — Build:** a imagem usa multi-stage, ficando em torno de
> 120 MB — comparado a mais de 800 MB sem essa técnica."

```bash
docker images | grep sistema-gestao-hotel-backend
```

**Saída esperada:**
```
sistema-gestao-hotel-backend   latest   abc123   2 minutes ago   120MB
```

> "**Fase 2 — Apply:** o kustomize criou em sequência: namespace, ConfigMap, Secret,
> PVC, StatefulSet do PostgreSQL, Deployment do backend com 3 réplicas,
> Nginx como LoadBalancer, PodDisruptionBudget e as NetworkPolicies."

```bash
kubectl get pods -n hotel-system
```

**Saída esperada:**
```
NAME                       READY   STATUS    RESTARTS
postgres-0                 1/1     Running   0
backend-xxxxxxxxx          1/1     Running   0
backend-xxxxxxxxx          1/1     Running   0
backend-xxxxxxxxx          1/1     Running   0
nginx-xxxxxxxxx            1/1     Running   0
```

> "Três réplicas do backend. O PodDisruptionBudget garante que durante
> qualquer atualização pelo menos duas réplicas estejam disponíveis — zero downtime."

---

### Fala — Parte 3: Rede e DNS Interno (~40 s)

> "Vou mostrar os Services e a isolação de rede."

```bash
kubectl get svc -n hotel-system
```

**Saída esperada:**
```
NAME       TYPE           CLUSTER-IP      EXTERNAL-IP   PORT(S)
backend    ClusterIP      10.96.x.x       <none>        3000/TCP
nginx      LoadBalancer   10.96.x.x       localhost     80:xxxxx/TCP
postgres   ClusterIP      10.96.x.x       <none>        5432/TCP
```

> "Nginx é o único ponto de entrada externo — LoadBalancer na porta 80.
> Backend e PostgreSQL são ClusterIP — invisíveis fora do cluster.
>
> A comunicação interna usa o **nome do Service** como hostname — DNS interno do Kubernetes.
> Nenhum IP fixo em nenhum lugar."

```bash
kubectl get configmap hotel-config -n hotel-system -o yaml | grep -E "POSTGRES_HOST|POSTGRES_PORT"
```

**Saída esperada:**
```yaml
  POSTGRES_HOST: postgres
  POSTGRES_PORT: "5432"
```

> "O backend conecta ao banco pelo nome `postgres` — resolvido pelo DNS do cluster."

> "Agora executo as migrations para criar as tabelas."

```bash
kubectl exec -n hotel-system deploy/backend -- node command.js migrate
```

**Saída esperada:**
```
✅ Conexão com o banco de dados estabelecida.
✅ Migrations executadas com sucesso. Todas as tabelas estão atualizadas.
```

---

## [04:00 – 06:00] BANCO DE DADOS E SEGURANÇA — Sirlande (~2 minutos)

### O que mostrar na tela
Terminal com comandos kubectl.

---

### Fala — Parte 1: PVC e Persistência (~60 s)

> "Olá, sou a Sirlande, responsável pelo banco de dados.
>
> No Kubernetes, o PostgreSQL usa um **PersistentVolumeClaim** de 1 Gi para persistir
> os dados — diferente dos contêineres comuns, que são efêmeros. O PVC sobrevive
> à remoção e recriação de qualquer pod.
>
> Vou demonstrar: primeiro vejo o status do PVC, depois conto os registros,
> deleto o pod do postgres e confirmo que os dados ainda estão lá."

```bash
# Ver o PVC — status deve ser Bound
kubectl get pvc -n hotel-system
```

**Saída esperada:**
```
NAME            STATUS   VOLUME    CAPACITY   ACCESS MODES
postgres-data   Bound    pvc-xxx   1Gi        RWO
```

```bash
# Popular o banco com dados de exemplo (se ainda não executado)
kubectl exec -n hotel-system -i statefulset/postgres -- \
  psql -U hotel_user -d gestao_hotel < seed/seed_hotels.sql
```

```bash
# Contar registros ANTES de deletar o pod
kubectl exec -n hotel-system statefulset/postgres -- \
  psql -U hotel_user -d gestao_hotel -c "SELECT COUNT(*) AS total_tenants FROM tenants;"
```

**Saída esperada:**
```
 total_tenants
---------------
             2
```

```bash
# Deletar o pod do postgres — o StatefulSet recria automaticamente
kubectl delete pod -n hotel-system -l app=postgres

# Aguardar o pod voltar
kubectl wait --for=condition=ready pod -l app=postgres -n hotel-system --timeout=60s
```

```bash
# Contar registros DEPOIS — deve ser o mesmo valor
kubectl exec -n hotel-system statefulset/postgres -- \
  psql -U hotel_user -d gestao_hotel -c "SELECT COUNT(*) AS total_tenants FROM tenants;"
```

**Saída esperada (igual à anterior):**
```
 total_tenants
---------------
             2
```

> "Número idêntico. O pod foi recriado do zero, mas o PVC preservou todos os dados."

---

### Fala — Parte 2: Segurança e Isolamento de Rede (~60 s)

> "Agora demonstro o isolamento de rede.
>
> As credenciais ficam num Kubernetes Secret — separado do código e do ConfigMap.
> Nunca hardcoded na imagem."

```bash
kubectl get secret hotel-secret -n hotel-system
```

**Saída esperada:**
```
NAME           TYPE     DATA   AGE
hotel-secret   Opaque   2      Xm
```

> "O banco é um Service ClusterIP — sem nenhuma porta exposta no host.
> Qualquer tentativa de conectar diretamente na porta 5432 deve ser recusada."

```bash
# Tentativa de conexão DIRETA ao banco — deve FALHAR
psql -h localhost -p 5432 -U hotel_user -d gestao_hotel
```

**Saída esperada (comportamento CORRETO):**
```
psql: error: connection to server on socket... failed:
Connection refused
```

> "Recusado — o banco não tem porta no host.
>
> Além do ClusterIP, temos NetworkPolicies que definem quem pode falar com quem."

```bash
kubectl get networkpolicy -n hotel-system
```

**Saída esperada:**
```
NAME               POD-SELECTOR    AGE
backend-ingress    app=backend     Xm
postgres-ingress   app=postgres    Xm
redis-ingress      app=redis       Xm
```

```bash
kubectl describe networkpolicy postgres-ingress -n hotel-system
```

> "A policy `postgres-ingress` permite conexão ao banco **somente** a partir de pods
> com label `app=backend`. Nginx e qualquer outro pod são bloqueados por padrão.
> Defesa em profundidade: ClusterIP + NetworkPolicy."

---

## [06:00 – 07:30] SISTEMA EM FUNCIONAMENTO — Gabriel (~1,5 minutos)

### O que mostrar na tela
Terminal + navegador com o Swagger aberto.

### Fala

> "Com a infra validada, vou mostrar o sistema funcionando de ponta a ponta.
> O Nginx é o único ponto de entrada — porta 80."

```bash
curl http://localhost/health
```

**Saída esperada:**
```json
{"status":"OK","timestamp":"2026-06-27T...","service":"Sistema de Gestão de Hotel Backend"}
```

```bash
# Ver que a requisição passou pelo Nginx
kubectl logs -n hotel-system -l app=nginx --tail=3
```

**Saída esperada:**
```
... "GET /health HTTP/1.1" 200 ...
```

### No navegador

Abrir `http://localhost/api-docs` — documentação Swagger completa de todos os endpoints.

> "Vou registrar um hotel e fazer o fluxo completo para provar que o sistema está funcional."

```bash
# Registrar um hotel e usuário admin
curl -s -X POST http://localhost/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "tenantName": "Hotel Avaliação",
    "name": "Admin Teste",
    "email": "admin@avaliacao.com",
    "password": "senha123"
  }' | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['tenant']['name'], '|', d['user']['role'])"
```

**Saída esperada:**
```
Hotel Avaliação | ADMIN
```

```bash
# Login e captura do token JWT
TOKEN=$(curl -s -X POST http://localhost/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@avaliacao.com",
    "password": "senha123"
  }' | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")

echo "Token obtido: ${TOKEN:0:40}..."

# Listar quartos (rota autenticada — prova que o JWT está funcionando)
curl -s http://localhost/rooms \
  -H "Authorization: Bearer $TOKEN" \
  | python3 -c "import sys,json; print(len(json.load(sys.stdin)), 'quartos cadastrados')"
```

---

## [07:30 – 08:00] CONCLUSÃO — Sirlande (~30 segundos)

### Fala

> "Para encerrar, um resumo de como cada critério da avaliação foi atendido."

### Mostrar na tela — tabela de critérios

| Critério (peso) | Como atendemos | Status |
|---|---|---|
| **Eficiência da Imagem (20%)** | Multi-stage build (`deps` + `runner`), `.dockerignore`, layer caching, `USER node` | ✅ |
| **Arquitetura de Rede (25%)** | ClusterIP para DB e backend, LoadBalancer apenas para Nginx, DNS interno por nome de Service, NetworkPolicies | ✅ |
| **Persistência de Dados (20%)** | PersistentVolumeClaim de 1 Gi (`postgres-data`), testado ao vivo com delete de pod | ✅ |
| **Segurança (20%)** | Kubernetes Secret para credenciais, NetworkPolicies de isolamento, banco sem porta exposta, imagem não-root | ✅ |
| **Automação CI/CD (15%)** | Pipeline em 4 fases: `docker build` → `docker images` → `kubectl apply -k k8s/` → migrations | ✅ |

> "O ambiente pode ser destruído com `kubectl delete -k k8s/` e reconstruído
> do zero com `kubectl apply -k k8s/` — infraestrutura como código, completamente reproduzível.
>
> Obrigada, professor. Nosso repositório está público com todos os artefatos."

---

## Checklist Pré-Gravação

- [ ] Docker Desktop rodando com Kubernetes habilitado (`kubectl cluster-info` retorna ok)
- [ ] `kubectl delete -k k8s/` rodado antes para começar com o cluster limpo
- [ ] `docker rmi sistema-gestao-hotel-backend:latest` rodado para o build ser do zero na gravação
- [ ] `psql` instalado no WSL2 para o teste de segurança (`sudo apt install postgresql-client`)
- [ ] `python3` disponível no WSL2 (já vem por padrão)
- [ ] Swagger testado no navegador antes da gravação (`http://localhost/api-docs`)
- [ ] Microfone e screen capture testados

---

## Comandos de Backup (se algo falhar durante a gravação)

```bash
# Se kubectl apply -k k8s/ falhar — aplicar manifest por manifest
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/configmap.yaml
kubectl apply -f k8s/secret.yaml
kubectl apply -f k8s/postgres.yaml
kubectl apply -f k8s/backend.yaml
kubectl apply -f k8s/nginx.yaml
kubectl apply -f k8s/pdb.yaml
kubectl apply -f k8s/networkpolicy.yaml

# Se o pod do postgres demorar mais que 60s para voltar após o delete
kubectl get pods -n hotel-system -l app=postgres   # checar manualmente

# Se curl não retornar JSON formatado (python3 não instalado)
curl http://localhost/health
# Retorno bruto também é válido como evidência

# Se o LoadBalancer não resolver em localhost (Minikube)
minikube tunnel   # rodar em terminal separado antes da gravação

# Se psql não estiver instalado
nc -zv localhost 5432
# Resultado esperado: "Connection refused"
```

---

*Roteiro de sessão — Sirlande — 27/06/2026*
*Branch: docs/analise-docker-compose*
*Substitui: roteiro_video_avaliacao_docker_24062026.md*
