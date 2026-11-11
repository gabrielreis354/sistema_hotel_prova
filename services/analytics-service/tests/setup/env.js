// setupFile: roda antes de cada arquivo de teste, no worker. O schema já foi criado pelo globalSetup.
import dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ quiet: true, path: resolve(process.cwd(), '.env.test'), override: true });
