/**
 * Exemplos da reserva direta no Swagger (ensaio de 25/11, 🟢-5): no passo 6 a banca vê o
 * "Example Value" logo abaixo da resposta real. Sem exemplo, o Swagger UI preenche as datas com o
 * dia de hoje, e a entrada saía igual à saída ao lado de "nights: 3". Os exemplos usam as mesmas
 * datas do pedido do passo 6 (15/12 a 18/12, 3 noites).
 */
import { describe, it, expect } from 'vitest';
import spec from '../config/swagger.js';

const { schemas } = spec.components;
const params = spec.paths['/public/{subdomain}/availability'].get.parameters;
const example = (name) => params.find((p) => p.name === name).example;
const nightsBetween = (a, b) => (Date.parse(b) - Date.parse(a)) / 86_400_000;

describe('Swagger — exemplos da reserva direta (passo 6)', () => {
    const cases = [
        ['PublicAvailability', schemas.PublicAvailability.properties],
        ['PublicBookingResponse.reservation', schemas.PublicBookingResponse.properties.reservation.properties],
        ['PublicBookingStatus', schemas.PublicBookingStatus.properties],
    ];

    it.each(cases)('%s: entrada e saída do exemplo são as do pedido do passo 6', (_name, props) => {
        expect(props.check_in.example).toBe(example('check_in'));
        expect(props.check_out.example).toBe(example('check_out'));
    });

    it('as noites do exemplo batem com as datas', () => {
        const nights = nightsBetween(example('check_in'), example('check_out'));
        expect(schemas.PublicAvailability.properties.nights.example).toBe(nights);
        expect(schemas.PublicBookingResponse.properties.reservation.properties.nights.example).toBe(nights);
    });
});
