# Documento de Requisitos Funcionais e Não Funcionais

---

**Projeto:** Gesway — Sistema de Gestão Hoteleira (PMS SaaS)
**Grupo:** Gesway — Gabriel Reis Cunha (6325149) 
·Sirlande Martins (6325269) 
· Weslley Lucas (6325226)
**Data:** 14/09/2026
**Versão:** 1.4

---

## 1. Introdução

Este documento especifica os Requisitos Funcionais (RF) e Não Funcionais (RNF) do Gesway. Diferente de um levantamento especulativo, os requisitos abaixo foram derivados do **domínio real de operação hoteleira** e validados contra a implementação em andamento — rotas (`routes/apis/`), controllers (`app/Controllers/`), models Sequelize (`app/Models/`), `db/schema.sql`, middlewares, suíte de testes (Vitest + Supertest) e pipeline de CI. Cada critério de aceite é, portanto, verificável e não hipotético.

Os identificadores `RF-xxx` mantêm a numeração já referenciada pelo **Documento 04 — Modelo Entidade-Relacionamento**, que ancora cada entidade a um conjunto de requisitos. Este documento é a contraparte funcional daquela rastreabilidade: onde o Doc. 04 descreve a estrutura de dados, aqui se descreve o comportamento observável — pela API (§2.1 a §2.8) e pela interface do operador (§2.9).

### Natureza normativa deste documento

Requisito é **norma**, não relato: descreve o que o sistema *deve* satisfazer, não o que já está construído em uma data. Por isso as tabelas trazem **Critério de Aceite** e **Meta** — condições verificáveis e estáveis ao longo do projeto — e **não** trazem coluna de status de implementação.

O acompanhamento de execução (o que já foi entregue, por quem e em qual sprint) é responsabilidade do **Documento 08 — Planejamento de Sprints e Tarefas**, onde a informação é datada e a defasagem é esperada. Essa separação evita que um documento oficial assinado envelheça a cada commit.

A **prioridade** comunica a ordem de construção: requisitos de prioridade Alta compõem o núcleo operacional exigido para a operação do hotel; Média e Baixa são entregues na sequência definida pelo Doc. 08.

---

## 2. Requisitos Funcionais (RF)

### Legenda de Prioridade
- **Alta** — Essencial para o núcleo operacional (reserva, hospedagem, isolamento multi-tenant, financeiro básico)
- **Média** — Importante para o valor de produto (B2B, motor de reserva direta, indicadores)
- **Baixa** — Desejável, entrega condicionada ao tempo disponível

### 2.1 Núcleo e Identidade

| ID | Descrição | Critério de Aceite | Prioridade | Módulo |
|----|-----------|---------------------|------------|--------|
| RF-001 | O sistema deve permitir que um hotel se auto-cadastre (tenant) criando automaticamente seu usuário administrador | `POST /auth/register` cria o tenant e o usuário `ADMIN` em uma única chamada; o subdomínio é gerado a partir do nome do hotel (slug); subdomínio ou e-mail já em uso retornam `409` | Alta | core-service |
| RF-002 | O sistema deve autenticar usuários e emitir token JWT | `POST /auth/login` retorna token com payload `{ userId, role, tenantId }` e validade **≤ 8 horas** (ver RNF-005); credenciais inválidas retornam `401`; e-mail existente em mais de um hotel sem `subdomain` informado retorna `409` exigindo desambiguação | Alta | core-service |
| RF-003 | O sistema deve permitir que o administrador consulte e edite apenas os dados do próprio hotel | `GET/PUT /tenants/me` — sem parâmetro de ID na rota (impossibilita IDOR entre hotéis); `PUT` restrito ao papel `ADMIN` | Média | core-service |
| RF-004 | O sistema deve permitir CRUD de usuários do hotel, restrito ao administrador | `GET/POST/PUT/DELETE /users` exigem papel `ADMIN`; senha nunca trafega nem é retornada em claro; e-mail único por hotel (`UNIQUE(tenant_id,email)`) | Alta | core-service |
| RF-005 | O sistema deve isolar completamente os dados entre hotéis (multi-tenant) | Toda consulta filtra por `tenant_id` extraído do JWT — nunca aceito como parâmetro de rota/body; garantido por teste dedicado (`tenant-isolation.test.js`) | Alta | core-service |

### 2.2 Hospedagem

| ID | Descrição | Critério de Aceite | Prioridade | Módulo |
|----|-----------|---------------------|------------|--------|
| RF-006 | O sistema deve permitir CRUD de categorias de quarto | `GET/POST/PUT/DELETE /room-categories`; escrita restrita a `ADMIN`; nome único por hotel | Alta | core-service |
| RF-007 | O sistema deve permitir CRUD de quartos | `GET/POST/PUT/DELETE /rooms`; escrita restrita a `ADMIN`; número único por hotel; `status ∈ {AVAILABLE, OCCUPIED, MAINTENANCE, CLEANING}` | Alta | core-service |
| RF-008 | O sistema deve permitir consultar quartos disponíveis em um período | `GET /rooms/available?check_in=&check_out=` retorna apenas quartos sem reserva conflitante no intervalo | Alta | core-service |
| RF-009 | O sistema deve permitir CRUD de hóspedes | `GET/POST/PUT/DELETE /guests`; CPF e e-mail únicos por hotel — `NULL` permitido e não gera colisão entre hóspedes sem documento (semântica de `UNIQUE` do PostgreSQL) | Alta | core-service |
| RF-010 | O sistema deve impedir reserva sobreposta para o mesmo quarto | `POST /reservations` recusa criação se `checkReservationConflict` detectar reserva não `CANCELLED`/`CHECKED_OUT` no mesmo intervalo; reforçado no banco pela constraint `EXCLUDE USING gist (room_id WITH =, daterange(...) WITH &&)`, que impede a sobreposição mesmo sob condição de corrida | Alta | core-service |
| RF-011 | O sistema deve controlar o ciclo de vida da reserva por máquina de estados | `PUT /reservations/:id/check-in`, `/check-out`, `/cancel`; transições restritas (`PENDING → CONFIRMED → CHECKED_IN → CHECKED_OUT`; apenas `PENDING`/`CONFIRMED` podem ser canceladas) | Alta | core-service |
| RF-012 | O sistema deve permitir consultar, atualizar e remover reservas | `GET /reservations`, `GET /reservations/:id`, `PUT /reservations/:id`; `DELETE` restrito a `ADMIN` (soft delete) | Alta | core-service |
| RF-013 | O sistema deve permitir reserva de múltiplos quartos em um único registro (grupo/família) | `POST /reservations/:id/rooms` e `DELETE /reservations/:id/rooms/:roomId` associam/desassociam quartos via tabela pivô `reservation_rooms`; par `(reservation_id, room_id)` único | Média | core-service |
| RF-055 | O sistema deve manter ficha de registro do hóspede com os dados exigidos de um meio de hospedagem | Além de nome, CPF, telefone e e-mail (RF-009): tipo e número do documento, data de nascimento, nacionalidade, endereço completo e motivo da viagem; acompanhantes da estadia registrados, inclusive menores sem documento próprio; os campos ficam sujeitos aos mesmos deveres de minimização e de eliminação a pedido do titular aplicados aos demais dados pessoais | Alta | core-service |

### 2.3 Financeiro

| ID | Descrição | Critério de Aceite | Prioridade | Módulo |
|----|-----------|---------------------|------------|--------|
| RF-014 | O sistema deve registrar pagamentos vinculados a uma reserva, com múltiplos meios e naturezas | `POST /payments` aceita `method` livre (PIX, CARTAO, DINHEIRO...) e `kind ∈ {FULL, DEPOSIT, BALANCE}`; `amount ≥ 0` | Alta | core-service |
| RF-015 | O sistema deve permitir consultar, atualizar e remover pagamentos | `GET/PUT/DELETE /payments`; remoção é soft delete — histórico financeiro nunca é apagado fisicamente | Alta | core-service |
| RF-016 | O sistema deve consolidar diárias e consumos no fechamento de conta da reserva | `GET /reservations/:id/bill` retorna o total combinando `total_amount` da reserva e os lançamentos de consumo ativos | Alta | core-service |
| RF-017 | O sistema deve permitir lançar e estornar consumo extra (frigobar, restaurante) em uma reserva, com trilha de auditoria do estorno | `POST /reservations/:id/consumptions` cria o lançamento; `DELETE .../consumptions/:id` (restrito a `ADMIN`) faz soft delete e grava `deleted_by` — responde "quem autorizou o estorno" | Alta | core-service |
| RF-018 | O sistema deve manter um catálogo de produtos/serviços consumíveis (cardápio) | `GET/POST/PUT/DELETE /products`; item com nome, preço e categoria (`FOOD/DRINK/SERVICE/OTHER`); nome único entre itens ativos (índice único parcial, `WHERE deleted_at IS NULL`); leitura liberada a todos os papéis autenticados, escrita restrita a `ADMIN` | Média | core-service |
| RF-056 | O sistema deve permitir o fechamento de caixa por turno | Relação dos lançamentos financeiros do turno agrupados por meio de pagamento; o operador informa o valor conferido e o sistema calcula e registra a divergência; o fechamento é nominal — registra quem fechou e quando — e não pode ser alterado depois de confirmado | Média | core-service |

### 2.4 Consumo (F&B) — Módulo de Comanda

> As cinco entradas abaixo se apoiam nas entidades `ACCOUNTS`/`ACCOUNT_ITEMS` (Doc. 04, §4.11–4.12), que sucedem `CONSUMPTIONS` (RF-017) como modelo de lançamento — a conta passa a ser a unidade de cobrança, e não mais a reserva.

| ID | Descrição | Critério de Aceite | Prioridade | Módulo |
|----|-----------|---------------------|------------|--------|
| RF-019 | O sistema deve permitir abrir uma conta vinculada à estadia (conta de suíte) | Conta `type=ROOM` associada a `reservation_id` e `room_id` | Média | core-service |
| RF-020 | O sistema deve permitir abrir conta sem hospedagem associada (*day-use*, mesa avulsa) | Conta `type ∈ {DAY_USE, TABLE, DIRECT}` com `reservation_id` nulo | Média | core-service |
| RF-021 | O sistema deve permitir dividir a conta de uma mesma suíte entre hóspedes diferentes | Múltiplas contas com o mesmo `room_id`; apenas uma pode ter `charges_lodging = true` (RN-005 do Doc. 04) | Média | core-service |
| RF-022 | O sistema deve permitir registrar consumo interno (cortesia, refeição de funcionário, perda) sem impacto na receita | Conta `type=INTERNAL` ou item com `billable=false` e `reason` obrigatório; valor não soma no total da conta mas permanece registrado para relatório gerencial (RN-006/RN-007) | Média | core-service |
| RF-023 | O sistema deve permitir que o garçom lance consumo pelo celular com idempotência em rede instável | Item carrega `client_item_id` gerado no dispositivo; reenvio do mesmo identificador não duplica o lançamento (RN-008) | Média | core-service |

### 2.5 Vendas Diretas — Motor de Reserva + PIX

| ID | Descrição | Critério de Aceite | Prioridade | Módulo |
|----|-----------|---------------------|------------|--------|
| RF-024 | O sistema deve expor uma página pública de consulta do hotel, sem autenticação | `GET /public/:subdomain/hotel` resolve o tenant pelo subdomínio da URL | Alta | core-service (rota pública) |
| RF-025 | O sistema deve permitir consulta pública de disponibilidade por categoria | `GET /public/:subdomain/availability`, sem login | Alta | core-service (rota pública) |
| RF-026 | O sistema deve permitir que o próprio hóspede crie uma reserva direta e pague o sinal via PIX | `POST /public/:subdomain/bookings`: encontra quarto livre na categoria, cria ou reaproveita o hóspede, cria reserva `PENDING` (`source=DIRECT`, sem recepcionista), gera cobrança PIX no percentual `deposit_percent` do hotel — tudo em uma única transação atômica | Alta | core-service (integração PIX) |
| RF-027 | O sistema deve confirmar o pagamento PIX de forma assíncrona via *webhook* e promover a reserva | `POST /webhooks/pix` marca o pagamento como `PAID` e promove `PENDING → CONFIRMED` (nunca mexe em outros estados); idempotente — reprocessar o mesmo `provider_charge_id` não duplica efeito | Alta | core-service |
| RF-028 | O sistema deve permitir que o hóspede consulte o status da própria reserva/pagamento sem login | `GET /public/:subdomain/bookings/:id/status` | Média | core-service (rota pública) |

### 2.6 B2B — Grupos e Eventos

| ID | Descrição | Critério de Aceite | Prioridade | Módulo |
|----|-----------|---------------------|------------|--------|
| RF-029 | O sistema deve permitir CRUD de clientes corporativos | `GET/POST/PUT/DELETE /corporate-clients`; CNPJ e CPF únicos por hotel; exclusão restrita a `ADMIN` | Média | b2b-service |
| RF-030 | O sistema deve permitir elaborar orçamento de evento/grupo com cálculo de total no servidor | `GET/POST/PUT/DELETE /event-quotes`; tarifa com/sem refeição, desconto percentual, `total` nunca recebido do cliente | Média | b2b-service |
| RF-031 | O sistema deve permitir compor serviços adicionais no orçamento (coffee break, sonorização) | Itens de `quote_services` com `quantidade × valor_unitario × diarias` | Baixa | b2b-service |
| RF-032 | O sistema deve gerar PDF do orçamento | `GET /event-quotes/:id/pdf` | Média | b2b-service |
| RF-033 | O sistema deve gerar contrato a partir de um orçamento e, ao assinar, bloquear os quartos do período | `POST /contracts`, `PUT /contracts/:id/sign` cria uma reserva-bloco (`reservation_id`) que impede venda avulsa dos quartos naquele período — a reserva-bloco é criada pelo `core-service`, por chamada idempotente (ADR-003) | Média | b2b-service |
| RF-034 | O sistema deve permitir cancelar um contrato | `PUT /contracts/:id/cancel` | Média | b2b-service |
| RF-035 | O sistema deve gerar PDF do contrato e disponibilizá-lo para download | `GET /contracts/:id/pdf`; o arquivo é persistido em armazenamento de objeto e entregue por URL assinada e expirável (ver RNF-023) | Média | b2b-service |
| RF-036 | O sistema deve permitir parcelar e dar baixa em pagamento do contrato | `PUT /contracts/:id/installments/:installmentId/pay` marca a parcela como `PAID` e registra `paid_at` | Média | b2b-service |

### 2.7 Gestão — Indicadores (analytics-service)

| ID | Descrição | Critério de Aceite | Prioridade | Módulo |
|----|-----------|---------------------|------------|--------|
| RF-037 | O sistema deve apresentar receita realizada por mês, filtrável por período | `GET /analytics/revenue?start=&end=` | Média | analytics-service |
| RF-038 | O sistema deve apresentar ocupação e tarifa média diária (ADR) do dia | `GET /analytics/occupancy` — total de quartos, ocupados, disponíveis, em limpeza, e ADR calculado sobre reservas ativas no dia de referência | Média | analytics-service |
| RF-039 | O sistema deve alertar riscos operacionais do dia | `GET /analytics/alerts` — reservas confirmadas com check-in hoje e sem pagamento registrado (risco de *no-show*), e quartos parados em `CLEANING` | Média | analytics-service |
| RF-040 | O sistema deve apresentar sazonalidade de reservas | `GET /analytics/seasonality?months=` (1–60) — reservas, receita e estadia média por mês | Baixa | analytics-service |
| RF-041 | O sistema deve apresentar receita por categoria de quarto | `GET /analytics/revenue-by-category?start=&end=` | Baixa | analytics-service |
| RF-042 | O sistema deve apresentar o mix de formas de pagamento | `GET /analytics/payment-mix?start=&end=` — percentual de receita por método | Baixa | analytics-service |
| RF-043 | O sistema deve apresentar ranking de hóspedes por valor gerado | `GET /analytics/top-guests?limit=` (1–100) — total de reservas e valor acumulado por hóspede | Baixa | analytics-service |

> Indicadores gerenciais são restritos aos papéis `ADMIN` e `RECEPTIONIST`; o papel `WAITER` não acessa este módulo (ver RNF-007).

### 2.8 Documentação e Integrações Externas

| ID | Descrição | Critério de Aceite | Prioridade | Módulo |
|----|-----------|---------------------|------------|--------|
| RF-044 | O sistema deve documentar interativamente todos os endpoints | Especificação OpenAPI 3.0 publicada em `/api-docs` (Swagger UI), com autenticação via botão **Authorize** | Alta | cross-cutting |
| RF-045 | O sistema deve preencher endereço automaticamente a partir do CEP no cadastro de cliente corporativo | Integração com ViaCEP: informado o CEP, logradouro, bairro, cidade e UF são preenchidos sem digitação; CEP inexistente retorna erro tratado, sem interromper o cadastro | Baixa | core-service (integração externa) |

### 2.9 Interface do Operador (app-pms)

> Os requisitos anteriores descrevem o comportamento da API. Os desta seção descrevem a **aplicação web** usada pela equipe do hotel — recepção, gerência e serviço de A&B. Ela é o meio pelo qual a operação exerce os RF-001 a RF-045, e não acrescenta regra de negócio própria: toda validação permanece no servidor.

| ID | Descrição | Critério de Aceite | Prioridade | Módulo |
|----|-----------|---------------------|------------|--------|
| RF-046 | A interface deve autenticar o usuário e expor apenas as funções permitidas ao seu papel | Após o login, o menu e as ações refletem o papel do token; funcionalidade não permitida não é apenas escondida — a tentativa é recusada pelo servidor (RNF-007) | Alta | app-pms |
| RF-047 | A interface deve apresentar um painel do dia com a operação corrente | Chegadas, saídas e hóspedes na casa do dia, com ação direta de check-in e check-out a partir da lista, e os alertas operacionais de RF-039 | Alta | app-pms |
| RF-048 | A interface deve permitir gerir categorias e quartos | CRUD de categorias (capacidade e tarifa) e de quartos (número, andar, categoria e status), com escrita restrita a `ADMIN` | Alta | app-pms |
| RF-049 | A interface deve permitir operar o ciclo de vida da reserva | Listagem com filtro por período, detalhe da reserva, criação a partir da consulta de disponibilidade (RF-008) e ações de check-in, check-out e cancelamento respeitando a máquina de estados (RF-011); a conta da reserva (RF-016) é exibida no check-out | Alta | app-pms |
| RF-050 | A interface deve apresentar a ocupação do período em mapa de reservas (*rack*) | Visão de quartos × dias no desktop, carregando apenas o intervalo consultado; no celular, agenda do dia equivalente; clicar em uma reserva abre seu detalhe | Média | app-pms |
| RF-051 | A interface deve oferecer ao garçom uma comanda operável pelo celular | Tela inicial do papel `WAITER` é a lista de contas abertas; cardápio com preço visível; lançamento em um toque; total sempre visível; lançamento offline enfileirado e reenviado sem duplicar (RF-023); cortesia exibida com preço riscado e rótulo, somando zero (RF-022) | Média | app-pms |
| RF-052 | A interface deve permitir registrar pagamentos e consultar os indicadores de gestão | Registro e listagem de pagamentos (RF-014, RF-015) e apresentação dos indicadores de RF-037 a RF-043, incluindo o relatório de cortesias e perdas | Média | app-pms |
| RF-053 | A interface deve permitir operar o fluxo B2B de grupos e eventos | CRUD de clientes corporativos, elaboração de orçamento com serviços e download do PDF, geração e assinatura de contrato, e baixa de parcela (RF-029 a RF-036) | Média | app-pms |
| RF-054 | A interface deve permitir configurar o hotel e seus usuários | CRUD de usuários com papel (RF-004) e edição dos dados do próprio hotel (RF-003) | Média | app-pms |

---

## 3. Requisitos Não Funcionais (RNF)

### 3.1 Desempenho

| ID | Descrição | Métrica | Meta |
|----|-----------|---------|------|
| RNF-001 | Tempo de resposta de operações de leitura simples | Latência P95 | < 500 ms, sustentado por índices dedicados por tenant (`(tenant_id, ...)`) e pela constraint `EXCLUDE USING gist` em reservas |
| RNF-002 | Paginação em listagens | Rotas de listagem que aceitam `?page=` e `?limit=` | 100% das rotas de listagem, com limite máximo por página, de modo que o tempo de resposta não degrade com o crescimento do volume por tenant |

### 3.2 Disponibilidade e Confiabilidade

| ID | Descrição | Métrica | Meta |
|----|-----------|---------|------|
| RNF-003 | Continuidade do backend durante atualização ou falha de nó | Réplicas mínimas disponíveis | Backend stateless (sessão inteiramente no JWT) com no mínimo 3 réplicas e `PodDisruptionBudget(minAvailable: 2)` — atualização sem indisponibilidade |
| RNF-004 | Persistência e recuperação dos dados do PostgreSQL | Sobrevivência do dado à recriação do Pod; tempo de restauração a partir de cópia | Volume persistente (PVC) garante o dado na recriação do Pod; procedimento de *backup* e restauração documentado e exercitado, com restauração completa em ambiente limpo. **Fora do escopo por decisão consciente:** réplica Multi-AZ e alta disponibilidade de banco, cujo custo excede o free-tier adotado como restrição do projeto (ver Doc. 05 e Doc. 07) |
| RNF-028 | Entrega confiável de eventos entre serviços | Perda e duplicação de eventos | Nenhum evento perdido quando o broker estiver indisponível — o evento é registrado na mesma transação da alteração que o originou e publicado quando o broker volta; evento entregue mais de uma vez não altera o resultado do consumidor; mensagem que falha repetidamente é isolada sem bloquear as demais |

### 3.3 Segurança

| ID | Descrição | Métrica | Meta |
|----|-----------|---------|------|
| RNF-005 | Autenticação via token, com sessão renovável | JWT assinado, payload `{userId, role, tenantId}`; validade do token de acesso | Token de acesso com validade ≤ 8 horas e renovação sem reautenticação, de modo que a sessão não caia no meio de um turno de trabalho; nenhuma rota autenticada aceita requisição sem token válido |
| RNF-006 | Senha nunca armazenada nem trafegada em texto claro | Algoritmo de hash | `bcrypt` com custo ≥ 10; o hash nunca é retornado por nenhuma rota |
| RNF-007 | Controle de acesso por papel (RBAC) | Middleware `requireRole` nas rotas administrativas | Papéis `ADMIN`, `RECEPTIONIST` e `WAITER` (`CHECK` no banco); criação, edição e exclusão de categorias, quartos, usuários, hóspedes, reservas, contratos e clientes corporativos exclusivas de `ADMIN`; `WAITER` restrito ao lançamento de consumo, sem acesso a gestão ou indicadores |
| RNF-008 | Isolamento multi-tenant em toda operação | `tenant_id` nunca aceito como parâmetro de rota ou body | 100% das consultas filtram por `tenant_id` extraído do JWT; zero rotas aceitando o identificador vindo do cliente, verificado por teste automatizado dedicado |
| RNF-009 | Bloqueio imediato de acesso de tenant suspenso | Middleware de verificação de status aplicado às rotas autenticadas | 100% das rotas autenticadas rejeitam com `403` um tenant cujo `status ≠ ACTIVE`, independentemente de o token ainda estar dentro da validade |
| RNF-010 | Isolamento de rede em produção | Kubernetes `NetworkPolicy` | PostgreSQL aceita conexão apenas do backend; backend apenas do Nginx; nenhum serviço interno com porta exposta fora do cluster (`Service` tipo `ClusterIP`) |
| RNF-011 | Segredos fora do código e da imagem | Kubernetes `Secret` | Zero segredos versionados ou embutidos na imagem; `POSTGRES_PASSWORD` e `JWT_SECRET` injetados via `envFrom`/`secretKeyRef` |
| RNF-012 | Validação de origem de *webhooks* externos | Verificação de assinatura do provedor | 100% dos webhooks validam a assinatura antes de qualquer efeito colateral; requisição sem assinatura válida é rejeitada com `401`. Pré-requisito obrigatório para integração com PSP real |

### 3.4 Escalabilidade

| ID | Descrição | Métrica | Meta |
|----|-----------|---------|------|
| RNF-013 | Escalabilidade horizontal do backend | Réplicas | Backend stateless permite replicação sem risco de inconsistência; escala por número de réplicas, sem afinidade de sessão |
| RNF-014 | Isolamento da carga analítica da carga transacional | Origem de dados do `analytics-service` | Consulta analítica não concorre com a operação de recepção — `analytics-service` com banco próprio, alimentado por eventos do `core-service`, sem acesso ao banco de nenhum outro serviço (ADR-003, Doc. 07) |

### 3.5 Manutenibilidade

| ID | Descrição | Métrica | Meta |
|----|-----------|---------|------|
| RNF-015 | Cobertura de testes automatizados | % de statements/lines/functions/branches | ≥ 60% em statements, lines e functions e ≥ 55% em branches, **imposto pelo CI** — o pipeline falha abaixo do limiar (`vitest.config.js`) |
| RNF-016 | Testes de integração sem mocks de banco | Suíte executada contra PostgreSQL real | Cobertura de autenticação, isolamento multi-tenant, máquina de estados de reserva, pagamentos, B2B, reserva direta/PIX e consumo/fechamento de conta, com Vitest + Supertest |
| RNF-017 | Documentação de APIs | % de endpoints com requisição **e resposta** descritas no OpenAPI | 100% dos endpoints ativos publicados em `/api-docs`, cada resposta de sucesso com `schema` — condição para gerar cliente tipado confiável no frontend |
| RNF-018 | Verificação estática antes do teste | `node --check` em todo o código de aplicação | Executado no CI a cada push/PR, antes da suíte de testes |

### 3.6 Infraestrutura e Deploy

| ID | Descrição | Métrica | Meta |
|----|-----------|---------|------|
| RNF-019 | Imagem Docker enxuta e não-root | Multi-stage build | Estágio `deps` (`npm ci --omit=dev`) + estágio `runner`; execução como `USER node`; imagem final ≤ 150 MB |
| RNF-020 | Orquestração declarativa | Kubernetes via `kustomize` | 100% dos recursos (`Namespace`, `ConfigMap`, `Secret`, `StatefulSet`, `Deployment`, `PVC`, `PodDisruptionBudget`, `NetworkPolicy`) aplicáveis com um único `kubectl apply -k k8s/` |
| RNF-021 | Integração contínua | GitHub Actions a cada push/PR (main/develop) | Instalação de dependências, validação de sintaxe ESM e execução da suíte com cobertura contra PostgreSQL efêmero do próprio job |
| RNF-022 | Deploy e provisionamento automatizados | Pipeline de build/push para registry + Infraestrutura como Código | Imagem publicada automaticamente no registry a cada entrega; 100% dos recursos de nuvem provisionados via Terraform, sem criação manual pelo console (ver Doc. 05) |
| RNF-023 | Documentos gerados entregues por URL assinada | Expiração da URL de download | Contratos e orçamentos em PDF persistidos em armazenamento de objeto; download apenas por URL assinada com expiração ≤ 5 minutos — arquivo com dado pessoal nunca acessível por URL pública permanente |

### 3.7 Usabilidade e Acessibilidade

> Aplicam-se à interface do operador (§2.9). O sistema é usado em pé, no balcão e no salão — a usabilidade é requisito de operação, não acabamento.

| ID | Descrição | Métrica | Meta |
|----|-----------|---------|------|
| RNF-024 | Operação viável pelo celular nas telas de uso móvel | Área de toque e alcance | Alvo de toque ≥ 48 px e ações principais ao alcance do polegar nas telas de comanda e painel do dia; o mapa de reservas e os gráficos têm layout próprio de desktop, nunca a versão espremida |
| RNF-025 | Informação nunca comunicada apenas por cor | Elementos de status com rótulo textual | 100% dos indicadores de status exibem **cor + rótulo**; telas de recepção integralmente navegáveis por teclado, por ser esse o modo de uso do posto |
| RNF-026 | Ação indisponível permanece visível e explicada | Tratamento de ação bloqueada | Ação impedida pela máquina de estados ou pelo papel do usuário aparece desabilitada **com o motivo**, em vez de desaparecer da tela |
| RNF-027 | Retorno de estado em toda tela que depende de dados remotos | Estados tratados por tela | Carregamento, resultado vazio e erro tratados explicitamente; falha de rede em lançamento de consumo não é apresentada como perda do lançamento (ver RF-023) |

---

## 4. Rastreabilidade

| RF | RNFs Relacionados |
|----|--------------------|
| RF-001, RF-002, RF-004 | RNF-005, RNF-006 |
| RF-003, RF-004, RF-005 | RNF-007, RNF-008, RNF-009, RNF-010, RNF-011 |
| RF-010, RF-011 | RNF-001, RNF-004 |
| RF-012, RF-013 | RNF-002 |
| RF-014 a RF-018 | RNF-004, RNF-008 |
| RF-019 a RF-023 | RNF-007 (papel `WAITER`), RNF-002 |
| RF-026, RF-027 | RNF-012 |
| RF-029 a RF-036 | RNF-008, RNF-015 |
| RF-032, RF-035 | RNF-023 |
| RF-037 a RF-043 | RNF-001, RNF-007, RNF-014, RNF-028 |
| RF-044 | RNF-017 |
| RF-046 | RNF-005, RNF-007 |
| RF-047, RF-049, RF-050 | RNF-024, RNF-025, RNF-026, RNF-027 |
| RF-051 | RNF-024, RNF-026, RNF-027 |
| RF-046 a RF-054 | RNF-002 (listagens paginadas), RNF-017 (cliente tipado a partir do OpenAPI) |
| RF-055 | RNF-008, RNF-023 — ficha com dado pessoal amplia o dever de minimização e de eliminação |
| RF-056 | RNF-007 (fechamento nominal), RNF-015 (regra financeira exige teste) |
| Todos os RF de escrita | RNF-015, RNF-016 (exigem cobertura de teste) |
| Toda a API | RNF-019, RNF-020, RNF-021, RNF-022 |

---

## 5. Glossário

| Termo | Definição |
|-------|-----------|
| **PMS** | *Property Management System* — sistema de gestão de propriedades (hotéis/pousadas) |
| **Tenant** | Um hotel/pousada cliente da plataforma SaaS; unidade de isolamento de dados |
| **RBAC** | *Role-Based Access Control* — controle de acesso por papel (`ADMIN`, `RECEPTIONIST`, `WAITER`) |
| **Soft delete** | Exclusão lógica via preenchimento de `deleted_at`, sem remover a linha fisicamente (Sequelize `paranoid: true`) |
| **ADR (métrica)** | *Average Daily Rate* — tarifa média diária, usada no indicador de ocupação (RF-038) |
| **ADR (documento)** | *Architecture Decision Record* — registro de decisão arquitetônica (ver Doc. 07); não confundir com a métrica acima |
| **EXCLUDE USING gist** | Constraint do PostgreSQL que impede fisicamente a sobreposição de intervalos (aqui, datas de reserva por quarto) |
| **Índice único parcial** | Índice `UNIQUE` com cláusula `WHERE` — no Gesway, `WHERE deleted_at IS NULL`, para que a exclusão lógica libere o nome/documento para reuso (RF-018) |
| **Idempotência** | Propriedade de uma operação que, reexecutada com os mesmos dados, não duplica efeito — usada na confirmação de *webhook* PIX (RF-027) e no lançamento offline do garçom (RF-023) |
| **IDOR** | *Insecure Direct Object Reference* — falha em que um usuário acessa recurso de outro trocando um ID na URL; mitigada em `/tenants/me` por não expor ID na rota |
| **PSP** | *Payment Service Provider* — provedor de pagamento que processa a cobrança PIX real |
| **URL assinada** | Endereço temporário de download, com validade curta, que dispensa tornar o arquivo público (RNF-023) |
| **Rack de reservas** | Mapa de ocupação em que as linhas são os quartos e as colunas os dias, permitindo enxergar o período inteiro de uma vez (RF-050) |
| **Comanda** | Conta de consumo aberta para uma suíte, mesa ou *day-use*, na qual o garçom lança os itens (RF-019 a RF-023, RF-051) |
| **Free-tier** | Faixa de uso gratuito do provedor de nuvem; restrição de custo adotada pelo projeto, que delimita o escopo de alta disponibilidade (RNF-004) |

---

## 6. Histórico de Revisões

| Versão | Data | Autor | Descrição da Alteração |
|--------|------|-------|--------------------------|
| 1.0 | 28/08/2026 | Weslley Lucas | Versão inicial. 45 RF e 22 RNF extraídos do código-fonte da implementação — rotas, controllers, models, `db/schema.sql`, middlewares, CI e suíte de testes — cruzados com a numeração de rastreabilidade do Doc. 04 (MER) |
| 1.1 | 02/09/2026 | Gabriel Reis Cunha | Documento tornado normativo: removida a coluna de status dos RF e restaurada a coluna **Meta** nos RNF, conforme o template oficial — o acompanhamento de execução passa ao Doc. 08. Corrigidas quatro divergências apuradas contra `develop`: o papel `WAITER` já consta do `CHECK` do banco (RNF-007 e demais menções), o catálogo de produtos possui rotas e testes (RF-018), o middleware de tenant está aplicado às rotas autenticadas (RNF-009) e a paginação existe em listagem de reservas (RNF-002). Acrescentado RNF-023 (entrega de PDF por URL assinada), ausente na v1.0 embora já exigido por RF-035. Numeração de RF-001 a RF-045 preservada por ser referenciada pelo Doc. 04 |
| 1.2 | 09/09/2026 | Gabriel Reis Cunha | Resolve duas contradições apuradas no cruzamento com o planejamento de execução. **RNF-004:** a réplica Multi-AZ deixa de ser meta e passa a exclusão declarada — seu custo excede o free-tier adotado como restrição do projeto; a meta passa a ser procedimento de *backup* e restauração documentado e exercitado. **RNF-005:** a expiração deixa de ser fixa em 8 horas e passa a token de acesso ≤ 8 h **com renovação sem reautenticação**, para que a sessão não caia no meio de um turno (RF-002 ajustado junto). Acrescenta a seção **2.9 — Interface do Operador** (RF-046 a RF-054) e a seção **3.7 — Usabilidade e Acessibilidade** (RNF-024 a RNF-027): a aplicação web da equipe do hotel não constava do documento, embora seja o meio pelo qual a operação exerce os requisitos anteriores |
| 1.3 | 09/09/2026 | Gabriel Reis Cunha | Acrescenta **RF-055** (ficha de registro do hóspede) e **RF-056** (fechamento de caixa por turno), levantados na comparação das telas do sistema com o padrão de PMS de mercado. Os dois são função de negócio ausente, não detalhe de interface: o cadastro de hóspede tem hoje quatro campos, aquém da ficha que se espera de um meio de hospedagem, e não há conferência de caixa ao fim do turno. A numeração é **incremental**: requisitos novos recebem o próximo número livre e são posicionados na seção temática correspondente, para não alterar identificadores já referenciados pelo Doc. 04 |
| 1.4 | 14/09/2026 | Gabriel Reis Cunha | Coluna **Módulo** realinhada ao **ADR-003** (Documento 07), que fixou o recorte de microsserviços pela consistência transacional. Pagamento, consumo, catálogo, comanda, reserva direta com PIX e fechamento de caixa — RF-014 a RF-023, RF-026, RF-027 e RF-056 — passam de `billing-service` para `core-service`, porque as transações que unem reserva e pagamento não podem ser divididas entre serviços. Clientes corporativos, orçamentos e contratos — RF-029 a RF-036 — formam o `b2b-service`, e o nome `billing-service` deixa de existir. O critério de aceite de RF-033 passa a indicar que a reserva-bloco é criada pelo `core-service`. Com a adoção de eventos no ADR-003, o **RNF-014** passa a exigir banco próprio para o `analytics-service`, alimentado por eventos, e o novo **RNF-028** exige entrega confiável desses eventos — nenhum perdido com o broker fora, nenhum contado em dobro. Nenhum identificador existente foi alterado |

---

**Aprovado por:**

___________________________________________________
Professor(a) Orientador(a)

Data: ___/___/2026
