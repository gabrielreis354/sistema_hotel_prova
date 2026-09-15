/**
 * Extrai o spec OpenAPI do backend para um openapi.json versionado.
 *
 * A fonte da verdade é `config/swagger.js` na raiz do repositório (swagger-jsdoc). Importamos
 * o export default (que já é o objeto do spec) e serializamos. O openapi-typescript roda em
 * cima deste JSON para gerar os tipos. Um campo que muda no backend vira erro de compilação
 * no frontend, em vez de `undefined` em produção.
 *
 * Requer Node 24 + node_modules da RAIZ (swagger-jsdoc). Rode a partir de frontend/ com o
 * nvm carregado.
 */
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
// scripts -> api-client -> packages -> frontend -> raiz do repo
const repoRoot = resolve(here, '../../../..');
const swaggerPath = resolve(repoRoot, 'config/swagger.js');
const outPath = resolve(here, '..', 'openapi.json');

const spec = (await import(swaggerPath)).default;

if (!spec || typeof spec !== 'object' || !spec.paths) {
  throw new Error(`Spec OpenAPI inválido importado de ${swaggerPath}`);
}

await writeFile(outPath, JSON.stringify(spec, null, 2) + '\n', 'utf8');
console.log(`openapi.json escrito (${Object.keys(spec.paths).length} paths) -> ${outPath}`);
