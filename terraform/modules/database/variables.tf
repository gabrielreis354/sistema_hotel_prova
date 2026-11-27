variable "name" {
  type = string
}

variable "subnet_ids" {
  type = list(string)
}

variable "security_group_id" {
  type = string
}

variable "availability_zone" {
  description = "AZ da instância (a mesma do nó, para não cruzar AZ)"
  type        = string
}

variable "engine_version" {
  type    = string
  default = "17"
}

variable "instance_class" {
  type    = string
  default = "db.t3.micro"
}
