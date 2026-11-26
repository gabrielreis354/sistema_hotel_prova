### 2026-11-25 — Sirlande (com Claude Code)

- **Branches:** `fix/pagamento-erro-meio`, `fix/seed-acentos-cartao`, `docs/api-exemplos-passo6`, `docs/ensaio-roteiro-25nov`
- **Horário:** 25/11, noite, até 26/11, madrugada
- **Objetivo da sessão:** ensaiar o roteiro da banca com o qa-explorador, corrigir o que ele achou e
  montar um material de estudo da arquitetura.

#### O que foi feito

**1. Ensaio do roteiro (passos 1 a 8).** Foi no compose isolado `gesway_ensaio`, com o profile
`observability` e banco novo, na `develop` `74e028a`. Rodei `migrate`, `seed` e
`outbox-initial-load`, e o Vite ficou na 5173. O qa-explorador fez os 8 passos, das 23:25 às 23:37.

- **Resultado:** aprovado com ressalvas. Foram 0🔴, 2🟡 e 5🟢, sem 5xx e sem gravação duplicada
  (duplo clique em 7 botões).
- **Relatório:** `docs/qa/exploratorio_ensaio_roteiro_25112026.md`.
- **O "sem rede" do garçom:** valeu o `context.setOffline(true)` do Playwright. A troca de
  `navigator.onLine` pelo `evaluate` não representa o modo avião, porque o `openapi-fetch` guarda o
  `fetch` quando a página carrega.

**2. Correções**, cada uma com o seu PR para a `develop`. O merge é depois do congelamento de 24/11,
com o aceite do Sirlande.

| PR | Branch | O que corrige |
|---|---|---|
| #229 | `fix/pagamento-erro-meio` | 🟡-2: o aviso do meio de pagamento fica no grupo dos meios; o valor não fica vermelho. Escolher o meio não apaga o "Acima do saldo" da mesa |
| #230 | `fix/seed-acentos-cartao` | 🟢-3 e 🟢-4: `CARTAO` → `CARTAO_CREDITO` no seed; "Recepção" e "Garçom" com acento. Vale para banco recriado |
| #231 | `docs/api-exemplos-passo6` | 🟢-5: datas do passo 6 nos exemplos de resposta da reserva direta (Swagger), com o cliente regerado |
| #232 | `docs/ensaio-roteiro-25nov` | 🟡-1, 🟢-1, 🟢-2 e as 8 correções do guia; §1.6 "Ensaio no computador de um dev"; relatórios do ensaio, do red team e esta sessão |

- **Decisão do Sirlande sobre a 102** ("Confirmada" sem pagamento): o seed fica como está, e o guia
  ganhou uma resposta pronta no passo 4.
- **Red team das 3 branches de código:** 0🔴 0🟡 7🟢, em
  `docs/qa/redteam_correcoes-ensaio-25nov_25112026.md`. Ficaram resolvidos o lugar do aviso
  testável, o "Acima do saldo" apagado na mesa e o título do teste do `CARTAO`.

**3. Página de estudos** (artifact privado no claude.ai, do Sirlande):
https://claude.ai/artifact/QpFFtYyTvfrbHvKqj5u2XA

- **Conteúdo:** arquitetura, outbox, banco, máquinas de estado, tecnologias e motivos, os 11 ADRs,
  segurança, infra e 12 perguntas de treino para a banca.
- **Fontes:** Documento 07 (ADRs), `CLAUDE.md`, `schema.sql`, `docker-compose.yml`, os
  `package.json` e a folha de respostas da banca.
- **Acesso:** para o grupo abrir, compartilhar pelo menu Share.

#### Verificação

- **Core:** 1388 testes, incluindo os 2 novos do seed.
- **app-pms:** 613 testes e typecheck.
- **Swagger:** teste novo das datas.
- **Pagamento no navegador:** conferido na conta da 107, sem gravar.
- **CI:** dos 4 PRs, acompanhado ao abrir.

#### Pendências

| # | Pendência | Prioridade | Observação |
|---|-----------|-----------|------------|
| 1 | Merge dos PRs #229 a #232 | 🟡 Média | Pós-congelamento: precisa do aceite do Sirlande. O #231 é área do Weslley (API pública); pedi revisão no texto |
| 2 | Recriar o banco do ensaio antes do próximo ensaio | 🟢 Baixa | O `gesway_ensaio` está de pé com os dados do ensaio e o seed antigo. Para ver o seed novo: `COMPOSE_PROJECT_NAME=gesway_ensaio docker compose --profile observability down -v` e a subida da §1.6 |
| 3 | Apontar o `ultimo_relatorio.md` para este relatório | 🟢 Baixa | Não troquei o link aqui para não conflitar com o #228 (relatório de F2 a F5), que mexe na mesma linha. Trocar depois dos dois merges |
| 4 | 🟢 restantes do red team | 🟢 Baixa | Foco não vai até os meios ao faltar o meio; teste do Swagger não confere total e sinal |
| 5 | Perguntas ao Gabriel (F3 e F4 da SPEC-10) | 🟡 Média | Ainda sem resposta; lista na sessão de 25/11 (F2 a F5) |
| 6 | Próxima fase da SPEC-10 | 🟡 Média | F6 (comanda), na integração |
