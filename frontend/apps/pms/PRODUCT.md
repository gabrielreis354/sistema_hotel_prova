# Product

<!-- impeccable:product-schema 1 -->

> Registro de produto lido pelo Impeccable (`/impeccable init`, 26/10/2026). É um **resumo** de
> `frontend/DESIGN_PMS.md`: em conflito, **vale o DESIGN_PMS.md**. Cobre só o `apps/pms`; o
> `apps/booking` (superfície de conversão) tem outra liderança de design.

## Platform

web

## Users

Operadores experientes e repetitivos, que fazem a mesma tarefa centenas de vezes por semana.
Velocidade e previsibilidade importam mais que descobribilidade.

- **Recepcionista**, no balcão, num turno de 8h, com fila atrás do hóspede. Picos: check-out das
  7h às 11h e check-in das 14h às 18h. Usa teclado antes de mouse.
- **Garçom**, no celular, com uma mão livre, de pé, com o salão cheio e Wi-Fi ruim. Lança
  consumo na conta certa (suíte, mesa, balcão) entre uma mesa e outra.
- **Administrador / dono**: configura o hotel e lê indicadores. Não opera o balcão.

## Product Purpose

O Gesway é um PMS SaaS multi-tenant para hotéis e pousadas pequenos. Cobre reservas, check-in e
check-out, conta da estadia, pagamentos e comanda de consumo.

Sucesso é a operação andar mais rápido que o papel. Critério da comanda: *se for mais lento que
a comanda de papel, falhou.*

## Positioning

Um PMS feito para a pousada pequena brasileira:
- balcão rápido;
- comanda do garçom no celular, com fila offline que lança direto na conta da suíte;
- reserva direta pelo site do hotel, com sinal em PIX.

## Operating Context

- O PMS vive em tabela densa: mapa de reservas (quartos × dias), painel do dia, conta da reserva
  com diárias e consumos. **Densidade não é sujeira.**
- A comanda funciona offline: cada lançamento ganha um `client_item_id` no toque, entra numa
  fila no aparelho e é reenviado sem duplicar. A tela mostra "na fila" com honestidade, nunca
  finge que já gravou.
- Papéis: o garçom (`WAITER`) só vê a comanda e não dá cortesia nem exclui item. Recepção e admin
  veem bill e fechamento na mesma tela.
- A mesma tela de comanda é usada no celular (salão) e no balcão.

## Capabilities and Constraints

- **Dinheiro:** chega do backend como string (`DECIMAL`) e é tratado só por `@hotel/domain`,
  nunca com `Number()`. Na tela: alinhado à direita, algarismos tabulares, símbolo e duas casas.
- **Data é dia, não instante:** ancorada em `America/Sao_Paulo`.
- **Status:** nunca só cor. Sempre cor + rótulo (`StatusBadge`).
- **Ação irreversível pede confirmação** (check-out, cancelamento, fechamento de conta). Ação
  indisponível aparece desabilitada **com o motivo**, não some.
- **Toque:** `Button` `comfortable` (≥ 48 px) no celular e na comanda; `compact` em tabela e
  rack no desktop.
- **Multi-tenant:** a identidade visual do hotel vem de token, não de classe fixa.
- **Design system:** tokens só de `packages/config/tailwind-preset.js`. Componentes `Button`,
  `Input`, `Field` e `StatusBadge` de `@hotel/ui`. Componente novo nasce em
  `features/<módulo>/components/` e sobe para `packages/ui` no segundo módulo que precisar
  (`packages/ui/CATALOGO.md`). As regras 9a a 9c do `qa_checks.sh` reprovam cor literal,
  `<button>`/`<input>` crus e bloco de classes repetido.
- **Movimento tem função:** confirmar mudança de estado, mostrar de onde o painel veio,
  sinalizar item na fila. Nada decorativo; nada de GSAP ou hero no `apps/pms`.
- **Stack:** React 18.3, TypeScript 5.6, Vite 5.4, Tailwind 3.4, TanStack Query 5; cliente da
  API gerado do OpenAPI (`packages/api-client`).

## Evidence on Hand

Projeto de TCC. Existem só dados de demonstração: `services/core-service/seed/seed_hotels.sql`
e `seed_consumo.sql` (Hotel Aurora e Pousada Sol). **Não há clientes, depoimentos, métricas de
uso nem piloto real**, e nada disso pode ser inventado em tela, texto ou demonstração.

## Product Principles

1. Cada toque ou clique a mais é um hóspede esperando de pé.
2. A tela nunca mente sobre o estado: na fila é "na fila", bloqueado mostra o motivo.
3. Erro aqui é quarto errado ou dinheiro errado. O que é irreversível se confirma; o resto se
   desfaz.
4. O operador experiente manda: previsibilidade e consistência acima de novidade.

## Accessibility & Inclusion

RNF-024 a RNF-027 (Documento 02):
- toque ≥ 48 px e ações ao alcance do polegar na comanda e no painel do dia;
- informação nunca só por cor, e telas de recepção navegáveis por teclado;
- ação bloqueada visível e explicada;
- carregando, vazio e erro em toda tela remota.

Referência técnica: WCAG 2.1 AA. Caso real: recepcionista daltônico lendo um rack de 40 quartos.
