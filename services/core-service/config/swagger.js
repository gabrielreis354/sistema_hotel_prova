import swaggerJsdoc from 'swagger-jsdoc';
import { PRODUCT_CATEGORIES } from '../app/utils/productCategories.js';
import { VALID_ROLES } from '../app/utils/roles.js';
import { ACCOUNT_TYPES, ACCOUNT_STATUSES, ITEM_REASONS, ITEM_ORIGINS } from '../app/utils/accountEnums.js';

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
                        id:               { type: 'string', format: 'uuid' },
                        name:             { type: 'string', example: 'Hotel Paraíso' },
                        subdomain:        { type: 'string', example: 'paraiso' },
                        legal_id:         { type: 'string', nullable: true, example: '12.345.678/0001-90' },
                        status:           { type: 'string', enum: ['ACTIVE', 'SUSPENDED'] },
                        booking_enabled:  { type: 'boolean', example: true, description: 'Liga/desliga a página pública de reservas diretas' },
                        deposit_percent:  { type: 'integer', example: 30, description: 'Percentual do sinal PIX cobrado na reserva online (0–100)' }
                    }
                },
                ValidationErrors: {
                    type: 'object',
                    description: 'Formato usado quando mais de um campo pode falhar validação ao mesmo tempo (contraste com Error, que traz uma única mensagem)',
                    properties: { errors: { type: 'array', items: { type: 'string' }, example: ['name obrigatório', 'price_per_night obrigatório'] } }
                },
                User: {
                    type: 'object',
                    properties: {
                        id:        { type: 'string', format: 'uuid' },
                        tenant_id: { type: 'string', format: 'uuid' },
                        name:      { type: 'string', example: 'João Silva' },
                        email:     { type: 'string', format: 'email' },
                        role:      { type: 'string', enum: VALID_ROLES }
                    }
                },
                Product: {
                    type: 'object',
                    properties: {
                        id:          { type: 'string', format: 'uuid' },
                        tenant_id:   { type: 'string', format: 'uuid' },
                        name:        { type: 'string', example: 'Cerveja 600ml' },
                        description: { type: 'string', nullable: true, example: 'Long neck gelada' },
                        // DECIMAL chega do Postgres como string — o cliente tipado precisa
                        // saber disso para não converter com Number() e perder precisão.
                        price:       { type: 'string', example: '12.00', description: 'DECIMAL(10,2) serializado como string' },
                        category:    { type: 'string', enum: PRODUCT_CATEGORIES, example: 'DRINK' },
                        active:      { type: 'boolean', example: true }
                    }
                },
                // Comanda (SPEC-04). Sem hóspede nem reserva embutidos: o garçom também lê (LGPD).
                Account: {
                    type: 'object',
                    properties: {
                        id:              { type: 'string', format: 'uuid' },
                        tenant_id:       { type: 'string', format: 'uuid' },
                        type:            { type: 'string', enum: ACCOUNT_TYPES, example: 'TABLE' },
                        status:          { type: 'string', enum: ACCOUNT_STATUSES, example: 'OPEN' },
                        reservation_id:  { type: 'string', format: 'uuid', nullable: true, description: 'Só em conta ROOM' },
                        room_id:         { type: 'string', format: 'uuid', nullable: true },
                        guest_id:        { type: 'string', format: 'uuid', nullable: true, description: 'Nulo em TABLE e INTERNAL' },
                        label:           { type: 'string', example: 'Mesa 5' },
                        charges_lodging: { type: 'boolean', description: 'Esta conta carrega a diária do quarto (RN-005). Sempre false fora de ROOM' },
                        opened_at:       { type: 'string', format: 'date-time' },
                        closed_at:       { type: 'string', format: 'date-time', nullable: true },
                        closed_room_charges: { type: 'string', nullable: true, example: '600.00', description: 'Diária gravada no fechamento (D-39). Nula na conta aberta' },
                        created_at:      { type: 'string', format: 'date-time' },
                        updated_at:      { type: 'string', format: 'date-time' },
                        deleted_at:      { type: 'string', format: 'date-time', nullable: true }
                    }
                },
                AccountItem: {
                    type: 'object',
                    properties: {
                        id:             { type: 'string', format: 'uuid' },
                        tenant_id:      { type: 'string', format: 'uuid' },
                        account_id:     { type: 'string', format: 'uuid' },
                        product_id:     { type: 'string', format: 'uuid', nullable: true, description: 'Nulo em lançamento avulso' },
                        description:    { type: 'string', example: 'Cerveja 600ml' },
                        quantity:       { type: 'integer', example: 2 },
                        unit_price:     { type: 'string', example: '12.00', description: 'DECIMAL(10,2) serializado como string. Preço no momento do lançamento' },
                        total:          { type: 'string', example: '24.00', description: 'quantity × unit_price, sempre calculado no servidor' },
                        billable:       { type: 'boolean', description: 'false = cortesia: valor gravado, fora da soma da conta (RN-007)' },
                        reason:         { type: 'string', enum: ITEM_REASONS, nullable: true, description: 'Obrigatório se billable = false; proibido se true' },
                        client_item_id: { type: 'string', format: 'uuid', nullable: true, description: 'Gerado pelo app do garçom — idempotência da fila offline (RN-008)' },
                        created_by:     { type: 'string', format: 'uuid', nullable: true, description: 'Nulo só em consumo antigo migrado (origin LEGACY_CONSUMPTION)' },
                        deleted_by:     { type: 'string', format: 'uuid', nullable: true },
                        origin:         { type: 'string', enum: ITEM_ORIGINS, description: 'LEGACY_CONSUMPTION = migrado de consumptions na T-04.2' },
                        consumed_at:    { type: 'string', format: 'date-time', description: 'Quando o hóspede consumiu; created_at é quando o servidor gravou' },
                        created_at:     { type: 'string', format: 'date-time' },
                        updated_at:     { type: 'string', format: 'date-time' },
                        deleted_at:     { type: 'string', format: 'date-time', nullable: true, description: 'Preenchido só na resposta de reenvio de um item já excluído' }
                    }
                },
                AccountDetail: {
                    allOf: [
                        { $ref: '#/components/schemas/Account' },
                        {
                            type: 'object',
                            properties: {
                                items: { type: 'array', items: { $ref: '#/components/schemas/AccountItem' }, description: 'Itens não excluídos, em ordem de lançamento' },
                                total: { type: 'string', example: '24.00', description: 'Soma dos itens faturáveis e não excluídos' }
                            }
                        }
                    ]
                },
                AccountBill: {
                    type: 'object',
                    description: 'Bill da conta (T-04.3). Valores em texto (DECIMAL serializado). Sem dado do hóspede.',
                    properties: {
                        account_id:     { type: 'string', format: 'uuid' },
                        type:           { type: 'string', enum: ACCOUNT_TYPES },
                        status:         { type: 'string', enum: ACCOUNT_STATUSES },
                        label:          { type: 'string', example: 'Suíte 201' },
                        reservation_id: { type: 'string', format: 'uuid', nullable: true },
                        room_id:        { type: 'string', format: 'uuid', nullable: true },
                        opened_at:      { type: 'string', format: 'date-time' },
                        closed_at:      { type: 'string', format: 'date-time', nullable: true },
                        room_charges:   { type: 'string', example: '800.00', description: 'Parte do total da reserva que cabe à conta. O total é dividido entre as contas da reserva que cobram diária, com peso igual ao preço da categoria do quarto de cada uma; a sobra dos centavos fica na conta do quarto principal (D-33, D-40). Conta fechada mostra o valor gravado no fechamento, e as abertas dividem só o que sobra dele (D-39). 0 fora de ROOM, sem charges_lodging, ou com a reserva cancelada/excluída quando a conta ainda estava aberta (D-35); a conta fechada mantém o valor gravado' },
                        consumptions:   { type: 'string', example: '25.00', description: 'Soma dos itens faturáveis e não excluídos (CA-04.3.c)' },
                        total:          { type: 'string', example: '825.00', description: 'room_charges + consumptions. Conta INTERNAL: sempre 0 (CA-04.3.f)' },
                        payments_made:  { type: 'string', example: '100.00', description: 'Pagamentos PAID da conta (T-04.4) mais a parte que lhe cabe do crédito da reserva. Pagamento feito na reserva sem conta (o sinal PIX, o pagamento da recepção pela reserva) é crédito da reserva: preenche as contas dela, primeiro as fechadas na ordem em que fecharam, depois as abertas com a titular (conta de diária mais antiga) primeiro, cada uma até o que ela deve; a sobra fica na última (D-42, D-45). Cobrança PENDING, FAILED ou EXPIRED e pagamento excluído não contam' },
                        balance:        { type: 'string', example: '725.00', description: 'total − payments_made, calculado a cada leitura e nunca gravado (CA-04.3.b). Negativo quando o pagamento passou do total: o hotel deve devolver (D-44)' },
                        items: {
                            type: 'array',
                            description: 'Itens não excluídos, inclusive cortesia (billable false, com reason) — CA-04.3.d. Em ordem de consumo',
                            items: {
                                type: 'object',
                                properties: {
                                    id:          { type: 'string', format: 'uuid' },
                                    product_id:  { type: 'string', format: 'uuid', nullable: true },
                                    description: { type: 'string' },
                                    quantity:    { type: 'integer' },
                                    unit_price:  { type: 'string', example: '12.50' },
                                    total:       { type: 'string', example: '25.00' },
                                    billable:    { type: 'boolean' },
                                    reason:      { type: 'string', enum: ITEM_REASONS, nullable: true },
                                    consumed_at: { type: 'string', format: 'date-time' }
                                }
                            }
                        }
                    }
                },
                AccountItemResult: {
                    type: 'object',
                    properties: {
                        item:          { $ref: '#/components/schemas/AccountItem' },
                        account_total: { type: 'string', example: '24.00', description: 'Total atualizado da conta (CA-04.1.e)' }
                    }
                },
                RoomCategory: {
                    type: 'object',
                    properties: {
                        id:              { type: 'string', format: 'uuid' },
                        name:            { type: 'string', example: 'Standard' },
                        capacity:        { type: 'integer', example: 2 },
                        price_per_night: { type: 'string', example: '150.00', description: 'DECIMAL(10,2) serializado como string' }
                    }
                },
                Room: {
                    type: 'object',
                    properties: {
                        id:          { type: 'string', format: 'uuid' },
                        number:      { type: 'string', example: '101' },
                        floor:       { type: 'integer', nullable: true, example: 1 },
                        status:      { type: 'string', enum: ['AVAILABLE', 'OCCUPIED', 'MAINTENANCE', 'CLEANING'] },
                        category_id: { type: 'string', format: 'uuid' },
                        category: {
                            type: 'object',
                            nullable: true,
                            description: 'Presente em GET /rooms, GET /rooms/available e GET /rooms/{id} (join com RoomCategory)',
                            properties: {
                                id:              { type: 'string', format: 'uuid' },
                                name:            { type: 'string', example: 'Standard' },
                                price_per_night: { type: 'string', example: '150.00', description: 'DECIMAL(10,2) serializado como string' }
                            }
                        }
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
                Address: {
                    type: 'object',
                    properties: {
                        cep:          { type: 'string', example: '01310100' },
                        street:       { type: 'string', example: 'Avenida Paulista' },
                        neighborhood: { type: 'string', example: 'Bela Vista' },
                        city:         { type: 'string', example: 'São Paulo' },
                        state:        { type: 'string', example: 'SP' },
                        complement:   { type: 'string', nullable: true, example: 'até 610 - lado par' }
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
                        total_amount:   { type: 'string', example: '600.00', description: 'DECIMAL(12,2) serializado como string' }
                    }
                },
                Error: {
                    type: 'object',
                    properties: { error: { type: 'string' } }
                },
                RoomOccupied: {
                    type: 'object',
                    description: 'Quarto ocupado no período. room_ids vem quando a checagem da aplicação acha o conflito; numa corrida barrada pelo banco (EXCLUDE), só error.',
                    properties: {
                        error:    { type: 'string', example: 'Quarto indisponível no período solicitado' },
                        room_ids: { type: 'array', items: { type: 'string', format: 'uuid' }, description: 'Quartos da requisição que estão ocupados' }
                    }
                },
                ReservationListItem: {
                    description: 'Formato de GET /reservations — Reservation com guest/room/user resumidos (mesmo include de ListReservationController)',
                    allOf: [
                        { $ref: '#/components/schemas/Reservation' },
                        { type: 'object', properties: {
                            guest: { type: 'object', nullable: true, properties: {
                                id: { type: 'string', format: 'uuid' }, full_name: { type: 'string' }, email: { type: 'string', nullable: true }
                            }},
                            room: { type: 'object', nullable: true, properties: {
                                id: { type: 'string', format: 'uuid' }, number: { type: 'string' }, floor: { type: 'integer', nullable: true }
                            }},
                            user: { type: 'object', nullable: true, properties: {
                                id: { type: 'string', format: 'uuid' }, name: { type: 'string' }
                            }}
                        }}
                    ]
                },
                ReservationListPage: {
                    description: 'Formato de GET /reservations quando ?page= ou ?limit= é informado',
                    type: 'object',
                    properties: {
                        data:  { type: 'array', items: { $ref: '#/components/schemas/ReservationListItem' } },
                        total: { type: 'integer', example: 37 },
                        page:  { type: 'integer', example: 1 },
                        limit: { type: 'integer', example: 50 }
                    }
                },
                ReservationDetail: {
                    description: 'Formato de GET /reservations/{id} — inclui hóspede e quarto principal completos, mais o array N:N de quartos vinculados',
                    allOf: [
                        { $ref: '#/components/schemas/Reservation' },
                        { type: 'object', properties: {
                            guest: { allOf: [{ $ref: '#/components/schemas/Guest' }], nullable: true },
                            room:  { allOf: [{ $ref: '#/components/schemas/Room' }],  nullable: true },
                            user:  { type: 'object', nullable: true, properties: {
                                id: { type: 'string', format: 'uuid' }, name: { type: 'string' }
                            }},
                            rooms: { type: 'array', description: 'Todos os quartos vinculados via reservation_rooms (N:N), incluindo o principal', items: { $ref: '#/components/schemas/Room' } }
                        }}
                    ]
                },
                ReservationRoomPivot: {
                    type: 'object',
                    description: 'Linha da tabela pivô reservation_rooms (POST /reservations/{id}/rooms)',
                    properties: {
                        id:             { type: 'string', format: 'uuid' },
                        reservation_id: { type: 'string', format: 'uuid' },
                        room_id:        { type: 'string', format: 'uuid' },
                        check_in_date:  { type: 'string', format: 'date', description: 'Cópia da reserva, mantida pelo banco (fonte da ocupação)' },
                        check_out_date: { type: 'string', format: 'date', description: 'Cópia da reserva, mantida pelo banco' },
                        blocks_room:    { type: 'boolean', description: 'false quando a reserva está cancelada ou excluída' }
                    }
                },
                Consumption: {
                    type: 'object',
                    properties: {
                        id:             { type: 'string', format: 'uuid' },
                        tenant_id:      { type: 'string', format: 'uuid' },
                        reservation_id: { type: 'string', format: 'uuid' },
                        description:    { type: 'string', example: 'Frigobar' },
                        amount:         { type: 'string', example: '50.00', description: 'DECIMAL(10,2) serializado como string' },
                        consumed_at:    { type: 'string', format: 'date-time', description: 'Quando o hóspede consumiu' },
                        deleted_by:     { type: 'string', format: 'uuid', nullable: true },
                        created_at:     { type: 'string', format: 'date-time', description: 'Quando o lançamento foi gravado' },
                        updated_at:     { type: 'string', format: 'date-time' },
                        deleted_at:     { type: 'string', format: 'date-time', nullable: true }
                    }
                },
                Bill: {
                    type: 'object',
                    description: 'Fechamento de conta — GET /reservations/{id}/bill',
                    properties: {
                        reservation_id:      { type: 'string', format: 'uuid' },
                        status:              { type: 'string', enum: ['PENDING', 'CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT', 'CANCELLED'] },
                        guest:               { type: 'string', nullable: true, example: 'Maria Oliveira' },
                        check_in_date:       { type: 'string', format: 'date' },
                        check_out_date:      { type: 'string', format: 'date' },
                        room_total:          { type: 'number', example: 600.00 },
                        consumptions_total:  { type: 'number', example: 90.00 },
                        grand_total:         { type: 'number', example: 690.00 },
                        total_paid:          { type: 'number', example: 690.00 },
                        total_pending:       { type: 'number', example: 0 },
                        balance_due:         { type: 'number', example: 0 },
                        fully_paid:          { type: 'boolean', example: true },
                        consumptions: { type: 'array', items: { type: 'object', properties: {
                            id: { type: 'string', format: 'uuid' }, description: { type: 'string' },
                            amount: { type: 'number' }, consumed_at: { type: 'string', format: 'date-time' }
                        }}},
                        payments: { type: 'array', items: { type: 'object', properties: {
                            id: { type: 'string', format: 'uuid' }, amount: { type: 'number' }, method: { type: 'string' },
                            kind: { type: 'string', enum: ['FULL', 'DEPOSIT', 'BALANCE'] },
                            status: { type: 'string', enum: ['PENDING', 'PAID', 'EXPIRED', 'FAILED'] },
                            paid_at: { type: 'string', format: 'date-time', nullable: true }
                        }}}
                    }
                },
                Payment: {
                    type: 'object',
                    description: 'pix_qr_code, provider e provider_charge_id não aparecem em GET /payments, GET /payments/{id} nem PUT /payments/{id} — PaymentModel.defaultScope os exclui nessas consultas (T-06.2/achado de segurança fechado em 22/09). provider_charge_id é a credencial do webhook PIX (T-06.9); quem precisar dos 3 campos usa PaymentModel.unscoped() no código, não a API. Ressalva (achado 🟡 da auditoria de 22/09): POST /payments usa .create(), que o defaultScope não filtra — os 3 campos vêm null nessa resposta (pagamento manual da recepção, nunca passa pelo provider PIX), mas tecnicamente aparecem no JSON.',
                    properties: {
                        id:             { type: 'string', format: 'uuid' },
                        tenant_id:      { type: 'string', format: 'uuid' },
                        reservation_id: { type: 'string', format: 'uuid', nullable: true, description: 'Nulo só em pagamento de conta sem reserva (day-use, mesa, balcão)' },
                        account_id:     { type: 'string', format: 'uuid', nullable: true, description: 'Conta paga (T-04.4). Nulo = pagamento da reserva: vira crédito rateado entre as contas dela (D-42, D-45)' },
                        amount:         { type: 'string', example: '300.00', description: 'DECIMAL(12,2) serializado como string' },
                        method:         { type: 'string', enum: ['PIX', 'CARTAO_CREDITO', 'CARTAO_DEBITO', 'DINHEIRO'] },
                        status:         { type: 'string', enum: ['PENDING', 'PAID', 'EXPIRED', 'FAILED'] },
                        kind:           { type: 'string', enum: ['FULL', 'DEPOSIT', 'BALANCE'] },
                        paid_at:        { type: 'string', format: 'date-time', nullable: true },
                        reservation: {
                            type: 'object', nullable: true,
                            description: 'Presente em GET /payments e GET /payments/{id}',
                            properties: {
                                id: { type: 'string', format: 'uuid' },
                                check_in_date: { type: 'string', format: 'date' },
                                check_out_date: { type: 'string', format: 'date' },
                                status: { type: 'string' },
                                total_amount: { type: 'string', nullable: true, description: 'Só em GET /payments/{id}' }
                            }
                        }
                    }
                },
                AuthUser: {
                    type: 'object',
                    required: ['id', 'name', 'email', 'role'],
                    properties: {
                        id:    { type: 'string', format: 'uuid' },
                        name:  { type: 'string', example: 'João Admin' },
                        email: { type: 'string', format: 'email' },
                        role:  { type: 'string', enum: VALID_ROLES }
                    }
                },
                LoginResponse: {
                    type: 'object',
                    required: ['token', 'user'],
                    properties: {
                        token: { type: 'string', description: 'JWT — payload { userId, role, tenantId }, expira em 8h' },
                        user:  { $ref: '#/components/schemas/AuthUser' }
                    }
                },
                RegisterResponse: {
                    type: 'object',
                    required: ['tenant', 'user'],
                    properties: {
                        tenant: { type: 'object', required: ['id', 'name', 'subdomain'], properties: {
                            id: { type: 'string', format: 'uuid' }, name: { type: 'string' }, subdomain: { type: 'string' }
                        }},
                        user: { $ref: '#/components/schemas/AuthUser' }
                    }
                },
                PublicHotel: {
                    type: 'object',
                    description: 'GET /public/{subdomain}/hotel — sem autenticação, sem dado sensível',
                    properties: {
                        name:            { type: 'string', example: 'Hotel Aurora' },
                        subdomain:       { type: 'string', example: 'aurora' },
                        deposit_percent: { type: 'integer', example: 30 }
                    }
                },
                PublicAvailability: {
                    type: 'object',
                    description: 'GET /public/{subdomain}/availability',
                    properties: {
                        hotel:           { type: 'string', example: 'Hotel Aurora' },
                        check_in:        { type: 'string', format: 'date' },
                        check_out:       { type: 'string', format: 'date' },
                        nights:          { type: 'integer', example: 3 },
                        guests:          { type: 'integer', example: 2 },
                        deposit_percent: { type: 'integer', example: 30 },
                        categories: { type: 'array', items: { type: 'object', properties: {
                            category_id:     { type: 'string', format: 'uuid' },
                            name:            { type: 'string', example: 'Standard' },
                            capacity:        { type: 'integer', example: 2 },
                            price_per_night: { type: 'number', example: 150.00 },
                            available_rooms: { type: 'integer', example: 3 },
                            nights:          { type: 'integer', example: 3 },
                            total_price:     { type: 'number', example: 450.00 }
                        }}}
                    }
                },
                PublicBookingResponse: {
                    type: 'object',
                    description: 'POST /public/{subdomain}/bookings — CA-06.5: pix_qr_code não aparece aqui (é o próprio pix.qr_code, necessário para o hóspede pagar); provider_charge_id CONTINUA aqui hoje (achado pré-existente, fora do escopo da T-06.2 — ver docs/qa/redteam_public-booking-leak_16set2026.md)',
                    properties: {
                        reservation: { type: 'object', properties: {
                            id: { type: 'string', format: 'uuid' },
                            status: { type: 'string', example: 'PENDING' },
                            check_in: { type: 'string', format: 'date' },
                            check_out: { type: 'string', format: 'date' },
                            nights: { type: 'integer', example: 3 },
                            category: { type: 'string', example: 'Standard' },
                            total_amount: { type: 'number', example: 450.00 }
                        }},
                        payment: { type: 'object', properties: {
                            id: { type: 'string', format: 'uuid' },
                            kind: { type: 'string', example: 'DEPOSIT' },
                            status: { type: 'string', example: 'PENDING' },
                            amount: { type: 'number', example: 135.00 },
                            deposit_percent: { type: 'integer', example: 30 },
                            balance_due_on_checkin: { type: 'number', example: 315.00 }
                        }},
                        pix: { type: 'object', properties: {
                            provider_charge_id: { type: 'string', example: 'fake_a6ada2c2-eaea-4ff6-ba41-1919b87688f3' },
                            qr_code: { type: 'string', description: 'Payload copia-e-cola em base64 (simulado)' },
                            expiration: { type: 'string', format: 'date-time' }
                        }}
                    }
                },
                PublicBookingStatus: {
                    type: 'object',
                    description: 'GET /public/{subdomain}/bookings/{id}/status — attributes explícito no include de Payment (CA-06.5), nunca traz pix_qr_code/provider/provider_charge_id',
                    properties: {
                        reservation_id: { type: 'string', format: 'uuid' },
                        status:         { type: 'string', example: 'CONFIRMED' },
                        check_in:       { type: 'string', format: 'date' },
                        check_out:      { type: 'string', format: 'date' },
                        total_amount:   { type: 'number', example: 450.00 },
                        confirmed:      { type: 'boolean' },
                        deposit: { type: 'object', nullable: true, properties: {
                            status:  { type: 'string', enum: ['PENDING', 'PAID', 'EXPIRED', 'FAILED'] },
                            amount:  { type: 'number', example: 135.00 },
                            paid_at: { type: 'string', format: 'date-time', nullable: true }
                        }}
                    }
                },
                WebhookConfirmResponse: {
                    type: 'object',
                    description: 'POST /webhooks/pix — "confirmed" na primeira confirmação, "already_processed" em reenvio (idempotência)',
                    properties: {
                        status:             { type: 'string', enum: ['confirmed', 'already_processed'] },
                        payment_id:         { type: 'string', format: 'uuid' },
                        reservation_id:     { type: 'string', format: 'uuid', nullable: true, description: 'Ausente quando status é already_processed' },
                        reservation_status: { type: 'string', nullable: true, description: 'Ausente quando status é already_processed' }
                    }
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
                    responses: {
                        200: { description: 'Nome, subdomínio e % de sinal', content: { 'application/json': { schema: { $ref: '#/components/schemas/PublicHotel' } } } },
                        404: { description: 'Hotel não encontrado', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
                        403: { description: 'Reservas online desativadas', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } }
                    }
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
                    responses: {
                        200: { description: 'Lista de categorias disponíveis + preço', content: { 'application/json': { schema: { $ref: '#/components/schemas/PublicAvailability' } } } },
                        400: { description: 'Datas inválidas', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
                        404: { description: 'Hotel não encontrado', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } }
                    }
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
                        201: { description: 'Reserva PENDING criada + QR PIX do sinal', content: { 'application/json': { schema: { $ref: '#/components/schemas/PublicBookingResponse' } } } },
                        400: { description: 'Campos obrigatórios ausentes (formato ValidationErrors) ou datas inválidas (formato Error)', content: { 'application/json': { schema: { oneOf: [{ $ref: '#/components/schemas/ValidationErrors' }, { $ref: '#/components/schemas/Error' }] } } } },
                        404: { description: 'Hotel ou categoria não encontrados', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
                        409: { description: 'Sem disponibilidade na categoria para o período, ou CPF/e-mail do hóspede criado por outra requisição simultânea (corrida no find-or-create — reenviar resolve)', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
                        422: { description: 'Categoria não comporta os hóspedes ou sem preço', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } }
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
                    responses: {
                        200: { description: 'Status da reserva e do sinal', content: { 'application/json': { schema: { $ref: '#/components/schemas/PublicBookingStatus' } } } },
                        404: { description: 'Reserva não encontrada', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } }
                    }
                }
            },
            '/webhooks/pix': {
                post: {
                    tags: ['Webhooks'],
                    summary: 'Confirmação de pagamento PIX (callback do PSP)',
                    description: 'Marca o pagamento como PAID e promove a reserva PENDING→CONFIRMED. O pagamento vira crédito da reserva, rateado entre as contas dela; conta fechada que ele quita vira PAID (T-04.4, D-45). Idempotente. Exige assinatura HMAC-SHA256 válida (T-06.9) — sem ela, ou sem PIX_WEBHOOK_SECRET configurado no servidor, a requisição é recusada com 401 e nenhum estado é alterado. Para demonstração, use scripts/simular_pagamento_pix.js (assina com o mesmo HMAC de FakePixProvider.signNotification) em vez de chamar a rota manualmente.',
                    security: [],
                    parameters: [
                        { in: 'header', name: 'x-pix-signature', required: true, schema: { type: 'string', example: 'sha256=7496b2807d9b978272aa592c9678448463621fcd06caafad2d11cec27e7cc6f2' }, description: 'HMAC-SHA256 do corpo cru (bytes exatos enviados) com PIX_WEBHOOK_SECRET, formato sha256=<hex>' }
                    ],
                    requestBody: {
                        required: true,
                        content: { 'application/json': { schema: { type: 'object', required: ['provider_charge_id'], properties: {
                            provider_charge_id: { type: 'string', example: 'fake_a6ada2c2-eaea-4ff6-ba41-1919b87688f3' }
                        }}}}
                    },
                    responses: {
                        200: { description: 'Pagamento confirmado (ou já processado)', content: { 'application/json': { schema: { $ref: '#/components/schemas/WebhookConfirmResponse' } } } },
                        400: { description: 'provider_charge_id ausente ou de tipo inválido', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
                        401: { description: 'Assinatura ausente, inválida, ou PIX_WEBHOOK_SECRET não configurado no servidor (fail-closed)', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
                        404: { description: 'Cobrança não encontrada', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } }
                    }
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
                    responses: {
                        201: { description: 'Tenant e usuário criados', content: { 'application/json': { schema: { $ref: '#/components/schemas/RegisterResponse' } } } },
                        400: { description: 'Campos obrigatórios ausentes', content: { 'application/json': { schema: { $ref: '#/components/schemas/ValidationErrors' } } } },
                        409: { description: 'E-mail ou subdomain já em uso', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } }
                    }
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
                    responses: {
                        200: { description: 'JWT gerado com sucesso', content: { 'application/json': { schema: { $ref: '#/components/schemas/LoginResponse' } } } },
                        400: { description: 'Campos obrigatórios ausentes', content: { 'application/json': { schema: { $ref: '#/components/schemas/ValidationErrors' } } } },
                        401: { description: 'Credenciais inválidas ou subdomain não encontrado', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
                        409: {
                            description: 'E-mail existe em múltiplos hotéis — informe o subdomain para desambiguar',
                            content: { 'application/json': { schema: { type: 'object', properties: {
                                error: { type: 'string' }, requires: { type: 'string', example: 'subdomain' }
                            }}}}
                        }
                    }
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
                    responses: {
                        200: { description: 'JWT gerado com sucesso', content: { 'application/json': { schema: { $ref: '#/components/schemas/LoginResponse' } } } },
                        401: { description: 'Credenciais inválidas', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } }
                    }
                }
            },
            '/tenants/me': {
                get: {
                    tags: ['Hotel (Configuração)'],
                    summary: 'Retorna a configuração do próprio hotel',
                    responses: {
                        200: { description: 'Dados e config do hotel (booking_enabled, deposit_percent)', content: { 'application/json': { schema: { $ref: '#/components/schemas/Tenant' } } } },
                        401: { description: 'Sem token', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
                        404: { description: 'Hotel não encontrado', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } }
                    }
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
                    responses: {
                        200: { description: 'Config atualizada', content: { 'application/json': { schema: { $ref: '#/components/schemas/Tenant' } } } },
                        400: { description: 'Valor inválido', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
                        403: { description: 'Apenas ADMIN', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
                        404: { description: 'Hotel não encontrado', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } }
                    }
                }
            },
            '/users': {
                get: {
                    tags: ['Usuários'], summary: 'Lista usuários do tenant',
                    responses: { 200: { description: 'Lista de usuários (sem password_hash)', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/User' } } } } } }
                },
                post: {
                    tags: ['Usuários'], summary: 'Cria novo usuário',
                    requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['name', 'email', 'password'], properties: {
                        name: { type: 'string', example: 'João Silva' }, email: { type: 'string', format: 'email' },
                        password: { type: 'string', example: 'senha123' }, role: { type: 'string', enum: VALID_ROLES, description: 'Default: RECEPTIONIST' }
                    }}}}},
                    responses: {
                        201: { description: 'Usuário criado (sem password_hash)', content: { 'application/json': { schema: { $ref: '#/components/schemas/User' } } } },
                        400: { description: 'Campos obrigatórios ausentes ou role inválido', content: { 'application/json': { schema: { $ref: '#/components/schemas/ValidationErrors' } } } },
                        409: { description: 'E-mail já cadastrado neste tenant', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } }
                    }
                }
            },
            '/users/{id}': {
                parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string', format: 'uuid' } }],
                get: {
                    tags: ['Usuários'], summary: 'Busca usuário por ID',
                    responses: {
                        200: { description: 'Usuário encontrado (sem password_hash)', content: { 'application/json': { schema: { $ref: '#/components/schemas/User' } } } },
                        404: { description: 'Não encontrado', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } }
                    }
                },
                put: {
                    tags: ['Usuários'], summary: 'Atualiza usuário',
                    responses: {
                        200: { description: 'Atualizado (sem password_hash)', content: { 'application/json': { schema: { $ref: '#/components/schemas/User' } } } },
                        400: { description: 'role inválido', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
                        404: { description: 'Não encontrado', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
                        409: { description: 'E-mail já cadastrado neste hotel', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } }
                    }
                },
                delete: { tags: ['Usuários'], summary: 'Remove usuário', responses: { 204: { description: 'Removido' } } }
            },
            '/room-categories': {
                get: {
                    tags: ['Categorias de Quarto'], summary: 'Lista categorias',
                    responses: { 200: { description: 'OK', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/RoomCategory' } } } } } }
                },
                post: {
                    tags: ['Categorias de Quarto'], summary: 'Cria categoria',
                    requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/RoomCategory' } } } },
                    responses: {
                        201: { description: 'Criada', content: { 'application/json': { schema: { $ref: '#/components/schemas/RoomCategory' } } } },
                        400: { description: 'name ou price_per_night ausentes', content: { 'application/json': { schema: { $ref: '#/components/schemas/ValidationErrors' } } } },
                        409: { description: 'Já existe uma categoria com esse nome', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } }
                    }
                }
            },
            '/room-categories/{id}': {
                parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string', format: 'uuid' } }],
                get: {
                    tags: ['Categorias de Quarto'], summary: 'Busca por ID',
                    responses: {
                        200: { description: 'OK', content: { 'application/json': { schema: { $ref: '#/components/schemas/RoomCategory' } } } },
                        404: { description: 'Não encontrada', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } }
                    }
                },
                put: {
                    tags: ['Categorias de Quarto'], summary: 'Atualiza',
                    responses: {
                        200: { description: 'OK', content: { 'application/json': { schema: { $ref: '#/components/schemas/RoomCategory' } } } },
                        404: { description: 'Não encontrada', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
                        409: { description: 'Já existe uma categoria com esse nome', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } }
                    }
                },
                delete: { tags: ['Categorias de Quarto'], summary: 'Remove', responses: { 204: { description: 'OK' } } }
            },
            '/rooms': {
                get: {
                    tags: ['Quartos'], summary: 'Lista quartos',
                    responses: { 200: { description: 'OK — cada quarto inclui a categoria resumida (id, name, price_per_night)', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Room' } } } } } }
                },
                post: {
                    tags: ['Quartos'], summary: 'Cria quarto',
                    requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['category_id', 'number'], properties: {
                        category_id: { type: 'string', format: 'uuid' }, number: { type: 'string', example: '101' },
                        floor: { type: 'integer', nullable: true }, status: { type: 'string', enum: ['AVAILABLE', 'OCCUPIED', 'MAINTENANCE', 'CLEANING'], description: 'Default: AVAILABLE' }
                    }}}}},
                    responses: {
                        201: { description: 'Criado', content: { 'application/json': { schema: { $ref: '#/components/schemas/Room' } } } },
                        400: { description: 'category_id ou number ausentes', content: { 'application/json': { schema: { $ref: '#/components/schemas/ValidationErrors' } } } },
                        404: { description: 'Categoria não encontrada', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
                        409: { description: 'Já existe um quarto com esse número', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } }
                    }
                }
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
                        200: { description: 'Lista de quartos sem conflito no período (status AVAILABLE + sem sobreposição de reserva)', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Room' } } } } },
                        400: { description: 'check_in e check_out são obrigatórios ou check_in >= check_out', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } }
                    }
                }
            },
            '/rooms/{id}': {
                parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string', format: 'uuid' } }],
                get: {
                    tags: ['Quartos'], summary: 'Busca por ID',
                    responses: {
                        200: { description: 'OK — inclui a categoria completa', content: { 'application/json': { schema: { $ref: '#/components/schemas/Room' } } } },
                        404: { description: 'Não encontrado', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } }
                    }
                },
                put: {
                    tags: ['Quartos'], summary: 'Atualiza',
                    responses: {
                        200: { description: 'OK', content: { 'application/json': { schema: { $ref: '#/components/schemas/Room' } } } },
                        400: { description: 'status inválido', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
                        404: { description: 'Não encontrado', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
                        409: { description: 'Já existe um quarto com esse número', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } }
                    }
                },
                delete: { tags: ['Quartos'], summary: 'Remove', responses: { 204: { description: 'OK' } } }
            },
            '/guests': {
                get: {
                    tags: ['Hóspedes'], summary: 'Lista hóspedes',
                    responses: { 200: { description: 'OK', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Guest' } } } } } }
                },
                post: {
                    tags: ['Hóspedes'], summary: 'Cria hóspede',
                    requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['full_name'], properties: {
                        full_name: { type: 'string', example: 'Maria Oliveira' }, cpf: { type: 'string', nullable: true },
                        phone: { type: 'string', nullable: true }, email: { type: 'string', nullable: true }
                    }}}}},
                    responses: {
                        201: { description: 'Criado', content: { 'application/json': { schema: { $ref: '#/components/schemas/Guest' } } } },
                        400: { description: 'full_name ausente', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
                        409: { description: 'CPF ou e-mail já cadastrado para outro hóspede', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } }
                    }
                }
            },
            '/guests/{id}': {
                parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string', format: 'uuid' } }],
                get: {
                    tags: ['Hóspedes'], summary: 'Busca por ID',
                    responses: {
                        200: { description: 'OK', content: { 'application/json': { schema: { $ref: '#/components/schemas/Guest' } } } },
                        404: { description: 'Não encontrado', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } }
                    }
                },
                put: {
                    tags: ['Hóspedes'], summary: 'Atualiza',
                    responses: {
                        200: { description: 'OK', content: { 'application/json': { schema: { $ref: '#/components/schemas/Guest' } } } },
                        404: { description: 'Não encontrado', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
                        409: { description: 'CPF ou e-mail já cadastrado para outro hóspede', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } }
                    }
                },
                delete: { tags: ['Hóspedes'], summary: 'Remove', responses: { 204: { description: 'OK' } } }
            },
            '/address/{cep}': {
                parameters: [{ in: 'path', name: 'cep', required: true, schema: { type: 'string', example: '01310100' }, description: 'CEP com ou sem formatação (8 dígitos)' }],
                get: {
                    tags: ['Endereço'],
                    summary: 'Consulta endereço por CEP (ViaCEP) — apoio ao preenchimento de cadastro',
                    responses: {
                        200: { description: 'Endereço encontrado', content: { 'application/json': { schema: { $ref: '#/components/schemas/Address' } } } },
                        400: { description: 'CEP inválido — não tem 8 dígitos' },
                        404: { description: 'CEP não encontrado' },
                        503: { description: 'Serviço de CEP indisponível no momento' }
                    }
                }
            },
            '/reservations': {
                get: {
                    tags: ['Reservas'], summary: 'Lista reservas (filtro por período e paginação opcionais)',
                    parameters: [
                        { in: 'query', name: 'from',  required: false, schema: { type: 'string', format: 'date' }, description: 'Início do intervalo (YYYY-MM-DD). Devolve reservas que se sobrepõem ao período.' },
                        { in: 'query', name: 'to',    required: false, schema: { type: 'string', format: 'date' }, description: 'Fim do intervalo (YYYY-MM-DD).' },
                        { in: 'query', name: 'page',  required: false, schema: { type: 'integer', minimum: 1 }, description: 'Página (1+). Presente page ou limit, a resposta vira { data, total, page, limit }.' },
                        { in: 'query', name: 'limit', required: false, schema: { type: 'integer', minimum: 1, maximum: 100, default: 50 }, description: 'Itens por página (máx. 100).' }
                    ],
                    responses: {
                        200: {
                            description: 'array puro (sem page/limit na query) ou { data, total, page, limit } (com paginação)',
                            content: { 'application/json': { schema: { oneOf: [
                                { type: 'array', items: { $ref: '#/components/schemas/ReservationListItem' } },
                                { $ref: '#/components/schemas/ReservationListPage' }
                            ]}}}
                        },
                        400: { description: 'from/to fora do formato YYYY-MM-DD', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } }
                    }
                },
                post: {
                    tags: ['Reservas'], summary: 'Cria reserva — total = soma de cada quarto (principal e extras) × noites; todos os quartos conferidos contra os ocupados',
                    requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['guest_id', 'room_id', 'check_in_date', 'check_out_date'], properties: {
                        guest_id: { type: 'string', format: 'uuid' }, room_id: { type: 'string', format: 'uuid' },
                        check_in_date: { type: 'string', format: 'date' }, check_out_date: { type: 'string', format: 'date' },
                        extra_room_ids: { type: 'array', items: { type: 'string', format: 'uuid' }, description: 'Quartos adicionais vinculados na mesma transação' }
                    }}}}},
                    responses: {
                        201: { description: 'Criada — status PENDING, total_amount calculado no servidor', content: { 'application/json': { schema: { $ref: '#/components/schemas/Reservation' } } } },
                        400: { description: 'Campos obrigatórios ausentes ou check_out_date não posterior a check_in_date', content: { 'application/json': { schema: { $ref: '#/components/schemas/ValidationErrors' } } } },
                        404: { description: 'Hóspede, quarto ou quarto extra não encontrado', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
                        409: { description: 'Algum quarto (principal ou extra) ocupado no período', content: { 'application/json': { schema: { $ref: '#/components/schemas/RoomOccupied' } } } },
                        422: { description: 'Categoria do quarto sem preço definido', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } }
                    }
                }
            },
            '/reservations/{id}': {
                parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string', format: 'uuid' } }],
                get: {
                    tags: ['Reservas'], summary: 'Busca por ID (inclui hóspede, quarto principal e quartos N:N)',
                    responses: {
                        200: { description: 'OK', content: { 'application/json': { schema: { $ref: '#/components/schemas/ReservationDetail' } } } },
                        404: { description: 'Não encontrada', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } }
                    }
                },
                put: {
                    tags: ['Reservas'], summary: 'Atualiza reserva (guest_id, room_id, datas — não altera status; total_amount recalculado se quarto ou datas mudarem)',
                    description: 'Na troca do quarto principal, as contas ROOM abertas do quarto que sai passam para o quarto novo na mesma transação (RN-005 / D-3, D-5). O rótulo gerado pelo sistema ("Suíte 906") acompanha; o escolhido pela recepção fica. Conta fechada ou paga não muda (D-23).',
                    responses: {
                        200: { description: 'OK', content: { 'application/json': { schema: { $ref: '#/components/schemas/Reservation' } } } },
                        400: { description: 'check_out_date não posterior a check_in_date', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
                        404: { description: 'Reserva, hóspede ou quarto não encontrado (no hotel do token)', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
                        409: { description: 'Quarto ocupado no período (com room_ids); quarto novo já é extra desta reserva; quarto novo já tem conta cobrando diária desta reserva (RN-005, com account_ids — escolha outro quarto ou peça ao administrador para ajustar a conta); reserva-bloco B2B (altere pelo contrato); reserva CHECKED_OUT ou CANCELLED', content: { 'application/json': { schema: { allOf: [
                            { $ref: '#/components/schemas/RoomOccupied' },
                            { type: 'object', properties: { account_ids: { type: 'array', items: { type: 'string', format: 'uuid' }, description: 'Só no 409 da RN-005: contas de diária desta reserva que já estão no quarto novo' } } }
                        ] } } } }
                    }
                },
                delete: { tags: ['Reservas'], summary: 'Remove reserva (ADMIN)', description: 'Fecha as contas abertas da reserva na mesma transação (D-36).', responses: { 204: { description: 'OK' } } }
            },
            '/reservations/{id}/cancel': {
                parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string', format: 'uuid' } }],
                put: {
                    tags: ['Reservas'],
                    summary: 'Cancela reserva (apenas PENDING ou CONFIRMED)',
                    description: 'Fecha as contas abertas da reserva na mesma transação (D-36). O consumo já lançado segue cobrado; a diária da conta passa a 0 (D-35).',
                    responses: {
                        200: { description: 'Reserva cancelada — status alterado para CANCELLED', content: { 'application/json': { schema: { $ref: '#/components/schemas/Reservation' } } } },
                        409: { description: 'Reserva-bloco B2B — cancele pelo contrato (PUT /contracts/{id}/cancel)', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
                        422: { description: 'Reserva não pode ser cancelada no status atual (CHECKED_IN, CHECKED_OUT ou já CANCELLED)', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
                        404: { description: 'Reserva não encontrada', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } }
                    }
                }
            },
            '/reservations/{id}/check-in': {
                parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string', format: 'uuid' } }],
                put: {
                    tags: ['Reservas'], summary: 'Realiza check-in (PENDING ou CONFIRMED → CHECKED_IN; ocupa o(s) quarto(s))',
                    responses: {
                        200: { description: 'Status alterado para CHECKED_IN', content: { 'application/json': { schema: { $ref: '#/components/schemas/Reservation' } } } },
                        404: { description: 'Reserva ou quarto não encontrado', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
                        422: { description: 'Check-in não permitido no status atual', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } }
                    }
                }
            },
            '/reservations/{id}/check-out': {
                parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string', format: 'uuid' } }],
                put: {
                    tags: ['Reservas'], summary: 'Realiza check-out (CHECKED_IN → CHECKED_OUT; quarto(s) vão para CLEANING)',
                    description: 'Fecha as contas abertas da reserva na mesma transação (D-36).',
                    responses: {
                        200: { description: 'Status alterado para CHECKED_OUT', content: { 'application/json': { schema: { $ref: '#/components/schemas/Reservation' } } } },
                        404: { description: 'Reserva ou quarto não encontrado', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
                        422: { description: 'Check-out só possível quando status for CHECKED_IN', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } }
                    }
                }
            },
            '/reservations/{id}/bill': {
                parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string', format: 'uuid' } }],
                get: {
                    tags: ['Financeiro'],
                    summary: 'Fechamento de conta: (diária + consumos) − pagamentos confirmados',
                    description: 'Desde a T-04.2, os consumos são os itens faturáveis e não excluídos de todas as contas da reserva.',
                    responses: {
                        200: { description: 'Conta com room_total, consumptions_total, grand_total, total_paid, balance_due', content: { 'application/json': { schema: { $ref: '#/components/schemas/Bill' } } } },
                        404: { description: 'Reserva não encontrada', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
                        503: { description: 'A reserva tem consumo antigo ainda não migrado — o total sairia menor. Some quando o `migrate` concluir (T-04.2)', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } }
                    }
                }
            },
            '/reservations/{id}/consumptions': {
                parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string', format: 'uuid' } }],
                get: {
                    tags: ['Financeiro'], summary: 'Lista consumos extras da reserva',
                    description: 'Desde a T-04.2, os itens faturáveis e não excluídos de todas as contas da reserva, no formato antigo e em ordem de consumo. Cortesia não aparece.',
                    responses: {
                        200: { description: 'Lista de consumos', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Consumption' } } } } },
                        404: { description: 'Reserva não encontrada', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
                        503: { description: 'A reserva tem consumo antigo ainda não migrado — a lista sairia incompleta. Some quando o `migrate` concluir', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } }
                    }
                },
                post: {
                    tags: ['Financeiro'],
                    summary: 'Lança consumo extra (frigobar, restaurante, spa)',
                    description: 'Contrato antigo, mantido. Desde a T-04.2 o consumo vira item da conta da suíte da reserva (criada se não existir). Aceita reserva sem check-in, como antes; reserva com check-out feito ou cancelada não recebe consumo (422). Para lançar com cardápio, cortesia ou idempotência, use `POST /accounts/{id}/items`.',
                    requestBody: {
                        required: true,
                        content: { 'application/json': { schema: { type: 'object', required: ['description', 'amount'], properties: {
                            description: { type: 'string', example: 'Frigobar' },
                            amount:      { type: 'number', example: 50.00, maximum: 99999999.99 },
                            consumed_at: { type: 'string', format: 'date-time', description: 'Quando o hóspede consumiu. Omitido = agora. Não pode estar mais de 1 minuto no futuro' }
                        }}}}
                    },
                    responses: {
                        201: { description: 'Consumo lançado', content: { 'application/json': { schema: { $ref: '#/components/schemas/Consumption' } } } },
                        400: { description: 'description ausente ou acima de 200 caracteres; amount que não é número, <= 0, com mais de 2 casas ou acima de 99999999.99; consumed_at que não é data ISO ou está mais de 1 minuto no futuro', content: { 'application/json': { schema: { $ref: '#/components/schemas/ValidationErrors' } } } },
                        404: { description: 'Reserva não encontrada', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
                        422: { description: 'Reserva com check-out feito ou cancelada, ou a conta da suíte já foi fechada', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } }
                    }
                }
            },
            '/reservations/{id}/consumptions/{consumptionId}': {
                parameters: [
                    { in: 'path', name: 'id',            required: true, schema: { type: 'string', format: 'uuid' } },
                    { in: 'path', name: 'consumptionId', required: true, schema: { type: 'string', format: 'uuid' } }
                ],
                delete: { tags: ['Financeiro'], summary: 'Remove consumo extra (soft delete, ADMIN)', description: 'O id é o do item da conta — igual ao id do consumo antigo para os migrados na T-04.2.', responses: { 204: { description: 'Removido' }, 403: { description: 'Requer papel ADMIN' }, 404: { description: 'Não encontrado' }, 422: { description: 'A conta da suíte já foi fechada' }, 503: { description: 'Consumo antigo da reserva ainda não migrado' } } }
            },
            '/reservations/{id}/rooms': {
                parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string', format: 'uuid' } }],
                post: {
                    tags: ['Reservas — N:N (Pivô)'], summary: 'Adiciona quarto à reserva (tabela pivô reservation_rooms)',
                    requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { room_id: { type: 'string', format: 'uuid' } } } } } },
                    responses: {
                        201: { description: 'Quarto vinculado', content: { 'application/json': { schema: { $ref: '#/components/schemas/ReservationRoomPivot' } } } },
                        400: { description: 'room_id ausente', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
                        404: { description: 'Reserva ou quarto não encontrado', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
                        409: { description: 'Já vinculado; quarto ocupado no período (com room_ids); reserva-bloco B2B; reserva CHECKED_OUT ou CANCELLED', content: { 'application/json': { schema: { $ref: '#/components/schemas/RoomOccupied' } } } }
                    }
                }
            },
            '/reservations/{id}/rooms/{roomId}': {
                parameters: [
                    { in: 'path', name: 'id',     required: true, schema: { type: 'string', format: 'uuid' } },
                    { in: 'path', name: 'roomId', required: true, schema: { type: 'string', format: 'uuid' } }
                ],
                delete: {
                    tags: ['Reservas — N:N (Pivô)'], summary: 'Remove quarto extra da reserva (recalcula o total)',
                    description: 'As contas ROOM abertas do quarto removido passam para o quarto principal da reserva, com itens e pagamentos — nenhuma é apagada e a remoção não é bloqueada por conta aberta. Se o principal já tem conta cobrando diária, a conta movida passa a `charges_lodging: false` (RN-005); senão, ela segue cobrando a diária. O rótulo gerado pelo sistema acompanha o quarto ("Suíte 701"); a conta movida que não vira a conta de diária do principal leva a origem ("Suíte 701 · ex-702"); o rótulo da recepção fica. Conta fechada ou paga não muda (D-23).',
                    responses: {
                        204: { description: 'Desvinculado' },
                        404: { description: 'Reserva não encontrada ou quarto não vinculado', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
                        409: { description: 'Quarto principal (troque pelo PUT); reserva-bloco B2B; reserva CHECKED_OUT ou CANCELLED; outra operação alterando a reserva ao mesmo tempo (deadlock repetido — tente de novo)', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } }
                    }
                }
            },
            '/payments': {
                get: {
                    tags: ['Pagamentos'], summary: 'Lista pagamentos do tenant',
                    responses: { 200: { description: 'OK — nunca inclui pix_qr_code/provider/provider_charge_id (PaymentModel.defaultScope)', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Payment' } } } } } }
                },
                post: {
                    tags: ['Pagamentos'], summary: 'Registra novo pagamento da reserva ou de uma conta (recepção — manual, não PIX online)',
                    description: 'Informe reservation_id ou account_id (T-04.4). Pagamento feito na reserva sem conta (o sinal PIX, o pagamento da recepção pela reserva) é crédito da reserva: preenche as contas dela, primeiro as fechadas na ordem em que fecharam, depois as abertas com a titular (conta de diária mais antiga) primeiro, cada uma até o que ela deve; a sobra fica na última (D-42, D-45). Com account_id, a reserva vem da conta. Se o pagamento quita uma conta fechada, ela vira PAID na mesma transação; conta aberta paga vira PAID ao fechar (D-43). Pagamento a maior é aceito e deixa o saldo negativo (D-44).',
                    requestBody: { required: true, content: { 'application/json': { schema: {
                        type: 'object', required: ['amount', 'method'],
                        description: 'reservation_id ou account_id obrigatório',
                        properties: {
                            reservation_id: { type: 'string', format: 'uuid', description: 'Com account_id, opcional; se vier, tem de ser a reserva da conta' },
                            account_id:     { type: 'string', format: 'uuid', description: 'Conta a pagar (T-04.4)' },
                            amount:         { type: 'number', example: 300.00 },
                            method:         { type: 'string', enum: ['PIX', 'CARTAO_CREDITO', 'CARTAO_DEBITO', 'DINHEIRO'], example: 'PIX' },
                            paid_at:        { type: 'string', format: 'date-time' }
                        }
                    }}}},
                    responses: {
                        201: { description: 'Pagamento registrado', content: { 'application/json': { schema: { $ref: '#/components/schemas/Payment' } } } },
                        400: { description: 'reservation_id e account_id ausentes, ou amount ou method ausentes', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
                        404: { description: 'Reserva ou conta não encontrada no hotel', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
                        422: { description: 'Conta INTERNAL (nunca é receita), conta já PAID, ou reservation_id diferente da reserva da conta', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
                        503: { description: 'A reserva da conta tem consumo antigo ainda não migrado (D-31)', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } }
                    }
                }
            },
            '/payments/{id}': {
                parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string', format: 'uuid' } }],
                get: {
                    tags: ['Pagamentos'], summary: 'Busca pagamento por ID',
                    responses: {
                        200: { description: 'OK', content: { 'application/json': { schema: { $ref: '#/components/schemas/Payment' } } } },
                        404: { description: 'Não encontrado', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } }
                    }
                },
                put: {
                    tags: ['Pagamentos'], summary: 'Atualiza pagamento (amount, method, paid_at)',
                    description: 'Reserva e conta do pagamento não mudam. Mudar o valor acerta a conta afetada: quita (CLOSED → PAID) ou reabre o saldo (PAID → CLOSED).',
                    responses: {
                        200: { description: 'OK', content: { 'application/json': { schema: { $ref: '#/components/schemas/Payment' } } } },
                        404: { description: 'Não encontrado', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } }
                    }
                },
                delete: { tags: ['Pagamentos'], summary: 'Remove pagamento (soft delete)', description: 'A conta que o pagamento quitava volta a CLOSED com saldo (T-04.4).', responses: { 204: { description: 'OK' } } }
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
            },
            '/products': {
                get: {
                    tags: ['Produtos'],
                    summary: 'Lista o cardápio do hotel',
                    description: 'Itens de consumo (bebida, comida, serviço). Leitura liberada a todos os papéis — o garçom precisa do cardápio para lançar consumo.',
                    parameters: [
                        { in: 'query', name: 'active',   required: false, schema: { type: 'string', enum: ['true', 'false'] }, description: 'Filtra por ativos ou inativos. Omitido devolve todos.' },
                        { in: 'query', name: 'category', required: false, schema: { type: 'string', enum: PRODUCT_CATEGORIES } }
                    ],
                    responses: {
                        200: {
                            description: 'Cardápio ordenado por categoria e nome',
                            content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Product' } } } }
                        },
                        400: { description: 'category fora da allowlist' },
                        401: { description: 'Token não fornecido ou inválido' },
                        500: { description: 'Erro interno' }
                    }
                },
                post: {
                    tags: ['Produtos'],
                    summary: 'Cria um item do cardápio (ADMIN)',
                    requestBody: {
                        required: true,
                        content: { 'application/json': { schema: {
                            type: 'object',
                            required: ['name', 'price'],
                            properties: {
                                name:        { type: 'string', example: 'Cerveja 600ml' },
                                description: { type: 'string', nullable: true },
                                price:       { type: 'number', format: 'float', example: 12.00 },
                                category:    { type: 'string', enum: PRODUCT_CATEGORIES, default: 'OTHER' },
                                active:      { type: 'boolean', default: true }
                            }
                        }}}
                    },
                    responses: {
                        201: { description: 'Produto criado', content: { 'application/json': { schema: { $ref: '#/components/schemas/Product' } } } },
                        400: { description: 'Campos obrigatórios ausentes, price negativo ou category inválida' },
                        401: { description: 'Token não fornecido ou inválido' },
                        403: { description: 'Requer papel ADMIN' },
                        409: { description: 'Já existe produto com esse nome no tenant' },
                        500: { description: 'Erro interno' }
                    }
                }
            },
            '/products/{id}': {
                get: {
                    tags: ['Produtos'],
                    summary: 'Busca um item do cardápio',
                    parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string', format: 'uuid' } }],
                    responses: {
                        200: { description: 'Produto encontrado', content: { 'application/json': { schema: { $ref: '#/components/schemas/Product' } } } },
                        401: { description: 'Token não fornecido ou inválido' },
                        404: { description: 'Produto não encontrado no tenant' },
                        500: { description: 'Erro interno' }
                    }
                },
                put: {
                    tags: ['Produtos'],
                    summary: 'Atualiza um item do cardápio (ADMIN)',
                    description: 'Para tirar do cardápio preservando o histórico de comandas, use `active: false` em vez de DELETE.',
                    parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string', format: 'uuid' } }],
                    requestBody: {
                        content: { 'application/json': { schema: {
                            type: 'object',
                            properties: {
                                name:        { type: 'string' },
                                description: { type: 'string', nullable: true },
                                price:       { type: 'number', format: 'float' },
                                category:    { type: 'string', enum: PRODUCT_CATEGORIES },
                                active:      { type: 'boolean' }
                            }
                        }}}
                    },
                    responses: {
                        200: { description: 'Produto atualizado', content: { 'application/json': { schema: { $ref: '#/components/schemas/Product' } } } },
                        400: { description: 'price negativo, name vazio ou category inválida' },
                        401: { description: 'Token não fornecido ou inválido' },
                        403: { description: 'Requer papel ADMIN' },
                        404: { description: 'Produto não encontrado no tenant' },
                        409: { description: 'Nome já usado por outro produto do tenant' },
                        500: { description: 'Erro interno' }
                    }
                },
                delete: {
                    tags: ['Produtos'],
                    summary: 'Remove um item do cardápio — soft delete (ADMIN)',
                    parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string', format: 'uuid' } }],
                    responses: {
                        204: { description: 'Produto removido' },
                        401: { description: 'Token não fornecido ou inválido' },
                        403: { description: 'Requer papel ADMIN' },
                        404: { description: 'Produto não encontrado no tenant' },
                        500: { description: 'Erro interno' }
                    }
                }
            },
            '/accounts': {
                get: {
                    tags: ['Comandas'],
                    summary: 'Lista as contas do hotel',
                    description: 'Todos os papéis. O app do garçom usa `?status=OPEN`. A resposta não traz dados do hóspede.',
                    parameters: [
                        { in: 'query', name: 'status', required: false, schema: { type: 'string', enum: ACCOUNT_STATUSES } },
                        { in: 'query', name: 'type',   required: false, schema: { type: 'string', enum: ACCOUNT_TYPES } }
                    ],
                    responses: {
                        200: { description: 'Contas, da mais recente para a mais antiga', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Account' } } } } },
                        400: { description: 'status ou type fora da allowlist' },
                        401: { description: 'Token não fornecido ou inválido' },
                        500: { description: 'Erro interno' }
                    }
                },
                post: {
                    tags: ['Comandas'],
                    summary: 'Abre uma conta',
                    description: [
                        'Toda conta nasce `OPEN`; o `status` enviado é ignorado.',
                        '',
                        'Vínculos por tipo: `ROOM` exige `reservation_id` (com check-in feito), `room_id` (quarto da reserva) e `guest_id` (qualquer hóspede do hotel). Os demais tipos não aceitam `reservation_id`; `TABLE` e `INTERNAL` também não aceitam `guest_id`.',
                        '',
                        '`charges_lodging` vale `true` por padrão em `ROOM` (mande `false` para dividir a suíte) e é sempre `false` nos demais tipos.',
                        '',
                        'O garçom (`WAITER`) abre só `TABLE` e `DIRECT`.'
                    ].join('\n'),
                    requestBody: {
                        required: true,
                        content: { 'application/json': { schema: {
                            type: 'object',
                            required: ['type', 'label'],
                            properties: {
                                type:            { type: 'string', enum: ACCOUNT_TYPES },
                                label:           { type: 'string', maxLength: 100, example: 'Mesa 5' },
                                reservation_id:  { type: 'string', format: 'uuid' },
                                room_id:         { type: 'string', format: 'uuid' },
                                guest_id:        { type: 'string', format: 'uuid' },
                                charges_lodging: { type: 'boolean' }
                            }
                        }}}
                    },
                    responses: {
                        201: { description: 'Conta aberta', content: { 'application/json': { schema: { $ref: '#/components/schemas/Account' } } } },
                        400: { description: 'type fora da allowlist, label vazio, id que não é UUID ou charges_lodging não booleano' },
                        401: { description: 'Token não fornecido ou inválido' },
                        403: { description: 'Garçom abrindo conta ROOM, DAY_USE ou INTERNAL' },
                        404: { description: 'Reserva, quarto ou hóspede não encontrado no hotel' },
                        422: { description: 'Vínculo proibido ou ausente para o tipo, reserva sem check-in, quarto fora da reserva, diária fora de ROOM ou segunda conta cobrando a diária do quarto na estadia (RN-005)' },
                        500: { description: 'Erro interno' }
                    }
                }
            },
            '/accounts/{id}': {
                get: {
                    tags: ['Comandas'],
                    summary: 'Busca uma conta com os itens e o total',
                    parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string', format: 'uuid' } }],
                    responses: {
                        200: { description: 'Conta encontrada', content: { 'application/json': { schema: { $ref: '#/components/schemas/AccountDetail' } } } },
                        401: { description: 'Token não fornecido ou inválido' },
                        404: { description: 'Conta não encontrada no hotel' },
                        500: { description: 'Erro interno' }
                    }
                }
            },
            '/accounts/{id}/items': {
                post: {
                    tags: ['Comandas'],
                    summary: 'Lança um item na conta',
                    description: [
                        'Com `product_id`, descrição e preço vêm do cardápio (o que o cliente mandar é ignorado). Sem `product_id`, `description` e `unit_price` são obrigatórios. `total` é sempre calculado no servidor.',
                        '',
                        '**Idempotência:** o reenvio do mesmo `client_item_id` responde **200** com o item original e não duplica — inclusive se o item já foi excluído (vem com `deleted_at`) ou se a conta fechou depois. O mesmo `client_item_id` em outra conta do hotel dá 409.',
                        '',
                        '**Cortesia e avulso:** `billable: false` exige `reason`. Cortesia e lançamento sem `product_id` exigem papel ADMIN ou RECEPTIONIST — o garçom só lança item do cardápio, faturável.',
                        '',
                        'Conta `ROOM` só recebe item enquanto a reserva estiver `CHECKED_IN`.'
                    ].join('\n'),
                    parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string', format: 'uuid' } }],
                    requestBody: {
                        required: true,
                        content: { 'application/json': { schema: {
                            type: 'object',
                            properties: {
                                product_id:     { type: 'string', format: 'uuid' },
                                description:    { type: 'string', maxLength: 200, example: 'Taxa de rolha' },
                                unit_price:     { type: 'number', format: 'float', minimum: 0, example: 30.00, description: 'No máximo 2 casas decimais' },
                                quantity:       { type: 'integer', minimum: 1, maximum: 9999, default: 1 },
                                billable:       { type: 'boolean', default: true },
                                reason:         { type: 'string', enum: ITEM_REASONS },
                                client_item_id: { type: 'string', format: 'uuid' }
                            }
                        }}}
                    },
                    responses: {
                        200: { description: 'Reenvio: item original, sem duplicar', content: { 'application/json': { schema: { $ref: '#/components/schemas/AccountItemResult' } } } },
                        201: { description: 'Item lançado', content: { 'application/json': { schema: { $ref: '#/components/schemas/AccountItemResult' } } } },
                        400: { description: 'Campo inválido, description/unit_price ausentes sem product_id, preço com mais de 2 casas, quantity fora de 1–9999, reason fora da allowlist ou total acima do limite' },
                        401: { description: 'Token não fornecido ou inválido' },
                        403: { description: 'Garçom lançando cortesia ou item avulso (sem product_id)' },
                        404: { description: 'Conta ou produto não encontrado no hotel' },
                        409: { description: 'client_item_id já usado em outra conta' },
                        422: { description: 'Conta fora de OPEN (o check-out já a fecha), conta ROOM com check-out feito, produto inativo, cortesia sem reason ou reason em item faturável' },
                        500: { description: 'Erro interno' }
                    }
                }
            },
            '/accounts/{id}/bill': {
                get: {
                    tags: ['Comandas'],
                    summary: 'Bill da conta: diária, consumos, total, pagamentos e saldo (ADMIN, RECEPTIONIST)',
                    parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string', format: 'uuid' } }],
                    responses: {
                        200: { description: 'Bill calculado na hora', content: { 'application/json': { schema: { $ref: '#/components/schemas/AccountBill' } } } },
                        401: { description: 'Token não fornecido ou inválido' },
                        403: { description: 'Garçom não vê o bill' },
                        404: { description: 'Conta não encontrada no hotel' },
                        503: { description: 'A reserva da conta tem consumo antigo ainda não migrado (D-31)' },
                        500: { description: 'Erro interno' }
                    }
                }
            },
            '/accounts/{id}/close': {
                put: {
                    tags: ['Comandas'],
                    summary: 'Fecha a conta: OPEN → CLOSED, ou PAID se já está paga (ADMIN, RECEPTIONIST)',
                    description: 'Grava a diária apresentada (D-39). A conta que cobra a diária só fecha com a reserva em check-out ou cancelada; as outras fecham com o hóspede ainda hospedado. Conta fechada não recebe nem perde item. Se a conta já tem pagamento e o saldo é ≤ 0, sai do fechamento PAID (D-43). O check-out, o cancelamento, o cancelamento do contrato e a exclusão da reserva fecham as contas abertas dela automaticamente (D-36).',
                    parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string', format: 'uuid' } }],
                    responses: {
                        200: { description: 'Conta fechada; devolve o bill', content: { 'application/json': { schema: { $ref: '#/components/schemas/AccountBill' } } } },
                        401: { description: 'Token não fornecido ou inválido' },
                        403: { description: 'Garçom não fecha conta' },
                        404: { description: 'Conta não encontrada no hotel' },
                        422: { description: 'Conta já CLOSED ou PAID, ou conta que cobra diária com a estadia ainda em andamento' },
                        503: { description: 'A reserva da conta tem consumo antigo ainda não migrado (D-31)' },
                        500: { description: 'Erro interno' }
                    }
                }
            },
            '/accounts/{id}/items/{itemId}': {
                delete: {
                    tags: ['Comandas'],
                    summary: 'Exclui um item — soft delete com auditoria (ADMIN)',
                    parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string', format: 'uuid' } }, { in: 'path', name: 'itemId', required: true, schema: { type: 'string', format: 'uuid' } }],
                    responses: {
                        204: { description: 'Item excluído; quem excluiu fica registrado' },
                        401: { description: 'Token não fornecido ou inválido' },
                        403: { description: 'Requer papel ADMIN' },
                        404: { description: 'Conta ou item não encontrado' },
                        422: { description: 'Conta fora de OPEN' },
                        500: { description: 'Erro interno' }
                    }
                }
            }
        }
    },
    apis: []
};

export default swaggerJsdoc(options);
