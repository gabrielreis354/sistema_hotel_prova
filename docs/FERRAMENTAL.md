# Ferramental do Gesway

**O que existe de skill, plugin e subagente, e em que tarefa cada um entra.**
Criado em 27/09/2026.

Este arquivo é para o ferramental o que o `frontend/packages/ui/CATALOGO.md` é para os
componentes: **registro, não curadoria.** Ninguém pede autorização para usar. A coluna
*"quando **não** usar"* é a mais importante — é ela que evita invocar recurso por invocar.

---

## Por que este arquivo existe

O projeto acumulou ferramental que ficou meses parado:

- o **`/security-review`** esteve disponível durante **todo** o tempo em que o vazamento do
  `provider_charge_id` e o webhook PIX sem assinatura ficaram abertos na `main`
- o **`superpowers`** está instalado desde 26/08 e nunca foi usado — e ele contém
  `verification-before-completion`, que é a regra 3 do CLAUDE.md escrita à mão
- o **`playwright`** está instalado desde 21/09 e nenhuma tela do `apps/pms` foi vista num
  navegador pelo agente. A regra 9 do `qa_checks.sh` é `grep` estático
- **acessibilidade** é RNF-024 a RNF-027, requisito que vai ser avaliado, e nunca foi verificada

O problema nunca foi falta de recurso. Foi **lembrar na hora da decisão.**

## A regra

> **O `estado.sh` diz o ferramental; este arquivo diz o que cada um faz.**
> Quem usar um recurso novo que valeu a pena **acrescenta a linha aqui** — igual à regra de
> promoção do `CATALOGO.md`.

O `scripts/estado.sh`, que o `/orquestrador` roda no início de toda sessão, olha o diff da
branch e imprime o que se aplica. Ele **sugere**; o que é obrigatório mora no portão
(`scripts/qa_checks.sh` + `qa-redteam` + CI).

---

## Segurança e qualidade de código

| Recurso | Para quê | Quando **não** usar |
|---|---|---|
| **`/security-review`** | Revisão de segurança do diff pendente. **Obrigatório** quando o diff toca autenticação, webhook, segredo, rota pública ou controller novo | Mudança só de documento ou de infraestrutura sem segredo. Para manifesto k8s, use o `qa-redteam` com foco em infra |
| **`qa-redteam`** (subagente do projeto, `.claude/agents/`) | Auditoria adversarial **escopada no dev** antes do merge em `develop`. Caça brecha entre o entregue e as regras do projeto: multi-tenancy, máquina de estados, LGPD, DRY | Depois do merge — o portão é antes. E ele só reprova por achado 🔴 **dentro** do escopo; o resto vira repasse em `docs/qa/repasses/` |
| **`/code-review`** | Revisão de correção sobre diff, branch ou PR. Complementa o `qa-redteam`: ele olha bug, o redteam olha regra do projeto | Como substituto do `qa-redteam` no portão. São coisas diferentes |
| **`/simplify`** | Reúso, simplificação e eficiência no código já escrito. Só qualidade — não caça bug | Antes de o comportamento estar correto e testado. Simplificar código errado é retrabalho |

---

## Frontend e design

Contexto de domínio obrigatório antes de qualquer uma: **`frontend/DESIGN_PMS.md`**.

| Recurso | Para quê | Quando **não** usar |
|---|---|---|
| **`design:accessibility-review`** | Auditoria WCAG 2.1 AA: contraste, teclado, alvo de toque, leitor de tela. **Cobre RNF-024 a RNF-027** | Como passada final de estética — é conformidade, não gosto |
| **`emil-design-eng`** | Polimento de UI e as decisões invisíveis que fazem software parecer bom | Para impor estética. Ele é sobre acabamento, não sobre direção visual |
| **`animate`** | Construir uma animação decidindo na ordem certa: se deve animar, qual propriedade, qual curva, como interrompe | Animação decorativa. No PMS o movimento tem função — confirmar estado, mostrar origem, sinalizar fila offline |
| **`review-animations`** | Criticar movimento que já existe | Para construir do zero — aí é `animate` |
| **`animation-vocabulary`** | Achar o nome do efeito a partir da descrição | Para desenhar ou implementar. Ele só nomeia |
| **`design-taste-frontend`** | Composição visual **exclusivamente no `apps/booking`** — a única superfície de conversão | **Nunca no `apps/pms`.** Ela otimiza espaçamento largo e estrutura de landing page; o PMS vive em tabela densa |
| **Impeccable** (`/impeccable audit · critique · polish`) | Processo e qualidade: 24 comandos e 61 detectores determinísticos. Detector determinístico é a mesma natureza da regra 9 | Antes do comportamento estar certo. Ordem: comportamento → `audit` → `critique` → `polish` |
| **`design:design-system`** | Documentar variantes, estados e acessibilidade de um componente; achar valor cravado na mão | Para criar componente — a promoção segue o `CATALOGO.md`: nasce local, sobe no segundo módulo |
| **`design:ux-copy`** | Microcópia: mensagem de erro, estado vazio, rótulo de ação | Texto de documento ou de commit |
| **`dataviz`** | **Antes** de escrever qualquer gráfico: tipo, paleta, eixo, legenda. Vale para os indicadores de RF-037 a RF-043 e para o RF-052 | Tabela de dados — é leitura, não visualização |
| **`browser-automation`** / plugin **`playwright`** | Carregar a página de verdade e reportar o que aconteceu: erro de console, requisição falha, o que renderizou | Como substituto de teste automatizado. É verificação pontual, não suíte |
| **`run`** | Subir e dirigir a aplicação para ver a mudança funcionando | Quando o `docker-compose.yml` já resolve — ele sobe o sistema inteiro |

---

## Documentos e entregas acadêmicas

| Recurso | Para quê | Quando **não** usar |
|---|---|---|
| **`anthropic-skills:pptx`** | Apresentação da banca (§8 do termo) | Documento de texto — os oito oficiais são Markdown com template fixo |
| **`anthropic-skills:xlsx`** | Planilha, se algum critério pedir | Para ler dado do banco — aí é SQL |
| **`pdf-viewer`** (plugin, habilitado) | **Olhar** o PDF de contrato e de orçamento gerados (RF-032, RF-035). O teste confere status 200; isso não prova que o documento está legível | Extrair texto de PDF — para isso basta o `Read` |
| **`artifact-design`** + ferramenta Artifact | Página HTML para o time, como a `docs/trilhas-do-gesway.html` | Documento oficial — aqueles seguem o template da UniFAAT |
| **`/spec`** | Fluxo Specify → Plan → Tasks → Implement, com checkpoint humano | Correção trivial de uma linha |
| **`/orquestrador`** (comando do projeto) | Início de sessão: lê o estado real e devolve diagnóstico, prioridade e o ferramental da tarefa | — |

> **Documento oficial tem dono.** 01 e 02 Gabriel, 03 e 04 Sirlande, 05 a 08 Weslley. Sugestão
> vai para `docs/sugestoes-documentos-oficiais/` com `MOTIVOS.md`, nunca direto no arquivo.

---

## O que falta habilitar

| Recurso | Situação | O que fazer |
|---|---|---|
| **`superpowers`** | Instalado desde 26/08, **não habilitado na sessão** | Contém `test-driven-development`, `systematic-debugging`, `verification-before-completion`, `writing-plans`, `using-git-worktrees`, `requesting-code-review`. É quase um espelho do nosso RPI — vale habilitar e comparar com o que já fazemos à mão |
| **`frontend-design`** (plugin da Anthropic) | Instalado, não habilitado | Avaliar contra o que o `DESIGN_PMS.md` já define. Quatro vozes opinando sobre a mesma tela é ruído |
| **`pdf-viewer`** | Habilitado, mas o servidor MCP **falhou ao conectar** em 27/09 | Retentar quando os PDFs forem revisados de fato |

---

## O que não vale investir

Os servidores MCP do plugin `product-management` — Figma, Linear, Notion, Slack, Asana,
Atlassian — exigem autorização OAuth pelas configurações de conector do claude.ai ou por um
`claude mcp` interativo. Para um time de três com o trabalho já dividido num documento e em
sete SPECs, não apareceu benefício que pague a configuração.

Também ficaram fora, por decisão registrada em `frontend/DESIGN_PMS.md` §8: as skills de app
nativo (Swift, Expo, mobile-native), as de geração de imagem, a `gpt-taste` e a
`find-animation-opportunities`.
