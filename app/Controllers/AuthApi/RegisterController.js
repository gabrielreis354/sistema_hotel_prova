import bcrypt from 'bcryptjs';
import TenantModel from '../../Models/TenantModel.js';
import UserModel from '../../Models/UserModel.js';

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
        console.error(error);
        return response.status(500).json({ error: 'Erro interno do servidor' });
    }
}
