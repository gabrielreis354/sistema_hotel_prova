# SPEC-03 — Integrações com APIs Externas

**Prioridade:** 🔴 Crítica — critério de aprovação
**Estado:** 🔲 Não iniciado
**Criado em:** 26/08/2026
**Depende de:** nada — **pode começar imediatamente**

---

## 1. Contexto

O Termo de Aceite exige:

> *"O sistema deve consumir e integrar-se com pelo menos uma **API externa** que seja relevante para a regra de negócio do projeto proposto."*

**Estado verificado em 26/08:** não existe **nenhuma** chamada HTTP a serviço de terceiro no código. `grep` por `axios`, `node-fetch`, `undici`, `https.request` e `fetch(` em `app/` retorna vazio.

A única tentativa é o PIX, e está explicitamente simulada:

```js
// app/services/pix/index.js
const PROVIDERS = { fake: FakePixProvider };
// "Default: 'fake' (simulado) — adequado para demo/TCC."
```

**Boa notícia:** a arquitetura já está preparada. Existe o contrato `PixProvider.js` com inversão de dependência — plugar um provedor real é criar um arquivo e registrar no *switch*, não redesenhar nada. Isso é ADR material: a decisão de isolar o provedor atrás de uma abstração se paga agora.

**Decisão da equipe (23/08):** ViaCEP primeiro por ser mais rápida; Mercado Pago depois, por ser mais relevante ao negócio.

---

## 2. Objetivo

Ter pelo menos uma integração com API externa real, funcionando e testada, relevante para a regra de negócio.

---

## 3. Escopo

### 3.1 Dentro do escopo

- Integração **ViaCEP** — preenchimento de endereço por CEP
- Integração **Mercado Pago sandbox** — cobrança PIX real
- Tratamento de falha: *timeout*, indisponibilidade, resposta inválida
- Testes que não dependem do serviço externo estar no ar

### 3.2 Fora do escopo

- Processamento de transação financeira real — apenas *sandbox*
- Múltiplos provedores de pagamento
- *Webhook* com validação de assinatura criptográfica do PSP real (avaliar na T-03.2)

---

## 4. Restrições

| Restrição | Motivo |
|-----------|--------|
| Falha da API externa **não pode derrubar** o fluxo principal | Um CEP indisponível não pode impedir o cadastro do hóspede |
| Testes automatizados **não podem depender** de rede | O CI ficaria instável e falharia por motivo alheio ao código |
| Nenhuma credencial versionada | `.env` no `.gitignore`; versionar só `.env.example` |
| Manter o padrão de inversão de dependência já usado no PIX | Convenção do repositório |

---

## 5. Tarefas

### T-03.1 — Integração ViaCEP 🔲

**Estimativa:** meio dia
**Uso no negócio:** ao cadastrar hóspede (`guests`) ou cliente corporativo (`corporate_clients`), preencher endereço a partir do CEP.

**Critérios de aceitação**
- [ ] **CA-03.1.a** — Endpoint `GET /address/:cep` consulta a ViaCEP e devolve endereço estruturado
- [ ] **CA-03.1.b** — CEP inválido devolve **400** com mensagem clara, não 500
- [ ] **CA-03.1.c** — CEP inexistente devolve **404**
- [ ] **CA-03.1.d** — *Timeout* configurado; API fora do ar devolve **503**, sem travar a requisição
- [ ] **CA-03.1.e** — Serviço isolado atrás de abstração, no padrão de `app/services/pix/`
- [ ] **CA-03.1.f** — Testes com o cliente HTTP mockado — sem depender de rede
- [ ] **CA-03.1.g** — Documentado no Swagger com schema de resposta
- [ ] **CA-03.1.h** — `tenant_id` respeitado; endpoint exige autenticação

> **Decisão de desenho:** a consulta é **de apoio ao preenchimento**, não fonte de verdade. O endereço continua sendo salvo como texto no cadastro — a integração preenche o formulário, não cria dependência de terceiro para o dado existir.

---

### T-03.2 — Integração Mercado Pago (sandbox) 🔲

**Estimativa:** 2 a 3 dias
**Uso no negócio:** cobrança PIX real no motor de reserva direta, substituindo o `FakePixProvider`.

**Critérios de aceitação**
- [ ] **CA-03.2.a** — `MercadoPagoPixProvider` implementa o contrato `PixProvider` existente
- [ ] **CA-03.2.b** — Registrado no *switch* de `PROVIDERS`, selecionável por `PIX_PROVIDER=mercadopago`
- [ ] **CA-03.2.c** — Cobrança real criada no *sandbox*, com QR Code e *payload* copia-e-cola válidos
- [ ] **CA-03.2.d** — *Webhook* de confirmação processa notificação real do provedor
- [ ] **CA-03.2.e** — Validação de autenticidade da notificação — não confiar em `POST` anônimo
- [ ] **CA-03.2.f** — `FakePixProvider` **permanece** e continua sendo o padrão em teste
- [ ] **CA-03.2.g** — `tests/public-booking.test.js` continua passando com o *fake*
- [ ] **CA-03.2.h** — Credenciais via variável de ambiente; `.env.example` atualizado
- [ ] **CA-03.2.i** — Falha do provedor não deixa `Payment` em estado inconsistente

> **Ponto de atenção:** o `PaymentModel` já tem `provider`, `provider_charge_id`, `pix_qr_code`, `pix_expiration` e os *status* `PENDING`/`PAID`/`EXPIRED`/`FAILED`. O modelo de dados **já está pronto** para o provedor real — os campos foram criados pensando nisso. A integração deve usá-los, não criar estrutura nova.

---

### T-03.3 — Documentar a decisão como ADR 🔲

**DEP:** T-03.1, T-03.2

**Critérios de aceitação**
- [ ] **CA-03.3.a** — ADR registrando escolha dos provedores, alternativas consideradas e consequências
- [ ] **CA-03.3.b** — Registra explicitamente por que o padrão *provider* com inversão de dependência foi mantido
- [ ] **CA-03.3.c** — Documenta a estratégia de teste sem rede

---

## 6. Definition of Done

- [ ] Pelo menos uma integração externa real funcionando em produção
- [ ] Suíte de testes verde, sem depender de rede
- [ ] Swagger atualizado com schema de resposta
- [ ] Falha do serviço externo tratada de forma degradada, não catastrófica
- [ ] ADR escrito

---

## 7. Riscos

| Risco | Impacto | Mitigação |
|-------|---------|-----------|
| Testes ficarem instáveis por dependência de rede | Alto — CI não confiável | CA-03.1.f e CA-03.2.g: mock obrigatório |
| Credencial de sandbox vazar em commit | 🔴 Segurança | `.env` no `.gitignore`; revisão antes do commit |
| Mercado Pago exigir homologação demorada | Médio | ViaCEP (T-03.1) já satisfaz o critério do Termo sozinha |
| Provedor real deixar `Payment` inconsistente em falha | Alto — dado financeiro | CA-03.2.i; transação Sequelize no fluxo |

> **Mitigação de escopo:** T-03.1 sozinha **já fecha o critério do Termo**. T-03.2 agrega valor de produto e material de defesa, mas não é o que separa aprovação de reprovação. Se o prazo apertar, T-03.1 é o piso seguro.

---

## 8. Histórico

| Versão | Data | Autor | Alteração |
|--------|------|-------|-----------|
| 1.0 | 26/08/2026 | Gabriel Reis Cunha | Criação |
