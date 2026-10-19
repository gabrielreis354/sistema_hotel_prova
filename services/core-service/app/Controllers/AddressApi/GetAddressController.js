import getAddressProvider from '../../services/address/index.js';
import { AddressNotFoundError, AddressServiceUnavailableError } from '../../services/address/errors.js';
import { onlyDigits } from '../../utils/onlyDigits.js';

export default async function GetAddressController(request, response) {
    const cep = onlyDigits(request.params.cep);

    if (!cep || cep.length !== 8) {
        return response.status(400).json({ error: 'CEP inválido — informe 8 dígitos' });
    }

    try {
        const address = await getAddressProvider().lookup(cep);
        return response.status(200).json(address);
    } catch (error) {
        if (error instanceof AddressNotFoundError) {
            return response.status(404).json({ error: 'CEP não encontrado' });
        }
        if (error instanceof AddressServiceUnavailableError) {
            return response.status(503).json({ error: 'Serviço de CEP indisponível no momento' });
        }
        console.error('GetAddressController:', error);
        return response.status(500).json({ error: 'Erro interno do servidor' });
    }
}
