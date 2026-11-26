# QA explorador — Passada final da SPEC-10 (identidade visual), com a correção de largura das listas
**Branch:** `fix/t10-largura-listas` (`ddd2e18`, sobre a integração `b522db0`) · **Tela(s):** `/`, `/reservas`, `/reservas/:id` (resumo e conta), `/reservas/nova`, `/reservas/:id/comprovante`, `/hospedes`, `/hospedes/:id`, `/hospedes/novo`, `/quartos`, `/quartos/:id/editar`, `/quartos/categorias`, `/quartos/categorias/nova`, `/comanda`, `/comanda/:id`, `/indicadores` · **Data:** 26/11/2026 · **Papéis usados:** ADMIN (`admin@aurora.example`), RECEPTIONIST (`recep1@aurora.example`), WAITER (`garcom@aurora.example`)
**Viewports:** 390×844 (toque), 768×1024 (toque), 1366×768 (mouse), 1855×1000 (Hoje e listas), 1023 e 1024×768, 1280×800 com toque, zoom de 200% (683×384 com escala 2) · **Achados no escopo:** 10 (🔴 0 · 🟡 3 · 🟢 7) · **Repassados:** 2 (os dois 🟡 anteriores à SPEC-10, também para o Sirlande)

## Ambiente — leia antes das capturas
- App em `http://localhost:5173` (Vite do worktree `wt-integracao`). Não subi nem parei nada.
- **O ambiente mudou no meio da passada, por fora de mim.** Até ~19:45 a API era o compose `gesway_integracao` (com os registros "E2E…" e 31 quartos). Por volta de 19:45, os contêineres `gesway_integracao-*` sumiram e subiu o compose **`gesway_ensaio`** (seed limpo: 15 quartos, sem "E2E…"), com a API na mesma porta 3000. Por isso:
  - as capturas de `capturas.mjs` e `rodape_detalhe.mjs` (todas as telas × larguras, número longo, reserva vencida) são do **banco da integração**;
  - as de `rede_teclado.mjs`, `rodape_garcom.mjs`, `rodape_fila.mjs` e as de `mcp/` (fluxos de reserva, hóspede, comanda) são do **banco do ensaio**;
  - no `gesway_ensaio` o analytics não publica porta no host, então todo `/api/analytics/*` pelo Vite responde **500**: o Hoje mostra o Atenção e o Em limpeza em erro (`mcp/hoje_analytics-fora_768.png`). É do ambiente, não do app.
- **Check-in que não fui eu:** às 19:42 (22:42:09Z) a reserva de **Wesley Freitas** (quarto 102, do roteiro) passou para `CHECKED_IN` e abriu a "Suíte 102" na comanda. Meus scripts só abrem o detalhe de quarto na fita (não clicam em "Fazer check-in", que ainda pede confirmação) e o meu navegador estava em `/comanda`. Fica registrado para quem conferir o roteiro.
- **Dados que criei:** no banco da integração, a mesa "QA 26/11 <b>x</b> 🍺 Mesa da varanda…" com 1 Caipirinha. No banco do ensaio: a mesa "QA 26/11 Mesa offline" (2 cervejas, de duas rodadas do script; fechada), a hóspede "QA 26/11 Maria Aparecida de Albuquerque…" (CPF de teste 529.982.247-25, e-mail `@qa.test`) e a reserva dela no quarto 104 (26→27/11), com check-in, pagamento de R$ 150,00 em dinheiro e check-out. Nada nas reservas do roteiro.
- Data no `<input type="date">` aparece mês/dia no Chromium sem interface (igual à linha de base).

## Veredito
**APROVADO COM RESSALVAS.**

**O que mudou hoje funciona:**
- **Listas na coluna inteira e alinhadas com o "Sair"** (`medidas.json`): em 768, 1366 e 1855, a borda direita da raiz de Reservas, Hóspedes, Quartos, Categorias, Comanda, Hoje e Indicadores bate com a do "Sair" (736 / 1334 / 1734 px) e a esquerda com o nome do hotel (268 / 268 / 358). Detalhe e nova reserva ficam com 1024 px, formulário de hóspede com 512 e de quarto/categoria com 576, todos encostados à esquerda (R-7 de 26/11). Em 1855 a coluna para em 1376 px e fica centrada na área à direita da barra.
- **Comanda em grade:** 3 colunas em 1366/1855 (`contas_1366.png`, `contas_1855.png`), "Abrir conta" no cabeçalho do `lg` em diante; em 1023 px volta a lista de uma coluna com o botão no pé (`rodape_contas_admin_1023.png`). Pelo teclado, a ordem é Sair → Abrir conta → Buscar → cartões; o Enter abre o formulário com o foco no campo.
- **Rodapé fixo sem lista por baixo (tablet e desktop):** em 768 (admin e garçom) e 1023, rolando a lista, a faixa entre o cartão e a borda da tela fica na cor do fundo (`rodape_contas_admin_768t.png`, `rodape_contas_admin_1023.png`).
- **Número longo no detalhe do quarto:** "E2E468762" vira "E2E46…" numa caixa de 80×44 com `title` e o número inteiro no "Quarto E2E468762" ao lado, em 390, 768 e 1366, sem rolagem lateral (`hoje_detalhe-quarto-longo_*.png`).
- **Linha da chegada vencida:** "Fazer check-in" desabilitado com o motivo "Reserva vencida: a saída é hoje. Cancele a reserva em vez de fazer o check-in." quebrando embaixo do botão; em 1855 a linha fica numa só (`hoje_1855.png`).
- **Sem rolagem lateral** em nenhuma das 78 combinações papel × tela × largura nem no zoom de 200%. Nenhum erro de console fora dos 500 do analytics no ambiente do ensaio.
- **Fluxos inteiros pela tela, sem defeito de dinheiro:** nova reserva (1 POST no duplo clique) → check-in → pagamento (`1.234,56` lido como R$ 1.234,56 e `150.5` como R$ 150,50, os dois com o aviso "a devolver"; duplo clique em "Registrar pagamento" = 1 POST) → check-out com confirmação (1 PUT no duplo clique) → comprovante com CPF mascarado `***.982.247-**` e saldo R$ 0,00. Comanda do garçom: abrir mesa com nome de 70 caracteres, emoji e `<b>x</b>` (aparece como texto, sem espaço nas pontas, 1 conta no duplo clique), lançar, desfazer, e sem rede: faixa "Sem conexão…", item "Na fila", total "inclui R$ 12,00 na fila", 1 item gravado na volta da rede.
- **Estados:** lista lenta mostra "Carregando…" e o 502 mostra o erro com "Tentar de novo" em Comanda, Reservas, Hóspedes e Quartos (`rede_*-lenta_1366.png`, `rede_*-502_1366.png`).

As ressalvas: um 🟡 de dado no Hoje (a fita trata a reserva vencida como "Chega hoje") e dois 🟡 de duplo clique **anteriores à SPEC-10** (mesmo código na `develop`). Nenhum reprova.

## Achados no escopo

### 🟡 [Domínio] A fita do Hoje mostra o quarto da reserva vencida como "Chega hoje" e o tira do "Livre"
**Onde:** `/`, fita "Situação dos quartos" (botão "Quarto 201, Chega hoje, chegada atrasada, Vinicius Lopes"), detalhe do quarto e legenda "Chega hoje 2 / Livre 8". Banco da integração.
**Passos:** 1. Admin, 1366×768, abrir `http://localhost:5173/`. 2. Ver a linha de Vinicius Lopes em Chegadas (24→26/11, Confirmada): "Fazer check-in" desabilitado, "Reserva vencida: a saída é hoje. Cancele a reserva…". 3. Clicar no quarto 201 na fita.
**Esperado:** a fita e o bloco Chegadas dizem a mesma coisa. A reserva vencida não chega mais hoje: o quarto 201 está livre para vender esta noite (uma reserva de 26→27/11 nele não conflita, porque o conflito é estrito). Regra: decisão de 22/11 ("Livre" = livre para vender) e janela do check-in de 15/11 (`RESERVATION_EXPIRED`).
**Obtido:** a fita pinta o 201 de azul "Chega hoje", conta-o em "Chega hoje 2" e fora de "Livre 8", e o detalhe diz "Chegada atrasada de Vinicius Lopes. 24/11/2026 → 26/11/2026" com "Ir para a chegada", sem a palavra "vencida". O Atenção também não tem item para ela. A recepção que procura quarto para um walk-in vê o 201 como ocupado pela chegada e não vende.
**Evidência:** `mcp/hoje_detalhe-201-vencida_1366.png` (detalhe do 201 com o selo "Chega hoje"); `hoje_1366.png` e `hoje_1855.png` (a linha "Reserva vencida" e a legenda ao mesmo tempo).
**Sugestão:** no `hotelStrip`, ignorar a chegada que o `checkInWindow` do `@hotel/domain` já dá como vencida (saída hoje ou antes), ou pintá-la com um rótulo próprio ("Reserva vencida") sem tirar o quarto do "Livre". A F3 tem dois 🟡 parecidos de dado na fita (`redteam_spec10-fase3-hoje_25112026.md`, 🟡-2 e 🟡-3), mas não este caso.

### 🟡 [Tempo] Duplo clique em "Sim, fechar" na comanda dá erro falso com o código interno — anterior à SPEC-10
**Onde:** `/comanda/:id`, botão "Sim, fechar" (`StaffActions.tsx:171-188`, igual na `develop`).
**Passos:** 1. Recepção, 768×1024, abrir a conta "QA 26/11 Mesa offline" (R$ 24,00). 2. "Fechar conta". 3. Duplo clique em "Sim, fechar".
**Esperado:** uma requisição, conta fechada, sem erro (SPEC-11 §2: "nenhum clique duplo vira erro falso"; a mensagem nunca mostra código interno).
**Obtido:** `PUT /accounts/:id/close` 200 e logo depois 422. Em vermelho: "Conta CLOSED não pode ser fechada", e embaixo "A conta já está fechada". A conta fechou.
**Evidência:** `mcp/comanda-fechar-duplo_768.png`; requisições 178 (200) e 179 (422) no MCP.
**Sugestão:** trava síncrona por ref (`mutateOnce`), como no detalhe da reserva. O `closeGuard` (C-12) protege só o toque em "Fechar conta". Repassado.

### 🟡 [Tempo] Duplo clique em "Cadastrar" no novo hóspede grava e mostra "CPF ou e-mail já cadastrado" — anterior à SPEC-10
**Onde:** `/hospedes/novo`, botão "Cadastrar" (`GuestFormPages.tsx:26-31`, só `disabled={create.isPending}`).
**Passos:** 1. Recepção, 1366×768, `/hospedes/novo`. 2. Preencher nome, CPF 529.982.247-25, telefone e e-mail `@qa.test`. 3. Duplo clique em "Cadastrar".
**Esperado:** uma requisição e a tela do hóspede criado (SPEC-11 §2).
**Obtido:** `POST /guests` 201 e 409; a tela fica no formulário com "CPF ou e-mail já cadastrado para outro hóspede." O hóspede existe uma vez só (busca "qa 26").
**Evidência:** `mcp/hospedes_busca-nome-longo_1366.png` (o cadastro que "falhou" está na lista); requisições 175 (201) e 176 (409) no MCP.
**Sugestão:** `submitOnce` de `lib/`, como em `RoomFormPages.tsx`. O CA-11.a cobriu quarto e categoria, não hóspede. Repassado.

## Melhorias de uso (🟢)

1. **[Tela, mudança de hoje] Na grade da comanda só o primeiro cartão tem borda.** Em `lg`/`xl`, o `lg:divide-y-0` zera a borda de cima e de baixo de todos os itens depois do primeiro, e as laterais ficam com a cor do `divide` (`gray-100`). Medido: "Mesa 3" com borda de 1 px em volta (`rgb(229,231,235)`); os outros com 0 em cima e embaixo. Na captura, o primeiro cartão tem contorno e os demais não (`contas_1366.png`, `mcp/…` e `teclado_comanda-abrir-conta_1366.png`). Não quebra regra escrita, mas não é o que o código pretende (`lg:border` no `li`). Sugestão: tirar o `divide-y` no `lg` com `lg:divide-y-0` **e** pôr a borda no `li` com especificidade maior (ex.: `lg:[&>li]:border`), ou trocar o `divide` por `border-b` só abaixo do `lg`.
2. **[Hoje, mudança de hoje] A linha da chegada vencida ainda ocupa 4 linhas em 1366.** Com `sm:max-w-60` o motivo quebra embaixo do botão, mas a 1366 (duas colunas de blocos) o nome, o selo "Confirmada", o quarto e o "Atrasada · 24/11" seguem em quatro linhas (`hoje_1366.png`, linha do 201, contra três da linha do 102). Em 1855 fica numa linha só. **Quem ganha:** a recepcionista no balcão de 1366, que lê as chegadas de relance. Sugestão: em vez de botão + motivo, um texto curto "Vencida — cancele" com link para a reserva.
3. **[Hoje] A chegada vencida manda cancelar, mas não tem como cancelar na linha.** O motivo diz "Cancele a reserva em vez de fazer o check-in", e a recepcionista precisa clicar no nome, ir ao detalhe e clicar em "Cancelar reserva" e na confirmação: 3 cliques e uma troca de tela no pico do check-in. Sugestão: um link "Abrir reserva para cancelar" no próprio motivo.
4. **[Comanda, celular do garçom] 6 px de cardápio aparecem embaixo do total fixo.** O garçom não tem barra embaixo, então o rodapé fica a `max(6px, env(safe-area-inset-bottom))` da borda, e o cartão "Lavanderia (peça)" aparece nessa faixa quando rola por baixo (`rodape-celular_garcom_conta_y0_390.png`, medida: base do rodapé 838 numa janela de 844; `elementFromPoint` em 841 px pega o cartão). O conserto de hoje (sombra na cor do fundo) vale só do `md` em diante. Sugestão: a mesma sombra também abaixo do `md` quando `--tabbar` for 0.
5. **[Conta da reserva, leitura] O erro "Escolha como o hóspede pagou." vai para o campo do valor.** Sem meio de pagamento marcado, o campo "Valor recebido (R$)" fica `invalid` e o nome dele passa a incluir o erro, enquanto o grupo "Como o hóspede pagou" não muda. O leitor de tela diz que o valor está errado (snapshot do MCP: `textbox "Valor recebido (R$) Escolha como o hóspede pagou." [invalid]`). Sugestão: `aria-describedby` e `aria-invalid` no grupo dos meios.
6. **[Comanda, teclado] O foco nos cartões da grade usa o contorno padrão do navegador** (`outline rgb(16,16,16)`), não o anel da marca dos botões ao lado ("Sair" e "Abrir conta" têm o anel de 2 px). Visível, mas destoa (`rede_teclado_saida.json`, passos 12–14). Sugestão: `focus-visible:ring-2 ring-brand` no `Link` do cartão.
7. **[Hoje, número longo] Na fita, números longos com o mesmo começo ficam iguais** ("E2E4…" aparece três vezes em 1366; `hoje_1366.png`). O nome inteiro está no `aria-label` e no detalhe, mas quem olha precisa abrir um a um. Só aparece com o dado do e2e; em hotel real, com "Chalé 12" e "Chalé 13", o corte seria parecido. Sugestão: cortar pelo meio ("E2…762") ou aumentar a largura mínima da caixa quando o andar tem número longo.

Menor, sem item próprio: no detalhe do quarto em 390, a categoria quebra começando a linha com "·" ("· E2E Categoria / 468762", `hoje_detalhe-quarto-longo_390.png`).

## Comparação com a linha de base de 24/11
| Linha de base (24/11) | Hoje (26/11) |
|---|---|
| 🟡 Anel de foco do `secondary`/`ghost` abaixo de 3:1 | O "Sair" e o "Abrir conta" mostram anel de 2 px pelo teclado (`rede_teclado_saida.json`). Não recalculei o contraste de todos os `secondary` |
| 🟢 R-7: telas com larguras diferentes, o miolo "pula" | **Resolvido.** Listas na coluna inteira, detalhe e formulários à esquerda com a mesma borda esquerda (268 px em 1366) |
| 🟢 Garçom com barra lateral de 236 px e barra de baixo com um item | **Resolvido.** O garçom não tem barra: a lista começa em 32 px no tablet e o total desce até o pé no celular |
| 🟢 Nome do hotel sem `title` | **Resolvido** (o topo tem `[title]`) |
| 🟢 F2: botões de cabeçalho com dois tamanhos | Comanda, Reservas e Hóspedes usam o compacto no cabeçalho do desktop. A paginação de Reservas continua com 48 px em 1366 (`reservas_1855.png`) |
| 🟢 F3: carregamento só com "—" | Não reproduzi (a API respondeu rápido) |
| 🟢 F3: "Em limpeza" depende do analytics | **Continua** (pergunta ao Gabriel na linha de base): com o analytics fora, a fita conta "Em limpeza 2" pelo core e o bloco "Em limpeza" mostra o erro dos alertas (`mcp/hoje_analytics-fora_768.png`) |
| 🟢 F4: detalhe centralizado; ações lado a lado com duas desabilitadas | **Resolvido.** A ação principal vem grande e sozinha ("Fazer check-in" / "Fazer check-out"), as outras menores embaixo com o motivo |
| 🟢 F4: link do nome do hóspede no cabeçalho com 17 px | **Continua** (`reserva-detalhe`, `reserva-vencida`, `reserva-hospedada` em 390 e 768: "Wesley Freitas 96×17"). A linha inteira não é alvo |
| 🟢 F5: Reservas no celular com 4 linhas por reserva e sem valor | **Melhorou** (2 linhas, com a caixa do quarto); o valor continua de fora no celular |
| 🟢 F5: Hóspedes com link de 17 px e CPF "—" | **Resolvido** (linha de 65 px; CPF formatado e completo, como a SPEC-09 decidiu) |
| 🟢 F5: Quartos com abas sublinhadas × Reservas com botões de filtro | **Continua** (papéis diferentes, aceitável) |
| 🟢 F6: faixa branca do total passando das laterais | **Resolvido.** No tablet/desktop vira cartão na largura da coluna |
| 🟢 F7: Usuários com texto de desenvolvedor | Fora do menu (SPEC-09); não abri a URL |
| Rolagem lateral 0 em tudo | **Igual**: 0 nas 78 combinações e no zoom de 200% |

## Já conhecidos (não contam)
| O quê | Onde está registrado |
|---|---|
| Hóspedes baixa a coleção inteira e filtra no navegador | SPEC-05, CA-05.12.c `[ ]` (linha 279) |
| CPF completo na lista de hóspedes e na busca da nova reserva | SPEC-09, decisão de 15/11 (linha 46); mascarar segue como pendência de LGPD |
| Esc não fecha o "Abrir conta" | 🟢 do QA de 22/11, listado em `historico_sessao/sirlande/seed_cpfs_comanda_duplo_toque_spec11_docs_22nov2026.md:144` |
| Atenção e Em limpeza em erro com o analytics fora | Linha de base de 24/11 (pergunta ao Gabriel) e 🟡-4 de `redteam_spec10-fase3-hoje_25112026.md` |

## Repassados a outro dev
| Sev. | Achado | Onde | Dono | Repasse |
|---|---|---|---|---|
| 🟡 | Duplo clique em "Sim, fechar" → 422 com "Conta CLOSED…" | `/comanda/:id` | Sirlande (comanda) | `docs/qa/repasses/para_sirlande_26112026.md` |
| 🟡 | Duplo clique em "Cadastrar" hóspede → 409 falso | `/hospedes/novo` | Sirlande (ficha do hóspede) | `docs/qa/repasses/para_sirlande_26112026.md` |

Os dois também estão acima, marcados como anteriores à SPEC-10: são de telas desta passada, mas o código é o mesmo da `develop`.

## Mapa de cobertura
| Eixo (§3) | Tentado? | Como | Resultado |
|---|---|---|---|
| Entrada | Sim | Nome de mesa com 70 caracteres, emoji, `<b>x</b>` e espaços nas pontas; nome de hóspede com 82 caracteres; valor `1.234,56`, `150.5`, `150,00` | Texto escapado e aparado; corta sem quebrar o layout em 390 e 1366; valores lidos certo, aviso de "a devolver" com o excedente certo |
| Tempo | Sim | Duplo clique em "Abrir mesa", "Cadastrar" (hóspede), "Confirmar reserva", "Registrar pagamento", "Confirmar check-out", "Sim, fechar" | 1 requisição em quatro; 2 em "Cadastrar" e "Sim, fechar" (🟡, anteriores) |
| Rede | Sim | `rede_teclado.mjs`: `setOffline` na comanda do garçom; atraso de 4 s e 502 em `/api/accounts`, `/reservations`, `/guests`, `/rooms` | Fila honesta e 1 item por toque na volta; "Carregando…" e erro com "Tentar de novo" nas quatro listas |
| Sessão e papéis | Sim | Garçom em `/reservas` → `/comanda`; recepção em `/indicadores` → `/`; garçom sem "Receber/Fechar" | Bloqueios mantidos. Outro hotel não testado nesta passada (ver abaixo) |
| Tela | Sim | 390, 768, 1366 e 1855 em todas as telas do pedido; 1023/1024 e 1280 com toque na comanda; zoom de 200% em 5 telas | Sem rolagem lateral; listas alinhadas com o "Sair"; grade só do `lg` em diante |
| Teclado | Sim | Tab do início em `/comanda` (14 passos), Enter no "Abrir conta", Esc | Ordem certa, foco visível; Esc não fecha (já conhecido); cartões com contorno padrão (🟢 6) |
| Leitura | Sim | `browser_snapshot` do Hoje, comanda, nova reserva e conta | Botões com nome, `status` nos avisos, `tablist`/`tab`; erro do meio de pagamento no campo errado (🟢 5) |
| Estados | Sim | Lento, 502, vazio da conta nova ("Nada lançado ainda…"), conta fechada (cardápio desabilitado com motivo), analytics fora | Os quatro estados presentes |
| Domínio | Sim | Reserva → check-in → pagamento → check-out → comprovante; fechar mesa com saldo; reserva vencida no Hoje | Saldo bate com as linhas; confirmação antes do check-out e do fechamento; fita com a vencida (🟡) |
| Toque 48 px | Sim | Medida de todo alvo < 44 px em 390 e 768; fita em 768 | Só o link do nome no cabeçalho da reserva (17 px, já na linha de base); fita com 48×54 |
| Contraste | Parcial | Leitura do anel de foco pelo `box-shadow` | Anel de 2 px no "Sair"/"Abrir conta"; não recalculei as razões de cor (a F2 tratou) |

## Não foi possível testar
- **Mesmos dados do começo ao fim:** o ambiente foi trocado de `gesway_integracao` para `gesway_ensaio` às ~19:45 (ver "Ambiente"). A chegada vencida e os números longos só existem no primeiro; os fluxos foram no segundo.
- **Indicadores com dados no ensaio e o Hoje completo depois da troca:** o analytics do `gesway_ensaio` não tem porta no host (500 pelo Vite). Os Indicadores com dados estão nas capturas do primeiro ambiente (`indicadores_*.png`).
- **Usuário de outro hotel:** não havia login de outro tenant nos dados passados; a linha de base cobriu.
- **Área segura real do iPhone, tema escuro e movimento reduzido:** mesmas limitações da linha de base.

## Comandos rodados pelo Bash
```
cd wt-integracao && git branch --show-current && git log --oneline -5 && ls docs/qa/ && wc -l <3 docs>
cat frontend/DESIGN_PMS.md docs/specs/anexos/SPEC-10-estudo-responsividade.md docs/qa/exploratorio_linha_base_spec10_24112026.md
ls evidencias/linha_base_spec10_24112026; ls -d /tmp/gesway-qa-explorador-*; ss -ltnp | grep portas
head capturas.mjs da linha de base; grep/sed scripts/qa_explorador_ambiente.sh (leitura)
node -e '<trecho do ambiente_rede do qa_explorador_ambiente.sh>' > evidencias/final_spec10_26112026/ambiente.env   (só os caminhos do Playwright do MCP)
curl POST localhost:3000/auth/login (admin) e GET /reservations, /guests, /rooms, /room-categories, /accounts?status=OPEN, /products
grep -n path= App.tsx; git diff --stat/diff b522db0..HEAD -- frontend/apps/pms/src
cat > dados.json; cat > capturas.mjs; node capturas.mjs dados.json   (com set -a; source ambiente.env; LD_LIBRARY_PATH=$QA_LD_LIBRARY_PATH)
cat > rodape_detalhe.mjs; node rodape_detalhe.mjs dados.json
curl GET /reservations/598c… (status do Wesley); ps aux | grep playwright/e2e; curl GET /reservations (últimas alteradas)
docker ps; docker logs (backend, nginx) --since/--tail; docker exec postgres psql \dt e uma consulta ao outbox (falhou: coluna inexistente)
cat > rede_teclado.mjs; node rede_teclado.mjs (1ª: login 500 na troca de ambiente; 2ª: erro do route.continue; 3ª: ok)
curl POST /auth/login (garçom e admin, 500 durante a troca); docker ps (status, portas); ls keys; curl /health
curl GET /accounts, /rooms, /reservations no ensaio; curl POST /accounts {"type":"TABLE","label":"QA 26/11 Mesa offline"}
sed/python3 nos scripts (CONTA, try/catch do route, rolagem); curl GET /accounts/b8a0… (itens)
cat > rodape_garcom.mjs; node rodape_garcom.mjs (QA_Y=250 e QA_Y=0); cat > rodape_fila.mjs; node rodape_fila.mjs (offline, toca Pudim e desfaz)
grep em docs/specs, docs/qa e no código (vencida, duplo, mascar, CPF, Sim, fechar, isPending, submitOnce); git show develop:<arquivos> | grep
python3 (PIL) para recortar e juntar capturas na pasta do scratchpad
curl GET /api/analytics/{alerts,occupancy} pelo Vite (500); docker ps | grep analytics
mkdir mcp; cp capturas do MCP para evidencias/final_spec10_26112026/mcp/
cat >> docs/qa/repasses/para_sirlande_26112026.md
```
Pelo MCP (navegador): logins dos três papéis, Hoje (detalhe do 201), comanda do garçom (abrir mesa, lançar, desfazer), novo hóspede, nova reserva, check-in, pagamento, check-out, comprovante e fechamento da mesa. Evidências em `docs/qa/evidencias/final_spec10_26112026/` (scripts, `medidas.json`, `rodape_detalhe_saida.json`, `rede_teclado_saida.json`, capturas `<tela>_<largura>.png` e `mcp/`).
