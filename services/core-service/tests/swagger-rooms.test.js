/**
 * Contrato OpenAPI de quartos (🟢-4 do qa-redteam de 30/10): o cliente tipado do frontend é
 * gerado deste spec, e o PUT /rooms/{id} saía com corpo sem tipo. A regeneração do api-client
 * fica com a T-05.1, depois do merge.
 */
import { describe, it, expect } from 'vitest';
import spec from '../config/swagger.js';
import { ROOM_STATUSES } from '../app/utils/roomRules.js';

describe('Swagger — PUT /rooms/{id}', () => {
    const put = spec.paths['/rooms/{id}'].put;
    const schema = put.requestBody?.content?.['application/json']?.schema;

    it('documenta o requestBody, com todos os campos opcionais', () => {
        expect(schema).toBeDefined();
        expect(Object.keys(schema.properties).sort()).toEqual(['category_id', 'floor', 'number', 'status']);
        expect(schema.required ?? []).toEqual([]);
    });

    it('status lista os valores aceitos e descreve as transições da edição', () => {
        expect(schema.properties.status.enum).toEqual(ROOM_STATUSES);
        expect(schema.properties.status.description).toMatch(/AVAILABLE ↔ MAINTENANCE/);
        expect(schema.properties.status.description).toMatch(/CLEANING → AVAILABLE/);
    });
});
