# QA Red Team — Confirmação das ações do painel "Hoje"
**Branch:** feature/confirma-acoes-painel · **Dev:** Gabriel (agente executor) · **Base:** develop@68e79ec · **Data:** 11/11/2026
**Arquivos auditados:** 2 no diff (`frontend/apps/pms/src/features/today/components/rows.tsx` e o relatório de sessão), com leitura de contexto em `TodayPage.tsx`, `today/queries.ts`, `rooms/queries.ts`, `reservations/queries.ts`, `@hotel/ui` (`Button`, `ActionSlot`), `GetAlertsController.js` (analytics), `ReleaseRoomController.js`, `CheckInController.js`, `roomRules.js`, `roomRouter.js` e `outbox/publisher.js` (core)
**Achados no escopo:** 4 (🔴 0 · 🟡 1 · 🟢 3) · **Repassados:** 0

## Veredito
**APROVADO COM RESSALVAS**

Não há 🔴. Os critérios centrais foram atendidos: o primeiro toque só abre o painel, "Voltar" fecha sem executar, o check-out manteve o comportamento da develop e os alvos têm 48 px abaixo de `xl`. A ressalva é a 🟡-1. Depois de um "Liberar para a venda" bem-sucedido, o painel continua aberto e o botão volta a ficar ativo. O motivo é que a lista "Em limpeza" vem de uma projeção com consistência eventual. Isso viola o critério "executa uma vez só" no uso real.

`pnpm test`: 22 arquivos, 285 testes verdes. `pnpm typecheck`: limpo.

## Achados no escopo

### 🟡-1 [UI/UX · corrida] "Liberar quarto": em caso de sucesso, o painel fica aberto e o botão de confirmação volta a funcionar enquanto a projeção do analytics não atualiza
**Onde:** `frontend/apps/pms/src/features/today/components/rows.tsx:325-333` (`confirmRelease`: o ramo de sucesso não chama `setConfirming(false)`) e `:349-362`
**Cenário:**
1. A recepção toca em "Liberar quarto" e depois em "Liberar para a venda". O core grava AVAILABLE e responde 200.
2. O `onSettled` de `useReleaseRoom` (`rooms/queries.ts:96-108`) aguarda o refetch de `['analytics']`. A lista "Em limpeza", porém, sai de `proj_rooms` no analytics-service (`GetAlertsController.js`, `WHERE rm.status = 'CLEANING'`). Essa tabela só muda quando o evento do outbox chega: o publisher do core consulta a cada 1 s (`outbox/publisher.js:59`) e ainda há o consumidor RabbitMQ. Por isso o refetch imediato quase sempre devolve o quarto ainda em CLEANING.
3. O `isPending` volta a `false`, a linha continua na lista e o painel continua aberto, com "Confirmar que o quarto 12 está limpo" e o botão "Liberar para a venda" **ativo**. Isso dura até o próximo `refetchInterval` (`REFRESH = 60_000`, `today/queries.ts:25,56`). Já o aviso de sucesso some em 6 s (`TodayPage.tsx:29-33`).
4. A recepção vê o painel ainda aberto, conclui que não funcionou e toca de novo. O core devolve 409 ("Só quarto em limpeza pode ser liberado — o quarto 12 está em AVAILABLE", `ReleaseRoomController.js:36-41`). O painel fecha e fica na tela um **erro persistente**, que substitui o sucesso. A pessoa termina achando que a liberação falhou.

Não há dano de dado, porque o servidor rejeita (allowlist `RELEASABLE_FROM`). Mesmo assim, o critério de aceite "o botão de confirmação executa uma vez só" não vale no ambiente real. O check-in e o check-out fecham o painel no `onSettled` (`:191`, `:263`), e só a liberação ficou diferente.
**Por que a conferência não pegou:** o relatório da sessão diz que `/analytics/alerts` foi **simulado**, e o mock não reproduz o atraso da projeção.
**Regra violada:** critério de aceite da tarefa (sem duplo envio). DESIGN_PMS §5 (a tela precisa mostrar o novo estado da ação irreversível).
**Correção sugerida:** a menor correção é fechar o painel também no sucesso (`() => { setConfirming(false); onResult(...) }`). A mais robusta é guardar um estado local `released` que, depois do 200, troque a ação da linha por um texto fixo, como "Liberado — atualizando a lista", com o botão desabilitado até a linha sair. Só fechar o painel devolve o botão "Liberar quarto" ativo, o mesmo comportamento da develop: melhor que o atual, mas a janela continua existindo.

### 🟢-1 [Acessibilidade] O foco se perde ao abrir e ao fechar a confirmação, que agora existe em três ações
**Onde:** `rows.tsx:175` e `:343` (o gatilho fica `disabled` quando `confirming`), `:89-91` ("Voltar" desmonta o painel), `:53-95` (`ConfirmPanel` não recebe nem devolve o foco)
**Cenário:** um usuário de teclado ou de leitor de tela aciona "Fazer check-in" com Enter. O botão focado fica desabilitado no mesmo render e o foco cai no `body`. Nada anuncia o painel, porque o `aria-live` envolve só o texto, que já nasce montado com o painel e por isso não é lido como mudança. Depois de "Voltar", o elemento focado deixa de existir e a navegação recomeça fora da linha. O padrão já existia no check-out da develop e agora vale para as três ações.
**Regra violada:** WCAG 2.4.3 (ordem de foco). Plano de frontend §8.2 (acessibilidade).
**Correção sugerida:** levar o foco ao botão de confirmação quando o painel abre (`ref` + `useEffect`, ou `autoFocus`) e devolvê-lo ao gatilho no "Voltar". Para isso o gatilho precisa de `ref`. Outra opção é deixar o gatilho ativo como alternância, já que ele declara `aria-expanded`.

### 🟢-2 [UI/UX · defesa em profundidade] O painel de check-in não reconfere `checkIn.enabled`
**Onde:** `rows.tsx:183-196`. O `ConfirmPanel` do check-in não recebe `canConfirm`, e o gatilho em `:175` é o único que olha `checkIn.enabled`.
**Cenário:** o painel está aberto. O refetch de 60 s chega com o quarto da chegada em CLEANING, por exemplo porque a saída atrasada fez check-out em outro balcão. O gatilho passa a mostrar o motivo ("quarto em limpeza") e fica desabilitado, mas "Confirmar check-in" segue ativo logo abaixo. O core recusa com 409 e uma mensagem clara (`CheckInController.js:58-61`), então não há dano. A tela, no entanto, se contradiz. Antes desta branch, o botão de um toque obedecia ao bloqueio. O check-out já tinha a mesma lacuna na develop, então lá não houve regressão.
**Correção sugerida:** `canConfirm={checkIn.enabled}` no painel de check-in. Se quiser, aplique o mesmo `checkOut.enabled && fresh` no check-out.

### 🟢-3 [Testes] Três fluxos irreversíveis novos sem teste automático
**Onde:** `rows.tsx` inteiro. O Vitest do PMS roda sem DOM.
**Cenário:** a 🟡-1 é exatamente o tipo de defeito que um teste de componente pegaria: depois do sucesso do `mutateAsync`, o painel continua montado. A conferência manual (15/15) usou um mock que escondeu o problema. A pendência já está registrada no relatório da sessão (#2, jsdom).
**Correção sugerida:** manter a pendência. Quando houver jsdom, cobrir abrir, Voltar, confirmar uma vez, erro e sucesso nas três linhas.

## Repassados a outro dev
Nenhum.

Observação de contexto, sem repasse: `useReleaseRoom` invalida `['analytics']` logo depois da escrita (`rooms/queries.ts:101-107`), mas pela arquitetura (outbox → RabbitMQ → projeção) essa invalidação quase nunca encontra o dado novo. O caminho de correção da 🟡-1 está dentro desta branch e não depende de mudar o hook.

## O que foi verificado e está correto
- **O primeiro toque não vai ao servidor.** O `onClick` dos gatilhos de check-in (`:176`) e de liberação (`:344`) só chama `setConfirming(true)`. `run` e `mutateAsync` aparecem apenas no `onConfirm`.
- **"Voltar"** chama só `setConfirming(false)` e fica desabilitado durante `busy` (`:89`), então não dá para fechar no meio da chamada.
- **Duplo envio no mesmo painel:** o botão de confirmação fica `disabled={busy || !canConfirm}` (`:85`). O servidor também é fail-safe: o check-in trava a reserva e devolve 422 fora de PENDING/CONFIRMED (`CheckInController.js:33-37`), e o release devolve 409 fora de CLEANING. A exceção é a janela da 🟡-1.
- **Regressão do check-out** (comparado com `origin/develop:rows.tsx`): título, `useFreshBill` só com o painel aberto, `fresh` como `canConfirm`, spinner, erro de carga, saldo em aberto, quitado e a devolver, "Abrir conta" entre Confirmar e Voltar com `cn(ROW_ACTION, 'xl:px-3')`, `run('check-out', () => setConfirming(false))` e os rótulos foram todos preservados. O wrapper `aria-live` continua sempre montado, porque o `children` do check-out é um array (truthy). O `shrink-0`, que antes ficava no `ActionSlot`, passou para o `div` da `Row`, com o mesmo efeito.
- **Erro do check-in:** o `onSettled` do `mutate` fecha o painel e o aviso de erro aparece. O mesmo vale para o erro da liberação (`:328-331`).
- **Motivo de ação indisponível:** o `ActionSlot` continua envolvendo o check-in e o check-out, com `aria-describedby` e motivo visível. `aria-controls` aponta para o `id` do painel (`${slot}-confirmacao`, `limpeza-${id}-confirmacao`), que só existe com o painel aberto. Com o painel fechado, `aria-expanded=false` vem acompanhado de um `aria-controls` sem alvo, o que é tolerado pela especificação ARIA.
- **Alvos de toque:** `Button` base `min-h-touch` e `ROW_ACTION` (`w-full sm:w-auto xl:min-h-0 xl:h-10`). O tamanho compacto só entra a partir de 1280 px. No celular os botões do painel ficam em coluna, com largura total. No tablet ficam em linha, com 48 px.
- **`Row` sem painel (InHouseItem):** a estrutura interna é idêntica à anterior. Só o `flex` passou do `li` para um `div` filho, e o `py-3` continua no `li`.
- **Estado do painel na recarga:** as listas usam `key` pelo id da reserva ou do quarto (`TodayPage.tsx:131,150,186`), então o refetch não abre nem fecha o painel de outra linha.
- **Textos contra o core.** "O quarto passa a ocupado e a conta da estadia abre": `CheckInController.js:64-80`, com `openStayAccount` na mesma transação. "Só o administrador consegue tirá-lo de novo": AVAILABLE só vai para MAINTENANCE pela edição (`roomRules.js:19-24`), e `PUT /rooms/:id` é `requireRole('ADMIN')` (`roomRouter.js:26`). AVAILABLE→CLEANING não existe para ninguém, o que torna o texto correto: só o admin tira o quarto da venda, e o quarto vai para manutenção, não de volta para limpeza.
- **DRY/KISS do `ConfirmPanel`:** extraído do painel do check-out que já existia e usado três vezes. `extra` e `canConfirm` têm um único uso cada, no check-out, mas evitam uma segunda versão do painel. Não há abstração especulativa nem dependência nova.
- **ESM, sem `require()`.** A branch não toca em backend, Swagger, tenant ou dinheiro.
- `pnpm test` (285/285) e `pnpm typecheck` limpos.

## Não foi possível verificar
- **Execução no navegador e no leitor de tela.** O componente não tem teste e o backend não foi subido, como combinado. A 🟡-1 foi confirmada por leitura de código (outbox com polling de 1 s, refetch de 60 s, ramo de sucesso sem fechar o painel), sem reprodução em tela.
- O tempo real entre o commit no core e a atualização da `proj_rooms` em staging e produção. Ele define o tamanho da janela da 🟡-1, mas não muda o fato de que ela existe.
