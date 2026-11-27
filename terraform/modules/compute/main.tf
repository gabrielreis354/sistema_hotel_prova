# Um único nó do k3s em EC2 t3.small (ADR-004, revisão de 24/10/2026).
# k3s em servidor único, sem Traefik e sem metrics-server, com memória
# reservada para o sistema e para o próprio k3s.

data "aws_ssm_parameter" "al2023" {
  name = "/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-x86_64"
}

# O Elastic IP nasce antes da instância: o IP entra no certificado da API do
# k3s (--tls-san) e no nome sslip.io, e é liberado no destroy.
resource "aws_eip" "node" {
  domain = "vpc"
  tags   = { Name = "${var.name}-eip" }
}

resource "aws_instance" "node" {
  ami                    = data.aws_ssm_parameter.al2023.value
  instance_type          = var.instance_type
  subnet_id              = var.subnet_id
  vpc_security_group_ids = [var.security_group_id]
  iam_instance_profile   = var.instance_profile_name
  key_name               = var.key_name

  # Nunca cobrar CPU excedente (ADR-004).
  credit_specification {
    cpu_credits = "standard"
  }

  # IMDSv2 obrigatório; hop 2 para os pods alcançarem a credencial do nó
  # (upload de PDF no S3 pela cadeia padrão do SDK).
  metadata_options {
    http_endpoint               = "enabled"
    http_tokens                 = "required"
    http_put_response_hop_limit = 2
  }

  root_block_device {
    volume_type           = "gp3"
    volume_size           = var.root_volume_gb
    encrypted             = true
    delete_on_termination = true
  }

  user_data = templatefile("${path.module}/user-data.sh.tftpl", {
    k3s_version  = var.k3s_version
    public_ip    = aws_eip.node.public_ip
    region       = var.region
    ecr_registry = var.ecr_registry
  })

  # Trocar o user-data recria o nó: o ambiente é efêmero mesmo.
  user_data_replace_on_change = true

  tags = { Name = "${var.name}-k3s" }
}

resource "aws_eip_association" "node" {
  instance_id   = aws_instance.node.id
  allocation_id = aws_eip.node.id
}
