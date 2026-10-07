# Delegação — Rodada 2 da trilha do Gabriel

**Para:** agente executor (worktree `sistema_gestao_hotel-etapa3`)
**Data:** 28/09/2026 · **Decisões do Gabriel nesta data:** RS256 **aceito**; RNF-023 resolvido **no código**
**Substitui:** as etapas 5b, 6 e 7 de `pendencias_liberadas_gabriel_16set2026.md`

---

## 1. Prompt de abertura — cole isto na sessão do agente

```
Você é o agente executor do Gesway, na trilha do Gabriel.

Antes de qualquer coisa:
  git fetch origin
  git show origin/develop:docs/delegacoes/rodada2_gabriel_28set2026.md

Leia a delegação inteira. A ETAPA A vem antes de tudo e não tem exceção:
o seu trabalho do RS256 existe hoje só nesta worktree — 6 commits de
implementação sem push e arquivos alterados sem commit.

Siga as etapas NA ORDEM. Cada uma termina na condição de parada indicada.
Se uma etapa falhar, pare e reporte com a saída real — não avance.
```

---

## 2. O que mudou desde a delegação anterior

**O Gabriel aceitou o RS256.** A implementação que você fez além do ponto de parada da etapa 5a está aprovada na direção. O que falta é publicá-la, resolver as ressalvas e fazê-la passar pelo portão.

**O ajuste 2 do comentário de revisão no PR #84 foi corrigido.** Leia os **dois** comentários do PR #84 antes da etapa B — o segundo substitui o texto do primeiro no ajuste 2. Resumo, testado contra `jsonwebtoken` 9.0.3 verificando com a chave pública RSA:

| Token | Sem `algorithms` | Com `['RS256']` |
|---|---|---|
| HS256 assinado com a chave pública (*algorithm confusion*) | recusado | recusado |
| `alg: none` | recusado | recusado |
| **RS512 ou PS256 com a chave privada correta** | **aceito** | **recusado** |

O ataque clássico já é barrado pela biblioteca desde a v9. O pino é **defesa em profundidade**: estreita o contrato a um único algoritmo e desacopla a proteção da versão da biblioteca. A garantia do CA-01.3.b vem do **par de chaves**, não do pino. Isso explica a sua ressalva 🟡-2.

**O RNF-023 será resolvido no código.** O Documento 02 exige que o PDF de orçamento também seja persistido em armazenamento de objeto; hoje ele é gerado sob demanda. O Doc 02 foi entregue ao professor, então mudar o texto exigiria nova reunião — mudar o código é mais barato e é o comportamento certo para o produto: o PDF persistido é o **registro do que foi oferecido** ao cliente corporativo.

---

## 3. Stack, restrições e portão de QA

Valem **exatamente** os da §3 de `pendencias_liberadas_gabriel_16set2026.md`. Os pontos que mais importam aqui:

- `git add` arquivo por arquivo — nunca `git add .` nem `-A`
- **nunca** commitar chave privada — `keys/` e `.tmp-jwt-keys/` estão no `.gitignore`; confira com `git status` antes de cada commit
- suíte de testes **uma de cada vez**: `pgrep -af vitest` antes de rodar
- portão em toda etapa com código: `qa_checks.sh` sem erro → `npm run test:coverage` verde com ≥ 60% → `qa-redteam` no diff → **CI verde no PR**
- merge em `develop` só com APROVADO, ou APROVADO COM RESSALVAS sem 🔴 no escopo
- o bloco **FERRAMENTAL DA TAREFA** de `bash scripts/estado.sh` vai pedir `/security-review` para o diff do RS256 — rode

---

## 4. As etapas

| # | Etapa | Termina em |
|---|---|---|
| **A** | Proteger e publicar o RS256 | branch no remoto + PR aberto + CI rodando |
| **B** | Resolver as ressalvas do RS256 | **merge em `develop`** |
| **C** | T-01.2 — catálogo de eventos | **PR aberto → PARAR para aprovação** |
| **D** | RNF-023 — PDF de orçamento persistido | merge em `develop` |
| **E** | Documento 02 — conferência contra os critérios | PR com relatório |

**C é o caminho crítico do semestre**: o catálogo é o contrato da T-01.4, que é o que fecha o critério 3 (microsserviços) — o único crítico devido neste semestre. Ela termina parada esperando o Gabriel; **enquanto espera, siga para D**.

---

### ETAPA A — Proteger e publicar o RS256

Hoje a branch local `feat/jwt-rs256` tem os commits de implementação sem push, e há arquivos alterados sem commit. É trabalho de segurança existindo em uma máquina só.

**Um detalhe que decide o nome da branch:** o CI dispara em push para `feature/**`, `fix/**`, `chore/**` e `docs/**`. **`feat/**` não está na lista** — é a causa da sua ressalva 🟡-7. Não mexa no `ci.yml`: publique com o prefixo certo.

1. Termine ou descarte o que está solto. Commite em partes lógicas o que está em andamento, **incluindo** o relatório `docs/qa/redteam_jwt-rs256_27set2026.md` — relatório de QA *untracked* não conta.
2. `git branch -m feature/jwt-rs256`
3. `git push -u origin feature/jwt-rs256`
4. Abra o PR `feature/jwt-rs256 → develop`, título `feat(auth): JWT em RS256 (ADR-006, T-01.3 fase 5b)`. No corpo: o que foi feito, os CA-01.3.a a e um a um, e a lista das ressalvas ainda abertas — elas se resolvem na etapa B, no mesmo PR.
5. No **PR #84**, comente: *"Aprovado pelo Gabriel em 28/09. A implementação segue no PR #NN, que contém esta proposta com os ajustes da revisão."* e **feche o #84**. A branch nova já contém os commits da proposta; dois PRs seriam o mesmo conteúdo em dobro.

**Condição de parada:** se o push falhar, se aparecer algum arquivo de chave no `git status`, ou se o CI não disparar no PR — pare e reporte.

---

### ETAPA B — Resolver as ressalvas do RS256

**Branch:** a mesma, `feature/jwt-rs256`. O PR é o da etapa A.

**B.1 — As 7 ressalvas do seu próprio relatório** (`docs/qa/redteam_jwt-rs256_27set2026.md`). Todas no escopo. Dois pontos precisam de atenção especial:

- **🟡-2 — o teste do pino.** Mantenha o teste de HS256 com a chave pública como **guarda de regressão do vetor clássico**, e renomeie-o para dizer isso. **Acrescente** o teste que de fato prova o pino:

  > token assinado com a chave privada **correta**, mas `algorithm: 'RS512'` (e outro com `PS256`), deve receber `401`.

  **Prova obrigatória no PR:** remova temporariamente o `{ algorithms: ['RS256'] }` do middleware, rode a suíte, mostre o teste novo **falhando**, restaure. Cole a saída das duas rodadas.

- **🟡-5 — fail-fast raso.** Hoje o boot só confere se o arquivo existe. Faça o boot **assinar e verificar um token de teste** com o par carregado: isso pega arquivo vazio, PEM inválido e chaves de pares diferentes numa operação só, sem nenhuma validação ad hoc.

**B.2 — O texto da ADR-006** (`docs/sugestoes-documentos-oficiais/07-adr/ADR-006-proposta.md`). Aplique os ajustes **1, 3 e 4** do primeiro comentário do PR #84 e o texto do **segundo** comentário no lugar do ajuste 2. O Weslley transcreve para o Documento 07 a partir deste arquivo — ele precisa estar certo.

Corrija também o comentário de `middlewares/auth.middleware.js`: hoje ele afirma que *"a biblioteca aceita, por padrão, qualquer algoritmo que o token declarar"*, o que é falso na v9.

**B.3 — Itens da revisão que não estão no seu relatório:**

| Item | Onde |
|---|---|
| `defaultMode: 0400` no volume do secret — hoje a privada monta legível por qualquer processo do container | `infra/k8s/backend.yaml` |
| Duas páginas ensinam a chamada antiga, sem `algorithms` | `docs/back/MIDDLEWARES.md:51`, `docs/back/arquitetura_backend.md:135` |
| "Credenciais do banco e **JWT secret**" — escapou da limpeza por estar escrito com espaço | `README.md:359` |
| A tabela de segredos declara **duas** entradas; o `secret.yaml` tem **seis**. Faltam `MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD`, `RABBITMQ_DEFAULT_USER`, `RABBITMQ_DEFAULT_PASS` | `README.md` §variáveis sensíveis e a tabela de recursos do k8s |

A última vem do PR #79, não desta branch, mas é a mesma reincidência que a auditoria do webhook PIX já apontou. Corrija aqui, registre no PR que é herdada.

**Condição de parada:** portão completo **mais `/security-review`** no diff, com a saída no PR. Merge em `develop` só com CI verde e veredito sem 🔴. Relatório ao Gabriel com o link do merge.

---

### ETAPA C — T-01.2: catálogo de eventos e política de falhas

**Idêntica à ETAPA 6** de `pendencias_liberadas_gabriel_16set2026.md` — leia lá o escopo completo. Branch `docs/catalogo-eventos`, documento `docs/specs/anexos/SPEC-01-catalogo-eventos.md`, nenhum código.

Um acréscimo, que o RS256 trouxe: a seção da **chamada síncrona b2b → core** deve citar a credencial estática por cabeçalho decidida na ADR-006 (CA-01.3.c), e a política do consumidor deve prever as **credenciais separadas por serviço** do RabbitMQ (CA-01.3.d).

**Condição de parada:** PR para `develop`. **O Gabriel aprova antes do merge** — este catálogo é o contrato da T-01.4. Enquanto espera, siga para a etapa D.

---

### ETAPA D — RNF-023: PDF de orçamento persistido

**Branch:** `fix/rnf023-pdf-orcamento`

**O problema.** O RNF-023 exige que *"contratos e orçamentos em PDF"* sejam *"persistidos em armazenamento de objeto"* e baixados apenas por URL assinada com expiração ≤ 5 minutos. O contrato faz isso; o orçamento não — `DownloadQuotePdfController.js` gera o PDF a cada download.

**Por que no código, e não no requisito:** o orçamento é o que foi **oferecido** ao cliente corporativo. Regenerado sob demanda, o PDF muda quando os dados mudam, e deixa de ser o documento que o cliente recebeu.

**O padrão a copiar já existe — não invente outro:**

| Peça | Onde está no contrato |
|---|---|
| Coluna `pdf_url TEXT` | `app/Models/ContractModel.js:17` e `db/schema.sql:298` |
| Gerar + enviar em *best-effort*, fora da transação | `CreateContractController.js`, bloco a partir da linha ~59 |
| Regerar ao atualizar | `UpdateContractController.js`, linhas ~69-72 |
| Download: URL assinada se houver `pdf_url`, senão sob demanda | `DownloadContractPdfController.js` |
| Upload e URL assinada (300 s = 5 min) | `app/utils/uploadToMinIO.js` — `uploadToMinIO(buffer, key)` e `getPresignedDownloadUrl(key)` |

**Critérios de aceite:**

- **CA-D.1** — `EventQuoteModel` e `db/schema.sql` ganham `pdf_url TEXT NULL`. O `migrate` usa `sequelize.sync({ alter: true })` — confirme que a coluna aparece num banco já existente
- **CA-D.2** — Criar orçamento gera e envia o PDF com a chave `${tenantId}/quotes/${id}.pdf`, em *best-effort*: se o MinIO falhar, o orçamento continua criado (`201`) com `pdf_url` nulo. Não renomeie o bucket `hotel-contracts`
- **CA-D.3** — **Só orçamento `SENT` pode ser editado.** Hoje `UpdateEventQuoteController` não tem trava de status: dá para editar um orçamento `CONFIRMED` ou `CANCELLED`. Com o PDF persistido, isso sobrescreveria o registro do que foi aceito. `PUT` em orçamento fora de `SENT` → `409`, em **allowlist** (fail-safe, regra do CLAUDE.md). O teste da linha 117 de `b2b-smoke.test.js` faz `PUT` num orçamento `SENT`, então não quebra
- **CA-D.4** — Editar um orçamento `SENT` regera e sobrescreve o PDF na mesma chave
- **CA-D.5** — Download: com `pdf_url`, redireciona para URL assinada; sem `pdf_url`, gera sob demanda — **igual ao contrato**
- **CA-D.6** — **DRY:** se o bloco "gerar → enviar → gravar `pdf_url`" aparecer em três lugares ou mais somando contrato e orçamento, extraia para `app/utils/`. Não force a extração se não repetir
- **CA-D.7** — Isolamento de tenant: orçamento de outro hotel → `404` em todas as rotas tocadas

**Os testes são os primeiros de PDF da suíte.** `b2b-smoke.test.js:9` diz que os endpoints `/pdf` foram omitidos porque dependem do MinIO. Use `vi.mock` em `app/utils/uploadToMinIO.js`, e cubra: criação grava `pdf_url` com a chave certa; falha do MinIO mantém `201` com `pdf_url` nulo; download com `pdf_url` responde `302` para a URL assinada; download sem `pdf_url` responde `200` com `application/pdf`; `PUT` em `CONFIRMED` e em `CANCELLED` → `409`; `PUT` em `SENT` chama o upload de novo; outro tenant → `404`.

**Fora do escopo — registre no PR, não corrija:** o contrato também cai para geração sob demanda quando `pdf_url` é nulo, o que diverge do *"download apenas por URL assinada"* do RNF-023. É comportamento existente e vale para os dois; a decisão fica com o Gabriel.

**Consequência documental — registre no PR:** o Doc 03 v1.2 do Sirlande diz, na §7 (D-005), que o PDF de orçamento *não* é armazenado, e registra a divergência com o RNF-023 na nota de rastreabilidade. Depois do merge, o código passa a cumprir o RNF-023 e o Doc 03 fica desatualizado. **Não edite o Doc 03** — é do Sirlande. Escreva a sugestão em `docs/sugestoes-documentos-oficiais/03-dfd/MOTIVOS.md`, numa seção nova "Após o RNF-023 no código".

**Condição de parada:** portão completo. Merge em `develop`.

---

### ETAPA E — Documento 02: conferência contra os critérios de aceite

**Idêntica à ETAPA 7** de `pendencias_liberadas_gabriel_16set2026.md`. Branch `docs/conferencia-doc02`.

Dois fatos novos para considerar na conferência: o **RF-045** passou para `b2b-service` na v1.4 sugerida (decisão do Gabriel de 28/09, pedido do Sirlande no PR #85), e o **RNF-023** passa a ser cumprido pelo código depois da etapa D.

**Condição de parada:** PR para `develop` com o relatório.

---

## 5. Output esperado

O mesmo da §5 da delegação anterior: PR por etapa com critérios um a um e a saída real do portão, Spec atualizada, relatório de sessão em `docs/historico_sessao/gabriel/`, e ao final a tabela-resumo:

| Etapa | Estado | PR | Pendências | Revisão de outro dono |
|---|---|---|---|---|

---

## 6. Quando parar e perguntar

- Qualquer arquivo de chave aparecendo em `git status` ou num diff
- Qualquer teste que já passava e passou a falhar
- Veredito REPROVADO do `qa-redteam` depois de uma tentativa de correção
- `/security-review` com achado de severidade alta no diff do RS256
- Se algum fluxo existente depender de editar orçamento `CONFIRMED` ou `CANCELLED` (etapa D, CA-D.3)
- Nas condições de parada explícitas das etapas A e C

---

## 7. Fora desta delegação

- **T-01.4** — extrair o analytics. Liberada quando o Gabriel aprovar o catálogo da etapa C; terá delegação própria
- **Documento 07** — a transcrição da ADR-006 é do Weslley. **Não altere o `PRODUCTS` na ADR-003:** ele está implementado e a ADR-003 está correta; quem está desatualizado é o Doc 04 v1.1 (ver `docs/sugestoes-documentos-oficiais/03-dfd/MOTIVOS.md`)
- **Frontend**
- **Documentos oficiais da UniFAAT** — nenhum é editado
