# Divisão de trabalho — Gabriel, Weslley e Sirlande

**Data:** 09/09/2026
**Base:** `docs/specs/` (índice mestre) · `origin/develop` @ `e2656a5`
**Critério:** histórico real do repositório, não preferência declarada

---

## 1. Não são 6 — são 7 Specs e mais a documentação

| Spec | Frente | Exigida pelo Termo? | Bloqueia |
|------|--------|---------------------|----------|
| SPEC-01 | Microsserviços | 🔴 Sim — *"monólitos simples não serão aprovados"* | SPEC-02, C4, DFD, ADR-003, MER v1.1 |
| SPEC-02 | Cloud, IaC e Observabilidade | 🔴 Sim | Defesa do 5º semestre |
| SPEC-03 | Integrações externas | 🔴 Sim — pelo menos uma API externa | — |
| SPEC-04 | Módulo de Consumo (comanda) | Não — é produto | SPEC-05 T-05.5 |
| SPEC-05 | Frontend `app-pms` | Não — mas é o que a banca vê | Demonstração |
| SPEC-06 | Qualidade e dívida técnica | Parcial — cobertura de teste | Portão do CI |
| SPEC-07 | Tarifas por período | Não — é produto | — |
| SPEC_DOC | Documentação acadêmica | 🔴 Sim — 8 documentos | Nota |

As três 🔴 **não são escolha de produto: são condição de aprovação**. SPEC-04, 05 e 07 entregam produto. SPEC-06 é dívida que, ignorada, quebra o CI ou aparece na defesa.

---

## 2. A conta que precisa ser dita antes da divisão

Estimativa de esforço, somando as tarefas de cada Spec:

| Spec | Dias-dev | Origem da estimativa |
|------|---------:|----------------------|
| SPEC-01 (escopo mínimo T-01.1 a T-01.5) | ~14 | minha |
| SPEC-02 | ~12 | minha |
| SPEC-03 | ~6 | minha |
| SPEC-04 | ~17 | declarada na Spec |
| SPEC-05 (v2.0, 12 tarefas) | ~35 | declarada na Spec |
| SPEC-06 (11 tarefas) | ~10 | minha |
| SPEC-07 | ~12 | declarada na Spec |
| SPEC_DOC (Fase B) | ~5 | minha |
| **Total** | **~111** | |

Três desenvolvedores dão **~37 dias-dev cada**. Para quem também estuda, isso não é um mês — é um semestre inteiro trabalhando sem folga e sem imprevisto.

**Conclusão honesta:** o escopo atual não cabe em três pessoas até a defesa. A divisão abaixo assume isso e marca desde já **o que se corta primeiro** se o prazo apertar. Cortar cedo e de propósito é diferente de não entregar por acidente.

---

## 3. Como cheguei nesta divisão

Não perguntei quem prefere o quê. Olhei o que cada um já fez:

| | Commits | Onde mais mexeu | Leitura |
|---|---:|---|---|
| **Gabriel** | 279 | tudo | Orquestrador; conhece o sistema inteiro |
| **Sirlande** | 64 | `app/Controllers` (45), `app/Models` (13), `routes/apis` (8) | **Backend de domínio** — é quem mais escreveu regra de negócio |
| **Weslley** | 23 | `app/Controllers` (8), `routes/apis` (7), `docker/kubernetes` (4), `docker-compose.yml` (2), `docs/infra` (2) | **Infra e documentação** — único que já mexeu em compose e k8s, e autor do Documento 02 |

Weslley também escreveu `tests/bill-consumptions.test.js` — conhece a área de conta e consumo.

---

## 4. A divisão

### Gabriel — o gargalo e o portão

| Spec | Por quê |
|---|---|
| **SPEC-01** — Microsserviços | É decisão antes de código: recorte de serviços, propriedade dos dados, padrão de comunicação, autenticação entre serviços. Quem decide precisa conhecer o sistema inteiro |
| **SPEC-06** — Dívida técnica | Já está em curso com o agente executor |
| Portão de QA de **todas** as frentes | O `qa-redteam` roda antes de todo merge. Ninguém aprova o próprio trabalho |

**Primeira tarefa:** T-01.1 — decidir o recorte e a propriedade dos dados. Enquanto ela não sair, a SPEC-02 do Weslley e quatro documentos acadêmicos ficam parados.

### Sirlande — o domínio

| Spec | Por quê |
|---|---|
| **SPEC-04** — Módulo de Consumo | 45 commits em controllers e 13 em models: é quem mais escreveu regra de negócio. A Spec tem migração de dados financeiros (T-04.2) e o acoplamento `Payment ↔ Account` (T-04.4), que é a tarefa de maior risco do projeto |
| **SPEC-07** — Tarifas por período | Mesmo tipo de trabalho: modelagem, precedência de regra, dinheiro. E o motor de cálculo (T-07.3) precisa da mesma cabeça que fez o `bill` |

**Primeira tarefa:** T-04.1 — `Account` + `AccountItem` + CRUD. É o que destrava a comanda no frontend.

**Ordem obrigatória:** SPEC-04 inteira antes da SPEC-07. A T-04.3 é ponto de parada seguro — se o prazo apertar, para ali.

### Weslley — infraestrutura, integrações e documentação

| Spec | Por quê |
|---|---|
| **SPEC-02** — Cloud, IaC e Observabilidade | Único do time com histórico em `docker/kubernetes` e `docker-compose.yml` |
| **SPEC-03** — Integrações externas | ViaCEP é pequena e fecha sozinha um critério 🔴 do Termo. Bom primeiro entregável |
| **SPEC_DOC** — Documentação acadêmica | Escreveu o Documento 02; conhece o formato e o que a coordenação espera |
| **T-06.4** — `docker-compose.yml` de contingência | Movida da SPEC-06 para ele: é a área dele, e já escreveu compose neste repositório |

**Primeira tarefa:** T-03.1 — ViaCEP. Fecha um critério de aprovação em poucos dias e dá uma vitória cedo.

**Segunda:** T-02.1 — decidir o serviço de Kubernetes e **estimar custo antes de provisionar**.

> ⚠️ **Regra absoluta do projeto, e ela vale para todo mundo:** permanecer sempre no free-tier. Recurso subiu, recurso desce no fim do uso — `terraform destroy` na hora. Nunca usar o usuário `root` da AWS. Um cluster esquecido ligado gera custo real, e nenhuma prioridade de entrega passa na frente disso.

---

## 5. O problema da SPEC-05

**Ninguém do time tem histórico de frontend.** As telas atuais foram construídas por agente, orquestrado pelo Gabriel. E a SPEC-05 v2.0 tem 12 tarefas e ~35 dias — é a maior frente do projeto, sozinha equivalente a um dev inteiro.

Três caminhos, e minha recomendação:

| Caminho | Avaliação |
|---|---|
| **Dividir entre os três** | ❌ Pior opção. Três pessoas sem prática de React, aprendendo em paralelo, no arquivo mais compartilhado do projeto |
| **Agente dedicado, Gabriel orquestra e revisa** | ✅ **Recomendado.** É como as telas existentes foram feitas. O dono humano continua respondendo pelo resultado, e o portão de QA não muda |
| **Um dev assume integralmente** | Viável só se alguém quiser aprender frontend e aceitar que a Spec dele encolha na mesma proporção |

**Corte planejado:** T-05.9 a T-05.12 (governança, ficha do hóspede, fechamento de caixa, busca global — ~9,5 dias) vêm **depois** do fluxo de recepção e podem ser cortadas inteiras sem quebrar nada. Foi por isso que ficaram no fim.

---

## 6. As quatro primeiras semanas

```
        Gabriel                Sirlande               Weslley
S1      T-01.1 recorte         T-04.1 Account         T-03.1 ViaCEP
        T-06.9 webhook 🔴      + AccountItem          T-02.1 decidir k8s
S2      T-01.2 comunicação     T-04.2 migração ⚠      T-03.2 Mercado Pago
        T-01.3 auth interna    (dado financeiro)      T-06.4 compose
S3      T-01.4 extrair         T-04.3 bill da conta   T-02.2 Terraform base
        analytics-service      ✅ parada segura        SPEC_DOC E-02
S4      T-01.5 CI por serviço  T-04.4 Payment ↔       T-02.3 portar k8s
                               Account 🔴 isolada      SPEC_DOC ADRs
```

Duas observações sobre esta grade:

**A T-06.9 do Gabriel na semana 1 não é opcional.** O webhook PIX aceita qualquer notificação sem assinatura: quem descobrir a URL confirma reserva sem pagar. É a única vulnerabilidade explorável hoje.

**A T-04.4 do Sirlande na semana 4 vai em branch isolada, nada mais junto.** É a tarefa que pode quebrar o fluxo PIX, e `public-booking.test.js` é o critério de aceite.

---

## 7. Regras de convivência

Três pessoas e agentes no mesmo repositório exigem disciplina de fronteira.

| Regra | Por quê |
|---|---|
| Cada dev em sua **worktree**, com `.git` compartilhado | Já resolveu o problema de clone defasado que nos custou um diagnóstico errado |
| Branch sempre a partir de `origin/develop`, nunca de `develop` local | `develop` está no working tree da raiz |
| `git add` **arquivo por arquivo** — nunca `git add .` | Convenção do projeto |
| Nenhum merge em `develop` sem relatório do `qa-redteam` em `docs/qa/` | Portão obrigatório; ninguém audita o próprio código |
| Commit **e push** no fim de cada sessão | Já temos 4 branches e 8 commits existindo em uma única máquina |
| Relatório de sessão em `docs/historico_sessao/<seu-nome>/` | O próximo a pegar a frente precisa saber onde parou |
| Spec desatualizou? **Atualiza a Spec**, não ignora | A Spec é a fonte autoritativa |

**Fronteiras de arquivo entre as frentes:**

| Área | Dono | Cuidado |
|---|---|---|
| `app/Models/`, `db/schema.sql` | Sirlande (04, 07) | Gabriel encosta na SPEC-01; combinar antes |
| `k8s/`, `terraform/`, `docker-compose.yml`, CI | Weslley | — |
| `frontend/` | agente + Gabriel | — |
| `config/swagger.js` | **todos** | Ponto de colisão mais provável do projeto — avisar no grupo antes de mexer |
| `docs/specs/` | quem executa a Spec | Atualizar o estado da própria tarefa |

---

## 8. Riscos desta divisão

| Risco | Severidade | Mitigação |
|---|---|---|
| SPEC-01 atrasar e travar Weslley e quatro documentos | 🔴 Alto | É a primeira tarefa do Gabriel; T-02.1 e SPEC-03 não dependem dela e ocupam o Weslley enquanto isso |
| Escopo não caber até a defesa | 🔴 Alto | Corte declarado em §5; T-04.3 é parada segura na SPEC-04 |
| `config/swagger.js` virar campo de conflito | Médio | Avisar antes de mexer; a T-06.2 reescreve o arquivo inteiro e deve ser feita por uma pessoa só |
| Sirlande sozinho na migração de dado financeiro (T-04.2) | Médio | Critérios CA-04.2.a a .c exigem contagem antes e depois; revisar em dupla |
| Ninguém dono do frontend | Médio | Agente com Gabriel respondendo pelo resultado |
| Custo de nuvem escapar | 🔴 Alto | Regra absoluta de free-tier; destruir recurso ao fim de cada uso |

---

## 9. O que decidir antes de começar

1. **A SPEC-05 fica com agente?** Se algum dos três quiser assumir frontend, a Spec dele encolhe na mesma proporção — não se acumula.
2. **Quem revisa o quê?** Sugiro cruzado: Sirlande revisa infra do Weslley, Weslley revisa domínio do Sirlande, Gabriel revisa os dois e o `qa-redteam` audita todos.
3. **Cadência de sincronização.** Uma conversa curta por semana com o estado das Specs é suficiente — e `bash scripts/estado.sh` responde metade das perguntas antes de alguém precisar perguntar.
