# Parecer — Docs 05 e 06 (PR #6 do fork)

**Para:** Weslley Lucas
**De:** Gabriel (revisão assistida por IA)
**Data:** 10/10/2026
**PR revisado:** [gabrielreis354/UniFAAT-projeto-experimental-2027-1#6](https://github.com/gabrielreis354/UniFAAT-projeto-experimental-2027-1/pull/6) — commit `c31f7c5`
**Base da conferência:** aceite do projeto experimental (§6.5 e §6.6), templates 05 e 06, Doc 03 v1.2 (entregue — PR #15 do professor mergeado em 09/10), Doc 07 da `main` do fork e o código da `develop` do repositório do hotel.

---

## Resumo

| Documento | Veredito | O que trava o merge |
|---|---|---|
| **05 — Arquitetura em nuvem** | Ajustar antes do merge | 4 inconsistências que quebrariam no primeiro `terraform apply`, e ADR-004/005 ainda não escritas no Doc 07 |
| **06 — C4 Model** | Aprovar com ajustes | Ajustes de coerência com o Doc 03, a ADR-003 e a ADR-006 |

Os dois cobrem o que o professor pede (diagrama de serviços, redes e recursos; C4 em três níveis) e seguem a estrutura do template. A resolução do conflito `t3.small` × free-tier foi bem feita: dois `t3.micro`, sem EKS, sem NAT Gateway e sem ALB.

---

## Doc 05 — Arquitetura em nuvem

### O que está bom

- Conflito do free-tier resolvido do jeito certo, sem recurso pago.
- RDS em subnet privada, atendendo o CA-02.2.a; uma instância com três *databases* e usuário próprio, preservando o isolamento da ADR-003.
- Troca do MinIO pelo S3 confirmada no código: `@aws-sdk/client-s3` em `services/core-service/database/connections/minio.js`, e a URL assinada de 5 minutos bate com `expiresInSeconds = 300` em `app/utils/uploadToMinIO.js:29`.
- AWS Budgets, IAM sem `root`, ciclo efêmero e o state do Terraform fora do `destroy` (no `bootstrap/`).
- Redis retirado, com justificativa correta: nenhum código o chama.

### 🟠 Corrigir antes do merge

#### 1. ECR destruído a cada sessão e CI sem acesso ao cluster

- O ECR está no módulo `storage` (§5.1), e o passo 5 do ciclo (§5.1) diz que o `destroy` remove tudo, menos o `bootstrap/`. As imagens somem a cada sessão, e o CI faria *push* para repositórios que não existem enquanto a infra está desligada.
- A §3.7 diz que o pipeline faz "*deploy* no cluster". Isso conflita com a §4.2, onde a porta 6443 só aceita o IP da equipe (`/32`), e com o fato de o cluster ficar desligado a maior parte do tempo.

**Correção sugerida:**
- mover os repositórios ECR para o `bootstrap/`, com *lifecycle policy* guardando só as 1 ou 2 últimas imagens por serviço, para ficar abaixo dos 500 MB gratuitos;
- o CI faz só *build* e *push*; o *deploy* acontece no passo 3 do ciclo, a partir da máquina da equipe.

#### 2. Porta 443 declarada sem estratégia de certificado

- A §2 e a §4.2 abrem 80/443, mas não há ALB (então não há ACM), não há domínio, e o Elastic IP muda a cada sessão.
- O nginx da `develop` só escuta a porta 80 (`infra/k8s/nginx.yaml:21`).
- *Plausível, a confirmar:* o Mercado Pago exige URL HTTPS para o *webhook* de notificação.

**Correção sugerida:** escolher uma das opções e deixar escrito:
- hostname derivado do IP (sslip.io ou nip.io) com certificado Let's Encrypt (cert-manager ou certbot), sem custo; ou
- declarar só HTTP no ambiente efêmero e retirar o 443.

Registrar também que a URL do *webhook* muda a cada sessão (o `notification_url` vai por cobrança, então isso é configuração).

#### 3. Não está demonstrado que cabe em 1 GiB por nó

- O nó *server* roda o *control plane* do k3s (a documentação do k3s recomenda 2 GB para o *server*), mais nginx, core-service e b2b-service.
- O k3s instala o Traefik e o ServiceLB por padrão. O Traefik disputa a porta 80 com o nginx e consome memória.
- Os `requests` somam ~800 Mi só de aplicação, antes do sistema operacional e do k3s. O *scheduler* pode deixar pods em `Pending`.

**Correção sugerida:**
- instalar o k3s com `--disable traefik` (e avaliar `--disable servicelb`);
- criar um *swapfile* no *user-data*;
- escrever que a capacidade será medida no primeiro `apply`, e que pod em `Pending` se resolve tirando réplicas ou a observabilidade, **nunca** aumentando o tipo da instância.

#### 4. Elegibilidade da `t3.micro` em `sa-east-1` depende do tipo de conta

- **Conta antiga:** o free-tier de 750 h cobre a `t2.micro`. A `t3.micro` só entra nas regiões sem `t2.micro`, e São Paulo tem `t2.micro`. A `t3.micro` pode ser cobrada.
- **Conta criada a partir de 15/07/2025:** o modelo é de créditos por 6 meses, e a `t3.micro` é elegível.
- A §6 já manda conferir no console, mas a tabela de custo apresenta o modelo das 750 h como fato.

**Correção sugerida:** citar os dois modelos na §6 e a regra de decisão: se a conta for do modelo antigo, usar `t2.micro` (mesma 1 GiB de memória).

#### 5. ADR-004 e ADR-005 citadas como registradas, mas ainda são template

- A §1 ("Decisões de referência") diz que as decisões estão "registradas no Documento 07".
- No Doc 07 da `main` do fork, a ADR-004 e a ADR-005 ainda têm o texto do modelo (ECS Fargate de exemplo, "[Nomes]", data em branco). O mesmo vale para a ADR-001 e a ADR-002, e a ADR-006 é proposta aprovada, não transcrita.

**Correção sugerida:** escrever a ADR-004 (k3s em dois EC2 `t3.micro`, EKS rejeitado pelo custo do *control plane*) e a ADR-005 (Docker + k3s, Compose de contingência) no Doc 07 antes de os documentos chegarem ao professor. Até lá, trocar "registradas" por "tomadas, a registrar no Documento 07".

### 🟡 Menores

- **IPv4 público (§6):** a tabela conta "até 120 h", mas são dois nós com IP público, ou seja, até 240 h. Continua dentro das 750 h.
- **EBS no limite:** 2 × 15 GB = 30 GB, exatamente o limite gratuito. Qualquer volume a mais é cobrado.
- **`destroy` limpo:** prever `skip_final_snapshot = true` e `backup_retention_period = 0` no RDS, e `force_destroy = true` no bucket de PDFs. Sem isso, o `destroy` falha (bucket não vazio) ou deixa *snapshot* cobrado.
- **Dados efêmeros:** dizer explicitamente que banco e PDFs são apagados a cada `destroy` e que o `seed` recria o estado de demonstração.
- **Credenciais do S3 (*plausível*):** a §3 diz que trocar o MinIO pelo S3 é "só configuração". Com o *instance profile* do módulo `iam`, o código precisa aceitar a cadeia padrão de credenciais da AWS; hoje ele lê `MINIO_*` fixas. Conferir antes de afirmar.

---

## Doc 06 — C4 Model

### O que está bom

- Três níveis completos, com um diagrama de componentes por serviço.
- Nomes iguais aos do Doc 03 v1.2 (Hóspede, PSP, ViaCEP, D-001 a D-005), e a divisão do Operador do Hotel nos três papéis está justificada.
- Sem Auth Service, coerente com a ADR-006; *outbox*, consumidor idempotente com DLQ e anonimização LGPD nas projeções.
- `app-booking` e `app-admin` declarados fora do escopo.
- Boa decisão trocar a sintaxe C4 nativa do Mermaid por `graph` com as cores do C4.

### 🟠 Ajustes

#### 1. "A única diferença com o DFD é proposital" — não é a única

- O Doc 03 v1.2 (§7, D-005, e a nota de rastreabilidade da linha 26) diz que o PDF de orçamento **não** é armazenado.
- Os Docs 05 e 06 dizem que D-005 guarda "PDFs de contrato e de orçamento".
- Os Docs 05 e 06 estão certos em relação ao código (PR #92, RNF-023) e ao Doc 02; o próprio Doc 03 registra a divergência como pendência.

**Correção sugerida:** na §1, citar esta segunda diferença e apontar para a nota de rastreabilidade do Doc 03. Os dois documentos precisam chegar coerentes ao professor.

#### 2. Rota interna b2b → core (ADR-003 e ADR-006) não aparece

- No Nível 3 do core-service, o `b2b-service` entra direto em "Hospedagem e Reservas".
- A ADR-003 define rotas internas, **não publicadas pelo nginx**, para criar e cancelar a reserva-bloco; a ADR-006 protege essas rotas com o `X-Internal-Token`.

**Correção sugerida:** criar o componente "Rotas internas" (verificação do `X-Internal-Token`) entre o `b2b-service` e "Hospedagem e Reservas", e incluir a rota interna no resumo da ADR-006 na §1.

#### 3. §5 — alternativas incompletas

- As linhas 1, 2 e 6 estão com alternativas "—". O template pede alternativas consideradas.
- A linha 3 cita "monólito modular", que não está entre as alternativas da ADR-003. As que constam lá são: recorte por tipo de dado (proposta de 23/08), banco compartilhado entre serviços, indicadores lendo réplica do núcleo, Redis Streams, Amazon SQS e gRPC.

**Correção sugerida:** preencher as alternativas (para a ADR-001, por exemplo, NestJS, Spring, Go, FastAPI) e trocar "monólito modular" por "banco compartilhado entre serviços".

### 🟡 Menores

- **Nível 3 do core:** o *webhook* do PSP não chega a "Pagamentos e PIX", e "Pagamentos e PIX" não grava no D-001 nem no *outbox* (o catálogo de eventos prevê `payment.status_changed`). "Autenticação" e "Consumo" também não têm relação com o banco.
- **Download por URL assinada:** falta a seta `app-pms → D-005` ("Baixa PDF por URL assinada [HTTPS]") no Nível 2. O Doc 03 tem esse fluxo.
- **Sigla "ADR":** usada para diária média (§4.3, nas linhas do diagrama e da tabela) num documento que também fala de ADRs. Escrever "diária média".
- **Porta do nginx (80/443):** depende da decisão do item 2 do Doc 05.

---

## Próximos passos

1. Weslley aplica os ajustes no PR #6 do fork.
2. Weslley escreve ADR-004 e ADR-005 no Doc 07 (e, quando for a vez do Doc 07, ADR-001, ADR-002 e a transcrição da ADR-006).
3. Sirlande registra a correção da §7 (D-005) do Doc 03 para o PDF de orçamento, que já está em `docs/sugestoes-documentos-oficiais/03-dfd/MOTIVOS.md`.
4. Nenhum `terraform apply` antes de conferir em **Billing → Free Tier**, com usuário IAM, o tipo de instância elegível para a conta (item 4 do Doc 05).
