import { DataTypes } from 'sequelize';
import defineProjection from './defineProjection.js';

// Hotel (catálogo §4.1). Só o status: hotel suspenso recebe 403, como no core (tenant.middleware.js).
// `tenant_id` = `id` — o hotel é o próprio escopo.
const TenantProjection = defineProjection('TenantProjection', 'proj_tenants', {
    status: { type: DataTypes.TEXT, allowNull: false }
});

export default TenantProjection;
