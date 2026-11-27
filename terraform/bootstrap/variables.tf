variable "region" {
  type    = string
  default = "sa-east-1"
}

variable "state_bucket_name" {
  description = "Nome global e único do bucket do state. Precisa bater com o backend.hcl do ambiente."
  type        = string
  default     = "gesway-tfstate"
}

variable "services" {
  type    = list(string)
  default = ["core-service", "analytics-service", "b2b-service"]
}

variable "github_repo" {
  description = "dono/repositório no GitHub"
  type        = string
  default     = "gabrielreis354/sistema_hotel_prova"
}

variable "ci_branches" {
  description = "Branches cujo workflow pode empurrar imagem no ECR"
  type        = list(string)
  default     = ["develop", "main"]
}

variable "budget_daily_usd" {
  description = "Alerta diário: passa disso só com recurso esquecido ligado"
  type        = string
  default     = "1"
}

variable "budget_monthly_usd" {
  description = "Alerta mensal: uso bem acima do previsto"
  type        = string
  default     = "10"
}

variable "budget_emails" {
  description = "Quem recebe o alerta de custo"
  type        = list(string)
}
