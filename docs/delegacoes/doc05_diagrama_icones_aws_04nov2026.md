# Delegação — Doc 05: diagrama de arquitetura com ícones oficiais da AWS

> **De:** Gabriel (orquestrador) · **Para:** uma janela Claude Code dedicada · **Data:** 04/11/2026
> **Origem:** auditoria de coerência (28/10), Doc 05 🟡: "Avaliar diagrama com ícones oficiais da AWS; o Termo §6.5 pede 'diagrama oficial'". Decisão do Gabriel registrada em `docs/retomada/ENTREGA_DOCUMENTOS_E_MVP.md` §2
> **Documento:** `Projetos/gesway/05-arquitetura-nuvem.md` v1.2, já em PR ao professor (#34 em `AleTavares/UniFAAT-projeto-experimental-2027-1`)

Cole o bloco abaixo inteiro como primeira mensagem na janela nova.

```
Você vai produzir o diagrama oficial de arquitetura em nuvem do Doc 05 do Gesway, usando os
ícones oficiais da AWS. Gesway é um PMS SaaS multi-tenant (projeto acadêmico da UniFAAT). O Doc 05
descreve o ALVO de nuvem do 5º semestre. NADA é provisionado: este trabalho é só de desenho.

🛑 REGRA ABSOLUTA: não rode nenhum comando AWS, Terraform ou de cloud. Não é preciso conta AWS para isto.

ONDE ESTÁ
- Fork do Gabriel: C:\Users\gabri\unifaat_4sem\UniFAAT-projeto-experimental-2027-1
  (no WSL: /mnt/c/Users/gabri/unifaat_4sem/UniFAAT-projeto-experimental-2027-1).
  `origin` = gabrielreis354 (o fork) e `upstream` = AleTavares (o professor).
- Documento: Projetos/gesway/05-arquitetura-nuvem.md, na branch origin/entrega-5-arquitetura-nuvem (v1.2).
  Leia o documento INTEIRO antes de começar. O diagrama precisa bater 1:1 com o texto:
  - §2: diagrama Mermaid atual, cerca da linha 41;
  - §3: inventário;
  - §4.1: diagrama de rede;
  - §4.2: Security Groups.
- Coerência obrigatória com Projetos/gesway/06-c4-model.md (v1.2) e com a ADR-004 de
  Projetos/gesway/07-registro-decisoes-arquitetonicas-adr.md (v1.1). Esses estão nas branches
  origin/entrega-6-c4-v12 e origin/entrega-7-adr.

O QUE O DIAGRAMA MOSTRA (conferir contra o texto; se algo divergir, o TEXTO manda e você me avisa)
- Região sa-east-1 com uma VPC, uma subnet pública e uma subnet privada.
- 1 EC2 t3.small com k3s, rodando nginx, core-service, b2b-service, analytics-service,
  RabbitMQ, Prometheus e Grafana.
- RDS PostgreSQL 17 db.t3.micro Single-AZ na subnet privada, com um database por serviço.
- S3 para os PDFs, com URL assinada; ECR; GitHub Actions publicando por OIDC.
- Security Groups como no §4.2; entrada HTTPS por sslip.io e Let's Encrypt.
- Sem NAT Gateway, ALB, Route 53 ou EKS. Se houver espaço, uma nota com essa ausência é desejável.
- Externos: PSP Asaas (webhook) e ViaCEP.

COMO FAZER
- Use o pacote OFICIAL de ícones da AWS (AWS Architecture Icons). O caminho recomendado é a
  biblioteca Python `diagrams` (mingrammer), que já embute os ícones oficiais:
  `python3 -m venv /tmp/venv-diag && /tmp/venv-diag/bin/pip install diagrams` (precisa do
  graphviz: `sudo apt-get install -y graphviz`; se não houver sudo, me avise).
  Rode o script de um diretório SEU (ex.: /tmp/doc05-diagrama), nunca de dentro de pacote baixado.
- Gere PNG (e SVG, se sair legível). O script-fonte fica versionado junto, para o diagrama ser
  reproduzível: Projetos/gesway/assets/05-arquitetura-nuvem.py e Projetos/gesway/assets/05-arquitetura-nuvem.png.
  Antes, confira se o README do professor ou os documentos de outros grupos usam outra pasta para imagens,
  e siga o padrão do repositório.
- No documento, a imagem entra na §2, ACIMA do Mermaid. O Mermaid continua como versão textual e
  "renderizável no GitHub". Acrescente uma linha na §7 (Histórico) com versão 1.3, data e descrição.
  Atualize a versão e a data no cabeçalho.
- Legível em tela e impresso: rótulos curtos, agrupamento por VPC e subnet, e setas com protocolo/porta
  onde o §4 cita.

GIT
- Crie a branch NOVA entrega-5-diagrama-aws a partir de origin/entrega-5-arquitetura-nuvem.
  NÃO faça commit nem push na entrega-5-arquitetura-nuvem: ela é a branch do PR #34 ao professor, e o
  Gabriel decide quando o diagrama entra lá.
- O commit toca só Projetos/gesway/ (o documento e a pasta de imagens). Commit com corpo, terminando com
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Nunca use `git add .` nem `-A`. Faça push
  para origin (o fork). NUNCA faça push para upstream e NUNCA abra PR.

VERIFICAÇÃO
- Abra o PNG e confira, item a item, contra o §3 e o §4.2. Liste no relatório cada recurso e onde aparece.
- O Mermaid continua renderizando (use @mermaid-js/mermaid-cli via npx, se disponível).

OUTPUT
1. Branch entrega-5-diagrama-aws no fork, com o hash do commit.
2. Caminho do PNG, para o Gabriel ver.
3. A lista de divergências entre o texto e o que você desenhou (deve ser vazia ou explicada).
```
