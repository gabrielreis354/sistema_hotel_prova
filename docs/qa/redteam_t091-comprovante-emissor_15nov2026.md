# QA Red Team — T-09.1 comprovante com o hotel emissor
**Branch:** fix/t091-comprovante-emissor · **Dev:** Gabriel (com agente) · **Base:** origin/develop@2ec2446 · **Data:** 15/11/2026
**Arquivos auditados:** 7 do diff, mais o contexto: `stores/auth.ts`, `lib/queryClient.ts`, `lib/api.ts`, `lib/http.ts`, `ReservationDetailPage.tsx`, `App.tsx`, `tenantRouter.js`, `GetTenantController.js`, `TenantModel.js`, `seed_hotels.sql`, `schema.d.ts` (Tenant) e `@tanstack/query-core` 5.101.4
**Achados no escopo:** 6 (🔴 0 · 🟡 2 · 🟢 4) · **Repassados:** 1

## Veredito
**APROVADO COM RESSALVAS.** Não há 🔴 no escopo. Os dois 🟡 impedem fechar a SPEC-09, porque o CA-09.h exige zero 🔴 e zero 🟡 abertos.

Validação executada nesta auditoria:
- `pnpm --filter "./apps/*" --filter "./packages/*" test`: 25 arquivos e 321 testes verdes;
- `pnpm -r typecheck`: verde;
- o diff só mexe em `frontend/apps/pms`. Backend, Swagger e rotas não mudaram (CA-09.g).

---

## Achados no escopo

### 🟡-1 [Testes] O teste do CA-09.b ("500 no /tenants/me") nunca renderiza a página com a consulta do hotel em erro
**Onde:** `frontend/apps/pms/src/features/reservations/ReservationReceiptPage.test.tsx:51-56` (o `QueryClient` e o `prefetchQuery`) e `:100-110` (o teste)
**Cenário:** o `prefetchQuery` falha e deixa a consulta `['tenant','me']` no cache com `status: 'error'` e sem dados. No render, o `useQuery` vê uma consulta em erro, sem dados, e faz o *retry on mount* (o padrão do TanStack v5). O resultado otimista volta como `status: 'pending'`, `fetchStatus: 'fetching'` e `isError: false`. Ou seja, o teste que se chama "em 500" exercita o estado **carregando**, e não o estado de **erro**.

Prova por sonda, com um arquivo temporário já removido: depois do prefetch que falhou, o cache estava em `error`, e o `renderToString` imprimiu `pending|fetching|false`.

Prova por mutação, com o código restaurado logo depois (`git status` limpo):
```tsx
const tq = useMyTenant(); const issuer = receiptIssuer(tq.data);
if (tq.isError || reservation.isError || bill.isError || !reservation.data || !bill.data) {
```
Com essa mudança, o 500 do `/tenants/me` derrubaria o comprovante inteiro na `ErrorState`, que é exatamente o que o CA-09.b proíbe. Mesmo assim, os **3 testes passam**.

Para comparar: a mutação simétrica, que acrescenta `|| tq.isPending` à guarda de carregamento, **é** pega pelo mesmo teste, por acaso, porque ele está no estado pendente.
**Regra violada:** o checklist §8 do red team ("teste que passaria mesmo com a regra quebrada"). O CA-09.b fica sem prova real.
**Correção sugerida:** no `renderReceipt`, criar o cliente com `defaultOptions: { queries: { retry: false, retryOnMount: false } }`. Assim a consulta chega ao render em `error` de fato. Também vale separar dois testes, um de "falhou" (500) e outro de "ainda carregando" (`/tenants/me` com uma promise que nunca resolve e sem prefetch do tenant), cada um com nome fiel ao estado que exercita. Depois, rodar de novo a mutação acima para confirmar que ela falha.

### 🟡-2 [Spec / Impressão] Na prática o "cache longo" dura 5 minutos, e por isso quase todo check-out abre o comprovante sem o hotel
**Onde:** `frontend/apps/pms/src/features/tenant/queries.ts:9` e `:12-18`, junto com `frontend/apps/pms/src/features/reservations/ReservationReceiptPage.tsx:22` e `:51`
**Cenário:**
1. A `myTenantOptions` define `staleTime: 1h`, mas não define `gcTime`. No cliente, o `gcTime` padrão é de 5 minutos (confirmado em `query-core/build/modern/removable.js:19-22`: `isServer() ? Infinity : 5 * 60 * 1e3`). O único componente que observa `['tenant','me']` é o comprovante. Ao sair dele, a consulta é descartada em 5 minutos. O comentário da linha 9 ("uma hora de cache poupa a chamada a cada comprovante") não se cumpre.
2. O fluxo real é este: a recepção abre a reserva, que deixa `reservation` e `bill` no cache, e toca em "Comprovante" (`ReservationDetailPage.tsx:333`). A página renderiza **na hora**, já com o botão "Imprimir" ativo. Enquanto isso, o `/tenants/me` sai a frio, porque o check-out anterior foi há mais de 5 minutos.
3. Uma recepcionista experiente, com fila no balcão (`DESIGN_PMS.md` §1), toca em Imprimir antes de a resposta chegar. O papel sai **sem nome e sem CNPJ**, e nada na tela avisa. Se o `/tenants/me` falhar, o `retry: 1` de `lib/queryClient.ts` acrescenta cerca de 1 s de janela antes do estado final, também sem aviso.

A SPEC aceita o comprovante sem cabeçalho "enquanto carrega ou se falhar". A mitigação que ela própria previu para isso é o "cache longo" (T-09.1, 1º item), e ela não está funcionando. O CA-09.a ("o comprovante **impresso** mostra o nome do hotel") falha em silêncio justamente no caminho mais comum.
**Regra violada:** SPEC-09 T-09.1 ("cache longo") e CA-09.a. Também `DESIGN_PMS.md` §5, por analogia com "mostrar com honestidade": o operador não sabe que o papel saiu incompleto.
**Correção sugerida** (frontend apenas, e sem bloquear a impressão):
- (a) definir `gcTime: Infinity` (ou igual ao `staleTime`) em `myTenantOptions`. O `queryClient.clear()` na troca de usuário e no logout continua garantindo o isolamento;
- (b) fazer `prefetchQuery(myTenantOptions())` na `ReservationDetailPage`, ou na casca autenticada, para o dado já estar pronto quando o comprovante abrir;
- opcional: uma linha `print:hidden` ao lado do botão ("Carregando dados do hotel…" ou "Dados do hotel indisponíveis — o comprovante sairá sem eles"), sem desabilitar o botão.

### 🟢-1 [Acessibilidade / Semântica] O hotel emissor é o texto mais destacado da página, mas não faz parte da estrutura
**Onde:** `frontend/apps/pms/src/features/reservations/ReservationReceiptPage.tsx:55-60`
**Cenário:** o nome do hotel é um `<p className="text-2xl">`, maior que o `<h1 className="text-xl">` com o nome do hóspede, e fica numa `<div>` fora do `<header>` do `<article>`. Um leitor de tela que navegue por cabeçalhos ou por landmarks pula direto para o nome do hóspede, e a identificação de quem emite o documento não aparece na estrutura (WCAG 1.3.1, Info and Relationships). A hierarquia visual também contradiz a semântica: o maior texto não é cabeçalho.
**Regra violada:** WCAG 2.1 1.3.1.
**Correção sugerida:** levar o bloco do emissor para dentro do `<header>` do comprovante. Ou então marcar o emissor como `<h1>` e passar o nome do hóspede para `<h2>`. A mudança não altera nenhum texto que os testes conferem.

### 🟢-2 [Dados / LGPD] O rótulo "CNPJ" é fixo, mas o `legal_id` é "CNPJ ou documento fiscal"
**Onde:** `frontend/apps/pms/src/features/reservations/ReservationReceiptPage.tsx:58` e `frontend/apps/pms/src/features/tenant/tenantApi.ts:10,34`
**Cenário:** `docs/db/ARQ_DATABASE.md:32` define `legal_id` como "CNPJ ou documento fiscal". O `UpdateTenantController.js:34` grava o valor sem validar formato. Uma pousada de pessoa física que cadastre o CPF do dono vai ter no papel entregue ao hóspede `CNPJ 123.456.789-01`. O rótulo fica errado e o CPF do titular é exposto por inteiro. O mesmo papel mascara o CPF do hóspede (linha 72-73) por minimização. Já um CNPJ guardado só com dígitos sai sem pontuação (`CNPJ 12345678000190`).
**Regra violada:** LGPD art. 6º, III (minimização), no caso pessoa física; exatidão do documento.
**Correção sugerida:** rotular pelo formato (14 dígitos → "CNPJ"; outro valor → "Doc."). Registrar como pendência a validação do `legal_id` no backend, que fica fora desta branch e é da Sirlande (Models, §7).

### 🟢-3 [SRP / Coesão] `receiptIssuer` é lógica do comprovante, mas mora no arquivo de API do módulo tenant
**Onde:** `frontend/apps/pms/src/features/tenant/tenantApi.ts:26-36`, exportada em `tenant/index.ts:6`
**Cenário:** o módulo `reservations` separa chamada (`reservationsApi.ts`) de regra (`reservationLogic.ts`, onde já está o `receiptEntries`). Aqui, uma função de apresentação que só o comprovante usa ficou no arquivo de transporte de outro módulo. O módulo `tenant` passa a "saber" o que é um comprovante. Quando a tela de Configurações do hotel (módulo do Weslley, `DIVISAO_TRABALHO` §4.1) consumir `features/tenant`, ela vai herdar essa função sem precisar dela.
**Regra violada:** SOLID-SRP, e o padrão do módulo de referência.
**Correção sugerida:** levar `receiptIssuer` e `ReceiptIssuer` para `reservations/reservationLogic.ts`, recebendo o `Tenant` exportado por `tenant/index.ts`.

### 🟢-4 [Processo] A evidência manual do CA-09.a e o relatório de sessão estão faltando
**Onde:** a branch inteira, que só contém código e testes
**Cenário:** o CA-09.a pede "captura no Aurora e no Sol (seed)", e o CLAUDE.md §6 exige relatório em `docs/historico_sessao/gabriel/`. Nenhum dos dois está na branch.
**Correção sugerida:** anexar as duas capturas (impressão ou PDF) e o relatório antes do merge.

---

## Repassados a outro dev

| Sev. | Achado | Onde | Dono | Repasse |
|------|--------|------|------|---------|
| 🟡 | O `vite.config.test.ts` nunca roda: o *exclude* padrão do Vitest (`**/vite.config.*`) descarta o arquivo, apesar do `include` | `frontend/apps/pms/vitest.config.ts:9` e `frontend/apps/pms/vite.config.test.ts` | DONO INDEFINIDO (ferramental do `apps/pms`; o commit de origem, `1db4209`, é do Gabriel) | `docs/qa/repasses/para_indefinido_15112026.md` |

Sobre o pedido de conferir que o `vite.config.test.ts` foi preservado: a entrada continua no `include`, e a branch não piorou nada. Só que ela já era inerte na `develop`. `npx vitest run vite.config.test` responde "No test files found" e mostra no `exclude` o padrão `**/{…,vite,vitest,…}.config.*`. A lista verbose tem 25 arquivos, todos em `src/`. O defeito é anterior à branch e não conta no veredito.

---

## O que foi verificado e está correto
- **Isolamento entre tenants:** a chamada é sempre `GET /tenants/me`, sem id (`tenantApi.ts:19`). O backend resolve o tenant pelo JWT (`GetTenantController.js:10`; `tenantRouter.js` com `authMiddleware` + `tenantMiddleware`). Nenhum id de tenant vem da URL, do body ou do cliente.
- **Cache entre logins:**
  - `setSession` com outro `user.id` faz `queryClient.clear()` (`stores/auth.ts:31`);
  - `logout` limpa (`:35`);
  - o 401 do token atual chama `logout` (`lib/api.ts:27`);
  - a troca de sessão em outra aba limpa (`:69`).

  A chave `['tenant','me']` não traz o usuário, mas a limpeza total cobre esse caso. O `getToken` é lido a cada request. Uma resposta atrasada de A que chegue depois do `clear()` cai numa consulta já removida.
- **Ordem dos hooks:** `useMyTenant()` é chamado antes dos `return` antecipados (`ReservationReceiptPage.tsx:22`), sem hook condicional.
- **Não bloquear:** o resultado do tenant não entra nas guardas de carregamento nem de erro (linhas 24-38). A mutação que bloqueia no carregamento é pega pelo teste existente.
- **`receiptIssuer`:** trata nome vazio ou em branco (`null`) e CNPJ nulo, ausente ou em branco. Os testes unitários cobrem os três casos.
- **`getMyTenant`:** segue o padrão de erro dos outros 45 `throw new ApiError` em `features/`. Não duplica utilitário existente.
- **LGPD do diff:** não há `console.*` novo nem PII em URL. O CPF do hóspede continua mascarado. `/tenants/me` só devolve dados da pessoa jurídica (fora o caso do 🟢-2).
- **CA-09.g:** nenhum arquivo de `services/`, Swagger ou `packages/api-client` mudou. Os testes de lógica que já existiam passam sem ajuste.
- **`vitest.config.ts`:** o novo glob `src/**/*.test.tsx` coleta `ReservationReceiptPage.test.tsx`, e o `tsc` do app tipa o arquivo (typecheck verde).
- **Regra 9 do `qa_checks.sh`:** não há cor literal nem elemento interativo cru. Nenhuma string de classes nova passa de 40 caracteres repetida 3 ou mais vezes.
- **Contraste:** `text-gray-700` e `text-gray-900` sobre branco ficam acima de AA.

## Não foi possível verificar
- **Impressão real no navegador** (diálogo do sistema e PDF) e as capturas do CA-09.a no Aurora e no Sol: não subi o ambiente. O 🟡-2 vem da leitura do código e do `gcTime` da biblioteca, sem medição de latência.
- **`ci-frontend.yml` verde no GitHub:** só rodei localmente o equivalente (`test` e `typecheck`). O `build` não foi executado.

## Desfecho (15/11, Gabriel com Claude)
- **🟡-1 corrigido:** o cliente do teste usa `retryOnMount: false` e confere que a consulta do hotel não está `pending` depois do prefetch. Há um teste novo para o estado "carregando". Para conferir, repeti a mutação deste relatório (`tenant.isError` na guarda de erro): agora o teste do 500 **falha**, como deve.
- **🟡-2 corrigido:**
  - `gcTime: Infinity` na consulta do hotel;
  - prefetch do `/tenants/me` ao abrir o detalhe da reserva, de onde a recepção chega ao comprovante;
  - aviso "Buscando o nome do hotel…" (`print:hidden`) ao lado do Imprimir enquanto carrega, sem bloquear.
- **🟢-1 a 🟢-4:** registrados, sem ação nesta branch. O 🟢-2 (rótulo "CNPJ" para `legal_id`) só pesa quando houver hotel pessoa física.
- **Repasse do `vite.config.test.ts` que nunca roda:** é do Gabriel (#145) e vai numa correção à parte.
- Depois da correção: pms 322/322, domain 44/44, typecheck verde.
