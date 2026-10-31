# QA Red Team — migrate antes e depois do rollout
**Branch:** fix/migrate-antes-e-depois-do-rollout · **Dev:** Weslley · **Base:** develop@a6dc1ea · **Data:** 28/10/2026
**Arquivos auditados:** 4 (`start.sh`, `infra/k8s/jobs/backend-migrate.yaml`, `infra/k8s/networkpolicy.yaml`, `docs/infra/KUBERNETES.md`) + contexto: `infra/k8s/backend.yaml`, `infra/k8s/nginx.yaml`, `infra/k8s/configmap.yaml`, `infra/k8s/observability.yaml`, `services/core-service/command.js`, `services/core-service/_web.js`, `README.md`, `docs/db/ARQ_DATABASE.md`
**Achados no escopo:** 10 (🔴 0 · 🟡 6 · 🟢 4) · **Repassados:** 0

Origem: `docs/qa/repasses/para_weslley_19102026.md`. Ele pedia três coisas:
1. 🟡 migrate antes de os pods novos receberem tráfego;
2. 🟢 migrate de novo depois do rollout;
3. código 1 do migrate tratado como falha do deploy.

As três estão implementadas. O item 2 continua com uma janela residual (🟡-1).

## Veredito
**APROVADO COM RESSALVAS**

Nenhum achado 🔴. O pior caso de cada ressalva é o mesmo `503` fail-safe que o repasse já aceitava, ou um deploy que trava ou para sem diagnóstico. Nenhum valor sai errado e nenhum dado vaza.

## Achados no escopo

### 🟡-1 [deploy] O 2º migrate roda enquanto os pods antigos ainda atendem (até 60 s)
**Onde:** `start.sh:140-141`. A causa está em `infra/k8s/backend.yaml:125` (`terminationGracePeriodSeconds: 60`), `services/core-service/_web.js:51` (PID 1 sem handler de SIGTERM, de propósito) e `infra/k8s/nginx.yaml:15-17` (`upstream backend_pool` com `keepalive 32`).

**Cenário:**
1. `kubectl rollout status` volta assim que o ReplicaSet antigo chega a 0 réplicas. Pod em `Terminating` não conta.
2. Os pods antigos ignoram o SIGTERM e seguem servindo até o SIGKILL, 60 s depois.
3. As conexões keepalive do nginx continuam presas, via conntrack, ao IP do pod antigo.
4. Então o garçom lança um consumo, o pedido cai num pod antigo e grava em `consumptions`. O `run_migrate_job` da linha 141 já começou, ou até já terminou, alguns segundos depois do rollout.
5. Esse consumo fica fora de `account_items`. O bill da reserva responde `503` até o próximo deploy, e nenhum alarme dispara porque o 2º migrate saiu com 0.

É o cenário do 🟢 do repasse, com a janela reduzida de "todo o rollout" para "até 60 s", mas ainda aberta.

**Regra violada:** repasse de 19/10 (🟢, item "migrate só antes deixa 503 preso").

**Correção sugerida:** antes do rollout, guardar os pods antigos. Depois do `rollout status`, esperar que eles sumam e só então rodar o 2º migrate:
```bash
old=$(kubectl get pods -n "$NS" -l app=backend -o name)
# ... set image / rollout restart / rollout status ...
[ -n "$old" ] && kubectl wait -n "$NS" --for=delete $old --timeout=90s
run_migrate_job "$image"
```

### 🟡-2 [deploy] O loop de espera não tem teto, ignora as condições do Job e não mostra a causa da falha
**Onde:** `start.sh:101-109` e `infra/k8s/jobs/backend-migrate.yaml:22`.

**Cenário A, ImagePullBackOff** (tag errada no `./start.sh deploy img:v2`, ou imagem não carregada no kind):
- O pod fica `Pending`, com `succeeded` e `failed` vazios, e o loop gira 600 s sem imprimir nada.
- No `activeDeadlineSeconds`, o controller apaga o pod. O `kubectl logs` da linha 105 falha (é engolido pelo `|| true`).
- O operador lê "Corrija a causa no log acima" com o log vazio. A causa (`ErrImagePull`, `DeadlineExceeded`) só aparece em `kubectl describe job` ou nos eventos.

**Cenário B, pod que nunca é criado** (ResourceQuota, LimitRange, admission ou PSA recusando o pod):
- No deadline o Job ganha a condição `Failed`, mas `.status.failed` pode continuar vazio, porque nenhum pod chegou a terminar.
- O `status` fica `/`, nenhum ramo do `case` casa e o loop roda para sempre.
- **SUSPEITA:** não confirmei em cluster se o job-controller da v1.34 incrementa `failed` sem pod. Basta criar uma ResourceQuota `pods: 0` no namespace e rodar `./start.sh migrate`.

**Regra violada:** fail-safe (CLAUDE.md §7). O script assume que `succeeded` ou `failed` vai virar 1, mas a fonte de verdade do Job são as `conditions`.

**Correção sugerida:**
- Ler `.status.conditions[?(@.status=="True")].type` e sair em `Complete` ou `Failed`.
- Na falha, imprimir `reason`/`message` da condição mais `kubectl get events --field-selector involvedObject.name=<pod>`.
- Pôr um teto de iterações no loop (por exemplo `activeDeadlineSeconds` + 60 s) que chame `err`.

### 🟡-3 [docs] O runbook só cobre a falha antes do rollout
**Onde:** `docs/infra/KUBERNETES.md:142-143` e `start.sh:140-141`.

**Cenário 1:** o rollout estoura os 300 s (pod novo em CrashLoop, por exemplo).
- O `set -e` encerra o script na linha 140, sem 2º migrate e sem `rollout undo`.
- O Deployment fica misto: pods antigos gravando em `consumptions` e pods novos já servindo.
- A doc só diz "falha do Job para o deploy antes do rollout" e não explica o que fazer aqui.

**Cenário 2:** o 2º migrate sai com código 1.
- Os pods novos já estão no ar.
- A frase "para o deploy antes do rollout" é falsa nesse caso.

**Correção sugerida:** acrescentar duas linhas ao runbook:
- rollout estourou → corrigir a causa ou rodar `kubectl rollout undo deploy/backend -n hotel-system`, e em seguida `./start.sh migrate`;
- 2º migrate falhou → os pods novos já estão no ar; corrigir as reservas listadas no log e rodar `./start.sh migrate`.

### 🟡-4 [docs] README e ARQ_DATABASE ainda ensinam o caminho que o repasse condenou
**Onde:** `README.md:241`, `README.md:802`, `README.md:1147`, `README.md:1190` e `docs/db/ARQ_DATABASE.md:245`. Todos usam `kubectl exec -n hotel-system deploy/backend -- node ... command.js migrate`.

**Cenário:** o README é a porta de entrada do operador. Quem atualiza o backend seguindo a seção "Schema e Migrations" (`README.md:802`) faz o rollout por fora e roda o migrate depois, pelo `exec` nos pods novos. É exatamente a janela de `503` que a branch fechou no `start.sh`. Além disso, o caminho `services/core-service/command.js` não existe dentro da imagem (`WORKDIR /app`, `Dockerfile:12`), então o comando nem roda.

**Regra violada:** "doc coerente com o código". Trilha de documentação do Weslley (`docs/DIVISAO_TRABALHO_TIME_09set2026.md` §3.3).

**Correção sugerida:** trocar as cinco ocorrências por `./start.sh migrate` (instalação) e `./start.sh deploy [imagem]` (atualização), com link para a seção nova de `docs/infra/KUBERNETES.md`.

### 🟡-5 [deploy] `kubectl apply -k` desfaz a imagem do `deploy <img>` e faz um rollout sem migrate
**Onde:**
- `docs/infra/KUBERNETES.md:145-146`: "Trocar só configuração … os `rollout restart` da seção acima continuam valendo";
- `docs/infra/KUBERNETES.md:117`: `kubectl apply -k infra/k8s/`;
- `start.sh:177`: o warn do `tunnel`;
- `start.sh:49`: `cmd_up`.

**Cenário:**
1. `./start.sh deploy sistema-gestao-hotel-backend:v2` coloca a v2 no ar via `kubectl set image`.
2. Dias depois o operador muda `MINIO_PUBLIC_ENDPOINT` e segue a doc: `kubectl apply -k infra/k8s/`.
3. O manifest ainda diz `sistema-gestao-hotel-backend:latest` (`infra/k8s/backend.yaml:26`). O apply volta o Deployment para essa imagem e dispara um rolling update para outro código, sem migrate antes nem depois.

A doc afirma "mesma imagem", mas o apply não garante isso.

**Correção sugerida:** escolher uma das duas.
- Na doc: depois de um `deploy <imagem>`, toda troca de configuração é `kubectl apply -k infra/k8s/ && ./start.sh deploy <imagem>`.
- Ou fazer o `cmd_deploy` gravar a imagem no `kustomization.yaml` (`images:` / `kustomize edit set image`), para que o apply não a reverta.

### 🟡-6 [deploy] Migrate com a imagem nova antes do rollout expõe os pods antigos ao schema novo
**Onde:** `start.sh:133` combinado com `services/core-service/command.js:29` (`sequelize.sync({ alter: true })`).

**Cenário:**
- No Sequelize 6, o `sync({ alter: true })` remove a coluna que existe no banco e não existe mais no model (`alter.drop` é `true` por padrão).
- Suponha uma release que remove ou renomeia um atributo. O 1º migrate apaga a coluna enquanto os 3 pods antigos ainda servem. Eles continuam no ar durante o rollout (até 300 s, mais 60 s de encerramento).
- Todo `SELECT` ou `INSERT` que o model antigo faz com essa coluna responde `500` até o último pod antigo sair.

Antes da branch a janela era a inversa (pod novo diante do schema velho). A ordem nova é a certa para a T-04.2, mas transfere o risco para outro tipo de mudança, e o runbook não avisa.

**Regra violada:** contrato de API durante o deploy (quebra temporária). Falta registrar a restrição.

**Correção sugerida:** acrescentar ao `docs/infra/KUBERNETES.md` a regra expand/contract: uma release só adiciona colunas; remover ou renomear exige duas releases, com o código parando de usar a coluna antes de ela sair do model.

### 🟢-1 [docs] "Imagem do manifest" não é o que o código faz
**Onde:** `start.sh:129` e `docs/infra/KUBERNETES.md:129`.

**Cenário:** `backend_image` (`start.sh:114-116`) lê a imagem **viva** do Deployment. Depois de um `deploy …:v2`, o `./start.sh deploy` sem argumento reinicia a v2, não o `latest` do manifest.

**Correção sugerida:** trocar o texto por "reinicia com a imagem que está no ar".

### 🟢-2 [deploy] `deploy` sem tag, com `latest` e `IfNotPresent`, não garante o mesmo código no Job e nos pods
**Onde:** `infra/k8s/jobs/backend-migrate.yaml:34` e `start.sh:137`.

**Cenário:** num cluster com mais de um nó ou com registry, cada nó resolve `latest` pelo cache local. O Job pode migrar com um build e os pods subirem com outro. No kind, o `kind load` não sofre disso.

**Correção sugerida:** documentar que fora do kind o `deploy` exige tag imutável ou digest.

### 🟢-3 [segurança] O pod do Job recebe um token de ServiceAccount de que não precisa
**Onde:** `infra/k8s/jobs/backend-migrate.yaml:30-36`.

**Cenário:**
- O migrate só fala com o Postgres, mas o pod monta o token da SA `default`.
- Também falta `securityContext` (`runAsNonRoot: true`, `allowPrivilegeEscalation: false`).
- Não é regressão: o `backend.yaml` tem a mesma lacuna.

**Correção sugerida:** `automountServiceAccountToken: false` e o `securityContext` mínimo no template do Job.

### 🟢-4 [testes] Nenhuma checagem automática amarra o label do Job à NetworkPolicy
**Onde:** `infra/k8s/networkpolicy.yaml:17-20` e `infra/k8s/jobs/backend-migrate.yaml:18,28`.

**Cenário:**
- Renomear o label de um lado deixa o migrate sem acesso ao banco. O Job morre por timeout de conexão, e o operador cai no 🟡-2.
- A verificação em kind foi manual. O `scripts/qa_checks.sh` não olha `infra/k8s/jobs/`.

**Correção sugerida:** uma checagem no `qa_checks.sh` (grep de `app: backend-migrate` nos dois arquivos), no mesmo espírito da checagem nginx compose×k8s que já existe.

## Repassados a outro dev
Nenhum.

O `_web.js:51` (sem handler de SIGTERM) é decisão documentada, não defeito. Ele só entra aqui como causa do 🟡-1, e a correção cabe no `start.sh`.

## O que foi verificado e está correto
- **Repasse 🟡:** o 1º migrate roda num Job com a imagem nova antes do `set image`/`rollout restart` (`start.sh:133-138`).
- **Repasse 🟢:** existe um 2º migrate depois do `rollout status` (`start.sh:141`), com a janela residual descrita no 🟡-1.
- **Código 1:** `backoffLimit: 0` faz o Job falhar na 1ª saída diferente de 0. O ramo `*/1` chama `err`, que sai com `exit 1`. O `command.js` sai com 1 tanto no erro do sync quanto no da migração de consumo.
- **Secrets:** o Job recebe só o `POSTGRES_PASSWORD`. O `hotel-config` não contém segredo. Ficam fora a chave JWT, o MinIO, o RabbitMQ, o `METRICS_TOKEN` e o `PIX_WEBHOOK_SECRET`.
- **Label:** `app: backend-migrate` não colide com o Service `backend` (seletor `app: backend`, `backend.yaml:135-136`), com o PDB (`pdb.yaml:10`) nem com o scrape do Prometheus. A regex `backend` do relabel é ancorada (`observability.yaml:72-73`).
- **NetworkPolicy:** o `podSelector` novo bate com o label do template do pod (`backend-migrate.yaml:28`), não só com o do Job.
- **Job fora do kustomization:** com `generateName` e `kubectl create -o name`, o nome devolvido é o usado no loop.
- **Limpeza:** `ttlSecondsAfterFinished: 3600` limpa os Jobs. Não acumula lixo no namespace.
- **ESM e regras do CLAUDE.md:** não se aplicam (nenhum JS no diff). Não há `require`.
- **Montagem do Job:** a substituição por `sed` usa delimitador `|`, que não aparece em referência de imagem válida.
- **Imagem vazia:** se o `backend_image` falhar dentro de `local`, o status é mascarado, mas o `kubectl create` recusa imagem vazia e o `pipefail` aborta.

## Não foi possível verificar
- **Cenário B do 🟡-2:** não reproduzi em cluster o comportamento do job-controller da v1.34 com pod nunca criado. Ver o roteiro de reprodução no próprio achado.
- **Duração da janela do 🟡-1:** não medi em cluster. A conclusão vem da leitura de `backend.yaml`, `_web.js` e `nginx.yaml` e do comportamento conhecido do `rollout status` e do conntrack.
- **Evidência da verificação em kind:** a execução citada pelo orquestrador (caminho feliz e `postgres:17` com saída 1) não está versionada na branch. Não há relatório de sessão no diff.
