#!/usr/bin/env bash
#
# Fotografia determinística do estado do projeto — insumo do /orquestrador.
#
# Por que existe: entre uma sessão e outra o repositório muda (outro agente
# commitou, uma branch ficou sem push, uma worktree ficou suja). Confiar na
# memória da sessão anterior já produziu diagnóstico errado neste projeto.
# Este script é a fonte de verdade que o orquestrador lê ANTES de decidir.
#
# Uso:
#   bash scripts/estado.sh            # com fetch (recomendado)
#   ESTADO_SEM_FETCH=1 bash scripts/estado.sh   # offline / rápido
#
# Não altera nada: apenas lê. Seguro rodar a qualquer momento.

set -uo pipefail

RAIZ="$(git rev-parse --show-toplevel 2>/dev/null)" || {
    echo "não é um repositório git"; exit 1;
}
cd "$RAIZ" || exit 1

titulo() { printf '\n== %s\n' "$1"; }
item()   { printf '   %s\n' "$1"; }

echo "GESWAY — estado em $(date '+%d/%m/%Y %H:%M')"
echo "raiz: $RAIZ"

if [ "${ESTADO_SEM_FETCH:-0}" != "1" ]; then
    git fetch origin --quiet 2>/dev/null && echo "remoto: sincronizado" \
        || echo "remoto: FETCH FALHOU — os números abaixo podem estar velhos"
else
    echo "remoto: fetch pulado (ESTADO_SEM_FETCH=1)"
fi

# ---------------------------------------------------------------- posição
titulo "ONDE ESTOU"
ATUAL="$(git branch --show-current 2>/dev/null || echo '(detached)')"
item "branch atual : $ATUAL"
item "HEAD         : $(git log --oneline -1 2>/dev/null)"

SUJO="$(git status --porcelain 2>/dev/null | wc -l | tr -d ' ')"
if [ "$SUJO" -gt 0 ]; then
    item "working tree : $SUJO arquivo(s) modificado(s) — NÃO está limpo"
    git status --short 2>/dev/null | head -12 | sed 's/^/                /'
else
    item "working tree : limpo"
fi

# ---------------------------------------------------- risco de perda real
titulo "RISCO DE PERDA — commits que só existem nesta máquina"
ORFAOS="$(git log --branches --not --remotes --oneline 2>/dev/null)"
if [ -n "$ORFAOS" ]; then
    echo "$ORFAOS" | sed 's/^/   ⚠ /'
    item ""
    item "→ falha de disco = trabalho perdido. Push antes de qualquer coisa nova."
else
    item "nenhum — todo commit local está em algum remoto"
fi

# -------------------------------------------------------------- branches
titulo "BRANCHES COM TRABALHO NÃO INTEGRADO EM develop"
ACHOU=0
for b in $(git branch --format='%(refname:short)' 2>/dev/null); do
    [ "$b" = "develop" ] && continue
    [ "$b" = "main" ] && continue
    n="$(git rev-list --count origin/develop.."$b" 2>/dev/null)" || continue
    if [ "${n:-0}" -gt 0 ]; then
        pub="local"
        git rev-parse --verify --quiet "origin/$b" >/dev/null 2>&1 && pub="no remoto"
        item "$b — $n commit(s) · $pub"
        ACHOU=1
    fi
done
[ "$ACHOU" -eq 0 ] && item "nenhuma"

# ------------------------------------------------------ develop vs main
titulo "LINHA PRINCIPAL"
for par in "origin/develop:origin/main"; do
    a="${par%%:*}"; b="${par##*:}"
    if git rev-parse --verify --quiet "$a" >/dev/null && git rev-parse --verify --quiet "$b" >/dev/null; then
        frente="$(git rev-list --count "$b".."$a" 2>/dev/null)"
        atras="$(git rev-list --count "$a".."$b" 2>/dev/null)"
        item "$a está $frente commit(s) à frente e $atras atrás de $b"
    fi
done
item "origin/develop : $(git log --oneline -1 origin/develop 2>/dev/null)"
item "origin/main    : $(git log --oneline -1 origin/main 2>/dev/null)"

# ------------------------------------------------------------ worktrees
titulo "WORKTREES (agentes em paralelo)"
git worktree list 2>/dev/null | sed 's/^/   /'

# ---------------------------------------------------------------- specs
titulo "SPECS — estado declarado"
if [ -f docs/specs/README.md ]; then
    grep -E '^\| \[SPEC-|^\| \[SPEC_' docs/specs/README.md 2>/dev/null \
        | sed 's/|/ /g; s/  */ /g; s/^ /   /' | cut -c1-118
else
    item "docs/specs/README.md não encontrado"
fi

# ------------------------------------------------------------------- qa
titulo "PORTÃO DE QA"
if [ -d docs/qa ]; then
    item "relatórios existentes (mais recentes):"
    ls -t docs/qa/*.md 2>/dev/null | head -4 | sed 's|.*/|     · |'
    if [ "$ATUAL" != "develop" ] && [ "$ATUAL" != "main" ]; then
        # O nome do arquivo não segue o nome da branch de forma confiável
        # (redteam_paranoid-unique_*.md audita fix/paranoid-unique-constraints).
        # O que é confiável é o cabeçalho do relatório, que cita a branch.
        REL="$(grep -l -- "$ATUAL" docs/qa/*.md 2>/dev/null | head -1)"
        if [ -n "$REL" ]; then
            if git ls-files --error-unmatch "$REL" >/dev/null 2>&1; then
                item "branch atual auditada: ${REL##*/} (versionado)"
            else
                item "⚠ branch atual auditada: ${REL##*/} — mas o relatório está UNTRACKED"
                item "  → só existe nesta máquina; commite antes de tratar os achados"
            fi
            VER="$(grep -m1 -iE '^\*\*(REPROVADO|APROVADO)|^(REPROVADO|APROVADO)' "$REL" 2>/dev/null | tr -d '*')"
            [ -n "$VER" ] && item "  veredito: $VER"
        else
            item "⚠ branch atual '$ATUAL' NÃO tem relatório de qa-redteam — não mergear"
        fi
    fi
else
    item "docs/qa/ não existe"
fi

# --------------------------------------------------------- delegações
titulo "DELEGAÇÕES MAIS RECENTES"
ls -t docs/delegacoes/*.md 2>/dev/null | head -3 | sed 's|.*/|   · docs/delegacoes/|'

# ------------------------------------------------------------ ferramental
#
# Por que existe: o projeto acumulou skills e plugins que ficaram meses sem uso.
# O `security-review` esteve disponível durante todo o tempo em que o vazamento
# do `provider_charge_id` e o webhook PIX sem assinatura ficaram abertos na
# `main`. Skill não se lembra sozinha — e este script já é o lugar onde o estado
# vence a memória.
#
# Isto SUGERE, não bloqueia. O que é obrigatório mora no portão (qa_checks.sh).
# Registro completo, com o que cada recurso serve, em docs/FERRAMENTAL.md.
titulo "FERRAMENTAL DA TAREFA"

# O que esta branch mexeu: commitado em relação a develop, mais o que ainda
# está solto na worktree (tracked e untracked).
if [ "$ATUAL" = "develop" ] || [ "$ATUAL" = "main" ]; then
    MUDOU="$( { git diff --name-only HEAD 2>/dev/null
                git ls-files --others --exclude-standard 2>/dev/null; } | sort -u )"
else
    MUDOU="$( { git diff --name-only origin/develop...HEAD 2>/dev/null
                git diff --name-only HEAD 2>/dev/null
                git ls-files --others --exclude-standard 2>/dev/null; } | sort -u )"
fi

if [ -z "$MUDOU" ]; then
    item "nada mexido nesta branch — o ferramental aparece quando houver diff"
else
    ACHOU_FERR=0
    JA_SUGERIDO=" "
    # $1 = padrão de caminho · $2 = chave do recurso · $3 = rótulo · $4 = por quê
    #
    # Um recurso pode ser pedido por mais de um motivo (o security-review vale
    # tanto por tocar autenticação quanto por rota nova). Nesse caso o rótulo
    # sai uma vez só e os motivos se acumulam abaixo dele.
    sugere() {
        printf '%s\n' "$MUDOU" | grep -qE "$1" || return 0
        case "$JA_SUGERIDO" in
            *" $2 "*) : ;;
            *) item "$3"; JA_SUGERIDO="$JA_SUGERIDO$2 " ;;
        esac
        item "   └ $4"
        ACHOU_FERR=1
    }

    sugere '(Auth|auth|jwt|Jwt|JWT|webhook|Webhook|[Ss]ecret|[Tt]oken)' \
        seguranca '/security-review — ANTES do merge' \
        'toca autenticação, webhook ou segredo: é a classe exata das duas falhas que chegaram à main'

    sugere 'services/[^/]*/(app/Controllers|middlewares|routes)/' \
        seguranca '/security-review — ANTES do merge' \
        'rota ou controller no diff — tenant_id na query, papel exigido, e o que a resposta pública devolve'

    sugere 'services/[^/]*/(app/Models|database|db)/' \
        dados 'qa-redteam com foco em dados' \
        'model ou schema no diff — multi-tenancy, soft delete e índice único parcial (o paranoid já custou uma PR)'

    sugere '^frontend/' \
        frontend 'frontend/DESIGN_PMS.md (ler antes) + design:accessibility-review' \
        'RNF-024 a RNF-027 são requisitos avaliados, e nenhuma verificação de acessibilidade foi rodada até hoje'

    sugere '^frontend/apps/pms/' \
        pms 'emil-design-eng · animate · review-animations' \
        'movimento funcional no PMS. NÃO use design-taste-frontend aqui — ela é do apps/booking'

    sugere '^frontend/apps/booking/' \
        booking 'design-taste-frontend' \
        'única superfície de conversão do sistema: hierarquia e primeira impressão pagam'

    sugere '([Aa]nalytics|revenue|occupancy|seasonality)' \
        grafico 'dataviz' \
        'indicador virando gráfico — paleta, eixo e tipo de gráfico antes de escrever o componente'

    sugere '([Pp]df|generateContractPdf|generateQuotePdf)' \
        pdf 'pdf-viewer' \
        'olhar o PDF gerado de verdade; teste de status 200 não prova que o documento está legível'

    sugere '(^infra/|^\.github/workflows/|Dockerfile|docker-compose)' \
        infra 'qa-redteam com foco em infra' \
        'manifesto ou pipeline no diff — segredo fora do versionamento, probe, limite de recurso'

    sugere '^docs/specs/' \
        spec '/spec' \
        'mudança em SPEC segue o fluxo Specify → Plan → Tasks, com checkpoint humano'

    sugere '(tests/|\.test\.|vitest)' \
        testes 'superpowers: test-driven-development · verification-before-completion' \
        'instalado desde 26/08 e nunca usado; precisa habilitar o plugin na sessão'

    [ "$ACHOU_FERR" -eq 0 ] && item "o diff não casou com nenhum padrão conhecido — ver docs/FERRAMENTAL.md"
    item ""
    item "→ registro completo: docs/FERRAMENTAL.md"
fi

echo
echo "-- fim do estado --"
