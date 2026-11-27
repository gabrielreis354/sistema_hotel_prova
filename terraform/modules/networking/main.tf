# Rede do Documento 05 §3.3 e §4: uma subnet pública para o nó do k3s e duas
# privadas para o RDS (o DB subnet group exige duas AZs). Sem NAT, sem ALB.

data "aws_availability_zones" "disponiveis" {
  state = "available"
}

locals {
  az_a = data.aws_availability_zones.disponiveis.names[0]
  az_b = data.aws_availability_zones.disponiveis.names[1]
}

resource "aws_vpc" "this" {
  cidr_block           = var.vpc_cidr
  enable_dns_support   = true
  enable_dns_hostnames = true
  tags                 = { Name = "${var.name}-vpc" }
}

resource "aws_internet_gateway" "this" {
  vpc_id = aws_vpc.this.id
  tags   = { Name = "${var.name}-igw" }
}

resource "aws_subnet" "publica" {
  vpc_id                  = aws_vpc.this.id
  cidr_block              = var.public_subnet_cidr
  availability_zone       = local.az_a
  map_public_ip_on_launch = false # o IP público vem do Elastic IP
  tags                    = { Name = "${var.name}-publica-a" }
}

resource "aws_subnet" "dados" {
  count             = 2
  vpc_id            = aws_vpc.this.id
  cidr_block        = var.data_subnet_cidrs[count.index]
  availability_zone = count.index == 0 ? local.az_a : local.az_b
  tags              = { Name = "${var.name}-dados-${count.index == 0 ? "a" : "b"}" }
}

resource "aws_route_table" "publica" {
  vpc_id = aws_vpc.this.id
  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.this.id
  }
  tags = { Name = "${var.name}-rt-publica" }
}

resource "aws_route_table_association" "publica" {
  subnet_id      = aws_subnet.publica.id
  route_table_id = aws_route_table.publica.id
}

# As subnets de dados ficam na tabela principal da VPC, que só tem a rota local:
# o RDS não sai para a internet.

# --- Security Groups (Documento 05 §4.2) --------------------------------------

resource "aws_security_group" "node" {
  name        = "${var.name}-sg-node"
  description = "No do k3s: 80/443 publicos, 22 e 6443 so da equipe"
  vpc_id      = aws_vpc.this.id
  tags        = { Name = "${var.name}-sg-node" }
}

resource "aws_vpc_security_group_ingress_rule" "http" {
  security_group_id = aws_security_group.node.id
  description       = "HTTP: desafio do Let's Encrypt e redirect para 443"
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "tcp"
  from_port         = 80
  to_port           = 80
}

resource "aws_vpc_security_group_ingress_rule" "https" {
  security_group_id = aws_security_group.node.id
  description       = "HTTPS: equipe, hospede e webhook do PSP"
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "tcp"
  from_port         = 443
  to_port           = 443
}

resource "aws_vpc_security_group_ingress_rule" "ssh" {
  for_each          = toset(var.team_cidrs)
  security_group_id = aws_security_group.node.id
  description       = "SSH so da equipe"
  cidr_ipv4         = each.value
  ip_protocol       = "tcp"
  from_port         = 22
  to_port           = 22
}

resource "aws_vpc_security_group_ingress_rule" "k3s_api" {
  for_each          = toset(var.team_cidrs)
  security_group_id = aws_security_group.node.id
  description       = "API do k3s: kubectl, deploy e port-forward do Grafana"
  cidr_ipv4         = each.value
  ip_protocol       = "tcp"
  from_port         = 6443
  to_port           = 6443
}

# Saída: 443 para PSP, ViaCEP, Let's Encrypt, get.k3s.io, ECR e S3; 5432 para
# o RDS; 53 para o DNS da VPC. Sem 80: nada no nó usa HTTP em texto claro.
resource "aws_vpc_security_group_egress_rule" "https" {
  security_group_id = aws_security_group.node.id
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "tcp"
  from_port         = 443
  to_port           = 443
}

resource "aws_vpc_security_group_egress_rule" "dns_udp" {
  security_group_id = aws_security_group.node.id
  cidr_ipv4         = "${cidrhost(var.vpc_cidr, 2)}/32"
  ip_protocol       = "udp"
  from_port         = 53
  to_port           = 53
}

resource "aws_vpc_security_group_egress_rule" "dns_tcp" {
  security_group_id = aws_security_group.node.id
  cidr_ipv4         = "${cidrhost(var.vpc_cidr, 2)}/32"
  ip_protocol       = "tcp"
  from_port         = 53
  to_port           = 53
}

resource "aws_vpc_security_group_egress_rule" "postgres" {
  security_group_id            = aws_security_group.node.id
  referenced_security_group_id = aws_security_group.db.id
  ip_protocol                  = "tcp"
  from_port                    = 5432
  to_port                      = 5432
}

resource "aws_security_group" "db" {
  name        = "${var.name}-sg-db"
  description = "RDS: 5432 so a partir do no do k3s"
  vpc_id      = aws_vpc.this.id
  tags        = { Name = "${var.name}-sg-db" }
}

resource "aws_vpc_security_group_ingress_rule" "db_from_node" {
  security_group_id            = aws_security_group.db.id
  referenced_security_group_id = aws_security_group.node.id
  ip_protocol                  = "tcp"
  from_port                    = 5432
  to_port                      = 5432
}
