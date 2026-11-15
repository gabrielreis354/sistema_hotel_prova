### 2026-11-15 — Gabriel (com Claude, orquestrando agentes)

- **Branches:**
  - `docs/ensaio-roteiro-14nov`
  - `feature/checkin-datas`
  - `fix/t091-comprovante-emissor`
  - `fix/t092-cpf-formatado`
  - `fix/t093-credito-menu`
  - `fix/teste-proxy-vite-roda`
  - `fix/compose-up-confere-setup`
  - `docs/sessao-fechamento-15nov` (este relatório)
- **Horário:** 15/11, o dia todo
- **Objetivo da sessão:** consolidar o plano de fechamento do MVP, fechar os defeitos de tela e de
  regra que a banca veria, e revisar o compose do Weslley.

#### O que foi feito

**1. Plano de fechamento do MVP** (`docs/PLANO_FECHAMENTO_MVP_15NOV2026.md` e `.html`, PR #144)
- Partiu do levantamento da atividade do Sirlande no git. A última atividade dele é de 11/11, e a
  comanda não recebe commit desde 27/10.
- Traz a situação do frontend passo a passo do roteiro e a divisão do trabalho entre Gabriel,
  Sirlande e Weslley, com calendário até 10/12.
- Foi escrito para ser autossuficiente: sem codinomes de tarefa. A cópia em HTML ficou em
  `Downloads` para mostrar ao trio.
- As mensagens individuais estão em `docs/delegacoes/fechamento_mvp_{sirlande,weslley}_15nov2026.md`.
  **Quem envia é o Gabriel.**

**2. Revisão das telas dadas como prontas** (`docs/qa/revisao_telas_prontas_15112026.md`)
- Foram 52 telas, nos três papéis, no computador e no celular.
- Nenhuma tem erro de JavaScript ou chamada com falha.
- Achados: 1 🔴 (o seed põe hóspede "na casa" em quarto livre), 4 🟡 e 6 🟢.

**3. Check-in só dentro do período da reserva** (PR #147)
- Regra decidida pelo Gabriel: `check_in_date <= hoje < check_out_date`, com o hoje no fuso de
  São Paulo.
- Fora dessa janela, a resposta é 422 com `CHECK_IN_TOO_EARLY` ou `RESERVATION_EXPIRED`.
- Implementado no backend, no `@hotel/domain` e no app. Os testes do core passaram a usar datas
  relativas a hoje.
- Limitação aceita no MVP (opção a): o hóspede que chega de madrugada no dia da saída conta como
  vencido.

**4. Reavaliação do MVP contra o Termo e os documentos entregues**
- **Conclusão:** o MVP cumpre o Termo do 4º semestre.
- **Pontos de apresentação (R1–R6):**
  - passo 6 no sandbox real do Asaas;
  - passo 8 no Grafana;
  - uma execução verde do Actions;
  - Doc 08 v1.3;
  - "Usuários" fora do menu;
  - folha de respostas para a banca.

**5. SPEC-09, correções das telas** (aprovada pelo Gabriel; três agentes de implementação, cada um
auditado pelo qa-redteam)

| PR | Tarefa | Achados do qa-redteam corrigidos |
|---|---|---|
| #149 | T-09.3: saldo negativo como "crédito"; "Usuários" fora do menu | nenhum 🟡 |
| #150 | T-09.2: CPF num formato só; linha inteira clicável em Hóspedes | 🟡 busca não achava o CPF formatado; 🟡 selecionar texto abria o hóspede |
| #151 | T-09.1: comprovante com nome e CNPJ do hotel | 🟡 o teste do 500 não provava nada (conferido por mutação); 🟡 o cache do hotel expirava em 5 min |

O que **não** entrou na SPEC-09 porque já está na SPEC-08 do Sirlande: marca Gesway, barra de ações
da reserva encerrada e botão "Sair".

**6. Teste do proxy do Vite que nunca rodou** (PR #152)
- O exclude padrão do Vitest descarta `vite.config.*`, então o teste que entrou no #145 nunca foi
  executado.
- Foi renomeado para `viteProxy.test.ts`. Os 2 testes agora rodam e passam.

**7. Revisão do #148 do Weslley** (`docs/qa/revisao_pr148_compose_15nov2026.md`, com comentário no
PR)
- A correção do 1º `up` a frio está certa. O PR já tinha sido mergeado pelo autor, sem qa-redteam.
- Um 🟡: se o `rabbitmq-setup` falha, o `up` não acusa nada, e os Indicadores aparecem zerados.
- A correção está no PR #154: `./start.sh compose-up [flags]` sobe o compose e confere se o setup
  terminou bem. Passou pelo qa-redteam e por dois `up` reais seguidos.

**Merges feitos nesta sessão em `develop`, em ordem:** #145, #147, #144, #149, #150, #151, #152 e #154.
Todos tinham CI verde e qa-redteam. A partir de hoje, o Gabriel delegou o merge ordenado dos PRs
prontos dele.

**Verificação final em `develop` + #152:**
- app-pms: 334 testes;
- domain: 49 testes;
- typecheck verde.

O core ficou com 1.215 testes no #147.

#### Commits gerados

| Hash | Mensagem |
|------|----------|
| `681cbd9` | `docs(plano): plano de fechamento do MVP e divisao entre o trio` |
| `5d00909` | `docs(qa): revisao das telas dadas como prontas, por papel e no celular` |
| `4e7b92f` | `docs(plano): versao HTML do plano de fechamento para apresentar ao trio` |
| `e3578db` | `docs(plano): job de CI do frontend ja existe desde 31/10` |
| `f07d9f4` | `docs(plano): reavaliacao do MVP contra o Termo e SPEC-09 das telas` |
| `a122664` | `docs(specs): SPEC-09 aprovada, com CPF completo na lista` |
| `e11c26c` | `refactor(core): data de hoje no fuso do hotel em um lugar so` |
| `4fb70ff` | `test(core): reservas com check-in usam datas a partir de hoje` |
| `14ea35b` | `feat(core): check-in so dentro do periodo da reserva` |
| `73c675a` | `feat(pms): botao de check-in respeita a janela de datas` |
| `b8f31d4` | `fix(checkin): ressalvas do qa-redteam da janela de datas` |
| `463177b` | `docs(qa): red team da janela de datas do check-in e desfecho` |
| `1ab2133` | `docs(checkin): limitacao do hospede de madrugada aceita no MVP` |
| `7bf8437` | `fix(pms): saldo negativo da linha do tempo aparece como credito` |
| `302c73b` | `fix(pms): tira "Usuarios" do menu do administrador` |
| `eda6eb6` | `docs(qa): red team da T-09.3 e comentario do menu em dia` |
| `d3ad179` | `feat(domain): formatCpf para exibir o CPF num formato unico` |
| `3ad40f6` | `fix(pms): CPF formatado nas telas e linha inteira clicavel em Hospedes` |
| `b73a4f7` | `fix(pms): busca acha o CPF formatado e selecionar texto nao abre o hospede` |
| `1acb71d` | `docs(qa): red team da T-09.2 (CPF formatado) e desfecho` |
| `eec00bd` | `feat(pms): consulta do proprio hotel via /tenants/me (T-09.1)` |
| `54b73c9` | `fix(pms): comprovante mostra o hotel emissor (T-09.1)` |
| `d69b9e5` | `fix(pms): hotel do comprovante fica no cache e o teste do 500 prova o que diz` |
| `c228a24` | `docs(qa): red team da T-09.1 (comprovante com o emissor) e desfecho` |
| `066195c` | `fix(pms): teste do proxy do Vite passa a rodar de verdade` |
| `a79a8ba` | `fix(infra): compose-up confere se o rabbitmq-setup terminou bem` |
| `e9cddcc` | `docs(qa): revisao do #148 (1o up a frio do compose)` |
| `adfe048` | `fix(infra): compose-up nao morre calado nem le o setup de um up anterior` |

#### Pendências

| # | Pendência | Prioridade | Observação |
|---|-----------|-----------|------------|
| 1 | Seed com as datas do dia e quartos coerentes com as estadias | 🔴 Alta | Sirlande, 17/11. Sem isso, o painel Hoje e os Indicadores aparecem zerados na banca. Critérios em `docs/delegacoes/fechamento_mvp_sirlande_15nov2026.md` |
| 2 | ~~Merge do #154 (`compose-up`)~~ | ✅ Feito | Mergeado em 15/11 (`c62cdba`), com CI verde e qa-redteam |
| 3 | Roteiro automatizado no repositório (`frontend/e2e/`, `pnpm e2e`) | 🟡 Média | Gabriel, até 20/11. O #145 já entrou, então não há mais bloqueio. O script do ensaio está no scratchpad da sessão (`ensaio_roteiro.mjs`). Depois, o job de CI, não bloqueante, fica com o Weslley (22/11) |
| 4 | Passo 8 no Grafana, execução verde do Actions e Doc 08 v1.3 | 🟡 Média | Weslley. Passo 8 e Actions até 24/11; Doc 08 antes de 10/12 |
| 5 | Trocar a chave de sandbox do Asaas | 🟡 Média | Weslley, já. É condição para o passo 6 com o sandbox real |
| 6 | Folha de respostas para a banca (R6) | 🟡 Média | Gabriel. Temas: cadastro de funcionários, hotel novo, ficha FNRH (RF-055) e fechamento de caixa (RF-056), todos planejados para o 5º semestre |
| 7 | Passada do `qa-explorador` nas telas da SPEC-09 | 🟡 Média | Alvo de 44 px a 390 px na lista de Hóspedes, impressão real do comprovante e capturas no Aurora e no Sol |
| 8 | Comanda: aviso de "sem conexão" e tempo restante para desfazer | 🟡 Média | Dono: Sirlande. Combinar se ele faz ou se passa para o Gabriel, até 20/11 |
| 9 | Avisar o Sirlande do que mudou nas áreas da SPEC-08 | 🟢 Baixa | `nav.ts` (sem "Usuários") e `ReservationDetailPage` (prefetch do hotel) |
| 10 | Decisões do Gabriel | 🟢 Baixa | "-R$" na coluna Valor ao lado do saldo "crédito"; `formatCpf` só com dígito verificador válido; dono para normalizar o CPF gravado (`docs/qa/repasses/para_dono-indefinido_15112026.md`); PRs #133, #134, #146 e #129 |
| 11 | Pendências técnicas menores | 🟢 Baixa | Erro 500 com UUID inválido nas rotas de transição da reserva; linha vencida no painel Hoje sem atalho para cancelar; README diz "6 serviços" no compose |
| 12 | Limpar worktrees da sessão | 🟢 Baixa | `~/wt-t091`, `~/wt-t092`, `~/wt-t093`, `~/wt-vitetest`, `~/wt-checkin`, `~/wt-ensaio-docs` e `~/wt-composeup` já foram mergeados |

#### Próximos passos sugeridos (em ordem)

1. **Antes de 17/11, os dados do dia.** É o maior risco que ainda resta para a banca: o passo 4
   (Hoje) e o passo 7 (Indicadores) só convencem com números. Se o Sirlande não puder até 17/11,
   o Gabriel assume com um agente. A regra de não pegar tarefa com dono ativo continua valendo,
   então isso precisa ser combinado com ele antes.
2. **Até 20/11, o roteiro automatizado no repositório.** Com ele, toda quebra do roteiro aparece no
   dia em que acontece, e o ensaio de 24/11 vira conferência, não descoberta. Depois disso, o
   Weslley pluga o job de CI.
3. **Até 20/11, fechar a comanda com o Sirlande.** Os dois acabamentos são pequenos. Se ele não tiver
   agenda, o Gabriel os faz com uma SPEC curta e qa-redteam, como na SPEC-09.
4. **Até 22/11, a folha de respostas para a banca e a passada do `qa-explorador`** nas telas da
   SPEC-09 e do check-in, no celular e na impressão.
5. **24/11, ensaio completo num ambiente recém-criado**, subindo com `./start.sh compose-up --build`.
   Critérios:
   - os 7 passos, mais o passo 8 no Grafana;
   - o passo 6 no sandbox real do Asaas, com o provedor simulado só como plano B;
   - o painel Hoje e os Indicadores com números diferentes de zero;
   - o `analytics-service` saudável;
   - nenhum 🔴 aberto.
6. **De 25 a 30/11, só correções**, cada uma com qa-redteam. Os 🟢 abertos (pendências 10 e 11)
   entram aqui só se sobrar tempo; nenhum deles aparece no roteiro.
7. **01/12, versão final na `main`**, com aprovação do Sirlande. O PR para a `main` e a entrega ao
   professor continuam exigindo autorização explícita do Gabriel.
