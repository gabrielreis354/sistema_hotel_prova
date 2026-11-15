# Repasse para Gabriel — 15/11/2026

Origem: QA explorador no navegador da branch `feature/m8-seed-datas-do-dia` (`a0441eb`), relatório em
`docs/qa/exploratorio_m8-seed-painel-hoje_15nov2026.md`. Ambiente: stack Compose descartável `gesway-m8`
(localhost), dados do seed do dia. Os achados abaixo são do painel Hoje e da casca do app, não do seed. Nenhum
deles reprova o M8.

---

### 🟡 [Domínio · Estados] Os cartões do topo do painel Hoje ficam uma ação atrás e não se corrigem sozinhos
**Onde:** `/` — região "Números do dia" (Vendidos hoje, Ocupados, Livres, Em limpeza, Ocupação), que lê `GET /api/analytics/occupancy`.
**Passos:**
1. Entre como `recep1@aurora.example` e abra `/` (1366×768). O topo mostra Ocupados 4 · Livres 10 · Ocupação 26,7%.
2. Faça o check-in do quarto 201 ("Fazer check-in" → "Confirmar check-in").
3. O bloco "Na casa" passa a 5, mas o topo mostra **Ocupados 4 · Vendidos 5 · Ocupação 26,7%**. O certo seria 5 · 6 · 33,3%.
4. Faça o check-out do 107. O aviso diz "O quarto foi para limpeza", mas o topo mostra **Ocupados 5 · Em limpeza 1**, com "Na casa 4".
5. Espere 90 s sem tocar na tela. O bloco "Em limpeza" se corrige aos 60 s (refetch dos alertas). Os **cartões não se corrigem**: nenhum novo `GET /analytics/occupancy` sai.
6. Libere o 105. Os cartões passam a mostrar o estado **anterior** (o do check-out): sempre uma ação atrás.
**Esperado:** depois de cada ação o topo bate com os blocos ("critério do time": a tela acompanha o status; o roteiro do passo 4 é lido pela banca).
**Obtido:** a invalidação refaz o `GET /analytics/occupancy` logo depois do 200 do core. O analytics ainda não projetou o evento (consistência eventual), e a consulta não tem `refetchInterval`. As requisições 153→160 da sessão mostram isso: o `PUT …/check-in` e, em seguida, o `occupancy` ainda com `occupied: 4`.
**Já conhecido em parte:** a defasagem da **lista** de limpeza está em `para_gabriel_h3_04112026.md` (🟢). Os cartões sem refetch periódico não estão registrados.
**Evidência:** `evidencias/m8-seed-painel-hoje_15112026/04_hoje_apos_checkin_201_duplo_clique.png`, `05_hoje_logo_apos_checkout_107.png`, `06_hoje_90s_apos_checkout_107_cartoes_velhos.png` (Ocupados 5 com Na casa 4; cartão Em limpeza 1 com o bloco em 2) e `07_hoje_logo_apos_liberar_105.png`.
**Sugestão:** pôr no `occupancy` o mesmo `refetchInterval` dos alertas e um segundo refetch alguns segundos depois do sucesso da ação. Ou ajustar o cartão no cache de forma otimista (+1 ocupado no check-in; −1 ocupado e +1 limpeza no check-out; −1 limpeza e +1 livre no release).

### 🟡 [Tempo] Duplo clique em "Confirmar check-in" envia dois PUT e mostra erro de "outro atendimento" num check-in que deu certo
**Onde:** `/` — bloco Chegadas, botão "Confirmar check-in" (o mesmo vale para a confirmação de check-out, que usa o mesmo caminho).
**Passos:** 1. Em `/`, clique em "Fazer check-in" do quarto 201. 2. Dê **duplo clique** em "Confirmar check-in".
**Esperado:** um PUT só (botão travado enquanto grava) e o aviso de sucesso ("critério do time": ação que grava não duplica; erro só quando houve erro).
**Obtido:** saem `PUT /api/reservations/<id>/check-in` → 200 e, em seguida, outro PUT → 422. A tela mostra só o alerta "A reserva mudou de situação em outro atendimento (Check-in não permitido no status 'CHECKED_IN'). A tela foi atualizada — confira antes de tentar de novo.". A recepcionista lê que falhou, mas o check-in foi feito. O texto ainda expõe o código interno `'CHECKED_IN'`.
**Evidência:** `04_hoje_apos_checkin_201_duplo_clique.png`, mais o console (`422 Unprocessable Entity` em `/check-in`).
**Sugestão:** desabilitar "Confirmar check-in/check-out" enquanto `mutation.isPending` e ignorar o segundo disparo. Na mensagem do 422, não concatenar o texto cru do backend.

### 🟡 [Tela] Em 768 px (tablet do balcão) toda tela com tabela ganha rolagem lateral e corta o saldo e o "Sair"
**Onde:** `frontend/apps/pms/src/components/AppShell.tsx` — `md:grid md:grid-cols-[220px_1fr]`.
**Passos:** 1. Redimensione para 768×1024. 2. Abra `/reservas`, `/quartos`, `/reservas/<id>?aba=conta` ou `/indicadores`.
**Esperado:** nenhuma rolagem lateral ("critério do time"; o 768 é o tablet do balcão e do gerente).
**Obtido:** `scrollWidth` de 812 em `/reservas`, 802 em `/quartos`, 806 no detalhe da reserva e 802 em `/indicadores`, para uma largura de 768. O "Saldo da estadia R$ 125,00" e o "Sair" ficam cortados na borda. `/` e `/comanda` ficam em 768, sem rolagem. A causa é o `1fr`, que vale `minmax(auto, 1fr)`: a coluna cresce até a largura mínima da tabela (516 px nas tabelas dos Indicadores).
**Evidência:** `14_reserva_106_conta_768_rolagem_lateral.png` e `13_indicadores_admin_768_rolagem_lateral.png`.
**Sugestão:** `md:grid-cols-[220px_minmax(0,1fr)]` (ou `min-w-0` no contêiner do conteúdo). Conferir em seguida se as tabelas têm `overflow-x-auto` próprio.

### 🟢 [Tela] No celular, a linha do tempo da conta esconde as colunas Valor e Saldo
**Onde:** `/reservas/<id>?aba=conta`, `BillTimeline.tsx` em 375×812.
**Obtido:** a tabela tem 520 px dentro de um `overflow-x-auto` de 309 px. Sem rolar a tabela de lado, a recepção vê "Quando" e "Lançamento", mas nenhum valor. A página em si não rola de lado. Os totais embaixo (Diárias e consumos, Pago, Saldo) aparecem.
**Quem ganha:** o gerente no celular (DESIGN_PMS §1) lê os valores sem gesto lateral.
**Evidência:** `11_reserva_105_conta_375.png`.
**Sugestão:** no celular, empilhar a linha (data e lançamento em cima, valor e saldo embaixo, à direita).

### 🟢 [Teclado] A confirmação na linha não fecha com Esc e o foco não entra nela
**Onde:** `/` — "Liberar quarto" → confirmação "Confirmar que o quarto … está limpo" (o mesmo padrão vale para check-in e check-out).
**Passos:** foque "Liberar quarto" pelo teclado e tecle Enter. O botão fica desabilitado, o foco vai para o `body` e a confirmação abre. Esc não fecha. Um Tab leva a "Liberar para a venda".
**Quem ganha:** a recepcionista, que é usuária de teclado (DESIGN_PMS §1): Enter → Enter confirma, e Esc desiste sem mouse.
**Sugestão:** levar o foco ao botão de confirmar quando a confirmação abrir, e fechar com Esc devolvendo o foco ao gatilho.

### 🟢 [Rede] "Liberar quarto" sem rede fica em "Liberando…" sem dizer por quê
**Onde:** `/` em 375×812, bloco Em limpeza.
**Passos:** script `evidencias/m8-seed-painel-hoje_15112026/rede_offline_liberar.mjs` (desliga a rede, libera, espera 20 s e religa).
**Obtido:** 20 s em "Liberando…", sem nenhum aviso de conexão. Quando a rede volta, o PUT sai sozinho e o aviso "Quarto 107 liberado" aparece. A tela não finge que gravou, mas também não explica a espera. Quem recarrega a página nesse meio perde a ação.
**Evidência:** `rede_offline_liberar_20s_375.png` e `rede_offline_liberar_rede_volta_375.png`.
**Sugestão:** mostrar "Sem conexão: a liberação será enviada quando a rede voltar" enquanto a mutação está pausada (`isPaused` do TanStack Query).

### 🟢 [Texto] Com `/reservations` fora do ar, o bloco Saídas diz "Não foi possível carregar os hóspedes na casa"
**Onde:** `/`, bloco Saídas, com `GET /api/reservations?…` em 503 (script `rede_painel_hoje.mjs`, cenário `reservations_503`).
**Sugestão:** "Não foi possível carregar as saídas do dia". As duas listas usam a mesma consulta, mas quem lê o bloco Saídas espera ler sobre as saídas.

---

## Repasse do red team do 404 de id inválido (15/11)

Origem: red team da branch `fix/reserva-id-invalido-404` (`docs/qa/redteam_reserva-id-invalido_15nov2026.md`).
Área: endpoint público do motor de reserva (T-06.5, trilha do Gabriel, DIVISAO §3.1).

## 🟡 [Robustez / endpoint público] `GET /public/:subdomain/bookings/:id/status` com `:id` não-UUID → 500
**Onde:** `services/core-service/routes/apis/publicBookingRouter.js:21` → `GetBookingStatusController`.
**Cenário (reproduzido):** `GET /public/probe/bookings/x/status`, sem token, responde `500 {"error":"Erro interno do servidor"}`. Qualquer pessoa na internet produz 500 à vontade nessa rota: os alertas de taxa de erro disparam e o log enche de stack com SQL. O corpo não expõe dado.
**Regra violada:** um recurso inexistente deve responder 404. Para rota pública, a regra pesa mais, porque não há autenticação filtrando quem chega.
**Correção sugerida:** `isUuid` no controller, ou `router.param(id, …)` no `publicBookingRouter`, devolvendo o mesmo 404 de reserva inexistente (sem diferenciar formato inválido de id ausente).

---

## Repasse do red team da T-08.4 (SPEC-08, #162), 15/11

Gravado em /tmp porque o orquestrador pediu a saída só lá. Acrescentar ao `docs/qa/repasses/para_gabriel_15112026.md` do dia.

### 🟢 [UI] O aviso de truncamento de Saídas usa os números de "Na casa"
**Onde:** `frontend/apps/pms/src/features/today/TodayPage.tsx:144`, `components/TodayBlock.tsx:47-50`
**Cenário:** com 130 hóspedes CHECKED_IN e 12 saindo hoje, o bloco Saídas mostra "Mostrando 100 de 130. A lista completa está em Reservas." acima de 12 linhas. O número não descreve o bloco, e uma saída atrasada pode estar entre os 30 não carregados sem aparecer.
**Regra:** GUIA regra 8; contador fiel ao bloco (CA-05.3.e)
**Correção sugerida:** um texto específico ("Há mais hóspedes na casa do que o painel carrega; confira as saídas em Reservas") ou uma consulta própria de saídas com `to=today`.

### 🟢 [UI] "Na casa" corta em 100 sem avisar
**Onde:** `TodayPage.tsx:151-165` (sem `truncated`), `todayApi.ts:10,17`
**Cenário:** com 120 hóspedes na casa, a pílula mostra "100" e não há aviso. Os outros 20 não existem para o painel.
**Correção sugerida:** passar também a "Na casa" `truncated={inHouse.data && { shown: inHouse.data.data.length, total: inHouse.data.total }}`.
