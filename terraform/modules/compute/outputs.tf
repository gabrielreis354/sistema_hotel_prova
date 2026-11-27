output "instance_id" {
  value = aws_instance.node.id
}

output "public_ip" {
  value = aws_eip.node.public_ip
}
