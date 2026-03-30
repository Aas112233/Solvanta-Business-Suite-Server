const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.pOSInvoice.findMany({ where: { invoiceNo: 'MW-000028' }, include: { items: true } })
    .then(res => console.log(JSON.stringify(res, null, 2)))
    .finally(() => prisma.$disconnect());
