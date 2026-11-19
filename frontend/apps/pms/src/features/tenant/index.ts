/**
 * API pública do módulo do hotel (tenant). Criado na T-09.1 para o comprovante dizer quem o
 * emitiu; outro módulo importa só daqui.
 */
export { canReadMyTenant, useMyTenant, myTenantOptions, myTenantQuery, tenantKeys } from './queries.js';
export { receiptIssuer } from './tenantApi.js';
export type { ReceiptIssuer, Tenant } from './tenantApi.js';
