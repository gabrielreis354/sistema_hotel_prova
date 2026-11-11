### 2026-10-28 — Sirlande (orquestrando Claude Code)

- **Branches:** `docs/parecer-plano-mvp-sirlande` e `docs/alinhamento-weslley`, as duas no GitHub, fora da `develop` e sem PR · **Tarefa:** analisar o plano até 10/12 do Gabriel (boletim do time, PR #99) contra o estado real do repositório, escrever o parecer do Sirlande e alinhar as tarefas do Weslley
- **Estado:** ✅ parecer escrito, revisado e enviado ao time como página · ✅ alinhamento do Weslley no GitHub · decisões no ponto de controle de 03/11 (o aceite do Weslley sobre A a D pode vir antes)

#### O que foi feito
1. **Retomada:** estado da T-05.5 depois da sessão de 27/10. A comanda está fechada na `develop` (`a6dc1ea`).
2. **Análise do plano** (`docs/PLANO_MVP_ATE_10DEZ2026.md`, só na branch do PR #99), feita a partir do repositório (`origin`) e não do boletim:
   - a frente do Sirlande está cerca de 2 semanas à frente da grade: T-04.5, T-04.6, T-04.7 e T-05.5 Fase A estão na `develop`;
   - 4 branches do Gabriel estão prontas, mas paradas fora da `develop` desde 24/10: t051, t052, analytics-service e tenant-fk. A t051 e a t052 conflitam em `App.tsx`, `openapi.json` e `schema.d.ts`;
   - H.3, T-05.3, T-05.6, T-01.5 e Doc 08 não têm branch. O último commit do Weslley é de 17/10;
   - **passo 5 do roteiro:** a T-05.2 mostra a conta, mas não registra pagamento. O registro é o CA-05.6.a, na T-05.6 do Weslley, ainda sem branch;
   - **passo 6 do roteiro:** o backend do PIX está pronto, mas o app `frontend/apps/booking` está vazio e marcado como pós-TCC. Nenhum plano diz por onde o hóspede reserva na demonstração.
3. **Parecer:** `docs/PARECER_PLANO_MVP_SIRLANDE_28out2026.md`. Traz o estado em 28/10, as divergências da grade, as metas M1 a M10 com dono, critério de pronto e data, a ordem de integração, os riscos revistos e 7 decisões para o time.
4. **Página para o time:** https://claude.ai/artifact/4iRVip5UFvom7ntHYqZzwu (versão 4), com acesso liberado por link. O `.md` também está no GitHub, na branch acima.
5. **Levantamento do frontend:** todas as tarefas da SPEC-05 (T-05.1 a T-05.12) e o `PLANEJAMENTO_FRONTEND.md`. Não há plano de frontend esquecido. No MVP, faltam começar só a T-05.3 (painel Hoje) e a T-05.6.
6. **Divisão de papéis:** conferida em `DIVISAO_TRABALHO_TIME_09set2026.md` e no `git log`. A divisão é por domínio: Gabriel cuida de arquitetura, reservas e QA; Sirlande, de consumo e cobrança e do banco; Weslley, de infra, integrações e documentação.

#### Segunda parte da sessão
7. **Perguntas de produto da comanda** (levantadas em 26/10). As opções foram analisadas contra o código e as decisões. A recomendação é **manter as duas como estão**, e o Sirlande leva essa posição ao time:
   - **Fechamento só no balcão?** Não. O backend já restringe o fechamento a ADMIN e RECEPTIONIST (`accountRouter.js:27`), então tirar o botão da comanda não aumenta a segurança. Fechar é fim do consumo (C-19); receber fica no balcão (M5-b). A conta da suíte já só fecha com a estadia encerrada (D-41).
   - **INTERNAL aceita item faturável?** Sim. O fechamento zera o total (RN-006, CA-04.3.f), a comanda mostra o custo de propósito (D-24) e o relatório agrupa como "sem motivo" (D-63). O "total diferente de R$ 0,00" apontado em 26/10 é o D-24, não um erro. O rótulo "Uso interno" na tela fica para o 5º semestre.
   - Se o time aceitar, as duas viram **C-21 e C-22** no anexo da T-05.5.
8. **Entregas do Weslley em 28/10**, achadas com `git fetch` durante a sessão:
   - na `develop`: `migrate` antes e depois do rollout (repasse de 19/10), com Job no k8s, runbook e qa-redteam;
   - na branch `feature/grafana-rabbitmq`: painel do RabbitMQ no Grafana com alertas (CA-01.4.f), validado em 13 consultas, ainda sem qa-redteam;
   - o relatório dele de 28/10 diz que a T-05.6 espera a decisão do CA-05.6.a.

   O parecer foi corrigido (commit `574eb66`, página versão 4): ele dizia "sem atividade desde 17/10". O risco da chave do Asaas também passou para resolvido, porque foi excluída em 16/10.
9. **Alinhamento do Weslley:** `docs/delegacoes/alinhamento_weslley_28out2026.md`, na branch `docs/alinhamento-weslley`. Traz:
   - o contexto e o roteiro, com o papel dele;
   - o que ele já entregou;
   - as tarefas em 3 níveis (🔴 crítico, 🟡 importante, 🟢 pode esperar);
   - um calendário semana a semana, as regras de entrega e com quem falar.
10. **Seção "🤝 O que o Sirlande pode assumir"** no alinhamento, com caixas de aceite. O Sirlande decidiu manter os quatro itens:
    - **A:** CA-05.6.a, pagamento no check-out (está no parecer);
    - **B:** corrigir o `./start.sh seed` (o Weslley revisa);
    - **C:** CA-05.6.d, tela de cortesias e perdas;
    - **D:** reverificar o `payment-mix`.

    B, C e D são ofertas extras. O C fica condicionado às metas do Sirlande (M5-b, M5-c e seed) estarem em dia.

#### O que o parecer propõe para o Sirlande
- **M5-b:** registro de pagamento no check-out (CA-05.6.a), que sai da T-05.6. Começa depois que a t052 entrar na `develop`.
- **M5-c:** endpoint de itens estornados com `deleted_by`, que destrava o CA-05.2.j do Gabriel.
- **M8:** seed da demonstração do roteiro inteiro.
- **Apoio:** ajudar o Gabriel com o conflito do `App.tsx` no merge da t051 e da t052.

#### Review (feito no fim da sessão)
Cada afirmação factual do parecer foi conferida de novo contra o `origin`:

| Afirmação | Resultado |
|---|---|
| 31 commits na `develop` fora da `main` | ✅ |
| t051/t052 com conflito; analytics e tenant-fk limpos | ✅ (`git merge-tree`) |
| T-05.2 não chama `/payments` | ✅ nenhum uso de `/payments` em `features/reservations` da t052 |
| CA-05.2.j bloqueado no backend | ✅ SPEC-05 da t052, linha 108 |
| App `booking` vazio | ✅ só `package.json` e README |
| Último commit do Weslley em 17/10 | ✅ em todas as branches |
| Registro de pagamento "sem dono" (1ª versão) | ❌ **corrigido**: é o CA-05.6.a da T-05.6 (Weslley) |
| Docs 05 e 07 na tabela "sem branch" | ❌ **corrigido**: o 05 tem a v1.1 na `develop`; o 07 está no PR #97 |

As duas correções estão no `.md` e na página. O topo da página avisa da primeira.

#### Pendências
1. **Ponto de controle de 03/11** (02/11 é feriado): levar as 7 decisões do parecer, §7, e as recomendações do item 7 desta sessão (fechamento e INTERNAL).
1b. **Aceite do Weslley** sobre os itens A a D do alinhamento. Pode vir antes de 03/11. Se ele aceitar tudo, a carga do Sirlande fica assim: M5-b até 07/11, M5-c até 10/11, seed até 17/11, mais B e D na semana 2 ou 3 e o C na semana 3.
2. **Depois das decisões:** atualizar o parecer com o que foi aceito, mergear a branch na `develop` e refletir no `PLANO_MVP` e no painel. Quem faz isso depende do PR #99, que é do Gabriel.
3. **Se a M5-b for aprovada:** plano RPI da tela de pagamento, depois que a t052 estiver na `develop`.
4. **Herdadas de 27/10, sem mudança:**
   - os 3 P2 do critique;
   - os achados 7 e 8;
   - os 🟢-4, 🟢-5 e 🟢-7 do qa-redteam;
   - o repasse do AppShell;
   - `DROP DATABASE gestao_hotel_t047`.

#### Próxima sessão
Conferir as caixas do §3 do alinhamento e as decisões do ponto de controle. Por ordem:
- se o **B** for aceito, é o mais rápido e pode começar já;
- se o **A** for aceito e a t052 estiver na `develop`, começar o research da tela de pagamento (M5-b);
- o **D** é uma verificação curta, que dá para encaixar entre os dois.
