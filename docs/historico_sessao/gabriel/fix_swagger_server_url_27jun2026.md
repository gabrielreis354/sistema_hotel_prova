# Sessão — Correção da URL do servidor no Swagger

**Data:** 27/06/2026
**Dev:** Gabriel (orquestrado via Claude Code)
**Branch:** `fix/swagger-server-url` → merge em `develop` (push feito)
**Commit:** `3cfd09e` fix(swagger): usar URL de servidor relativa para o Try it out funcionar

---

## Contexto

Ao subir o ambiente (cluster K8s no minikube já estava no ar há ~42h) e abrir a
documentação Swagger, o **"Try it out" falhava com 404**. Objetivo da sessão:
garantir que o professor consiga **executar as rotas pelo Swagger** a partir da
máquina dele, do zero.

## Causa raiz

`config/swagger.js` tinha:

```js
servers: [{ url: 'http://localhost/api', description: 'Servidor local via Nginx' }]
```

Dois erros nessa URL:
1. **Porta 80** — no Windows conflita com o IIS (`C:\inetpub\wwwroot`), então as
   requests do Swagger UI nem chegavam no nginx do cluster.
2. **Prefixo `/api`** — não existe. O router (`routes/router.js`) é montado em `/`
   por `_web.js` (`web.use('/', router)`) e o nginx faz proxy de `/` → backend.
   As rotas reais são `/auth/login`, `/rooms`, `/reservations`, etc.

## Correção

URL relativa, resolvida pelo Swagger UI contra a mesma origem/porta em que a doc
foi aberta:

```js
servers: [{ url: '/', description: 'Mesma origem em que a documentação foi aberta' }]
```

Funciona em qualquer ambiente (docker-desktop `localhost:80`, minikube via
tunnel/port-forward, etc.) sem depender de porta fixa.

## Validação

- `POST /auth/login` (rota real, sem prefixo /api) testado durante o diagnóstico:
  `admin@aurora.example` / `senha123` → HTTP 200 com JWT. API íntegra.
- A correção é em build-time: quando o professor rodar `scripts/infra_up.sh`, a
  imagem é buildada do código corrigido e o Swagger dele já nasce certo.

## Fluxo para o professor usar o Swagger

1. `POST /auth/login` (não exige token) → copia o `token`
2. Botão **Authorize** (cadeado) → cola o token
3. "Try it out" nas rotas protegidas (`/rooms`, `/reservations`, ...)

## Pendências / observações

- Não foi feito redeploy no cluster local desta máquina (irrelevante para o
  professor, que sobe do zero). Se for demonstrar **neste** cluster, rodar:
  `eval $(minikube docker-env) && docker build -t sistema-gestao-hotel-backend:latest .`
  seguido de `kubectl rollout restart deploy/backend -n hotel-system`.
- Port-forward de teste usado nesta sessão: `kubectl port-forward -n hotel-system
  svc/nginx 18080:80` (8080 e 80 estavam ocupadas pelo IIS no host Windows).
