# QA Red Team — SPEC-08 mínima (T-08.1, T-08.2, T-08.3 + decisões de 15/11)
**Branch:** feature/t083-hierarquia-acoes (empilhada sobre t081 e t082) · **Dev:** Sirlande · **Base:** origin/develop@835f48d · **Data:** 15/11/2026
**Arquivos auditados:** 36 (diff `origin/develop...HEAD`, 7 commits, ffe88e0..4b3f668)
**Achados no escopo:** 10 (🔴 0 · 🟡 4 · 🟢 6) · **Repassados:** 0

## Veredito
**APROVADO COM RESSALVAS**

Nenhum 🔴 no escopo. A hierarquia de ações está correta nos seis cenários de status. Há um único
primary fora do bloco de confirmação, e toda ação indisponível aparece com o motivo em texto.
O fluxo `confirming`/`openCheckOut` tem a mesma lógica de antes. As ressalvas são de uso e de
teste: no check-out a confirmação ficou mais longe do botão e o foco se perde, e a regra
CA-08.e/f não tem teste que falhe se alguém a quebrar.

## Achados no escopo

### 🟡-1 [UX/A11y] "Fazer check-out" no cabeçalho: a confirmação abre longe e o foco cai no body
**Onde:** `frontend/apps/pms/src/features/reservations/ReservationDetailPage.tsx:162-166` (botão), `:114-118` (`openCheckOut`), `:336` (bloco "Confirmar check-out")
**Cenário:** uma reserva `CHECKED_IN` aberta num celular de 375 px. A recepção toca "Fazer check-out" no cabeçalho. `openCheckOut` põe `confirming='check-out'`, e o próprio botão fica `disabled` no mesmo render (linha 163). O elemento focado é desabilitado, e o foco vai para o `body`. O bloco de confirmação nasce dentro de `painel-conta`, depois do cartão do cabeçalho, do cartão de ações secundárias (check-in desabilitado com motivo e cancelar desabilitado com motivo, empilhados em `flex-col`) e da lista de abas. Antes deste diff, o botão ficava no cartão logo acima das abas. Agora ele está no topo, e a confirmação ficou um cartão inteiro mais abaixo. Nada rola a tela até ela nem a anuncia. Quem usa leitor de tela não ouve nada, e quem toca vê só o botão apagar. O padrão de foco perdido já tinha sido apontado em `docs/qa/redteam_confirma-acoes-painel_11nov2026.md`. Este diff piora o caso porque aumenta a distância.
**SUSPEITA quanto à dobra:** não medi no navegador se o "Confirmar check-out" fica abaixo da dobra em 375×667. Para confirmar, basta um print do qa-explorador nesse estado. A perda de foco está confirmada pelo código.
**Regra violada:** GUIA_UI_CORPORATIVA / PLANEJAMENTO_FRONTEND §10 (feedback da ação) e WCAG 2.4.3 (ordem de foco).
**Correção sugerida:** colocar um `ref` com `tabIndex={-1}` no `<h2>Confirmar check-out</h2>`. Num `useEffect` sobre `confirming === 'check-out'`, chamar `focus()` e `scrollIntoView({ block: 'nearest' })`. A lógica não muda (CA-08.j).

### 🟡-2 [Testes] A regra "um primary e motivo em toda ação indisponível" não tem teste
**Onde:** `ReservationDetailPage.tsx:108-112` (a derivação de `primary` está inline no componente) e `:157-219`
**Cenário:** alguém troca a ordem do ternário, ou remove o `primary !== 'check-in'` da linha 173. O resultado seria o check-in aparecendo duas vezes, ou o cancelar virando primary. Mesmo assim os 346 testes passam (rodei `vitest run`: 30 arquivos, 346 verdes), porque nenhum deles renderiza a tela de detalhe nem testa a escolha da ação principal. CA-08.e e CA-08.f ficam garantidos só por "revisão visual".
**Regra violada:** checklist de testes §8 ("teste que passaria mesmo com a regra quebrada" e "feature nova sem teste").
**Correção sugerida:** extrair `primaryAction(actions)` para `reservationLogic.ts` e testar os 6 cenários: PENDING dentro da janela, PENDING vencida, CONFIRMED, CHECKED_IN, CHECKED_OUT e CANCELLED. Ou então criar um teste SSR (`react-dom/server`) no padrão de `ReservationReceiptPage.test.tsx` que conte `bg-brand` igual a 1 e confira o `-motivo` em cada ação desabilitada.

### 🟡-3 [Operação/Auditoria] No celular o cabeçalho não diz mais quem está logado
**Onde:** `frontend/apps/pms/src/components/AppShell.tsx:51` (`hidden … sm:block`)
**Cenário:** o restaurante tem um celular compartilhado. O garçom B pega o aparelho com a sessão do garçom A ainda aberta e lança itens na comanda. Abaixo de 640 px o cabeçalho mostra só o nome do hotel e "Sair", então nada na tela avisa que a sessão é de A. Os lançamentos ficam com `created_by` do garçom errado. Antes deste diff o nome e o papel apareciam no celular, ainda que cortados. A comanda é a tela de celular por excelência.
**Regra violada:** trilha de auditoria (checklist §1, `created_by` em operação financeira). O código não tem erro: o problema é a tela esconder de quem é a sessão.
**Correção sugerida:** no celular, mostrar ao menos o primeiro nome, ou as iniciais, ao lado de "Sair" (`truncate` já existe). Outra saída é `aria-label`/texto "Sair (Ana)". Se o corte foi decisão de produto, registre na SPEC-08 §9.

### 🟡-4 [UI/CA-08.g] "Sair" com 36 px de altura no celular
**Onde:** `AppShell.tsx:55` (`size="compact"` → `h-9`)
**Cenário:** em 375 px, o único controle do cabeçalho tem 36 px de altura, abaixo dos 48 px que a CA-08.g exige "em 375 px **e** em 768 px". Um toque errado desloga o usuário. O tamanho já existia antes deste diff, mas o botão foi reposicionado nele e a CA é da spec que está sendo entregue.
**Regra violada:** SPEC-08 CA-08.g e PLANEJAMENTO_FRONTEND §8.2 (alvo de toque).
**Correção sugerida:** `className="min-h-touch md:min-h-0"`, o mesmo padrão do `ButtonLink` do comprovante em `ReservationDetailPage.tsx:381`.

### 🟢-1 [Fonte] "→" e "←" saem na fonte do sistema, no meio da Inter
**Onde:** `ReservationDetailPage.tsx:134` (`dd/mm → dd/mm`) e `BackLink` "← Reservas" (`:121`)
**Cenário:** conferi o CSS gerado. Os subsets do `@fontsource-variable/inter` 5.3.0 não cobrem U+2190 nem U+2192. O latin vai de U+2000 a U+206F e inclui U+2191 e U+2193, mas não as setas horizontais. A linha "Quarto 101 · 15/11 → 17/11" mistura duas famílias, com métricas diferentes.
**Correção sugerida:** trocar por `ArrowRight`/`ArrowLeft` do lucide com `aria-hidden`, ou usar "a"/"até" como no comprovante (`ReservationReceiptPage`).

### 🟢-2 [A11y] Tocar no fundo fecha a folha "Mais" e o foco vai para o body
**Onde:** `AppShell.tsx:108` (`onClick={() => setOpen(false)}`) junto com o novo foco em `:87-89`
**Cenário:** o novo efeito põe o foco no primeiro item da folha. Um toque no fundo desmonta a folha com o foco dentro, e o foco cai no `body`. O Esc devolve o foco ao "Mais" (`:95`), mas o fundo não. Antes do diff o foco ficava no "Mais", então isso não acontecia.
**Correção sugerida:** criar uma função `close()` que faça `setOpen(false)` e `moreRef.current?.focus()`, e usá-la no Esc e no fundo.

### 🟢-3 [DRY] A escala de tipografia está duplicada entre o preset e o `cn()`, e o teste não pega divergência
**Onde:** `frontend/packages/ui/src/cn.ts:10` e `frontend/packages/config/tailwind-preset.js:43`
**Cenário:** alguém acrescenta `caption` ao `fontSize` do preset e esquece o `cn.ts`. O `cn('text-caption', 'text-gray-600')` volta a apagar o tamanho, que é exatamente o bug que este diff corrigiu. O `typeScale.test.ts` lista os 5 nomes no próprio código, então continua verde.
**Correção sugerida:** no teste, importar o preset e iterar `Object.keys(preset.theme.extend.fontSize)`. Melhor ainda: `cn.ts` derivar a lista do preset.

### 🟢-4 [A11y] As setas das abas não respeitam modificador
**Onde:** `ReservationDetailPage.tsx:257-263`
**Cenário:** com o foco numa aba, Alt+← (voltar no navegador) vira troca de aba e recebe `preventDefault()`.
**Correção sugerida:** `if (e.altKey || e.ctrlKey || e.metaKey) return;` antes do `nextTab`.

### 🟢-5 [A11y] `aria-controls` da aba inativa aponta para um painel que não existe no DOM
**Onde:** `ReservationDetailPage.tsx:427` (com `:273` e `:334`, que renderizam só a aba ativa)
**Cenário:** com "Resumo" ativo, `aba-conta` tem `aria-controls="painel-conta"`, mas esse id não existe. A ligação já existia antes. Este diff só acrescentou `aria-labelledby`, que está correto. **SUSPEITA:** não rodei axe para saber se ele acusa isso. Os painéis também não têm `tabIndex={0}`, que o APG recomenda.
**Correção sugerida:** pôr `aria-controls` só na aba ativa e `tabIndex={0}` na `section`. Ou esperar o Radix Tabs do 5º semestre, como a SPEC-08 §9 já registra.

### 🟢-6 [Doc] Comentário desatualizado
**Onde:** `AppShell.tsx:26`: "Sem resposta, o cabeçalho fica só com quem está logado".
**Cenário:** sem resposta, o cabeçalho mostra "Gesway" (`:48`), e no celular não mostra quem está logado.
**Correção sugerida:** ajustar o texto.

## Repassados a outro dev
Nenhum. Os 3 avisos do `qa_checks.sh` (PixWebhook, Swagger de corporate-client/event-quote/room-category e `<button>` cru em `GuestsListPage.tsx:29`) já existiam e estão fora das linhas do diff.

## O que foi verificado e está correto
- **Hierarquia por status:**
  - PENDING dentro da janela e walk-in: check-in é o primary do cabeçalho, e embaixo ficam check-out desabilitado ("Check-out só depois do check-in.") e cancelar habilitado.
  - PENDING ou CONFIRMED vencidos ou antes da data: não há primary, e os três aparecem como secondary com motivo.
  - CONFIRMED: igual a PENDING.
  - CHECKED_IN: check-out é o primary, e check-in e cancelar ficam desabilitados com motivo.
  - CHECKED_OUT e CANCELLED: não há primary, e os três ficam desabilitados com motivo.
  - Status desconhecido: tudo desabilitado com `UNKNOWN_STATUS`.
  - O cancelar nunca vira primary.
  - Os mapas `*_BLOCKED` cobrem todo status não permitido, e o `action()` usa o motivo genérico como fallback.
- **Primary único:** o cabeçalho tem no máximo um. Ele só convive com outro no bloco "Confirmar check-out", e o do cabeçalho fica desabilitado nesse momento, o que é a exceção da CA-08.e. O `danger` do cancelar não é primary.
- **`confirming`/`openCheckOut`:** a mesma função serve ao primary e ao secundário. O `disabled` inclui `confirming === 'check-out'` nos dois. O cancelamento continua inline com "Sim, cancelar"/"Manter". `run()` não mudou.
- **Rótulo de busy do check-in:** ficou só no primary. O secundário só é clicável quando o check-in não é o primary, e isso nunca acontece com o check-in habilitado.
- **`cn()`/`extendTailwindMerge`** (tailwind-merge 2.6.1):
  - os 5 nomes batem com o preset;
  - `text-sm` com `text-support` resolve para o último, e cor com tamanho convivem;
  - `xl:text-sm` do `SECONDARY_ACTION` não conflita com o `text-base` da base;
  - o `TAB` do celular, que passa por `cn(TAB, …)` do `Button`, mantém o `text-support`.
  - Conferi todos os usos novos de `text-title|section|…` (21 arquivos). Nenhum vem seguido de `text-xs|sm|base` dentro do mesmo `cn()`.
  - O CSS gerado tem `.text-section{font-size:14px;line-height:20px;font-weight:600}`.
- **`tabular-nums` fora do `Button`:** os botões com valor em dinheiro já declaram `tabular-nums` no `span` interno (MenuGrid `:76`, RoomPicker `:58`) ou usam `Money`. PaymentForm e StaffActions não põem valor dentro do botão. `admin` e `booking` não têm código.
- **Abas:**
  - roving tabindex (`0`/`-1`);
  - `id` em cada aba e `aria-labelledby` no painel;
  - foco movido para o elemento da nova aba, que existe sempre;
  - `nextTab` testado com setas, Home, End e outras teclas.
- **Contraste**, calculado pela fórmula da WCAG:
  - #115e59 sobre branco: 7,58:1;
  - brand sobre brand/10 (item ativo): 6,49:1, e 6,21:1 sobre gray-50;
  - branco sobre brand/90 (hover): 5,94:1;
  - `text-support` em gray-600: 7,56:1;
  - o gray-500 do rótulo "Saldo da estadia" dá 4,83:1.
- **Dependências:**
  - `@fontsource-variable/inter` 5.3.0 (OFL-1.1) e `lucide-react` 1.66.0 (ISC, `sideEffects:false`), com versão exata no `package.json` e integrity no lock.
  - Build comparado com a develop: JS 519,76 → 530,49 KB (gzip 155,84 → 159,03, **+3,2 KB**) e CSS 26,06 → 28,95 KB.
  - Fontes em woff2 com `unicode-range`: no uso normal em pt-BR baixa só o latin (48 KB), e o latin-ext (85 KB) só se aparecer um glyph dele.
  - Os ícones são importados um por um e passam pelo tree-shaking.
  - Nenhuma chamada a CDN.
- **`useMyTenant` para todos os papéis:**
  - `GET /tenants/me` já era aberto a qualquer usuário autenticado (`tenantRouter.js`, sem `requireRole`), e o tenant vem do JWT.
  - A resposta traz dado do hotel (nome, subdomínio, CNPJ, `deposit_percent`), não dado pessoal.
  - O cache é limpo no `logout()` e no `setSession` com outro `user.id` (`stores/auth.ts`). Um 401 derruba a sessão e limpa o cache. Não há cruzamento entre usuários.
- **Marca por variável:** `tokens.css` é importado em `main.tsx` antes do CSS do app. `bg-brand/10` compõe a transparência, como se vê no CSS gerado.
- **Login:** passou a usar `Field`/`Input` com `htmlFor`/`id`, e o `autoComplete` foi mantido.
- **Rolagem lateral em 768 px:** a correção com `minmax(0,1fr)` e `min-w-0` está certa.
- **Verificações rodadas:**
  - `vitest run`: 346/346;
  - `tsc --noEmit` no app e no `@hotel/ui`: sem erro;
  - `qa_checks.sh`: 0 erros, com 3 avisos que já existiam.

## Não foi possível verificar
- Medida em pixels no navegador (dobra do 🟡-1, alvos do CA-08.g em 768 px, teste com axe). O Playwright MCP não está disponível nesta sessão. Isso fica para o qa-explorador.
- Cobertura de 60%: não rodei `--coverage` no frontend.
- Leitor de tela real (NVDA/TalkBack) nas abas e na folha "Mais".

## Desfecho (Sirlande, 15/11)

| Achado | Desfecho |
|---|---|
| 🟡-1 confirmação do check-out longe e foco perdido | Corrigido: `<h2>` da confirmação com `tabIndex={-1}`, recebe o foco e rola para o centro quando `confirming === 'check-out'` |
| 🟡-2 regra da ação principal sem teste | Corrigido: `primaryAction` em `reservationLogic.ts`, com testes para PENDING/walk-in, CONFIRMED, CHECKED_IN, fora da janela, encerrada, cancelada e desconhecido; cancelar nunca é principal; motivo em toda ação indisponível |
| 🟡-3 usuário escondido no celular | Corrigido: abaixo de `sm`, nome e papel numa segunda linha, sob o hotel |
| 🟡-4 "Sair" com 36 px | Corrigido: tamanho padrão (48 px) e compacto só a partir de `xl` |
| 🟢 setas com Alt | Corrigido: Alt, Ctrl e Meta passam direto |
| 🟢 fundo da folha "Mais" | Corrigido: o toque no fundo devolve o foco ao "Mais", como o Esc |
| 🟢 comentário do AppShell | Corrigido |
| 🟢 "→"/"←" fora da Inter | Mantido: fica na fonte do sistema; avaliar na T-08.5 (seta como ícone) |
| 🟢 escala duplicada em `cn.ts` | Mantido: comentário aponta o preset; teste de paridade fica para a T-08.6 |
| 🟢 `aria-controls` da aba inativa | Mantido como suspeita; conferir com axe na passada do qa-explorador |
