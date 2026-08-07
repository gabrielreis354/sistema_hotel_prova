// Categorias válidas do cardápio — fonte única da verdade, usada pelos controllers
// de produto e espelhada no CHECK (category IN (...)) de db/schema.sql.
// Mesmo padrão de app/utils/roles.js.
//
// SERVICE cobre o que não é consumível (day-use, sonorização, lavanderia) — é a
// distinção que evita precisar de um campo "controla_estoque" enquanto estoque
// estiver fora de escopo.
export const PRODUCT_CATEGORIES = ['FOOD', 'DRINK', 'SERVICE', 'OTHER'];
