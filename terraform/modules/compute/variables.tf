variable "name" {
  type = string
}

variable "region" {
  type = string
}

variable "instance_type" {
  type = string
}

variable "subnet_id" {
  type = string
}

variable "security_group_id" {
  type = string
}

variable "instance_profile_name" {
  type = string
}

variable "key_name" {
  description = "Par de chaves para SSH; null desliga o SSH por chave"
  type        = string
  default     = null
}

variable "root_volume_gb" {
  type = number
}

variable "k3s_version" {
  type = string
}

variable "ecr_registry" {
  description = "<conta>.dkr.ecr.<região>.amazonaws.com"
  type        = string
}
