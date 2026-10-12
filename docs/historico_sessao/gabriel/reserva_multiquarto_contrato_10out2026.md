# 08/10 a 10/10 — Etapa F da rodada 3: reservas com vários quartos e contratos (agente executor)

- **Branch:** `fix/reserva-multiquarto-contrato`
- **Delegação:** `rodada3_gabriel_04out2026.md`, etapa F (P-1 a P-4 do catálogo de eventos, §11)
- **Decisão do Gabriel nesta etapa (10/10):** a cópia de período e status para o pivô é mantida
  por **triggers no banco**, não pela aplicação — um controller que esquecesse de sincronizar foi
  a própria causa da P-1

## O que foi feito

1. **P-1 — quarto extra vendido duas vezes 🔴.** `reservation_rooms` virou a fonte única de
   ocupação: todo quarto de toda reserva tem linha nele (o principal entra pelo banco), com
   cópia do período e de "bloqueia o quarto" mantida por triggers e um `EXCLUDE`; o de
   `reservations` continua como segunda barreira. `checkReservationConflict` passou a olhar o
   pivô, o que corrigiu de uma vez a criação, a reserva pública, o motor de disponibilidade e a
   lista de quartos livres. A pesquisa achou caminhos que a delegação não listava: adicionar
   quarto não conferia nada; trocar o principal pelo `PUT` deixava o antigo no pivô e aceitava
   quarto de outro hotel.
2. **P-2** — cancelar contrato só com a reserva-bloco ainda não ocupada (`409` em `CHECKED_IN`).
3. **P-3** — `sign` e `cancel` só `ADMIN`; e a reserva-bloco não se altera pela rota de reserva.
4. **P-4** — `calculateStayTotal`: soma de cada quarto, em centavos inteiros, função única
   (criação, alteração, adicionar/remover quarto, reserva pública, motor de disponibilidade).
5. **Portão:** `/security-review` (3 Médios), `qa-redteam` (REPROVADO com 2 🔴 → APROVADO COM
   RESSALVAS na reauditoria), tudo tratado na branch. Relatório:
   `docs/qa/redteam_reserva-multiquarto-contrato_10out2026.md`.

## Provas que valem registrar

- **Concorrência é real, não teórica:** sem o `EXCLUDE` do pivô, duas reservas paralelas pelo
  mesmo quarto extra recebiam **201** as duas.
- **Corrida no trigger** (🔴-1 do auditor): reproduzida com script de duas conexões — o quarto
  extra ficava protegido em 2028 com a reserva em 2030. `FOR SHARE` fechou, provado nas duas
  ordens.
- **Deadlock** com papéis trocados (N1): reproduzido como `[201, 500]`; agora `[201, 409]`.
- **Migrate em banco com dados:** seed da `develop` (40 reservas sem o principal no pivô) →
  migrates repetidos sem erro; banco legado com venda dupla → recusa com a lista dos casos;
  reserva com principal trocado na `develop` → aviso no 1º migrate.
- **Defeito meu achado pela verificação:** trigger declarado com `UPDATE OF col` quebrava o 2º
  `migrate` (o `sync({ alter })` reemite `ALTER TYPE`). Corrigido comparando `OLD`/`NEW`.

## Pendências

| # | Pendência | Prioridade | Dono |
|---|---|---|---|
| 1 | **Check-out antecipado não encurta a reserva:** o banco segue bloqueando as diárias restantes, a aplicação as mostra livres → `409` (antes, `500`). Encurtar afeta cobrança | 🟡 | Gabriel decide |
| 2 | `POST /contracts`, `PUT /contracts/:id` e baixa de parcela abertos a qualquer papel autenticado | 🟡 | Gabriel decide |
| 3 | Adicionar/remover quarto reprecifica a reserva inteira pelo preço atual — preço congelado por quarto depende da ADR-007 (etapa G) | 🟡 | ADR-007 |
| 4 | Webhook PIX lê a reserva sem lock — corrida rara com cancelamento pode trazer de volta uma reserva cancelada (pré-existente) | 🟡 | — |
| 5 | A lista de reservas com "principal antigo" aparece só no 1º migrate — ler a saída dele | 🟢 | quem fizer o deploy |
| 6 | ADMIN ainda exclui reserva-bloco por `DELETE /reservations/:id` sem passar pelo contrato | 🟢 | — |
| 7 | `npm run setup:db` agora roda o `migrate` depois do `schema.sql` (os triggers só existem lá) | 🟢 | Sirlande (revisão) |

**Próxima etapa:** G — registrar T-06.12 (estorno no lugar da exclusão de pagamento) e a ADR-007
candidata (uma reserva por quarto).
