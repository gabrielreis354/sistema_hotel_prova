# QA Red Team — T-09.2 CPF formatado e linha clicável em Hóspedes
**Branch:** fix/t092-cpf-formatado · **Dev:** agente do Gabriel · **Base:** origin/develop@2ec2446 · **Data:** 15/11/2026
**Arquivos auditados:** 10 do diff, mais o contexto: `guestFilter.ts`, `guestFilter.test.ts`, `reservationLogic.ts`, `ReservationReceiptPage.tsx`, `GuestForm.tsx`, `tailwind-preset.js`, `CreateGuestController.js`, `GuestModel.js`
**Achados no escopo:** 6 (🔴 0 · 🟡 2 · 🟢 4) · **Repassados:** 1

## Veredito
**APROVADO COM RESSALVAS**

A branch não tem nenhum 🔴. O CA-09.h exige que nenhum 🔴 ou 🟡 fique aberto. Por isso, os dois 🟡
abaixo precisam ser corrigidos antes de a T-09.2 ser dada como fechada.

Testes: `pnpm --filter "./apps/*" --filter "./packages/*" test` passou com domain 49/49 e pms 317/317.
`pnpm -r typecheck` passou nos 4 pacotes. Os testes que já existiam não foram alterados, o que cumpre o CA-09.g.

## Achados no escopo

### 🟡-1 [UX / regressão] A busca da lista não encontra o CPF que a própria lista mostra
**Onde:** `frontend/apps/pms/src/features/guests/GuestRow.tsx:35` (exibe formatado) x `frontend/apps/pms/src/features/guests/guestFilter.ts:7` (compara com o valor cru)
**Cenário:**
1. Use um hóspede gravado como `30000000014`, que é o formato do seed e do que o balcão digita sem máscara.
2. A lista agora mostra `300.000.000-14`.
3. O recepcionista digita o que vê, `300.000.000`, no campo "Buscar por nome, CPF, e-mail ou telefone".
4. `guestMatches` faz `'30000000014'.includes('300.000.000')`, que dá `false`, e a tela mostra "Nenhum hóspede corresponde à busca".

Antes da branch, a tela e a busca usavam o mesmo texto cru, então a busca encontrava o hóspede. A divergência nasceu quando o formato de exibição mudou e o filtro continuou igual.
O caso inverso também falha: gravado `300.000.000-14` e busca por `30000000014`. Esse problema já existia, mas agora fica mais visível, porque os dois hóspedes aparecem iguais na tela.

A busca da nova reserva (`GuestPicker`) **não** tem esse problema. Ela vai ao servidor, e `ListGuestController.js:62` compara só os dígitos.
**Regra violada:** CA-09.c (o mesmo CPF em todas as telas, e a busca faz parte da tela). Princípio de que o que se vê é o que se busca.
**Correção sugerida:** em `guestMatches`, quando o termo tiver dígitos, comparar também `digits(guest.cpf).includes(digits(q))`. Basta um teste novo em `guestFilter.test.ts` com o CPF cru e o termo formatado, e os testes atuais continuam passando.

### 🟡-2 [UX] Selecionar o texto da linha para copiar faz a tela navegar
**Onde:** `frontend/apps/pms/src/features/guests/GuestRow.tsx:23-26`
**Cenário:** no desktop, o recepcionista arrasta o mouse sobre `300.000.000-14` (ou sobre o e-mail ou o telefone) para copiar e colar em outro sistema. O `mousedown` e o `mouseup` acontecem na mesma `td`, então o navegador dispara `click` na `tr`. `handleRowClick` não encontra `a` no caminho e chama `onOpen('/hospedes/g1')`. A página troca antes de o usuário conseguir dar Ctrl+C, e a seleção se perde.
O mesmo acontece com duplo clique para selecionar uma palavra: o primeiro `click` já navega.
**Regra violada:** DESIGN_PMS.md ("um PMS vive em tabela densa", com uso intenso de teclado e mouse no balcão). Ação de navegação disparada por um gesto que não era de navegação.
**Correção sugerida:** no início de `handleRowClick`, colocar `if (window.getSelection()?.toString()) return;`. O teste com dublê pode simular isso com `getSelection` stubado.

### 🟢-3 [Domínio] `formatCpf` transforma qualquer sequência de 11 dígitos em um "CPF" com cara de válido
**Onde:** `frontend/packages/domain/src/documents.ts:23-24`
**Cenário:**
- O CPF não tem validação no formulário (`GuestForm.tsx:9` é `z.string().trim().optional()`). O balcão grava por engano o celular `11 98765-4321` no campo CPF.
- Antes, a ficha mostrava `11 98765-4321`, e o erro saltava aos olhos.
- Agora mostra `119.876.543-21`, que parece um CPF bem formado e esconde o dado errado justamente na hora de conferir o documento no balcão.
- O mesmo vale para `300-000-000-14`, `3.0.0.0.0.0.0.0.0.1.4` e `-30000000014`: todos viram `300.000.000-14`, porque `CPF_CHARS` aceita ponto, hífen e espaço em qualquer posição.

Nenhuma entrada não vazia **desaparece**. Só nulo, vazio ou espaços viram `null`, e isso vira `'—'`. Não há perda de dado na tela.
**Regra violada:** nenhuma. A SPEC-09 §5 manda formatar "com 11 dígitos" e o código faz exatamente isso. Fica registrado como risco da própria spec.
**Correção sugerida:** é uma decisão do Gabriel. A opção seria formatar só quando o dígito verificador conferir e mostrar o resto como veio, o que continua não alterando o que é gravado. Outra opção mais fraca: exigir a pontuação nas posições do CPF (`/^\d{3}[.\s]?\d{3}[.\s]?\d{3}[-\s]?\d{2}$/`, igual ao `CPF_MASK` de `reservationLogic.ts:462`).

### 🟢-4 [UX] Ctrl ou Cmd + clique fora do nome abre na mesma aba
**Onde:** `frontend/apps/pms/src/features/guests/GuestRow.tsx:23-26`
**Cenário:**
- Ctrl+clique na célula do CPF chama `navigate()` na mesma aba, mas o usuário esperava uma aba nova. No nome, o `Link` trata isso corretamente.
- O clique do meio na célula não faz nada, porque `onClick` não dispara para o botão do meio. Isso é aceitável.
- Não há navegação dupla: o clique no `Link` sobe até a `tr`, mas `closest('a')` corta.
**Correção sugerida:** `if (event.ctrlKey || event.metaKey || event.shiftKey) return;`. É melhor não fazer nada do que contrariar o gesto.

### 🟢-5 [Testes] `GuestRow.test.ts` prova menos do que os títulos dos testes prometem
**Onde:** `frontend/apps/pms/src/features/guests/GuestRow.test.ts:23, 37-39, 13`
**Cenário:**
- **`:23` "clicar na célula do CPF navega":** o dublê de alvo não tem relação com a célula do CPF. O teste prova apenas que um alvo fora de `a` navega. Se a `td` do CPF ganhasse um `stopPropagation`, ou se o handler mudasse de lugar, o teste continuaria verde.
- **`:37-39` "altura mínima de 48 px":** o teste só confere que a string `h-12` está no `className`. Ele não prova os 48 px. O CA-09.f pede "medição no navegador", e não há evidência dessa medição na branch, nem captura, nem nota no relatório.
- **`:13`:** o componente é chamado como função. Funciona hoje, porque não há hooks, mas o primeiro `useX` adicionado ao `GuestRow` quebra o teste com um erro que não tem relação com a regra testada. O comentário da linha 5 reconhece isso.

Sobre o `h-12` em si: o preset (`packages/config/tailwind-preset.js:43`) não sobrescreve `12`, então ele vale 3rem = 48 px. Em `display: table-row`, `height` funciona como altura **mínima** (CSS 2.1 §17.5.3), e `min-height` não teria efeito. A escolha está correta. Por consistência, poderia usar o token `h-touch`, que existe para isso.
**Correção sugerida:** renomear os testes para o que eles realmente provam e anexar a medição em 390 px, que é o que o CA-09.f pede.

### 🟢-6 [DRY] `formatCpf` foi para `@hotel/domain`, mas o `maskCpf` irmão ficou no app
**Onde:** `frontend/packages/domain/src/documents.ts:19` x `frontend/apps/pms/src/features/reservations/reservationLogic.ts:447`
**Cenário:** as duas funções extraem os dígitos e testam o comprimento 11. O critério de "o que é CPF" já diverge entre elas:
- `formatCpf('RG 30000000014')` devolve o texto cru;
- `maskCpf('RG 30000000014')` devolve `***.000.000-**`, porque só olha os dígitos.

O mesmo dado é tratado como CPF numa tela e como não-CPF em outra.
**Correção sugerida:** mover `maskCpf` para `documents.ts`, usando o mesmo critério de reconhecimento, e continuar chamando a função só no comprovante. Pode ficar para depois, sem urgência.

## Repassados a outro dev

| Sev. | Achado | Onde | Dono | Repasse |
|------|--------|------|------|---------|
| 🟡 | A checagem de CPF duplicado compara o texto exato. `30000000014` e `300.000.000-14` passam como hóspedes diferentes, e agora aparecem iguais na lista | `services/core-service/app/Controllers/GuestApi/CreateGuestController.js:13` e índice `GuestModel.js:50-53` | DONO INDEFINIDO (a SPEC-09 §5 diz "normalizar o CPF gravado é outro trabalho, sem dono") | `docs/qa/repasses/para_dono-indefinido_15112026.md` |

## O que foi verificado e está correto
- **CPF em todas as telas** (grep de `cpf` em `frontend/apps` e `frontend/packages`): a lista, o detalhe do hóspede, o bloco do hóspede na reserva e o `GuestPicker` (selecionado e resultados) usam `formatCpf`. O comprovante continua com `maskCpf` (`ReservationReceiptPage.tsx:41`). `admin` e `booking` não exibem CPF. `GuestForm` e `GuestFormPages` não foram tocados.
- **O que é gravado não mudou:** nenhum arquivo de formulário ou de API está no diff.
- **Valores vazios:** `?? '—'` funciona porque `formatCpf` nunca devolve `''`. `GuestPicker` usa `filter(Boolean)`, que descarta o `null`. `Info` já trata `null` como `'—'`.
- **Navegação dupla no clique do nome:** não acontece, porque `closest('a')` corta.
- **Teclado e leitor de tela:** a `tr` não recebe foco e não tem `role`. O `Link` real continua como único alvo de tab por linha, como pede a SPEC-09. O `cursor-pointer` está presente. Não há lint jsx-a11y no repositório para apontar `onClick` sem teclado.
- **Navegação por id:** `onOpen={navigate}` recebe só o caminho `/hospedes/<uuid>`, sem PII na URL.
- **LGPD:** o CPF completo na lista é uma decisão registrada na SPEC-09 §3 em 15/11. A pendência de mascarar continua registrada (🟢-1 do red team de 02/11). A branch não expõe nenhum dado novo nem gera log com PII.
- **ESM:** sem `require`. O export pelo índice do pacote está OK. Testes e typecheck passam.

## Não foi possível verificar
- **Medição real em 390 px (CA-09.f):** não havia navegador disponível nesta auditoria. A conclusão sobre os 48 px vem da especificação CSS e do preset, e não de uma medição.
- **Comportamento de toque no Safari iOS:** o `click` em uma `tr` sem `cursor: pointer` historicamente não disparava no iOS. Aqui há `cursor-pointer`, o que deve resolver, mas não foi testado em aparelho.

## Desfecho (15/11, Gabriel com Claude)
- **🟡-1 corrigido:** `guestFilter.ts` também casa CPF e telefone só pelos dígitos quando o termo é numérico. A busca `300.000.000` acha o CPF gravado `30000000014`, e um termo com letras não cai nessa regra. Teste em `guestFilter.test.ts`.
- **🟡-2 corrigido:** `GuestRow` não navega quando há texto selecionado. Teste em `GuestRow.test.ts`.
- **🟢-3 a 🟢-6:** registrados e sem ação nesta branch. O 🟢-3 (formatar só com dígito verificador válido) fica como decisão do Gabriel.
- Repasse da duplicidade de CPF: `docs/qa/repasses/para_dono-indefinido_15112026.md`.
- Depois da correção: domain 49/49, pms 319/319, typecheck verde.
