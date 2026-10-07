# QA Red Team — JWT RS256 (T-01.3 / ADR-006, fases 5a + 5b)
**Branch:** feat/jwt-rs256 @ d5af32f · **Base:** origin/develop (merge 6e7966f) · **Data:** 27/09/2026
**Arquivos auditados:** 23 (diff) + 8 lidos por contexto (`jsonwebtoken@9.0.3/verify.js`, `Dockerfile`, `vitest.config.js`, `tests/setup/env.js`, `scripts/infra_up.sh`, `start.sh`, `infra/k8s/kustomization.yaml`, `ci.yml`)
**Achados:** 13 (🔴 0 · 🟡 7 · 🟢 6)

## Veredito
**APROVADO COM RESSALVAS**

O caminho de autenticação em si está correto: nenhum token forjado passou no middleware real
(9 vetores, abaixo), a chave privada não chega à imagem nem ao repositório e não sobrou
`JWT_SECRET` em código, manifesto ou script ativo. As ressalvas são: o pipeline K8s quebrado pela
mudança, um teste que não protege a correção que diz proteger e uma afirmação de segurança
errada na ADR que vai virar documento oficial.

---

## Ataques executados (fora da suíte)

Script ad-hoc (`node`, apagado depois) importando o `middlewares/auth.middleware.js` **real**, e o
mesmo conjunto contra um **mutante** sem `algorithms` (`jwt.verify(token, pub)`), com
`jsonwebtoken` 9.0.3:

| Vetor | Middleware real | Mutante sem `algorithms` |
|---|---|---|
| RS256 legítimo (controle) | aceito | aceito |
| HS256, segredo = PEM público exato (HMAC via `crypto`, `jwt.sign` recusa) | 401 | 401 |
| HS256, PEM público sem `\n` final | 401 | 401 |
| HS256, segredo = DER SPKI da pública | 401 | 401 |
| HS512, segredo = PEM público | 401 | 401 |
| `alg: none`, sem assinatura | 401 | 401 |
| **RS512** assinado com a privada real | 401 | **ACEITO** |
| **PS256** assinado com a privada real | 401 | **ACEITO** |
| HS256 com string qualquer (o que a suíte faz) | 401 | 401 |

Conclusão: o *algorithm confusion* **não passa**, nem no código novo nem no mutante. Quem bloqueia
no mutante é a própria biblioteca (`node_modules/jsonwebtoken/verify.js:120-151`: sem
`algorithms`, deriva a lista do tipo da chave, e recusa `HS*` quando a chave é `public`). O
`algorithms: ['RS256']` fixo continua valendo como defesa em profundidade (ver 🟡-2 e 🟡-3).

---

## Achados

### 🟡-1 [Infra/K8s] Pipeline oficial de deploy quebra; a ordem do README falha em cluster novo
**Onde:** `infra/k8s/backend.yaml:80-87` (volume do secret `jwt-rsa-keys`), `README.md:117-127`, `scripts/infra_up.sh:56-63`, `start.sh:46-49`
**Cenário:**
1. Cluster novo, seguindo o README: *"Antes de aplicar `infra/k8s/backend.yaml`, crie o secret…"*
   → `kubectl create secret generic jwt-rsa-keys … -n hotel-system` → `Error from server (NotFound):
   namespaces "hotel-system" not found`. O namespace só nasce no `kubectl apply -k` (`namespace.yaml`
   está no `kustomization.yaml`).
2. `scripts/infra_up.sh` ou `./start.sh up` (nenhum dos dois foi tocado pelo diff e nenhum cita o
   secret) → `apply -k` → os 3 pods do backend ficam em `ContainerCreating` (volume de secret
   inexistente) → `kubectl wait --timeout=120s` estoura → `set -e` aborta **antes** do `migrate`. A
   mensagem é de timeout, não de "falta o secret".
**Regra violada:** a própria regra da mudança ("cluster continua subindo"): a K8s é o alvo de
produção e o script de pipeline é o caminho documentado.
**Correção sugerida:** no `infra_up.sh`/`start.sh up`, aplicar `namespace.yaml` primeiro e checar
`kubectl get secret jwt-rsa-keys -n hotel-system` antes do `apply -k`, abortando com o comando
de criação. No README, trocar "antes de aplicar o backend.yaml" por "depois de criar o namespace
(`kubectl apply -f infra/k8s/namespace.yaml`)".
*Obs.:* não executei (o minikube ficou parado, por instrução). A semântica de `kubectl create -n`
em namespace inexistente e de volume de secret ausente é a padrão do Kubernetes.

### 🟡-2 [Testes] O teste de "algorithm confusion" passa com a correção removida
**Onde:** `services/core-service/tests/auth.test.js:225-234`
**Cenário:** mutação `jwt.verify(token, getPublicKey(), { algorithms: ['RS256'] })` →
`jwt.verify(token, getPublicKey())` → `npx vitest run tests/auth.test.js` → **21/21 passam**
(executado). O teste assina com uma string arbitrária, não com a chave pública (o comentário diz
"inclusive a própria chave pública", mas o código não faz isso). Qualquer segredo errado já cai na
verificação de assinatura, e a lib 9.x já recusa HS com chave pública. Resultado: a linha que a
ADR chama de "o que fecha o CA-01.3.b" pode ser apagada sem nenhum teste reclamar.
Para comparar: a mutação `jwt.decode(token)` **é** pega (3 testes falham, entre eles o do
`tenant_id` adulterado). Esse teste prova o que diz.
**Regra violada:** checklist §8, "teste que passaria mesmo com a regra quebrada".
**Correção sugerida:** acrescentar um caso que diferencia de verdade: token **PS256** (ou RS512)
assinado com a privada de teste (`readFileSync(process.env.JWT_PRIVATE_KEY_PATH)`), com `401`
esperado. O mutante aceita esse token (tabela acima). Se quiser manter o HS256, forjar com
`crypto.createHmac('sha256', getPublicKey())`, que é o ataque que o nome do teste promete.

### 🟡-3 [Docs/ADR] Afirmação de segurança incorreta na ADR (vai para o documento oficial)
**Onde:** `docs/sugestoes-documentos-oficiais/07-adr/ADR-006-proposta.md:31-38` e §Consequências
("remove uma vulnerabilidade de *algorithm confusion* que existe **hoje**"); `MOTIVOS.md:31`;
`middlewares/auth.middleware.js:13-17` (comentário: *"a biblioteca aceita, por padrão, qualquer
algoritmo que o token declarar"*); SPEC-01 CA-01.3.b.
**Cenário:** com `jsonwebtoken ^9.0.2` (instalado: 9.0.3), a afirmação é falsa. Em
`verify.js:132-141`, sem `algorithms`, a lista vem do **tipo da chave** (segredo → HS*; RSA →
RS*/PS*). Em `verify.js:148`, a lib recusa `HS*` quando a chave não é `secret`. O código antigo
(HS256, sem chave pública nenhuma) não era explorável por *algorithm confusion*. Esse
comportamento é do 8.x, corrigido no 9.0.0 (CVE-2022-23540/23541). O que o pin realmente
acrescenta: (a) restringe a RS256, recusando RS384/512 e PS* (tabela acima); (b) protege se o
arquivo "público" não for um PEM válido, caso em que a lib o trataria como segredo HMAC e aceitaria
HS* assinado com o conteúdo dele.
**Regra violada:** evidência obrigatória. Uma ADR que o Weslley vai formalizar e que a banca pode
ler afirma uma vulnerabilidade que não existe na versão usada.
**Correção sugerida:** reescrever como defesa em profundidade: "a 9.x já mitiga; fixamos
`algorithms` para não depender do default da biblioteca nem da forma do arquivo de chave".
Ajustar o comentário do middleware no mesmo sentido.

### 🟡-4 [Docs/ADR] Tabela "Como as chaves chegam a cada ambiente" diverge do implementado; o comando k8s da ADR gera um pod em crash
**Onde:** `ADR-006-proposta.md:143-145`
**Cenário:**
- Testes: a ADR diz "gerado em memória… nunca toca disco, nunca precisa de `.gitignore`". O
  implementado grava em `tests/setup/.tmp-jwt-keys/` e adicionou `.tmp-jwt-keys/` ao `.gitignore`.
  O disco é necessário, porque o globalSetup roda em outro processo, mas a ADR não foi atualizada.
- CI: a ADR diz "*step* do job". O implementado gera no globalSetup.
- K8s: o comando da ADR é `--from-file=private.pem --from-file=public.pem`, que cria chaves
  `private.pem`/`public.pem`. O `backend.yaml` espera `/app/keys/jwt-private.pem`. Quem seguir a
  ADR literalmente gera um secret com os nomes errados → `ENOENT` → fail-fast → `CrashLoopBackOff`.
  O README está certo; a ADR não.
**Regra violada:** "A proposta bate com o implementado?". Não bate em 3 das 4 linhas da tabela.
**Correção sugerida:** alinhar a tabela ao implementado e copiar o comando do README.

### 🟡-5 [Auth/Operação] Fail-fast só confere se o arquivo existe; chave vazia, inválida ou de outro par sobe "healthy" e falha em silêncio
**Onde:** `services/core-service/_web.js:18-28`, `app/utils/jwtKeys.js:23-35`, `middlewares/auth.middleware.js:21-23`
**Cenário (executado contra `jwtKeys.js`):** arquivo vazio → `getPrivateKey()`/`getPublicKey()`
retornam `""` sem lançar erro, e o fail-fast passa. Arquivo com `lixo` → passa. Par trocado
(pública de outro par, típico quando o secret é recriado pela metade) → passa. Em todos esses
casos o container fica `healthy`, `/auth/login` devolve 500 e **toda** rota protegida devolve
`401 "Token inválido ou expirado"`. O `catch {}` do middleware engole o motivo e não loga nada.
É exatamente o cenário "descobrir no meio da defesa" que o commit 722c1c9 queria evitar. Continua
*fail-closed* (nenhum token passa), por isso não é 🔴. Detalhe: com string vazia, o cache não
guarda nada e o arquivo é relido a cada requisição.
**Correção sugerida:** no fail-fast, `crypto.createPrivateKey(priv)` + `createPublicKey(pub)` e
uma prova de par (assinar e verificar um nonce com `jwt.sign/verify` RS256). Três linhas, e cobrem
os três casos.

### 🟡-6 [Contingência/Compose] Duas armadilhas de permissão no fluxo do README
**Onde:** `docker-compose.yml:114-115` (volume `./services/core-service/keys:/app/keys:ro`), `scripts/gerar_chaves_jwt.js:31,39`, `Dockerfile` (`USER node`, uid 1000)
**Cenário A (reproduzido):** a privada é gravada `0600` com dono = uid do host, e o container roda
como `node` (uid 1000). Em host Linux com uid ≠ 1000 (segundo usuário, runner do GitHub = 1001):
`docker run --user 1001 -v keys:/app/keys:ro … head jwt-private.pem` → `Permission denied` →
fail-fast → backend em loop de restart. Funciona na máquina do Gabriel só porque o uid é 1000.
**Cenário B (reproduzido):** a pessoa roda `docker compose up` antes de gerar as chaves (o README
até prevê isso: "Esqueceu de gerar? O backend recusa subir"). O Docker cria
`services/core-service/keys/` como **`root:root`**. Depois ela roda o script, como o log manda →
`Error: EACCES: permission denied, open '…/keys/jwt-private.pem'`. Para sair disso precisa de
`sudo rm -rf`.
**Correção sugerida:** no script, capturar `EACCES` e mandar uma mensagem com o remédio
(`sudo rm -rf services/core-service/keys` e rodar de novo). No README, uma linha sobre o uid 1000.
Alternativa: gravar a privada `0640` com o gid 1000 e documentar.

### 🟡-7 [Processo] A implementação (5b) nunca rodou no CI; a branch fica fora do gatilho de push
**Onde:** `.github/workflows/ci.yml:7-13`, PR #84
**Cenário:** `origin/feat/jwt-rs256` = 9ea5590 (só a 5a). Os 8 commits da 5b + merge existem só
localmente. O único run de CI (24/09) é de docs. Além disso, `feat/**` não está na lista de
`push` (`feature/**`, `fix/**`, `chore/**`, `docs/**`), e o nome viola `CODING_STANDARDS.md:791`
(`feature/<nome>`). Só o evento `pull_request` do PR #84 dispara o CI. O título do PR ainda é
*"[proposta — NÃO MERGEAR] … fase 5a"*. Ainda não foi exercitado: a geração de chaves no CI sem
`.env.test`, só com env do job.
**Correção sugerida:** fazer o push e confirmar o run verde do PR #84 antes do merge, atualizando o
título e o corpo. Renomear para `feature/jwt-rs256` é opcional (implica recriar o PR).

### 🟢-8 [Testes] `globalSetup`: comentário falso e fragilidades pequenas
**Onde:** `tests/setup/globalSetup.js:15-31`
- O comentário diz "geradas de novo a cada rodada". O código só gera **se não existirem** e
  reaproveita o par anterior. Reaproveitar não é problema de segurança: a pasta está no
  `.gitignore`, e o `.dockerignore` exclui `tests/` inteiro, então a chave de teste nunca vai para
  a imagem. Só vira problema se sobrar um par meio trocado (por exemplo, a pública substituída):
  aí todos os testes autenticados falham com 401, sem pista.
- `mkdirSync` usa caminho fixo (`tests/setup/.tmp-jwt-keys`) e ignora o `dirname` do env. Se o
  caminho no env mudar, dá `ENOENT`.
- `.env.test` antigo, copiado antes desta mudança e sem `JWT_*_PATH` → `path.resolve(cwd,
  undefined)` → `TypeError [ERR_INVALID_ARG_TYPE]` antes de conectar no banco. Mensagem críptica.
- A privada de teste é gravada `0644`.
**Pergunta 3 respondida:** sim, as chaves existem antes do primeiro teste. Verifiquei apagando
`.tmp-jwt-keys/` e rodando a suíte a frio: log `✅ [globalSetup] Par … gerado`, 17 arquivos, 242
passam, 1 skip.
**Correção sugerida:** `mkdirSync(dirname(privatePath))`, validação explícita das env vars com
mensagem clara, `mode: 0o600`, corrigir o comentário.

### 🟢-9 [Script] `--force` preserva a permissão antiga da privada
**Onde:** `scripts/gerar_chaves_jwt.js:39`
**Cenário (reproduzido):** privada com `chmod 644` → `--force` → continua `0644`, porque o `mode`
do `writeFileSync` só vale na criação do arquivo. Em checkout sob `/mnt/c` (NTFS/drvfs, onde fica
o checkout principal do Gabriel), o `0600` não tem efeito nenhum.
**Correção sugerida:** `fs.chmodSync(privatePath, 0o600)` depois de gravar.

### 🟢-10 [KISS/YAGNI] `resetKeyCache()` é código morto, com comentário falso
**Onde:** `app/utils/jwtKeys.js:58-64`
Nada importa essa função (`grep -rn resetKeyCache` só acha a definição). O comentário diz que o
globalSetup a usa, mas ele roda em outro processo e não poderia usar. Remover.

### 🟢-11 [Operação] Rotação exige restart, e o rollout mistura chaves entre réplicas
**Onde:** `app/utils/jwtKeys.js:20-48` (cache sem expiração), `backend.yaml` (3 réplicas)
Trocar o secret `jwt-rsa-keys` não afeta os pods vivos, porque a chave fica cacheada em memória.
Durante o `rollout restart`, pods velhos assinam com a chave antiga e os novos só verificam com a
nova, e o nginx distribui entre eles: 401 intermitente até o fim do rollout. A ADR aceita o
"corte seco", mas o README não diz que trocar a chave exige `kubectl rollout restart deploy/backend`
e derruba todas as sessões.
**Correção sugerida:** uma linha no README.

### 🟢-12 [Repo] Padrão `keys/` no `.gitignore` da raiz é global
**Onde:** `.gitignore:15`
Ignora qualquer pasta chamada `keys` em todo o monorepo, inclusive `frontend/` e serviços futuros.
Uma pasta legítima (por exemplo, chaves de i18n) seria ignorada em silêncio.
**Correção sugerida:** `services/*/keys/`.

### 🟢-13 [Docs] SPEC-01 T-01.3 continua "aguardando aprovação"
**Onde:** `docs/specs/SPEC-01-microsservicos.md:201-212`
A 5b está implementada, mas o cabeçalho e os CAs dizem "proposta aguardando aprovação — fase 5a".
Atualizar o status (CA-01.3.a/b cumpridos no core; c/d adiados para T-01.6/T-01.4, conforme a
ADR).

---

## O que foi verificado e está correto
- **Ataque de algorithm confusion** contra o middleware real: 9 vetores, todos 401 (tabela acima).
- **Teste de `tenant_id` adulterado**: troca só o payload e mantém header e assinatura originais.
  Por mutação (`jwt.decode`), falha como deveria, então prova o que diz.
- **Outros consumidores de JWT:** `grep` fora de `node_modules` acha só `LoginController.js:53`
  (sign) e `auth.middleware.js:18` (verify). `/auth/register` não emite token. O frontend não
  decodifica o JWT.
- **`JWT_SECRET` remanescente:** zero ocorrências em código, manifesto, compose, CI ou scripts
  (`start.sh`, `infra_up.sh`, `qa_checks.sh`). Só aparece em docs históricos e na própria ADR.
- **Chave fora da imagem:** a imagem `sistema_gestao_hotel-etapa3-backend:latest` (build de hoje)
  não tem `/app/keys` e não tem `.pem` fora dos certificados do sistema. `tests/` está no
  `.dockerignore`, então `.tmp-jwt-keys` também fica fora. Só existe um Dockerfile vivo (contexto
  `services/core-service`).
- **Chave fora do repositório:** `git check-ignore` cobre `keys/` e `.tmp-jwt-keys/`. Nenhum
  `.pem` rastreado, e nenhum `BEGIN … PRIVATE KEY` em nenhum commit de
  `origin/develop..HEAD`.
- **Chave fora de log:** o `_web.js` loga só o caminho do arquivo. Erros de `jwt.sign` não carregam
  o conteúdo da chave.
- **Guard `--force`** (reproduzido em cópia isolada): sem a flag, exit 1 e a privada fica intacta
  (hash igual). Com só a privada presente, também recusa. `--forc` e `-f` recusam. Na criação, as
  permissões ficam `0600`/`0644` com umask 022 e com umask 000.
- **`jwtKeys.js`:** arquivo ausente lança erro. Diretório lança `EISDIR`. Falha não fica cacheada:
  um arquivo que aparece depois é lido normalmente. `getKeyId()` nunca devolve `undefined` (`''`
  vira `core-v1`), então não quebra a assinatura.
- **k8s:** `secret.yaml` sem `JWT_SECRET`. Volume `readOnly`. Os caminhos do env batem com as chaves
  do comando do README.
- **Decisão da ADR vs código:** RS256, `kid`, `algorithms` fixo, corte seco de HS256 e privada fora
  do `secret.yaml` estão implementados como a ADR decidiu. Itens 6 e 7 (B2B token e RabbitMQ)
  estão corretamente adiados.
- **Portões:** `qa_checks.sh` exit 0 (3 avisos pré-existentes). Suíte completa a frio: 17 arquivos,
  242 passam, 1 skip.

## Não foi possível verificar
- **Deploy K8s real** (🟡-1): o minikube ficou parado, por instrução. O achado se baseia na leitura
  dos manifests/scripts e na semântica padrão do `kubectl`.
- **CI da 5b** (🟡-7): os commits não estão no remoto.
- **`docker compose up` completo:** não repeti, porque o orquestrador já tinha feito. Inspecionei a
  imagem resultante e testei o bind mount com `--user 1000/1001`.
- **Comportamento em NTFS (`/mnt/c`) ou Docker Desktop com repositório no Windows:** o 🟡-6 foi
  reproduzido em ext4 (WSL).
