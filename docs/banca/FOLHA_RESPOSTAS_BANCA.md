# Folha de respostas para a banca — apresentação de 10/12/2026

Perguntas prováveis de uma banca que conhece hotel ou mercado, com a resposta curta e onde está a
prova. A regra para todas é a mesma: **dizer o que existe, o que foi decidido não fazer agora e
onde isso está documentado.** Não prometer o que não está no Doc 08.

Fontes:
- Doc 02 (requisitos);
- Doc 08 (planejamento);
- `docs/PLANO_FECHAMENTO_MVP_15NOV2026.md`.

## Produto

| Pergunta | Resposta curta | Prova |
|---|---|---|
| Como se cadastra um funcionário? | A API já tem o CRUD de usuários, só para o administrador (RF-004: `GET/POST/PUT/DELETE /users`). A tela de configurações (RF-054) é do 5º semestre. Na demonstração, os usuários vêm do seed | Swagger `/api-docs`, rota `/users`; Doc 08, linha do T-05.7 a T-05.12 (✂️ 5º sem.) |
| Como um hotel novo entra no sistema? | Pelo auto-cadastro: `POST /auth/register` cria o hotel e o administrador numa chamada só (RF-001). Cada hotel só vê os próprios dados: o `tenant_id` sai do token e nunca da URL (RF-005, RNF-008) | Swagger `/auth/register`; teste `tenant-isolation.test.js` |
| E a ficha de registro do hóspede (FNRH), obrigatória no Brasil? | Está especificada como RF-055 (documento, nascimento, nacionalidade, endereço, motivo da viagem e acompanhantes) e planejada para o 5º semestre. No MVP o hóspede tem nome, CPF, telefone e e-mail (RF-009) | Doc 02, RF-055; Doc 08, 5º semestre ("ficha do hóspede") |
| E o fechamento de caixa? | RF-056: fechamento por turno, nominal e sem alteração depois de confirmado. Planejado para o 5º semestre. No MVP, cada pagamento fica registrado, com estorno auditado | Doc 02, RF-056; passo 5 do roteiro (pagamento e estorno) |
| O que acontece se o garçom ficar sem rede? | O lançamento fica numa fila no aparelho e é enviado quando a rede volta, sem duplicar. Isso aparece no passo 3. Limite conhecido: o app ainda não funciona instalado (PWA), então recarregar a página sem rede não abre o app | Passo 3; plano de fechamento §3, item 6 |
| Dá para fazer check-in de uma reserva vencida? | Não. O check-in só abre dentro do período da reserva (decisão de 15/11). A reserva vencida deve ser cancelada | Backend `CheckInController` e `checkInWindow.js`; PR #147 |

## Arquitetura (critérios do Termo)

| Pergunta | Resposta curta | Prova |
|---|---|---|
| Onde estão os microsserviços? | `core-service` e `analytics-service`, cada um com o próprio banco (database per service). O core publica eventos pelo padrão *outbox* no RabbitMQ, e o analytics consome. Os Indicadores do passo 7 vêm do analytics | Passo 7; ADR-003 (Doc 07); Doc 06 (C4) |
| E o `b2b-service` do C4? | O Doc 06 descreve a arquitetura-alvo. As rotas B2B ficam no core, com o mesmo contrato, até a extração (T-01.6, 5º semestre) | Doc 02, nota da tabela de B2B; Doc 08 |
| Qual API externa vocês consomem? | O PIX do Asaas (sandbox), no passo 6: a cobrança é criada no Asaas, e o webhook confirma a reserva. Também o ViaCEP, para endereço (`GET /address/:cep`) | Passo 6 ao vivo; `ViaCepAddressProvider.js` e `address.test.js` |
| E se a rede da apresentação cair no passo 6? | O mesmo fluxo roda com o provedor simulado (`PIX_PROVIDER=fake`). O contrato é o mesmo e só muda a origem da confirmação | `docs/roteiro/PASSO_6_RESERVA_DIRETA_PIX.md` |
| Onde está a nuvem e o Terraform? | O Termo pede, no 4º semestre, os 8 documentos e o MVP com a integração inicial dos microsserviços. O deploy em nuvem com Terraform é do 5º semestre (replanejamento de 21/10), sempre no free-tier. O Doc 05 descreve o alvo | Doc 08, replanejamento de 21/10; Doc 05 |
| Como vocês monitoram? | Prometheus e Grafana locais, no compose, com as métricas do core e a fila do RabbitMQ (passo 8) | Passo 8 (Grafana) |
| Têm CI/CD? | Cinco workflows: as checagens determinísticas (`ci`), um por serviço (`ci-core-service` e `ci-analytics-service`), o do frontend (`ci-frontend`) e o roteiro da demonstração no navegador (`ci-e2e`, que avisa mas não bloqueia o merge), com testes e checagens a cada PR. O deploy automatizado na nuvem é do 5º semestre | Execução verde do GitHub Actions aberta na apresentação |
| E a cobertura de testes? | **Conferir o número no CI antes da apresentação e escrever aqui.** Não citar de memória | Relatório de cobertura do job do core |

## LGPD e segurança

| Pergunta | Resposta curta | Prova |
|---|---|---|
| Como vocês tratam o CPF? | Na tela da equipe, o CPF aparece completo e formatado, porque a recepção confere o documento. No comprovante entregue ao hóspede, aparece mascarado. Mascarar também na lista é pendência registrada | `maskCpf` no comprovante; SPEC-09 §3 |
| Um hotel consegue ver dado de outro? | Não. O `tenant_id` sai do token, nunca da URL ou do corpo, e há teste automatizado para isso | `tenant-isolation.test.js`; RNF-008 |
| E o webhook do PIX, qualquer um pode chamar? | Não. Com o Asaas, ele exige o token do cabeçalho `asaas-access-token` (`ASAAS_WEBHOOK_TOKEN`); no PIX simulado do plano B, uma assinatura com `PIX_WEBHOOK_SECRET`. Nos dois casos, o backend confere a cobrança no provedor antes de confirmar | Doc 02, reserva direta/PIX |

## Antes da apresentação

- [ ] Preencher a linha da cobertura com o número do CI de 01/12.
- [ ] Conferir se o passo 8 (Grafana) e a execução verde do Actions estão abertos em abas.
- [ ] Conferir se esta folha bate com o Doc 08 v1.3 entregue.
