# 30/09 a 08/10 — RNF-023: PDF de orçamento persistido (agente executor, trilha do Gabriel)

- **Branch:** `fix/rnf023-pdf-orcamento`
- **Delegação:** etapa D de `rodada2_gabriel_28set2026.md`, que é a etapa 0 de `rodada3_gabriel_04out2026.md`
- **Objetivo:** cumprir no código o RNF-023 — PDF de orçamento persistido em armazenamento de objeto
  e baixado só por URL assinada de até 5 minutos, como o de contrato

## O que foi feito

1. **CA-D.1 a CA-D.7** (30/09): coluna `pdf_url` em `event_quotes`; criação e edição geram e enviam
   o PDF em *best-effort*; só orçamento `SENT` é editável (allowlist, com lock na transação);
   download por URL assinada; `storeDocumentPdf` extraído (DRY com o contrato); isolamento de tenant.
   Primeiros testes de PDF da suíte (`tests/quote-pdf.test.js`).
2. **Quatro rodadas de `qa-redteam`** (`docs/qa/redteam_rnf023-pdf-orcamento_30set2026.md`). As três
   primeiras reprovaram, cada uma com um 🔴 diferente — e cada correção abriu o seguinte:

   | Rodada | 🔴 | Correção (decisão do Gabriel quando houve escolha) |
   |---|---|---|
   | 1ª | URL assinada com o host interno `minio:9000` — inalcançável pelo navegador. **O download de contrato nunca tinha funcionado** de ponta a ponta | Endpoint público via nginx (`MINIO_PUBLIC_ENDPOINT`) |
   | 2ª | A rota do nginx expunha a API S3 a quem tivesse a credencial root padrão — listagem do bucket de todos os hotéis | nginx só repassa GET de PDF por URL pré-assinada; usuário MinIO **só de leitura** assina as URLs |
   | 3ª | O setup do usuário de leitura era `initContainer` do backend: imagem sem *pull* derrubava o PMS inteiro | Setup como contêiner lateral no pod do MinIO; nginx confere quem assinou e a validade |
   | 4ª | — (APROVADO COM RESSALVAS) | Parâmetro repetido contornava a checagem — **confirmado** e fechado; setup com log e SIGTERM |

3. **Verificação real em dois ambientes.** `scripts/verificar_download_pdf.sh` (24 casos) passa no
   compose; no minikube passou 16/16 antes dos casos novos. O minikube achou dois defeitos que o
   compose não mostraria: OOM do `mc` no contêiner de setup (corrigido) e o nginx que não recarrega
   o ConfigMap (pré-existente, documentado).
4. **`qa_checks.sh` regra 10:** erro se as duas cópias da configuração do nginx divergirem — são a
   única barreira entre a internet e o MinIO.
5. **Doc 03 (Sirlande):** seis trechos da v1.2 ficam desatualizados com o RNF-023 no código — texto
   sugerido em `docs/sugestoes-documentos-oficiais/03-dfd/MOTIVOS.md`.

## Lições

- **Afirmação de segurança só depois de reproduzir.** A 🟡-23 era "suspeita forte" lida de
  memória; reproduzida, deu 200. O caso do `HEAD` era o contrário: parecia falha e era o MinIO
  fazendo o certo (o método faz parte da assinatura).
- **Testar contra o ambiente onde o defeito mora.** Três dos problemas só existiam no k8s ou no
  caminho navegador → nginx → MinIO, que os testes unitários não atravessam.
- **Bind mount de arquivo único não vê `sed -i`** (inode novo): uma rodada da bateria testou a
  configuração antiga. Recriar o contêiner antes de testar.

## Pendências

| # | Pendência | Prioridade | Dono |
|---|---|---|---|
| 1 | `quay.io/minio/minio` responde 401 sem login — compose e k8s não sobem o MinIO numa máquina limpa. Validado com imagem em cache | 🔴 | Weslley |
| 2 | Senhas do MinIO (root e leitura) versionadas no `secret.yaml` (política acadêmica). Resíduo: quem tem o repositório e a chave exata de um PDF (dois UUIDs) lê por 5 min por assinatura | 🟡 | Weslley |
| 3 | nginx não recarrega o ConfigMap — todo deploy que muda `nginx.yaml` precisa de `rollout restart deploy/nginx` (documentado no `KUBERNETES.md`) | 🟡 | Weslley |
| 4 | Confirmar e cancelar orçamento leem o status sem lock — corrida pode trazer um cancelado de volta a `CONFIRMED` (pré-existente) | 🟡 | — |
| 5 | Total do orçamento calculado com os serviços **antigos** ao editar serviços (pré-existente; agora o PDF congela o erro) | 🟡 | `fix/` separado |
| 6 | LGPD: PDF fica no bucket após o *soft delete* do orçamento ou do contrato | 🟡 | T-06.11 |
| 7 | Contrato e orçamento geram sob demanda quando `pdf_url` é nulo — diverge do "apenas por URL assinada" | 🟢 | Gabriel decide |
| 8 | Setup só acrescenta política ao leitor, nunca remove; lock do Update sem teste de concorrência | 🟢 | — |
| 9 | B2B fora do Swagger e do cliente tipado | 🟢 | — |
| 10 | NetworkPolicy não validada (a CNI padrão do minikube não as aplica) | 🟢 | Weslley |

**Próxima etapa:** rodada 3, etapa F — P-1 a P-4 (quarto extra vendido duas vezes, cancelamento de
contrato com hóspede hospedado, papéis em contrato, total de reserva com vários quartos).
