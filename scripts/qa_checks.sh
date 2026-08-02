#!/usr/bin/env bash
#
# Checagens determinísticas de qualidade — Camada 1 do portão de QA.
#
# Cobre o que NÃO precisa de LLM: violações objetivas das regras do CLAUDE.md
# que dariam para pegar com grep. Roda em segundos e não tem custo.
#
# NÃO substitui o subagente qa-redteam (.claude/agents/qa-redteam.md), que faz a
# análise semântica — SOLID, DRY, KISS, raciocínio de LGPD e UI/UX.
#
# Uso:
#   npm run qa:checks
#   bash scripts/qa_checks.sh
#
# Saída: 0 se não houver ERRO. WARN não reprova.
#
# Escape pontual, quando a violação for justificada:
#   const r = await Model.findByPk(id); // qa-allow: findByPk

set -uo pipefail

SRC_DIRS="app routes middlewares database config bootstrap"
ERRORS=0
WARNS=0

bold()  { printf '\033[1m%s\033[0m\n' "$1"; }
red()   { printf '\033[31m%s\033[0m\n' "$1"; }
amber() { printf '\033[33m%s\033[0m\n' "$1"; }
green() { printf '\033[32m%s\033[0m\n' "$1"; }

# report_error <título> <regra> <resultado-do-grep>
report_error() {
    local title="$1" rule="$2" hits="$3"
    if [ -n "$hits" ]; then
        red "✗ ERRO — $title"
        printf '  Regra: %s\n' "$rule"
        printf '%s\n' "$hits" | sed 's/^/    /'
        echo
        ERRORS=$((ERRORS + 1))
    fi
}

report_warn() {
    local title="$1" rule="$2" hits="$3"
    if [ -n "$hits" ]; then
        amber "⚠ AVISO — $title"
        printf '  Regra: %s\n' "$rule"
        printf '%s\n' "$hits" | sed 's/^/    /'
        echo
        WARNS=$((WARNS + 1))
    fi
}

# Remove linhas que são comentário (formato do grep -n: arquivo:linha:conteúdo)
strip_comments() { grep -vE ':[0-9]+:[[:space:]]*(//|\*|/\*)' || true; }

bold "── Checagens determinísticas de qualidade ──"
echo

# ─────────────────────────────────────────────────────────────────────────────
# 1. ESM — require() é proibido no projeto
# ─────────────────────────────────────────────────────────────────────────────
hits=$(grep -rnE "(^|[^a-zA-Z0-9_.'\"])require[[:space:]]*\(" $SRC_DIRS \
        --include='*.js' 2>/dev/null | strip_comments)
report_error "require() encontrado" \
    "O projeto é ESM puro — use import/export (CLAUDE.md §7)" \
    "$hits"

# ─────────────────────────────────────────────────────────────────────────────
# 2. findByPk — ignora tenant_id, é vazamento cross-tenant
#
# Exceção legítima: TenantModel.findByPk(tenantId). O tenant NÃO é um recurso
# escopado por tenant — ele é o próprio escopo, e o id vem do JWT. Não é brecha.
# ─────────────────────────────────────────────────────────────────────────────
hits=$(grep -rnE "\.findByPk[[:space:]]*\(" $SRC_DIRS \
        --include='*.js' 2>/dev/null \
        | grep -vE "TenantModel\.findByPk" \
        | grep -v 'qa-allow: findByPk' | strip_comments)
report_error "findByPk() em recurso de tenant" \
    "findByPk ignora tenant_id. Use findOne({ where: { id, tenant_id } })" \
    "$hits"

# ─────────────────────────────────────────────────────────────────────────────
# 3. tenant_id vindo da requisição — só pode vir do JWT
# ─────────────────────────────────────────────────────────────────────────────
hits=$(grep -rnE "(req|request)\.(body|query|params)\.(tenant_id|tenantId)" $SRC_DIRS \
        --include='*.js' 2>/dev/null | strip_comments)
report_error "tenant_id lido do body/query/params" \
    "tenant_id vem SEMPRE do JWT (request.user.tenantId). Aceitar do cliente permite forjar tenant" \
    "$hits"

# ─────────────────────────────────────────────────────────────────────────────
# 4. Ordem de rotas — /:param declarado antes de rota literal captura a literal
# ─────────────────────────────────────────────────────────────────────────────
route_issues=""
for f in routes/apis/*.js; do
    [ -f "$f" ] || continue
    unset seen_param 2>/dev/null || true
    declare -A seen_param=()

    raw=$(grep -nE "\.(get|post|put|patch|delete)\([[:space:]]*'[^']*'" "$f" 2>/dev/null || true)
    [ -z "$raw" ] && continue

    while IFS= read -r entry; do
        [ -z "$entry" ] && continue
        lineno="${entry%%:*}"
        verb=$(printf '%s' "$entry" | sed -nE "s/.*\.(get|post|put|patch|delete)\([[:space:]]*'.*/\1/p")
        path=$(printf '%s' "$entry" | sed -nE "s/.*\.(get|post|put|patch|delete)\([[:space:]]*'([^']*)'.*/\2/p")
        [ -z "$verb" ] && continue

        # Parâmetro de segmento único na raiz: '/:id'
        if printf '%s' "$path" | grep -qE '^/:[^/]+$'; then
            [ -z "${seen_param[$verb]:-}" ] && seen_param[$verb]="$lineno"
        # Rota literal (começa com letra) depois de um /:param do mesmo verbo
        elif printf '%s' "$path" | grep -qE '^/[a-zA-Z]'; then
            prev="${seen_param[$verb]:-}"
            if [ -n "$prev" ]; then
                route_issues+="$f:$lineno: ${verb^^} '$path' vem depois de ${verb^^} '/:param' (linha $prev) — será capturada como parâmetro"$'\n'
            fi
        fi
    done <<< "$raw"
done
report_error "Rota literal declarada depois de /:param" \
    "Rota literal (/available, /me) precisa vir ANTES de /:id (CLAUDE.md §8)" \
    "$(printf '%s' "$route_issues")"

# ─────────────────────────────────────────────────────────────────────────────
# 5. LGPD — objeto de requisição em log pode carregar CPF, e-mail e token
# ─────────────────────────────────────────────────────────────────────────────
hits=$(grep -rnE "console\.(log|error|warn|info)\([^)]*\b(request|req)\b" $SRC_DIRS \
        --include='*.js' 2>/dev/null | strip_comments)
report_warn "Log com objeto de requisição" \
    "LGPD art. 6º — request pode conter CPF, e-mail, telefone e token. Logue só o campo necessário" \
    "$hits"

# ─────────────────────────────────────────────────────────────────────────────
# 6. LGPD — include sem attributes devolve o model inteiro.
#
# Só alerta para models que carregam dado pessoal ou segredo. Incluir
# RoomCategoryModel inteiro é inofensivo; UserModel ou PaymentModel não é.
# ─────────────────────────────────────────────────────────────────────────────
PII_MODELS="UserModel|GuestModel|PaymentModel|CorporateClientModel|ContractModel"
hits=$(grep -rnE "include:[[:space:]]*\[[[:space:]]*\{[^}]*model:[[:space:]]*($PII_MODELS)[^}]*\}" $SRC_DIRS \
        --include='*.js' 2>/dev/null | grep -v 'attributes' | strip_comments)
report_warn "include de model com dado sensível, sem attributes" \
    "LGPD art. 6º — sem attributes o Sequelize devolve tudo (password_hash, CPF, pix_qr_code)" \
    "$hits"

# ─────────────────────────────────────────────────────────────────────────────
# 7. Endpoint novo sem Swagger — quebra o cliente tipado do frontend
# ─────────────────────────────────────────────────────────────────────────────
missing_swagger=""
for f in routes/apis/*.js; do
    [ -f "$f" ] || continue
    base=$(basename "$f" .js)
    resource=$(printf '%s' "$base" | sed -E 's/Router$//')
    # camelCase -> kebab-case (roomCategory -> room-category)
    kebab=$(printf '%s' "$resource" | sed -E 's/([a-z0-9])([A-Z])/\1-\L\2/g' | tr '[:upper:]' '[:lower:]')
    if ! grep -qi -- "$kebab" config/swagger.js 2>/dev/null; then
        missing_swagger+="$f: recurso '$kebab' não aparece em config/swagger.js"$'\n'
    fi
done
report_warn "Router sem entrada no Swagger" \
    "O cliente tipado do frontend é gerado do OpenAPI — endpoint fora do Swagger não existe para o frontend" \
    "$(printf '%s' "$missing_swagger")"

# ─────────────────────────────────────────────────────────────────────────────
# Resultado
# ─────────────────────────────────────────────────────────────────────────────
bold "── Resultado ──"
if [ "$ERRORS" -eq 0 ] && [ "$WARNS" -eq 0 ]; then
    green "✓ Nenhuma violação determinística encontrada."
elif [ "$ERRORS" -eq 0 ]; then
    amber "⚠ $WARNS aviso(s). Nenhum erro bloqueante."
else
    red "✗ $ERRORS erro(s) bloqueante(s) e $WARNS aviso(s)."
fi

echo
printf 'Esta é a camada determinística. A auditoria semântica (SOLID, DRY, KISS,\n'
printf 'LGPD, UI/UX) é feita pelo subagente qa-redteam — ver docs/COORDENACAO_AGENTES.md §5.\n'

[ "$ERRORS" -eq 0 ]
