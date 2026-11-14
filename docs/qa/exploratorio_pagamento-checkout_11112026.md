# QA explorador — pagamento no check-out (CA-05.6.a)
**Branch:** develop (`9035b1c`) · **Tela(s):** `/reservas/:id?aba=conta` (formulário "Registrar pagamento") e `POST /api/payments` · **Data:** 11/11/2026 · **Papéis usados:** RECEPTIONIST, ADMIN, WAITER, ADMIN de outro hotel
**Viewports:** 1280×800, 375×812 · **Achados no escopo:** 6 (🔴 1 · 🟡 2 · 🟢 3) · **Repassados:** 2

## Veredito
**REPROVADO**: há um 🔴 no escopo. Com o saldo da tela desatualizado (outra aba ou outro computador registrou um pagamento), o valor preenchido grava um pagamento a maior **sem a confirmação da P-3**, e a sobra só sai por estorno do ADMIN. Entrada de valores, papéis, multi-tenant, duplo clique e celular passaram.

## Achados no escopo

### 🔴 [Tempo / Domínio] Saldo desatualizado grava pagamento a maior sem a confirmação da P-3
**Onde:** `/reservas/6db17c55-…?aba=conta`, campo "Valor recebido (R$)" e botão "Registrar pagamento"
**Passos:**
1. Como `recepcao@qa.test`, abrir a reserva "Ana Hospedada" na aba Conta. Saldo da estadia: R$ 261,97. O campo vem preenchido com 261,97.
2. Abrir a mesma URL numa segunda aba (é o mesmo que um segundo computador da recepção). Registrar R$ 100,00 em PIX. O saldo real cai para R$ 161,97.
3. Voltar à primeira aba sem recarregar. Ela ainda mostra saldo R$ 261,97 e o valor 261,97. Escolher "Dinheiro" e clicar em "Registrar pagamento".

**Esperado:** como o valor passa do saldo real em R$ 100,00, a tela pede a confirmação "O valor passa do saldo em R$ 100,00… Registrar assim mesmo?" (anexo, decisão P-3: "a maior pede confirmação"; a P-3 existe justamente porque "só um ADMIN desfaz, pelo estorno").
**Obtido:** grava direto, sem confirmação: "Pagamento de R$ 261,97 em Dinheiro registrado." O cabeçalho passa a mostrar **A DEVOLVER R$ 100,00**, e o resumo fica Pago R$ 512,50 para R$ 412,50 de diárias e consumos. A comparação com o saldo é feita no navegador, com o saldo que estava em cache (`readPaymentAmount(text, balanceCents)`), e o `POST /payments` não recebe nenhum dado para conferir.
**Evidência:** `evidencias/pagamento-checkout_11112026/01_duas_abas_a_maior_sem_confirmacao.png`: página inteira depois do passo 3, com "A DEVOLVER R$ 100,00" no topo e as duas linhas de pagamento (PIX R$ 100,00 e Dinheiro R$ 261,97) na linha do tempo. Rede: dois `POST /api/payments` → 201, um em cada aba.
**Por que 🔴:** dinheiro registrado errado, sem a trava que a própria entrega definiu, e a correção depende de estorno do ADMIN. O cenário é comum no balcão: dois computadores, ou a aba aberta desde a manhã. A P-7 (chave contra repetição, adiada) não cobre o caso: aqui não há requisição repetida, e sim duas requisições legítimas feitas com saldo velho.
**Sugestão (menor ajuste):** no envio, buscar a conta de novo (`bill.refetch()`) e calcular o "a maior" com o saldo recém-chegado antes de gravar. Se o saldo mudou, mostrar "O saldo mudou para R$ X" e repreencher o campo. Mais robusto, e já para o 5º semestre: o `POST /payments` recebe `expected_balance` (ou `allow_overpay: true`) e responde 409 quando o valor passa do saldo real sem a confirmação.

### 🟡 [Rede] Sem rede, o botão fica em "Registrando…" sem mensagem e o pagamento é enviado sozinho quando a rede volta
**Onde:** `/reservas/292d821b-…?aba=conta`, botão "Registrar pagamento"
**Passos:** rodar o script `evidencias/pagamento-checkout_11112026/rede_pagamento.mjs`, cenário C (comando em "Comandos rodados", abaixo):
1. Entrar como recepção e abrir a aba Conta da reserva "Carla Chegada".
2. Desligar a rede (`context.setOffline(true)`), digitar 10,00, escolher PIX e clicar em "Registrar pagamento".
3. Religar a rede.

**Esperado:** pela P-7 do anexo, "falha de rede … não diz 'falhou' e manda conferir a conta". O critério do time é "erro com saída". Pela regra de domínio, a fila offline tem de ser honesta: se a tela vai segurar e enviar depois, ela diz isso.
**Obtido:** nenhuma mensagem. O campo e o botão ficam travados em "Registrando…" sem limite de tempo (captura C). Quando a rede volta, o pedido parado é enviado sem aviso, e a linha do tempo da reserva passa a ter "Pagamento · PIX −R$ 10,00 · 19:57", gravado depois que o script já tinha saído da tela. O comportamento combina com uma mutação do TanStack Query pausada por estar offline (`networkMode: 'online'`, o padrão), que nunca chega ao `onError` onde está a mensagem da P-7. Para a recepcionista com fila no balcão, a tela parece congelada: ela recarrega ou desiste sem saber se o pagamento foi ou vai ser gravado.
**Evidência:** `evidencias/pagamento-checkout_11112026/rede_C_offline.png`: botão "Registrando…" desabilitado, saldo ainda R$ 999,99, nenhuma mensagem. A conta da reserva conferida depois no navegador mostra o pagamento de R$ 10,00 que veio desse cenário (os cenários A e B foram interceptados e não chegam ao servidor).
**Sugestão:** `networkMode: 'always'` no `useCreatePayment`, para a falha de rede cair no `onError` e mostrar a mensagem que a P-7 já prevê. Outra saída: avisar "Sem conexão: o pagamento será enviado quando a rede voltar" e permitir cancelar. Sem fila escondida em operação de dinheiro.

### 🟡 [Teclado / Leitura] "Corrigir o valor" joga o foco para o `body`
**Onde:** confirmação do "a maior", botão "Corrigir o valor"
**Passos:**
1. Na aba Conta de uma reserva com saldo, digitar 4125, escolher PIX e enviar com Enter. A confirmação abre e o foco vai para "Corrigir o valor" (correto).
2. Apertar Enter.

**Esperado:** o foco volta ao campo "Valor recebido (R$)", que é onde a pessoa vai corrigir (critério do time, eixo Teclado: "foco sempre visível"; WCAG 2.4.3, ordem do foco).
**Obtido:** a confirmação some e `document.activeElement` passa a ser o `BODY`. Quem usa só o teclado volta ao começo da página e precisa passar pela navegação lateral e pelos botões de check-in, check-out e cancelar até chegar ao campo. O leitor de tela não anuncia nada.
**Evidência:** resultado do `browser_evaluate` logo depois do Enter: `{ active: "BODY …", alert: [] }`.
**Sugestão:** no `onClick` de "Corrigir o valor", focar e selecionar o campo de valor (`ref` no `Input` + `select()`).

## Melhorias de uso (🟢)

1. **Esc não fecha a confirmação do "a maior".** Com o foco em "Corrigir o valor", o Esc não faz nada. Quem ganha: a recepcionista no teclado, que espera desfazer com Esc. Hoje é Tab ou Shift+Tab até o botão e mais um Enter. É um painel inline, não um diálogo, então não chega a ser defeito.
2. **"-10" mostra "Digite o valor recebido, por exemplo 150,00."** O "0" mostra a mensagem certa ("O valor precisa ser maior que zero."), mas o negativo cai na mensagem genérica de formato. Quem ganha: a recepcionista, que entende na hora que o problema é o sinal e não o formato. São segundos de dúvida, com o hóspede esperando.
3. **O método escolhido só se distingue pela cor.** O botão escolhido ("PIX") muda só a borda e o fundo para um verde claro, sem ícone e sem texto em negrito (captura `02_celular_confirmacao_a_maior.png`). Ao sol ou com daltonismo, fica difícil confirmar o método antes de gravar, e um método errado no caixa gera diferença no fechamento. Sugestão: um ✓ ou peso de fonte diferente no escolhido (WCAG 1.4.1). A leitura por leitor de tela está correta: o `radio` aparece como `[checked]`.

Observação, sem contar como achado: a resposta 500 com corpo mostra o texto do backend ("Erro interno do servidor"), sem orientar o próximo passo. O formulário continua usável para tentar de novo, então fica só como nota. Algo como "Não foi possível registrar. Nada foi gravado. Tente de novo." ajudaria, se o backend garantir o rollback.

## Repassados a outro dev
| Sev. | Achado | Onde | Dono | Repasse |
|---|---|---|---|---|
| 🟢 | Conta com 503 **sem corpo** (proxy ou gateway) mostra "Consumos desta reserva em migração", que é o motivo do 503 do backend, e não o do proxy | `ReservationDetailPage.tsx:340-343` (cartão "Conta da estadia") | Gabriel | `docs/qa/repasses/para_gabriel_11112026.md` |
| 🟢 | No celular, um saldo de 13 dígitos ("R$ 9.999.999.783,99") no cabeçalho causa 7 px de rolagem lateral (`span.whitespace-nowrap`). Só acontece com valor absurdo | cabeçalho da reserva | Gabriel | `docs/qa/repasses/para_gabriel_11112026.md` |

## Mapa de cobertura
| Eixo (§3) | Tentado? | Como | Resultado |
|---|---|---|---|
| Entrada | Sim | 28 valores pelo campo (com e sem método escolhido, sem gravar): `0`, `-10`, `abc`, `1.234,56`, `150.5`, `0,01`, `  100  `, `R$ 50`, `R$ 1.000`, `999999999999,99`, `9999999999,99`, `1e3`, `12,345`, `1.2.3`, `<b>x</b>`, emoji, `10,`, `,5`, `1,234.56`, `1 234,56`, `00012,00`, `0,001`, `412,50`, `412,51`, `4125`. Gravados de verdade: `150.5`, `0,01`, `0,02`, `100,00`, `200,00`, `9999999999,99` (confirmado) | Leitura correta em todos: `150.5` vira `"amount":"150.50"` no corpo, centavo exato na linha do tempo, `412,51` pede confirmação de R$ 0,01, o teto bate com NUMERIC(12,2), HTML aparece como texto. 🟢-2 (mensagem do negativo) |
| Entrada: a maior | Sim | `1.234,56`, `R$ 1.000`, `4125` e o valor gigante | Confirmação mostra a sobra certa. Enter com a confirmação aberta não grava. 🟡 do foco |
| Tempo | Sim | Duplo clique real (`dblclick`); 2 `click()` e 2 `requestSubmit()` no mesmo tique; cliques e Enter durante POST lento de 4 s; duas abas | Sempre 1 POST. **🔴 com duas abas** |
| Rede | Sim (script) | 502 sem corpo, 500 com corpo, offline, GET da conta com 503, POST com 4 s de atraso | 502 → mensagem P-7 correta. 500 → texto do backend. **Offline → 🟡**. 503 da conta → formulário sai e aparece "Tentar de novo" (repasse da mensagem). Lento → botão e campo desabilitados com "Registrando…" |
| Sessão e papéis | Sim | Garçom abrindo a URL da reserva (redirecionado para `/comanda`); garçom com `POST /payments` e `GET /bill` pela API (403 e 403); ADMIN do outro hotel abrindo a reserva deste (tela "Reserva não encontrada") e com `POST /payments` (404); ADMIN deste hotel abrindo a reserva do vizinho ("não encontrada"); ADMIN registra pagamento; reserva encerrada (CHECKED_OUT) com saldo mostra o formulário e quita | Tudo conforme a P-2. Nenhum dado de outro hotel. Sessão vencida no meio da tarefa: não testada |
| Tela | Parcial | 1280×800 e 375×812 | 375: alvos de 48 px (campo, 4 métodos, botão, "Sim, registrar", "Corrigir o valor"), sem rolagem lateral no uso normal. Zoom de 200%: não testado |
| Teclado | Sim | Campo → Tab → setas nos métodos → Tab → Enter grava; Enter na confirmação; Esc | Foco visível nos métodos (anel verde, captura 04). 🟡 foco perdido, 🟢 Esc |
| Leitura | Sim | `browser_snapshot` | Campo com rótulo; erro em `alert` ligado ao campo (nome acessível inclui o erro, `[invalid]`); métodos como `radio` num `group` com legenda; sucesso em `status`; confirmação em `alert` |
| Estados | Parcial | Conta em erro (503) → "Tentar de novo" e formulário oculto; saldo zerado → formulário some e o aviso "registrado" fica; saldo negativo → "A DEVOLVER" | OK. Carregamento lento da conta: não testado à parte |
| Domínio | Sim | Soma das linhas, Pago e Saldo conferidos depois de cada gravação; 3 diárias de R$ 333,33 somam R$ 999,99; CHECKED_OUT pago vira "Conta quitada" | Contas batem ao centavo |

## Não foi possível testar
- **Sessão vencida no meio do registro:** precisaria de um token expirado ou de mexer na validade do JWT, fora do §5.
- **Zoom de 200%:** ficou de fora por tempo. A largura de 375 cobre parte do risco.
- **Reserva PENDING ou CONFIRMED sem formulário:** não abri uma de propósito. Usei a "chegada hoje", que era PENDING, para o check-in, e não confirmei a ausência do formulário antes de fazê-lo (a regra está coberta pelos testes de `canReceivePayment`).
- **Leitor de tela de verdade** (NVDA, TalkBack): só a árvore de acessibilidade.
- **Console:** os únicos erros foram 404 de `/api/analytics/alerts` e `/api/analytics/occupancy` no painel "Hoje", porque o analytics-service não sobe no ambiente de QA. São do ambiente, não da tela testada. Nenhum erro de console na aba Conta.

## Comandos rodados pelo Bash
```
cat docs/specs/anexos/SPEC-05-decisoes-CA-05.6.a.md | head -150; ls frontend/apps/pms/src/features/reservations/; sed 's/=.*/=.../' /tmp/gesway-qa-explorador-4050872701/ambiente.env   # só os nomes das variáveis
cat frontend/apps/pms/src/features/reservations/paymentLogic.ts; wc -l …/PaymentForm.tsx; cat /tmp/gesway-qa-explorador-4050872701/dados.json | head -60
cat …/PaymentForm.tsx; grep parseBRLInput em frontend/packages/domain/src; mkdir -p docs/qa/evidencias/pagamento-checkout_11112026
grep -n -i "aba|abas|desatualiz|stale|…" docs/qa/redteam_m5b-… docs/historico_sessao/sirlande/m5b_… docs/specs/anexos/SPEC-05-decisoes-CA-05.6.a.md; grep refetchOnWindowFocus|staleTime em frontend/apps/pms/src; grep CA-05.6 docs/specs/SPEC-05-frontend-pms.md
set -a; source /tmp/gesway-qa-explorador-4050872701/ambiente.env; set +a; LD_LIBRARY_PATH=$QA_LD_LIBRARY_PATH timeout 120 node docs/qa/evidencias/pagamento-checkout_11112026/rede_pagamento.mjs /tmp/gesway-qa-explorador-4050872701/dados.json
grep "em migração — a conta volta" frontend/apps/pms/src; git log --format='%an %s' -3 -- ReservationDetailPage.tsx; ls docs/qa/repasses/; git check-ignore -v docs/qa/evidencias/x …
sed -n 330,350p ReservationDetailPage.tsx; head -30 docs/qa/repasses/para_gabriel_04112026.md; git log --format='%an' -- ReservationDetailPage.tsx | sort | uniq -c
ls docs/qa/evidencias/ docs/qa/evidencias/pagamento-checkout_11112026/; git branch --show-current; git status --short
```
Nenhum comando instalou nada, mudou configuração ou falou com algo fora de `localhost`. Os dados criados são todos do banco `gestao_hotel_qa`: pagamentos fictícios nas reservas "Ana Hospedada", "Bruno Frigobar", "Eva Encerrada" e "Carla Chegada", e o check-in de "Carla Chegada".
