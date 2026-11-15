import { describe, it, expect } from 'vitest';
import { todayInHotel } from '../app/utils/hotelTimezone.js';
import { CHECK_IN_WINDOW, checkInWindow, checkInWindowError } from '../app/utils/checkInWindow.js';

// 🟡-3 do qa-redteam de 15/11: os testes de integração calculam "hoje" com a mesma todayInHotel
// do controller, então um erro de fuso passaria com tudo verde. Aqui o instante é fixo.
describe('todayInHotel — o dia no horário de Brasília, com o servidor em UTC', () => {
    it('02:59Z ainda é o dia anterior em Brasília (23:59)', () => {
        expect(todayInHotel(new Date('2026-11-16T02:59:00Z'))).toBe('2026-11-15');
    });
    it('03:00Z já é o dia seguinte (00:00 em Brasília)', () => {
        expect(todayInHotel(new Date('2026-11-16T03:00:00Z'))).toBe('2026-11-16');
    });
    it('formato YYYY-MM-DD, o mesmo das colunas DATEONLY', () => {
        expect(todayInHotel(new Date('2026-01-05T15:00:00Z'))).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
});

describe('checkInWindow — limites da janela', () => {
    const hoje = '2026-11-15';
    it.each([
        ['entrada hoje', '2026-11-15', '2026-11-16', CHECK_IN_WINDOW.OPEN],
        ['chegada atrasada dentro do período', '2026-11-13', '2026-11-16', CHECK_IN_WINDOW.OPEN],
        ['entrada amanhã', '2026-11-16', '2026-11-18', CHECK_IN_WINDOW.TOO_EARLY],
        ['saída hoje', '2026-11-14', '2026-11-15', CHECK_IN_WINDOW.EXPIRED],
        ['saída em setembro', '2026-09-10', '2026-09-12', CHECK_IN_WINDOW.EXPIRED],
        ['virada de ano', '2026-12-31', '2027-01-02', CHECK_IN_WINDOW.TOO_EARLY],
    ])('%s', (_nome, entrada, saida, esperado) => {
        expect(checkInWindow(entrada, saida, hoje)).toBe(esperado);
    });

    it('mensagens: data de entrada, saída passada e saída hoje', () => {
        const r = { check_in_date: '2026-11-20', check_out_date: '2026-11-15' };
        expect(checkInWindowError(CHECK_IN_WINDOW.TOO_EARLY, r, '2026-11-15').error).toContain('20/11/2026');
        expect(checkInWindowError(CHECK_IN_WINDOW.EXPIRED, r, '2026-11-15').error).toContain('a saída é hoje');
        expect(checkInWindowError(CHECK_IN_WINDOW.EXPIRED, r, '2026-11-16').error).toContain('a saída era 15/11/2026');
    });
});
