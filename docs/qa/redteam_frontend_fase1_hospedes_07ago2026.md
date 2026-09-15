# QA Red Team — Frontend Fase 1 (Hóspedes)
**Branch:** feature/frontend-fase1-hospedes · **Base:** feature/frontend-fase0-fundacao@362b655 · **Data:** 07/08/2026
**Arquivos auditados:** 12 · **Achados:** 6 (🔴 0 · 🟡 3 · 🟢 3)

## Veredito
APROVADO COM RESSALVAS

Nenhum achado 🔴. Os critérios de aceite estruturais (CRUD real, sem mock, sem `tenant_id` no
front, sem log de token/PII, 409 tratado, papel protegido, datas via `@hotel/domain`, ESM sem
`require`) estão atendidos. As ressalvas são dívida técnica de teste e um padrão de carga que
não escala — nada que vaze dado ou perca dinheiro nesta fase.

## Achados

### 🟡 [testes] Feature de Hóspedes entregue sem nenhum teste automatizado
**Onde:** `frontend/apps/pms/` (não há `*.test.*`/`*.spec.*` no app; `pms/package.json` não
configura vitest — só o `turbo run test` raiz).
**Cenário:** o CRUD inteiro, o filtro de busca (`matches`), o filtro de estadias por `guest_id`
e o mapeamento de erro 409 → mensagem não têm cobertura. Uma regressão (ex.: `matches` deixar de
casar CPF, ou `createGuest` parar de tratar 409) passa despercebida no CI.
**Regra violada:** checklist §8 (feature nova sem teste; falta teste de caminho de erro). O
portão de 60% do CI só existe hoje no `@hotel/domain` — o app não contribui cobertura.
**Correção sugerida:** adicionar vitest ao `apps/pms` e ao menos testar `matches()` (unidade
pura, sem rede) e o mapeamento de status→mensagem de `guestsApi` (mockando `api`). São os dois
pontos de regra de negócio testáveis sem backend.

### 🟡 [performance/PII] Histórico de estadias baixa TODAS as reservas do tenant no cliente
**Onde:** `frontend/apps/pms/src/features/guests/GuestDetailPage.tsx:18-23`
**Cenário:** abrir a ficha de qualquer hóspede dispara `GET /reservations` sem filtro e traz a
lista inteira do tenant para o browser, para então filtrar por `guest_id` em memória. Com o hotel
em operação (milhares de reservas), cada abertura de ficha transfere e mantém em cache no cliente
dados de reservas de todos os outros hóspedes — só para exibir as de um. Custo de rede cresce
linearmente e o payload carrega associações de terceiros para o navegador sem necessidade.
**Regra violada:** minimização de tráfego/dado no cliente; KISS/escala. O próprio comentário
reconhece a limitação ("troca por `?guest_id=` quando o backend expuser"). Confirmei no
`schema.d.ts` (`"/reservations"` → `query?: never`) que hoje não há filtro server-side, então a
escolha é aceitável **nesta fase** conforme o critério #4 do plano — por isso 🟡, não 🔴.
**Correção sugerida:** registrar como pendência dependente do backend (`GET /reservations?guest_id=`).
Enquanto não existe, ao menos aplicar paginação/limite ou `staleTime` alto e chave de cache
compartilhada para não refazer o fetch integral a cada ficha aberta.

### 🟡 [ux/acessibilidade] Botões de ação destrutiva/edição em `size="compact"` (36px) em tela usada no mobile
**Onde:** `GuestDetailPage.tsx:47-77` (Editar/Excluir/Confirmar/Cancelar, todos `size="compact"`
= `h-9` ≈ 36px); `GuestsListPage.tsx:26` ("Novo hóspede" também `compact`).
**Cenário:** o PMS é usado em recepção que pode ser tablet/celular. `compact` (36px) fica abaixo
do alvo de 48×48px que o próprio `Button` define como `comfortable`/`min-h-touch`. O par
"Confirmar/Cancelar" de exclusão fica especialmente apertado num toque, e são ações destrutivas
lado a lado — risco de toque errado.
**Regra violada:** §10 / §8.2 do plano de frontend (alvo de toque ≥ 48px em tela mobile).
**Correção sugerida:** usar `comfortable` (default) para as ações da ficha, ou reservar `compact`
apenas para densidade de desktop conforme a intenção documentada no próprio `Button.tsx`
("compact = tabelas/rack no desktop").

### 🟢 [acessibilidade] Campo de busca sem rótulo associado
**Onde:** `GuestsListPage.tsx:52-57`
**Cenário:** o `<Input type="search">` só tem `placeholder`. Placeholder não é rótulo acessível —
leitor de tela não anuncia o propósito do campo, e o texto some ao digitar.
**Regra violada:** §10 (acessibilidade). Baixo impacto porque o `placeholder` é descritivo.
**Correção sugerida:** envolver no `Field label="Buscar"` (que já existe) ou adicionar
`aria-label="Buscar hóspedes"`.

### 🟢 [dip/tipagem] Casts `as unknown as Guest` e `as never` mascaram tipos do cliente "tipado"
**Onde:** `guestsApi.ts:18,26,35,43,49` e `GuestDetailPage.tsx:21`
**Cenário:** o Swagger do backend declara `content?: never` em todas as respostas de `/guests*`
(200/201) e nenhum `requestBody` em `PUT /guests/{id}` — confirmado em
`packages/api-client/src/schema.d.ts:1042-1167` e `2469`. Por isso o "cliente tipado" devolve
`data: never`, e cada leitura precisa do cast. A promessa de segurança de tipo ponta-a-ponta não
se sustenta para este módulo — se o backend renomear um campo, o TS não acusa.
**Regra violada:** nenhuma do escopo J3 — é lacuna do Swagger do backend (fora do escopo de
edição desta branch). O `as never` no PUT é a mesma raiz e está corretamente documentado no
código como pendência. Registro para não passar despercebido.
**Correção sugerida (fora desta branch):** backend declarar `responses.200.content` e o
`requestBody` do PUT no Swagger; ao regenerar o `@hotel/api-client`, todos os casts caem
naturalmente. Não há alternativa melhor no front sem editar o backend — o cast localizado é a
escolha correta para a fase.

### 🟢 [ux] Erro de exclusão exibe mensagem, mas genérica para conflito de integridade
**Onde:** `GuestsApi.ts:52-57` + `GuestDetailPage.tsx:66-68`
**Cenário:** excluir hóspede que possui reservas provavelmente retorna 409/constraint no backend;
o front cai no ramo genérico "Não foi possível remover o hóspede." — diz o que falhou, não o que
fazer. O critério §10 pede erro acionável.
**Regra violada:** §10 (erro que diz o que fazer). Baixo impacto — depende do status real do
backend, que não pude exercitar aqui.
**Correção sugerida:** tratar 409 no `deleteGuest` com mensagem tipo "Este hóspede tem reservas
vinculadas e não pode ser excluído." (SUSPEITA quanto ao status exato — ver seção abaixo).

## O que foi verificado e está correto
- **Sem mock:** `guestsApi.ts` consome `GET/POST/PUT/DELETE /guests` e `GET /guests/:id` reais via
  `@hotel/api-client` (`api.GET/POST/PUT/DELETE`).
- **Sem `tenant_id` no front:** o diff não contém `tenant_id` em body/query em nenhum ponto
  (grep confirmado). Isolamento fica no backend; o front só injeta `Authorization: Bearer` via
  middleware do `createApiClient`.
- **Sem log de token/PII:** nenhum `console.*` no diff; o cliente não loga corpo/headers.
- **409 tratado explicitamente** em `createGuest`/`updateGuest` com mensagem clara (não 500).
- **`full_name` obrigatório:** Zod `min(1)` em `GuestForm.tsx:8`.
- **Proteção por papel:** `App.tsx:25` restringe `/hospedes*` a `['ADMIN','RECEPTIONIST']`;
  `RequireRole` redireciona WAITER para o home dele. WAITER não acessa hóspedes.
- **Datas via `@hotel/domain`:** `formatDateBR` (timezone `America/Sao_Paulo`, parsing que não
  escorrega dia) — sem reimplementação nem `Number()`/`new Date(string)` cru.
- **ESM sem `require()`:** nenhum `require(` no diff; imports com extensão `.js`.
- **Estados de UI:** loading (`Spinner`), vazio com ação sugerida (`EmptyState` + botão),
  erro com retry na lista, `aria-invalid` nos campos, `role="alert"` nos erros.
- **Filtro de estadias no cliente:** aceitável nesta fase — confirmado que o Swagger não expõe
  `?guest_id=` em `/reservations` (critério #4 do plano).

## Não foi possível verificar
- **Status HTTP reais do backend** para exclusão com reservas vinculadas e para duplicidade
  (409 vs outro código). O relato da entrega diz que login/GET /guests/GET /reservations
  retornaram 200 no proxy, mas os caminhos de erro (409, conflito de FK no DELETE) não foram
  exercitados aqui — daí o achado de DELETE ser 🟢/SUSPEITA quanto ao código exato.
- **Renderização real e contraste AA** dos tokens (`text-status-maintenance`, `text-brand`):
  auditoria foi estática, sem rodar a UI nem medir contraste.
- **Comportamento com volume real de reservas** no histórico (só inferido do `filter` client-side).
