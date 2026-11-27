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
  description = "Par de chaves EC2 já criado na região, para SSH. null = sem SSH por chave."
  type        = string
  default     = null
}

variable "k3s_version" {
  type    = string
  default = "v1.31.4+k3s1"
}
