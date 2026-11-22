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
