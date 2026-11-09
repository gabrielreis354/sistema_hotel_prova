# QA Red Team — T-05.3 Painel "Hoje"
**Branch:** feature/t053-painel-hoje · **Dev:** Gabriel (agente executor) · **Base:** develop@cb04f85 (origin/develop já está em 3e68e7f) · **Data:** 04/11/2026
**Arquivos auditados:** 48 (diff `cb04f85..7db708f`)
**Achados no escopo:** 6 (🔴 0 · 🟡 4 · 🟢 4) · **Repassados:** 2

> **ALERTA FORA DO ESCOPO.** `CheckInController` não confere o status do quarto: faz check-in em quarto OCCUPIED, CLEANING ou MAINTENANCE. Com o painel, a recepção pode pôr um segundo hóspede num quarto que ainda tem a saída atrasada, liberar esse quarto com alguém dentro e vendê-lo de novo. Arquivo: `services/core-service/app/Controllers/ReservationApi/CheckInController.js:31-35`. Dono: **DONO INDEFINIDO**. Repasse em `docs/qa/repasses/para_dono_indefinido_04112026.md`.

## Veredito
**APROVADO COM RESSALVAS**

Não há 🔴 no escopo. Pontos 1 a 3 do foco: allowlist, isolamento por tenant, papéis, 409/404, lock e a transição CLEANING→MAINTENANCE nos dois lados estão corretos e têm teste. As ressalvas são 4 🟡 de frontend. Antes da demonstração, a mais importante é a 🟡-1: a confirmação do check-out pode mostrar um saldo velho.

## Achados no escopo

### 🟡-1 [UI/UX · dinheiro] A confirmação do check-out pode mostrar um saldo velho, tirado do cache, e o botão "Confirmar" fica liberado
**Onde:** `frontend/apps/pms/src/features/today/components/rows.tsx:152-153` e `:207`. O padrão de cache está em `frontend/apps/pms/src/lib/queryClient.ts:8` (`staleTime: 30_000`).
**Cenário:**
1. A recepcionista toca "Fazer check-out" no quarto 12. `useBill` busca a conta e mostra "Conta quitada". Ela toca "Voltar".
2. Menos de 30 s depois, o garçom lança R$ 80 de consumo em outro aparelho. Nada no aparelho da recepção invalida `reservationKeys.bill`.
3. Ela reabre a confirmação. Como os dados ainda estão "frescos", não há nova busca. Mesmo depois dos 30 s, `bill.data` aparece na hora enquanto a nova busca roda em segundo plano (`isPending` falso).
4. A tela diz "Conta quitada" e o botão segue liberado (`disabled={busy || !bill.data}`). O check-out sai com R$ 80 em aberto.
5. O backend não barra check-out com saldo: `CheckOutController.js` só valida o status. O hóspede vai embora sem pagar.

**Regra violada:** DESIGN_PMS §5 ("ação irreversível pede confirmação"). Uma confirmação com dado velho não confirma nada. SPEC-05 CA-05.3.b pede "busca Q5 e mostra o saldo devido" no momento da confirmação.
**Correção sugerida:** buscar a conta sempre que a confirmação abrir: `refetchOnMount: 'always'` ou `staleTime: 0` num `useBill` próprio para essa tela, ou `bill.refetch()` no `onClick`. E bloquear o botão enquanto `bill.isFetching`. Teste: com a conta em cache e o servidor devolvendo saldo > 0, o botão fica bloqueado até a resposta chegar e o aviso de saldo aparece.

### 🟡-2 [UI/UX · alvo de toque] A partir de 768 px, que já é tablet, os alvos de toque caem para 40 px nos botões e uns 20 px nos links
**Onde:**
- `frontend/apps/pms/src/features/today/components/rows.tsx:25`: `ROW_ACTION = '… md:min-h-0 md:h-10 …'`
- `rows.tsx:52`: `GuestLink … min-h-touch … md:min-h-0`
- `frontend/apps/pms/src/features/today/TodayPage.tsx:84`: botão Fechar com `md:h-9 md:min-h-0`
- `TodayPage.tsx:222`: itens de Atenção com `md:min-h-0 md:py-1`

**Cenário:** um iPad em retrato (768×1024) no balcão é uma tela de toque. Lá, "Fazer check-in", "Liberar quarto" e "Confirmar check-out" ficam com 40 px, e o nome do hóspede, que abre a reserva, fica com a altura da linha de texto. Os botões de linha ficam lado a lado em listas densas, então um toque errado cai na linha vizinha. Junto com o 🟢-1 (liberar sem confirmação), isso põe à venda um quarto que ainda não foi limpo.
**Regra violada:** CA-05.3.d ("alvo ≥ 48 px medido"). DESIGN_PMS §5 reserva o `compact` para "tabela e rack **no desktop**". PLANEJAMENTO_FRONTEND §4 trata 768–1279 px como tablet.
**Correção sugerida:** subir o corte de `md:` para `lg:` nesses quatro pontos. Assim o tablet fica `comfortable` e só o desktop (≥ 1024 px) fica denso.

### 🟡-3 [Domínio · defesa em profundidade] O painel oferece check-in de um toque num quarto que tem saída atrasada na mesma tela, e o release confia só em `room.status`
**Onde:**
- `frontend/apps/pms/src/features/today/components/rows.tsx:100-120` (ArrivalItem)
- `services/core-service/app/Controllers/RoomApi/ReleaseRoomController.js:35`

**Cenário (D-9 torna isso comum):**
1. A saída atrasada do quarto 12 (CHECKED_IN, saída era ontem) aparece em "Saídas". A chegada de hoje para o mesmo quarto 12 aparece em "Chegadas" com "Fazer check-in" liberado. O `checkReservationConflict` não barrou essa reserva, porque os períodos não se sobrepõem.
2. Um toque: o backend aceita (ver alerta e repasse). Agora há dois CHECKED_IN no quarto 12.
3. O hóspede atrasado faz check-out e o quarto vai para CLEANING com o hóspede novo dentro. "Liberar quarto" leva o quarto a AVAILABLE, porque o release só olha `RELEASABLE_FROM.includes(room.status)`. O quarto volta para `/rooms/available` e pode ser vendido de novo.

A causa raiz está fora do escopo. O que é desta branch: a tela que expõe o caminho e um endpoint novo de liberação sem nenhuma checagem.
**Regra violada:** CLAUDE.md §3, máquina de estados do quarto (check-in só AVAILABLE → OCCUPIED). É o mesmo motivo do R-3 de 21/10: "liberar à mão um quarto OCCUPIED o devolvia a /rooms/available com hóspede dentro".
**Correção sugerida (mínima, nesta branch):**
1. No `ReleaseRoomController`, recusar com 409 quando existe reserva `CHECKED_IN` com o quarto (principal ou em `reservation_rooms`), dentro da mesma transação.
2. No painel, desabilitar o check-in da chegada com o motivo "Quarto 12 ainda ocupado por <hóspede> (saída atrasada)" quando o quarto aparece em `departureList` como atrasado. `ActionSlot` já suporta "desabilitado com motivo".

### 🟡-4 [DRY/KISS] Dois `Money` com contratos incompatíveis e dois `Notice` com o mesmo nome e semânticas diferentes; o CATALOGO diz que o Money foi promovido
**Onde:**
- `frontend/apps/pms/src/features/rooms/components/Money.tsx:7` recebe `value: string` (DECIMAL), converte e trata `MoneyParseError` mostrando "Valor inválido". O comentário da linha 5 ("candidato a promoção") ficou desatualizado.
- `frontend/packages/ui/src/Money.tsx:12` recebe `cents: Cents` e não trata nada.
- `frontend/apps/pms/src/features/accounts/components/Notice.tsx:10` é um aviso neutro (cinza, `focus` opcional) com o mesmo nome do `Notice` de `@hotel/ui` (`packages/ui/src/Notice.tsx:18`, sucesso/erro).
- `frontend/packages/ui/CATALOGO.md:36-37,56` tira `Money` dos candidatos como se a promoção estivesse fechada.

**Cenário:** o próximo módulo que mostra preço de categoria (decimal string) importa `Money` de `@hotel/ui` porque o CATALOGO manda. O TypeScript obriga a converter antes, e cada tela reescreve o `try/catch` de `MoneyParseError` do seu jeito, ou não reescreve. A regra "DECIMAL inválido vira 'Valor inválido', não quebra a tela" fica só em `rooms/`. Com o `Notice`, um auto-import do editor traz o componente errado, e os dois têm `role` e visual diferentes.
**Regra violada:** CODING_STANDARDS (DRY) e CATALOGO ("o segundo promove"). A promoção ficou pela metade.
**Correção sugerida:** no `@hotel/ui`, `Money` aceita `cents` **ou** `decimal` e centraliza o `MoneyParseError`. Depois disso, apagar `rooms/components/Money.tsx`. Renomear o `Notice` de contas para `InfoNote` (ou promovê-lo como `tone="info"`). Uma linha no CATALOGO registrando a dívida enquanto não fecha.

### 🟢-1 [UI/UX] "Liberar quarto" e "Fazer check-in" executam com um toque, sem confirmação nem como desfazer
**Onde:** `rows.tsx:246-262` (liberar) e `rows.tsx:111-118` (check-in).
**Cenário:** um toque errado na linha vizinha põe à venda um quarto ainda sujo. A recepção não consegue voltar atrás: AVAILABLE→CLEANING não existe, e MAINTENANCE é só do ADMIN. O check-in errado abre conta e ocupa o quarto, também sem volta. A lista de DESIGN_PMS §5 não cita essas ações, por isso não é 🟡.
**Correção sugerida:** janela de "desfazer" de alguns segundos no aviso fixo, adiando o `mutate`. Ou confirmação curta só no check-in.

### 🟢-2 [UI/UX] O bloco "Na casa" não avisa quando a lista foi cortada
**Onde:** `TodayPage.tsx:155-171`. Falta a prop `truncated`, que "Saídas" (`:146`) tem para os mesmos dados.
**Cenário:** com mais de 100 CHECKED_IN (`TODAY_LIMIT`), "Na casa" mostra 100 sem nenhum aviso. Isso é improvável no público-alvo.
**Correção sugerida:** passar o mesmo `truncated` de `inHouse.data`.

### 🟢-3 [Acessibilidade] A folha "Mais" não leva o foco para dentro ao abrir e depende de altura fixa
**Onde:** `frontend/apps/pms/src/components/AppShell.tsx:86-91` (`bottom-12`) e `:124-138`.
**Cenário:**
- Quem usa teclado ou leitor de tela abre "Mais" e o foco continua no botão. É preciso adivinhar que a folha abriu acima da barra.
- `bottom-12` (48 px) só funciona enquanto a barra tiver exatamente `min-h-touch`. Rótulo que quebra em duas linhas ou `safe-area-inset-bottom` no iPhone sobrepõem a folha à barra.

**Correção sugerida:** focar o primeiro item ao abrir. Ancorar a folha na barra (wrapper `relative` com a folha em `bottom-full`) em vez de usar um número fixo.

### 🟢-4 [Contrato] O Swagger de `PUT /rooms/{id}/release` não declara 401
**Onde:** `services/core-service/config/swagger.js:865-877`.
**Cenário:** o teste `room-release.test.js` ("sem token → 401") garante o 401, mas o cliente tipado não tem esse ramo. Hoje `releaseRoom` cai na mensagem genérica (`roomsApi.ts:81`). Efeito baixo, porque o interceptor de sessão deve tratar antes.
**Correção sugerida:** acrescentar `401: Error`. O arquivo já declara 401 em 24 pontos; os outros endpoints de quartos também não declaram, então o ajuste vale para o grupo.

## Repassados a outro dev

| Sev. | Achado | Onde | Dono | Repasse |
|------|--------|------|------|---------|
| 🔴 | Check-in não confere o status do quarto (aceita OCCUPIED/CLEANING/MAINTENANCE), o que leva a dois hóspedes no quarto e a vender de novo quarto com hóspede dentro | `services/core-service/app/Controllers/ReservationApi/CheckInController.js:31-35` | DONO INDEFINIDO (histórico: Gabriel e Sirlande) | `docs/qa/repasses/para_dono_indefinido_04112026.md` |
| 🟢 | `/analytics/alerts` no core ainda envia `guest_phone` e o nome do hóspede, e agora o painel busca isso a cada 60 s em todo aparelho da recepção (a tela não lê) | `services/core-service/app/Controllers/AnalyticsApi/GetAlertsController.js:11-12` | Gabriel (H.3) | `docs/qa/repasses/para_gabriel_04112026.md` |

O bug de fuso do `/analytics/alerts` (`CURRENT_DATE` em UTC) já estava repassado em `docs/qa/repasses/para_gabriel_h3_04112026.md` (D-8). Não foi duplicado.

## O que foi verificado e está correto

1. **`GET /reservations?status=`**
   - `parseStatusFilter` (`app/utils/reservationStatuses.js:14-21`) é allowlist e recusa a lista inteira quando algum item é inválido: `FOO`, vazio, `pending`, `,`, `PENDING,FOO`, array (`?status=A&status=B`) e objeto qs (`status[x]=`).
   - O `where` nasce com `tenant_id` do JWT (`ListReservationController.js:25`) e o status só é acrescentado depois.
   - Testes: lista inválida, array, isolamento entre dois hotéis e contrato antigo sem `status` (`tests/reservations-status-filter.test.js`).
2. **`PUT /rooms/:id/release`**
   - Papéis: `requireRole('ADMIN','RECEPTIONIST')` (`roomRouter.js:28`). WAITER recebe 403. O PUT genérico continua só ADMIN, e há teste disso.
   - Erros: 409 com `code` para AVAILABLE/MAINTENANCE/OCCUPIED. 404 para outro tenant e para id não-UUID (`findInTenant`).
   - Corrida: transação com `SELECT … FOR UPDATE`. O check-in faz `UPDATE` sem lock explícito, mas o `UPDATE` também trava a linha. Se o check-in grava primeiro, o `FOR UPDATE` do release espera e relê OCCUPIED, o que dá 409. Se o release grava primeiro, o check-in espera e sobrescreve com OCCUPIED. Nenhuma ordem perde a escrita.
   - Rota `/:id/release` não conflita com `/:id` (segmento a mais).
3. **CLEANING→MAINTENANCE nos dois lados:**
   - backend `app/utils/roomRules.js:22`;
   - `@hotel/domain` `state-machines.ts:55`;
   - `roomRules.ts` do PMS;
   - Swagger e CLAUDE.md §3;
   - testes nos dois lados, incluindo o negativo MAINTENANCE→CLEANING.
   - A transição fica só no PUT genérico (ADMIN). O formulário de edição está em `roomsAdminRoutes`.
4. **Painel: máquina de estados.** O check-in e o check-out da linha usam `reservationActions` e `useTransitionReservation` do módulo de reservas, sem regra reescrita. O backend continua validando (`CheckInController`: PENDING/CONFIRMED; `CheckOutController`: CHECKED_IN).
5. **LGPD na tela.** Nenhum arquivo de `features/today` ou `features/analytics` lê `guest_phone`. `RawAlerts` não declara o campo (`todayLogic.ts:116-120`). A listagem de reservas devolve do hóspede só `id, full_name, email`.
6. **Estados de tela.** Cada bloco tem carregando, erro com "Tentar de novo", vazio com próximo passo, e falha sozinho (`TodayBlock.tsx`). Atenção e contadores também têm erro próprio. Falha de servidor ou de rede vira frase do balcão (`todayApi.ts:24-31`).
7. **Barra inferior.** No máximo 5 abas (`MOBILE_TABS_MAX`). Itens filtrados pelo papel, da mesma fonte do `RequireRole`. O "Mais" só aparece para o ADMIN. Teste em `nav.test.ts` para os 3 papéis. Abaixo de 768 px, todos os alvos usam `min-h-touch` (48 px).
8. **Cache por usuário** (`todayKeys` com `scope`) e dia do hotel em `America/Sao_Paulo` com virada à meia-noite (`queries.ts:35-42`). Dinheiro chega em centavos via `officialBalanceCents`, sem `Number()` sobre DECIMAL.
9. **Sem `require()`, sem `findByPk`, sem PII em `console.*`** nos arquivos novos.

### Saída real das verificações (04/11/2026, worktree `/home/gabri/wt-t053`)

```
core-service — npx vitest run (PG 17 efêmero em :5464, container removido depois)
  Test Files  55 passed (55)
       Tests  1150 passed | 1 skipped (1151)
  Coverage: Statements 85.73% · Branches 82.48% · Functions 89.3% · Lines 87.55%
  (só os dois arquivos novos: 2 files / 22 tests passed)

frontend — pnpm test
  @hotel/domain:test  Test Files 3 passed (3) · Tests 39 passed (39)
  app-pms:test        Test Files 18 passed (18) · Tests 214 passed (214)
  Tasks: 2 successful, 2 total

frontend — pnpm typecheck
  Tasks: 4 successful, 4 total   (nenhum erro)

frontend — pnpm lint
  Tasks: 0 successful, 0 total   (nenhum pacote define a tarefa lint)

bash scripts/qa_checks.sh
  ⚠ 3 aviso(s). Nenhum erro bloqueante.
  - Router sem Swagger: corporateClient, eventQuote, roomCategory    (fora do diff)
  - <button> cru em guests/GuestsListPage.tsx:28                     (fora do diff)
  - classes repetidas 3x em reservations/rooms/guests/auth           (fora do diff)
```

## Não foi possível verificar

- **Medição real dos alvos de toque e do contraste no navegador.** A análise saiu das classes Tailwind e do preset (`touch: 48px`). O E2E Playwright citado no relatório da sessão (109 PASS) não foi reexecutado.
- **Conflito de merge com `origin/develop`.** Ele avançou para `3e68e7f` (T-04.4) depois da base `cb04f85`. Não foi testado se a branch faz merge limpo nem se a suíte passa sobre o develop atual. Fazer o rebase e rodar de novo antes do merge.
- **Comportamento da lista de limpeza com o analytics-service da H.3** (consistência eventual). Já registrado no repasse da H.3.
- **`pnpm lint`.** Não existe tarefa de lint nos pacotes, então nada foi verificado por ele.
