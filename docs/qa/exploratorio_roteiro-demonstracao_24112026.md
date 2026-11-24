# QA explorador — Roteiro da demonstração (passos 1 a 7)
**Branch:** `develop` (`bf9cafe`, congelamento de 24/11) · **Tela(s):** `/quartos`, `/quartos/categorias/nova`, `/quartos/novo`, `/reservas/nova`, `/reservas/:id` (Resumo e Conta), `/reservas/:id/comprovante`, `/comanda`, `/comanda/:id`, `/` (Hoje), `/indicadores`, API pública `/public/aurora/*` · **Data:** 24/11/2026 · **Papéis usados:** ADMIN (`admin@aurora.example`, `admin@sol.example`), RECEPTIONIST (`recep1@aurora.example`, `recep2@aurora.example`), WAITER (`garcom@aurora.example`), hóspede anônimo (API pública)
**Viewports:** 360×780 (garçom e conta), 800×900 (balcão estreito), 1280×800/900 (balcão), 1280 com zoom de 200% (640×400) · **Achados no escopo:** 13 (🔴 0 · 🟡 5 · 🟢 8) · **Já conhecidos (não contam):** 4 · **Repassados:** 13 (os do escopo, ao dono de cada tela)

## Veredito para a demonstração
**Pronto com ressalvas.**

Formato do agente: **APROVADO COM RESSALVAS**. Não houve 🔴 novo, e os 8 passos do roteiro fecham. Dois riscos já conhecidos (abaixo) podem aparecer se a banca improvisar, e convém combinar a resposta antes.

O que resistiu ao estresse:
- **Passo 1:**
  - nome de categoria repetido e número de quarto repetido (inclusive `" 101 "`) recusados com mensagem;
  - diária `150.5`, `1.234,56` e `0,01` gravadas certas;
  - diária negativa e capacidade 0 recusadas no campo;
  - o duplo clique em "Cadastrar categoria" grava uma vez só.
- **Passo 2:**
  - CPF com dígito errado e CPF repetido recusados;
  - saída antes da entrada e entrada no passado recusadas;
  - o valor aparece antes de confirmar (5 × R$ 150,50 = R$ 752,50; 1 × R$ 150,50);
  - um POST só no duplo clique em "Confirmar reserva" e um PUT só no duplo clique em "Fazer check-in";
  - a janela do check-in funciona na tela (botão desabilitado com "Check-in só a partir de 26/11/2026.") e na API (422 `CHECK_IN_TOO_EARLY`);
  - `<b>Teste</b>` e emoji aparecem como texto.
- **Passo 3 (360 px):**
  - toques repetidos somam na mesma linha ("Desfazer 1");
  - o desfazer funciona;
  - sem rede, os itens ficam "Na fila", com faixa e contagem, e sobem sozinhos quando a rede volta, sem duplicar (3 Pudim + 1 Água conferidos no servidor);
  - um 502 no envio mantém o item na fila e reenvia;
  - com rede lenta (4 s), toques no meio do envio não duplicam;
  - nenhuma rolagem lateral e nenhum alvo abaixo de 48 px.
- **Passo 4:**
  - números coerentes com o seed: chegadas 201 (com sinal) e 102 (sem sinal, risco de no-show), 4 na casa, saída da 107, 105 em limpeza;
  - depois das ações, eles acompanham (16 quartos, 5 ocupados, 31,3%);
  - "Liberar quarto" pede confirmação;
  - o 2º balcão recebe "O quarto 105 já não está em limpeza — outro atendimento mudou a situação dele";
  - sem rede: "Sem conexão: o painel mostra o último dado carregado…";
  - com 502: erro com "Tentar de novo" em cada bloco.
- **Passo 5:**
  - a soma da linha do tempo bate (R$ 366,50);
  - o saldo vem preenchido;
  - o 2º balcão com a tela velha é barrado ("A conta já foi quitada em outro registro. Nada foi registrado.");
  - o pagamento a maior pede confirmação;
  - o check-out pede confirmação e grava um PUT só no duplo clique;
  - dois check-outs simultâneos pela API: 200 e 422.
- **Passo 6:**
  - disponibilidade, booking, status `PENDING` → `CONFIRMED` com `deposit.status = PAID`;
  - o webhook repetido responde `already_processed` sem duplicar o pagamento;
  - categoria da Sol no Aurora → 404;
  - a reserva aparece confirmada em "Próximos 30 dias".
- **Passo 7:** "Recebido hoje" de R$ 1.858,00 e "Dinheiro 3 · R$ 1.033,00" batem com os pagamentos feitos. Recepção e garçom não abrem `/indicadores`.
- **Isolamento:**
  - o garçom cai em `/comanda` em todas as rotas de recepção, e a API dá 403;
  - a recepção recebe 403 ao criar quarto ou categoria;
  - o admin da Sol recebe 404 em reserva, conta, conta da estadia, hóspede, quarto e categoria do Aurora, inclusive para liberar quarto e pagar.

**Riscos já conhecidos que a banca pode provocar ao vivo** (não contam no veredito):
- **Dois balcões ao mesmo tempo gravam o pagamento duas vezes.** A fala do passo 5 ("outro balcão pode ter recebido no meio") convida o teste. Reproduzi: com os cliques simultâneos, R$ 366,50 entrou duas vezes e a conta ficou com R$ 366,50 a devolver. O caso sequencial é barrado. Já registrado: anexo `SPEC-05-decisoes-CA-05.6.a.md`, P-8 e "Em aberto" item 7, para o 5º semestre. **Sugestão para o dia:** mostrar o caso sequencial (abrir a conta em duas janelas, receber numa e tentar na outra), que a tela barra.
- **A reserva pública aceita data no passado** e gera PIX (`check_in` 01/11/2026 → 201 com sinal de R$ 90,00). Já registrado em `docs/roteiro/PASSO_6_RESERVA_DIRETA_PIX.md`, "Pendências conhecidas".

## Ambiente (exceção autorizada ao §5)
- O orquestrador autorizou usar a pilha real da demonstração em vez do `scripts/qa_explorador_ambiente.sh` e do banco `gestao_hotel_qa`:
  - compose descartável `COMPOSE_PROJECT_NAME=gesway_teste`, com seed do dia;
  - Vite na `:5173` com proxy `/api` para o nginx;
  - backend direto na `:3000` para a API pública.
- Não subi, não derrubei e não reiniciei nada. O compose e o Vite ficaram no ar o tempo todo.
- Não li o `.env`.
- Os caminhos do Playwright do MCP saíram do mesmo trecho de `node` da função `ambiente_rede` do script do ambiente, gravados em `<scratchpad>/ambiente.env`.
- As sessões dos scripts são o JSON do `persist` do login (`storage_<papel>.json`). Ficaram no scratchpad da sessão, fora do repositório, porque contêm token.
- **Como reproduzir um script:**

  ```bash
  set -a; source <scratchpad>/ambiente.env; set +a
  cd docs/qa/evidencias/roteiro-demonstracao_24112026
  LD_LIBRARY_PATH=$QA_LD_LIBRARY_PATH node <script> <args>
  ```

  Para gerar o `storage_<papel>.json`: faça `POST /api/auth/login` e grave `{"state":{"token":…,"user":…},"version":0}`.
- **Dados criados no Aurora**, todos fictícios, e-mails `@qa.test`:
  - categorias "QA Suíte Teste" (R$ 150,50), "qa suíte teste" (R$ 1.234,56) e "QA Duplo Clique" (R$ 0,01);
  - quarto 902 (andar -5);
  - hóspedes "QA Hóspede `<b>Teste</b>` 😀" (CPF 111.444.777-35), "QA Publico Um", "QA Publico Dois" e "QA X" (CPF 111.111.111-11, aceito pela API pública);
  - reservas:
    - 902 (check-out feito);
    - 101 (26 a 28/11, pendente);
    - 201, 102 e 107 do seed (check-in ou check-out feitos);
    - quatro reservas públicas: duas em 15 a 18/12, uma delas confirmada pelo PIX; uma em 01 a 03/11; e uma com `guests: 0`;
  - mesa "Mesa 3" duplicada;
  - pagamentos de R$ 733,00 (dois de R$ 366,50) na 902, R$ 300,00 na 107 e R$ 315,00 de PIX.

  O compose vai ser derrubado com `down -v`, como combinado.

## Achados no escopo

### 🟡-1 [Domínio / Leitura] A conta e o comprovante mostram o total da linha sem a quantidade: "Caipirinha R$ 66,00"
**Onde:**
- `/reservas/:id?aba=conta`, tabela "Lançamentos da conta em ordem cronológica";
- `/reservas/:id/comprovante`;
- a origem é a resposta de `GET /reservations/:id/bill` (`consumptions[]` só tem `description` e `amount`).

**Passos:**
1. Como garçom, na conta da suíte 902, tocar 3 vezes em "Caipirinha R$ 22,00", esperar o envio e tocar uma vez em "Porção de fritas".
2. Tocar mais 2 vezes em "Porção de fritas" depois que a primeira subiu.
3. Como recepção, abrir a reserva da 902 → aba "Conta" e o "Comprovante para imprimir".

**Esperado:** cada linha diz quanto foi consumido e a que preço. Por exemplo, "3 × Caipirinha" com R$ 66,00, ou o unitário de R$ 22,00. A própria tela de check-out pede "Confira a conta abaixo com o hóspede". O garçom vê "3×Caipirinha" na comanda.

Regras:
- `DESIGN_PMS.md` §2 (a conta da reserva, RF-016, combina diárias e consumos);
- §5 (dinheiro sem erro de leitura);
- passo 5 do roteiro ("a banca vê a conta em linha do tempo").

**Obtido:**
- "Caipirinha R$ 66,00", sem quantidade, quando o cardápio diz R$ 22,00;
- "Porção de fritas R$ 32,00" e, logo abaixo, "Porção de fritas R$ 64,00".

O hóspede (ou a banca) lê uma caipirinha de R$ 66,00 e duas porções com preços diferentes. A quantidade existe no servidor: `GET /accounts/:id` devolve `3x Caipirinha`. Só a conta da reserva a perde.

**Evidência:**
- `p5_comprovante_902_800.png`: o comprovante com as linhas sem quantidade;
- `p5_902_pago_em_dobro_800.png`: a linha do tempo;
- `p3_offline_3_rede_voltou.aria.yml`: a comanda com "3×Pudim", para contraste;
- `GET /reservations/86f6035d…/bill` responde `{"description":"Caipirinha","amount":66}`.

**Sugestão:**
- no `GetBillController`, incluir `quantity` e `unit_price` em cada item de `consumptions`, só acrescentando campos, sem mudar os que existem;
- no `BillTimeline` e no comprovante, mostrar "3 × Caipirinha" quando `quantity > 1`.

**Dono:** Gabriel (linha do tempo e comprovante) e Sirlande (`GetBillController`, SPEC-04). Repassado aos dois.

### 🟡-2 [Tela] A linha do tempo da conta esconde o dinheiro: corta o último dígito do saldo em 800 px e deixa "Valor" e "Saldo" fora da tela em 360 px
**Onde:** `/reservas/:id?aba=conta`, tabela da linha do tempo (contêiner `overflow-x-auto`)

**Passos:**
1. Como recepção, com a janela em 800×900, abrir a reserva da 902 → aba "Conta".
2. Repetir em 360×780 na reserva da 201.

**Esperado:** valor e saldo visíveis com as duas casas. Regras: `DESIGN_PMS.md` §5 ("símbolo e duas casas sempre visíveis") e critério do time ("nenhuma rolagem lateral").

**Obtido:**
- **Em 800 px:** a tabela tem 520 px num contêiner de 514 px. A coluna "Saldo" aparece cortada: "R$ 150,5", "R$ 216,5" e "R$ 366,50 crédit…". Os 6 px que faltam só aparecem com rolagem lateral dentro do cartão.
- **Em 360 px:** o contêiner tem 294 px. Só "Quando" e "Lançamento" aparecem, e nenhum valor fica visível sem arrastar a tabela.

**Evidência:**
- `p5_902_pago_em_dobro_800.png`: a coluna "Saldo" cortada na borda direita;
- `p5_conta_201_360.png`: só data e lançamento, sem valores;
- medição pelo `evaluate`: `table 520 px` contra `overflow-x-auto 514 px` (800) e `294 px` (360).

**Sugestão:**
- em larguras estreitas, juntar "Quando" e "Lançamento" numa célula de duas linhas, ou esconder a coluna "Saldo" abaixo de `md` (o total fica no rodapé);
- encurtar a data com hora.

**Dono:** Gabriel.

### 🟡-3 [Entrada / API pública] Data que não existe no calendário (`2026-02-30`) derruba a disponibilidade e o booking com 500
**Onde:**
- `GET /public/aurora/availability`;
- `POST /public/aurora/bookings`.

Os dois ficam no Swagger, seção "Reserva Direta (Público)", sem login.

**Passos:**
1. `curl "http://localhost:3000/public/aurora/availability?check_in=2026-02-30&check_out=2026-03-02"`
2. `POST /public/aurora/bookings` com `"check_in":"2026-02-30","check_out":"2026-03-02"` e um `category_id` válido.

**Esperado:** 400 "data inválida". O balcão já faz isso desde a SPEC-11 (`app/utils/isIsoDate.js`: "só string `YYYY-MM-DD` que existe no calendário"). Regra: entrada inválida é 4xx (Fail Fast, `CODING_STANDARDS`).

**Obtido:** `{"error":"Erro interno do servidor"} [HTTP 500]` nos dois. A banca digita datas no Swagger: um erro de digitação vira "erro interno" na frente dela e sobe a taxa de 5xx que o passo 8 mostra no Grafana.

**Evidência:** saída do `curl` em "Comandos rodados" (itens 14 e 15).

**Sugestão:** usar o `isIsoDate` no `GetAvailabilityController` e no `CreateBookingController`, antes de qualquer conta, com 400.

**Dono:** Gabriel (T-06.5).

O caso parecido do status com id que não é UUID (500) já está no repasse `para_gabriel_15112026.md`: já conhecido.

### 🟡-4 [Entrada / Domínio] A reserva pública grava hóspede com CPF de dígito errado no plano B (PIX simulado)
**Onde:** `POST /public/aurora/bookings`, `CreateBookingController.js:104-107`

**Passos:**
1. `POST /public/aurora/bookings` com `"guest":{"full_name":"QA X","email":"x@qa.test","cpf":"111.111.111-11"}` (com `PIX_PROVIDER=fake`, o do plano B).
2. Como recepção, listar os hóspedes.

**Esperado:** 400 `guest.cpf inválido` sempre que o CPF vier preenchido, como no balcão. O guia do passo 2 diz à banca que "o sistema recusa CPF com dígito errado". A SPEC-11 fechou o balcão com essa regra.

**Obtido:**
- 201;
- o hóspede "QA X" entra na base com `cpf: "11111111111"`;
- a reserva aparece em "Próximos 30 dias".

A validação só roda quando o provedor exige CPF (Asaas). Num ensaio com plano B, a pergunta "e se o CPF for inválido?" feita no Swagger tem a resposta contrária à do balcão.

**Evidência:** saída do `curl` (item 16) e `GET /guests`, que lista `QA X 11111111111 x@qa.test`.

**Sugestão:** validar `isValidCpf` sempre que `guest.cpf` vier preenchido. O CPF continua opcional no fake e no Mercado Pago.

**Dono:** Gabriel (T-06.5).

### 🟡-5 [Papéis] A recepção vê "Novo quarto", "Nova categoria" e "Editar", e o clique a leva para "Hoje" sem dizer por quê
**Onde:**
- `/quartos`: botão "Novo quarto" e links "Editar quarto N";
- `/quartos/categorias`: botão "Nova categoria" e links "Editar categoria X".

**Passos:**
1. Entrar como `recep1@aurora.example` e abrir "Quartos".
2. Clicar em "Novo quarto" ou em "Editar".

**Esperado:** ação proibida não aparece, ou aparece desabilitada com o motivo. O `roomsRoutes.tsx` documenta a recepção "em modo leitura". Regra: critério de domínio "ação proibida aparece desabilitada com o motivo", §3 do agente.

**Obtido:**
- os botões e links aparecem iguais aos do administrador;
- o clique leva a `/`, o painel Hoje, sem aviso;
- pela API, a criação dá 403.

Para a recepcionista, o botão "não funciona". Se a banca abrir "Quartos" na janela da recepção, é o que verá.

**Evidência:**
- `p8_papeis_rotas.mjs` (saída: `recep /quartos/novo -> /`, `recep /quartos/categorias/nova -> /`, e a lista de botões "Novo quarto / Editar…" em `/quartos`);
- `POST /room-categories` como recepção → 403.

**Sugestão:** em `RoomsListPage` e `CategoriesListPage`, mostrar "Novo quarto", "Nova categoria" e "Editar" só para ADMIN, que é o mesmo gate do `roomsAdminRoutes`.

**Dono:** DONO INDEFINIDO (T-05.1, "de quem terminar primeiro"; o histórico tem commits do Gabriel e do Sirlande).

## Melhorias de uso (🟢)
1. **Categoria com o mesmo nome em outra caixa é aceita.** "QA Suíte Teste" e "qa suíte teste" convivem. No passo 2, o seletor de categoria do quarto mostra duas opções quase iguais com diárias diferentes (R$ 150,50 e R$ 1.234,56).
   - **Quem ganha:** o administrador. Evita escolher a errada e só descobrir no valor da reserva.
   - **Sugestão:** unicidade por `lower(trim(name))`.
   - **Dono:** Gabriel (`CreateRoomCategoryController`).
   - **Evidência:** `mcp/page-2026-11-24T22-11-45-306Z.yml` (as opções do seletor).
2. **CPF repetido sem atalho para o hóspede que já existe.** "CPF ou e-mail já cadastrado para outro hóspede." não oferece "Usar este hóspede".
   - **Quem ganha:** a recepcionista com fila. Hoje ela precisa clicar "Voltar à busca", digitar 3 letras do nome, esperar e escolher: 3 a 4 ações e alguns segundos a mais por hóspede que volta.
   - **Dono:** Gabriel (`GuestPicker`).
3. **"Liberar quarto" sem rede diz "Liberando…" sem fim, com o "Voltar" travado.** Envia sozinho quando a rede volta, o que é honesto, mas o botão não diz "Sem conexão…" como o "Abrir mesa" da comanda, e não dá para desistir.
   - **Quem ganha:** a recepção.
   - **Evidência:** `p4_hoje_rede.mjs liberar-offline` → `p4_liberar-offline_1_confirmou_sem_rede_1280.aria.yml` (`button "Liberando…" [disabled]`, `button "Voltar" [disabled]`).
   - **Dono:** Gabriel (painel do dia).
4. **No celular de 360 px, o nome do item na fila sai cortado: "Cerveja l…".**
   - **Quem ganha:** o garçom, que confere o que lançou antes de o desfazer sumir. "Cerveja long neck" e outra cerveja ficariam iguais.
   - **Evidência:** `p3_mesa_lancamento_360.png`.
   - **Dono:** Sirlande (`ItemList`).
5. **Entrada no passado só é recusada ao confirmar.** Na nova reserva, com a entrada em 20/11, a tela lista quartos livres, soma "5 diárias, R$ 752,50" e só no "Confirmar reserva" diz "A data de entrada (20/11/2026) já passou".
   - **Quem ganha:** a recepcionista. Avisar junto ao campo "Entrada" poupa a escolha do quarto.
   - **Dono:** Gabriel.
6. **Com 502, o bloco "Saídas" do painel diz "Não foi possível carregar os hóspedes na casa".** A busca é a mesma, mas o texto fala do bloco vizinho.
   - **Evidência:** `p4_502_1_1280.aria.yml`.
   - **Dono:** Gabriel.
7. **Na comanda, um 502 do servidor aparece como "Sem conexão: os lançamentos serão enviados quando a rede voltar."** O item fica honestamente "Na fila" e sobe depois, mas o garçom vai conferir o Wi-Fi, que está bom.
   - **Sugestão:** "O sistema não respondeu: o lançamento fica na fila."
   - **Evidência:** `p3_502_1_apos_502.aria.yml`.
   - **Dono:** Sirlande.
8. **A fala do passo 7 no guia promete mais do que o painel entrega.** O guia diz "Se o analytics cair, a recepção continua funcionando", e a tabela "Se algo der errado" diz que "os outros passos não dependem dele". Com o analytics em 502, o painel Hoje do passo 4 perde os cartões, a lista "Atenção" e o bloco "Em limpeza" com o "Liberar quarto". Reservas, check-in, check-out e pagamento continuam.
   - A falta dos cartões já está na SPEC-11 ("Painel Hoje sem os cartões quando o analytics cai", 5º semestre); a frase do guia não está.
   - **Sugestão:** ajustar a fala para "a operação do balcão continua: reservas, check-in, check-out e pagamento; o painel do dia perde os números".
   - **Evidência:** `p4_hoje_rede.mjs 502-analytics` → `p4_502-analytics_1_1280.aria.yml`.
   - **Dono:** Gabriel e Sirlande (o guia tem commits dos dois).

## Já conhecidos (não contam no veredito)
| Achado | Onde está registrado | O que vi hoje |
|---|---|---|
| Dois balcões ao mesmo tempo gravam o pagamento duas vezes | `docs/specs/anexos/SPEC-05-decisoes-CA-05.6.a.md`, P-8 e "Em aberto" item 7 (5º semestre) | Reproduzido: `p5_dois_balcoes.mjs simultaneo`. Dois `POST /payments` 201 de R$ 366,50 e a conta ficou com R$ 366,50 a devolver (`p5_902_pago_em_dobro_800.png`). O modo `sequencial` é barrado |
| Reserva pública com data no passado | `docs/roteiro/PASSO_6_RESERVA_DIRETA_PIX.md`, "Pendências conhecidas" | `check_in` 01/11 → 201 com PIX de R$ 90,00. A disponibilidade também responde para datas passadas |
| `GET /public/:sub/bookings/:id/status` com id não-UUID → 500 | `docs/qa/repasses/para_gabriel_15112026.md` | Continua 500 |
| Esc não fecha a confirmação do pagamento a maior | anexo CA-05.6.a, "Em aberto" item 8 | Não retestado |

## Repassados a outro dev
| Sev. | Achado | Onde | Dono | Repasse |
|---|---|---|---|---|
| 🟡 | Conta e comprovante sem quantidade | `BillTimeline`, comprovante, `GetBillController` | Gabriel e Sirlande | `para_gabriel_24112026.md`, `para_sirlande_24112026.md` |
| 🟡 | Linha do tempo corta o dinheiro (800 e 360) | `BillTimeline` | Gabriel | `para_gabriel_24112026.md` |
| 🟡 | Data inexistente → 500 na API pública | `GetAvailabilityController`, `CreateBookingController` | Gabriel | `para_gabriel_24112026.md` |
| 🟡 | CPF inválido gravado pela reserva pública (fake) | `CreateBookingController` | Gabriel | `para_gabriel_24112026.md` |
| 🟡 | Recepção vê ações de admin em Quartos | `RoomsListPage`, `CategoriesListPage` | DONO INDEFINIDO | `para_dono-indefinido_24112026.md` |
| 🟢 | 1, 2, 3, 5, 6 e 8 das melhorias | ver acima | Gabriel (o 8 também ao Sirlande) | `para_gabriel_24112026.md`, `para_sirlande_24112026.md` |
| 🟢 | 4 e 7 das melhorias | comanda | Sirlande | `para_sirlande_24112026.md` |

Nenhum achado fica fora das telas do roteiro. Os repasses levam cada achado ao dono da tela, como pediu o orquestrador.

## Mapa de cobertura
| Eixo (§3) | Tentado? | Como | Resultado |
|---|---|---|---|
| Entrada | Sim | **Categoria:** vazio, `-10`, capacidade 0, `150.5`, `1.234,56`, `0,01`, nome repetido, repetido com outra caixa e espaços. **Quarto:** `101`, `" 101 "`, andar `-5`. **Hóspede:** `<b>Teste</b>` + emoji, CPF `123.456.789-00`, CPF do seed, CPF válido novo. **Datas:** saída antes da entrada, entrada no passado. **Pagamento:** `4900` acima do saldo. **API pública:** datas invertidas, iguais, no passado, `2026-02-30`, 734 noites, `guests` 0/-3/abc/9, categoria de outro hotel, CPF `111.111.111-11`, sem hóspede, JSON quebrado, subdomínio inexistente, id não-UUID | 🟡-3, 🟡-4, 🟢-1, 🟢-5. O resto recusa com mensagem ou grava certo |
| Tempo | Sim | Duplo clique em cadastrar categoria, confirmar reserva, check-in, liberar quarto e confirmar check-out; toques repetidos no cardápio; dois balcões simultâneos e sequenciais no pagamento; check-out e check-in simultâneos pela API; webhook PIX repetido | Um POST/PUT por ação. Pagamento simultâneo duplica (já conhecido) |
| Rede | Sim | Scripts do Playwright do MCP: comanda sem rede, com 502 duas vezes e com 4 s de atraso; Hoje sem rede (inclusive navegando), com 502 no core e com 502 no analytics; liberar quarto sem rede | Fila honesta e sem duplicar; painel com aviso e "Tentar de novo"; 🟢-3, 🟢-6, 🟢-7, 🟢-8 |
| Sessão e papéis | Sim | Garçom em `/`, `/reservas`, `/reservas/:id`, `/hospedes/:id`, `/quartos`, `/indicadores` e comprovante; recepção em `/quartos/novo`, `/quartos/categorias/nova`, `/indicadores`, `/config/usuarios`; API do garçom e da recepção; admin da Sol em 5 rotas e 8 chamadas do Aurora | Tudo barrado; 🟡-5 (botões visíveis). Sessão vencida no meio da tarefa **não** testada |
| Tela | Sim | 360 (comanda, conta, detalhe da reserva), 800 (Hoje, conta), 1280 (todas), 200% de zoom (Hoje, detalhe) | 🟡-2, 🟢-4. Sem rolagem lateral na página e sem alvo abaixo de 48 px na comanda e no detalhe |
| Teclado | Parcial | Ordem do Tab em `/reservas/nova` (1280) e em `/` e `/reservas/:id` (200%); Enter no campo de pagamento a maior; login por Enter | Ordem segue a leitura, foco visível (o "SEM INDICADOR" no Tab é o ícone nativo do calendário do `input type=date`). A tarefa inteira só com teclado não foi feita |
| Leitura | Sim | `browser_snapshot` e `ariaSnapshot` em todas as telas | Erros com `role="alert"`, status com `role="status"`, abas com `tablist`/`tab`, cardápio com nome e preço. O erro "A saída precisa ser depois da entrada" é parágrafo, não `alert` (detalhe, não reportado) |
| Estados | Sim | Lista vazia (conta nova), erro do servidor, sem rede, saldo negativo ("A devolver"), conta quitada | Ok |
| Domínio | Sim | Soma da conta; saldo × pagamentos; coerência do painel com o seed e depois das ações; indicadores × pagamentos do dia; máquina de estados (check-in repetido, cancelar hospedado, check-out duplo); janela do check-in | 🟡-1. O resto coerente |

## Não foi possível testar
- **Celular de verdade e modo avião.** Simulei com `context.setOffline` num Chromium de 360 px com toque. O Wi-Fi real do dia e o `--host` do Vite não foram testados.
- **Passo 6, plano A (Asaas sandbox).** O compose está com o provedor simulado. Só o plano B foi exercitado.
- **Passo 8 (Grafana).** Fora do pedido.
- **Sessão vencida no meio da tarefa, F5 logo depois de gravar e o "voltar" do navegador no meio de uma ação.** Ficaram de fora por tempo.
- **A tarefa inteira só com teclado.** Só a ordem do Tab e o foco visível.
- **Tema escuro e movimento reduzido.** Não testados.
- **Leitor de tela real.** Só a árvore de acessibilidade.
- **Login com limite de tentativas.** Já coberto no relatório de 22/11. Evitei estourar o limite de 5 por minuto para não travar a sessão.

## Comandos rodados pelo Bash
Em ordem. Os scripts de evidência estão na pasta de evidências, e `S` é o scratchpad da sessão.
1. `wc -l` e `ls` dos documentos de referência e de `docs/qa`
2. `cat docs/roteiro/GUIA_DEMONSTRACAO.md`, `frontend/DESIGN_PMS.md` e o relatório de 22/11 (leitura)
3. `COMPOSE_PROJECT_NAME=gesway_teste docker compose ps`, `curl` em `:5173`, `grep ambiente_rede scripts/qa_explorador_ambiente.sh`
4. `mkdir -p docs/qa/evidencias/roteiro-demonstracao_24112026` e o trecho de `node` da função `ambiente_rede` (lê só `mcpServers.playwright` do `~/.claude.json`) → `$S/ambiente.env`
5. `curl -X POST :5173/api/auth/login` para admin, recep1, recep2 e garçom do Aurora (tokens em `$S`, nunca impressos no relatório); `node -e` para montar `storage_<papel>.json`
6. `grep` e `sed` de leitura em `frontend/apps/pms/src` (rotas, `auth.ts`, `nav.ts`, `today`, `accounts`, `PaymentForm.tsx`) e em `services/core-service` (`CheckOutController`, `CreateReservationController`, `CreateBookingController`)
7. `$S/api.sh` (função `api`: `curl` com o token): `GET /guests`, `GET /rooms`, `POST /reservations` (101, 26 a 28/11), `PUT check-in`, `PUT cancel`
8. `node p3_garcom_offline.mjs $S/storage_garcom.json 85cfaf2f… offline`, depois `502` e `lento`
9. `api garcom GET /accounts/28dc9e29…` (item enviado antes de sair)
10. `node p4_hoje_rede.mjs $S/storage_recep1.json offline 1280`, `502`, `502-analytics`, `liberar-offline`
11. `node p5_dois_balcoes.mjs $S/storage_recep1.json $S/storage_recep2.json 86f6035d… simultaneo` (1ª execução falhou no clique do rádio; `sed -i` no próprio script de evidência e nova execução)
12. `node p5_dois_balcoes.mjs … 05a8caec… sequencial`; `grep` nos anexos (P-8, a maior)
13. `api recep1 PUT /reservations/4b46b294…/check-in` (201); `api … GET …/bill`
14. `curl :3000/public/aurora/hotel` e `availability` com 10 variações de entrada
15. `curl -X POST :3000/public/aurora/bookings` com 8 variações; `api recep1 GET /guests`
16. `curl POST bookings` válido; `curl GET …/status` (aurora, sol e não-UUID); `COMPOSE_PROJECT_NAME=gesway_teste docker compose exec -T backend node scripts/simular_pagamento_pix.js fake_5594cd94… http://localhost:3000` (duas vezes); `api … /bill`
17. `api recep1|garcom GET` em 10 rotas de analytics e de recepção; `grep` no analytics-service
18. `curl POST /api/auth/login` do `admin@sol.example`; `api sol` em 8 chamadas contra recursos do Aurora; `api recep1 POST /room-categories` e `POST /rooms`; `api garcom POST /payments`
19. `node p8_papeis_rotas.mjs` com o garçom, a recepção e a Sol
20. `git log --format=%an` dos arquivos das telas (para achar o dono); `grep` em specs, repasses e no guia do passo 6
21. `node teclado_ordem_foco.mjs` em `/reservas/nova` (1280) e em `/` e `/reservas/:id` (zoom 2)
22. `api … PUT check-out` e `PUT check-in` simultâneos (107 e 102); `api … GET /analytics/alerts` e `occupancy`
23. `git check-ignore` da pasta de evidências; `mv` dos `page-*.yml` e `console-*.log` de hoje, gerados pelo MCP na raiz de `docs/qa/evidencias/`, para `roteiro-demonstracao_24112026/mcp/`
