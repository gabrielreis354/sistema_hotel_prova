# Delegação — T-05.5 Comanda do garçom (frontend) · trilha do Sirlande

**Data:** 21/10/2026 · **De:** Gabriel (orquestrador) · **Para:** Sirlande, ou agente executor da trilha dele
**Spec:** `docs/specs/SPEC-05-frontend-pms.md` §4, T-05.5 · **Divisão de trabalho:** `docs/DIVISAO_TRABALHO_TIME_09set2026.md` §4.1 (comanda é do Sirlande)
**Destravada por:** R1 — T-04.3 concluída em 19/10/2026

---

## 1. Prompt de abertura — cole isto na sessão do agente

```
Você vai construir a comanda do garçom no frontend do Gesway (T-05.5, Fase A).
Antes de qualquer código:
  git fetch origin
  git show origin/develop:docs/delegacoes/t055_comanda_frontend_sirlande_21out2026.md
Leia a delegação inteira, depois os arquivos da seção [O QUE JÁ EXISTE], nessa ordem.
Crie a branch a partir de origin/develop (nunca de develop local).
Pare e reporte nas condições da seção 6.
```

---

## [CONTEXTO]

O Gesway é um PMS SaaS multi-tenant para hotéis e pousadas pequenos. A comanda é usada pelo
**garçom**, de pé, no celular, com uma mão, em rede instável (área da piscina, restaurante). Ele
lança o que vende na conta certa: a suíte do hóspede, uma mesa, uma venda de balcão. A recepção
e a gerência usam a mesma tela no balcão.

**Critério do módulo, da própria Spec:** *se for mais lento que a comanda de papel, falhou.*

O backend está pronto e auditado (SPEC-04, T-04.1 a T-04.4, 19/10). Esta tarefa é **só
frontend**, exceto o que a seção 6 manda parar e perguntar.

## [STACK E RESTRIÇÕES]

- Monorepo pnpm + Turborepo em `frontend/`; app em `frontend/apps/pms`.
- **React 18.3.1** (não 19 — a SPEC-05 §3 está desatualizada nesse ponto), TypeScript 5.6, Vite 5.4, Tailwind 3.4,
  TanStack Query 5 (estado de servidor), Zustand 5 (só sessão; estado global novo exige acordo).
- **Nenhum `fetch` direto.** Tudo pelo `packages/api-client`, **gerado** do OpenAPI do backend
  (`pnpm gen:api`). Nunca editar o cliente à mão; tipo que falta se conserta no Swagger.
- **Sem `as unknown as`.**
- **Dinheiro e data só por `@hotel/domain`** (`packages/domain/src/money.ts`, `dates.ts`).
  O `DECIMAL` chega do backend como **string**: nunca `Number()` nem `parseFloat` em dinheiro.
  Datas sempre em `America/Sao_Paulo`.
- Os 12 princípios de `docs/DIVISAO_TRABALHO_TIME_09set2026.md` §4.2 valem integralmente. Em
  especial: toda tela com **quatro estados** (carregando, vazio, erro, conteúdo); status com
  **cor + rótulo**; ação indisponível **desabilitada com o motivo**; alvo de toque **≥ 48 px**.
- Componente nasce em `features/accounts/components/`; só sobe para `packages/ui` quando um
  segundo módulo precisar (§4.3). Antes de criar, consultar `packages/ui/CATALOGO.md`.
- Layout, rotas e sessão são do Gabriel: **trocar o `element` da rota `/comanda` é aditivo e
  livre**; mudar `AppShell`, `ProtectedRoute`, `RequireRole` ou a sessão exige acordo.

## [O QUE JÁ EXISTE] — leia nesta ordem

| Arquivo | Por quê |
|---|---|
| `frontend/DESIGN_PMS.md` | Contexto de domínio que as skills de design leem. No `apps/pms` lideram **Impeccable** e **emil-design-eng**; a `design-taste-frontend` **não** entra aqui. Densidade não é sujeira |
| `docs/FERRAMENTAL.md` | Que ferramenta usar em cada etapa e **quando não usar**. Inclui o `playwright` para ver a tela de verdade |
| `frontend/apps/pms/src/features/guests/` | **Módulo de referência a imitar**: `guestsApi.ts` (chamadas pelo api-client), `queries.ts` (TanStack Query), páginas com os quatro estados, teste em `guestFilter.test.ts` |
| `frontend/apps/pms/src/App.tsx` e `routes/nav.ts`, `routes/roleHome.ts` | A rota `/comanda` já existe com `Placeholder`, liberada para ADMIN, RECEPTIONIST e WAITER; o garçom já cai nela ao logar |
| `frontend/packages/domain/src/money.ts` e `state-machines.ts` | Dinheiro em centavos inteiros; máquinas de estado em allowlist |
| `frontend/packages/ui/src/index.ts` e `CATALOGO.md` | O que já existe: `Button`, `Field`, `Input`, `StatusBadge`, `feedback` |
| `services/core-service/routes/apis/accountRouter.js` | Endpoints: `GET /accounts`, `GET /accounts/:id`, `POST /accounts`, `POST /accounts/:id/items`, `GET /accounts/:id/bill` e `PUT /accounts/:id/close` (só ADMIN/RECEPTIONIST), `DELETE /accounts/:id/items/:itemId` (**só ADMIN**) |
| `services/core-service/routes/apis/productRouter.js` | Cardápio (`GET /products`) |
| `docs/specs/anexos/SPEC-04-decisoes-T-04.1.md` | **Regras que a tela precisa respeitar**: D-8 (quem pode o quê), D-19 (reenvio de item excluído → 200 com `deleted_at`), D-20 (quantidade 1 a 9999), D-21 (garçom só lança item do cardápio, faturável), D-22 (conta `ROOM` só recebe item com a reserva `CHECKED_IN`), D-23 (recusas em 422) |
| `docs/specs/anexos/SPEC-04-decisoes-T-04.3.md` e `-T-04.4.md` | Ciclo da conta: quando fecha, quando vira `PAID` |
| `/api-docs` do backend rodando | Schema real de request e response |

## [TAREFA] — Fase A: CA-05.5.a a j

Construir `frontend/apps/pms/src/features/accounts/` e ligar à rota `/comanda`:

1. **Lista de contas abertas** como tela inicial do garçom, sem tela intermediária (CA-a). Busca
   por rótulo e quarto. Botão de abrir conta `TABLE` ou `DIRECT` (o garçom não abre `ROOM`, D-8).
2. **Tela da conta:** cardápio em grade, categorias como *chips*, preço visível (CA-b); um toque
   lança quantidade 1, e a quantidade só aparece se for diferente (CA-c); rodapé fixo com o total
   da conta (CA-d).
3. **Fila offline** (CA-e, CA-f): cada lançamento ganha um `client_item_id` (UUID v4) **no
   momento do toque**, entra numa fila persistida no aparelho e é enviado quando houver rede. O
   reenvio do mesmo `client_item_id` é seguro: o backend responde 200 com o item existente (e com
   `deleted_at` se a recepção já o excluiu — mostrar "excluído pela recepção"). A confirmação na
   tela é **otimista**; erro de rede não aparece como falha, aparece como "na fila".
4. **Desfazer** em vez de diálogo de confirmação (CA-g). Atenção: o garçom **não** pode excluir
   item (DELETE é só ADMIN). Portanto o desfazer é uma **janela curta antes do envio**: o item
   fica na fila por alguns segundos com a opção "Desfazer"; desfeito, nunca chega ao servidor.
   Depois de enviado, só a gerência exclui.
5. **Cortesia** exibida com preço riscado e rótulo, somando zero (CA-h). O garçom **vê**, mas
   não lança cortesia (D-21); quem lança é a recepção, na mesma tela, quando o papel permitir.
6. **Uso com uma mão** (CA-i): alvos ≥ 48 px, ações na metade inferior da tela.
7. **Papel** (CA-j): o `WAITER` não vê nada além da comanda. Recepção e admin veem também o bill
   e o fechamento (`GET /bill`, `PUT /close`), com os botões desabilitados e o motivo quando a
   regra do backend impedir (ex.: conta de diária só fecha com a estadia encerrada).

## [CRITÉRIOS DE ACEITE]

**Cenário feliz**
- O garçom loga, cai na lista de contas abertas, abre uma mesa, lança três itens com três
  toques e vê o total atualizado no rodapé — sem nenhum diálogo.
- Com a rede desligada (DevTools offline), lança dois itens: aparecem como "na fila". Ao religar,
  são enviados uma vez só — conferir no `GET /accounts/:id` que não há duplicata.

**Erros**
- 422 do backend (ex.: conta fechada, conta `ROOM` sem check-in) aparece em linguagem do balcão,
  com o motivo, e o item sai da fila — não fica em reenvio eterno.
- 401 leva ao login sem perder a fila; 403 mostra "sem permissão" e não tenta de novo.
- 409 de `client_item_id` em outra conta (D-19) é tratado como bug e registrado no console, não
  como "na fila".

**O que NÃO pode mudar**
- Nenhum arquivo em `services/` (backend) nesta fase.
- `AppShell`, `ProtectedRoute`, `RequireRole` e a sessão.
- Nenhum `fetch` direto, nenhum `Number()` em dinheiro, nenhum `as unknown as`.

**Testes**
- Vitest para a lógica pura: a fila (enfileirar, desfazer na janela, reenvio idempotente, descarte
  em 422) e o cálculo de total com cortesia, a partir de `@hotel/domain`.
- Verificação real no navegador com o `playwright` (ou a skill `browser-automation`) em viewport
  de celular (375 × 812), com o backend rodando: a tela renderiza, sem erro de console, e o fluxo
  feliz e o offline funcionam.

## [OUTPUT ESPERADO]

1. Branch `feature/t055-comanda` a partir de `origin/develop`.
2. Commits Conventional, um por passo lógico, `git add` arquivo por arquivo.
3. `bash scripts/qa_checks.sh` limpo (atenção à **regra 9**: nada de `<button>`/`<input>` cru
   em `features/`, cor literal fora dos tokens).
4. Revisão de design com a skill **Impeccable** (`audit` e `critique`) e checagem de
   interação com a **emil-design-eng**, registrando o que foi aceito e recusado e por quê (o
   `DESIGN_PMS.md` prevalece em conflito).
5. Auditoria do **`qa-redteam`** em `docs/qa/` antes do merge — veredito no PR.
6. Capturas de tela da comanda no celular (online, offline e com cortesia) no PR.
7. SPEC-05: CA-05.5.a a j marcados com evidência.
8. Relatório em `docs/historico_sessao/sirlande/t055_comanda_frontend_<ddmmaaaa>.md`.
9. PR para `develop`. Merge só com o portão verde.

## 6. Quando parar e perguntar

- Se o `api-client` gerado não tiver o tipo de resposta de algum endpoint de `/accounts` ou
  `/products` — o conserto é no Swagger (backend), fora desta fase.
- Se precisar mudar layout, rotas protegidas ou sessão.
- Se a janela de "Desfazer" conflitar com alguma regra de fechamento de conta.
- Veredito REPROVADO do `qa-redteam` depois de uma tentativa de correção.

## 7. Fora desta delegação — Fase B, que precisa de backend antes

| CA | O que falta no backend | Onde |
|---|---|---|
| **CA-05.5.k** — mais lançados em destaque | Endpoint de produtos mais lançados por tenant (sem a tela baixar o histórico inteiro, princípio 7) | Trilha do Sirlande, SPEC-04 |
| **CA-05.5.l** — transferir item e conta | Rotas de transferência de item entre contas e de conta entre quartos/mesas | Trilha do Sirlande, SPEC-04 |
| **CA-05.5.m** — dividir no fechamento | Split bill | **T-04.6** |

A Fase B é delegação própria, depois da Fase A mergeada.
