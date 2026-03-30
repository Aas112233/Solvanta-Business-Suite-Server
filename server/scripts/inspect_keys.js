const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

prisma.pOSInvoice.findFirst({ where: { invoiceNo: 'MW-000031' } }).then(inv => {
    console.log(Object.keys(inv));
}).catch(console.error).finally(() => prisma.$disconnect());
