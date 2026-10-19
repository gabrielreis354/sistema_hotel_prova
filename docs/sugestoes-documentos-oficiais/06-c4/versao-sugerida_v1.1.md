# Diagramas C4 Model

---

**Projeto:** Gesway — Sistema de Gestão Hoteleira (PMS SaaS)<br>
**Grupo:** Gesway — Gabriel Reis Cunha (6325149)<br>
· Sirlande Martins (6325269)<br>
· Weslley Lucas (6325226)<br>
**Data:** 12/10/2026<br>
**Versão:** 1.1

---

## 1. Objetivo

Este documento apresenta a arquitetura de software do Gesway pelo **C4 Model**, nos três níveis obrigatórios: Contexto, Contêineres e Componentes. O modelo detalha a arquitetura aos poucos, da interação com o mundo externo até os componentes internos de cada serviço.

**O documento é normativo.** Ele descreve a arquitetura-alvo do recorte em três serviços decidido na ADR-003, e não o estado atual do código. Componentes que ainda não foram construídos aparecem normalmente, sem marcação de status. O acompanhamento da execução é feito no Documento 08.

**Coerência com o Documento 03 (DFD).** O C4 e o DFD descrevem o mesmo sistema e usam os mesmos nomes:

- entidades externas: Hóspede, Operador do Hotel, PSP e ViaCEP;
- processos: `core-service`, `b2b-service` e `analytics-service`;
- armazenamentos: D-001 a D-005.

Há duas diferenças, ambas conhecidas:

1. **Papéis do operador (proposital).** O "Operador do Hotel" do DFD aparece aqui dividido nos três papéis do sistema, porque cada papel usa o produto de um jeito diferente.
2. **PDF de orçamento no D-005.** O Documento 03 v1.2 registra o D-005 apenas com o PDF de contrato e diz que o PDF de orçamento é gerado sob demanda. Este documento segue o RNF-023 do Documento 02, que exige a persistência dos dois PDFs. O próprio Documento 03 aponta essa divergência na sua nota de rastreabilidade, como pendência a corrigir.

**Notação dos diagramas.** As cores seguem a convenção do C4: azul-escuro para pessoa, azul para o sistema e os contêineres, azul-claro para componente e cinza para sistema externo. Cilindro é banco de dados ou armazenamento, caixa com borda dupla é a fila de mensagens, e a moldura tracejada marca a fronteira do sistema ou do contêiner. Cada seta traz a ação e, entre colchetes, o protocolo.

### Decisões de referência

Este documento depende de decisões que serão registradas no Documento 07, que vem depois na ordem de entrega. Para que possa ser lido sozinho, o que ele usa de cada decisão está resumido abaixo.

| Decisão | O que este documento usa dela |
|---|---|
| **ADR-003** — recorte de serviços | Três serviços, delimitados por consistência transacional, cada um com o seu banco. `b2b-service → core-service` por REST síncrono, em **rotas internas não publicadas pelo nginx**, para criar e cancelar a reserva-bloco do contrato, de forma idempotente pela chave `contract_id`. `core-service → analytics-service` por eventos no RabbitMQ, com *outbox* transacional. O `analytics-service` não lê o banco do `core-service` |
| **ADR-004** — nuvem | AWS, com k3s em EC2. Os detalhes de infraestrutura ficam no Documento 05 |
| **ADR-006** — identidade entre serviços | O `core-service` é o **único emissor** de token (JWT RS256). Os outros serviços apenas verificam com a chave pública. Por isso não existe "Auth Service" separado, e o nginx não participa da validação de token. As rotas internas exigem o cabeçalho `X-Internal-Token` |

---

## 2. Nível 1 — Diagrama de Contexto

Visão de alto nível: o Gesway como uma caixa-preta e suas interações com pessoas e sistemas externos.

```mermaid
---
title: Diagrama de Contexto - Gesway
---
graph TB
    recep["<b>Recepcionista</b><br/><i>[Pessoa]</i><br/>Reservas, check-in,<br/>check-out e pagamentos"]
    admin["<b>Administrador</b><br/><i>[Pessoa]</i><br/>Configura o hotel, usuários e quartos;<br/>acompanha indicadores"]
    garcom["<b>Garçom</b><br/><i>[Pessoa]</i><br/>Lança consumo pelo celular"]
    hospede["<b>Hóspede</b><br/><i>[Pessoa]</i><br/>Reserva direta e paga<br/>o sinal via PIX, sem login"]

    gesway["<b>Gesway</b><br/><i>[Sistema]</i><br/>PMS SaaS multi-tenant: hospedagem,<br/>pagamentos, consumo, B2B e indicadores"]

    psp["<b>PSP</b><br/><i>[Sistema externo]</i><br/>Provedor de pagamento PIX"]
    viacep["<b>ViaCEP</b><br/><i>[Sistema externo]</i><br/>Endereço a partir do CEP"]

    recep -->|"Opera<br/>[HTTPS]"| gesway
    admin -->|"Administra<br/>[HTTPS]"| gesway
    garcom -->|"Lança consumo<br/>[HTTPS]"| gesway
    hospede -->|"Reserva e paga<br/>[HTTPS]"| gesway
    gesway -->|"Cria cobrança PIX<br/>[HTTPS/REST]"| psp
    psp -->|"Confirma pagamento<br/>[webhook HTTPS]"| gesway
    gesway -->|"Consulta CEP<br/>[HTTPS/REST]"| viacep

    classDef person fill:#08427b,stroke:#052e56,color:#ffffff
    classDef system fill:#1168bd,stroke:#0b4884,color:#ffffff
    classDef container fill:#438dd5,stroke:#2e6295,color:#ffffff
    classDef component fill:#85bbf0,stroke:#5d82a8,color:#0b1d33
    classDef external fill:#8a8a8a,stroke:#6b6b6b,color:#ffffff
    class recep,admin,garcom,hospede person
    class gesway system
    class psp,viacep external
```

### Descrição dos Elementos

| Elemento | Tipo | Descrição |
|----------|------|-----------|
| Recepcionista | Pessoa | Papel `RECEPTIONIST`. No balcão, durante o turno: reservas, check-in e check-out, pagamentos |
| Administrador | Pessoa | Papel `ADMIN`. Configura o hotel, os usuários e os quartos, e lê os indicadores |
| Garçom | Pessoa | Papel `WAITER`. Lança o consumo na conta do hóspede pelo celular |
| Hóspede | Pessoa | Sem login. Consulta disponibilidade, cria a reserva direta e paga o sinal via PIX pelas rotas públicas do hotel, identificado pelo subdomínio |
| Gesway | Sistema | PMS SaaS multi-tenant: cada hotel é um tenant isolado. Cobre hospedagem, pagamentos, consumo, clientes corporativos e indicadores |
| PSP | Sistema Externo | Processa a cobrança PIX e confirma o pagamento por *webhook* com assinatura. O hóspede paga no app do banco; quem avisa o Gesway é o PSP, não o hóspede |
| ViaCEP | Sistema Externo | Preenche o endereço no cadastro de cliente corporativo a partir do CEP |

O Gesway **não envia e-mail**, por isso o "Serviço de E-mail" do modelo não aparece. Notificação ao hóspede está registrada na ADR-003 como evolução fora do escopo.

---

## 3. Nível 2 — Diagrama de Contêineres

O sistema decomposto nos seus contêineres. Cada microsserviço é um contêiner.

```mermaid
---
title: Diagrama de Contêineres - Gesway
---
graph TB
    equipe["<b>Equipe do hotel</b><br/><i>[Pessoa]</i><br/>Recepcionista, Administrador, Garçom"]
    hospede["<b>Hóspede</b><br/><i>[Pessoa]</i>"]

    subgraph gesway["Gesway [Sistema]"]
        pms["<b>app-pms</b><br/><i>[React, TypeScript, Vite]</i><br/>Interface web da equipe do hotel"]
        nginx["<b>nginx</b><br/><i>[nginx 1.27]</i><br/>Única entrada pública; TLS e proxy reverso"]
        core["<b>core-service</b><br/><i>[Node.js, Express]</i><br/>Identidade, hospedagem, pagamentos,<br/>consumo, reserva direta"]
        b2b["<b>b2b-service</b><br/><i>[Node.js, Express]</i><br/>Clientes corporativos, orçamentos,<br/>contratos, PDFs"]
        analytics["<b>analytics-service</b><br/><i>[Node.js, Express]</i><br/>Indicadores a partir de projeções"]
        rabbit[["<b>D-004 RabbitMQ</b><br/><i>[RabbitMQ 4]</i><br/>Eventos de domínio do core"]]
        db_core[("<b>D-001 DB core-service</b><br/><i>[PostgreSQL 17]</i><br/>Dados do núcleo")]
        db_b2b[("<b>D-002 DB b2b-service</b><br/><i>[PostgreSQL 17]</i><br/>Dados B2B")]
        db_an[("<b>D-003 DB analytics-service</b><br/><i>[PostgreSQL 17]</i><br/>Projeções de leitura")]
        s3[("<b>D-005 Armazenamento de objetos</b><br/><i>[API S3]</i><br/>PDFs de contrato e orçamento")]
    end

    psp["<b>PSP</b><br/><i>[Sistema externo]</i>"]
    viacep["<b>ViaCEP</b><br/><i>[Sistema externo]</i>"]

    equipe -->|"Usa<br/>[HTTPS]"| pms
    pms -->|"Chama a API<br/>[HTTPS/JSON]"| nginx
    pms -->|"Baixa PDF por URL assinada<br/>[HTTPS]"| s3
    hospede -->|"Rotas públicas<br/>[HTTPS/JSON]"| nginx
    psp -->|"Webhook<br/>[HTTPS]"| nginx
    nginx -->|"Encaminha<br/>[HTTP]"| core
    nginx -->|"Encaminha<br/>[HTTP]"| b2b
    nginx -->|"Encaminha<br/>[HTTP]"| analytics
    b2b -->|"Reserva-bloco, rota interna<br/>[REST + X-Internal-Token]"| core
    core -->|"Publica eventos<br/>[AMQP]"| rabbit
    rabbit -->|"Entrega eventos<br/>[AMQP]"| analytics
    core -->|"Lê/Escreve<br/>[SQL]"| db_core
    b2b -->|"Lê/Escreve<br/>[SQL]"| db_b2b
    analytics -->|"Lê/Escreve<br/>[SQL]"| db_an
    b2b -->|"Grava PDFs<br/>[S3 API]"| s3
    core -->|"Cobrança PIX<br/>[HTTPS]"| psp
    b2b -->|"Consulta CEP<br/>[HTTPS]"| viacep

    classDef person fill:#08427b,stroke:#052e56,color:#ffffff
    classDef system fill:#1168bd,stroke:#0b4884,color:#ffffff
    classDef container fill:#438dd5,stroke:#2e6295,color:#ffffff
    classDef component fill:#85bbf0,stroke:#5d82a8,color:#0b1d33
    classDef external fill:#8a8a8a,stroke:#6b6b6b,color:#ffffff
    class equipe,hospede person
    class pms,nginx,core,b2b,analytics,rabbit,db_core,db_b2b,db_an,s3 container
    class psp,viacep external
    style gesway fill:none,stroke:#888888,stroke-dasharray:6 4
```

### Descrição dos Contêineres

| Contêiner | Tecnologia | Responsabilidade | Porta |
|-----------|------------|------------------|-------|
| app-pms | React 18.3 + TypeScript 5.6, Vite 5.4, Tailwind 3.4 | Interface (SPA) da equipe do hotel: recepção, gerência e comanda do garçom. Não tem regra de negócio própria, toda validação fica no servidor | servido pelo nginx |
| nginx | nginx 1.27 | Única entrada pública. Termina o TLS, faz proxy reverso para os serviços e limita a taxa de tentativas de login. **Não** valida token (ADR-006), **não** expõe `/metrics` e **não** publica as rotas internas do core | 80/443 (TLS conforme o Documento 05) |
| core-service | Node.js 24 + Express 4.19, Sequelize 6 | Identidade e **único emissor de token**, hotéis, usuários, quartos, hóspedes, reservas, pagamentos e PIX, consumo e reserva direta. Publica os eventos de domínio | 3000 |
| b2b-service | Node.js 24 + Express | Clientes corporativos (com ViaCEP), orçamentos, contratos e parcelas, PDFs. Pede ao `core-service` a reserva-bloco do contrato | a definir (T-01.6) |
| analytics-service | Node.js 24 + Express | Receita, ocupação, diária média, alertas, sazonalidade, mix de pagamento e ranking, calculados a partir de projeções. Nunca lê o banco do core | a definir (T-01.4) |
| D-001 DB core-service | PostgreSQL 17 | Dados do núcleo. Garante o anti-*double-booking* no próprio banco (`EXCLUDE USING gist`) | 5432 |
| D-002 DB b2b-service | PostgreSQL 17 | Clientes corporativos, orçamentos e contratos | 5432 |
| D-003 DB analytics-service | PostgreSQL 17 | Projeções de leitura, alimentadas só por evento | 5432 |
| D-004 RabbitMQ | RabbitMQ 4 | Eventos do core para o analytics. *Exchange* `gesway.core.events`, com novas tentativas e fila de mensagens mortas no lado do consumidor | 5672 |
| D-005 Armazenamento de objetos | MinIO no cluster; S3 na nuvem (mesma API) | PDFs de contrato e de orçamento, num bucket privado. O download é feito por URL assinada de 5 minutos | 9000 |

**Bancos por serviço.** Cada serviço é dono do seu banco e só alcança o seu. D-001 a D-003 são **databases lógicos separados**, cada um com usuário próprio. Isso preserva o isolamento que a ADR-003 decidiu. Se ficam numa mesma instância PostgreSQL, por causa do free-tier, é decisão de infraestrutura e está no Documento 05.

**Linhas do modelo que não se aplicam:**

- **Auth Service:** a autenticação fica no `core-service` (ADR-006).
- **API Gateway** no sentido de Kong: o nginx é proxy reverso, sem autenticação.
- **Cache:** o Gesway não usa cache. Um Redis chegou a ser provisionado na infraestrutura, mas nenhum código o chama.

**Fora do escopo:** o site público de reservas com SSR (`app-booking`) e o backoffice de tenants (`app-admin`) têm a estrutura criada no monorepo, mas são pós-TCC. No escopo atual, o hóspede usa as rotas públicas da API pelo nginx.

---

## 4. Nível 3 — Diagrama de Componentes

Um diagrama por microsserviço, com os componentes e as relações principais.

### 4.1 Componentes do core-service

```mermaid
---
title: Componentes - core-service
---
graph TB
    nginx["<b>nginx</b><br/><i>[Contêiner]</i>"]
    b2b["<b>b2b-service</b><br/><i>[Contêiner]</i>"]

    subgraph core["core-service"]
        mw["<b>Middlewares</b><br/><i>[Express]</i><br/>Token, tenant, papel, CORS"]
        interno["<b>Rotas internas</b><br/><i>[Controllers + middleware]</i><br/>X-Internal-Token;<br/>idempotência por contract_id"]
        auth["<b>Autenticação</b><br/><i>[Controllers]</i><br/>Cadastro do hotel, login,<br/>emissão do JWT RS256"]
        hosp["<b>Hospedagem e Reservas</b><br/><i>[Controllers]</i><br/>Quartos, hóspedes,<br/>ciclo de vida da reserva"]
        cons["<b>Consumo</b><br/><i>[Controllers]</i><br/>Catálogo e lançamentos na conta"]
        pub["<b>Reserva direta</b><br/><i>[Controllers públicos]</i><br/>Tenant pelo subdomínio"]
        conflito["<b>Anti-double-booking</b><br/><i>[Utilitário]</i><br/>Conflito de datas na aplicação"]
        pag["<b>Pagamentos e PIX</b><br/><i>[Controllers + PixProvider]</i><br/>Cobrança, webhook assinado,<br/>confirmação"]
        outbox["<b>Publicador do outbox</b><br/><i>[Worker]</i><br/>Evento na mesma transação;<br/>publica no broker"]
    end

    db[("<b>D-001 DB core-service</b><br/><i>[PostgreSQL]</i>")]
    rabbit[["<b>D-004 RabbitMQ</b>"]]
    psp["<b>PSP</b><br/><i>[Sistema externo]</i>"]

    nginx -->|"Requisições"| mw
    b2b -->|"Reserva-bloco<br/>[REST + X-Internal-Token]"| interno
    interno -->|"Cria / cancela<br/>reserva-bloco"| hosp
    mw -->|"Login"| auth
    mw -->|"Encaminha"| hosp
    mw -->|"Encaminha"| cons
    mw -->|"Webhook PIX"| pag
    mw -->|"Rotas públicas"| pub
    hosp -->|"Valida datas"| conflito
    pub -->|"Cria reserva"| hosp
    pub -->|"Gera cobrança"| pag
    pag -->|"Cobra / consulta<br/>[HTTPS]"| psp
    auth -->|"Lê/Escreve"| db
    hosp -->|"Lê/Escreve"| db
    cons -->|"Lê/Escreve"| db
    pag -->|"Lê/Escreve"| db
    hosp -->|"Grava o evento<br/>na mesma transação"| outbox
    pag -->|"Grava o evento<br/>na mesma transação"| outbox
    outbox -->|"Lê o outbox"| db
    outbox -->|"Publica<br/>[AMQP]"| rabbit

    classDef person fill:#08427b,stroke:#052e56,color:#ffffff
    classDef system fill:#1168bd,stroke:#0b4884,color:#ffffff
    classDef container fill:#438dd5,stroke:#2e6295,color:#ffffff
    classDef component fill:#85bbf0,stroke:#5d82a8,color:#0b1d33
    classDef external fill:#8a8a8a,stroke:#6b6b6b,color:#ffffff
    class nginx,b2b,db,rabbit container
    class mw,interno,auth,hosp,cons,pub,conflito,pag,outbox component
    class psp external
    style core fill:none,stroke:#888888,stroke-dasharray:6 4
```

| Componente | Responsabilidade |
|---|---|
| Middlewares | Valida o token, carrega o tenant, que precisa estar ativo, confere o papel (RBAC) e aplica o CORS. Todo acesso a dado passa pelo `tenant_id` |
| Rotas internas | Recebe do `b2b-service` a criação e o cancelamento da reserva-bloco. Não é publicada pelo nginx e exige o `X-Internal-Token`, comparado em tempo constante (ADR-006). As duas operações são idempotentes pela chave `contract_id` (ADR-003) |
| Autenticação | Cadastro do hotel e login. Assina o JWT RS256 e é o único lugar do sistema que tem a chave privada |
| Usuários e Hotel | Usuários e papéis, e os dados do tenant (no diagrama, agrupados em Autenticação) |
| Hospedagem e Reservas | Categorias, quartos, hóspedes e o ciclo de vida da reserva, que segue a máquina de estados: `PENDING → CONFIRMED → CHECKED_IN → CHECKED_OUT`, e o cancelamento só a partir de `PENDING` ou `CONFIRMED` |
| Anti-*double-booking* | Confere conflito de datas na aplicação. A garantia final é do banco, pela constraint `EXCLUDE USING gist` |
| Pagamentos e PIX | Registro de pagamentos e cobrança PIX pela interface `PixProvider`, com um provedor simulado para testes e o provedor real. O *webhook* exige assinatura, e o status é sempre confirmado no PSP antes de marcar o pagamento como pago. A mudança de status gera evento pelo *outbox* |
| Reserva direta | Rotas públicas, sem login, em que o tenant é resolvido pelo subdomínio. Cria a reserva e a cobrança do sinal |
| Consumo | Catálogo de produtos e lançamentos na conta da hospedagem |
| Publicador do *outbox* | Grava o evento na mesma transação da mudança de estado e publica no RabbitMQ. Nenhum evento se perde se o broker estiver fora do ar |

### 4.2 Componentes do b2b-service

```mermaid
---
title: Componentes - b2b-service
---
graph TB
    nginx["<b>nginx</b><br/><i>[Contêiner]</i>"]

    subgraph b2b["b2b-service"]
        clientes["<b>Clientes corporativos</b><br/><i>[Controllers]</i><br/>CRUD de clientes"]
        orc["<b>Orçamentos</b><br/><i>[Controllers]</i><br/>Orçamento de evento"]
        contratos["<b>Contratos</b><br/><i>[Controllers]</i><br/>Geração, assinatura, parcelas"]
        endereco["<b>Endereço</b><br/><i>[AddressProvider]</i><br/>Consulta de CEP"]
        pdf["<b>PDFs</b><br/><i>[Gerador + cliente S3]</i><br/>Gera e armazena PDFs"]
        cliente_core["<b>Cliente do core-service</b><br/><i>[HTTP client]</i><br/>Cria e cancela a reserva-bloco"]
    end

    viacep["<b>ViaCEP</b><br/><i>[Sistema externo]</i>"]
    db[("<b>D-002 DB b2b-service</b><br/><i>[PostgreSQL]</i>")]
    s3[("<b>D-005 Armazenamento de objetos</b><br/><i>[API S3]</i>")]
    core["<b>core-service</b><br/><i>[Contêiner]</i>"]

    nginx -->|"Requisições"| clientes
    nginx -->|"Requisições"| orc
    nginx -->|"Requisições"| contratos
    clientes -->|"Preenche endereço"| endereco
    endereco -->|"Consulta<br/>[HTTPS]"| viacep
    orc -->|"Gera contrato"| contratos
    orc -->|"Gera PDF"| pdf
    contratos -->|"Gera PDF"| pdf
    pdf -->|"Grava<br/>[S3 API]"| s3
    contratos -->|"Reserva-bloco"| cliente_core
    cliente_core -->|"Rota interna<br/>[REST + X-Internal-Token]"| core
    clientes -->|"Lê/Escreve"| db
    orc -->|"Lê/Escreve"| db
    contratos -->|"Lê/Escreve"| db

    classDef person fill:#08427b,stroke:#052e56,color:#ffffff
    classDef system fill:#1168bd,stroke:#0b4884,color:#ffffff
    classDef container fill:#438dd5,stroke:#2e6295,color:#ffffff
    classDef component fill:#85bbf0,stroke:#5d82a8,color:#0b1d33
    classDef external fill:#8a8a8a,stroke:#6b6b6b,color:#ffffff
    class nginx,db,s3,core container
    class clientes,orc,contratos,endereco,pdf,cliente_core component
    class viacep external
    style b2b fill:none,stroke:#888888,stroke-dasharray:6 4
```

| Componente | Responsabilidade |
|---|---|
| Clientes corporativos | Cadastro das empresas que contratam eventos e hospedagem em bloco |
| Endereço | Preenche o endereço pelo CEP. Fica atrás da interface `AddressProvider`, com erros tipados, e os testes rodam sem rede |
| Orçamentos | Orçamento de evento, com confirmação e cancelamento |
| Contratos | Gera o contrato a partir do orçamento, cuida da assinatura, do cancelamento e das parcelas. O contrato só muda de status depois da resposta do core |
| PDFs | Gera os PDFs de contrato e de orçamento e os grava no armazenamento de objetos |
| Cliente do core-service | Pede ao core a criação e o cancelamento da reserva-bloco pela rota interna, com o `X-Internal-Token`. É a fronteira da ADR-003: a disponibilidade de quartos pertence ao core, então o b2b nunca grava reserva direto |

### 4.3 Componentes do analytics-service

```mermaid
---
title: Componentes - analytics-service
---
graph TB
    rabbit[["<b>D-004 RabbitMQ</b><br/><i>[Contêiner]</i>"]]
    nginx["<b>nginx</b><br/><i>[Contêiner]</i>"]

    subgraph an["analytics-service"]
        consumidor["<b>Consumidor de eventos</b><br/><i>[AMQP consumer]</i><br/>Idempotente; tentativas e DLQ"]
        ind["<b>Consultas de indicadores</b><br/><i>[Controllers]</i><br/>Receita, ocupação,<br/>diária média, ranking"]
        proj["<b>Projeções</b><br/><i>[Repositórios]</i><br/>Cópias de leitura do núcleo"]
    end

    db[("<b>D-003 DB analytics-service</b><br/><i>[PostgreSQL]</i>")]

    rabbit -->|"Entrega eventos<br/>[AMQP]"| consumidor
    nginx -->|"Requisições"| ind
    consumidor -->|"Atualiza"| proj
    ind -->|"Consulta"| proj
    proj -->|"Lê/Escreve"| db

    classDef person fill:#08427b,stroke:#052e56,color:#ffffff
    classDef system fill:#1168bd,stroke:#0b4884,color:#ffffff
    classDef container fill:#438dd5,stroke:#2e6295,color:#ffffff
    classDef component fill:#85bbf0,stroke:#5d82a8,color:#0b1d33
    classDef external fill:#8a8a8a,stroke:#6b6b6b,color:#ffffff
    class rabbit,nginx,db container
    class consumidor,ind,proj component
    style an fill:none,stroke:#888888,stroke-dasharray:6 4
```

| Componente | Responsabilidade |
|---|---|
| Consumidor de eventos | Consome a fila `analytics.core-events`. É idempotente, porque um evento repetido não soma duas vezes, e uma falha passa por novas tentativas com intervalo antes de ir para a fila de mensagens mortas |
| Projeções | Cópias de leitura dos dados do núcleo (hotéis, quartos, hóspedes, reservas, pagamentos), atualizadas só por evento. O hóspede eliminado a pedido do titular (LGPD) vira "Hóspede eliminado" sem perder o histórico dos indicadores |
| Consultas de indicadores | Receita, ocupação, diária média, alertas, sazonalidade, mix de pagamento e ranking, por tenant |

---

## 5. Decisões Arquiteturais (ADRs Resumidos)

| # | Decisão | Motivação | Alternativas Consideradas |
|---|---------|-----------|--------------------------|
| 1 | Node.js 24 + Express 4, módulos ESM | Conhecimento do time, e o mesmo runtime nos três serviços | NestJS; Java com Spring Boot; Python com FastAPI (ADR-001) |
| 2 | PostgreSQL 17 | O anti-*double-booking* fica garantido no próprio banco pela constraint `EXCLUDE USING gist`. A regra não depende só da aplicação | MySQL, sem constraint de exclusão por intervalo; MongoDB, sem modelo relacional para o domínio transacional (ADR-002) |
| 3 | Três serviços, recortados por consistência transacional, cada um com seu banco | O que precisa mudar junto fica no mesmo serviço. Os serviços evoluem e falham isolados | Recorte por tipo de dado (proposta de 23/08); banco compartilhado entre serviços; indicadores lendo réplica do núcleo (ADR-003) |
| 4 | Assíncrono por RabbitMQ com *outbox* do core para o analytics; síncrono por REST do b2b para o core, em rota interna | Indicadores toleram atraso. A reserva-bloco do contrato não tolera, então precisa de resposta imediata | SQS; Redis Streams; gRPC para a chamada síncrona (ADR-003) |
| 5 | AWS, k3s em EC2, ciclo efêmero (sobe na sessão, destrói ao final) | Custo dentro do free-tier. O EKS cobra o control plane mesmo parado | EKS; ECS Fargate (ADR-004) |
| 6 | Docker + Kubernetes (k3s), com Docker Compose de contingência | Mesmo artefato em todos os ambientes, e plano B para a defesa sem nuvem | ECS Fargate; EC2 com Docker Compose, sem orquestrador (ADR-005) |
| 7 | JWT RS256, com o core como único emissor; rotas internas com `X-Internal-Token` | Os outros serviços verificam o token sem conseguir emitir um | HS256 com segredo compartilhado (ADR-006) |
| 8 | Provedores externos atrás de interface (`PixProvider`, `AddressProvider`) | Troca de provedor sem mudar controller, e testes sem rede | Chamada direta ao SDK do provedor |

---

## 6. Tecnologias Utilizadas

| Camada | Tecnologia | Versão | Justificativa |
|--------|------------|--------|---------------|
| Frontend | React + TypeScript | 18.3 / 5.6 | SPA tipada; o contrato da API é gerado do Swagger |
| Build e estilo | Vite, Tailwind CSS | 5.4 / 3.4 | Build rápido; design system próprio em `packages/ui` |
| Estado no cliente | TanStack Query, Zustand | 5 / 5 | Cache de servidor separado de estado local |
| Backend | Node.js + Express | 24 / 4.19 | Mesmo runtime nos três serviços |
| ORM | Sequelize | 6.37 | Transações explícitas nas operações que tocam várias tabelas |
| Banco Relacional | PostgreSQL | 17 | Constraint de exclusão para o anti-*double-booking* |
| Banco NoSQL | — | — | Não utilizado: o domínio é relacional e transacional |
| Cache | — | — | Não utilizado: nenhuma consulta exigiu cache até aqui |
| Mensageria | RabbitMQ | 4 | ADR-003; fila de mensagens mortas nativa |
| Armazenamento de objetos | MinIO / S3 | API S3 | O mesmo SDK local e na nuvem; a troca exige só o ajuste de cliente descrito no Documento 05 |
| Proxy | nginx | 1.27 | Entrada única, TLS e limite de taxa no login |
| Monitoramento | Prometheus + Grafana | 3.1 / 11.4 | Requisito obrigatório; métricas por endpoint e por tenant |
| IaC | Terraform | — | Requisito obrigatório |
| CI/CD | GitHub Actions | — | Requisito obrigatório; portão de cobertura de 60% |
| Containerização | Docker, k3s | — | Padronização do deploy; k3s pela ADR-004 |

---

## 7. Histórico de Revisões

| Versão | Data | Autor | Descrição da Alteração |
|--------|------|-------|------------------------|
| 1.0 | 10/10/2026 | Weslley Lucas | Versão inicial: três níveis para os três serviços da ADR-003, nomes alinhados ao Documento 03 |
| 1.1 | 12/10/2026 | Sugestão — Gabriel Reis Cunha | Registra a segunda diferença com o Documento 03 (PDF de orçamento no D-005); componente "Rotas internas" com `X-Internal-Token` (ADR-003/006); webhook e eventos de Pagamentos no Nível 3 do core; download por URL assinada no Nível 2; alternativas da §5 preenchidas; "diária média" no lugar da sigla ADR |

---

**Aprovado por:**

___________________________________________________
Professor(a) Orientador(a)

Data: ___/___/2026
