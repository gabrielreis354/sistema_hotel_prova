# QA Red Team — SPEC-10, F4 (detalhe/conta da reserva, nova reserva)
**Branch:** feature/t10-fase4-reserva · **Dev:** Sirlande (visual; telas do Gabriel) · **Base:** feature/spec-10-identidade@066d0c4 · **HEAD:** 575a366 · **Data:** 25/11/2026
**Arquivos auditados:** 9 (diff `feature/spec-10-identidade...HEAD`)
**Achados no escopo:** 6 (🔴 0 · 🟡 3 · 🟢 3) · **Repassados:** 1

## Veredito
APROVADO COM RESSALVAS

Nenhum 🔴. Os três 🟡 são efeito colateral visual: um no login, um no número do quarto em reserva com mais de um quarto e um no alinhamento entre a lista e o detalhe.

## Achados no escopo

### 🟡-1 [UI / efeito colateral] O "Entrar" do login fica cinza enquanto envia
**Onde:** `frontend/packages/ui/src/Button.tsx:7` e `:23`; consumidor `frontend/apps/pms/src/features/auth/LoginPage.tsx:149`; CSS próprio `frontend/apps/pms/src/features/auth/login.css:252-259`
**Cenário:** a pessoa digita usuário e senha e toca "Entrar". Com `isSubmitting`, o botão fica `disabled`. O `.login-page .login-submit` (especificidade 0,2,0) pinta o fundo com `--login-accent`. Até agora ele vencia o `bg-brand` (0,1,0), e o desabilitado era o acento a 50%. O `disabled:bg-gray-200:disabled` novo também tem 0,2,0 e vem **depois** no CSS final: `App.js` é importado antes de `index.css` em `main.tsx:5-10`. Conferido no `vite build`: `.login-page .login-submit{` fica no byte 4462 e `disabled\:bg-gray-200:disabled` no byte 38603 do `index-*.css`. Resultado: durante o envio, o botão do login vira um bloco gray-200 com texto gray-600, fora da identidade da tela de entrada. O `disabled:text-gray-600` também vence o `--login-accent-fg`. A F4 não pretendia mexer no login, e nenhum teste pega a mudança, porque o teste vê classe e não a cascata.
**Regra violada:** escopo da F4 (o login não está na lista de decisões de 25/11); GUIA, cada superfície com a sua identidade.
**Correção sugerida:** escolher o comportamento de propósito. Ou o login ganha `.login-page .login-submit:disabled { background-color: rgb(var(--login-accent)); color: …; opacity: .6 }`, ou o cinza é aceito e registrado como decisão. De qualquer forma, conferir no navegador (estado "Entrando…").

### 🟡-2 [UI / dado mostrado] Em reserva com vários quartos, o número em destaque é o primeiro do array, não o principal
**Onde:** `frontend/apps/pms/src/features/reservations/ReservationDetailPage.tsx:150` (`rooms[0]?.number`); a origem não tem ordem em `services/core-service/app/Controllers/ReservationApi/GetReservationController.js:18` (include `rooms` sem `order`)
**Cenário:** uma reserva com os quartos 101 e 102, com o principal `room_id` = 102. O Postgres devolve a junção sem ordem garantida, então o selo grande pode mostrar "101" e, de uma carga para outra, até trocar. O painel Hoje mostra o **principal** (`rows.tsx:262/345/415` usam `r.room?.number`). A recepção que acha a reserva pelo quarto vê 102 no Hoje e 101 no cabeçalho do detalhe. O próprio Resumo marca qual é o "(principal)" (`:345`). Nada indica que existe mais de um quarto: o selo é `aria-hidden` e só o texto ao lado lista "101, 102". Nenhum teste cobre mais de um quarto (o fixture tem `rooms: [{ number: '101' }]`).
**Regra violada:** consistência entre telas (mesmo dado, mesmo valor); o CATALOGO diz que o `RoomNumber` serve para "achar a reserva pelo quarto".
**Correção sugerida:** usar `r.room?.number ?? rooms[0]?.number`, o mesmo critério do Hoje. Opcionalmente, um "+1" quando `rooms.length > 1`. Acrescentar um teste com dois quartos e o principal em segundo no array.

### 🟡-3 [UI / R-7] O detalhe agora alinha à esquerda, e a lista de reservas continua centralizada: o miolo "pula" no fluxo lista → detalhe
**Onde:** `ReservationDetailPage.tsx:143` e `NewReservationPage.tsx:105` (`max-w-5xl`, sem `mx-auto`) × `frontend/apps/pms/src/features/reservations/ReservationsListPage.tsx:62` (`mx-auto max-w-5xl`)
**Cenário:** num monitor de 1920 px, o `<main>` vai até 1440 px (`AppShell.tsx:167`). A recepção está na lista de Reservas (coluna de 1024 px centralizada na área de conteúdo) e abre uma reserva. O detalhe aparece encostado à esquerda, deslocado em `(largura da área − 1024)/2`. É justamente o "pula de largura ao trocar de tela" que o comentário de `:141-142` diz resolver, só que agora entre as duas telas do mesmo módulo e no caminho mais frequente. O mesmo vale para "Nova reserva", que se abre a partir da lista. Os hóspedes (`GuestsListPage.tsx:16`, `GuestDetailPage.tsx:74`) e os quartos (`RoomsListPage.tsx:25`) também seguem centralizados. Observação: o texto da R-7 no estudo (`docs/specs/anexos/SPEC-10-estudo-responsividade.md:31`) diz "**centralizado**". A leitura da decisão de 25/11 (casca centralizada em 1440, página à esquerda dentro dela) é defensável, mas precisa ficar escrita, e a lista precisa ir junto.
**Regra violada:** R-7 (consistência de coluna entre telas); a decisão de 25/11 vale só para metade do módulo.
**Correção sugerida:** tirar o `mx-auto` da `ReservationsListPage.tsx:62` nesta fase, ou registrar que a lista entra na próxima fase. Atualizar a redação da R-7 no estudo para "casca centralizada; página alinhada à esquerda dentro dela".

### 🟢-1 [Testes] O teste do "um cartão só" passaria com as secundárias fora do cartão
**Onde:** `frontend/apps/pms/src/features/reservations/ReservationDetailPage.test.tsx:131-140`
**Cenário:** o teste corta o HTML até `role="tablist"`, conta uma ocorrência da classe do `Card` e procura `acao-cancelar-motivo` e `grid-cols-2`. Se alguém puser as secundárias num `<div>` irmão, **fora** do cartão e antes das abas, o teste continua verde: continua havendo um cartão só, e o motivo e o grid continuam antes do tablist. Ele também não verifica a ordem primário → secundárias.
**Correção sugerida:** cortar do início do cartão até o `</div>` que o fecha, ou marcar o cartão (`data-testid`/`aria-labelledby`) e procurar dentro dele. Garantir também que `indexOf('Fazer check-out')` do primário venha antes de `indexOf('acao-cancelar')`.

### 🟢-2 [UI] Dois visuais de desabilitado na mesma tela
**Onde:** `Button.tsx:15` (secundário ainda em `disabled:opacity-50`) × `:7` (primário e danger em cinza sólido); na tela, `ReservationDetailPage.tsx:183-252`
**Cenário:** durante um check-in (`busy`), o primário do cabeçalho vira um bloco gray-200 ("Fazendo check-in…"), e as secundárias logo abaixo ficam brancas a 50%. São dois idiomas de "indisponível" no mesmo cartão. O teste `uiBase.test.tsx:171` deixa a diferença como regra. O contraste está certo: gray-600 sobre gray-200 dá cerca de 6,1:1, então o texto do desabilitado se lê. No painel de cancelar, o danger só desabilita durante o `busy` ("Cancelando…") e não parece mais perigoso, o que está correto.
**Correção sugerida:** só registrar como decisão no CATALOGO (linha do `Button`) para ninguém "consertar" depois. Não exige mudança.

### 🟢-3 [KISS] Classes redundantes
**Onde:** `ReservationDetailPage.tsx:435` (`px-3 text-sm` já vem do `size="compact"`, `Button.tsx:35`); `:256` e `:273` (`mt-4` dentro de um `Card` com `space-y-4`, e o seletor do `space-y` vence)
**Cenário:** nenhuma falha visível. Quem mudar o compact não vai ver o efeito nas secundárias, e o `mt-4` engana quem lê.
**Correção sugerida:** `SECONDARY_ACTION = 'sm:w-auto'` e tirar o `mt-4`. O comentário de `:434` também pode citar o `compact` em vez de descrever a classe.

## Repassados a outro dev

| Sev. | Achado | Onde | Dono | Repasse |
|------|--------|------|------|---------|
| 🟡 | "Cancelar reserva" fica `disabled` no próprio clique e o foco cai no `body` (anterior à F4) | `ReservationDetailPage.tsx:243-247`, `:255` | Gabriel (Reservas, DIVISAO §3) | `docs/qa/repasses/para_gabriel_25112026.md` |

## O que foi verificado e está correto
- O alvo de toque das secundárias continua em 48 px fora do desk: o `compact` é `min-h-touch … desk:h-9 desk:min-h-0` (`Button.tsx:35`), e o `SECONDARY_ACTION` novo não tira o `min-h`.
- RNF-026, CA-05.2.e e CA-08.f: as três secundárias continuam com `ActionSlot` e `aria-describedby`. Nenhuma some, e o cancelar continua por último (`:200-253`).
- Ordem de leitura e de foco: hóspede → status → saldo → primário → secundárias → confirmação → aviso. O selo do quarto é `aria-hidden` e não entra na leitura.
- Grade de 2 colunas: `min-w-0` nos itens impede o transbordo. Com 3 ações (sem primário, por exemplo `CHECKED_OUT`, ou na aba Conta com saldo), o cancelar fica sozinho na 2ª linha, à esquerda. Isso é aceitável e não esconde nada. Os motivos longos quebram em várias linhas e só aumentam a altura da linha da grade.
- O `twMerge` resolve `disabled:opacity-50` × `disabled:opacity-100` a favor do da variante, como o teste `uiBase.test.tsx:168` confirma. O `RoomNumber` com `h-12 min-w-12 text-base` substitui `h-10/min-w-10/text-sm` sem conflito com o `cn` estendido.
- Outros usos de danger/primary desabilitado: na comanda, `StaffActions.tsx:170` ("Sim, fechar" enquanto o saldo carrega) fica cinza e legível, o que melhora a leitura. `DeleteControl.tsx:35/45` e `GuestDetailPage.tsx:124` também estão certos. No "Confirmar reserva" (`NewReservationPage.tsx:213-219`), o motivo continua por `aria-describedby`.
- `buttonClasses` só é usado no `ButtonLink` (`<a>`, sem estado desabilitado), então nada muda nos links.
- `RoomNumber`: promovido no segundo uso (regra do CATALOGO) e exportado em `index.ts`. O Hoje usa o mesmo componente sem diferença visual (classes idênticas às antigas).
- Nova reserva: o `PageHeader` sem `action` não deixa contêiner vazio (`PageHeader.tsx:28`). O `BackLink` tem `min-h-touch`.
- O `primaryButtons()` do teste existente continua casando (`bg-brand text-brand-fg` mantém a ordem na string).

## Não foi possível verificar
- Aparência real do login cinza (🟡-1): a conclusão vem da ordem do CSS no build, não de captura de tela.
- Se "Cancelar reserva" em `text-sm`, numa coluna de cerca de 141 px a 360 px, quebra em duas linhas com a Inter. Pela conta, cabe no limite. Não houve navegador nesta auditoria.
- Leitor de tela no aviso (`Notice` com foco) agora dentro do cartão do cabeçalho: a estrutura é a mesma da base, então não deve haver regressão, mas não foi ouvido.

---

## Resolução (25/11, mesma sessão)

| Achado | O que foi feito | Commit |
|---|---|---|
| 🟡1 "Entrar" do login cinza ao enviar | Regra `.login-page .login-submit:disabled` com o acento do login a 70% (especificidade maior que o utilitário) | `23ce9f5` |
| 🟡2 número em destaque era o primeiro de `rooms` | Usa o principal (`room_id`), como a seção Quartos; teste com dois quartos fora de ordem | `23ce9f5` |
| 🟡3 lista de reservas ainda centralizada | A lista também encosta à esquerda; R-7 do estudo de responsividade atualizada | `23ce9f5` |
| 🟢 teste fraco do cabeçalho | Confere o fio do cartão e a ordem primário → secundárias | `23ce9f5` |
| 🟢 dois visuais de desabilitado | Secundário desabilitado com fundo gray-50 e texto gray-500 (4,6:1), sem esmaecer; o critique B mediu 3,38:1 no anterior | `5d0c17c` |
| 🟢 classes redundantes | Removidas | `23ce9f5` |
| Repasse (foco do cancelar cai no body) | Anterior à F4; em `docs/qa/repasses/para_gabriel_25112026.md` | — |
