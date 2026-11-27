# Ambiente efêmero do Gesway na AWS (ADR-004, Documento 05).
# terraform apply no início da sessão, terraform destroy no fim, na mesma hora.
# O que é permanente (state, ECR, role do CI, alerta de custo) está em bootstrap/.

data "aws_caller_identity" "atual" {}

locals {
  ecr_registry = "${data.aws_caller_identity.atual.account_id}.dkr.ecr.${var.region}.amazonaws.com"
}

module "networking" {
  source     = "./modules/networking"
  name       = var.name
  team_cidrs = var.team_cidrs
}

module "storage" {
  source = "./modules/storage"
  name   = var.name
}

module "iam" {
  source         = "./modules/iam"
  name           = var.name
  pdf_bucket_arn = module.storage.bucket_arn
}

module "compute" {
  source                = "./modules/compute"
  name                  = var.name
  region                = var.region
  instance_type         = var.instance_type
  subnet_id             = module.networking.public_subnet_id
  security_group_id     = module.networking.node_sg_id
  instance_profile_name = module.iam.instance_profile_name
  key_name              = var.key_name
  root_volume_gb        = var.root_volume_gb
  k3s_version           = var.k3s_version
  ecr_registry          = local.ecr_registry
}

module "database" {
  source            = "./modules/database"
  name              = var.name
  subnet_ids        = module.networking.data_subnet_ids
  security_group_id = module.networking.db_sg_id
  availability_zone = module.networking.public_az
}
