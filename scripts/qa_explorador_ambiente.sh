#!/usr/bin/env bash
# Ambiente do subagente qa-explorador (.claude/agents/qa-explorador.md §5).
#
#   bash scripts/qa_explorador_ambiente.sh subir   # recria o banco gestao_hotel_qa, sobe backend e tela, cria os dados
#   bash scripts/qa_explorador_ambiente.sh parar   # derruba o backend e a tela que este script subiu
#
# Banco PRÓPRIO (gestao_hotel_qa): nunca o de desenvolvimento nem o dos testes automatizados.
# Usa as credenciais e as chaves JWT temporárias de services/core-service/.env.test
# (copie do .env.test.example; as chaves nascem na primeira rodada de `npm test` do backend).
set -euo pipefail

RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
CORE="$RAIZ/services/core-service"
PMS="$RAIZ/frontend/apps/pms"
# Uma pasta de estado por checkout: o parar de um worktree não mexe no de outro.
ESTADO="${TMPDIR:-/tmp}/gesway-qa-explorador-$(printf '%s' "$RAIZ" | cksum | cut -d' ' -f1)"
BANCO="gestao_hotel_qa"

falha() { echo "✘ $*" >&2; exit 1; }
# IPv4 e IPv6: um Vite de outro checkout em [::1] também ocupa a porta para o navegador.
porta_ocupada() { (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null || (exec 3<>"/dev/tcp/::1/$1") 2>/dev/null; }

# Só mata o PID gravado se ele ainda for o processo que este script subiu (PID reaproveitado
# pelo sistema seria outro programa do usuário).
parar_um() { # nome, padrão do comando
    local arq="$ESTADO/$1.pid" pid
    [ -f "$arq" ] || return 1
    pid="$(cat "$arq")"
    rm -f "$arq"
    if ps -o args= -p "$pid" 2>/dev/null | grep -q -- "$2"; then
        kill "$pid" 2>/dev/null || true
        for _ in $(seq 1 20); do kill -0 "$pid" 2>/dev/null || break; sleep 0.25; done
        echo "✔ $1 parado"
    else
        echo "• $1: o PID gravado não é mais deste ambiente; nada a parar"
    fi
}

parar() {
    local algum=0
    parar_um backend "_web.js" && algum=1
    parar_um tela "vite" && algum=1
    [ "$algum" = 1 ] || echo "• nada estava no ar (pasta de estado: $ESTADO)"
}

esperar() { # url, nome
    local pid; pid="$(cat "$ESTADO/$2.pid")"
    for _ in $(seq 1 60); do
        curl -sf "$1" >/dev/null && return 0
        kill -0 "$pid" 2>/dev/null || falha "$2 caiu ao subir — veja $ESTADO/$2.log"
        sleep 1
    done
    falha "$2 não respondeu em 60 s — veja $ESTADO/$2.log"
}

# Caminhos para o eixo Rede (regras §4): o Playwright que veio com o MCP, o Chromium e as
# bibliotecas, lidos do registro do MCP desta pasta no ~/.claude.json. Nada é instalado. Sem o
# registro, o arquivo diz por quê e o agente marca Rede como não testada.
ambiente_rede() {
    local saida="$ESTADO/ambiente.env"
    if ! node -e '
        const fs = require("node:fs"), path = require("node:path"), os = require("node:os");
        const cfg = JSON.parse(fs.readFileSync(path.join(os.homedir(), ".claude.json"), "utf8"));
        const mcp = cfg.projects?.[process.argv[1]]?.mcpServers?.playwright;
        if (!mcp) process.exit(3);
        const args = mcp.args ?? [];
        const versao = (args.find((a) => a.startsWith("@playwright/mcp@")) ?? "").split("@").pop();
        const chromium = args[args.indexOf("--executable-path") + 1];
        const raiz = path.join(os.homedir(), ".npm", "_npx");
        const core = fs.readdirSync(raiz).map((d) => path.join(raiz, d, "node_modules"))
            .find((nm) => { try { return JSON.parse(fs.readFileSync(path.join(nm, "@playwright/mcp/package.json"))).version === versao; } catch { return false; } });
        if (!core || !chromium) process.exit(4);
        console.log(`QA_PLAYWRIGHT_CORE=${path.join(core, "playwright-core/index.mjs")}`);
        console.log(`QA_CHROMIUM=${chromium}`);
        console.log(`QA_LD_LIBRARY_PATH=${mcp.env?.LD_LIBRARY_PATH ?? ""}`);
    ' "$RAIZ" >"$saida" 2>/dev/null; then
        echo "QA_REDE_INDISPONIVEL=sem registro do Playwright MCP nesta pasta ($RAIZ) ou pacote fora do cache do npx" >"$saida"
    fi
    echo "✔ ambiente do eixo Rede em $saida"
}

subir() {
    [ -f "$CORE/.env.test" ] || falha "falta services/core-service/.env.test (copie do .env.test.example)"
    [ -d "$CORE/node_modules" ] || falha "faltam os node_modules do backend: rode 'npm ci' em services/core-service"
    [ -x "$PMS/node_modules/.bin/vite" ] || falha "faltam os node_modules do frontend: rode 'pnpm install' em frontend/"
    porta_ocupada 3000 && falha "porta 3000 ocupada: pare o backend que está rodando antes"
    porta_ocupada 5173 && falha "porta 5173 ocupada: pare o Vite que está rodando antes"
    mkdir -p "$ESTADO"
    rm -f "$ESTADO/dados.json"
    # Qualquer falha daqui em diante derruba o que já subiu: nada fica no ar pela metade.
    trap 'parar >/dev/null 2>&1 || true' EXIT

    set -a; # shellcheck disable=SC1091
    source "$CORE/.env.test"; set +a
    export NODE_ENV=development POSTGRES_DB="$BANCO" NODE_WEB_PORT=3000
    # Serviços externos DESLIGADOS. O _web.js também carrega o .env de desenvolvimento, e o
    # dotenv não sobrescreve variável que já existe, mesmo vazia: sem isto, os eventos do
    # "Hotel QA" iam para o RabbitMQ (e o analytics) de dev, o PIX para o provedor real e os
    # PDFs para o bucket de dev (🟡-1 do qa-redteam de 09/11).
    export RABBITMQ_HOST= RABBITMQ_CORE_USER= RABBITMQ_CORE_PASSWORD= \
        PIX_PROVIDER=fake MERCADOPAGO_ACCESS_TOKEN= ASAAS_API_KEY= \
        MINIO_ENDPOINT= MINIO_PUBLIC_ENDPOINT= MINIO_ROOT_USER= MINIO_ROOT_PASSWORD=
    # Os caminhos do .env.test são relativos ao core-service, de onde o backend roda.
    (cd "$CORE" && [ -f "$JWT_PRIVATE_KEY_PATH" ] && [ -f "$JWT_PUBLIC_KEY_PATH" ]) \
        || falha "faltam as chaves JWT do .env.test: rode 'npm test' uma vez em services/core-service"

    # Banco limpo a cada rodada: o que a rodada anterior gravou não contamina a próxima.
    export PGPASSWORD="$POSTGRES_PASSWORD"
    dropdb --if-exists -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" "$BANCO"
    createdb -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" "$BANCO"
    (cd "$CORE" && node command.js migrate >"$ESTADO/migrate.log" 2>&1) || falha "migrate falhou — veja $ESTADO/migrate.log"
    echo "✔ banco $BANCO recriado"

    # exec: o PID guardado é o do próprio node (o parar mata o processo certo), e nenhum
    # bash intermediário fica preso à saída deste script — senão quem chama nunca recebe o fim.
    (cd "$CORE" && exec nohup node _web.js >"$ESTADO/backend.log" 2>&1 </dev/null) &
    echo $! >"$ESTADO/backend.pid"
    esperar http://localhost:3000/health backend
    echo "✔ backend em http://localhost:3000 (banco $BANCO, serviços externos desligados)"

    (cd "$PMS" && exec nohup node_modules/.bin/vite --port 5173 --strictPort >"$ESTADO/tela.log" 2>&1 </dev/null) &
    echo $! >"$ESTADO/tela.pid"
    esperar http://localhost:5173/ tela
    echo "✔ tela em http://localhost:5173"

    # Dados em arquivo temporário: um dados.json pela metade nunca fica para o agente usar.
    node "$RAIZ/scripts/qa_explorador_dados.mjs" http://localhost:3000 >"$ESTADO/dados.json.tmp" \
        || { rm -f "$ESTADO/dados.json.tmp"; falha "criação dos dados falhou — backend e tela derrubados"; }
    mv "$ESTADO/dados.json.tmp" "$ESTADO/dados.json"
    ambiente_rede
    trap - EXIT
    cat "$ESTADO/dados.json"
    echo "✔ dados de teste em $ESTADO/dados.json"
}

case "${1:-}" in
    subir) subir ;;
    parar) parar ;;
    *) echo "uso: $0 subir|parar"; exit 2 ;;
esac
