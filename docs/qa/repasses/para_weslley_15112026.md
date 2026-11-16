# Repasse para Weslley — 15/11/2026

Origem: QA Red Team da branch `feature/m8-seed-datas-do-dia` (Sirlande), relatório em
`docs/qa/redteam_m8-seed-datas-do-dia_15nov2026.md` (achado 🟡-3).

### 🟡 [Seed / start.sh] `./start.sh seed` não aplica o `seed_hoje.sql` do M8
**Onde:** `start.sh:188` e `start.sh:192` (a lista `seed_hotels.sql seed_consumo.sql`)
**Cenário:** o M8 acrescentou `seed_hoje.sql` à lista do `node command.js seed`
(`services/core-service/command.js:99`). Ele ancora o cenário da demonstração no dia em que o seed roda e
põe as estadias CHECKED_IN em quartos OCCUPIED. No cluster, `ALLOW_SEED=1 ./start.sh seed`
continua aplicando só os dois arquivos antigos. O painel Hoje e os cartões do gerente aparecem zerados,
e o cenário "Livres 15 · Ocupação 0% com hóspedes na casa" segue aberto. O comentário em `start.sh:184`
diz que a ordem é a do `command.js`, e ela divergiu.
**Regra violada:** DRY (a lista de arquivos do seed existe em dois lugares).
**Correção sugerida:** incluir `seed_hoje.sql` por último nos dois laços (`for file in seed_hotels.sql
seed_consumo.sql seed_hoje.sql`). Coordenar com o Sirlande o merge depois do M8 entrar na develop.

---

Origem: subida do compose para validar o M8 de ponta a ponta (Sirlande, 15/11, Docker Desktop 29.5.3).

### 🔴 [Compose / contingência] A imagem do MinIO não baixa mais: `docker compose up` falha num computador limpo
**Onde:** `docker-compose.yml:48` e `:67` (`image: quay.io/minio/minio:latest`, serviços `minio` e `minio-setup`)
**Cenário:** em 15/11, `docker compose up -d --build` parou no pull:
`failed to resolve reference "quay.io/minio/minio:latest": ... 401 UNAUTHORIZED`. Uma tag fixa
(`RELEASE.2025-04-22T22-12-26Z`) dá o mesmo 401, e `GET https://quay.io/v2/minio/minio/tags/list` também.
`minio/minio` e `minio/mc` no Docker Hub respondem "pull access denied" (o comentário da linha 46 já
registra a saída de lá em set/2026). Em máquina que ainda tem a imagem em cache nada aparece; numa
máquina limpa — a da banca, ou o ensaio de 24/11 "num ambiente recém-criado" — o sistema não sobe.
O backend depende de `minio` (healthy) e `minio-setup` (completed), e o nginx tem `upstream minio:9000`
fixo, então não dá para só tirar o serviço.
**Como validei o M8 sem ele:** override local (fora do git) trocando os dois serviços por um
`nginx:1.27-alpine` que só resolve o nome `minio`. Tudo mais subiu (core, RabbitMQ, analytics, nginx), mas
o download de PDF fica fora.
**Correção sugerida (decisão sua):** (a) uma imagem S3-compatível pública e fixa por digest, conferindo se o
`infra/k8s/minio-setup.sh` (usa `mc`) continua funcionando; ou (b) `docker save` da imagem que ainda estiver
em cache em alguma máquina do trio e `docker load` no computador da banca, com o digest anotado no roteiro.
O mesmo vale para `infra/k8s/` se ele usa a mesma imagem.

---

Origem: QA explorador no navegador da branch `feature/m8-seed-datas-do-dia` (`a0441eb`), relatório em
`docs/qa/exploratorio_m8-seed-painel-hoje_15nov2026.md`. Os achados abaixo são da tela de Indicadores e não reprovam o M8.

### 🟢 [Indicadores] "Meios de pagamento" mostra o código `CARTAO` cru
**Onde:** `/indicadores` (ADMIN, 1366), tabela "Recebido por meio de pagamento". O mapa de rótulos fica em `frontend/apps/pms/src/features/analytics/shares.ts`.
**Passos:** entre como `admin@aurora.example` e abra `/indicadores`.
**Obtido:** as linhas mostram "CARTAO · 3 · R$ 3.950,00", ao lado de "PIX" e de "Dinheiro" (este com rótulo). Na Pousada Sol aparecem "CARTAO", "PIX" e "Dinheiro". O mapa conhece `CARTAO_CREDITO` e `CARTAO_DEBITO`, mas não o `CARTAO` antigo, que o seed grava. A conta da reserva já trata esse valor (`reservationLogic.ts:249-250`, "Cartão").
**Quem ganha:** o gerente lê "Cartão" em vez de um código de banco.
**Evidência:** `evidencias/m8-seed-painel-hoje_15112026/03_indicadores_admin_1366_inicial.png`.
**Sugestão:** acrescentar `CARTAO: 'Cartão'` ao mapa do `shares.ts`, como a conta da reserva já faz.

### Nota, já conhecido (🟢-2 do red team de 31/10): "Última saída" com data futura ficou visível no ranking
Com o seed do dia, Isabela Castro (17/11/2026), Henrique Dias e Felipe Rocha (18/11/2026) aparecem em "Hóspedes frequentes" com uma "Última saída" que ainda não aconteceu. O ponto já está registrado em `docs/qa/redteam_t056-indicadores_31out2026.md` (🟢-2). Fica a nota de que agora ele aparece na demonstração.
