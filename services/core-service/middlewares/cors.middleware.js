// CORS enxuto e controlável, sem dependência externa.
//
// O frontend (app-pms) roda em outra origem e chama a API com o header
// Authorization. Sem estes cabeçalhos o navegador bloqueia a primeira requisição.
//
// Origens permitidas vêm de CORS_ORIGINS (lista separada por vírgula).
// Ausente ou "*" → libera qualquer origem (conveniente em dev/CI).
// Em produção, defina CORS_ORIGINS com os domínios reais do frontend.
const rawOrigins = (process.env.CORS_ORIGINS ?? '*')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

const allowAll = rawOrigins.includes('*');
const allowed = new Set(rawOrigins);

export default function corsMiddleware(request, response, next) {
    const origin = request.headers.origin;

    if (allowAll) {
        response.setHeader('Access-Control-Allow-Origin', '*');
    } else if (origin && allowed.has(origin)) {
        // Reflete a origem exata quando há allowlist — necessário para o
        // navegador aceitar a resposta quando não é wildcard.
        response.setHeader('Access-Control-Allow-Origin', origin);
        response.setHeader('Vary', 'Origin');
    }

    response.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    response.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    response.setHeader('Access-Control-Max-Age', '86400');

    // Preflight encerra aqui — não precisa atravessar auth nem chegar aos controllers.
    if (request.method === 'OPTIONS') {
        return response.status(204).end();
    }

    return next();
}
