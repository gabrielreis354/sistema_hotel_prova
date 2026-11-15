# Para o Weslley — fechamento do MVP (15/11/2026)

Oi, Weslley. O plano completo de fechamento está em `docs/PLANO_FECHAMENTO_MVP_15NOV2026.md`.
Esta mensagem traz só a sua parte, e dá para ler sem abrir o plano.

## Onde estamos

Em 14/11 fizemos o primeiro ensaio completo do roteiro de demonstração, e os 7 passos
funcionaram. O PIX com o Asaas, que você ensaiou em 12/11, está na `develop`, e também está lá a
correção que cancela o sinal quando a reserva é excluída ou entra por walk-in (#142). O
congelamento é em **24/11**.

## 1. Trocar a chave de sandbox do Asaas — já

A chave de teste apareceu num chat em 12/11. Gere outra no painel do Asaas sandbox, troque no seu
`.env` local e revogue a antiga. A chave nunca vai para o repositório.

## 2. O sistema sobe na primeira tentativa — até 17/11

**Problema.** Num ambiente limpo, o primeiro `docker compose up -d` falha. O backend tenta
conectar no RabbitMQ antes de ele ficar pronto, e só um segundo `up` resolve (🟡-1 de
`docs/qa/ensaio_roteiro_14112026.md`). Na frente da banca não dá para contar com o segundo `up`.

**Caminho sugerido.** No `docker-compose.yml`:
- o backend e o analytics esperam o RabbitMQ com `depends_on: { rabbitmq: { condition: service_healthy } }`;
- o healthcheck do RabbitMQ ganha um `start_period` que cubra o primeiro boot.

**Critérios de aceite:**
- [ ] 3 ciclos seguidos de `docker compose down -v` + `docker compose up -d`, todos sem erro e sem segundo `up`;
- [ ] o README da raiz não manda mais rodar o `up` duas vezes, se mandar hoje.

## 3. Roteiro automatizado no CI — até 22/11

O ensaio de 14/11 foi feito por um script de navegador (Playwright) que passa pelos 7 passos. O
Gabriel vai colocá-lo no repositório até 20/11, em `frontend/e2e/`, com o comando `pnpm e2e`.

**O que fazer:** um job de CI que sobe o compose, roda as migrações e o seed e executa `pnpm e2e`.

**Critérios de aceite:**
- [ ] o job é **não bloqueante**: avisa, mas não impede o merge. Essa foi a proposta 7 do encontro de 03/11;
- [ ] não usa segredo real nenhum (PIX no modo simulado, `PIX_PROVIDER=fake`);
- [ ] também entra o job do frontend (lint, tipos e testes do `app-pms`), que estava pendente desde 31/10;
- [ ] **aquecer o Vite antes do roteiro**: abrir uma página e esperar. Em 15/11, a primeira rodada logo após subir o ambiente falhou nos 7 passos porque o Vite recarregou a página no meio, otimizando dependências. A segunda passou 7 de 7.

## 3b. Indicadores — gráfico de sazonalidade — antes de 24/11

O gráfico pula os meses sem reserva: o eixo vai de mar/26 direto para jun/26, enquanto o gráfico
de receita logo acima mostra todos os meses. Quem lê compara barras vizinhas como se fossem meses
seguidos. Preencher os meses vazios com zero, como o de receita já faz (achado 3 de
`docs/qa/revisao_telas_prontas_15112026.md`).

## 4. Documentos acadêmicos

A estimativa de custo da AWS (#146) e o Doc 08 precisam ser conferidos contra os critérios de
aceite do enunciado antes de cada reentrega ao professor.

## Datas

| Data | O quê |
|---|---|
| Já | Chave do Asaas trocada |
| 17/11 | Compose sobe na primeira tentativa |
| 22/11 | Roteiro e frontend no CI |
| 24/11 | Congelamento + segundo ensaio com todos |
| 01/12 | Versão final + ensaio geral |
| 10/12 | Apresentação |
