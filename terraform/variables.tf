variable "region" {
  type    = string
  default = "sa-east-1"
}

variable "name" {
  description = "Prefixo dos recursos"
  type        = string
  default     = "gesway-dev"
}

variable "team_cidrs" {
  description = "IP de cada integrante em /32, para SSH e API do k3s. Nunca 0.0.0.0/0."
  type        = list(string)

  validation {
    condition     = length(var.team_cidrs) > 0 && alltrue([for c in var.team_cidrs : endswith(c, "/32")])
    error_message = "Informe ao menos um IP, e só em /32."
  }
}

variable "instance_type" {
  description = "Nó do k3s. Regra da ADR-004: nunca acima de t3.small."
  type        = string
  default     = "t3.small"

  validation {
    condition     = contains(["t3.small", "t3.micro"], var.instance_type)
    error_message = "Só t3.small ou t3.micro: o plano gratuito não admite tipo maior (ADR-004)."
  }
}

variable "root_volume_gb" {
  type    = number
  default = 20
}

variable "key_name" {
  description = "Par de chaves EC2 já criado em sa-east-1. Obrigatório: o kubeconfig sai do nó por SSH."
  type        = string

  validation {
    condition     = length(trimspace(var.key_name)) > 0
    error_message = "Informe o key_name: sem SSH não há como copiar o kubeconfig do nó."
  }
}

variable "k3s_channel" {
  description = <<-EOT
    Canal do instalador do k3s: "stable" ou uma minor, ex. "v1.34".
    No 1º apply, conferir em https://update.k3s.io/v1-release/channels qual minor
    está em suporte, fixar aqui e validar os manifests de infra/k8s nela.
  EOT
  type        = string
  default     = "stable"
}
