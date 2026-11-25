# QA Red Team — SPEC-10 F3, painel Hoje (fita do hotel)
**Branch:** feature/t10-fase3-hoje · **Dev:** Sirlande (visual; tela do Gabriel) · **Base:** feature/spec-10-identidade@567f512 · **HEAD:** 59ec1a1 · **Data:** 25/11/2026
**Arquivos auditados:** 17 (diff `feature/spec-10-identidade...HEAD`)
**Achados no escopo:** 12 (🔴 0 · 🟡 6 · 🟢 6) · **Repassados:** 1

## Veredito
APROVADO COM RESSALVAS

Nenhum 🔴 no escopo. Nada vaza entre tenants: `GET /rooms` filtra por `tenant_id` do JWT
(`ListRoomController.js:7-9`). O cache `['rooms']` não leva o usuário na chave, mas o
`queryClient.clear()` na troca de usuário (`stores/auth.ts:31,35,69`) cobre a troca de hotel na
mesma aba. O que pesa são informações erradas na fita em cenários reais do balcão (🟡-1, 🟡-2,
🟡-3) e o Atenção que depende do analytics justamente nos itens que agora vêm do core (🟡-4).
O backend impede a venda dupla (`checkReservationConflict` consulta `reservation_rooms`), então
nenhum desses casos chega a virar overbooking. O efeito é a recepção levar um 409.

## Achados no escopo

### 🟡-1 [fita / dado] Chegadas ou hóspedes da casa sem carregar: os quartos aparecem como "Livre"
**Onde:** `frontend/apps/pms/src/features/today/TodayPage.tsx:53-56` (a fita é montada só com `rooms.data`); `HotelStripView.tsx:66-71` (só olha o estado de `rooms`)
**Cenário:** `GET /reservations?status=PENDING,CONFIRMED` dá 500 ou timeout (ou ainda está carregando), e `GET /rooms` responde. `arrivalList` fica `[]`, e todo quarto AVAILABLE com chegada sai como `free`. A legenda mostra "Livre 8 · Chega hoje 0" e o detalhe diz "Pronto para vender." O erro aparece só no bloco Chegadas, lá embaixo. A fita não avisa nada (sem `StaleNotice`, sem ressalva). É justamente o número que a decisão de 22/11 definiu como "livre para vender". O mesmo vale para `inHouse`: ocupado sem hóspede ("Ocupado.").
**Regra violada:** SPEC-11 (estado degradado tem que ser visível); DESIGN_PMS (informação errada no balcão)
**Correção sugerida:** só pinte "Livre" e "Chega hoje" quando `arrivals.data` existir. Sem ele, mostre os tons do core com uma ressalva na fita ("Chegadas não carregaram; Livre pode incluir quarto reservado") ou deixe a contagem de Livre em "—".

### 🟡-2 [fita / dado] Duas chegadas no mesmo quarto: o `Map` guarda a que vier por último, e a ordem depende do no-show
**Onde:** `hotelStrip.ts:85-86`
**Cenário:** a reserva A (23→25/11, PENDING, nunca chegou) continua na lista de chegadas, porque o `ListReservationController.js:33` usa `check_out_date >= from`, inclusivo. A reserva B (25→27/11) está no mesmo quarto, e o conflito não a bloqueia (`checkReservationConflict.js:32-33` usa `<`/`>` estritos). As duas entram em `arrivals`. `arrivalRows` ordena no-show primeiro e atrasada depois (`todayLogic.ts:77-80`), e o `Map.set` fica com a última. Se B está em risco de no-show, ela vem antes, A sobrescreve, e a fita mostra "Chegada atrasada de A" com "Abrir reserva" levando à reserva vencida. Quem chega hoje é B.
**Regra violada:** KISS/correção (o resultado depende de uma ordenação feita para outra finalidade)
**Correção sugerida:** ao montar o `Map`, prefira a chegada não atrasada (`!a.late`) e só use a atrasada se não houver outra. Cubra com teste (A atrasada + B do dia no mesmo quarto, nas duas ordens).

### 🟡-3 [fita / dado] Quarto extra de reserva com vários quartos: aparece "Livre" com chegada e "Ocupado." sem hóspede
**Onde:** `hotelStrip.ts:85-88`, que lê só `reservation.room` (`ListReservationController.js:36`, só o quarto principal, D-5)
**Cenário:** um grupo reserva 101 e 102, chegando hoje. A fita pinta 101 como "Chega hoje" e 102 como "Livre — Pronto para vender". A recepção oferece o 102 a um walk-in e recebe 409 do `checkReservationConflict`. Depois do check-in, o 102 fica OCCUPIED sem hóspede no detalhe. Isso contradiz a definição de "Livre" que a própria F3 promete.
**Regra violada:** decisão de 22/11 ("Livre" = livre para vender)
**Correção sugerida:** a fita não tem como saber hoje. Enquanto a D-5 não traz os quartos extras, registre a limitação no comentário de `hotelStrip` e no relatório. Se o endpoint expuser `rooms[]`, indexe todos os quartos de cada chegada.

### 🟡-4 [Atenção] Os itens que agora vêm do core somem com o analytics fora, e a contagem do título fica
**Onde:** `TodayPage.tsx:70-77` (os `attention` e `attentionTotal` são calculados sempre), `:118` (o selo no `h2`) e `:120-126` (a lista some com `alerts` offline, pendente ou em erro)
**Cenário:** o analytics-service está fora. `alerts` cai no `ErrorState`, mas `maintenance` (da fita, core) e `lateDepartures` (inHouse, core) continuam contados. O título mostra "Atenção **3**" e embaixo só aparece "Não foi possível carregar os alertas". Os 2 quartos em manutenção e a saída atrasada, que o core sabe, não aparecem. O mesmo acontece durante o `isPending` do alerts: o selo com número aparece em cima de um spinner. Isso contraria o motivo declarado da F3 ("com ele fora, a recepção continua vendo o hotel").
**Regra violada:** SPEC-11 (cada bloco falha sozinho); coerência do número com a lista
**Correção sugerida:** mostre sempre os chips que vêm do core (manutenção, saídas atrasadas) e ponha o erro ou o "sem conexão" só no lugar dos que dependem do analytics (no-show, limpeza, pendentes). O `attentionTotal` deve somar só os itens que estão na tela.

### 🟡-5 [UI/toque] Quarto da fita abaixo de 48 px de largura entre 768 e ~870 px e entre 1024 e ~1140 px
**Onde:** `HotelStripView.tsx:117` (`sm:grid-cols-2 lg:grid-cols-3`) e `:121` (`grid-cols-5 gap-1`)
**Cenário:** com a barra lateral de 236 px (`AppShell.tsx:73`), o `main px-8` e o `p-5` da seção, num iPad em pé (768 px, ponteiro grosso, sem `desk`) a coluna do andar tem cerca de 205 px, e cada quarto fica com ((205−16)/5) ≈ **38 px** de largura. No iPad deitado (1024 px, `lg`, 3 colunas) fica ≈ **40 px**. A altura (~54 px) passa, a largura não. A verificação no navegador foi em 360 e 768 e conferiu transbordo, não o tamanho do alvo.
**Regra violada:** DIVISAO §4.2 princípio 12 e DESIGN_PMS (toque ≥ 48 px antes do `desk`)
**Correção sugerida:** use `grid-cols-[repeat(auto-fill,minmax(3rem,1fr))]` no `ul` do andar, ou adie as 2 e 3 colunas de andar para larguras em que elas cabem (ex.: `lg:grid-cols-2 desk:grid-cols-3`).

### 🟡-6 [testes] Os testes da fita passariam com a contagem, os vendidos e o filtro errados
**Onde:** `HotelStripView.test.tsx:26-35`, `:21`; `TodayPage.test.tsx` (nenhum teste da composição)
**Cenário (mutantes que sobrevivem):**
- trocar `strip.counts[tone]` por qualquer número na legenda (`HotelStripView.tsx:99`): o teste só procura o rótulo, e "Ocupado" e "Livre" também aparecem no `aria-label` dos quartos, então até apagar a legenda passa (só o `aria-pressed` = 5 segura);
- `sold` renderizado errado ou `TodayPage.tsx:93` passando `counts.booked`: nenhum teste olha o valor "Vendidos hoje" (o `sold={2}` nunca é conferido);
- remover o esmaecer do filtro (`:138`) ou o `hidden md:grid` do celular (`:117`): nada falha;
- `hotelStrip.ts:87` sem o `r.status === 'CHECKED_IN'`: os fixtures são todos CHECKED_IN;
- `maintenance: strip?.counts.maintenance` trocado por 0 em `TodayPage.tsx:72`: nenhum teste liga a fita ao Atenção.
**Regra violada:** qa-redteam §8 (teste que passaria com a regra quebrada)
**Correção sugerida:** confira os números da legenda pelo texto do botão (ex.: regex `Livre<!-- -->…<strong…>2</strong>`), o "Vendidos hoje", o par `opacity-30` com filtro ativo (render com estado inicial via prop ou teste da função pura de classe), e um teste de `TodayPage` com quarto MAINTENANCE semeado aparecendo no Atenção.

### 🟢-1 [a11y] O detalhe abre depois da grade inteira: no teclado são N Tabs até "Abrir reserva"
**Onde:** `HotelStripView.tsx:160-171` (`#fita-detalhe` depois de `#fita-andares`)
**Cenário:** num hotel de 30 quartos, quem usa o teclado abre o 101, e o foco fica no botão. Para chegar ao link do detalhe passa pelos outros 29 quartos. No celular, com a grade aberta, o painel aparece abaixo de todos os andares e pode ficar fora da tela. Quem enxerga toca no quarto e "nada acontece". O `aria-live` resolve só para o leitor de tela. Os testes no navegador usaram o seed pequeno.
**Correção sugerida:** mova o foco para o `region` ao abrir (com `tabIndex={-1}`) ou faça `scrollIntoView({ block: 'nearest' })`. O foco já volta ao quarto ao fechar.

### 🟢-2 [a11y] Quarto livre: fundo e contorno abaixo de 3:1
**Onde:** `HotelStripView.tsx:17`
**Cenário:** `bg-ground` (#f6f4ef) sobre o cartão branco dá 1,1:1, e `ring-gray-300` dá 1,47:1 (1,34:1 sobre o ground). O livre se distingue pela ausência de ícone e de preenchimento, então em baixa visão o quadrado some e sobra só o número. Os outros tons passam com o ícone branco: ocupado 3,3:1, chega hoje 5,2:1, limpeza 3,2:1, manutenção 4,8 e 3,9:1 depois do 59ec1a1.
**Correção sugerida:** `ring-gray-500` (≈4,8:1) ou um ícone discreto (ex.: `Circle`) para o livre. O `StatusBadge` do detalhe usa o cinza `status-free`, e a fita usa outra codificação para o mesmo estado, então vale alinhar.

### 🟢-3 [fita] Chegada em quarto em limpeza ou manutenção não aparece na fita
**Onde:** `hotelStrip.ts:93-95` (decisão "o status do core manda", com teste em `hotelStrip.test.ts:65-68`)
**Cenário:** na troca do dia, o 201 saiu às 10h (CLEANING) e há chegada às 14h nele. A fita mostra só "Em limpeza", e o detalhe não cita a chegada. A legenda diz "Chega hoje 1" enquanto o bloco Chegadas mostra 3. É o quarto a limpar primeiro, e a fita esconde isso. Com manutenção é pior, porque o hóspede precisa ser realocado.
**Correção sugerida:** mantenha o tom do core e acrescente `guest/reservationId` e um marcador ("chegada hoje") ao item e ao detalhe quando houver chegada num quarto não disponível.

### 🟢-4 [UI] No celular, o filtro da legenda não tem efeito visível com a grade recolhida
**Onde:** `HotelStripView.tsx:95` e `:117`
**Cenário:** em 360 px, tocar em "Manutenção 2" só troca o `aria-pressed` e o anel do botão, porque a grade está escondida.
**Correção sugerida:** ao ativar o filtro no celular, abra a grade (`setOpenOnPhone(true)`).

### 🟢-5 [a11y] Fechar o detalhe com a grade recolhida joga o foco no body
**Onde:** `HotelStripView.tsx:164-168`
**Cenário:** no celular a pessoa abre a grade, toca num quarto, recolhe a grade e fecha o detalhe. O `focus()` vai para um botão com `display:none` e o foco cai no body.
**Correção sugerida:** se o quarto não estiver visível, devolva o foco ao botão "Ver quartos por andar".

### 🟢-6 [fita] Teto de 100 da listagem: em hotel com mais de 100 reservas na casa ou chegando, os quartos ficam sem hóspede ou "Livre"
**Onde:** `hotelStrip.ts:85-88` com `todayApi.ts:10` (`TODAY_LIMIT = 100`)
**Cenário:** só acontece acima de 100 reservas no mesmo recorte, fora do público-alvo (hotel pequeno). Os blocos avisam o truncamento e a fita não. Registre como limitação.

## Repassados a outro dev

| Sev. | Achado | Onde | Dono | Repasse |
|------|--------|------|------|---------|
| 🟡 | "Vendidos hoje" conta duas vezes o quarto da troca do dia (ocupado por quem sai hoje + chegada de hoje no mesmo quarto) | `frontend/apps/pms/src/features/today/todayLogic.ts:105-107` | Gabriel (painel do dia, DIVISAO §4.1; regra D-6) | `docs/qa/repasses/para_gabriel_25112026.md` |

## O que foi verificado e está correto
- `GET /rooms` exige ADMIN/RECEPTIONIST (`roomRouter.js:27`) e filtra `tenant_id` do JWT. A rota do Hoje tem o mesmo par de papéis (`App.tsx:36`), e o WAITER não chega à fita.
- O cache `['rooms']` não tem o usuário na chave, mas o `queryClient.clear()` roda quando o usuário muda (`stores/auth.ts:31,35,69`). Não há vazamento entre hotéis na mesma aba.
- Check-in, check-out e liberar invalidam `['rooms']` (`reservations/queries.ts:94,114`; `rooms/queries.ts:103`). A fita muda na hora da ação.
- Estados da fita: carregando, sem conexão sem dado, erro sem dado (`ErrorState`) e dado velho online (`StaleNotice`, coberto pelo teste dos 6 avisos).
- O tom de cada quarto tem texto no `aria-label`/`title`. A legenda tem `aria-pressed`. "Ver quartos por andar" tem `aria-expanded`/`aria-controls`. O detalhe é `region` com nome. Os botões compactos mantêm `min-h-touch` antes do `desk`.
- Contraste do ícone branco sobre os tons: todos ≥ 3:1 em HEAD (a manutenção a 82% dá 3,89:1). Ícone tingido `brand` sobre `brand/10`: 6,6:1.
- `useOccupancy` saiu do Hoje, e o teste confere que a única consulta `['analytics']` restante é `alerts`.
- Sem `require()`, sem `Number()` em DECIMAL, sem fetch direto. Datas formatadas por `formatDateBR` do `@hotel/domain`.
- LGPD: nada novo sai para servidor ou log. O nome do hóspede no `title`/`aria-label` do quarto é o mesmo que os blocos já mostram ao balcão.

## Não foi possível verificar
- Renderização real: sem navegador nesta auditoria. As larguras do 🟡-5 foram calculadas a partir das classes (236 px da barra, `px-8`, `p-5`, `gap`), não medidas.
- A altura em 375 px com a grade aberta (CA-08.i fala do painel; a medição de 25/11 foi com ela recolhida).
- A percepção do hachurado: entre as listras sobra 1,24:1. O ícone `Wrench` é quem carrega o sinal, e o desenho quase não se vê.

---

## Resolução (25/11, mesma sessão)

| Achado | O que foi feito | Commit |
|---|---|---|
| 🟡1 fita "Livre" sem as chegadas | A fita só monta com quartos, chegadas e hóspedes na casa. Faltando um, mostra carregando, sem conexão ou o erro de quem faltou | `34218b2` |
| 🟡2 duas chegadas no mesmo quarto | A do prazo vence a atrasada, em qualquer ordem (teste nas duas ordens) | `34218b2` |
| 🟡3 quarto extra de reserva com vários quartos (D-5) | **Aberto.** É limitação conhecida da listagem (só o quarto principal), registrada; depende da D-5 | — |
| 🟡4 Atenção depende do analytics | Os chips do core (manutenção, saída atrasada) ficam com o analytics fora; o "Nada pedindo atenção" só aparece com os alertas carregados | `34218b2` |
| 🟡5 quarto com menos de 48 px | Grade `auto-fill` com mínimo de 3rem. Medido: 48 px em 768 e 51 px em 1024 | `34218b2` |
| 🟡6 testes que passariam com o código errado | Testes da contagem da legenda, dos vendidos, da grade recolhida, da parada única de Tab, do filtro `CHECKED_IN`, da manutenção no Atenção e da fita sem as chegadas | `34218b2` |
| 🟢 detalhe depois da grade (29 Tabs) | A grade virou uma parada só, com setas; o Tab seguinte cai no detalhe | `34218b2` |
| 🟢 contraste do "Livre" | **Decisão do Sirlande:** contorno tracejado `gray-400` | este commit |
| 🟢 filtro sem efeito no celular | O filtro abre a grade | `34218b2` |
| 🟢 foco no body ao fechar com a grade recolhida | Recolher a grade fecha o detalhe | `34218b2` |
| 🟢 chegada em quarto em limpeza ou manutenção fora da fita | Aberto: o status do core manda, e o bloco Chegadas já mostra o bloqueio na linha | — |
| 🟢 teto de 100 reservas | Aberto, como limitação registrada | — |
| Repasse ao Gabriel (`soldToday` conta duas vezes a troca do dia) | Em `docs/qa/repasses/para_gabriel_25112026.md`; regra D-6 é dele | — |
