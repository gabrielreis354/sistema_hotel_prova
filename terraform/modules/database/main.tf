# RDS PostgreSQL 17 do Documento 05 §3.2: db.t3.micro, Single-AZ, subnet
# privada, SSL obrigatório, sem backup e sem snapshot final (dados efêmeros,
# recriados por migrate e seed a cada sessão).
# Os databases e usuários por serviço (gesway_core, gesway_analytics,
# gesway_b2b) são criados no passo 4 do ciclo, de dentro do cluster: o
# Terraform roda fora da VPC e não alcança o RDS.

resource "random_password" "master" {
  length  = 32
  special = false # evita escapar caractere em URL de conexão
}

resource "aws_db_subnet_group" "this" {
  name       = "${var.name}-db"
  subnet_ids = var.subnet_ids
  tags       = { Name = "${var.name}-db" }
}

resource "aws_db_parameter_group" "this" {
  name   = "${var.name}-pg17"
  family = "postgres17"

  parameter {
    name  = "rds.force_ssl"
    value = "1"
  }
}

resource "aws_db_instance" "this" {
  identifier     = "${var.name}-pg"
  engine         = "postgres"
  engine_version = var.engine_version
  instance_class = var.instance_class

  allocated_storage = 20
  storage_type      = "gp2"
  storage_encrypted = true

  db_name  = "gesway_admin"
  username = "gesway_admin"
  password = random_password.master.result

  db_subnet_group_name   = aws_db_subnet_group.this.name
  parameter_group_name   = aws_db_parameter_group.this.name
  vpc_security_group_ids = [var.security_group_id]
  availability_zone      = var.availability_zone
  multi_az               = false
  publicly_accessible    = false

  backup_retention_period  = 0
  skip_final_snapshot      = true
  delete_automated_backups = true
  deletion_protection      = false
  apply_immediately        = true

  performance_insights_enabled = false
  monitoring_interval          = 0
}
