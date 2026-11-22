# QA Red Team — qa-22nov-login-comanda (🟡-2, 🟡-3 e 🟡-4 do qa-explorador de 22/11)
**Branch:** fix/qa-22nov-login-comanda · **Dev:** Sirlande · **Base:** develop@0b9a750 · **Data:** 22/11/2026
**Commits auditados:** `b1df5fc` RED login por status · `9669e92` fix(auth) · `e3a40a6` RED quantidade · `ed24c10` fix(comanda) quantidade · `263b50b` RED Nome na comanda · `60c76c8` fix(comanda) Nome na comanda
**Arquivos auditados:** 7 (`auth/loginApi.ts`, `auth/loginApi.test.ts`, `accounts/quantityField.ts`, `accounts/quantityField.test.ts`, `accounts/components/ItemList.tsx`, `accounts/components/OpenAccountForm.tsx`, `accounts/components/OpenAccountFormTouch.test.tsx`). Para confirmar os cenários também li `auth/loginFailure.ts` (+ teste), `auth/LoginPage.tsx`, `lib/api.ts`, `accounts/queueCore.ts` (`parseQuantity`, `setQuantity`, `MAX_QUANTITY`), `packages/ui/src/Input.tsx`, `components/ItemListQuantity.test.tsx`, `services/core-service/app/Controllers/AuthApi/LoginController.js`, `docker/nginx/default.conf` e `infra/k8s/nginx.yaml`.
**Achados no escopo:** 6 (🔴 0 · 🟡 3 · 🟢 3) · **Repassados:** 0

## Veredito
**APROVADO COM RESSALVAS**

As três correções fazem o que prometem nos casos medidos no navegador. O 409 continua pedindo o subdomínio, e a ligação com a tela (`loginFailure` → `LoginPage`) não mudou. Os 38 testes de `src/features/auth`, `quantityField.test.ts` e `OpenAccountFormTouch.test.tsx` passam nesta branch.

Ficam três ressalvas 🟡:
- **Zero:** o campo continua mostrando um número que a fila não conta. O único sinal é a cor, sem nenhum texto, e no blur o item sai com a quantidade anterior.
- **Status desconhecido:** o login ainda chama de "Credenciais inválidas." qualquer status que não esteja na lista (404, 403, 408...). É o mesmo diagnóstico errado que o 🟡-2 queria eliminar.
- **Testes:** nenhum teste exercita a ligação das funções novas. Se o corpo antigo de `login()` ou o `onChange` antigo voltarem, a suíte continua verde.

Nenhum 🔴. Nada vaza, e nada passa a cobrar a mais em silêncio: com o campo e o rodapé iguais, o valor errado fica à vista.

## Achados no escopo

### 🟡 [Entrada / RNF-025] O "0" deixa o campo diferente da fila, avisado só pela cor, e o blur lança a quantidade anterior
**Onde:** `frontend/apps/pms/src/features/accounts/components/ItemList.tsx:82` (`aria-invalid`), `:108` (`onChange(n ?? quantity)`), `:95` (blur volta a `String(quantity)`). Regra em `quantityField.ts:46-49`.
**Cenário:**
1. O garçom lança uma Água (fila 1), toca no campo e digita `0`, querendo tirar a água.
2. O campo mostra "0", e o rodapé continua em 1 × R$ 5,00: `parseQuantity('0')` dá `null`, e o `onChange` manda `quantity`.
3. O único sinal é a borda e o anel `status-maintenance` do `Input` (`Input.tsx:13`). Não há texto, nem `aria-describedby`, nem `role="alert"`. O leitor de tela anuncia só "inválido", sem o motivo.
4. O garçom aperta Enter. O campo volta a "1", a janela de 5 s corre, e a água vai para o servidor.

O comentário do commit e o de `ItemList.tsx:103` dizem que "o campo nunca mostra um número diferente do que vai para a fila". No zero (e em `00`, `000`) isso não vale. O comportamento final ("0 vira 1") é o mesmo que o 🟡-3 registrou, agora com uma borda vermelha durante a edição.

Estado comunicado só por cor reprova o checklist do red team (§7) e a RNF-025 (o próprio arquivo cita a regra em `ItemList.tsx:114`: "nunca só cor"). O qa-explorador pediu o motivo por escrito ("De 1 a 9999").
**Regra violada:** RNF-025 / WCAG 1.4.1 (uso da cor) e 3.3.1 (identificação do erro); DESIGN_PMS §5 ("fila honesta").
**Correção sugerida:** a menor que resolve é uma mensagem curta ligada ao campo, por exemplo um `<span id="qty-<id>-err" role="alert">` com o texto "0 não lança. Para tirar, use Desfazer.", mais `aria-describedby` apontando para ele quando `quantityTextInvalid(text)` for verdadeiro. A alternativa é tratar o zero como "Desfazer a linha", mas essa é uma decisão de produto e fica para o Gabriel.

### 🟡 [Erro com saída] O login ainda diz "Credenciais inválidas." para qualquer status fora da lista (fail-open)
**Onde:** `frontend/apps/pms/src/features/auth/loginApi.ts:35`
**Cenário:** `loginErrorForStatus` conhece 409, 429 e ≥500. Todo o resto cai em `'Credenciais inválidas.'`. Exemplos:
- Build de produção sem `VITE_API_URL`: o `lib/api.ts:5-6` avisa que o cliente "sobe apontando para `/api`, que não existe". O nginx responde **404**, e a recepção lê que a senha está errada.
- Um **403** de WAF ou proxy, um **408** ou **413** do nginx: todos viram "Credenciais inválidas.".

O backend só emite 400 e 401 para credencial (`LoginController.js:14,22,25,33,47`). A lista ficou com o padrão de blocklist que o CLAUDE.md §7 proíbe: o estado desconhecido cai no diagnóstico mais enganoso, justamente o que este fix quer eliminar.
**Regra violada:** CLAUDE.md §7 (allowlist, fail-safe); critério do time "erro com saída".
**Correção sugerida:** listar os casos conhecidos: `400`/`401` → "Credenciais inválidas."; 409, 429 e 5xx como estão; qualquer outro → "Não foi possível entrar. Tente novamente." (a mesma frase de `loginFailure.ts:10`). Acrescentar um caso de 404 em `loginApi.test.ts`.

### 🟡 [Testes / falso verde] Nenhum teste exercita a ligação das funções novas: reverter o `login()` ou o `onChange` mantém a suíte verde
**Onde:** `frontend/apps/pms/src/features/auth/loginApi.test.ts:2` (importa só `loginErrorForStatus`); `accounts/quantityField.test.ts:45-74` (só funções puras); `components/ItemListQuantity.test.tsx` (não confere `maxLength` nem `aria-invalid`).
**Cenário:**
- **Mutação A:** devolver `loginApi.ts:44` ao corpo antigo (`if (response.status === 409) …; if (error || !response.ok) throw new LoginError('Credenciais inválidas.')`) e manter `loginErrorForStatus` exportada. Os 4 testes de `loginApi.test.ts` passam, e o 429 volta a dizer "Credenciais inválidas.".
- **Mutação B:** em `ItemList.tsx:104-106`, voltar a `setText(e.target.value)` / `parseQuantity(e.target.value)`. Nenhum teste quebra, e "10000" volta a aparecer com a fila em 1000.

Hoje só a verificação manual no navegador protege as correções. Ela não roda no CI.
**Regra violada:** checklist §8 (teste que passaria com a regra quebrada).
**Correção sugerida:**
- **(a)** Em `loginApi.test.ts`, `vi.mock('../../lib/api.js', () => ({ api: { POST: vi.fn() } }))`. O mock devolve `{ error: {}, response: new Response(null, { status: 429 }) }`, e o teste confere a mensagem lançada por `login()`. Funciona em environment node, sem DOM.
- **(b)** Em `ItemListQuantity.test.tsx`, conferir `maxlength="4"` no `<input>` renderizado.
- O `onChange` não é testável sem DOM. Vale registrar essa limitação no relatório de sessão, ou extrair um `nextQuantity(raw, quantity) → { text, send }` puro e testar a função.

### 🟢 [Entrada / colar] O `maxLength` corta o texto cru antes da limpeza: colar algo com separador ou prefixo dá um número menor que o colado
**Onde:** `ItemList.tsx:80` (`maxLength={4}`) combinado com `quantityField.ts:42` (`replace(/\D/g,'').slice(0,4)`)
**Cenário:** o navegador aplica o `maxLength` ao texto colado **antes** do `onChange`:
- "R$ 10" vira "R$ 1", depois `1`;
- "2.500" vira "2.50", depois `250`;
- "00010" vira "0001", depois `1`. Com o `maxLength` fora, o `slice` também perderia o 10, porque os zeros à esquerda ocupam os 4 dígitos.

O campo e a fila ficam iguais, então a fila continua honesta. Mas o número difere do que foi colado. Colar é raro na comanda, por isso o 🟢.
**Correção sugerida:** remover o `maxLength` (o `slice` já limita a 4) e tirar os zeros à esquerda antes de cortar: `raw.replace(/\D/g,'').replace(/^0+(?=\d)/,'').slice(0, 4)`. Isso também faz "007" aparecer como "7".

### 🟢 [DRY] O teto de 4 dígitos está em três lugares, separado do `MAX_QUANTITY`
**Onde:** `quantityField.ts:35` (`MAX_QUANTITY_DIGITS = 4`), `ItemList.tsx:80` (`maxLength={4}` literal), `queueCore.ts:107` (`MAX_QUANTITY = 9999`)
**Cenário:** suponha que o teto mude para 999 (um bar que limita a dose). O `parseQuantity` passa a recusar 1000-9999, mas o campo ainda aceita 4 dígitos, e o `quantityTextInvalid` só marca zeros. "5000" fica no campo sem marca, com a fila na quantidade anterior: o 🟡-3 volta sem aviso.
**Correção sugerida:** `const MAX_QUANTITY_DIGITS = String(MAX_QUANTITY).length` (importado de `queueCore.js`), a mesma constante no `maxLength` (ou o `maxLength` removido, como no achado acima), e `quantityTextInvalid` como `text !== '' && parseQuantity(text) === null`. A regra fica correta para qualquer teto.

### 🟢 [Texto] As mensagens novas são claras, mas três detalhes de redação podem enganar
**Onde:** `loginApi.ts:33-34`; `loginFailure.ts:10` (fora do diff, mesma trilha)
**Cenário:**
- **429:** "Muitas tentativas de entrar neste minuto" vale para o IP inteiro do hotel. Quem não tentou nenhuma vez lê que "tentou demais". Algo como "Muitas tentativas de entrar desta rede neste minuto…" explica por que o colega também caiu. O "aguarde um minuto" é seguro: com `5r/m burst=3`, uma vaga abre a cada 12 s.
- **500:** "O sistema não respondeu" é inexato no 500, porque o sistema respondeu com erro. Serve, mas "O sistema está com problema. Tente de novo em instantes." cobre 500 e 502/504.
- **Rede fora:** sem rede, a tela diz "Não foi possível entrar. Tente novamente." (`loginFailure.ts:10`), uma frase mais vaga que a do 5xx. Fica fora do diff. Se um dia for mexida, "Sem conexão com o sistema. Confira a internet." deixa as três saídas coerentes.

Não é regressão: `loginFailure` repassa a mensagem do `LoginError` como está (`loginFailure.ts:9`), então as mensagens novas chegam à tela sem mudança.

## Repassados a outro dev
Nenhum. O 401 para subdomínio inexistente (`LoginController.js:22`) também deixa um subdomínio digitado errado aparecer como "Credenciais inválidas", mas é anterior a esta branch e é uma decisão deliberada contra enumeração de tenants. Não foi tratado como achado.

## O que foi verificado e está correto
- **409 sem regressão.** Antes o 409 era testado antes do `error`. Agora cai em `!response.ok` → `loginErrorForStatus(409)` → `requiresSubdomain: true` (`loginApi.ts:32,44`). `LoginPage.tsx:55-57` continua ligando o campo de subdomínio.
- **Sem rede:** o `fetch` lança, o erro não é `LoginError`, e a tela mostra a frase genérica de `loginFailure`. Comportamento inalterado.
- **Corpo do 429:** o nginx devolve HTML. A decisão usa só `response.status`, então o corpo não importa. O limite (`5r/m`, `burst=3`, `limit_req_status 429`) está igual em `docker/nginx/default.conf:45-46` e `infra/k8s/nginx.yaml:53-54`.
- **Onde ficou a lógica:** a sugestão era pôr a separação por status em `loginFailure`. Ficou em `loginApi`, que é quem conhece o status. `loginFailure` continua sendo a camada da tela. Não há duplicação.
- **Digitação:** `cleanQuantityText` e `parseQuantity` são coerentes. Com 1 a 4 dígitos, nunca há texto não-zero que `parseQuantity` recuse, então o campo e a fila só divergem em vazio (decisão anterior, meio da digitação) e em zero (achado 🟡 acima).
- **Teclados:** o iOS com `inputMode="numeric"` não tem vírgula. No Android, a vírgula some a cada tecla e o resultado é igual ao de recusar a tecla ("2", ",", "5" → "25"). O campo e o rodapé mostram o mesmo número.
- **`aria-invalid`:** `quantityTextInvalid(text) || undefined` não emite `aria-invalid="false"` à toa. O `Input` do `@hotel/ui` já estiliza `aria-[invalid=true]`.
- **Nome na comanda:** o `cn` do `Input` funde `min-h-touch` sem conflito com `py-2`. O teste confere a classe no `#account-label`, não em outro input. O campo de busca da mesma tela segue o mesmo padrão.
- **Fora do escopo:** sem `require`, sem `console.*` e sem dado pessoal novo em log ou resposta. Nenhum endpoint novo, então o Swagger não muda.
- **Testes:** `npx vitest run src/features/auth src/features/accounts/quantityField.test.ts src/features/accounts/components/OpenAccountFormTouch.test.tsx` → 7 arquivos, 38 testes, todos verdes.

## Não foi possível verificar
- **Composição por IME** (teclado japonês, coreano ou chinês, ou dígitos de largura cheia "１２"). O `\D` sem a flag `u` descarta dígitos de largura cheia, então o campo ficaria vazio. Também não sei se limpar o texto no meio de uma composição quebra o IME. Exige um aparelho real, e o caso é improvável num hotel brasileiro.
- **Cursor após limpeza.** Com uma tecla não-dígito no meio do texto, o input controlado pode jogar o cursor para o fim. Sem DOM nos testes, isso não foi exercitado.
- **Qual borda aparece com o campo focado:** se é `focus:border-brand` ou `aria-[invalid=true]:border-status-maintenance` depende da ordem das variantes no CSS gerado pelo Tailwind. Não abri o CSS compilado. Seja qual for, o aviso continua sendo só de cor.
- **iOS Safari em aparelho real** (rAF + `setSelectionRange` junto com o `maxLength`): a verificação foi no Chromium a 375 px.

---

## Desfecho (22/11, Sirlande com o Claude Code)

| Achado | Tratamento |
|---|---|
| 🟡-1 Zero avisado só pela cor | **Corrigido.** "Mín. 1" visível embaixo do campo, mais "Quantidade mínima 1. Para tirar o item, use Desfazer." para leitor de tela, ligados por `aria-describedby`. Tratar o zero como desfazer fica como decisão de produto, com o Gabriel. |
| 🟡-2 Login fail-open | **Corrigido.** Lista fechada: só 400 e 401 dizem "Credenciais inválidas."; 409, 429 e 5xx têm a própria mensagem; qualquer outro status (404, 403, 408, 413) mostra "Não foi possível entrar. Tente novamente.". |
| 🟡-3 Testes sem a ligação | **Corrigido.** `login()` testado com a API mockada (429, 409, 502 e sucesso). O `onChange` usa a função pura `nextQuantity`, testada. |
| 🟢-4 Colar dava número menor | **Corrigido.** Sem `maxLength`: limpa, tira os zeros à esquerda e só depois corta. "R$ 10" dá 10; "00010" dá 10. |
| 🟢-5 Teto em três lugares | **Corrigido.** Os dígitos saem de `MAX_QUANTITY`, e `quantityTextInvalid` usa o `parseQuantity`. |
| 🟢-6 Texto das mensagens | **Corrigido.** "a partir desta rede" no 429; "O sistema está com problema agora." no 5xx. A frase sem rede do `loginFailure.ts`, fora do diff, ficou como está. |

Portões: pms 59 arquivos / 567 testes, typecheck limpo. No navegador, contra o compose `gesway_teste`, garçom em 375 px com Água a R$ 5,00:
- "0" fica marcado, com o aviso, e o total continua R$ 125,00;
- "10000" vira 1000 (R$ 5.000,00), e "2,5" vira 25;
- colar "R$ 10" dá 10 (R$ 50,00);
- os dois campos têm 48 px;
- o login com a senha certa entra, e no 429 mostra a mensagem nova.
