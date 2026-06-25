import swaggerJsdoc from 'swagger-jsdoc';

const options = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'Sistema de Gestão de Hotel — API',
            version: '1.0.0',
            description: 'API REST para gerenciamento hoteleiro. Autenticação via JWT Bearer token.'
        },
        servers: [{ url: 'http://localhost/api', description: 'Servidor local via Nginx' }],
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
            }
        }
    },
    apis: []
};

export default swaggerJsdoc(options);
