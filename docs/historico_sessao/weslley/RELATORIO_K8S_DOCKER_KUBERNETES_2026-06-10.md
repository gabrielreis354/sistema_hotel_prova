# Relatorio de Mudancas - Kubernetes, Docker e Infra

**Data:** 10 de Junho de 2026  
**Projeto:** Sistema de Gestao de Hotel  
**Responsavel:** Weslley  
**Area:** Infraestrutura, Docker e Kubernetes

---

## Resumo

Nesta sessao foi adicionada a estrutura de Kubernetes ao projeto, tanto para atender ao Lab 9 de fundamentos de K8s quanto para representar a infraestrutura completa do sistema de hotel.

O projeto agora possui:

- manifests Kubernetes completos para o sistema real;
- manifests simples de Deployment e Service para o Lab 9;
- documentacao explicando o uso de Kubernetes;
- atualizacao do README principal;
- atualizacao da arquitetura de infraestrutura.

---

## Arquivos Criados

### Kubernetes completo do sistema

Pasta criada:

```txt
k8s/
```

Arquivos adicionados:

| Arquivo | Funcao |
|---------|--------|
| `k8s/namespace.yaml` | Cria o namespace `hotel-system` |
| `k8s/configmap.yaml` | Guarda configuracoes nao sensiveis da aplicacao |
| `k8s/secret.yaml` | Guarda senha do banco e segredo JWT |
| `k8s/postgres.yaml` | Cria PostgreSQL com Service e PVC |
| `k8s/backend.yaml` | Cria backend Express com 3 replicas |
| `k8s/nginx.yaml` | Cria Nginx como entrada HTTP |
| `k8s/kustomization.yaml` | Permite aplicar todos os manifests juntos |

### Kubernetes dentro da pasta Docker

Pasta criada:

```txt
docker/kubernetes/
```

Arquivos adicionados:

| Arquivo | Funcao |
|---------|--------|
| `docker/kubernetes/deployment.yaml` | Deployment simples do Lab 9 com Nginx e 3 replicas |
| `docker/kubernetes/service.yaml` | Service NodePort expondo a aplicacao na porta `30080` |
| `docker/kubernetes/kustomization.yaml` | Permite aplicar Deployment e Service juntos |
| `docker/kubernetes/README.md` | Guia de execucao com Minikube e kubectl |

### Documentacao criada

| Arquivo | Funcao |
|---------|--------|
| `docs/infra/KUBERNETES.md` | Documento explicando Kubernetes na infraestrutura do projeto |

---

## Arquivos Alterados

| Arquivo | Mudanca |
|---------|---------|
| `README.md` | Adicionada secao de Kubernetes e referencia ao Lab 9 em `docker/kubernetes/` |
| `docs/infra/ARQ_INFRA.md` | Kubernetes passou a aparecer como parte da infraestrutura do projeto |
| `docs/infra/KUBERNETES.md` | Incluidas respostas conceituais do Lab 9 e referencia aos manifests simples |

---

## O Que Foi Implementado

### 1. Infraestrutura Kubernetes completa

Foi criada uma estrutura Kubernetes para executar o sistema com os mesmos componentes do Docker Compose:

```txt
Cliente -> Nginx -> Backend Express -> PostgreSQL
```

Componentes:

- PostgreSQL com volume persistente;
- backend Express com 3 replicas;
- Nginx como ponto de entrada;
- ConfigMap para variaveis comuns;
- Secret para dados sensiveis;
- Namespace para isolar os recursos.

### 2. Lab 9 de Kubernetes

Foi criada uma versao simples, seguindo o laboratorio da disciplina:

- `Deployment` chamado `web-app-deployment`;
- 3 replicas;
- imagem `nginx:alpine`;
- label `app: web-app`;
- `Service` chamado `web-app-service`;
- Service do tipo `NodePort`;
- porta externa `30080`.

### 3. Documentacao academica

Foi documentado:

- diferenca entre os manifests completos e os manifests do Lab 9;
- comandos para aplicar os YAMLs;
- comandos para verificar pods, deployments e services;
- comando para escalar replicas;
- respostas conceituais sobre Deployment, Service, labels e roteamento.

---

## Comandos de Validacao Executados

Os manifests foram renderizados com Kustomize:

```bash
kubectl kustomize docker/kubernetes
kubectl kustomize k8s
```

Resultado:

- manifests do Lab 9 renderizados corretamente;
- manifests completos do sistema renderizados corretamente.

Observacao: o comando `kubectl apply --dry-run=client` tentou conectar em um cluster local, mas nao havia Minikube/cluster ativo em `localhost:8080`. Por isso a validacao final foi feita com `kubectl kustomize`, que nao depende do cluster estar rodando.

---

## Como Executar o Lab 9

```bash
minikube start
kubectl apply -k docker/kubernetes
kubectl get deployments
kubectl get pods
kubectl get services
minikube service web-app-service --url
```

Para escalar:

```bash
kubectl scale deployment web-app-deployment --replicas=5
kubectl get pods
```

Para limpar:

```bash
kubectl delete -k docker/kubernetes
minikube stop
```

---

## Como Executar o Kubernetes Completo do Projeto

Criar a imagem local:

```bash
docker build -t sistema-gestao-hotel-backend:latest .
```

Aplicar os manifests:

```bash
kubectl apply -k k8s
kubectl get pods -n hotel-system
kubectl get svc -n hotel-system
```

Se estiver usando Minikube:

```bash
minikube service nginx -n hotel-system
```

---

## Respostas Conceituais do Lab 9

1. Se um Pod morrer, o objeto responsavel por recriar outro Pod e o `Deployment`.
2. Para comunicacao interna, outros Pods devem usar o `Service`, pois ele fornece um endereco estavel.
3. O trafego chega no `NodePort 30080`, passa pelo Service e vai para a porta `80` do container.
4. A label que conecta Deployment e Service e `app: web-app`.

---

## Status Final

| Item | Status |
|------|--------|
| Kubernetes completo do sistema | Concluido |
| Kubernetes simples do Lab 9 | Concluido |
| Documentacao em `docs/infra` | Concluida |
| README atualizado | Concluido |
| Validacao com Kustomize | Concluida |

---

**Fim do relatorio**
