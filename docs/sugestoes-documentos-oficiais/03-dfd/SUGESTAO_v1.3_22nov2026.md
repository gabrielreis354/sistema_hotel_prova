# Documento 03 (DFD): correção sugerida para a v1.3 (22/11/2026)

**Dono:** Sirlande · **Base:** revisão de contradições de 19/11
(`docs/banca/CONTRADICOES_DOCUMENTACAO_19NOV2026.md`, PR #179), achado 🟡-10
**Evidência de código:** `develop` em `859cb30` (20/11)
**Situação:** ⏳ texto pronto para aplicar no fork. O Doc 03 v1.2 já foi entregue (PR #15 do
professor), então a correção vai para a próxima reunião, junto com as pendências de
`03-dfd/MOTIVOS.md` (`PRODUCTS` 🔷 e o PDF de orçamento).

---

## 🟡-10: relatório de consumo interno × fluxo F-016

**Contradição.** O F-016 diz que o core publica no RabbitMQ os eventos de hotel, quarto,
hóspede, reserva e pagamento, e só desses agregados (ADR-003). Conta e item de conta **não**
geram evento. Mas o RF-052 pede o relatório de cortesias e perdas (consumo interno), e quem lê o
Doc 03 entende que ele sai do `analytics-service`, que não recebe esses dados.

**Como o código resolve.** O relatório fica no **core**: `GET /analytics/internal-consumption`
(`routes/apis/analyticsRouter.js:17`, só ADMIN, CA-04.7.c) lê `accounts` e `account_items` no banco do
core. O nginx manda **só esse caminho exato** para o core (`location =`, `docker/nginx/default.conf:109`),
antes da regra geral de `/analytics/`, que vai para o analytics. A decisão L-1 (evento novo para
conta e item, ou manter no core) ficou para o 5º semestre.

**Texto sugerido.** Acrescentar uma nota logo abaixo da tabela de fluxos (depois do F-016):

> **Nota: consumo interno (RF-052).** O relatório de cortesias, refeição de funcionário e perdas
> **não** passa pelo F-016: conta e item de conta não geram evento de domínio. O `core-service`
> lê `accounts` e `account_items` no próprio banco e responde em `GET /analytics/internal-consumption`,
> só para o administrador. O caminho mantém o prefixo `/analytics/`, mas o *gateway* o encaminha
> ao core. Levar esses dados ao `analytics-service` depende de um evento novo no catálogo
> (decisão L-1, 5º semestre).

Se o DFD de nível 1 tiver o processo "Gerar indicadores" ligado ao analytics, acrescentar um fluxo
do *data store* de contas do core para o operador administrador, com o rótulo "relatório de consumo
interno (RF-052)". Usar o próximo número livre (não renumerar).

---

## O que não mudar

- O F-016 continua como está: a lista de agregados que geram evento está correta.
- A natureza normativa do Doc 03: sem coluna de status de implementação (regra de 21/09, no
  `README.md` desta pasta).
