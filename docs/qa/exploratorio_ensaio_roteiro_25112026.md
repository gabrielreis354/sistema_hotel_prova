# QA explorador — Ensaio do roteiro da demonstração (passos 1 a 8)
**Branch:** `develop` (`74e028a`) · **Tela(s):** `/quartos`, `/quartos/categorias/nova`, `/quartos/novo`, `/reservas/nova`, `/reservas/:id` (Resumo e Conta), `/comanda`, `/comanda/:id`, `/` (Hoje), `/reservas?de=&ate=`, `/indicadores`, Swagger `:3000/api-docs` (Reserva Direta), Grafana/Prometheus por API · **Data:** 25/11/2026 (23:25 às 23:37) · **Papéis usados:** ADMIN (`admin@aurora.example`), RECEPTIONIST (`recep1@aurora.example`), WAITER (`garcom@aurora.example`), hóspede anônimo (API pública)
**Viewports:** 1280×800 (balcão e gerente), 360×800 (garçom) · **Achados no escopo:** 7 (🔴 0 · 🟡 2 · 🟢 5) · **Já conhecidos (não contam):** 4 · **Repassados:** 0 (todo o roteiro é o escopo; o dono de cada achado está no próprio achado)

## Veredito
**APROVADO COM RESSALVAS.** O roteiro está pronto para a banca, com ressalvas.

Os 8 passos fecharam do começo ao fim, na ordem do guia, em cerca de 12 minutos, sem nenhum erro 5xx e sem gravação duplicada. Não há 🔴. As duas ressalvas 🟡 não bloqueiam a demonstração:
- **Passo 4:** o guia promete uma coisa que o painel não mostra sem um clique.
- **Passo 5:** o formulário de pagamento põe o erro no campo errado se o apresentador esquecer o meio de pagamento.

Os dois se resolvem com um ajuste no guia e no ensaio. Nenhum deles impede a demonstração.

### Os 8 passos

| Passo | Status | Tempo | O que a banca viu | Divergência do guia |
|---|---|---|---|---|
| 1. Admin: categoria e quarto 902 | ✅ | ~1 min | A categoria "Suíte Demonstração" (2 pessoas, R$ 250,00) na lista. O quarto 902 com a categoria e o status "Livre" | nenhuma |
| 2. Recepção: walk-in e check-in | ✅ | ~1,5 min | O CPF `318.405.627-91` é recusado com "CPF inválido". O CPF repetido mostra "CPF ou e-mail já cadastrado…", com "Já cadastrado: Felipe Rocha · CPF \*\*\*.000.006-\*\*" e o atalho "Usar este hóspede". O resumo mostra "Quarto 902 · R$ 250,00 × 1 = R$ 250,00" antes de confirmar. A reserva abre "Pendente" e, depois do check-in, fica "Hospedado", com a mensagem "Check-in feito. O quarto passou a ocupado." | nenhuma |
| 3. Garçom 360 px: 902, desfazer, sem rede, Mesa 4 | ✅ | ~3 min | A conta "Suíte 902" aparece na lista sem rolar. A Caipirinha mostra "Desfazer (5 s)", e o desfazer da Cerveja funciona. Sem rede, aparece a faixa "Sem conexão: os lançamentos serão enviados quando a rede voltar. 1 lançamento aguardando a rede." e o Refrigerante fica "Na fila". Quando a rede volta, ele é enviado sozinho em menos de 3 s. A "Mesa 4" é aberta e a Cerveja é lançada nela. Nada rola para o lado e não há alvo abaixo de 44 px | nenhuma. Ver o método do "sem rede" no mapa de cobertura |
| 4. Recepção: painel Hoje | ⚠️ | ~1 min | Os números: Vendidos 7, Ocupados 5, Livres 10, Em limpeza 1, Ocupação 31,3% de 16. Atenção: "1 chegada sem pagamento — risco de no-show" e "1 quarto em limpeza". Chegadas: 102 "Confirmada · Sem pagamento" e 201 "Confirmada". Saídas: 107. Na casa: 5, **incluindo a 902** da Mariana. Em limpeza: 105, com "Liberar quarto" | **O guia:** o R$ 300,00 a cobrar da 107 não aparece no painel (🟡-1), e a "Atenção" não cita o número 102 (🟢-1) |
| 5. Recepção: conta, pagamento e check-out da 902 | ✅ | ~1 min | A linha do tempo: Diária R$ 250,00 → Caipirinha R$ 22,00 → Pudim R$ 14,00 → Refrigerante lata R$ 7,00 (o item sem rede), saldo R$ 293,00, que bate com a soma. O valor do pagamento vem preenchido com 293,00. Depois do cartão de crédito: "Pagamento de R$ 293,00 em Cartão de crédito registrado." e "Conta quitada". O check-out pede confirmação; depois, a reserva fica "Finalizada" com "O quarto foi para limpeza e a conta fechou.", e o Hoje mostra a 902 em "Em limpeza" | sem divergência. Há um tropeço possível se o meio não for escolhido (🟡-2) |
| 6. Swagger e PIX (plano B) | ✅ | ~1,5 min | A disponibilidade responde 200 com 4 categorias, a Suíte Demonstração entre elas. O POST responde 201: `PENDING`, total 450, sinal 135 (30%) e o `qr_code`. O script responde `200 OK` e `"reservation_status": "CONFIRMED"`. O status responde `CONFIRMED`, `deposit.status = PAID` e `confirmed: true`. No app, em "Próximos 30 dias", aparece Maria Oliveira, 101, 15/12 a 18/12, R$ 450,00, "Confirmada". Na aba Conta, "Sinal · PIX -R$ 135,00". Os dois 400: a data `2026-02-30` responde "check_in e check_out precisam ser datas válidas…", e o CPF `529.982.247-24` responde `guest.cpf inválido` | **O guia do passo 6:** o extrato está na aba **Conta**, e a frase "a conta só nasce no check-in" contradiz a tela (🟢-2) |
| 7. Admin: Indicadores | ✅ | ~0,5 min | Recebido hoje R$ 938,00. Ocupação 25,0% (4 de 16). A Suíte Demonstração aparece com 1 reserva e R$ 250,00. Em dez/26 aparece 1 reserva, a do PIX. Meios de pagamento: Cartão de crédito com 2 pagamentos e R$ 593,00, e PIX com 5 e R$ 2.645,00 | os números batem com o Hoje e com a conta (conferência abaixo). Uma ressalva de leitura (🟢-3) |
| 8. Grafana/Prometheus (curl) | ✅ | ~0,5 min | `up` = 1 para core-service, analytics-service e rabbitmq. Os eventos aplicados subiram de 363 (23:24) para 377 (23:34), +14 durante o ensaio. DLQ = 0. Há 1 consumidor do analytics. A taxa de 5xx é 0. Os dois painéis existem na pasta "Gesway" | nenhuma. O painel visual e o GitHub Actions não foram abertos (ver "Não foi possível testar") |

**Conferência cruzada do passo 7:**
- **Recebido hoje, R$ 938,00:**
  - pagamentos do seed: R$ 510,00 (o sinal de R$ 210,00 da 201 e os R$ 300,00 do check-out da 105);
  - pagamento da 902 no passo 5: R$ 293,00;
  - sinal PIX do passo 6: R$ 135,00;
  - total: R$ 510,00 + R$ 293,00 + R$ 135,00 = R$ 938,00. ✓
- **Cartão de crédito, R$ 593,00:** R$ 300,00 (105) + R$ 293,00 (902). ✓
- **Receita de novembro:** R$ 6.438,00 no gráfico, o mesmo total da tabela de meios. ✓
- **Ocupação:** 4 de 16 quartos, o mesmo do Hoje depois do check-out da 902. ✓

**O que resistiu ao apresentador nervoso:**
- **Duplo clique:** gravou uma vez só em "Cadastrar categoria", "Confirmar reserva", "Fazer check-in", "Abrir mesa", "Registrar pagamento" e "Confirmar check-out". Cada um gerou 1 requisição na aba de rede.
- **Execute do Swagger:** o duplo clique criou 1 reserva só (conferido no banco).
- **Check-in:** o 2º clique do duplo clique caiu no "Fazer check-out", que aparece no mesmo lugar. Ele não gravou nada, porque abre uma confirmação.
- **Voltar do navegador depois de criar a reserva:** o formulário volta limpo e não reenvia.
- **F5 logo depois do pagamento:** a conta continua quitada, e o check-out segue normal.

## Achados no escopo

### 🟡-1 [Domínio / Guia] Passo 4: o painel Hoje não mostra "a 107 sai hoje com R$ 300,00 a cobrar"
**Onde:** `/` (Hoje), região "Saídas", item "Gabriela Nunes · Quarto 107 · 3 diárias".

**Passos:**
1. Logar como `recep1@aurora.example` e abrir `http://localhost:5173/`.
2. Ler a região "Saídas".
3. Tocar em "Fazer check-out" na 107.

**Esperado:** o guia (Parte 3, passo 4) diz: "**A banca vê:** … **Saídas** (a 107 sai hoje com R$ 300,00 a cobrar)".

**Obtido:**
- **No passo 2:** a linha só diz "Gabriela Nunes · Hospedado · Quarto 107 · 3 diárias", sem nenhum valor.
- **No passo 3:** o R$ 300,00 só aparece depois do toque, numa confirmação "Confirmar check-out do quarto 107 · Saldo em aberto: R$ 300,00. Receba antes de liberar o hóspede…". Ela traz os botões "Confirmar check-out", "Abrir conta" e "Voltar".

**O risco ao vivo:** para mostrar o valor, o apresentador abre a confirmação de uma ação irreversível. O botão principal dela é "Confirmar check-out". Um clique errado encerra a estadia da 107 com R$ 300,00 em aberto, porque a tela permite. A partir daí, o cenário do seed deixa de bater: Saídas, Na casa e os Indicadores mudam.

**Evidência:**
- `evidencias/ensaio_roteiro_25112026/p4_hoje_1280.png`: o painel inteiro, sem valor na saída;
- `evidencias/ensaio_roteiro_25112026/p4_saida_107_saldo_300_1280.png`: a confirmação com "Saldo em aberto: R$ 300,00".

**Dono:** o guia (`docs/roteiro/GUIA_DEMONSTRACAO.md`). O sistema faz o que o desenho da T-05.3 prevê: ele mostra o saldo antes do check-out.

**Bloqueia a demonstração?** Não.

**Sugestão:** trocar a fala do guia. Duas opções:
- "a 107 sai hoje; ao tocar em Fazer check-out, o sistema avisa o saldo de R$ 300,00 antes de deixar sair — **toque em Voltar**";
- ou não abrir a confirmação e mostrar o R$ 300,00 pela "Abrir conta" da reserva.

### 🟡-2 [Leitura / Acessibilidade] Sem o meio de pagamento, o erro aparece no campo "Valor recebido", que fica vermelho
**Onde:** `/reservas/:id?aba=conta`, formulário "Registrar pagamento". O código está em `frontend/apps/pms/src/features/reservations/paymentLogic.ts:115`: um único `error`, mostrado pelo `PaymentForm.tsx` sob o valor.

**Passos:**
1. Abrir a conta de uma reserva hospedada com saldo (no ensaio, a 902 com R$ 293,00).
2. Sem escolher PIX, cartão nem dinheiro, clicar em "Registrar pagamento".

**Esperado:** o aviso fica no grupo "Como o hóspede pagou", que é o que falta. O valor, que está certo, não fica marcado. Regra: critério do time, eixo Leitura do guia do agente, "erro anunciado" no campo certo; e DESIGN_PMS §5, dinheiro sem erro de leitura.

**Obtido:**
- o campo `textbox "Valor recebido (R$) Escolha como o hóspede pagou." [invalid]` fica com a borda vermelha, com o texto "Escolha como o hóspede pagou." logo abaixo;
- o grupo dos meios não muda;
- nada é gravado (0 POST), o que está certo.

Quem lê rápido entende que o **valor** está errado. É o tropeço mais provável do passo 5: o guia diz "Escolha o meio (ex.: cartão)", e esse passo é fácil de pular com a banca olhando.

**Evidência:** `evidencias/ensaio_roteiro_25112026/p5_sem_meio_erro_no_valor_1280.png`: o valor 293,00 em vermelho, com a mensagem do meio de pagamento logo abaixo dele.

**Dono:** o sistema (formulário de pagamento da SPEC-05, CA-05.6.a, M5-b, Sirlande).

**Bloqueia a demonstração?** Não. A tela não grava, e escolher o meio resolve.

**Sugestão:** separar o erro do meio (`methodError`) e mostrá-lo no `fieldset`, com `aria-invalid`/`aria-describedby` no grupo. Uma alternativa mais leve: não marcar o valor como inválido quando o erro for o do meio. Para o dia: no ensaio, o apresentador **escolhe o meio antes** de clicar.

## Melhorias de uso (🟢)

- **🟢-1 [Guia] A "Atenção" não cita a 102.**
  - A tela diz "1 chegada sem pagamento — risco de no-show". O link leva a "Chegadas", onde a 102 aparece com "Sem pagamento".
  - O guia diz "a lista de Atenção (a chegada sem pagamento da 102…)".
  - Ajuste a fala para "Atenção aponta 1 chegada sem pagamento; clicando, ela é a 102". Isso evita que a banca procure o número na Atenção.
  - Quem ganha: o apresentador (0 s; só a frase muda).
  - Dono: o guia.
- **🟢-2 [Guia do passo 6] O extrato está na aba Conta, e uma frase do guia contradiz a tela.**
  - O detalhe da reserva PIX abre na aba Resumo, sem extrato. O "Sinal · PIX" aparece só na aba **Conta** (1 clique).
  - `PASSO_6_RESERVA_DIRETA_PIX.md` §"Durante", item 6, diz: "A conta da hospedagem só nasce no check-in, então ainda não existe aqui". Mas a aba Conta mostra o título "Conta da estadia", com as 3 diárias e o saldo de R$ 315,00. Se a banca ler as duas coisas, parece contradição.
  - Sugestão: "No detalhe, aba **Conta**: o Sinal · PIX de R$ 135,00 pago e o saldo de R$ 315,00 a cobrar no check-in." Corte a frase sobre a conta.
  - Dono: o guia do passo 6 (Weslley).
- **🟢-3 [Dado do seed] Os Indicadores mostram "Cartão" e "Cartão de crédito" em linhas separadas.**
  - Em "Meios de pagamento", "Cartão · 1 · R$ 3.200,00" (a 302 do seed, com o meio legado `CARTAO`) aparece separado de "Cartão de crédito · 2 · R$ 593,00".
  - O gerente, ou a banca, pergunta qual a diferença.
  - Sugestão: o seed da 302 passa a usar `CARTAO_CREDITO`, como já faz a 105.
  - Dono: o seed (Sirlande).
- **🟢-4 [Dado do seed] Nomes sem acento no cabeçalho.**
  - A barra do topo mostra "Recepcao Aurora 1 · Recepção" e "Garcom Aurora · Garçom". O papel tem acento e o nome não.
  - A banca vê isso em todos os passos.
  - Sugestão: "Recepção Aurora 1" e "Garçom Aurora" no `seed_hotels.sql`.
  - Dono: o seed (Sirlande).
- **🟢-5 [Swagger] Os exemplos de resposta contradizem a resposta real que fica ao lado.**
  - O "Example Value" da disponibilidade, do booking e do status traz `"check_in": "2026-11-26", "check_out": "2026-11-26", "nights": 3`, com entrada igual à saída e 3 noites.
  - Os valores aparecem como inteiros (`"price_per_night": 150`, `"total_price": 450`, `"amount": 135`), sem as duas casas.
  - Na tela, o exemplo fica logo abaixo da resposta real.
  - Sugestão: exemplos fixos (15/12 a 18/12) no `config/swagger.js`. O formato do dinheiro na API pública fica para o 5º semestre.
  - Dono: o Swagger do passo 6 (Weslley).

## Já conhecidos (não contam no veredito)

| O que | Onde está registrado | Por que importa no dia |
|---|---|---|
| A 102 aparece **"Confirmada"** sem nenhum pagamento | `docs/qa/redteam_m8-seed-datas-do-dia_15nov2026.md`, 🟢-2 | A fala do passo 6 é "Quem confirma a reserva é o aviso do pagamento". Se a banca olhar a 102 no Hoje, vai ver uma confirmada sem pagamento. **Resposta pronta:** "a 102 foi confirmada por telefone, sem sinal — por isso o painel a põe em risco de no-show". Ou mudar o seed para `PENDING` |
| O sinal PIX aparece como "R$ 135,00 crédito" antes das diárias na linha do tempo | relatório de 24/11, "Simulação da família Oliveira", observação | A conta está certa; é só a leitura |
| Check-in sem confirmação | `project_perguntas_gabriel_25nov` (perguntas ao Gabriel de 25/11) | No ensaio, o check-in gravou com 1 clique. Está coerente com a fala "um duplo clique em confirmar grava uma vez só" |
| A API pública responde 400 em dois formatos (`{error}` para data e `{errors:[…]}` para CPF) | `docs/qa/redteam_qa-roteiro-24nov_24nov2026.md` (fica para o 5º semestre) | A banca pode notar no passo 6, quando os dois 400 aparecem um seguido do outro |

O que voltou a ser conferido dos achados de 24/11 e continua corrigido:
- **🟡-1:** a conta da 902 não teve item com quantidade maior que 1, então a regressão não foi exercitada.
- **🟡-2:** a linha do tempo cabe em 1280.
- **🟡-3:** a data `2026-02-30` dá 400, e não 500.
- **🟡-4:** o CPF com dígito errado dá 400 na reserva pública.
- **🟢-2:** o CPF repetido oferece "Usar este hóspede".

## Repassados a outro dev
| Sev. | Achado | Onde | Dono | Repasse |
|---|---|---|---|---|
| — | nenhum | — | — | Todos os achados estão no roteiro, que é o escopo. O dono de cada um está no próprio achado: o guia (Sirlande/Gabriel), o guia do passo 6 e o Swagger (Weslley), o formulário de pagamento e o seed (Sirlande) |

## Mapa de cobertura
| Eixo (§3) | Tentado? | Como | Resultado |
|---|---|---|---|
| Entrada | sim | CPF com dígito errado (`318.405.627-91`); CPF repetido (`300.000.006-20`, do seed); booking público com data `2026-02-30` e com CPF `529.982.247-24`; pagamento sem meio | Todos recusados com mensagem. O erro do meio aparece no campo errado (🟡-2) |
| Tempo | sim | Duplo clique em 7 botões de gravar, inclusive o Execute do Swagger; voltar do navegador depois de criar a reserva; F5 depois do pagamento | 1 gravação por ação; nada duplicado |
| Rede | sim | Passo 3, sem rede com a comanda aberta. **1ª tentativa,** no navegador do MCP (`browser_evaluate`): sobrescrevi `navigator.onLine`, disparei `offline` e troquei o `window.fetch`. A faixa "Sem conexão" apareceu, mas o Pudim **foi gravado** (201): o `openapi-fetch` guarda o `fetch` no carregamento, e a troca não o alcança. **Esse método não representa o modo avião.** **2ª tentativa,** que vale: o script `p3_offline_modo_aviao.mjs`, com o Playwright do MCP, `context.setOffline(true)`, viewport 360×800 com toque | Com o `setOffline`, `navigator.onLine` fica falso, o evento dispara e a requisição falha com `net::ERR_INTERNET_DISCONNECTED`, como no modo avião real. O item ficou "Na fila" e foi enviado 2,8 s depois de a rede voltar (log em `p3_offline_rede.log`). Diferenças do celular de verdade: o aparelho demora alguns segundos para perceber a queda, e o Wi-Fi sem internet não foi testado. Neste caso o `onLine` continua verdadeiro; ele foi coberto em 24/11 com 502 |
| Sessão e papéis | parcial | Troca de papel por "Sair" e novo login (4 logins na tela e 1 pela API, sem bater no limite de 5/min). O isolamento entre hotéis não foi refeito | Sem problema. O isolamento foi coberto em 24/11 |
| Tela | sim | 1280×800 no balcão e no gerente; 360×800 no garçom (`scrollWidth` 360 = `clientWidth`, nenhum alvo abaixo de 44 px) | ok. O zoom de 200% não foi refeito |
| Teclado | parcial | Login com Enter | ok. A tarefa inteira só com teclado não foi feita |
| Leitura | sim | Snapshot da árvore de acessibilidade em todos os passos | Botões e abas têm nome e papel. O erro do pagamento está no campo errado (🟡-2) |
| Estados | parcial | Lista com dados; o estado "Na fila"; a conta quitada; a reserva finalizada | ok. O vazio e o 502 não foram refeitos (cobertos em 24/11) |
| Domínio | sim | Soma da linha do tempo (250 + 22 + 14 + 7 = 293); quarto 902: livre, ocupado, limpeza; reserva: pendente, hospedada, finalizada; PIX: `PENDING` → `CONFIRMED`/`PAID`; cruzamento Indicadores × Hoje × conta | Tudo bate |
| Ordem das abas | parcial | O passo 4 foi feito antes do 5, como no guia, e o Hoje foi conferido de novo depois do check-out (a 902 em "Em limpeza") | ok. As duas janelas simultâneas (admin e recepção anônima) não foram reproduzidas: o MCP tem um só contexto, então troquei de papel por "Sair" |

## Não foi possível testar
- **O Grafana na tela e o GitHub Actions.** O navegador do MCP só abre `:5173` e `:3000`. O passo 8 foi conferido pelas mesmas consultas dos painéis (`infra/k8s/observability/*.json`), pelo proxy do Grafana em `127.0.0.1:3002`. Não vi a renderização: tradução do Edge, "No data" etc.
- **O modo avião num celular real.** A representação usada é a do `setOffline`, com os limites descritos no mapa.
- **Plano A (Asaas).** O compose está com `PIX_PROVIDER=fake`, então só o plano B foi ensaiado.
- **Duas janelas lado a lado (admin e recepção anônima).** O MCP tem um contexto só.
- **Observação, sem achado:** uma segunda aba do garçom na mesma conta (a do MCP) não mostrou, 1 minuto depois, o Refrigerante lançado pelo outro "aparelho". Ela mostrou só depois de recarregar. Isso não afeta o roteiro, que usa um aparelho só. Fica como `SUSPEITA` de que a comanda não refaz a consulta sozinha. Para confirmar, falta medir o intervalo de atualização da tela da conta com dois aparelhos.
- **Horário do ensaio.** Este ensaio rodou das 23:25 às 23:37 e acabou antes da meia-noite. O seed é ancorado no dia: um ensaio que passe da meia-noite leva as chegadas da 102 e da 201 para "atrasadas" e muda o "Recebido hoje". No dia da banca, à tarde, isso não acontece. Mas convém não ensaiar perto da meia-noite.

## Correções sugeridas para o `GUIA_DEMONSTRACAO.md`
1. **Passo 4, "A banca vê":** troque "(a 107 sai hoje com R$ 300,00 a cobrar)" por "(a 107 sai hoje; tocando em **Fazer check-out**, o sistema avisa o saldo de R$ 300,00 antes de liberar — **toque em Voltar**, não confirme)" (🟡-1).
2. **Passo 4:** troque "a lista de **Atenção** (a chegada sem pagamento da 102 …)" por "a **Atenção** aponta 1 chegada sem pagamento; o link leva à 102, em Chegadas" (🟢-1).
3. **Passo 5, item 3:** acrescente "**escolha o meio antes de clicar** em Registrar pagamento" (🟡-2, enquanto a tela não muda).
4. **Passo 5, item 1:** o caminho mais curto é **Hoje → Na casa → nome do hóspede → aba Conta** (2 cliques). Diga isso no guia.
5. **Passo 6, item 5:** troque "com o sinal PIX no extrato" por "no detalhe, aba **Conta**: Sinal · PIX de R$ 135,00 pago, saldo de R$ 315,00". No `PASSO_6_RESERVA_DIRETA_PIX.md`, item 6, corte "A conta da hospedagem só nasce no check-in, então ainda não existe aqui" (🟢-2).
6. **Passo 6:** registre os dois 400 que o pedido do ensaio inclui (`2026-02-30` e o CPF `529.982.247-24`) e o que cada um responde, se eles fizerem parte da fala. Hoje o guia não os cita.
7. **Passo 6, item 3:** o comando `docker compose exec …` precisa do mesmo `COMPOSE_PROJECT_NAME` (e do `COMPOSE_PROFILES`) do compose que está no ar. Sem isso, cai em outro projeto. Lembre no guia, ou exporte as duas variáveis na Parte 2.
8. **"Se algo der errado" ou a folha de respostas:** acrescente a resposta pronta para "por que a 102 está confirmada sem pagamento?" (já conhecido).

## Evidências (`docs/qa/evidencias/ensaio_roteiro_25112026/`, fora do git)

**Passo 1:**
- `p1_quarto_902_lista_1280.png`: a lista de quartos, com o 902, a Suíte Demonstração, R$ 250,00 e o status "Livre".

**Passo 2:**
- `p2_valor_antes_confirmar_1280.png`: o resumo com R$ 250,00 antes de confirmar;
- `p2_checkin_hospedado_1280.png`: a reserva "Hospedado", com "Check-in feito".

**Passo 3:**
- `p3_contas_abertas_360.png`: a lista de contas, com a Suíte 902;
- `p3_caipirinha_desfazer_360.png`: a Caipirinha com o desfazer;
- `p3_offline_1_modo_aviao_360.png`: a faixa "Sem conexão";
- `p3_offline_2_item_na_fila_360.png`: o Refrigerante "Na fila";
- `p3_offline_3_rede_voltou_360.png`: o Refrigerante enviado;
- os `.aria.yml` com o mesmo nome: a árvore de acessibilidade de cada momento;
- `p3_offline_rede.log`: as requisições com o tempo de cada uma, mais a conferência no servidor (Caipirinha, Pudim e Refrigerante, 1 de cada);
- `p3_offline_modo_aviao.mjs`: o script de reprodução;
- `p3_mesa4_lancamento_360.png`: a Mesa 4 com a Cerveja.

**Passo 4:**
- `p4_hoje_1280.png`: o painel inteiro;
- `p4_saida_107_saldo_300_1280.png`: a confirmação com o saldo da 107.

**Passo 5:**
- `p5_conta_linha_do_tempo_1280.png`: a conta antes do pagamento;
- `p5_sem_meio_erro_no_valor_1280.png`: o 🟡-2;
- `p5_checkout_finalizada_1280.png`: a reserva finalizada.

**Passo 6:**
- `p6_availability_200.png`;
- `p6_booking_201_pending.png`;
- `p6_400_data_2026-02-30.png`;
- `p6_400_cpf_digito_errado.png`;
- `p6_reservas_30dias_confirmada_1280.png`;
- `p6_extrato_sinal_pix_1280.png`.

**Passo 7:**
- `p7_indicadores_1280.png`.

**Como reproduzir o script do passo 3:**

```bash
# ambiente.env com QA_PLAYWRIGHT_CORE, QA_CHROMIUM e QA_LD_LIBRARY_PATH, gerado pelo mesmo trecho de
# node da função ambiente_rede do scripts/qa_explorador_ambiente.sh, gravado no scratchpad da sessão
set -a; source <scratchpad>/ambiente.env; set +a
cd docs/qa/evidencias/ensaio_roteiro_25112026
LD_LIBRARY_PATH=$QA_LD_LIBRARY_PATH node p3_offline_modo_aviao.mjs <account_id da Suíte 902>
```

O script faz 1 login do garçom pela API e guarda o token só na memória.

## Ambiente (exceção autorizada ao §5)
- **O ambiente:** o orquestrador autorizou o compose isolado da demonstração (`COMPOSE_PROJECT_NAME=gesway_ensaio`, `COMPOSE_PROFILES=observability`) em vez do `gestao_hotel_qa`.
- **O que não fiz:** não subi, não derrubei e não reiniciei nada, e não rodei o seed de novo. O compose e o Vite ficaram no ar.
- **O `.env`:** foi lido só para tirar a `GRAFANA_ADMIN_PASSWORD` dentro do comando. Ela não foi impressa nem copiada para este relatório.
- **Dados criados no Aurora**, todos fictícios:
  - a categoria "Suíte Demonstração" (R$ 250,00) e o quarto 902;
  - a hóspede "Mariana Ensaio Teixeira" (CPF `318.405.627-90`, `mariana.ensaio@qa.test`), com a reserva da 902 de 25/11 a 26/11, já com check-out;
  - os consumos Caipirinha, Pudim e Refrigerante na conta da 902;
  - a conta "Mesa 4", com 1 Cerveja;
  - o pagamento de R$ 293,00 no cartão de crédito;
  - a reserva pública da "Maria Oliveira" (o exemplo do Swagger, `maria@example.com`), quarto 101, de 15/12 a 18/12, `CONFIRMED`, com o sinal de R$ 135,00 pago.

## Comandos rodados pelo Bash
```
git log --oneline -1 && wc -l docs/roteiro/... && grep -n "^## \|^### " docs/roteiro/GUIA_DEMONSTRACAO.md
sed -n 115,274p docs/roteiro/GUIA_DEMONSTRACAO.md
cat docs/roteiro/PASSO_6_RESERVA_DIRETA_PIX.md docs/roteiro/PASSO_8_GRAFANA.md
sed -n 1,120p docs/qa/exploratorio_roteiro-demonstracao_24112026.md
grep -n "^### \|^## " docs/qa/exploratorio_roteiro-demonstracao_24112026.md; sed -n '/## Correções de 24\/11/,$p' ... | head -60
export COMPOSE_PROJECT_NAME=gesway_ensaio COMPOSE_PROFILES=observability && docker compose ps --format ...; curl -s -o /dev/null -w ... http://localhost:5173/; curl ... http://localhost:3000/api-docs/; date
mkdir -p docs/qa/evidencias/ensaio_roteiro_25112026 && date +%T
grep -rn "a cobrar\|300" services/core-service/seed/*.sql | ...; ls services/core-service/seed/; grep -rln "a cobrar" frontend/apps/pms/src
grep -n "107\|300" services/core-service/seed/seed_hoje.sql; ls frontend/apps/pms/src/features/; grep -rln "Saídas" frontend/apps/pms/src --include=*.tsx
grep -n "balance\|saldo\|amount\|formatMoney\|Money" frontend/apps/pms/src/features/today/components/rows.tsx; git log --oneline -3 -- docs/roteiro/GUIA_DEMONSTRACAO.md
grep -rln "axios\|XMLHttpRequest" frontend/packages/api-client/src frontend/apps/pms/src; grep -rn "onLine\|'online'\|onlineManager" frontend/apps/pms/src frontend/packages/*/src ...
grep -rn "fetch" frontend/packages/api-client/src --include=*.ts
grep -n "ambiente_rede" -A40 scripts/qa_explorador_ambiente.sh
node -e '<trecho da função ambiente_rede>' <raiz> > <scratchpad>/ambiente.env
sed -n 1,40p services/core-service/app/Controllers/AuthApi/LoginController.js | grep ...; ls docs/qa/evidencias/roteiro-demonstracao_24112026/
cat docs/qa/evidencias/roteiro-demonstracao_24112026/p3_garcom_offline.mjs
set -a; source <scratchpad>/ambiente.env; set +a; cd docs/qa/evidencias/ensaio_roteiro_25112026 && LD_LIBRARY_PATH=$QA_LD_LIBRARY_PATH node p3_offline_modo_aviao.mjs 473fc0ad-7018-43f3-9a4b-5dbc49d23aa4
grep -n "Sem conex\|status" p3_offline_1_modo_aviao.aria.yml p3_offline_2_item_na_fila.aria.yml; date +%T
docker compose exec -T postgres sh -c 'psql ... -c "select ... from reservations r where r.check_in=..."'   (falhou: nome da coluna)
docker compose exec -T postgres sh -c 'psql ... -c "select id, status, check_in_date, check_out_date, created_at from reservations where check_in_date = '2026-12-15' order by created_at"'
docker compose exec backend node scripts/simular_pagamento_pix.js fake_d1168a57-aa08-4e49-bac1-f03d608c4364 http://localhost:3000
curl (Grafana /api/health, /api/datasources, /api/search e o proxy do Prometheus: up, analytics_events_total)
node -e (lista as consultas dos painéis em infra/k8s/observability/*.json)
curl (proxy do Prometheus: DLQ, consumidores, eventos aplicados, 5xx, status, up rabbitmq)
curl (proxy do Prometheus: query_range de analytics_events_total{outcome="applied"} nos últimos 20 min)
git log ... -- services/core-service/seed/seed_hoje.sql; sed -n 1,30p seed_hoje.sql; grep -n seed docs/DIVISAO_TRABALHO_TIME_09set2026.md
grep -rn -i "102.*confirm\|confirmada sem\|CONFIRMED sem..." docs/qa/*.md docs/roteiro/*.md docs/specs/*.md services/core-service/seed/*.sql; grep ... exploratorio_roteiro-demonstracao_24112026.md
sed -n 1,11p docs/roteiro/GUIA_DEMONSTRACAO.md; git log ... StaffActions.tsx; grep -rln "Escolha como o hóspede pagou" frontend/apps/pms/src; ls docs/qa/repasses/
grep -n "Escolha como o hóspede pagou" -B3 -A3 paymentLogic.ts; git log ... paymentLogic.ts; grep -rln ... components
git check-ignore -v ...; ls docs/qa/evidencias/ensaio_roteiro_25112026/; git status --short
```

## Correções de 25/11 (depois do ensaio)

Decididas pelo Sirlande logo depois do ensaio. Cada uma tem a sua branch e o seu PR para a `develop`:

| Achado | O que mudou | Branch |
|---|---|---|
| 🟡-1, 🟢-1, 🟢-2 e as correções 1 a 8 do guia | Passo 4 com "toque em Voltar" e a resposta pronta da 102; passo 5 com o caminho mais curto e o meio antes de clicar; passo 6 com a aba Conta, os 400 opcionais e o `export` do plano B; nova §1.6 "Ensaio no computador de um dev"; aviso de não ensaiar perto da meia-noite. No `PASSO_6`, saiu a frase da conta que só nasce no check-in | `docs/ensaio-roteiro-25nov` |
| 🟡-2 | O erro do meio de pagamento aparece no grupo dos meios; o valor só fica inválido quando o erro é dele. Na mesa, o texto diz "o cliente" | `fix/pagamento-erro-meio` |
| 🟢-3 e 🟢-4 | Seed com `CARTAO_CREDITO` no lugar do `CARTAO` antigo e nomes "Recepção" e "Garçom" com acento. Vale para banco recriado | `fix/seed-acentos-cartao` |
| 🟢-5 | Exemplos de resposta da reserva direta com as datas do passo 6 (15/12 a 18/12). O formato do dinheiro fica para o 5º semestre | `docs/api-exemplos-passo6` |

A 102 "Confirmada" sem pagamento continua no seed, por decisão: o guia traz a resposta pronta.
