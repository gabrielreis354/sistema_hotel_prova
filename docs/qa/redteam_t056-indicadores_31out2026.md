# QA Red Team — T-05.6 indicadores do gerente (CA-05.6.b e c)
**Branch:** feature/t056-indicadores · **Dev:** Weslley · **Base:** develop@625e0a7 · **Data:** 31/10/2026
**Arquivos auditados:** 29 (diff completo) + controllers de analytics, `PixWebhookController`, providers PIX, casca do `apps/pms`
**Achados no escopo:** 13 (🔴 0 · 🟡 6 · 🟢 7) · **Repassados:** 2 (+1 lembrete)

> ⚠️ **ALERTA FORA DO ESCOPO:** o `logout()` do `apps/pms` não limpa o cache do React Query, e nenhuma chave de query tem tenant. Na mesma aba, o próximo usuário vê os hóspedes ou os indicadores do anterior, **inclusive de outro tenant** (`stores/auth.ts:23`, `lib/queryClient.ts:5`). Área do Gabriel. Repasse: `docs/qa/repasses/para_gabriel_31102026.md`.

## Veredito
**APROVADO COM RESSALVAS**

Não há 🔴 no escopo. CA-05.6.b e CA-05.6.c estão cumpridos na tela. O bloqueio por papel funciona no front, na rota e no menu, e o backend continua sendo a fonte de verdade. Os 🟡-1, 🟡-2 e 🟡-3 deveriam entrar antes da demo para a banca: o cartão principal mostra dinheiro errado depois das 21h, e o RT-51 está cumprido só em parte.

## Achados no escopo

### 🟡-1 [Dinheiro/fuso] "Recebido hoje" e "Receita recebida por mês" contam o dia e o mês em UTC
**Onde:** `frontend/apps/pms/src/features/analytics/kpis.ts:41`, `IndicatorsPage.tsx:48-49`, consumindo `services/core-service/app/Controllers/AnalyticsApi/GetRevenueController.js:10,15` (`paid_at::date`, `DATE_TRUNC('month', paid_at)` em sessão `+00:00`)
**Cenário:** às 22:30 de 31/10, um check-out paga R$ 600,00 em dinheiro. O gerente abre a tela às 23h, e o cartão "Recebido hoje — Pagamentos efetivados hoje" **não inclui** esses R$ 600, porque o `paid_at` é 01/11 em UTC. Na manhã de 01/11, o cartão já abre com R$ 600, antes de qualquer pagamento do dia. No gráfico mensal, o pagamento das 22h do último dia do mês cai no mês seguinte. O dev conhecia o problema: o comentário em `analyticsApi.ts:33` corrige o fuso da ocupação mandando `date`, mas mandar `start=end=today` não corrige a receita, porque o corte é feito no SQL.
**Regra violada:** DESIGN_PMS §5 ("Data é dia, não instante", `America/Sao_Paulo`). É o número de dinheiro mais visível da tela.
**Correção sugerida:** é o mesmo defeito do repasse de 26/10 (`para_gabriel_26102026.md`), ainda aberto. O menor ajuste é `(paid_at AT TIME ZONE :timezone)::date` com `HOTEL_TIMEZONE` (`app/utils/hotelTimezone.js`, como já faz o `GetInternalConsumptionController`), no revenue e no payment-mix. Combine com o Gabriel quem aplica. Se não entrar antes do merge, registre como pendência da T-05.6.

### 🟡-2 [Segurança/LGPD] Queries de indicador ficam 5 min "frescas" com chave sem tenant: ampliam o vazamento de sessão do alerta acima
**Onde:** `frontend/apps/pms/src/features/analytics/queries.ts:15-22` (chaves sem `tenantId`/`userId`) e `:28` (`STALE = 5 * 60_000`)
**Cenário:** o ADMIN do Hotel A abre `/indicadores` e sai. Em até 5 min, um ADMIN do Hotel B (por exemplo, o dono de duas pousadas com duas contas) entra na mesma aba e abre `/indicadores`. O React Query acha `['analytics','top-guests',10]` e as demais chaves frescas e **não refaz a requisição**. B vê o faturamento e o ranking de hóspedes de A, com os nomes. Com o padrão do projeto (30 s), a janela seria menor. Com 5 min, a tela inteira de A fica de pé.
**Regra violada:** CLAUDE.md §7 (cross-tenant), LGPD art. 46. Fica em 🟡 só porque a causa raiz (o logout não limpa o cache) não é desta branch.
**Correção sugerida:** a correção certa é o `queryClient.clear()` no logout (repasse). Até ela entrar, ponha o `tenantId` da sessão no prefixo de `analyticsKeys`. Também dá para baixar o `staleTime` de `topGuests` para o padrão.

### 🟡-3 [LGPD — minimização] O ranking ainda trafega o e-mail do hóspede, e o comentário diz o contrário
**Onde:** `services/core-service/app/Controllers/AnalyticsApi/GetTopGuestsController.js:17,28` (`g.email`), `services/core-service/config/swagger.js:1359` (schema com `email`), `frontend/apps/pms/src/features/analytics/components/TopGuests.tsx:17-19`
**Cenário:** o gerente abre a tela. A resposta de `/analytics/top-guests` traz `email` de 10 hóspedes e fica no cache, na aba Network e em qualquer proxy ou log de resposta. A tela não usa o e-mail. O comentário afirma "minimização, LGPD", mas minimização (art. 6º, III) vale para o tratamento, e transferir o dado já é tratamento. Esconder na renderização não basta. O RT-51 pede minimização, e esta branch declara cumpri-lo.
**Regra violada:** LGPD art. 6º, III; RT-51.
**Correção sugerida:** remover `g.email` do `SELECT` e do `GROUP BY` e tirar `email` do schema no `swagger.js`. Depois, regenerar `openapi.json` e `schema.d.ts`. O único consumidor é `TopGuestRow`, que não lê o campo.

### 🟡-4 [Mobile/LGPD] No celular, a tela dispara as 7 consultas e baixa o ranking e a lista de não pagos, mesmo sem mostrá-los
**Onde:** `IndicatorsPage.tsx:47-53` (todos os hooks rodam sempre) e `:125` (`hidden md:block` esconde só com CSS)
**Cenário:** o dono abre `/indicadores` no 4G para ver os 4 números (CA-05.6.c). Saem 7 requisições: ocupação, receita de hoje, receita de 12 meses, sazonalidade, categoria, meios e top-guests. O celular recebe o ranking (nome, e-mail, valor gasto) e, duas vezes, o `unpaid` do `/analytics/revenue`, com nome de hóspede e valor de reserva em aberto. Nada disso aparece. São 5 consultas agregadas de banco a mais por abertura, e dado pessoal no aparelho sem finalidade.
**Regra violada:** LGPD art. 6º, III (necessidade); CA-05.6.c pede só os 4 números no celular.
**Correção sugerida:** `enabled: isDesktop` nos 5 hooks do desktop, com um `useMediaQuery('(min-width: 768px)')` ou `matchMedia` igual ao breakpoint `md`. O `unpaid` do `/revenue` é assunto do backend (ver 🟢-7).

### 🟡-5 [Dataviz/correção] Mês sem pagamento ou sem reserva some do gráfico, e as barras dão a impressão de meses seguidos
**Onde:** `IndicatorsPage.tsx:62-75` (mapeia `by_month` e `seasonality` sem preencher lacunas). O comentário em `components/BarChart.tsx:85` está errado.
**Cenário:** com 12 meses na janela e pagamentos só em jan, mar e out, o gráfico desenha 3 barras lado a lado, rotuladas jan/26, mar/26 e out/26, com a mesma largura e o mesmo espaçamento. A leitura de tendência fica errada, e o "Ver tabela" também omite os 9 meses vazios. O SQL (`GROUP BY 1`) só devolve mês com linha. Por isso o caso que o comentário descreve ("Zero não desenha barra… a tabela e o tooltip ainda dizem '0'") nunca acontece.
**Regra violada:** honestidade do gráfico (dataviz). Comentário que descreve um comportamento inexistente.
**Correção sugerida:** uma função pura `fillMonths(window, rows)` em `period.ts` que gera todos os `yyyy-MM` da janela com valor 0. Para a sazonalidade, a janela vai de `months` meses atrás até o último mês devolvido, porque o backend inclui reservas futuras. Teste unitário com lacuna e com virada de ano.

### 🟡-6 [Contrato API] O Swagger do webhook diz que o 200 cobre "status ainda não terminal", mas o schema não aceita esse status
**Onde:** `services/core-service/config/swagger.js:599` (descrição nova do 200) e `:478` (`WebhookConfirmResponse.status: enum ['confirmed','already_processed']`). O controller devolve `'not_approved'` (`PixWebhookController.js:123`) e `'pending'` (`:127`).
**Cenário:** com o Asaas, chega `PAYMENT_CREATED` e a consulta ainda dá pendente. O corpo é `{ status: 'pending', payment_id }`, valor fora do enum documentado. Um cliente gerado do `openapi.json`, ou um teste de contrato, trata isso como resposta inválida. A branch reescreveu a descrição desse 200 e não acertou o schema que ele referencia.
**Regra violada:** CLAUDE.md §6 (Swagger é o contrato do cliente tipado).
**Correção sugerida:** `enum: ['confirmed','already_processed','pending','not_approved']`, com a descrição de cada valor. Depois, `pnpm --filter @hotel/api-client generate`.

### 🟢-1 [Requisito] RT-52 cumprido em parte: o ranking e os cartões não têm período alterável
**Onde:** `IndicatorsPage.tsx:220` ("todo o histórico") e cartões fixos em hoje
**Cenário:** o RT-52 pede, em toda tela de indicador, período "visível **e alterável**". O ranking mostra o período, mas não deixa alterá-lo, porque o backend não aceita `start/end` em `/top-guests`. **Correção:** registrar como pendência na SPEC-05 (ou ajustar o RT-52 para "hoje" nos cartões) antes de marcar o CA.

### 🟢-2 [UX] "Última saída" pode mostrar uma data futura
**Onde:** `components/TopGuests.tsx:36`; o backend usa `MAX(r.check_out_date)` com reservas `CONFIRMED`/`PENDING` (`GetTopGuestsController.js:20,25`)
**Cenário:** um hóspede com reserva confirmada para dez/26 aparece com "Última saída 05/12/2026" em 31/10. **Correção:** rotular como "Última/próxima saída", ou filtrar `CHECKED_OUT` no backend.

### 🟢-3 [UX] Estado vazio do ranking manda "trocar o período", e o bloco não tem período
**Onde:** `components/Block.tsx:26` (descrição fixa), usada por `IndicatorsPage.tsx:225`. **Correção:** receber `emptyDescription` por prop.

### 🟢-4 [A11y] Botão "Ver tabela/Ver gráfico" troca o rótulo e ainda usa `aria-pressed`
**Onde:** `components/BarChart.tsx:42`
**Cenário:** o leitor de tela anuncia "Ver gráfico, pressionado", com dois sinais contraditórios. Além disso, cada barra é parada de Tab: 24 meses dão 24 paradas antes do próximo bloco. **Correção:** rótulo fixo ("Mostrar como tabela") com `aria-pressed`, ou rótulo variável sem `aria-pressed`. Para as barras, avaliar roving tabindex (uma parada, setas dentro do gráfico).

### 🟢-5 [DRY/KISS] Formatador de percentual em 3 cópias; `ShareTable` recebe `values` paralelo a `rows`
**Onde:** `kpis.ts:15`, `shares.ts:34`, `IndicatorsPage.tsx:23` (o mesmo `Intl.NumberFormat` de 1 casa). `ShareTable` soma `values` (`IndicatorsPage.tsx:194-213`), que pode divergir de `rows` se alguém filtrar um e não o outro. **Correção:** `formatPercent`/`formatDecimal1` num só módulo, e `cents` dentro de `ShareRow` para o total vir das próprias linhas.

### 🟢-6 [Consistência] A lista de papéis da rota repete a do menu, e o comentário diz que é a mesma fonte
**Onde:** `routes/nav.ts:10-12` ("fonte única do menu e do gate de rota") contra `App.tsx` (`allow={['ADMIN']}` literal, sob o comentário "Configurações: só admin", que agora agrupa os indicadores)
**Cenário:** hoje as duas listas batem. Se um dia alguém liberar `/indicadores` para RECEPTIONIST só no `nav.ts`, o menu mostra o item e a rota redireciona. Alterar só o `App.tsx` dá o contrário. **Correção:** derivar o `allow` de `NAV_ITEMS`, ou corrigir o comentário.

### 🟢-7 [Testes/escopo do dado] Faltas pequenas
- Não há teste de isolamento de tenant para `/analytics/top-guests`. A query filtra `g.tenant_id` e `r.tenant_id` (conferido lendo o código), mas nenhum teste prova isso.
- Não há teste do gate de papel nem dos estados da tela. É coerente com o projeto, que hoje só testa funções puras no `apps/pms`.
- `/analytics/revenue` devolve `unpaid` (nome do hóspede, valor e datas) a cada chamada. A tela chama duas vezes e descarta. Vale um `?include=unpaid`, ou um endpoint enxuto para os cartões (backend, área do Gabriel, sem urgência).
- O Swagger promete 400 para "Id da cobrança ausente", mas no Mercado Pago a falta de `data.id` vira **401** (`MercadoPagoPixProvider.js:99-100`). Basta uma linha a mais na descrição do 400.
- Com a aba nova, o ADMIN tem 6 abas na barra inferior do celular. Pela largura estimada dos rótulos, cabe com folga de cerca de 25 px a 375 px e de cerca de 10 px a 360 px; a 320 px estoura (`AppShell.tsx:49-63` + `nav.ts:19`).
- `ErrorState` (um `Card`) dentro do `Block` (outro `Card`) desenha borda dupla. Com o backend fora, nascem até 7 `role="alert"` ao mesmo tempo.

### SUSPEITA 🟡 [Mobile 375px] Valor de quatro dígitos ou mais pode estourar o cartão do dia
**Onde:** `components/KpiCards.tsx:10,15` (`grid-cols-2`, `text-2xl`, `Card p-4`)
**Cálculo:** a 375 px, o `main` tem `p-4`, o grid tem `gap-3` e cada cartão tem `p-4`, o que deixa uns 133 px de conteúdo por cartão. "R$ 1.250,40" em Inter 24 px seminegrito tabular mede, pela estimativa, uns 135 a 140 px. "R$ 12.345,67" passa de 150 px. O espaço entre "R$" e o número é não separável, então o texto não quebra e transborda o cartão. **Para confirmar:** abrir no Edge a 375 px com receita ≥ R$ 1.000. **Correção, se confirmar:** `text-xl` abaixo de `sm`, ou `break-words`/`min-w-0` com `text-[clamp(...)]`.

## Repassados a outro dev

| Sev. | Achado | Onde | Dono | Repasse |
|------|--------|------|------|---------|
| 🔴 | Logout não limpa o cache do React Query, e as chaves não têm tenant: o próximo usuário da aba vê os dados do anterior, inclusive de outro tenant | `frontend/apps/pms/src/stores/auth.ts:23`, `lib/queryClient.ts:5`, `lib/api.ts:19` | Gabriel | `docs/qa/repasses/para_gabriel_31102026.md` |
| 🟢 | `GuestsListPage` ainda usa `<button>` cru no erro, com o `ErrorState` já no `@hotel/ui` | `frontend/apps/pms/src/features/guests/GuestsListPage.tsx:28` | Gabriel | `docs/qa/repasses/para_gabriel_31102026.md` |
| ℹ️ | Lembrete: fuso de `paid_at::date` (raiz do 🟡-1), repasse de 26/10 ainda aberto | `GetRevenueController.js:10,15`, `GetPaymentMixController.js:10` | Gabriel | `docs/qa/repasses/para_gabriel_26102026.md` |

## O que foi verificado e está correto
- **Papel:** `/indicadores` fica sob `RequireRole allow={['ADMIN']}` (`App.tsx`), e quem não tem o papel é redirecionado para a home dele. O menu só lista o item para ADMIN (`nav.ts:19`). No backend, `analyticsRouter.js` aplica `ADMIN, RECEPTIONIST` no router e `requireRole('ADMIN')` em `/top-guests`. O WAITER continua barrado por router e por allowlist. `requireRole` é variádico e fail-closed.
- **Tenant:** os 7 controllers de analytics leem `request.user.tenantId` (JWT), e nenhum aceita tenant do body ou da query. `top-guests` filtra o tenant nas duas tabelas do JOIN.
- **CA-05.6.b:** ocupação, ADR e RevPAR do dia, receita por mês, sazonalidade, receita por categoria, meios de pagamento e ranking. **CA-05.6.c:** `md:` mostra os gráficos; no celular, 4 cartões com aviso textual.
- **Dinheiro:** todo valor passa por `decimalToCents` e depois por `formatBRL`, sem `Number()` sobre DECIMAL (os analytics devolvem `::float`). Participação calculada em centavos. Colunas numéricas alinhadas à direita, com `tabular-nums`.
- **Datas:** `todayISO` e `formatDateBR` usam `America/Sao_Paulo`. `monthLabel` não passa por `Date`. A ocupação recebe `date` explícito.
- **Estados:** cada bloco tem carregando, erro com "Tentar de novo" e vazio, e falha sozinho. Os cartões mostram "—" (nunca 0) quando a fonte falha.
- **Gráfico:** uma cor só, valor no `aria-label`, tooltip no foco de teclado e alternativa em tabela com `<caption>` e `scope`. A participação nunca depende só de cor: o percentual vem em texto.
- **ErrorState promovido:** os 3 consumidores da comanda (`AccountPage`, `AccountsListPage`, `MenuGrid`) importam do `@hotel/ui`. O arquivo antigo foi removido (rename), não sobra import órfão, e o `CATALOGO.md` foi atualizado.
- **OpenAPI:** regenerei o spec a partir de `config/swagger.js` e saiu **idêntico** ao `openapi.json` commitado. O `openapi-typescript` 7.13 sobre ele gera um `schema.d.ts` **idêntico** ao commitado.
- **Webhook PIX:** a descrição por provider confere com o código. No fake, `x-pix-signature`, HMAC do corpo cru com `PIX_WEBHOOK_SECRET`. No Mercado Pago, `x-signature` (`ts`, `v1`) + `x-request-id` + `data.id` por query ou body, com `MERCADOPAGO_WEBHOOK_SECRET`. No Asaas, `asaas-access-token` contra `ASAAS_WEBHOOK_TOKEN`, comparado em tempo constante e recusado quando é igual à API Key. Nos três, sem segredo dá 401, e a verificação vem antes de qualquer consulta ao banco. O status e o valor vêm do provider, e o 503 existe no controller. `docs/pagamentos/ASAAS_SANDBOX.md` existe.
- **Testes e tipos:** `vitest` do `app-pms` passou com 8 arquivos e 98 testes (24 novos da feature: kpis, period, shares). O `tsc --noEmit` passou em `apps/pms`, `packages/ui`, `packages/domain` e `packages/api-client`. O primeiro `pnpm -r typecheck` deu um TS18003 espúrio no `/mnt/c`; rodando direto, saiu com código 0.
- `qa_checks.sh`: 3 avisos, nenhum vindo desta branch, e nenhum erro bloqueante. Nenhum `require()`, nenhuma cor literal e nenhum `<button>` ou `<input>` cru nos arquivos novos.

## Não foi possível verificar
- **Renderização real a 375 px e no Edge:** não abri o navegador, por isso a SUSPEITA do cartão.
- **O vazamento do 🟡-2 e do repasse 🔴 não foi reproduzido no navegador.** Ele foi deduzido do código (`logout` sem `clear`, `navigate` sem reload) e da semântica documentada do TanStack Query v5: query fresca não refaz no mount, e o `gcTime` padrão é de 5 min.
- Suíte do core-service e chamadas contra o banco com seed: não rodei de novo. O chamador já tinha rodado: 991 testes, e ADMIN 200 / RECEPTIONIST 403 em `/top-guests`.
- Como o Swagger UI renderiza o `oneOf` do corpo do webhook.
- Rodei com Node 22.22 (aviso de engine do pnpm), não com o 24 exigido. Os resultados não dependem disso.
- Relatório de sessão da T-05.6 e marcação dos CA na SPEC-05 ainda não existem na branch. É esperado antes do merge, mas confira no fechamento.
