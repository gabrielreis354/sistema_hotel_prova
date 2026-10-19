import { describe, it, expect } from 'vitest';
import { credencialDeAssinatura } from '../database/connections/minio.js';

// Unitário puro. A URL de download expõe o access key de quem assinou e passa pelo nginx até o
// MinIO (RNF-023): quem assina é um usuário só de leitura, NUNCA o root (achado 🟢-27).
describe('credencialDeAssinatura', () => {
    const base = { MINIO_ROOT_USER: 'raiz', MINIO_PRESIGN_USER: 'leitor', MINIO_PRESIGN_PASSWORD: 'segredo-123' };

    it('devolve o usuário de leitura configurado', () => {
        expect(credencialDeAssinatura(base)).toEqual({ user: 'leitor', password: 'segredo-123' });
    });

    it('recusa o leitor configurado como o próprio root — fail-closed, sem fallback', () => {
        expect(credencialDeAssinatura({ ...base, MINIO_PRESIGN_USER: 'raiz' })).toBeNull();
    });

    it.each(['MINIO_PRESIGN_USER', 'MINIO_PRESIGN_PASSWORD'])('recusa quando %s falta', (chave) => {
        expect(credencialDeAssinatura({ ...base, [chave]: '' })).toBeNull();
    });
});
