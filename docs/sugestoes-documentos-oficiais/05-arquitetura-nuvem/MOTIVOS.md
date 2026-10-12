# Motivos — Doc 05 v1.1 (sugestão)

**Documento oficial:** `Projetos/gesway/05-arquitetura-nuvem.md` — v1.0 do Weslley, no PR #6 do fork (commit `c31f7c5`), ainda **não entregue**.
**Dono:** Weslley. Ele decide o que aplicar.
**Parecer completo:** `docs/delegacoes/parecer_docs05_06_para_weslley_10out2026.md`.

Para ver o que muda:

```bash
diff --strip-trailing-cr <fork>/Projetos/gesway/05-arquitetura-nuvem.md \
     docs/sugestoes-documentos-oficiais/05-arquitetura-nuvem/versao-sugerida_v1.1.md
```

---

## O que muda e por quê

| # | Mudança | Por quê | Se não mudar |
|---|---|---|---|
| 1 | ECR vai para o `bootstrap/` (permanente), com *lifecycle* de 2 imagens; o CI faz só *build* e *push*, e o *deploy* passa ao passo 3 do ciclo (§3.7, §5.1) | Na v1.0 o ECR estava no módulo `storage`, que o `destroy` apaga, e o CI fazia *deploy* num cluster que só existe durante a sessão e cuja porta 6443 só aceita o IP da equipe (§4.2) | O primeiro *push* do CI falha com a infra desligada, e as imagens somem a cada sessão |
| 2 | Nova §4.3: HTTPS com nome sslip.io derivado do Elastic IP e certificado Let's Encrypt; sem Route 53 | A v1.0 abria a 443 sem fonte de certificado: sem ALB não há ACM, e não há domínio. O nginx da `develop` só escuta a 80 (`infra/k8s/nginx.yaml:21`). O *webhook* do PSP precisa de URL pública, e provavelmente HTTPS | A porta 443 fica declarada sem funcionar, e o *webhook* real pode não ser aceito |
| 3 | k3s sem Traefik, *swapfile* de 1 GB e regra explícita para pod em `Pending` (§2, §3.1, §5.1) | A documentação do k3s recomenda 2 GB para o *server*, e o nó tem 1 GiB. O Traefik, instalado por padrão, disputa a porta 80 com o nginx e consome memória | Pods em `Pending` no primeiro `apply`, com a tentação de "resolver" subindo a instância, o que viola a regra de free-tier |
| 4 | Instância "micro": `t2.micro` ou `t3.micro` conforme o modelo de free-tier da conta, com regra de decisão (§6) | No free-tier anterior a 15/07/2025, a instância elegível em `sa-east-1` é a `t2.micro`; a `t3.micro` só entra onde não há `t2.micro`. No modelo novo, de créditos, a `t3.micro` é elegível. A v1.0 apresentava as 750 h como fato | Risco de cobrança se a conta for do modelo anterior |
| 5 | RDS com `skip_final_snapshot = true` e `backup_retention_period = 0`; bucket de PDFs com `force_destroy = true`; dados declarados efêmeros (§3.2, §3.5) | Sem isso, o `destroy` falha no bucket não vazio ou deixa *snapshot* cobrado | `destroy` incompleto, recurso esquecido e cobrança |
| 6 | Ajuste de código necessário para trocar o MinIO pelo S3 (§3.5) | A v1.0 dizia que era "só configuração". O cliente em `services/core-service/database/connections/minio.js` fixa a região em `us-east-1`, exige credencial estática e assina a URL com o endereço do nginx e um usuário leitor do MinIO | A troca quebra no primeiro *upload* ou *download* na nuvem |
| 7 | Rotas internas do core (ADR-003) e `X-Internal-Token` (ADR-006) na tabela de decisões, no nginx e na §4.1 | A ADR-003 define rotas internas não publicadas pelo *gateway*; a v1.0 não as citava | O documento fica incoerente com as ADRs |
| 8 | "Decisões registradas no Documento 07" passa a "serão registradas" | No Doc 07 da `main` do fork, ADR-004 e ADR-005 ainda são o texto do modelo (ECS Fargate de exemplo) | O professor cruza o Doc 05 com um Doc 07 que não tem as decisões citadas |
| 9 | IPv4 público: até 240 h, e não 120 h (§6) | São dois nós com IP público | Só correção de número; continua dentro das 750 h |

## O que não muda

- A decisão central da v1.0: dois nós de 1 GiB, k3s, sem EKS, sem NAT Gateway e sem ALB.
- RDS com três *databases* em subnet privada; S3 no lugar do MinIO; Redis fora.
- Estrutura do template e ordem das seções. A única seção nova é a §4.3.

## Pendências fora deste documento

- **Weslley:** escrever ADR-004 e ADR-005 no Doc 07 antes da entrega dos Docs 05 e 06.
- **Código (T-02.x):** o ajuste do cliente S3 (mudança 6) e o *user-data* do k3s (mudança 3) entram na implementação do Terraform.
- **Antes do primeiro `terraform apply`:** conferir em **Billing → Free Tier**, com usuário IAM, o modelo da conta e o tipo de instância elegível (mudança 4).
