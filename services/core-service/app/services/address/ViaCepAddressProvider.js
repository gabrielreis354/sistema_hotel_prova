import AddressProvider from './AddressProvider.js';
import { AddressNotFoundError, AddressServiceUnavailableError } from './errors.js';

const VIACEP_BASE_URL = 'https://viacep.com.br/ws';
const TIMEOUT_MS = 5000;

/**
 * ViaCepAddressProvider — consulta a API pública ViaCEP.
 *
 * Falha de rede, timeout ou status não-2xx viram AddressServiceUnavailableError —
 * um CEP indisponível não pode derrubar o fluxo principal (cadastro de hóspede/cliente).
 */
export default class ViaCepAddressProvider extends AddressProvider {
    async lookup(cep) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

        let response;
        try {
            response = await fetch(`${VIACEP_BASE_URL}/${cep}/json/`, { signal: controller.signal });
        } catch {
            throw new AddressServiceUnavailableError('Serviço de CEP indisponível no momento');
        } finally {
            clearTimeout(timeout);
        }

        if (!response.ok) {
            throw new AddressServiceUnavailableError(`ViaCEP respondeu ${response.status}`);
        }

        const data = await response.json();

        if (data.erro) {
            throw new AddressNotFoundError('CEP não encontrado');
        }

        return {
            cep: data.cep,
            street: data.logradouro,
            neighborhood: data.bairro,
            city: data.localidade,
            state: data.uf,
            complement: data.complemento || null
        };
    }
}
