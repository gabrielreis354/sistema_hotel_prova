# Documento 07 (ADR) — motivos

> **Atualização de 29/10/2026 — v1.1 transcrita no fork.** O arquivo `versao-sugerida_v1.0.md` contém
> hoje a **versão 1.1** (o nome foi mantido para não quebrar referências). Ela foi transcrita na branch
> `entrega-7-adr` do fork, e a seção "Versão v1.1" ao final deste arquivo diz o que mudou e de onde vem.
>
> **Atualização de 14/10/2026 — o Documento 07 passou ao Gabriel.** A versão completa para entrega
> está em `versao-sugerida_v1.0.md` e tem seção própria ao final deste arquivo. As seções abaixo,
> até ela, registram a proposta da ADR-006 (22/09), quando o dono era o Weslley; ficam como histórico.

**Documento oficial:** `Projetos/gesway/07-registro-decisoes-arquitetonicas-adr.md`
**Dono:** ~~Weslley Lucas~~ → **Gabriel Reis Cunha**, desde 14/10/2026
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
| Fixar `algorithms: ['RS256']` no verificador | Defesa em profundidade, **não** correção de vulnerabilidade ativa. O `auth.middleware.js` antigo não fixava `algorithms`, mas o `jsonwebtoken` 9.0.3 instalado deriva a lista do tipo da chave e recusa HS\* com chave pública (`node_modules/jsonwebtoken/verify.js:132-151`) — o *algorithm confusion* clássico já é bloqueado. Com RSA, porém, a lista derivada aceitaria RS384/512 e PS\*; a trava fixa o contrato em RS256 e é provada por teste (RS512/PS256 com a privada correta → `401`). *A primeira versão desta tabela afirmava uma vulnerabilidade ativa — corrigido em 27/09 após a auditoria `qa-redteam`, achado 🟡-3.* |
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

---

## Versão v1.0 para entrega (14/10/2026)

**Arquivo:** `versao-sugerida_v1.0.md` — o Documento 07 inteiro, pronto para transcrever no fork
(`Projetos/gesway/07-registro-decisoes-arquitetonicas-adr.md`). **Dono:** Gabriel.
**Base:** a v0.1 da `main` do fork (só a ADR-003). A ADR-003 foi mantida **sem nenhuma alteração**.

Para ver o que muda:

```bash
diff --strip-trailing-cr <fork>/Projetos/gesway/07-registro-decisoes-arquitetonicas-adr.md \
     docs/sugestoes-documentos-oficiais/07-adr/versao-sugerida_v1.0.md
```

### De onde vem cada ADR

| ADR | Status | Fonte no repositório |
|---|---|---|
| 001 — Backend Node.js + Express | Aceita (13/05) | Primeiro commit; `docs/CODING_STANDARDS.md`; `services/core-service/package.json` |
| 002 — PostgreSQL 17 | Aceita (21/05) | Doc 04 §2 (justificativa já entregue); `db/schema.sql`; regra 8 do `scripts/qa_checks.sh` |
| 003 — Recorte de serviços | Aceita (14/09) | Já no fork — **inalterada** |
| 004 — AWS, k3s em dois nós de 1 GiB | Aceita (16/09, revista em 10/10) | `docs/historico_sessao/weslley/viacep_e_decisao_k8s_16set2026.md` (insumo da ADR-004); Doc 05 v1.0 do PR #6 do fork. O faseamento `t3.micro → t3.small` de 16/09 vira alternativa rejeitada |
| 005 — Docker + Kubernetes, Compose de contingência | Aceita (10/06) | Manifests de `infra/k8s/` (10/06); `docker-compose.yml` de contingência (T-06.4, 16/09) |
| 006 — Identidade entre serviços | Aceita (24/09) | `ADR-006-proposta.md`, sem as notas internas e a seção de implementação |
| 007 — Uma reserva por quarto | **Proposta** | `ADR-007-candidata.md`, resumida, com o gatilho de decisão |
| 008 — Integrações externas atrás de interface | Aceita (27/06) | `app/services/pix/` e `app/services/address/`; **atende a T-03.3** da SPEC-03 (CA-03.3.a–c) |
| 009 — Consumo por contas | Aceita, em implementação (07/08) | SPEC-04 §4 e `docs/specs/anexos/SPEC-04-decisoes-T-04.1.md` (D-1 a D-13) |
| 010 — Estorno no lugar de exclusão | Aceita, implementação planejada (04/10) | D-2 do catálogo de eventos; T-06.13 da SPEC-06 |
| 011 — Frontend em SPA e monorepo | Aceita (07/08) | SPEC-05 §3 e `frontend/package.json`. A SPEC-05 diz React 19; o código usa **18.3.1**, que é o registrado |

As afirmações de cada ADR foram conferidas contra a `develop` em 14/10/2026.

### Pontos em aberto

- **RNF-003 × nuvem.** O Doc 02 exige no mínimo 3 réplicas do backend; a ADR-004 e o Doc 05 rodam 1
  réplica por serviço nos nós de 1 GiB. Está registrado como consequência negativa da ADR-004. A
  correção é no Doc 02 (dono: Gabriel) — por exemplo, limitar o RNF-003 ao cluster local na v1.4.
- **ADR-007 como "Proposta".** Mostra ao professor uma decisão em aberto, com gatilho. Se a equipe
  preferir só decisões fechadas, sai da v1.0 e entra quando for decidida.
- **Coerência com o Doc 06.** As alternativas da §5 do Doc 06 v1.1 sugerido batem com as ADR-001, 002,
  004 e 005; a linha 8 da §5 do Doc 06 deve citar a ADR-008.
- **Ordem de entrega.** O 07 é entregue depois do 05 e do 06. Até lá, o documento é atualizado a cada
  decisão nova; quando for transcrito no fork, esta pasta registra a data.

---

## Versão v1.1 (29/10/2026)

**Arquivo:** `versao-sugerida_v1.0.md`, agora na versão 1.1 (commit `98e8213` desta branch).
**Transcrita no fork em 29/10/2026:** branch `entrega-7-adr`, criada de `upstream/main`, arquivo
`Projetos/gesway/07-registro-decisoes-arquitetonicas-adr.md`. A `upstream/main` ainda tinha o modelo em
branco, e não a v0.1 com a ADR-003; a transcrição substitui o modelo inteiro. A única diferença em
relação a esta pasta é o `<br>` no fim das linhas do cabeçalho, como nos Documentos 05 e 06.
**Desde 29/10**, os 8 documentos são do grupo e podem ser editados direto no fork.

### O que mudou e de onde vem

| ADR | Mudança na v1.1 | Fonte |
|---|---|---|
| 004 — Nuvem | Um único EC2 `t3.small` com k3s em servidor único, numa conta no plano gratuito de créditos criada perto do 5º semestre. Dois `t3.micro` (10/10) e o nó faseado (16/09) viram alternativas, com motivo. RNF-003 como exceção consciente na nuvem | Decisão do Gabriel de 24/10/2026; Doc 05 v1.2 do fork (`ff69a36`), §2 e §6; preços da AWS Price List de `sa-east-1` consultados em 24/10/2026 |
| 001 e 005 | Sem os "nós de 1 GiB" e sem "fora do free-tier"; título da ADR-005 igual ao do índice | Consequência da ADR-004; auditoria de coerência de 28/10 |
| 003 | Nota: `ACCOUNTS` e `ACCOUNT_ITEMS` implementadas a partir de 14/10 | `git log` dos *models* `Account`/`AccountItem` (14/10) |
| 008 | Autenticidade do *webhook* por assinatura **ou token**, conforme o provedor | `AsaasPixProvider.js` (`asaas-access-token`, sem HMAC) |
| 009 | Implementada; conta aberta no check-in e ordem de trava reserva → contas | SPEC-04 (T-04.1 a T-04.7); anexos da T-04.6 (D-58, D-62) e D-48 |
| 010 | Implementada em 24/10/2026 | PR #100 (T-06.13): `POST /payments/:id/void` e `DELETE` com `405` |

### Conferência da ADR-004 contra o Doc 05 v1.2

Os mesmos números aparecem nos dois documentos: US$ 0,0336/h do `t3.small` = 2 × US$ 0,0168/h do
`t3.micro`; 944 Mi de `requests` do Gesway e 1.014 Mi com o CoreDNS; cerca de US$ 0,35 por sessão de 4 h;
cerca de US$ 28 no uso previsto dos 6 meses; US$ 100 de crédito na criação e até mais US$ 100 por
atividades; um IPv4 público; AWS Budgets sobre o custo antes dos créditos; `app-pms` servido pelo nginx;
D-003 do `analytics-service` no RDS.

### Avaliados e não incorporados

- **Walk-in (`PENDING → CHECKED_IN`, 24/10):** regra de negócio, não decisão de arquitetura. A correção
  é nos Docs 01, 02 (RF-011) e 06.
- **D-51 a D-62:** regras de cálculo e de concorrência do módulo de contas. Só a D-58 e a D-62 (com a
  D-48) entraram, na ADR-009; as demais ficam nos anexos da SPEC-04.

### Pontos em aberto

- **RNF-003 × nuvem:** a exceção já está na ADR-004 e no Doc 05 v1.2; o Doc 02 v1.4 precisa declará-la.
- **Entrega ao professor:** o PR do fork só sai com autorização do Gabriel. O Doc 05 v1.2 e o 07 v1.1
  devem ir juntos, porque a ADR-004 e o Doc 05 descrevem a mesma decisão.
