# Briefing — Documentos 03 (DFD) e 04 (MER)

**Para:** Sirlande Martins · **De:** Gabriel Reis Cunha · **Data:** 14/09/2026
**Em paralelo com:** SPEC-04, T-04.1 (`Account` + `AccountItem`)

---

## O que mudou e por que isso chega em você agora

O Gesway deixou de ser planejado como monólito com um `billing-service`. A decisão está no
**ADR-003**:

- **`core-service`** — a operação do hotel: reservas, hospedagem, pagamentos, PIX, consumo,
  produtos e a futura comanda
- **`b2b-service`** — clientes corporativos, orçamentos e contratos
- **`analytics-service`** — indicadores, com **banco próprio**, alimentado por **eventos do core
  via RabbitMQ**

O DFD e o MER são os documentos que descrevem como os dados circulam e onde ficam. Eles
dependiam dessa decisão, e agora ela existe.

**Importante para a sua trilha:** `accounts` e `account_items` ficam no **core**, com chave
estrangeira normal para reserva, quarto e hóspede. A T-04.1 não precisa esperar nada.

---

## Onde está tudo

| O quê | Onde |
|---|---|
| **ADR-003** — a decisão completa | Fork da UniFAAT, `main` → `Projetos/gesway/07-registro-decisoes-arquitetonicas-adr.md` |
| **Insumos do DFD** — entidades, processos, armazenamentos e fluxos, com o arquivo de origem de cada um | Hotel → `docs/sugestoes-documentos-oficiais/03-dfd/INSUMOS.md` |
| **MER v1.2 sugerida** + os motivos de cada mudança | Hotel → `docs/sugestoes-documentos-oficiais/04-mer/` |
| **Eventos publicados** e entidades por serviço | Hotel → `docs/specs/SPEC-01-microsservicos.md`, §5 |

---

## A regra dos diagramas

A mesma que o MER já usa e que o professor aceitou no PR #3: **cada elemento marcado como
✅ Implementado ou 🔷 Planejado.**

- Você pode desenhar **hoje** a arquitetura decidida, sem esperar a extração dos serviços
- Só entra como 🔷 o que tem tarefa na SPEC-01
- **Não entram:** notificação ao hóspede, channel manager, Redis, site público e painel `admin` — os
  insumos explicam cada um

---

## Por onde começar

1. **Ler o ADR-003** — é curto e responde "por que estes serviços?"
2. **DFD — Nível 0.** As entidades externas já existem hoje; é a parte mais segura para começar
3. **MER — avaliar a v1.2 sugerida item a item.** Os motivos listam 7 mudanças com a evidência de
   cada uma. Aceitar ou recusar é decisão sua
4. **DFD — Nível 1**, com a legenda
5. **Dicionários** de fluxos e de armazenamentos — os insumos já trazem as tabelas de referência

---

## O que é decisão sua

| Decisão | Onde está a informação |
|---|---|
| Aceitar ou recusar cada item da MER v1.2 | `04-mer/MOTIVOS.md` |
| Como modelar o *outbox* do core e as projeções do analytics — ou se entram no MER | `04-mer/MOTIVOS.md`, seção *"O que a versão sugerida não resolve"* |
| **Revisar a §2 do MER** — a justificativa do banco trata de **um** PostgreSQL com schema compartilhado, e agora são três bancos e um broker. É onde o professor verifica o **critério C3** | MER §2 · ADR-003 |
| Granularidade do Nível 1 e se o Nível 2 entra | Modelo oficial do DFD |

---

## Regras de entrega

- **O MER já foi entregue** (PR #3). Aplicar a v1.2 é **nova entrega**: antes de propor reunião
  com o professor, a revisão precisa estar conferida contra **todos** os critérios de aceite —
  seções 1 a 8 do Termo de Requisitos e C1 a C10 do Termo da banca. Reunião só com certeza
  absoluta.
- **Uma branch por documento** no fork — por exemplo `docs/03-dfd` e `docs/04-mer-v1.2` — e um PR a
  partir dela. As entregas anteriores saíram da `main` do fork; com dois documentos em paralelo,
  isso faria uma entrega arrastar a outra.
- **Combine comigo antes de abrir PR** para o repositório do professor.

---

## Se tiver dúvida sobre o que existe

Confira no código antes de marcar ✅ — é assim que o documento será avaliado.

**O código de referência é a branch `develop`** do repositório do hotel. A `main` ainda está na
versão de julho: não tem, por exemplo, o catálogo de produtos nem o frontend.

**E o backend mudou de lugar em 15/09:** saiu da raiz e foi para **`services/core-service/`**,
primeiro passo da divisão em serviços. Os manifests do Kubernetes foram para `infra/k8s/`. Os
insumos já estão com os caminhos novos.

```bash
cat services/core-service/routes/router.js                               # todas as rotas
ls services/core-service/routes/apis/                                    # módulos
grep -rlE "sequelize\.transaction" services/core-service/app/Controllers # transações entre tabelas
```

---

## Mensagem para enviar

> Sirlande, a decisão de arquitetura saiu: o sistema vai virar três serviços — core, b2b e
> analytics —, com o analytics recebendo eventos do core por RabbitMQ. Isso destrava o DFD e o
> MER, que são seus.
>
> Deixei tudo pronto para você começar hoje:
> - **ADR-003** na `main` do fork da UniFAAT (Documento 07)
> - **Insumos do DFD** e **sugestão de v1.2 do MER com os motivos** no repositório do hotel, em
>   `docs/sugestoes-documentos-oficiais/`
> - **Roteiro** em `docs/delegacoes/briefing_sirlande_docs_03_04_14set2026.md`
>
> Nos diagramas, usa a mesma legenda do MER (✅ implementado / 🔷 planejado), então dá pra desenhar
> a arquitetura nova já. O MER sugerido é sugestão: você decide item a item.
>
> Os documentos andam em paralelo com a T-04.1 — e `accounts` fica no core, com FK normal, então
> ela não depende de nada. Como o MER já foi entregue, qualquer revisão só vai para o professor
> depois de conferida contra todos os critérios de aceite. Qualquer dúvida, me chama.
