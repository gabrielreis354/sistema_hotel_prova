# 📈 Análise de Produto — O que vai diferenciar nosso PMS no mercado

> **Para o time.** Este documento explica, em linguagem de produto, **por que** estamos
> construindo o que estamos construindo e **o que nos torna diferentes** dos outros
> PMS/SaaS de hotelaria. Leia antes de pegar uma tarefa de feature — entender o
> "porquê" muda as decisões que você toma no "como".
>
> *Autor: análise conduzida em 27/06/2026 · Mantido por: Gabriel (orquestrador)*
> *Público-alvo do produto: hotéis e pousadas pequenos/médios — 5 a 80 quartos.*

---

## 1. O problema: ter um PMS bom não basta

Hoje nosso **Core PMS** (reservas, check-in/out, quartos, hóspedes, pagamentos) está
sólido. Mas precisamos ser honestos sobre uma coisa:

> **Isso é "mesa", não diferencial.** HQBeds, Stays, Hooztin, Pequenos Hotéis e dezenas
> de outros já entregam exatamente isso. Ter um Core PMS te coloca no jogo — **não te
> faz ganhar**.

O nosso roadmap atual (financeiro, relatórios, tarifas, housekeeping, channel manager,
NFS-e) é ótimo em **cobertura**, mas quase tudo ali é **paridade competitiva**: o cliente
espera ter, mas não troca de sistema por causa disso.

A pergunta que todo membro do time deve carregar na cabeça é:

> ### ❓ "Por que um dono de pousada largaria a planilha + Booking.com para usar NÓS?"

Se uma feature não ajuda a responder essa pergunta, ela é importante, mas **não é o que
nos diferencia**.

---

## 2. A dor real de quem vai pagar pelo sistema

O nosso cliente é o **dono/gerente de um hotel pequeno ou pousada** — geralmente na
operação, equipe enxuta, sem departamento de TI. As dores que tiram o sono dele:

| Dor | Impacto no bolso |
|---|---|
| **OTA come 15–25% de comissão** (Booking, Airbnb) | Margem evaporando em toda reserva |
| **No-show e cancelamento de última hora** | Quarto vazio = prejuízo direto |
| **Operação no WhatsApp, na mão** | Tempo perdido, erro humano, cobrança manual |
| **Decide preço no escuro** | Não sabe se a diária está cara ou barata pra época |

**É exatamente aqui que mora o nosso diferencial.** Não em "ter mais um relatório".

---

## 3. As 3 alavancas de valor (onde colocamos energia)

### 🅰️ Capturar receita direta — *reduzir dependência de OTA*  ⭐ **o nosso "wedge"**

| Feature | Por que diferencia |
|---|---|
| **Motor de reserva direta** — página pública por hotel (já temos `subdomain`! ex.: `pousada-sol.nosso-saas.com`) | O hotel vende **sem pagar comissão de OTA**. Paga o sistema sozinho no 1º mês. |
| **Link de pagamento PIX / sinal antecipado** | PIX é nativo do Brasil; os concorrentes globais tratam mal. Sinal **mata o no-show**. |

> Um PMS que *também traz reservas diretas com PIX* não é "mais um PMS" — é o sistema que
> **aumenta o faturamento** do hotel, não só organiza a recepção. **É por aqui que
> começamos** (já em desenvolvimento).

### 🅱️ Reduzir perda e trabalho manual — *operação sem fricção*

| Feature | Por que diferencia |
|---|---|
| **Pré-check-in digital + FNRH** (hóspede preenche a ficha pelo celular antes de chegar) | A **Ficha Nacional de Registro de Hóspedes é obrigação legal** no Brasil. Resolver compliance + acabar com fila na recepção é ouro. |
| **WhatsApp como canal operacional** (não só "notificação"): confirma reserva, manda link de pré-check-in, cobra PIX, dispara NPS pós-estadia | Canal nº1 do hóspede brasileiro. Os concorrentes globais não fazem bem. |
| **Política de no-show + pré-autorização** | Protege diretamente a receita do dono. |

### 🅲️ Inteligência para o dono decidir — *o que SÓ um SaaS multi-tenant pode fazer*

| Feature | Por que diferencia |
|---|---|
| 🏆 **Benchmark anônimo entre hotéis** ("sua ocupação: 62% · média da sua região/porte: 71%") | **Veja a seção 4 — este é o nosso maior trunfo.** |
| **Sugestão de tarifa** (revenue management "para leigos") | Vira um consultor de preços embutido. |
| **Painel de fluxo de caixa** (dono pensa em caixa, não em "receita por categoria") | Falamos a língua do dono, não a do contador. |

---

## 4. 🏆 O diferencial que NENHUM concorrente local consegue copiar

> **Esta é a parte mais importante deste documento. Se você só ler uma seção, leia esta.**

Somos um **SaaS multi-tenant**: todos os hotéis rodam na **mesma base de dados lógica**,
isolados por `tenant_id`. Isso não é só uma escolha técnica — **ela habilita um produto
que um sistema instalado no servidor do hotel é incapaz de oferecer**:

### Benchmark anônimo entre tenants

```
┌─────────────────────────────────────────────────────────┐
│  Seu hotel          vs.   Média da sua região/porte      │
│  ───────────────────────────────────────────────────────│
│  Ocupação:  62%            71%   ⚠️ você está abaixo      │
│  Diária média: R$ 240      R$ 285   ⚠️ pode subir preço  │
│  Antecedência média: 4d    9d                            │
└─────────────────────────────────────────────────────────┘
```

**Por que isso é um diferencial estrutural (um "moat"):**

1. **É impossível para a concorrência on-premise.** Um PMS instalado no servidor de um
   hotel só enxerga aquele hotel. Ele **nunca** poderá dizer "você está abaixo da média
   da região" — não tem os dados dos outros. Nós temos, por **design da arquitetura**.

2. **Tem efeito de rede (data network effect).** Quanto mais hotéis usam nosso SaaS,
   **mais valioso** o benchmark fica para cada um deles. O produto melhora sozinho a cada
   novo cliente — e isso **trava a saída** (quem sai perde o comparativo de mercado).

3. **Privacidade by design.** O comparativo é **agregado e anônimo** — o hotel A nunca vê
   os números do hotel B, só a média da região/porte. Isolamento multi-tenant + LGPD
   respeitados.

> **Mensagem para o time:** quando defendemos que a arquitetura multi-tenant "não é só
> técnica, é estratégia de produto" — é disto que estamos falando. A mesma estrutura que
> garante isolamento de dados é a que nos permite, com consentimento e anonimização,
> oferecer inteligência de mercado que ninguém com software local consegue. **Esse é o
> nosso maior diferencial competitivo e a melhor narrativa do projeto** (inclusive para a
> defesa do TCC).

---

## 5. Sequência priorizada (a ordem em que atacamos)

```
1º  Motor de reserva direta + PIX        → ataca a dor financeira nº1, monetiza  ◀ EM ANDAMENTO
2º  Pré-check-in + FNRH (compliance BR)  → trava legal + tira fricção, retém
3º  WhatsApp operacional                 → canal nativo BR, encanta
4º  Benchmark anônimo multi-tenant       → o moat estrutural (seção 4)
5º  Sugestão de tarifa + fluxo de caixa  → inteligência, justifica plano premium
```

Os módulos do roadmap (financeiro, relatórios, housekeeping) seguem valendo como **base**,
mas devem ser **intercalados** com esses diferenciais — senão construímos um PMS
tecnicamente correto e **comercialmente igual a todos**.

---

## 6. Como isso vira dinheiro (planos = módulos por tenant)

A arquitetura já prevê **ativação seletiva de módulo por hotel**. É isso que sustenta a
estratégia de planos:

| Plano | Entrega | Promessa ao dono |
|---|---|---|
| **Essencial** | Core PMS | "Sua recepção organizada" |
| **Vendas** | Reserva direta + PIX + WhatsApp | "**Aumente seu faturamento**" |
| **Inteligência** | Benchmark + tarifa + fluxo de caixa | "**Aumente sua margem**" |
| **Compliance** | FNRH + NFS-e | "**Tire sua dor de cabeça legal**" |

> Repare: cada plano vende um **resultado de negócio**, não uma "lista de features". É
> assim que o cliente percebe valor e aceita pagar mais.

---

## 7. Resumo de uma linha (decore isto)

> **Não somos "mais um PMS". Somos o sistema que aumenta o faturamento do hotel
> (reserva direta + PIX), tira a fricção da operação (WhatsApp + FNRH) e — graças à
> arquitetura multi-tenant — mostra ao dono como ele está perante o mercado, algo que
> nenhum concorrente local consegue.**

---

*Documento estratégico. Dúvidas ou novas ideias de diferencial: levante com o time antes
de implementar — alinhar o "porquê" economiza retrabalho no "como".*
