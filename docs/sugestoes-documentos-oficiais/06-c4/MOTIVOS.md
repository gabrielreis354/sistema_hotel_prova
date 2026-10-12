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
