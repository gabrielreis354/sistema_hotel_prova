# Documento 06 — C4 Model: motivos e o que conferir

**Versão sugerida:** `versao-sugerida_v1.0.md` · **Dono:** Weslley Lucas · **Data:** 07/10/2026
**Base:** `INSUMOS.md` desta pasta, de 28/09, conferido contra a `develop` em 07/10

## Decisões tomadas no rascunho

| Decisão | Por quê |
|---|---|
| Sem "Auth Service", sem cache, nginx descrito como proxy e não como API Gateway | ADR-006: o core é o único emissor de token. O Redis não é chamado por nenhum código (INSUMOS §2) |
| "Operador do Hotel" do DFD dividido em Recepcionista, Administrador e Garçom no Nível 1 | Cada papel usa o produto de um jeito diferente (INSUMOS §1). O Nível 2 volta a agrupar como "Equipe do hotel" para o diagrama não estourar |
| Hóspede chega ao nginx direto, sem frontend | `frontend/apps/booking` está vazio e é pós-TCC (`frontend/apps/booking/README.md`) |
| ViaCEP sai do `b2b-service`, não do core | ADR-003: o endereço alimenta `CORPORATE_CLIENTS`. Doc 02 v1.4 sugerida (RF-045) |
| D-001 a D-003 como databases lógicos, sem dizer se ficam numa instância | A quantidade de instâncias depende do free-tier e é assunto do Doc 05 (INSUMOS do 05, §3.2) |
| Porta dos serviços novos como "a definir" | Nenhuma especificação fixa a porta do `b2b-service` nem do `analytics-service` |
| Prometheus 3.1 e Grafana 11.4 na tabela de tecnologias | Versões fixadas na branch `feature/metrics` (T-02.4). **Se a branch não for mergeada, volte para "—"** |

## Conferir antes de transcrever

- [ ] **Nomes contra o Doc 03 v1.2.** O rascunho foi alinhado à v1.1 sugerida, a única versão disponível offline nesta sessão. A v1.2 está no PR #15 do repositório do professor. Confira entidades, D-001 a D-005 e os nomes dos serviços
- [ ] **Renderizar os 5 diagramas.** A sintaxe C4 do Mermaid é experimental e pode sobrepor rótulos (INSUMOS §6). Os diagramas **não foram renderizados nesta sessão**. Use o preview do GitHub no PR do fork e, se necessário, `UpdateRelStyle`
- [ ] Linha 8 da tabela de ADRs, sobre provedores atrás de interface: corresponde à T-03.3, que ainda não está escrita no Doc 07. Mantenha a linha ou remova até a ADR existir

---

## Versão sugerida v1.1 (12/10/2026)

**Arquivo:** `versao-sugerida_v1.1.md` · **Sugestão de:** Gabriel · **Dono continua:** Weslley, que decide o que aplicar
**Base:** a v1.0 oficial do PR #6 do fork (commit `c31f7c5`, 10/10), e **não** a `versao-sugerida_v1.0.md` acima, que o PR #6 superou
**Parecer completo:** `docs/delegacoes/parecer_docs05_06_para_weslley_10out2026.md`

A v1.0 do PR #6 já resolveu dois itens do checklist acima: os nomes batem com o Doc 03 v1.2, e os diagramas trocaram a sintaxe C4 nativa por Mermaid `graph`, sem sobreposição de rótulos.

Para ver o que muda:

```bash
diff --strip-trailing-cr <fork>/Projetos/gesway/06-c4-model.md \
     docs/sugestoes-documentos-oficiais/06-c4/versao-sugerida_v1.1.md
```

| # | Mudança | Por quê | Se não mudar |
|---|---|---|---|
| 1 | §1 passa a registrar **duas** diferenças com o Doc 03: os papéis do operador e o PDF de orçamento no D-005 | A v1.0 dizia que a única diferença era a dos papéis. O Doc 03 v1.2 (entregue, PR #15 do professor) diz que o PDF de orçamento não é armazenado; o Doc 06, o Doc 02 (RNF-023) e o código (PR #92) dizem que é. O próprio Doc 03 registra a divergência na nota de rastreabilidade | O professor encontra a divergência depois de o documento afirmar que ela não existe |
| 2 | Novo componente **"Rotas internas"** no Nível 3 do core, com `X-Internal-Token` e idempotência por `contract_id`; o rótulo `b2b → core` cita a rota interna nos Níveis 2 e 3 | A ADR-003 define rotas internas não publicadas pelo *gateway*; a ADR-006 as protege com o `X-Internal-Token`. Na v1.0, o b2b entrava direto em "Hospedagem e Reservas" | O diagrama mostra uma fronteira de segurança diferente da decidida |
| 3 | Nível 3 do core: *webhook* do PSP chega a "Pagamentos e PIX"; "Pagamentos", "Autenticação" e "Consumo" ligados ao D-001; "Pagamentos" grava evento no *outbox* | Na v1.0 esses componentes ficavam sem relação de entrada ou com o banco. O catálogo de eventos (SPEC-01, anexo) prevê `payment.status_changed` | Componentes soltos, e um evento previsto sem origem no diagrama |
| 4 | Nível 2: seta `app-pms → D-005` ("Baixa PDF por URL assinada") | O Doc 03 tem o fluxo de URL assinada até o operador | Fluxo do DFD sem correspondente no C4 |
| 5 | §5 com as alternativas preenchidas nas linhas 1, 2, 5 e 6; linha 3 troca "monólito modular" pelas alternativas reais da ADR-003 | O template pede alternativas. "Monólito modular" não consta da ADR-003, que lista recorte por tipo de dado, banco compartilhado, réplica de leitura, Redis Streams, SQS e gRPC | Resumo de ADR sem alternativa, ou com alternativa que a ADR não avaliou |
| 6 | "ADR" como sigla de diária média passa a "diária média" (§4.3) | O documento também usa ADR para decisão arquitetural | Ambiguidade de leitura |
| 7 | nginx: "termina o TLS", porta 80/443 remetendo ao Doc 05 §4.3 | Coerência com a correção do Doc 05 sobre HTTPS | A porta 443 continua declarada sem explicação |
| 8 | "Decisões registradas no Documento 07" passa a "serão registradas" | ADR-001, 002, 004 e 005 ainda são o texto do modelo no Doc 07 da `main` do fork | O professor cruza com um Doc 07 que não tem as decisões citadas |

**Atenção à mudança 5.** As alternativas das linhas 1, 2, 5 e 6 são **propostas**. Quando o Weslley escrever ADR-001, 002, 004 e 005 no Doc 07, a §5 precisa listar exatamente as mesmas alternativas dessas ADRs.

**O que não muda:** os três níveis, os três diagramas de componentes, a notação em Mermaid `graph` com as cores do C4, os nomes alinhados ao Doc 03 e a ausência de Auth Service, API Gateway e cache.

**Pendências fora deste documento:**

- **Sirlande:** corrigir a §7 (D-005) do Doc 03 para incluir o PDF de orçamento — ver `../03-dfd/MOTIVOS.md`. Doc já entregue: só muda após nova reunião com o professor.
- **Weslley:** escrever as ADRs citadas no Doc 07.
- **Renderização:** conferir os cinco diagramas no preview do GitHub depois de aplicar.
