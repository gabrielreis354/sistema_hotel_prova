# terraform init -backend-config=environments/dev/backend.hcl
bucket       = "gesway-tfstate"
key          = "env/dev/terraform.tfstate"
region       = "sa-east-1"
encrypt      = true
use_lockfile = true
