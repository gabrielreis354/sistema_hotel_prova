# O que falta até o congelamento de 24/11 — estado de 19/11/2026

**Autor:** Sirlande, com apoio do Claude Code · **Data:** 19/11/2026
**Base:** `develop` em `205e3f6` e PRs abertos (atualizado com o #189, mergeado em `c1c9b79`), conferidos contra o
[`PLANO_FECHAMENTO_MVP_15NOV2026.md`](../PLANO_FECHAMENTO_MVP_15NOV2026.md).

Versão visual para divulgar ao time: https://claude.ai/artifact/SnX3tbukjvyTNrK1hc74fk
(privada até ser compartilhada pelo menu Share).

## Resumo

| Data | Marco |
|---|---|
| 19/11 | Hoje |
| **24/11** | **Congelamento e 2º ensaio** |
| 01/12 | Versão final na `main` |
| 10/12 | Apresentação |

Quase nada do que trava é código: o risco maior está no **passo 8 (Grafana)** e nos
**documentos**. Contagem: 🔴 4 · 🟡 5 · 🟢 3 · ✅ 8 resolvidos desde 15/11.

## 🔴 Crítico: pode tirar nota ou travar o ensaio de 24/11

| # | Pendência | Dono | Por quê |
|---|---|---|---|
| 1 | O `analytics-service` não tem `/metrics`: não usa `prom-client`, e o `docker/prometheus/prometheus.yml` só tem os jobs `core-service` e `rabbitmq` | Weslley | O passo 8 vai mostrar um Grafana que não enxerga o serviço que prova os microsserviços (C1), e o RNF-029 diz o contrário. Instrumentar antes de 24/11, ou declarar a exceção no Doc 08 |
| 2 | O passo 8 (Grafana) não está escrito em nenhum roteiro (`docs/roteiro/` só tem o passo 6), e não há uma execução verde do Actions separada para mostrar (R2 e R3) | Weslley | É critério do ensaio de 24/11 |
| 3 | O Doc 08 continua na v1.1, de 29/10 | Weslley | Dá como "em branch" ou "🔲" o que já está entregue (H.2, T-05.1 a T-05.3, T-05.6, CI e e2e). Esconde a evidência do C1 |
| 4 | Textos dos documentos oficiais (revisão de 19/11, `docs/banca/CONTRADICOES_DOCUMENTACAO_19NOV2026.md`, PR #179) | Grupo | RNF-007 contra o código, página pública dada como implementada, FKs entre serviços no MER, segredos versionados (RNF-011) e fichas de encontro quebradas (C10). Só texto, mas cada um é 🔴 de não conformidade |

## 🟡 Alto: fazer antes de 24/11

| # | Pendência | Dono | Observação |
|---|---|---|---|
| 1 | SPEC-11 ainda é proposta | Gabriel · revisão Sirlande | Duplo clique em "Confirmar check-in" envia dois PUT e mostra erro falso; cartões do painel Hoje ficam uma ação atrás |
| 2 | CPFs inválidos no seed | Sirlande | Trocar por CPFs válidos de teste (repasse da SPEC-11) |
| 3 | Duplo toque em "Abrir conta" da mesa | Sirlande | O `OpenAccountForm` já desabilita o botão com `isPending`, mas a avaliação simulada viu duas contas. Conferir no navegador |
| 4 | #182 num iPhone de verdade | Sirlande | Tocar 3 vezes, tocar no campo e digitar 6: tem que dar 6, não 36 |
| 5 | Chave do Asaas e rótulo `CARTAO` em `shares.ts` | Weslley | O relatório de 16/11 registra o vencimento da chave: confirmar a troca e o passo 6 no sandbox real |

## 🟢 Baixo ou fora do congelamento

- PRs só de documentação: #187 (plano da SPEC-10), #179 (avaliação simulada) e #129 (rascunho do Doc 08).
- SPEC-10: combinado que nada entra na `develop` antes de 10/12.
- Riscos aceitos no MVP: o app não é PWA (recarregar sem rede não abre) e o hóspede que chega de
  madrugada no dia da saída cai em `RESERVATION_EXPIRED`.

## ✅ Resolvido desde o plano de 15/11

- Imagem do MinIO compilada localmente, sem o 401 (Weslley, 16/11).
- Roteiro e2e no CI, sem bloquear o merge (#176).
- Seed do dia também no k8s (#177) e com os avisos do banco (#188).
- Comanda: acabamentos, quantidade, pagamento e aviso de sem conexão (#165, #182, #183, #185).
- Painel Hoje dentro de 3.000 px e foco do "Ver todas" (#178).
- Cabeçalho e seções (#167) e login novo (#181).
- Garçom sem o 403 em `GET /tenants/me` (#189). Conferido no navegador em 19/11 com garçom,
  recepção e administrador, inclusive na troca de papel na mesma aba; aprovado e mergeado.
- O 500 do `GET /analytics/occupancy` visto em 17/11 é do ambiente de QA: o
  `qa_explorador_ambiente.sh` não sobe o `analytics-service`, e o core não serve essas rotas desde a
  H.3, então o proxy do Vite devolve 500. Não afeta o roteiro no compose.

O plano de fechamento e o `PAINEL_DE_ANDAMENTO_MVP.md` ainda dão o MinIO como 🔴 e precisam ser
atualizados.

## Ordem sugerida

1. **Weslley:** `/metrics` do analytics, passo 8 escrito e Doc 08 v1.3. É o caminho crítico.
2. **Sirlande:** CPFs do seed, depois o duplo toque em "Abrir conta" e o #182 no iPhone.
3. **Gabriel:** decidir a SPEC-11 a tempo de implementar até 24/11.
4. **Grupo:** dividir as correções de texto dos documentos, começando pelas fichas de encontro.

Os donos dos itens 2 e 3 são sugestão desta análise, não um combinado registrado.

## Como conferir

```bash
git fetch --all --prune
git log --oneline origin/develop -20
gh pr list --state open
grep -c prom-client services/analytics-service/package.json   # 0 = sem métricas
grep -n job_name docker/prometheus/prometheus.yml
```
