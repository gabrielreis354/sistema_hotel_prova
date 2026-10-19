# Documento 05 — Insumos para o Desenho de Arquitetura em Nuvem

**Documento oficial:** `Projetos/gesway/05-arquitetura-nuvem.md` — hoje idêntico ao template
**Dono:** **Weslley Lucas**
**Data:** 28/09/2026 · **Preparado por:** Gabriel Reis Cunha
**Entrega:** 5º encontro, pela tabela do README do professor

---

## O que é este arquivo

Tudo o que o repositório já mostra sobre a arquitetura em nuvem do Gesway, organizado nas
seções que o template pede — **para você produzir o documento**. Não há diagrama pronto aqui:
o documento é seu.

Ele segue o mesmo formato do `03-dfd/INSUMOS.md`, que o Sirlande usou para escrever o Doc 03.
Cada fato aponta o arquivo onde está, para você conferir antes de escrever. Os caminhos valem
para a branch **`develop`** do repositório do hotel.

**A decisão central já é sua.** Em 16/09 você decidiu **AWS, com k3s num EC2 single-node**, e
deixou o insumo do ADR-004 pronto em
`docs/historico_sessao/weslley/viacep_e_decisao_k8s_16set2026.md`. Este arquivo parte dessa
decisão — não a revisita, exceto no ponto da seção 1.

---

## 1. ⚠️ Um conflito com a regra absoluta de custo — resolver antes de escrever

A sua análise de 16/09 prevê duas fases:

| Fase | Instância | Situação que você registrou |
|---|---|---|
| Só `core-service` | `t3.micro` | free-tier |
| Depois de RabbitMQ e observabilidade | `t3.small` | **fora do free-tier**, mitigado por subir e destruir a cada sessão |

A regra absoluta do projeto não admite a segunda fase como está escrita:

> **Sempre permanecer no FREE-TIER da AWS.** NUNCA provisionar recursos fora do free-tier.
> Nenhum pedido do usuário sobrepõe esta regra.

O ciclo efêmero reduz o custo a centavos, mas continua sendo recurso fora do free-tier — e a
regra não tem exceção por valor. Como o Doc 05 vai descrever o alvo, **o alvo precisa caber na
regra**. Três caminhos, que você avalia:

**a) Confirmar a elegibilidade no console.** As regras do free-tier da AWS mudaram em julho de
2025 para contas novas, e a lista de instâncias elegíveis depende do plano em que a conta está.
Antes de qualquer decisão, abra **Billing → Free Tier** no console, com o usuário IAM — nunca o
`root` — e confira se `t3.small` é elegível para a conta de vocês. Se for, o conflito some. Não
decida isso por suposição: confira.

**b) Dois `t3.micro` em vez de um `t3.small`.** O k3s roda em mais de um nó — um *server* e um
*agent*. São 2 GiB no total, com instâncias elegíveis. No free-tier clássico, as 750 horas
mensais são somadas entre as instâncias: duas máquinas ligadas 4 horas por sessão consomem 8
horas, o que dá folga para dezenas de sessões por mês. Como o plano da conta pode ser outro,
confirme essa regra no mesmo painel do item (a).

**c) Reduzir o que roda no nó.** Ver seção 2.2 — há memória para recuperar.

O que **não** está disponível é pedir exceção: a regra não admite.

---

## 2. O que existe hoje — ponto de partida

### 2.1 Os manifests (`infra/k8s/`)

| Arquivo | Recursos | Requests | Observação |
|---|---|---|---|
| `backend.yaml` | Deployment + Service `:3000` | 100m / 128Mi **por réplica** | **3 réplicas** — ajuste de minikube; sua análise já prevê 1 em nó único |
| `nginx.yaml` | Deployment + Service `:80` + ConfigMap | 50m / 64Mi | Único ponto de entrada. `location /` → `backend_pool` |
| `postgres.yaml` | StatefulSet + Service `:5432` + PVC | 250m / 256Mi (limite 1Gi) | `postgres:17` |
| `rabbitmq.yaml` | StatefulSet + Service `:5672` / `:15672` + PVC | 100m / 128Mi | Provisionado **sem** produtor nem consumidor ainda (T-01.4) |
| `minio.yaml` | StatefulSet + Service `:9000` / `:9001` + PVC | 100m / 128Mi | PDFs de contrato |
| `redis.yaml` | Deployment + Service `:6379` + PVC | 50m / 64Mi | **Nenhuma linha de código usa** |
| `networkpolicy.yaml` | 5 NetworkPolicy | — | Quem fala com quem dentro do cluster |
| `configmap.yaml`, `secret.yaml`, `namespace.yaml`, `pdb.yaml`, `kustomization.yaml` | — | — | Configuração |

### 2.2 A conta de memória

Os seus 896Mi de 16/09 batem com a soma de hoje: backend ×3 (384) + minio (128) + nginx (64) +
postgres (256) + redis (64). Com o RabbitMQ que entrou depois, **~1 GiB só de requests** —
todo o `t3.micro`, antes do overhead do próprio k3s.

O que dá para recuperar sem mudar o sistema:

| Ação | Libera | Por quê é seguro |
|---|---|---|
| Backend com 1 réplica | 256Mi | Nó único de 1 vCPU; você mesmo já previu |
| Remover o Redis | 64Mi | Nenhum código usa. O Doc 03 também não o desenha |
| Postgres fora do nó (ver 3.2) | 256Mi | E ainda resolve o CA-02.2.a |

---

## 3. Seções do template → o que o Gesway tem

O template usa AWS com ECS Fargate como exemplo. O Gesway é AWS com **k3s em EC2** — adapte
cada seção a isso, como o próprio template instrui.

### 3.1 Computação

| Recurso | O que é no Gesway | Onde conferir |
|---|---|---|
| Nó(s) do cluster | EC2 com k3s — tamanho conforme a seção 1 | Sua análise de 16/09 |
| Pods de aplicação | `nginx`, `core-service`; depois `b2b-service` e `analytics-service` | ADR-003 (Doc 07); `infra/k8s/` |

**Não use "Auth Service" como no template.** No Gesway a autenticação vive no `core-service`,
que é o único emissor de token — a ADR-006, em proposta no PR #84, explica por quê.

### 3.2 Banco de dados — **duas decisões em aberto**

**Onde roda o PostgreSQL.** Hoje é um StatefulSet no próprio nó. Mas a SPEC-02, que é sua,
pede no **CA-02.2.a**: *"VPC com subnets pública e privada; banco em subnet privada"*. Um
Postgres dentro de um nó único com IP público não atende. As opções:

| Opção | A favor | Contra |
|---|---|---|
| **RDS PostgreSQL** em subnet privada | Atende o CA-02.2.a; libera 256Mi do nó; o RDS tem free-tier próprio | Mais um recurso no Terraform; **conferir no console** a elegibilidade e a disponibilidade da extensão `btree_gist`, que a constraint anti-*double-booking* (`EXCLUDE USING gist`) exige |
| Postgres no cluster, como hoje | Zero mudança | Não atende o CA-02.2.a como está escrito; consome o nó |

**Quantos bancos.** A ADR-003 dá a cada serviço um *"PostgreSQL próprio"*. No free-tier, três
instâncias não cabem. O padrão usual é **uma instância, três databases, três usuários** — cada
serviço só alcança o seu database. Isso preserva o isolamento que a ADR-003 decidiu no nível
lógico. Se for esse o caminho, o Doc 05 precisa dizer explicitamente, para não parecer que
contradiz a ADR-003.

**Cache:** o template pede. O Gesway não tem cache em uso — o Redis dos manifests não é
chamado por nenhum código. Deixe a linha como *"não utilizado"*, com o motivo, ou remova.

### 3.3 Rede

Nada existe ainda na nuvem. A SPEC-02 (T-02.2) pede VPC com subnet pública e privada.
Multi-AZ está **fora do escopo** por custo (SPEC-02 §4.2) — vale dizer isso no documento, como
decisão consciente.

### 3.4 Mensageria

**RabbitMQ**, não SQS/SNS como no exemplo do template. A ADR-003 escolheu o RabbitMQ e
**rejeitou explicitamente** o SQS e o Redis Streams nas alternativas. No Doc 05, basta citar a
ADR-003 como fundamento.

Hoje: `rabbitmq:4-management-alpine`, provisionado em `infra/k8s/rabbitmq.yaml` e no compose,
sem produtor nem consumidor — isso chega com a T-01.4.

### 3.5 Armazenamento de objetos

Hoje é **MinIO** no cluster. Na nuvem, o par natural é o **S3** — e há um fato que facilita a
decisão: o código **já usa o SDK do S3** (`@aws-sdk/client-s3` em
`services/core-service/app/utils/uploadToMinIO.js`). O MinIO é compatível com S3; trocar é
configuração (`MINIO_ENDPOINT` e credenciais), não código.

Guarda: PDF de contrato hoje, e PDF de orçamento depois da etapa D da rodada 2 do Gabriel
(RNF-023). O bucket é privado e o download sai por URL assinada de 5 minutos.

### 3.6 Monitoramento

**Prometheus + Grafana são obrigatórios** pelo Termo de Aceite, e estão na sua T-02.4 — não
iniciada. Hoje a aplicação não expõe `/metrics`. No documento, descreva o alvo; o
acompanhamento fica com o Doc 08.

### 3.7 CI/CD e registry

- **GitHub Actions:** existe — `.github/workflows/ci.yml` roda checagens e testes com cobertura.
  **Só CI, sem deploy** — é por isso que o critério 9 da conformidade está parcial
- **Registry:** a SPEC-02 pede **ECR** (CA-02.2.c). Confira no console o limite de
  armazenamento do free-tier para ECR privado

---

## 4. Rede e segurança — ponto de partida para a tabela do §4.2 do template

O que precisa entrar e sair, pelo que o sistema faz hoje:

| Porta | De | Para | Por quê |
|---|---|---|---|
| 80 / 443 | internet | nó (nginx) | Única entrada pública. Operador, hóspede e o *webhook* do PSP entram por aqui |
| 22 | IP da equipe, apenas | nó | Administração. Nunca `0.0.0.0/0` |
| 6443 | IP da equipe, apenas | nó | API do k3s, para o `kubectl` |
| 5432 | só o grupo de segurança do nó | RDS | Apenas se o Postgres sair do nó |
| saída 443 | nó | internet | ViaCEP, PSP e o *pull* de imagens |

Dentro do cluster, as 5 `NetworkPolicy` de `infra/k8s/networkpolicy.yaml` já restringem quem
fala com quem.

A rota `/webhooks/pix` é pública por natureza — o PSP precisa alcançá-la —, e está protegida
por assinatura HMAC desde a T-06.9 (PR #81).

---

## 5. Terraform

Não existe nenhum arquivo `.tf` no repositório. Os critérios estão na sua T-02.2 (CA-02.2.a a
f). Para o Doc 05, o que importa descrever é a organização alvo: módulos, onde fica o *state*
compartilhado entre a equipe, e o ciclo `apply` no início da sessão e `destroy` ao final.

---

## 6. Uma recomendação de forma

O Sirlande resolveu no Doc 03 v1.2 um problema que você vai ter aqui: o Doc 05 depende de
decisões que só serão **entregues** no Doc 07 (ADR-003, ADR-004), que vem depois pela ordem
numérica. A solução dele foi uma **"Decisão de referência"** — trazer para dentro do próprio
documento o que ele precisa da decisão, citando a ADR sem depender dela. Funciona igual aqui.

**O Doc 05 é normativo**, como o 02 e o 03: descreve a arquitetura-alvo, não o que já está
construído. O acompanhamento de execução é do Doc 08. Não marque status nos recursos.

---

## 7. Fora do diagrama — não desenhar

| Item | Por quê |
|---|---|
| EKS | Descartado por você em 16/09: control plane cobrado mesmo parado |
| Redis | Provisionado, sem uso no código |
| Multi-AZ, multirregião | Fora do escopo por custo — SPEC-02 §4.2 |
| CDN, WAF, DNS gerenciado, Alertmanager | Fora do escopo — SPEC-02 §4.2 |
| Notificação ao hóspede, *channel manager* | Evolução prevista na ADR-003, fora do escopo |
