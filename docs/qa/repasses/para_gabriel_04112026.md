# Repasses para Gabriel — 04/11/2026

Origem: `docs/qa/redteam_logout-limpa-cache_04nov2026.md` (branch `fix/logout-limpa-cache`). Área: casca do `apps/pms` (sessão). Este achado não reprova a branch auditada: ele já existia em `develop@3e68e7f`.

### 🔴 [Segurança/LGPD] O logout não se propaga para outras abas: a outra aba continua logada como o usuário anterior
**Onde:** `frontend/apps/pms/src/stores/auth.ts:23-38`. O `persist` do zustand 5.0.14 grava no `localStorage`, mas não escuta o evento `storage`: `grep "addEventListener\|'storage'" node_modules/.../zustand/esm/middleware.mjs` não acha nada. Nenhum código do app chama `useAuthStore.persist.rehydrate()`.
**Cenário:** no computador compartilhado da recepção, a recepcionista do Hotel A tem duas abas do PMS abertas, `/hospedes` e `/reservas`. Ela clica em "Sair" na aba 2. O `logout()` limpa o cache **da aba 2** e grava `{token:null}` no `localStorage`. A aba 1 não fica sabendo: continua com o token de A na memória (válido por 8 h, `LoginController.js:56`), com o cache de A na tela, e qualquer request dela sai como A. A próxima pessoa no computador, inclusive alguém de outro hotel que entra pela aba 2, troca para a aba 1 e opera como A: vê hóspedes (nome, documento, contato), lança na comanda com `created_by` de A e assim por diante. A correção do cache (branch `fix/logout-limpa-cache`) não tem como cobrir esse caso, porque o que sobra não é cache: é uma sessão viva.
**Regra violada:** CLAUDE.md §7 (vazamento cross-tenant) e LGPD art. 46 (segurança do tratamento). A trilha de auditoria (`created_by`) também fica errada.
**Correção sugerida:** escutar `window.addEventListener('storage', e => { if (e.key === 'hotel-pms-auth') useAuthStore.persist.rehydrate() })` e, depois de reidratar, chamar `queryClient.clear()` quando o `user.id` mudar ou o token sumir (mesma regra do `setSession`). Também serve um `BroadcastChannel('gesway-auth')` que avisa logout e troca de usuário. Teste: disparar um `StorageEvent` com a sessão nula e verificar que o store e o cache da aba ficaram vazios.

---

## Repasse da T-05.3 — Gabriel (H.3 / analytics)

Origem: qa-redteam da T-05.3, painel "Hoje" (`docs/qa/redteam_t053-painel-hoje_04nov2026.md`). Este achado não reprova a branch. O bug de fuso do mesmo endpoint já está em `para_gabriel_h3_04112026.md` e não foi repetido aqui.

---

### 🟢 [LGPD · minimização] `/analytics/alerts` do core ainda envia `guest_phone` e o nome do hóspede, e agora todo aparelho da recepção busca isso a cada 60 s
**Onde:** `services/core-service/app/Controllers/AnalyticsApi/GetAlertsController.js:10-12` (`g.full_name AS guest`, `g.phone AS guest_phone`) e `:47-52`.

**Cenário:** o painel "Hoje" (`features/today/queries.ts`, `refetchInterval: 60_000`) chama `/analytics/alerts` o turno inteiro, em cada aparelho da recepção. A tela não lê `guest_phone` nem `guest`: `RawAlerts` ignora os dois e o nome vem da listagem de reservas. Mesmo assim, o telefone de toda chegada CONFIRMED sem pagamento do dia trafega e fica no cache do navegador e nos DevTools, sem nenhum uso.

**Regra violada:** LGPD art. 6º, III (necessidade/minimização).

**Correção sugerida:** a H.3 (PR #109) já tira `guest_phone` do contrato. Se o cutover atrasar para depois da demonstração de 10/12, tirar `g.phone` e `g.full_name` do SELECT do core também. O painel não depende de nenhum dos dois.
