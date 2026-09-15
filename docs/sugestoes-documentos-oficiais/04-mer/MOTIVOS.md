# Documento 04 — Motivos da versão sugerida v1.2

**Documento oficial:** `Projetos/gesway/04-modelo-entidade-relacionamento.md` — cabeçalho v1.0, histórico até v1.1
**Dono:** **Sirlande Martins**
**Versão sugerida:** `versao-sugerida_v1.2.md`, nesta pasta
**Data:** 14/09/2026 · **Proposta por:** Gabriel Reis Cunha
**Situação:** ⏳ aguardando avaliação do Sirlande — o documento **não** foi alterado

---

## Em uma frase

A seção 7 ainda é *"preliminar"* e descreve um `billing-service` que não vai existir, e dois
status da v1.1 foram registrados a partir de uma **cópia desatualizada** do repositório.

---

## O que muda

| # | Onde | No documento oficial | Na v1.2 sugerida | Evidência |
|---|---|---|---|---|
| 1 | **Seção 7** — microsserviços | Preliminar, com `billing-service` e alternativas em aberto | Consolidada conforme o ADR-003: `core-service`, `b2b-service`, `analytics-service` com banco próprio alimentado por eventos | ADR-003, Documento 07 |
| 2 | **`PRODUCTS`** — §1, índice §1.3 e §4.10 | 🔷 Planejado, *"sem Model nem tabela"* | ✅ Implementado | `app/Models/ProductModel.js` · `db/schema.sql` (tabela `products`) · `tests/products.test.js` · `routes/apis/productRouter.js` |
| 3 | **`USERS.role`** — §4.2 | `CHECK IN ('ADMIN','RECEPTIONIST')`, `WAITER` planejado | `CHECK IN ('ADMIN','RECEPTIONIST','WAITER')` | `db/schema.sql:49` · `app/utils/roles.js:5` |
| 4 | Contagem de entidades — §1 e §8 | 14 implementadas / 3 planejadas | 15 implementadas / 2 planejadas | Consequência do item 2 |
| 5 | Cabeçalho | Versão **1.0** — mas o histórico já registra a 1.1 | Versão **1.2** | O próprio documento |
| 6 | §8 — política de versões | Seção 7 *"prevista como v1.1"* | *"consolidada na v1.2"* | A v1.1 já foi usada em 28/08 |
| 7 | §2 — justificativa do banco, linha *Escalabilidade* | *"horizontal via réplicas de leitura para a carga analítica"* | Carga analítica isolada no banco próprio do `analytics-service`, alimentado por eventos | ADR-003 — o analytics não lê o banco do núcleo |

Todas as evidências valem para a branch **`develop`** do repositório do hotel. A `main` ainda está
na versão de julho e não tem o catálogo de produtos.

Conferi os atributos de `PRODUCTS` campo a campo contra `db/schema.sql` e o model — batem com a
tabela da §4.10. A promoção a ✅ não exige mudar nenhum atributo.

---

## Por que a v1.1 errou em `PRODUCTS` e `WAITER`

O histórico da v1.1 diz que a verificação foi feita contra `sistema_hotel_prova`. Aquela cópia
estava parada em 23/08, antes de o catálogo de produtos ser integrado. O repositório atual tem
model, tabela, rotas e testes.

O `WAITER` é outro caso: ele **já estava** no `CHECK` do banco inclusive naquela cópia. Foi erro
de leitura, não de defasagem.

Hoje o MER contradiz o **Documento 02**, que já registra `WAITER` e o catálogo de produtos como
existentes. O professor recebe os dois.

---

## O que a versão sugerida **não** resolve — cabe a você modelar

A adoção de eventos cria estruturas novas que o MER ainda não descreve. Deixei de fora de
propósito: são decisões de modelagem, e o documento é seu.

| Estrutura | Banco | Para quê | Questão em aberto |
|---|---|---|---|
| **Outbox de eventos** | core | Guardar cada evento na mesma transação da alteração, até ser publicado | Entra como entidade 🔷 do core ou como nota técnica da seção 7? |
| **Projeções de leitura** | analytics | Cópias mínimas de hotel, categoria, quarto, hóspede, reserva e pagamento, usadas pelos 7 indicadores | O MER passa a ter uma seção para o banco do analytics? |
| **Eventos processados** | analytics | Registrar eventos já consumidos, para não contar em dobro | Mesma questão acima |

Duas restrições que a modelagem precisa respeitar, já decididas no ADR-003:

- **A projeção de hóspede guarda só id, `tenant_id` e nome** — minimização de dado pessoal (LGPD).
- **Toda projeção carrega `tenant_id`**, e nenhuma tem chave estrangeira para o banco do core.

A lista completa de eventos e o que cada indicador consome está na SPEC-01, §5.

---

## O que acontece se não mudar

- A seção 7 continuará *"preliminar"* depois de a decisão existir — o C9 pede documento atualizado.
- O MER seguirá dizendo que `PRODUCTS` não existe, com o sistema em uso.
- Documentos 02 e 04 continuarão se contradizendo diante do professor.

---

## Como revisar

```bash
diff --strip-trailing-cr "<UniFAAT>/Projetos/gesway/04-modelo-entidade-relacionamento.md" \
     "docs/sugestoes-documentos-oficiais/04-mer/versao-sugerida_v1.2.md"
```

Decisão de origem: **ADR-003**, Documento 07 · **SPEC-01**, `docs/specs/SPEC-01-microsservicos.md`
