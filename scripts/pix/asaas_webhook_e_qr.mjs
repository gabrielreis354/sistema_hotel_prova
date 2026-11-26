// Roda DENTRO do container do backend (lê a chave e o token do ambiente dele, sem mostrar os valores).
// Chamado pelo 1_preparar_plano_a.sh; não precisa rodar à mão.
// O webhook "gesway-ensaio-plano-a" já existe no sandbox do grupo (Integrações → Webhooks). O
// token dele é regravado aqui a cada execução com o ASAAS_WEBHOOK_TOKEN do backend: em 22/11 os
// dois não batiam (alguém trocou o .env) e o webhook era recusado com 401.
// 1. Aponta o webhook "gesway-ensaio-plano-a" para a URL do túnel (env NOVA), com o token do backend.
// 2. Testa se o sandbox está gerando o QR do PIX: cria uma cobrança de R$ 5, pede o QR e apaga a cobrança.
const base = (process.env.ASAAS_BASE_URL || 'https://api-sandbox.asaas.com/v3').replace(/\/+$/, '');
const h = { access_token: process.env.ASAAS_API_KEY, 'User-Agent': 'gesway', 'Content-Type': 'application/json' };
const api = async (path, opt = {}) => {
    const r = await fetch(base + path, { headers: h, signal: AbortSignal.timeout(60000), ...opt });
    return { status: r.status, body: await r.json().catch(() => ({})) };
};

// 1. Webhook
const lista = await api('/webhooks');
const w = (lista.body.data || []).find((x) => x.name === 'gesway-ensaio-plano-a');
if (!w) { console.log('ERRO: webhook gesway-ensaio-plano-a não existe no sandbox'); process.exit(1); }
const up = await api('/webhooks/' + w.id, {
    method: 'PUT',
    body: JSON.stringify({ url: process.env.NOVA, authToken: process.env.ASAAS_WEBHOOK_TOKEN, enabled: true, interrupted: false }),
});
if (up.status !== 200) { console.log('ERRO no webhook: HTTP', up.status, JSON.stringify(up.body.errors || '')); process.exit(1); }
console.log('   webhook ->', up.body.url, '| ativo:', up.body.enabled, '| interrompido:', up.body.interrupted);

// 2. Teste do QR
const cpf = '52998224725';
let cli = (await api('/customers?cpfCnpj=' + cpf)).body.data?.[0];
if (!cli) cli = (await api('/customers', { method: 'POST', body: JSON.stringify({ name: 'Teste QR Gesway', cpfCnpj: cpf }) })).body;
const amanha = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
const cob = await api('/payments', {
    method: 'POST',
    body: JSON.stringify({ customer: cli.id, billingType: 'PIX', value: 5, dueDate: amanha, description: 'teste do QR (apagada em seguida)' }),
});
if (!cob.body.id) { console.log('QR_FALHOU: não criou a cobrança de teste', JSON.stringify(cob.body.errors || '')); process.exit(2); }
const t0 = Date.now();
const qr = await api('/payments/' + cob.body.id + '/pixQrCode').catch((e) => ({ status: 'ERR ' + e.name, body: {} }));
const ms = Date.now() - t0;
await api('/payments/' + cob.body.id, { method: 'DELETE' });
if (qr.status === 200 && qr.body.payload && ms < 8000) {
    console.log(`QR_OK: o sandbox gerou o QR em ${ms} ms`);
} else {
    console.log(`QR_FALHOU: HTTP ${qr.status} em ${ms} ms ${JSON.stringify(qr.body.errors || '')} (o backend desiste em 10 s)`);
    process.exit(2);
}
