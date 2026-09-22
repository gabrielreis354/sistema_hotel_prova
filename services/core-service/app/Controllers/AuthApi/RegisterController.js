import bcrypt from 'bcryptjs';
import TenantModel from '../../Models/TenantModel.js';
import UserModel from '../../Models/UserModel.js';
import uniqueConstraintConflict from '../../utils/uniqueConstraintConflict.js';

// Gera slug a partir do nome: "Hotel Aurora" → "hotel-aurora"
function generateSubdomain(name) {
    return name
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')   // remove acentos
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9\s-]/g, '')      // remove caracteres especiais
        .replace(/\s+/g, '-')              // espaços → hífens
        .replace(/-+/g, '-');              // hífens duplos → simples
}

export default async function RegisterController(request, response) {
    try {
        const { tenantName, name, email, password } = request.body;

        const errors = [];
        if (!tenantName) errors.push('tenantName obrigatório');
        if (!name)       errors.push('name obrigatório');
        if (!email)      errors.push('email obrigatório');
        if (!password)   errors.push('password obrigatório');
        if (errors.length) return response.status(400).json({ errors });

        const subdomain = generateSubdomain(tenantName);

        const subdomainInUse = await TenantModel.findOne({ where: { subdomain } });
        if (subdomainInUse) return response.status(409).json({ error: 'Subdomain já em uso. Escolha um nome diferente para o hotel.' });

        const tenant = await TenantModel.create({ name: tenantName, subdomain, status: 'ACTIVE' });
        const password_hash = await bcrypt.hash(password, 10);

        const user = await UserModel.create({
            tenant_id: tenant.id,
            name,
            email,
            password_hash,
            role: 'ADMIN'
        });

        return response.status(201).json({
            tenant: { id: tenant.id, name: tenant.name, subdomain: tenant.subdomain },
            user: { id: user.id, name: user.name, email: user.email, role: user.role }
        });
    } catch (error) {
        // Mensagem deliberadamente vaga só quanto ao E-MAIL: se este catch for
        // alcançado (race entre dois cadastros simultâneos — o pré-check de subdomain
        // acima já resolveu o caso comum), não dá pra saber se colidiu email ou
        // subdomain sem revelar qual e-mail já existe. O subdomain em si NÃO é segredo:
        // o pré-check já devolve 409 específico pra ele, e GET /public/:subdomain/hotel
        // confirma a existência de qualquer subdomain sem autenticação.
        const conflito = uniqueConstraintConflict(error, response, 'E-mail ou subdomain já em uso');
        if (conflito) return conflito;

        console.error(error);
        return response.status(500).json({ error: 'Erro interno do servidor' });
    }
}
