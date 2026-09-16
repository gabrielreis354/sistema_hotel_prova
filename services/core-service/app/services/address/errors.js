/**
 * Erros tipados do domínio de consulta de endereço — permitem ao controller mapear
 * status HTTP sem depender da implementação concreta do provedor (mesmo padrão de
 * inversão de dependência usado em app/services/pix/).
 */
export class AddressNotFoundError extends Error {}

export class AddressServiceUnavailableError extends Error {}
