#!/bin/bash
BASE="http://localhost:8080"

# Iniciar port-forward em background
kubectl port-forward svc/nginx 8080:80 -n hotel-system &>/tmp/pf.log &
PF_PID=$!
trap "kill $PF_PID 2>/dev/null" EXIT
sleep 3

echo "=== T01: Registro de tenant ==="
REGISTER=$(curl -s -X POST "$BASE/auth/register" \
  -H "Content-Type: application/json" \
  -d '{"tenantName":"Hotel Demo","name":"Admin Demo","email":"admin@demo.com","password":"senha123"}')
echo "$REGISTER"

echo ""
echo "=== T02: Login + JWT ==="
LOGIN=$(curl -s -X POST "$BASE/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@demo.com","password":"senha123"}')
JWT=$(echo "$LOGIN" | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")
echo "JWT: ${JWT:0:50}..."

echo ""
echo "=== T03: Registro duplicado (espera 409) ==="
curl -s -o /dev/null -w "HTTP %{http_code}" -X POST "$BASE/auth/register" \
  -H "Content-Type: application/json" \
  -d '{"tenantName":"Hotel Demo","name":"Dup","email":"admin@demo.com","password":"senha123"}'
echo ""

echo ""
echo "=== T04: Criar categoria Standard ==="
CAT=$(curl -s -X POST "$BASE/room-categories" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $JWT" \
  -d '{"name":"Standard","capacity":2,"price_per_night":150.00}')
echo "$CAT"
CAT_ID=$(echo "$CAT" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")

echo ""
echo "=== T05: Criar quarto 101 ==="
ROOM=$(curl -s -X POST "$BASE/rooms" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $JWT" \
  -d "{\"category_id\":\"$CAT_ID\",\"number\":\"101\",\"floor\":1,\"status\":\"AVAILABLE\"}")
echo "$ROOM"
ROOM_ID=$(echo "$ROOM" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")

echo ""
echo "=== T06: Criar quarto 102 ==="
ROOM2=$(curl -s -X POST "$BASE/rooms" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $JWT" \
  -d "{\"category_id\":\"$CAT_ID\",\"number\":\"102\",\"floor\":1,\"status\":\"AVAILABLE\"}")
ROOM_ID_2=$(echo "$ROOM2" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
echo "Room 102 ID: $ROOM_ID_2"

echo ""
echo "=== T07: Quartos disponíveis (2026-08-01 a 2026-08-05) ==="
curl -s "$BASE/rooms/available?check_in=2026-08-01&check_out=2026-08-05" \
  -H "Authorization: Bearer $JWT" \
  | python3 -c "
import sys,json
rooms=json.load(sys.stdin)
print(f'{len(rooms)} quarto(s) disponível(is):')
for r in rooms:
  print(f'  - {r[\"number\"]} | {r[\"category\"][\"name\"]} | R\${r[\"category\"][\"price_per_night\"]}/noite')
"

echo ""
echo "=== T08: Criar hóspede ==="
GUEST=$(curl -s -X POST "$BASE/guests" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $JWT" \
  -d '{"full_name":"João da Silva","cpf":"12345678901","email":"joao@teste.com","phone":"11999990000"}')
echo "$GUEST"
GUEST_ID=$(echo "$GUEST" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")

echo ""
echo "=== T09: Criar reserva (total calculado automaticamente) ==="
RES=$(curl -s -X POST "$BASE/reservations" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $JWT" \
  -d "{\"guest_id\":\"$GUEST_ID\",\"room_id\":\"$ROOM_ID\",\"check_in_date\":\"2026-08-01\",\"check_out_date\":\"2026-08-05\"}")
echo "$RES"
RES_ID=$(echo "$RES" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
TOTAL=$(echo "$RES" | python3 -c "import sys,json; print(json.load(sys.stdin)['total_amount'])")
echo ">>> total_amount = $TOTAL (esperado: 600.00 = 4 noites x R\$150)"

echo ""
echo "=== T10: Double booking (espera 409) ==="
curl -s -o /dev/null -w "HTTP %{http_code}" -X POST "$BASE/reservations" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $JWT" \
  -d "{\"guest_id\":\"$GUEST_ID\",\"room_id\":\"$ROOM_ID\",\"check_in_date\":\"2026-08-03\",\"check_out_date\":\"2026-08-07\"}"
echo ""

echo ""
echo "=== T11: Disponíveis pós-reserva (101 deve sumir) ==="
curl -s "$BASE/rooms/available?check_in=2026-08-01&check_out=2026-08-05" \
  -H "Authorization: Bearer $JWT" \
  | python3 -c "
import sys,json
rooms=json.load(sys.stdin)
nums=[r['number'] for r in rooms]
print(f'Quartos disponíveis: {nums}')
print('101 ausente: ' + ('SIM ✅' if '101' not in nums else 'NÃO ❌'))
print('102 presente: ' + ('SIM ✅' if '102' in nums else 'NÃO ❌'))
"

echo ""
echo "=== T12: Check-in ==="
curl -s -X PUT "$BASE/reservations/$RES_ID/check-in" \
  -H "Authorization: Bearer $JWT" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'status reserva: {d[\"status\"]}')"
echo -n "status quarto 101: "
curl -s "$BASE/rooms/$ROOM_ID" \
  -H "Authorization: Bearer $JWT" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['status'])"

echo ""
echo "=== T13: Cancelar com CHECKED_IN (espera 422) ==="
curl -s -X PUT "$BASE/reservations/$RES_ID/cancel" \
  -H "Authorization: Bearer $JWT" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('error','sem erro'))"

echo ""
echo "=== T14: Check-out ==="
curl -s -X PUT "$BASE/reservations/$RES_ID/check-out" \
  -H "Authorization: Bearer $JWT" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'status reserva: {d[\"status\"]}')"
echo -n "status quarto 101: "
curl -s "$BASE/rooms/$ROOM_ID" \
  -H "Authorization: Bearer $JWT" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['status'])"

echo ""
echo "=== T19: CPF duplicado (espera 409) ==="
curl -s -o /dev/null -w "HTTP %{http_code}" -X POST "$BASE/guests" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $JWT" \
  -d '{"full_name":"Outro João","cpf":"12345678901","email":"outro@teste.com"}'
echo ""

echo ""
echo "=== T20: Sem token (espera 401) ==="
curl -s -o /dev/null -w "HTTP %{http_code}" "$BASE/reservations"
echo ""

echo ""
echo "=== CONCLUÍDO ==="
