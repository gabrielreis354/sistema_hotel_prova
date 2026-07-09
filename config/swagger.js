import swaggerJsdoc from 'swagger-jsdoc';

const options = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'Sistema de Gestão de Hotel — API',
            version: '1.0.0',
            description: 'API REST para gerenciamento hoteleiro. Autenticação via JWT Bearer token.'
        },
        // URL relativa: o Swagger UI resolve as requisições contra a mesma origem/porta
        // em que a doc foi aberta (localhost, :8080, :18080, etc.). As rotas são montadas
        // na raiz pelo router/nginx — sem prefixo /api.
        servers: [{ url: '/', description: 'Mesma origem em que a documentação foi aberta' }],
        components: {
            securitySchemes: {
                bearerAuth: {
                    type: 'http',
                    scheme: 'bearer',
                    bearerFormat: 'JWT'
                }
            },
            schemas: {
                Tenant: {
                    type: 'object',
                    properties: {
                        id:         { type: 'string', format: 'uuid' },
                        name:       { type: 'string', example: 'Hotel Paraíso' },
                        subdomain:  { type: 'string', example: 'paraiso' },
                        legal_id:   { type: 'string', example: '12.345.678/0001-90' },
                        status:     { type: 'string', enum: ['ACTIVE', 'SUSPENDED'] }
                    }
                },
                User: {
                    type: 'object',
                    properties: {
                        id:        { type: 'string', format: 'uuid' },
                        tenant_id: { type: 'string', format: 'uuid' },
                        name:      { type: 'string', example: 'João Silva' },
                        email:     { type: 'string', format: 'email' },
                        role:      { type: 'string', enum: ['ADMIN', 'RECEPTIONIST'] }
                    }
                },
                RoomCategory: {
                    type: 'object',
                    properties: {
                        id:              { type: 'string', format: 'uuid' },
                        name:            { type: 'string', example: 'Standard' },
                        capacity:        { type: 'integer', example: 2 },
                        price_per_night: { type: 'number', format: 'float', example: 150.00 }
                    }
                },
                Room: {
                    type: 'object',
                    properties: {
                        id:          { type: 'string', format: 'uuid' },
                        number:      { type: 'string', example: '101' },
                        floor:       { type: 'integer', example: 1 },
                        status:      { type: 'string', enum: ['AVAILABLE', 'OCCUPIED', 'MAINTENANCE', 'CLEANING'] },
                        category_id: { type: 'string', format: 'uuid' }
                    }
                },
                Guest: {
                    type: 'object',
                    properties: {
                        id:        { type: 'string', format: 'uuid' },
                        full_name: { type: 'string', example: 'Maria Oliveira' },
                        cpf:       { type: 'string', example: '123.456.789-00' },
                        phone:     { type: 'string', example: '(11) 99999-9999' },
                        email:     { type: 'string', format: 'email' }
                    }
                },
                Reservation: {
                    type: 'object',
                    properties: {
                        id:             { type: 'string', format: 'uuid' },
                        guest_id:       { type: 'string', format: 'uuid' },
                        room_id:        { type: 'string', format: 'uuid' },
                        user_id:        { type: 'string', format: 'uuid' },
                        check_in_date:  { type: 'string', format: 'date', example: '2026-07-01' },
                        check_out_date: { type: 'string', format: 'date', example: '2026-07-05' },
                        status:         { type: 'string', enum: ['PENDING', 'CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT', 'CANCELLED'] },
                        total_amount:   { type: 'number', format: 'float', example: 600.00 }
                    }
                },
                Error: {
                    type: 'object',
                    properties: { error: { type: 'string' } }
                }
            }
        },
        security: [{ bearerAuth: [] }],
        paths: {
            '/public/{subdomain}/hotel': {
                get: {
                    tags: ['Reserva Direta (Público)'],
                    summary: 'Dados públicos do hotel (cabeçalho da página de reservas)',
                    security: [],
                    parameters: [{ in: 'path', name: 'subdomain', required: true, schema: { type: 'string' }, example: 'aurora' }],
                    responses: { 200: { description: 'Nome, subdomínio e % de sinal' }, 404: { description: 'Hotel não encontrado' }, 403: { description: 'Reservas online desativadas' } }
                }
            },
            '/public/{subdomain}/availability': {
                get: {
                    tags: ['Reserva Direta (Público)'],
                    summary: 'Categorias disponíveis no período, com preço da estadia',
                    security: [],
                    parameters: [
                        { in: 'path',  name: 'subdomain', required: true, schema: { type: 'string' }, example: 'aurora' },
                        { in: 'query', name: 'check_in',  required: true, schema: { type: 'string', format: 'date' }, example: '2026-10-10' },
                        { in: 'query', name: 'check_out', required: true, schema: { type: 'string', format: 'date' }, example: '2026-10-13' },
                        { in: 'query', name: 'guests',    required: false, schema: { type: 'integer' }, example: 2 }
                    ],
                    responses: { 200: { description: 'Lista de categorias disponíveis + preço' }, 400: { description: 'Datas inválidas' }, 404: { description: 'Hotel não encontrado' } }
                }
            },
            '/public/{subdomain}/bookings': {
                post: {
                    tags: ['Reserva Direta (Público)'],
                    summary: 'Cria reserva online e gera cobrança PIX do sinal',
                    security: [],
                    parameters: [{ in: 'path', name: 'subdomain', required: true, schema: { type: 'string' }, example: 'aurora' }],
                    requestBody: {
                        required: true,
                        content: { 'application/json': { schema: { type: 'object', required: ['category_id', 'check_in', 'check_out', 'guest'], properties: {
                            category_id: { type: 'string', format: 'uuid' },
                            check_in:    { type: 'string', format: 'date', example: '2026-10-10' },
                            check_out:   { type: 'string', format: 'date', example: '2026-10-13' },
                            guests:      { type: 'integer', example: 2 },
                            guest: { type: 'object', required: ['full_name'], properties: {
                                full_name: { type: 'string', example: 'Maria Oliveira' },
                                email:     { type: 'string', example: 'maria@example.com' },
                                phone:     { type: 'string', example: '(11) 99999-9999' },
                                cpf:       { type: 'string', example: '123.456.789-00' }
                            }}
                        }}}}
                    },
                    responses: {
                        201: { description: 'Reserva PENDING criada + QR PIX do sinal' },
                        400: { description: 'Campos obrigatórios ausentes ou datas inválidas' },
                        404: { description: 'Hotel ou categoria não encontrados' },
                        409: { description: 'Sem disponibilidade na categoria para o período' },
                        422: { description: 'Categoria não comporta os hóspedes ou sem preço' }
                    }
                }
            },
            '/public/{subdomain}/bookings/{id}/status': {
                get: {
                    tags: ['Reserva Direta (Público)'],
                    summary: 'Status da reserva (polling pós-pagamento PIX)',
                    security: [],
                    parameters: [
                        { in: 'path', name: 'subdomain', required: true, schema: { type: 'string' }, example: 'aurora' },
                        { in: 'path', name: 'id',        required: true, schema: { type: 'string', format: 'uuid' } }
                    ],
                    responses: { 200: { description: 'Status da reserva e do sinal' }, 404: { description: 'Reserva não encontrada' } }
                }
            },
            '/webhooks/pix': {
                post: {
                    tags: ['Webhooks'],
                    summary: 'Confirmação de pagamento PIX (callback do PSP)',
                    description: 'Marca o pagamento como PAID e promove a reserva PENDING→CONFIRMED. Idempotente. No provider simulado, dispare manualmente com o provider_charge_id retornado na criação da reserva.',
                    security: [],
                    requestBody: {
                        required: true,
                        content: { 'application/json': { schema: { type: 'object', required: ['provider_charge_id'], properties: {
                            provider_charge_id: { type: 'string', example: 'fake_a6ada2c2-eaea-4ff6-ba41-1919b87688f3' }
                        }}}}
                    },
                    responses: { 200: { description: 'Pagamento confirmado (ou já processado)' }, 400: { description: 'provider_charge_id ausente' }, 404: { description: 'Cobrança não encontrada' } }
                }
            },
            '/auth/register': {
                post: {
                    tags: ['Auth'],
                    summary: 'Registra novo tenant e usuário ADMIN',
                    security: [],
                    requestBody: {
                        required: true,
                        content: { 'application/json': { schema: { type: 'object', required: ['tenantName', 'name', 'email', 'password'], properties: {
                            tenantName: { type: 'string', example: 'Hotel Paraíso' },
                            name:       { type: 'string', example: 'João Admin' },
                            email:      { type: 'string', example: 'admin@paraiso.com' },
                            password:   { type: 'string', example: 'senha123' }
                        }}}}
                    },
                    responses: { 201: { description: 'Tenant e usuário criados' }, 400: { description: 'Dados inválidos' }, 409: { description: 'E-mail já cadastrado' } }
                }
            },
            '/auth/login': {
                post: {
                    tags: ['Auth'],
                    summary: 'Autentica usuário e retorna JWT',
                    security: [],
                    requestBody: {
                        required: true,
                        content: { 'application/json': { schema: { type: 'object', required: ['email', 'password'], properties: {
                            email:     { type: 'string', example: 'admin@paraiso.com' },
                            password:  { type: 'string', example: 'senha123' },
                            subdomain: { type: 'string', example: 'hotel-paraiso', description: 'Subdomain do hotel (opcional). Recomendado em ambientes multi-tenant para evitar colisão de e-mails entre hotéis.' }
                        }}}}
                    },
                    responses: { 200: { description: 'JWT gerado com sucesso' }, 400: { description: 'Campos obrigatórios ausentes' }, 401: { description: 'Credenciais inválidas ou subdomain não encontrado' }, 409: { description: 'E-mail existe em múltiplos hotéis — informe o subdomain para desambiguar' } }
                }
            },
            '/login': {
                post: {
                    tags: ['Auth'],
                    summary: 'Autentica usuário e retorna JWT (alias de /auth/login)',
                    security: [],
                    requestBody: {
                        required: true,
                        content: { 'application/json': { schema: { type: 'object', required: ['email', 'password'], properties: {
                            email:     { type: 'string', example: 'admin@paraiso.com' },
                            password:  { type: 'string', example: 'senha123' },
                            subdomain: { type: 'string', example: 'hotel-paraiso' }
                        }}}}
                    },
                    responses: { 200: { description: 'JWT gerado com sucesso' }, 401: { description: 'Credenciais inválidas' } }
                }
            },
            '/tenants/me': {
                get: {
                    tags: ['Hotel (Configuração)'],
                    summary: 'Retorna a configuração do próprio hotel',
                    responses: { 200: { description: 'Dados e config do hotel (booking_enabled, deposit_percent)' }, 401: { description: 'Sem token' } }
                },
                put: {
                    tags: ['Hotel (Configuração)'],
                    summary: 'Atualiza a config do hotel (ADMIN) — liga/desliga reservas online e ajusta o sinal',
                    requestBody: {
                        required: true,
                        content: { 'application/json': { schema: { type: 'object', properties: {
                            name:            { type: 'string', example: 'Hotel Aurora' },
                            legal_id:        { type: 'string', example: '12.345.678/0001-90' },
                            booking_enabled: { type: 'boolean', example: true, description: 'Liga/desliga a página pública de reservas diretas' },
                            deposit_percent: { type: 'integer', example: 30, description: 'Percentual do sinal PIX cobrado na reserva online (0–100)' }
                        }}}}
                    },
                    responses: { 200: { description: 'Config atualizada' }, 400: { description: 'Valor inválido' }, 403: { description: 'Apenas ADMIN' } }
                }
            },
            '/users': {
                get:  { tags: ['Usuários'], summary: 'Lista usuários do tenant', responses: { 200: { description: 'Lista de usuários' } } },
                post: { tags: ['Usuários'], summary: 'Cria novo usuário', requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/User' } } } }, responses: { 201: { description: 'Usuário criado' } } }
            },
            '/users/{id}': {
                parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string', format: 'uuid' } }],
                get:    { tags: ['Usuários'], summary: 'Busca usuário por ID',  responses: { 200: { description: 'Usuário encontrado' }, 404: { description: 'Não encontrado' } } },
                put:    { tags: ['Usuários'], summary: 'Atualiza usuário',       responses: { 200: { description: 'Atualizado' } } },
                delete: { tags: ['Usuários'], summary: 'Remove usuário',         responses: { 204: { description: 'Removido' } } }
            },
            '/room-categories': {
                get:  { tags: ['Categorias de Quarto'], summary: 'Lista categorias', responses: { 200: { description: 'OK' } } },
                post: { tags: ['Categorias de Quarto'], summary: 'Cria categoria', requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/RoomCategory' } } } }, responses: { 201: { description: 'Criada' } } }
            },
            '/room-categories/{id}': {
                parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string', format: 'uuid' } }],
                get:    { tags: ['Categorias de Quarto'], summary: 'Busca por ID', responses: { 200: { description: 'OK' } } },
                put:    { tags: ['Categorias de Quarto'], summary: 'Atualiza',     responses: { 200: { description: 'OK' } } },
                delete: { tags: ['Categorias de Quarto'], summary: 'Remove',       responses: { 204: { description: 'OK' } } }
            },
            '/rooms': {
                get:  { tags: ['Quartos'], summary: 'Lista quartos', responses: { 200: { description: 'OK' } } },
                post: { tags: ['Quartos'], summary: 'Cria quarto', requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/Room' } } } }, responses: { 201: { description: 'Criado' } } }
            },
            '/rooms/available': {
                get: {
                    tags: ['Quartos'],
                    summary: 'Lista quartos disponíveis em um período',
                    parameters: [
                        { in: 'query', name: 'check_in',  required: true, schema: { type: 'string', format: 'date', example: '2026-07-01' }, description: 'Data de entrada (YYYY-MM-DD)' },
                        { in: 'query', name: 'check_out', required: true, schema: { type: 'string', format: 'date', example: '2026-07-05' }, description: 'Data de saída (YYYY-MM-DD)' }
                    ],
                    responses: {
                        200: { description: 'Lista de quartos sem conflito no período' },
                        400: { description: 'check_in e check_out são obrigatórios ou check_in >= check_out' }
                    }
                }
            },
            '/rooms/{id}': {
                parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string', format: 'uuid' } }],
                get:    { tags: ['Quartos'], summary: 'Busca por ID', responses: { 200: { description: 'OK' } } },
                put:    { tags: ['Quartos'], summary: 'Atualiza',     responses: { 200: { description: 'OK' } } },
                delete: { tags: ['Quartos'], summary: 'Remove',       responses: { 204: { description: 'OK' } } }
            },
            '/guests': {
                get:  { tags: ['Hóspedes'], summary: 'Lista hóspedes', responses: { 200: { description: 'OK' } } },
                post: { tags: ['Hóspedes'], summary: 'Cria hóspede', requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/Guest' } } } }, responses: { 201: { description: 'Criado' } } }
            },
            '/guests/{id}': {
                parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string', format: 'uuid' } }],
                get:    { tags: ['Hóspedes'], summary: 'Busca por ID', responses: { 200: { description: 'OK' } } },
                put:    { tags: ['Hóspedes'], summary: 'Atualiza',     responses: { 200: { description: 'OK' } } },
                delete: { tags: ['Hóspedes'], summary: 'Remove',       responses: { 204: { description: 'OK' } } }
            },
            '/reservations': {
                get:  { tags: ['Reservas'], summary: 'Lista reservas', responses: { 200: { description: 'OK' } } },
                post: { tags: ['Reservas'], summary: 'Cria reserva (vincula quarto principal na tabela pivô reservation_rooms)', requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/Reservation' } } } }, responses: { 201: { description: 'Criada' } } }
            },
            '/reservations/{id}': {
                parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string', format: 'uuid' } }],
                get:    { tags: ['Reservas'], summary: 'Busca por ID (inclui quartos N:N)', responses: { 200: { description: 'OK' } } },
                put:    { tags: ['Reservas'], summary: 'Atualiza reserva', responses: { 200: { description: 'OK' } } },
                delete: { tags: ['Reservas'], summary: 'Remove reserva (ADMIN)', responses: { 204: { description: 'OK' } } }
            },
            '/reservations/{id}/cancel': {
                parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string', format: 'uuid' } }],
                put: {
                    tags: ['Reservas'],
                    summary: 'Cancela reserva (apenas PENDING ou CONFIRMED)',
                    responses: {
                        200: { description: 'Reserva cancelada — status alterado para CANCELLED' },
                        422: { description: 'Reserva não pode ser cancelada no status atual (CHECKED_IN, CHECKED_OUT ou já CANCELLED)' },
                        404: { description: 'Reserva não encontrada' }
                    }
                }
            },
            '/reservations/{id}/check-in': {
                parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string', format: 'uuid' } }],
                put: { tags: ['Reservas'], summary: 'Realiza check-in', responses: { 200: { description: 'Status alterado para CHECKED_IN' } } }
            },
            '/reservations/{id}/check-out': {
                parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string', format: 'uuid' } }],
                put: { tags: ['Reservas'], summary: 'Realiza check-out', responses: { 200: { description: 'Status alterado para CHECKED_OUT' } } }
            },
            '/reservations/{id}/rooms': {
                parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string', format: 'uuid' } }],
                post: { tags: ['Reservas — N:N (Pivô)'], summary: 'Adiciona quarto à reserva (tabela pivô reservation_rooms)', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { room_id: { type: 'string', format: 'uuid' } } } } } }, responses: { 201: { description: 'Quarto vinculado' }, 409: { description: 'Já vinculado' } } }
            },
            '/reservations/{id}/rooms/{roomId}': {
                parameters: [
                    { in: 'path', name: 'id',     required: true, schema: { type: 'string', format: 'uuid' } },
                    { in: 'path', name: 'roomId', required: true, schema: { type: 'string', format: 'uuid' } }
                ],
                delete: { tags: ['Reservas — N:N (Pivô)'], summary: 'Remove quarto da reserva (tabela pivô)', responses: { 204: { description: 'Desvinculado' } } }
            },
            '/payments': {
                get:  { tags: ['Pagamentos'], summary: 'Lista pagamentos do tenant', responses: { 200: { description: 'OK' } } },
                post: { tags: ['Pagamentos'], summary: 'Registra novo pagamento', requestBody: { required: true, content: { 'application/json': { schema: {
                    type: 'object', required: ['reservation_id', 'amount', 'method'],
                    properties: {
                        reservation_id: { type: 'string', format: 'uuid' },
                        amount:         { type: 'number', example: 300.00 },
                        method:         { type: 'string', enum: ['PIX', 'CARTAO_CREDITO', 'CARTAO_DEBITO', 'DINHEIRO'], example: 'PIX' },
                        paid_at:        { type: 'string', format: 'date-time' }
                    }
                }}}} , responses: { 201: { description: 'Pagamento registrado' } } }
            },
            '/payments/{id}': {
                parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string', format: 'uuid' } }],
                get:    { tags: ['Pagamentos'], summary: 'Busca pagamento por ID', responses: { 200: { description: 'OK' }, 404: { description: 'Não encontrado' } } },
                put:    { tags: ['Pagamentos'], summary: 'Atualiza pagamento',      responses: { 200: { description: 'OK' } } },
                delete: { tags: ['Pagamentos'], summary: 'Remove pagamento',        responses: { 204: { description: 'OK' } } }
            },
            '/analytics/revenue': {
                get: {
                    tags: ['Analytics'],
                    summary: 'Caixa realizado vs esperado vs inadimplência',
                    description: 'Retorna receita realizada (pagamentos recebidos) agrupada por mês, receita esperada (reservas ativas sem pagamento completo) e lista de inadimplentes. Filtro por período opcional.',
                    parameters: [
                        { in: 'query', name: 'start', required: false, schema: { type: 'string', format: 'date', example: '2026-01-01' }, description: 'Data inicial do filtro (YYYY-MM-DD)' },
                        { in: 'query', name: 'end',   required: false, schema: { type: 'string', format: 'date', example: '2026-06-30' }, description: 'Data final do filtro (YYYY-MM-DD)' }
                    ],
                    responses: {
                        200: {
                            description: 'Resumo financeiro do tenant',
                            content: { 'application/json': { schema: {
                                type: 'object',
                                properties: {
                                    realized: {
                                        type: 'object',
                                        properties: {
                                            total:    { type: 'number', example: 18500.00 },
                                            by_month: { type: 'array', items: { type: 'object', properties: {
                                                month: { type: 'string', example: '2026-01' },
                                                total: { type: 'number', example: 4200.00 }
                                            }}}
                                        }
                                    },
                                    expected: { type: 'object', properties: { total: { type: 'number', example: 6200.00 } } },
                                    unpaid: { type: 'array', items: { type: 'object', properties: {
                                        reservation_id: { type: 'string', format: 'uuid' },
                                        guest:          { type: 'string', example: 'Maria Oliveira' },
                                        amount:         { type: 'number', example: 600.00 },
                                        check_in_date:  { type: 'string', format: 'date' },
                                        check_out_date: { type: 'string', format: 'date' }
                                    }}}
                                }
                            }}}
                        },
                        401: { description: 'Token não fornecido ou inválido' },
                        500: { description: 'Erro interno' }
                    }
                }
            },
            '/analytics/occupancy': {
                get: {
                    tags: ['Analytics'],
                    summary: 'Taxa de ocupação + ADR + RevPAR',
                    description: 'Retorna contagem de quartos por status, taxa de ocupação percentual, ADR (diária média) e RevPAR (receita por quarto disponível) para a data informada.',
                    parameters: [
                        { in: 'query', name: 'date', required: false, schema: { type: 'string', format: 'date', example: '2026-06-27' }, description: 'Data de referência (YYYY-MM-DD). Default: hoje.' }
                    ],
                    responses: {
                        200: {
                            description: 'Indicadores de ocupação do dia',
                            content: { 'application/json': { schema: {
                                type: 'object',
                                properties: {
                                    date:            { type: 'string', format: 'date', example: '2026-06-27' },
                                    total_rooms:     { type: 'integer', example: 15 },
                                    occupied:        { type: 'integer', example: 9 },
                                    available:       { type: 'integer', example: 4 },
                                    cleaning:        { type: 'integer', example: 2 },
                                    occupancy_rate:  { type: 'number', example: 60.00, description: 'Percentual de ocupação (0–100)' },
                                    adr:             { type: 'number', example: 312.50, description: 'Average Daily Rate — diária média dos quartos vendidos' },
                                    revpar:          { type: 'number', example: 187.50, description: 'Revenue Per Available Room — ADR × occupancy_rate / 100' }
                                }
                            }}}
                        },
                        401: { description: 'Token não fornecido ou inválido' },
                        500: { description: 'Erro interno' }
                    }
                }
            },
            '/analytics/alerts': {
                get: {
                    tags: ['Analytics'],
                    summary: 'Alertas operacionais do dia',
                    description: 'Retorna três listas de atenção imediata: risco de no-show (CONFIRMED sem pagamento com check-in hoje), quartos em limpeza há tempo e reservas PENDING há mais de 48h.',
                    responses: {
                        200: {
                            description: 'Alertas agrupados por categoria',
                            content: { 'application/json': { schema: {
                                type: 'object',
                                properties: {
                                    no_show_risk: { type: 'array', description: 'Reservas confirmadas para hoje sem pagamento', items: { type: 'object', properties: {
                                        reservation_id: { type: 'string', format: 'uuid' },
                                        guest:          { type: 'string', example: 'João Silva' },
                                        guest_phone:    { type: 'string', example: '(11) 99999-9999' },
                                        check_in_date:  { type: 'string', format: 'date' },
                                        amount:         { type: 'number', example: 450.00 }
                                    }}},
                                    cleaning_pending: { type: 'array', description: 'Quartos com status CLEANING', items: { type: 'object', properties: {
                                        room_id:        { type: 'string', format: 'uuid' },
                                        room_number:    { type: 'string', example: '204' },
                                        category:       { type: 'string', example: 'Standard' },
                                        cleaning_since: { type: 'string', format: 'date-time' }
                                    }}},
                                    pending_too_long: { type: 'array', description: 'Reservas PENDING criadas há mais de 48h', items: { type: 'object', properties: {
                                        reservation_id: { type: 'string', format: 'uuid' },
                                        guest:          { type: 'string', example: 'Ana Costa' },
                                        check_in_date:  { type: 'string', format: 'date' },
                                        amount:         { type: 'number', example: 300.00 },
                                        hours_pending:  { type: 'number', example: 72.5 }
                                    }}}
                                }
                            }}}
                        },
                        401: { description: 'Token não fornecido ou inválido' },
                        500: { description: 'Erro interno' }
                    }
                }
            },
            '/analytics/seasonality': {
                get: {
                    tags: ['Analytics'],
                    summary: 'Histórico mensal de reservas e receita',
                    description: 'Retorna dados agrupados por mês para identificar sazonalidade: número de reservas, receita total e média de noites por reserva.',
                    parameters: [
                        { in: 'query', name: 'months', required: false, schema: { type: 'integer', minimum: 1, maximum: 60, example: 12 }, description: 'Quantos meses de histórico retornar (1–60). Default: 12.' }
                    ],
                    responses: {
                        200: {
                            description: 'Array de meses com indicadores',
                            content: { 'application/json': { schema: {
                                type: 'array',
                                items: { type: 'object', properties: {
                                    month:        { type: 'string', example: '2026-01' },
                                    reservations: { type: 'integer', example: 8 },
                                    revenue:      { type: 'number', example: 5200.00 },
                                    avg_nights:   { type: 'number', example: 3.2 }
                                }}
                            }}}
                        },
                        400: { description: 'months fora do intervalo permitido (1–60)' },
                        401: { description: 'Token não fornecido ou inválido' },
                        500: { description: 'Erro interno' }
                    }
                }
            },
            '/analytics/revenue-by-category': {
                get: {
                    tags: ['Analytics'],
                    summary: 'Receita e rentabilidade por categoria de quarto',
                    description: 'Ranqueia as categorias de quarto por receita gerada, mostrando número de reservas e ticket médio por categoria.',
                    parameters: [
                        { in: 'query', name: 'start', required: false, schema: { type: 'string', format: 'date', example: '2026-01-01' }, description: 'Data inicial (YYYY-MM-DD)' },
                        { in: 'query', name: 'end',   required: false, schema: { type: 'string', format: 'date', example: '2026-06-30' }, description: 'Data final (YYYY-MM-DD)' }
                    ],
                    responses: {
                        200: {
                            description: 'Ranking de categorias por receita',
                            content: { 'application/json': { schema: {
                                type: 'array',
                                items: { type: 'object', properties: {
                                    category:     { type: 'string', example: 'Suite Presidencial' },
                                    reservations: { type: 'integer', example: 2 },
                                    revenue:      { type: 'number', example: 5600.00 },
                                    avg_ticket:   { type: 'number', example: 2800.00 }
                                }}
                            }}}
                        },
                        401: { description: 'Token não fornecido ou inválido' },
                        500: { description: 'Erro interno' }
                    }
                }
            },
            '/analytics/payment-mix': {
                get: {
                    tags: ['Analytics'],
                    summary: 'Mix de meios de pagamento com percentual',
                    description: 'Agrupa pagamentos por método (PIX, CARTAO_CREDITO, CARTAO_DEBITO, DINHEIRO) com total em reais e percentual sobre o total do período.',
                    parameters: [
                        { in: 'query', name: 'start', required: false, schema: { type: 'string', format: 'date', example: '2026-01-01' }, description: 'Data inicial (YYYY-MM-DD)' },
                        { in: 'query', name: 'end',   required: false, schema: { type: 'string', format: 'date', example: '2026-06-30' }, description: 'Data final (YYYY-MM-DD)' }
                    ],
                    responses: {
                        200: {
                            description: 'Mix de pagamentos ordenado por total',
                            content: { 'application/json': { schema: {
                                type: 'array',
                                items: { type: 'object', properties: {
                                    method: { type: 'string', example: 'PIX' },
                                    count:  { type: 'integer', example: 9 },
                                    total:  { type: 'number', example: 11200.00 },
                                    pct:    { type: 'number', example: 60.54, description: 'Percentual sobre o total do período' }
                                }}
                            }}}
                        },
                        401: { description: 'Token não fornecido ou inválido' },
                        500: { description: 'Erro interno' }
                    }
                }
            },
            '/analytics/top-guests': {
                get: {
                    tags: ['Analytics'],
                    summary: 'Hóspedes mais valiosos por lifetime value',
                    description: 'Ranqueia hóspedes pela soma histórica de reservas não canceladas, mostrando número de estadias, valor acumulado e data da última visita.',
                    parameters: [
                        { in: 'query', name: 'limit', required: false, schema: { type: 'integer', minimum: 1, maximum: 100, example: 10 }, description: 'Quantidade de hóspedes a retornar (1–100). Default: 10.' }
                    ],
                    responses: {
                        200: {
                            description: 'Ranking de hóspedes por lifetime value',
                            content: { 'application/json': { schema: {
                                type: 'array',
                                items: { type: 'object', properties: {
                                    guest_id:           { type: 'string', format: 'uuid' },
                                    full_name:          { type: 'string', example: 'Carlos Eduardo' },
                                    email:              { type: 'string', format: 'email' },
                                    total_reservations: { type: 'integer', example: 3 },
                                    lifetime_value:     { type: 'number', example: 4200.00 },
                                    last_stay:          { type: 'string', format: 'date', example: '2026-06-20' }
                                }}
                            }}}
                        },
                        400: { description: 'limit fora do intervalo permitido (1–100)' },
                        401: { description: 'Token não fornecido ou inválido' },
                        500: { description: 'Erro interno' }
                    }
                }
            }
        }
    },
    apis: []
};

export default swaggerJsdoc(options);
