# Sessão de 26/11/2026 (noite): correções da SPEC-10, passada final de QA e respostas do Gabriel

**Dev:** Sirlande, com o Claude Code como orquestrador.
**Onde:**
- a integração (`feature/spec-10-identidade`, na worktree `../wt-integracao`) recebeu as correções de tela;
- a `develop` recebeu um PR de correção e a revisão dos PRs do Weslley, todos ainda abertos.

**Ensaio:** o ensaio da demonstração foi aprovado. O banco do ensaio não precisa ser recriado.

## O que foi feito

| PR | Base | Estado | Resumo |
|---|---|---|---|
| #239 | integração | mergeado | **As listas ocupam a coluna inteira, como o Hoje e os Indicadores** (R-7 revista). Formulários e detalhes continuam com a largura de leitura. A comanda vira grade no computador, com o "Abrir conta" no cabeçalho. No Hoje: o número longo do quarto não vaza mais, a linha de reserva vencida não fica espremida e a **reserva vencida não segura mais o quarto na fita**. O rodapé fixo não mostra mais a lista por baixo. O `PageHeader` ganhou `actionClassName`. |
| #236 | integração | mergeado | Respostas do Gabriel às 7 perguntas da SPEC-10 (PR dele) |
| #240 | `develop` | **aberto** | Trava de um envio por vez no "Sim, fechar" da comanda e no "Cadastrar"/"Salvar" hóspede. O duplo clique dava erro falso: 422 "Conta CLOSED…" e 409 "CPF já cadastrado". Os dois arquivos entraram na varredura `singleSubmit.test.ts` |
| #241 | integração | **aberto** | Respostas 1, 2, 4 e 6 do Gabriel. O "Em limpeza" lê os quartos do core. O "Vendidos hoje" conta quartos distintos com hóspede esta noite. O check-in do detalhe da reserva pede confirmação na linha. O foco vai para os painéis de check-in e de cancelar, e volta ao botão quando eles fecham. O e2e e o `GUIA_DEMONSTRACAO.md` (passo 2) foram atualizados |
| #237 e #238 | `develop` | revisados | PRs do Weslley (scripts do passo 6 e cobrança Pix órfã). Os dois podem mergear. Ficou registrado no comentário um 🟡 no #237: os scripts não usam nome de projeto do compose |

**QA da noite, com os relatórios na integração:**
- **qa-redteam da largura das listas:** 0 🔴, 2 🟡 e 3 🟢, todos resolvidos (`docs/qa/redteam_largura_listas_26112026.md`).
- **qa-explorador, passada final da SPEC-10, nas 3 larguras e nos 3 papéis:** **aprovado com ressalvas**, com 0 🔴, 3 🟡 e 7 🟢 (`docs/qa/exploratorio_final_spec10_26112026.md`).
  - O 🟡1 (reserva vencida na fita) e três 🟢 foram resolvidos no #239.
  - Os dois 🟡 de duplo clique foram resolvidos no #240.
- **qa-redteam das respostas do Gabriel:** 0 🔴, 4 🟡 e 5 🟢 (`docs/qa/redteam_respostas_gabriel_26112026.md`).
  - Foram resolvidos três 🟡 e quatro 🟢.
  - O 🟡 da D-5 ficou documentado no código.

**Verificação ao fim:**
- 739 testes no `pms` da integração e 608 na `develop`;
- `tsc` limpo, build ok e e2e 7/7;
- `qa_checks` sem aviso novo.

Cada correção foi conferida no navegador. O "Em limpeza" foi conferido com o `analytics-service` parado de propósito.

## Decisões do Sirlande (26/11)
- **R-7 revista:** as listas (Reservas, Hóspedes, Quartos, Categorias e Comanda) ocupam a coluna inteira. Formulários e detalhes continuam estreitos e alinhados à esquerda. Aceita-se que a largura mude entre a lista e o detalhe. Registrado no estudo de responsividade da SPEC-10.
- **"Vendidos hoje":** a saída atrasada conta, porque o hóspede segue no quarto. O texto embaixo do número passa a ser "quartos com hóspede esta noite".
- **Respostas 3, 5 e 7 do Gabriel:** ficam para combinar com ele, como ele mesmo pediu.
- **Demonstração pelo celular, pela rede:** o Sirlande cancelou ("é apenas para teste"). O guia não cita que, no WSL2, a porta 5173 não chega à rede sem a rede espelhada.

## Ambiente
- O Sirlande subiu o `gesway_ensaio` por conta própria e fez um check-in de teste no Wesley, no banco da integração.
  - O ensaio foi derrubado com `down`, sem `-v`.
  - O check-in foi desfeito no banco da integração, a pedido dele: a reserva voltou a CONFIRMED, o quarto 102 a AVAILABLE e a conta vazia da "Suíte 102" foi removida. O evento da volta foi publicado ao analytics.
- **No fim da sessão:** `gesway_integracao` parado com `stop` (volumes mantidos), Vite encerrado e nenhum contêiner rodando.
- **Dados de teste que ficaram no banco da integração:**
  - registros "QA 26/11 …" (hóspedes e mesas fechadas);
  - registros "E2E…" das execuções do e2e.

## Como retomar
1. **O Gabriel vai commitar um documento novo com as próximas etapas.** Ler esse documento primeiro e reordenar a lista abaixo por ele.
2. **Merges na `develop`, com o ok do grupo (congelamento D4):** #229 → #230 → #231 → #232 → #238 → #237 → #240. Simulados em sequência sobre a `develop`, sem conflito.
3. **Merge do #241** na integração.
4. **A integração recebe a `develop`**, como no #233.
5. **Fechar a SPEC-10:** revisão do Gabriel e do Weslley na integração e, depois, o PR da integração para a `develop`, só com a aprovação do Sirlande.

**Para religar o ambiente:**
- **compose:** em `../wt-integracao`, rodar `COMPOSE_PROJECT_NAME=gesway_integracao docker compose up -d`;
- **Vite:** em `frontend/apps/pms`, rodar `node_modules/.bin/vite --port 5173 --host localhost`.

## Pendências
1. **PRs novos:**
   - **#242**, o Terraform da AWS (ADR-004), do Weslley, aberto em 27/11 e sem revisão. É do 5º semestre;
   - **#179**, do Gabriel, em conflito com a SPEC-11.
2. **Respostas 3, 5 e 7 do Gabriel:**
   - limpeza no Atenção só com chegada no quarto;
   - sem "-R$" e sem saldo corrente;
   - ordem das ações da conta.
3. **Decisões do Sirlande sobre os Indicadores:** valor nas barras, mês futuro da sazonalidade, "Outras" nas categorias e "atualizado às".
4. **Acabamento (🟢 do qa-explorador):**
   - a linha da reserva vencida ocupa 4 linhas em 1366 px;
   - falta um atalho "Cancelar reserva" na própria linha;
   - números de quarto longos com o mesmo começo ficam iguais na fita;
   - o link do hóspede tem 17 px no cabeçalho da reserva;
   - o valor some da lista de reservas no celular.
5. **Travas de duplo clique que faltam:** a criação rápida de hóspede na nova reserva (`GuestPicker.tsx`) e a exclusão de hóspede (`GuestDetailPage.tsx`).
6. **Limite da D-5:** numa reserva com vários quartos, só o principal entra nas listas do Hoje. Por isso, o quarto extra de quem sai hoje continua contado em "Vendidos hoje".
7. **Scripts do passo 6 (#237):** descobrir o nome do projeto do compose, ou citá-lo no guia.
8. **CI vermelho das 21h às 24h (BRT):** os testes rodam em UTC e o `todayInHotel` usa o fuso do hotel. Combinado para depois do congelamento.
