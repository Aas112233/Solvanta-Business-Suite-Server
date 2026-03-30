const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function normalizeInventory() {
    console.log('🚀 Starting Inventory Normalization...');

    try {
        // 1. Fetch all products with their units
        const products = await prisma.product.findMany({
            include: { units: true }
        });

        // 2. Fetch all inventory stocks
        const allStocks = await prisma.inventoryStock.findMany({});

        console.log(`📊 Found ${allStocks.length} total stock buckets.`);

        // 3. Group stocks by [branchId, productId]
        const groups = {};
        for (const stock of allStocks) {
            const key = `${stock.branchId}_${stock.productId}`;
            if (!groups[key]) groups[key] = [];
            groups[key].push(stock);
        }

        console.log(`📦 Grouped into ${Object.keys(groups).length} unique Product-Branch pairs.`);

        let totalDeletions = 0;
        let totalCreations = 0;

        // 4. Process each group
        for (const key of Object.keys(groups)) {
            const stockRecords = groups[key];
            const { productId, branchId, companyId } = stockRecords[0];

            const product = products.find(p => p.id === productId);
            if (!product) {
                console.warn(`⚠️  Product not found for ID: ${productId}. Skipping.`);
                continue;
            }

            const baseUnit = product.units.find(u => u.isBase);
            if (!baseUnit) {
                console.error(`❌ No base unit defined for product: ${product.name} (${product.itemCode}). Skipping.`);
                continue;
            }

            let totalBaseQty = 0;
            let totalValuation = 0;

            for (const record of stockRecords) {
                const unit = product.units.find(u => u.unitCode === record.unitCode);
                const multiplier = unit ? unit.qtyInBaseUnit : 1;

                const baseQty = record.qtyOnHand * multiplier;
                totalBaseQty += baseQty;
                // avgCost in DB is expected to be per base unit already based on InventoryService logic
                totalValuation += baseQty * record.avgCost;
            }

            const finalAvgCost = totalBaseQty > 0 ? (totalValuation / totalBaseQty) : 0;

            console.log(`🛠️  Normalizing ${product.name} at Branch ${branchId}:`);
            console.log(`   - Buckets merged: ${stockRecords.length}`);
            console.log(`   - Total Base Qty: ${totalBaseQty}`);
            console.log(`   - New Avg Cost: ${finalAvgCost}`);

            // 5. Atomic Update: Delete old and create new
            await prisma.$transaction(async (tx) => {
                // Delete all records in this group
                await tx.inventoryStock.deleteMany({
                    where: {
                        productId: productId,
                        branchId: branchId
                    }
                });

                // Create the single normalized bucket
                await tx.inventoryStock.create({
                    data: {
                        companyId,
                        branchId,
                        productId,
                        unitCode: baseUnit.unitCode,
                        qtyOnHand: totalBaseQty,
                        avgCost: finalAvgCost,
                        minStock: stockRecords[0].minStock, // Preserve settings from first record
                        maxStock: stockRecords[0].maxStock
                    }
                });
            });

            totalDeletions += stockRecords.length;
            totalCreations += 1;
        }

        console.log('\n✅ Normalization Complete!');
        console.log(`   - Total buckets removed: ${totalDeletions}`);
        console.log(`   - Total buckets created: ${totalCreations}`);
        console.log(`   - Current Net Change: ${totalCreations - totalDeletions} records`);

    } catch (error) {
        console.error('❌ Error during normalization:', error);
    } finally {
        await prisma.$disconnect();
    }
}

normalizeInventory();
