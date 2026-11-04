# QA Red Team — T-05.5 correções Impeccable (reauditoria delta)
**Branch:** feature/t055-correcoes-impeccable · **Dev:** Sirlande · **Base:** develop@aaacdea · **Data:** 27/10/2026
**Intervalo:** `7623dab~1..feature/t055-correcoes-impeccable` (correções de 🟡-1 a 🟡-5, 🟢-1 e 🟢-4 da auditoria anterior)
**Arquivos auditados:** 12 (código e testes, sem contar o relatório anterior)
**Achados no escopo:** 5 (🔴 0 · 🟡 0 · 🟢 5) · **Repassados:** 0

## Veredito
**APROVADO COM RESSALVAS**: todas as correções fecham o achado de origem e nenhuma regressão 🔴 ou 🟡 foi encontrada. As ressalvas são 🟢 e podem ir para a próxima sessão.

| Achado anterior | Situação |
|---|---|
| 🟡-1 saldo após fechar | **Fechado.** O backend devolve `accountBill` depois do `closeAccount` (`CloseAccountController.js:73-75`) e o Swagger tipa o 200 como `AccountBill`. `closedNotice` cobre saldo positivo, saldo negativo, zero, ausente e incompleto |
| 🟡-2 auto-rolar roubado | **Fechado.** `undoUntil` só é escrito em `addTap` (`queueCore.ts:67,77`). Envio, outcome e refetch não mexem nele |
| 🟡-3 recusado fora da vista | **Fechado.** Ver 🟢-2 e 🟢-3 deste delta, que tratam de ruído, não de falha |
| 🟡-4 timer de 5 s | **Fechado.** O total da confirmação é renderizado ao vivo e nunca mostra valor velho. Ver 🟢-4 |
| 🟡-5 ordem mesas/suítes | **Fechado** e com teste |
| 🟢-1 foco no aviso | **Fechado.** Ver 🟢-1 deste delta (SUSPEITA sobre `empty:hidden`) |
| 🟢-4 `undoLabel` | **Fechado.** O teste foi movido junto |

## Achados no escopo

### 🟢-1 [a11y · SUSPEITA] `empty:hidden` tira a região `status` da árvore de acessibilidade
**Onde:** `components/OpenAccountForm.tsx:69`
**Cenário:** com `same` indefinido, `{same && …}` renderiza `undefined`, e o JSX não deixa nó de texto. O `<p>` fica `:empty` e recebe `display:none`. Este ponto está **correto**: o `false`/`undefined` não quebra o `:empty`. O problema é outro. Um elemento com `display:none` sai da árvore de acessibilidade, então a região deixa de estar "sempre montada" para o leitor de tela. Quando o aviso aparece, ela volta para a árvore já preenchida, que é o mesmo caso de região inserida que o 🟢-1 queria evitar. Chrome com NVDA costuma anunciar mesmo assim. VoiceOver e TalkBack variam.
**Para confirmar:** testar com leitor de tela real. O Playwright não verifica anúncio.
**Correção sugerida:** manter a região sempre visível e remover o espaço quando vazia (`empty:-mt-3`, que compensa o `space-y-3`). Outra opção é separar uma região `sr-only` permanente, só com o texto, do bloco visível condicional.

### 🟢-2 [a11y] `role="alert"` em cada linha recusada é reanunciado ao abrir a conta
**Onde:** `components/ItemList.tsx:132`
**Cenário:** o garçom tem 3 lançamentos recusados ainda sem "OK" e abre a conta. Na troca de rota as 3 `<p role="alert">` entram no DOM, e Chrome/NVDA anuncia as 3 em modo assertivo, por cima do título. Isso se repete a cada visita até ele tocar em OK. O mesmo acontece quando várias recusas chegam juntas (por exemplo, conta fechada em outro aparelho recusando toda a fila): são N alertas seguidos.
**Correção sugerida:** usar `role="alert"` só nas entradas novas, aproveitando o `seenSettled` que já existe. Outra opção é uma única região viva com um resumo ("2 lançamentos recusados"), deixando o motivo na linha como texto comum.

### 🟢-3 [UX] Com várias recusas novas ao mesmo tempo, só a primeira entra na vista
**Onde:** `components/ItemList.tsx:79-87`
**Cenário:** duas recusas no mesmo ciclo. O `find` escolhe a primeira, que é a mais antiga e fica no topo, e todas são marcadas como vistas. A segunda pode ficar abaixo da área visível. Não há perda de informação: a primeira fica à vista, as duas mostram o estado e o rodapé muda. Também não existe loop nem rolagem repetida. Fica registrado porque o comportamento não está documentado. Ponto menor no mesmo trecho: o `querySelector` monta o seletor com `clientItemId` sem escape. Um id corrompido no `localStorage` com `"` lança `DOMException` dentro do efeito e derruba a tela. `isQueueEntry` só confere se o valor é `string`.
**Correção sugerida:** comentar que a rolagem vai para a primeira recusa nova. Usar `CSS.escape(fresh)` no seletor.

### 🟢-4 [UX/financeiro baixo] O total pode mudar durante a confirmação, que não expira mais
**Onde:** `components/StaffActions.tsx:67-70, 113-116`
**Cenário:** a recepção abre "Fechar Mesa 9? Total R$ 100,00", troca de aba e volta. O `refetchOnWindowFocus` traz um item lançado por outro aparelho, e o texto passa para R$ 130,00 sem anúncio e sem rearmar a trava de 400 ms. Se ela já tinha cobrado R$ 100 lendo a tela, um toque em "Sim, fechar" fecha com R$ 130. **Não há perda direta**: o servidor fecha pelo próprio cálculo e o aviso pós-fechamento mostra o saldo real (🟡-1). Antes, o timer limitava essa janela a 5 s, e agora ela não tem limite.
**Correção sugerida:** derrubar a confirmação, ou ao menos rearmar `shownAt`, quando `totalCents` mudar com a confirmação aberta: `useEffect(() => { if (confirming) setConfirming(false) }, [totalCents])`, guardado contra o primeiro render.

### 🟢-5 [UX] Foco cai no `body` quando a confirmação cai por bloqueio de conta fechada; entrada duplicada no histórico
**Onde:** `components/StaffActions.tsx:73-76`; `StaffActions.tsx:126-129`
**Cenário A:** com a confirmação aberta, a conta é fechada em outro aparelho e o refetch traz `status: CLOSED`. O `blocked` fica verdadeiro, a confirmação cai e o `focus()` vai para "Fechar conta", que agora está `disabled`. A chamada não faz nada, e o foco, que estava em "Voltar" (desmontado), cai no `body`. Quando o bloqueio vem de um toque do próprio usuário no cardápio, o foco fica no produto tocado e não há roubo. Esse caso está correto.
**Cenário B:** a recepção chega pela lista (`/comanda` → `/comanda/X`) e o `navigate('/comanda', { replace: true })` deixa o histórico como `[/comanda, /comanda]`. O primeiro "voltar" leva a uma tela idêntica e parece não fazer nada.
**Correção sugerida:** A — se o botão estiver desabilitado, focar o texto do motivo (`#close-blocked-reason` com `tabIndex=-1`). B — aceitável como está; se incomodar, usar `navigate(-1)` e passar o aviso por store ou query cache em vez de `location.state`.

**Nota de documentação:** o comentário de `AccountsListPage.tsx:17` ainda diz "a mais antiga primeiro". Falta mencionar o agrupamento mesas → suítes.

## Repassados a outro dev
Nenhum.

## O que foi verificado e está correto
- `Notice focus`: só a lista usa `focus` (`AccountsListPage.tsx:64`). O efeito depende de `[focus]`, que é constante, então dispara uma vez na montagem. No StrictMode a segunda execução foca o mesmo elemento sem efeito visível. Refetch da lista e o `navigate(…, state:null)` não refocam, porque `closed` fica guardado em `useState`. O aviso não reaparece depois de "Ver conta fechada" seguido de "voltar", porque o state foi limpo.
- O efeito de foco em `StaffActions` não dispara na montagem (`wasConfirming` começa `false`, inclusive no StrictMode). Depois de um fechamento bem-sucedido, `navigate` e `setConfirming` caem no mesmo lote e o componente desmonta antes do efeito. No erro, o foco volta para "Fechar conta", habilitado, e o `role="alert"` mostra o motivo.
- Com o timer removido, `!close.isPending` evita derrubar a confirmação no meio do "Fechando…". O botão "Voltar" fica `disabled` durante o envio.
- Auto-rolar: na montagem (`seenTap=-1`) rola até o fim. No StrictMode a segunda execução não rola de novo. "Desfazer", confirmação do servidor e refetch reduzem ou mantêm `lastTap` e não rolam. Um toque que incrementa a linha 2× renova `undoUntil` e rola.
- A caixa `relative` faz o `offsetTop` da `<li>` ser medido em relação à própria caixa.
- `sortAccounts`: `type` indefinido entra no grupo 0, a ordem é estável dentro de cada grupo e o array original não é alterado (`[...accounts]`).
- `closeAccount`: o contrato com o backend confere (200 → `AccountBill`). O `throw` nos erros foi mantido.
- `closedNotice` sem PII: usa só o rótulo e o valor. Não há `console.*` novo.
- `queueCore`/`queueStore` sem mudança de lógica: só o `undoLabel` saiu.
- `vitest run src/features/accounts`: 64/64 (os 69 do pacote incluem outros módulos). `tsc --noEmit` limpo.

## Não foi possível verificar
- O anúncio real em leitor de tela (🟢-1, 🟢-2). Sem NVDA/VoiceOver/TalkBack no ambiente, a conclusão vem do comportamento documentado das ARIA live regions.
- O Playwright não foi reexecutado. Os 23 checks citados pelo dev foram aceitos como relato.
