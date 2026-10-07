// Papéis válidos do sistema — fonte única da verdade, usada pelos controllers de
// usuário e espelhada no CHECK (role IN (...)) de db/schema.sql.
// WAITER (garçom) lança consumo pelo celular e não enxerga gestão
// (quartos, usuários, analytics).
export const VALID_ROLES = ['ADMIN', 'RECEPTIONIST', 'WAITER'];

// Least privilege do WAITER (SPEC-04 §6, CA-04.1.n) — ALLOWLIST, não blocklist.
// O garçom lê o cardápio e lança nas comandas; qualquer outra rota autenticada é
// negada. Fail-safe: um router novo nasce fechado para o garçom sem precisar
// lembrar de se proteger. Liberar algo para ele é decisão explícita, aqui.
//
// `path` é o caminho sem query string. A âncora `(\/|$)` impede que um prefixo
// parecido (`/productsX`) entre pela regra de `/products`.
const WAITER_ALLOWLIST = [
    { methods: ['GET'], path: /^\/products(\/|$)/ },
    { methods: ['GET', 'POST', 'DELETE'], path: /^\/accounts(\/|$)/ }
];

export function isRouteAllowedForRole(role, method, path) {
    if (role !== 'WAITER') return true;
    return WAITER_ALLOWLIST.some(rule => rule.methods.includes(method) && rule.path.test(path));
}
