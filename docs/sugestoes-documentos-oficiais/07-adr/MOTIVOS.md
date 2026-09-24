# Documento 07 (ADR) — motivos da proposta ADR-006

**Documento oficial:** `Projetos/gesway/07-registro-decisoes-arquitetonicas-adr.md`
**Dono:** **Weslley Lucas** (a ADR-003 foi redigida pelo Gabriel, mas o documento é dele)
**Proposta:** `ADR-006-proposta.md`
**Data:** 22/09/2026 · **Autor:** agente executor, trilha do Gabriel (Etapa 5, fase 5a da delegação `docs/delegacoes/pendencias_liberadas_gabriel_16set2026.md`)

---

## Por que isto é uma proposta, e não uma edição direta do documento oficial

A ADR-003 já foi registrada **diretamente** no Documento 07 oficial (não como sugestão) —
segundo o `README.md` desta pasta, porque o documento ainda não foi entregue ao professor. Para
a ADR-006, a delegação foi explícita: **fica como sugestão**, não escrita no oficial, porque quem
decide o conteúdo do Documento 07 é o Weslley, e a T-01.3 (que gera esta proposta) pertence à
trilha do Gabriel. A diferença não é o estado de entrega do documento — é que desta vez quem
redige não é o dono.

O número **ADR-006 já está reservado**: a própria ADR-003, na seção "Comunicação", termina com
*"A propagação de identidade entre serviços é tratada em decisão própria, a ser registrada como
ADR-006"* (`07-registro-decisoes-arquitetonicas-adr.md:164`). Esta proposta preenche exatamente
essa lacuna.

---

## O que motivou cada decisão — evidência do código, não só da SPEC

| Decisão | Evidência conferida |
|---|---|
| RS256 em vez de HS256 | `LoginController.js:48-52` assina com `JWT_SECRET` único; `auth.middleware.js:12` verifica com o mesmo segredo simétrico — qualquer um dos três serviços futuros que tivesse esse segredo poderia emitir token, não só verificar |
| Fixar `algorithms: ['RS256']` no verificador | `auth.middleware.js:12` hoje chama `jwt.verify(token, process.env.JWT_SECRET)` **sem** o terceiro parâmetro `options.algorithms` — conferido lendo o arquivo, não por suposição. É uma lacuna que existe agora, no monólito, independente de qualquer extração de serviço |
| Segredo estático (não token RS256) para `b2b-service → core-service` | Reaproveita `app/utils/pixWebhookSignature.js` e `PixWebhookController.js`, escritos e testados nesta mesma sessão (T-06.9) — mesmo padrão de `crypto.timingSafeEqual`, checagem de tamanho antes, fail-closed sem segredo configurado |
| RabbitMQ com usuário único hoje | `infra/k8s/rabbitmq.yaml` (branch `feature/docker-compose-rabbitmq` do Weslley, ainda não mergeada em `develop`) — só `RABBITMQ_DEFAULT_USER`/`RABBITMQ_DEFAULT_PASS`, comentário do próprio arquivo confirma "só provisionamento nesta etapa" |
| Chave privada não pode seguir a política de segredo versionado | `README.md:107-112` e `infra/k8s/secret.yaml` — a política de versionar segredo "por conveniência acadêmica" já existe e é usada para `JWT_SECRET`, `PIX_WEBHOOK_SECRET`, `POSTGRES_PASSWORD`. Estendê-la à chave **privada** RSA anularia o motivo de ter migrado de HS256: um segredo simétrico versionado e uma chave assimétrica versionada oferecem a mesma "proteção" — nenhuma |
| Nginx não participa da validação | `infra/k8s/nginx.yaml` — proxy simples (`proxy_pass` para `backend_pool`), sem lógica de autenticação nenhuma hoje. Transformá-lo em ponto de validação seria construir um gateway de auth novo, não reaproveitar o que existe |

---

## O que foi deliberadamente deixado para depois, e por quê

A fase 5a (esta proposta) só pede a **decisão**. A implementação (5b) só começa depois da
aprovação do Gabriel — condição de parada explícita da delegação. Dentro da própria 5b, dois
itens (credencial de serviço `b2b → core` e credenciais separadas do RabbitMQ) não têm código
para escrever ainda: as rotas internas do `core-service` e o publicador/consumidor do RabbitMQ só
passam a existir nas tarefas T-01.6 e T-01.4, respectivamente — que são posteriores e fora desta
delegação. A proposta registra a decisão agora para não precisar refazer a análise quando essas
tarefas chegarem.

---

## O que muda se esta proposta for aceita

- O Weslley formaliza um novo bloco `### ADR-006: Propagação de Identidade entre Serviços` no
  Documento 07 oficial, usando o template já presente no próprio documento (linhas 281-305,
  atualmente placeholder) e a tabela de índice (linha 317).
- A implementação (5b) vira tarefa a executar — script de geração de chaves, ajuste do
  `LoginController` e do `auth.middleware`, testes dos 4 cenários (RS256 válido, HS256 recusado,
  chave errada recusada, `tenant_id` adulterado recusado).

## O que acontece se não for aceita, ou se for aceita com mudanças

- Sem decisão registrada, a T-01.4 (extração do `analytics-service`, a próxima tarefa da SPEC-01
  depois da T-01.2/T-01.3) fica bloqueada: não há como saber com que credencial o serviço extraído
  vai validar requisição nenhuma.
- Se o Gabriel ou o Weslley preferirem uma das alternativas descartadas (gateway central, token de
  serviço RS256, mTLS), a tabela "Alternativas Consideradas" da proposta já registra o trade-off
  de cada uma — a mudança de decisão não exige nova pesquisa, só escolher outra linha da tabela e
  ajustar a seção "Decisão" correspondente.
