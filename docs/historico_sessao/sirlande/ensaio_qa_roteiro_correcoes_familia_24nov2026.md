# Sessão de 24/11/2026: ensaio técnico, QA do roteiro, correções e simulação da família

**Dev:** Sirlande, com o Claude Code como orquestrador. **Dia:** congelamento da `develop`.

## O que foi feito

| Etapa | Resultado |
|---|---|
| Revisão do PR #210 (guia da demonstração, do Gabriel) | §1.5 contradizia o `seed_hoje.sql` (o ensaio deixava dados que quebram os passos 1 e 2). Corrigido com a autorização do Gabriel (`63be0c4`) e mergeado (`bf9cafe`). Página da revisão: https://claude.ai/artifact/21eQkwocjrSvSaf7SiCD91 |
| Ensaio técnico da `develop` (`bf9cafe`) | compose a frio em 34 s; e2e 7/7; 377 eventos aplicados no analytics e 0 na fila de mensagens mortas; logs sem erro e sem dado pessoal |
| Revisão do PR #200 (Weslley) e do parecer do Asaas | as 9 execuções citadas estão verdes. O CI do core vermelho no `87a9aff` era a fronteira de fuso, não o #207; o rerun ficou verde. Repasse ao Weslley em `docs/qa/repasses/para_weslley_24112026.md` (branch `docs/repasse-weslley-24nov`) |
| QA exploratório do roteiro | pronto com ressalvas: 5 🟡 e 8 🟢 (`docs/qa/exploratorio_roteiro-demonstracao_24112026.md`) |
| Correções (branch `fix/qa-roteiro-24nov`) | todos os achados tratados. O 🟡-5 não se confirmou pela tela. Os dois balcões simultâneos ficaram para o 5º semestre (anexo CA-05.6.a); só a fala mudou |
| qa-redteam do diff | aprovado com ressalvas, sem 🔴. Os dois 🟡 e cinco 🟢 corrigidos na mesma branch |
| Verificação | core 69 arquivos e 1.385 testes; frontend 606 + 49; typecheck dos 4 pacotes; `qa_checks.sh` sem erro bloqueante; e2e 7/7 no compose reconstruído |
| Simulação da família Oliveira | walk-in → check-in → comanda em 360 px → painel Hoje → conta em 800 px → pagamento → check-out → comprovante → liberar quarto → indicadores, tudo certo. Capturas em `docs/qa/evidencias/familia_24112026/` |

## Decisões
- **Merge depois do congelamento:** o Sirlande aprova e mergeia no mesmo dia, e o Gabriel revisa no PR depois. Quase todos os achados eram de telas dele.
- **Nome de categoria sem diferença de caixa:** a checagem fica na aplicação, não num índice `lower(name)`, porque trocar o índice faria o `migrate` falhar num banco que já tem nomes assim.
- **CPF na reserva pública:** passa a ser validado sempre que vem preenchido, qualquer que seja o provider. É a regra do balcão (SPEC-11). O teste que fixava a exceção do provider fake foi trocado.
- **Entrada no passado na API pública:** 400, com "hoje" no fuso do hotel. Vale também para a disponibilidade.

## Pendências
1. **Testes com data fixa de 2027:** 19 testes da API pública passam a falhar quando as datas chegarem; o primeiro é em 01/05/2027. Trocar por datas relativas no 5º semestre. A lista está no relatório do QA.
2. **Os dois balcões ao mesmo tempo** gravam o pagamento duas vezes (5º semestre, anexo CA-05.6.a).
3. **A API pública responde 400 sem `code`**, e o balcão responde 422 `CHECK_IN_IN_PAST` (🟢-3 do red team).
4. **Saldo corrente na linha do tempo da conta:** o pagamento antes da diária futura mostra "crédito" no meio da conta. A conta está certa, mas a leitura pode confundir (Gabriel).
5. **Asaas:** aguardando o teste do Weslley de 23/11 e o chamado no suporte. Se o PIX do sandbox não voltar, o passo 6 vai de plano B.
6. **Ensaio com o grupo:** recriar o banco depois do ensaio (§1.5 do guia).
7. **Corrigir lançamento na comanda depois da janela de 5 s:** hoje ninguém consegue pelo app. O `DELETE` de item já existe (só ADMIN), mas não tem botão. A proposta está na SPEC-04 §6.1 (CA-04.8.a a d): estornar e relançar, botão "Estornar" para o ADMIN e "Pedir correção" para o garçom. Fica para o 5º semestre, combinando com o Gabriel.
8. **Ensaio interrompido no passo 6 (Swagger)** e seção "Ensaio no computador de um dev" no guia ainda por escrever.
