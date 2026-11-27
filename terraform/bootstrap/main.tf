# Bootstrap: criado UMA vez, fora do ciclo efêmero (ADR-004, Documento 05 §5).
# Guarda o que precisa sobreviver entre sessões: o state do Terraform, os
# repositórios ECR, a role do CI e o alerta de custo.
# O state deste diretório é local (terraform.tfstate aqui dentro, fora do Git).

terraform {
  required_version = ">= 1.10"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.region
  default_tags {
    tags = {
      Project   = "gesway"
      ManagedBy = "terraform"
      Lifecycle = "permanente"
    }
  }
}

data "aws_caller_identity" "atual" {}

# --- State do Terraform ------------------------------------------------------

resource "aws_s3_bucket" "tfstate" {
  bucket = var.state_bucket_name
}

resource "aws_s3_bucket_versioning" "tfstate" {
  bucket = aws_s3_bucket.tfstate.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "tfstate" {
  bucket = aws_s3_bucket.tfstate.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "tfstate" {
  bucket                  = aws_s3_bucket.tfstate.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Só aceita acesso por TLS: o state guarda a senha do RDS.
resource "aws_s3_bucket_policy" "tfstate_tls" {
  bucket = aws_s3_bucket.tfstate.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "SoTLS"
      Effect    = "Deny"
      Principal = "*"
      Action    = "s3:*"
      Resource  = [aws_s3_bucket.tfstate.arn, "${aws_s3_bucket.tfstate.arn}/*"]
      Condition = { Bool = { "aws:SecureTransport" = "false" } }
    }]
  })
}

# Versões antigas do state somem em 30 dias, para não acumular armazenamento.
resource "aws_s3_bucket_lifecycle_configuration" "tfstate" {
  bucket = aws_s3_bucket.tfstate.id
  rule {
    id     = "expira-versoes-antigas"
    status = "Enabled"
    filter {}
    noncurrent_version_expiration {
      noncurrent_days = 30
    }
  }
}

# --- ECR: um repositório por serviço -----------------------------------------

resource "aws_ecr_repository" "servico" {
  for_each             = toset(var.services)
  name                 = "gesway/${each.key}"
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }
}

# Guarda só as 2 últimas imagens, para ficar abaixo dos 500 MB gratuitos.
resource "aws_ecr_lifecycle_policy" "servico" {
  for_each   = aws_ecr_repository.servico
  repository = each.value.name
  # Conta só imagens com tag: manifest sem tag (provenance, camada órfã) sai
  # depois de 1 dia, sem levar junto uma imagem que ainda o referencia.
  policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Remove sem tag apos 1 dia"
        selection = {
          tagStatus   = "untagged"
          countType   = "sinceImagePushed"
          countUnit   = "days"
          countNumber = 1
        }
        action = { type = "expire" }
      },
      {
        rulePriority = 2
        description  = "Mantem so as 2 ultimas imagens com tag"
        selection = {
          tagStatus      = "tagged"
          tagPatternList = ["*"]
          countType      = "imageCountMoreThan"
          countNumber    = 2
        }
        action = { type = "expire" }
      },
    ]
  })
}

# --- CI: GitHub Actions empurra imagem no ECR por OIDC, sem chave guardada ----

resource "aws_iam_openid_connect_provider" "github" {
  url             = "https://token.actions.githubusercontent.com"
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = ["6938fd4d98bab03faadb97b34396831e3780aea1"]
}

resource "aws_iam_role" "ci_ecr_push" {
  name = "gesway-ci-ecr-push"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Federated = aws_iam_openid_connect_provider.github.arn }
      Action    = "sts:AssumeRoleWithWebIdentity"
      Condition = {
        StringEquals = {
          "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
        }
        # Só as branches que publicam imagem; PR de fork não assume a role.
        StringLike = {
          "token.actions.githubusercontent.com:sub" = [
            for b in var.ci_branches : "repo:${var.github_repo}:ref:refs/heads/${b}"
          ]
        }
      }
    }]
  })
}

resource "aws_iam_role_policy" "ci_ecr_push" {
  name = "ecr-push"
  role = aws_iam_role.ci_ecr_push.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = "ecr:GetAuthorizationToken"
        Resource = "*"
      },
      {
        Effect = "Allow"
        Action = [
          "ecr:BatchCheckLayerAvailability",
          "ecr:InitiateLayerUpload",
          "ecr:UploadLayerPart",
          "ecr:CompleteLayerUpload",
          "ecr:PutImage",
          "ecr:BatchGetImage",
        ]
        Resource = [for r in aws_ecr_repository.servico : r.arn]
      },
    ]
  })
}

# --- Alerta de custo ----------------------------------------------------------
# No plano de créditos todo uso conta como custo antes do crédito: uma sessão de
# 4 h fica perto de US$ 0,35 (ADR-004). O alerta diário só dispara com algo
# esquecido ligado (o nó sozinho passa de US$ 1 em um dia); o mensal, se o uso
# sair muito do previsto (~US$ 28 em 6 meses).

resource "aws_budgets_budget" "diario" {
  name         = "gesway-alerta-diario"
  budget_type  = "COST"
  limit_amount = var.budget_daily_usd
  limit_unit   = "USD"
  time_unit    = "DAILY"

  cost_types {
    include_credit = false
    include_refund = false
  }

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 100
    threshold_type             = "PERCENTAGE"
    notification_type          = "ACTUAL"
    subscriber_email_addresses = var.budget_emails
  }
}

resource "aws_budgets_budget" "mensal" {
  name         = "gesway-alerta-mensal"
  budget_type  = "COST"
  limit_amount = var.budget_monthly_usd
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  cost_types {
    include_credit = false
    include_refund = false
  }

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 100
    threshold_type             = "PERCENTAGE"
    notification_type          = "ACTUAL"
    subscriber_email_addresses = var.budget_emails
  }
}
