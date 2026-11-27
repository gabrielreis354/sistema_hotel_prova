# Terraform da AWS — 26/11/2026

**Dev:** Weslley (sessão orquestrada com Claude Code)
**Branch:** `feature/terraform-aws`

## O que foi feito

- Conferido que o repositório não tinha nenhum `.tf`, nem em outra branch.
- Criado `terraform/` seguindo a ADR-004 (revisão de 24/10: nó único `t3.small`) e o
  Documento 05 (rede, Security Groups, state no S3):
  - `bootstrap/`: bucket do state com versionamento, 3 repositórios ECR com *lifecycle* de
    2 imagens, role OIDC do GitHub Actions para push no ECR, AWS Budgets de US$ 1.
  - `modules/networking`, `compute`, `database`, `storage`, `iam` e o módulo raiz.
  - `README.md` com o ciclo de cada sessão (apply, k3s, bancos por serviço, manifests,
    webhook, destroy).
- `terraform fmt -check` e `terraform validate` verdes nos dois diretórios (Terraform
  1.16.0, provider aws 5.100.0, random 3.9.1). **Nenhum recurso foi criado na AWS.**

## Decisões

- Segui a ADR-004 de 24/10, não o Documento 05 v1.1, que ainda descreve dois nós
  `t3.micro`. O Documento 05 precisa da revisão v1.2 para bater com a ADR.
- CI por OIDC (ADR-004), não por usuário IAM com chave (Documento 05 §3.7).
- Backend S3 com configuração parcial (`environments/dev/backend.hcl`), para o nome do
  bucket poder mudar se `gesway-tfstate` já existir na AWS.

## Pendências (5º semestre)

- `minio.js` com região fixa `us-east-1` e credencial estática: ajustar para o S3.
- Overlay `aws` do kustomize em `infra/k8s/`.
- Workflow de push no ECR usando o `ci_role_arn`.
- Script ou Job para criar os databases e usuários por serviço no RDS.
- Primeiro `terraform apply` real: só com a conta do plano de créditos criada perto do
  início do 5º semestre (ADR-004).
