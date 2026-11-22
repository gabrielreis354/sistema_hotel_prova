// Repasse da SPEC-11 (§3, "Seed com CPFs inválidos"): o seed grava por SQL e não passa pela
// validação do balcão. Com a T-11.1, o POST/PUT de hóspede passa a recusar CPF com dígito
// verificador errado. Um hóspede do seed com CPF inválido vira um cadastro que a própria tela
// não consegue salvar de novo, e é o primeiro CPF que a banca digita na busca.
import { describe, it, expect, beforeAll } from 'vitest';
import { QueryTypes } from 'sequelize';
import sequelize from '../database/connections/sequelize.js';
import runSeedFiles from '../database/runSeed.js';
import { isValidCpf } from '../app/utils/isValidCpf.js';
import { truncateAll } from './helpers/db.js';

const q = (sql) => sequelize.query(sql, { type: QueryTypes.SELECT });

describe('seed — CPFs válidos (repasse da SPEC-11)', () => {
    beforeAll(async () => {
        await truncateAll();
        await runSeedFiles(sequelize);
    });

    it('todo hóspede do seed tem CPF com dígito verificador válido', async () => {
        const guests = await q(`SELECT cpf FROM guests WHERE cpf IS NOT NULL`);
        expect(guests.length).toBeGreaterThan(0);
        expect(guests.filter((g) => !isValidCpf(g.cpf)).map((g) => g.cpf)).toEqual([]);
    });

    it('todo representante de cliente corporativo do seed tem CPF válido', async () => {
        const reps = await q(`SELECT representante_cpf AS cpf FROM corporate_clients WHERE representante_cpf IS NOT NULL`);
        expect(reps.length).toBeGreaterThan(0);
        expect(reps.filter((r) => !isValidCpf(r.cpf)).map((r) => r.cpf)).toEqual([]);
    });
});

describe('seed — banco semeado antes da troca dos CPFs', () => {
    let antes;

    beforeAll(async () => {
        await truncateAll();
        await runSeedFiles(sequelize);
        // Volta ao retrato de antes de 22/11: CPF "3" + 8 zeros + número do hóspede (30000000006),
        // no lugar do novo "3" + 6 zeros + número + 2 verificadores (300000006XX).
        await sequelize.query(`UPDATE guests SET cpf = substr(cpf, 1, 1) || '00000000' || substr(cpf, 8, 2)`);
        await sequelize.query(`UPDATE corporate_clients
            SET representante_cpf = repeat(substr(cnpj, 1, 1), 9) || '0' || substr(cnpj, 14, 1)`);  // 11111111101
        antes = await q(`SELECT id, full_name FROM guests ORDER BY id`);
        await runSeedFiles(sequelize);
    });

    it('rodar o seed de novo troca o CPF do mesmo hóspede, sem criar hóspede duplicado', async () => {
        const depois = await q(`SELECT id, full_name, cpf FROM guests ORDER BY id`);
        expect(depois.map(({ id, full_name }) => ({ id, full_name }))).toEqual(antes);
        expect(depois.filter((g) => !isValidCpf(g.cpf)).map((g) => g.cpf)).toEqual([]);
    });

    it('e troca o CPF dos representantes corporativos', async () => {
        const reps = await q(`SELECT representante_cpf AS cpf FROM corporate_clients`);
        expect(reps.filter((r) => !isValidCpf(r.cpf)).map((r) => r.cpf)).toEqual([]);
    });
});
