# SPEC-02 — Cloud, Infraestrutura como Código e Observabilidade

**Prioridade:** 🔴 Crítica — três critérios de aprovação
**Estado:** 🔲 Não iniciado
**Criado em:** 26/08/2026
**Depende de:** SPEC-01 (para o recorte de serviços) — parcialmente

---

## 1. Contexto

Três exigências do Termo de Aceite, hoje **todas não atendidas**:

> *"O deploy da aplicação deve ser realizado em provedores de nuvem de grande porte (AWS, GCP ou Azure)."*
> *"Todo o provisionamento da infraestrutura na nuvem deverá ser automatizado utilizando **Terraform**. ClickOps resultará em penalidade."*
> *"A aplicação deve estar instrumentada com **Prometheus** e **Grafana** [...] A stack de monitoramento deve estar funcional e acessível no momento da defesa."*

**Estado verificado em 26/08:**

| Item | Evidência |
|------|-----------|
| Nuvem | Tudo em **minikube local**. Nenhuma conta AWS/GCP/Azure em uso |
| Terraform | `find . -iname "*.tf"` → **nenhum arquivo** no repositório |
| Prometheus/Grafana | `grep -ril` em `k8s/` → **nenhuma ocorrência**. Só aparecem em documentos de análise |

**Decisão da equipe (23/08):** provedor **AWS** — a equipe está aprendendo AWS.

---

## 2. Objetivo

Ter a aplicação rodando em nuvem pública AWS, com toda a infraestrutura provisionada por Terraform e monitoramento operacional acessível.

---

## 3. Restrição inviolável — custo

> ⚠️ **Regra absoluta do projeto:** permanecer **sempre no free-tier da AWS**. Recursos devem ser **destruídos imediatamente após o uso** (`terraform destroy`). Nunca usar o usuário `root` da AWS — apenas usuário IAM com menor privilégio.

Isso não é preferência: é regra operacional que **prevalece sobre qualquer outra prioridade** desta Spec. Um cluster EKS esquecido ligado gera custo real.

**Consequência de desenho:** a infraestrutura precisa ser **descartável e reconstruível em minutos**. Isso favorece Terraform bem estruturado — e é, na prática, um argumento a favor da própria exigência acadêmica.

---

## 4. Escopo

### 4.1 Dentro do escopo

- Módulos Terraform para: rede (VPC, subnets), cluster Kubernetes gerenciado, IAM mínimo, *registry* de imagens
- *State* do Terraform versionado e compartilhável entre a equipe
- Portar os manifests `k8s/` existentes para o cluster em nuvem
- Stack Prometheus + Grafana no cluster
- Instrumentação `/metrics` na aplicação
- Dashboard Grafana com métricas operacionais
- Job de *deploy* automatizado no CI

### 4.2 Fora do escopo

- Alta disponibilidade multi-AZ ou multi-região — custo fora do free-tier
- *Autoscaling* dinâmico
- Alertmanager com notificação externa (e-mail, Slack)
- CDN, WAF, DNS gerenciado
- Backup automatizado do banco — mencionar como decisão consciente na defesa

---

## 5. Tarefas

### T-02.1 — Decidir o serviço de Kubernetes e dimensionar 🔲

**Critérios de aceitação**
- [ ] **CA-02.1.a** — Serviço escolhido com justificativa de custo (EKS, ou alternativa mais barata como EC2 + k3s)
- [ ] **CA-02.1.b** — Estimativa de custo mensal documentada, confirmando aderência ao free-tier ou aos créditos disponíveis
- [ ] **CA-02.1.c** — Estratégia de ciclo de vida definida: quando sobe, quando destrói
- [ ] **CA-02.1.d** — Decisão registrada como **ADR-004**

> **Alerta de custo:** o EKS cobra **US$ 0,10/hora pelo control plane**, mesmo sem carga — cerca de US$ 73/mês se ficar ligado, e **não é coberto pelo free-tier**. Se não houver créditos acadêmicos, avaliar `k3s` em uma instância EC2 `t3.micro` (essa sim, dentro do free-tier). Esta decisão precisa ser tomada com o custo na mesa, antes de qualquer `terraform apply`.

---

### T-02.2 — Módulos Terraform de infraestrutura base 🔲

**DEP:** T-02.1

**Critérios de aceitação**
- [ ] **CA-02.2.a** — VPC com subnets pública e privada; banco em subnet privada
- [ ] **CA-02.2.b** — Cluster Kubernetes provisionado via Terraform
- [ ] **CA-02.2.c** — *Registry* de imagens (ECR) provisionado
- [ ] **CA-02.2.d** — Usuário/role IAM com menor privilégio; **nenhum uso de root**
- [ ] **CA-02.2.e** — `terraform plan` limpo e `terraform apply` idempotente
- [ ] **CA-02.2.f** — `terraform destroy` remove **tudo**, sem recurso órfão
- [ ] **CA-02.2.g** — Nenhum segredo versionado; variáveis sensíveis fora do Git

---

### T-02.3 — Portar os manifests K8s para a nuvem 🔲

**DEP:** T-02.2

Os manifests em `k8s/` (backend, postgres, redis, minio, nginx, networkpolicy, PDB) já existem e funcionam em minikube.

**Critérios de aceitação**
- [ ] **CA-02.3.a** — Aplicação responde por endereço público
- [ ] **CA-02.3.b** — Persistência do banco funcionando com volume da nuvem
- [ ] **CA-02.3.c** — NetworkPolicies preservadas — banco inacessível de fora
- [ ] **CA-02.3.d** — Secrets vindos de mecanismo apropriado, não de arquivo versionado
- [ ] **CA-02.3.e** — `migrate` e `seed` executáveis no ambiente remoto

---

### T-02.4 — Stack de observabilidade 🔲

**DEP:** T-02.3

**Critérios de aceitação**
- [ ] **CA-02.4.a** — Prometheus coletando métricas do cluster e da aplicação
- [ ] **CA-02.4.b** — Grafana acessível, com autenticação
- [ ] **CA-02.4.c** — Aplicação expõe `/metrics` (Express + `prom-client`)
- [ ] **CA-02.4.d** — Métricas de negócio além das técnicas: latência por endpoint, taxa de erro, requisições por tenant
- [ ] **CA-02.4.e** — Dashboard com saúde do sistema, pronto para demonstração
- [ ] **CA-02.4.f** — Manifests versionados em `k8s/`

> **Nota de sequência:** subir a observabilidade **antes** do split completo de microsserviços. Validar a stack sobre o backend atual é mais simples, e cada serviço novo só precisa passar a expor `/metrics`.

---

### T-02.5 — Deploy automatizado no CI 🔲

**DEP:** T-02.3 · integra com SPEC-01 T-01.5

**Critérios de aceitação**
- [ ] **CA-02.5.a** — *Push* em `main` dispara build, publicação no ECR e *deploy* no cluster
- [ ] **CA-02.5.b** — Credenciais AWS via *secrets* do GitHub, nunca no código
- [ ] **CA-02.5.c** — *Deploy* só ocorre se testes e portão de cobertura passarem
- [ ] **CA-02.5.d** — Procedimento de *rollback* documentado

---

## 6. Definition of Done

- [ ] Aplicação acessível publicamente na AWS
- [ ] Infraestrutura inteira reconstruível via `terraform apply` a partir do zero
- [ ] `terraform destroy` sem deixar recurso ativo
- [ ] Grafana com dashboard funcional
- [ ] CI fazendo deploy automatizado
- [ ] Custo verificado dentro do free-tier ou dos créditos

---

## 7. Riscos

| Risco | Impacto | Mitigação |
|-------|---------|-----------|
| **Custo estourar o free-tier** | 🔴 Violação de regra absoluta | T-02.1 exige estimativa antes de provisionar; destruir após cada uso |
| Cluster esquecido ligado | 🔴 Custo real | Rotina de `terraform destroy` ao fim de cada sessão; verificação explícita |
| EKS caro demais para o orçamento | Alto | Avaliar k3s em EC2 na T-02.1 |
| Ambiente fora do ar no dia da defesa | 🔴 Nota | Termo permite Docker Compose como contingência — ver SPEC-06 T-06.4 |
| Equipe sem experiência em Terraform | Médio | Começar por VPC + EC2 simples antes do cluster |

---

## 8. Histórico

| Versão | Data | Autor | Alteração |
|--------|------|-------|-----------|
| 1.0 | 26/08/2026 | Gabriel Reis Cunha | Criação |
