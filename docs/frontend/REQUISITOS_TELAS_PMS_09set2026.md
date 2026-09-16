# Requisitos de Tela — o que o mercado de PMS considera básico

**Data:** 09/09/2026
**Autor:** Gabriel Reis Cunha (análise de produto)
**Insumo para:** SPEC-05 (frontend) e Documento 02 §2.9
**Método:** comparação das telas atuais do `app-pms` com o padrão consolidado em PMS de mercado (Oracle OPERA, Mews, Cloudbeds, Stays, Hqbeds, Omnibees, Desbravador) e com a operação real de um hotel pequeno

---

## 1. Por que este documento existe

As telas entregues até hoje funcionam e seguem o design system, mas são **CRUD, não PMS**. A diferença não é estética: um CRUD organiza tabelas, um PMS conduz um turno de trabalho.

Estado atual, medido:

| Evidência | Número |
|---|---|
| Telas existentes | 5 (login, lista/detalhe/formulário de hóspede) |
| Linhas de tela | 508 |
| Componentes no design system | 5 (`Button`, `Field`, `Input`, `StatusBadge`, `feedback`) |
| Busca da lista de hóspedes | `filterGuests(data, term)` — **no cliente**, sobre o `findAll` inteiro |

O último item é o sintoma mais claro: a tela baixa a base de hóspedes do hotel e filtra na memória do navegador. Funciona na demonstração com 20 hóspedes e falha com 5.000.

Este documento levanta o que falta. Os identificadores `RT-xx` são **requisitos de tela** — insumo de planejamento. Os que forem aprovados sobem ao Documento 02 §2.9 como RF numerados.

---

## 2. Os seis padrões que separam um PMS de um CRUD

Antes das telas, os padrões. Todo PMS de mercado os tem, e nenhum aparece hoje no `app-pms`.

**2.1 O mapa de ocupação é a tela inicial, não um relatório.** Em OPERA, Mews e Cloudbeds o recepcionista abre o sistema e vê quartos × dias. É onde ele lê a casa, cria reserva clicando no vazio e move hóspede arrastando. Sistema em que o calendário é uma aba secundária obriga o operador a manter o mapa na cabeça.

**2.2 A conta (*folio*) é um documento vivo, não um total.** Diárias, consumos, taxas, pagamentos e saldo em uma linha do tempo por estadia. O hóspede pergunta "quanto eu já gastei?" no meio da estadia, e a resposta precisa estar em uma tela, não em uma soma feita na hora.

**2.3 Tudo se resolve na lista.** Check-in, check-out, cobrança e troca de quarto se fazem de onde o operador está. Cada navegação até um detalhe para clicar um botão é um passo a mais com o hóspede esperando no balcão.

**2.4 Busca única e imediata.** Uma caixa que encontra hóspede por nome, CPF ou telefone, reserva por código e quarto por número. O recepcionista não escolhe em qual módulo procurar — ele digita.

**2.5 A governança tem tela própria.** Camareira e supervisora não usam a tela da recepção. Precisam do quadro de quartos por andar, com status de limpeza e atribuição do dia. É um dos usos mais frequentes de um PMS e o Gesway **não tem nenhuma tela** para ele.

**2.6 O turno fecha.** Conferência de caixa por turno e por meio de pagamento, com divergência explícita. É o que o gerente cobra do recepcionista no fim do dia — e a auditoria noturna dos PMS clássicos.

---

## 3. Requisitos por tela

### 3.1 Mapa de reservas (*rack*) — **a tela que falta mais**

Usado por: recepção e gerência · Prioridade: **Alta** — é a tela que a banca vai querer ver

| ID | Requisito | Por que o mercado faz assim |
|---|---|---|
| RT-01 | Grade quartos × dias, com o período navegável e carregamento apenas do intervalo visível | `GET /reservations?from=&to=` já existe e suporta isso |
| RT-02 | Barra da reserva atravessando os dias, com nome do hóspede e status por cor **e** rótulo | Ler o período de uma vez é o propósito da tela |
| RT-03 | Clicar em intervalo livre inicia nova reserva já com quarto e datas preenchidos | Em Mews e Cloudbeds é o caminho principal de venda no balcão |
| RT-04 | Arrastar a barra troca o quarto; arrastar a borda estende ou reduz a estadia | Troca de quarto e extensão são as alterações mais comuns do dia |
| RT-05 | Bloqueio visual de quarto em manutenção ou limpeza, distinto de quarto vendido | Evita vender um quarto indisponível por leitura errada |
| RT-06 | Indicação de sobreposição recusada, com o motivo | O banco já impede pela constraint `EXCLUDE`; a tela precisa explicar |
| RT-07 | No celular, agenda do dia — nunca a grade espremida | Decisão já tomada na SPEC-05 |

> **Cuidado de execução:** arrastar (RT-04) exige endpoint de alteração de quarto e período que respeite a máquina de estados e a constraint de sobreposição. Se o backend não estiver pronto, entregar RT-01 a RT-03 e RT-07 primeiro — o mapa somente-leitura já é um salto.

### 3.2 Painel do dia

Usado por: recepção e gerência · Prioridade: **Alta**

| ID | Requisito |
|---|---|
| RT-08 | Chegadas, saídas e hóspedes na casa do dia, com contagem em cada bloco |
| RT-09 | Check-in e check-out executáveis **da lista**, sem abrir o detalhe |
| RT-10 | Chegada sem pagamento registrado destacada — é o risco de *no-show* que `GET /analytics/alerts` já devolve |
| RT-11 | Quartos parados em `CLEANING` visíveis, com ação de liberar |
| RT-12 | Contagem de quartos vendidos, livres e ocupação do dia no topo |
| RT-13 | Funcionar bem no celular — é a tela que o gerente abre andando pelo hotel |

### 3.3 Reserva — detalhe e conta

Usado por: recepção · Prioridade: **Alta**

| ID | Requisito |
|---|---|
| RT-14 | Cabeçalho com hóspede, quarto, período, status e **saldo** sempre visível |
| RT-15 | Conta em linha do tempo: diárias, consumos, pagamentos e saldo — de `GET /reservations/:id/bill` |
| RT-16 | Ações da máquina de estados presentes e **desabilitadas com motivo** quando indisponíveis, nunca escondidas |
| RT-17 | Registro de pagamento na própria tela, com meio e natureza (sinal, saldo, integral) |
| RT-18 | Lançamento e estorno de consumo, mostrando quem autorizou o estorno (`deleted_by` já é gravado) |
| RT-19 | Reserva de grupo exibindo todos os quartos do registro (RF-013) |
| RT-20 | Comprovante de conta imprimível ou em PDF, para entregar ao hóspede no check-out |

### 3.4 Nova reserva — o fluxo de venda

Usado por: recepção · Prioridade: **Alta**

| ID | Requisito |
|---|---|
| RT-21 | Buscar disponibilidade por período e categoria antes de escolher quarto (`GET /rooms/available`) |
| RT-22 | Valor da estadia calculado e exibido antes de confirmar, com o número de diárias |
| RT-23 | Hóspede reaproveitado da base por CPF, e-mail ou telefone — sem recadastrar quem já se hospedou |
| RT-24 | Hóspede novo cadastrável **dentro** do fluxo, sem perder o que já foi preenchido |
| RT-25 | Conflito de datas recusado com mensagem que diz o que fazer, não apenas que falhou |

### 3.5 Ficha do hóspede — histórico, não formulário

Usado por: recepção · Prioridade: **Alta** (parte legal) / Média (parte de relacionamento)

O `GuestModel` tem hoje **quatro** campos: `full_name`, `cpf`, `phone`, `email`.

| ID | Requisito |
|---|---|
| RT-26 | **Ficha de registro de hóspede completa** — documento e tipo, data de nascimento, nacionalidade, endereço, e motivo da viagem. Hotel no Brasil é obrigado a manter registro de hóspedes; com quatro campos o Gesway não atende à ficha que a fiscalização espera |
| RT-27 | Histórico de estadias do hóspede: quantas vezes voltou, quanto gastou, última estadia |
| RT-28 | Observações operacionais (preferência de quarto, alergia, restrição alimentar) — é o que transforma repetição em atendimento |
| RT-29 | Acompanhantes vinculados à estadia, inclusive menores sem documento próprio |
| RT-30 | Ação de eliminação definitiva a pedido do titular, restrita ao administrador (LGPD art. 18, VI — SPEC-06 T-06.11) |

> RT-26 é o requisito de maior valor desta seção e o mais barato: são campos de modelo e formulário. Também é o único com exigência legal, o que o torna bom argumento na defesa.

### 3.6 Governança — a tela inexistente

Usado por: camareira e supervisora · Prioridade: **Média** — alta se a defesa mostrar mais de um papel

| ID | Requisito |
|---|---|
| RT-31 | Quadro de quartos por andar, com status de limpeza |
| RT-32 | Marcar quarto como limpo direto do quadro, pelo celular |
| RT-33 | Lista de prioridade do dia: quartos com saída, com chegada prevista e de hóspede na casa |
| RT-34 | Registro de manutenção com descrição, bloqueando a venda do quarto |
| RT-35 | Visão de quem limpou o quê, para a supervisora conferir |

> **Custo real:** RT-31 a RT-33 saem quase de graça — a máquina de estados de quarto já existe (`AVAILABLE → OCCUPIED → CLEANING`). RT-34 e RT-35 exigem entidade nova (tarefa/ocorrência com responsável) e são escopo de backend.

### 3.7 Comanda (F&B)

Usado por: garçom · Prioridade: **Média** — depende de SPEC-04 T-04.3

Os requisitos de tela já estão detalhados na SPEC-05 T-05.5 e cobertos pelo RF-051. Acrescento o que o mercado trata como básico e não está lá:

| ID | Requisito |
|---|---|
| RT-36 | Produtos mais lançados em destaque, acima do cardápio completo — a curva de uso é curta e repetitiva |
| RT-37 | Transferir item de uma conta para outra, e transferir conta inteira entre quartos ou mesas |
| RT-38 | Dividir conta por pessoa no fechamento, não só na abertura |

### 3.8 Tarifas e disponibilidade

Usado por: gerência · Prioridade: **Média**

Hoje a tarifa é **um número por categoria** (`price_per_night`). Isso não representa a operação de nenhum hotel: fim de semana, feriado e alta temporada têm preços diferentes.

| ID | Requisito |
|---|---|
| RT-39 | Tarifa por período, com data de início e fim, sobrepondo a tarifa base da categoria |
| RT-40 | Tarifa diferenciada para fim de semana |
| RT-41 | Mínimo de noites por período — é como se protege o feriado |
| RT-42 | Calendário mostrando tarifa e disponibilidade lado a lado, para a decisão de venda |
| RT-43 | Fechar venda de uma data sem apagar a tarifa |

> **Isto é backend antes de ser tela.** Exige entidade de tarifa por período e a regra de precedência sobre a categoria. É o maior item deste documento e o que mais aproxima o Gesway de um produto vendável — mas não é obrigatório para a defesa. Registrar como Spec própria, não enfiar na SPEC-05.

### 3.9 Financeiro e fechamento de turno

Usado por: recepção e gerência · Prioridade: **Média**

| ID | Requisito |
|---|---|
| RT-44 | Lançamentos do dia por meio de pagamento, com total conferível |
| RT-45 | Fechamento de turno: o que o sistema registrou contra o que o operador conferiu, com divergência explícita |
| RT-46 | Contas em aberto de hóspedes na casa, para não perder consumo no check-out |
| RT-47 | Parcelas de contrato a vencer (RF-036) |

### 3.10 Indicadores

Prioridade: **Média** — sete endpoints prontos e nenhuma tela

| ID | Requisito |
|---|---|
| RT-48 | Ocupação, ADR e receita do dia em quatro números grandes, no topo |
| RT-49 | Receita por mês e sazonalidade em gráfico no desktop; no celular, os números do dia |
| RT-50 | Receita por categoria e mix de meios de pagamento |
| RT-51 | Ranking de hóspedes com acesso restrito e justificativa de uso — é dado pessoal (LGPD, minimização) |
| RT-52 | Toda tela de indicador com o período consultado visível e alterável |

### 3.11 B2B e configurações

Prioridade: **Média** · Cobertos por RF-053 e RF-054, com dois acréscimos:

| ID | Requisito |
|---|---|
| RT-53 | Orçamento com pré-visualização antes de gerar o PDF — evita gerar cinco versões para acertar um valor |
| RT-54 | Contrato mostrando quais quartos ficaram bloqueados e em que período (RF-033) |

---

## 4. Recursos transversais

Valem para todas as telas. São o que faz o sistema parecer profissional.

| ID | Requisito | Observação |
|---|---|---|
| RT-55 | **Busca global** por hóspede, reserva e quarto, aberta por atalho de teclado | Exige busca no servidor — hoje o filtro é no cliente |
| RT-56 | Atalhos de teclado nas telas de recepção | O balcão é operado no teclado, não no mouse |
| RT-57 | Listagens com paginação, ordenação e filtro **no servidor** | Depende de SPEC-06 T-06.10 |
| RT-58 | Estados de carregando, vazio e erro em toda tela — e o vazio ensinando o próximo passo | Parcialmente feito |
| RT-59 | Desfazer em vez de diálogo de confirmação nas ações reversíveis | Menos atrito, mesma segurança |
| RT-60 | Sessão que não cai no meio do turno | SPEC-06 T-06.7 · RNF-005 |
| RT-61 | Autoria visível nas operações sensíveis: quem cancelou, quem estornou, quem eliminou | Os campos já existem no banco |
| RT-62 | Impressão de comprovante e conta com identificação do hotel | Balcão imprime |

---

## 5. O que deliberadamente **não** entra

Para não confundir ambição com escopo — e porque a banca avalia coerência, não tamanho:

| Fora | Motivo |
|---|---|
| *Channel manager* (Booking, Airbnb, Expedia) | Integração comercial complexa; o motor de reserva direta já cumpre o critério de venda |
| Revenue management com preço dinâmico | Precisa de histórico que o sistema não tem |
| Aplicativo nativo | A web mobile-first resolve o caso do garçom |
| Portal do hóspede além do status da reserva | RF-028 já cobre o essencial |
| Fiscal (NF-e, NFS-e) | Escopo regulatório grande, sem valor acadêmico proporcional |
| Multi-propriedade (rede de hotéis) | O multi-tenant já isola hotéis; rede é outro problema |

---

## 6. Prioridade recomendada

Ordenada por valor na demonstração dividido por custo:

```
1. RT-08 a RT-13   painel do dia          — endpoints prontos, alto impacto visual
2. RT-14 a RT-20   reserva e conta        — o núcleo do produto
3. RT-21 a RT-25   fluxo de nova reserva  — é a venda
4. RT-01,02,03,07  rack somente-leitura   — a tela que impressiona
5. RT-26 a RT-28   ficha do hóspede       — barato, e tem exigência legal
6. RT-55, 57       busca e paginação      — depende de T-06.10
7. RT-31 a RT-33   governança             — quase de graça, mostra segundo papel
8. RT-04, 05       arrastar no rack       — depende de endpoint novo
9. RT-44 a RT-47   fechamento de turno    — valor real, custo médio
10. RT-39 a RT-43  tarifas por período    — Spec própria, não cabe na SPEC-05
```

---

## 7. O que isto exige do backend

A lista acima não é só frontend. O que a interface precisa e a API ainda não oferece:

| Necessidade | Estado hoje |
|---|---|
| Busca por termo no servidor, em hóspedes e reservas | Não existe — o filtro é no cliente |
| Paginação em todas as listagens | Só em `/reservations` · SPEC-06 T-06.10 |
| Campos da ficha de hóspede (documento, nascimento, endereço, nacionalidade) | `GuestModel` tem 4 campos |
| Observações e preferências do hóspede | Não existe |
| Alterar quarto e período de uma reserva | Necessário para arrastar no rack |
| Tarifa por período, fim de semana e mínimo de noites | Existe `price_per_night` por categoria, e nada mais |
| Tarefa de governança com responsável | Não existe entidade |
| Fechamento de turno | Não existe |
| Eliminação definitiva de dado pessoal | SPEC-06 T-06.11 |
| Schema de resposta no OpenAPI | 82% das respostas 2xx sem schema · SPEC-06 T-06.2 |

> **Leitura honesta:** cerca de metade dos requisitos deste documento é trabalho de backend disfarçado de tela. Tratar tudo como "frontend" faria a SPEC-05 estourar o prazo sem que ninguém entendesse por quê.

---

## 8. Encaminhamento proposto

1. **SPEC-05 v2** — absorve RT-01 a RT-35 e RT-44 a RT-62, redistribuídos nas tarefas T-05.1 a T-05.8 já existentes
2. **Documento 02** — RT-26 (ficha de registro) e RT-45 (fechamento de turno) sobem a RF, por serem função de negócio nova e não detalhe de interface
3. **Spec nova** — tarifas por período (RT-39 a RT-43), com o backend antes da tela
4. **SPEC-06** — nada novo aqui; T-06.2, T-06.7, T-06.10 e T-06.11 já cobrem o que esta análise encontrou
