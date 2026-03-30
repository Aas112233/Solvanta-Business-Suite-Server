import { PrismaClient } from '@prisma/client';
import fs from 'fs';
const prisma = new PrismaClient();

async function main() {
    const invoice = await prisma.pOSInvoice.findFirst({
        where: { invoiceNo: 'MW-000031' },
        include: { items: true }
    });
    fs.writeFileSync('invoice_mw_000031.json', JSON.stringify(invoice, null, 2));
    console.log("Saved to invoice_mw_000031.json");
}

main().catch(console.error).finally(() => prisma.$disconnect());
