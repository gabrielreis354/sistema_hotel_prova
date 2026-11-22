# Repasses para Weslley — 22/11/2026

Origem: `docs/qa/exploratorio_login-comanda-indicadores_22112026.md`, QA exploratório do login, da comanda e dos Indicadores (Sirlande), rodado contra o compose descartável `gesway_teste` (`develop` em `4a63408`). O achado abaixo é dos Indicadores (T-05.6) e já existia antes do #194 e do #195. Os outros três 🟡 da rodada, do login e da comanda, foram corrigidos na `fix/qa-22nov-login-comanda`.

### 🟡 [Rede / Estados] Sem rede, os Indicadores mostram "nenhum pagamento" e "nenhuma reserva" em vez de dizer que estão sem conexão
**Onde:** `/indicadores`. São afetadas cinco seções: Receita recebida por mês, Sazonalidade, Receita por categoria, Meios de pagamento e Hóspedes frequentes. Os cartões de "Números do dia" mostram "—".

**Passos:**
1. Entrar como `admin@aurora.example` e abrir `/reservas`.
2. Derrubar a rede.
3. Clicar em "Indicadores" no menu.

**Esperado:** aviso de sem conexão, ou um estado de erro com "Tentar de novo". Com o servidor em 502, a própria tela já faz isso, com sete `ErrorState`.

**Obtido:** as seções mostram o estado vazio como se fosse fato, por exemplo "Nenhum pagamento efetivado nesses meses.", e ainda dizem "Troque o período para ver outros dados.". Na banca, o gerente leria zero onde há dados.

**Causa provável:** sem rede, o TanStack Query deixa a consulta pausada (`fetchStatus: 'paused'`) e sem dados, e a tela trata "sem dados" como lista vazia.

**Correção sugerida:** antes do vazio, tratar `isPaused && !data`. Pode reaproveitar o `useOnline` e o `OfflineNotice` da comanda (#165), como a SPEC-11 (T-11.4) propõe para o painel Hoje.

**Script que reproduz:** `docs/qa/evidencias/login-comanda-indicadores_22112026/17_indicadores_offline.mjs` (fora do git; peça ao Sirlande).

---

Origem: `docs/qa/redteam_spec11-cpf-hospede_22nov2026.md`, o QA Red Team da branch `fix/spec11-cpf-hospede` (Gabriel, SPEC-11 T-11.1, base `develop@705717e`). Os dois achados abaixo são do B2B e já existiam antes da branch.

### 🟡 [DRY / dado] A assinatura de contrato procura o representante pelo CPF cru e grava CPF sem validar
**Onde:** `services/core-service/app/Controllers/ContractApi/SignContractController.js:16-25` (`findOrCreateRepresentanteGuest`)
**Cenário:** um hóspede cadastrado antes da T-11.1 tem `cpf = '529.982.247-25'`. O cliente corporativo tem `representante_cpf = '52998224725'`, porque o `CreateCorporateClientController` grava só os dígitos. Ao assinar, `findOne({ cpf: client.representante_cpf })` compara o texto cru e não acha o hóspede. O `create` grava um segundo hóspede com os mesmos dígitos. O índice único compara o texto cru e não barra. A recepção passa a ver dois cadastros da mesma pessoa. Além disso, o `representante_cpf` não passa por `isValidCpf`, então um `'123'` vira CPF de hóspede, que a T-11.1 passou a recusar no balcão.
**Regra violada:** CLAUDE.md, "lógica de negócio duplicada: se existe em utils/, reutilize". Viola também o CA-11.d em espírito: o mesmo CPF em formatos diferentes no mesmo hotel vira dois hóspedes.
**Correção sugerida:** buscar com `findGuestByCpfDigits` de `app/utils/guestCpf.js`, estendido para aceitar `{ transaction }`, igual à reserva pública (`CreateBookingController.js:161-168`). Gravar o CPF no hóspede só se `isValidCpf` passar; senão, criar só com o nome, como o `catch` já faz.
**Confirmado por:** leitura de código. Não executei.

### 🟡 SUSPEITA [validação] `UpdateCorporateClientController` grava `cnpj`, `cpf` e `representante_cpf` sem normalizar
**Onde:** `services/core-service/app/Controllers/CorporateClientApi/UpdateCorporateClientController.js:10-11`
**Cenário:** o `Create` normaliza com `onlyDigits`, mas o `Update` copia `request.body[f]` cru. Um `PUT {representante_cpf: '529.982.247-25'}` tem 14 caracteres e vai para `VARCHAR(11)` (`schema.sql:438`). O provável é um erro do Postgres virando 500. Se a coluna aceitasse o valor, o resultado seria um CPF mascarado que a busca crua do contrato não acha.
**Falta para confirmar:** rodar o PUT contra o banco de teste.
**Correção sugerida:** aplicar `onlyDigits` em `cnpj`, `cpf` e `representante_cpf` no Update, igual ao Create, e acrescentar um teste.

---

Origem: avaliação do protótipo do painel Hoje (SPEC-10, Fase 1) por uma IA de design (`GESWAY_Recomendacoes_de_Melhoria.docx`, recebido pelo Sirlande em 22/11), conferida contra o código. Não é defeito: é uma proposta de rever uma definição que já foi decidida.

### 🟢 [Indicador] Ocupação e RevPAR dividem pelo total de quartos, inclusive os bloqueados em manutenção
**Onde:** `services/analytics-service/app/Controllers/AnalyticsApi/GetOccupancyController.js:26-49`. O `total_rooms` conta todos os quartos não excluídos, e `occupancy_rate = occupied / total_rooms` e `revpar = adr × occupied / total_rooms`. A fórmula segue o que foi decidido em `docs/planejamento_analytics_27jun2026.md:56` ("(occupied / total) × 100").
**Cenário:** um hotel com 15 quartos, 4 ocupados e 3 em `MAINTENANCE` mostra ocupação de 26,7% (4 ÷ 15). Como os bloqueados não podem ser vendidos, o padrão do setor dá 33,3% (4 ÷ 12). O RevPAR cai na mesma proporção, e o gerente lê o hotel mais vazio e rendendo menos do que está. Hoje isso não aparece no ensaio porque o seed não tem quarto em manutenção.
**Referência:** a definição comum do setor é "quartos ocupados ÷ quartos disponíveis para venda", e o RevPAR é a "receita de hospedagem ÷ quartos disponíveis". A recomendação da IA de design vai na mesma linha.
**Correção sugerida (se o grupo aprovar):**
- devolver `maintenance` e `rooms_for_sale` (`total_rooms - maintenance`) no `quartos` e dividir a ocupação e o RevPAR por `rooms_for_sale`, com proteção para zero;
- manter `total_rooms` no contrato, para o painel Hoje continuar mostrando "de N quartos";
- acrescentar um teste com quarto em manutenção e atualizar o `planejamento_analytics_27jun2026.md` com a definição nova.
**Impacto:** muda o número dos cartões de Indicadores (T-05.6) e do painel Hoje. É decisão do grupo, depois do congelamento de 24/11, para não mudar número às vésperas do ensaio.
**Confirmado por:** leitura do SQL. Não executei.
