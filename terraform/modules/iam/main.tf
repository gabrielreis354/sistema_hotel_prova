# Instance profile do nó: puxar imagem do ECR e ler/gravar no bucket de PDFs.
# Sem chave estática no cluster. Hoje nenhum pod alcança esta credencial (IMDS
# com hop 1, ver compute/main.tf); o minio.js ainda não fala com o S3.
# Pendência: o Documento 05 §3.5 pede que a URL assinada de download seja
# assinada por credencial só de leitura (s3:GetObject). Esta role tem Put e
# Delete, então não serve para assinar a URL.

resource "aws_iam_role" "node" {
  name = "${var.name}-node"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "ec2.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "ecr_read" {
  role       = aws_iam_role.node.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly"
}

resource "aws_iam_role_policy" "pdfs" {
  name = "bucket-pdfs"
  role = aws_iam_role.node.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["s3:PutObject", "s3:GetObject", "s3:DeleteObject"]
        Resource = "${var.pdf_bucket_arn}/*"
      },
      {
        Effect   = "Allow"
        Action   = "s3:ListBucket"
        Resource = var.pdf_bucket_arn
      },
    ]
  })
}

resource "aws_iam_instance_profile" "node" {
  name = "${var.name}-node"
  role = aws_iam_role.node.name
}
