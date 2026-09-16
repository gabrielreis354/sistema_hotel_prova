// Papéis válidos do sistema — fonte única da verdade, usada pelos controllers de
// usuário e espelhada no CHECK (role IN (...)) de db/schema.sql.
// WAITER (garçom) lança consumo pelo celular e não enxerga gestão
// (quartos, usuários, analytics).
export const VALID_ROLES = ['ADMIN', 'RECEPTIONIST', 'WAITER'];
