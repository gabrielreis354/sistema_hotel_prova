// Texto obrigatório: string com pelo menos um caractere que não seja espaço. Usado onde um valor em
// branco quebraria a operação (nome do hóspede na ficha, no rack e no evento guest.* do outbox).
export default function isNonBlankString(value) {
    return typeof value === 'string' && value.trim() !== '';
}
