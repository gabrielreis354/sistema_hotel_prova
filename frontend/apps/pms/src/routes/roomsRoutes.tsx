import { Route } from 'react-router-dom';
import {
  RoomsListPage,
  RoomNewPage,
  RoomEditPage,
  CategoriesListPage,
  CategoryNewPage,
  CategoryEditPage,
} from '../features/rooms/index.js';

/**
 * Rotas de quartos e categorias (T-05.1), fora do App.tsx para que cada módulo mexa no seu
 * arquivo e o App.tsx só ganhe uma linha por grupo — menos conflito entre frentes paralelas.
 *
 * São fragmentos, não componentes: o <Routes> do React Router só aceita <Route> e
 * <Fragment> como filhos. Cada um entra DENTRO do gate de papel certo no App.tsx.
 */

/** Leitura — vai no grupo ADMIN + RECEPTIONIST: a recepção consulta, em modo leitura. */
export const roomsReadRoutes = (
  <>
    <Route path="quartos" element={<RoomsListPage />} />
    <Route path="quartos/categorias" element={<CategoriesListPage />} />
  </>
);

/** Escrita — vai no grupo só ADMIN, espelhando o requireRole('ADMIN') do backend. */
export const roomsAdminRoutes = (
  <>
    <Route path="quartos/novo" element={<RoomNewPage />} />
    <Route path="quartos/:id/editar" element={<RoomEditPage />} />
    <Route path="quartos/categorias/nova" element={<CategoryNewPage />} />
    <Route path="quartos/categorias/:id/editar" element={<CategoryEditPage />} />
  </>
);
