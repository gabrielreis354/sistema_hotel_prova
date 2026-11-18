# QA Red Team — comanda-aviso-offline (faixa "sem conexão" sem borda lateral)
**Branch:** fix/comanda-aviso-offline-sem-faixa (PR #185) · **Dev:** Sirlande · **Base:** develop@51e7b03 · **Data:** 17/11/2026
**Arquivos auditados:** 2 (diff). Lidos só para confirmar: `AccountPage.tsx:90-100`, `packages/ui/src/Notice.tsx:24`, `today/components/rows.tsx:371`, `AppShell.tsx` (padrão de ícone), `packages/config/tailwind-preset.js:27`, `lucide-react@1.66.0` (`dist/cjs/lucide-react.js:40-100`), repasse `para_gabriel_17112026.md` na branch `docs/relatorio-sirlande-17nov`
**Achados no escopo:** 3 (🔴 0 · 🟡 0 · 🟢 3) · **Repassados:** 0 (a inconsistência com `Notice` e `rows.tsx` já está repassada no PR #184)

## Veredito
**APROVADO COM RESSALVAS**

Nenhum 🔴 nem 🟡. A mudança é só de apresentação: o texto e a região viva continuam como estavam, e a fila, a
API e o backend não mudam. Rodei `connection.test.tsx` (16/16 verdes) e um teste descartável que imprime o
HTML do `OfflineNotice`. Também refiz uma mutação, descrita no 🟢-1. Não há seed, `start.sh`, compose,
migração nem dependência nova: o `lucide-react` 1.66.0 já está no `package.json` do pms desde a T-08.2. As três
ressalvas são 🟢.

## Pontos pedidos pelo orquestrador

**(1) O anúncio do leitor de tela não mudou.** HTML renderizado (tirei os `path` do SVG):

```html
<p class="flex items-start gap-2 ..."><svg ... class="lucide lucide-wifi-off ..." aria-hidden="true">…</svg><span><span class="font-semibold">Sem conexão:</span> <!-- -->os lançamentos serão enviados quando a rede voltar.<span class="font-medium tabular-nums"> <!-- -->2 lançamentos aguardando a rede (1 em outra conta).</span></span></p>
```

O SVG sai da árvore de acessibilidade, porque tem `aria-hidden="true"` e nenhum `<title>`. Os nós de texto e os
espaços são os mesmos de antes, só que dentro de um `span` a mais, e um `span` não gera papel nem fronteira de
leitura. O `display:flex` do `p` não insere separador no texto acessível: o único item de fluxo com texto é o
`span`. A região `role="status"` (`OfflineBanner.tsx:53`) continua nascendo vazia, e o conteúdo entra depois da
montagem. O conteúdo anunciado é igual ao de antes, caractere por caractere.

**(2) Contraste e uso de cor.** Texto gray-900 sobre o fundo tingido (#FBF1E6): 15,95:1. O ícone #d97706 sobre o
mesmo fundo dá **2,86:1**, abaixo do 3:1 do WCAG 1.4.11. Como o ícone é decorativo e o texto em negrito "Sem
conexão:" carrega a informação, o 1.4.11 não se aplica. O aviso não depende só da cor: tem a forma do ícone e
tem o texto. Ainda assim, a saliência do ícone fica registrada no 🟢-2.

**(3) Inconsistência com `Notice` e `rows.tsx`: repasse, não achado deste diff.** As faixas de
`packages/ui/src/Notice.tsx:24` e de `today/components/rows.tsx:371` existiam antes e não são desta branch. A
divergência já está registrada em `docs/qa/repasses/para_gabriel_17112026.md` (PR #184), com o `OfflineBanner`
marcado como "já trocado" e indicado como referência. Um novo repasse duplicaria o anterior. A branch faz o que
o repasse pede para a área do Sirlande. A decisão para o sistema todo é do Gabriel e de quem pegar o
`packages/ui`. Hoje a tela da comanda mostra o aviso de rede sem faixa, e o `Notice` do pagamento da mesa mostra
outro aviso com faixa. Isso é visível, mas é transitório e tem dono.

**(4) O teste por regex é frágil? Pouco, mas um pedaço dele não prova o que diz.** Detalhe no 🟢-1.

## Achados no escopo

### 🟢-1 [Testes] A asserção `aria-hidden` testa o padrão da biblioteca, não a decisão do dev
**Onde:** `frontend/apps/pms/src/features/accounts/connection.test.tsx:95`, contra `OfflineBanner.tsx:18`
**Cenário:** tirei o `aria-hidden="true"` do `<WifiOff>` e rodei a suíte: 16/16 continuaram verdes. O
`lucide-react` 1.66.0 já põe `aria-hidden="true"` em todo ícone sem prop `aria-*`, `role` ou `title`
(`dist/cjs/lucide-react.js`, `hasA11yProp === false`). O mutante é equivalente: o comportamento não muda, então
não há defeito. O teste se chama "o ícone, decorativo", mas quem garante o decorativo é a versão da biblioteca. Se
alguém puser `title="Sem rede"` ou `aria-label`, o teste quebra, e isso está certo. Se um upgrade do lucide
mudar o padrão, o teste continua passando só enquanto o prop explícito estiver lá. Sobre o resto do regex:
- `^<p[^>]*><svg` prende o ícone como primeiro filho. Pôr o ícone dentro de um `span` quebraria o teste sem
  quebrar o comportamento. Esse acoplamento ao markup é aceitável, porque a ordem ícone-antes-do-texto é o que
  se quer travar.
- `/border-[lr]-\d/` não pega `border-s-4` (lógica), `border-l-[3px]` (valor arbitrário) nem `border-x-4`. Uma
  volta da faixa por essas formas passaria.

**Regra violada:** nenhuma regra dura. É o item "teste que passaria mesmo com a regra quebrada" da §8, aqui em
grau mínimo.
**Correção sugerida (opcional):** trocar o negativo por `/border-(?:[lrsex]|inline)/`, que barra toda borda
lateral, inclusive a de 1 px. Se a de 1 px puder ficar, usar `/border-(?:[lrsex])-(?:[2-9]|\[)/`. O
`aria-hidden` pode ficar como está. Basta saber que ele documenta a intenção e não pega regressão.

### 🟢-2 [UI/A11y] O ícone âmbar tem 2,86:1 sobre o próprio fundo
**Onde:** `OfflineBanner.tsx:18` (`text-status-cleaning`, #d97706 sobre `bg-status-cleaning/10`, ≈ #FBF1E6)
**Cenário:** o garçom olha o celular sob luz forte ou no balcão escuro do bar. Sem a faixa, o ícone de 16 px é o
único sinal visual de que algo está fora do normal antes da leitura do texto. A 2,86:1 ele aparece menos do que
a faixa de 4 px aparecia (3,19:1 contra o branco da página). Não fere o WCAG, porque o ícone é decorativo e o
texto está a 15,95:1.
**Regra violada:** nenhuma. É saliência do sinal. `PLANEJAMENTO_FRONTEND.md` §8.2 pede o aviso de rede
"percebido de relance".
**Correção sugerida (opcional):** `text-amber-700` (#b45309) no ícone dá 4,50:1 no mesmo fundo e continua no tom
da fila. Fundo e texto não mudam. Se o token `status-cleaning` precisar ficar por consistência, isso pode ir
junto com a decisão do repasse do PR #184.

### 🟢-3 [Rastreabilidade] Comentários apontam para um repasse que ainda não está na develop
**Onde:** `connection.test.tsx:90` e `OfflineBanner.tsx:11` ("repasse de 17/11")
**Cenário:** `docs/qa/repasses/para_gabriel_17112026.md` só existe na branch `docs/relatorio-sirlande-17nov` (PR
#184, aberto). Ele não está em `origin/develop` nem nesta branch. Se o #185 for mergeado antes e o #184 mudar
ou fechar, o comentário do teste aponta para um arquivo que não existe.
**Regra violada:** nenhuma dura. É rastreabilidade da decisão (memória "documento de decisões").
**Correção sugerida:** mergear o #184 antes ou junto do #185. Outra saída é citar no comentário a regra de
origem (`craft-floor.md` do Impeccable), que não depende do PR.

## Repassados a outro dev
Nenhum novo. A faixa lateral do `Notice` (`packages/ui/src/Notice.tsx:24`, sem dono) e a do `rows.tsx:371`
(Gabriel) já estão em `docs/qa/repasses/para_gabriel_17112026.md`, no PR #184.

## O que foi verificado e está correto
- O texto acessível da região viva é idêntico ao de antes. O SVG está fora da árvore (`aria-hidden`, sem
  `<title>`), e a região continua nascendo vazia (testes `connection.test.tsx:84-88`).
- `<p>` com `<svg>` e `<span>` é conteúdo de fraseado válido. Não há `<div>` dentro de `<p>` (que geraria aviso
  de hidratação).
- O aviso não depende só da cor: o texto começa com "Sem conexão:" em negrito e o ícone tem forma própria.
- O texto passa no contraste AA: 15,95:1.
- O ícone segue o padrão do projeto (`aria-hidden` explícito, `shrink-0`, como em `AppShell.tsx:141-204` e
  `rows.tsx:263`). A diferença é `h-4 w-4` em vez de `size-*`, e o resultado é o mesmo.
- A dependência não é nova: `lucide-react` 1.66.0 já estava no pms.
- O diff não toca em nada de backend, multi-tenancy, LGPD, Swagger, seed, compose, `start.sh` ou migração.
- O 320 px ganhou uma linha: ficou com 89 px, e a medida é do dev. O projeto mede em 375/390, então aceitei.
  O `items-start` com `mt-0.5` alinha o ícone à primeira linha quando o texto quebra.

## Não foi possível verificar
- Leitura real com NVDA, VoiceOver ou TalkBack. A conclusão do ponto (1) vem do HTML renderizado e das regras
  de cálculo do nome acessível, não de um leitor de tela rodando.
- As alturas em 320, 375 e 768 px e o lançamento sem rede chegando ao servidor são medidas do dev no Chromium.
  Não reproduzi.
- A cor de fundo da página atrás do aviso. Calculei sobre o branco. Se o fundo for gray-50, os números mudam
  pouco, menos de 0,1.

## Tratamento (17/11, Sirlande com Claude Code)

| Achado | O que foi feito |
|---|---|
| 🟢-1 Regex não pega `border-s-4`, `border-l-[3px]` e `border-x-4` | O teste agora recusa **qualquer** classe de borda no aviso (`/class="[^"]*\bborder/`). Mutação com os três formatos: 3 de 3 mortos. O `aria-hidden` continua explícito no código. Ele é um mutante equivalente, porque o lucide 1.66.0 já põe `aria-hidden="true"` em todo ícone sem rótulo, e ficou assim |
| 🟢-2 Ícone a 2,86:1 | **Mantido** em `text-status-cleaning`. A regra 9b do `qa_checks` aceita só os tokens `brand`, `status-*` e `gray-*`, e `text-amber-700` seria cor fora deles. O ícone é decorativo, e o sinal é o texto "Sem conexão:" em negrito, a 15,95:1. Um âmbar mais escuro como token entra na decisão da faixa lateral para o sistema todo (repasse ao Gabriel, PR #184) |
| 🟢-3 Comentários citam um repasse que ainda não está na `develop` | Os comentários citam a regra de origem (`Impeccable, reference/craft-floor.md`) e o PR #184 |

Depois do tratamento: 438 testes do pms e typecheck limpos.
