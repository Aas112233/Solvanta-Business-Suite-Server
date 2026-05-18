import { ensureDatabaseIndexes } from '../lib/indexManager.js';
import { logger } from '../lib/logger.js';

async function main() {
    await ensureDatabaseIndexes({ throwOnError: true });
}

main()
    .then(() => {
        logger.info('Database index sync completed');
        process.exit(0);
    })
    .catch((error) => {
        logger.error('Database index sync failed:', error);
        process.exit(1);
    });
