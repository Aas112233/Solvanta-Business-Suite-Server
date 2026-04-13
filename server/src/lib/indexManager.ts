import { basePrisma } from './prisma.js';
import { env } from '../config/env.js';
import { logger } from './logger.js';
import { MongoClient, Db } from 'mongodb';

/**
 * Ensure MongoDB indexes exist for optimal query performance.
 * Called once on server startup.
 *
 * Index Categories:
 * 1. CRITICAL - Must have for core performance
 * 2. IMPORTANT - Should have for moderate usage
 * 3. OPTIONAL - Add when data grows
 */
export async function ensureDatabaseIndexes() {
    let mongoClient: MongoClient | null = null;
    let db: Db | null = null;

    try {
        logger.info('Checking database indexes...');

        // Create a MongoDB connection for index management
        // Prisma doesn't expose the native MongoDB client, so we need a direct connection
        mongoClient = new MongoClient(env.DATABASE_URL);
        await mongoClient.connect();
        db = mongoClient.db();

        // Extract collection names from Prisma models
        const collections = db.listCollections();

        // ═══════════════════════════════════════════════════════════
        // CRITICAL INDEXES (Highest impact, most frequent queries)
        // ═══════════════════════════════════════════════════════════

        logger.info('Creating CRITICAL indexes...');

        // 1. POSInvoice - Main listing with filters
        await safeCreateIndex(db, 'posInvoices', 'idx_pos_invoice_company_branch_status_createdat',
            { companyId: 1, branchId: 1, status: 1, createdAt: 1 });

        // 2. POSInvoice - Posted invoice aggregations for reports
        await safeCreateIndex(db, 'posInvoices', 'idx_pos_invoice_company_posted_status_createdat',
            { companyId: 1, isPosted: 1, status: 1, createdAt: 1 });

        // 3. POSInvoice - Customer AR aging
        await safeCreateIndex(db, 'posInvoices', 'idx_pos_invoice_company_customer_status_createdat',
            { companyId: 1, customerId: 1, status: 1, createdAt: 1 });

        // 4. Product - Listing with search
        await safeCreateIndex(db, 'products', 'idx_product_company_deleted_status_name',
            { companyId: 1, deletedAt: 1, status: 1, name: 1 });

        // 5. AuditLog - Module usage analysis
        await safeCreateIndex(db, 'auditLogs', 'idx_auditlog_company_entity_createdat',
            { companyId: 1, entity: 1, createdAt: 1 });

        // 6. InventoryStock - Stock lookups
        await safeCreateIndex(db, 'inventoryStocks', 'idx_inventorystock_company_branch_product',
            { companyId: 1, branchId: 1, productId: 1 });

        // 7. Attendance - Daily attendance check
        await safeCreateIndex(db, 'attendances', 'idx_attendance_company_employee_date',
            { companyId: 1, employeeId: 1, date: 1 });

        // 8. POSShift - Active shift lookup
        await safeCreateIndex(db, 'pOSShifts', 'idx_posshift_company_terminal_status',
            { companyId: 1, terminalId: 1, status: 1 });

        // 9. BankTransaction - Reconciliation queries
        await safeCreateIndex(db, 'bankTransactions', 'idx_banktransaction_company_account_reconciled_date',
            { companyId: 1, bankAccountId: 1, isReconciled: 1, transactionDate: 1 });

        // ═══════════════════════════════════════════════════════════
        // IMPORTANT INDEXES (Moderate usage, should add soon)
        // ═══════════════════════════════════════════════════════════

        logger.info('Creating IMPORTANT indexes...');

        // 10. Product - Category/group browsing
        await safeCreateIndex(db, 'products', 'idx_product_company_category_group_status_deleted',
            { companyId: 1, categoryId: 1, itemGroupId: 1, status: 1, deletedAt: 1 });

        // 11. Product - Kind filtering
        await safeCreateIndex(db, 'products', 'idx_product_company_kind_status_deleted',
            { companyId: 1, kind: 1, status: 1, deletedAt: 1 });

        // 12. Customer - Listing with search
        await safeCreateIndex(db, 'customers', 'idx_customer_company_deleted_name',
            { companyId: 1, deletedAt: 1, name: 1 });

        // 13. Supplier - Listing with search
        await safeCreateIndex(db, 'suppliers', 'idx_supplier_company_deleted_name',
            { companyId: 1, deletedAt: 1, name: 1 });

        // 14. Employee - Branch-level listing
        await safeCreateIndex(db, 'employees', 'idx_employee_company_branch_status',
            { companyId: 1, branchId: 1, status: 1 });

        // 15. JournalEntryLine - Journal lookups
        await safeCreateIndex(db, 'journalEntryLines', 'idx_journalentryline_journal',
            { journalEntryId: 1 });

        // 16. GlobalString - Policy lookups
        await safeCreateIndex(db, 'globalStrings', 'idx_globalstring_company_group_systemkey',
            { companyId: 1, group: 1, systemKey: 1 });

        // 17. Expense - Branch-filtered reports
        await safeCreateIndex(db, 'expenses', 'idx_expense_company_branch_date',
            { companyId: 1, branchId: 1, date: 1 });

        // 18. EmployeeDocument - Employee documents
        await safeCreateIndex(db, 'employeeDocuments', 'idx_employeedocument_company_employee',
            { companyId: 1, employeeId: 1 });

        // 19. PurchaseInvoice - Branch listing
        await safeCreateIndex(db, 'purchaseInvoices', 'idx_purchaseinvoice_company_branch_createdat',
            { companyId: 1, branchId: 1, createdAt: 1 });

        // 20. CashCollectionBag - Branch tracking
        await safeCreateIndex(db, 'cashCollectionBags', 'idx_cashcollectionbag_company_status_branch',
            { companyId: 1, status: 1, branchId: 1 });

        // 21. POSInvoice - Loyalty history
        await safeCreateIndex(db, 'posInvoices', 'idx_pos_invoice_company_loyalty_createdat',
            { companyId: 1, loyaltyCustomerId: 1, createdAt: 1 });

        // 22. POSInvoice - Terminal sales
        await safeCreateIndex(db, 'posInvoices', 'idx_pos_invoice_company_terminal_createdat',
            { companyId: 1, posTerminalId: 1, createdAt: 1 });

        // 23. BankAccount - Branch accounts
        await safeCreateIndex(db, 'bankAccounts', 'idx_bankaccount_company_branch_active',
            { companyId: 1, branchId: 1, isActive: 1 });

        // 24. BankReconciliation - Status listing
        await safeCreateIndex(db, 'bankReconciliations', 'idx_bankreconciliation_company_status_createdat',
            { companyId: 1, status: 1, createdAt: 1 });

        // ═══════════════════════════════════════════════════════════
        // EXISTING INDEXES (Already in schema, ensure they exist)
        // ═══════════════════════════════════════════════════════════

        logger.info('Verifying existing indexes...');

        // Global Strings
        await safeCreateIndex(db, 'globalStrings', 'idx_globalstring_company_group_active',
            { companyId: 1, group: 1, isActive: 1 });

        // POS Terminals
        await safeCreateIndex(db, 'posTerminals', 'idx_posterminal_company_active_code',
            { companyId: 1, isActive: 1, code: 1 });

        // Users
        await safeCreateIndex(db, 'users', 'idx_users_company_active',
            { companyId: 1, isActive: 1 });

        await safeCreateIndex(db, 'users', 'idx_users_company_email_lastlogin',
            { companyId: 1, email: 1, lastLoginAt: 1 });

        // Roles
        await safeCreateIndex(db, 'roles', 'idx_role_company_name',
            { companyId: 1, name: 1 });

        // Price Groups - skip _id index (MongoDB creates it automatically)
        // await safeCreateIndex(db, 'priceGroups', 'idx_pricegroup_id',
        //     { _id: 1 });

        // Companies
        await safeCreateIndex(db, 'companies', 'idx_company_createdat',
            { createdAt: 1 });

        logger.info('✓ Database indexes verified/created successfully');
    } catch (error) {
        logger.warn('Failed to ensure database indexes:', error);
    } finally {
        // Close the MongoDB connection
        if (mongoClient) {
            await mongoClient.close();
        }
    }
}

/**
 * Safely create an index if it doesn't exist
 */
async function safeCreateIndex(
    db: Db,
    collectionName: string,
    indexName: string,
    keys: Record<string, 1 | -1>,
    options: Record<string, any> = {}
) {
    try {
        const collection = db.collection(collectionName);
        await collection.createIndex(
            keys,
            {
                name: indexName,
                background: true,
                ...options,
            }
        );
    } catch (error: any) {
        // Index already exists or name conflict - skip
        if (error?.code === 85 || error?.codeName === 'IndexOptionsConflict') {
            // Index exists, skip
        } else {
            throw error;
        }
    }
}
