// Fita do hotel na tela (SPEC-10, F3). Renderiza no servidor, como as outras telas do painel.
import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { HotelStripView, RoomDetail, roomLabel } from './HotelStripView.js';
import { hotelStrip, type StripRoom } from '../hotelStrip.js';

const STRIP = hotelStrip(
  [
    { id: 'a', number: '101', floor: 1, status: 'AVAILABLE', category: { name: 'Standard' } },
    { id: 'c', number: '103', floor: 1, status: 'OCCUPIED', category: { name: 'Luxo' } },
    { id: 'e', number: '210', floor: 2, status: 'MAINTENANCE', category: { name: 'Standard' } },
  ],
  [],
  [{ id: 'r2', status: 'CHECKED_IN', check_in_date: '2026-11-24', check_out_date: '2026-11-27', guest: { full_name: 'Felipe Rocha' }, room: { id: 'c' } }],
);

const view = (over: Partial<Parameters<typeof HotelStripView>[0]> = {}) =>
  renderToString(
    <MemoryRouter>
      <HotelStripView strip={STRIP} sold={2} isLoading={false} isOffline={false} error={null} onRetry={() => {}} {...over} />
    </MemoryRouter>,
  );

describe('fita do hotel (SPEC-10, F3)', () => {
  it('mostra a ocupação, os vendidos e a legenda com a contagem de cada estado', () => {
    const html = view();
    expect(html).toContain('Ocupação agora');
    expect(html).toContain('33,3%');
    expect(html).toMatch(/1 de 3 quartos ocupados/);
    expect(html).toContain('Vendidos hoje');
    for (const rotulo of ['Ocupado', 'Chega hoje', 'Em limpeza', 'Manutenção', 'Livre']) expect(html).toContain(rotulo);
    // A legenda é filtro: botão com aria-pressed.
    expect(html.match(/aria-pressed="false"/g)?.length).toBe(5);
  });

  it('cada quarto diz o estado em texto, não só pela cor (DESIGN_PMS §5)', () => {
    const html = view();
    expect(html).toContain('aria-label="Quarto 103, Ocupado, Felipe Rocha"');
    expect(html).toContain('aria-label="Quarto 101, Livre"');
    // Manutenção é hachurada, e os estados com ação têm ícone além da cor.
    expect(html).toContain('strip-hatch');
    expect(html.match(/data-tone-icon/g)?.length).toBe(2);
  });

  it('os andares aparecem com o nome', () => {
    const html = view();
    expect(html).toContain('1º andar');
    expect(html).toContain('2º andar');
  });

  it('sem rede e sem dado: diz isso, sem "—" nem spinner', () => {
    const html = view({ strip: null, isOffline: true });
    expect(html).toContain('Sem conexão. Os quartos aparecem quando a rede voltar.');
    expect(html).not.toContain('Carregando');
  });

  it('carregando: diz que está carregando (🟢 F3 da linha de base: antes ficava "—" parado)', () => {
    expect(view({ strip: null, isLoading: true })).toContain('Carregando os quartos…');
  });

  it('erro sem dado: o ErrorState com "Tentar de novo"', () => {
    const html = view({ strip: null, error: new Error('Não foi possível carregar os quartos.') });
    expect(html).toContain('Não foi possível carregar os quartos.');
    expect(html).toContain('Tentar de novo');
  });
});

describe('painel do quarto (só informação, decisão de 25/11)', () => {
  const quarto = (over: Partial<StripRoom>): StripRoom => ({ id: 'c', number: '103', category: 'Luxo', tone: 'occupied', ...over });
  const detail = (room: StripRoom) =>
    renderToString(
      <MemoryRouter>
        <RoomDetail room={room} onClose={() => {}} />
      </MemoryRouter>,
    );

  it('ocupado: hóspede, datas e o link para a reserva', () => {
    const html = detail(quarto({ guest: 'Felipe Rocha', reservationId: 'r2', checkIn: '2026-11-24', checkOut: '2026-11-27' }));
    expect(html).toContain('Quarto 103');
    expect(html).toContain('Luxo');
    expect(html).toContain('Felipe Rocha');
    expect(html).toContain('24/11/2026 → 27/11/2026');
    expect(html).toContain('href="/reservas/r2"');
    expect(html).toContain('aria-label="Fechar o detalhe do quarto"');
  });

  it('chega hoje: leva também à linha da chegada, onde está o check-in; atrasada diz isso', () => {
    const html = detail(quarto({ tone: 'booked', guest: 'Wesley', reservationId: 'r1', checkIn: '2026-11-24', checkOut: '2026-11-26', late: true }));
    expect(html).toContain('href="#chegadas-titulo"');
    expect(html).toContain('atrasada');
  });

  it('em limpeza leva ao bloco Em limpeza; livre e manutenção só informam', () => {
    expect(detail(quarto({ tone: 'cleaning' }))).toContain('href="#limpeza-titulo"');
    expect(detail(quarto({ tone: 'free' }))).toContain('Pronto para vender.');
    expect(detail(quarto({ tone: 'maintenance' }))).toContain('Bloqueado para venda.');
  });

  it('roomLabel junta número, estado e hóspede', () => {
    expect(roomLabel(quarto({ guest: 'Ana' }))).toBe('Quarto 103, Ocupado, Ana');
    expect(roomLabel(quarto({ tone: 'free' }))).toBe('Quarto 103, Livre');
  });
});

describe('blocos do painel (SPEC-10, F3)', async () => {
  const { TodayBlock } = await import('./TodayBlock.js');
  const { LogIn } = await import('lucide-react');
  const bloco = (over: Partial<Parameters<typeof TodayBlock>[0]> = {}) =>
    renderToString(
      <TodayBlock id="chegadas" title="Chegadas" icon={LogIn} caption="x" isLoading={false} error={null} onRetry={() => {}} isEmpty={false} empty={{ title: 'Nenhuma.' }} count={2} {...over}>
        <p>linha</p>
      </TodayBlock>,
    );

  it('ícone tingido no cabeçalho, decorativo', () => {
    expect(bloco()).toMatch(/<span aria-hidden="true" class="[^"]*bg-brand\/10[^"]*"><svg/);
  });

  it('o alerta do bloco aparece no cabeçalho, com ponto e texto', () => {
    const html = bloco({ alert: { tone: 'maintenance', text: '1 sem pagamento' } });
    expect(html).toContain('1 sem pagamento');
    expect(html).toContain('bg-status-maintenance');
  });

  it('o vazio traz o ícone do bloco', () => {
    const html = bloco({ isEmpty: true });
    expect(html).toContain('Nenhuma.');
    expect(html.match(/lucide-log-in/g)?.length).toBe(2);
  });
});
