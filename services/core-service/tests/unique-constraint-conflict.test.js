import { describe, it, expect, vi } from 'vitest';
import { UniqueConstraintError } from 'sequelize';
import uniqueConstraintConflict from '../app/utils/uniqueConstraintConflict.js';

// Teste unitário puro — sem banco, sem app. O helper é usado por 11 controllers mas
// nunca tinha teste próprio; a cobertura vinha só de lado, através deles. O ramo do
// mapa vazio ('Registro já existe') nunca era exercitado (achado 🟢-4 da reauditoria).

function fakeResponse() {
    const res = {};
    res.status = vi.fn(() => res);
    res.json = vi.fn(() => res);
    return res;
}

describe('uniqueConstraintConflict', () => {
    it('não é UniqueConstraintError → devolve null, controller segue para o 500', () => {
        const res = fakeResponse();
        const resultado = uniqueConstraintConflict(new Error('outra coisa'), res);

        expect(resultado).toBeNull();
        expect(res.status).not.toHaveBeenCalled();
    });

    it('índice conhecido no mapa → 409 com a mensagem específica', () => {
        const res = fakeResponse();
        const erro = new UniqueConstraintError({ parent: { constraint: 'guests_cpf_tenant_unique' } });

        const resultado = uniqueConstraintConflict(erro, res);

        expect(resultado).toBe(res);
        expect(res.status).toHaveBeenCalledWith(409);
        expect(res.json).toHaveBeenCalledWith({ error: 'CPF já cadastrado para outro hóspede' });
    });

    it('índice fora do mapa → 409 com mensagem genérica (ramo antes nunca coberto)', () => {
        const res = fakeResponse();
        const erro = new UniqueConstraintError({ parent: { constraint: 'indice_novo_sem_entrada' } });

        uniqueConstraintConflict(erro, res);

        expect(res.status).toHaveBeenCalledWith(409);
        expect(res.json).toHaveBeenCalledWith({ error: 'Registro já existe' });
    });

    it('mensagemGenerica explícita sobrepõe a do mapa — caso do RegisterController', () => {
        const res = fakeResponse();
        const erro = new UniqueConstraintError({ parent: { constraint: 'users_email_tenant_unique' } });

        uniqueConstraintConflict(erro, res, 'E-mail ou subdomain já em uso');

        expect(res.json).toHaveBeenCalledWith({ error: 'E-mail ou subdomain já em uso' });
    });
});
