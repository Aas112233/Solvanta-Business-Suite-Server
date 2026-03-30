const { app } = require('../dist/app.js');
const { basePrisma } = require('../dist/lib/prisma.js');

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

module.exports = async (req, res) => {
    await ensureDatabaseConnection();
    return app(req, res);
};
