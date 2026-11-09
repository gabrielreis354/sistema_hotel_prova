# Guia de UI corporativa do Gesway — como desenhar as próximas telas

**Para:** quem cria ou altera tela no `apps/pms`
**Criado:** 09/11/2026
**Complementa:** [`DESIGN_PMS.md`](DESIGN_PMS.md), que continua valendo. Em conflito, vale o `DESIGN_PMS.md`
**Tarefas de implementação:** [`SPEC-08`](../docs/specs/SPEC-08-acabamento-corporativo.md)

---

## 1. Para quem desenhamos

Hotel pequeno ou médio não tem departamento de TI nem semana de treinamento.

| Realidade | O que isso exige da tela |
|---|---|
| A mesma pessoa faz reserva, check-in, cobrança e às vezes atende o telefone | Tela que se retoma depois de uma interrupção: o estado atual tem que estar escrito |
| Equipe com idades e familiaridade digital bem variadas; há rotatividade e temporários | Aprender em um turno. Palavra em vez de ícone sozinho, sem gesto escondido |
| Computador antigo e compartilhado, monitor de 1366×768; celular simples no salão | Nada pesado. O essencial cabe sem rolar |
| Hóspede de pé esperando no balcão | Poucos cliques, e sempre o mesmo caminho |
| Erro custa dinheiro ou um quarto errado | Confirmação clara, valor por extenso, sem surpresa |
| O dono olha pouco, mas decide a compra | A tela precisa transmitir confiança à primeira vista |

---

## 2. O que "corporativo" significa aqui

**Corporativo é parecer confiável e previsível.** Não é parecer frio, nem caro, nem complicado.

| É | Não é |
|---|---|
| Consistência: o mesmo elemento no mesmo lugar em toda tela | Tela com layout diferente para parecer especial |
| Sobriedade: cor com função | Degradê, vidro, sombra grande, ilustração, emoji |
| Hierarquia clara: fica óbvio o que olhar primeiro | Tudo em negrito, tudo em cartão, tudo em destaque |
| Linguagem do hotel: "Hóspede", "Diária", "Saldo" | "Tenant", "Registro", "Entidade", "Payload" |
| Denso e organizado | Vazio e elegante, com três linhas por tela |

O teste é simples: **a recepcionista consegue dizer o que fazer em seguida olhando a tela por 3 segundos?**

---

## 3. As dez regras

1. **Uma ação principal por tela.** Só ela é `primary`. Se tudo chama atenção, nada chama.
2. **A cor da marca significa "faça isto".** Não use `brand` como enfeite. Fundo de item ativo (`brand/10`) é a única exceção.
3. **Status é sempre ponto e palavra,** com `StatusBadge`. Nunca só cor.
4. **Ação indisponível fica visível, desabilitada e com o motivo em texto,** com `ActionSlot`. Nunca só em dica de mouse: dica não existe no toque.
5. **Ícone nunca vai sozinho.** Sempre com rótulo. A exceção é ícone universal com `aria-label`, como fechar (✕).
6. **Dinheiro é tabular, alinhado à direita, com `R$` e duas casas,** com `Money`.
7. **Ação irreversível confirma no próprio lugar,** dizendo o que vai acontecer e com botões que descrevem a ação: "Sim, cancelar reserva" e "Manter reserva". Nunca "OK" e "Cancelar".
8. **Toda lista tem quatro estados:** carregando, vazio, erro e com dados. O vazio ensina o próximo passo; o erro diz como recuperar.
9. **Toque ≥ 48 px no celular e no tablet.** O tamanho `compact` só vale a partir de `xl` (1280 px) e em tabela. Desktop no Gesway começa em 1280 px (`PLANEJAMENTO_FRONTEND.md`).
10. **Só tokens e componentes de `@hotel/ui`.** Cor literal e `<button>` feito à mão reprovam no `qa_checks.sh`.

---

## 4. Anatomia de uma tela

```
┌───────────────────────────────────────────────────────────┐
│ Título da página                       [Ação principal]   │  PageHeader
│ Contexto curto (data, contagem, filtro ativo)             │
├───────────────────────────────────────────────────────────┤
│ Avisos que exigem atenção (só quando existem)             │
├───────────────────────────────────────────────────────────┤
│ Conteúdo: tabela ou lista, com filtros simples em cima    │
└───────────────────────────────────────────────────────────┘
```

- Título sempre no mesmo lugar, no mesmo tamanho (20 px, peso 600).
- Ação principal sempre no canto superior direito. No celular, logo abaixo do título, em largura total.
- `Card` é para objeto próprio (formulário, confirmação). Para separar leitura, use título de seção e fio.
- Tipografia: título 20, seção 14 em peso 600, corpo 14, apoio 12. Formulário no celular usa 16, senão o iPhone dá zoom no campo.
- Espaçamento múltiplo de 4 px: 8 dentro de um grupo, 16 entre grupos, 24 entre seções.

---

## 5. Padrões prontos

### Lista operacional (chegadas, saídas, reservas)

- Desktop: **uma linha por item**, com o nome à esquerda e a ação à direita, sempre alinhada.
- Celular: até duas linhas de texto mais o botão.
- Ação de linha em `secondary`. Não use sólido em linha repetida.
- Mais de 8 itens num bloco: mostrar 8, com "Ver todas (N)". O que está atrasado ou com alerta vem primeiro.
- Busca e filtro em cima, com no máximo dois filtros visíveis.

### Formulário

- Rótulo sempre acima do campo e sempre visível. Placeholder não substitui rótulo.
- Preencher o que já se sabe: o saldo no pagamento, a data de hoje na reserva.
- Erro no próprio campo, dizendo como corrigir: "Digite o valor recebido, por exemplo 150,00".
- Poucas opções (até 4): botões de escolha visíveis, como no pagamento. Muitas opções: `Select`.
- O Enter envia. O foco vai para o primeiro campo ao abrir e para a mensagem ao concluir.
- Botão de envio diz o que faz e informa o andamento: "Registrar pagamento" e "Registrando…".

### Tabela (financeiro, relatórios)

- Cabeçalho fixo, zebra leve ou fio entre linhas, nunca os dois.
- Números à direita, texto à esquerda, status centralizado com rótulo.
- No celular, a tabela vira lista de cartões, sem rolagem horizontal.

### Indicadores

- Poucos números, cada um com unidade e período por escrito: "Ocupação de hoje — 37,2%".
- Número fora do cartão de destaque não precisa de cartão próprio.
- Gráfico só quando a tendência importa. Se a pergunta é "quanto?", um número basta.

### Mensagens

| Situação | Escreva | Não escreva |
|---|---|---|
| Sucesso | "Pagamento de R$ 150,00 em PIX registrado." | "Operação realizada com sucesso!" |
| Erro recuperável | "Sem resposta do servidor. Confira a conta antes de registrar de novo." | "Erro 502" |
| Bloqueio | "Quarto 12 ainda ocupado." | "Ação não permitida" |
| Vazio | "Nenhuma chegada hoje. Criar reserva" | "Sem registros" |

Regras de texto: frase curta, voz ativa, sem jargão, sem exclamação. Datas em `dd/mm/aaaa`, sempre com o fuso do hotel. Trate quem usa por "você" e o cliente por "hóspede".

### Movimento

Só para confirmar que algo mudou ou mostrar de onde um painel veio, entre 150 e 200 ms, respeitando `prefers-reduced-motion`. Nada anima ao carregar a tela.

---

## 6. Largura e aparelho

| Largura | Quem usa | Prioridade |
|---|---|---|
| **1366×768** (referência) | Recepção | O essencial sem rolar. Teclado funciona em tudo |
| 768 a 1279 px | Tablet no balcão | Toque de 48 px, menu lateral pode recolher |
| **375 px** | Garçom e gerente fora do balcão | Barra inferior com até 5 abas, uma coluna, sem hover |

Teste sempre em 1366, 768 e 375 antes do PR.

---

## 7. Pensando nas próximas telas

| Tela | O que considerar |
|---|---|
| **Rack (quartos × dias)** | Densidade máxima, com tela própria no desktop e agenda do dia no celular. Status com ponto e rótulo ou sigla e legenda sempre visível. Hoje em destaque, colunas sem dançar |
| **Financeiro e caixa** | Tabela com total fixo no rodapé, período sempre visível. Exportar é ação secundária |
| **Configurações** | Agrupar por assunto (Hotel, Quartos, Usuários). Formulários curtos, com salvar por seção |
| **Cadastro de hóspede** | Só o obrigatório primeiro; o resto expandido sob demanda. Dado pessoal mostrado com parcimônia (LGPD) |
| **Comprovante impresso** | Dados do hotel, sem navegação, legível em impressora comum em preto e branco |
| **Nova tela qualquer** | Comece copiando a estrutura da tela mais parecida. Consistência vale mais que originalidade |

---

## 8. Checklist antes de abrir o PR

```
[ ] Existe uma única ação principal, e ela está no lugar de sempre
[ ] Dá para dizer o que fazer em 3 segundos
[ ] Quatro estados tratados: carregando, vazio, erro, com dados
[ ] Status com ponto e palavra; ação indisponível com motivo em texto
[ ] Dinheiro com Money; datas no fuso do hotel
[ ] Toque ≥ 48 px em 375 e 768; foco visível e teclado em 1366
[ ] Sem cor literal e sem elemento feito à mão (qa_checks.sh)
[ ] Textos na linguagem do hotel, sem jargão técnico
[ ] Lista longa testada com volume real, não com três linhas
[ ] Alguém de fora conseguiu usar sem explicação
```
