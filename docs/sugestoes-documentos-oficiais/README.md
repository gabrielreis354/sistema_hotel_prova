# Sugestões para os documentos oficiais

Os documentos oficiais do Gesway ficam no repositório da UniFAAT, em
`UniFAAT-projeto-experimental-2027-1/Projetos/gesway/`. **Esta pasta não os substitui.**

Ela guarda o que alguém do time — ou um agente — acha que **deveria** mudar num documento
oficial, sem mexer nele. Cada documento oficial tem dono, e alguns já foram entregues ao
professor: mudar o arquivo diretamente passaria por cima do dono ou quebraria uma entrega.

---

## A regra

1. **O documento oficial não é editado.** A sugestão vive aqui.
2. **Toda sugestão vem com seus motivos**, num `MOTIVOS.md` ao lado: o que muda, por quê, com
   qual evidência do código, e o que acontece se não mudar.
3. **Quem decide é o dono do documento.** Documento já entregue só muda depois de nova reunião
   com o professor.
4. Quando a sugestão for aplicada ou recusada, **registre aqui** — a pasta não é arquivo morto.

---

## Estrutura

```
sugestoes-documentos-oficiais/
  <nn>-<documento>/
    versao-sugerida_v<x.y>.md   ← o documento inteiro, como ficaria
    MOTIVOS.md                  ← por que mudar, com evidência
    INSUMOS.md                  ← quando o dono ainda vai produzir o documento
```

**As evidências de código** citadas nos motivos e nos insumos valem para a branch **`develop`**
do repositório do hotel. A `main` ainda está na versão de julho.

Para ver exatamente o que muda, compare a versão sugerida com a oficial. O `--strip-trailing-cr`
é necessário: no Windows o repositório da UniFAAT é extraído com fim de linha CRLF, e sem a opção
o `diff` aponta o arquivo inteiro como diferente.

```bash
diff --strip-trailing-cr <UniFAAT>/Projetos/gesway/02-requisitos-funcionais-nao-funcionais.md \
     docs/sugestoes-documentos-oficiais/02-requisitos/versao-sugerida_v1.4.md
```

---

## Situação

| Documento | Dono | Versão oficial | O que há aqui | Próximo passo |
|---|---|---|---|---|
| **01** — Solicitação do sistema | **Gabriel** | Entregue (PR #3) | — | — |
| **02** — Requisitos | **Gabriel** | **v1.3 — entregue ao professor** | Versão sugerida v1.4 + motivos — **em revisão**. Em 28/09: RF-045 realinhado para `b2b-service`; RNF-023 mantido, e o código passa a cumpri-lo | Conferir a cobertura integral dos critérios de aceite; só com certeza absoluta, reunião com o professor |
| **03** — DFD | **Sirlande** | **v1.2 — em entrega**: PR #15 no repositório do professor, `[Gesway] - Entrega 4`, aberto | Insumos + versão sugerida v1.1 (aplicada e superada pela v1.2) + motivos | Sirlande decide o `PRODUCTS` 🔷 enquanto o PR está aberto (ver `03-dfd/MOTIVOS.md`). Depois do RNF-023 no código, a §7 (D-005) fica desatualizada quanto ao PDF de orçamento |
| **04** — MER | **Sirlande** | Entregue (PR #3) — cabeçalho v1.0, histórico até v1.1. **Marca `PRODUCTS` como 🔷, mas ele está implementado** | Versão sugerida v1.2 + motivos — corrige o `PRODUCTS` para ✅ | Sirlande avalia; aplicar significa nova entrega ao professor |
| **05** — Arquitetura em nuvem | **Weslley** | Template em branco | Insumos (28/09) — partem da decisão dele de 16/09: AWS, k3s em EC2 | **Resolver antes de escrever** o conflito da fase `t3.small` com a regra absoluta de free-tier (`05-arquitetura-nuvem/INSUMOS.md` §1) |
| **06** — C4 Model | **Weslley** | Template em branco | Insumos (28/09) + **versão sugerida v1.0 (07/10)** + motivos | Conferir os nomes contra o Doc 03 v1.2 e **renderizar os diagramas** antes de transcrever (`06-c4/MOTIVOS.md`) |
| **07** — ADR | **Weslley** (ADR-003 redigida pelo Gabriel) | ADR-003 registrado diretamente, **só no fork** | Proposta de **ADR-006** (propagação de identidade entre serviços, T-01.3) + motivos — **aprovada pelo Gabriel em 24/09 e implementada no core** (PR #84 do repositório do hotel) | Weslley formaliza a ADR-006 no documento oficial. Entrega em **ordem numérica**, no encontro do Doc 07. A tabela da ADR-003 está **correta** quanto ao `PRODUCTS` — não alterar |
| **08** — Planejamento de sprints | **Weslley** | Template em branco — o Doc 02 v1.3 já o cita como registro de execução | **Versão sugerida v1.0 (07/10)** + motivos — plano S1–S10 e registro de execução S1–S5 | Conferir com Gabriel e Sirlande o que o repositório não mostra (`08-sprints/MOTIVOS.md`), depois transcrever |

---

## Origem das sugestões atuais

Todas decorrem da **T-01.1 da SPEC-01** e do **ADR-003**, de 14/09/2026: o recorte do monólito
em `core-service`, `b2b-service` e `analytics-service`, com eventos via RabbitMQ do core para o
analytics. Ver `docs/specs/SPEC-01-microsservicos.md`.

> **Critério C9 — os 8 documentos precisam estar *"válidos e atualizados"*.** A regra tem dois
> níveis, definidos em 21/09/2026:
>
> 1. **Documento normativo não leva status de implementação.** Requisitos (Doc 02) e fluxo de
>    dados (Doc 03) declaram como o sistema **deve** funcionar — é contra eles que o projeto
>    será cobrado. Marcar o que já existe transformaria a norma em relato datado, e o documento
>    envelheceria a cada commit. O acompanhamento de execução é do **Doc 08**.
> 2. **Entidade de dados leva status.** No MER (Doc 04) o status é atributo da própria entidade,
>    e a legenda ✅ implementada / 🔷 planejada / ⚠️ em transição foi aceita pelo professor no
>    PR #3. Os outros documentos apenas **citam** essa legenda ao listar entidades.
>
> Em qualquer nível, só entra como planejado o que consta do plano de implementação da SPEC-01.
> Notificação ao hóspede e channel manager não entram: estão fora do escopo.
