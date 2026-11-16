# QA explorador — M8: seed do dia no painel Hoje, Reservas, Quartos, Indicadores e Comanda
**Branch:** `feature/m8-seed-datas-do-dia` (`a0441eb`) · **Tela(s):** `/`, `/reservas`, `/reservas/:id` (Resumo e Conta), `/reservas/nova` (só a lista de quartos), `/quartos`, `/indicadores`, `/comanda` e `/comanda/:id` (leitura) · **Data:** 15/11/2026 (16h30 a 16h45, horário de Brasília) · **Papéis usados:** RECEPTIONIST (`recep1@aurora.example`), ADMIN (`admin@aurora.example`, `admin@sol.example`), WAITER (`garcom@aurora.example`)
**Viewports:** 1366×768, 768×1024, 375×812 · **Achados no escopo:** 3 (🔴 0 · 🟡 1 · 🟢 2) · **Repassados:** 9 (Gabriel 7, Weslley 1 novo + 1 nota já conhecida)

## Ambiente (exceção ao §5)
- **Exceção autorizada pelo Sirlande nesta sessão:** em vez do `scripts/qa_explorador_ambiente.sh` e do banco `gestao_hotel_qa`, usei a stack Docker Compose descartável `gesway-m8`, só em localhost. Tela no Vite `:5173`, core em `127.0.0.1:3000`, analytics pelo nginx em `:80`. **Motivo:** a porta 3000 estava ocupada por essa stack, e o `gestao_hotel_qa` não tem o cenário do seed nem o analytics-service, que são justamente o que esta entrega mostra. A stack tem só os dados fictícios do seed e será apagada (`down -v`) depois do teste.
- Não rodei o script do ambiente nem mexi em configuração. Não li `.env` nem chaves. Para o eixo Rede, resolvi os caminhos do Playwright do MCP com o mesmo trecho de `node` da função `ambiente_rede` do script. O trecho só lê o registro do MCP e grava os três caminhos em `ambiente.env`, no scratchpad da sessão.
- MinIO desligado na stack: PDF e comprovante para download ficaram fora, como combinado.
- O MCP também gravou snapshots `.yml` e logs de console soltos em `docs/qa/evidencias/` (fora do git).

## Veredito
**APROVADO COM RESSALVAS.**

O seed do dia faz o que promete. Logo depois do seed, os números do Aurora e da Sol batem, um a um, com o esperado. A tabela abaixo compara o esperado com o que a tela mostrou.

| Item | Esperado | Tela |
|---|---|---|
| Aurora · Chegadas | 2 (201 com sinal, 102 sem sinal) | 2. O 102 aparece com "Sem pagamento · risco de no-show" e o 201 sem selo |
| Aurora · Saídas / Na casa / Em limpeza | 1 (107) / 4 (106, 107, 203, 302) / 1 (105) | 1 / 4 / 1, com "Liberar quarto" |
| Aurora · Ocupação, ADR, RevPAR, Recebido hoje | 26,67% · R$ 338,89 · R$ 90,37 · R$ 510,00 | 26,7% · R$ 338,89 · R$ 90,37 · R$ 510,00 |
| Sol · Chegadas / Saídas / Na casa / Em limpeza | 1 (5) / 1 (10) / 2 (4, 10) / 1 (3) | idem |
| Sol · Ocupação, Recebido hoje | 20% · R$ 480,00 | 20,0% · R$ 480,00 |
| Quartos × hóspedes | ocupado ⇔ na casa | `/quartos`: 106, 107, 203, 302 Ocupado e 105 Limpeza. A Nova reserva (15→16/11) oferece 101, 103, 104, 105, 108, 202, 204, 205 e 301, nenhum com hóspede |
| Comanda | Suíte 106 com consumos da estadia; Mesa 3 e day-use de hoje | Suíte 106: cerveja e fritas em 13/11 21:30, lavanderia em 14/11 09:00 e vinho como cortesia. Mesa 3 "aberta às 12:10" e Day-use "aberta às 10:00", ambas de hoje. Nada "desde junho" |

Os 4 passos do roteiro do balcão fecharam:
- check-in do 201;
- no-show do 102 visível;
- check-out do 107;
- liberação do 105.

O banco ficou coerente (conferido em `/quartos`). A conta da Suíte 201 abriu no check-in e a da 107 fechou no check-out. O isolamento passou: o admin da Sol vê só os dados da Sol, e as URLs de reserva e de conta do Aurora respondem 404 ("Reserva não encontrada" e "Conta não encontrada").

A ressalva da entrega é o 🟡 abaixo: **a saída do dia (107) já está paga, então o check-out do roteiro não passa pelo pagamento.** Os 🟡 do painel (cartões do topo atrasados, duplo clique, rolagem lateral em 768) são do código de outro dono e foram repassados. Eles não reprovam o M8, mas o primeiro aparece na frente da banca no passo 4 (ver "Repassados").

## Achados no escopo

### 🟡 [Domínio] A saída do dia (107) já está quitada: o check-out do roteiro não mostra o pagamento
**Onde:** `/` → Saídas → Gabriela Nunes, Quarto 107 → "Fazer check-out". E também `/reservas/72b68314-…?aba=conta`.
**Passos:**
1. Entre como `recep1@aurora.example` e abra `/`.
2. Em Saídas, clique em "Fazer check-out" do 107.
3. A confirmação diz "Conta quitada". Em "Abrir conta", a linha do tempo mostra 3 diárias de R$ 150,00 e "Pagamento · Cartão −R$ 450,00" em 12/11 15:00, com saldo R$ 0,00 e sem consumo.
**Esperado:** o passo 3 do roteiro pedido ("check-out da saída do dia (107) com o pagamento") e o passo 5 do roteiro da banca (`docs/PLANO_FECHAMENTO_MVP_15NOV2026.md` §3: "no check-out … o pagamento é registrado, e a conta e a estadia fecham") pedem uma saída do dia com saldo a receber.
**Obtido:** o `seed_hoje.sql` põe o 107 como `('aurora','30000000007','107',-3,0,'CHECKED_IN',450.00,'CARTAO','entrada')`, pago inteiro na entrada, e a Suíte 107 não tem consumo. O check-out fecha direto, sem o formulário de pagamento. A única estadia com saldo é a do 106 (R$ 125,00 de consumo), que só sai em 18/11. Para mostrar o pagamento, a banca teria de ver um check-out antecipado do 106 ou um walk-in criado na hora.
**Por que não é 🔴:** o passo 5 ainda fecha pelo 106 (o check-out está habilitado) ou pelo walk-in do passo 2. O que se perde é o roteiro "abro o painel e faço a saída do dia".
**Evidência:** `evidencias/m8-seed-painel-hoje_15112026/05_hoje_logo_apos_checkout_107.png` mostra o aviso "Check-out de Gabriela Nunes feito. O quarto foi para limpeza e a conta fechou." O snapshot da aba Conta do 107 está descrito acima.
**Sugestão:** no seed do dia, deixar o 107 com saldo. Duas formas: pagamento de entrada parcial (por exemplo, R$ 300,00 de R$ 450,00, sobrando R$ 150,00) ou 2 ou 3 consumos na Suíte 107 datados de ontem. Nos dois casos, o check-out do painel mostra "Saldo R$ … — Abrir conta" e o pagamento entra no roteiro. Se a mudança for no pagamento de entrada, revisar o teste `seed-hoje.test.js` e o resumo no fim do arquivo.

### 🟢 [Domínio] Os pagamentos novos do seed gravam o meio antigo `CARTAO`
**Onde:** `seed_hoje.sql`. O pagamento do check-out do 105 de hoje sai como `'CARTAO'`, e o mesmo vale para as estadias na casa.
**Obtido:** a conta da reserva traduz para "Cartão" (`reservationLogic.ts:249-250`, com o comentário "Linha antiga: … o seed usa 'CARTAO'"). Os Indicadores mostram o código cru: "CARTAO · 3 · R$ 3.950,00" no Aurora e "CARTAO" na Sol. A tela de pagamento só oferece `CARTAO_DEBITO` e `CARTAO_CREDITO`.
**Quem ganha:** o gerente na banca (passo 7) lê "Cartão de crédito" e não um código. O pagamento que o seed cria hoje fica igual ao que a recepção registraria.
**Sugestão:** usar `CARTAO_CREDITO` nas linhas novas do `seed_hoje.sql`. O rótulo que falta nos Indicadores foi repassado ao Weslley.

### 🟢 [Domínio] "Em limpeza desde 16:30" não combina com o check-out feito às 11:00
**Onde:** `/` → Em limpeza → "Quarto 105 · Standard · em limpeza desde 15/11/2026 16:30". No detalhe da reserva do 105, o pagamento do check-out está em "15/11/2026 11:00".
**Obtido:** o "desde" mostra a hora em que o seed rodou, porque o `UPDATE rooms SET status='CLEANING'` grava o `updated_at` do momento. O pagamento foi ancorado às 11h.
**Quem ganha:** quem lê o detalhe e o painel lado a lado (a banca): o quarto não parece ter ficado parado cinco horas sem motivo, nem ter saído depois de pagar.
**Sugestão:** no mesmo `UPDATE`, ancorar `updated_at` em `LEAST(agora, hoje 11:00)`, a mesma regra do pagamento. Também vale para o 3 da Sol.

## Melhorias de uso (🟢)
As melhorias estão nos dois 🟢 acima e nos 🟢 repassados. Não há outra melhoria específica do M8.

## Repassados a outro dev
| Sev. | Achado | Onde | Dono | Repasse |
|---|---|---|---|---|
| 🟡 | Os cartões do topo do painel ficam uma ação atrás (Ocupados 4 com Na casa 5; Em limpeza 1 com 2 na lista) e não se corrigem sem recarregar a página: `occupancy` sem refetch periódico | `/` Números do dia | Gabriel | `repasses/para_gabriel_15112026.md` (parte já conhecida: `para_gabriel_h3_04112026.md` 🟢, só para a lista) |
| 🟡 | Duplo clique em "Confirmar check-in" gera 2 PUT (200 + 422) e mostra erro de "outro atendimento" com `'CHECKED_IN'` cru num check-in que deu certo | `/` Chegadas | Gabriel | `repasses/para_gabriel_15112026.md` |
| 🟡 | Em 768 px, `/reservas`, `/quartos`, o detalhe da reserva e `/indicadores` rolam de lado (802 a 812 px) e cortam o saldo e o "Sair" (`md:grid-cols-[220px_1fr]`) | `AppShell.tsx` | Gabriel | `repasses/para_gabriel_15112026.md` |
| 🟢 | Linha do tempo da conta em 375: Valor e Saldo fora da área visível (rolagem interna) | `BillTimeline.tsx` | Gabriel | `repasses/para_gabriel_15112026.md` |
| 🟢 | Confirmação na linha: Esc não fecha e o foco não entra nela | `/` | Gabriel | `repasses/para_gabriel_15112026.md` |
| 🟢 | "Liberando…" sem aviso de rede quando está offline (completa sozinho quando a rede volta) | `/` | Gabriel | `repasses/para_gabriel_15112026.md` |
| 🟢 | Com `/reservations` em 503, o bloco Saídas diz "hóspedes na casa" | `/` | Gabriel | `repasses/para_gabriel_15112026.md` |
| 🟢 | "Meios de pagamento" mostra `CARTAO` cru | `/indicadores` | Weslley | `repasses/para_weslley_15112026.md` |
| — | Já conhecido: "Última saída" futura no ranking (🟢-2 do red team de 31/10), agora visível com o seed | `/indicadores` | Weslley | nota em `repasses/para_weslley_15112026.md` |

**Já conhecidos, não contados:**
- Sazonalidade pula meses (`revisao_telas_prontas_15112026.md` item 3, SPEC-09 §4).
- Marca "Hotel PMS" (SPEC-08 T-08.2).
- "Sair" com 36 px no celular (SPEC-08 T-08.6). Medido de novo: 51×36.
- Três botões desabilitados na reserva encerrada (SPEC-08 T-08.3).
- `./start.sh seed` sem o `seed_hoje.sql` (repasse ao Weslley de hoje).
- MinIO (repasse ao Weslley de hoje).
- A conta "Equipe e perdas — junho aberta em 01/06" segue com a data de junho. Está coerente com o próprio nome e não entra na regra "nunca desde junho" (que vale para a Suíte, a Mesa 3 e o day-use). Fica como observação, não como achado.

## Mapa de cobertura
| Eixo (§3) | Tentado? | Como | Resultado |
|---|---|---|---|
| Entrada | Não | Fora do foco: o M8 é dado e o roteiro não digita valor | — |
| Tempo | Sim | Duplo clique em "Confirmar check-in"; esperas de 5, 20, 60 e 90 s depois de cada ação para ver o painel se atualizar | 🟡 duplo PUT (repassado); 🟡 cartões atrasados (repassado) |
| Rede | Sim | `rede_painel_hoje.mjs`: analytics em 502, `/reservations` em 503, `occupancy` lenta (4 s). `rede_offline_liberar.mjs`: liberar sem rede e com a rede voltando | 502 do analytics: cartões e alertas mostram erro com "Tentar de novo", e chegadas e saídas seguem operando (o selo de no-show some, porque vem do analytics; é a regra da T-05.3). 503: três blocos com "Tentar de novo". Lenta: "—" enquanto carrega. Offline: 🟢 sem aviso (repassado) |
| Sessão e papéis | Sim | Garçom abrindo `/indicadores` e `/reservas/<id>`; admin da Sol abrindo a reserva e a conta do Aurora pela URL | Garçom volta para `/comanda`. Sol recebe 404 nas duas, com mensagem e "Voltar" ou "Tentar de novo". Listas da Sol sem nada do Aurora. Sessão vencida: não testada |
| Tela | Sim | 1366×768, 768×1024 e 375×812 em `/`, reserva 105 e 106, `/indicadores`, `/reservas`, `/quartos` e `/comanda`; medida de `scrollWidth` e de alvos < 48 px | 1366 ok. 768: 🟡 rolagem lateral (repassado). 375: sem rolagem lateral; único alvo pequeno é o "Sair", já conhecido. Zoom de 200%: não testado |
| Teclado | Parcial | Enter, Esc e Tab na confirmação de "Liberar quarto" | 🟢 Esc não fecha (repassado) |
| Leitura | Sim | `browser_snapshot` em todas as telas | Status com cor e rótulo (Confirmada, Hospedado, Limpeza, Finalizada); abas com papel de aba; tabelas com caption. Botões "Fazer check-in" repetidos sem o nome do hóspede no nome acessível (padrão da T-05.3, não registrado como achado) |
| Estados | Sim | Bloco vazio (Saídas 0 depois do check-out), erro (scripts), carregando (`occupancy` lenta) e dados | Vazio com texto e próximo passo; erro com "Tentar de novo" |
| Domínio | Sim | Diárias × valor de cada estadia (106: 5×150 = 750; 203: 4×350 = 1.400; 302: 4×800 = 3.200; 201: 2×350 = 700, sinal de 210 = 30%); saldo do 106 = consumos 48 + 32 + 45 = 125, com o vinho como cortesia fora; 105: 300 − 300 = 0; Recebido hoje = 210 + 300; máquina de quartos depois de cada ação conferida em `/quartos` | Tudo bate. 🟡 do 107 já quitado (no escopo) |

## Não foi possível testar
- **Download de PDF e comprovante:** MinIO desligado na stack (combinado, não é achado).
- **Zoom de 200% e sessão vencida no meio da tarefa:** ficaram de fora por tempo. Não são do M8.
- **Virada do dia com a tela aberta e seed rodado de madrugada** (a regra "ontem, se o seed rodou cedo"): o relógio da stack é o de agora (16h30). Isso só se prova com o `SET seed.agora` dos testes, que são do red team e dos testes automatizados.
- **Rodar o seed de novo por cima do banco usado:** exigiria mexer na stack. O comportamento está descrito no próprio `seed_hoje.sql` e coberto pelo red team (`redteam_m8-seed-datas-do-dia_15nov2026.md`).

## Comandos rodados pelo Bash
```
cd <repo>; wc -l frontend/DESIGN_PMS.md docs/specs/SPEC-05-frontend-pms.md; ls docs/specs/; ls docs/qa/; docker ps --format '{{.Names}} {{.Ports}}'
sed -n 1,172p frontend/DESIGN_PMS.md
grep -n -i -E "CA-05\.(3|4|6|7|8)|Hoje|indicador|pendên|\[ \]|no-show|limpeza" docs/specs/SPEC-05-frontend-pms.md; ls docs/specs/anexos; ls docs/qa/repasses
git diff --stat develop...HEAD; cat docs/qa/repasses/para_weslley_15112026.md; head -30 docs/qa/repasses/para_indefinido_15112026.md docs/qa/repasses/para_dono-indefinido_15112026.md
sed -n 1,236p services/core-service/seed/seed_hoje.sql
mkdir -p docs/qa/evidencias/m8-seed-painel-hoje_15112026; git check-ignore -v docs/qa/evidencias/m8-seed-painel-hoje_15112026/x.png; date; TZ=America/Sao_Paulo date
grep -rn -i -E "CARTAO|..." docs/qa/redteam_t056-indicadores_31out2026.md docs/qa/repasses/para_weslley_*.md docs/qa/revisao_telas_prontas_15112026.md ...   (procura de achados já conhecidos)
sed -n 30,110p docs/specs/SPEC-09-acabamento-telas-mvp.md
grep -n -i -E "duplo|...|invalida" docs/qa/redteam_t053-painel-hoje_04nov2026.md docs/qa/repasses/para_gabriel_04112026.md docs/qa/revisao_telas_prontas_15112026.md docs/retomada/feature-t053-painel-hoje.md
grep -n -i -B2 -A8 "eventual" docs/qa/repasses/para_gabriel_h3_04112026.md; grep -rn -i "eventual" docs/specs/...
grep -rln -i "roteiro" docs --include=*.md ...; grep -rn -i -E "7 passos|sete passos" docs --include=*.md
sed -n 1,80p docs/PLANO_FECHAMENTO_MVP_15NOV2026.md
grep -rn -i -E "overflow-x|rolagem (lateral|horizontal)" docs/qa/exploratorio_pagamento-checkout_11112026.md docs/qa/revisao_telas_prontas_15112026.md ...
cd frontend/apps/pms; grep -rln "Lançamentos da conta em ordem cronológica" src; git log --format=... -- src/features/reservations/components/BillTimeline.tsx; grep -rn -E "CARTAO" src/features/...
grep -rn -i -E "foco|focus|Esc" docs/qa/redteam_t053-painel-hoje_04nov2026.md docs/qa/repasses/para_gabriel_*.md ...
grep -rn -E "768" docs/qa/redteam_t056-indicadores_31out2026.md docs/qa/revisao_telas_prontas_15112026.md docs/qa/repasses/para_weslley_*.md
cd frontend/apps/pms; grep -rln "grid-cols-\[220px_1fr\]" src; git log -- src/components/AppShell.tsx; grep -n ... docs/DIVISAO_TRABALHO_TIME_09set2026.md
ls -d ~/.npm/_npx/*/node_modules/playwright-core; ls -d ~/.cache/ms-playwright/chromium*/
node -p "require('<core>/package.json').version" (x2); ls ~/.cache/ms-playwright/chromium-1254/
node rede_painel_hoje.mjs   (1ª tentativa, falhou por falta de libnspr4 sem o LD_LIBRARY_PATH)
grep -n -i "LD_LIBRARY\|..." scripts/qa_explorador_ambiente.sh; sed -n 40,80p scripts/qa_explorador_ambiente.sh
node -e '<trecho da ambiente_rede do script>' "$PWD" > <scratchpad>/ambiente.env
cd docs/qa/evidencias/m8-seed-painel-hoje_15112026 && set -a && source <scratchpad>/ambiente.env && set +a && LD_LIBRARY_PATH=$QA_LD_LIBRARY_PATH node rede_painel_hoje.mjs
cd docs/qa/evidencias/m8-seed-painel-hoje_15112026 && cat > rede_offline_liberar.mjs <<EOF ... && (mesmo source) && LD_LIBRARY_PATH=$QA_LD_LIBRARY_PATH node rede_offline_liberar.mjs
git rev-parse --short HEAD; git branch --show-current; ls docs/qa/evidencias/m8-seed-painel-hoje_15112026/
cat >> docs/qa/repasses/para_weslley_15112026.md <<EOF ...; sed -i (ajuste do rótulo da nota já conhecida)
```
Para reproduzir o eixo Rede, gere o `ambiente.env` com o `node -e` acima (o mesmo trecho da `ambiente_rede` do `scripts/qa_explorador_ambiente.sh`) e rode
`set -a; source ambiente.env; set +a; LD_LIBRARY_PATH=$QA_LD_LIBRARY_PATH node docs/qa/evidencias/m8-seed-painel-hoje_15112026/rede_painel_hoje.mjs`.
Atenção: `rede_offline_liberar.mjs` **libera de verdade** o primeiro quarto em limpeza quando a rede volta.

## Evidências (`docs/qa/evidencias/m8-seed-painel-hoje_15112026/`)
- `01_hoje_recepcao_1366_inicial.png`: painel do Aurora logo depois do seed (2 chegadas, 1 saída, 4 na casa, 1 em limpeza, 26,7%).
- `02_reserva_105_conta_1366.png`: reserva 105 finalizada, com 2 diárias de R$ 150,00, pagamento por cartão de −R$ 300,00 às 11:00 e saldo R$ 0,00.
- `03_indicadores_admin_1366_inicial.png`: indicadores do Aurora (26,7% · R$ 338,89 · R$ 90,37 · R$ 510,00) e a linha "CARTAO".
- `04_hoje_apos_checkin_201_duplo_clique.png`: alerta de 422 depois do duplo clique; Na casa 5 e Ocupados 4.
- `05_hoje_logo_apos_checkout_107.png` e `06_hoje_90s_apos_checkout_107_cartoes_velhos.png`: cartões atrasados (Ocupados 5 com Na casa 4; Em limpeza 1 com 2 na lista).
- `07_hoje_logo_apos_liberar_105.png`: depois de liberar o 105, os cartões mostram o estado anterior.
- `08_hoje_sol_admin_1366.png`: painel da Sol (1 chegada, 1 saída, 2 na casa, 1 em limpeza, 20%).
- `09_hoje_recepcao_768.png`, `10_hoje_recepcao_375.png`, `11_reserva_105_conta_375.png` e `12_indicadores_admin_375_pos_roteiro.png`: as telas em tablet e celular.
- `13_indicadores_admin_768_rolagem_lateral.png` e `14_reserva_106_conta_768_rolagem_lateral.png`: o corte em 768.
- `rede_*.png` e os scripts `rede_painel_hoje.mjs` e `rede_offline_liberar.mjs`: o eixo Rede.
