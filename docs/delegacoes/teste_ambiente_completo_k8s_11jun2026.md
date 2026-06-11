# Delegação — Teste de Ambiente Completo (Kubernetes)
**Data:** 11/06/2026
**Orquestrador:** Gabriel
**Para:** Agente de testes (janela Claude Code)
**Depende de:** `docs/delegacoes/fixes_k8s_e_produto_11jun2026.md` estar com Status ✅ Concluído
**Status:** 🔴 Pendente

---

## Instruções iniciais

1. Leia `CLAUDE.md` na raiz do projeto
2. Verifique que `docs/delegacoes/fixes_k8s_e_produto_11jun2026.md` está com **Status: ✅ Concluído**
   — se ainda estiver 🔴 Pendente, interrompa e avise o orquestrador
3. Execute as fases abaixo **em ordem**
4. Registre cada resultado (✅ passou / ❌ falhou) na seção de resultados ao final do arquivo
5. Ao terminar: commit do relatório + push

---

## FASE 1 — Subir o ambiente Kubernetes

### 1.1 Verificar pré-requisitos

```bash
minikube version      # precisa estar instalado
kubectl version       # precisa estar instalado
docker version        # precisa estar rodando
```

Se algum falhar, registre como bloqueador no relatório e interrompa.

### 1.2 Iniciar Minikube

```bash
minikube start --driver=docker
minikube status
```

Esperado: `host: Running`, `kubelet: Running`, `apiserver: Running`

### 1.3 Build da imagem do backend

Execute na raiz do projeto:

```bash
docker build -t sistema-gestao-hotel-backend:latest .
```

Esperado: `Successfully built ...` e `Successfully tagged sistema-gestao-hotel-backend:latest`

### 1.4 Carregar imagem no Minikube

```bash
minikube image load sistema-gestao-hotel-backend:latest
```

> Necessário porque `imagePullPolicy: IfNotPresent` — K8s usa a imagem local do nó.

### 1.5 Aplicar os manifests

```bash
kubectl apply -k k8s
```

Esperado: todos os recursos criados/configured sem erros.

### 1.6 Aguardar pods ficarem Ready

```bash
kubectl get pods -n hotel-system -w
```

Aguarde até todos os pods mostrarem `Running` e `READY` (pode levar 60-90s).
Critério de aceite:
- `postgres-*` → `1/1 Running`
- `backend-*` (3 pods) → `1/1 Running`
- `nginx-*` → `1/1 Running`

Se algum pod travar em `CrashLoopBackOff` ou `Pending`, rode:
```bash
kubectl describe pod <pod-name> -n hotel-system
kubectl logs <pod-name> -n hotel-system
```
Registre o erro e interrompa.

### 1.7 Obter URL base

```bash
# Opção A — port-forward em background (mais simples)
kubectl port-forward svc/nginx 8080:80 -n hotel-system &
export BASE_URL="http://localhost:8080"

# Opção B — Minikube service URL
# export BASE_URL=$(minikube service nginx -n hotel-system --url)
```

Salve o `BASE_URL` — será usado em todos os testes abaixo.

---

## FASE 2 — Preparar o banco de dados

### 2.1 Identificar o pod do backend

```bash
export BACKEND_POD=$(kubectl get pods -n hotel-system -l app=backend -o jsonpath='{.items[0].metadata.name}')
echo "Backend pod: $BACKEND_POD"
```

### 2.2 Executar migrations

```bash
kubectl exec -n hotel-system $BACKEND_POD -- node command.js migrate
```

Esperado:
```
✅ Conexão com o banco de dados estabelecida.
✅ Migrations executadas com sucesso. Todas as tabelas estão atualizadas.
```

> Isso aplica os índices únicos compostos (email+tenant_id, cpf+tenant_id)
> e quaisquer alterações de schema feitas pelos Sequelize models.

### 2.3 Verificar health do backend

```bash
curl -s $BASE_URL/health | python3 -m json.tool
```

Esperado:
```json
{
  "status": "OK",
  "timestamp": "...",
  "service": "Sistema de Gestão de Hotel Backend"
}
```

Se retornar HTTP 200 → banco conectado e app rodando. ✅

---

## FASE 3 — Testes de rotas (sequência completa)

> Todas as variáveis exportadas (`JWT`, `ROOM_ID`, etc.) são usadas nos testes seguintes.
> Execute em ordem — cada teste depende do anterior.

---

### T01 — Registro de tenant e usuário admin

```bash
curl -s -X POST $BASE_URL/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "tenantName": "Hotel Teste K8s",
    "name": "Admin Teste",
    "email": "admin@hotelk8s.com",
    "password": "senha123"
  }' | python3 -m json.tool
```

Critérios:
- [ ] HTTP 201
- [ ] Resposta contém `tenant.subdomain` (ex: `"hotel-teste-k8s"`)
- [ ] Resposta contém `user.email`
- [ ] **NÃO** contém `password` ou `password_hash`

Registre o `tenant.id` se aparecer.

---

### T02 — Login e obtenção do JWT

```bash
export JWT=$(curl -s -X POST $BASE_URL/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@hotelk8s.com", "password": "senha123"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")

echo "JWT: $JWT"
```

Critérios:
- [ ] HTTP 200
- [ ] `$JWT` não está vazio
- [ ] Token é um JWT válido (3 partes separadas por `.`)

---

### T03 — Registro duplicado (mesmo email, mesmo tenant)

```bash
curl -s -o /dev/null -w "%{http_code}" -X POST $BASE_URL/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "tenantName": "Hotel Teste K8s",
    "name": "Admin Duplicado",
    "email": "admin@hotelk8s.com",
    "password": "senha123"
  }'
```

Critério:
- [ ] HTTP 409 (conflito de subdomain ou email)

---

### T04 — Criar categoria de quarto

```bash
export CAT_ID=$(curl -s -X POST $BASE_URL/room-categories \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $JWT" \
  -d '{
    "name": "Standard",
    "capacity": 2,
    "price_per_night": 150.00
  }' | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")

echo "Category ID: $CAT_ID"
```

Critérios:
- [ ] HTTP 201
- [ ] `$CAT_ID` não está vazio

---

### T05 — Criar quarto 101

```bash
export ROOM_ID=$(curl -s -X POST $BASE_URL/rooms \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $JWT" \
  -d "{
    \"category_id\": \"$CAT_ID\",
    \"number\": \"101\",
    \"floor\": 1,
    \"status\": \"AVAILABLE\"
  }" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")

echo "Room ID: $ROOM_ID"
```

Critérios:
- [ ] HTTP 201
- [ ] `$ROOM_ID` não está vazio
- [ ] `status` é `"AVAILABLE"`

---

### T06 — Criar quarto 102 (para testes de extras)

```bash
export ROOM_ID_2=$(curl -s -X POST $BASE_URL/rooms \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $JWT" \
  -d "{
    \"category_id\": \"$CAT_ID\",
    \"number\": \"102\",
    \"floor\": 1,
    \"status\": \"AVAILABLE\"
  }" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")

echo "Room 102 ID: $ROOM_ID_2"
```

---

### T07 — Listar quartos disponíveis (sem reservas ainda)

```bash
curl -s "$BASE_URL/rooms/available?check_in=2026-07-10&check_out=2026-07-15" \
  -H "Authorization: Bearer $JWT" | python3 -m json.tool
```

Critérios:
- [ ] HTTP 200
- [ ] Ambos os quartos (101 e 102) aparecem na lista
- [ ] Cada quarto tem `category` aninhado com `price_per_night`

---

### T08 — Criar hóspede

```bash
export GUEST_ID=$(curl -s -X POST $BASE_URL/guests \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $JWT" \
  -d '{
    "full_name": "João da Silva",
    "cpf": "12345678901",
    "email": "joao@teste.com",
    "phone": "11999990000"
  }' | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")

echo "Guest ID: $GUEST_ID"
```

Critérios:
- [ ] HTTP 201
- [ ] `$GUEST_ID` não está vazio

---

### T09 — Criar reserva (SEM enviar total_amount)

```bash
export RES_ID=$(curl -s -X POST $BASE_URL/reservations \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $JWT" \
  -d "{
    \"guest_id\": \"$GUEST_ID\",
    \"room_id\": \"$ROOM_ID\",
    \"check_in_date\": \"2026-07-10\",
    \"check_out_date\": \"2026-07-15\"
  }" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['id']); import sys; print(f'total={d.get(\"total_amount\")}', file=sys.stderr)")

echo "Reservation ID: $RES_ID"
```

Critérios:
- [ ] HTTP 201
- [ ] `total_amount` calculado automaticamente: 5 noites × R$150 = **R$750** (não 0)
- [ ] `status` é `"PENDING"`
- [ ] `$RES_ID` não está vazio

> **Valida o fix da TAREFA 2:** sistema calcula o total, não aceita do cliente.

---

### T10 — Tentar criar reserva no mesmo quarto/período (double booking)

```bash
curl -s -o /dev/null -w "%{http_code}" -X POST $BASE_URL/reservations \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $JWT" \
  -d "{
    \"guest_id\": \"$GUEST_ID\",
    \"room_id\": \"$ROOM_ID\",
    \"check_in_date\": \"2026-07-12\",
    \"check_out_date\": \"2026-07-17\"
  }"
```

Critério:
- [ ] HTTP 409 (conflito — quarto já reservado no período)

---

### T11 — Listar quartos disponíveis (quarto 101 deve sumir)

```bash
curl -s "$BASE_URL/rooms/available?check_in=2026-07-10&check_out=2026-07-15" \
  -H "Authorization: Bearer $JWT" | python3 -m json.tool
```

Critérios:
- [ ] HTTP 200
- [ ] Quarto 101 **NÃO** aparece (tem reserva no período)
- [ ] Quarto 102 **aparece** (livre)

---

### T12 — Check-in

```bash
curl -s -X PUT $BASE_URL/reservations/$RES_ID/check-in \
  -H "Authorization: Bearer $JWT" | python3 -m json.tool
```

Critérios:
- [ ] HTTP 200
- [ ] `status` é `"CHECKED_IN"`

Verificar status do quarto 101:
```bash
curl -s $BASE_URL/rooms/$ROOM_ID \
  -H "Authorization: Bearer $JWT" | python3 -c "import sys,json; print(json.load(sys.stdin)['status'])"
```
- [ ] `status` é `"OCCUPIED"`

---

### T13 — Tentar cancelar reserva com hóspede no quarto

```bash
curl -s -X PUT $BASE_URL/reservations/$RES_ID/cancel \
  -H "Authorization: Bearer $JWT" | python3 -m json.tool
```

Critérios:
- [ ] HTTP 422
- [ ] Mensagem: `"Não é possível cancelar uma reserva com hóspede no quarto"`

---

### T14 — Check-out

```bash
curl -s -X PUT $BASE_URL/reservations/$RES_ID/check-out \
  -H "Authorization: Bearer $JWT" | python3 -m json.tool
```

Critérios:
- [ ] HTTP 200
- [ ] `status` é `"CHECKED_OUT"`

Verificar status do quarto 101:
```bash
curl -s $BASE_URL/rooms/$ROOM_ID \
  -H "Authorization: Bearer $JWT" | python3 -c "import sys,json; print(json.load(sys.stdin)['status'])"
```
- [ ] `status` é `"CLEANING"`

---

### T15 — Reserva com múltiplos quartos + check-in (valida fix TAREFA 3)

Criar segunda reserva (quarto 101 está CLEANING agora, usar 102):

```bash
export RES_ID_2=$(curl -s -X POST $BASE_URL/reservations \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $JWT" \
  -d "{
    \"guest_id\": \"$GUEST_ID\",
    \"room_id\": \"$ROOM_ID_2\",
    \"check_in_date\": \"2026-08-01\",
    \"check_out_date\": \"2026-08-05\"
  }" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")

echo "Reservation 2 ID: $RES_ID_2"
```

Restaurar quarto 101 para AVAILABLE (limpeza concluída):
```bash
curl -s -X PUT $BASE_URL/rooms/$ROOM_ID \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $JWT" \
  -d '{"status": "AVAILABLE"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['status'])"
```

Adicionar quarto 101 como extra da segunda reserva:
```bash
curl -s -X POST $BASE_URL/reservations/$RES_ID_2/rooms \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $JWT" \
  -d "{\"room_id\": \"$ROOM_ID\"}" | python3 -m json.tool
```

Critérios:
- [ ] HTTP 200 ou 201

Check-in na reserva com 2 quartos:
```bash
curl -s -X PUT $BASE_URL/reservations/$RES_ID_2/check-in \
  -H "Authorization: Bearer $JWT" | python3 -m json.tool
```

Verificar status dos dois quartos:
```bash
echo "Quarto principal (102):"
curl -s $BASE_URL/rooms/$ROOM_ID_2 -H "Authorization: Bearer $JWT" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['status'])"

echo "Quarto extra (101):"
curl -s $BASE_URL/rooms/$ROOM_ID -H "Authorization: Bearer $JWT" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['status'])"
```

Critérios:
- [ ] Quarto 102 (principal) → `"OCCUPIED"` ✅
- [ ] Quarto 101 (extra) → `"OCCUPIED"` ✅ ← **este era o bug, agora deve funcionar**

> **Valida o fix da TAREFA 3:** quartos extras atualizam status junto com o principal.

---

### T16 — Registrar pagamento

```bash
curl -s -X POST $BASE_URL/payments \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $JWT" \
  -d "{
    \"reservation_id\": \"$RES_ID\",
    \"amount\": 750.00,
    \"method\": \"PIX\"
  }" | python3 -m json.tool
```

Critérios:
- [ ] HTTP 201
- [ ] `amount` é `750.00`
- [ ] `method` é `"PIX"`

---

### T17 — Cancelar reserva válida (PENDING)

Criar terceira reserva para cancelar:
```bash
export RES_ID_3=$(curl -s -X POST $BASE_URL/reservations \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $JWT" \
  -d "{
    \"guest_id\": \"$GUEST_ID\",
    \"room_id\": \"$ROOM_ID\",
    \"check_in_date\": \"2026-09-01\",
    \"check_out_date\": \"2026-09-03\"
  }" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")

curl -s -X PUT $BASE_URL/reservations/$RES_ID_3/cancel \
  -H "Authorization: Bearer $JWT" | python3 -m json.tool
```

Critérios:
- [ ] HTTP 200
- [ ] `status` é `"CANCELLED"`

---

### T18 — Tentar cancelar a mesma reserva duas vezes

```bash
curl -s -o /dev/null -w "%{http_code}" -X PUT \
  $BASE_URL/reservations/$RES_ID_3/cancel \
  -H "Authorization: Bearer $JWT"
```

Critério:
- [ ] HTTP 422 com mensagem `"Reserva já cancelada"`

---

### T19 — CPF duplicado no mesmo tenant

```bash
curl -s -o /dev/null -w "%{http_code}" -X POST $BASE_URL/guests \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $JWT" \
  -d '{
    "full_name": "Outro João",
    "cpf": "12345678901",
    "email": "outro@teste.com"
  }'
```

Critério:
- [ ] HTTP 409 (CPF já cadastrado neste tenant)

---

### T20 — Tenant isolation (sem token)

```bash
curl -s -o /dev/null -w "%{http_code}" $BASE_URL/reservations
```

Critério:
- [ ] HTTP 401 (não autorizado)

---

## FASE 4 — Validar probes e resiliência K8s

### 4.1 Verificar probes do backend

```bash
kubectl describe pod $BACKEND_POD -n hotel-system | grep -A 10 "Liveness\|Readiness"
```

Critérios:
- [ ] `Liveness` usa `httpGet` path `/health`
- [ ] `Readiness` usa `httpGet` path `/health`
- [ ] **NÃO** usa `tcpSocket`

### 4.2 Verificar probes do nginx

```bash
export NGINX_POD=$(kubectl get pods -n hotel-system -l app=nginx -o jsonpath='{.items[0].metadata.name}')
kubectl describe pod $NGINX_POD -n hotel-system | grep -A 10 "Liveness\|Readiness"
```

Critérios:
- [ ] `Liveness` usa `httpGet` path `/healthz`
- [ ] `Readiness` usa `httpGet` path `/healthz`
- [ ] **NÃO** usa `/api-docs`

### 4.3 Testar resiliência: backend down não derruba nginx

```bash
# Deletar um pod de backend (K8s vai recriar automaticamente)
kubectl delete pod $BACKEND_POD -n hotel-system

# Nginx deve permanecer Ready
kubectl get pods -n hotel-system -w
```

Critérios:
- [ ] Pod nginx permanece `1/1 Running` enquanto o backend recria
- [ ] Após ~30s o novo pod backend volta a `1/1 Running`
- [ ] `GET $BASE_URL/health` retorna 200 após o backend voltar

### 4.4 Verificar resource limits aplicados

```bash
kubectl describe pod $BACKEND_POD -n hotel-system | grep -A 4 "Limits\|Requests"
```

Critérios:
- [ ] `cpu: 500m` em Limits
- [ ] `memory: 512Mi` em Limits

---

## FASE 5 — Relatório de resultados

Ao finalizar todos os testes, preencha a tabela abaixo e salve no arquivo:

| Teste | Descrição | Resultado | Observação |
|---|---|---|---|
| T01 | Registro de tenant | ✅/❌ | |
| T02 | Login + JWT | ✅/❌ | |
| T03 | Registro duplicado → 409 | ✅/❌ | |
| T04 | Criar categoria | ✅/❌ | |
| T05 | Criar quarto 101 | ✅/❌ | |
| T06 | Criar quarto 102 | ✅/❌ | |
| T07 | Listar quartos disponíveis | ✅/❌ | |
| T08 | Criar hóspede | ✅/❌ | |
| T09 | Criar reserva (total calculado) | ✅/❌ | total_amount = ? |
| T10 | Double booking → 409 | ✅/❌ | |
| T11 | /rooms/available pós-reserva | ✅/❌ | |
| T12 | Check-in + quarto OCCUPIED | ✅/❌ | |
| T13 | Cancel com CHECKED_IN → 422 | ✅/❌ | |
| T14 | Check-out + quarto CLEANING | ✅/❌ | |
| T15 | Check-in multi-quarto | ✅/❌ | extras ficaram OCCUPIED? |
| T16 | Pagamento PIX | ✅/❌ | |
| T17 | Cancelar reserva PENDING | ✅/❌ | |
| T18 | Cancelar já cancelada → 422 | ✅/❌ | |
| T19 | CPF duplicado → 409 | ✅/❌ | |
| T20 | Sem token → 401 | ✅/❌ | |
| K8s-1 | Probes backend (httpGet /health) | ✅/❌ | |
| K8s-2 | Probes nginx (httpGet /healthz) | ✅/❌ | |
| K8s-3 | Resiliência nginx (backend down) | ✅/❌ | |
| K8s-4 | Resource limits aplicados | ✅/❌ | |

---

## Output obrigatório ao finalizar

```
[ ] Tabela de resultados preenchida acima
[ ] Relatório de sessão em:
    docs/historico_sessao/gabriel/testes_k8s_ambiente_completo_11jun2026.md
    (use o template de CODING_STANDARDS.md)
[ ] Para cada ❌ na tabela: pendência registrada no relatório com causa raiz
[ ] Marcar este arquivo: Status: ✅ Concluído (ou ⚠️ Parcial se houver falhas)
[ ] git add + git commit + git push origin develop
```

**Commit:**
```
docs(testes): resultados do teste de ambiente completo K8s

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
```
