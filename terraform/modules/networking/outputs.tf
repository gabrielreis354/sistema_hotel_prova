output "vpc_id" {
  value = aws_vpc.this.id
}

output "public_subnet_id" {
  value = aws_subnet.publica.id
}

output "data_subnet_ids" {
  value = aws_subnet.dados[*].id
}

output "node_sg_id" {
  value = aws_security_group.node.id
}

output "db_sg_id" {
  value = aws_security_group.db.id
}

output "public_az" {
  value = aws_subnet.publica.availability_zone
}
