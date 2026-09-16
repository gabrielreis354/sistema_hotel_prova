# Repasses sem dono definido — 16/09/2026

Origem: auditoria da branch `fix/public-booking-payment-leak` (T-06.5) —
relatório em `docs/qa/redteam_public-booking-leak_16set2026.md`.

Área: backend de B2B (`ContractApi`, `EventQuoteApi`). A §3.3 da divisão dá o **frontend** de B2B
ao Weslley; o backend não aparece na §7. `git log` mostra commits de Gabriel, Sirlande e de um
autor externo nesses controllers — por isso **DONO INDEFINIDO**, sem chutar nome.

---

## 🟡 [LGPD art. 6º, III] `include` de `CorporateClientModel` sem `attributes` devolve CPF e RG do representante

**Onde:**
- `services/core-service/app/Controllers/ContractApi/GetContractController.js:12` e `:17`
- `services/core-service/app/Controllers/ContractApi/ListContractController.js:12-13`
- `services/core-service/app/Controllers/ContractApi/DownloadContractPdfController.js:13`
- `services/core-service/app/Controllers/EventQuoteApi/GetEventQuoteController.js:11`
- `services/core-service/app/Controllers/EventQuoteApi/DownloadQuotePdfController.js:12`

**Cenário concreto:** `GET /contracts/:id` com JWT de qualquer papel do tenant
(`contractRouter` não restringe papel) → `return response.json({ ...contract.toJSON(), ... })`
devolve o objeto `client` inteiro: `cnpj`, `cpf`, `email`, `telefone`, `endereco`,
`representante_nome`, `representante_cpf`, `representante_rg`
(`services/core-service/app/Models/CorporateClientModel.js:7-15`). A tela de contrato precisa de
razão social e CNPJ; RG e CPF do representante só interessam ao PDF.

**Por que não foi pego pelo `qa_checks.sh`:** a regra 6 é um grep de **linha única**
(`scripts/qa_checks.sh:148-150`). Nesses arquivos o `include: [` abre numa linha e o
`{ model: CorporateClientModel ... }` vem na seguinte — o detector não alcança.
Verificado empiricamente nesta auditoria com o `GetBillController`: removendo o `attributes`
de um include multilinha, o `qa_checks.sh` continua sem apontar nada.

**Regra violada:** LGPD art. 6º, III (minimização).

**Correção sugerida:** `attributes: ['id', 'razao_social', 'cnpj']` nos controllers de leitura;
manter a lista completa apenas nos geradores de PDF, que realmente usam o documento.
