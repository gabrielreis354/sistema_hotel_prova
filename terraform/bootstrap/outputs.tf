output "state_bucket" {
  value = aws_s3_bucket.tfstate.bucket
}

output "ecr_repositories" {
  value = { for k, r in aws_ecr_repository.servico : k => r.repository_url }
}

output "ci_role_arn" {
  description = "Vai no secret AWS_ROLE_ARN do GitHub, para o aws-actions/configure-aws-credentials"
  value       = aws_iam_role.ci_ecr_push.arn
}

output "account_id" {
  value = data.aws_caller_identity.atual.account_id
}
