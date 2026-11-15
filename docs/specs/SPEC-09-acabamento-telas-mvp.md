# SPEC-09 — Correções das telas do MVP antes do congelamento

**Prioridade:** 🟠 Alta. São defeitos que a banca vê no roteiro de 10/12
**Estado:** 🟡 Aprovada pelo Gabriel em 15/11; em implementação
**Responsável:** Gabriel, com agentes de IA. Revisão: Sirlande
**Criado em:** 15/11/2026
**Prazo:** 22/11, antes do congelamento de 24/11
**Origem:**
- `docs/qa/revisao_telas_prontas_15112026.md`, achados 4, 5, 6 e 8;
- a reavaliação do MVP no `docs/PLANO_FECHAMENTO_MVP_15NOV2026.md`, item R5.

---

## 1. Contexto

Em 15/11, as 52 telas consideradas prontas foram revisadas por papel, no computador e no
celular. Nenhuma tem erro de JavaScript ou chamada com falha, mas quatro mostram informação
errada ou incompleta. Além disso, o menu mostra um item que não funciona.

| # | O que se vê hoje | Onde |
|---|---|---|
| A | O comprovante impresso não diz qual hotel o emitiu: tem hóspede, quarto, lançamentos e saldo, mas não tem nome nem CNPJ | `features/reservations/ReservationReceiptPage.tsx` |
| B | O CPF aparece de três jeitos: cru (`30000000014`) na lista de hóspedes e na reserva; mascarado no comprovante; formatado quando o balcão o digitou assim | `GuestsListPage.tsx:73`, `GuestDetailPage.tsx:87`, `ReservationDetailPage.tsx:239`, `GuestPicker.tsx:41,106` |
| C | Na linha do tempo da conta, depois de um pagamento antecipado, a coluna Saldo mostra `-R$ 1.050,00`. O sinal de menos não diz à recepção se o hotel deve ou recebe | `features/reservations/components/BillTimeline.tsx` (coluna Saldo de cada linha) |
| D | O menu do administrador tem "Usuários", que abre uma tela "em breve" | `routes/nav.ts:27` |
| E | Na lista de Hóspedes, no celular, só o nome é clicável, numa área de 16 px de altura | `GuestsListPage.tsx` |

Todos os caminhos são relativos a `frontend/apps/pms/src/`.

---

## 2. Objetivo

Na demonstração, nenhuma tela do roteiro mostra informação ambígua ou um item de menu que não
funciona. **Nada muda em regra de negócio, rota da API ou contrato.**

---

## 3. Decisões

| Decisão | Escolha | Motivo |
|---|---|---|
| Nome do hotel no comprovante | Vem de `GET /tenants/me`, que já existe e vale para qualquer papel logado | Não precisa de backend. Colocar o nome no JWT ficaria velho se o hotel mudasse de nome |
| Se `/tenants/me` falhar | O comprovante imprime mesmo assim, sem o cabeçalho do hotel | O comprovante é entregue no check-out com o hóspede esperando. Não pode travar por um dado de enfeite |
| Formato do CPF | **Sempre** `000.000.000-00` na tela, por uma função única em `@hotel/domain`. Fora de 11 dígitos, mostra como está | Hoje o mesmo hóspede aparece de três jeitos |
| CPF na lista de hóspedes | Formatado e **completo**, como hoje (decisão do Gabriel, 15/11) | A recepção precisa conferir o documento no balcão. Mascarar na lista continua como pendência de LGPD já registrada (🟢-1 do red team de 02/11) |
| Comprovante | Continua mascarado (`***.456.789-**`) | Papel entregue ao hóspede: decisão já tomada no `maskCpf` |
| Saldo negativo numa linha | Valor sem sinal + a palavra **"crédito"** | Cor ou sinal sozinhos não bastam (RNF-025). O balcão já usa "Crédito" na conta da suíte (`StaffActions.tsx:109`) |
| Total negativo da conta | Continua "A devolver" | Já está certo e é uma decisão de fechamento, não de linha |
| "Usuários" | Sai do menu. A rota e o placeholder ficam | Volta no 5º semestre, quando a tela existir. Tirar a rota obrigaria a reescrever testes à toa |

---

## 4. Escopo

**Dentro:** `frontend/apps/pms` e `frontend/packages/domain`.

**Fora** (tem dono ou outra Spec):

| Achado da revisão | Onde está |
|---|---|
| 1. Seed com hóspede em quarto livre | Sirlande, tarefa do seed (17/11) |
| 2. Check-in sem conferir datas | Resolvido no PR #147 |
| 3. Sazonalidade pula meses | Weslley (indicadores) |
| 7. Reserva encerrada com três botões desabilitados | SPEC-08, T-08.3 (hierarquia de ações), do Sirlande |
| 9. Marca "Hotel PMS" em vez de Gesway | SPEC-08, T-08.2 |
| 10. Botão "Sair" com 36 px | SPEC-08, T-08.6 e CA-08.g |
| 11. Aviso grande na conta do garçom | Comanda, do Sirlande |

Também fica fora o backend, salvo se uma tarefa descobrir que precisa dele. Nesse caso,
**parar e registrar como pendência**, sem mudar o backend.

---

## 5. Tarefas

Cada tarefa vai numa branch própria a partir da `develop` e pode ser mergeada sozinha.

| Tarefa | Entrega | Resolve | Branch | Estimativa |
|---|---|---|---|---|
| **T-09.1** | Comprovante com nome e CNPJ do hotel | A | `fix/t091-comprovante-emissor` | 0,5 dia |
| **T-09.2** | CPF no mesmo formato em todas as telas e linha inteira clicável em Hóspedes | B, E | `fix/t092-cpf-formatado` | 0,5 dia |
| **T-09.3** | Saldo de linha como "crédito" e "Usuários" fora do menu | C, D | `fix/t093-credito-menu` | 0,5 dia |

As três não tocam nos mesmos arquivos e podem andar em paralelo.

### T-09.1 — Comprovante com o emissor

- Consultar `GET /tenants/me` pelo `api` de `lib/api.ts`, numa query do TanStack Query com cache
  longo. O nome do hotel quase nunca muda.
- No topo do comprovante: nome do hotel em destaque e, se existir, CNPJ (`legal_id`) na linha
  de baixo.
- Enquanto carrega ou se falhar: o comprovante aparece sem o cabeçalho, e nada bloqueia a
  impressão.
- Teste da lógica (com ou sem `legal_id`, com falha) e um teste do componente com o cliente
  trocado por dublê, no padrão de `reservationsApi.test.ts`.

### T-09.2 — CPF formatado e lista de Hóspedes

- `formatCpf(cpf)` em `packages/domain/src`, exportado pelo índice do pacote:
  - com 11 dígitos, devolve `000.000.000-00`, aceitando entrada com ou sem pontuação;
  - qualquer outra entrada volta como veio; nulo ou vazio vira `null`.
- Usar em `GuestsListPage`, `GuestDetailPage`, `ReservationDetailPage` (bloco do hóspede) e
  `GuestPicker`.
- `maskCpf` continua só no comprovante.
- Lista de Hóspedes: a linha inteira leva ao detalhe, com alvo ≥ 44 px no celular. O nome
  continua sendo um `Link`, para funcionar no teclado e no leitor de tela.
- **Não muda** o que o formulário grava. Normalizar o CPF gravado é outro trabalho, sem dono.

### T-09.3 — Crédito na linha do tempo e menu

- `BillTimeline`: na coluna Saldo, um valor negativo aparece como `R$ 1.050,00 crédito`, com a
  palavra visível e não só para leitor de tela. Zero e positivo não mudam.
- Os totais embaixo da tabela não mudam.
- `routes/nav.ts`: retirar o item "Usuários" e ajustar `nav.test.ts`. A rota `config/usuarios`
  continua no `App.tsx`.

---

## 6. Critérios de aceitação

| ID | Critério | Como verificar |
|---|---|---|
| CA-09.a | O comprovante impresso mostra o nome do hotel do usuário logado e o CNPJ, quando cadastrado | Teste + captura no Aurora e no Sol (seed) |
| CA-09.b | Com `/tenants/me` falhando, o comprovante continua aparecendo e imprimindo | Teste com o dublê devolvendo 500 |
| CA-09.c | O mesmo hóspede aparece com o mesmo CPF formatado na lista, no detalhe, na reserva e na busca da nova reserva | Teste de `formatCpf` + captura |
| CA-09.d | Nenhum valor de saldo aparece com sinal de menos na linha do tempo da conta | Teste do `BillTimeline` com pagamento antecipado |
| CA-09.e | O administrador não vê "Usuários" no menu, no computador nem no celular (folha "Mais") | `nav.test.ts` + captura |
| CA-09.f | Na lista de Hóspedes em 390 px, tocar em qualquer ponto da linha abre o hóspede; alvo ≥ 44 px | Medição no navegador |
| CA-09.g | Nenhuma regra, rota ou contrato muda: testes de lógica existentes passam sem ajuste | `pnpm -r test`, `pnpm -r typecheck`, `ci-frontend.yml` verde |
| CA-09.h | O qa-redteam não deixa 🔴 nem 🟡 aberto em nenhuma das três branches | Relatório em `docs/qa/` |

---

## 7. Como será executada

1. ✅ O Gabriel aprovou esta Spec em 15/11 e decidiu o CPF completo na lista (§3).
2. Um agente de implementação por tarefa, cada um numa cópia isolada do repositório (worktree).
   O prompt segue o modelo do `CLAUDE.md` §5 e manda ler antes o `frontend/DESIGN_PMS.md` e os
   arquivos citados nesta Spec.
3. Cada agente entrega a branch com commits Conventional, os testes passando e um resumo do que
   mudou. Nenhum agente faz push.
4. O qa-redteam audita cada branch. Os achados 🔴 e 🟡 são corrigidos antes do push.
5. Push e PR de cada branch para a `develop`. **O merge é do Gabriel**, com revisão do Sirlande.

---

## 8. Riscos

| Risco | Como evitar |
|---|---|
| Conflito com a SPEC-08 do Sirlande, que mexe em `nav.ts` (ícones), na reserva e no painel Hoje | Mudança mínima em `nav.ts` (uma linha) e nenhuma no painel Hoje. Avisar o Sirlande do que entrou |
| Teste quebrar por mudança de texto | Ajustar o seletor e o texto, nunca a lógica (CA-09.g) |
| `/tenants/me` lento atrasar a impressão | O cabeçalho é opcional: o comprovante não espera por ele |
