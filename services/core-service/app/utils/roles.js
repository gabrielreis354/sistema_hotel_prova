// Papéis válidos do sistema — fonte única da verdade, usada pelos controllers de
// usuário e espelhada no CHECK (role IN (...)) de db/schema.sql.
// WAITER (garçom) lança consumo pelo celular e não enxerga gestão
// (quartos, usuários, analytics).
export const VALID_ROLES = ['ADMIN', 'RECEPTIONIST', 'WAITER'];

// Escopo de rota por papel (SPEC-04 §6, CA-04.1.n) — ALLOWLIST, não blocklist.
//
// ADMIN e RECEPTIONIST passam aqui e seguem para o `requireRole` de cada rota.
// O WAITER só alcança o que está listado abaixo. Qualquer outro papel — inclusive
// um que venha a ser criado, ou um token sem `role` — é negado: o próximo papel
// nasce sem acesso, e liberar é decisão explícita, aqui.
const FULL_ACCESS_ROLES = ['ADMIN', 'RECEPTIONIST'];

// Uma regra por rota, não por prefixo: `/accounts` vai ganhar `/bill` e `/close`
// (T-04.3), que mostram saldo e pagamentos do hóspede — o garçom não pode herdá-las
// por acidente. Ficam de fora também excluir conta e excluir item (só ADMIN, D-8).
// `path` é o caminho sem query string; `[^/]+` é um único segmento (o :id).
const WAITER_ALLOWLIST = [
    { method: 'GET',  path: /^\/products\/?$/ },               // cardápio
    { method: 'GET',  path: /^\/products\/[^/]+\/?$/ },       // item do cardápio
    { method: 'GET',  path: /^\/accounts\/?$/ },               // listar comandas
    { method: 'GET',  path: /^\/accounts\/[^/]+\/?$/ },       // ver comanda
    { method: 'POST', path: /^\/accounts\/?$/ },               // abrir mesa/balcão (D-8)
    { method: 'POST', path: /^\/accounts\/[^/]+\/items\/?$/ } // lançar item
];

export function isRouteAllowedForRole(role, method, path) {
    if (FULL_ACCESS_ROLES.includes(role)) return true;
    if (role !== 'WAITER') return false;
    return WAITER_ALLOWLIST.some(rule => rule.method === method && rule.path.test(path));
}
