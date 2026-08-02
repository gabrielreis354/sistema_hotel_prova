# User Stories — Módulo Orçamentos e Contratos
**Extração:** Projeto `orcamento_julubi2` → Sistema de Gestão de Hotel SaaS
**Data:** 09/07/2026 | **Metodologia:** RPI (Research completo do código-fonte)

---

## Contexto de Negócio

O hotel recebe solicitações de **organizações** (igrejas, empresas, escolas, associações) que querem fechar o espaço por um período. O atendente gera uma proposta de preço (orçamento), o cliente aprova e assina o contrato com cronograma de pagamento.

```
ORGANIZAÇÃO solicita cotação
       ↓
ATENDENTE cria Orçamento (Simples ou Corporativo)
       ↓
Gera PDF da proposta → envia ao cliente
       ↓
Cliente aprova → ATENDENTE converte em Contrato
       ↓
Gera PDF jurídico com cláusulas + cronograma de parcelas
       ↓
Armazena PDF + acompanha pagamentos
```

---

## Personas

| ID | Persona | Descrição |
|----|---------|-----------|
| **P1** | Atendente | Funcionário do hotel que recebe demandas, cria orçamentos e contratos |
| **P2** | Gerente/Admin | Configura o sistema, gerencia usuários, tem acesso total |
| **P3** | Organização Cliente | Empresa/igreja/escola que solicita cotação (não acessa o sistema) |

---

## EPIC 1 — Autenticação e Usuários

### US-001: Login no sistema
**Como** atendente ou gerente,  
**quero** acessar o sistema com usuário e senha,  
**para** ter acesso seguro às minhas funções sem expor dados de outros usuários.

**Critérios de aceite:**
- [ ] Campo de login (código de usuário) e senha obrigatórios
- [ ] Senha comparada com hash armazenado (não em texto puro)
- [ ] Token JWT gerado e armazenado em cookie httpOnly
- [ ] Redirecionamento para Home após login bem-sucedido
- [ ] Mensagem de erro clara para credenciais inválidas (sem revelar qual campo está errado)
- [ ] Sessão expirada redireciona para login automaticamente

**Prioridade:** Alta | **Complexidade:** Baixa

---

### US-002: Recuperação de senha
**Como** atendente,  
**quero** recuperar minha senha caso a esqueça,  
**para** não precisar acionar o gerente toda vez.

**Critérios de aceite:**
- [ ] Tela de "esqueci minha senha" acessível sem login
- [ ] Validação do código de usuário antes de permitir troca
- [ ] Nova senha definida pelo próprio usuário
- [ ] Confirmação de sucesso após alteração

**Prioridade:** Média | **Complexidade:** Baixa

---

### US-003: Gerenciar usuários do sistema
**Como** gerente (admin),  
**quero** criar, editar e remover usuários,  
**para** controlar quem tem acesso ao sistema e com qual nível de permissão.

**Critérios de aceite:**
- [ ] Criar usuário com: código único, nome, email, senha, nível de privilégio
- [ ] Editar dados do usuário (exceto código)
- [ ] Remover usuário com confirmação
- [ ] Código de usuário não pode ser duplicado (409 Conflict)
- [ ] Apenas usuários com privilégio admin acessam esta tela
- [ ] Senha nunca exibida — apenas permite redefinição

**Prioridade:** Média | **Complexidade:** Baixa

---

## EPIC 2 — Gestão de Clientes Corporativos

### US-004: Cadastrar cliente corporativo
**Como** atendente,  
**quero** cadastrar a organização que está solicitando o orçamento,  
**para** associar ao orçamento e ao contrato sem redigitar dados.

**Critérios de aceite:**
- [ ] Campos obrigatórios: nome/razão social, CPF ou CNPJ
- [ ] Validação de CPF (11 dígitos, cálculo de dígito verificador)
- [ ] Validação de CNPJ (14 dígitos, cálculo de dígito verificador)
- [ ] Máscara automática conforme tipo: `000.000.000-00` (CPF) ou `00.000.000/0000-00` (CNPJ)
- [ ] Campos opcionais: email, telefone
- [ ] Feedback visual de sucesso/erro após salvar
- [ ] Cliente aparece imediatamente na lista após criação

**Prioridade:** Alta | **Complexidade:** Baixa

---

### US-005: Cadastrar endereço do cliente via CEP
**Como** atendente,  
**quero** preencher o endereço do cliente informando apenas o CEP,  
**para** agilizar o cadastro e evitar erros de digitação.

**Critérios de aceite:**
- [ ] Campo CEP com máscara `00000-000`
- [ ] Ao sair do campo CEP: consulta automática na API ViaCEP
- [ ] Preenchimento automático de: rua, bairro, cidade, UF
- [ ] Campo "número" sempre manual (ViaCEP não retorna)
- [ ] Erro amigável se CEP não encontrado (sem travar o formulário)
- [ ] Endereço salvo em formato texto único: `Rua X, nº Y – Bairro Z – Cidade – UF, CEP: 00000-000`

**Prioridade:** Média | **Complexidade:** Baixa

---

### US-006: Cadastrar representante legal do cliente
**Como** atendente,  
**quero** registrar o representante legal da organização,  
**para** que o contrato tenha os dados jurídicos corretos para assinatura.

**Critérios de aceite:**
- [ ] Campos: nome completo, CPF, RG (todos obrigatórios para contrato)
- [ ] CPF do representante validado individualmente
- [ ] Representante pode ser cadastrado no ato do cliente ou depois ao gerar o contrato
- [ ] Se cliente não tem representante ao gerar contrato: sistema abre formulário de completar dados antes de prosseguir
- [ ] Dados do representante aparecem no PDF do contrato como "snapshot" (não muda retroativamente)

**Prioridade:** Alta | **Complexidade:** Baixa

---

### US-007: Listar, editar e excluir clientes
**Como** atendente,  
**quero** visualizar todos os clientes cadastrados com filtros e poder editá-los ou removê-los,  
**para** manter o cadastro atualizado.

**Critérios de aceite:**
- [ ] Tabela com busca global (nome, CPF/CNPJ, email)
- [ ] Filtros por coluna
- [ ] Ordenação clicável nos cabeçalhos
- [ ] Edição via modal sem sair da página
- [ ] Exclusão com confirmação obrigatória
- [ ] Feedback de erro se cliente está vinculado a orçamento/contrato ativo

**Prioridade:** Alta | **Complexidade:** Baixa

---

## EPIC 3 — Catálogo (Tipos de Evento e Serviços)

### US-008: Gerenciar tipos de evento
**Como** gerente,  
**quero** cadastrar e manter os tipos de evento que o hotel atende,  
**para** categorizar os orçamentos e facilitar relatórios futuros.

**Critérios de aceite:**
- [ ] Criar tipo de evento com nome (ex: "Corporativo", "Religioso", "Educacional")
- [ ] Editar nome de tipo existente
- [ ] Remover tipo com confirmação
- [ ] Tipo de evento obrigatório na criação do orçamento
- [ ] Não permite excluir tipo vinculado a orçamento ativo

**Exemplos de uso:** Retiro Espiritual, Congresso Empresarial, Colônia de Férias, Conferência Acadêmica

**Prioridade:** Média | **Complexidade:** Baixa

---

### US-009: Gerenciar serviços adicionais
**Como** gerente,  
**quero** cadastrar serviços extras que podem ser incluídos nos orçamentos,  
**para** que os atendentes selecionem na hora de orçar sem redigitar.

**Critérios de aceite:**
- [ ] Criar serviço com nome
- [ ] Editar e remover serviços
- [ ] Serviços ficam disponíveis para seleção em qualquer orçamento
- [ ] Ao adicionar ao orçamento: atendente informa quantidade, valor unitário e número de diárias
- [ ] Total do serviço calculado automaticamente: `quantidade × valor × diárias`

**Exemplos:** Coffee Break, Transporte, Decoração, Sonorização, Palco

**Prioridade:** Média | **Complexidade:** Baixa

---

## EPIC 4 — Orçamento Simples

### US-010: Criar orçamento simples para grupo único
**Como** atendente,  
**quero** criar um orçamento para um grupo homogêneo de pessoas,  
**para** responder rapidamente a pedidos de cotação de igrejas ou empresas menores.

**Critérios de aceite:**
- [ ] Campos obrigatórios: cliente, tipo de evento, check-in, check-out, número de pessoas
- [ ] Valor da diária com alimentação e sem alimentação (pelo menos um preenchido)
- [ ] Opção "inclui roupa de cama" (checkbox)
- [ ] Opção "alimentação inclusa" (checkbox — altera qual diária é considerada)
- [ ] Observações (campo livre, opcional)
- [ ] Status inicial: "Enviado"
- [ ] Orçamento salvo e aparece na listagem imediatamente

**Prioridade:** Alta | **Complexidade:** Média

---

### US-011: Calcular total do orçamento automaticamente
**Como** atendente,  
**quero** que o sistema calcule o valor total do orçamento enquanto preencho os campos,  
**para** não precisar fazer cálculos manuais e evitar erros.

**Critérios de aceite:**
- [ ] Cálculo automático ao mudar qualquer campo de preço ou quantidade
- [ ] Fórmula: `(pessoas × diárias × valor_diária) + Σ(serviços) - desconto`
- [ ] Número de diárias calculado automaticamente por `checkout - checkin`
- [ ] Desconto em percentual (0–100%) aplicado sobre subtotal
- [ ] Total exibido formatado em R$ com atualização em tempo real
- [ ] Total não editável diretamente (apenas via campos de entrada)

**Prioridade:** Alta | **Complexidade:** Baixa

---

### US-012: Adicionar serviços adicionais ao orçamento
**Como** atendente,  
**quero** incluir serviços extras no orçamento (coffee break, transporte, etc.),  
**para** apresentar ao cliente uma proposta completa.

**Critérios de aceite:**
- [ ] Seleção de serviço do catálogo pré-cadastrado
- [ ] Campos por serviço: quantidade, valor unitário, número de diárias
- [ ] Total do serviço calculado: `quantidade × valor × diárias`
- [ ] Pode adicionar múltiplos serviços
- [ ] Pode remover serviço individualmente
- [ ] Serviços listados em tabela com total parcial
- [ ] Total geral atualizado ao adicionar/remover serviço

**Prioridade:** Alta | **Complexidade:** Baixa

---

### US-013: Gerar PDF do orçamento simples
**Como** atendente,  
**quero** gerar um PDF profissional do orçamento para enviar ao cliente,  
**para** que a proposta chegue formatada com a identidade do hotel.

**Critérios de aceite:**
- [ ] PDF gerado com: logo do hotel, dados do cliente, período, pessoas
- [ ] Tabela de hospedagem: tipo de quarto, diárias, valor/dia, total
- [ ] Tabela de serviços adicionais (se houver)
- [ ] Resumo financeiro: subtotal, desconto, total final em BRL
- [ ] Header e footer em todas as páginas com dados de contato do hotel
- [ ] Geração em memória (sem salvar no servidor) — download direto no navegador
- [ ] Nome do arquivo: `orcamento_{nomeCliente}_{data}.pdf`

**Prioridade:** Alta | **Complexidade:** Média

---

### US-014: Editar orçamento existente
**Como** atendente,  
**quero** editar um orçamento já criado,  
**para** atualizar valores após negociação com o cliente.

**Critérios de aceite:**
- [ ] Clicar em editar carrega todos os dados no formulário
- [ ] Scroll automático para o formulário ao abrir edição
- [ ] Todos os campos editáveis
- [ ] Serviços associados carregados e editáveis individualmente
- [ ] Salvar substitui o orçamento (não cria duplicata)
- [ ] Confirmação visual de sucesso após salvar

**Prioridade:** Alta | **Complexidade:** Baixa

---

### US-015: Acompanhar status do orçamento
**Como** atendente,  
**quero** atualizar o status do orçamento conforme o processo avança,  
**para** saber quais propostas estão pendentes, confirmadas ou perdidas.

**Critérios de aceite:**
- [ ] Status disponíveis: "Enviado", "Confirmado", "Cancelado"
- [ ] Status visível na listagem com cor diferente (verde/amarelo/vermelho)
- [ ] Atendente pode alterar status manualmente
- [ ] Histórico de status não é requisito para TCC (apenas o status atual)

**Prioridade:** Média | **Complexidade:** Baixa

---

### US-016: Visualizar histórico de orçamentos
**Como** atendente,  
**quero** ver todos os orçamentos em tabela ou cards,  
**para** acompanhar o pipeline de propostas do hotel.

**Critérios de aceite:**
- [ ] Exibição em tabela (visão densa) ou cards (visão resumida) — alternável
- [ ] Card exibe: nome do cliente, status, check-in/out, total, data de registro
- [ ] Tabela com ordenação e filtro
- [ ] Ações por item: editar, excluir, gerar PDF
- [ ] Excluir com confirmação obrigatória
- [ ] Excluir remove também os serviços associados (cascade)

**Prioridade:** Alta | **Complexidade:** Baixa

---

## EPIC 5 — Orçamento Corporativo (Multi-Grupos)

### US-017: Criar orçamento corporativo com múltiplos grupos
**Como** atendente,  
**quero** criar um orçamento onde diferentes grupos têm quartos e diárias distintos,  
**para** atender eventos com delegações, famílias separadas ou categorias de participantes.

**Contexto:** Uma conferência religiosa com 200 pessoas pode ter: 50 pastores em quartos individuais + 120 participantes em quartos duplos + 30 crianças em quartos triplos com as famílias.

**Critérios de aceite:**
- [ ] Tipo "Corporativo" selecionável na criação de orçamento
- [ ] Formulário de grupo com: nome do grupo, check-in, check-out, quantidade de pessoas, tipo de quarto
- [ ] Tipo de quarto: Single, Duplo, Triplo, Quádruplo
- [ ] Valor de diária com alimentação e sem alimentação por grupo
- [ ] Cada grupo com check-in/out independente (grupos podem ter períodos diferentes)
- [ ] Pode adicionar, editar e remover grupos individualmente
- [ ] Total do grupo calculado: `(checkout - checkin) × pessoas × valor_diária_selecionada`
- [ ] Total final do orçamento = Σ(todos os grupos) + serviços - desconto

**Prioridade:** Alta | **Complexidade:** Alta

---

### US-018: Gerenciar grupos dentro do orçamento corporativo
**Como** atendente,  
**quero** adicionar e editar grupos individualmente sem refazer o orçamento inteiro,  
**para** ajustar a proposta conforme o cliente vai confirmando os detalhes.

**Critérios de aceite:**
- [ ] Tabela de grupos com: nome, checkin, checkout, pessoas, tipo quarto, diária, total
- [ ] Botão "Adicionar Grupo" abre modal de preenchimento
- [ ] Editar grupo abre modal com dados preenchidos
- [ ] Remover grupo atualiza o total geral imediatamente
- [ ] "Salvar Grupos" sincroniza com o backend (cria novos, atualiza existentes, remove excluídos)
- [ ] Grupos persistem mesmo ao fechar e reabrir o orçamento

**Prioridade:** Alta | **Complexidade:** Média

---

### US-019: Gerar PDF do orçamento corporativo
**Como** atendente,  
**quero** gerar um PDF do orçamento corporativo com tabela de grupos,  
**para** apresentar ao cliente uma proposta clara de como os valores foram calculados.

**Critérios de aceite:**
- [ ] PDF inclui: tabela de grupos com colunas (nome, período, dias, pessoas, quarto, valor/dia, total)
- [ ] Subtotal de hospedagem por modalidade (com alimentação / sem alimentação)
- [ ] Tabela de serviços adicionais (se houver)
- [ ] Resumo: total hospedagem + total serviços - desconto = total final
- [ ] Fotos ilustrativas do espaço incluídas no PDF
- [ ] Mesmo layout profissional do orçamento simples

**Prioridade:** Alta | **Complexidade:** Média

---

## EPIC 6 — Contratos

### US-020: Criar contrato a partir de orçamento aprovado
**Como** atendente,  
**quero** converter um orçamento aprovado em contrato jurídico,  
**para** formalizar o acordo com a organização cliente.

**Critérios de aceite:**
- [ ] Selecionar cliente (obrigatório)
- [ ] Selecionar orçamento de referência (opcional — mas preenche automaticamente dados)
- [ ] Ao selecionar orçamento: preenche automaticamente período, pessoas, valor total, nome do evento
- [ ] Campos editáveis mesmo após preenchimento automático
- [ ] Se cliente não tem representante legal: sistema bloqueia e abre formulário de completar dados
- [ ] Status inicial: "Gerado"
- [ ] Salvar gera e faz upload do PDF automaticamente

**Prioridade:** Alta | **Complexidade:** Alta

---

### US-021: Definir objeto e cláusulas do contrato
**Como** atendente,  
**quero** descrever o que o hotel está contratando para a organização,  
**para** que o contrato seja legalmente claro sobre o escopo da prestação.

**Critérios de aceite:**
- [ ] Campo "Objeto do contrato": texto livre (ex: "Locação temporária do espaço para retiro espiritual, incluindo alimentação e hospedagem")
- [ ] Cláusulas padrão já incluídas no template do PDF (não precisam ser redigitadas)
- [ ] Cláusulas do template incluem: período de uso, horários, responsabilidades, cancelamento
- [ ] Dados do locatário (endereço e representante) capturados como snapshot do cliente no momento da criação

**Prioridade:** Alta | **Complexidade:** Baixa

---

### US-022: Configurar parcelas de pagamento no contrato
**Como** atendente,  
**quero** definir o cronograma de pagamento em parcelas,  
**para** que o contrato reflita exatamente como o cliente vai pagar.

**Critérios de aceite:**
- [ ] Adicionar múltiplas parcelas dinamicamente
- [ ] Cada parcela: descrição (ex: "Entrada", "Saldo"), data de vencimento, valor
- [ ] Total das parcelas deve ser igual ao valor total do contrato (validação)
- [ ] Pode adicionar/remover parcelas antes de salvar
- [ ] Parcelas aparecem no PDF como tabela dentro da Cláusula de Pagamento
- [ ] Parcelas salvas no banco vinculadas ao contrato
- [ ] Edição de parcelas possível após criação do contrato

**Prioridade:** Alta | **Complexidade:** Média

---

### US-023: Definir testemunhas do contrato
**Como** atendente,  
**quero** registrar os nomes das testemunhas do contrato,  
**para** que o PDF tenha os campos de assinatura corretos.

**Critérios de aceite:**
- [ ] Dois campos de nome de testemunha (obrigatórios)
- [ ] Nomes aparecem nos campos de assinatura do PDF
- [ ] Validação: ambos os campos preenchidos antes de gerar contrato

**Prioridade:** Alta | **Complexidade:** Baixa

---

### US-024: Anexar cardápio ao contrato
**Como** atendente,  
**quero** adicionar o PDF do cardápio como anexo ao contrato,  
**para** que o cliente receba um documento único com hospedagem e alimentação.

**Critérios de aceite:**
- [ ] Upload de arquivo PDF (cardápio)
- [ ] Sistema mescla o PDF do cardápio ao final do PDF do contrato
- [ ] PDF final: contrato (N páginas) + cardápio (M páginas) = documento único
- [ ] Cardápio é opcional — contrato pode ser gerado sem ele
- [ ] URL do arquivo armazenada no banco para acesso posterior
- [ ] Tamanho máximo de arquivo validado antes do upload

**Prioridade:** Média | **Complexidade:** Média

---

### US-025: Gerar PDF jurídico do contrato
**Como** atendente,  
**quero** gerar o PDF do contrato com formatação profissional e cláusulas legais,  
**para** enviar ao cliente para assinatura.

**Critérios de aceite:**
- [ ] PDF inclui todas as seções legais: locador, locatário, imóvel, objeto, cláusulas, assinaturas
- [ ] Seção A — Locador: dados fixos do hotel
- [ ] Seção B — Locatário: nome e dados da organização (snapshot)
- [ ] Seção C — Imóvel: dados fixos do local
- [ ] Cláusula de período: datas e horários de check-in/out
- [ ] Cláusula de pagamento: tabela de parcelas (descrição, data, valor)
- [ ] Espaços para assinatura: Locador, Locatário, Testemunha 1, Testemunha 2
- [ ] Logo do hotel em todas as páginas (exceto primeira)
- [ ] Footer com telefone, site e e-mail do hotel
- [ ] Valores formatados por extenso (ex: R$ 18.000,00)
- [ ] Upload automático para armazenamento (Supabase) após geração
- [ ] URL do PDF salva no banco para acesso futuro

**Prioridade:** Alta | **Complexidade:** Alta

---

### US-026: Armazenar e acessar PDF do contrato
**Como** atendente,  
**quero** acessar o PDF do contrato a qualquer momento após geração,  
**para** reenviar ao cliente ou consultar o histórico.

**Critérios de aceite:**
- [ ] PDF salvo em armazenamento persistente (não no servidor local)
- [ ] URL pública e permanente retornada após upload
- [ ] Botão "Ver PDF" no card do contrato abre o documento em nova aba
- [ ] PDF disponível mesmo após logout/login
- [ ] Contrato com cardápio retorna PDF mesclado (não dois arquivos)

**Prioridade:** Alta | **Complexidade:** Baixa (infraestrutura já existe)

---

### US-027: Editar contrato existente
**Como** atendente,  
**quero** editar um contrato após criação,  
**para** corrigir dados sem precisar criar um novo contrato.

**Critérios de aceite:**
- [ ] Edição de todos os campos exceto cliente e orçamento de referência
- [ ] Edição de parcelas individualmente (adicionar, editar, remover)
- [ ] Opção de regenerar PDF após edição
- [ ] Novo PDF sobrescreve o anterior no armazenamento
- [ ] Status pode ser alterado manualmente durante edição

**Prioridade:** Alta | **Complexidade:** Média

---

### US-028: Acompanhar contratos por status
**Como** atendente,  
**quero** visualizar os contratos filtrados por status,  
**para** saber quais estão pendentes de assinatura ou já concluídos.

**Critérios de aceite:**
- [ ] Status disponíveis: "Gerado", "Assinado", "Cancelado"
- [ ] Dashboard com cards de contratos
- [ ] Filtro por status no topo da listagem
- [ ] Card exibe: nome organização, período, valor total, data de criação
- [ ] Ações por card: editar, excluir, ver PDF
- [ ] Excluir remove também as parcelas associadas (cascade)
- [ ] Confirmação obrigatória antes de excluir

**Prioridade:** Alta | **Complexidade:** Baixa

---

## Resumo de Priorização para o TCC

### Fase 1 — MVP (implementar primeiro)
| US | Título | Justificativa |
|----|--------|--------------|
| US-001 | Login | Pré-requisito de tudo |
| US-004 | Cadastrar cliente | Base do fluxo |
| US-006 | Representante legal | Obrigatório para contrato |
| US-010 | Orçamento simples | Feature principal |
| US-011 | Cálculo automático | Parte do US-010 |
| US-013 | PDF do orçamento | Entregável para o cliente |
| US-020 | Criar contrato | Feature principal |
| US-022 | Parcelas | Parte do US-020 |
| US-025 | PDF do contrato | Entregável final |

### Fase 2 — Complemento
| US | Título | Justificativa |
|----|--------|--------------|
| US-017 | Orçamento corporativo | Diferencial competitivo |
| US-018 | Grupos | Parte do US-017 |
| US-019 | PDF corporativo | Parte do US-017 |
| US-005 | CEP automático | UX, não é bloqueador |
| US-024 | Anexar cardápio | Diferencial, não crítico |
| US-008 | Tipos de evento | Configuração |
| US-009 | Serviços adicionais | Configuração |

### Fase 3 — Opcional
| US | Título | Justificativa |
|----|--------|--------------|
| US-002 | Recuperação de senha | Conforto do usuário |
| US-003 | Gestão de usuários | Admin, pode ser fixo no TCC |
| US-015 | Status do orçamento | Processual |
| US-027 | Editar contrato | Pode ser deletar+recriar no TCC |

---

## Mapeamento para o SaaS (Integração Futura)

| Entidade `orcamento_julubi2` | Entidade SaaS | Adaptação necessária |
|------------------------------|---------------|---------------------|
| `tb06_clientes_orc` | `guests` (existente) + campo CNPJ | Adicionar CNPJ, representante_nome/cpf/rg |
| `tb07_categorias` | Nova tabela `event_categories` | + tenant_id |
| `tb08_servicos` | Nova tabela `services` | + tenant_id |
| `tb05_orcamentos` | Nova tabela `event_quotes` | + tenant_id, FK para guest |
| `tb10_grupo_orcamento` | Nova tabela `quote_groups` | + tenant_id |
| `tb09_orcamento_servicos` | Nova tabela `quote_services` (pivô) | + tenant_id |
| `tb11_contratos` | Nova tabela `contracts` | + tenant_id, FK para event_quotes |
| `tb11_contrato_parcelas` | Nova tabela `contract_installments` | + tenant_id |
| PDF (Supabase) | Supabase Storage | Reutilizar bucket, adicionar tenant no path |

---

*Documento gerado em: 09/07/2026*
*Fonte: Research completo do código-fonte de `orcamento_julubi2` (backend + frontend)*
*Próximo passo: Aprovar priorização e iniciar implementação dos módulos no SaaS*
