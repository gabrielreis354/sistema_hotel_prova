import { describe, it, expect } from 'vitest';
import { createRoutesFromElements } from 'react-router-dom';
import { roomsReadRoutes, roomsAdminRoutes } from './roomsRoutes.js';

// Trava o refactor que tirou as rotas de quartos do App.tsx: os caminhos são exatamente os
// de antes, e a separação leitura × escrita (que decide o gate de papel) não pode vazar.
const paths = (el: Parameters<typeof createRoutesFromElements>[0]) =>
  createRoutesFromElements(el).map((r) => r.path);

describe('roomsRoutes', () => {
  it('leitura: lista de quartos e de categorias', () => {
    expect(paths(roomsReadRoutes)).toEqual(['quartos', 'quartos/categorias']);
  });

  it('escrita: novo/editar de quarto e de categoria', () => {
    expect(paths(roomsAdminRoutes)).toEqual([
      'quartos/novo',
      'quartos/:id/editar',
      'quartos/categorias/nova',
      'quartos/categorias/:id/editar',
    ]);
  });

  it('nenhuma rota de escrita no grupo de leitura (a recepcao nao alcanca o formulario)', () => {
    const leitura = paths(roomsReadRoutes);
    for (const p of paths(roomsAdminRoutes)) expect(leitura).not.toContain(p);
  });
});
