// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { Guest } from '../guests/index.js';
import { ApiError } from '../../lib/http.js';

// A página é testada pelo que faz com a resposta do servidor: queries e GuestPicker viram dublês.
const mutate = vi.hoisted(() => vi.fn());
vi.mock('./queries.js', () => ({
  useAvailableRooms: () => ({
    data: [{ id: 'r1', number: '101', category: { price_per_night: '200.00' } }],
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useCreateReservation: () => ({ mutate, isPending: false }),
}));

const ana: Guest = { id: 'g1', full_name: 'Ana Souza' };
vi.mock('./components/GuestPicker.js', () => ({
  GuestPicker: ({ selected, onSelect }: { selected: Guest | null; onSelect: (g: Guest | null) => void }) => (
    <div>
      <span>{selected ? `Selecionado: ${selected.full_name}` : 'Nenhum hóspede'}</span>
      <button onClick={() => onSelect(ana)}>Escolher Ana</button>
    </div>
  ),
}));

import { GuestNotFoundError } from './reservationsApi.js';
import { NewReservationPage } from './NewReservationPage.js';

afterEach(cleanup);

async function fillAndConfirm(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Escolher Ana' }));
  await user.click(screen.getByRole('button', { name: /101/ }));
  await user.click(screen.getByRole('button', { name: 'Confirmar reserva' }));
}

function renderPage() {
  render(
    <MemoryRouter>
      <NewReservationPage />
    </MemoryRouter>,
  );
  return userEvent.setup();
}

describe('NewReservationPage — 404 na criação', () => {
  it('hóspede não encontrado: limpa a seleção, desabilita "Confirmar" até nova escolha e fala de hóspede', async () => {
    mutate.mockImplementationOnce((_input, opts) => opts.onError(new GuestNotFoundError()));
    const user = renderPage();

    await fillAndConfirm(user);

    expect(screen.getByText('Nenhum hóspede')).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toMatch(/hóspede não foi encontrado/i);
    expect(screen.getByRole('alert').textContent).not.toMatch(/quarto/i);
    const confirm = screen.getByRole('button', { name: 'Confirmar reserva' }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);

    // Escolheu de novo: volta a poder confirmar.
    await user.click(screen.getByRole('button', { name: 'Escolher Ana' }));
    expect((screen.getByRole('button', { name: 'Confirmar reserva' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('404 de quarto: mantém o hóspede e a mensagem de quarto', async () => {
    mutate.mockImplementationOnce((_input, opts) =>
      opts.onError(new ApiError('Um dos quartos escolhidos não existe mais neste hotel.', 404)),
    );
    const user = renderPage();

    await fillAndConfirm(user);

    expect(screen.getByText('Selecionado: Ana Souza')).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toMatch(/quarto/i);
  });
});
