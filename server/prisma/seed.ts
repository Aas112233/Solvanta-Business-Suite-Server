/// <reference types="node" />
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const generateDigits = (length: number) => {
    let result = '';
    for (let i = 0; i < length; i++) {
        result += Math.floor(Math.random() * 10).toString();
    }
    return result;
};


async function main() {
    console.log('Clearing database...');
    // Clear collections in reverse order of dependencies
    await prisma.inventoryStock.deleteMany();
    await prisma.stockMovement.deleteMany();
    await prisma.pOSInvoiceItem.deleteMany();
    await prisma.pOSInvoice.deleteMany();
    await prisma.salesReturnItem.deleteMany();
    await prisma.salesReturn.deleteMany();
    await prisma.purchaseInvoiceItem.deleteMany();
    await prisma.purchaseInvoice.deleteMany();
    await prisma.productUnit.deleteMany();
    await prisma.productPriceGroup.deleteMany();
    await prisma.product.deleteMany();
    await prisma.userBranch.deleteMany();
    await prisma.user.deleteMany();
    await prisma.role.deleteMany();
    await prisma.branch.deleteMany();
    await prisma.category.deleteMany();
    await prisma.brand.deleteMany();
    await prisma.priceGroup.deleteMany();
    await prisma.account.deleteMany();
    await prisma.company.deleteMany();

    console.log('Seeding database...');

    // ═══ COMPANY ═══
    const company = await prisma.company.create({
        data: {
            name: 'Al Baraka Trading Co.',
            vatNumber: '300000000000003',
            currency: 'SAR',
            settings: {
                nearExpiryDays: 30,
                lowStockThreshold: 10,
                invoicePrefix: 'INV',
                taxRate: 0.15,
            },
        },
    });
    console.log('Company created');

    // ═══ BRANCHES ═══
    const [mainBranch, riyadhBranch, jeddahBranch] = await Promise.all([
        prisma.branch.create({ data: { companyId: company.id, name: 'Main Warehouse', code: 'MW', address: 'Industrial Area, Riyadh', phone: '+966-11-1234567' } }),
        prisma.branch.create({ data: { companyId: company.id, name: 'Riyadh Retail', code: 'RR', address: 'Al Olaya St, Riyadh', phone: '+966-11-2345678' } }),
        prisma.branch.create({ data: { companyId: company.id, name: 'Jeddah Retail', code: 'JR', address: 'Tahlia St, Jeddah', phone: '+966-12-3456789' } }),
    ]);
    console.log('3 Branches created');

    // ═══ ROLES ═══
    const roles = await Promise.all([
        prisma.role.create({
            data: {
                companyId: company.id, name: 'Admin',
                permissions: [
                    'inventory.view', 'inventory.adjust', 'inventory.transfer', 'pos.sell', 'pos.refund', 'pos.void', 'pos.discount',
                    'purchase.create', 'purchase.view', 'accounting.view', 'accounting.post', 'accounting.closePeriod', 'accounting.expense',
                    'crm.view', 'crm.edit', 'product.view', 'product.edit', 'reports.view',
                    'admin.manageUsers', 'admin.manageRoles', 'admin.manageSettings', 'admin.manageBranches', 'admin.viewAudit',
                ],
            },
        }),
        prisma.role.create({
            data: {
                companyId: company.id, name: 'Branch Manager',
                permissions: [
                    'inventory.view', 'inventory.adjust', 'inventory.transfer', 'pos.sell', 'pos.refund', 'pos.void', 'pos.discount',
                    'purchase.create', 'purchase.view', 'accounting.view', 'accounting.expense',
                    'crm.view', 'crm.edit', 'product.view', 'product.edit', 'reports.view',
                ],
            },
        }),
        prisma.role.create({
            data: {
                companyId: company.id, name: 'Cashier',
                permissions: ['pos.sell', 'pos.discount', 'inventory.view', 'crm.view', 'product.view'],
            },
        }),
        prisma.role.create({
            data: {
                companyId: company.id, name: 'Accountant',
                permissions: [
                    'accounting.view', 'accounting.post', 'accounting.closePeriod', 'accounting.expense',
                    'crm.view', 'purchase.view', 'reports.view', 'product.view', 'inventory.view',
                ],
            },
        }),
        prisma.role.create({
            data: {
                companyId: company.id, name: 'Storekeeper',
                permissions: ['inventory.view', 'inventory.adjust', 'purchase.create', 'purchase.view', 'product.view'],
            },
        }),
    ]);
    console.log('5 Roles created');

    const [adminRole, managerRole, cashierRole, accountantRole, storekeeperRole] = roles;
    const passwordHash = await bcrypt.hash('Password123!', 12);

    // ═══ USERS ═══
    const users = await Promise.all([
        prisma.user.create({ data: { companyId: company.id, name: 'Ahmed Admin', email: 'admin@albaraka.com', passwordHash, roleId: adminRole.id, branches: { create: [{ branchId: mainBranch.id }, { branchId: riyadhBranch.id }, { branchId: jeddahBranch.id }] } } }),
        prisma.user.create({ data: { companyId: company.id, name: 'Khalid Manager', email: 'manager@albaraka.com', passwordHash, roleId: managerRole.id, branches: { create: [{ branchId: riyadhBranch.id }] } } }),
        prisma.user.create({ data: { companyId: company.id, name: 'Salem Cashier', email: 'cashier@albaraka.com', passwordHash, roleId: cashierRole.id, branches: { create: [{ branchId: riyadhBranch.id }] } } }),
        prisma.user.create({ data: { companyId: company.id, name: 'Nour Accountant', email: 'accountant@albaraka.com', passwordHash, roleId: accountantRole.id, branches: { create: [{ branchId: mainBranch.id }, { branchId: riyadhBranch.id }, { branchId: jeddahBranch.id }] } } }),
        prisma.user.create({ data: { companyId: company.id, name: 'Omar Storekeeper', email: 'storekeeper@albaraka.com', passwordHash, roleId: storekeeperRole.id, branches: { create: [{ branchId: mainBranch.id }] } } }),
    ]);
    console.log('5 Users created');

    // ═══ CATEGORIES ═══
    const categories = await Promise.all([
        prisma.category.create({ data: { companyId: company.id, name: 'Beverages' } }),
        prisma.category.create({ data: { companyId: company.id, name: 'Dairy' } }),
        prisma.category.create({ data: { companyId: company.id, name: 'Snacks' } }),
        prisma.category.create({ data: { companyId: company.id, name: 'Cleaning' } }),
        prisma.category.create({ data: { companyId: company.id, name: 'Grains & Rice' } }),
        prisma.category.create({ data: { companyId: company.id, name: 'Personal Care' } }),
    ]);
    console.log('6 Categories created');

    // ═══ BRANDS ═══
    const brands = await Promise.all([
        prisma.brand.create({ data: { companyId: company.id, name: 'Al Marai' } }),
        prisma.brand.create({ data: { companyId: company.id, name: 'Nadec' } }),
        prisma.brand.create({ data: { companyId: company.id, name: 'Al Safi' } }),
        prisma.brand.create({ data: { companyId: company.id, name: 'Tide' } }),
    ]);
    console.log('4 Brands created');

    // ═══ PRICE GROUPS ═══
    const priceGroups = await Promise.all([
        prisma.priceGroup.create({ data: { companyId: company.id, name: 'Retail' } }),
        prisma.priceGroup.create({ data: { companyId: company.id, name: 'Wholesale A' } }),
        prisma.priceGroup.create({ data: { companyId: company.id, name: 'Wholesale B' } }),
    ]);
    console.log('3 Price Groups created');

    // ═══ PRODUCTS (30) ═══
    const productData = [
        { name: 'Full Cream Milk 1L', code: 'P001', cat: 1, brand: 0, barcode: '6281048000011', sale: 7.5, cost: 5.5, expiry: true },
        { name: 'Low Fat Milk 1L', code: 'P002', cat: 1, brand: 0, barcode: '6281048000028', sale: 7.0, cost: 5.0, expiry: true },
        { name: 'Fresh Laban 2L', code: 'P003', cat: 1, brand: 1, barcode: '6281048000035', sale: 9.0, cost: 6.5, expiry: true },
        { name: 'Greek Yogurt 400g', code: 'P004', cat: 1, brand: 2, barcode: '6281048000042', sale: 12.0, cost: 8.0, expiry: true },
        { name: 'Cheddar Cheese 500g', code: 'P005', cat: 1, brand: 0, barcode: '6281048000059', sale: 25.0, cost: 18.0, expiry: true },
        { name: 'Orange Juice 1L', code: 'P006', cat: 0, brand: 1, barcode: '6281048000066', sale: 8.5, cost: 6.0, expiry: true },
        { name: 'Apple Juice 1L', code: 'P007', cat: 0, brand: 1, barcode: '6281048000073', sale: 8.5, cost: 6.0, expiry: true },
        { name: 'Mineral Water 500ml', code: 'P008', cat: 0, brand: null, barcode: '6281048000080', sale: 1.0, cost: 0.5, expiry: false },
        { name: 'Mineral Water 1.5L', code: 'P009', cat: 0, brand: null, barcode: '6281048000097', sale: 2.0, cost: 1.0, expiry: false },
        { name: 'Potato Chips Classic 160g', code: 'P010', cat: 2, brand: null, barcode: '6281048000104', sale: 6.0, cost: 4.0, expiry: true },
        { name: 'Potato Chips BBQ 160g', code: 'P011', cat: 2, brand: null, barcode: '6281048000111', sale: 6.0, cost: 4.0, expiry: true },
        { name: 'Chocolate Cookies 200g', code: 'P012', cat: 2, brand: null, barcode: '6281048000128', sale: 8.0, cost: 5.5, expiry: true },
        { name: 'Cream Biscuits 300g', code: 'P013', cat: 2, brand: null, barcode: '6281048000135', sale: 5.0, cost: 3.0, expiry: true },
        { name: 'Dish Soap 750ml', code: 'P014', cat: 3, brand: 3, barcode: '6281048000142', sale: 9.0, cost: 6.0, expiry: false },
        { name: 'Laundry Detergent 3kg', code: 'P015', cat: 3, brand: 3, barcode: '6281048000159', sale: 35.0, cost: 25.0, expiry: false },
        { name: 'Surface Cleaner 1L', code: 'P016', cat: 3, brand: null, barcode: '6281048000166', sale: 12.0, cost: 8.0, expiry: false },
        { name: 'Toilet Cleaner 750ml', code: 'P017', cat: 3, brand: null, barcode: '6281048000173', sale: 8.0, cost: 5.0, expiry: false },
        { name: 'Basmati Rice 5kg', code: 'P018', cat: 4, brand: null, barcode: '6281048000180', sale: 45.0, cost: 32.0, expiry: false },
        { name: 'Egyptian Rice 2kg', code: 'P019', cat: 4, brand: null, barcode: '6281048000197', sale: 15.0, cost: 10.0, expiry: false },
        { name: 'White Sugar 1kg', code: 'P020', cat: 4, brand: null, barcode: '6281048000204', sale: 6.0, cost: 4.0, expiry: false },
        { name: 'Flour All Purpose 2kg', code: 'P021', cat: 4, brand: null, barcode: '6281048000211', sale: 8.0, cost: 5.0, expiry: false },
        { name: 'Vegetable Oil 1.5L', code: 'P022', cat: 4, brand: null, barcode: '6281048000228', sale: 16.0, cost: 11.0, expiry: true },
        { name: 'Shampoo 400ml', code: 'P023', cat: 5, brand: null, barcode: '6281048000235', sale: 22.0, cost: 15.0, expiry: false },
        { name: 'Soap Bar 125g', code: 'P024', cat: 5, brand: null, barcode: '6281048000242', sale: 5.0, cost: 3.0, expiry: false },
        { name: 'Toothpaste 100ml', code: 'P025', cat: 5, brand: null, barcode: '6281048000259', sale: 12.0, cost: 8.0, expiry: true },
        { name: 'Hand Sanitizer 500ml', code: 'P026', cat: 5, brand: null, barcode: '6281048000266', sale: 15.0, cost: 10.0, expiry: true },
        { name: 'Tissue Box 200 sheets', code: 'P027', cat: 5, brand: null, barcode: '6281048000273', sale: 8.0, cost: 5.0, expiry: false },
        { name: 'Instant Coffee 200g', code: 'P028', cat: 0, brand: null, barcode: '6281048000280', sale: 28.0, cost: 20.0, expiry: true },
        { name: 'Tea Bags 100 pcs', code: 'P029', cat: 0, brand: null, barcode: '6281048000297', sale: 18.0, cost: 12.0, expiry: true },
        { name: 'Honey Natural 500g', code: 'P030', cat: 0, brand: null, barcode: '6281048000303', sale: 45.0, cost: 30.0, expiry: true },
    ];

    const products = [];
    for (const p of productData) {
        try {
            const itemCode = generateDigits(16);
            const pieceBarcode = generateDigits(13);
            const cartonBarcode = generateDigits(13);

            const product = await prisma.product.create({
                data: {
                    companyId: company.id,
                    itemCode: itemCode,
                    name: p.name,
                    categoryId: categories[p.cat].id,
                    brandId: p.brand !== null ? brands[p.brand].id : null,
                    barcodes: [pieceBarcode, cartonBarcode],                    taxRate: 0.15,
                    units: {
                        create: [
                            {
                                unitName: 'Piece',
                                unitCode: pieceBarcode, // unitCode is now the numeric barcode
                                qtyInBaseUnit: 1,
                                salePrice: p.sale,
                                costPrice: p.cost,
                                barcode: pieceBarcode,
                                isDefaultSaleUnit: true,
                                isBase: true
                            },
                            {
                                unitName: 'Carton',
                                unitCode: cartonBarcode, // unitCode is now the numeric barcode
                                qtyInBaseUnit: 12,
                                salePrice: p.sale * 11,
                                costPrice: p.cost * 11,
                                barcode: cartonBarcode
                            },
                        ],
                    },
                },
            });
            products.push(product);
        } catch (err: any) {
            console.error(`Failed to create product ${p.code}:`, err.message);
            throw err;
        }
    }
    console.log('30 Products created with units');

    // ═══ CUSTOMERS (20) ═══
    const customerNames = [
        'Abdullah Trading', 'Riyadh Supermarket', 'Al Nour Grocery', 'Jeddah Wholesale', 'Medina Mart',
        'SASCO Trading', 'Four Seasons Market', 'Al Raya Group', 'Star Mart', 'Golden Gate Store',
        'Saeed & Sons', 'Al Ahsa Trading', 'Dammam Supplies', 'Khobar Market', 'Tabuk Groceries',
        'Jubail Trading Co', 'Abha Fresh Market', 'Najran Wholesale', 'Hail Supplies', 'Yanbu Groceries',
    ];
    for (let i = 0; i < 20; i++) {
        await prisma.customer.create({
            data: {
                companyId: company.id,
                customerCode: `C${String(i + 1).padStart(3, '0')}`,
                name: customerNames[i],
                phone: `+966-5${String(Math.floor(Math.random() * 100000000)).padStart(8, '0')}`,
                creditLimit: [0, 5000, 10000, 20000, 50000][Math.floor(Math.random() * 5)],
                priceGroupId: priceGroups[i % 3].id,
            },
        });
    }
    console.log('20 Customers created');

    // ═══ SUPPLIERS (10) ═══
    const supplierNames = [
        'Al Marai Company', 'Nadec LLC', 'Al Safi Danone', 'P&G Arabia', 'Unilever KSA',
        'National Food Industries', 'Albaik Supplies', 'Saudi Packaging', 'Gulf Grains Co', 'Arabian Agriculture',
    ];
    for (let i = 0; i < 10; i++) {
        await prisma.supplier.create({
            data: {
                companyId: company.id,
                supplierCode: `S${String(i + 1).padStart(3, '0')}`,
                name: supplierNames[i],
                phone: `+966-1${String(Math.floor(Math.random() * 10000000)).padStart(7, '0')}`,
                vatNumber: `30000000000${String(i + 10)}`,
            },
        });
    }
    console.log('10 Suppliers created');

    // ═══ CHART OF ACCOUNTS ═══
    const accts = await Promise.all([
        prisma.account.create({ data: { companyId: company.id, code: '1100', name: 'Cash', type: 'ASSET', isSystem: true } }),
        prisma.account.create({ data: { companyId: company.id, code: '1110', name: 'Accounts Receivable', type: 'ASSET', isSystem: true } }),
        prisma.account.create({ data: { companyId: company.id, code: '1200', name: 'Bank Account', type: 'ASSET', isSystem: true } }),
        prisma.account.create({ data: { companyId: company.id, code: '1300', name: 'Inventory', type: 'ASSET', isSystem: true } }),
        prisma.account.create({ data: { companyId: company.id, code: '1400', name: 'VAT Input', type: 'ASSET', isSystem: true } }),
        prisma.account.create({ data: { companyId: company.id, code: '2100', name: 'Accounts Payable', type: 'LIABILITY', isSystem: true } }),
        prisma.account.create({ data: { companyId: company.id, code: '2200', name: 'VAT Payable', type: 'LIABILITY', isSystem: true } }),
        prisma.account.create({ data: { companyId: company.id, code: '3100', name: 'Owner Equity', type: 'EQUITY', isSystem: true } }),
        prisma.account.create({ data: { companyId: company.id, code: '3200', name: 'Retained Earnings', type: 'EQUITY', isSystem: true } }),
        prisma.account.create({ data: { companyId: company.id, code: '4100', name: 'Sales Revenue', type: 'REVENUE', isSystem: true } }),
        prisma.account.create({ data: { companyId: company.id, code: '4200', name: 'Other Income', type: 'REVENUE', isSystem: true } }),
        prisma.account.create({ data: { companyId: company.id, code: '5100', name: 'General Expenses', type: 'EXPENSE', isSystem: true } }),
        prisma.account.create({ data: { companyId: company.id, code: '5200', name: 'Rent Expense', type: 'EXPENSE', isSystem: true } }),
        prisma.account.create({ data: { companyId: company.id, code: '5300', name: 'Salary Expense', type: 'EXPENSE', isSystem: true } }),
        prisma.account.create({ data: { companyId: company.id, code: '5400', name: 'Cost of Goods Sold', type: 'EXPENSE', isSystem: true } }),
        prisma.account.create({ data: { companyId: company.id, code: '5500', name: 'Utilities Expense', type: 'EXPENSE', isSystem: true } }),
    ]);
    console.log('16 Accounts created');

    // ═══ SEED INVENTORY (stock in main warehouse) ═══
    for (const product of products) {
        // Find the base unit ('Piece') to get its unitCode/barcode
        const unit = await prisma.productUnit.findFirst({
            where: {
                productId: product.id,
                unitName: 'Piece'
            }
        });
        if (!unit) continue;

        const qty = Math.floor(Math.random() * 200) + 50;
        const expDate = product.trackExpiry
            ? new Date(Date.now() + (Math.floor(Math.random() * 180) + 30) * 24 * 60 * 60 * 1000)
            : null;

        await prisma.inventoryStock.create({
            data: {
                companyId: company.id,
                branchId: mainBranch.id,
                productId: product.id,
                unitCode: unit.unitCode, // Using the barcode as the unitCode
                qtyOnHand: qty,
                avgCost: Number(unit.costPrice),
                expDate,
            },
        });

        // Also add some stock to Riyadh branch
        await prisma.inventoryStock.create({
            data: {
                companyId: company.id,
                branchId: riyadhBranch.id,
                productId: product.id,
                unitCode: unit.unitCode, // Using the barcode as the unitCode
                qtyOnHand: Math.floor(qty * 0.5),
                avgCost: Number(unit.costPrice),
                expDate,
            },
        });
    }
    console.log('Inventory stock seeded for 2 branches');

    console.log('\nSeed complete!');
    console.log('\nLogin credentials (all passwords: Password123!):');
    console.log('  admin@albaraka.com      (Admin - all branches)');
    console.log('  manager@albaraka.com    (Branch Manager - Riyadh)');
    console.log('  cashier@albaraka.com    (Cashier - Riyadh)');
    console.log('  accountant@albaraka.com (Accountant - all branches)');
    console.log('  storekeeper@albaraka.com (Storekeeper - Main Warehouse)');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
