# Documento 03 — motivos da versão sugerida v1.1

**Documento oficial:** `Projetos/gesway/03-diagrama-fluxo-de-dados.md` — **v1.0, de 17/09/2026**
**Dono:** **Sirlande Martins**
**Versão sugerida:** `versao-sugerida_v1.1.md`
**Data desta revisão:** 21/09/2026 · **Revisor:** Gabriel Reis Cunha

---

## Situação do documento oficial

A v1.0 está em `origin/main` do fork da UniFAAT, em quatro commits do Sirlande: o preenchimento
em 17/09 (`6e1a59a`) e três de legibilidade e notação, o último em 21/09 (`a6f834f`).

**O documento ainda não foi entregue ao professor.** O `upstream/main` (repositório do
Alexandre Tavares) tem o modelo em branco. Ou seja: a alteração é livre e **não exige nova
reunião** — diferente do Doc 02, que já está lá na v1.3.

---

## O que foi conferido, e como

| Verificação | Método | Resultado |
|---|---|---|
| Os 4 diagramas renderizam | Mermaid 11 (a linha que o GitHub usa), servido em `localhost` | **4 de 4, zero erro de parse** |
| O `\n` dos rótulos quebra linha | inspeção do DOM dos 128 rótulos | nenhum `\n` literal — o modelo oficial também usa `\n` |
| Rótulos sobrepostos | medição das caixas de todos os rótulos, par a par | **nenhuma sobreposição** entre rótulos distintos |
| Citações de requisito | confronto com o Doc 02 v1.3 | RNF-005, RNF-012, RNF-023, RF-016, RF-023, RF-027 — **todas corretas** |
| Recorte de entidades | confronto com a ADR-003 e o índice do Doc 04 | 12 (core) + 5 (b2b) + 0 (analytics) = as 17 entidades do MER — **fecha** |
| Balanceamento Nível 0 ↔ Nível 1 | fluxo por fluxo | completo, **exceto** um fluxo (item 2 abaixo) |
| Itens que o `INSUMOS.md` mandava não desenhar | busca no texto | Redis, notificação ao hóspede, *channel manager*, site público e painel admin — **todos corretamente ausentes** |

O `analytics-service` lê apenas o próprio banco, alimentado por evento, e não o banco do núcleo.
Esse é o ponto central da ADR-003 e está representado corretamente.

---

## Decisão tomada: o documento **não** recebe status de implementação

A primeira revisão apontou que processos, armazenamentos e fluxos da arquitetura-alvo
(`b2b-service`, `analytics-service`, RabbitMQ, *outbox*, REST interno) aparecem como se já
existissem, e sugeriu marcá-los com 🔷, como o `INSUMOS.md` previa.

**A sugestão foi recusada, e corretamente.** O DFD é o documento oficial contra o qual o
projeto será cobrado: ele declara como o sistema **deve** funcionar, e a implementação vem
depois. Marcar status transformaria uma norma em relato datado, e o documento envelheceria a
cada commit.

É exatamente a decisão que o **Doc 02 tomou na v1.1**, quando removemos a coluna de status e
movemos o acompanhamento para o Doc 08. A v1.1 do DFD **formaliza isso** numa subseção
"Natureza normativa deste documento" (§1), com a mesma redação do Doc 02 — o que, de quebra,
responde por antecipação a quem ler o diagrama e perguntar se os três serviços já rodam.

A única exceção mantida são as **entidades de dados**, que herdam o status do Doc 04 porque ali
o status é atributo da entidade, não deste documento.

---

## Correções aplicadas

### 1. Falta o armazenamento de objetos — **funcional**

O RNF-023 é explícito: *"Contratos e orçamentos em PDF persistidos em armazenamento de objeto;
download apenas por URL assinada com expiração ≤ 5 minutos"*. O RF-035 repete a exigência.

A v1.0 cita a URL assinada no fluxo F-013, mas **não tem armazenamento correspondente** no
dicionário da §7, nem fluxo de persistência em diagrama nenhum. Era o único elemento exigido
por requisito que ficou de fora.

**Aplicado:** armazenamento **D-005** na §7, fluxo **F-020** no dicionário, seta
`2.0 → D-005` no Nível 1 e `2.1 → D-005` no Nível 2.

Evidência no código: `services/core-service/app/utils/uploadToMinIO.js` e
`DownloadContractPdfController.js`. E a distinção que estava perdida: **o PDF de orçamento é
gerado sob demanda e não é armazenado** (`generateQuotePdf.js`); só o de contrato é.

Detalhe de método: o *download* acontece direto do armazenamento, com a URL assinada — o
arquivo não volta a passar pelo `b2b-service`. Como o DFD clássico não admite seta de
armazenamento para entidade externa, o diagrama mostra `2.0 → Operador: "URL assinada"` e o
dicionário (F-020) explica o caminho real do arquivo.

**Se não mudar:** um requisito não funcional fica sem representação no DFD, e a §7 descreve um
sistema que perde os PDFs.

### 2. O Nível 0 atribui ao hóspede um fluxo que é do PSP — **funcional**

A v1.0 tem `Hóspede → Sistema: "Reserva direta, confirmação PIX"`.

O hóspede não informa ao sistema que pagou: ele paga no aplicativo do próprio banco, e a
confirmação chega pelo *webhook* do PSP (RF-027), que já tem seta própria no mesmo diagrama. O
Nível 1 está certo (`Hóspede → 1.0: "Reserva direta"`), o que deixava os dois níveis
desbalanceados — e o errado era o de cima.

**Aplicado:** rótulo corrigido, e uma nota abaixo do diagrama explicando por que a confirmação
parte do PSP. O contrário aparece como uma falha de entendimento do fluxo de pagamento, que é
justamente o fluxo mais avaliado do projeto.

### 3. RF-028 não aparecia em diagrama nenhum — **funcional**

A consulta pública de status da reserva é citada na tabela de entidades externas da §3, mas não
tinha seta nem entrada no dicionário.

**Aplicado:** incluída nos rótulos do Nível 0 e do Nível 1, e acrescentada como **F-019**.
Evidência: `GetBookingStatusController.js`, rota `GET /public/:subdomain/bookings/:id/status`.

### 4. Dez requisitos sem processo correspondente — **rastreabilidade**

RF-044 (OpenAPI) e RF-046 a RF-054 (aplicação `app-pms`) não constavam de nenhum processo da
§4. Não desenhar a interface como processo **é a escolha certa** — ela não transforma dados —,
mas a ausência precisava ser justificada, porque o critério C9 e a banca leem a rastreabilidade.

**Aplicado:** nota na §4. A justificativa é uma frase do próprio Doc 02 §2.9: a interface *"não
acrescenta regra de negócio própria: toda validação permanece no servidor"*. A decomposição em
contêineres fica com o Doc 06 (C4).

### 5. CONSUMPTIONS sem marcador — **consistência com o Doc 04**

No Doc 04 a entidade é ⚠️ **Em transição** (sai quando `ACCOUNT_ITEMS` entrar). A v1.0 importa
a legenda do Doc 04 mas declara só o 🔷, e lista `CONSUMPTIONS` sem marca nas §4 e §7.

**Aplicado:** marcador ⚠️ nas duas tabelas e a legenda da §2 completada com os três status.

### 6. Subprocesso sem número — **forma**

A v1.0 usa `1.x — core-service` no Nível 2. Num DFD o número do processo é identificador, não
pode ficar indefinido.

**Aplicado:** virou **1.4**, na sequência de 1.1 a 1.3 da §5.1, e a §5 ganhou a lista dos seis
subprocessos (1.1 a 1.4, 2.1 e 2.2), que antes só existiam dentro dos diagramas.

### 7. Notação invertida em relação ao modelo oficial — **forma**

O §2 do modelo oficial define **retângulo = entidade externa** e **círculo/elipse = processo**.
A v1.0 usa o inverso: estádio para entidade e retângulo para processo — que também é o inverso
de Gane-Sarson e de Yourdon/DeMarco, as duas convenções clássicas.

A mudança que o Sirlande fez em 21/09 tinha um motivo legítimo e foi preservada: o modelo
oficial usa o **mesmo cilindro** para entidade externa e para banco de dados, o que confunde as
duas coisas.

**Aplicado:** estádio e retângulo trocados de papel. Entidade externa volta a ser retângulo,
processo fica em estádio (a forma arredondada mais próxima da elipse do modelo, e legível com
rótulo de duas linhas), armazenamento segue em cilindro. As três formas continuam distintas
**e** a notação volta a bater com o modelo. A §2 registra por que não se usa o cilindro do
modelo para entidade externa.

### 8. Legibilidade dos diagramas — **forma**

Medido com o Mermaid 11: o Nível 1 da v1.0 tinha canvas de **1994 × 1276 px**. O corpo de texto
do GitHub tem cerca de 890 px, então o diagrama era reduzido a **45%** — texto de 16 px
renderizado a ~7 px.

**Aplicado:** removidos os três `subgraph` (que forçavam largura sem acrescentar informação) e
reajustado o espaçamento dos Níveis 0 e 1. Medição da v1.1:

| Diagrama | v1.0 | v1.1 | Escala no GitHub |
|---|---|---|---|
| Nível 0 | 1171 × 319 | 1188 × 339 | 0,76 → **0,75** |
| Nível 1 | 1994 × 1276 | **1645 × 668** | 0,45 → **0,54** |
| Nível 2 (§5.1) | 534 × 1197 | 506 × 1167 | **1,00** |
| Nível 2 (§5.2) | 547 × 772 | 611 × 797 | **1,00** |

O Nível 1 melhorou, não ficou resolvido: continua o diagrama mais denso do documento. A altura
caiu quase pela metade, o que é o que importa na leitura impressa. **Zero sobreposição de
rótulos** nos quatro, verificado par a par.

### 9. Formato de dois fluxos — **precisão**

F-003 e F-018 declaravam formato `JSON (querystring)`. *Querystring* não é JSON.

**Aplicado:** `HTTP GET (querystring)` nos dois.

### 10. Data, versão e dependência de entrega

O cabeçalho dizia 17/09 com a notação alterada em 21/09, e o histórico tinha só a linha 1.0.

**Aplicado:** cabeçalho em 21/09, versão 1.1 e linha nova no histórico. Se o Sirlande preferir,
como nada foi entregue ainda, pode consolidar tudo como 1.0 e só atualizar a data — a decisão
é dele.

Acrescentada também uma nota de **dependência de entrega**: o documento se apoia na ADR-003, e
o Doc 07 do `upstream` tem 268 linhas, **sem a ADR-003** — ela existe só no nosso fork (342
linhas). Os dois precisam subir no mesmo PR, e o 07 primeiro, ou o professor lê um DFD cujo
fundamento declarado não está no repositório dele.

---

## Um acerto do Sirlande que virou tarefa nossa

Ele marcou **PRODUCTS como 🔷**, com a justificativa "conforme o Doc. 04" — e está certo.

A inconsistência é no **Documento 07**: a tabela de decisão da ADR-003 lista
`PRODUCTS` sem marcador, enquanto `ACCOUNTS 🔷` e `ACCOUNT_ITEMS 🔷` têm. O índice do Doc 04
(§1.3, linha 4.10) é claro: **PRODUCTS é 🔷 Planejado**.

**Ação:** corrigir a tabela da ADR-003 no Doc 07 antes de entregar. O Doc 07 é do Weslley; a
ADR-003 foi redigida pelo Gabriel, então o ajuste é nosso, não dele.

---

## O que não foi alterado

| Item | Por quê |
|---|---|
| Status de implementação em processos, armazenamentos e fluxos | Decisão do time: o documento é norma, não relato. Ver a seção "Decisão tomada" |
| A afirmação de que o *webhook* valida assinatura (F-006 e §5.1) | É norma (RNF-012), não relato. Fica reforçada, com o `401`. E, desde 21/09, também é fato: a **T-06.9** foi implementada e integrada na `develop` (PR #81) |
| Nota de rastreabilidade sobre Doc 02 e Doc 04 §7 | Está correta e continua pendente: os dois ainda refletem o recorte de 23/08 e estão **entregues** ao professor |
| RF-045 no `b2b-service` | Correto pela ADR-003: `CORPORATE_CLIENTS` é entidade do b2b. A divergência com o Doc 02 já está apontada no próprio documento |

---

## Como aplicar

```bash
# conferir o que muda (o --strip-trailing-cr é necessário: o repo da UniFAAT vem com CRLF)
diff --strip-trailing-cr \
  <UniFAAT>/Projetos/gesway/03-diagrama-fluxo-de-dados.md \
  docs/sugestoes-documentos-oficiais/03-dfd/versao-sugerida_v1.1.md
```

Quem aplica é o **Sirlande**, no fork da UniFAAT, em branch (`docs/gesway-dfd-v1.1`) e não
direto na `main` — os Docs 02 e 07 seguiram esse fluxo, e a `main` do fork é o que vira PR para
o professor.
