# QA Red Team — T-08.5 Cabeçalho e cartões (SPEC-08)
**Branch:** feature/t085-cabecalho-cartoes · **Dev:** Sirlande · **Base:** feature/t084-painel-hoje@a4b4846 · **Data:** 15/11/2026
**Arquivos auditados:** 14 (commit 9ab8590)
**Achados no escopo:** 5 (🔴 0 · 🟡 2 · 🟢 3) · **Repassados:** 3

## Veredito
**APROVADO COM RESSALVAS**

Nenhum 🔴 no escopo. As ressalvas são o texto da confirmação de exclusão, que promete algo que o sistema não faz (🟡), e o foco perdido ao abrir essa confirmação (🟡).

Verificação executada: `tsc --noEmit` em `packages/ui` e `apps/pms` sem erro; `vitest run` em `apps/pms` com 31 arquivos e 357 testes passando; `scripts/qa_checks.sh` sem erro bloqueante (os 2 avisos já existiam e são do backend). O CA-08.j vale para o que foi rodado.

---

## Achados no escopo

### 🟡 [UX / regra 7 do GUIA] A confirmação de exclusão promete que o nome do hóspede fica guardado nas reservas
**Onde:** `frontend/apps/pms/src/features/guests/GuestDetailPage.tsx:73`
**Cenário:** a recepção exclui um hóspede com reservas e lê "As reservas antigas continuam, com o nome guardado". O `DELETE /guests/:id` (`services/core-service/app/Controllers/GuestApi/DeleteGuestController.js:9`) faz `guest.destroy()` num model `paranoid: true` (`GuestModel.js:39`). A reserva não guarda cópia do nome: só tem `guest_id`. O `include` de `GuestModel` em `ListReservationController.js:35` e em `GetReservationController.js:14` não usa `paranoid: false`, então depois da exclusão `r.guest` volta `null`. O próprio frontend já trata esse caso mostrando **"Hóspede removido"** (`ReservationsListPage.tsx:143`, `ReservationDetailPage.tsx:141`, `today/components/rows.tsx:136`). O nome continua no banco, mas nenhuma tela o mostra. O texto também diz "reservas antigas", e o backend não impede excluir um hóspede com reserva futura ou com estadia em andamento (CHECKED_IN): essas reservas também ficam com "Hóspede removido".
**Regra violada:** GUIA_UI_CORPORATIVA §3 regra 7 (a confirmação diz o que vai acontecer). Aqui ela diz o contrário do que acontece.
**Correção sugerida:** mudar só o texto, sem mexer em regra (CA-08.j). Por exemplo: "Excluir o cadastro de **X**? As reservas dele continuam, mas passam a aparecer como 'Hóspede removido'. Não dá para desfazer por aqui."

### 🟡 [A11y / teclado] Ao abrir a confirmação, o foco se perde e o leitor de tela não anuncia nada
**Onde:** `frontend/apps/pms/src/features/guests/GuestDetailPage.tsx:61-66` e `:71-94`
**Cenário:** a pessoa usa o teclado, foca "Excluir" e aperta Enter. Com `confirming === true`, o botão sai do DOM (`{!confirming && ...}`) e o foco cai no `<body>`. O cartão de confirmação aparece abaixo do cabeçalho sem `role`, sem `ref` e sem foco programático. O próximo Tab recomeça no menu, e o leitor de tela não fala nada. O detalhe da reserva resolve o mesmo caso de outro jeito: o botão "Cancelar reserva" continua na tela, desabilitado (`ReservationDetailPage.tsx:226`), e há foco programático para os blocos novos (`:64`, `:95`). A versão anterior também desmontava o botão, mas a confirmação aparecia no mesmo lugar. Agora ela está em outro bloco, mais longe.
**Regra violada:** CATALOGO.md, regras gerais ("a recepção opera no teclado"). Também se desvia do padrão de confirmação já usado na reserva.
**Correção sugerida:** manter "Excluir" visível e desabilitado enquanto a confirmação está aberta, como na reserva, e mover o foco para o botão "Manter hóspede" (ou para o parágrafo, com `tabIndex={-1}`) quando ela abrir.

### 🟢 [DRY / regra de promoção] `ButtonLink` já está no terceiro módulo e continua dentro de `reservations`
**Onde:** `frontend/apps/pms/src/features/guests/GuestDetailPage.tsx:10`, `frontend/apps/pms/src/features/today/TodayPage.tsx:5`, `frontend/apps/pms/src/features/reservations/index.ts` (export de `ButtonLink`)
**Cenário:** o `ButtonLink` é uma primitiva visual genérica (Link com cara de botão), sem regra de reserva. O CATALOGO.md diz "sobe para `packages/ui` quando o segundo módulo precisar". O painel Hoje já era o segundo módulo, e hóspedes é o terceiro. A dependência `guests → reservations` só existe por causa de um botão. Se o módulo de reservas mudar a assinatura, a ficha do hóspede quebra junto. A própria T-08.5 promoveu o `PageHeader` com a justificativa "já serve a vários módulos", que vale igual para o `ButtonLink`.
Já o `ReservationStatusBadge` está certo onde está: ele escolhe tom e rótulo do status de reserva, e o CATALOGO (linha do `StatusBadge`) diz que essa escolha é do "módulo dono do status". Importar esse componente pela API pública (`reservations/index.js`) é o caminho correto.
**Regra violada:** CATALOGO.md, "A regra de promoção".
**Correção sugerida:** promover o `ButtonLink` para `@hotel/ui` e reexportar de `primitives.tsx`, como foi feito com o `PageHeader`. Pode ficar para a T-08.6 (faxina).

### 🟢 [Layout / garçom] O `AccountPage` ganhou uma linha a mais no topo do celular do garçom
**Onde:** `frontend/apps/pms/src/features/accounts/AccountPage.tsx:84-85`
**Cenário:** o garçom continua vendo o tipo de conta. Ele saiu da linha do BackLink e virou o `context` do `PageHeader`, logo abaixo do título (por exemplo "Mesa"/"Quarto"). Quando `account.type` é nulo, `context` é `undefined` e a linha não aparece, o que é correto. O custo: antes eram 2 linhas (voltar + tipo, título), agora são 3 (voltar, título, tipo). Num celular de 375 px isso empurra o cardápio cerca de 20 px para baixo. A SPEC-08 §4 deixa a tela do garçom fora do escopo, "exceto o que vier de graça pelos tokens", e esta troca não é só de token.
**Regra violada:** SPEC-08 §4 (escopo). Não há dano funcional.
**Correção sugerida:** aceitar e registrar a decisão no anexo da spec, ou voltar o `AccountPage` ao layout anterior e usar o `PageHeader` só nas telas da recepção.

### 🟢 [Nomenclatura / a11y] "Contato" com CPF dentro, e `Section` sem nome acessível
**Onde:** `frontend/apps/pms/src/features/guests/GuestDetailPage.tsx:98-104`; `frontend/packages/ui/src/PageHeader.tsx:38-43`
**Cenário:**
- A seção "Contato" mostra o CPF, que é documento e não contato. O nome induz a erro.
- A `Section` gera um `<section>` sem `aria-labelledby`. Sem nome acessível, ele não vira região navegável no leitor de tela. A hierarquia continua certa: o h1 vem da página e os h2 vêm das `Section`. Na aba Resumo da reserva, o `tabpanel` mantém `aria-labelledby="aba-resumo"`, e as três `Section` (Hóspede, Estadia, Quartos) ficam como h2 abaixo do h1 do cartão fixo (`ReservationDetailPage.tsx:141`), o que é coerente.
- Existe outra `Section` local, com outra assinatura (`step`), em `NewReservationPage.tsx`. O mesmo nome com dois contratos confunde quem ler depois.

**Correção sugerida:** chamar a seção de "Dados" ou "Identificação e contato". Na `Section`, gerar o `id` com `useId()` e ligá-lo por `aria-labelledby`. Renomear a `Section` local da nova reserva para algo como `StepSection` quando o arquivo for mexido de novo.

---

## Repassados a outro dev

Todos são anteriores a esta branch, não entram no veredito e não reprovam a T-08.5.

| Sev. | Achado | Onde | Dono | Repasse |
|------|--------|------|------|---------|
| 🟡 | Dois `primary` visíveis com a lista vazia: "Nova reserva" no cabeçalho e no vazio; "Novo quarto" / "Nova categoria" no cabeçalho e no vazio (CA-08.e). A T-08.5 corrigiu só o de hóspedes | `ReservationsListPage.tsx:62` e `:110`; `RoomsListPage.tsx:26` e `:41`; `CategoriesListPage.tsx:28` e `:43` | Sirlande (responsável da SPEC-08, T-08.3) | `docs/qa/repasses/para_sirlande_15112026.md` |
| 🟡 | `WriteButton` com 32 px de altura a partir de `md` (`md:h-8 md:min-h-0`), abaixo dos 48 px que o CA-08.g pede em 768 px. Aparece no cabeçalho de Quartos e Categorias | `rooms/components/Actions.tsx:9` | Sirlande (SPEC-08) | `docs/qa/repasses/para_sirlande_15112026.md` |
| 🟡 | O `DELETE /guests/:id` exclui hóspede com reserva ativa (CHECKED_IN) ou futura, sem barrar nem avisar; a estadia passa a mostrar "Hóspede removido" | `services/core-service/app/Controllers/GuestApi/DeleteGuestController.js:7-9` | DONO INDEFINIDO (GuestApi não aparece no §7 da divisão) | `docs/qa/repasses/para_dono-indefinido_15112026.md` |

---

## O que foi verificado e está correto
- **Exclusão do hóspede:** o fluxo é o mesmo de antes. `setDelError(null)`, `del.mutate(id, { onSuccess: navigate('/hospedes'), onError: setDelError(...) })`. Os botões descrevem a ação ("Sim, excluir hóspede" / "Manter hóspede"), há estado "Excluindo…", e "Manter" fica desabilitado durante o envio. O `Card` só aparece na confirmação, como pede a §5 da SPEC-08.
- **CA-08.e na lista de hóspedes:** o cabeçalho tem o `primary` e o vazio usa `secondary`. Na ficha do hóspede, Editar é `secondary` e Excluir é `ghost`: nenhum `primary`. Telas só com título (formulários, Comanda, Hoje, Indicadores) não têm `primary` no cabeçalho.
- **Alvo de toque:** `Button` usa `comfortable` (`min-h-touch`, 48 px) sem redução por breakpoint, e `ButtonLink` usa `min-h-touch`. "Novo hóspede" saiu de `compact` (36 px) para 48 px. No celular, o `PageHeader` é `flex-col` com `align-items: stretch`, então a ação ocupa a largura toda. As exceções, que vêm de antes, estão nos repasses.
- **`twMerge`:** `text-status-maintenance` substitui o `text-gray-700` do ghost, e `bg-status-maintenance/5` substitui o `bg-white` do `Card`. Ambos resolvidos pelo `cn`.
- **Contraste:** o `#dc2626` sobre branco dá cerca de 4,8:1 (AA). Sobre o `gray-100` do hover cai para cerca de 4,4:1, mas é só no estado de hover. O `gray-600` dos rótulos do `Info` corrige o `gray-400` antigo.
- **Reexport:** `primitives.tsx` reexporta `PageHeader` do `@hotel/ui`, então `ReservationsListPage` e `NewReservationPage` seguem com o mesmo import. A assinatura nova (`title: ReactNode`, `context`, `action`) é compatível com a antiga.
- **`<header>` do `PageHeader`:** fica dentro de `<main>` (`AppShell.tsx:68`), então não vira um segundo `banner`.
- **CATALOGO.md:** as linhas do `PageHeader` e da `Section` batem com o código. Título `text-title` = 20 px (`tailwind-preset.js:45`), contexto embaixo, ação à direita a partir de `sm` e na largura toda abaixo disso, fio em cima (`border-t`) na `Section`. Os dois estão exportados em `packages/ui/src/index.ts`.
- **Lista de hóspedes:** a contagem no `context` só aparece com dados (`data.length > 0`). O erro passou para o `ErrorState`, com `role="alert"` e "Tentar de novo".
- Nenhum endpoint, rota ou chamada de API foi alterado. Não há `require()`, `console.*` nem cor literal no diff.

## Não foi possível verificar
- **Visual no navegador** (375, 768 e 1366 px): não houve medição real de altura nem captura. O CA-08.g foi conferido pelas classes, não com régua.
- **`pnpm`/`turbo`:** não rodaram neste ambiente ("Unable to find package manager binary"). Typecheck e testes rodaram por `npx tsc` e `npx vitest` em cada pacote. O ESLint não rodou: falta config compatível com a versão instalada.
- **Testes de `PageHeader` e `Section`:** o `@hotel/ui` não tem teste para esses componentes. São componentes de apresentação e a lógica coberta não mudou, então o impacto é baixo.
- **`CardHeading`:** continua exportado em `reservations/components/primitives.tsx:55`, mas já não tem consumidor. É código morto para a T-08.6.

## Desfecho (Sirlande, 15/11)

| Achado | Desfecho |
|---|---|
| 🟡-1 texto da exclusão | Corrigido: "As reservas dele continuam, mas passam a aparecer como 'Hóspede removido'. Não dá para desfazer por aqui." |
| 🟡-2 foco perdido ao abrir a confirmação | Corrigido: a confirmação (`role="alertdialog"`) recebe o foco |
| 🟢 `CardHeading` morto | Removido |
| 🟢 `ButtonLink` no 3º módulo | Fica para a T-08.6 (promoção ao @hotel/ui) |
| Repasse: dois primary com lista vazia (Reservas, Quartos, Categorias) | Corrigido: ação do vazio em secondary |
| Repasse: `WriteButton` com 32 px no tablet | Corrigido: compacto só a partir de xl |
| Novo: checagem de hooks depois de return em todas as páginas | `src/components/hooksOrder.test.ts` |
