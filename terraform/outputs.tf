output "public_ip" {
  description = "Elastic IP do nó. Muda a cada sessão."
  value       = module.compute.public_ip
}

output "public_host" {
  description = "Nome público pelo sslip.io (Documento 05 §4.3)"
  value       = "${replace(module.compute.public_ip, ".", "-")}.sslip.io"
}

output "webhook_pix_url" {
  description = "URL do webhook do Asaas nesta sessão (depois do certificado)"
  value       = "https://${replace(module.compute.public_ip, ".", "-")}.sslip.io/webhooks/pix"
}

output "kubeconfig_cmd" {
  description = "Copia o kubeconfig do nó trocando 127.0.0.1 pelo IP público"
  value       = "ssh ec2-user@${module.compute.public_ip} sudo cat /etc/rancher/k3s/k3s.yaml | sed 's/127.0.0.1/${module.compute.public_ip}/' > ~/.kube/gesway-aws.yaml"
}

output "ecr_registry" {
  value = local.ecr_registry
}

output "pdf_bucket" {
  value = module.storage.bucket
}

output "db_host" {
  value = module.database.address
}

output "db_port" {
  value = module.database.port
}

output "db_master_username" {
  value = module.database.master_username
}

output "db_master_password" {
  description = "terraform output -raw db_master_password"
  value       = module.database.master_password
  sensitive   = true
}
