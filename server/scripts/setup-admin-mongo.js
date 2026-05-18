const { MongoClient, ObjectId } = require('mongodb');
const bcrypt = require('bcryptjs');

async function run() {
    const client = new MongoClient('mongodb://127.0.0.1:27017');
    await client.connect();
    const db = client.db('enterprise_erp');

    const companyId = new ObjectId();
    await db.collection('companies').insertOne({
        _id: companyId,
        name: 'Default Company',
        currency: 'SAR',
        settings: {},
        createdAt: new Date(),
        updatedAt: new Date()
    });

    const roleId = new ObjectId();
    const permissions = [
        "admin.manageUsers", "admin.manageRoles", "admin.manageSettings", "admin.manageBranches", "admin.viewAudit",
        "inventory.view", "inventory.adjust", "inventory.transfer", "inventory.reports",
        "pos.sell", "pos.refund", "pos.void", "pos.discount", "pos.reports",
        "purchase.create", "purchase.view", "purchase.approve", "purchase.reports",
        "accounting.view", "accounting.post", "accounting.closePeriod", "accounting.expense", "accounting.reports", "accounting.bank",
        "crm.view", "crm.edit", "crm.reports", "crm.delete",
        "product.view", "product.edit", "product.delete",
        "reports.view", "reports.export"
    ];
    await db.collection('roles').insertOne({
        _id: roleId,
        companyId: companyId,
        name: 'Platform Admin',
        permissions: permissions,
        createdAt: new Date(),
        updatedAt: new Date()
    });

    const branchId = new ObjectId();
    await db.collection('branches').insertOne({
        _id: branchId,
        companyId: companyId,
        name: 'Head Office',
        code: 'HQ',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
    });

    const userId = new ObjectId();
    const passwordHash = await bcrypt.hash('Solvanta@2026!', 12);
    await db.collection('users').insertOne({
        _id: userId,
        companyId: companyId,
        email: 'mhassantoha@gmail.com',
        name: 'Muhammad Hassantoha',
        passwordHash: passwordHash,
        roleId: roleId,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
    });

    await db.collection('user_branches').insertOne({
        _id: new ObjectId(),
        userId: userId,
        branchId: branchId
    });

    console.log('Super admin created directly via MongoDB.');
    await client.close();
}
run().catch(console.error);
