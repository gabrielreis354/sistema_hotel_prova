# QA Red Team — tela do consumo estornado (CA-05.2.j)
**Branch:** feature/m5c-estorno-tela · **Dev:** Gabriel · **Base:** develop@54a4f59 · **Commits:** 6764a8f, d5f0d8f, 6b0fa6e · **Data:** 11/11/2026
**Arquivos auditados:** 7 no diff: `reservationLogic.ts`, `reservationLogic.test.ts`, `components/BillTimeline.tsx`, SPEC-05, anexo do CA-05.2.j, painel e relatório de sessão. Também li os outros consumidores da linha do tempo: `ReservationDetailPage.tsx`, `ReservationReceiptPage.tsx` e `today/components/rows.tsx` (`officialBalanceCents`). E li o schema `Bill` do cliente tipado (`packages/api-client/src/schema.d.ts`).
**Achados no escopo:** 3 (🔴 0 · 🟡 0 · 🟢 3) · **Repassados:** 0

## Veredito
**APROVADO COM RESSALVAS**

A regra financeira está correta e protegida por teste. O consumo estornado não entra em "Diárias e consumos", no saldo final, no saldo corrente por linha, no comprovante nem em `officialBalanceCents`. Uma conta sem estorno sai idêntica. Não achei 🔴 nem 🟡. Os três 🟢 tratam de comentário desatualizado, de nome vazio sem tratamento e de lacunas de teste que não escondem defeito hoje.

**Verificação real (`frontend/apps/pms`):**
- `pnpm test`: 22 arquivos, 283 testes verdes.
- `pnpm typecheck` (`tsc --noEmit`): limpo.
- Mutação manual: 8 mutantes em `reservationLogic.ts`, cada um revertido com `git checkout` logo após rodar. 6 morreram e 2 sobreviveram (ver 🟢-2 e 🟢-3).

| Mutante | Resultado |
|---|---|
| M1 `notCounted: false` no estorno | morto (2 testes) |
| M2 `onReceipt: true` no estorno | morto (2 testes) |
| M3 `else if (!e.notCounted)` voltando a `else` | morto (1 teste) |
| M4 `voided: false` | morto |
| M5 `deleted_by?.name` truthy trocado por `!== undefined` | **sobreviveu**: só difere com nome `""`, caso sem teste |
| M6 rótulo sem o fallback "sem registro de quem autorizou" | morto |
| M7 `kind: 'payment'` | morto |
| M8 `c.description` sem o fallback `'Consumo'` | **sobreviveu**: caso sem teste |

## Achados no escopo

### 🟢-1 [manutenção] Comentários e JSDoc ainda descrevem só o pagamento
**Onde:** `components/BillTimeline.tsx:57-58`, `reservationLogic.ts:177`, `reservationLogic.ts:189-191` e `reservationLogic.ts:244-247`
**Cenário:** o próximo dev lê `notCounted: "Pagamento que ainda não conta no saldo (PIX pendente, falho, expirado)"` e conclui que só pagamento tem essa flag. Por isso, "otimiza" o somatório de volta para `else { charges += … }`, e o estorno passa a somar em "Diárias e consumos". O teste pega (M3), mas o comentário induz ao erro. O mesmo vale para:
- o comentário do risco ("O rótulo já diz 'estornado: motivo'"), que no consumo é "estornado por <nome>";
- o JSDoc de `onReceipt` ("diárias, consumos, …"), que não diz que o consumo estornado fica fora.

**Regra violada:** CODING_STANDARDS (documentação junto ao código). O comentário contradiz o comportamento.
**Correção sugerida:** atualizar os três JSDoc e o comentário para incluir "consumo estornado (CA-05.2.j)".

### 🟢-2 [robustez/consistência] Nome vazio ou só com espaço vira "estornado por  "
**Onde:** `reservationLogic.ts:289-291`
**Cenário:** `deleted_by: { id, name: "  " }` passa no teste truthy e gera o rótulo "Jantar (estornado por   )". Isso não diz quem autorizou e esconde o fallback honesto. O `users.name` é `TEXT NOT NULL` (`UserModel.js:17-20`), sem validação de vazio no model. O caminho do pagamento estornado aplica `trim()` ao `void_reason` (`reservationLogic.ts:309`), e o do consumo não. O mutante M5 sobrevive porque não há teste com nome vazio.
**Regra violada:** consistência com o modelo do pagamento VOIDED, que é o modelo declarado da branch. Fail-safe no texto de auditoria.
**Correção sugerida:** usar `const who = c.deleted_by?.name?.trim();` e montar o rótulo a partir de `who`. Acrescentar um caso de teste com `name: ''`.

### 🟢-3 [testes] Lacunas que não escondem defeito hoje
**Onde:** `reservationLogic.test.ts:186-248` e `components/BillTimeline.tsx:59-60`
**Cenário:**
- **(a)** Consumo estornado sem `description`: o fallback `'Consumo'` (M8) não tem teste. O schema declara o campo obrigatório, então o risco é baixo.
- **(b)** O critério "conta sem estorno fica idêntica" é testado com o bill sem o campo. A API real sempre manda `voided_consumptions: []`, e esse caso não tem teste explícito. Hoje é trivialmente igual.
- **(c)** O risco (`line-through`) e o "(fora do saldo)" do leitor de tela não têm teste automatizado: o Vitest roda em node, sem DOM. Remover qualquer um deles passa na suíte. A limitação é anterior à branch e vale também para o pagamento VOIDED. A conferência ficou na tela real feita pelo orquestrador.

**Regra violada:** checklist §8 ("teste que passaria com a regra quebrada"), apenas para (c).
**Correção sugerida:** em (a) e (b), acrescentar duas asserções no `describe('consumo estornado')`. Em (c), registrar como pendência para quando houver teste de componente (ambiente jsdom ou E2E Playwright).

## Repassados a outro dev
Nenhum.

## O que foi verificado e está correto
- **Somatório de cobranças (`else if (!e.notCounted)`):** não muda nenhum caso existente. Diária e consumo ativo são criados sempre com `notCounted: false` (`reservationLogic.ts:264` e `:279`), e pagamento segue pelo ramo `kind === 'payment'`. Os testes anteriores (30550 de cobranças, saldos 15000/8000/8550/23550/23550) seguem verdes, sem alteração.
- **Saldo corrente por linha:** a linha estornada repete o saldo anterior (teste: 8550 na linha do jantar). O saldo final é igual ao da conta sem estorno.
- **`officialBalanceCents`:** usa `balance_due` do servidor, que já exclui o estorno (schema `Bill`). Sem `balance_due`, a soma local também exclui, porque `notCounted` vale para o saldo. `rows.tsx:157` (Saídas) não é afetado.
- **Comprovante:** `receiptEntries` filtra por `onReceipt`, que vale `false` no estorno. `ReservationReceiptPage.tsx:90` usa `chargesCents`, que também exclui o estorno. Teste e mutantes M2/M3 confirmam. O hóspede não vê o estorno nem o nome de quem autorizou.
- **Data:** a linha usa `consumed_at` (teste com `toISOString`) e é formatada pelo mesmo `formatDateTimeBR` dos consumos ativos. A ordenação o coloca entre o consumo ativo e a diária seguinte (ordem por chave testada).
- **Acessibilidade:** o risco não é o único sinal.
  - O texto visível diz "(estornado por <nome>)" ou "(estornado, sem registro de quem autorizou)".
  - O leitor de tela ouve "Consumo: Jantar (estornado por Ana)" e "R$ 120,00 (fora do saldo)".
  - A troca de "(não abate o saldo)" por "(fora do saldo)" vale para pagamento pendente, expirado, falho e estornado. Nenhum teste dependia do texto antigo (grep).
  - O cinza `text-gray-500` (#6b7280) sobre branco fica acima do AA para texto normal.
- **LGPD/minimização:** `BillLike` tipa de `deleted_by` só `name`. O `id` chega pela API (D-71), mas não é lido nem exibido. Nenhum dado de hóspede novo entra. O nome do ADMIN fica na aba Conta, que é da equipe, e não vai para o papel.
- **Valores:** `cents()` usa `decimalToCents`. Não há `Number()` nem `parseFloat` no diff.
- **Chaves React:** o prefixo `voided-consumption-` evita colisão com `consumption-<id>`.
- **ESM, sem `require()`. Nenhum endpoint novo**, então o Swagger não muda. O cliente tipado já traz `voided_consumptions` como obrigatório, e o `BillLike` estrutural é compatível (typecheck limpo).

## Não foi possível verificar
- **Renderização:** não subi o backend nem o navegador, como combinado. A tela real (1280 px e 375 px, risco, rótulo, totais e comprovante) foi conferida pelo orquestrador, conforme `docs/historico_sessao/gabriel/estorno_tela_ca052j_11nov2026.md`. Não confirmei de forma independente a leitura do "(fora do saldo)" num leitor de tela real.
- **Legado:** o estorno antigo ainda não migrado de `consumptions` não aparece. É limitação conhecida do backend (anexo §2 e §4 item 2, Sirlande) e fica fora do escopo desta branch.

## Desfecho (11/11/2026, depois da auditoria)
Os três 🟢 foram tratados na mesma branch.

| Achado | Tratamento | Commits |
|---|---|---|
| 🟢 Comentários desatualizados | `notCounted`, `onReceipt`, `buildBillTimeline` e o comentário do risco em `BillTimeline.tsx` citam o consumo estornado | `39530af` |
| 🟢 Nome em branco | `trim()` no nome. Em branco vale como "sem registro de quem autorizou" | `243e4f7` (RED) · `39530af` |
| 🟢 Lacunas de teste | Testes de consumo sem descrição e de lista vazia. O risco e o "(fora do saldo)" seguem sem teste automático, por falta de DOM no Vitest, e foram conferidos na tela real | `243e4f7` |

PMS: 285 testes verdes, typecheck e build limpos.
