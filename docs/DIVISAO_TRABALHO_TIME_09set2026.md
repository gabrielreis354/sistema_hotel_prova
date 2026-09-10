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

### 4.3 O que tem dono único

Três pessoas em `packages/` ao mesmo tempo é onde isto desanda.

| Área | Dono | Regra |
|---|---|---|
| `packages/ui` | um só | Componente novo entra **por pedido**, não por commit direto |
| `packages/api-client` | quem faz a T-06.2 | Regenerado uma vez, quando o Swagger estiver completo |
| Layout, rotas e sessão | um só | Mexer aqui afeta as três trilhas |

Regra prática: se você está estilizando dentro do módulo algo que deveria ser componente, pare e peça.

### 4.4 Quando dividir

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
| Nenhum merge em `develop` sem relatório do `qa-redteam` em `docs/qa/` | Portão obrigatório. Ninguém audita o próprio código |
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

## 11. O que ainda falta decidir

1. **Quem é o dono de `packages/ui`, do `api-client` e do layout.** Sem isso, §4.3 não se sustenta.
2. **Revisão cruzada:** a proposta é Sirlande revisar a infra do Weslley, Weslley revisar o domínio do Sirlande, Gabriel revisar os dois — e o `qa-redteam` auditar todos.
3. **Cadência.** Uma conversa curta por semana com o estado das Specs é suficiente.

---

| Versão | Data | Alteração |
|---|---|---|
| 1.0 | 09/09/2026 | Divisão inicial por trilha, a partir do histórico do repositório |
| 2.0 | 09/09/2026 | Frontend dividido em módulos verticais por afinidade com o backend, com doze princípios e donos únicos das áreas compartilhadas. Grade de 10 semanas, pontos de encontro R1 e R2, mapa de colisão por arquivo e ordem de corte. SPEC-07 passa a buffer explícito |
