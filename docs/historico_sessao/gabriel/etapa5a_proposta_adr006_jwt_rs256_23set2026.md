# 2026-09-23 — Agente executor (trilha do Gabriel)

- **Branch:** `feat/jwt-rs256`
- **Horário:** sessão única, Etapa 5 (fase 5a) da delegação `docs/delegacoes/pendencias_liberadas_gabriel_16set2026.md`
- **Objetivo da sessão:** T-01.3 — propor a autenticação entre serviços (RS256) e **parar** para aprovação, sem implementar

## O que foi feito

1. Pesquisa: releitura da SPEC-01 T-01.3 (já atualizada desde 26/08 com CA-01.3.d/e e um achado de 14/09 recomendando RS256), leitura do `LoginController.js` e `auth.middleware.js` atuais, e do Documento 07 oficial (`UniFAAT-projeto-experimental-2027-1/Projetos/gesway/07-...adr.md`) — a ADR-003 já reserva explicitamente o número ADR-006 para "propagação de identidade entre serviços".
2. Achado durante a pesquisa, não previsto na delegação: `auth.middleware.js:12` chama `jwt.verify(token, process.env.JWT_SECRET)` **sem fixar `algorithms`** — uma vulnerabilidade de *algorithm confusion* que existe hoje, no monólito, independente de qualquer extração de serviço. A proposta trata isso como parte da correção, não como achado separado.
3. Pesquisa lateral: `infra/k8s/rabbitmq.yaml` (branch `feature/docker-compose-rabbitmq` do Weslley, ainda não mergeada) provisiona RabbitMQ com um único usuário administrador — confirma que o CA-01.3.d ainda não está fechado, e dá a base real para a proposta de credenciais separadas.
4. `docs/sugestoes-documentos-oficiais/07-adr/ADR-006-proposta.md` escrito, seguindo o template do Documento 07 oficial (Contexto → Decisão → Alternativas Consideradas → Consequências). Decide os 5 pontos que a delegação pediu (CA-01.3.a a e) e adiciona a correção do `algorithms` fixo, que a delegação não tinha listado explicitamente.
5. `MOTIVOS.md` ao lado, com a evidência de código de cada decisão e o que muda dependendo da aprovação — mesmo padrão do Documento 03 (Sirlande) já usado nesta pasta.
6. SPEC-01 e o README de `sugestoes-documentos-oficiais` atualizados para refletir o estado da proposta.
7. `qa_checks.sh` rodado (0 erros — mudança é só documentação, mas confirma que nada foi quebrado sem querer).
8. Branch empurrada e PR aberto — **não para merge**, para dar ao Gabriel uma superfície de revisão (diff + comentários do GitHub) além desta conversa.

## Commits gerados

| Hash | Mensagem |
|------|----------|
| `bd0fcee` | `docs(adr): proposta da ADR-006 - propagacao de identidade entre servicos` |

## Decisões que a proposta toma (resumo — detalhes no documento)

| CA | Decisão proposta |
|---|---|
| CA-01.3.a | Validação local RS256 em cada serviço, sem gateway central |
| CA-01.3.b | `algorithms: ['RS256']` fixo no verificador (fecha o *algorithm confusion* achado na pesquisa) |
| CA-01.3.c | Credencial estática por cabeçalho para `b2b-service → core-service`, reaproveitando o padrão do webhook PIX (T-06.9) — não um token RS256 de serviço separado |
| CA-01.3.d | Dois usuários RabbitMQ (`write`-only / `read`-only via `set_permissions`), substituindo o único administrador atual |
| Distribuição de chaves | Script local, chave efêmera em testes/CI, `kubectl create secret` manual no cluster — **a chave privada é a única exceção à política de segredo versionado por conveniência acadêmica** |
| Tokens HS256 já emitidos | Corte seco, sem período de aceitar os dois algoritmos — o custo de relogar é menor que o risco de manter a vulnerabilidade ativa por um tempo |

## Pendências

| # | Pendência | Prioridade | Observação |
|---|-----------|-----------|------------|
| 1 | **Aprovação do Gabriel** para a fase 5b (implementação) | 🔴 Bloqueante | Condição de parada explícita da delegação. Sem ela, não prossigo para código. |
| 2 | Itens 6 e 7 da proposta (credencial `b2b-service` e credenciais RabbitMQ) não são implementáveis agora — as rotas internas e o publicador/consumidor só existem nas T-01.6 e T-01.4, fora desta delegação | 🟢 Baixa | Documentado na própria proposta, não é um esquecimento. |
| 3 | Depois da aprovação, o Weslley precisa formalizar a ADR-006 no Documento 07 oficial — não é automático | 🟡 Média | Registrado no `MOTIVOS.md` e na tabela de situação do README de sugestões. |

**PARADA DESTA ETAPA (explícita na delegação):** aguardando aprovação do Gabriel antes de qualquer implementação (fase 5b). Não prossigo para a Etapa 6 nem para código desta etapa sem sinal verde.
