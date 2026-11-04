# Plano até 10/12/2026 — documentação completa e MVP do 4º semestre

**Data:** 21/10/2026 · **Autor:** Gabriel (com apoio do agente orquestrador)
**Substitui, até 10/12:** a grade da §5 de `docs/DIVISAO_TRABALHO_TIME_09set2026.md`. As trilhas e os donos continuam os mesmos; muda o que entra e a ordem.

---

## 1. O que o 4º semestre exige de fato

Do Termo de Aceite (`aceite-projeto-experimental.md` §7), lido de novo em 21/10:

| Semestre | Exigido |
|---|---|
| **4º — até 10/12** | **Os 8 documentos** + **MVP funcional**, demonstrando a viabilidade da proposta e a **integração inicial dos microsserviços** |
| 5º | Solução completa, **deploy em nuvem com Terraform**, cobertura mínima, monitoramento e defesa na banca |

**Consequência que muda o plano:** o deploy em nuvem (T-02.2, T-02.3, T-02.5) é do **5º semestre**. Ele sai do caminho crítico de agora. Isso também tira a pressão da conta AWS: o Doc 05 descreve o alvo, e a conta pode ser criada perto do 5º semestre, para que os 6 meses do plano de créditos cubram até a defesa.

## 2. O MVP, definido por um roteiro de demonstração

O MVP é **o que este roteiro mostra funcionando, ao vivo, sem nuvem** (Docker Compose). Tudo que não aparece aqui é pós-MVP.

1. O administrador cadastra categorias e quartos — **T-05.1**.
2. A recepção cria uma reserva, vê o valor antes de confirmar e faz o check-in — **T-05.2**.
3. O garçom, pelo celular, lança consumo na conta da suíte e numa mesa, inclusive sem rede — **T-05.5**.
4. A recepção abre o painel do dia, vê chegadas, saídas e risco de *no-show* — **T-05.3**.
5. No check-out, a conta aparece em linha do tempo, o pagamento é registrado, e a conta e a estadia fecham — **T-05.2** + SPEC-04 (pronta).
6. Um hóspede faz reserva direta e paga o sinal por PIX no *sandbox* do Asaas; o webhook confirma a reserva — backend pronto (SPEC-03).
7. **O gerente abre os indicadores, servidos pelo `analytics-service`**, um serviço separado que recebeu os eventos do core pelo RabbitMQ — **H.2 + H.3** e **T-05.6**. É aqui que a banca vê os microsserviços.

## 3. Cortes para o 5º semestre (decididos agora, de propósito)

| Sai do 4º semestre | Por quê |
|---|---|
| SPEC-02: T-02.2, T-02.3, T-02.5 (Terraform, k8s na nuvem, deploy pelo CI) | O Termo põe nuvem no 5º semestre |
| T-01.6 — extrair o `b2b-service` | Já era do 5º semestre |
| SPEC-07 — tarifas por período | Era o *buffer* do plano original |
| ADR-007 — uma reserva por quarto | Adiada em 21/10/2026 |
| T-05.4 — rack completo | ~5 dias, a tela mais complexa. Entra **só** se a semana 4 sobrar |
| T-05.7, T-05.8, T-05.9, T-05.10, T-05.11, T-05.12 | Fora do roteiro. A ficha (T-05.10) e o caixa (T-05.11) dependem de backend novo (RF-055, RF-056), já modelado no MER como 🔷 |
| T-04.6 — divisão de conta e *day-use* | Fica **só** "o check-in cria a conta da suíte", que o roteiro usa |
| T-06.7 (refresh token), T-06.10 (paginação), T-06.11 (eliminação LGPD) | Não aparecem no roteiro; T-06.10 continua sendo pré-requisito da T-05.12 |

O que fica de qualidade: **T-06.13** (estorno, em andamento), **T-06.12** (dado pessoal no log) e **T-06.1** (cobertura conforme o Termo).

## 4. A grade — 7 semanas

Semana 1 = 21/10. Cada linha é uma frente que **não espera a outra**.

| Semana | Gabriel + agentes | Sirlande | Weslley |
|---|---|---|---|
| **1** · 21–27/10 | H.2 `analytics-service` · T-05.1 quartos · T-05.2 reservas · T-06.13 estorno · repasses do QA (agentes rodando) | **T-05.5 comanda** (delegação pronta) | Responder a conta AWS e o nó · Doc 08 atualizado · painel do RabbitMQ no Grafana |
| **2** · 28/10–03/11 | **H.3** — consultas sobre as projeções, nginx, compose · T-05.3 painel Hoje · **entrega dos Docs 05, 06 e 07** | T-05.5 (fim) · **T-04.5** bill da reserva pelas contas | **T-05.6 financeiro e indicadores** (consome o analytics) · T-01.5 CI por serviço (dono do `.github/workflows`) |
| **3** · 04–10/11 | Integração do roteiro de ponta a ponta · T-06.12 | **T-04.6 só o check-in cria a conta** (depende da T-04.5) · T-04.7 *seed* de demonstração | T-05.6 (fim) · migrate antes e depois do *rollout* (repasse) · **entrega do Doc 08** |
| **4** · 11–17/11 | Rack simplificado **se sobrar** · correções | Correções da comanda no celular | Contingência: `docker compose up` sobe o roteiro inteiro, com o analytics |
| **5** · 18–24/11 | 🧊 **Congelamento de funcionalidades em 24/11** · qa-redteam geral · cobertura (T-06.1) | Ensaio do roteiro | Ensaio do roteiro |
| **6** · 25/11–01/12 | Ensaio geral · *release* `develop → main` · Doc 02 v1.4 e Doc 03 (pendências) para a revisão final | idem | idem |
| **7** · 02–10/12 | **Folga** e entrega final | | |

## 5. Documentos — o que falta e quando

| Doc | Situação em 21/10 | O que falta | Quando |
|---|---|---|---|
| 01 | ✅ Entregue | — | — |
| 02 | ✅ Entregue (v1.3) | v1.4: RF-045 no `b2b-service`, RNF-023, exceção do RNF-003 na nuvem, módulos ainda com `billing-service` | Revisão final, semana 6 |
| 03 | ✅ Entregue (v1.2) | `PRODUCTS` 🔷 e PDF de orçamento no D-005 | Revisão final, semana 6 (Sirlande) |
| 04 | ✅ Entregue (v1.3, 19/10) | — | — |
| 05 | Branch `entrega-5-arquitetura-nuvem` | Auditoria: modelo de free-tier, SG de saída, overlay da nuvem, SSL no RDS. **Não depende mais da data da conta**: descreve o plano de créditos e a criação da conta no 5º semestre | Semana 2 |
| 06 | ✅ Pronto (`entrega-6-c4`) | — | Semana 2 |
| 07 | PR #97 (11 ADRs) | ADR-004 alinhada ao Doc 05 final | Semana 2 |
| 08 | Sugestão v1.0 de 07/10 | Reescrever com esta grade e com o registro real das sprints | Semana 3 |

**Proposta ao professor:** entregar 05, 06 e 07 no mesmo PR, como já foi aceito para outro grupo (`[RECORA] - Entrega 5 a 7`), e o 08 no encontro seguinte. Isso libera os encontros finais para a revisão do conjunto.

## 6. Como acelerar sem perder qualidade

1. **Agentes em paralelo, um por módulo**, cada um no seu *worktree*, com banco e broker próprios. É o que está rodando desde 21/10.
2. **O gargalo é a revisão, não a escrita.** O qa-redteam roda em cada entrega antes do PR. O merge é diário e em PRs pequenos, sem PR acumulado.
3. **O roteiro da §2 decide o escopo.** Pergunta de "isso entra?" se responde olhando o roteiro.
4. **Congelamento em 24/11.** Depois disso, só correção e ensaio.
5. **Ponto de controle semanal de 30 minutos (segunda-feira).** Cada um traz o que entrou, o que travou e o que muda na grade. O Doc 08 registra a execução real.
6. **Cada um no frontend do seu domínio**, como já previsto: quem fez a API faz a tela. A grade acima mantém isso.

## 7. Riscos

| Risco | Mitigação |
|---|---|
| H.2 e H.3 maiores que o previsto | H.2 rodando desde 21/10; se estourar, a H.3 entrega primeiro 2 ou 3 indicadores pelo analytics e mantém os outros no core até a semana 4 |
| Comanda depender do Sirlande sozinho | Delegação pronta para agente; se a semana 2 terminar sem a Fase A, um agente assume com ele revisando |
| Revisão virar fila | qa-redteam por entrega + merge diário; nenhum PR fica mais de 2 dias aberto |
| Queda de sessão dos agentes (aconteceu em 21/10) | Commit e push a cada passo lógico |
| Demonstração depender de rede | Roteiro roda no Docker Compose local; o PIX do Asaas tem plano B com o provedor simulado |
