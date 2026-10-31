# SPEC-03 — Integrações com APIs Externas

**Prioridade:** 🔴 Crítica — critério de aprovação
**Estado:** 🟡 Em andamento — T-03.1 concluída em 16/09/2026; T-03.2 com cobrança real no *sandbox* do Asaas em 16/10/2026, faltando o *webhook* chamado pelo próprio Asaas
**Criado em:** 26/08/2026
**Depende de:** nada — **pode começar imediatamente**

---

## 1. Contexto

O Termo de Aceite exige:

> *"O sistema deve consumir e integrar-se com pelo menos uma **API externa** que seja relevante para a regra de negócio do projeto proposto."*

**Estado verificado em 26/08:** não existe **nenhuma** chamada HTTP a serviço de terceiro no código. `grep` por `axios`, `node-fetch`, `undici`, `https.request` e `fetch(` em `app/` retorna vazio.

A única tentativa é o PIX, e está explicitamente simulada:

```js
// services/core-service/app/services/pix/index.js
const PROVIDERS = { fake: FakePixProvider };
// "Default: 'fake' (simulado) — adequado para demo/TCC."
```

**Boa notícia:** a arquitetura já está preparada. Existe o contrato `PixProvider.js` com inversão de dependência — plugar um provedor real é criar um arquivo e registrar no *switch*, não redesenhar nada. Isso é ADR material: a decisão de isolar o provedor atrás de uma abstração se paga agora.

**Decisão da equipe (23/08):** ViaCEP primeiro por ser mais rápida; Mercado Pago depois, por ser mais relevante ao negócio.

**Atualização (31/10):** o código do Mercado Pago entrou em 12/10 (PR #89), mas a validação no *sandbox* dele não foi feita. O Asaas entrou como segundo provedor real em 17/10 (`1cbc4c0`), foi testado no *sandbox* real em 16/10 e é o provedor do passo 6 do roteiro de demonstração. Os dois ficam atrás do mesmo contrato `PixProvider`.

---

## 2. Objetivo

Ter pelo menos uma integração com API externa real, funcionando e testada, relevante para a regra de negócio.

---

## 3. Escopo

### 3.1 Dentro do escopo

- Integração **ViaCEP** — preenchimento de endereço por CEP
- Integração PIX com PSP real em *sandbox* — **Asaas** (validado, provedor do roteiro) e **Mercado Pago** (código pronto, sem validação no *sandbox*)
- Tratamento de falha: *timeout*, indisponibilidade, resposta inválida
- Testes que não dependem do serviço externo estar no ar

### 3.2 Fora do escopo

- Processamento de transação financeira real — apenas *sandbox*
- Mais de um provedor ativo ao mesmo tempo — o ambiente escolhe um só, por `PIX_PROVIDER`
- Cartão de crédito (tokenização, captura e análise de risco)

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

### T-03.1 — Integração ViaCEP ✅

**Estimativa:** meio dia
**Uso no negócio:** ao cadastrar hóspede (`guests`) ou cliente corporativo (`corporate_clients`), preencher endereço a partir do CEP.

**Concluída em 16/09/2026.** Branch `feature/viacep-integration`. Relatório:
`docs/historico_sessao/weslley/viacep_e_decisao_k8s_16set2026.md`.

**Critérios de aceitação**
- [x] **CA-03.1.a** — Endpoint `GET /address/:cep` consulta a ViaCEP e devolve endereço estruturado
- [x] **CA-03.1.b** — CEP inválido devolve **400** com mensagem clara, não 500
- [x] **CA-03.1.c** — CEP inexistente devolve **404**
- [x] **CA-03.1.d** — *Timeout* configurado; API fora do ar devolve **503**, sem travar a requisição
- [x] **CA-03.1.e** — Serviço isolado atrás de abstração, no padrão de `services/core-service/app/services/pix/`
- [x] **CA-03.1.f** — Testes com o cliente HTTP mockado — sem depender de rede
- [x] **CA-03.1.g** — Documentado no Swagger com schema de resposta
- [x] **CA-03.1.h** — `tenant_id` respeitado; endpoint exige autenticação

> **Decisão de desenho:** a consulta é **de apoio ao preenchimento**, não fonte de verdade. O endereço continua sendo salvo como texto no cadastro — a integração preenche o formulário, não cria dependência de terceiro para o dado existir.

---

### T-03.2 — PIX com PSP real no *sandbox* (Mercado Pago e Asaas) 🟡

**Estimativa:** 2 a 3 dias
**Uso no negócio:** cobrança PIX real no motor de reserva direta, no lugar do `FakePixProvider`.

**Código pronto em 07/10/2026** (`feature/mercadopago-pix`): provider, `verifyWebhook` com o
`x-signature` do MP, consulta de status na fonte antes de marcar `PAID`, conferência de valor
fail-safe. Duas auditorias qa-redteam em `docs/qa/redteam_mercadopago-pix_*`. **Falta** validar
contra o *sandbox* real (CA-03.2.c e d), com `MERCADOPAGO_ACCESS_TOKEN` de teste e uma URL
pública para o *webhook*. **Pendência conhecida:** reconciliação quando o PSP esgota os
reenvios (achado 🟡 nº 3, item c, da reauditoria) — hoje o pagamento fica `PENDING`.

**Asaas, na `develop` desde 17/10/2026** (`1cbc4c0`), selecionável por `PIX_PROVIDER=asaas`:
provider com trava de *sandbox* (recusa URL fora de `api-sandbox.asaas.com` e chave que não seja
`$aact_hmlg_`), *webhook* autenticado pelo token do cabeçalho `asaas-access-token` (comparado em
tempo constante) e status confirmado em `GET /v3/payments/{id}` antes de marcar `PAID`. **Testado
no *sandbox* real em 16/10:** cobrança PIX criada com QR Code (`pay_r2mqgcempts7u43h`, R$ 60) e o
pagamento confirmado pelo botão do painel virou `RECEIVED`, com a reserva indo a `CONFIRMED`. O
*webhook* foi disparado localmente, com o formato e o token do Asaas, e o efeito dependeu da
consulta real à API. **Falta** o Asaas chamar o *webhook* por conta própria, com a URL pública
(ngrok) cadastrada no painel — é o ensaio da meta M6 (17/11). Relatório:
`docs/historico_sessao/weslley/integracao_asaas_pix_sandbox_15out2026.md`; guia:
`docs/pagamentos/ASAAS_SANDBOX.md`.

**Ressalvas 🟡 do qa-redteam do Asaas, abertas** (resolver antes de produção): validade de 1 ano
da cobrança, `404` no *webhook* que pode pausar a fila do Asaas, e CPF malformado que vira `503`.

**Critérios de aceitação**
- [x] **CA-03.2.a** — `MercadoPagoPixProvider` e `AsaasPixProvider` implementam o contrato `PixProvider` existente
- [x] **CA-03.2.b** — Registrados no *switch* de `PROVIDERS`, selecionáveis por `PIX_PROVIDER=mercadopago` e `PIX_PROVIDER=asaas`
- [x] **CA-03.2.c** — Cobrança real criada no *sandbox*, com QR Code e *payload* copia-e-cola válidos *(Asaas, 16/10/2026: QR e payload emitidos pelo próprio Asaas, e o pagamento confirmado pelo botão do sandbox; nenhum app de banco leu o payload. O Mercado Pago não foi validado)*
- [ ] **CA-03.2.d** — *Webhook* de confirmação processa notificação real do provedor *(parcial: notificação disparada localmente com o formato e o token do Asaas, status confirmado na API real; falta o Asaas chamar a URL pública — M6)*
- [x] **CA-03.2.e** — Validação de autenticidade da notificação — não confiar em `POST` anônimo
- [x] **CA-03.2.f** — `FakePixProvider` **permanece** e continua sendo o padrão em teste
- [x] **CA-03.2.g** — `services/core-service/tests/public-booking.test.js` continua passando com o *fake*
- [x] **CA-03.2.h** — Credenciais via variável de ambiente; `.env.example` atualizado *(no `docker-compose.yml` desde 31/10, branch `chore/compose-pix-asaas`)*
- [x] **CA-03.2.i** — Falha do provedor não deixa `Payment` em estado inconsistente

> **Ponto de atenção:** o `PaymentModel` já tem `provider`, `provider_charge_id`, `pix_qr_code`, `pix_expiration` e os *status* `PENDING`/`PAID`/`EXPIRED`/`FAILED`. O modelo de dados **já está pronto** para o provedor real — os campos foram criados pensando nisso. A integração deve usá-los, não criar estrutura nova.

---

### T-03.3 — Documentar a decisão como ADR 🟡

**DEP:** T-03.1, T-03.2

**Critérios de aceitação**
- [ ] **CA-03.3.a** — ADR registrando escolha dos provedores, alternativas consideradas e consequências *(parcial: a ADR-008 lista os provedores e compara alternativas de **arquitetura**, mas não compara os **provedores** entre si — por que o Asaas é o do roteiro e o Mercado Pago ficou sem validação)*
- [x] **CA-03.3.b** — Registra explicitamente por que o padrão *provider* com inversão de dependência foi mantido *(ADR-008, "Decisão" e "Alternativas Consideradas")*
- [x] **CA-03.3.c** — Documenta a estratégia de teste sem rede *(ADR-008: provedor simulado nos fluxos e `fetch` com mock nas implementações reais)*

> **ADR-008:** "Integrações Externas atrás de Interface", no Doc 07 v1.1
> (`docs/sugestoes-documentos-oficiais/07-adr/versao-sugerida_v1.0.md`, PR #97, na `develop` em 29/10).
> Para fechar o CA-03.3.a, falta um parágrafo na ADR comparando Asaas × Mercado Pago. O Doc 07 é do
> Gabriel desde 14/10.

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
| 1.1 | 16/09/2026 | Weslley (orquestrando Claude Code) | **T-03.1 concluída.** Endpoint `GET /address/:cep`, provider ViaCEP no padrão de inversão de dependência do PIX (`AddressProvider`/`ViaCepAddressProvider`/factory), erros tipados mapeados para 400/404/503, testes com `fetch` mockado (226 passed \| 1 skipped na suíte completa), Swagger atualizado, validado também contra a API real. Critério 🔴 do Termo fechado sozinho por esta tarefa |
| 1.2 | 31/10/2026 | Weslley (orquestrando Claude Code) | T-03.2 passa a cobrir o **Asaas** (`1cbc4c0`, 17/10), provedor do roteiro: CA-03.2.c marcado pela cobrança real no *sandbox* de 16/10; CA-03.2.d parcial até o *webhook* chamado pelo próprio Asaas (M6). Escopo sem "múltiplos provedores" como exclusão, porque o ambiente escolhe um por `PIX_PROVIDER`. T-03.3 conferida contra a ADR-008: b e c atendidos, a parcial (falta comparar os provedores) |
