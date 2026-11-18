# Repasse para Gabriel — 17/11/2026

Origem: pendências 🟢 do relatório do Sirlande de 16 e 17/11
(`docs/historico_sessao/sirlande/spec10_login_comanda_quantidade_pagamento_17nov2026.md`, itens 5 a 7).
Nenhum dos três bloqueia o congelamento de 24/11. Os três pedem uma decisão sua: dois tocam em arquivos seus, e o
terceiro está sem dono.

---

### 🟢 [UI] Borda lateral colorida no aviso "Saldo em aberto" do check-out
**Onde:** `frontend/apps/pms/src/features/today/components/rows.tsx:371`. É o aviso dentro da confirmação de check-out
do painel Hoje: `rounded-md border-l-4 border-status-cleaning bg-status-cleaning/10`. A linha nasceu no `801bc7d` (T-05.3).
**Regra:** a skill de design do projeto (Impeccable, `reference/craft-floor.md`, lista do que recusar) não aceita
"`border-left` colorida acima de 1 px em cards, itens de lista, callouts ou alertas". A faixa lateral é o padrão de
aviso genérico que essas regras querem tirar. O aviso já se distingue pelo fundo âmbar e pelo texto.
**Atenção, o padrão não é só desse arquivo:**

| Onde | Dono |
|---|---|
| `frontend/packages/ui/src/Notice.tsx:24` (todo `Notice`, inclusive o do pagamento da reserva e o da mesa) | sem dono (`packages/ui`, DIVISAO §7) |
| `frontend/apps/pms/src/features/accounts/components/OfflineBanner.tsx:15` (faixa de sem conexão da comanda) | Sirlande: **já trocado** pelo ícone `WifiOff` no #185 (17/11) |
| `frontend/apps/pms/src/components/AppShell.tsx:197` (`border-l-2` do item ativo do menu) | indicador de navegação, não é aviso; pode ficar |

**Sugestão:** decidir uma vez para o sistema todo, em vez de corrigir só o `rows.tsx`. Um bom momento é a passada visual
nas 13 telas, que a SPEC-10 prevê junto com a T-10.2 (marca no `tokens.css`). Uma saída é trocar a faixa por um ícone de status antes do texto (como o ponto verde do
"Conta quitada.", logo abaixo, no mesmo arquivo) e manter o fundo tonal. O Sirlande já fez essa troca no `OfflineBanner` (#185).
Ela pode servir de referência para o `rows.tsx`. O `Notice` fica com quem pegar o `packages/ui`.

### 🟢 [DRY] `formatDayMonth` no `@hotel/domain`
**Onde:** `frontend/apps/pms/src/features/today/todayLogic.ts:201-205`. O selo "Atrasada · dd/MM" monta a data com
`check_in_date.split('-')`. O código é do Sirlande (`1ef5196`, ressalvas da T-08.4). Ficou registrado como 🟢4 em
`docs/qa/redteam_t084-ressalvas_16112026.md`.
**Por que vem para você:** a função iria para `frontend/packages/domain/src/dates.ts`, que é seu, ao lado do
`formatDateBR`. Hoje o resultado é o mesmo, porque `check_in_date` é `DATEONLY` e não sofre fuso. Mas é a única data da
tela formatada à mão.
**Sugestão:** `formatDayMonth(value)` com `formatInTimeZone(parseHotelDate(value), HOTEL_TZ, 'dd/MM')`, com teste. Se você
preferir, o Sirlande faz o PR e você revisa. Responda qual dos dois.

### 🟢 [Acessibilidade] Erro do `Field` dentro do `<label>`: falta um dono
**Onde:** `frontend/packages/ui/src/Field.tsx:14-22`. O detalhe está em `docs/qa/repasses/para_dono_indefinido_16112026.md`,
que chega à `develop` com o #181.
**Resumo:** o erro (`role="alert"`) fica dentro do `<label>`, então o campo com erro se chama "Senha Informe a senha" para o
leitor de tela. Vale para todo formulário do app. Na T-10.1, o olho da senha foi tirado de dentro do label só no login.
**O que se pede:** como orquestrador, definir quem pega. A correção muda todo consumidor do `Field`, e o red team
sugere avaliar junto com a T-10.4 em diante (uma tarefa por superfície, SPEC-10 §4).
