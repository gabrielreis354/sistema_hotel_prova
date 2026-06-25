# Relatório de Sessão — Segurança do Banco de Dados

**Dev:** Sirlande
**Data:** 20/06/2026
**Branch:** `fix/db-security-20jun2026`
**Tipo:** Security Fix + Análise de Isolamento de Banco

---

## 1. Objetivo da Sessão

Verificar as pendências abertas da sessão anterior (18/06) e corrigir as que são de responsabilidade do banco de dados. Mapear o isolamento atual do PostgreSQL nos dois ambientes (Docker Compose e Kubernetes) e documentar sugestões para o Weslley sobre o que ainda pode ser melhorado na camada de infra.

---

## 2. Pendências verificadas

| # | Pendência (herdada de 18/06) | Status | Observação |
|---|---|---|---|
| 1 | `.env.test` fora do `.gitignore` | **CORRIGIDA nesta sessão** | Ver seção 3 |
| 2 | Tenant seedado sem `status: ACTIVE` nos testes | **JÁ RESOLVIDA** | `RegisterController` cria tenant com `status: 'ACTIVE'` explicitamente; nenhuma ação necessária |
| 3 | Rotação de credenciais no histórico git | **Fora do escopo de código** | Requer `git filter-branch` ou BFG em coordenação com todos os devs; deve ser tratado como operação de infra |
| 4 | `requireRole('ADMIN')` em PUT/DELETE de pagamentos | **Fora do escopo de Sirlande** | Escopo de rotas/negócio — pendente para Gabriel ou Weslley |
| 5 | `stringData` → `data` (base64) em `k8s/secret.yaml` | **Fora do escopo de Sirlande** | Escopo de infra — pendente para Weslley |

---

## 3. O Que Foi Feito

### Correção: `.env.test` rastreado pelo git

**Problema:** O arquivo `.env.test` estava sendo rastreado pelo git. Este arquivo contém as credenciais reais de banco de dados do ambiente de teste de quem o criou (`POSTGRES_USER`, `POSTGRES_PASSWORD`). Qualquer dev que commitasse uma mudança nesse arquivo exporia suas credenciais de banco no histórico remoto.

**O que não era problema:** O fallback `|| 'hotel_password'` em `globalSetup.js` e `docker-compose.yml` **não foi alterado**. `hotel_password` é uma senha de conveniência para desenvolvimento local, não uma credencial sensível. Removê-la só pioraria a experiência do dev sem ganho de segurança real.

**Correção aplicada:**
1. `.env.test` adicionado ao `.gitignore` — impede rastreamento futuro
2. `git rm --cached .env.test` — remove do índice git sem deletar o arquivo local

**Arquivos modificados:**

| Arquivo | Mudança |
|---|---|
| `.gitignore` | Adicionada linha `.env.test` na seção Environment |
| `.env.test` | Removido do índice git (`git rm --cached`) |

---

## 4. Análise de Isolamento do Banco de Dados

### Docker Compose (ambiente de desenvolvimento)

| Camada | Status | Detalhe |
|---|---|---|
| Exposição de porta | ✅ Seguro | Postgres **sem `ports:`** — inacessível fora do Docker |
| Rede | ✅ Seguro | Bridge isolado `hotel_network` — apenas containers da stack acessam |
| Backend | ✅ Seguro | Node também sem `ports:` — só Nginx é público na porta 80 |

**Conclusão:** O banco de dados é inacessível de fora do Docker Compose por design.

### Kubernetes (produção)

| Camada | Status | Detalhe |
|---|---|---|
| Service type | ✅ Seguro | `type: ClusterIP` — não exposto fora do cluster |
| NetworkPolicy ingress | ✅ Seguro | Allowlist explícita: só pod com `app: backend` acessa a porta 5432 |
| Autenticação PostgreSQL | ✅ Adequado | Imagem padrão usa `scram-sha-256`; conexão sem senha não é aceita |

**Conclusão:** O banco é inacessível externamente. Dentro do cluster, só o backend alcança o postgres.

---

## 5. Sugestões para o Weslley (escopo de infra)

### [MÉDIA] NetworkPolicy default-deny no namespace

**Situação atual:** Existe NetworkPolicy restringindo *quem entra* no postgres, mas não há política de negação padrão no namespace `hotel-system`. Por padrão o Kubernetes permite todo tráfego entre pods se não existe uma policy de deny-all explícita.

**Risco:** Se um pod for comprometido, ele pode alcançar livremente outros pods do namespace (exceto o postgres, que já tem allowlist).

**Sugestão:** Adicionar uma NetworkPolicy `default-deny-all` no namespace `hotel-system`:

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: default-deny-all
  namespace: hotel-system
spec:
  podSelector: {}
  policyTypes:
    - Ingress
    - Egress
```

Esta policy nega todo tráfego por padrão. As NetworkPolicies específicas existentes (backend ← nginx, postgres ← backend, redis ← backend) continuam funcionando como exceções.

**Atenção:** Após adicionar default-deny, verificar se o DNS interno do cluster continua funcionando (pode precisar liberar Egress para o namespace `kube-dns` na porta 53).

### [BAIXA] `stringData` → `data` em `k8s/secret.yaml`

**Situação atual:** `stringData` armazena valores em texto legível no etcd (base de dados interna do K8s). `data` usa base64.

**Observação:** Base64 não é criptografia — é apenas encoding. O ganho real é que ferramentas de observabilidade e logs não exibem o valor diretamente. Em clusters de produção reais, o ideal é usar um secret manager externo (AWS Secrets Manager, Vault), mas para o TCC a troca de `stringData` para `data` já é uma melhoria válida.

---

## 6. Commits Gerados

| Hash | Mensagem |
|------|----------|
| `3b5b36e` | `fix(db): remover .env.test do rastreamento git e atualizar .gitignore` |
| `6b21010` | `docs(historico): relatorio seguranca banco 20jun2026 (Sirlande)` |

---

## 7. Pendências para o Próximo Dev

| # | Pendência | Prioridade | Observação |
|---|---|---|---|
| 1 | NetworkPolicy default-deny no namespace `hotel-system` | 🟡 Média | Ver seção 5 — escopo Weslley |
| 2 | `stringData` → `data` em `k8s/secret.yaml` | 🟢 Baixa | Ver seção 5 — escopo Weslley |
| 3 | `requireRole('ADMIN')` em PUT e DELETE de `/payments/:id` | 🟡 Média | Qualquer RECEPTIONIST pode alterar/excluir pagamentos — escopo Gabriel/Weslley |
| 4 | Rotação de credenciais no histórico git público | 🟡 Média | `hotel_password` e `pms_hotel_secreto_academico_2026` em commits antigos — requer coordenação entre todos os devs |

---

*Relatório: Sirlande — sessão 20/06/2026*
