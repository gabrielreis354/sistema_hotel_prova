// Fachada do módulo (princípio 2): o app importa só daqui.
export { RoomsListPage } from './RoomsListPage.js';
export { RoomNewPage, RoomEditPage } from './RoomFormPages.js';
export { CategoriesListPage } from './CategoriesListPage.js';
export { CategoryNewPage, CategoryEditPage } from './CategoryFormPages.js';
// Painel "Hoje" (T-05.3): liberar quarto em limpeza.
export { useReleaseRoom } from './queries.js';
