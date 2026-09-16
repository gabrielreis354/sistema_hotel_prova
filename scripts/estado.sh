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

echo
echo "-- fim do estado --"
