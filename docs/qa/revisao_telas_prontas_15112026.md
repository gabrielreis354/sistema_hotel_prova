# Revisão das telas dadas como prontas — 15/11/2026

**Pedido do Gabriel:** revisar também as telas que o plano de fechamento considera prontas.

**Como foi feita:**
- Ambiente: compose limpo a partir da `develop` (`9a3727c`), com o seed padrão e o PIX simulado.
- Navegador: Chrome sem interface, via Playwright, em dois tamanhos: computador (1366 px) e celular (390 px).
- Usuários: os três papéis do seed (administrador, recepção e garçom).
- Cobertura: 52 telas capturadas e examinadas uma a uma. Em cada tela foram medidos erro de JavaScript, requisição com falha, rolagem horizontal, alvo de toque menor que 40 px e campo sem rótulo.
- Os pontos de dados foram conferidos no banco. O check-in foi conferido no código.

**O que está bem:**
- Nenhum erro de JavaScript.
- Nenhuma requisição falhou.
- Nenhuma rolagem horizontal no celular.
- Os redirecionamentos por papel estão certos: o garçom só vê a Comanda e a recepção não abre Indicadores.
- O roteiro de 7 passos passou de novo, 7 de 7.

Legenda: 🔴 aparece de forma errada na apresentação · 🟡 defeito de regra ou de informação · 🟢 acabamento.

## 🔴 Pode aparecer errado na apresentação

### 1. O seed põe hóspedes "na casa" em quartos marcados como livres
- **O que se vê:**
  - O painel Hoje mostra **"Ocupados 0 · Livres 15 · Ocupação 0%"** e, logo abaixo, **"Na casa: 4"**.
  - A lista de Quartos mostra todos como "Livre".
  - A tela Nova reserva oferece como livres os quartos 106, 107, 203 e 302, que têm hóspede hospedado.
  - Os Indicadores mostram 0% de ocupação.
- **Causa** (conferida no banco): as 6 estadias `CHECKED_IN` do seed (4 no Aurora e 2 no Sol) estão em quartos com status `AVAILABLE`. O check-in de verdade sempre muda o quarto para `OCCUPIED`, e o painel confia no status do quarto. A tela está certa; o dado do seed é que é impossível de acontecer pelo sistema.
- **Correção:** entra na tarefa do seed com as datas do dia (Sirlande, 17/11). Toda estadia `CHECKED_IN` deixa o quarto `OCCUPIED`, e todo quarto `OCCUPIED` tem uma estadia `CHECKED_IN`.

## 🟡 Defeitos de regra ou de informação

### 2. O check-in não confere as datas da reserva
- **O que se vê:** a reserva de Nelson Ribeiro, `PENDING`, de 10/09 a 12/09/2026, mostra em 15/11 o botão "Fazer check-in" como ação principal.
- **Causa:** o `CheckInController` verifica só o status da reserva e o quarto. Não olha as datas.
- **Risco:** a recepção faz o check-in de uma reserva vencida. O hóspede entra "na casa" com a saída já passada, e a conta lança diárias de noites que não aconteceram.
- **Proposta (o Gabriel decide a regra):**
  - check-in só quando a data de entrada já chegou (hoje ou antes) e a data de saída ainda não passou;
  - para a reserva vencida, a tela oferece cancelar ou marcar *no-show*, em vez do check-in;
  - a regra fica no backend e a tela só a espelha, como as demais.

### 3. O gráfico "Sazonalidade" pula os meses sem reserva
- **O que se vê:** o eixo vai de jan/26, fev/26 e mar/26 direto para jun/26. Abril, maio e dez/25 somem, enquanto o gráfico de receita logo acima mostra todos os meses.
- **Risco:** quem lê compara barras vizinhas como se fossem meses seguidos.
- **Correção:** preencher os meses vazios com zero, como já faz o gráfico de receita.

### 4. O comprovante não diz qual hotel o emitiu
- O comprovante de conta tem hóspede, quarto, lançamentos e saldo, mas não tem o nome do hotel nem um contato.
- Impresso e entregue ao hóspede, fica um papel sem emissor.
- **Correção:** cabeçalho com o nome do hotel, que já está no cadastro do *tenant*.

### 5. O CPF aparece de três jeitos
- **Na lista de Hóspedes e no detalhe da reserva:** CPF completo e sem formatação (`30000000014`).
- **No comprovante:** mascarado (`***.000.000-**`).
- **Hóspede cadastrado pelo roteiro:** formatado (`217.339.876-81`), porque o balcão grava o CPF do jeito que foi digitado. Esse handoff já está registrado, sem dono.
- **Correção mínima:** exibir sempre formatado, pela função do `@hotel/domain`. Mascarar na lista já é pendência registrada (LGPD, achado 🟢-1 do red team de 02/11).

## 🟢 Acabamento

| # | Tela | O quê | Sugestão |
|---|---|---|---|
| 6 | Hóspedes (celular) | Só o nome é clicável, numa área de 16 px de altura; são 43 alvos pequenos | Linha inteira clicável |
| 7 | Reserva finalizada | Três botões desabilitados, cada um com uma frase explicando por quê | Esconder a barra de ações quando a estadia está encerrada ou cancelada |
| 8 | Conta da estadia | Depois de um pagamento antecipado, o saldo corre negativo (`-R$ 1.050,00`) | Mostrar como "crédito" |
| 9 | Todas | A barra lateral diz "Hotel PMS"; o nome do produto, Gesway, não aparece em lugar nenhum | Trocar a marca |
| 10 | Todas (celular) | O botão "Sair" tem 36 px de altura | Mínimo de 44 px |
| 11 | Conta do garçom (celular) | Antes do primeiro lançamento, o aviso "Nada lançado ainda" ocupa cerca de 170 px acima do cardápio | Cardápio primeiro; aviso compacto |

## Sobre o ambiente (não é defeito do produto)

Na primeira rodada após subir o ambiente, o roteiro falhou nos 7 passos. O Vite ainda estava
otimizando dependências e recarregou a página no meio do roteiro. Na segunda rodada, com o mesmo
ambiente, passaram os 7. **O job de CI do roteiro precisa aquecer o Vite**, abrindo uma página e
esperando, antes de começar. O 1º `up` a frio também falhou de novo no RabbitMQ (🟡-1 do ensaio de 14/11).

As datas nos campos aparecem como `11/15/2026` porque o Chrome sem interface usa o idioma do
sistema, inglês. Num navegador em português o campo mostra `15/11/2026`. Não é defeito.

## Quem pega o quê

| # | Dono | Quando |
|---|---|---|
| 1 | Sirlande (na tarefa do seed) | 17/11 |
| 2 | Gabriel (decide a regra e implementa no backend e na tela) | antes de 24/11 |
| 3 | Weslley (autor dos indicadores, T-05.6) | antes de 24/11 |
| 4, 5, 7, 8, 9 | Gabriel | antes de 24/11; se faltar tempo, o 9 e o 4 primeiro, porque a banca vê |
| 6, 10, 11 | Sirlande (comanda e celular) ou Gabriel, como combinarem | depois de 24/11 só como correção, se der |

Capturas fora do repositório, no scratchpad da sessão do Gabriel. Os scripts da revisão são
`ensaio_telas.mjs` e `ensaio_telas2.mjs`; o ambiente foi apagado no fim com `down -v`.
