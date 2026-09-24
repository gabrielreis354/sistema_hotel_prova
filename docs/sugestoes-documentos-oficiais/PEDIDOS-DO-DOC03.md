# Pedidos do Doc 03 (DFD) aos outros documentos — 24/09/2026

**De:** Sirlande (dono dos Docs 03 e 04) · **Para:** Gabriel

Na adequação do Doc 03 v1.2 para a **Entrega 3**, apareceram pontos que estão em documentos
de outros donos. Pela regra desta pasta, **o documento oficial não é editado**: fica aqui o
pedido, com a evidência, para você avaliar e aplicar.

O Doc 03 v1.2 já registra esses pontos como pendência (nota de rastreabilidade da §1). Ele não
afirma que foram corrigidos.

---

## 1. Doc 02 — RNF-023 exige persistir também o PDF de orçamento

**O que está escrito** (v1.3 oficial e também a `versao-sugerida_v1.4.md` desta pasta):
"Contratos **e orçamentos** em PDF persistidos em armazenamento de objeto; download apenas por
URL assinada com expiração ≤ 5 minutos".

**O que o código faz** (`develop`):

- `EventQuoteApi/DownloadQuotePdfController.js` + `utils/generateQuotePdf.js`: o PDF do
  orçamento é **gerado sob demanda** a cada requisição e devolvido na própria resposta. Não
  é gravado no MinIO.
- `ContractApi/CreateContractController.js`: só o PDF do **contrato** vai para o MinIO
  (`${tenantId}/contracts/${id}.pdf`), fora da transação e em *best-effort*.
- `ContractApi/DownloadContractPdfController.js`: com `pdf_url`, redireciona para URL
  assinada. Sem `pdf_url`, porque o upload falhou, gera o PDF sob demanda.

**Pedido:** decidir se o RNF-023 passa a valer só para contrato ou se o orçamento também deve
ser persistido, o que muda o código. O Doc 03 (D-005, F-013) descreve o orçamento como gerado
sob demanda e não armazenado.

## 2. Doc 02 — RF-045 continua como `core-service` na versão sugerida v1.4

A `versao-sugerida_v1.4.md` realinha a coluna "Módulo" à ADR-003, mas o RF-045 (ViaCEP)
ficou como `core-service (integração externa)`. O endereço preenchido pelo ViaCEP alimenta
`CORPORATE_CLIENTS`, que é do `b2b-service` pela ADR-003. É assim que o Doc 03 o representa
(§4, fluxos F-010 e F-011).

**Pedido:** mudar o RF-045 para `b2b-service` na v1.4 sugerida.

## 3. Esta pasta — Doc 07 "entregar antes do Doc 03"

A linha do Doc 07 na tabela *Situação* do `README.md` diz: "entregar **antes** do Doc 03, que
o cita como fundamento". Só que os documentos são entregues **em ordem numérica**, e agora a
entrega é o Doc 03.

O Doc 03 v1.2 deixou de depender dessa ordem. A nota de dependência virou uma nota de
referência: o critério e os três serviços da ADR-003 estão na §1 do próprio DFD, e a
comunicação entre eles está nos fluxos F-014 a F-017.

**Pedido:** atualizar essa linha e a linha do Doc 03, que está em **v1.2** no PR #5 do fork,
com o título `[Gesway] - Entrega 3 - Diagrama de Fluxo de Dados (DFD)`.

---

Continua valendo o pedido que já estava registrado: `PRODUCTS` como 🔷 na tabela da ADR-003
(Doc 07), conforme o Doc 04 §1.3.
