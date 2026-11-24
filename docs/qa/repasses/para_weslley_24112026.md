# Repasses para Weslley — 24/11/2026

**Origem:** revisão do Sirlande, em 24/11, sobre o PR #200 e o parecer do Weslley sobre o Asaas (item 🟠 5, mensagens de 22/11), com conferência no código da `develop` em `bf9cafe`.

**O que se confirmou:**
- Os 9 links de execução do `PASSO_8_GRAFANA.md` estão verdes e batem com a branch e o commit da tabela.
- O diagnóstico do Asaas está certo: o problema é o PIX do sandbox, não o nosso código.
- Se o PSP falha, a resposta é 503 e a reserva não é criada. A cobrança é criada antes de abrir a transação, em `CreateBookingController.js:108-125`.
- O plano B passa pelo mesmo caminho de código. Ele passou no e2e de hoje (passo 6) e é o padrão do `GUIA_DEMONSTRACAO.md` §1.2.

**O que não se confirmou:**
- O resultado do teste de 23/11 e do chamado no suporte do Asaas. Falta você contar.

Nenhuma das duas ressalvas abaixo bloqueia o ensaio nem a demonstração.

---

### 🟡 [Operação / demonstração] Os scripts do plano A e do plano B só existem na sua máquina
**Onde:** `1_preparar_plano_a.sh`, `2_plano_b.sh` e `3_fechar.sh`, que estão fora do repositório. O `docs/roteiro/PASSO_6_RESERVA_DIRETA_PIX.md` não cita esses scripts.

**Cenário:** no dia da banca a apresentação pode rodar em outro computador do grupo, ou você pode não estar. Aí ninguém consegue:
- subir o túnel e reativar a fila do webhook, que ficou pausada no Asaas;
- testar o QR antes de começar;
- trocar para o plano B pelo seu caminho, que não mexe no `.env`.

O plano A passa a depender de uma pessoa e de uma máquina.

**Correção sugerida:** escolha uma das duas.
1. Colocar os três scripts no repositório, por exemplo em `scripts/pix/`, sem nenhum segredo. A chave e o token continuam vindo do `.env`, e a URL do túnel entra por argumento. O `PASSO_6` passa a citá-los.
2. Se preferir não versionar, escrever no `PASSO_6` o que cada script faz, em passos que qualquer um do grupo consiga repetir à mão:
   - túnel;
   - URL e reativação do webhook no painel;
   - o teste do QR;
   - a troca de provider sem mexer no `.env`;
   - como fechar.

Vale também registrar no `PASSO_6` que o token do webhook precisou ser regravado em 22/11. Diga onde conferir que o do Asaas bate com o do backend, porque esse erro reaparece se alguém trocar o `.env`.

---

### 🟢 [PIX / dado] Se o QR falhar, a cobrança criada no Asaas fica órfã, sem cancelamento e sem log
**Onde:** `services/core-service/app/services/pix/AsaasPixProvider.js:144-164` (`createCharge`)

**Cenário:** é exatamente o erro de 22/11. O `createCharge` faz três chamadas em sequência:
1. `POST /customers`;
2. `POST /payments`, que cria a cobrança no Asaas;
3. `GET /payments/{id}/pixQrCode`.

O passo 3 voltou 400 `invalid_action` depois de uns 30 s. O `#request` desiste em 10 s e lança `PixProviderUnavailableError` na linha 109 (tempo esgotado) ou na 117 (status diferente de 2xx). Os dois casos acontecem antes da linha 162, que é a única que loga o id da cobrança órfã ("cobrança sem QR Code — órfã no Asaas"). O controller responde 503 e não grava a reserva. A cobrança do passo 2 continua no Asaas, sem cancelar e sem nenhum id no nosso log para reconciliar.

**Impacto:**
- No sandbox é só lixo: foram 4 tentativas em 22/11, e mais de 10 no seu teste.
- Em produção, o hotel teria uma cobrança PIX em aberto no PSP sem reserva correspondente. Se o hóspede pagar por outro meio do Asaas (fatura ou link), o webhook chega para uma cobrança que o sistema não conhece.

**Correção sugerida:** se o passo 3 falhar por qualquer motivo, chamar o `cancelCharge(payment.id)` (o `DELETE /payments/{id}`, linha 184) como melhor esforço, dentro de um `try/catch` que não mascare o erro original. Logar o `payment.id` nos dois casos: cancelamento feito e cancelamento que falhou. Um teste com o `fetch` simulado, voltando 400 no `pixQrCode`, cobre isso. Fica para depois do congelamento.

**Confirmado por:** leitura de código. Não executei contra o sandbox, que está com o PIX fora.
