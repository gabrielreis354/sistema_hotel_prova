# Bucket dos PDFs de contrato e orçamento (Documento 05 §3.5). Privado,
# destruído com o ambiente: force_destroy evita o destroy falhar com objeto.

resource "random_id" "sufixo" {
  byte_length = 3
}

resource "aws_s3_bucket" "pdfs" {
  bucket        = "${var.name}-pdfs-${random_id.sufixo.hex}"
  force_destroy = true
}

resource "aws_s3_bucket_public_access_block" "pdfs" {
  bucket                  = aws_s3_bucket.pdfs.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "pdfs" {
  bucket = aws_s3_bucket.pdfs.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_ownership_controls" "pdfs" {
  bucket = aws_s3_bucket.pdfs.id
  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}
