# Parecer sobre o Plano até 10/12 — estado em 28/10/2026

**Autor:** Sirlande Martins · **Data:** 28/10/2026 (quarta, início da semana 2)
**Sobre:** `docs/PLANO_MVP_ATE_10DEZ2026.md` (Gabriel, 21/10, PR #99) e o boletim do time publicado a partir dele.
**Natureza:** proposta de ajuste, para decidir no ponto de controle da semana 2. Não altera o plano sozinho: o que for aceito entra no `PLANO_MVP` e no painel.

---

## 1. Resumo

1. O plano está certo no essencial. O roteiro de 7 passos define o escopo, o congelamento é em 24/11 e a nuvem fica para o 5º semestre. Nada disso muda.
2. A grade das semanas já não descreve o projeto. A minha frente está cerca de 2 semanas adiantada. As frentes de quartos, reservas e analytics estão prontas, mas fora da `develop` desde 24/10.
3. **Um passo do roteiro não tem dono.** No passo 5, "o pagamento é registrado" no check-out, mas ninguém está fazendo a tela de registrar pagamento.
4. Proponho que cada meta tenha **um dono, um critério de pronto e uma data**, como na §4 abaixo. Hoje a grade diz o que cada pessoa faz na semana, mas não diz quando cada passo do roteiro está pronto.

---

## 2. Estado do projeto em 28/10

Levantado no repositório (`origin`), não de memória.

### 2.1 Na `develop`

| Entrega | Dono | Quando entrou | Observação |
|---|---|---|---|
| SPEC-04, backend da comanda: T-04.1 a T-04.4 (contas, consumo, bill, pagamento ligado à conta) | Sirlande | 19/10 | Decisões D-1 a D-50 |
| **T-04.5**: bill da reserva calculado pelas contas | Sirlande | 26/10 | Na grade, era da semana 2 |
| **T-04.6**: o check-in cria a conta da suíte (CA a, c, d) | Sirlande | 26/10 | Na grade, era da semana 3. CA-04.6.b fica para o 5º semestre |
| **T-04.7**: seed da comanda e relatório de consumo interno | Sirlande | 26/10 | Na grade, era da semana 3 |
| **T-05.5 Fase A**: comanda do garçom no celular | Sirlande | 26/10 (PR #102) | Inclui a fila offline, ou seja, o "inclusive sem rede" do passo 3 |
| T-05.5, correções da revisão Impeccable e P1 do critique | Sirlande | 27/10 | Critique de 24 para 26/40, zero P0. Decisões C-1 a C-20 |
| Repasses de `payments`/`products` (índice de `provider_charge_id`) | Sirlande | 26/10 | |
| **T-06.13**: estorno com motivo e autor | Gabriel | 24/10 (PR #100) | |
| Repasses de conta do quarto e webhook | Gabriel | 24/10 (PR #101) | Aval D-51 a D-53 |
| PIX Asaas sandbox (SPEC-03) | Weslley | 17/10 | Exclusão da chave de produção exposta registrada em 16/10 |

A `develop` tem **31 commits que ainda não estão na `main`**. Falta o PR de release.

### 2.2 Prontas, mas fora da `develop`

As quatro branches abaixo estão paradas desde 24/10. A regra do plano (§6, item 2) é que nenhum PR fique mais de 2 dias aberto.

| Branch | Conteúdo | Commits | Merge com a `develop` hoje |
|---|---|---|---|
| `feature/t051-quartos-categorias` | T-05.1, passo 1 do roteiro | 18 | **Conflito** em `App.tsx`, `openapi.json` e `schema.d.ts` |
| `feature/t052-reservas` | T-05.2, passos 2 e 5 (conta em linha do tempo, check-in de walk-in) | 18 | **Conflito** nos mesmos 3 arquivos |
| `feature/analytics-service` | H.2, base do passo 7 | 16 | Limpo |
| `fix/tenant-fk-validation` | Validação de tenant nas FKs | 12 | Limpo |

Não é falha de ninguém. As quatro foram feitas em paralelo, a partir da `develop` de 19/10, enquanto a comanda entrava. Mas cada dia sem merge aumenta o conflito, e a T-05.3 (painel Hoje) depende de t051 e t052.

### 2.3 Sem branch nem commit até 28/10

| Item do plano | Dono no plano | Semana no plano |
|---|---|---|
| H.3: consultas sobre as projeções, nginx, compose | Gabriel | 2 |
| T-05.3: painel Hoje (passo 4) | Gabriel | 2 |
| T-05.6: financeiro e indicadores (passo 7) | Weslley | 2–3 |
| T-01.5: CI por serviço | Weslley | 2 |
| Doc 08: reescrita com a grade real | Weslley | 3 |
| Docs 05 e 07: versão final (05 está em v1.1 sugerida; 07 está no PR #97, aberto) | Gabriel | 2 |

O último commit do Weslley no repositório é de 17/10.

---

## 3. Onde a grade de 21/10 não vale mais

| O plano diz | Situação real | Ajuste proposto |
|---|---|---|
| Sirlande: T-05.5 até a semana 2, T-04.5 na 2, T-04.6 e T-04.7 na 3 | Tudo entregue até 27/10 | Liberar a minha capacidade das semanas 2 a 4 para as lacunas da §4 |
| Risco "comanda depender do Sirlande sozinho" | Resolvido: a Fase A está entregue | Tirar da lista de riscos |
| Passo 3, "inclusive sem rede", sem desenho | Resolvido pela fila offline da comanda (`queueCore`/`queueStore`) | Registrar como atendido |
| Passo 5 atribuído a "T-05.2 + SPEC-04 (pronta)" | A T-05.2 mostra a conta e faz o check-out, mas não registra pagamento. O backend existe (T-04.4); a tela, não | Criar a meta M5-b (§4) com dono |
| CA-05.2.j (estorno visível com `deleted_by`) | Bloqueado: os endpoints de bill só devolvem itens vivos | O backend da comanda é meu: assumo o endpoint |
| `App.tsx` e `nav.ts` só aceitam acréscimo, "o que evita conflitos" | Não evitou: t051 e t052 já conflitam | Merge na ordem da §5 e regenerar o `api-client` após cada merge, nunca editar à mão |

---

## 4. Metas do roteiro: dono, critério de pronto e data

**Dono** responde pela entrega e pelo merge. **Apoio** revisa ou faz uma parte combinada. Pronto quer dizer: na `develop`, com `qa_checks.sh` verde, verificação no navegador (desktop e celular) e relatório do qa-redteam.

| Meta | Passo | Solução | Dono | Apoio | Critério de pronto | Data |
|---|---|---|---|---|---|---|
| **M1** · Quartos e categorias | 1 | T-05.1 | Gabriel | Sirlande (conflito do `App.tsx`) | `feature/t051` na `develop` | 30/10 |
| **M2** · Reserva e check-in | 2 | T-05.2 | Gabriel | Sirlande (conflito do `App.tsx`) | `feature/t052` na `develop`, walk-in `PENDING → CHECKED_IN` incluso | 30/10 |
| **M3** · Comanda no celular | 3 | T-05.5 | Sirlande | — | ✅ Fase A na `develop`. Falta: os 3 P2 do critique e os achados 7 e 8 | P2 até 17/11 |
| **M4** · Painel do dia | 4 | T-05.3 | Gabriel | — | Chegadas, saídas e risco de no-show na tela | 10/11 |
| **M5-a** · Conta no check-out | 5 | T-05.2 (linha do tempo) | Gabriel | — | Já está na `feature/t052`. Entra com M2 | 30/10 |
| **M5-b** · Registrar pagamento no check-out | 5 | **Nova:** tela de pagamento (balcão) sobre `POST /payments` (T-04.4) | **Sirlande** | Gabriel (revisão, porque a tela fica na página dele) | Registra método e valor. O saldo do bill zera. A conta passa a PAID pelo `settlePaymentAccount`. A estadia fecha. O aviso pós-fechamento da comanda aponta para essa tela | 07/11 |
| **M5-c** · Estorno visível na linha do tempo | 5 | CA-05.2.j: endpoint que lista itens excluídos com `deleted_by` | **Sirlande** (backend) | Gabriel (tela) | Endpoint com tenant e teste. A tela mostra quem autorizou | 10/11 |
| **M6** · Reserva direta com PIX | 6 | SPEC-03 (pronto) | Weslley | Gabriel | Ensaio no sandbox com o webhook confirmando. Plano B com provedor simulado testado | 17/11 |
| **M7-a** · Analytics na `develop` | 7 | H.2 | Gabriel | — | `feature/analytics-service` na `develop` | 29/10 |
| **M7-b** · Consultas e indicadores | 7 | H.3 + T-05.6 | Gabriel (H.3) · Weslley (T-05.6) | — | O gerente abre a tela e os números vêm do `analytics-service` | 14/11 |
| **M8** · Roteiro inteiro sobe localmente | todos | `docker compose up` + seed da demonstração | Weslley (compose) · **Sirlande** (seed) | Gabriel | Banco vazio → `up` → seed → os 7 passos funcionam sem passo manual | 17/11 |
| **M9** · Congelamento e ensaio | todos | qa-redteam geral, T-06.1, T-06.12 | Gabriel | todos | Zero 🔴 aberto em 24/11 | 24/11 |
| **M10** · Release | — | PR `develop → main` | Gabriel | Sirlande (aprova no GitHub) | `main` igual à `develop` congelada | 01/12 |

### Por que M5-b, M5-c e o seed ficam comigo

- **É o meu domínio.** Conta, pagamento ligado à conta, `settlePaymentAccount` e as travas reserva → conta são da SPEC-04. Uma tela de pagamento feita sem esse contexto corre o risco de deixar CLOSED/PAID desatualizado, que foi o tipo de 🔴 que o qa-redteam achou nas T-04.3 e T-04.4.
- **Tenho capacidade.** As minhas entregas das semanas 2 e 3 já estão na `develop`.
- **Fecha uma pendência minha.** A comanda fecha a conta com saldo em aberto (C-19). Hoje o aviso não pode dizer onde receber, porque essa tela não existe.
- **O seed já é meu.** Sou dono de `seed/` e fiz o seed da comanda na T-04.7. Estendê-lo para o roteiro inteiro é natural.

---

## 5. Ordem de integração (semana 2)

1. **29/10:** `fix/tenant-fk-validation` e `feature/analytics-service` (merge limpo).
2. **30/10:** `feature/t051`, depois `feature/t052`. Resolver o `App.tsx` mantendo as rotas da comanda e regenerar o `api-client` depois de cada merge. Eu acompanho o conflito.
3. **Depois de M2:** começo a M5-b sobre a `develop` já com a t052, para não abrir um terceiro conflito na mesma página.
4. **Até 03/11:** PR de release `develop → main` com o que estiver integrado. Isso reduz o salto da semana 6.

---

## 6. Riscos, revistos

| Risco | Situação em 28/10 | Mitigação |
|---|---|---|
| Integração atrasada (4 branches fora) | **Novo, alto** | Ordem da §5. Merge diário a partir daqui |
| Frente do Weslley sem atividade visível desde 17/10 (T-05.6, T-01.5, Doc 08, compose) | **Novo, alto** | Confirmar no ponto de controle. Se a T-05.6 não tiver branch até 04/11, aplicar a mitigação do plano: a H.3 entrega 2 ou 3 indicadores e a tela fica com quem tiver capacidade |
| Passo 5 sem pagamento | **Novo, alto** | M5-b com dono (§4) |
| Gabriel concentra H.3, T-05.3, integração, Docs 05 a 07 e o congelamento | **Aumentou** | Eu assumo M5-b, M5-c e o seed. O Gabriel fica no caminho crítico |
| Comanda depender do Sirlande sozinho | **Resolvido** | — |
| Requisito offline sem desenho | **Resolvido** | Fila offline da T-05.5 |
| Chave de produção do Asaas | **Registrada como excluída** (16/10) | O Weslley confirma no ponto de controle que a revogação foi feita no painel do Asaas |
| Feriado de 02/11 (Finados) na semana 2 | Novo, baixo | Ponto de controle da semana 2 em 03/11 |

---

## 7. Decisões que peço ao time

1. **Aceitar a tabela da §4** como a forma de acompanhar o plano, com o painel apontando para ela.
2. **Aprovar M5-b, M5-c e o seed (M8) comigo.**
3. **Ordem e datas da integração da §5**, com o Gabriel confirmando que 29–30/10 é viável.
4. **Weslley:** confirmar T-05.6, T-01.5, Doc 08 e o compose, ou devolver o que não couber até 04/11.
5. **Produto (comanda):** o fechamento de conta fica só no balcão? Conta INTERNAL aceita item faturável?
6. **Ferramenta:** entra `e2e/` com Playwright no CI? O dono dos workflows é o Weslley. Hoje cada frente tem o roteiro de verificação fora do repositório.

---

## 8. O que não muda

- O roteiro de 7 passos como critério de escopo.
- Os cortes para o 5º semestre (§3 do plano), incluindo o rack completo e as telas de B2B.
- O congelamento em 24/11 e a folga da semana 7.
- O fluxo de qualidade por entrega: TDD, mutação, qa-redteam e merge na `develop`; release por PR.
