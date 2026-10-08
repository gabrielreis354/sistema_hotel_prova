# QA Red Team — RNF-023: PDF de orçamento persistido (Etapa D)

**Branch:** `fix/rnf023-pdf-orcamento` · **Base:** `develop@35e8548` · **Data:** 30/09/2026
**Worktree auditado:** `/home/gabri/sistema_gestao_hotel-etapa3` (somente leitura, exceto este relatório)
**Arquivos auditados:** 13 no diff (4 commits) + 11 de contexto (controllers vizinhos, `uploadToMinIO.js`, `minio.js`, compose, `infra/k8s/*`, Doc 03 v1.2 `f36daa0`)
**Achados:** 10 (🔴 1 · 🟡 4 · 🟢 5)

## Veredito

**REPROVADO** — por 1 achado 🔴 (🔴-1): o download do orçamento redireciona para uma URL que o
navegador não alcança em nenhum ambiente implantado. O defeito é **herdado do contrato**: a
CA-D.5 manda fazer "igual ao contrato" e foi cumprida ao pé da letra. Só que, para o orçamento,
isso é **regressão**: antes do diff o download funcionava (gerava o PDF na hora e devolvia 200).
Se o Gabriel aceitar o 🔴-1 como pendência conhecida, que vale para os dois documentos, o
restante fica em **APROVADO COM RESSALVAS**. CA-D.1 a CA-D.4, CA-D.6 e CA-D.7 estão cumpridos.

## Achados

### 🔴-1 [Contrato de API / regressão] O download do orçamento passa a redirecionar para `http://minio:9000`, que o navegador não alcança
**Onde:** `app/Controllers/EventQuoteApi/DownloadQuotePdfController.js:23-25` → `app/utils/uploadToMinIO.js:28-30` → `database/connections/minio.js:4`; configuração em `docker-compose.yml:109` e `infra/k8s/configmap.yaml:14` (`MINIO_ENDPOINT=http://minio:9000`); exposição em `infra/k8s/minio.yaml:84-89` (`ClusterIP`), `infra/k8s/networkpolicy.yaml:86-100` (só `app: backend` entra na 9000), `docker-compose.yml` (o serviço `minio` não publica porta) e `docker/nginx/default.conf` (sem `location` para o MinIO).
**Cenário:** com o MinIO no ar (caso normal), o recepcionista cria um orçamento (`pdf_url` é gravado) e baixa o PDF pelo Swagger ou pelo futuro `/grupos/orcamentos`. `GET /event-quotes/:id/pdf` → `302 Location: http://minio:9000/hotel-contracts/<tenant>/quotes/<id>.pdf?X-Amz-...`. O host `minio` só existe na rede do Docker ou do cluster, e o navegador falha com erro de DNS. O host não pode ser reescrito no proxy, porque a assinatura SigV4 inclui o cabeçalho `host`. Em `develop` o mesmo pedido devolvia `200 application/pdf`. Quando o pedido vem do SPA via `fetch`, falta ainda CORS no MinIO para o redirecionamento cross-origin.
O teste `quote-pdf.test.js:66-72` só confere o *path* e os parâmetros da URL; o host fica de fora, e por isso ele não pega o problema. A validação ponta a ponta da Sirlande (`docs/historico_sessao/sirlande/teste_pr72_e_fix_credenciais_minio_k8s_29jul2026.md:18`) seguiu o redirecionamento de dentro da rede.
**Regra violada:** quebra de comportamento de endpoint existente. O RNF-023 pressupõe uma URL assinada **utilizável** pelo operador.
**Correção sugerida:** a decisão é do Gabriel. O menor ajuste que não fere o RNF-023: um `S3Client` só para assinar, com `endpoint: MINIO_PUBLIC_ENDPOINT` (host público, ex. `https://<dominio>/storage`), e o MinIO exposto nesse host pelo nginx ou pelo ingress, preservando o `Host`, mais CORS no bucket. A alternativa sem infra é fazer *stream* do objeto pelo backend (`GetObjectCommand` → `pipe`), mas aí o download deixa de ser "por URL assinada". Até decidir: registrar no PR que o 302 de **contrato e de orçamento** não funciona fora da rede interna.

### 🟡-2 [Concorrência / CA-D.3] A trava de status é verificada fora da transação, e o PDF pode ficar com conteúdo de uma versão anterior
**Onde:** `UpdateEventQuoteController.js:21-28` (lê e verifica `SENT` sem lock), `:46-61` (salva), `:67-78` (envia o PDF depois do commit)
**Cenário A (edição de orçamento já confirmado):** o recepcionista A envia `PUT {pessoas: 20}` e o B clica em "confirmar". O A lê `SENT` e passa na trava; o B grava `CONFIRMED`; o `quote.save()` do A grava só os campos alterados (o `status` não é sobrescrito). Resultado: um orçamento `CONFIRMED` com dados novos e o PDF do "aceito" sobrescrito. É exatamente o que a CA-D.3 existe para impedir.
**Cenário B (PDF fora de ordem):** dois `PUT` seguidos no mesmo orçamento `SENT`. Os dois uploads vão para a mesma chave depois dos respectivos commits. Se o upload do primeiro terminar por último, o MinIO fica com o PDF da versão 1, o banco com a versão 2, e o `pdf_url` continua preenchido: o download serve um documento que não corresponde aos dados.
**Regra violada:** fail-safe da máquina de estados (CLAUDE.md §7), RNF-023 (o PDF tem de ser o registro do oferecido).
**Correção sugerida:** buscar o orçamento dentro da transação com `lock: t.LOCK.UPDATE` e verificar o status ali dentro (ou `update ... where status = 'SENT'` checando as linhas afetadas). Para o cenário B, basta registrar a pendência: a probabilidade é baixa, e uma solução completa (versão na chave) foge do escopo.

### 🟡-3 [Financeiro, pré-existente, agravado pelo diff] Um `PUT` com `services` grava `total` calculado com os serviços **antigos**, e o PDF persistido congela esse total errado
**Onde:** `UpdateEventQuoteController.js:41-44` (o total usa `existingServices`, lidos **antes** do `destroy`/`bulkCreate` das linhas 49-59, e não é recalculado depois)
**Cenário:** orçamento sem serviços, total R$ 1.500. `PUT {services: [{nome: 'Coffee break', quantidade: 10, valor_unitario: 20, diarias: 2}]}` → os serviços passam a somar R$ 400, mas o `total` continua R$ 1.500. O PDF gerado em `:73-78` lista o serviço de R$ 400, mostra "Subtotal R$ 1.900" (calculado pelo `generateQuotePdf` a partir de `s.total`) e "TOTAL: R$ 1.500" (vindo de `quote.total`). Esse documento agora fica **persistido** como o registro do que foi oferecido. Pior: o `CreateContractController.js:24-28` exige que o total do contrato bata com o `quote.total`, o que leva ao contrato a menor.
**Regra violada:** CLAUDE.md, "total calculado no servidor". RF-030.
**Correção sugerida (em `fix/` separado, fora desta etapa):** recalcular `subtotalServicos` a partir de `services` quando ele vier no body, ou recalcular o total depois do `bulkCreate`, dentro da transação. Precisa de teste de regressão.

### 🟡-4 [LGPD art. 18, VI] O PDF persistido não tem caminho de eliminação
**Onde:** `DeleteEventQuoteController.js:9` (só `destroy()` paranoid), `storeDocumentPdf.js:27-35` (não existe operação inversa)
**Cenário:** o titular (contato da empresa) pede eliminação, ou o admin exclui o orçamento → a linha recebe `deleted_at`, e o objeto `<tenant>/quotes/<id>.pdf` (com e-mail e telefone do contato, `generateQuotePdf.js` cliente) fica no bucket para sempre. Antes do diff, o orçamento não tinha arquivo nenhum. Para o contrato (CPF e RG do representante), a pendência é a mesma e anterior ao diff.
**Correção sugerida:** registrar como pendência no PR e no relatório de sessão: eliminação definitiva = `hard delete` + `DeleteObjectCommand` na chave de `documentPdfKey`, para orçamento e contrato.

### 🟡-5 [Documentação] A sugestão para o Doc 03 omite um trecho desatualizado e afirma algo que a v1.2 não diz
**Onde:** `docs/sugestoes-documentos-oficiais/03-dfd/MOTIVOS.md:277-279`; `docs/sugestoes-documentos-oficiais/README.md:53` ("cinco trechos")
**Cenário:** o MOTIVOS diz que "o Nível 1 já a representa" (a persistência do orçamento). Na v1.2 (`f36daa0`, `03-diagrama-fluxo-de-dados.md:117`), a seta é `P2 -->|"PDF do contrato"| D5`, e o rótulo nomeia **só** o contrato. Se a Sirlande aplicar as cinco sugestões, o diagrama continua dizendo que só o contrato vai para o D-005, o que contradiz o F-020 e o D-005 revisados.
**As outras cinco citações conferem literalmente com a v1.2:** §1 nota (l. 26), seta `P2 → OPERADOR` (l. 112), F-013 (l. 235), F-020 (l. 242), D-005 (l. 254). A leitura do Nível 2 (só a §5.2 trata do contrato, seta `2.1 → D-005` na l. 205) também está correta.
**Correção sugerida:** acrescentar uma 6ª linha na tabela: Nível 1, seta `P2 → D5`, `"PDF do contrato"` → `"PDFs do orçamento\ne do contrato"`. Ajustar o MOTIVOS:277-279 e o README:53 ("seis trechos").

### 🟢-6 [Robustez] O caminho de falha do `storeDocumentPdf` pode devolver 500 depois do commit e deixar `pdf_url` velho
**Onde:** `app/utils/storeDocumentPdf.js:31-34`
**Cenário:** o upload funciona, mas o `record.update({pdf_url})` falha (o banco caiu entre o commit e o update). O Sequelize já atribuiu o valor à instância, então `record.pdf_url` fica preenchido e o `catch` tenta `update({pdf_url: null})`, **fora de try**. Se também falhar, a exceção chega ao controller e o `PUT` responde 500 com a edição já commitada. Se a falha original for no upload e o update para nulo falhar, o `pdf_url` antigo continua apontando para o PDF da versão anterior.
**Correção sugerida:** envolver o update para nulo num `try/catch` próprio e logar. Probabilidade baixa.

### 🟢-7 [Testes] `tests/setup/env.js` com `??=` não é hermético, e o comentário "falha rápido" é impreciso
**Onde:** `tests/setup/env.js:13-15`
**Cenário 1:** um dev com `MINIO_ENDPOINT=http://localhost:9000` exportado no shell (ex.: deu `source .env`) e o MinIO de dev no ar. O `??=` respeita o valor herdado, e os arquivos que **não** espionam o `send` (`b2b-smoke.test.js` cria orçamentos e contratos) passam a fazer upload real no bucket de dev. Os testes de `quote-pdf` continuam corretos (a asserção usa `process.env.MINIO_ENDPOINT`). Hoje o `.env.test`, o `.env.test.example` e o `ci.yml` não definem MINIO, então em CI fica 127.0.0.1:9.
**Cenário 2 (SUSPEITA, não medido):** o SDK v3 trata `ECONNREFUSED` como erro transitório e tenta de novo (3 tentativas, com backoff) tanto o `HeadBucket` quanto o `CreateBucket`. Cada criação de orçamento ou contrato fora de `quote-pdf` custa algumas centenas de ms, e não "na hora".
**Não mascara regra de negócio:** o resultado observável continua o mesmo de antes (best-effort, `pdf_url` nulo). Antes, o envio falhava por credencial indefinida, sem rede.
**Correção sugerida:** usar `=` em vez de `??=` (ambiente de teste fixo) e, opcionalmente, `maxAttempts: 1` só em teste. O `vi.spyOn(s3Client, 'send')` com restauração no `beforeEach`/`afterAll` está correto para `isolate: false`.

### 🟢-8 [Exposição] `pdf_url` grava e devolve a URL interna do MinIO
**Onde:** `uploadToMinIO.js:23`. A URL aparece nas respostas de `POST`/`PUT`/`GET`/`List`/`confirm`/`cancel` de `/event-quotes`.
**Cenário:** qualquer usuário do tenant vê `http://minio:9000/hotel-contracts/<tenant>/quotes/<id>.pdf`: o host interno, o bucket e o formato da chave. Não dá acesso (o bucket é privado), e o campo funciona só como flag, porque o download recalcula a chave com `documentPdfKey`. O padrão foi copiado do contrato.
**Correção sugerida:** pendência. Gravar só a chave, ou expor um booleano `has_pdf`. O formato da resposta do `PUT` não mudou além do campo aditivo `pdf_url` (verificado: mesmo `include: services`, sem `client`).

### 🟢-9 [Swagger] O B2B inteiro está fora do OpenAPI, e os novos 409/302/`pdf_url` não estão documentados
**Onde:** `config/swagger.js` (nenhum path `/event-quotes` ou `/contracts`); `frontend/packages/api-client/src/schema.d.ts` (sem B2B)
**Cenário:** hoje nada quebra, porque o frontend não consome B2B. Quando a tela `/grupos/orcamentos` (`PLANEJAMENTO_FRONTEND.md:281`) for feita, o cliente tipado não vai conhecer o `409` do PUT nem o `302` do PDF. Pré-existente.
**Correção sugerida:** registrar como pendência para a fase de frontend B2B.

### 🟢-10 [Documentação] "Superado pelo código em 30/09/2026" antes do merge
**Onde:** `MOTIVOS.md:77-78`
**Cenário:** a nota afirma que o código já supera o Doc 03, mas a branch ainda não está na `develop`. Se o PR for revisto ou adiado, a nota fica falsa.
**Correção sugerida:** "Superado pela branch `fix/rnf023-pdf-orcamento` (30/09/2026, pendente de merge)", ou ajustar no merge.

## O que foi verificado e está correto

- **CA-D.1:** `pdf_url TEXT NULL` em `EventQuoteModel.js:21` e `db/schema.sql:262`. O migrate foi verificado pelo chamador e não reexecutado aqui.
- **CA-D.2:** chave `${tenantId}/quotes/${id}.pdf` via `documentPdfKey`. O PDF é gerado depois do `t.commit()`, fora da transação. Com falha no MinIO: `201` e `pdf_url: null`. O bucket `hotel-contracts` não foi renomeado.
- **CA-D.3:** allowlist `['SENT']` (`UpdateEventQuoteController.js:11`), com status desconhecido → 409 (fail-safe). Nenhum fluxo existente edita orçamento fora de `SENT`: o `b2b-smoke.test.js:116` faz PUT num orçamento `SENT`, `Create/UpdateContract` só **leem** o orçamento, e o frontend não consome `/event-quotes`. Os 409 em `CONFIRMED` e `CANCELLED` são testados, junto com a ausência de upload.
- **CA-D.4:** a edição em `SENT` gera de novo o PDF na mesma chave. Se o envio falhar, o `pdf_url` é zerado (`storeDocumentPdf.js:33`) e o PDF desatualizado deixa de ser servido; teste em `quote-pdf.test.js:152-163`.
- **CA-D.5:** com `pdf_url`, 302 assinado (`X-Amz-Expires=300`); sem ele, 200 sob demanda. A forma está igual à do contrato; a ressalva de alcance está no 🔴-1.
- **CA-D.6:** `storeDocumentPdf` é usado nos três pontos pedidos (`CreateContract`, `CreateEventQuote`, `UpdateEventQuote`). O `UpdateContractController` manteve a regeneração dentro da transação e só trocou a chave por `documentPdfKey`, sem mudança de comportamento. A geração (`generatePdf`) acontece dentro do try, então um erro do pdfkit também é tratado como best-effort.
- **CA-D.7 / tenant:** todas as queries tocadas filtram `tenant_id` do JWT. Isso inclui o `findOne` de releitura no Create e no Update (antes era só `{ id }`) e o `CorporateClientModel.findOne` do Update (`:72`). Não há `findByPk`. Teste de 404 cross-tenant em download, edição e criação com cliente alheio.
- ESM puro, sem `require()`. Ordem de rotas: `/:id/pdf` antes de `/:id`. Os logs de falha imprimem só `error.message`, sem PII.
- `tests/quote-pdf.test.js` rodou isolado: **12/12 passam** (6,9 s), sem nenhum outro vitest em execução. A justificativa do `spyOn` em vez de `vi.mock` com `isolate: false` se sustenta, porque `s3Client` é singleton e o `getSignedUrl` não usa `send`.

## Não foi possível verificar

- O alcance real da URL assinada num navegador (🔴-1): concluído pela leitura de compose, k8s, nginx e NetworkPolicy, sem subir o ambiente.
- O custo das tentativas extras do SDK contra 127.0.0.1:9 (🟢-7, cenário 2): não medido. A suíte completa não foi rodada (banco compartilhado).
- O migrate em banco existente: aceito com base no portão informado pelo chamador.
- O estado do PR #15 no repositório do professor, citado no MOTIVOS: fora do alcance local.

## Pendências fora do escopo (registro)

- O contrato também cai na geração sob demanda quando `pdf_url` é nulo, o que diverge do "apenas por URL assinada". Já registrado pela delegação; a decisão é do Gabriel.
- O `UpdateContractController` faz upload dentro da transação: com o MinIO fora, a edição do contrato falha (500), enquanto a do orçamento passa. A assimetria é conhecida e decidida.
- O papel `WAITER` alcança `/event-quotes` e `/contracts` (o router só aplica `auth` + `tenant`) e baixa PDFs com dados do cliente corporativo. Pré-existente.

---

## Reauditoria (04/10)

**Escopo:** `git diff 1487993..HEAD` (3 commits: `699eff0`, `6de9056`, `681afef`). Contexto lido: `docker/nginx/default.conf`, `infra/k8s/{nginx,networkpolicy,configmap,secret,minio}.yaml`, `docker-compose.yml`, `start.sh`, `database/connections/minio.js`, `uploadToMinIO.js`, `storeDocumentPdf.js`, os controllers de Update/Confirm/Cancel/Download de orçamento, `CreateContractController.js`, `tests/quote-pdf.test.js`, `tests/setup/env.js` e `vitest.config`.
**Achados novos:** 5 (🔴 1 · 🟡 0 · 🟢 4)

### Veredito atualizado

**REPROVADO.** O 🔴-1 original foi corrigido, mas a correção abriu um 🔴 novo (🔴-11). O `location /hotel-contracts/` expõe à internet a API S3 do MinIO para GET/HEAD, autenticada pela credencial **root**. Essa credencial vem por padrão do repositório (`minioadmin`/`minioadmin123`) no compose e no `secret.yaml` do k8s. Antes do diff, a credencial padrão não servia para nada fora da rede interna, porque o MinIO não era alcançável. Agora ela permite listar e baixar os PDFs de **todos os tenants**, inclusive contratos com CPF e RG. Corrigido o 🔴-11, o restante fica em **APROVADO COM RESSALVAS**.

### Estado dos achados originais

| Achado | Estado | Observação |
|---|---|---|
| 🔴-1 URL assinada com host interno | **Corrigido** (compose) · k8s não validado | `presignClient` (`minio.js:22`) assina com `MINIO_PUBLIC_ENDPOINT`. O `Host $http_host` está correto: o navegador manda no `Host` exatamente o `host[:porta]` da URL, que é o assinado. Isso vale para 80 (SDK e navegador omitem a porta padrão), 8088 ou 8080 (port-forward não reescreve o `Host`). O teste fixa a origem pública. O default do configmap não serve ao `./start.sh tunnel` (ver 🟢-13). A correção abriu o 🔴-11 |
| 🟡-2 trava de status fora da transação | **Corrigido** (cenário A) · cenário B: pendência aceita | Detalhes abaixo, em "Lock no Update" |
| 🟡-3 total com serviços antigos | Pendência aceita | Inalterado (`UpdateEventQuoteController.js:55-58`; a leitura agora roda dentro da transação, mas continua anterior ao `destroy`/`bulkCreate`) |
| 🟡-4 LGPD: PDF fica no bucket | Pendência aceita | **Ganha peso com o 🔴-11**: tudo o que fica no bucket passa a ser alcançável por quem tiver a credencial |
| 🟡-5 sexta citação do Doc 03 | **Corrigido** | `MOTIVOS.md` tem a linha `P2 → D5 (l. 117)` e o parágrafo reescrito; o `README.md:53` diz "seis" |
| 🟢-6 `update` para nulo fora de try | **Corrigido** | `storeDocumentPdf.js:35-38` usa `.catch` com log |
| 🟢-7 `??=` não hermético | **Corrigido** (cenário 1) | `env.js:15-18` usa `=`. O `maxAttempts: 1` (cenário 2) não foi aplicado; era opcional |
| 🟢-8 `pdf_url` com URL interna | Pendência aceita | Agora o campo gravado (`http://minio:9000/...`) também difere da URL entregue (`http://localhost/...`), o que reforça que ele deveria guardar só a chave ou um booleano |
| 🟢-9 B2B fora do Swagger | Pendência aceita | — |
| 🟢-10 "superado pelo código" antes do merge | **Corrigido** | `MOTIVOS.md:77-78` |

### Respostas aos pontos pedidos

**Location do nginx:**
- **`^~` contra `location /`:** o nginx escolhe o prefixo mais longo, e `/hotel-contracts/` vence `/` com ou sem `^~`. Como o server não tem location regex, o `^~` hoje é redundante, mas protege contra uma regex que alguém acrescente depois. Correto.
- **Normalização:** a escolha do location usa o URI normalizado. O nginx decodifica `%XX`, inclusive `%2F` e `%2e`, resolve `.`/`..` e junta barras duplas. Por isso `/hotel-contracts/../auth/login` e `/hotel-contracts/%2e%2e%2fminio/admin/...` saem do location e caem em `location /`, no backend. O `proxy_pass` **sem URI** repassa o URI **cru** do cliente. Isso só muda algo quando o cru é diferente do normalizado, por exemplo `/x/../hotel-contracts/k`, que é normalizado para dentro do location e chega cru ao MinIO. Nesse caso o MinIO recusa componentes `..` (`hasBadPathComponent`, 400). Com codificação dupla (`%252e%252e`), o nginx decodifica uma vez e o MinIO outra, e o resultado é só uma chave estranha **dentro** do mesmo bucket. `MINIO_DOMAIN` não está definido, então não há estilo virtual-host para escolher outro bucket pelo `Host`. A API admin (`/minio/admin/...`), o console (9001, fora da NetworkPolicy) e outros buckets **não** são alcançáveis.
- **Subrecursos (`?policy`, `?acl`, `?list-type=2`, `?uploads`):** anônimos dão 403, porque o bucket é privado. Acrescentados a uma URL assinada, alteram a query canônica e também dão 403. **Mas com uma assinatura feita pelo atacante, todos funcionam (ver 🔴-11).** Quem protege é a assinatura, e o segredo dela é o root.
- **Métodos:** `limit_except GET HEAD { deny all; }` bloqueia PUT, POST (inclusive o upload por formulário POST policy), DELETE e OPTIONS. Correto.
- **Cabeçalhos repassados:** o nginx repassa **todos** os cabeçalhos do cliente (`proxy_pass_request_headers` é o padrão), inclusive `Authorization`, `X-Forwarded-For` e `X-Real-IP`. Ver 🟢-14.

**Fallback do `presignClient`:** `MINIO_PUBLIC_ENDPOINT=` vazio é falsy e usa o `MINIO_ENDPOINT`, coerente com `services/core-service/.env.example`. No compose, `${VAR:-http://localhost}` também cobre o vazio. O problema é que o fallback é **silencioso**: num deploy em que a chave falte no configmap, o 🔴-1 volta sem nenhum aviso. Ver 🟢-12.

**Lock no Update:**
- **Caminhos de retorno:** 404 e 409 fazem `rollback` e depois `return`. Exceção cai no `catch`, que faz `rollback` e `throw`. Não há caminho que deixe a transação aberta. Um `commit` que falhe leva a um `rollback` sobre transação já finalizada, que lança e mascara o erro original. Mas é o padrão do projeto (template do CLAUDE.md) e termina em 500 do mesmo jeito; não é regressão.
- **Deadlock:** não há ciclo. O Update trava a linha de `event_quotes` e só depois mexe em `quote_services`. O FK dela pede `FOR KEY SHARE` no pai, que a própria transação já segura. Confirm, Cancel e Delete são um único `UPDATE` em autocommit na mesma linha, então esperam e seguem. O `CreateContract` insere `contracts` com FK para o orçamento (`FOR KEY SHARE`), espera o Update e não segura nada de que o Update precise.
- **Cenário A do 🟡-2:** se o confirm comita antes, o Update lê `CONFIRMED` com lock e devolve 409. Corrigido. ⚠️ O comentário em `UpdateEventQuoteController.js:24-26` ("um /confirm simultâneo espera esta edição terminar") é só meia verdade. O `ConfirmEventQuoteController.js:14-24` lê **sem lock** e fora de transação, e só o `UPDATE` dele espera. O resultado (edição, depois confirmação) é serializável e não viola a allowlist. Ver 🟢-15 para o que sobra.

### Achados novos

#### 🔴-11 [Segurança / LGPD art. 46 / cross-tenant] O location `/hotel-contracts/` põe na internet a API S3 do MinIO com a credencial root padrão do repositório
**Onde:** `docker/nginx/default.conf:47-54` e `infra/k8s/nginx.yaml:55-62` (location sem restrição de caminho nem de tipo de autenticação); `infra/k8s/networkpolicy.yaml:100-102` (nginx → minio:9000); credencial em `docker-compose.yml:51-52,113-114` (`${MINIO_ROOT_PASSWORD:-minioadmin123}`, fallback silencioso, ao contrário do `:?` do `PIX_WEBHOOK_SECRET`) e `infra/k8s/secret.yaml:17-18` (`minioadmin`/`minioadmin123` versionados, só com a anotação "SUBSTITUA"). O assinante é o root (`database/connections/minio.js:22` usa `MINIO_ROOT_USER`/`MINIO_ROOT_PASSWORD`).
**Cenário:** um atacante **sem conta no Gesway**, só com o README e o `.env.example`, assina com SigV4 (`minioadmin`/`minioadmin123`, host = o do alvo) um `GET http://<alvo>/hotel-contracts/?list-type=2`. O caminho `/hotel-contracts/` casa com o location, o método é GET, o nginx repassa o `Host` (o mesmo que foi assinado), os cabeçalhos `x-amz-*` e o URI cru. O MinIO valida a assinatura do root e devolve a lista de **todas** as chaves `<tenant>/contracts/<id>.pdf` e `<tenant>/quotes/<id>.pdf`. Em seguida, um `GET` assinado em cada chave baixa contratos com nome, CPF e RG de representantes legais de todos os hotéis. Ferramentas prontas (minio-go/`mc`, que no estilo de caminho põem `/` depois do bucket) já fazem isso. Antes do diff, a mesma credencial padrão não tinha efeito externo: o compose não publica a 9000, e no k8s o MinIO é `ClusterIP` com NetworkPolicy que só admitia o backend.
**Agravante, mesmo com senha forte:** toda URL entregue ao recepcionista contém `X-Amz-Credential=<root>/...` e a assinatura HMAC sobre um *string-to-sign* conhecido. Quem tem conta no sistema, inclusive `WAITER`, consegue atacar **offline** por força bruta o segredo root. Antes, a credencial quebrada não servia fora do cluster; agora serve.
**Status de verificação:** confirmado pela leitura da configuração e pelo comportamento documentado do nginx (proxy_pass sem URI) e do MinIO (autenticação SigV4 por cabeçalho ou query, roteamento `/{bucket}/` com `list-type=2`). **Não foi executado**: não subi containers, por restrição da tarefa. O teste do chamador ("sem assinatura 403", "PUT 403") não cobre requisição **assinada pelo atacante**.
**Regra violada:** isolamento entre tenants (CLAUDE.md §7), LGPD art. 46 (segurança do tratamento), menor privilégio.
**Correção sugerida (o mínimo que fecha):**
1. No nginx, aceitar só GET/HEAD **de objeto PDF por URL pré-assinada**. Trocar o prefixo por `location ~ "^/hotel-contracts/[0-9a-f-]{36}/(quotes|contracts)/[0-9a-f-]{36}\.pdf$"`, com `return 403` no prefixo `/hotel-contracts` restante. Isso tira listagem e subrecursos de bucket. Recusar se `$args` não contiver `X-Amz-Signature=`, e mandar `proxy_set_header Authorization "";`, o que elimina a autenticação por cabeçalho. Sem listagem, a credencial vazada só baixa chaves conhecidas, compostas de dois UUIDs.
2. Fazer o compose falhar sem senha (`${MINIO_ROOT_PASSWORD:?...}`, como o `PIX_WEBHOOK_SECRET`) e não versionar credencial utilizável no `secret.yaml`.
3. (Recomendado) Assinar com um usuário MinIO dedicado, só com `s3:GetObject` em `hotel-contracts/*` (sem `ListBucket`), em vez do root. A URL deixa de expor o root e o ataque offline perde o valor.
Incluir um teste ou script de verificação: `GET /hotel-contracts/?list-type=2` assinado com a credencial válida → 403 no nginx.

#### 🟢-12 [Configuração] Fallback silencioso do `presignClient` e endpoint com caminho não suportado
**Onde:** `database/connections/minio.js:22`; `.env.example`; `infra/k8s/configmap.yaml:19`
**Cenário 1:** num deploy, a chave `MINIO_PUBLIC_ENDPOINT` some do configmap (ex.: overlay do kustomize). O backend sobe sem aviso, assina com `http://minio:9000`, e o 🔴-1 volta sem que nenhum log ou teste perceba.
**Cenário 2:** alguém segue a sugestão da 1ª auditoria e usa `MINIO_PUBLIC_ENDPOINT=https://dominio/storage`. O SDK inclui `/storage` na URL e na URI canônica, a URL vira `/storage/hotel-contracts/...`, não casa com o location, cai no backend e dá 404.
**Correção sugerida:** registrar um `console.warn` no boot quando `NODE_ENV=production` e a variável faltar, e documentar no `.env.example` "origem sem caminho (esquema://host[:porta])".

#### 🟢-13 [Infra k8s] O default `http://localhost` do configmap não serve aos fluxos de minikube que o próprio projeto documenta
**Onde:** `infra/k8s/configmap.yaml:19` contra `start.sh:124-128` (`kubectl port-forward svc/nginx 8080:80`; `health`/`test` usam `http://localhost:8080`) e `docs/infra/KUBERNETES.md:80` (`minikube service nginx`, que gera porta aleatória)
**Cenário:** o dev sobe o k8s no minikube e usa `./start.sh tunnel`. O download do orçamento devolve 302 para `http://localhost/hotel-contracts/...` (porta 80, onde não há nada) e o navegador falha. O comentário do configmap avisa, mas o valor padrão só funciona com Docker Desktop ou `minikube tunnel`. Não foi validado em k8s (informado pelo chamador).
**Correção sugerida:** fazer o `start.sh tunnel` lembrar (ou aplicar com `kubectl set env`) o `MINIO_PUBLIC_ENDPOINT=http://localhost:8080`. Também vale citar o RNF-023 na seção de acesso do `KUBERNETES.md`.

#### 🟢-14 [Segurança] O location repassa ao MinIO todos os cabeçalhos do cliente
**Onde:** `docker/nginx/default.conf:47-54` e `infra/k8s/nginx.yaml:55-62` (só `Host` e `Connection` são definidos)
**Cenário:** (a) quando o SPA baixar o PDF via `fetch` com `Authorization: Bearer <JWT>`, o redirecionamento é **same-origin** (a URL pública é o próprio nginx), e o Fetch mantém o `Authorization`. O JWT do operador chega ao MinIO, que é outro componente com logs e trace próprios. O MinIO dá precedência à query pré-assinada (`getRequestAuthType` só trata `Bearer` depois de presigned V4), por isso o download funciona; **SUSPEITA** não confirmada em execução. (b) `X-Forwarded-For`/`X-Real-IP` forjados pelo cliente chegam ao MinIO, que os usa como IP de origem em log e em condição de policy.
**Correção sugerida:** `proxy_set_header Authorization "";`, `proxy_set_header X-Real-IP $remote_addr;` e `proxy_set_header X-Forwarded-For $remote_addr;` no location. A primeira já faz parte da correção do 🔴-11.

#### 🟢-15 [Concorrência / testes] O lock não tem teste, e Confirm/Cancel continuam com check-then-act
**Onde:** `UpdateEventQuoteController.js:30-34` (lock); `tests/quote-pdf.test.js` (nenhum teste concorrente); `ConfirmEventQuoteController.js:14-24` e `CancelEventQuoteController.js:14-24`
**Cenário 1 (teste):** remover `lock: t.LOCK.UPDATE` mantém a suíte verde, pela leitura dos 12 testes; a mutação não foi executada porque o Postgres de teste estava fora do ar. A correção do 🟡-2 fica sem guarda de regressão.
**Cenário 2 (pré-existente, fora do diff):** o confirm lê `SENT` e um cancel comita `CANCELLED`. O `save()` do confirm grava `CONFIRMED` em cima e ressuscita um orçamento cancelado (transição proibida pela allowlist). Na corrida edição × confirmação, a resposta do `/confirm` devolve os campos antigos, embora o banco tenha os novos.
**Cenário 3 (pré-existente):** um DELETE comita entre o `t.commit()` (l. 73) e a releitura (l. 80). `result` vem `null` e `result.corporate_client_id` (l. 84) lança TypeError: 500 com a edição já gravada.
**Correção sugerida:** para os cenários 1 e 2, `UPDATE ... SET status = 'CONFIRMED' WHERE id = ? AND tenant_id = ? AND status = 'SENT'` (e o equivalente no cancel), conferindo as linhas afetadas, com um teste que dispare os dois pedidos ao mesmo tempo. Para o cenário 3, `if (!result) return 404` antes de gerar o PDF. Os dois cabem como pendência.

### O que foi verificado e está correto (reauditoria)
- `Host $http_host` com porta não padrão: o SDK v3 assina `host:porta` quando a porta não é a padrão e omite 80/443. O navegador faz o mesmo, e nem o port-forward nem o LoadBalancer reescrevem o `Host`. Funciona em 80, 8080 e 8088 desde que o `MINIO_PUBLIC_ENDPOINT` seja a origem que o navegador usa.
- O `proxy_pass` sem URI preserva o caminho codificado pelo SDK byte a byte, então a URI canônica bate. O `add_header` de segurança do server é herdado, porque o location não tem `add_header` próprio. A NetworkPolicy abre só a 9000 (o console 9001 continua fechado).
- `env.js` com `=` é hermético e roda antes do import dos dois `S3Client`. O teste exige origem pública diferente da interna (mutação relatada pelo chamador: derruba 2 testes).
- Docs: a linha `P2 → D5` foi acrescentada, o parágrafo do Nível 2 está correto e o README diz "seis".
- ESM, sem `require()`. Nenhuma query nova sem `tenant_id`.

### Não foi possível verificar (reauditoria)
- `tests/quote-pdf.test.js` **não** foi executado: nenhum vitest rodava, mas o Postgres de teste em `localhost:5432` estava fora do ar. A regra da tarefa manda não rodar nesse caso.
- 🔴-11 e 🟢-14(a) não foram reproduzidos com containers, por restrição da tarefa. A conclusão vem da configuração e do comportamento documentado do nginx e do MinIO.
- Comportamento em k8s, pelo mesmo motivo informado pelo chamador.

---

## Terceira auditoria (07/10)

**Escopo:** `git diff 681afef..HEAD` (3 commits: `65734d2`, `26c390b`, `b9b5a96`; 16 arquivos). Contexto lido inteiro: `docker/nginx/default.conf`, `infra/k8s/{nginx,backend,configmap,secret,networkpolicy,minio,namespace,kustomization}.yaml`, `infra/k8s/minio-setup.sh`, `docker-compose.yml`, `.env.example` (raiz e core-service), README (compose e k8s), `start.sh`, `database/connections/minio.js`, `uploadToMinIO.js`, os dois controllers de download, `UpdateEventQuoteController.js`, `tests/quote-pdf.test.js` e `tests/setup/env.js`.
**Execução:** rodei `tests/quote-pdf.test.js` isolado (nenhum vitest rodando, Postgres em `localhost:5432` respondendo): **12/12 passam** em 5,6 s. Rodei `kubectl kustomize infra/k8s/` offline (só renderiza). Consultei o registro `quay.io` de forma anônima (só leitura). Não subi containers.
**Achados novos:** 7 (🔴 1 · 🟡 2 · 🟢 4)

### Veredito

**REPROVADO**, por 1 achado 🔴 novo (🔴-16). O vetor do 🔴-11 (listar o bucket e ler os PDFs de todos os tenants com a credencial root padrão) **está fechado**: o nginx só deixa passar GET/HEAD de um PDF por URL pré-assinada, e quem assina é um usuário só de leitura. O 🔴-16 vem da própria correção. O `initContainer` `minio-setup` pôs o backend inteiro na dependência do pull de `quay.io/minio/minio:latest` e da disponibilidade do MinIO. Hoje esse registro responde `401` (conferido em 07/10), então, num cluster sem a imagem, o backend não sobe. Antes do diff, o MinIO fora do ar só desligava o PDF (best-effort, CA-D.2). O compose não regride.
Corrigido o 🔴-16, o restante fica em **APROVADO COM RESSALVAS**. O 🟡-17 (resíduo do 🔴-11) precisa ser aceito de forma explícita pelo Gabriel, e não por omissão.

### Estado dos achados anteriores

| Achado | Estado | Observação |
|---|---|---|
| 🔴-1 URL assinada com host interno | **Corrigido** (compose) · k8s não validado | Inalterado nesta rodada. No compose, o download legítimo devolve 200, verificado pelo executor |
| 🟡-2 trava de status fora da transação | **Corrigido** (A) · B: pendência aceita | — |
| 🟡-3 total com serviços antigos | Pendência aceita | Inalterado (`UpdateEventQuoteController.js:57-60`) |
| 🟡-4 LGPD: o PDF fica no bucket | Pendência aceita | O peso volta a subir com o 🟡-17: quem conhece a chave ainda lê o objeto sem prazo |
| 🟡-5 citação do Doc 03 | **Corrigido** | — |
| 🟢-6 / 🟢-7 / 🟢-10 | **Corrigido** | — |
| 🟢-8 `pdf_url` com URL interna | Pendência aceita | — |
| 🟢-9 B2B fora do Swagger | Pendência aceita | — |
| 🔴-11 API S3 do MinIO exposta pelo nginx | **Corrigido no vetor do achado** · resíduo **aberto** no 🟡-17 | Quatro pontos fechados. Listagem e subrecursos: só um `location` regex de objeto PDF (`default.conf:57`), e o prefixo restante dá 403 (`:75-77`). Escrita: `limit_except` (`:58`). Autenticação por cabeçalho: `Authorization ""` (`:66`). Assinante: `presignClient` com usuário `s3:GetObject`, sem fallback para o root (`minio.js:26-28`; teste `quote-pdf.test.js:76-80`). Ficaram dois itens da correção sugerida. O item 2 (não versionar credencial utilizável) não foi feito, ver 🟡-17. O teste ou script versionado com `?list-type=2` assinado → 403 também não existe, ver 🟢-21 |
| 🟢-12 fallback silencioso | **Corrigido** (cenário 1) · cenário 2 **aberto** | `minio.js:30-37` avisa em produção (`NODE_ENV=production` no compose e no configmap). Nenhum `.env.example` nem o configmap diz "origem sem caminho". Um `MINIO_PUBLIC_ENDPOINT=https://dominio/storage` continua caindo no backend com 404 |
| 🟢-13 default do configmap × tunnel | **Corrigido** (aviso em `start.sh:128-129`) | O aviso não diz que, depois de editar o configmap, é preciso `kubectl apply -k` e `rollout restart deploy/backend`, porque o `envFrom` só é lido na partida do pod |
| 🟢-14 cabeçalhos do cliente repassados | (a) **Corrigido** · (b) **parcial** | `Authorization` e `Cookie` são zerados. `Forwarded` ainda passa, e o IP real se perdeu. Ver 🟢-20 |
| 🟢-15 lock e concorrência | Cenário 3 **corrigido** (`:86-87`) · comentário **corrigido** (`:24-28`) · cenário 1 **aberto** · cenário 2 pendência | Remover `lock: t.LOCK.UPDATE` continua deixando a suíte verde. A pendência do Confirm/Cancel diz estar "registrada no PR" (`:28`), mas o PR ainda não existe (ver 🟢-21) |

### Achados novos

#### 🔴-16 [Disponibilidade / k8s] O `initContainer` amarra o backend inteiro ao pull de `quay.io/minio/minio:latest` (hoje `401`) e a um MinIO no ar
**Onde:** `infra/k8s/backend.yaml:21-39`. A imagem `:latest` sem `imagePullPolicy` vira `Always`, e o init container bloqueia o pod. O laço `infra/k8s/minio-setup.sh:19-27` sai com `exit 1` depois de cerca de 60 s sem MinIO.
**Evidência:** `GET https://quay.io/v2/minio/minio/manifests/latest` com token anônimo → **HTTP 401** (07/10). O único MinIO em cache local é `minio/minio:latest` (Docker Hub), que não é o nome usado por nenhum manifesto.
**Cenário A (hoje):** `./start.sh up` num cluster novo, ou qualquer pod do backend agendado num nó sem a imagem. Com `Always`, o kubelet tenta o pull do init e recebe `ErrImagePull`/`ImagePullBackOff`, mesmo que alguém tenha marcado a imagem localmente. O backend fica com 0/3 Ready, e com ele caem login, reservas, check-in e pagamentos de todos os hotéis. O `kubectl wait --timeout=120s` (`start.sh:50`) falha. Antes do diff, o mesmo problema de registro só derrubava o pod do MinIO (pendência do Weslley), e o PMS seguia no ar com o PDF em best-effort (CA-D.2: `201` com `pdf_url` nulo).
**Cenário B (mesmo com o registro consertado):** o MinIO está fora (PVC, OOM, reinício) quando um pod do backend é recriado (drain de nó, eviction, `rollout`). O init esgota as 30 tentativas, o pod entra em `Init:CrashLoopBackOff` e o rollout para. O componente que o próprio projeto trata como opcional passou a ser pré-requisito de partida da API.
**Compose:** não regride. O backend já dependia de `minio: service_healthy`, e o `minio-setup` usa a mesma imagem do serviço `minio`.
**Regra violada:** contrato de disponibilidade da API; decisão de produto CA-D.2 (MinIO é best-effort); quebra do ambiente de execução principal (README:67).
**Correção sugerida:** tirar o setup do caminho crítico do backend. O menor ajuste é movê-lo para o pod do MinIO: um segundo contêiner com a mesma imagem no `StatefulSet` (`minio.yaml`) que roda o script e fica em `sleep infinity`, ou um `Job`. Se o setup falhar, só o download de PDF falha, e ele já é fail-closed. Isso não basta sozinho: com o registro em 401, o próprio MinIO continua sem subir, mas o PMS volta a funcionar. No mínimo, `imagePullPolicy: IfNotPresent` e imagem fixada por digest, numa referência única (hoje são 4 cópias: `docker-compose.yml:48,67`, `minio.yaml:36`, `backend.yaml:23`). **Se o registro for resolvido antes do merge, este achado cai para 🟡 (cenário B).**

#### 🟡-17 [RNF-023 / LGPD art. 46] Resíduo do 🔴-11: credencial utilizável versionada + nginx que aceita qualquer assinante e qualquer prazo = quem conhece a chave lê o PDF sem expiração
**Onde:** credenciais em `infra/k8s/secret.yaml:17-18` (`minioadmin`/`minioadmin123`) e `:22-23` (`gesway-pdf-leitor`/`leitura_pdf_academico_2026`), versionadas. `.env.example:38,42-43` é copiado pelo fluxo documentado (`README.md:290`, `cp .env.example .env`), que só manda editar o `PIX_WEBHOOK_SECRET`. Com isso, o `:?` de `docker-compose.yml:54,73,135,137` nunca dispara, e o comentário `:52-53` ("uma senha root conhecida não pode subir em silêncio") é falso no fluxo real. No nginx (`default.conf:59-60`, `nginx.yaml:67-68`), a checagem é só de *formato* da assinatura, sem olhar `X-Amz-Credential` nem `X-Amz-Expires`.
**Cenário:** a recepcionista baixa um contrato (CPF e RG do representante). A URL `.../<tenant>/contracts/<id>.pdf?...X-Amz-Credential=gesway-pdf-leitor%2F...` fica no histórico do PC compartilhado da recepção, no `access_log` do nginx (o formato padrão grava `$request` com a query) ou num e-mail encaminhado. Dias depois, quem tem a URL e o repositório assina de novo a mesma chave com o leitor versionado, ou com o root, e `X-Amz-Expires=604800`: recebe `200` com o PDF. Pode repetir para sempre, e recebe inclusive as versões novas, porque o `UpdateContract` regera na mesma chave. O executor confirmou o mesmo com o root ("RESIDUAL conhecido → 200"). A expiração de 5 min do RNF-023 vira cosmética para qualquer chave que já tenha vazado uma vez. Não é enumeração cross-tenant (não há listagem), por isso fica em 🟡.
**Correção sugerida:** (1) no nginx, exigir `(^|&)X-Amz-Credential=gesway-pdf-leitor%2F` e `(^|&)X-Amz-Expires=([1-9]|[1-9][0-9]|[12][0-9][0-9]|300)(&|$)`. São duas linhas, e elas fecham o caminho do root e as URLs longas na borda. (2) Não versionar valor utilizável: deixar `MINIO_ROOT_PASSWORD=` e `MINIO_PRESIGN_PASSWORD=` **vazios** no `.env.example`, para o `:?` disparar de fato, e gerar o secret do k8s fora do Git, como já se faz com o `jwt-rsa-keys` (`scripts/k8s_garantir_secret_jwt.sh`). Sem o (2), o (1) ainda permite reassinar URLs de 300 s com o leitor versionado. Se o Gabriel aceitar o resíduo, isso precisa ficar escrito no PR.

#### 🟡-18 [Menor privilégio / cadeia de suprimento] O `initContainer` recebe o `hotel-secret` inteiro
**Onde:** `infra/k8s/backend.yaml:33-35` (`envFrom: secretRef: hotel-secret`). O script só usa `MINIO_*` (`minio-setup.sh:13-16`).
**Cenário:** a imagem é de terceiro, `:latest`, puxada a cada pod, e o canal de distribuição dela está instável: saiu do Docker Hub e hoje dá 401 no quay. A correção da pendência do Weslley pode apontar para um espelho. Se essa tag for trocada ou comprometida, o contêiner recebe `PIX_WEBHOOK_SECRET`, o que permite forjar `/webhooks/pix` e confirmar pagamentos que não existiram (financeiro). Recebe também `POSTGRES_PASSWORD` e `RABBITMQ_DEFAULT_*`. Como roda num pod com `app: backend`, a `networkpolicy.yaml:11-23` deixa esse contêiner entrar no Postgres de todos os tenants. O pod do MinIO, com a mesma imagem, recebe só `MINIO_ROOT_*` (`minio.yaml:46-55`). E qualquer segredo acrescentado ao `hotel-secret` no futuro vaza automaticamente para o init.
**Correção sugerida:** trocar o `envFrom` por 4 `secretKeyRef` (`MINIO_ROOT_USER/PASSWORD`, `MINIO_PRESIGN_USER/PASSWORD`), que é o mesmo padrão do contêiner do backend (`:71-90`). Se o 🔴-16 for corrigido movendo o setup para o pod do MinIO, isso se resolve junto.

#### 🟢-19 [nginx] O `$` da regex casa antes de um LF final, e o `$uri` pode levar `\n` ao MinIO
**Onde:** `default.conf:57,61-62` e `nginx.yaml:65,69-70`.
**Cenário:** `GET /hotel-contracts/<uuid>/quotes/<uuid>.pdf%0A?...&X-Amz-Signature=<64 hex>`. O nginx decodifica `%0A` no `$uri` (só `%00` é recusado). O `$` do PCRE, sem `DOLLAR_ENDONLY`, casa antes do `\n` final; conferido com Perl, que tem a mesma semântica: com LF, `...\.pdf$` casa e `...\.pdf\z` não. O `proxy_pass` com variáveis não reescapa, e o upstream recebe `GET /hotel-contracts/.../<id>.pdf\n?X-Amz-... HTTP/1.1`. O Go corta a linha no LF, a linha de requisição fica sem versão, e a resposta é `400`, com a conexão fechada. **Sem smuggling nem vazamento**, por isso fica em 🟢. Mas o comentário `:61` ("só [0-9a-f-/.]") afirma uma garantia que a regex não dá, e quem copiar o padrão para outro upstream pode herdar uma injeção de linha.
**Status:** SUSPEITA forte quanto ao nginx 1.27 (não executado). Para confirmar: `curl --path-as-is` na URL acima deve devolver `400` vindo do MinIO, e não `403`/`404` do nginx.
**Correção sugerida:** terminar a regex em `\.pdf\z`.

#### 🟢-20 [Auditoria] `Forwarded` passa adiante, e o IP real do download se perdeu
**Onde:** `default.conf:64-71` e `nginx.yaml:72-79`.
**Cenário:** (a) O cliente manda `Forwarded: for=203.0.113.9`. Com `X-Forwarded-For` e `X-Real-IP` vazios, o `GetSourceIP` do MinIO cai no `Forwarded` e registra o IP forjado no trace e na auditoria. **SUSPEITA:** a afirmação vem da leitura de `internal/handlers/proxy.go` do MinIO, de memória; não foi executada. (b) Mesmo sem forjar nada, todo download legítimo de PDF com CPF aparece no MinIO como vindo do IP do pod do nginx. Não dá para saber quem baixou (LGPD art. 37, registro das operações).
**Correção sugerida:** `proxy_set_header Forwarded "";`, `proxy_set_header X-Real-IP $remote_addr;` e `proxy_set_header X-Forwarded-For $remote_addr;` (sobrescrevendo, e não com `$proxy_add_x_forwarded_for`).

#### 🟢-21 [Testes / processo] A barreira do 🔴-11 não tem verificação versionada, e as pendências apontam para um PR que não existe
**Onde:** `docker/nginx/default.conf` × `infra/k8s/nginx.yaml` (duas cópias, hoje idênticas fora dos comentários, conferido por `diff`); `scripts/qa_checks.sh` e `.github/` sem nenhuma checagem de nginx; `UpdateEventQuoteController.js:28` ("pendência registrada no PR"); `git diff origin/develop...HEAD` sem relatório de sessão em `docs/historico_sessao/`.
**Cenário:** alguém "simplifica" o `location` de volta para prefixo, ou edita só uma das cópias, e o 🔴-11 reabre sem que nenhum teste quebre. A matriz que o executor rodou à mão (List, `?acl`, PUT, Authorization, traversal, assinatura adulterada) não está no repositório. As pendências de Confirm/Cancel sem lock, 🟡-3, 🟡-4 e 🟡-17 só existem em comentário de código e neste relatório não versionado.
**Correção sugerida:** criar um `scripts/verificar_nginx_minio.sh` com a matriz em `curl` contra o compose, acrescentar ao `qa_checks.sh` o `diff` das duas cópias do nginx e criar o relatório de sessão com as pendências.

#### 🟢-22 [minio-setup / config] O menor privilégio não é garantido a cada execução, e nada impede que o "leitor" seja o root
**Onde:** `minio-setup.sh:41-45`; `database/connections/minio.js:26-28`; `backend.yaml:27`.
**Cenário 1:** o `policy attach` só **acrescenta**. Se o usuário leitor receber outra política, por exemplo `readwrite` anexada durante a depuração do 403 da 1ª allowlist, cada execução do setup a mantém e termina com "pronto". Se `MINIO_PRESIGN_USER` for renomeado, o usuário antigo continua ativo, com a senha conhecida.
**Cenário 2:** com o backend rodando fora do compose (dev), `MINIO_PRESIGN_USER=minioadmin` e `MINIO_PRESIGN_PASSWORD=<senha root>` "resolvem" o 500 do fail-closed e voltam a assinar com o root. O `minio.js` não recusa usuário igual ao `MINIO_ROOT_USER`. No compose e no k8s, o `mc admin user add` do root deve falhar e barrar a subida, mas isso não foi verificado.
**Cenário 3:** o `MINIO_URL` está fixo em `backend.yaml:27`, sem relação com o `MINIO_ENDPOINT` do configmap; mudar um não muda o outro.
**Correção sugerida:** depois do attach, conferir que o `mc admin user info` lista **só** `gesway-pdf-read`, e falhar caso contrário. No `minio.js`, tratar `MINIO_PRESIGN_USER === MINIO_ROOT_USER` como ausente (`null` + aviso).

### O que foi verificado e está correto (terceira auditoria)

- **Seleção de location:** não há outra regex no server. O prefixo `/hotel-contracts/` (sem `^~`) cede para a regex, que é checada depois dos prefixos e vence quando casa. Fora do formato, o pedido cai no prefixo e recebe `return 403`. `/hotel-contracts` sem barra vai para o backend e dá 404.
- **`if` dentro do location regex:** os dois `if` só fazem `return`, que é um uso seguro. O `if`/`return` roda na fase *rewrite* e o `limit_except` na fase *access*, então PUT/POST/DELETE com query válida continuam barrados pelo `limit_except`. Os `if` com `!~` não sobrescrevem capturas usadas depois, porque o `proxy_pass` não usa `$1`.
- **`$uri` decodificado no `proxy_pass`:** a forma normalizada é a que foi testada pela regex, e não há `rewrite` entre os dois. Fora o LF final do 🟢-19, só chegam ao MinIO `[0-9a-f-/.]`. O nginx 1.27 recusa espaço e caractere de controle **cru** na linha de requisição (desde a 1.21.1), então `$args`, repassado cru, não carrega CR/LF/espaço. O `proxy_pass` com variável resolve `minio_s3` pelo `upstream` e não precisa de `resolver`.
- **Allowlist de `$args`:** nenhum parâmetro `x-amz-*` ou `x-id` troca a operação no MinIO para GET/HEAD de objeto. Os subrecursos (`acl`, `tagging`, `uploadId`, `versionId`, `partNumber`, `attributes`, `retention`, `legal-hold`) e os `response-content-*` não têm o prefixo e dão 403. A pré-assinatura V2 (`AWSAccessKeyId`/`Signature`) dá 403. STS é POST em `/` e nem chega ao location. `X-Amz-Signature` sem `X-Amz-Credential` vira autenticação anônima e recebe 403 do bucket privado. Ponto e vírgula na query não separa parâmetros no Go ≥1.17, então não há como contrabandear um subrecurso. Hoje o `response-content-*` bloqueado não quebra nada, porque o backend não o usa.
- **Cabeçalhos:** `Authorization`, `Cookie`, `X-Forwarded-*` e `X-Real-IP` são zerados no location. O `add_header` de segurança do server continua herdado, porque o location não tem `add_header`.
- **Cópias do nginx:** `default.conf` e `nginx.yaml` são idênticos, salvo comentários (conferido por `diff`).
- **Compose:** `minio-setup` com `restart: "no"` e `service_completed_successfully` está correto. Falha do setup aborta o `up` do backend (fail-closed), e o setup roda de novo a cada `up`. Não há regressão de dependência, porque a imagem e a condição de saúde do MinIO já eram pré-requisito.
- **Script:** `set -eu`; o `||` com `grep` não é derrubado pelo `-e`; `mb --ignore-existing`; a política é sobrescrita e o `user add` atualiza a senha (rotação); nenhuma saída do `mc` imprime senha (`alias set` vai para `/dev/null`). A idempotência foi verificada pelo executor (2ª execução com exit 0) e não foi reexecutada aqui.
- **k8s:** o `kubectl kustomize` renderiza o `minio-setup-<hash>` e reescreve a referência no volume do Deployment (o fluxo oficial é `apply -k`, em `start.sh:48` e no README). O `hotel-config` tem `MINIO_BUCKET` e o `hotel-secret` tem `MINIO_PRESIGN_*`. A NetworkPolicy cobre o init, que tem os mesmos labels do pod.
- **Fail-closed:** sem credencial de leitor, `presignClient` vale `null`, o `getPresignedDownloadUrl` lança, o controller cai no `catch` e responde `500` genérico. O log mostra só a mensagem, sem PII. O aviso de boot só aparece em produção, e `NODE_ENV=production` é o padrão no compose e no configmap. A asserção do access key no teste protege a regra "o root nunca assina". Remover o `if (!presignClient)` não muda o comportamento observável (o `getSignedUrl(null)` também lança), então a ausência de teste para esse ramo não é lacuna real.
- **`UpdateEventQuoteController`:** a releitura nula dá 404 sem chegar ao `client`, e o comentário do lock descreve corretamente a serialização. Não há query nova sem `tenant_id`, nem `require()`.
- **Suíte:** `tests/quote-pdf.test.js` passou 12/12 isolado.

### Não foi possível verificar (terceira auditoria)

- O comportamento real do nginx com `%0A` (🟢-19) e o parse de `Forwarded` pelo MinIO (🟢-20): não subi containers, por restrição da tarefa.
- O deploy em k8s (🔴-16): a conclusão vem do manifesto renderizado, da semântica de `imagePullPolicy` para `:latest` e do 401 conferido no registro. Não executei o cluster.
- Se o `mc admin user add` recusa o nome do root (🟢-22, cenário 2).
- A matriz de 403/200 e a idempotência do setup: aceitas com base na evidência do executor.

---

## Quarta auditoria (07/10)

**Escopo:** `git diff b9b5a96..HEAD`, com foco nos commits `bf02258`, `e0e7182`, `a8c11da`, `b120794`, `0b73db7` e `36e0b35`. O merge `9f1a7b4` (PRs #86 e #87 da `develop`) foi conferido só onde toca a feature: `backend.yaml` e `secret.yaml`. Contexto lido inteiro: `docker/nginx/default.conf`, `infra/k8s/{nginx,backend,minio,secret,kustomization,networkpolicy}.yaml`, `infra/k8s/minio-setup.sh`, `docker-compose.yml` (MinIO), os dois `.env.example`, `README.md` (segredos e compose), `start.sh` (`up`, `tunnel`), `scripts/qa_checks.sh` (regra 10), `scripts/verificar_download_pdf.sh`, `database/connections/minio.js` e `uploadToMinIO.js`.
**Execução:** `tests/quote-pdf.test.js` rodou isolado (nenhum vitest rodando, Postgres em `localhost:5432` aceitando conexão): **12/12 passam** em 7,4 s. `kubectl kustomize infra/k8s/` rodou offline e só renderiza. As condições de `$args` do nginx foram avaliadas com Perl (PCRE, mesma semântica) contra 14 query strings montadas à mão. Não subi containers.
**Achados novos:** 5 (🔴 0 · 🟡 2 · 🟢 3)

### Veredito

**APROVADO COM RESSALVAS.** O 🔴-16 está corrigido: o setup saiu do pod do backend e um MinIO fora do ar volta a afetar só o PDF, o que o executor viu no minikube. Não achei 🔴 novo. A ressalva principal é o 🟡-23. A checagem de `X-Amz-Credential` e `X-Amz-Expires` acrescentada para o 🟡-17 **pode ser contornada repetindo o parâmetro na query**. O nginx aceita se *alguma* ocorrência casar, e o MinIO usa a *primeira*. Do lado do nginx isso está confirmado; do lado do MinIO é SUSPEITA forte, não executada. Com isso, a bateria "16/16" passa a dar uma garantia que a configuração não dá. Antes do merge, o Gabriel precisa decidir entre corrigir (duas linhas no nginx e um caso no script) ou aceitar por escrito. O resíduo prático é o mesmo do 🟡-17, já aceito para o k8s, e por isso o achado não passa de 🟡.

### Estado de todos os achados

| Achado | Estado | Observação |
|---|---|---|
| 🔴-1 URL assinada com host interno | **Corrigido** | Compose validado nas rodadas anteriores. Nesta rodada, a bateria passou 16/16 também no minikube, segundo o executor (não reexecutado) |
| 🟡-2 trava de status fora da transação | **Corrigido** (A) · B: pendência aceita | — |
| 🟡-3 total com serviços antigos | Pendência aceita | Inalterado |
| 🟡-4 LGPD: PDF fica no bucket | Pendência aceita | O script de verificação acrescenta PDFs de teste ao bucket que nunca são apagados (ver 🟢-26) |
| 🟡-5 citação do Doc 03 | **Corrigido** | — |
| 🟢-6 update para nulo fora de try | **Corrigido** | — |
| 🟢-7 `??=` não hermético | **Corrigido** | — |
| 🟢-8 `pdf_url` com URL interna | Pendência aceita | — |
| 🟢-9 B2B fora do Swagger | Pendência aceita | — |
| 🟢-10 "superado pelo código" | **Corrigido** | — |
| 🔴-11 API S3 exposta pelo nginx | **Corrigido** no vetor do achado | Listagem, subrecursos, escrita e autenticação por cabeçalho continuam fechados (`default.conf:58-61`). O resíduo está no 🟡-17 e no 🟡-23 |
| 🟢-12 fallback silencioso / endpoint com caminho | **Corrigido** | Cenário 2: "só a ORIGEM" está documentado em `.env.example:48`, `services/core-service/.env.example:46` e `configmap.yaml:19`. Só documentação, sem validação em tempo de execução, o que basta para 🟢 |
| 🟢-13 default do configmap × tunnel | **Corrigido** | `start.sh:130` (`apply -k` + `rollout restart deploy/backend`) |
| 🟢-14 cabeçalhos repassados | **Corrigido** | (b) fechado junto com o 🟢-20 |
| 🟢-15 lock e concorrência | Cenário 3 **corrigido** · cenário 1 **aberto** · cenário 2 pendência | `quote-pdf.test.js` não mudou nesta rodada. Remover o `lock` continua deixando a suíte verde |
| 🔴-16 setup no caminho crítico do backend | **Corrigido** | `backend.yaml` não tem mais `initContainers`, e o setup é o contêiner `setup` em `minio.yaml:83-129`. A imagem do MinIO em `:latest` no quay continua como pendência do Weslley e derruba só o MinIO. Restam pontos operacionais no 🟡-24 e no 🟢-25 |
| 🟡-17 credencial versionada + borda sem checar assinante/prazo | **Parcial** | (2) compose **corrigido**: `.env.example:40,45` vazios, e o `:?` agora dispara de fato. O k8s continua com `secret.yaml:18,23` versionados, como **pendência aceita** pelo Gabriel. Mas essa pendência para o Weslley **não está registrada em nenhum arquivo versionado** (o grep em `docs/` só acha este relatório). (1) nginx: implementado (`default.conf:65-66`), mas **contornável**, ver 🟡-23 |
| 🟡-18 init com o `hotel-secret` inteiro | **Corrigido** | `minio.yaml:89-116`: 4 `secretKeyRef` `MINIO_*` + `MINIO_BUCKET` do configmap. O pod do MinIO já tinha o root |
| 🟢-19 `$` × LF final | **Corrigido** | `\z` em `default.conf:58` e `nginx.yaml:66`. O PDF legítimo devolve 200, então a regex compila e casa (evidência do executor) |
| 🟢-20 `Forwarded` / IP real | **Corrigido** | `default.conf:76-78`. Ressalva sem achado: no k8s, com `LoadBalancer` e `externalTrafficPolicy: Cluster`, o `$remote_addr` é o IP do nó (SNAT) e não o do cliente. Isso é pré-existente e vale para a stack inteira |
| 🟢-21 sem verificação versionada | **Parcial** | Paridade das duas cópias do nginx em `qa_checks.sh:219-235`, que roda no CI (`ci.yml:30`) e falha fechada se a extração do YAML quebrar. A bateria virou `scripts/verificar_download_pdf.sh`, mas não roda no CI (precisa do compose). **Continua faltando** o relatório de sessão com as pendências (Confirm/Cancel sem lock, 🟡-3, 🟡-4, 🟡-17/Weslley): `git diff origin/develop...HEAD` não tem nada em `docs/historico_sessao/` |
| 🟢-22 menor privilégio do leitor | Cenário 2 **corrigido** · 3 **resolvido** · 1 **aberto** | (2) `minio.js:27-28` trata leitor == root como ausente, mas sem teste (ver 🟢-27). (3) `MINIO_URL=http://localhost:9000` está no mesmo pod e não depende mais do configmap. (1) `minio-setup.sh:42-44` continua só *acrescentando* política. Se o leitor tiver `readwrite` anexado, ela persiste |

### Achados novos

#### 🟡-23 [RNF-023 / borda] Basta repetir `X-Amz-Credential` e `X-Amz-Expires` para passar pela checagem nova do nginx: URL do root, ou de 7 dias, volta a ser aceita
**Onde:** `docker/nginx/default.conf:65-66` e `infra/k8s/nginx.yaml:73-74`. O `(^|&)...` casa com **qualquer** ocorrência do parâmetro. A allowlist de `:60` aceita nomes repetidos.
**Cenário:** quem tem a senha root do `secret.yaml:18` (versionada) gera com o SDK `getSignedUrl(root, GetObject{Key: <tenant>/contracts/<id>.pdf}, {expiresIn: 604800})` e acrescenta ao fim da query `&X-Amz-Credential=gesway-pdf-leitor%2Fx&X-Amz-Expires=300`.
- **nginx (confirmado com PCRE):** passa nas quatro condições. Resultado das 14 strings testadas: "root 7d puro" → 403 (cred, exp); "root 7d + dup leitor/300" → **passa**; "root 300 + `x-amz-credential=` minúsculo do leitor" → **passa**, porque `!~*` ignora maiúsculas e minúsculas.
- **MinIO (SUSPEITA forte, lida de memória em `cmd/signature-v4.go`, `doesPresignedSignatureMatch`/`parsePreSignV4`, sem execução):** o servidor lê `X-Amz-Credential`/`X-Amz-Expires` com `url.Values.Get`, que devolve a **primeira** ocorrência (root, 604800). Ele remonta a query canônica com `query.Set` para os parâmetros de assinatura e descarta as duplicatas desses nomes. A assinatura calculada pelo SDK sem as duplicatas continua válida, e a resposta é **200 com o PDF por 7 dias, assinado pelo root**. A variante em minúsculas (`x-amz-credential`) entra na query canônica como parâmetro extra, então exige que o atacante a inclua na assinatura. Dá para fazer, mas não é necessária.
**Dano:** é o mesmo resíduo do 🟡-17 que a rodada pretendia fechar. Quem tem uma credencial lê, sem prazo, chaves já conhecidas. Não há listagem nem cross-tenant (a regex de caminho e a allowlist de parâmetros continuam valendo), por isso o achado é 🟡. O efeito colateral é de processo. `verificar_download_pdf.sh:72,76` ("root pré-assina GetObject" e "leitor reassina 7 dias" → 403) passa e serve de prova de um controle que não fecha.
**Regra violada:** RNF-023 (expiração ≤ 5 min), fail-safe (CLAUDE.md §7).
**Correção sugerida:** (1) trocar `!~*` por `!~` em `:65`, porque access key do MinIO diferencia maiúsculas de minúsculas. (2) Recusar nome de parâmetro repetido antes das outras checagens: `if ($args ~* "(^|&)(x-amz-[a-z0-9-]+|x-id)=[^&]*&(.*&)?\2=") { return 403; }`. Com `~*`, a retrorreferência cobre também a duplicata que difere só na caixa. (3) Acrescentar ao script o caso "URL do root de 7 dias + `&X-Amz-Credential=gesway-pdf-leitor%2Fx&X-Amz-Expires=300`" com esperado 403. Rodar esse caso antes do (2) confirma ou derruba a SUSPEITA do lado do MinIO.

#### 🟡-24 [Operação k8s] Falha permanente do contêiner `setup` não aparece em lugar nenhum, e trocar a senha do leitor não reexecuta o setup
**Onde:** `infra/k8s/minio.yaml:88` (`until …; do sleep 10; done; exec sleep infinity`, sem probe); `docs/infra/KUBERNETES.md` e `README.md` (nenhuma menção ao contêiner `setup`, a `kubectl logs … -c setup` ou a como rotacionar a senha); `start.sh:130`.
**Cenário A (falha invisível):** `MINIO_PRESIGN_PASSWORD` com menos de 8 caracteres, root errado no secret, ou o OOM que o executor viu com 64 Mi (o commit `36e0b35` diz que "o script repetia para sempre"). O `setup` fica em laço, `kubectl get pods` mostra `minio-0 2/2 Running` com 0 restarts, o `kubectl wait` do `start.sh:51` passa, e todo download de PDF dá 403 (`InvalidAccessKeyId`) no navegador da recepção, sem nenhuma pista. O único sinal é o log do contêiner `setup`, que a documentação não cita. Fazer o pod ficar NotReady não resolve, porque derrubaria o Service e, com ele, o upload. Então o mínimo é tornar a falha encontrável.
**Cenário B (regressão operacional do `bf02258`):** alguém troca `MINIO_PRESIGN_PASSWORD` no `secret.yaml` e faz `kubectl apply -k` mais `rollout restart deploy/backend`, que é o reflexo ensinado em `start.sh:130`. O backend passa a assinar com a senha nova, mas o `setup` está em `sleep infinity` e nunca reaplica, e o MinIO continua com a antiga. Todo download dá 403 (`SignatureDoesNotMatch`). Com o `initContainer`, reiniciar o backend reexecutava o setup, e a rotação funcionava. Agora é preciso também `kubectl rollout restart statefulset/minio`. Isso não está escrito em lugar nenhum. Mudar o `minio-setup.sh` dispara rollout sozinho (o hash do `configMapGenerator` muda o template, conferido no render); mudar o secret, não.
**Regra violada:** CA-D.2 continua ok (fail-closed só no PDF), mas o RNF-023 fica indisponível sem diagnóstico. Dívida operacional que vai doer na apresentação.
**Correção sugerida:** a cada falha do laço, logar uma linha clara com contador ("minio-setup: falhou (tentativa N) — download de PDF indisponível; veja acima"). Documentar no `KUBERNETES.md` duas linhas: `kubectl logs -n hotel-system minio-0 -c setup` e "trocou `MINIO_PRESIGN_*` ou `MINIO_ROOT_*`? `rollout restart statefulset/minio` **e** `deploy/backend`".

#### 🟢-25 [k8s] `sleep infinity` como PID 1 ignora SIGTERM: todo restart do pod do MinIO fica ~30 s a mais em `Terminating`
**Onde:** `infra/k8s/minio.yaml:85-88`; o StatefulSet não define `terminationGracePeriodSeconds`, então o padrão é 30 s.
**Cenário:** `rollout restart statefulset/minio`, mudança no `minio-setup.sh`, ou drain do nó. O kubelet manda SIGTERM a cada contêiner. O `minio` encerra na hora. O `setup` é PID 1 (o `sh` durante o laço, ou o `sleep` depois do `exec`), não instala handler, e o kernel descarta o sinal. O pod só morre no SIGKILL, 30 s depois. Com `replicas: 1` e PVC `ReadWriteOnce`, o `minio-0` novo só nasce depois disso, e o upload e o download de PDF ficam ~30 s a mais fora a cada restart. A conclusão vem da semântica de sinais para PID 1; o tempo não foi medido.
**Correção sugerida:** `trap 'exit 0' TERM; until /bin/sh /setup/minio-setup.sh; do sleep 10 & wait $!; done; sleep infinity & wait $!`.

#### 🟢-26 [Script de verificação] Cria um ADMIN com senha fixa do repositório, e o alvo padrão vem do `.env`
**Onde:** `scripts/verificar_download_pdf.sh:22` (`BASE` padrão = `MINIO_PUBLIC_ENDPOINT`), `:37-41` (`password: senha12345`), `:12` (`set -a; . ./.env` no shell do usuário).
**Cenário:** alguém carrega o `.env` de um ambiente compartilhado ou de staging (`MINIO_PUBLIC_ENDPOINT=https://<domínio>`) e roda o script como manda o cabeçalho. Sem perguntar nada, o script cria lá um hotel com um **ADMIN** `verif<timestamp>@gesway.test` / `senha12345`, publicado no repositório, mais um orçamento e um contrato cujos PDFs ficam no bucket para sempre (🟡-4). Não há vazamento entre tenants, porque o tenant é novo. Mas fica uma conta ativa com credencial pública, que é ponto de partida para qualquer falha autenticada (ex.: o `WAITER` com acesso a `/event-quotes`, já registrado). A cada execução nasce mais uma. Deixar dados no banco é aceitável **no compose local**; o problema é o padrão aceitar qualquer origem. O `set -a` também deixa `PIX_WEBHOOK_SECRET` e as senhas do MinIO exportadas no shell interativo depois do script.
**Lacunas da bateria:** faltam os casos `X-Amz-Expires=0`, `=301` e `=0300`, o caso `%0A` do 🟢-19, `HEAD`, e o de parâmetro duplicado do 🟡-23. As condições de expiração conferem por PCRE (0, 0300, 301 e 3000 → 403; 1 e 299 → passa), mas a bateria não as cobre.
**Correção sugerida:** senha aleatória (`openssl rand -hex 12`) em vez de `senha12345`. Recusar `BASE` que não seja `localhost`/`127.0.0.1` sem `CONFIRMO_ALVO=1`. Mostrar no cabeçalho o uso em subshell: `(set -a; . ./.env; set +a; bash scripts/verificar_download_pdf.sh)`. Acrescentar os casos acima.

#### 🟢-27 [Testes / configuração] A guarda "leitor ≠ root" não tem teste, e o nome do leitor está repetido no nginx sem checagem
**Onde:** `services/core-service/database/connections/minio.js:27-28`; `tests/quote-pdf.test.js:76-80` (testa só a URL do caminho feliz); `default.conf:65` e `nginx.yaml:73` (`gesway-pdf-leitor` literal) × `docker-compose.yml:74,136` e `.env.example:44` (`MINIO_PRESIGN_USER` configurável).
**Cenário 1:** apagar `&& MINIO_PRESIGN_USER !== process.env.MINIO_ROOT_USER` mantém a suíte verde. O `env.js` fixa usuários diferentes, e o `presignClient` é calculado no import. A regra nova (🟢-22, cenário 2) fica sem guarda de regressão.
**Cenário 2:** o operador troca `MINIO_PRESIGN_USER` no `.env` (o comentário de `.env.example:42-43` convida a trocar as senhas, e o nome parece trocável também). O setup cria o usuário novo, o backend assina com ele, e o nginx recusa todo download com 403. O aviso existe só como comentário no nginx.
**Correção sugerida:** um teste que reimporta `minio.js` (`vi.resetModules` + `vi.stubEnv`) com leitor == root e espera `presignClient === null`. No `qa_checks.sh`, conferir que o valor de `MINIO_PRESIGN_USER` em `.env.example` e `secret.yaml` é o mesmo literal do nginx.

### O que foi verificado e está correto (quarta auditoria)

- **Merge com a `develop` (#86/#87):** `backend.yaml` está coerente. Tem `securityContext.fsGroup: 1000` no nível do pod, `defaultMode: 0400` (renderizado como `256`) só no volume `jwt-rsa-keys`, e nenhum resto do `initContainer`: o volume `minio-setup` e o `envFrom` do secret saíram juntos. Como o pod tem um contêiner só, o `fsGroup` não afeta mais nada. O `secret.yaml` também está coerente: o comentário do #86 foi atualizado, `MINIO_PRESIGN_*` está presente, e só a ordem das chaves do RabbitMQ ficou intercalada, o que é cosmético. O render do kustomize põe o `minio-setup-<hash>` no StatefulSet do MinIO e não o põe mais no Deployment do backend.
- **Contêiner `setup`:** `MINIO_URL=localhost:9000` no mesmo pod, então a NetworkPolicy não interfere (é loopback). Recebe só os 4 `secretKeyRef` `MINIO_*` mais o bucket. O laço com `mc alias` (30×2 s) e o `sleep 10` não dão hot loop. Sem probe, o pod do MinIO fica Ready assim que o `minio` responde, e o upload não depende do setup, que é o comportamento desejado (o custo dessa escolha está no 🟡-24). O limite de 256 Mi foi justificado com OOM observado.
- **Condições novas do nginx (PCRE):** `X-Amz-Expires` aceita exatamente 1 a 300. `0`, zero à esquerda (`0300`), `301`, `3000` e parâmetro ausente → 403. O nome do parâmetro é conferido com `!~`, que diferencia caixa e combina com o SDK. `X-Amz-Credential` com `/` cru → 403, com `%2f` minúsculo → passa e o MinIO decodifica igual. `GESWAY-PDF-LEITOR` passa no nginx, mas o MinIO recusa, porque esse usuário não existe (o problema real da caixa está no 🟡-23). O backend sempre assina com 300 s (`uploadToMinIO.js:29`), então não há download legítimo recusado. `\z` está nas duas cópias.
- **Cabeçalhos:** `X-Forwarded-For` e `X-Real-IP` sobrescritos com `$remote_addr`, e `Forwarded`, `Authorization` e `Cookie` zerados.
- **`.env.example` (raiz):** as duas senhas do MinIO vazias, e os quatro `:?` do compose (`docker-compose.yml:54,73,135,137`) disparam de fato no fluxo `cp .env.example .env`. O README (`:297-298`) manda preencher as duas e diz "8+ caracteres". O `services/core-service/.env.example:42` mantém `minioadmin123`, mas esse arquivo é do backend fora do compose, sem nginx na frente, então não é regressão.
- **`qa_checks.sh` regra 10:** usa bash (process substitution ok) e só reporta com `hits` não vazio. Se a extração do YAML falhar, aparece divergência total, ou seja, falha fechada. Roda no CI.
- **`start.sh:130`** traz o comando completo para o tunnel.
- **Suíte:** `tests/quote-pdf.test.js` passou 12/12 isolado.

### Não foi possível verificar (quarta auditoria)

- O lado MinIO do 🟡-23 (primeira ocorrência e query canônica sem duplicatas): conclusão por leitura de memória do código do MinIO. Não subi containers. O caso de reprodução está na correção sugerida.
- Os ~30 s extras de `Terminating` do 🟢-25: não medido.
- A NetworkPolicy no minikube (a CNI padrão não aplica), o minikube e a bateria 16/16: aceitos com base na evidência do executor.
- O registro da pendência do Weslley (senha do leitor versionada) fora deste repositório: não achei nada versionado.

---

## Tratamento da quarta auditoria (agente executor, 08/10)

Veredito da quarta rodada: **APROVADO COM RESSALVAS, 0 🔴**. Ressalvas tratadas na branch antes do PR:

| Achado | Tratamento | Evidência |
|---|---|---|
| 🟡-23 parâmetro repetido contorna a checagem do nginx | **Suspeita confirmada antes da correção:** URL do root com 7 dias + `&X-Amz-Credential=gesway-pdf-leitor%2Fx&X-Amz-Expires=300` → **200** no compose. Corrigido: nome de parâmetro repetido (qualquer caixa) → 403; checagem da credencial com `!~` | Mesmo ataque → 403, também em minúsculas; casos novos na bateria |
| 🟡-24 falha do setup invisível; trocar a senha do leitor não reexecuta o setup | Cada falha logada com contador e o efeito ("downloads darão 403"); `docs/infra/KUBERNETES.md` ganhou a tabela de operação: `kubectl logs minio-0 -c setup`, e `rollout restart statefulset/minio deploy/backend` ao trocar senha | Comando do contêiner testado isolado: falha → log "FALHOU (tentativa 1)" → sucesso na 2ª |
| 🟢-25 `sleep infinity` ignora SIGTERM | `trap 'exit 0' TERM INT` + `sleep & wait` | `docker stop` em 540 ms, exit 0 |
| 🟢-26 script de verificação | Senha aleatória por execução; `BASE` obrigatório e explícito (sem default do `.env`); uso documentado em subshell; casos novos: expiração 0/301/0300, `%0A`, `HEAD` (o MinIO recusa — o método faz parte da assinatura SigV4; confirmado por `X-Minio-Error-Code: SignatureDoesNotMatch`), `Range` (206), parâmetro duplicado nas duas caixas | **24/24** no compose |
| 🟢-27 guarda "leitor ≠ root" sem teste; nome do leitor solto no nginx | Guarda extraída para `credencialDeAssinatura(env)` com teste unitário (mutação: sem a guarda, 1 teste falha); aviso no boot se `MINIO_PRESIGN_USER` diferir do nome que o nginx aceita | `tests/minio-presign.test.js` |

Continuam como pendência registrada no PR: 🟡-17 resíduo (senha do leitor versionada no `secret.yaml` — Weslley), 🟢-15 (lock sem teste; confirm/cancel sem lock), 🟢-22 cenário 1 (setup só acrescenta política), 🟡-2B, 🟡-3, 🟡-4, 🟢-8, 🟢-9.

Portão final: suíte 20 arquivos, 268 passam, 1 skip, cobertura 79,09 / 74,26 / 88,02 / 81,51; `qa_checks.sh` 0 erros (regra 10 verde).
