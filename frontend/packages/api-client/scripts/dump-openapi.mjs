/**
 * Extrai o spec OpenAPI do backend para um openapi.json versionado.
 *
 * A fonte da verdade é `services/core-service/config/swagger.js` (swagger-jsdoc). Importamos
 * o export default (que já é o objeto do spec) e serializamos. O openapi-typescript roda em
 * cima deste JSON para gerar os tipos. Um campo que muda no backend vira erro de compilação
 * no frontend, em vez de `undefined` em produção.
 *
 * Requer Node 24 e os node_modules do core-service (swagger-jsdoc), instalados em
 * `services/core-service/`. Rode a partir de frontend/ com o nvm carregado.
 */
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
// scripts -> api-client -> packages -> frontend -> raiz do repo
const repoRoot = resolve(here, '../../../..');
const swaggerPath = resolve(repoRoot, 'services/core-service/config/swagger.js');
// Indicadores (/analytics/*) são do analytics-service desde a T-01.4/H.3. O nginx serve os dois
// serviços na mesma origem, então o frontend continua com um cliente só: os paths do analytics
// entram no mesmo openapi.json. Objeto puro — não precisa dos node_modules do analytics.
const analyticsPath = resolve(repoRoot, 'services/analytics-service/config/openapi.js');
const outPath = resolve(here, '..', 'openapi.json');

const spec = (await import(swaggerPath)).default;
const analytics = (await import(analyticsPath)).default;

for (const [origem, s] of [[swaggerPath, spec], [analyticsPath, analytics]]) {
  if (!s || typeof s !== 'object' || !s.paths) {
    throw new Error(`Spec OpenAPI inválido importado de ${origem}`);
  }
}

// Caminho nos dois specs = dois serviços dizendo responder a mesma rota; o nginx só manda para um.
const repetidos = Object.keys(analytics.paths).filter((p) => p in spec.paths);
if (repetidos.length) {
  throw new Error(`Caminho documentado no core E no analytics: ${repetidos.join(', ')}`);
}
// Os do analytics entram antes do primeiro /analytics que ficou no core (internal-consumption),
// onde sempre estiveram — o arquivo gerado não muda de ordem à toa.
const merged = {};
let inseridos = false;
for (const [path, item] of Object.entries(spec.paths)) {
  if (!inseridos && path.startsWith('/analytics')) {
    Object.assign(merged, analytics.paths);
    inseridos = true;
  }
  merged[path] = item;
}
spec.paths = inseridos ? merged : { ...merged, ...analytics.paths };

await writeFile(outPath, JSON.stringify(spec, null, 2) + '\n', 'utf8');
console.log(`openapi.json escrito (${Object.keys(spec.paths).length} paths) -> ${outPath}`);
