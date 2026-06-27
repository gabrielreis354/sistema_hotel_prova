# Analytics para Hotéis — Por Que Isso Importa
**Documento de produto · Junho 2026**
**Público:** membros do grupo, apresentações, defesa do TCC

---

## O Problema Real

Hoje, a maioria das pousadas e hotéis de pequeno porte no Brasil gerencia o negócio de três maneiras:

- **Caderninho** ou bloco de papel
- **Excel manual** atualizado pelo dono
- **Sistemas legados** que não mostram nada além de uma agenda de reservas

O resultado é que o dono do hotel **não sabe responder** perguntas básicas:

> *"Meu fevereiro foi melhor ou pior que o ano passado?"*
> *"Qual tipo de quarto me dá mais lucro?"*
> *"Tem algum hóspede que reservou mas ainda não pagou?"*
> *"Por que minha taxa de ocupação caiu esse mês?"*

Ele toma decisões — sobre precificação, reforma, contratação, promoções — com base em **intuição**, não em dados.

Isso não é culpa do dono. É culpa dos sistemas disponíveis. O nosso projeto muda isso.

---

## O Que Implementamos

Adicionamos ao sistema um **módulo de inteligência operacional** que transforma os dados que o hotel já registra (reservas, pagamentos, quartos, hóspedes) em respostas prontas para usar.

São **7 painéis de informação** acessíveis com uma chamada ao sistema, sempre isolados por hotel (um hotel nunca vê os dados de outro).

---

## Os 7 Painéis — Em Linguagem de Negócio

---

### 1. Painel Financeiro (`/analytics/revenue`)
**Pergunta respondida:** *"Quanto dinheiro entrou, quanto ainda vai entrar e quem ainda não pagou?"*

O sistema separa automaticamente:

| Categoria | O que significa |
|-----------|----------------|
| **Caixa realizado** | Pagamentos já confirmados, mês a mês |
| **Receita esperada** | Reservas confirmadas que ainda não pagaram |
| **Lista de inadimplentes** | Hóspedes com reserva ativa e zero pagamento registrado |

**Por que importa:** o recepcionista sabe, antes de encerrar o turno, quem precisa ser cobrado. O gerente sabe o fluxo de caixa dos próximos dias sem precisar abrir uma planilha.

---

### 2. Painel de Ocupação (`/analytics/occupancy`)
**Pergunta respondida:** *"Como está o hotel hoje? Quantos quartos estão ocupados, disponíveis ou presos em limpeza?"*

Além da contagem simples, o sistema calcula dois indicadores usados em toda a indústria hoteleira:

| Indicador | Fórmula | O que mede |
|-----------|---------|-----------|
| **ADR** (Diária Média) | Receita total ÷ Diárias vendidas | Quanto o hotel cobra, em média, por noite |
| **RevPAR** | ADR × Taxa de Ocupação | Quanto cada quarto gera, mesmo os que estão vazios |

**Exemplo prático:**
- Hotel com 10 quartos, 6 ocupados hoje (60% de ocupação)
- ADR de R$ 280 (média das diárias vendidas)
- RevPAR = R$ 168 (o que cada quarto gerou, na média)

O RevPAR é o indicador que hotéis sérios usam para comparar desempenho entre períodos e tomar decisões de precificação.

---

### 3. Painel de Alertas (`/analytics/alerts`)
**Pergunta respondida:** *"O que precisa de atenção agora?"*

São três tipos de alerta automáticos:

| Alerta | O que identifica | Por que é urgente |
|--------|-----------------|-------------------|
| **Risco de no-show** | Reservas confirmadas para hoje sem nenhum pagamento | Hóspede pode não aparecer — precisa ligar antes |
| **Quartos parados em limpeza** | Quartos com status "em limpeza" há horas | Bloqueiam novas reservas, geram reclamação |
| **Reservas esquecidas** | Reservas pendentes há mais de 48h sem confirmação | Pipeline travado — ou confirma ou libera o quarto |

**Por que importa:** esse painel é a primeira coisa que o gerente vê ao abrir o sistema de manhã. Em vez de checar três telas diferentes, tudo que exige ação imediata aparece em um lugar só.

---

### 4. Painel de Sazonalidade (`/analytics/seasonality`)
**Pergunta respondida:** *"Quais são meus meses fortes e fracos? Como estou comparado ao ano passado?"*

O sistema mostra, mês a mês (até 5 anos de histórico), três métricas:

- Número de reservas
- Receita total
- Média de diárias por reserva

**Uso prático:**
- *"Janeiro é sempre fraco → vou criar promoção para encher o hotel"*
- *"Julho bateu recorde → vou subir o preço no próximo julho"*
- *"Reservas cresceram mas receita caiu → minha diária média está baixa"*

Esse é o tipo de análise que um dono de hotel faz hoje passando horas em Excel. O sistema entrega em segundos.

---

### 5. Painel de Rentabilidade por Tipo de Quarto (`/analytics/revenue-by-category`)
**Pergunta respondida:** *"Qual categoria de quarto me dá mais dinheiro? Vale a pena reformar o standard ou investir na suite?"*

O sistema ranqueia cada tipo de quarto por:
- Total de reservas realizadas
- Receita gerada no período
- Ticket médio por reserva

**Exemplo de insight:**
> *"A suite presidencial teve apenas 2 reservas, mas gerou R$ 5.600 — mais que os 8 quartos standard juntos. Investir na suite tem retorno maior."*

---

### 6. Painel de Meios de Pagamento (`/analytics/payment-mix`)
**Pergunta respondida:** *"Como meus hóspedes pagam? Vale a pena manter a maquininha de cartão ou o PIX já dominou?"*

O sistema mostra, por período:
- Quantidade de pagamentos por método
- Total em reais por método
- Percentual de cada método sobre o total

**Por que importa no Brasil de 2026:** PIX é gratuito para o recebedor; cartão de crédito cobra de 1,5% a 3,5% por transação. Um hotel que recebe R$ 30.000/mês em cartão está pagando até R$ 1.050 em taxas. Saber o mix ajuda o gerente a incentivar PIX ativamente.

---

### 7. Painel de Melhores Hóspedes (`/analytics/top-guests`)
**Pergunta respondida:** *"Quem são meus hóspedes mais valiosos? Quem eu devo tratar como VIP?"*

O sistema ranqueia hóspedes por **lifetime value** (total histórico gasto no hotel) e mostra:
- Número total de estadias
- Valor total acumulado
- Data da última visita

**Uso prático:**
> *"Carlos Eduardo já gastou R$ 4.200 em 3 visitas. Na próxima chegada, dou upgrade automático de quarto — custa R$ 0 para o hotel e garante fidelidade."*

Esse dado é a base de qualquer programa de fidelidade. Sem ele, o gerente trata um hóspede que vem todo mês igual a alguém que nunca esteve lá.

---

## Por Que Isso Diferencia o Projeto

### 1. Resolve um problema real de um mercado real

O Brasil tem entre 30.000 e 50.000 pousadas e hotéis independentes de pequeno porte. A maioria deles:
- Não tem sistema de gestão
- Usa Excel ou papel
- Não consegue responder "quanto ganhei este mês" sem contar manualmente

Qualquer ferramenta que entregue essas respostas automaticamente já tem valor de produto.

### 2. Não precisa de infraestrutura nova

Todos os 7 painéis são calculados sobre os dados que o hotel **já registra** normalmente ao usar o sistema. Não existe banco de dados extra, não existe processamento batch, não existe custo adicional de infraestrutura.

Isso significa:
- **Zero custo adicional** para o hotel usar
- **Zero retrabalho** no código existente
- **Entrega imediata** assim que o hotel tem alguns meses de histórico

### 3. Cria dependência positiva (lock-in de dados)

Quando o hotel acumula 12 meses de histórico no sistema, trocar de sistema significa **perder todos esses dados analíticos**. Isso é um dos maiores fatores de retenção em SaaS — o cliente não sai porque os dados ficam aqui.

### 4. Justifica planos pagos mais caros

A estrutura planejada para o produto (quando comercializado) é:

| Plano | Inclui analytics? | Preço estimado |
|-------|--------------------|----------------|
| Gratuito | Não | R$ 0/mês |
| Básico | Parcial (ocupação + alertas) | R$ 299–499/mês |
| Premium | Completo (todos os 7 painéis) | R$ 799–1.299/mês |

O módulo analytics é o principal diferencial entre o plano básico e o premium — e é o que justifica o hotel pagar mais.

---

## O Que Isso Representa para o TCC

Do ponto de vista acadêmico, o módulo demonstra:

| Competência | Como é demonstrada |
|------------|-------------------|
| **Modelagem de banco de dados** | Queries que relacionam 4 tabelas (reservas, quartos, categorias, pagamentos) com JOINs e agregações |
| **Engenharia de software** | Isolamento de dados por tenant, sem vazar informação entre hotéis |
| **Visão de produto** | Funcionalidades mapeadas para necessidades reais do usuário final |
| **Conhecimento de domínio** | KPIs hoteleiros (ADR, RevPAR) usados na indústria mundialmente |
| **Escalabilidade** | Solução funciona para 1 hotel ou 1.000 hotéis sem mudar uma linha de código |

---

## Resumo Executivo (para apresentação em 2 minutos)

> *"O nosso sistema já registra reservas, pagamentos e quartos. O módulo analytics usa esses dados para responder as perguntas que todo hoteleiro faz todo dia: quanto entrou, qual quarto dá mais lucro, quem deve, qual foi meu melhor mês.*
>
> *São 7 painéis de informação acessíveis em tempo real, isolados por hotel, sem custo extra de infraestrutura. Isso transforma o sistema de um agendador de reservas em uma ferramenta de gestão real — e é exatamente o que diferencia um produto que as pessoas pagam de um projeto acadêmico que fica na gaveta."*

---

*Documento elaborado em: 27/06/2026*
*Parte do projeto Sistema de Gestão de Hotel — TCC*
