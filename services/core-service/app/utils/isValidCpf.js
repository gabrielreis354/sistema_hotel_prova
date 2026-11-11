/**
 * Confere se o CPF é válido: 11 dígitos, não todos iguais, e os dois dígitos
 * verificadores batem. Aceita o CPF formatado ("529.982.247-25") ou só dígitos.
 *
 * Existe para o PSP que exige CPF (Asaas): sem esta checagem, um CPF malformado
 * só era recusado pelo Asaas e virava 503 para o hóspede (🟡3 do qa-redteam de 16/10).
 * Não confere se o CPF existe na Receita, só se é bem formado.
 */
export function isValidCpf(value) {
    if (typeof value !== 'string') return false;
    // Só dois formatos: "52998224725" ou "529.982.247-25". Texto em volta dos dígitos
    // ("CPF: 529...") seria gravado cru no hóspede, então também é recusado.
    const trimmed = value.trim();
    if (!/^\d{11}$/.test(trimmed) && !/^\d{3}\.\d{3}\.\d{3}-\d{2}$/.test(trimmed)) return false;
    const digits = trimmed.replace(/\D/g, '');
    // "00000000000", "11111111111"... passam na conta dos verificadores, mas não são CPF.
    if (/^(\d)\1{10}$/.test(digits)) return false;

    const checkDigit = (length) => {
        let sum = 0;
        for (let i = 0; i < length; i++) {
            sum += Number(digits[i]) * (length + 1 - i);
        }
        const rest = (sum * 10) % 11;
        return rest === 10 ? 0 : rest;
    };

    return checkDigit(9) === Number(digits[9]) && checkDigit(10) === Number(digits[10]);
}
