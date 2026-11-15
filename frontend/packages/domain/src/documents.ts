/**
 * Documentos do hóspede, só para EXIBIÇÃO. Nada aqui altera o que é gravado: o formulário
 * continua mandando o CPF do jeito que o balcão digitou (normalizar o gravado é outro trabalho).
 */

/** Só dígitos e a pontuação usual de CPF (ponto, hífen, espaço). Letra ou barra não é CPF. */
const CPF_CHARS = /^[\d.\-\s]+$/;

/**
 * CPF no formato único da tela, `000.000.000-00`, para o mesmo hóspede aparecer igual na
 * lista, no detalhe, na reserva e na busca (SPEC-09, CA-09.c).
 *
 * - 11 dígitos, com ou sem pontuação: formatado.
 * - Qualquer outra entrada não vazia: volta como veio (a recepção vê o que foi gravado).
 * - Nulo, vazio ou só espaços: `null`, para a tela decidir o `'—'`.
 *
 * Não valida dígito verificador: é formatação, não validação.
 */
export function formatCpf(cpf: string | null | undefined): string | null {
  if (cpf == null || cpf.trim() === '') return null;
  const trimmed = cpf.trim();
  const digits = trimmed.replace(/\D/g, '');
  if (!CPF_CHARS.test(trimmed) || digits.length !== 11) return cpf;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}
