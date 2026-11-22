# QA Red Team — SPEC-11 T-11.4 (painel Hoje sem conexão e cartões em dia)
**Branch:** fix/spec11-painel-hoje · **Dev:** Sirlande · **Base:** fix/spec11-duplo-clique@81fa695 · **Data:** 22/11/2026
**Arquivos auditados:** 12 (diff `fix/spec11-duplo-clique...HEAD`, commits 77969b3, b48d500, d0cd3d4)
**Achados no escopo:** 6 (🔴 0 · 🟡 2 · 🟢 4) · **Repassados:** 0

## Veredito
**APROVADO COM RESSALVAS**

Nenhum 🔴. Os dois 🟡 são: a ligação no `TodayPage` sem teste (e o motivo dado para isso não se
sustenta, ver 🟡-1) e o caso de Wi-Fi conectado sem internet, em que o dado já carregado some do
bloco (🟡-2).

## Achados no escopo

### 🟡-1 [Testes] A ligação do `TodayPage` não tem teste, e o `renderToString` produz, sim, consulta pausada
**Onde:** `frontend/apps/pms/src/features/today/TodayPage.tsx:30`, `:67-70`, `:80`, `:88-89`, `:112`, `:137-138` e seguintes; `offline.test.tsx` (inteiro)
**Cenário:** o `offline.test.tsx` testa `loadState`, `TodayBlock` e `TodayCounters` isolados. Nenhum teste
renderiza o `TodayPage`. Sobrevivem a toda a suíte estas mutações:
- `isOffline={false}` (ou o prop removido) em qualquer um dos quatro `TodayBlock`;
- `offline={occupancyLoad.isOffline}` removido do `TodayCounters`;
- `{ refetchInterval: REFRESH }` removido do `useOccupancy` (`TodayPage.tsx:30`). Essa é metade do CA-11.g
  ("a ocupação recarrega a cada 60 s") e não tem nenhum teste;
- `<ConnectionBanner offline={!online}>` trocado por `offline={false}`, ou seja, a faixa do painel
  inteira.

O autor afirma que o `renderToString` não produz consulta pausada. Isso é falso no TanStack Query
5.101.4 do projeto. Conferi com um script fora do repositório que importa `@tanstack/react-query` e
`react-dom/server` do próprio app:
```
onlineManager.setOnline(false) → renderToString(useQuery) → pending=true paused=true fetchStatus=paused
onlineManager.setOnline(true)  → renderToString(useQuery) → pending=true paused=false fetchStatus=fetching
```
O resultado otimista do `QueryObserver` (`_optimisticResults`) já calcula `fetchStatus: 'paused'`
quando `canFetch` é falso. O comentário de `lib/online.ts:9-10` diz exatamente isso para o `useOnline`.
**Regra violada:** checklist de testes, "teste que passaria mesmo com a regra quebrada"; o próprio CA-11.g/h.
**Correção sugerida:** um `TodayPage.test.tsx` no molde do `GuestDetailPage.test.tsx` (com dublê de
`lib/api.js`, `stores/auth.js` e `MemoryRouter`). Com `onlineManager.setOnline(false)` e o cache vazio,
o teste afirma que aparecem a faixa e "Sem conexão" nos quatro blocos e nos cartões, e que não aparecem
"Carregando" nem "Nenhuma chegada". Para o intervalo de 60 s, basta um teste que leia
`qc.getQueryCache().find({ queryKey: analyticsKeys.occupancy(...) }).observers[0].options.refetchInterval`
depois do render, ou que extraia as opções para uma função pura.

### 🟡-2 [CA-11.h] Com Wi-Fi conectado sem internet, o dado já carregado some do bloco e a faixa não aparece
**Onde:** `frontend/apps/pms/src/features/today/components/TodayBlock.tsx:31` (o `error` vem antes de `children`); `TodayPage.tsx:80` (faixa só por `onlineManager`)
**Cenário:** o painel está aberto com as chegadas carregadas. O Wi-Fi do hotel continua associado, mas
o link cai (ou o captive portal expira). Para o `onlineManager`, o aparelho continua online. No próximo
ciclo de 60 s, o `listArrivals` falha, o `retry: 1` (`lib/queryClient.ts:10`) falha de novo e a
consulta fica com `status: 'error'` e o `data` antigo. O `TodayBlock` cai em `else if (error)` antes
de `children`, e a lista que estava na tela é trocada por `ErrorState`. A faixa não aparece, porque
o `useOnline` diz online. Os cartões fazem o oposto: `TodayCounters.tsx:31` mostra o erro em cima e
mantém os números. No mesmo painel, então, os blocos perdem o dado e os cartões o mantêm.
A ordem do `TodayBlock` é anterior a esta branch, mas o CA-11.h ("com dado já carregado, o dado
continua na tela") é desta tarefa, e o caso foi pedido na auditoria. Com o navegador realmente
offline (modo avião, `context.setOffline`), o comportamento está certo: a consulta pausa, não
registra erro, e o dado fica.
**Regra violada:** CA-11.h, no caso de rede sem internet, que o `onlineManager` não detecta.
**Correção sugerida:** no `TodayBlock`, mostrar o `ErrorState` só quando não há dado, por exemplo
com `error && isEmpty && !hasData` (prop `hasData`, ou passar o erro só quando `data === undefined`).
Com dado, mostrar a lista e um aviso curto ("não foi possível atualizar"). Se ficar para depois,
registrar como limitação aceita, no mesmo estilo da limitação de madrugada do check-in.

### 🟢-1 [CA-11.h] Erro primeiro e pausa depois: o bloco fica no `ErrorState` com um "Tentar de novo" que não faz nada
**Onde:** `frontend/apps/pms/src/features/today/todayLogic.ts:218-219`
**Cenário:** a primeira carga falha com o aparelho online (servidor fora, ou o caso do 🟡-2). A consulta
fica com `status: 'error'`, `isPending: false` e sem dado. Depois a rede cai de fato. O próximo ciclo
deixa `fetchStatus: 'paused'`, mas `loadState` devolve `{ isLoading: false, isOffline: false }`, porque
só olha `isPending`. O bloco continua no `ErrorState`. O "Tentar de novo" chama `refetch()`, que pausa
em silêncio. A faixa do topo explica a situação, e o bloco não diz "Carregando" nem mostra o vazio, então
o CA não quebra. Mesmo assim, o botão não responde.
**Correção sugerida:** `isOffline: q.isPaused && q.data === undefined` (receber `data` em vez de
`isPending`), com um teste do caso `{ isError, isPaused, data: undefined }`.

### 🟢-2 [CA-11.g] No "Liberar quarto" sai um refetch imediato a mais, e o prazo de 3 s é heurístico
**Onde:** `frontend/apps/pms/src/features/today/components/rows.tsx:441`; `features/rooms/queries.ts:103`; `todayLogic.ts:224`
**Cenário:** o `useReleaseRoom` já invalida `['analytics']` e espera o refetch terminar
(`Promise.all` no `onSettled`, que o `mutateAsync` aguarda). Só depois o `.then` chama
`invalidateAnalyticsSoon`, cuja primeira invalidação refaz agora todas as consultas ativas de
`['analytics']`, sem necessidade. O segundo refetch acontece em "fim do primeiro + 3 s", o que ainda
cabe nos 10 s.
Os 3 s também não garantem o CA-11.g. O publisher do outbox faz polling a cada 1 s
(`services/core-service/app/services/outbox/publisher.js:59`) e o consumidor do analytics tem latência
própria. Se o broker atrasar mais de ~3 s, os cartões só se acertam no ciclo de 60 s. Não verifiquei no
navegador (o analytics não sobe no QA).
**Correção sugerida:** no `CleaningItem`, só agendar o refetch atrasado (um `invalidateAnalyticsLater`,
ou um parâmetro `immediate: false`). Registrar no relatório que "até 10 s" vale com o broker saudável.

### 🟢-3 [Timer] `setTimeout` sem cancelamento: inofensivo, conferido
**Onde:** `frontend/apps/pms/src/features/today/todayLogic.ts:236`
**Cenário:** conferi os três casos pedidos.
- **Logout dentro dos 3 s:** o `queryClient.clear()` (`stores/auth.ts:35`) esvazia o cache, e a invalidação atrasada vira no-op.
- **Outro usuário entra dentro dos 3 s:** as chaves têm escopo por `user.id`, então o refetch só toca consultas do novo usuário. Não há vazamento.
- **Várias ações seguidas:** N timers e N invalidações. O `cancelRefetch` padrão cancela a busca anterior em voo, então o custo é só algumas requisições.
- **Componente desmontado:** o timer não chama `setState`, e o QueryClient é do app.

Sobra um detalhe: o timer usa o `setTimeout` global. Em teste que renderiza linhas sem fake timers, ele
fica pendurado por 3 s. Hoje nenhum teste faz isso.
**Correção sugerida:** nenhuma obrigatória.

### 🟢-4 [A11y] Região viva e textos dentro dos blocos
**Onde:** `frontend/apps/pms/src/components/ConnectionBanner.tsx:17-21`; `TodayBlock.tsx:29`; `TodayCounters.tsx:32`
**Cenário:** uma única região `status` basta. A faixa é a mensagem que precisa ser anunciada, e anunciar
cada bloco daria cinco falas iguais em sequência. Os textos dos blocos são lidos na navegação normal.
**SUSPEITA, não confirmada:** a região é criada e preenchida em menos de um quadro (o efeito roda logo
depois do primeiro commit). Alguns leitores de tela (NVDA com Firefox, VoiceOver) só registram a região
depois de algum tempo no DOM e podem perder o primeiro anúncio na abertura já sem rede. O padrão veio da
comanda (red team de 15/11) e não foi testado com leitor de tela. Para confirmar, abrir o painel com
`context.setOffline(true)` e NVDA ligado.
À parte: com chegadas pausadas e ocupação em cache (vinda da tela de Indicadores), "Vendidos hoje" mostra
"—" sem texto ao lado, porque o aviso dos cartões só olha `occupancyLoad`. O bloco Chegadas e a faixa
explicam, então é cosmético.

## Repassados a outro dev
nenhum

## O que foi verificado e está correto
- **Comanda idêntica:** o HTML do `OfflineNotice` antes e depois tem o mesmo `<p>`, o mesmo ícone e o mesmo `<span>` com lead, mensagem e contagem (`OfflineBanner.tsx`). A região `status`/`polite` nasce vazia como antes. O `connection.ts` reexporta `useOnline`, então os imports da comanda não mudam.
- **Indicadores sem mudança:** `useOccupancy(date, options = {})` passa `refetchInterval: undefined` quando chamado sem opções, que é o mesmo comportamento de antes (`analytics/queries.ts:46-54`).
- **Sem mudança de contrato de API nem de backend.** Tudo é ESM, sem `require`.
- **`loadState` com dado e consulta pausada:** mostra o dado (está no teste). Sem dado e pausada: mostra "Sem conexão", sem spinner e sem o vazio (está no teste).
- **Bloco Atenção:** o `isOffline` vem antes de `isPending` (`TodayPage.tsx:112`), então não sobra spinner sem fim.
- **Mutação de check-in/out:** o `onSettled` do hook não devolve promise (`reservations/queries.ts:112-115`), então o `onSettled` do `mutate` dispara com a linha ainda montada e o `invalidateAnalyticsSoon` roda. A liberação usa `mutateAsync`, que não depende de montagem.
- **Faixa vazia quando online:** o `div` vazio dentro de `space-y-4` não abre espaço a mais, porque as margens colapsam através do bloco vazio.
- **Teto do atraso** (`ANALYTICS_REFETCH_DELAY ≤ 5000`) está preso em teste.

## Não foi possível verificar
- CA-11.g no navegador: o ambiente de QA não sobe o analytics-service (dito pelo autor). Não rodei a suíte, e o "586 verdes" vem do autor.
- Anúncio da faixa com leitor de tela real (🟢-4).
- Observação fora do diff, sem repasse por ser da mesma área e do mesmo dev: sem rede, "Confirmar check-in" no painel deixa a mutação pausada (`networkMode` padrão em `useTransitionReservation`). O botão fica ocupado até a rede voltar e então envia sozinho. A faixa explica, mas vale decidir se o balcão quer o envio tardio ou um "não foi feito" imediato, como no pagamento (`networkMode: 'always'`, `reservations/queries.ts:130`).

---

## Tratamento das ressalvas (Sirlande, 22/11)

| # | Achado | O que foi feito | Commit |
|---|---|---|---|
| 🟡-1 | Ligação do `TodayPage` sem teste | `features/today/TodayPage.test.tsx`: render no servidor com o `onlineManager` offline (consulta pausada, como o red team mostrou), mais dado com refetch falhando e o `refetchInterval` da ocupação lido do cache. Derrubam a suíte: `isOffline={false}` nas chegadas, `offline={false}` nos cartões, sem o `refetchInterval` e o erro trocando o dado. A faixa do topo nasce depois da montagem e ficou só com a conferência no navegador | `50b30ca`, `554f5f3` |
| 🟡-2 | Wi-Fi sem internet troca a lista pelo erro | Blocos, alertas e cartões só mostram o erro quando não há dado | `50b30ca`, `554f5f3` |
| 🟢-1 | Erro e depois pausa | `loadState` conta o dado: `isOffline = isPaused && data === undefined` | `50b30ca`, `554f5f3` |
| 🟢-2 | Refetch a mais no "Liberar quarto"; os 3 s são heurísticos | Sem mudança: um GET a mais. Com o broker lento, o ciclo de 60 s acerta os cartões | — |
| 🟢-3 | Timer | Sem mudança: os quatro cenários foram conferidos sem defeito | — |
| 🟢-4 | Anúncio na abertura com leitor de tela | Sem mudança: é o mesmo componente da comanda; falta testar com NVDA | — |
| Fora do diff | Check-in sem rede fica pausado e envia sozinho quando a rede volta | Pendência, para decidir com o Gabriel depois do congelamento | — |

Suíte do pms depois do tratamento: 63 arquivos e 590 testes verdes, typecheck limpo.

---

## Revisão do aviso de dado velho (22/11)
**Delta auditado:** `git diff 0438ea6..191ee43` (commits `b2462d6` RED, `191ee43` fix) · 5 arquivos
**Achados no delta:** 7 (🔴 0 · 🟡 2 · 🟢 5) · **Repassados:** 0

### Veredito
**APROVADO COM RESSALVAS**

Nenhum 🔴. A regra `stale = online && data !== undefined && isError` está certa e chega aos seis
pontos do painel. As duas ressalvas: o botão do aviso tem 36 px no celular, o que fere o CA-08.g
(🟡-A), e o teste só derruba 1 de 9 mutações (🟡-B).

### (a) Quando o aviso aparece, incluindo as transições

Pontos ligados: cartões (`TodayPage.tsx:97`), Atenção (`:127`), Chegadas (`:150`), Saídas (`:173`), Na casa (`:192`), Em limpeza (`:210`). Saídas e Na casa usam o mesmo `inHouse`, e Atenção e Em limpeza usam o mesmo `alerts`. Por isso o aviso pode aparecer duas vezes para uma mesma consulta. Cada cópia fica no próprio bloco, o que está correto.

| Situação | `online` | `data` | `isError` | Aviso | Conferido em |
|---|---|---|---|---|---|
| Primeira carga falha | true | undefined | true | não (o `ErrorState` cobre) | `TodayBlock.tsx:34` |
| Refetch falha, ainda dentro do `retry: 1` | true | sim | **false** (status segue `success`, só o `failureCount` sobe) | não, por cerca de 1 s | `lib/queryClient.ts:10` |
| Refetch falha depois do retry | true | sim | true | **sim** | reducer `error` |
| Refetch em voo depois do erro | true | sim | **true** | sim, continua | `query-core/query.js:411-420`: `fetchState` só zera `error`/`status` quando `data === undefined` |
| Refetch bem-sucedido | true | sim | false | some | `successState` grava `status: 'success'` e `error: null` |
| Rede cai com o aviso na tela | false | sim | true | some, e a faixa do topo assume | `TodayPage.tsx:76` |
| Rede volta | true | sim | true até o `refetchOnReconnect` terminar | reaparece por um instante e some se o refetch der certo | (🟢-5) |

O comportamento durante o refetch em voo é aceitável: o dado continua sendo o velho, então o aviso continua sendo verdade. O defeito é outro: tocar em "Tentar de novo" não muda nada na tela (🟢-1).

### (b) A11y
- **Contraste:** passa no AA. `text-gray-900` sobre âmbar a 10% em fundo branco dá cerca de 15,6:1. O texto `ghost` (`gray-700`) do botão dá cerca de 9,3:1. O estado não depende só da cor, porque há texto.
- **Alvo de toque:** não passa (🟡-A).
- **Anúncio:** o aviso não é anunciado (🟢-3).

### Achados

#### 🟡-A [UI/UX · CA-08.g] "Tentar de novo" do aviso tem 36 px no celular
**Onde:** `frontend/apps/pms/src/features/today/components/StaleNotice.tsx:15`
**Cenário:** o gerente abre o painel no celular (375 px) com o Wi-Fi sem internet. Aparecem até seis botões de 36 px de altura (`size="compact"`, ou seja `h-9`, `packages/ui/src/Button.tsx:23`), num painel que o projeto define como usado no celular (`TodayPage.tsx:20-21`).
**Regra violada:** `frontend/DESIGN_PMS.md` §5 ("`compact` = tabela e rack no desktop"), CA-08.g (48 px em 375 e em 768 px) e o padrão do próprio arquivo, que é tamanho padrão com `xl:h-9 xl:min-h-0 xl:text-sm` (`TodayPage.tsx:108`, `ReservationsListPage.tsx:74`). A varredura `components/touchTargets.test.ts:34` procura só `sm|md|lg:` com `h-N`/`min-h-0`, então não pega `size="compact"`.
**Correção sugerida:** tirar o `size="compact"` e passar `className="xl:h-9 xl:min-h-0 xl:text-sm"`. Se quiser proteger, incluir na varredura o caso de `size="compact"` fora de arquivo de desktop.

#### 🟡-B [Testes] O teste derruba 1 de 9 mutações
**Onde:** `frontend/apps/pms/src/features/today/TodayPage.test.tsx:55-74`
**Cenário:** rodei cada mutação isolada e restaurei o arquivo depois (`git checkout`). A árvore terminou limpa.

| Mutação em `TodayPage.tsx` | Suíte |
|---|---|
| tirar `stale` de Na casa (`:192`) | 43 verdes, mutação sobrevive |
| tirar `stale` de Saídas (`:173`) | sobrevive |
| tirar `stale` de Chegadas (`:150`) | sobrevive |
| tirar `stale` dos cartões (`:97`) | sobrevive |
| tirar `stale` de Em limpeza (`:210`) | sobrevive |
| tirar o aviso da Atenção (`:127`) | sobrevive |
| tirar `online &&` (`:76`), o que dá aviso e faixa juntos quando está sem rede | sobrevive |
| tirar `q.data !== undefined` (`:76`), o que dá aviso e `ErrorState` juntos quando não há dado | sobrevive |
| tirar `&& q.isError` (`:76`) | **morre** (teste `:68`) |

O teste usa `toContain('Não foi possível atualizar')` e só o `inHouse` falha. Qualquer um dos dois blocos de `inHouse` sozinho já satisfaz a asserção, e os outros quatro pontos não são exercitados.
**Regra violada:** "teste que passaria mesmo com a regra quebrada" (checklist §8).
**Correção sugerida:** três casos.
1. As quatro consultas em erro com dado: contar `'Não foi possível atualizar'` e esperar 6, ou checar por `aria-labelledby` de cada seção.
2. Sem rede, com dado e erro: sem aviso.
3. Erro sem dado: `ErrorState` sem aviso.

Uma alternativa é levar a regra para `todayLogic.ts`, ao lado de `loadState` (🟢-4), e testá-la como função pura.

#### 🟢-1 [UX] "Tentar de novo" não dá retorno enquanto o refetch está em voo
**Onde:** `StaleNotice.tsx:15`, `TodayPage.tsx:76`
**Cenário:** a recepcionista toca em "Tentar de novo". O `isError` continua true durante o fetch (`query.js:411-420`), então o aviso e o botão ficam iguais até a resposta. Ela toca de novo, e o `refetch()` (com `cancelRefetch: true`) cancela e recomeça. Não causa dano, mas parece botão quebrado.
**Correção sugerida:** passar `isFetching` e mostrar o botão `disabled` com "Atualizando…".

#### 🟢-2 [Cobertura do aviso] Números derivados de mais de uma consulta só olham uma
**Onde:** `TodayPage.tsx:53` com `:97`, e `:129-130` com `:127`
**Cenário:** o refetch de `arrivals` falha (online) e a ocupação volta. "Vendidos hoje" (`occupied + chegadas`) mostra número velho, e os cartões não avisam porque olham só a ocupação. Na Atenção, "chegada sem pagamento" (de `arrivals`) e "saída atrasada" (de `inHouse`) ficam velhas, e o aviso dali olha só `alerts`. O bloco de origem avisa, então o dano é pequeno.
**Correção sugerida:** nos cartões, `stale(occupancy) || stale(arrivals)`. Na Atenção, `stale(alerts) || stale(arrivals) || stale(inHouse)`. Também dá para aceitar como está e registrar a decisão.

#### 🟢-3 [A11y · KISS] O aviso não é anunciado, e com Wi-Fi sem internet aparecem seis iguais
**Onde:** `StaleNotice.tsx:13-14`
**Cenário:** o aviso surge depois de um refetch em segundo plano, sem `role="status"`, e o leitor de tela não informa nada. Pôr `role="status"` em cada cópia geraria até seis anúncios iguais de uma vez. No caso mais comum (Wi-Fi sem internet), todas as consultas falham juntas e a tela fica com seis faixas e seis botões repetidos.
**Correção sugerida:** uma região viva só, no nível da página (`aria-live="polite"`, com texto do tipo "Parte do painel não foi atualizada"), mantendo o aviso visual por bloco. Outra opção é juntar tudo numa faixa única quando todas as consultas estiverem velhas. Precisa de decisão de UX, não é bloqueio.

#### 🟢-4 [DRY · ruído] A regra está dentro do componente e há reindentação sem motivo
**Onde:** `TodayPage.tsx:76` e `TodayPage.tsx:245-249`
**Cenário:** `stale` é uma função pura irmã de `loadState` (`todayLogic.ts:220`), que já tem teste unitário, mas ficou dentro do componente, onde só o render a exercita (ver 🟡-B). O diff também reindenta o fragmento de `AttentionItem` para 8 espaços dentro de `<>` com 4, sem mudança de conteúdo.
**Correção sugerida:** `loadState(q, online)` passa a devolver também `isStale`, coberto em `todayLogic.test.ts`. Desfazer a reindentação.

#### 🟢-5 [Transição] O aviso pisca por um instante quando a rede volta
**Onde:** `TodayPage.tsx:76`
**Cenário:** o aparelho fica sem rede com o aviso na tela, e depois a rede volta. `online` vira true antes de o `refetchOnReconnect` terminar, e o status ainda é `error`, então o aviso reaparece até a resposta. É aceitável, porque o dado ainda é o velho. Fica registrado para ninguém tratar como bug no teste em navegador.

### Repassados a outro dev
Nenhum.

### O que foi verificado e está correto
- A regra é avaliada só com `online` (`useOnline`, que usa o mesmo `onlineManager` que pausa as consultas), então o aviso e a faixa do topo nunca aparecem juntos.
- O aviso não convive com o spinner nem com "Sem conexão": `stale` exige dado, e com dado `isPending` e `isOffline` são falsos (`todayLogic.ts:221`).
- Bloco vazio e velho ("Nenhuma chegada" com aviso) mostra os dois, o que é correto: o vazio pode estar velho.
- O `onRetry` de cada aviso chama o `refetch` da consulta certa nos seis pontos.
- O refetch bem-sucedido limpa o aviso (reducer `success` da query-core 5.101.4).
- O contraste passa no AA (texto ≈ 15,6:1, botão ≈ 9,3:1), e o estado tem texto, não só cor.
- O delta não mexe em backend, contrato nem `require()`.
- Suíte `src/features/today` em `frontend/apps/pms`: 3 arquivos e 43 testes verdes (Node 18 do WSL), com HEAD em `191ee43` e árvore limpa antes e depois das mutações.

### Não foi possível verificar
- O comportamento no navegador real com Wi-Fi sem internet (captive portal): a tabela de transições vem da leitura do reducer da query-core, não de execução.
- Leitor de tela (NVDA/TalkBack) para o 🟢-3.
- A suíte inteira do pms e o typecheck: rodei só `src/features/today`, como pedido.

### Tratamento (Gabriel com Claude, 22/11)

| # | Achado | O que foi feito |
|---|---|---|
| 🟡-A | Botão do aviso com 36 px no celular | `StaleNotice` sem `size="compact"`: alvo de 48 px no celular e compacto só no desktop (`xl:h-9 xl:min-h-0 xl:text-sm`), o mesmo padrão do "Fechar" do painel |
| 🟡-B | Teste fraco: a ligação de cada bloco sobrevivia | A regra virou `isStale(q, online)` em `todayLogic.ts`, com 4 casos puros em `offline.test.tsx`. Em `TodayPage.test.tsx`, com todas as consultas com dado e refetch falhando, a página mostra exatamente 6 avisos; sem rede, 0. Conferido por mutação: tirar `stale` das Chegadas ou dos cartões derruba a suíte |
| 🟢-1 | "Tentar de novo" sem retorno visual | Sem mudança no MVP: o refetch é rápido e o aviso some quando dá certo |
| 🟢-2 | Números de mais de uma consulta | Sem mudança: o bloco de cada consulta avisa sozinho, e no Wi-Fi sem internet todas falham juntas |
| 🟢-3 | Sem anúncio e seis avisos iguais | Decisão de UX para depois do congelamento, junto com a região viva única |
| 🟢-4 | Regra no componente; reindentação | A regra foi para `todayLogic` (ver 🟡-B). A reindentação fica: o conteúdo entrou num fragmento `<>` e ganhou um nível |
| 🟢-5 | Aviso pisca quando a rede volta | Aceito, registrado |

Suíte do pms depois do tratamento (Node 24): 63 arquivos e 597 testes verdes, typecheck limpo.
