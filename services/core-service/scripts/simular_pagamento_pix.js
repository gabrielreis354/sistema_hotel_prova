#!/usr/bin/env node
// Script de apoio para demonstração (T-06.9) — simula um PSP real notificando
// o pagamento de um PIX: assina o corpo com PIX_WEBHOOK_SECRET (o mesmo HMAC
// que FakePixProvider.signNotification() usa nos testes) e chama POST
// /webhooks/pix com o cabeçalho x-pix-signature correto.
//
// Uso:
//   node scripts/simular_pagamento_pix.js <provider_charge_id> [base_url]
//
// Exemplo (fluxo completo na demo):
//   1. Crie uma reserva pública: POST /public/<subdomain>/bookings
//   2. Pegue o pix.provider_charge_id da resposta
//   3. node scripts/simular_pagamento_pix.js fake_xxxxxxxx-xxxx-... http://localhost:3000
//
// Sem PIX_WEBHOOK_SECRET no ambiente, o script recusa rodar — o mesmo
// fail-closed que o próprio webhook aplica (não faz sentido "demonstrar"
// enviando uma requisição que o servidor vai rejeitar por configuração).

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';
import { computePixSignature } from '../app/utils/pixWebhookSignature.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

async function main() {
    const [providerChargeId, baseUrlArg] = process.argv.slice(2);
    const baseUrl = baseUrlArg || process.env.API_BASE_URL || 'http://localhost:3000';
    const secret = process.env.PIX_WEBHOOK_SECRET;

    if (!providerChargeId) {
        console.error('Uso: node scripts/simular_pagamento_pix.js <provider_charge_id> [base_url]');
        process.exit(1);
    }

    if (!secret) {
        console.error('❌ PIX_WEBHOOK_SECRET não configurado no ambiente — não é possível assinar a notificação.');
        console.error('   Defina PIX_WEBHOOK_SECRET (.env) antes de rodar este script.');
        process.exit(1);
    }

    const rawBody = JSON.stringify({ provider_charge_id: providerChargeId });
    const signature = computePixSignature(rawBody, secret);

    console.log(`→ POST ${baseUrl}/webhooks/pix`);
    console.log(`  provider_charge_id: ${providerChargeId}`);
    console.log(`  x-pix-signature: ${signature}`);

    const response = await fetch(`${baseUrl}/webhooks/pix`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-pix-signature': signature
        },
        body: rawBody
    });

    const body = await response.json().catch(() => null);
    console.log(`← ${response.status} ${response.statusText}`);
    console.log(JSON.stringify(body, null, 2));

    if (!response.ok) {
        process.exit(1);
    }
}

main().catch((error) => {
    console.error('❌ Falha ao simular o pagamento PIX:', error.message);
    process.exit(1);
});
