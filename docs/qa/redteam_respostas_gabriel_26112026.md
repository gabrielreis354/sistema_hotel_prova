# QA Red Team — respostas do Gabriel de 26/11 (1, 2, 4 e 6)
**Branch:** fix/t10-respostas-gabriel · **Dev:** Sirlande · **Base:** feature/spec-10-identidade@ac25b2d · **Data:** 26/11/2026
**Arquivos auditados:** 9 (diff `origin/feature/spec-10-identidade...HEAD`, commits 9e46ade, 603c7ad, 4cf02b8)
**Achados no escopo:** 9 (🔴 0 · 🟡 4 · 🟢 5) · **Repassados:** 0

## Veredito
APROVADO COM RESSALVAS

Nenhum 🔴. A implementação segue as quatro respostas. As ressalvas: a contagem errada de "Vendidos hoje" em
reserva com vários quartos que sai hoje, o Atenção dizendo "Nada pedindo atenção" quando o core falha,
o guia da demonstração desatualizado e a falta de teste da ligação do bloco "Em limpeza".

Rodado: `vitest run src/features/today src/features/reservations/ReservationDetailPage.test.tsx` → 102/102
verdes; `tsc --noEmit` do pms sem erro.

## Achados no escopo

### 🟡-1 [dinheiro/indicador] "Vendidos hoje" conta os quartos extras de uma reserva com vários quartos que sai hoje
**Onde:** `frontend/apps/pms/src/features/today/todayLogic.ts:111-114` (com `hotelStrip.ts:107-108` e `:119-125`)
**Cenário:** família CHECKED_IN em 701 (principal) + 702, saída hoje, sem chegada nesses quartos. O
check-in ocupa os dois no core (`CheckInController.js:49-81`, pelo pivô). A lista "na casa" traz só o
quarto principal (`TodayReservation.room`), então `stayByRoom` só conhece o 701. A fita marca o 701 como
`departing` e deixa o 702 como `occupied` sem `departing`. O `soldToday` tira o 701 e conta o 702 →
"Vendidos hoje" = 1, mas nenhum dos dois quartos tem hóspede esta noite. O erro é de N-1 quartos por
reserva desse tipo. Do lado das chegadas, a mesma reserva com vários quartos conta só o principal (D-5,
já documentado), então o número erra para os dois lados.
**Regra violada:** a própria regra da resposta 2 ("os ocupados cuja saída não é hoje"). O comentário da
função diz "Reserva com vários quartos conta o principal (D-5)", mas o lado dos ocupados não segue isso.
**Correção sugerida:** o menor ajuste é documentar o limite no JSDoc e na pendência D-5, junto com o
`departing` da fita (o "Saem hoje" erra pelo mesmo motivo). A correção completa precisa da
`reservation_rooms` na listagem "na casa", que já é a pendência D-5. Não afeta o seed da demonstração,
que não tem reserva com vários quartos.

### 🟡-2 [UX/estado] Com o core fora e o analytics no ar, o Atenção diz "Nada pedindo atenção agora."
**Onde:** `frontend/apps/pms/src/features/today/TodayPage.tsx:52`, `:82` e `:144`
**Cenário:** o `GET /rooms` falha (sem dado em cache) e `/analytics/alerts` responde. `cleaning` vira `[]`
porque `rooms.data` é `undefined`, e `maintenance` vira 0 porque `strip` é null. Sem no-show, saída
atrasada nem pendente, `attention.length === 0 && alerts.data` é verdadeiro e a tela mostra "Nada
pedindo atenção agora.", mesmo com quartos em limpeza e em manutenção. Antes do diff, a limpeza vinha
do analytics e aparecia nesse caso. A manutenção já tinha esse ponto cego; o diff põe a limpeza nele
também. A fita mostra o erro, mas o Atenção afirma uma coisa falsa.
**Regra violada:** um bloco não deve afirmar "vazio" sem ter os dados de onde tira a conclusão (CA-11.h
e 🟡4 do qa-redteam da F3, só que pelo outro lado).
**Correção sugerida:** condicionar a frase de vazio também a `rooms.data` (por exemplo, `alerts.data &&
rooms.data`). Ou mostrar uma linha "Quartos indisponíveis: manutenção e limpeza não aparecem" quando
`rooms.data === undefined && rooms.error`.

### 🟡-3 [doc/roteiro] O GUIA_DEMONSTRACAO não acompanha nenhuma das duas mudanças
**Onde:** `docs/roteiro/GUIA_DEMONSTRACAO.md:160` e `:255` (fora do diff, mas desatualizados por ele)
**Cenário:** (a) o passo 2, item 4, diz só "No detalhe da reserva, **Fazer check-in.**" e logo depois
"A banca vê: a reserva passa a hospedado". Agora aparece um painel e nada acontece até o clique em
"Confirmar check-in". Quem apresenta seguindo o roteiro fica esperando o resultado diante da banca. A
fala "Um duplo clique em confirmar grava uma vez só" agora cabe melhor no novo botão, mas o passo não
o cita. (b) A linha 255 diz que, sem o analytics, "o painel Hoje perde os cartões, a lista Atenção e o
bloco Em limpeza". Isso é falso desde a resposta 1, que existe justamente para o "Em limpeza" seguir de pé.
**Regra violada:** o roteiro é o entregável da demonstração (fase atual do CLAUDE.md §3). A mudança de
fluxo veio sem a mudança no roteiro.
**Correção sugerida:** item 4 → "**Fazer check-in** e, no painel que abre, **Confirmar check-in**". Na
linha 255, tirar "e o bloco Em limpeza" e dizer que ele perde só o "em limpeza desde".

### 🟡-4 [testes] A ligação do bloco "Em limpeza" com os quartos do core não tem teste
**Onde:** `frontend/apps/pms/src/features/today/TodayPage.tsx:219-224`; testes em `TodayPage.test.tsx`
**Cenário (mutação mental):** voltar as linhas 219-224 para `alerts`/`alertsLoad`, ou trocar a linha 52
por `alerts.data?.cleaning ?? []`, deixa a suíte inteira verde. O `cleaningRows` tem bons testes
unitários. Mas nenhum teste renderiza o painel com o analytics fora e um quarto CLEANING no core e
confere que "Quarto 105" e "Liberar quarto" aparecem, e essa é a promessa da resposta 1. O teste "dado
velho" (6 avisos) passa dos dois jeitos.
**Regra violada:** QA §8, teste que passaria com a regra quebrada.
**Correção sugerida:** um caso em `TodayPage.test.tsx`, no molde do "🟡4": `roomKeys.all` com um quarto
CLEANING, alerts rejeitando, e conferir que o HTML tem "Quarto 105" e "Liberar quarto" e não tem o
erro do analytics dentro do bloco Em limpeza.

### 🟢-5 [UX] O "Confirmar check-in" do detalhe não acompanha `actions.checkIn.enabled`
**Onde:** `frontend/apps/pms/src/features/reservations/ReservationDetailPage.tsx:284`
**Cenário:** a recepção abre o painel, troca de aba no navegador, e outro atendimento ocupa o quarto
(ou o dia vira e a janela fecha). Ao voltar, o refetch atualiza `actions`: o botão principal some, o
secundário fica desabilitado com o motivo, e o painel continua aberto com "Confirmar check-in"
habilitado. O clique volta 409/422 com mensagem. O servidor barra, então não há dano. Mas o painel Hoje
já resolveu esse caso de propósito (`rows.tsx:291-293`, `canConfirm={checkIn.enabled}`, com comentário
explicando).
**Correção sugerida:** `disabled={busy || !actions.checkIn.enabled}`, e mostrar `actions.checkIn.reason`
no painel. Ou fechar o painel quando `enabled` virar falso.

### 🟢-6 [a11y] Foco não volta ao botão de origem ao fechar o painel
**Onde:** `ReservationDetailPage.tsx:287` ("Voltar") e `:304` ("Manter reserva")
**Cenário:** usuária de teclado abre o painel de check-in (o foco vai para o `<p>`, certo), aperta
Voltar, o painel desmonta e o foco cai no `body`. O próximo Tab recomeça do topo da página. A resposta
6 pede o foco ao abrir, e isso foi feito. Fechar ficou de fora, como já acontecia no check-out
(`:432`). Esc também não fecha.
**Correção sugerida:** guardar o gatilho (`document.activeElement` ao abrir) e devolver o foco no
`setConfirming(null)` do Voltar e do Manter.

### 🟢-7 [UX] O texto da confirmação cita um quarto só e não fala do sinal pendente
**Onde:** `ReservationDetailPage.tsx:276-281`
**Cenário:** (a) reserva 701 + 702: o painel diz "no quarto **701**? O quarto passa a ocupado", e os dois
passam a ocupados (o cabeçalho, na linha 172, já lista os dois). (b) Walk-in com cobrança PIX de sinal
pendente: o check-in cancela a cobrança. A resposta 4 usa isso como motivo da confirmação, mas o texto
não avisa. A recepção pode deixar o hóspede pagar depois por um QR que já foi cancelado.
**Correção sugerida:** usar `rooms.map(n => n.number).join(', ')` com "Os quartos passam a ocupados". Se o
bill mostrar sinal pendente, acrescentar "A cobrança PIX pendente é cancelada."

### 🟢-8 [código/comentário] Guarda `releasedFor` com `since` indefinido, e comentário desatualizado
**Onde:** `frontend/apps/pms/src/features/today/components/rows.tsx:437-441`; `frontend/apps/pms/src/features/rooms/queries.ts:93-95`
**Cenário:** analytics fora → `since` indefinido → depois do sucesso, `releasedFor = ''`. Se o refetch de
`['rooms']` falhar (Wi-Fi sem internet), a linha fica. Se nesse meio o analytics voltar e trouxer o
`cleaning_since` do mesmo quarto, então `released` = (`''` === `'2026-…'`) = falso e o botão "Liberar
quarto" reabre. O segundo envio volta 409, que é tratado e recarrega. A janela é pequena: no caminho
normal, o `mutateAsync` espera o `onSettled`, a lista já recarregou e a linha desmontou antes do
`setReleasedFor`. O comentário do `rows.tsx` ("Se o quarto voltar para a limpeza, `since` muda") não
vale sem analytics. O JSDoc do `useReleaseRoom` ainda diz "a lista de limpeza vem do `/analytics`".
**Correção sugerida:** guardar o fato do sucesso (`released: boolean`) em vez da chave de `since`. A
volta para a limpeza remonta a linha mesmo assim, porque ela sai da lista e volta. Atualizar os dois
comentários.

### 🟢-9 [testes] Os testes do detalhe leem o código-fonte, não o comportamento
**Onde:** `frontend/apps/pms/src/features/reservations/ReservationDetailPage.test.tsx:158-172`
**Cenário:** os testes conferem regex no `.tsx` (`onClick={openCheckIn}` 2×, `ref={checkInRef}
tabIndex={-1}`). Um reflow do formatador (prettier quebrando o atributo em outra linha) os quebra sem
mudança de comportamento. E eles continuam verdes se o "Confirmar check-in" nascer desabilitado ou se
o `focus()` for para o elemento errado. O ambiente é `node`, sem DOM, então a prova real é o e2e
(`roteiro.spec.ts:105-107`), que cobre o clique duplo abrir → confirmar. O foco não tem prova
automática nenhuma.
**Correção sugerida:** aceitar como está e registrar que o foco foi conferido à mão (ou pelo
qa-explorador). Ou extrair `openCheckIn`/painel para um componente testável quando entrar DOM nos testes.

## Repassados a outro dev
nenhum

## O que foi verificado e está correto
- Resposta 1: `cleaningRows` só lista `status === 'CLEANING'` do core; o analytics só fornece `since`, pelo
  id; um quarto que o analytics ainda acha em limpeza, mas o core já liberou, não aparece (testado). O
  chip do Atenção usa a mesma lista (`TodayPage.tsx:82`). O bloco usa `roomsLoad`, `rooms.error`,
  `stale(rooms)` e `rooms.refetch`. Com o analytics fora e o core no ar, o bloco funciona.
- O liberar invalida `roomKeys.all` no `onSettled` (`rooms/queries.ts:101-107`), e o painel ativo
  rebusca. A linha some logo depois do sucesso.
- Resposta 2: `Set` por `room.id`. A troca do dia conta uma vez. A saída atrasada conta (decisão do
  Sirlande, coerente com o texto do Gabriel: a saída dela não é hoje). Chegada atrasada não conta.
  Reserva vencida (EXPIRED) nunca é "chegada de hoje não atrasada": `late` = entrada antes de hoje, e a
  vencida tem saída ≤ hoje, então ou é atrasada ou teria 0 noite. A fita já pula as vencidas
  (`hotelStrip.ts:103`). O número não passa do total quando as chegadas são de quartos da lista (testado).
- Resposta 4: `run('check-in')` aparece uma vez só, dentro do painel. Os botões principal e secundário
  só abrem o painel. O secundário continua `disabled` com `!actions.checkIn.enabled` (quarto ocupado
  não abre o painel). O principal só existe com `checkIn.enabled` (`reservationLogic.ts:542`).
  `mutateOnce` segura o duplo clique. O sucesso e o erro fecham o painel, e o foco vai para o aviso.
- Resposta 6: refs com `tabIndex={-1}` e foco no effect por `confirming`. O effect está antes dos
  `return` antecipados (regra dos hooks ok). Abrir um painel com outro aberto troca o estado único
  `confirming`, sem dois painéis na tela.
- e2e `roteiro.spec.ts:105-107`: o `.first()` pega o principal (o secundário não renderiza quando o
  principal é check-in), e o nome exato "Confirmar check-in" bate com o botão. Nenhum outro e2e faz o
  check-in pelo detalhe.
- Sem `require()`, sem `Number()` em dinheiro, sem data sem fuso no diff (o `today` vem de `useHotelToday`).
- Sem PII nova em log ou URL.

## Não foi possível verificar
- Comportamento real de foco e leitor de tela: não rodei navegador. Os testes são SSR em `node`.
- e2e: não rodei o `roteiro.spec.ts` (precisa do compose no ar).
- Se o backend aceita reserva com entrada igual à saída (0 noite). Isso sustenta o argumento de que a
  vencida nunca entra no `soldToday`. Não li o controller de criação; o `safeNights` do front sugere
  que não aceita.
