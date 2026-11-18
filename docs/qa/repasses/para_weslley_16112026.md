# Repasses para Weslley — 16/11/2026

Origem: QA Red Team da branch `fix/minio-build-do-fonte` (`docs/qa/redteam_minio-build-do-fonte_16nov2026.md`). Os achados abaixo estão fora do diff da branch e não entram no veredito dela.

### 🟡 [infra/k8s] MinIO do k8s ainda usa `quay.io/minio/minio:latest`
**Onde:** `infra/k8s/minio.yaml:33-36` (contêiner `minio`) e `infra/k8s/minio.yaml:84` (contêiner `setup`)
**Cenário:** um nó novo, sem a imagem em cache, faz pull anônimo do quay e recebe 401, a mesma falha que motivou a branch no compose. O pod fica em `ImagePullBackOff`, e upload e download de PDF param. Além disso, `:latest` é mutável: um nó que já tinha a imagem e outro que baixa depois podem rodar versões diferentes. O comentário das linhas 33-35 afirma que o quay resolve, e isso deixou de ser verdade.
**Regra violada:** paridade compose × k8s (cabeçalho do `docker-compose.yml`); imagem sem versão fixa.
**Correção sugerida:** publicar a imagem do `docker/minio/Dockerfile` num registro do time (com digest) e usá-la nos dois contêineres. Ou carregá-la no cluster (`minikube image load`). Depois, atualizar o comentário.

### 🟢 [compose] Comentário diz "initContainer"
**Onde:** `docker-compose.yml:66`
**Cenário:** o texto diz "Mesmo script do initContainer do k8s". No `infra/k8s/minio.yaml:83`, o `setup` é um contêiner lateral que fica dormindo, não um initContainer. Quem for depurar procura no lugar errado.
**Correção sugerida:** trocar por "do contêiner `setup` do pod do MinIO".
