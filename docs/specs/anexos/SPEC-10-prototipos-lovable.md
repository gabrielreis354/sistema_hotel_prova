# SPEC-10 — Protótipos na Lovable

**Criado em:** 22/11/2026 · **Responsável:** Sirlande · **Plano:** SPEC-10 §10 (aprovado em 18/11)
**Projeto na Lovable:** um só para todas as telas (decisão de 22/11). Link: _a preencher na Fase 1_

---

## 1. Para que serve, e o que não fazer

A Lovable serve para **decidir o visual** de cada fase da §10.4 antes do código: layout,
hierarquia, cor da marca e densidade. Cada fase só vira código com o protótipo aprovado (§10).

| Faça | Não faça |
|---|---|
| Usar o protótipo para comparar opções e aprovar | **Copiar código da Lovable para o repositório.** Ela gera React com shadcn e paleta própria, o que bate nas regras 9a, 9b e 9c do `qa_checks.sh` e no `@hotel/ui` |
| Levar cada decisão aprovada para token (`packages/ui/src/tokens.css`, `packages/config/tailwind-preset.js`) e componente do `@hotel/ui`, na fase | Ligar a Lovable ao GitHub deste repositório |
| Usar só dados fictícios | Colar `.env`, chave, CPF real, e-mail real ou trecho de código do repositório |
| Subir o logo `docs/specs/anexos/SPEC-10-logo-gesway.svg` | Usar fonte do Google Fonts como decisão: o app usa a Inter embutida (`@fontsource-variable/inter`) |

## 2. Fluxo de cada fase

1. **Brief:** gerado a partir do código (campos, estados, ações e papéis reais), nas §4 em diante deste arquivo.
2. **Lovable:** colar o prompt da fase e iterar.
3. **Revisão:** capturas a 390, 768 e 1366 px, conferidas com o `/impeccable critique` e com o checklist da §3.
4. **Aprovação:** do Sirlande e do dono da tela (§10.5). O Gabriel aprova Hoje, reserva e Indicadores.
5. **Registro:** link, capturas e decisões na seção da fase. Só então a fase vira código na `feature/t10-faseN-…`, a partir da `feature/spec-10-identidade`.

## 3. Checklist de revisão de cada protótipo

Vem da §10.6 da SPEC-10 e do `frontend/DESIGN_PMS.md`.

- [ ] **Densidade:** linhas visíveis sem rolar iguais ou maiores que hoje. No painel Hoje, até 3.000 px de altura em 375 px (CA-08.i).
- [ ] **Contraste:** texto ≥ 4,5:1; borda, foco e ícone com função ≥ 3:1.
- [ ] **Status:** ponto colorido **e** rótulo, nunca só cor. Os 5 tons de status não mudam.
- [ ] **Marca:** a cor da marca só em "faça isto" (botão principal, item ativo do menu), nunca como enfeite.
- [ ] **Dinheiro:** alinhado à direita, algarismos tabulares, "R$" e duas casas sempre.
- [ ] **Alvo de toque:** ≥ 48 px no celular e no tablet; compacto só a partir de 1280 px.
- [ ] **Sem animação decorativa:** movimento só confirma mudança de estado.
- [ ] **Estados:** carregando, vazio, erro e sem conexão desenhados, não só o caso cheio.

---

## 4. Brief base: colar uma vez nas instruções do projeto da Lovable

```text
Você vai prototipar as telas do Gesway, um sistema de gestão para pousadas e hotéis pequenos
(PMS), usado num TCC. Este projeto é só um PROTÓTIPO VISUAL: dados fictícios, sem backend, sem
login de verdade. Todo texto da interface em português do Brasil.

QUEM USA
- Recepcionista: turno de 8 h no balcão, com fila de hóspedes. Usuária experiente e repetitiva:
  velocidade e previsibilidade valem mais que descoberta. Desktop 1366 px e tablet 768 px.
- Garçom: celular (390 px), uma mão livre, Wi-Fi ruim. Lança consumo nas contas.
- Administrador (dono): configura o hotel e lê indicadores.

REGRAS QUE NÃO SE QUEBRAM
1. Densidade não é sujeira: é um PMS, vive de tabela e lista densa. Nada de espaçamento de landing
   page, hero, ilustração grande ou cartão gigante.
2. Status é ponto colorido + palavra, nunca só cor. Tons FIXOS:
   Livre #6b7280 · Reservado #2563eb · Ocupado #16a34a · Limpeza #d97706 · Manutenção #dc2626.
   Situação da reserva: Pendente, Confirmada, Hospedado, Finalizada, Cancelada.
3. A cor da marca significa "faça isto": só no botão principal e no item ativo do menu. Não use
   a marca em fundo decorativo, título ou ícone de enfeite.
4. Dinheiro: "R$ 1.234,56", alinhado à direita, algarismos tabulares (font-variant-numeric:
   tabular-nums).
5. Alvo de toque de 48 px no celular e no tablet; compacto (36 px) só no desktop de 1280 px ou mais.
6. Sem animação decorativa. Movimento só para confirmar que um estado mudou.
7. Contraste: texto ≥ 4,5:1, borda e foco ≥ 3:1. Foco de teclado sempre visível.
8. Fundo das telas de trabalho neutro (branco e cinzas claros). Fonte Inter.
9. Ação irreversível (check-out, cancelar) abre confirmação na própria linha antes de executar.

ESCALA DE TEXTO
título da página 20/28 semibold · título de seção 14/20 semibold · corpo 14/20 · apoio 12/16 ·
número de destaque 24/32 semibold com tabular-nums.

IDENTIDADE (já aprovada no login)
- Logo GSW (prédio, cama e abajur) em verde-escuro #065f46. Use o arquivo enviado
  (SPEC-10-logo-gesway.svg). Em tamanho pequeno (menu, ícone da aba) use só um símbolo
  simplificado, sem os detalhes.
- Nome "GESWAY", com "WAY" em verde, e a frase "GESTÃO HOTELEIRA INTELIGENTE".
- Botão principal do login: #047857 com texto branco.
- Vidro, brilho e luz animada ficam SÓ no login. Não leve para as outras telas.

O HOTEL FICTÍCIO DE TODAS AS TELAS
"Pousada Aurora", 15 quartos (101 a 105, 201 a 205, 301 a 305), categorias Standard (R$ 200,00),
Luxo (R$ 333,33) e Suíte (R$ 480,00). Usuária logada: "Recepção Aurora 1", papel Recepcionista.
```

---

## 5. Fase 1: casca + marca, com o painel Hoje cheio

**Tarefas:** T-10.2 (marca), T-10.3 (símbolo), T-10.4 (casca), mais o painel Hoje como conteúdo
de prova. **Decisões que este protótipo responde:**
- **P-3:** o verde da marca se confunde com o "Ocupado" de relance?
- **P-2:** a faixa verde e areia do login vai para o topo da casca?

### 5.1 Prompt da Fase 1

```text
FASE 1 — Casca do app e marca, com o painel "Hoje" cheio dentro.

OBJETIVO: decidir a cor da marca e o desenho da casca (menu, cabeçalho, barra do celular). O
painel Hoje entra cheio de dados para testar a marca ao lado dos selos de status.

CONTROLE DE COMPARAÇÃO (só no protótipo, um painel flutuante discreto no canto):
A) Cor da marca, 3 opções:
   1. Teal atual #115e59
   2. Esmeralda #047857
   3. Esmeralda escuro #065f46
   A marca aparece só no botão principal, no item ativo do menu e no anel de foco.
B) Faixa do topo: desligada (cabeçalho branco) ou ligada (faixa fina com tons suaves de verde e
   areia, a mesma família do login, só atrás do cabeçalho).
C) Largura de visualização: 390, 768 e 1366 px.

CASCA
- Desktop e tablet (768 px ou mais): menu lateral de 220 px, fundo branco, borda à direita.
  No topo do menu, o símbolo simplificado e "Gesway". Itens com ícone e rótulo, nesta ordem:
  Hoje, Reservas, Hóspedes, Quartos, Comanda, Indicadores.
  Item ativo: barra de 2 px à esquerda e fundo da marca a 10%, com texto escuro.
- Cabeçalho: à esquerda o nome do hotel ("Pousada Aurora"); à direita "Recepção Aurora 1 ·
  Recepcionista" e um botão "Sair".
- Celular (390 px): sem menu lateral. Barra inferior fixa com 4 abas (Hoje, Reservas, Hóspedes,
  Comanda) e "Mais", que abre de baixo as outras (Quartos, Indicadores). No cabeçalho do celular,
  o nome do hotel e, embaixo, "Recepção Aurora 1 · Recepcionista".
- Mostre também, numa segunda variação, o menu do garçom: só "Comanda".

PAINEL "HOJE" (conteúdo da tela, nesta ordem fixa)
1. Título "Hoje" e a data "22/11/2026".
2. Cinco cartões de números (2 colunas no celular, 5 no desktop):
   Vendidos hoje 6 (ocupados + chegadas de hoje) · Ocupados 4 (agora) · Livres 10 (prontos para
   vender) · Em limpeza 1 (saíram, não liberados) · Ocupação 26,7% (de 15 quartos).
3. Bloco "Atenção": "1 chegada sem pagamento — risco de no-show", "1 saída atrasada",
   "1 quarto em limpeza". Cada item com ponto colorido + texto, e é um link.
4. Quatro blocos em grade de 2 colunas no desktop, 1 no celular. Cada bloco tem título, contagem
   num selo e uma linha de legenda:
   - CHEGADAS ("Entrada hoje, ainda sem check-in — e as atrasadas"):
     • Marina Costa · selo Confirmada · "Quarto 203 · 3 diárias" · botão "Fazer check-in"
     • Rafael Souza · selo Pendente · "Quarto 205 · 1 diária" · selo vermelho "Sem pagamento" ·
       botão "Fazer check-in"
   - SAÍDAS ("Saída hoje — e as atrasadas, que continuam na casa"):
     • Helena Prado · selo Hospedado · "Quarto 102 · 2 diárias" · botão "Fazer check-out"
     • Otávio Lima · selo Hospedado · "Quarto 301 · 4 diárias" · selo âmbar "Saída atrasada · era
       21/11/2026" · botão "Fazer check-out"
   - NA CASA ("Hóspedes com check-in feito"): 4 linhas, cada uma "Nome · Quarto N · saída dd/mm":
     Helena Prado (102, 22/11), Otávio Lima (301, 21/11), Beatriz Nunes (204, 25/11),
     Carlos Mendes (302, 24/11).
   - EM LIMPEZA ("Quartos que saíram e ainda não voltaram para a venda"):
     • Quarto 105 · "desde 22/11 às 10:40" · botão "Liberar quarto"
   O nome do hóspede é um link. Os botões da linha são secundários (contorno). Ao clicar em
   "Fazer check-in", a própria linha abre uma confirmação: "Confirmar check-in de Marina Costa
   no quarto 203", texto "O quarto passa a ocupado e a conta da estadia abre", botão principal
   "Confirmar check-in" e botão "Voltar".

ESTADOS (mostre como variações selecionáveis no painel de comparação)
- Carregando: cada bloco com "Carregando chegadas…" e um indicador pequeno.
- Vazio: "Nenhuma chegada para hoje." com o botão "Nova reserva".
- Sem conexão: faixa fina âmbar clara no topo com ícone de wi-fi cortado: "Sem conexão: o painel
  mostra o último dado carregado e atualiza quando a rede voltar."
- Sucesso de uma ação: aviso fixo no alto da área visível: "Check-in de Marina Costa feito. O
  quarto passou a ocupado." com botão "Fechar".

NÃO FAÇA: gráficos, ilustrações, cartões grandes com sombra pesada, gradiente no conteúdo,
animação de entrada, cor de marca em título ou ícone decorativo.
```

### 5.2 O que olhar na revisão da Fase 1

| Pergunta | Como decidir |
|---|---|
| P-3: a marca se confunde com o "Ocupado"? | Com o painel cheio, olhar de relance o botão "Confirmar check-in" ao lado do selo "Hospedado"/"Ocupado". Se confundir com o #047857, testar o #065f46. **O status não muda** (§10.3) |
| P-2: faixa do topo ligada ou desligada? | Ligada só se não reduzir as linhas visíveis e se o nome do hotel e o "Sair" mantiverem o contraste |
| Símbolo do menu | Legível a 24 px e no ícone da aba (16 px)? Se não, simplificar mais |
| Densidade | No celular, o painel cheio cabe em até 3.000 px de altura? |

### 5.3 Registro

| Item | Valor |
|---|---|
| Link do protótipo | _a preencher_ |
| Capturas (390, 768, 1366 px) | _a preencher_ (em `docs/qa/evidencias/`, fora do git) |
| Cor da marca escolhida | _a preencher_ |
| Faixa do topo | _a preencher_ |
| Aprovado por | _a preencher_ (Sirlande; o painel Hoje com o Gabriel) |
