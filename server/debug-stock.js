const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
    try {
        const product = await prisma.product.findFirst({
            where: { name: { contains: 'Honey Natural 500g' } }
        });
        if (!product) {
            console.log('Product not found');
            return;
        }
        console.log('Product ID:', product.id);

        const branch = await prisma.branch.findFirst({
            where: { name: { contains: 'Main Warehouse' } }
        });
        if (!branch) {
            console.log('Branch not found');
            return;
        }
        console.log('Branch ID:', branch.id);

        const stocks = await prisma.inventoryStock.findMany({
            where: {
                productId: product.id,
                branchId: branch.id
            },
            include: {
                product: {
                    include: {
                        units: true
                    }
                }
            }
        });
        console.log('Stock Records:', JSON.stringify(stocks, null, 2));

        const allStocks = await prisma.inventoryStock.findMany({
            where: {
                productId: product.id
            },
            include: {
                branch: true
            }
        });
        console.log('All Branches Stock:', JSON.stringify(allStocks, null, 2));

    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}

run();
