### 2026-06-26 — Sirlande

- **Branch:** `docs/analise-docker-compose`
- **Horário:** sessão única
- **Objetivo da sessão:** Analisar o `docker-compose.yml` da branch `main` em busca de conflitos com o `README.md` e impacto na avaliação pelo professor

---

#### O que foi feito

Análise comparativa entre `docker-compose.yml` e `README.md` (branch `main`). Foram identificados três pontos de atenção descritos abaixo.

---

#### Achados da análise

##### Achado 1 — Postgres sem porta exposta para o host (docker-compose)

**Contexto:** O `docker-compose.yml` define o serviço `postgres` sem nenhum mapeamento de `ports:`. O banco fica acessível apenas dentro da rede interna `hotel_network`.

**Impacto no README:** O README instrui o avaliador a rodar `docker compose up -d postgres` como alternativa ao `kubectl port-forward` para executar os testes:

```
Alternativa com Docker Compose (mais simples para testes):
docker compose up -d postgres
```

Se o professor seguir esse caminho alternativo, a conexão em `localhost:5432` falha com "connection refused" — os testes não sobem.

**Situação atual:** O professor foi orientado a seguir o **caminho principal via Kubernetes**, onde o `kubectl port-forward` funciona corretamente. O problema não bloqueia a avaliação nesse cenário.

**Correção pendente (decisão do develop):**

```yaml
# docker-compose.yml — serviço postgres
ports:
  - "5432:5432"
```

---

##### Achado 2 — Redis definido no compose, mas não utilizado pela aplicação

**Contexto:** O `docker-compose.yml` define um serviço `redis` com o comentário "terceira camada obrigatória da arquitetura". O serviço `node_web` recebe `REDIS_URL: redis://redis:6379` e tem `depends_on: redis: condition: service_healthy`.

**Problema:** Nenhum arquivo em `app/` consome Redis. A variável `REDIS_URL` é injetada mas nunca lida pelo código.

**Consequência:** Se o Redis falhar ao iniciar (porta ocupada, imagem indisponível), o `node_web` **não sobe** — mesmo que a aplicação não dependa funcionalmente do Redis.

**Correção pendente (decisão do develop):** Remover o serviço `redis` e o `depends_on` correspondente do `docker-compose.yml`, ou implementar o uso efetivo de Redis na aplicação se a feature for planejada.

---

##### Achado 3 — README descreve o compose como "exclusivamente para testes" mas ele contém a stack completa

**Contexto:** O README afirma:

> "O `docker-compose.yml` ainda está disponível no repositório **exclusivamente como apoio para rodar os testes automatizados** localmente"

No entanto, o arquivo define toda a stack de produção: Postgres + Redis + Node.js + Nginx.

**Impacto:** Gera confusão sobre a finalidade do arquivo. Um avaliador que tente usar o compose para subir o ambiente completo pode encontrar comportamento inesperado (Redis sem porta, backend sem porta exposta diretamente, etc.).

**Correção pendente (decisão do develop):** Alinhar o `docker-compose.yml` com a descrição do README (simplificar para apenas o Postgres + porta exposta) ou atualizar o README para refletir que o compose sobe a stack completa.

---

#### Commits gerados

| Hash | Mensagem |
|------|----------|
| — | `docs(historico): add analise docker-compose 26062026 (sirlande)` |

#### Pendências

| # | Pendência | Prioridade | Observação |
|---|-----------|------------|------------|
| 1 | Adicionar `ports: 5432:5432` ao postgres no `docker-compose.yml` | 🟡 Média | Não bloqueia avaliação (professor usa K8s), mas quebra o caminho alternativo de testes documentado no README |
| 2 | Remover Redis do compose ou implementar seu uso no app | 🟡 Média | Redis como `depends_on` pode impedir o backend de subir via compose sem motivo funcional |
| 3 | Alinhar README com a real finalidade do `docker-compose.yml` | 🟢 Baixa | Contradição textual — não impacta funcionamento |
