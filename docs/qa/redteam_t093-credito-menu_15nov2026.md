# QA Red Team — T-09.3: crédito na linha do tempo e "Usuários" fora do menu
**Branch:** `fix/t093-credito-menu` · **Dev:** Gabriel (agente executor) · **Base:** origin/develop@2ec2446 · **HEAD:** 302c73b · **Data:** 15/11/2026
**Arquivos auditados:** 4 no diff (`BillTimeline.tsx`, `BillTimeline.test.ts`, `nav.ts`, `nav.test.ts`) + 9 de contexto
**Achados no escopo:** 6 (🔴 0 · 🟡 0 · 🟢 6) · **Repassados:** 0 (1 observação fora do escopo, 🟢, mesmo dono, registrada abaixo)

## Veredito
**APROVADO COM RESSALVAS**

CA-09.d, CA-09.e e CA-09.g estão atendidos e foram verificados com execução real:
- `pnpm --filter "./apps/*" --filter "./packages/*" test`: domain 44/44, pms 317/317 (24 arquivos), incluindo `BillTimeline.test.ts` (3) e `nav.test.ts` (7).
- `pnpm -r typecheck`: os 4 pacotes passam sem erro.
- Nenhum teste de lógica existente foi alterado. A única mudança em teste preexistente é a expectativa do menu em `nav.test.ts:8-11`, que o próprio T-09.3 pede.

As ressalvas são todas 🟢. Nenhuma bloqueia o CA-09.h. Os itens 🟢-1 e 🟢-3 custam poucas linhas e valem fazer antes do merge.

## Achados no escopo

### 🟢-1 [Testes] O teste não diferencia "crédito" visível de "crédito" só para leitor de tela
**Onde:** `frontend/apps/pms/src/features/reservations/components/BillTimeline.test.ts:9` (`text()` remove todas as tags) e `:37-43`
**Cenário:** o T-09.3 pede a palavra "visível e não só para leitor de tela". Se alguém trocar `BillTimeline.tsx:91` por `<Money cents={Math.abs(cents)} /><span className="sr-only"> crédito</span>`, o texto extraído continua `R$ 1.050,00 crédito` e os 3 testes passam, mas a palavra some da tela. O teste prova a ausência do sinal de menos (o que o CA-09.d pede de fato), mas não prova a visibilidade.
**Reprodução:** faça a troca acima numa cópia local e rode `pnpm --filter ./apps/pms test BillTimeline`. O teste continua verde. Concluí isso lendo o código: a regex `/<[^>]+>/g` descarta a classe junto com a tag. Não rodei a mutação.
**Regra violada:** Testes — teste que passaria com a regra quebrada.
**Correção sugerida:** na célula de saldo negativo, conferir que nenhum ancestral de "crédito" tem `sr-only`. Por exemplo, `expect(cellHtml).not.toMatch(/sr-only[^>]*>[^<]*crédito/)`. Outra opção é registrar a captura de tela do CA-09.d.

### 🟢-2 [Testes] Espaço não separável literal e invisível nas expectativas, e um comentário que o descreve errado
**Onde:** `BillTimeline.test.ts:39` e `:54` (strings `'R$ 1.050,00 crédito'`, `'R$ 150,00'`…). Comentário em `:8`.
**Cenário:** o espaço depois de `R$` é U+00A0 no arquivo-fonte (bytes `302 240` no `od -c`). Ele não se distingue de um espaço comum no editor nem no diff. Se um formatador, um copiar e colar ou um dev "corrigir" para espaço comum, o teste quebra sem regressão nenhuma. O comentário chama U+00A0 de "espaço fino", mas o espaço fino é U+2009. U+00A0 é o espaço não separável.
**Reprodução:** `grep -n "1.050,00 crédito" BillTimeline.test.ts | od -c` mostra `$ 302 240 1 . 0 5 0`.
**Regra violada:** KISS — o teste depende de um caractere invisível.
**Correção sugerida:** escrever `'R$ 1.050,00 crédito'`. Outra saída é normalizar em `text()` com `.replace(/ /g, ' ')`. Em qualquer caso, corrigir o comentário.

### 🟢-3 [Docs/código] O comentário de `NAV_ITEMS` passou a afirmar duas coisas falsas
**Onde:** `frontend/apps/pms/src/routes/nav.ts:14-18`
**Cenário:** o JSDoc diz "ADMIN vê tudo, incluindo Configurações" e que a lista "é a fonte única do menu e do gate de rota". Depois desta branch, o ADMIN não vê Configurações. E `/config/usuarios` tem gate em `App.tsx:56-61` (`RequireRole allow={['ADMIN']}`) sem estar em `NAV_ITEMS`. A lista deixou de ser fonte única do gate. Quem ler o comentário vai procurar o item no menu e não vai achar.
**Reprodução:** leia `nav.ts:14-18` e depois `nav.ts:27`.
**Regra violada:** Boy Scout Rule — o comentário contradiz o código da mesma tela.
**Correção sugerida:** "ADMIN vê tudo o que já tem tela; Configurações volta no 5º semestre. A rota `/config/usuarios` existe em `App.tsx` sem item de menu."

### 🟢-4 [UX] Dois rótulos para o mesmo valor na mesma tela, e "crédito" com dois sentidos na mesma linha
**Onde:** `BillTimeline.tsx:91` ("crédito"), `BillTimeline.tsx:76` ("A devolver"), `StaffActions.tsx:113` e `accountTotals.ts:65` ("Crédito do hóspede"), `reservationLogic.ts:242,246` ("Cartão de crédito")
**Cenário:** este cenário não é coberto pelos testes da branch (eles usam `PIX` e `CASH`). Reserva com `room_total` 300 e pagamento `CREDIT_CARD` de 1.050 antes da 1ª diária.
- A linha do pagamento fica "Pagamento · Cartão de crédito | -R$ 1.050,00 | R$ 1.050,00 crédito". A palavra "crédito" aparece duas vezes na mesma linha, uma como meio de pagamento e outra como direção do saldo.
- A última linha mostra "R$ 750,00 crédito" e, logo abaixo, o total "A devolver R$ 750,00". É o mesmo dinheiro com dois nomes.
A SPEC pede exatamente esse texto e a semântica até se sustenta: no meio da estadia é crédito que as próximas diárias consomem, e no fim é valor a devolver. Por isso fica como 🟢. O `DESIGN_PMS.md` não tem regra sobre isso (busquei "crédito", "devolver" e "negativ": nenhum resultado).
**Regra violada:** consistência de vocabulário. Nenhuma regra escrita é violada.
**Correção sugerida:** nenhuma nesta branch, porque CA-09.g e a SPEC fixam o texto. Fica para quem revisar o glossário: avaliar "crédito do hóspede" na linha, como no `StaffActions`, se a captura mostrar que cabe nas 520 px da tabela.

### 🟢-5 [UX/a11y] "-R$" na coluna Valor dos pagamentos, ao lado de "crédito"
**Onde:** `BillTimeline.tsx:60` (`amountCents` negativo para pagamento, em `reservationLogic.ts:352`)
**Cenário:** na linha do sinal, a recepção lê "-R$ 1.050,00" em Valor e "R$ 1.050,00 crédito" em Saldo. O leitor de tela diz "menos R$ 1.050,00" na coluna Valor.
**Avaliação:** não confunde o suficiente para virar 🟡.
- (a) O CA-09.d fala de "valor de saldo", e Valor não é saldo.
- (b) O sinal em Valor é o sentido do movimento: o pagamento abate. A leitura "−1.050 → 1.050 crédito" é coerente, e o marcador em anel (`KIND_DOT`, `:16`) mais o rótulo "Sinal/Pagamento" já dizem que é entrada.
- (c) Mudar isso agora alteraria a regra de exibição de todas as linhas e esbarraria no CA-09.g.
Fica o custo menor de ouvir "menos" no leitor de tela.
**Reprodução:** o fixture `advance` do teste. Em `renderToStaticMarkup`, a 3ª célula da 1ª linha é `-R$ 1.050,00`.
**Correção sugerida (futura):** mostrar o pagamento sem sinal na coluna Valor. A direção já está no marcador e no rótulo. Registrar como pendência de UX, fora da SPEC-09.

### 🟢-6 [DRY] A regra "saldo negativo vira texto de crédito" agora existe em 3 lugares, e o ternário "A devolver" em outros 3
**Onde:** `BillTimeline.tsx:87-94` (`LineBalance`), `StaffActions.tsx:109-114` (inline), `accountTotals.ts:63-66` (`balanceLine`, que devolve string). O rótulo `balance < 0 ? 'A devolver' : …` se repete em `BillTimeline.tsx:76`, `ReservationDetailPage.tsx:125` e `ReservationReceiptPage.tsx:96`.
**Cenário:** se o vocabulário mudar (ver 🟢-4), alguém atualiza um lugar e esquece outro. O resultado é a mesma conta com nomes diferentes em telas vizinhas. Não há risco financeiro: todas usam `Math.abs` ou `-cents` sobre centavos inteiros, e nenhuma refaz o cálculo do saldo.
**Reprodução:** `grep -rn "rédito\|A devolver" frontend/apps/pms/src --include=*.tsx --include=*.ts | grep -v test`
**Regra violada:** DRY, só no nível de apresentação.
**Correção sugerida:** não abstrair nesta branch (KISS, e o escopo fixado pela SPEC). Quando o glossário for revisto, criar `creditLabel(cents)` em `features/accounts/accountTotals.ts` ou no `@hotel/domain` e usá-lo nos 3 lugares.

## Repassados a outro dev
Nenhum repasse gravado. Há uma observação 🟢 fora do diff, cujo dono é o próprio Gabriel (reservas, §3.1 da divisão). Ela cabe na T-09.1, que mexe no comprovante:

| Sev. | Achado | Onde | Dono | Repasse |
|------|--------|------|------|---------|
| 🟢 | O comprovante entregue ao hóspede mostra pagamento como "-R$ 1.050,00" na coluna Valor. No papel, para o hóspede, o sinal de menos é menos óbvio que para a equipe. Não há coluna de saldo, então o CA-09.d não se aplica | `ReservationReceiptPage.tsx:82` | Gabriel (T-09.1) | não gravado: mesmo dono, citar na revisão da T-09.1 |

## O que foi verificado e está correto
- **Saldo de linha com sinal de menos, em outros lugares:** não restou nenhum. `ReservationReceiptPage` não tem coluna de saldo. `rows.tsx:285-294` e `ReservationDetailPage.tsx:294-296` só mostram `balance` dentro de `balance > 0`, e o caso negativo usa `-balance` com "a devolver". `PaymentForm.tsx:206` mostra `overpaid ≥ 0`. `paymentLogic.ts:129` usa `formatBRL(-now)`.
- **`LineBalance`:** zero e positivo não mudam (`cents >= 0`, mesma `className`). Para o negativo, usa `Math.abs` sobre centavos inteiros, sem float, e o `whitespace-nowrap` impede que "crédito" quebre de linha.
- **Leitor de tela:** a célula de saldo é lida como "R$ 1.050,00 crédito", em um único rótulo, sem "menos" e sem texto `sr-only` duplicado.
- **Totais:** `BillTimeline.tsx:76` está inalterado e continua "A devolver" com `Math.abs`. Há teste em `:55-59`.
- **Fixture do teste:** ele realmente produz saldo negativo em todas as linhas: -1.050, -900 e -750, com a asserção `some(balanceCents < 0)`. A asserção `not.toMatch(/[-−]/)` pega tanto o hífen quanto o U+2212.
- **Menu:** "Usuários" saiu de `NAV_ITEMS`, o que tira o item do menu do computador e da folha "Mais" de uma vez, porque as duas listas vêm de `navItemsForRole` e `mobileNavForRole`. O ADMIN ficou com 6 itens: 4 abas fixas + "Mais" (Quartos, Indicadores), total de 5 abas, dentro do `MOBILE_TABS_MAX`. O teste `it.each` (`nav.test.ts:31-37`) continua garantindo que nenhum item some nem aparece em dobro.
- **Outros links para `/config/usuarios`:** nenhum. O `grep` em `frontend/` acha só `App.tsx:59` e o comentário de `nav.ts:27`. Hoje, `AppShell` e as páginas não linkam para lá. Os acertos em `swagger.js` e `rabbitmq-setup.sh` são do backend e não têm relação.
- **Rota acessível pela URL:** não é problema. Ela continua atrás de `RequireRole allow={['ADMIN']}` (`App.tsx:56`) e renderiza só o `Placeholder`, sem dado nem chamada à API. O único efeito é que nenhuma aba fica marcada quando o admin abre a rota pela URL. É o comportamento pedido pela SPEC ("a rota continua").
- **Regras do projeto no diff:** sem `require()`, sem mudança de contrato de API nem de regra de domínio, sem `Number()` sobre valor `DECIMAL` e sem manipulação de data.

## Não foi possível verificar
- **Captura de tela do CA-09.e e aparência real em 390 px:** não subi o app no navegador. A largura da célula "R$ 1.050,00 crédito" dentro do `min-w-[520px]` não foi medida.
- **Mutação do 🟢-1:** concluída pela leitura da regex, sem rodar a mutação.
- **`ci-frontend.yml`:** reproduzi localmente os passos de teste e typecheck. Não executei o workflow do CI.

## Desfecho (15/11, Gabriel com Claude)
- Nenhum 🔴 ou 🟡: a branch segue para o merge.
- **🟢-3 corrigido:** comentário do `nav.ts` atualizado.
- **🟢-1, 🟢-2, 🟢-4, 🟢-5 e 🟢-6:** registrados, sem ação. O "-R$" da coluna Valor (🟢-5) e o vocabulário "crédito"/"A devolver" (🟢-4) ficam para decisão do Gabriel.
