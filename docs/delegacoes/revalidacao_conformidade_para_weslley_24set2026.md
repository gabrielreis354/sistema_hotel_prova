# Revalidação de conformidade — bloco pronto para aplicar no PR #80

**Para:** **Weslley Lucas**, dono do documento de conformidade e do PR #80
**De:** Gabriel Reis Cunha · **Data:** 24/09/2026
**Arquivo a editar:** `docs/ANALISE_CONFORMIDADE_ACEITE_PROJETO_EXPERIMENTAL_23ago2026.md`
**Branch:** `docs/conformidade-t064-rabbitmq` (a do PR #80)

---

## Por que este arquivo existe

O PR #80 está **correto no que faz**: conferi as três afirmações dele contra o código e todas se
sustentam. O problema é o placar que ele publica — `8 atendidos, 4 parciais, 8 não atendidos`.

Contei a tabela linha por linha e ela não diz isso. E três critérios venceram sem serem
registrados, incluindo **um dos 🔴 críticos, que você mesmo fechou 1h37 antes de abrir o PR**.

Aqui estão as edições exatas e o bloco pronto para colar. Nada aqui muda a sua conclusão sobre o
critério 20 nem sobre o RabbitMQ — as duas estão certas.

---

## 1. O placar não fecha

Contagem da tabela da Seção 0, **na sua branch**:

| | A tabela tem | A prosa diz |
|---|---|---|
| ✅ Atende | **6** (1, 5, 7, 12, 15, 20) | 8 |
| ⚠️ Parcial | **3** (2, 9, 10) | 4 |
| ❌ Não atende | **11** (3, 4, 6, 8, 11, 13, 14, 16, 17, 18, 19) | 8 |

Os dois somam 20, mas distribuem diferente. O erro vem da revalidação de 26/08, não do seu PR —
só que o PR incrementa `7 → 8` em cima dele em vez de recontar.

A prosa também diz "os **quatro** 🔴 críticos". A tabela marca **cinco**: microsserviços, nuvem,
Terraform, monitoramento **e o critério 4, integração com API externa real**, que nunca entrou na
frase.

Conferir com:

```bash
grep -E '^\| [0-9]+ \|' docs/ANALISE_CONFORMIDADE_ACEITE_PROJETO_EXPERIMENTAL_23ago2026.md \
  | head -20 > /tmp/tab.txt
for s in ✅ ⚠️ ❌ 🔴; do printf '%s %s\n' "$s" "$(grep -c "$s" /tmp/tab.txt)"; done
```

---

## 2. Quatro critérios venceram e um virou parcial

### Critério 4 — Integração com API externa real · ❌ 🔴 → ✅

**Você fechou este.** O ViaCEP entrou na `develop` em 16/09 às 20:14, no commit `00c2fee`, e o
PR #80 foi aberto às 21:51 do mesmo dia.

Não é código solto — está ligado de ponta a ponta:

| Peça | Onde |
|---|---|
| Rota montada | `services/core-service/routes/router.js:77` → `/address` |
| Router | `services/core-service/routes/apis/addressRouter.js:11` → `GET /:cep` |
| Controller | `services/core-service/app/Controllers/AddressApi/GetAddressController.js` |
| Provider real | `services/core-service/app/services/address/ViaCepAddressProvider.js` |
| Factory por env | `services/core-service/app/services/address/index.js` (`ADDRESS_PROVIDER`) |
| Erros tipados | `services/core-service/app/services/address/errors.js` |
| Testes | `services/core-service/tests/address.test.js` |
| Documentado | consta de `services/core-service/config/swagger.js` |

Com ele fechado, **a frase "os quatro 🔴 críticos (microsserviços, nuvem, Terraform,
monitoramento)" passa a estar correta** — hoje ela conta quatro de cinco.

### Critério 13 — Documento de Requisitos (RF/RNF) · ❌ → ✅

O Doc 02 **v1.3 está no repositório do professor desde 09/09**, uma semana antes da sua
revalidação. Mesmos critérios 12 e 15, que já constam como ✅.

```bash
git -C <UniFAAT> log upstream/main --date=short --format='%ad %s' \
  -- Projetos/gesway/02-requisitos-funcionais-nao-funcionais.md | head -1
# 2026-09-09 docs(requisitos): v1.3 — ficha de registro do hospede e fechamento de caixa
```

### Critério 10 — Testes automatizados, cobertura ≥ 60% · ⚠️ → ✅

`services/core-service/vitest.config.js:31` tem `thresholds: { lines: 60 }`, e o comentário na
linha 27 diz o que isso significa: *"O CI (e `npm run test:coverage`) falha abaixo disso"*. O CI
está verde na `develop`. Ou seja: a meta não é só atingida, é **barrada por gate**.

### Critérios 14 (DFD) e 18 (ADR) · ❌ → ⚠️ Parcial

Os dois existem escritos, e **nenhum dos dois foi entregue** ao repositório do professor:

- **DFD:** o Sirlande preencheu o Doc 03 v1.0 em 17/09, no nosso fork. Há uma v1.1 proposta no
  [PR #3 do fork](https://github.com/gabrielreis354/UniFAAT-projeto-experimental-2027-1/pull/3),
  aguardando ele.
- **ADR:** a ADR-003 está escrita no Doc 07, também só no fork. O `upstream` ainda tem o template.

### O que continua ❌, e está certo

Conferi os três documentos que sustentam os critérios 16, 17 e 19. Os arquivos existem no
repositório do professor, mas são **byte a byte idênticos ao template em branco** — zero linhas
divergentes, placeholders `[Nome do Projeto]` intactos:

```bash
cd <UniFAAT>
for n in 05-arquitetura-nuvem 06-c4-model 08-planejamento-sprints-tarefas; do
  diff --strip-trailing-cr <(git show upstream/main:templates/$n.md) \
                           <(git show upstream/main:Projetos/gesway/$n.md) | grep -c '^[<>]'
done
# 0, 0, 0
```

### Placar corrigido

| | Antes (26/08) | Agora |
|---|---|---|
| ✅ Atende | 6 | **9** — 1, 4, 5, 7, 10, 12, 13, 15, 20 |
| ⚠️ Parcial | 3 | **4** — 2, 9, 14, 18 |
| ❌ Não atende | 11 | **7** — 3, 6, 8, 11, 16, 17, 19 |
| 🔴 Crítico aberto | 5 | **4** — 3, 6, 8, 11 |

9 + 4 + 7 = 20.

**Deixei de fora, de propósito, duas decisões que são do time:**

- **Critério 2** (papéis distribuídos e documentados) — o `docs/DIVISAO_TRABALHO_TIME_09set2026.md`
  v2.4 tem tarefa, dono e dias por dev. Dá para argumentar ✅. Mantive ⚠️ porque quem decide é o time.
- **Critério 3** (microsserviços) — o backend saiu da raiz para `services/core-service/`, a ADR-003
  fechou o recorte e o compose já espelha os nomes dos serviços. Mesmo assim mantive **❌ 🔴**: roda
  um processo só, e a Seção 10 deste documento é explícita sobre o que o termo pede para o 4º
  semestre — *"pelo menos 2 serviços rodando separados, se comunicando, com o mínimo de tráfego
  real entre eles"*. Ainda não temos. **É o único crítico devido neste semestre** — os outros três
  são entrega formal do 5º.

---

## 3. Edições na tabela da Seção 0

Cinco linhas, na sua branch:

```diff
-| 4 | Integração com API externa real | ❌ Não atende | 🔴 Crítica |
+| 4 | Integração com API externa real | ✅ **Atende** *(concluído 16/09 — ViaCEP, T-03.1)* | — |

-| 10 | Testes automatizados, cobertura ≥ 60% | ⚠️ Parcial (ver nota) | Média |
+| 10 | Testes automatizados, cobertura ≥ 60% | ✅ **Atende** *(gate de 60% no CI)* | — |

-| 13 | Documento de Requisitos (RF/RNF) | ❌ Não atende | Alta |
+| 13 | Documento de Requisitos (RF/RNF) | ✅ **Atende** *(v1.3 entregue 09/09)* | — |

-| 14 | Diagrama de Fluxo de Dados (DFD) | ❌ Não atende | Alta |
+| 14 | Diagrama de Fluxo de Dados (DFD) | ⚠️ Parcial (v1.0 escrito, não entregue) | Alta |

-| 18 | ADR (Registro de Decisões Arquiteturais) | ❌ Não atende como artefato formal | Alta |
+| 18 | ADR (Registro de Decisões Arquiteturais) | ⚠️ Parcial (ADR-003 escrita, não entregue) | Alta |
```

E a frase logo abaixo da tabela:

```diff
-**8 critérios atendidos, 4 parciais, 8 não atendidos.** Os quatro 🔴 críticos (microsserviços, nuvem, Terraform, monitoramento) são interdependentes — resolver um sem os outros três não fecha o aceite, e são também os que mais tempo consomem.
+**9 critérios atendidos, 4 parciais, 7 não atendidos.** Dos cinco 🔴 críticos originais, a integração com API externa real fechou em 16/09. Os quatro restantes (microsserviços, nuvem, Terraform, monitoramento) são interdependentes — resolver um sem os outros três não fecha o aceite, e são também os que mais tempo consomem. Destes, só **microsserviços** é devido no 4º semestre; nuvem, Terraform e monitoramento são entrega formal do 5º (ver Seção 10).
```

---

## 4. Bloco de revalidação — pronto para colar

Substitui o bloco de 16/09 que está no PR. Vai no mesmo lugar: depois do bloco de 26/08, antes
do `## 1. Equipe`.

```markdown
> ### 🔄 Revalidação em 24/09/2026
>
> **O que mudou:** quatro critérios fecharam e dois viraram parciais.
>
> - **Critério 20 — contingência via Docker Compose (T-06.4, PR #79).** `docker-compose.yml` sobe o sistema inteiro localmente espelhando os nomes de serviço de `infra/k8s/` (postgres, redis, minio, rabbitmq, backend, nginx). Validado de ponta a ponta: build da imagem do backend, healthcheck de todos os serviços, `/health` atravessando o proxy nginx até o backend, e `node command.js migrate` rodando contra o Postgres do compose. De quebra, a validação encontrou um bug real — `minio/minio:latest` saiu do Docker Hub em set/2026, com pulls anônimos devolvendo 401 — corrigido para `quay.io/minio/minio:latest` no compose e em `infra/k8s/minio.yaml`.
> - **Critério 4 — integração com API externa real (🔴 crítico).** O provider ViaCEP entrou em 16/09 (`00c2fee`) e está ligado de ponta a ponta: `GET /address/:cep` montado em `routes/router.js`, controller em `app/Controllers/AddressApi/`, provider real em `app/services/address/ViaCepAddressProvider.js` com factory por `ADDRESS_PROVIDER`, erros tipados, testes em `tests/address.test.js` e entrada no Swagger. **Primeiro dos cinco críticos a fechar.**
> - **Critério 13 — Documento de Requisitos (RF/RNF).** O Doc 02 v1.3 está no repositório do professor desde 09/09, com 56 RF e 27 RNF.
> - **Critério 10 — cobertura ≥ 60%.** `services/core-service/vitest.config.js` declara `thresholds: { lines: 60 }` e o CI falha abaixo disso. Não é só meta atingida: é gate.
> - **Critérios 14 (DFD) e 18 (ADR) → parciais.** Os dois artefatos existem escritos, nenhum entregue: o Doc 03 v1.0 foi preenchido em 17/09 e a ADR-003 está no Doc 07, ambos apenas no nosso fork.
>
> Placar: **6 → 9 atendidos**, **3 → 4 parciais**, **11 → 7 não atendidos**. Os números anteriores na prosa (`8/4/8`) não correspondiam à contagem da tabela, e a frase "os quatro críticos" omitia o critério 4 — ambos corrigidos aqui.
>
> **O que NÃO mudou:** o RabbitMQ foi provisionado no cluster k8s (`57c0ec3`) e no compose, mas **sem outbox, publish ou consume** — não há `amqplib` nem tabela de outbox em nenhum ponto do `core-service`. Isso é progresso parcial de **T-01.4** (SPEC-01), não uma conclusão: não altera o critério 3 (arquitetura de microsserviços, ainda um processo único) nem exige mudar o DFD, porque `docs/sugestoes-documentos-oficiais/03-dfd/INSUMOS.md` já trata a fila de eventos como 🟡 planejada, condicionada a outbox/publish/consume existirem no código — exatamente o que ainda falta. Nenhuma entrada nova em `docs/sugestoes-documentos-oficiais/` foi necessária.
>
> Os documentos que sustentam os critérios 16 (arquitetura em nuvem), 17 (C4) e 19 (sprints) seguem **idênticos ao template em branco** no repositório do professor — conferido por `diff` contra `templates/`, zero linhas divergentes.
>
> **Onde está o risco.** Dos quatro críticos restantes, três — nuvem, Terraform e monitoramento — são entrega formal do 5º semestre (Seção 10). O único devido **neste** semestre é o critério 3, e o termo é específico: pelo menos dois serviços rodando separados, se comunicando. É a T-01.4.
```

---

## 5. Dois ajustes fora do bloco

### 5.1 A citação do `/healthz` se contradiz com o seu próprio compose

O texto do PR — no bloco e na Seção 11 — cita como evidência *"proxy `/healthz` via nginx
respondendo"*. Mas o comentário que você escreveu no `docker-compose.yml`, no healthcheck do
nginx, diz o contrário:

> `/health` (não `/healthz`) — atravessa o location / até o backend_pool de verdade.
> `/healthz` é um checkpoint estático do próprio nginx, sempre 200 mesmo com o backend morto.

Você está certo no compose. A evidência forte é `/health`, que é o que o healthcheck usa de fato —
já trocado no bloco acima. Vale trocar na **Seção 11** também:

```diff
-`/healthz` respondendo via proxy nginx
+`/health` atravessando o proxy nginx até o backend
```

### 5.2 A Seção 9 contradiz a tabela — e o test plan não a cobriu

O test plan do PR diz ter conferido "a tabela-resumo, a Seção 11 e o novo bloco de revalidação".
A contradição ficou justamente na **Seção 9**, que não entrou nesse escopo:

| Seção 9 diz | Realidade |
|---|---|
| item 1: Solicitação do Sistema "❌ não existe como documento único" | a tabela marca o critério 12 como ✅ desde 26/08 |
| item 2: Requisitos "❌ não existe" | Doc 02 v1.3 entregue em 09/09 |
| item 3: DFD "Nenhuma ocorrência em nenhum lugar do repositório" | Doc 03 v1.0 escrito em 17/09 |
| item 4: MER aponta para `modelagem/DER.mmd` | hoje em `docs/legado/modelagem/` |
| cabeçalho: "6 de 8 itens não atendidos" | são 3 de 8 |

Isso é anterior ao seu PR, mas ele é o lugar natural de arrumar — é a mesma tabela, um nível
abaixo. Se preferir deixar para um PR separado, tudo bem; só não deixe passar da entrega, porque
é a seção que a banca lê para conferir a documentação obrigatória.

---

## 6. Sobre o PR em si

- **Está 34 commits atrás da `develop`.** Sem conflito, mas o CI verde é de 17/09. Vale um
  `git merge origin/develop` antes de fechar.
- O PR foi aberto em 16/09 citando como evidência o PR #79, que **só mergeou em 24/09**. Deu certo
  porque a ordem se resolveu sozinha, mas se o #80 tivesse entrado primeiro o documento de
  conformidade afirmaria um arquivo que não existia. Quando a evidência está em outro PR, vale
  marcar a dependência no corpo.

---

## 7. Como conferir tudo antes de aplicar

```bash
# critério 4 — o ViaCEP está ligado?
git grep -n "addressRouter" -- services/core-service/routes/router.js
git grep -n "router.get" -- services/core-service/routes/apis/addressRouter.js
git log --format='%h %ad %s' --date=short -- services/core-service/app/services/address/

# critério 10 — o gate de cobertura existe?
sed -n '20,35p' services/core-service/vitest.config.js

# RabbitMQ — confirma que nada publica nem consome
git grep -in "amqplib\|outbox" -- services/core-service    # sem saída

# critérios 16/17/19 — os documentos são template em branco?
cd <UniFAAT> && git fetch upstream
diff --strip-trailing-cr <(git show upstream/main:templates/06-c4-model.md) \
                         <(git show upstream/main:Projetos/gesway/06-c4-model.md)
```
