# Auditoria de coerência dos 8 documentos oficiais

> **Data:** 28/10/2026
> **Escopo:** somente leitura. Os 8 documentos foram confrontados entre si, com as decisões registradas (Plano, Painel, `ORQUESTRADOR.md`, CLAUDE.md) e com o código da `origin/develop`.
> **Prioridades:** 🔴 contradição que reprova ou exige reentrega · 🟡 divergência que precisa de ajuste · 🟢 melhoria
> **Donos (decisão de 14/10):** 01, 02, 05, 06 e 07 → Gabriel · 03 e 04 → Sirlande · 08 → Weslley
> **Regra para documento de outro dono:** sugestões em `docs/sugestoes-documentos-oficiais/`. O dono decide o que entra.

## Fatos conferidos no código (develop, 28/10)

| Fato | Onde está no código |
|---|---|
| Check-in aceita `PENDING` e `CONFIRMED` (walk-in) | `CheckInController.js:27` |
| `DELETE /payments/:id` responde 405; o estorno é `POST /payments/:id/void` (ADMIN) | `paymentRouter.js` |
| `method` é allowlist `PIX, CARTAO_CREDITO, CARTAO_DEBITO, DINHEIRO` | `paymentEnums.js:16` |
| O PDF de orçamento é gravado no MinIO | `CreateEventQuoteController.js:59`, `EventQuoteModel.pdf_url` |
| Webhook do Asaas usa o cabeçalho `asaas-access-token`, sem HMAC (só o provedor simulado usa HMAC) | `AsaasPixProvider.js` |
| ViaCEP fica no core | `GET /address/:cep` |
| Retenção do outbox: 7 dias | `publisher.js:63` |
| analytics-service na porta 3001, com projeção de categorias | `feature/analytics-service` |

## Matriz de contradições

| # | Tema | Errado | Certo (código ou decisão) |
|---|---|---|---|
| 1 | Nome do serviço financeiro | 02 (coluna Módulo): `billing-service` | 03, 04, 06 e 07 (ADR-003): core e b2b |
| 2 | PRODUCTS, ACCOUNTS e ACCOUNT_ITEMS | 03 §4 e §7: 🔷 (planejado) | 04 §1.3: ✅ (`schema.sql`) |
| 3 | PDF de orçamento no D-005 | 03 D-005 e F-013: não armazenado | 02 RNF-023, 04, 05 §3.5 e 06 §3: armazenado |
| 4 | Nota sobre o Doc 04 §7 | 03 §1: "recorte de 23/08" | 04 v1.2 e v1.3 já corrigidos |
| 5 | Exclusão de pagamento | 02 RF-015: DELETE com soft delete | 04, 06 e 07 (ADR-010): estorno VOIDED |
| 6 | `method` de pagamento | 02 RF-014: livre, "CARTAO" | allowlist de 4 valores |
| 7 | Walk-in | 01 §5.1, 02 RF-011 e 06 §4.1: sem `PENDING→CHECKED_IN` | decisão de 24/10 e código |
| 8 | Réplicas do backend | 02 RNF-003: mínimo de 3, sem exceção | 05 e ADR-004: 1 na nuvem; o 02 precisa declarar a exceção |
| 9 | Fonte do analytics | 02 RNF-014: "banco ou réplica" | ADR-003: banco próprio, réplica rejeitada |
| 10 | Módulo do RF-045 | 02: core | 03 F-010 e 06: alvo é o b2b |
| 11 | Autenticação do webhook | 05 §4.2 e 06 §4.1: HMAC | código: token do PSP |
| 12 | Nós da nuvem | 05 v1.1, ADR-004 e 06 §5: 2 micro, free-tier | decisão de 24/10: 1× t3.small, plano de créditos |
| 13 | ADR-007 | 04 §10.4: "Proposta" | 07: adiada para o 5º semestre |
| 14 | `payments` | 04 §4.8: `account_id` e VOIDED 🔷 | implementados (T-04.4 e PR #100) |
| 15 | Prazo e escopo | 08: término 17/11, nuvem no 4º | Plano: 10/12, nuvem no 5º |
| 16 | Papéis e dono do Doc 07 | 08: Weslley; 01 §8: papéis antigos | Painel §2: Doc 07 do Gabriel |

## Achados por documento

### Doc 01 — Solicitação (v1.0, Gabriel)

Nada obrigatório.
- No máximo, uma nota dizendo que os checkboxes do §5.1 são de 23/08.
- Opcionalmente, acrescentar o walk-in.
- A divergência de papéis com o Doc 08 se resolve no Doc 08.

### Doc 02 — Requisitos (v1.3, Gabriel) → **reentrega v1.4 obrigatória**

- 🔴 Remover `billing-service`:
  - core para pagamento, consumo, PIX e caixa;
  - b2b para RF-029 a RF-036.
- 🔴 **RF-011:** incluir `PENDING → CHECKED_IN` (walk-in).
- 🔴 **RF-015:** trocar o DELETE pelo estorno `POST /payments/:id/void`.
  - Só ADMIN, motivo obrigatório, só `PAID`, uma vez.
  - O DELETE passa a responder 405.
- 🟡 Ajustes de requisito:
  - **RF-014:** usar a allowlist de 4 métodos.
  - **RF-045:** b2b como alvo.
  - **RNF-003:** declarar a exceção na nuvem, citando a ADR-004.
  - **RNF-014:** banco próprio alimentado por evento.
  - **RNF-012:** "assinatura ou token do PSP".
- 🟡 **RNF-004** e glossário "free-tier": alinhar depois do Doc 05 v1.2.
- 🟢 Caminhos:
  - **RNF-020:** `infra/k8s/`.
  - **§1:** prefixo `services/core-service/`.
- 🟢 Incluir o RNF-028 (entrega de eventos).
- A sugestão `versao-sugerida_v1.4.md` (14/09) é a base, mas está desatualizada.

### Doc 03 — DFD (v1.2, Sirlande) → **sugestão de v1.3**

- 🔴 Tirar o 🔷 de PRODUCTS, ACCOUNTS e ACCOUNT_ITEMS.
- 🔴 D-005 com o PDF de contrato **e** o de orçamento, com URL assinada de até 5 minutos.
  - Atualizar também F-013, F-020 e a seta P2→D5.
- 🟡 Atualizar a nota de rastreabilidade do §1.
- 🟡 Completar o D-001: `RESERVATION_GUESTS`, `CASH_CLOSINGS`, `CASH_CLOSING_LINES` e `OUTBOX`.
- 🟢 F-016 com categoria de quarto; webhook com "assinatura ou token".

### Doc 04 — MER (v1.3, Sirlande): melhorias, sem nova versão (política do §8)

- 🟡 Tirar o 🔷 de `account_id`, `VOIDED` e `void_*`, registrando no Histórico.
- 🟢 Ajustes pontuais:
  - **§10.4:** ADR-007 adiada.
  - **§4.8:** citar a allowlist de `method`.
- Fora isso, o Doc 04 é coerente com o 06 e o 07 e serve de **referência**.

### Doc 05 — Arquitetura em nuvem (v1.1, Gabriel) → **v1.2 em redação**

- 🔴 Um nó t3.small, com plano de créditos e consumo por sessão.
- 🟡 Declarar a nuvem como alvo do 5º semestre.
- 🟡 Corrigir o SG de saída.
- 🟡 Itens da auditoria: `cpu_credits`, SSL no RDS, overlay, RNF-003 e NetworkPolicy.
- 🟡 Trocar HMAC por token do PSP.
- 🟡 **Avaliar diagrama com ícones oficiais da AWS.** O Termo §6.5 pede "diagrama oficial".
- 🟢 Acrescentar a frase "até a T-01.6, o PDF sai do core".

### Doc 06 — C4 (v1.1, Gabriel) → **v1.2 com ajustes pequenos**

- 🟡 Walk-in no §4.1.
- 🟡 Webhook com "token ou assinatura do PSP", no §4.1 e no §2.
- 🟡 **§5 #5:** alinhar à ADR-004 revista, em que um nó t3.small deixa de ser alternativa rejeitada.
- 🟢 Porta do analytics 3001 (§3) e "categorias" nas projeções (§4.3).
- 🟢 Remover a "diferença conhecida" com o 03 depois da reentrega dele.

### Doc 07 — ADR (sugestão v1.0, Gabriel) → **v1.1**

- 🔴 Revisar a **ADR-004** para 1 t3.small com créditos, ou criar uma ADR-012 que a substitua.
- 🟡 **ADR-001:** remover a menção a "1 GiB".
- 🟡 **ADR-010:** marcar como "Aceita — implementada em 24/10/2026".
- 🟡 Cabeçalho v1.1 com a data real.
- 🟢 Ajustes pontuais:
  - **ADR-009:** marcar como implementada.
  - **ADR-003:** nota de que ACCOUNTS e ACCOUNT_ITEMS foram implementadas em 14/10.
  - **ADR-008:** "autenticidade (assinatura ou token)".
  - **ADR-005:** igualar o título ao do índice.

### Doc 08 — Sprints (sugestão v1.0 de 07/10, Weslley) → **v1.1**

- 🔴 Prazos e escopo:
  - término em 10/12, com congelamento em 24/11;
  - nuvem no 5º semestre.
- 🔴 Status real do backlog:
  - T-04.1 a T-04.7, T-05.x, T-06.12 e T-06.13;
  - H.2 em branch;
  - ADR-007 adiada.
- 🟡 Asaas no §3.2 e o roteiro de 7 passos.
- 🟡 Donos corretos dos documentos.
- 🟡 Dono da T-01.5.
- 🟡 Preencher o placeholder "[canal do grupo — confirmar]".
- 🟢 Ajustes de texto:
  - não citar "critério 20";
  - o grupo decide se expõe a contagem de commits por pessoa.

### Fora dos documentos

O catálogo de eventos v1.1, na `feature/analytics-service`, ainda descreve `payment.deleted` "via `DELETE /payments/:id`". Esse endpoint hoje responde 405.

## Pacote de entrega recomendado

Cada PR ao professor só sai com autorização do Gabriel.
- **Título:** `[Gesway] - Entrega N - Descrição`.
- **Conteúdo:** só a pasta `Projetos/gesway/`.
- **Branch:** a partir de `upstream/main`.

Ordem:
1. **Docs 05 v1.2 + 06 v1.2 + 07 v1.1.** Podem ir num PR só. O Doc 05 e a ADR-004 saem juntos e coerentes.
2. **Doc 08 v1.1.**
3. **Reentregas de coerência:** Doc 02 v1.4 (Gabriel) e Doc 03 v1.3 (Sirlande, se aceitar a sugestão).
4. **Revisão final:** os documentos já entregues, incluindo as melhorias do Doc 04 sem nova versão.
