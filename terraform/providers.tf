terraform {
  # use_lockfile (lock nativo no S3, sem DynamoDB) exige 1.10+.
  required_version = ">= 1.10"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }

  # Configuração parcial: bucket, key e região vêm de
  # environments/dev/backend.hcl (terraform init -backend-config=...).
  backend "s3" {}
}

provider "aws" {
  region = var.region
  default_tags {
    tags = {
      Project   = "gesway"
      ManagedBy = "terraform"
      Lifecycle = "efemero" # destruir ao fim de cada sessão
    }
  }
}
