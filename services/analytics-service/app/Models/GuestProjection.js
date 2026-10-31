import { DataTypes } from 'sequelize';
import defineProjection from './defineProjection.js';

// Hóspede (catálogo §4.4) — MINIMIZAÇÃO (CA-01.4.l, LGPD art. 6º, III): só id, tenant_id e nome,
// além das colunas de controle. Nem CPF, nem e-mail, nem telefone: quem precisa contatar o hóspede
// abre a ficha no core pelo id (decisão D-1). `guest.erased` troca o nome por "Hóspede eliminado"
// e mantém o id, para as reservas históricas continuarem somando (CA-06.11.d).
const GuestProjection = defineProjection('GuestProjection', 'proj_guests', {
    full_name: { type: DataTypes.TEXT, allowNull: false }
});

export default GuestProjection;
