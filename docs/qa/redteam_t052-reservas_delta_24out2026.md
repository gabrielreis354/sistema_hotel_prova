# QA Red Team — T-05.2 Reservas e check-in/out (reauditoria delta)
**Branch:** feature/t052-reservas · **Dev:** Gabriel (agente executor de frontend) · **Base:** develop@c6742b2 (merge-base; `origin/develop` está em 10155e3) · **Delta:** e3972c0..054fb13 (10 commits) · **Data:** 24/10/2026
**Arquivos auditados:** 17 no delta: `packages/domain/src/state-machines.ts` e o teste dele, `features/guests/queries.ts`, os cinco arquivos de tela/componente de `features/reservations/`, `reservationLogic.ts` e o teste, o novo `reservationsApi.test.ts`, `queries.ts`, mais SPEC-05, relatório, retomada e repasse. De contexto, li `CheckInController.js`, `GetBillController.js` e `paymentEnums.js` do `origin/develop` (T-06.13), o preset do Tailwind, `Button.tsx`, `queryClient.ts`, `origin/feature/t051-quartos-categorias` e `origin/docs/decisoes-delegacoes-21out`.
**Achados no escopo:** 6 (🔴 0 · 🟡 2 · 🟢 4) · **Repassados:** 0

> Não há 🔴 de segurança, vazamento ou dinheiro fora do escopo.

## Veredito
**APROVADO COM RESSALVAS**

Das ressalvas da rodada anterior, 7 de 8 fecharam. A 🟡-4 (busca de hóspede) fechou só em parte, como o próprio executor declara, e fica como dívida datada da T-05.12. A mudança em `@hotel/domain` só acrescenta a transição pedida e não afeta outro consumidor. Não há 🔴.

Sobram duas ressalvas 🟡:
- a busca de hóspede ainda baixa a base inteira depois do 3º caractere;
- uma quebra de integração com o `develop` atual: o estorno da T-06.13 e os métodos novos de pagamento saem como enum cru no comprovante entregue ao hóspede.

A segunda aparece no primeiro `git merge origin/develop`, que entra sem conflito.

Execução real em 24/10, com Node 24.14 e pnpm 9.15:
- `pnpm -r typecheck`: exit 0 em 4 de 4 pacotes;
- `pnpm -r test`: domain 31/31, pms 36/36, em 3 arquivos (eram 30 + 22 antes);
- `pnpm build` do `app-pms`: ok, 415 kB;
- `bash scripts/qa_checks.sh`: 3 avisos, os mesmos 3 preexistentes da rodada anterior, nenhum do módulo de reservas.

Não subi banco nem backend, porque o delta é só de frontend e o contrato foi conferido no código do backend. As mutações foram aplicadas e desfeitas com cópia de segurança, e o worktree está limpo.

### Prova de que os testes novos não dão falso verde (mutação)
| Mutação | Resultado |
|---|---|
| `createReservation`: 409 ignora `room_ids` | pego (1 falha) |
| `createReservation`: 409 vira `ApiError` comum | pego (2 falhas) |
| `transitionReservation`: 422 sem tratamento | pego (1 falha) |
| `cancel` chamando outro endpoint | pego (1 falha) |
| `pending` volta a somar todo `notCounted` (regressão da 🟡-2) | pego (1 falha) |
| `awaiting: status !== 'PAID'` | pego (1 falha) |
| `maskCpf` devolve os 11 dígitos | pego (1 falha) |
| `@hotel/domain` revertido (`PENDING` sem check-in) | pego no domain (2) e no pms (1) |
| `PENDING → CHECKED_OUT` acrescentado | pego (1 falha) |
| `CHECKED_IN → CANCELLED` acrescentado | pego (1 falha) |
| `maskCpf` aceita ≥ 10 dígitos | **sobrevive**, ver 🟢-1 |
| `GuestPicker` volta a `useGuests()` sem `enabled` | **sobrevive**, ver 🟢-1 |
| `MIN_TERM = 1` | **sobrevive**, ver 🟢-1 |
| lista sem `enabled: rangeOk` | **sobrevive**, ver 🟢-1 |

---

## Situação das ressalvas da rodada anterior

| Ressalva | Situação | Evidência |
|---|---|---|
| 🟡-1 `PENDING` sem check-in pela tela | ✅ **Fechada** | `state-machines.ts:22` passa a ser `PENDING: ['CONFIRMED', 'CHECKED_IN', 'CANCELLED']`. A linha só acrescenta: `CONFIRMED`, `CHECKED_IN`, `CHECKED_OUT` e `CANCELLED` ficaram iguais, e `canCancelReservation` continua dando `true` apenas para `PENDING` e `CONFIRMED` (teste `:29-33`). A regra bate com `CheckInController.js:26` (`['PENDING','CONFIRMED']`). `CHECK_IN_BLOCKED` perdeu a entrada `PENDING` (`reservationLogic.ts:90-94`). Fora do próprio pacote, o único consumidor de `canCheckIn`, `canCheckOut`, `canCancelReservation` e `canTransitionReservation` em todo o `frontend/` é `reservationLogic.ts:126-128` (grep). `admin` e `booking` não usam. O CLAUDE.md §3 já foi atualizado em `origin/docs/decisoes-delegacoes-21out`, com o diagrama de walk-in |
| 🟡-2 "aguardando" somava EXPIRED/FAILED | ✅ **Fechada** | `awaiting = status === 'PENDING'` (`reservationLogic.ts:270`). `pending` soma só `awaiting`, e `paid` soma só o que não é `notCounted` (`:287-288`). Isso é igual ao `total_pending` do `GetBillController`. Há teste com EXPIRED e FAILED, e a mutação é pega |
| 🟡-3 CPF inteiro no comprovante | ✅ **Fechada** | `maskCpf` → `***.456.789-**` (`reservationLogic.ts:346-350`). Entrada com outro tamanho é omitida (fail-safe). Ver o item LGPD abaixo e a 🟢-1 |
| 🟡-4 GuestPicker baixava todos os hóspedes | ⚠️ **Parcial** | Abrir a tela já não dispara consulta (`useGuests({ enabled: searched })`, `GuestPicker.tsx:23-26`). Depois de 3 caracteres, a coleção inteira ainda vem. Segue aberta como 🟡-1 |
| 🟡-5 contraste abaixo de AA | ✅ **Fechada** | Ver a tabela de contraste. Nenhuma cor literal, só tokens do preset e a escala `gray` |
| 🟡-6 sem testes de 409/422 | ✅ **Fechada no essencial** | `reservationsApi.test.ts` cobre 9 casos com `api` mockado: 409 com e sem `room_ids`, 400, 500, 201, 422, endpoint dedicado e 409 do cancelamento de bloco. As mutações são pegas. O roteiro E2E segue fora do repo (pendência nº 6 do relatório, por falta de convenção de pasta) |
| 🟢-2 asserção condicional | ✅ **Fechada** | `reservationLogic.test.ts:74-79` passa a usar `toEqual` firme para as três ações |
| 🟢-3 menores | ✅ **Fechada** | Usa `RESERVATION_STATUSES` do domínio (`:132-134`). Alvo de toque: `min-h-touch md:min-h-0` no link da lista, no `BackLink` e no "Tentar de novo". No caso do `h-9`, o `min-height` de 48 px prevalece no celular. `?pagina` além da última página volta para a última (`ReservationsListPage.tsx:45-53`, sem laço: o efeito para quando `page ≤ pages`). A lista usa `enabled: rangeOk` (`queries.ts:22-27`) |

### Contraste (WCAG, medido sobre os tokens do preset)
| Par | Razão | Mínimo |
|---|---|---|
| `Notice` sucesso: `gray-900` / `status-occupied/10` | 15,91 | 4,5 ✅ |
| `Notice` erro: `gray-900` / `status-maintenance/10` | 15,18 | 4,5 ✅ |
| "Conta quitada": `gray-700` / branco (ponto verde `aria-hidden` + texto) | 10,31 | 4,5 ✅ |
| `text-status-maintenance` / branco (erros restantes, "indisponível") | 4,83 | 4,5 ✅ |
| `text-brand` / `brand/10` (número dos passos) | 4,76 | 4,5 ✅ |
| Borda `status-occupied` do `Notice` (elemento não textual) | 3,30 | 3,0 ✅ |

Não sobrou `text-status-occupied` nem `text-status-cleaning` em `features/reservations/`, confirmado por grep. A cor do `Notice` foi para a borda e o fundo, e o texto diz o que aconteceu, então o estado não depende só da cor.

---

## Achados no escopo

### 🟡-1 [Princípio 7 / LGPD art. 6º, III] A busca de hóspede ainda baixa o cadastro inteiro do tenant, só que agora depois do 3º caractere (resta da 🟡-4)
**Onde:** `frontend/apps/pms/src/features/reservations/components/GuestPicker.tsx:23-31` → `features/guests/queries.ts:21-23` (`queryKey: ['guests']`, `queryFn: listGuests`) → `GET /guests` sem `q` nem `limit`.
**Cenário:** uma pousada com 8.000 hóspedes. O recepcionista abre `/reservas/nova`: nada é baixado (correção confirmada). Ele digita "Ana" e os 8.000 registros, com nome, CPF, telefone e e-mail, vêm para o navegador, para mostrar no máximo 6 resultados.

Com `staleTime: 30_000` (`lib/queryClient.ts:8`), quem apaga o termo e volta a digitar mais de 30 s depois baixa tudo de novo, porque o `enabled` volta para `true` com o dado vencido. A cópia fica no cache do TanStack Query até o `gcTime`, que é de 5 min por padrão, e é compartilhada com a tela de hóspedes pela mesma chave.

**Classificação:** o paliativo atende exatamente a sugestão da rodada anterior e reduz o caso mais frequente, que é abrir a tela sem buscar. O princípio 7 continua violado assim que há busca: "nenhuma tela baixa coleção inteira do tenant para filtrar na memória" (DIVISAO §9, item 7). Não é 🔴 porque não cruza tenant e porque não existe alternativa no backend hoje. **Não reprova.**
**Pendência registrada:** T-05.12, `GET /guests?q=&limit=`, com a troca de `useGuests` + `filterGuests` do `GuestPicker` por consulta no servidor. Ela já consta no relatório (`t052_reservas_21102026.md`, pendência nº 3, que diz "depois de digitar, ainda baixa") e em SPEC-05 §5. O registro está honesto e não precisa de repasse novo.
**Correção sugerida:** nenhuma nesta branch além do que foi feito. Quando a T-05.12 entrar, a consulta precisa ter chave própria (`['guests','search',q]`) para não reaproveitar o cache da lista inteira.

### 🟡-2 [Integração com `develop` / comprovante] Estorno (VOIDED) e os métodos novos da T-06.13 saem como enum cru no papel entregue ao hóspede
**Onde:** `frontend/apps/pms/src/features/reservations/reservationLogic.ts:188-202` (`PAYMENT_METHOD_LABEL` e `PAYMENT_STATUS_NOTE`) e `:259-260` (o fallback `?? p.method` / `?? p.status`). O texto é exibido em `ReservationReceiptPage.tsx:75-87` e `components/BillTimeline.tsx`.
**Contexto:** o `origin/develop` (10155e3, PR #100) trouxe `PAYMENT_STATUSES = [..., 'VOIDED']` e `PAYMENT_METHODS = ['PIX','CARTAO_CREDITO','CARTAO_DEBITO','DINHEIRO']` (`services/core-service/app/utils/paymentEnums.js`). O `GetBillController` agora devolve o pagamento estornado na lista, com `void_reason` e `voided_at`. O `git merge-tree origin/develop HEAD` não acusa conflito, então isso entra em produção no merge sem nenhum aviso.
**Cenário:**
1. A recepção lança R$ 200,00 em cartão de crédito por engano, e a gerência estorna (`POST /payments/{id}/void`).
2. Depois o hóspede paga certo em dinheiro.
3. No check-out, o comprovante impresso traz duas linhas: "Pagamento · CARTAO_CREDITO (VOIDED) −R$ 200,00" e "Pagamento · Dinheiro −R$ 200,00".

A tabela do comprovante não diferencia linha que não conta (o `BillTimeline` usa cinza e `sr-only`, mas o comprovante não usa nada). O hóspede lê que pagou R$ 400,00, e o saldo diz outra coisa. O mesmo vale para o lançamento correto em `CARTAO_CREDITO` e `CARTAO_DEBITO`, que sai como enum cru mesmo quando está pago.

O dinheiro está **certo**: o `notCounted` vale para tudo que não é PAID, então o VOIDED não abate e não soma em "aguardando", igual ao `total_paid` e ao `total_pending`. O erro é de leitura num documento entregue ao hóspede.
**Regra violada:** PLANEJAMENTO_FRONTEND §8.2 / princípio 10 (status com rótulo legível em PT-BR). O comprovante passa a contradizer o próprio saldo (CA-05.2.k).
**Correção sugerida:** no passo de merge de `develop` (que já é obrigatório antes de integrar):
- acrescentar `VOIDED: 'estornado'` em `PAYMENT_STATUS_NOTE` e `CARTAO_CREDITO` / `CARTAO_DEBITO` em `PAYMENT_METHOD_LABEL`;
- no comprovante, marcar as linhas `notCounted` com texto ("não abate") ou omitir as `VOIDED`;
- criar um caso de teste em `buildBillTimeline` com um pagamento `VOIDED`;
- regenerar o `api-client` depois do merge, para os campos `void_reason` e `voided_at`.

### 🟢-1 [Testes] Quatro comportamentos do delta não têm teste que os prenda
**Onde:**
- `reservationLogic.test.ts:190-201`: o `maskCpf` não testa 10 nem 12 dígitos. A mutação `digits.length < 10` passa: entrada de 12 dígitos imprimiria um "CPF" com fatia errada em vez de ser omitida.
- `GuestPicker.tsx:9,26`: voltar para `useGuests()` sem `enabled`, ou `MIN_TERM = 1`, passa nos testes. O paliativo da 🟡-1 não tem guarda.
- `ReservationsListPage.tsx:27` (`enabled: rangeOk`) e `:45-53` (redirecionamento de página): sem teste.

**Cenário:** um refactor desfaz o paliativo e o CI continua verde.
**Correção sugerida:** acrescentar `maskCpf('123456789001')` e `maskCpf('1234567890')` → `null`. Para o resto, extrair `MIN_TERM` e a regra "consulta só com termo" para `reservationLogic` e testá-la ali, ou cobrir pelo roteiro E2E quando ele for versionado.

### 🟢-2 [Legibilidade] Comentário truncado e linhas em branco duplicadas no `GuestPicker`
**Onde:** `GuestPicker.tsx:25`, "A solução definitiva é  (T-05.12)." (falta o objeto: `GET /guests?q=`), e `:62-63`, onde ficaram duas linhas vazias no lugar do `const searched` removido.
**Correção sugerida:** completar o comentário e remover a linha extra.

### 🟢-3 [UX] Erro de consulta de hóspede continua visível depois de apagar o termo
**Onde:** `GuestPicker.tsx:80-84`.
**Cenário:** o recepcionista digita "Ana" e a consulta falha. Ele apaga o termo, o `enabled` vira `false`, mas o `guests.isError` continua `true`. Aparecem ao mesmo tempo "Não foi possível consultar os hóspedes…" e "Digite ao menos 3 caracteres…".
**Correção sugerida:** `{searched && guests.isError && …}`.

### 🟢-4 [SPEC] Cabeçalho da T-05.2 ainda diz "aguardando qa-redteam"
**Onde:** `docs/specs/SPEC-05-frontend-pms.md:93`. O parágrafo logo abaixo já cita o veredito da 1ª rodada.
**Correção sugerida:** atualizar o cabeçalho para o veredito desta reauditoria.

---

## LGPD do comprovante (foco 3)
O comprovante impresso expõe:
- nome completo;
- número(s) do quarto, período e diárias;
- situação;
- CPF mascarado `***.456.789-**`;
- os lançamentos (descrição do consumo, método e status de pagamento);
- os totais.

Não traz telefone, e-mail, endereço, RG nem quem lançou. O padrão de máscara (6 dígitos centrais) é o usado em publicações oficiais e basta para o hóspede reconhecer o próprio documento. Quando a entrada não tem 11 dígitos, o CPF é omitido. A URL `/reservas/:id/comprovante` não leva PII. O detalhe (`GET /reservations/:id`) ainda traz o CPF inteiro ao navegador, mas a tela de detalhe e o card do hóspede selecionado o usam em operação de balcão, e isso está fora do delta. A minimização é adequada. A única ressalva do comprovante é de legibilidade (🟡-2), não de dado pessoal.

## Conflito com `origin/feature/t051-quartos-categorias` (foco 7)
`git merge-tree --write-tree origin/feature/t051-quartos-categorias HEAD` (T-05.1 em 834ff83):
- **CONFLICT `frontend/apps/pms/src/App.tsx`**: são os mesmos dois blocos da rodada anterior (imports e rotas de quartos x reservas). A resolução é manter os dois.
- **CONFLICT `docs/specs/SPEC-05-frontend-pms.md`**: conflito na tabela do §5, resolvido à mão, sem código.
- **`frontend/packages/domain/src/state-machines.ts`: auto-merge limpo.** A T-05.1 acrescenta `STATUS_TONES` e `StatusTone` e muda o tipo de `ROOM_STATUS_META`, perto da linha 60. Esta branch muda a allowlist de reservas, na linha 22. Na árvore mergeada, `PENDING: ['CONFIRMED', 'CHECKED_IN', 'CANCELLED']` está preservado.
- `api-client`: auto-merge, como na rodada anterior.

A ordem continua a mesma: **a T-05.1 entra primeiro**. Esta branch faz merge de `develop` (que então terá a T-05.1 e a T-06.13), resolve os dois conflitos textuais e, no mesmo passo, faz a promoção de `Money`, `ErrorState` e `Notice` e troca `ReservationStatusBadge` por `StatusBadge tone/label` (pendência nº 4 do relatório). Também corrige a 🟡-2. `git merge-tree origin/develop HEAD` não tem conflito.

## Repassados a outro dev
Nenhum. A dívida do `GET /guests` sem busca já está na T-05.12. O repasse anterior para o Gabriel (`para_gabriel_23102026.md`) foi tratado e registrado no próprio arquivo, e o CLAUDE.md §3 está atualizado em `origin/docs/decisoes-delegacoes-21out`.

## O que foi verificado e está correto
- **Máquina de estados:** a allowlist continua fail-safe. O status desconhecido desabilita tudo (teste `:81`). As transições seguem só pelos endpoints dedicados, e há teste conferindo os três paths.
- **Efeito do domínio em outros consumidores:** procurei em todo o `frontend/` e só `reservationLogic.ts` usa as funções de reserva. Os testes do domínio cobrem os 5 status em `canCheckIn` e `canCancelReservation`.
- **`useGuests(options)`:** o default é `enabled: true`, então a tela de hóspedes não muda. A troca de `isPending` por `isLoading` está correta: com `enabled: false`, o `isPending` ficaria `true` para sempre.
- **`roomConflictMessage`:** saiu da tela para `reservationLogic`, com teste para um e vários quartos e para lista vazia ou desconhecida (`null` cai na mensagem genérica).
- **`Notice`:** `role="alert"` para erro e `status` para sucesso, `forwardRef` com foco programático preservado, e cor só na borda e no fundo.
- **Dinheiro:** nenhum `Number(`, `parseFloat` ou `toFixed` novo no delta (grep).
- **Execução:** typecheck, testes, build e qa_checks como descrito no veredito.

## Não foi possível verificar
- **Cobertura:** `@vitest/coverage-v8` não está instalado no `app-pms`, e o frontend não tem portão de cobertura configurado. A eficácia dos testes foi medida por mutação.
- **E2E (41 PASS):** não reexecutei. O roteiro continua fora do repositório.
- **Typecheck da árvore mergeada com a T-05.1:** não compilei, porque exige resolver `App.tsx` à mão. Os dois lados mudam `state-machines.ts` de forma aditiva e em regiões distintas.
- **🟡-2 na tela real:** a conclusão vem da leitura do `paymentEnums.js` e do `GetBillController.js` do `origin/develop`. Não subi backend com pagamento estornado para fotografar o comprovante. Nenhum container ou processo foi iniciado.
