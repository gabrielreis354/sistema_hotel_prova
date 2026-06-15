import request from 'supertest';

let counter = 0;

// Registra um tenant + admin e faz login, retornando o JWT e os IDs criados.
export async function registerAndLogin(app, overrides = {}) {
    counter++;
    const tenantName = overrides.tenantName ?? `Hotel Teste ${counter} ${Date.now()}`;
    const email      = overrides.email      ?? `admin_${counter}_${Date.now()}@test.com`;
    const password   = overrides.password   ?? 'senha123';

    const regRes = await request(app).post('/auth/register').send({
        tenantName,
        name: overrides.name ?? 'Admin',
        email,
        password,
    });

    if (regRes.status !== 201) {
        throw new Error(`[registerAndLogin] Register falhou: ${regRes.status} — ${JSON.stringify(regRes.body)}`);
    }

    const loginRes = await request(app).post('/auth/login').send({ email, password });

    if (loginRes.status !== 200) {
        throw new Error(`[registerAndLogin] Login falhou: ${loginRes.status} — ${JSON.stringify(loginRes.body)}`);
    }

    return {
        jwt:      loginRes.body.token,
        tenantId: regRes.body.tenant?.id,
        userId:   regRes.body.user?.id,
        email,
        password,
        tenantName,
    };
}
