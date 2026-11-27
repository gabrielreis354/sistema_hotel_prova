output "bucket" {
  value = aws_s3_bucket.pdfs.bucket
}

output "bucket_arn" {
  value = aws_s3_bucket.pdfs.arn
}
