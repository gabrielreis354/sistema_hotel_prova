# QA Red Team — spec11-cpf-hospede (SPEC-11, T-11.1, CA-11.c/d)
**Branch:** fix/spec11-cpf-hospede · **Dev:** Gabriel · **Base:** develop@705717e · **Data:** 22/11/2026
**Commits auditados:** `cf1f875` test(hospedes): RED do CPF inválido e do duplicado pelos dígitos · `e5e6b62` fix(hospedes): CPF válido e só com dígitos no cadastro, duplicado achado pelos dígitos · `ade2394` docs(api): 400 de CPF inválido no POST e no PUT de /guests, com o cliente regerado · `23e05dc` fix(pms): cadastro e edição de hóspede mostram o motivo do 400
**Arquivos auditados:** 14 do diff (`app/utils/guestCpf.js`, `CreateGuestController.js`, `UpdateGuestController.js`, `config/swagger.js`, `openapi.json`, `schema.d.ts`, `guestsApi.ts`, `guestsApi.test.ts`, `tests/guest-cpf.test.js`, `guests.test.js`, `guests-search.test.js`, `outbox.test.js`, `tenant-isolation.test.js`, `test_rotas.sh`). Para validar os cenários também li `isValidCpf.js`, `onlyDigits.js`, `digitsOf.js`, `isNonBlankString.js`, `uniqueConstraintConflict.js`, `GuestModel.js`, `applyDbConstraints.js:103,188`, `PublicBookingApi/CreateBookingController.js:95-185`, `ContractApi/SignContractController.js:1-35`, `CorporateClientApi/{Create,Update}CorporateClientController.js`, `GuestForm.tsx`, `GuestFormPages.tsx`, `frontend/e2e/src/helpers.ts`, `frontend/e2e/tests/roteiro.spec.ts:94,233` e a SPEC-11 (§5 e §6) na `origin/docs/avaliacao-banca-simulada`.
**Achados no escopo:** 6 (🔴 0 · 🟡 1 · 🟢 5) · **Repassados:** 3

## Veredito
**APROVADO COM RESSALVAS**

CA-11.c e CA-11.d estão cumpridos no POST e no PUT. A busca de duplicado sempre filtra por `tenant_id` do JWT. O escopo paranoid ignora hóspede excluído, coerente com o índice parcial. A corrida entre formatos diferentes é barrada pelo índice, porque agora tudo é gravado em dígitos. Provei os quatro pontos rodando uma sonda contra o Postgres de teste. A sonda foi apagada depois, e a worktree ficou limpa. Fica um 🟡: um CPF legado **sem nenhum dígito** (`'n/a'`, `'estrangeiro'`) não pode ser apagado pela API, porque `cpfChanged` acha que `''` não muda nada.

### Execução
- `npx vitest run tests/guest-cpf.test.js tests/guests.test.js tests/paranoid-unique-recreate.test.js tests/public-booking.test.js tests/b2b-smoke.test.js`: 5 arquivos, **96/96** passaram.
- Frontend: `pnpm exec vitest run src/features/guests` deu 6 arquivos, **38/38** passaram. `pnpm exec tsc --noEmit -p .` em `apps/pms` terminou com exit 0.
- Sonda temporária `tests/zz-redteam-probe.test.js`, removida em seguida. Os resultados estão citados nos achados e no bloco de verificados.

## Achados no escopo

### 🟡 [regra de negócio] CPF legado sem dígito nenhum não pode ser apagado: `PUT {cpf: ''}` ou `{cpf: null}` devolve 200 e mantém o lixo
**Onde:** `services/core-service/app/utils/guestCpf.js:52-54` (`cpfChanged`), usado em `UpdateGuestController.js:59`
**Cenário (reproduzido):** hóspede legado gravado antes da regra com `cpf = 'n/a'`, `'estrangeiro'` ou `''`. A SPEC-11 §7 lembra que o hóspede estrangeiro não tem CPF, então esse texto é plausível no banco de demonstração. `PUT /guests/:id {cpf: ''}` passa por `cpfChanged('', 'n/a')`, que avalia `null !== onlyDigits('n/a')`, ou seja `null !== null`, e devolve `false`. O bloco inteiro é pulado. Saída da sonda:
```
legado "n/a" -> PUT '' / null: [200,"n/a",200,"n/a","gravado:","n/a"]
legado "estrangeiro" -> PUT '' / null: [200,"estrangeiro",200,"estrangeiro","gravado:","estrangeiro"]
```
A API responde 200, e a recepção acha que limpou. O texto continua na ficha e na busca. A única saída é trocar por um CPF válido, que o estrangeiro não tem.
**Regra violada:** contrato documentado no próprio teste `guest-cpf.test.js` ("apagar o CPF (vazio) → 200 com cpf null") e no JSDoc de `isBlankCpf` ("Vazio apaga o CPF"). Ele só vale quando o gravado tem dígitos. Também viola Fail Fast: é um 200 silencioso.
**Correção sugerida:** no apagamento, comparar com o valor cru, não com os dígitos. Por exemplo: `if (isBlankCpf(value)) return stored !== null;` e depois `return onlyDigits(value) !== onlyDigits(stored);`. Vale um caso no `guest-cpf.test.js` com `legado('Estrangeiro', 'n/a')` seguido de `PUT {cpf: ''}`, esperando `null`.

### 🟢 [validação] Tipos e espaços tratados de forma diferente no POST e no PUT
**Onde:** `guestCpf.js:21-23` (`isBlankCpf`) e `guestCpf.js:52-54`
**Cenário (reproduzido):**
- No POST, `cpf: '   '` dá 400 "CPF inválido", mas `cpf: ''` dá 201 com `null`.
- No PUT de um hóspede sem CPF, `{cpf: 'abc'}`, `{cpf: {}}`, `{cpf: []}`, `{cpf: false}` e `{cpf: '   '}` dão **200** e ignoram o valor em silêncio. O POST recusa todos eles com 400.
- No PUT de um hóspede com `39053344705`, `{cpf: ['39053344705']}` e `{cpf: 39053344705}` (número) dão 200, porque `String()` coincide com os dígitos. Já `{cpf: '   '}` dá 400.

Nada inválido é gravado, então não há dano. Mas o swagger do PUT promete 400 para "CPF trocado por um inválido", e o cliente que mandou `'abc'` recebe 200.
**Regra violada:** Fail Fast e consistência de contrato entre POST e PUT. Hoje a tela não chega a esses casos, porque o zod faz `trim` e manda string.
**Correção sugerida:** `isBlankCpf` passa a aceitar só espaços como vazio, com `value === null || (typeof value === 'string' && value.trim() === '')`. No PUT, recusar com 400 o `cpf` que não for string, nem `null`, antes de chamar `cpfChanged`.

### 🟢 [swagger] O exemplo do schema `Guest` ainda mostra CPF mascarado e inválido
**Onde:** `services/core-service/config/swagger.js:211` (`cpf: { type: 'string', example: '123.456.789-00' }`)
**Cenário:** a resposta agora sempre traz só dígitos, por exemplo `"52998224725"`. O exemplo do Swagger, que vai para o `openapi.json` e para o `schema.d.ts`, mostra um CPF de dígito errado e com máscara. Quem testar pelo "Try it out" copiando o exemplo do request leva 400.
**Correção sugerida:** trocar o exemplo para `'52998224725'` e regerar o cliente.

### 🟢 [CA-11.c / documentação] PUT com CPF válido mascarado do legado não normaliza para dígitos
**Onde:** `UpdateGuestController.js:59`, `swagger.js` (descrição do 400 do PUT)
**Cenário (reproduzido):** hóspede legado com `'529.982.247-25'` e `PUT {cpf: '52998224725', full_name: ...}` dão 200, e o gravado **continua** `'529.982.247-25'`. O texto literal do CA-11.c ("com CPF válido em qualquer formato → grava só os dígitos") não vale para esse caso. A escolha é defensável: o parecer 🟡2 e o adiamento do CA-11.e (🟢4) cobrem, e normalizar aqui poderia colidir no índice cru com uma duplicata legada. Só falta deixar isso escrito.
**Correção sugerida:** acrescentar à descrição do 400/200 do PUT no swagger "reenviar o gravado não o normaliza; a normalização do legado é o CA-11.e". Basta uma linha no relatório de sessão.

### 🟢 [DRY] A busca pelos dígitos do CPF fica em dois lugares
**Onde:** `guestCpf.js:26-34` (`findGuestByCpfDigits`) e `PublicBookingApi/CreateBookingController.js:161-168`, que já existia
**Cenário:** o mesmo `where { tenant_id, [Op.and]: [sequelize.where(digitsOf('cpf'), digits)] }` está escrito duas vezes. Se a expressão do índice mudar, as cópias divergem. O `SignContractController` compara pelo texto cru (ver repasse), o que mostra como as três rotas já divergem hoje.
**Correção sugerida:** `findGuestByCpfDigits` aceitar `{ transaction, order }` e ser usado pela reserva pública e pelo contrato. Não precisa ser nesta branch.

### 🟢 [testes] Faltam casos de borda
**Onde:** `services/core-service/tests/guest-cpf.test.js`
**Cenário:** os testes cobrem bem o caminho feliz e as recusas principais. Não cobrem:
- o legado sem dígito (achado 🟡 acima);
- tipo errado no body (número ou array);
- PUT no tenant B usando o CPF que só existe no tenant A. A sonda provou 200, mas o `tenant-isolation.test.js` só testa POST;
- PUT para o CPF de um hóspede **excluído**. A sonda provou 200, e o `paranoid-unique-recreate.test.js` só testa POST.

Sem esses casos, uma regressão que tire o `tenant_id` do `findGuestByCpfDigits` só seria pega pelo POST.
**Correção sugerida:** acrescentar os quatro casos ao `guest-cpf.test.js`.

## Repassados a outro dev

| Sev. | Achado | Onde | Dono | Repasse |
|------|--------|------|------|---------|
| 🟡 | A tela de edição não consegue apagar o CPF (nem o telefone nem o e-mail): campo vazio vira `undefined`, sai do JSON, e o backend mantém o valor | `frontend/apps/pms/src/features/guests/GuestForm.tsx:20-22` | Sirlande (ficha do hóspede, DIVISAO §4.1) | `docs/qa/repasses/para_sirlande_22112026.md` |
| 🟡 | A assinatura de contrato procura o representante pelo CPF cru: com hóspede legado mascarado cria um segundo hóspede com os mesmos dígitos, e grava CPF sem validar | `services/core-service/app/Controllers/ContractApi/SignContractController.js:16-25` | Weslley (B2B, DIVISAO §4.1) | `docs/qa/repasses/para_weslley_22112026.md` |
| 🟡 SUSPEITA | `UpdateCorporateClientController` não normaliza `representante_cpf`/`cpf`/`cnpj`: um valor mascarado iria para `VARCHAR(11)` e provavelmente daria 500 | `services/core-service/app/Controllers/CorporateClientApi/UpdateCorporateClientController.js:10-11` | Weslley | `docs/qa/repasses/para_weslley_22112026.md` |

Observação sem repasse: com o PIX fake ou o Mercado Pago, a reserva pública (`CreateBookingController.js:105,158,182`) continua gravando `onlyDigits(guest.cpf)` sem `isValidCpf`. Um `'123'` vira hóspede com CPF `123`. O CA-11.i diz que a reserva pública não muda, então isso não é defeito desta entrega. Fica registrado para quando a SPEC-11 for revista.

## O que foi verificado e está correto
- **Tenant isolation:** `findGuestByCpfDigits` sempre põe `tenant_id` no `where` (`guestCpf.js:29`). O `tenantId` vem de `request.user.tenantId` nos dois controllers e nunca do body. Pela sonda, o tenant B grava o CPF de um legado do A (200), e um PUT do B no hóspede do A dá 404.
- **Soft delete:** `GuestModel` é `paranoid: true`, então o `findOne` ignora excluídos, e o índice `guests_cpf_tenant_unique` é parcial (`deleted_at IS NULL`). Pela sonda, excluir e recadastrar com outro formato dá 201. PUT para o CPF de um legado mascarado excluído dá 200.
- **Corrida:** quatro POSTs simultâneos com `168.995.350-09`, `16899535009`, `' 16899535009'` e `168.995.350-09` deram um 201 e três 409, com 1 linha no banco. Três PUTs simultâneos para `453.178.287-91`/`45317828791` deram um 200 e dois 409. Como tudo passa a ser gravado em dígitos, o índice cru pega a corrida entre formatos. A única brecha com o legado mascarado seria outro fluxo gravando máscara ao mesmo tempo, e a API de hóspedes não grava mais máscara (ver o repasse do contrato).
- **PUT:**
  - trocar o legado inválido `123.456.789-01` por outro inválido (`11111111111`) dá 400;
  - reenviar o mesmo legado com máscara diferente dá 200 e troca o telefone;
  - trocar por um válido dá 200 e grava os dígitos;
  - `excludeId: guest.id` impede o falso 409 consigo mesmo;
  - trocar para o CPF de outro hóspede, ainda que legado mascarado, dá 409;
  - o 400 e o 409 retornam antes do `save()`, e o registro fica intacto, como o teste confere.
- **POST:** número, array, objeto, `false`, `0` e `true` dão 400. `null` e `''` dão 201 com `null`. `' 529.982.247-25 '` dá 201 e grava `52998224725`.
- **Outros fluxos:** o e2e gera CPF válido (`helpers.ts:45-53`) para a tela e para a reserva pública. O seed já grava dígitos válidos (`seed-cpf-valido.test.js` existe). O `test_rotas.sh` foi atualizado. A tela não manda CPF fora de string porque o zod faz `trim`.
- **Tela:** o 400 chega legível. Pela ordem em `guestsApi.ts:51-55,65-69`, o 409 vem primeiro, o 400 usa o `error` do servidor ("CPF inválido") e o 400 sem corpo cai em "Confira os dados do hóspede." `GuestFormPages.tsx` mostra `ApiError.message` no `role="alert"`.
- **Swagger:** o 400 foi documentado no POST e no PUT, e o `openapi.json` e o `schema.d.ts` regenerados batem com o `swagger.js`. Nenhuma rota nova.
- **LGPD:** nenhuma mensagem de erro ecoa o CPF, e não há `console.*` novo. O payload do outbox continua só com o nome (`outbox.test.js`).
- **ESM:** nenhum `require()`. O schema e os Models não foram tocados, como o parecer pede.

## Não foi possível verificar
- **Tela real no navegador:** não rodei o `pnpm e2e` nem abri o PMS. O achado repassado do `GuestForm` foi confirmado lendo o código: `values.cpf || undefined` some no `JSON.stringify`. Não foi visto em tela.
- **Suíte completa do core:** rodei só os 5 arquivos ligados a hóspede, reserva pública e B2B. A suíte inteira (cerca de 1351 testes, segundo quem pediu) não foi rodada de novo nesta auditoria.
- **Repasse 🟡 SUSPEITA do `UpdateCorporateClientController`:** o efeito de mandar um CPF mascarado para o `VARCHAR(11)` não foi executado.
- **Uso do índice `idx_guests_tenant_cpf_digits`** pela busca nova: não rodei `EXPLAIN`. A expressão é a mesma do `digitsOf`, já usada pela reserva pública.

---

## Tratamento (Gabriel com Claude, 22/11)

| # | Achado | O que foi feito |
|---|---|---|
| 🟡 | Legado sem dígito ("n/a") não se apagava | `cpfChanged`: vazio muda sempre que há algo gravado. Teste com `''` e `null` |
| 🟢1 | Tipo errado ou texto sem dígito ignorado em silêncio no PUT | Sem dígito, compara pelo próprio valor: diferente do gravado vai para a validação e dá 400 (`'abc'`, `'   '`, número, `{}`, `[]`, `false`). O legado "n/a" reenviado igual continua passando, para o telefone dele ainda se trocar (teste próprio) |
| 🟢2 | Exemplo do schema `Guest` com CPF mascarado e inválido | Exemplo trocado por `52998224725`, cliente regerado |
| 🟢3 | Reenvio do legado mascarado não normaliza | Escrito na descrição do 400 do PUT; a normalização fica com a migração do 5º semestre (parecer 🟢4) |
| 🟢4 | `findGuestByCpfDigits` repete o `where` da reserva pública | Sem mudança no MVP: a reserva pública usa transação e ordem próprias, e o CA-11.i deixa esse fluxo de fora |
| 🟢5 | Testes que faltavam | Legado sem dígito (apagar e reenviar), tipo errado no PUT, PUT entre hotéis (404). Hóspede excluído já estava coberto pela sonda e pelo `paranoid-unique-recreate` |
| Repasses | `GuestForm` não apaga campo (Sirlande); B2B pelo CPF cru (Weslley) | Mantidos nos repasses, fora do congelamento |

Suíte do core depois do tratamento: 68 arquivos, 1360 testes verdes e 21 ignorados.
