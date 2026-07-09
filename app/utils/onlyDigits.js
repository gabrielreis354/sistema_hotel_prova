/**
 * Remove tudo que não for dígito. Normaliza CNPJ/CPF/telefone que chegam
 * formatados do frontend ("12.345.678/0001-90") para o formato canônico
 * digit-only que o banco armazena. Retorna null para entradas vazias/nulas.
 */
export function onlyDigits(value) {
    if (value === undefined || value === null) return null;
    const digits = String(value).replace(/\D/g, '');
    return digits === '' ? null : digits;
}
