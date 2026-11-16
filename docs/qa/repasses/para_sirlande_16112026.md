# Repasse para Sirlande — 16/11/2026
Origem: qa-explorador da T-08.5 (`feature/t085-cabecalho-cartoes`, `docs/qa/exploratorio_t085-cabecalho-cartoes_16112026.md`). Os achados abaixo são anteriores à T-08.5 e ficam na trilha da SPEC-08 (T-08.3 e T-08.6). Não entram no veredito da T-08.5.

### 🟡 [CA-08.g] Alvos de 36 a 38 px em 768 px
**Onde:**
- menu lateral (`AppShell.tsx:196`, `py-2 text-sm`): "Hoje", "Reservas", "Hóspedes", "Quartos", "Comanda" e "Indicadores" com 36 px de altura;
- atalhos de período em `/reservas` ("Hoje", "Próximos 7 dias", "Próximos 30 dias", `size="compact"` em `ReservationsListPage.tsx:69`) com 36 px;
- abas "Quartos" / "Categorias" (`RoomsHeader.tsx`, `md:min-h-0 md:py-2`) com 38 px.

**Passos:** 1. Entrar como `recepcao@qa.test` (ou `admin@qa.test` para as abas de quartos). 2. Janela de 768×1024. 3. Abrir `/reservas` e `/quartos/categorias`. 4. Medir a altura (`getBoundingClientRect().height`) dos elementos acima.
**Esperado:** 48 px ou mais em 375 **e** em 768 px (SPEC-08 CA-08.g).
**Obtido:** 36 px (menu e atalhos) e 38 px (abas). Em 375 px estão todos com 48 px.
**Evidência:** `docs/qa/evidencias/t085-cabecalho-cartoes_16112026/categorias_768.png` (abas e menu lateral em 768 px).
**Sugestão:** trocar o corte `md:` por `xl:` nesses três pontos, como a T-08.5 fez no `WriteButton`.

### 🟡 [CA-08.e] Dois `primary` visíveis na aba Conta de uma estadia com saldo
**Onde:** `/reservas/<id>?aba=conta` de uma reserva CHECKED_IN com saldo: o "Fazer check-out" do cabeçalho e o "Registrar pagamento" do `PaymentForm` aparecem os dois em `bg-brand`, ao mesmo tempo.
**Passos:** 1. Entrar como `recepcao@qa.test`. 2. Abrir a reserva `hospedada_com_saldo` do `dados.json`. 3. Ir para a aba Conta, em 1280×800.
**Esperado:** no máximo um `primary` visível, exceto o bloco de confirmação (CA-08.e).
**Obtido:** dois.
**Evidência:** `docs/qa/evidencias/t085-cabecalho-cartoes_16112026/reserva_hospedada_conta_1280.png`.
**Pergunta:** o `PaymentForm` é um "objeto próprio" (SPEC-08 §T-08.5) e por isso pode ter o próprio primary? Se sim, registrar a exceção no anexo da SPEC-08. Se não, o "Registrar pagamento" vira o principal nessa aba e o check-out desce para secondary enquanto houver saldo, ou o inverso.

Casos parecidos e mais leves, que dependem da mesma resposta: o atalho de período selecionado ("Próximos 7 dias" em `/reservas`, "12 meses" em `/indicadores`) usa o mesmo `bg-brand` do primary, e em `/indicadores` convive com "Aplicar período". É estado de seleção (`aria-pressed`), não ação, mas visualmente é igual a um segundo primary.
