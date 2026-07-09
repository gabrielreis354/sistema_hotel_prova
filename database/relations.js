import TenantModel from "../app/Models/TenantModel.js";
import UserModel from "../app/Models/UserModel.js";
import RoomCategoryModel from "../app/Models/RoomCategoryModel.js";
import RoomModel from "../app/Models/RoomModel.js";
import GuestModel from "../app/Models/GuestModel.js";
import ReservationModel from "../app/Models/ReservationModel.js";
import ReservationRoomModel from "../app/Models/ReservationRoomModel.js";
import PaymentModel from "../app/Models/PaymentModel.js";
import ConsumptionModel from "../app/Models/ConsumptionModel.js";
import CorporateClientModel from "../app/Models/CorporateClientModel.js";
import EventQuoteModel from "../app/Models/EventQuoteModel.js";
import QuoteServiceModel from "../app/Models/QuoteServiceModel.js";
import ContractModel from "../app/Models/ContractModel.js";
import ContractInstallmentModel from "../app/Models/ContractInstallmentModel.js";

export default function initRelations() {
    // 1) Relacionamentos de Tenants (SaaS Multi-tenant)
    TenantModel.hasMany(UserModel, { foreignKey: "tenant_id", as: "users" });
    UserModel.belongsTo(TenantModel, { foreignKey: "tenant_id", as: "tenant" });

    TenantModel.hasMany(RoomCategoryModel, { foreignKey: "tenant_id", as: "room_categories" });
    RoomCategoryModel.belongsTo(TenantModel, { foreignKey: "tenant_id", as: "tenant" });

    TenantModel.hasMany(RoomModel, { foreignKey: "tenant_id", as: "rooms" });
    RoomModel.belongsTo(TenantModel, { foreignKey: "tenant_id", as: "tenant" });

    TenantModel.hasMany(GuestModel, { foreignKey: "tenant_id", as: "guests" });
    GuestModel.belongsTo(TenantModel, { foreignKey: "tenant_id", as: "tenant" });

    TenantModel.hasMany(ReservationModel, { foreignKey: "tenant_id", as: "reservations" });
    ReservationModel.belongsTo(TenantModel, { foreignKey: "tenant_id", as: "tenant" });

    TenantModel.hasMany(PaymentModel, { foreignKey: "tenant_id", as: "payments" });
    PaymentModel.belongsTo(TenantModel, { foreignKey: "tenant_id", as: "tenant" });

    // 2) Relacionamentos entre Categorias e Quartos
    RoomCategoryModel.hasMany(RoomModel, { foreignKey: "category_id", as: "rooms" });
    RoomModel.belongsTo(RoomCategoryModel, { foreignKey: "category_id", as: "category" });

    // 3) Relacionamentos de Reservas
    RoomModel.hasMany(ReservationModel, { foreignKey: "room_id", as: "reservations" });
    ReservationModel.belongsTo(RoomModel, { foreignKey: "room_id", as: "room" });

    GuestModel.hasMany(ReservationModel, { foreignKey: "guest_id", as: "reservations" });
    ReservationModel.belongsTo(GuestModel, { foreignKey: "guest_id", as: "guest" });

    UserModel.hasMany(ReservationModel, { foreignKey: "user_id", as: "reservations" });
    ReservationModel.belongsTo(UserModel, { foreignKey: "user_id", as: "user" });

    // 4) Relacionamentos de Pagamentos
    ReservationModel.hasMany(PaymentModel, { foreignKey: "reservation_id", as: "payments" });
    PaymentModel.belongsTo(ReservationModel, { foreignKey: "reservation_id", as: "reservation" });

    // Consumos extras (frigobar, restaurante, spa) lançados na reserva
    TenantModel.hasMany(ConsumptionModel, { foreignKey: "tenant_id", as: "consumptions" });
    ConsumptionModel.belongsTo(TenantModel, { foreignKey: "tenant_id", as: "tenant" });
    ReservationModel.hasMany(ConsumptionModel, { foreignKey: "reservation_id", as: "consumptions" });
    ConsumptionModel.belongsTo(ReservationModel, { foreignKey: "reservation_id", as: "reservation" });

    // 5) Relação N:N — Reserva <-> Quarto (Tabela Pivô: reservation_rooms)
    ReservationModel.belongsToMany(RoomModel, {
        through: ReservationRoomModel,
        foreignKey: 'reservation_id',
        otherKey: 'room_id',
        as: 'rooms'
    });
    RoomModel.belongsToMany(ReservationModel, {
        through: ReservationRoomModel,
        foreignKey: 'room_id',
        otherKey: 'reservation_id',
        as: 'reservations_pivot'
    });
    ReservationModel.hasMany(ReservationRoomModel, { foreignKey: 'reservation_id', as: 'reservation_rooms' });
    ReservationRoomModel.belongsTo(ReservationModel, { foreignKey: 'reservation_id', as: 'reservation' });
    ReservationRoomModel.belongsTo(RoomModel, { foreignKey: 'room_id', as: 'room' });

    // 6) Clientes Corporativos
    TenantModel.hasMany(CorporateClientModel, { foreignKey: 'tenant_id', as: 'corporate_clients' });
    CorporateClientModel.belongsTo(TenantModel, { foreignKey: 'tenant_id', as: 'tenant' });

    // 7) Orçamentos de Eventos
    CorporateClientModel.hasMany(EventQuoteModel, { foreignKey: 'corporate_client_id', as: 'quotes' });
    EventQuoteModel.belongsTo(CorporateClientModel, { foreignKey: 'corporate_client_id', as: 'client' });
    TenantModel.hasMany(EventQuoteModel, { foreignKey: 'tenant_id', as: 'event_quotes' });
    EventQuoteModel.belongsTo(TenantModel, { foreignKey: 'tenant_id', as: 'tenant' });

    // 8) Serviços do Orçamento
    EventQuoteModel.hasMany(QuoteServiceModel, { foreignKey: 'quote_id', as: 'services' });
    QuoteServiceModel.belongsTo(EventQuoteModel, { foreignKey: 'quote_id', as: 'quote' });

    // 9) Contratos
    CorporateClientModel.hasMany(ContractModel, { foreignKey: 'corporate_client_id', as: 'contracts' });
    ContractModel.belongsTo(CorporateClientModel, { foreignKey: 'corporate_client_id', as: 'client' });
    EventQuoteModel.hasMany(ContractModel, { foreignKey: 'quote_id', as: 'contracts' });
    ContractModel.belongsTo(EventQuoteModel, { foreignKey: 'quote_id', as: 'quote' });
    TenantModel.hasMany(ContractModel, { foreignKey: 'tenant_id', as: 'contracts' });
    ContractModel.belongsTo(TenantModel, { foreignKey: 'tenant_id', as: 'tenant' });

    // 10) Parcelas do Contrato
    ContractModel.hasMany(ContractInstallmentModel, { foreignKey: 'contract_id', as: 'installments' });
    ContractInstallmentModel.belongsTo(ContractModel, { foreignKey: 'contract_id', as: 'contract' });
}
