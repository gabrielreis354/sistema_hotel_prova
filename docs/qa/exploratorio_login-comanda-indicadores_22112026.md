# QA explorador — Login, Comanda (abrir, quantidade, receber, sem conexão) e Indicadores
**Branch:** `develop` (`4a63408`) · **Tela(s):** `/login`, `/comanda`, `/comanda/:id`, `/indicadores` · **Data:** 22/11/2026 · **Papéis usados:** WAITER (`garcom@aurora.example`), RECEPTIONIST (`recep1@aurora.example`), ADMIN (`admin@aurora.example`, `admin@sol.example`)
**Viewports:** 375×812, 768×1024, 1366×768, 640×400 (equivale a 1280 com zoom de 200%) · **Achados no escopo:** 10 (🔴 0 · 🟡 4 · 🟢 6) · **Repassados:** 0

## Ambiente (exceção ao §5)
- **Exceção autorizada pelo Sirlande nesta sessão:** em vez do `scripts/qa_explorador_ambiente.sh` e do banco `gestao_hotel_qa`, usei a stack Docker Compose descartável `gesway_teste` (develop em `4a63408`), só em localhost. A tela estava no Vite `:5273`, com o `/api` passando pelo nginx em `:80`. Não derrubei a stack e não mexi em `.env` nem em chaves.
- **O navegador do MCP não alcança a porta 5273.** O registro do MCP traz `--allowed-origins http://localhost:5173;http://localhost:3000`, e o `browser_navigate` respondeu `net::ERR_BLOCKED_BY_CLIENT`. Não mudei a configuração. Fiz **todo o teste por scripts do Playwright que veio com o MCP** (§4), rodados pelo Bash. Os caminhos do Playwright saíram do mesmo trecho de `node` da função `ambiente_rede` do script do ambiente, gravados em `ambiente.env` no scratchpad da sessão. Por isso cada achado tem um script que o reproduz. A árvore de acessibilidade vem do `locator.ariaSnapshot()` (arquivos `.aria.yml`).
- **Como reproduzir qualquer script:** `set -a; source <scratchpad>/ambiente.env; set +a; cd docs/qa/evidencias/login-comanda-indicadores_22112026 && LD_LIBRARY_PATH=$QA_LD_LIBRARY_PATH node <script> <args>`. As sessões ficam em `estado/<papel>.json` (crie com `02_login_sessoes.mjs`). Elas contêm o token dos usuários do seed de teste, por isso ficam fora do git, como toda a pasta.
- **Dados criados no Aurora** (todos com o prefixo "QA"): as mesas "QA Mesa offline 1", "QA Mesa duplo dblclick", "QA Mesa duplo enter3", "QA Mesa toque 375" e "QA Mesa toque 768", com consumos e **R$ 99,00 em pagamentos de hoje**. Esses R$ 99,00 entram no "Recebido hoje" e nos "Meios de pagamento" do Aurora. Se a stack for usada para ensaio da banca, recrie o seed. As mesas "toque" têm consumos de teste de 9999 pudins (R$ 139.986,00) e 1000 águas.

## Veredito
**APROVADO COM RESSALVAS.**

Nenhum 🔴. O que estas entregas prometem funciona:
- **Trava de duplo toque em "Abrir mesa":** um POST só, com duplo clique, dois toques na tela de toque (375 e 768) e três Enter, com resposta atrasada em 1,5 s.
- **Abrir mesa sem rede:** o botão diz "Sem conexão…", o "Cancelar" fica travado, e na volta da rede nasce uma conta só.
- **Quantidade digitada:** 6 cervejas viram 6 × R$ 12,00 = R$ 72,00 no servidor.
- **Fila offline:** os itens aparecem como "Na fila" (ponto e rótulo), a faixa diz quantos estão esperando, e na volta da rede nada se duplica (o reenvio responde 200, idempotente).
- **Receber dividido por valor:** R$ 10,00 + R$ 20,00 + R$ 10,00 numa mesa, com o saldo atualizando entre um pagante e outro. Um POST no duplo clique. O 502 diz "O pagamento pode ter sido registrado: confira…". Sem rede, diz "Nada foi registrado".
- **Indicadores:** "Cartão" aparece no lugar do código cru `CARTAO`, e os meses vazios aparecem com R$ 0,00.
- **Papéis e isolamento:** o garçom sempre volta para `/comanda`, e a recepção sai de `/indicadores`. O admin da Sol recebe "Conta não encontrada" (404) nas mesas do Aurora e vê só os números da Sol. Pela API, o garçom recebe 403 em `/payments`, e a recepção do Aurora recebe 404 ao pagar uma conta da Sol.

As ressalvas são quatro 🟡:
1. Sem rede, os Indicadores mostram "nenhum pagamento" em vez de erro.
2. O login diz "Credenciais inválidas" para o limite de tentativas e para os erros do servidor, inclusive com a senha certa.
3. O campo de quantidade aceita na tela um valor que não vale e grava outro, sem avisar.
4. O campo "Nome na comanda" tem 42 px no celular.

## Achados no escopo

### 🟡 [Rede / Estados] Sem rede, os Indicadores afirmam "Nenhum pagamento efetivado" e "Nenhuma reserva" em vez de dizer que estão sem conexão
**Onde:** `/indicadores`, nas seções Receita recebida por mês, Sazonalidade, Receita por categoria, Meios de pagamento e Hóspedes frequentes (1366), e nos cartões "Números do dia" (375)
**Passos:**
1. Entrar como `admin@aurora.example` em 1366×768 e abrir `/reservas`.
2. Derrubar a rede (Wi-Fi do computador cai).
3. Clicar em "Indicadores" no menu.
**Esperado:** um estado de erro com "Tentar de novo", ou um aviso de sem conexão (critério do time: quatro estados, erro com "Tentar de novo"). Quando o servidor responde 502, a própria tela faz isso: sete `ErrorState` "Não foi possível carregar…" com "Tentar de novo".
**Obtido:**
- Em 1366, cada seção mostra o **estado vazio** como fato: "Nenhum pagamento efetivado nesses meses.", "Nenhuma reserva nesses meses.", "Nenhuma reserva no período.", "Nenhum pagamento efetivado no período." e "Nenhum hóspede com reserva ainda.". Todas vêm com "Troque o período para ver outros dados.", que manda o gerente procurar no lugar errado.
- Os quatro cartões mostram "—", e o da ocupação perde o texto "4 de 16 quartos" e passa a dizer "Quartos ocupados agora".
- Não há nenhum aviso de rede nem "Tentar de novo".
- Quando a rede volta, a tela se corrige sozinha.
- Em 375 aparecem só os cartões com "—", também sem aviso.

Causa provável (leitura): a consulta do React Query fica `paused` sem rede, com `isLoading` e `isError` falsos e `data` indefinido. A página trata isso como lista vazia.
**Evidência:**
- `indicadores_offline_1366.png`: a página inteira com os cinco estados vazios;
- `indicadores_offline_1366.aria.yml` e `indicadores_offline_375.aria.yml`: a árvore completa;
- `indicadores_502_1366.png`: o contraste com o 502, que mostra os erros com "Tentar de novo";
- script `17_indicadores_offline.mjs` (argumentos `1366 768` ou `375 812`).

**Quem sofre:** o gerente, que lê número e não opera o balcão. Na banca, um Wi-Fi instável transforma a tela de indicadores em "o hotel não recebeu nada este ano".
**Sugestão:** nos blocos de `IndicatorsPage.tsx`, tratar `fetchStatus === 'paused'` sem `data` como erro, com "Sem conexão. Os números aparecem quando a rede voltar." e `onRetry`, como a lista da comanda já faz (`AccountsListPage.tsx:91`). O mesmo vale para os cartões do topo.

### 🟡 [Sessão / Rede] O login diz "Credenciais inválidas." para o limite de tentativas (429) e para o erro do servidor (500, 502), inclusive com a senha certa
**Onde:** `/login`, aviso de erro acima do formulário (`role="alert"`)
**Passos:**
1. Abrir `/login` em 375×812 e digitar `garcom@aurora.example`.
2. Errar a senha 4 vezes ("errada").
3. Na 5ª tentativa errada e na 6ª, já com a senha certa (`senha123`), clicar em "Entrar".
**Esperado:** uma mensagem que diga o que aconteceu e o que fazer, como "Muitas tentativas. Espere um minuto e tente de novo." ou "O sistema não respondeu. Tente de novo." (critério do time: erro com saída). A SPEC-10 (CA-10.e) manteve os erros como estavam: este defeito é anterior ao visual novo, mas está na tela pedida.
**Obtido:**
- O nginx responde **429** a partir da 5ª tentativa por IP, e a tela mostra **"Credenciais inválidas."** também com a senha certa.
- Com 500 e 502 simulados, a mensagem é a mesma. Só a falta de rede tem mensagem própria ("Não foi possível entrar. Tente novamente.").

A causa está em `loginApi.ts`: qualquer status que não seja 409 vira `LoginError('Credenciais inválidas.')`.

O limite é por IP. No hotel, todos os aparelhos saem pelo mesmo IP. Na troca de turno, quem entra depois do 5º login do minuto lê que a senha está errada, tenta de novo e prolonga o bloqueio, ou chama o administrador para trocar uma senha que estava certa.
**Evidência:**
- `login_429_senha_certa_375.png` e o script `22_login_429_senha_certa.mjs`. A saída mostra as tentativas 1 a 4 com 401, a 5ª com 429 e a 6ª (senha certa) com 429, todas com "Credenciais inválidas.";
- `login_429_real_375.png` e `21_login_429_real.mjs`, com um e-mail inexistente;
- `01_login.mjs`, que simula 500, 429, 502 e a falta de rede.

**Sugestão:** em `login()`, separar o 401 ("Credenciais inválidas.") do 429 ("Muitas tentativas de entrar. Espere um minuto e tente de novo.") e do 5xx ("O sistema não respondeu. Tente de novo em instantes."). Fazer isso em `loginFailure`, que já é testado sem DOM.

### 🟡 [Entrada] O campo de quantidade mostra um valor e lança outro, sem aviso: "10000" vira 1000, "2,5" vira 2 e "0" vira 1
**Onde:** `/comanda/:id`, campo "Quantidade de <produto>" na linha em "Aguardando envio" (`ItemList.tsx`, `QuantityField`)
**Passos:**
1. Como `garcom@aurora.example`, em 375×812, abrir uma mesa.
2. Tocar em "Água mineral 500ml", tocar no campo de quantidade da linha e digitar `10000`.
3. Olhar o rodapé e depois apertar Enter.
**Esperado:** um valor fora da regra (1 a 9999, inteiro) fica marcado como inválido, com o motivo, e a tela nunca mostra um número enquanto conta outro (DESIGN_PMS §5, fila honesta: "nunca fingir"). É dinheiro na conta do cliente.
**Obtido:**

| Digitado | O campo mostra | O rodapé conta | Depois do Enter | Gravado no servidor |
|---|---|---|---|---|
| `10000` | "10000" | 1000 águas (R$ 5.000,00 a mais) | "1000" | 1000 × Água = R$ 5.000,00 |
| `2,5` | "2,5" | 2 caipirinhas | "2" | 2 × Caipirinha = R$ 44,00 |
| `0` | "0" | 1 refrigerante | "1" | 1 × Refrigerante = R$ 7,00 |

- O campo nunca recebe `aria-invalid` e nenhuma mensagem aparece.
- No caso do `10000`, cada tecla válida vai para a fila (1, 10, 100, 1000), e a última, que vale 10000, é descartada em silêncio. Fica valendo o prefixo 1000.
- O garçom que digitou um zero a mais vê "1000" só depois do Enter, se olhar. A janela de 5 s fecha e a linha vai para o servidor.

**Evidência:**
- `08_quantidade_saida.txt`, com as cinco linhas digitado → campo → rodapé → depois do Enter;
- `qtd_janela_375.png`: os campos "1000", "2" e "9999" com "Desfazer 1";
- `qtd_enviado_375.aria.yml`: os itens gravados, "1000×Água mineral 500ml R$ 5.000,00" e "9999×Pudim R$ 139.986,00";
- script `08_quantidade.mjs <id da mesa>`.

**Sugestão:** quando `parseQuantity` devolve `null` com o campo não vazio, marcar `aria-invalid` e mostrar "De 1 a 9999" abaixo da linha. Enquanto o campo estiver inválido, segurar a janela, como o `HOLD_MS` já faz com o foco. Não mandar o prefixo para a fila: mandar só no blur ou no Enter, quando o texto inteiro for válido. Ver também o 🟢-4 sobre quantidade grande.

### 🟡 [Tela / CA-05.5.i] No celular, o campo "Nome na comanda" de "Abrir conta" tem 42 px de altura
**Onde:** `/comanda` → "Abrir conta" → textbox "Nome na comanda" (`OpenAccountForm.tsx`)
**Passos:**
1. Como garçom, em 375×812, abrir `/comanda`.
2. Tocar em "Abrir conta".
3. Medir o campo.

**Esperado:** alvo de 48 px ou mais na comanda (CA-05.5.i; critério do time para o celular). A busca da mesma tela já foi levada a 48 px pela decisão C-18.
**Obtido:** o campo mede 309×42 px. Todos os outros alvos da tela, da conta e do painel Receber passam de 48 px.
**Evidência:** saída do `04_abrir_conta.mjs`: `medida {"small":["input \"Mesa 5\" 309x42"]}`. Ver também `abrir_form_375.png`.
**Sugestão:** a mesma classe `min-h-touch` da busca (C-18) no `Input` de `#account-label`.

## Melhorias de uso (🟢)

1. **"Escolha como o hóspede pagou." numa mesa.** A legenda do painel Receber diz "Como o cliente pagou" (`payer="o cliente"`), mas o erro de quem não escolhe o meio continua fixo em "hóspede" (`paymentLogic.ts`, `submitStep`). Quem ganha: a recepcionista, que lê o mesmo termo nas duas linhas. O custo é zero cliques: passar o `payer` para a mensagem. Evidência: saída do `11_receber.mjs`, linha "sem método".
2. **Esc não fecha o formulário "Abrir conta".** Com o foco no nome, Esc não faz nada, e o formulário continua aberto (`04_abrir_conta.mjs`, "após Esc o form existe? 1"). Quem ganha: a recepção no computador, que opera no teclado, com um toque a menos. Se entrar, vale para as outras confirmações do app também (no 🟢 de 16/11 a coerência foi registrada como "nenhuma fecha com Esc").
3. **Sessão vencida no meio do lançamento: o garçom cai no login sem explicação.** Com um 401 no envio do item, a tela vai para `/login` sem nenhum texto. O lançamento fica guardado no aparelho e sai sozinho quando o mesmo garçom entra de novo: o teste conferiu o total de R$ 46,00 para R$ 61,00 e um único POST 201 (`20_sessao_relogin.mjs`). Nada se perde, mas o garçom não sabe disso e pode lançar de novo. Sugestão: "Sua sessão terminou. 1 lançamento espera neste aparelho e sai quando você entrar." Quem ganha: o garçom, porque evita um lançamento duplicado por insegurança.
4. **Quantidade grande sem nenhum freio.** 9999 pudins (R$ 139.986,00) vão para a conta com o mesmo silêncio de 2 pudins. Depois de digitar, o botão diz "Desfazer 1" e tira **uma** unidade, então desfazer 9999 pede apagar o campo e digitar de novo. Sugestão:
   - acima de, por exemplo, 99, mostrar o subtotal da linha ao lado do campo ("= R$ 139.986,00");
   - para a linha com quantidade digitada, "Desfazer" tira a linha inteira.

   Quem ganha: o garçom com uma mão só, que digita um zero a mais.
5. **"Sem conexão" quando quem falhou foi o servidor.** Com a rede no ar e o POST do item respondendo 500, 502 ou 503, a faixa diz "Sem conexão: os lançamentos serão enviados quando a rede voltar.". O item fica "Na fila" e sai no reenvio seguinte, então a fila é honesta. Só o motivo está errado: o garçom vai reiniciar o Wi-Fi à toa. Sugestão: "Sem resposta do sistema: os lançamentos serão enviados assim que ele responder." Evidência: `10_erros_itens.mjs`, `item_502_375.png`.
6. **Sete "Tentar de novo" quando o analytics cai.** Com `/api/analytics/**` em 502, a página mostra sete blocos de erro, cada um com o seu botão, e um clique corrige só o próprio bloco (restam 6). Um aviso só no topo, com "Tentar de novo" que refaz todas as consultas, poupa o gerente de seis cliques. Evidência: `indicadores_502_1366.png`, saída do `16_indicadores_estresse.mjs`.

## Repassados a outro dev
Nenhum. Os achados acima são das telas pedidas: o login do #181, a comanda dos #182, #183, #185 e #197, e os Indicadores dos #194 e #195. O 🟡 dos Indicadores sem rede é anterior aos #194 e #195, e a área é do Weslley (T-05.6). O 🟡 do login é anterior ao #181, que manteve a lógica (CA-10.e).

**Já conhecidos, não contados:**
- Sazonalidade com "últimos 12 meses" e 14 barras: o 🟢 do red team de 20/11 (`redteam_indicadores-cartao-sazonalidade_20nov2026.md`). Visto aqui: nov/25 a dez/26.
- "Última saída" futura em Hóspedes frequentes (24/11 e 25/11): o 🟢-2 do red team de 31/10, já repassado em `para_weslley_15112026.md`.
- "Cartão" e "Cartão de crédito" em linhas separadas nos Meios de pagamento: é a decisão do #194 (o rótulo "Cartão" vale para o meio antigo). Fica registrado só que o gerente vê dois cartões.
- Dois balcões recebendo ao mesmo tempo (SUSPEITA de backend, `anexos/SPEC-05-decisoes-T-05.5.md` §7). Não testei.
- Sem rede, cancelar e abrir de novo criava duas contas (🟡 do red team de 22/11): **a correção funciona**. Com a mutação pausada, "Cancelar" fica desabilitado, e na volta da rede nasce uma conta só.

## Mapa de cobertura
| Eixo (§3) | Tentado? | Como | Resultado |
|---|---|---|---|
| Entrada | Sim | **Login:** vazio, `abc`, e-mail com espaços. **Abrir conta:** vazio, só espaços com Enter, `<b>x</b>` com 195 caracteres (maxLength 100), nome repetido ("mesa 3"). **Quantidade:** 6, 0, 10000, 2,5 e 9999. **Pagamento:** vazio, 0, 0,00, -10, abc, 0,001, 59,01 acima do saldo, 1.234,56, 150.5, 59.00, " 10 ", R$ 10,00, emoji e 999999999,99 | O login valida no cliente. O nome repetido avisa com link. O pagamento recusa tudo o que devia, com mensagem, e grava 59.00, " 10 " e "R$ 10,00" corretamente. A quantidade tem o 🟡 |
| Tempo | Sim | Duplo clique, dois toques de 80 ms, três Enter em "Abrir mesa" (com resposta de 1,5 s); duplo clique mais Enter em "Registrar pagamento" (1,5 s); duplo clique em "Entrar" (2,5 s); duas abas lançando o mesmo produto | Sempre um único POST. As duas abas somaram numa linha só (2 × água, 1 POST) |
| Rede | Sim | Sem rede ao abrir a mesa, ao lançar, ao registrar o pagamento, ao entrar no login e ao abrir os Indicadores; 500, 502 e 503 no item; 502 no pagamento; 502 em todo o analytics; 429, 500 e 502 no login | A comanda é honesta em tudo. Os Indicadores sem rede têm o 🟡 1. O login com 429 e 5xx tem o 🟡 2. A faixa da comanda culpa a rede no 5xx (🟢-5) |
| Sessão e papéis | Sim | O garçom abrindo `/indicadores`, `/`, `/reservas` e `/hospedes`; a recepção abrindo `/indicadores`; o admin da Sol abrindo duas contas do Aurora; pela API, o garçom lançando na conta da Sol e pagando, e a recepção pagando a conta da Sol; 401 no meio do lançamento, com novo login | Tudo bloqueado ou com 404. A sessão vencida preserva a fila (🟢-3) |
| Tela | Sim | 375, 768, 1366 e 640×400 (zoom de 200%): medição de `scrollWidth` e dos alvos | Sem rolagem lateral em nenhuma. Um alvo de 42 px (🟡 4). No desktop, os Indicadores usam alvos de 36 px (compact, permitido) |
| Teclado | Sim | Ordem do Tab no login e na conta; Enter no produto; Shift+Tab até o campo de quantidade; Enter e Esc; Enter no campo "Até" dos Indicadores | O foco é visível e segue a leitura. Enter no campo de quantidade devolve o foco à lista. Esc não fecha o formulário de abrir conta (🟢-2) |
| Leitura | Sim | `ariaSnapshot` do login, da lista, da conta, do painel Receber e dos Indicadores | Botões com nome, campos com rótulo, erro do login em `alert`, faixa de sem conexão em `status`, gráficos com lista alternativa e tabelas com `caption` |
| Estados | Sim | Vazio (período 2030 nos Indicadores, mesa sem item), carregando, erro 502 e sem rede | Vazio e erro estão certos quando há resposta; sem rede, os Indicadores mostram vazio falso (🟡 1) |
| Domínio | Sim | Soma do rodapé contra os itens; divisão por valor (R$ 59,00 quitado; R$ 10 + 20 + 10 numa mesa); "Cartão" nos meios de pagamento; Sol isolada nos Indicadores; trava do troco na mesa | Os saldos batem com a soma. O valor acima do saldo é recusado com o motivo |
| Preferências | Parcial | `reducedMotion: reduce` no login | Nenhuma animação rodando (eram 2 sem a preferência): CA-10.c ok. O tema escuro não foi tentado |

## Não foi possível testar
- **iPhone e Safari:** fora, por pedido (ficam com o Gabriel). O teste de toque usou o Chromium com `hasTouch`.
- **Navegador do MCP (`browser_*`):** bloqueado pela lista de origens do registro (`5173` e `3000`, não `5273`). Todas as evidências são de script, e as capturas são do Chromium do mesmo pacote.
- **Leitor de tela real (TalkBack, NVDA):** a leitura foi pela árvore de acessibilidade.
- **Rede lenta real (3G limitado):** simulada só por atraso no `route`, de 1,5 a 2,5 s.
- **Fechar a mesa e receber depois (C-25), mesa fechada com saldo:** não refeito nesta rodada. O painel recebeu em mesa aberta e chegou a "Conta quitada" (só pelo saldo zero).
- **Campos de data dos Indicadores no formato brasileiro:** o Chromium headless roda em en-US e mostra "11/01/2026". Não conferi com `locale: 'pt-BR'`.
- **CA-10.b (desempenho com a CPU 4× mais lenta) e contraste medido (CA-10.d):** fora do que esta rodada mexeu. O red team de 16/11 cobriu o contraste.

## Comandos rodados pelo Bash
```
wc -l DESIGN_PMS.md e os dois relatórios anteriores; ls docs/qa docs/qa/repasses features/accounts features/auth; curl -s -o /dev/null -w %{http_code} http://localhost:5273/
cat frontend/DESIGN_PMS.md; sed -n 1,165p docs/qa/exploratorio_t085-cabecalho-cartoes_16112026.md
sed -n 1,149p docs/qa/exploratorio_m8-seed-painel-hoje_15nov2026.md | head -80; grep -n (CAs da comanda) docs/specs/SPEC-05-frontend-pms.md
grep -n "T-05.5|T-05.6|CA-05.5|CA-05.6" SPEC-05; awk (seção T-05.5 a T-05.7) SPEC-05; ls docs/specs/anexos
ls docs/specs; tail -80 docs/specs/anexos/SPEC-05-decisoes-T-05.5.md; cat quantityField.ts receive.ts
grep -n "^## |^### " SPEC-05-decisoes-T-05.5.md; awk '/^## 8/,0' (vazio)
for f in redteam_comanda-quantidade, -aviso-offline, -abrir-conta-duplo-toque, t101-login, indicadores-cartao-sazonalidade, comanda-pagamento: grep -n "^### |Veredito|SUSPEITA|aberto"
grep -n "ambiente_rede" -A40 scripts/qa_explorador_ambiente.sh
node -e (o mesmo trecho do ambiente_rede, lendo só o registro do Playwright MCP) > <scratchpad>/ambiente.env; cat <scratchpad>/ambiente.env
node -e (imprime os args do Playwright MCP para ver --allowed-origins)
for p in 5173 3000 5273 80: curl -s -o /dev/null -w %{http_code}; docker ps --format '{{.Names}} {{.Ports}}'
ls features/accounts/components features/auth/components; wc -l (componentes)
cat LoginPage.tsx OpenAccountForm.tsx OfflineBanner.tsx; sed -n 150,286p ItemList.tsx; cat ReceivePanel.tsx; head -200 PaymentForm.tsx; sed -n 1,140p ItemList.tsx
grep -n parseQuantity queueCore.ts; grep -n "readPaymentAmount|submitStep" paymentLogic.ts
sed -n 1,60p stores/auth.ts; cat loginApi.ts loginFailure.ts; grep -rn "path=" App.tsx routes/*.tsx
grep -rn -i "429|Credenciais inválidas|limit_req" docs/qa/redteam_t101-login_16112026.md docs/qa/repasses SPEC-10 SPEC-09; grep -rn limit_req infra docker
grep -n "CA-10|[ ]" SPEC-10; grep -n "CA-09|sazonal|Cartão" SPEC-09
mkdir -p docs/qa/evidencias/login-comanda-indicadores_22112026/estado; git check-ignore -v (pasta de evidências); cat > lib.mjs
cat > 01_login.mjs … 22_login_429_senha_certa.mjs (scripts desta pasta) e, para cada um: set -a; source <scratchpad>/ambiente.env; set +a; cd <pasta> && LD_LIBRARY_PATH=$QA_LD_LIBRARY_PATH node <script> <args>
sed -n 1,157p AccountPage.tsx; grep -n "paused|Sem conexão|data" AccountsListPage.tsx; grep -n "gcTime|staleTime|retry" queryClient.ts queries.ts
node -e (lê o token do usuário de teste em estado/<papel>.json) + curl em http://localhost/api/... (404 de rota) e depois em http://localhost:5273/api/...: o garçom lançando e pagando na conta da Sol, a recepção pagando a conta da Sol, analytics/payment-mix com o garçom e a recepção
sed -n 1,95p indicadores_admin_1366.aria.yml; sed -n 1,80p period.ts | grep; grep -n "Aplicar|ErrorState" IndicatorsPage.tsx
grep -rln -i "paused|sem rede|offline" (red teams e repasses dos Indicadores); grep -n "Weslley|Indicadores" docs/DIVISAO_TRABALHO_TIME_09set2026.md
grep -n "undoLabel|undoAccessibleName" accountTotals.ts; grep -n "export function undo" queueCore.ts
grep -n parseBRLInput packages/domain/src/money.ts
grep -rln -i "sessão expirou|sessão vencida" docs/qa
```
Nenhum comando alterou código, configuração ou a stack. Os dados foram criados só pela tela, no tenant Aurora da stack descartável `gesway_teste`. O nginx recebeu ao todo cerca de 16 POST de login, espaçados, com uma rajada de 6 para confirmar o 429.
