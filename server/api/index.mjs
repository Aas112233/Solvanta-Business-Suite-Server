import { app } from '../dist/app.js';
import { basePrisma } from '../dist/lib/prisma.js';

let prismaReady;

function ensureDatabaseConnection() {
    if (!prismaReady) {
        prismaReady = basePrisma.$connect().catch((error) => {
            prismaReady = undefined;
            throw error;
        });
    }

    return prismaReady;
}

export default async (req, res) => {
    await ensureDatabaseConnection();
    return app(req, res);
};
