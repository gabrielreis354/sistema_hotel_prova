// Dados fictícios do qa-explorador, criados pela API local (.claude/agents/qa-explorador.md §5).
// Uso: node scripts/qa_explorador_dados.mjs [http://localhost:3000]
// Só para o banco gestao_hotel_qa, que o qa_explorador_ambiente.sh recria a cada rodada.
// Imprime um JSON com logins, ids e URLs para o agente começar.

const API = process.argv[2] ?? 'http://localhost:3000';
const TELA = 'http://localhost:5173';
const SENHA = 'senha123'; // só de teste, num banco descartável

if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(API)) {
    console.error('qa_explorador_dados: só roda contra localhost');
    process.exit(2);
}

async function chamar(token, metodo, caminho, corpo) {
    const res = await fetch(API + caminho, {
        method: metodo,
        headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
        body: corpo && JSON.stringify(corpo),
    });
    const dados = res.status === 204 ? null : await res.json().catch(() => null);
    if (!res.ok) throw new Error(`${metodo} ${caminho} → ${res.status} ${JSON.stringify(dados)}`);
    return dados;
}

// "Hoje" é o de Brasília (a diária é dia em America/Sao_Paulo), não o fuso da máquina: num CI em
// UTC, depois das 21h, a "chegada de hoje" viraria de amanhã (🟢-4 do qa-redteam).
const hojeSP = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
const dia = (n) => { const d = new Date(`${hojeSP()}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const login = async (email) => (await chamar(null, 'POST', '/auth/login', { email, password: SENHA })).token;

async function hotel(nome, dominio) {
    const admin = `admin@${dominio}`;
    await chamar(null, 'POST', '/auth/register', { tenantName: nome, name: 'Admin QA', email: admin, password: SENHA });
    return { admin, token: await login(admin) };
}

// Hotel principal, com os três papéis.
const qa = await hotel('Hotel QA', 'qa.test');
const t = qa.token;
for (const [role, email, name] of [['RECEPTIONIST', 'recepcao@qa.test', 'Rita Recepção'], ['WAITER', 'garcom@qa.test', 'Gil Garçom']]) {
    await chamar(t, 'POST', '/users', { name, email, password: SENHA, role });
}

const standard = await chamar(t, 'POST', '/room-categories', { name: 'Standard', capacity: 2, price_per_night: 200 });
const luxo = await chamar(t, 'POST', '/room-categories', { name: 'Luxo', capacity: 3, price_per_night: 333.33 });
const quartos = {};
for (const [numero, cat] of [['101', standard], ['102', standard], ['103', luxo], ['104', luxo], ['105', standard], ['106', standard]]) {
    quartos[numero] = (await chamar(t, 'POST', '/rooms', { category_id: cat.id, number: numero, floor: 1 })).id;
}
const hospede = async (nome) => (await chamar(t, 'POST', '/guests', { full_name: nome, email: `${nome.split(' ')[0].toLowerCase()}@hospede.qa.test` })).id;

async function reserva(quarto, nome, entrada, saida) {
    return (await chamar(t, 'POST', '/reservations', { guest_id: await hospede(nome), room_id: quartos[quarto], check_in_date: dia(entrada), check_out_date: dia(saida) })).id;
}
const contaDa = async (id) => { const c = await chamar(t, 'GET', `/reservations/${id}/accounts`); return (c.data ?? c)[0].id; };

// Hospedada com consumo: saldo a receber (check-out, pagamento).
const hospedada = await reserva('101', 'Ana Hospedada', 0, 2);
await chamar(t, 'PUT', `/reservations/${hospedada}/check-in`);
await chamar(t, 'POST', `/accounts/${await contaDa(hospedada)}/items`, { description: 'Água', quantity: 1, unit_price: '12.50' });

// Hospedada com conta extra aberta (frigobar): fechar pela comanda e receber na reserva.
const comExtra = await reserva('102', 'Bruno Frigobar', 0, 1);
await chamar(t, 'PUT', `/reservations/${comExtra}/check-in`);
const reservaExtra = await chamar(t, 'GET', `/reservations/${comExtra}`);
const frigobar = await chamar(t, 'POST', '/accounts', {
    type: 'ROOM', reservation_id: comExtra, room_id: reservaExtra.room_id,
    guest_id: reservaExtra.guest_id ?? reservaExtra.guest?.id, charges_lodging: false, label: 'Frigobar 102',
});
await chamar(t, 'POST', `/accounts/${frigobar.id}/items`, { description: 'Refrigerante', quantity: 2, unit_price: '8.00' });

// Chegada de hoje (walk-in possível), futura e já encerrada.
const chegadaHoje = await reserva('103', 'Carla Chegada', 0, 3);
const futura = await reserva('104', 'Davi Futuro', 5, 7);
const encerrada = await reserva('105', 'Eva Encerrada', 0, 1);
await chamar(t, 'PUT', `/reservations/${encerrada}/check-in`);
await chamar(t, 'PUT', `/reservations/${encerrada}/check-out`);

// Mesa aberta na comanda.
const mesa = await chamar(t, 'POST', '/accounts', { type: 'TABLE', label: 'Mesa 1' });
await chamar(t, 'POST', `/accounts/${mesa.id}/items`, { description: 'Suco', quantity: 1, unit_price: '9.90' });

// Segundo hotel, para testar URL de recurso alheio.
const vizinho = await hotel('Hotel Vizinho QA', 'vizinho.qa.test');
const catV = await chamar(vizinho.token, 'POST', '/room-categories', { name: 'Simples', capacity: 2, price_per_night: 150 });
const quartoV = await chamar(vizinho.token, 'POST', '/rooms', { category_id: catV.id, number: '901', floor: 9 });
const hospedeV = await chamar(vizinho.token, 'POST', '/guests', { full_name: 'Zé Vizinho', email: 'ze@vizinho.qa.test' });
const reservaV = await chamar(vizinho.token, 'POST', '/reservations', { guest_id: hospedeV.id, room_id: quartoV.id, check_in_date: dia(1), check_out_date: dia(2) });

const url = (id, aba = '') => `${TELA}/reservas/${id}${aba}`;
console.log(JSON.stringify({
    senha: SENHA,
    logins: { admin: qa.admin, recepcao: 'recepcao@qa.test', garcom: 'garcom@qa.test', admin_outro_hotel: vizinho.admin },
    reservas: {
        hospedada_com_saldo: url(hospedada, '?aba=conta'),
        hospedada_com_frigobar: url(comExtra, '?aba=conta'),
        chegada_hoje_pendente: url(chegadaHoje),
        futura: url(futura),
        encerrada: url(encerrada),
        de_outro_hotel: url(reservaV.id),
    },
    comanda: { frigobar_102: `${TELA}/comanda/${frigobar.id}`, mesa_1: `${TELA}/comanda/${mesa.id}` },
}, null, 2));
