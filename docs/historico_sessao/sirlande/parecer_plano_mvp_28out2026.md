### 2026-10-28 — Sirlande (orquestrando Claude Code)

- **Branch:** `docs/parecer-plano-mvp-sirlande` (no GitHub, não mergeada na `develop`, sem PR) · **Tarefa:** analisar o plano até 10/12 do Gabriel (boletim do time, PR #99) contra o estado real do repositório e escrever o parecer do Sirlande
- **Estado:** ✅ parecer escrito, revisado e enviado ao time como página · decisões ficam para o ponto de controle de 03/11

#### O que foi feito
1. **Retomada:** estado da T-05.5 depois da sessão de 27/10. A comanda está fechada na `develop` (`a6dc1ea`).
2. **Análise do plano** (`docs/PLANO_MVP_ATE_10DEZ2026.md`, só na branch do PR #99), feita a partir do repositório (`origin`) e não do boletim:
   - a frente do Sirlande está cerca de 2 semanas à frente da grade: T-04.5, T-04.6, T-04.7 e T-05.5 Fase A estão na `develop`;
   - 4 branches do Gabriel estão prontas, mas paradas fora da `develop` desde 24/10: t051, t052, analytics-service e tenant-fk. A t051 e a t052 conflitam em `App.tsx`, `openapi.json` e `schema.d.ts`;
   - H.3, T-05.3, T-05.6, T-01.5 e Doc 08 não têm branch. O último commit do Weslley é de 17/10;
   - **passo 5 do roteiro:** a T-05.2 mostra a conta, mas não registra pagamento. O registro é o CA-05.6.a, na T-05.6 do Weslley, ainda sem branch;
   - **passo 6 do roteiro:** o backend do PIX está pronto, mas o app `frontend/apps/booking` está vazio e marcado como pós-TCC. Nenhum plano diz por onde o hóspede reserva na demonstração.
3. **Parecer:** `docs/PARECER_PLANO_MVP_SIRLANDE_28out2026.md`. Traz o estado em 28/10, as divergências da grade, as metas M1 a M10 com dono, critério de pronto e data, a ordem de integração, os riscos revistos e 7 decisões para o time.
4. **Página para o time:** https://claude.ai/artifact/4iRVip5UFvom7ntHYqZzwu (versão 3), com acesso liberado por link. O `.md` também está no GitHub, na branch acima.
5. **Levantamento do frontend:** todas as tarefas da SPEC-05 (T-05.1 a T-05.12) e o `PLANEJAMENTO_FRONTEND.md`. Não há plano de frontend esquecido. No MVP, faltam começar só a T-05.3 (painel Hoje) e a T-05.6.
6. **Divisão de papéis:** conferida em `DIVISAO_TRABALHO_TIME_09set2026.md` e no `git log`. A divisão é por domínio: Gabriel cuida de arquitetura, reservas e QA; Sirlande, de consumo e cobrança e do banco; Weslley, de infra, integrações e documentação.

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
1. **Ponto de controle de 03/11** (02/11 é feriado): levar as 7 decisões do parecer, §7.
2. **Depois das decisões:** atualizar o parecer com o que foi aceito, mergear a branch na `develop` e refletir no `PLANO_MVP` e no painel. Quem faz isso depende do PR #99, que é do Gabriel.
3. **Se a M5-b for aprovada:** plano RPI da tela de pagamento, depois que a t052 estiver na `develop`.
4. **Herdadas de 27/10, sem mudança:**
   - os 3 P2 do critique;
   - os achados 7 e 8;
   - os 🟢-4, 🟢-5 e 🟢-7 do qa-redteam;
   - o repasse do AppShell;
   - `DROP DATABASE gestao_hotel_t047`.

#### Próxima sessão
Trazer as decisões do ponto de controle. Se a M5-b for aprovada e a t052 já estiver na `develop`, começar o research da tela de pagamento.
