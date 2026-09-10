# Divisão de trabalho — Gabriel, Weslley e Sirlande

**Versão 2.0** · 09/09/2026 · base: `docs/specs/` @ `origin/develop`

---

## 1. Resumo — quem fica com o quê

| | Backend / Infra | Frontend | Dias |
|---|---|---|---:|
| **Gabriel** | SPEC-01 Microsserviços · fatias da SPEC-06 · portão de QA | Reservas · Rack · Painel do dia | ~33 |
| **Sirlande** | SPEC-04 Consumo · fatias da SPEC-06 | Comanda · Ficha do hóspede | ~31 |
| **Weslley** | SPEC-03 Integrações · SPEC-02 Cloud/IaC · Documentação acadêmica · T-06.4 | Financeiro · Fechamento de caixa · B2B · Configurações | ~36 |

**SPEC-07 (Tarifas) é buffer** — fica fora da conta e só entra se o cronograma segurar.

**Primeira tarefa de cada um:**

- Gabriel → **T-01.1** (recorte dos serviços) e **T-06.9** (webhook sem assinatura 🔴)
- Sirlande → **T-04.1** (`Account` + `AccountItem`)
- Weslley → **T-03.1** (ViaCEP) e **T-02.1** (decidir Kubernetes e estimar custo)

---

## 2. O que existe para dividir

São **7 Specs** e mais a documentação acadêmica.

| Spec | Tema em uma frase | Termo? | Dias |
|---|---|:--:|---:|
| SPEC-01 | Parar de ser monólito: decidir o recorte e extrair o primeiro serviço | 🔴 | ~14 |
| SPEC-02 | Sair da máquina local para a nuvem, tudo provisionado por código | 🔴 | ~12 |
| SPEC-03 | Consumir API de terceiro — ViaCEP e Mercado Pago | 🔴 | ~6 |
| SPEC-04 | A conta deixa de ser da reserva e passa a ser da conta (comanda) | — | ~17 |
| SPEC-05 | Transformar as telas de CRUD em um PMS de verdade | — | ~35 |
| SPEC-06 | Dívida técnica: vulnerabilidade, cobertura, Swagger, contingência | parcial | ~10 |
| SPEC-07 | O preço deixa de ser um número fixo por categoria | — | ~12 |
| SPEC_DOC | Os 8 documentos da coordenação — **5 ainda em branco** | 🔴 | ~5 |

As três 🔴 não são escolha de produto: são condição de aprovação.

---

## 3. As trilhas em detalhe

### 3.1 Gabriel — o gargalo e o portão

**SPEC-01 — Microsserviços.** É decisão antes de código: quem é dono de qual dado, como os serviços conversam, como se autenticam. Depois vem a extração do `analytics-service` e o CI por serviço. Precisa de quem conhece o sistema inteiro, e trava duas outras frentes.

**Fatias da SPEC-06:** T-06.9 (assinatura do webhook), T-06.5 (vazamento no endpoint público), T-06.2 (schema no Swagger), T-06.8 (promover `develop` para `main`).

**Frontend:** reservas, rack e painel do dia — o núcleo e a tela mais difícil.

**Portão de QA de todas as frentes.** O `qa-redteam` roda antes de todo merge, em qualquer trilha. Ninguém aprova o próprio trabalho.

### 3.2 Sirlande — o domínio

**SPEC-04 — Módulo de Consumo.** É quem mais escreveu regra de negócio no projeto: 45 commits em `app/Controllers` e 13 em `app/Models`. A Spec tem dois pontos sensíveis — a T-04.2 migra dado financeiro, e a T-04.4 acopla `Payment` a `Account`, tarefa de maior risco do projeto.

**Fatias da SPEC-06:** T-06.3 (`RoomCategoryModel`), T-06.6 (índice em banco legado), T-06.10 (paginação), T-06.11 (eliminação de dado pessoal).

**Frontend:** comanda e ficha do hóspede — as telas do domínio que ele acabou de modelar.

**SPEC-07** se o cronograma permitir, e só depois de fechar a SPEC-04.

### 3.3 Weslley — infraestrutura, integrações e documentação

**SPEC-03 — Integrações.** Começa por aqui: ~4 dias que fecham sozinhos um critério 🔴 do Termo. É a forma mais rápida de tirar o projeto do vermelho, e entrega algo concluído antes da SPEC-02, que é longa.

**SPEC-02 — Cloud, IaC e Observabilidade.** Único do time com histórico em `docker/kubernetes` e `docker-compose.yml`.

**SPEC_DOC — Documentação acadêmica.** Escreveu o Documento 02; conhece o formato. O Documento 08 pode começar já — e há uma dívida embutida: o Documento 02 que vai ao professor **afirma** que o acompanhamento de execução mora no 08, que hoje é template.

**T-06.4** (docker-compose de contingência), movida da SPEC-06 por ser a área dele.

**Frontend:** financeiro, fechamento de caixa, B2B e configurações.

> ⚠️ **Regra absoluta, e vale para todos:** permanecer sempre no free-tier. Recurso subiu, recurso desce no fim do uso — `terraform destroy` na hora. Nunca usar o usuário `root` da AWS. Nenhuma prioridade de entrega passa na frente disso.

---

## 4. Frontend — o contrato

A SPEC-05 tem ~35 dias e nenhum dos três tem prática de React. Por isso ela é **dividida em módulos verticais**, não em camadas, e sob princípios acordados.

### 4.1 Os módulos

| Módulo | Dono | Tarefas |
|---|---|---|
| Reservas, rack, painel do dia | Gabriel | T-05.2, T-05.3, T-05.4 |
| Comanda, ficha do hóspede | Sirlande | T-05.5, T-05.10 |
| Financeiro, caixa, B2B, configurações | Weslley | T-05.6, T-05.7, T-05.8, T-05.11 |
| Quartos/categorias, governança, busca global | de quem terminar primeiro | T-05.1, T-05.9, T-05.12 |

**O critério foi afinidade com o backend:** quem constrói a API constrói a tela dela. Sirlande modela `Account` na SPEC-04 e por isso faz a comanda; Weslley já escreveu `bill-consumptions.test.js` e o fechamento de caixa traz backend novo junto.

### 4.2 Os doze princípios

**Estrutura**

1. **Fatia vertical, nunca camada.** Módulo é pasta em `src/features/<nome>/`, dona das próprias telas, hooks e tipos. Ninguém é "o das telas" ou "o do estado".
2. **Módulo não importa tripa de outro módulo** — só o que ele exporta no `index.ts`. Se dois precisam do mesmo, sobe para `packages/`.
3. **Uma rota, um dono.**

**Dados**

4. **Nenhum `fetch` direto.** Tudo pelo `packages/api-client` gerado do OpenAPI.
5. **Sem `as unknown as`.** Se o tipo não existe, o problema está no Swagger — resolve-se na T-06.2, não com cast.
6. **Dinheiro e data têm um lugar só:** `@hotel/domain`. Nunca `Number()` em `DECIMAL`, nunca data sem `America/Sao_Paulo`.
7. **Nenhuma tela baixa coleção inteira do tenant** para filtrar na memória.
8. **Estado de servidor é TanStack Query.** Zustand só para sessão. Estado global novo exige acordo.

**Interface** — os quatro últimos já são RNF no documento oficial, então não são preferência

9. Toda tela tem **quatro estados**: carregando, vazio, erro e conteúdo. O vazio ensina o próximo passo.
10. Status sempre **cor + rótulo**, nunca só cor.
11. Ação indisponível fica **desabilitada com o motivo**, não desaparece.
12. Alvo de toque **≥ 48px** nas telas de uso móvel.

### 4.3 O design system — sem dono, com regra

Curador único vira gargalo e empurra para abstrair cedo demais, contra o próprio princípio do projeto (*"DRY×KISS — não abstrair cedo"*). Então `packages/ui` **não tem dono**. Tem quatro mecanismos:

**1. Duas fontes de registro.** `packages/ui/src/index.ts` é o registro técnico — o que está exportado é o que existe. `packages/ui/CATALOGO.md` é o humano, uma linha por componente:

| Componente | Para quê | Quando **não** usar |
|---|---|---|

A terceira coluna é a que mais evita duplicata: é ela que faz a pessoa perceber que o caso dela é outro — ou que não é.

**2. Regra de promoção.**

> Componente nasce **local**, em `features/<módulo>/components/`.
> **Sobe para `packages/ui` quando o segundo módulo precisar dele.**

Ninguém pede autorização para criar. Quem precisa do componente pela segunda vez é quem promove: move, exporta no `index.ts`, registra no catálogo. Isso é DRY com prova de reúso, em vez de adivinhação na primeira vez.

**3. Antes de criar, procura.** Trinta segundos: olhar o catálogo e o `index.ts`. Se existe e não serve, a razão vira a coluna "quando não usar".

**4. Regra 9 do `qa_checks.sh`.** É o que substitui o curador — pega divergência silenciosa sem ninguém vigiando: elemento cru (`<button>`, `<input>`) dentro de `features/`, cor literal fora dos tokens, string de classes idêntica repetida em três arquivos.

**Faxina semanal, dez minutos.** O que nenhuma regra pega são dois componentes *quase* iguais que ninguém promove. Os três olham juntos o que nasceu na semana e decidem. Um minuto de conversa quando é semanal; uma refatoração quando é semestral.

### 4.4 O que continua com dono

| Área | Dono | Regra |
|---|---|---|
| `packages/api-client` | ninguém — é processo | **Regenera, nunca edita à mão.** Tipo que falta se conserta no Swagger |
| Layout, rotas e sessão | **Gabriel** | Rota nova é **aditiva e livre**. Mudar a forma do layout, o fluxo de sessão ou o controle de papel precisa de acordo |

A diferença de tratamento é proposital: `packages/ui` cresce por **adição**, então descentralizar custa pouco. Layout e sessão mudam por **substituição**, e aí o conflito custa caro nas três trilhas ao mesmo tempo.

### 4.5 Quando dividir

**A partir da semana 3.** Antes disso faltam duas coisas:

- **Canonizar o módulo de referência.** `src/features/guests/` já é uma fatia vertical completa e vira o padrão — mas primeiro corrigir nele o filtro no cliente, senão o defeito se propaga três vezes.
- **Rodar a T-06.2.** Sem schema de resposta no Swagger, os três vão escrever `as unknown as` e o princípio 5 nasce morto.

---

## 5. A grade

```
          Gabriel                  Sirlande                 Weslley
S1-2   T-01.1 recorte           T-04.1 Account +         T-03.1 ViaCEP  ✅ Termo
       T-06.9 webhook 🔴         AccountItem              T-02.1 decidir k8s + custo

S3-4   T-01.2 comunicação       T-04.2 migração ⚠        T-03.2 Mercado Pago
       T-01.3 auth interna      T-04.3 bill ──────┐      T-06.4 docker-compose
       ── frontend começa ──    ── frontend ──    │      ── frontend ──
                                                  │
S5-6   T-01.4 extrair ────┐     T-04.4 Payment ↔  │      T-02.2 Terraform base
       analytics-service  │     Account 🔴 isolada │      Doc 08 sprints
                          │     T-04.5 delegação  │
                          │                       ▼
S7-8   T-01.5 CI/CD ──────┼──►  T-04.6 check-in   R1 comanda destravada
       (entrega ao W)     │     T-04.7 fecha 04
                          ▼
S9-10  T-06.2 Swagger     R2 destrava T-02.3,     T-02.3 portar k8s
       T-06.8 → main         docs 03 e 06, ADR-003 T-02.4 observabilidade
                          SPEC-07 (se couber)      Docs 05 e 06
```

---

## 6. Os dois pontos de encontro

O plano tem exatamente **duas** dependências entre pessoas. Fora delas, as trilhas não se tocam.

| | O quê | Quem espera |
|---|---|---|
| **R1** | `T-04.3` (bill da conta) pronto | A comanda no frontend (T-05.5) |
| **R2** | `T-01.4` (`analytics-service` extraído) pronto | `T-02.3` e os documentos 03, 06 e ADR-003 |

**Se a trilha do Gabriel atrasar**, o Weslley não fica parado: Documento 08 e T-06.4 não dependem de R2, e foi por isso que ficaram onde estão.

---

## 7. Onde as trilhas colidem

Não por dependência de tarefa — por arquivo.

| Arquivo | Quem quer mexer | Regra |
|---|---|---|
| `.github/workflows` | Gabriel (T-01.5) e Weslley (T-02.5) | **Weslley é o dono.** Gabriel entrega o que precisa e ele integra |
| `config/swagger.js` | todos | A T-06.2 reescreve o arquivo inteiro: **uma pessoa, uma vez**, e ninguém encosta durante |
| `db/schema.sql`, `app/Models/` | Sirlande (04, 07) e Gabriel (01) | **Sirlande é o dono.** Gabriel avisa antes |
| `k8s/`, `terraform/`, `docker-compose.yml` | Weslley | — |
| `packages/` do frontend | todos | Ver §4.3 |

---

## 8. Regras de convivência

| Regra | Por quê |
|---|---|
| Cada um em sua **worktree**, com `.git` compartilhado | Já resolveu o problema de clone defasado que custou um diagnóstico errado |
| Branch sempre a partir de `origin/develop`, nunca de `develop` local | `develop` está no working tree da raiz |
| `git add` **arquivo por arquivo** — nunca `git add .` | Convenção do projeto |
| Nenhum merge em `develop` sem relatório do `qa-redteam` em `docs/qa/` | Portão obrigatório. Ninguém audita o próprio código — ver §11 |
| Commit **e push** ao fim de cada sessão | Já tivemos 4 branches e 8 commits existindo em uma única máquina |
| Relatório em `docs/historico_sessao/<seu-nome>/` | Quem pegar a frente depois precisa saber onde parou |
| Spec desatualizou? **Atualiza a Spec** | A Spec é a fonte autoritativa, não o relatório |
| `bash scripts/estado.sh` antes de perguntar o estado | Responde metade das perguntas sozinho |

---

## 9. A conta, e o que se corta primeiro

Escopo total: **~111 dias-dev**. Três pessoas dão ~37 cada. Para quem também estuda, isso não é um mês — é um semestre sem folga e sem imprevisto.

O plano assume isso e já marca o que sai, na ordem:

1. **SPEC-07 — Tarifas por período** (~12 dias). É o buffer. O produto sobrevive sem tarifa por período; feio, mas vivo.
2. **T-05.9 a T-05.12** (~9,5 dias) — governança, ficha do hóspede, fechamento de caixa e busca global. Ficaram no fim de propósito: saem inteiras sem quebrar o que veio antes.
3. **T-04.3 é ponto de parada seguro** na SPEC-04. Se o prazo apertar no meio da comanda, para ali.

Cortar cedo e de propósito é diferente de não entregar por acidente.

---

## 10. Riscos

| Risco | Severidade | Mitigação |
|---|---|---|
| SPEC-01 atrasar e travar Weslley e três documentos | 🔴 | É a primeira tarefa do Gabriel; Doc 08 e T-06.4 ocupam o Weslley enquanto isso |
| Escopo não caber até a defesa | 🔴 | Cortes já declarados em §9 |
| Custo de nuvem escapar do free-tier | 🔴 | Regra absoluta; destruir recurso ao fim de cada uso |
| Três pessoas aprendendo React ao mesmo tempo | Médio | Princípios de §4.2 reduzem divergência, não a curva. Cada um orquestra um agente no próprio módulo |
| Divergência visual entre os módulos | Médio | Módulo de referência canonizado + dono único de `packages/ui` |
| Sirlande sozinho na migração de dado financeiro (T-04.2) | Médio | CA-04.2.a a .c exigem contagem antes e depois; revisar em dupla |
| `config/swagger.js` virar campo de conflito | Médio | Dono único durante a T-06.2 |

---

## 11. Revisão — quem confere o quê

### 11.1 O portão automático, agora escopado por dev

O `qa-redteam` roda antes de todo merge, em qualquer trilha, e passa a operar **no escopo de um dev**:

- **O escopo é o diff da branch.** É a única coisa que o veredito julga.
- **Achado fora do escopo nunca reprova a branch.** Reprovar alguém por defeito que outra pessoa introduziu trava a entrega errada e ensina o time a ignorar o portão.
- **O que se faz com ele é repassar:** o auditor identifica o dono pela área (§3 e §7), grava em `docs/qa/repasses/para_<dono>_<data>.md` e cita no relatório principal.
- **Uma exceção:** 🔴 de segurança, vazamento ou dinheiro em qualquer área vai **também** para o topo do relatório, como alerta. Continua sem reprovar a branch — mas ninguém precisa abrir outro arquivo para descobrir que existe um vazamento.

Quem recebe o repasse decide quando corrigir. Não é ordem de serviço; é informação com dono.

### 11.2 Revisão humana — só onde o erro é irreversível

O auditor automático acha vazamento, PII em log e violação de padrão. Ele **não** acha "isso resolve o problema errado" nem "essa regra não é assim no hotel". Como o tempo é curto, revisão humana obrigatória fica só onde o erro não tem volta:

| Onde | Por quê |
|---|---|
| **T-04.2** — migração `Consumption` → `AccountItem` | Move dado financeiro. Errou, perdeu histórico de dinheiro |
| **T-04.4, T-04.5, T-07.5** — tudo que toca valor ou pagamento | Quebra o fluxo PIX, e o erro só aparece quando o hóspede reclama |
| **Qualquer provisionamento com custo** | Segunda pessoa confere a estimativa **antes** do `terraform apply` |
| **T-06.8** — promover `develop` para `main` | É o que o professor abre |

No resto: autor + `qa-redteam`, e segue. Revisão onde ela paga, em vez de carimbo em todo lugar.

---

## 12. Cadência

**Uma reunião por semana, curta, com pauta fixa:**

1. O que fechou desde a última?
2. O que está travando?
3. O que vai colidir na próxima semana?
4. Alguma Spec mudou?
5. Faxina do design system — o que nasceu na semana (§4.3)

Metade disso o `bash scripts/estado.sh` responde antes de alguém abrir a boca.

**Duas regras que valem mais que a reunião:**

- **Bloqueio não espera a reunião.** Travou na segunda, avisa na segunda. A reunião coordena, não socorre.
- **R1 e R2 são anunciados.** Quando a T-04.3 fechar, Sirlande avisa. Quando a T-01.4 fechar, Gabriel avisa. Dependência que ninguém anuncia vira espera silenciosa.

---

| Versão | Data | Alteração |
|---|---|---|
| 1.0 | 09/09/2026 | Divisão inicial por trilha, a partir do histórico do repositório |
| 2.0 | 09/09/2026 | Frontend dividido em módulos verticais por afinidade com o backend, com doze princípios. Grade de 10 semanas, pontos de encontro R1 e R2, mapa de colisão por arquivo e ordem de corte. SPEC-07 passa a buffer explícito |
| 2.1 | 09/09/2026 | Fecha as decisões que estavam em aberto. O design system deixa de ter curador e passa a catálogo + promoção no segundo uso + regra 9 do `qa_checks.sh` + faxina semanal — centralizar num só vira gargalo e empurra para abstrair cedo. O `qa-redteam` passa a operar **escopado no dev**: achado fora do escopo não reprova a branch, é repassado ao dono em `docs/qa/repasses/`. Revisão humana fica só onde o erro é irreversível, e a cadência ganha pauta fixa |
