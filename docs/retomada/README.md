# Arquivos de retomada

Sessões de agente caem: por falha de rede, por limite de uso, por compactação de contexto ou
por travamento. Em 21 e 23/10/2026 isso aconteceu cinco vezes com frentes em andamento. O que
estava commitado sobreviveu; o que estava só na cabeça do agente teve de ser reconstruído.

Esta pasta resolve isso. **Cada frente de trabalho mantém um arquivo de retomada**, e qualquer
sessão — a mesma depois de uma compactação, ou outra que assuma a frente — lê esse arquivo
primeiro e continua de onde parou, sem reconstruir nada.

---

## A regra

1. **Toda frente tem um arquivo** `docs/retomada/<branch-com-hifens>.md` na **própria branch**
   (ex.: `feature/t052-reservas` → `docs/retomada/feature-t052-reservas.md`).
2. **A cada checkpoint, o arquivo é atualizado, commitado e enviado** junto com o trabalho.
   Checkpoint é: um passo lógico concluído, um commit RED ou GREEN, uma auditoria recebida, uma
   decisão tomada, ou antes de qualquer comando demorado.
3. **Ao (re)começar uma sessão numa frente**, a primeira leitura é este arquivo. Depois, o
   `git log` e o `git status` do worktree para confirmar — se divergirem, o git vence e o
   arquivo é corrigido.
4. **Ao terminar a frente** (merge na `develop`), o arquivo é removido no mesmo PR ou marcado
   `ENCERRADA` no topo.
5. O **orquestrador** mantém `ORQUESTRADOR.md` aqui, com o estado de todas as frentes. Ele vive
   na `develop` (via PR de documentação) e é o ponto de partida de quem coordena.

Nunca coloque segredo, chave, token ou dado pessoal real num arquivo de retomada.

---

## Modelo

```markdown
# Retomada — <frente> (<branch>)

**Atualizado:** dd/mm/aaaa hh:mm · **Por:** <agente/pessoa>
**Worktree:** /home/gabri/wt-<nome> · **Portas:** PG <n> · outras <n>
**Containers:** <nomes> (subir de novo com: <comando>)

## Objetivo
Uma ou duas linhas e o contrato (SPEC/CAs, delegação).

## Onde estou
- Último commit: <hash> <mensagem> (com push? sim/não)
- Passo atual: <o que estava fazendo quando parou>
- Próximo passo: <exatamente o que fazer a seguir>

## Feito
- [x] <passo> — <commit>

## Falta
- [ ] <passo>

## Decisões tomadas nesta frente
- dd/mm — <decisão> (quem decidiu)

## Bloqueios e perguntas abertas
- <o que espera outra pessoa/decisão>

## Comandos úteis desta frente
<subir ambiente, rodar suíte, rodar e2e>
```
