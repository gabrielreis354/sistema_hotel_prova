# QA Red Team — T-10.1 login novo (SPEC-10)
**Branch:** feature/t101-login-visual · **Dev:** Sirlande · **Base:** develop@cef3e50 · **Data:** 16/11/2026
**Arquivos auditados:** 9 (diff `git diff origin/develop...HEAD`)
**Achados no escopo:** 7 (🔴 0 · 🟡 4 · 🟢 3) · **Repassados:** 1

## Veredito
**APROVADO COM RESSALVAS.**

Nenhum 🔴 no escopo: a tela não toca em dado, tenant nem dinheiro, e a lógica de login (zod,
`LoginError`, `requiresSubdomain`, `homeForRole`) ficou igual à da develop. O CA-10.h da SPEC-10, porém,
pede **nenhum 🔴 nem 🟡 aberto**. Os quatro 🟡 abaixo precisam ser fechados (ou aceitos por escrito)
antes de a T-10.1 ser dada como concluída.

## Achados no escopo

### 🟡 [Acessibilidade / HTML] Botão do olho dentro do `<label>` da senha
**Onde:** `frontend/apps/pms/src/features/auth/LoginPage.tsx:117-135` + `components/PasswordInput.tsx:19-30`; o `<label>` vem de `frontend/packages/ui/src/Field.tsx:14`
**Cenário:** `Field` envolve `children` num `<label for="login-senha">`. O `PasswordInput` põe um
`<button aria-label="Mostrar senha">` dentro dele. Pelo HTML, o conteúdo de um `<label>` não pode ter
outro elemento rotulável (o `<button>` é um), então a marcação fica inválida. Pela especificação de
nome acessível (accname 1.2, passo 2F), o nome do campo é calculado a partir de **todo** o conteúdo do label,
incluindo o `aria-label` do botão. O leitor de tela deve anunciar o campo como "Senha Mostrar senha",
e "Senha Ocultar senha" depois do toque.
**Status:** CONFIRMADO lendo o código (a estrutura está lá). **SUSPEITA** quanto ao texto exato
anunciado: tentei abrir o Chromium do Playwright para ler a árvore acessível, mas faltou `libnspr4.so`
neste ambiente. Para confirmar: `page.getByRole('textbox', { name: 'Senha', exact: true })` no
Playwright, ou a árvore de acessibilidade do DevTools no campo da senha.
**Regra violada:** HTML (modelo de conteúdo do `label`); WCAG 4.1.2 / 2.5.3 (o nome tem que bater com o rótulo visível).
**Correção sugerida:** tirar o olho de dentro do `<label>`. Duas saídas: o `Field` ganha uma prop
`trailing`/`after` que renderiza fora do label, ou o login usa `Field` sem `children` e põe o `PasswordInput`
como irmão do label. A segunda não mexe no `@hotel/ui`.

### 🟡 [Acessibilidade / CA-10.d] Anel de foco do olho com contraste de 1,4:1
**Onde:** `frontend/apps/pms/src/features/auth/components/PasswordInput.tsx:20-22` (`variant="ghost"`), `frontend/apps/pms/src/features/auth/login.css:223-237` (sem regra de foco)
**Cenário:** o olho é `Button variant="ghost"`, que traz `focus-visible:ring-gray-300 ring-offset-2`
(`packages/ui/src/Button.tsx:17`). O `login.css` muda cor e hover do `.login-toggle`, mas não o anel.
Quem navega por Tab, saindo do campo da senha, recebe um anel `#d1d5db` sobre o offset branco ou o vidro:
**1,47:1** contra o branco e **1,43:1** contra o vidro sobre o fundo neutro. O campo e o botão Entrar têm
anel no acento (5,3:1). O CA-10.d pede foco ≥ 3:1.
**Status:** CONFIRMADO, lido no código e calculado com as cores dos tokens.
**Regra violada:** SPEC-10 CA-10.d; WCAG 1.4.11 / 2.4.7.
**Correção sugerida:** `.login-page .login-toggle:focus-visible { --tw-ring-color: rgb(var(--login-accent)); }`, o mesmo padrão já usado em `.login-submit:focus-visible` (`login.css:252`).

### 🟡 [Acessibilidade / CA-10.d] Mensagem de erro do campo fica abaixo de 4,5:1 sobre o vidro
**Onde:** `frontend/apps/pms/src/features/auth/login.css:134-139` (vidro a 55%) combinado com o `text-status-maintenance` do erro (`packages/ui/src/Field.tsx:18`)
**Cenário:** o usuário envia o formulário vazio e aparecem "E-mail inválido" e "Informe a senha" (14 px, peso normal)
em `#dc2626`. No login antigo o fundo era branco sólido, com 4,83:1. Agora o fundo é 55% de branco
sobre as manchas de `.login-backdrop`. Calculado com os tokens: sobre a mancha de luz a 18% (`45% 42%`,
debaixo da caixa) dá **4,30:1**; sobre a areia a 26% (`58% 56%`), **4,46:1**; sobre o fundo neutro, 4,69:1.
O comentário de contraste em `tokens.css:22-26` só mediu "sobre o vidro claro (≈ branco)" e não incluiu o
texto de erro. O token `--login-danger` existe, mas só é usado na borda.
**Status:** CONFIRMADO por cálculo, com a composição alfa dos tokens. Não medi o pixel exato debaixo de
cada mensagem: o valor depende de onde a mancha cai em cada viewport.
**Regra violada:** SPEC-10 CA-10.d (texto ≥ 4,5:1); WCAG 1.4.3.
**Correção sugerida:** no escopo do login, dar ao erro uma cor mais escura, por exemplo
`.login-page [role='alert']` com um `--login-danger-text` perto de `185 28 28` (`#b91c1c`, cerca de 5,6:1 sobre o
pior vidro). Outra saída é subir a opacidade do vidro. Depois, medir no navegador.

### 🟡 [Testes] Os cinco testes de comportamento que a SPEC exige não existem, e o olho pode quebrar sem nenhum teste falhar
**Onde:** `frontend/apps/pms/src/features/auth/LoginPage.test.tsx:46-67`; SPEC-10 §5 T-10.1 ("A tarefa cria: erro de validação; erro do servidor; aparecimento do subdomínio; mostrar e ocultar a senha; redirecionamento depois do login") e CA-10.e
**Cenário:** os testes são `renderToString` do estado inicial. Os três mutantes abaixo deixam os 13 testes verdes:
1. `PasswordInput.tsx:19` com `type={toggle.type}` trocado por `type="password"`: o olho para de funcionar, mas o estado inicial já é `password`.
2. `PasswordInput.tsx:27` com `setShown((v) => !v)` trocado por `setShown((v) => v)`: o olho não faz nada.
3. `LoginPage.tsx:56` sem `if (err.requiresSubdomain) setNeedsSubdomain(true)`, ou o bloco `needsSubdomain && …` apagado inteiro: o hóspede corporativo com e-mail em dois hotéis não consegue mais entrar. O único teste do subdomínio (`:54-56`) é **negativo** ("não aparece") e continua verde quando o campo deixa de existir. É um falso verde justamente na garantia que a SPEC lista como "não pode se perder".

A conferência no navegador foi feita por script, mas o script não está no diff, então não protege contra regressão.
A afirmação "10 de 10 mutantes mortos" não incluía esses mutantes.
**Status:** CONFIRMADO lendo o código. Os mutantes não foram executados (a auditoria não altera arquivos),
mas a falha é direta: os três afetam só o estado depois de uma interação, e nenhum teste interage.
**Regra violada:** SPEC-10 §5 T-10.1 e CA-10.e; checklist de testes do red team ("teste que passaria com a regra quebrada").
**Correção sugerida:** o pms não tem DOM, então há dois caminhos:
(a) um spec do Playwright em `pnpm e2e` com `page.route('**/auth/login')` simulando a resposta 401, o caso
`requiresSubdomain` e o 200. Os cinco cenários cabem em um arquivo, e o roteiro já existe;
(b) tirar o tratamento do erro do `onSubmit` para uma função pura (`loginOutcome(err) → { message, needsSubdomain }`)
e testá-la no Vitest, junto com um teste do `PasswordInput` que renderize `shown=true` (por exemplo, com uma prop
`defaultShown`, ou testando a ligação `type ← passwordToggle`).

### 🟢 [Testes] A guarda "nenhuma cor literal" só pega hex e `rgb(` numérico
**Onde:** `frontend/apps/pms/src/features/auth/LoginPage.test.tsx:101-103`
**Cenário:** `color: white`, `background: hsl(160 84% 39%)` e `border-color: green` passam no teste.
O próprio arquivo já usa `black` na máscara (`login.css:98-100`, justificado), o que mostra que palavra-chave de cor
entra sem ser vista. Como a regra 9b do `qa_checks` não lê `.css` (o comentário em `login.css:4` diz isso), este teste é a única guarda.
**Status:** CONFIRMADO, lido.
**Correção sugerida:** acrescentar `hsla?\(` e uma lista curta de palavras-chave (`white|black|red|green|…`), com exceção explícita para a linha da máscara.

### 🟢 [CSS] `transition: none` do movimento reduzido no botão não vale
**Onde:** `frontend/apps/pms/src/features/auth/login.css:282-284`
**Cenário:** `.login-submit { transition: none }` tem especificidade (0,1,0), a mesma de `.transition-colors`
do Button. Pelo próprio comentário de `login.css:192-196`, as utilidades do Tailwind entram depois no bundle e vencem
o empate. Com isso a transição de cor do botão continua em movimento reduzido. O efeito real é mínimo: é só cor, e
`filter` não está na transição. Mas a linha não faz o que diz, e o teste de movimento reduzido (`LoginPage.test.tsx:95-99`) não a verifica.
**Status:** CONFIRMADO pela regra de cascata que o próprio arquivo documenta. Não medi no navegador.
**Correção sugerida:** `.login-page .login-submit` dentro do `@media`, ou apagar a linha.

### 🟢 [Robustez] `id` fixo nos gradientes do SVG
**Onde:** `frontend/apps/pms/src/features/auth/LoginPage.tsx:157`
**Cenário:** hoje não quebra. O `LoginPage` só monta em `/login` (`App.tsx:31`), uma vez, e os ids
`login-swoosh-top` e `login-swoosh-bottom` são diferentes entre si. Se a faixa for reaproveitada, por exemplo
na T-10.4 (casca), ou a tela montar duas vezes (Storybook, teste), `url(#login-swoosh-top)` aponta para o primeiro
gradiente do documento.
**Status:** CONFIRMADO, lido. O dano é só potencial.
**Correção sugerida:** `useId()` do React 18 na `Swoosh`.

## Repassados a outro dev

| Sev. | Achado | Onde | Dono | Repasse |
|------|--------|------|------|---------|
| 🟢 | O erro do campo (`role="alert"`) fica dentro do `<label>`, e o texto do erro entra no nome acessível do campo ("Senha Informe a senha") | `frontend/packages/ui/src/Field.tsx:14-22` | DONO INDEFINIDO (`packages/ui` não tem dono, DIVISAO §7) | `docs/qa/repasses/para_dono_indefinido_16112026.md` |

## O que foi verificado e está correto
- **`register` e `PasswordInput`:** o `ref` vindo do spread do `register` chega ao `forwardRef` e vai para o `<input>` (`PasswordInput.tsx:13,19`). `onChange`, `onBlur`, `name` e `aria-invalid` passam pelo `{...props}`. `className` e `id` são extraídos antes, então o spread não os sobrescreve. `type` sai do tipo (`Omit<InputProps,'type'>`), então o spread depois de `type` não consegue trocá-lo por TypeScript.
- **Ordem de foco:** e-mail → senha → olho → (subdomínio) → Entrar. É a ordem do DOM, sem `tabindex` positivo.
- O olho é `type="button"` (não envia o formulário), com `aria-label` de ação e `aria-pressed` de estado (`passwordToggle.ts`).
- **Erro do servidor:** `Notice tone="error"` gera `role="alert"` (`Notice.tsx:66`). A mensagem é desmontada e montada de novo a cada envio (`setServerError(null)`), então é anunciada também quando o texto se repete.
- **`Field.label` como `ReactNode`:** nenhum consumidor usa o rótulo como string. A busca por `<Field` em `apps/` e `packages/` só encontrou `label` literal ou JSX; o `Field` só renderiza `{label}` dentro de um `<span>`.
- **Especificidade dos overrides:** `.login-page .login-input:focus` (0,3,0) vence `.focus\:ring-brand:focus` (0,2,0). A regra de `aria-invalid` vem depois e vence a de foco no empate, e `[aria-invalid]:focus` tem (0,4,0). O hover do Entrar e do olho também vence o do Button.
- **Anel da luz:** `pointer-events: none` (`login.css:96`) herdado pelo rotor. A máscara só deixa aparecer a faixa de 2 px fora da caixa (`inset:-2px; padding:2px`), então não cobre nem bloqueia o conteúdo. Sem suporte à máscara, o anel fica em `display:none`, o halo continua e a caixa não muda.
- **`overflow: hidden` com o subdomínio aberto:** `.login-page` usa `min-height`, não `height`. Com o conteúdo maior que a tela, a caixa cresce e a página rola, sem cortar o cartão. O `hidden` só corta o rotor de 1000 px e as faixas.
- **Tokens `--login-*`:** sem colisão. Só o `login.css` usa o prefixo. Estão no `:root` de todo app que importa `tokens.css`, mas são variáveis não usadas fora do login: custo de bytes, sem efeito visual.
- **Contraste do texto principal sobre o vidro:** tinta 10 a 16:1, apoio 5,8 a 9,4:1, rótulo 7,4 a 12:1, placeholder ≥ 4,5:1 sobre o campo a 72%. A borda do campo fica em 3,2 a 3,9:1 sobre o fundo e as manchas.
- **Movimento:** só `transform` e `opacity` nos `@keyframes`. Rotor e halo param com `prefers-reduced-motion`.
- Logo e decoração com `aria-hidden` e `focusable="false"`. Só um `<main>` na rota (`/login` fica fora do `AppShell`).
- `pnpm vitest run src/features/auth`: 13 testes verdes (executado).

## Não foi possível verificar
- **Árvore acessível real:** o Chromium do Playwright não sobe neste ambiente (falta `libnspr4.so`), então o nome anunciado do campo da senha é dedução do accname.
- **Contraste sobre as faixas verdes no celular:** pelo cálculo da geometria (`min(46vw,600px)`, viewBox 600×400), em 390×844 as faixas ficam quase todas fora do cartão. Em telas baixas (375×667) a faixa de cima passa sob o canto superior esquerdo do cartão, onde só há padding. No pior caso teórico (vidro sobre o stop mais escuro, a 75%), a borda do campo cairia para 2,4:1 e o erro para 2,9:1, mas não encontrei texto nessa posição. Precisa de captura no navegador para descartar.
- Desempenho (60 fps, INP de 56 ms): não reexecutado. Fica o número do dev.

---

## Tratamento (16/11, Sirlande com Claude Code)

| Achado | O que foi feito | Verificação |
|---|---|---|
| 🟡1 Olho da senha dentro do `<label>` | A senha não usa mais o `Field`: o `<label for>` envolve só o texto, e o olho fica fora dele, na mesma estrutura | Árvore acessível no Chromium (CDP): `textbox: Senha`, não "Senha Mostrar senha"; teste no HTML do servidor |
| 🟡2 Anel de foco do olho em 1,4:1 | `--tw-ring-color` com o destaque do login no `:focus-visible` | Pelo teclado (Tab): anel `rgb(4 120 87)` de 4 px, cerca de 5:1 sobre o vidro |
| 🟡3 Erro do campo abaixo de 4,5:1 | Token `--login-danger-ink` (`185 28 28`) no erro do e-mail (Field) e no da senha | Cor calculada no navegador: `rgb(185, 28, 28)`, acima de 6:1 |
| 🟡4 Faltavam testes de comportamento | `loginFailure` (mensagem, subdomínio e erro de rede) virou função pura testada; `PasswordInput` ganhou `defaultShown`, testado aberto e fechado no HTML do servidor | Mutação: 7 de 7 mortos, incluindo os 2 que passavam (`type` fixo, subdomínio perdido) |
| 🟢 Guarda de cor literal | Também pega `hsl()` | — |
| 🟢 `transition: none` perdendo o empate | Escopado em `.login-page` | — |
| 🟢 Ids fixos dos gradientes | `useId()` | — |

**Aceito por escrito (plano aprovado pelo Sirlande em 16/11):** o pms não tem DOM nos testes, e o
plano previa conferir no navegador o que depende de clique. Dois pontos ficam sem teste automatizado,
cobertos pela conferência em navegador:
- a ligação do clique do olho (`setShown`);
- a chamada de `setNeedsSubdomain` na tela.

Na rodada final, a conferência confirmou:
- o olho alterna texto e senha;
- o subdomínio aparece com o e-mail repetido em dois hotéis;
- a entrada leva a "/".

**Números finais:**
- 60 quadros por segundo com a CPU 4x mais lenta;
- pior evento de digitação em 64 ms;
- 448 testes do pms, 49 do domain e typecheck limpos;
- `qa_checks` sem aviso novo.
