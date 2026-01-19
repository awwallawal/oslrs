import { app, logger } from './app.js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const port = process.env.PORT || 3000;

if (process.env.NODE_ENV !== 'test') {
  app.listen(port, () => {
    logger.info({ event: 'server_start', port });
  });
}
