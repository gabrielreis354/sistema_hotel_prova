# Resposta do Sirlande ao plano de fechamento do MVP

> **Data:** 15/11/2026
> **Plano respondido:** `docs/PLANO_FECHAMENTO_MVP_15NOV2026.md` e `docs/delegacoes/fechamento_mvp_sirlande_15nov2026.md`
> **Decisão:** opção **(b)** para a comanda, mais os ajustes abaixo

Concordo com a direção do plano: roteiro de 7 passos mais o passo 8 no Grafana, passo 6 no sandbox real do Asaas e congelamento em 24/11. Abaixo estão a resposta ao pedido da comanda, um ajuste na minha carga e três pontos do M8 que mudam os critérios de aceite.

---

## 1. Comanda: opção (b)

O Gabriel faz, numa branch `fix/comanda-acabamento`:
- o **aviso de "sem conexão"** (achado 7 de 27/10), ligado ao `onlineManager` do TanStack Query;
- o **tempo restante para desfazer** o lançamento (janela de 5 s).

Eu reviso o PR e confiro com o qa-explorador os três itens dados como feitos: aviso de mesa com nome repetido, caixa que cortava a primeira linha e rodapé fixo da conta. Prazo: 20/11.

## 2. A SPEC-08 precisa entrar na minha parte do plano

A SPEC-09 passou três achados da revisão de 15/11 para a SPEC-08 (`SPEC-09`, linhas 65 a 67): a marca "Hotel PMS" (T-08.2), os botões desabilitados na reserva encerrada (T-08.3) e o botão "Sair" com 36 px (T-08.6). O plano de fechamento não cita a SPEC-08. Somando as decisões de bibliotecas de 15/11 (PR #155, SPEC-08 §9), minha parte até 24/11 fica assim:

| O quê | Prazo | Estimativa |
|---|---|---|
| Seed com as datas do dia (M8) | 17/11 | — |
| Revisão do PR da comanda e conferência com o qa-explorador | 20/11 | 0,5 dia |
| SPEC-08 mínima: T-08.1 (Inter), T-08.2 (marca e ícones do lucide-react) e T-08.3 (hierarquia de ações) | 24/11 | 3 dias |
| Setas do teclado nas abas da reserva e foco da folha "Mais", à mão | 24/11 | 0,5 dia |
| Revisão do PR do roteiro automatizado (`feature/e2e-roteiro`) | antes de 24/11 | — |

Com a opção (a), a conta não fechava em 6 dias (18 a 23/11). A T-08.6 ("Sair" com 36 px) entra se sobrar tempo; senão, fica como correção depois do congelamento, porque é defeito de alvo de toque.

**Pedido:** acrescentar essa tabela à minha seção no §5 do plano e a linha da SPEC-08 ao calendário do §6.

## 3. Três pontos do M8 que mudam os critérios

### 3.1 O seed sozinho não acende os indicadores

Os 4 cartões do gerente leem as projeções do analytics (`proj_payments`, `proj_reservations`, `proj_rooms`), alimentadas pelo outbox via RabbitMQ. O seed grava só no banco do core. Para os cartões saírem de zero, depois do seed é preciso rodar:

```bash
ALLOW_SEED=1 node command.js seed
node command.js outbox-initial-load
```

**Pedido:** pôr o segundo comando no §9 ("Dados do dia") e no roteiro do ensaio de 24/11. No M8 eu confiro se a carga inicial pode rodar duas vezes sem duplicar e documento a ordem no `--help` do `command.js`.

### 3.2 O fuso é problema do seed, não do analytics

O plano diz que "os indicadores cortam o dia em UTC". Isso foi corrigido na D-68: o analytics conta o dia em `HOTEL_TIMEZONE` (`GetRevenueController.js:27`, `GetOccupancyController.js:21`). O risco agora está no seed: o `CURRENT_DATE` do Postgres segue o fuso da sessão (UTC), e um seed rodado depois das 21h em Brasília gravaria "hoje" como amanhã. O M8 calcula o dia com `(now() AT TIME ZONE 'America/Sao_Paulo')::date`.

**Pedido:** tirar o aviso de UTC do critério de `paid_at` na mensagem de 15/11.

### 3.3 Idempotência com datas relativas

Hoje o seed não duplica porque ignora o que já existe (`ON CONFLICT DO NOTHING`). Com datas relativas isso não basta: rodado em outro dia, o seed manteria as datas do dia anterior e o painel zeraria de novo. O bloco do dia vai **reescrever datas e status** quando rodar outra vez, sem criar linhas novas. Ele também respeita a janela do check-in do #147: toda estadia `CHECKED_IN` tem entrada até hoje e saída depois de hoje, com o quarto `OCCUPIED`.

**Critério de aceite que acrescento:** rodar o seed em dois dias diferentes mantém o painel Hoje com números diferentes de zero nos dois.

## 4. Pontos desatualizados no plano

| Onde | O que diz | Situação em 15/11 |
|---|---|---|
| §3, passo 7, e §6, 15–16/11 | #145 (proxy) e #144 (relatório do ensaio) abertos | Os dois mergeados; o 404 do passo 7 acabou |
| §3, revisão das telas | Gráfico, comprovante e CPF a corrigir | T-09.1 a T-09.3 mergeadas (#149 a #151) |
| §7 | "Em aberto: aprovar a SPEC-09" | Aprovada no `a122664` |
| — | Decisões de bibliotecas | Fechadas em 15/11 (PR #155): só Inter e lucide-react antes de 10/12; Radix no 5º semestre |

## 5. O que sigo como está

- O PWA fica como risco aceito: no passo 3, desligar a rede com a comanda aberta e não recarregar.
- O passo 8 no Grafana e o roteiro no CI sem bloquear o merge.
- A aprovação da versão final `develop → main` em 01/12 fica comigo.
