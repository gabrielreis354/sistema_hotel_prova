/**
 * Resultado da busca de hóspede (GET /guests?q=): só o necessário para escolher entre
 * homônimos — LGPD art. 6º, III. O documento e o telefone completos só aparecem depois da
 * escolha, na ficha da reserva. Sem tenant_id, timestamps, deleted_at nem e-mail.
 */

const digitsOf = (value) => String(value ?? '').replace(/\D/g, '');

/** Só os 3 dígitos do meio: `***.456.789-**`. Não tem 11 dígitos? Omite, não vaza o que não sabemos ler. */
export function maskCpf(cpf) {
    const digits = digitsOf(cpf);
    if (digits.length !== 11) return null;
    return `***.${digits.slice(3, 6)}.${digits.slice(6, 9)}-**`;
}

/** Últimos 4 dígitos: `****-1111`. Menos de 4 dígitos: omite. */
export function maskPhone(phone) {
    const digits = digitsOf(phone);
    if (digits.length < 4) return null;
    return `****-${digits.slice(-4)}`;
}

/** Colunas que o serializer precisa — o `attributes` da busca não traz mais nada. */
export const GUEST_SEARCH_ATTRIBUTES = ['id', 'full_name', 'cpf', 'phone'];

export function toGuestSearchResult(guest) {
    const result = { id: guest.id, full_name: guest.full_name };
    const cpf = maskCpf(guest.cpf);
    const phone = maskPhone(guest.phone);
    if (cpf) result.cpf = cpf;
    if (phone) result.phone = phone;
    return result;
}
