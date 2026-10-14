import path from 'node:path';
import { fileURLToPath } from 'node:url';

const openapiPackagePath = fileURLToPath(new URL('.', import.meta.resolve('stalemate-openapi')));

export const OPENAPI_PATH = path.join(openapiPackagePath, 'openapi3.yaml');
