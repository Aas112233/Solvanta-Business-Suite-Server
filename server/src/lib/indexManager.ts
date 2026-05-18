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
export async function ensureDatabaseIndexes(options: { throwOnError?: boolean } = {}) {
    let mongoClient: MongoClient | null = null;
    let db: Db | null = null;

    try {
        logger.info('Checking database indexes...');

        // Create a MongoDB connection for index management
        // Prisma doesn't expose the native MongoDB client, so we need a direct connection
        mongoClient = new MongoClient(env.DATABASE_URL, {
            serverSelectionTimeoutMS: 10000, // 10 second timeout
            connectTimeoutMS: 10000,
        });

        await mongoClient.connect();
        db = mongoClient.db();

        logger.info('MongoDB connected for index management');

        // Extract collection names from Prisma models
        const collections = db.listCollections();

        // ═══════════════════════════════════════════════════════════
        // CRITICAL INDEXES (Highest impact, most frequent queries)
        // ═══════════════════════════════════════════════════════════

        logger.info('Creating CRITICAL indexes...');

        // 1. POSInvoice - Main listing with filters
        await safeCreateIndex(db, 'pos_invoices', 'idx_pos_invoice_company_branch_status_createdat',
            { companyId: 1, branchId: 1, status: 1, createdAt: 1 });

        // 2. POSInvoice - Posted invoice aggregations for reports
        await safeCreateIndex(db, 'pos_invoices', 'idx_pos_invoice_company_posted_status_createdat',
            { companyId: 1, isPosted: 1, status: 1, createdAt: 1 });

        // 3. POSInvoice - Customer AR aging
        await safeCreateIndex(db, 'pos_invoices', 'idx_pos_invoice_company_customer_status_createdat',
            { companyId: 1, customerId: 1, status: 1, createdAt: 1 });

        // 5. Product - Listing with search
        await safeCreateIndex(db, 'products', 'idx_product_company_deleted_status_name',
            { companyId: 1, deletedAt: 1, status: 1, name: 1 });

        // 5b. Product - name search
        await safeCreateIndex(db, 'products', 'idx_product_company_name_ci',
            { companyId: 1, name: 1 }, { collation: { locale: 'en', strength: 2 } });

        // 5c. Product - itemCode search
        await safeCreateIndex(db, 'products', 'idx_product_company_itemcode_ci',
            { companyId: 1, itemCode: 1 }, { collation: { locale: 'en', strength: 2 } });

        // 5d. Product - barcode search
        await safeCreateIndex(db, 'products', 'idx_product_company_barcodes_ci',
            { companyId: 1, barcodes: 1 }, { collation: { locale: 'en', strength: 2 } });

        // 5. AuditLog - Module usage analysis
        await safeCreateIndex(db, 'audit_logs', 'idx_auditlog_company_entity_createdat',
            { companyId: 1, entity: 1, createdAt: 1 });

        // 6. InventoryStock - Stock lookups
        await safeCreateIndex(db, 'inventory_stocks', 'idx_inventorystock_company_branch_product',
            { companyId: 1, branchId: 1, productId: 1 });

        // 7. Attendance - Daily attendance check
        await safeCreateIndex(db, 'hr_attendance', 'idx_attendance_company_employee_date',
            { companyId: 1, employeeId: 1, date: 1 });

        // 8. POSShift - Active shift lookup
        await safeCreateIndex(db, 'pos_shifts', 'idx_posshift_company_terminal_status',
            { companyId: 1, terminalId: 1, status: 1 });

        // 9. BankTransaction - Reconciliation queries
        await safeCreateIndex(db, 'bank_transactions', 'idx_banktransaction_company_account_reconciled_date',
            { companyId: 1, bankAccountId: 1, isReconciled: 1, transactionDate: 1 });

        // ═══════════════════════════════════════════════════════════
        // DASHBOARD & ANALYTICS INDEXES (Time series and aggregations)
        // ═══════════════════════════════════════════════════════════

        logger.info('Creating DASHBOARD indexes...');

        // Purchase Invoices - Dashboard time range aggregations
        await safeCreateIndex(db, 'purchase_invoices', 'idx_purchaseinvoice_company_createdat',
            { companyId: 1, createdAt: -1 });

        // POS Invoices - Dashboard time range aggregations and sort
        await safeCreateIndex(db, 'pos_invoices', 'idx_pos_invoice_company_createdat_status',
            { companyId: 1, createdAt: -1, status: 1 });

        // POS Shifts - Dashboard time range aggregations
        await safeCreateIndex(db, 'pos_shifts', 'idx_posshift_company_createdat',
            { companyId: 1, createdAt: -1 });

        // Inventory Stocks - Dashboard low stock alerts
        await safeCreateIndex(db, 'inventory_stocks', 'idx_inventorystock_company_qtyonhand',
            { companyId: 1, qtyOnHand: 1 });

        // Products - Dashboard active count
        await safeCreateIndex(db, 'products', 'idx_product_company_status_deleted',
            { companyId: 1, status: 1, deletedAt: 1 });

        // Customers - Dashboard count
        await safeCreateIndex(db, 'customers', 'idx_customer_company_deleted',
            { companyId: 1, deletedAt: 1 });

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
        await safeCreateIndex(db, 'hr_employees', 'idx_employee_company_branch_status',
            { companyId: 1, branchId: 1, status: 1 });

        // 15. JournalEntryLine - Journal lookups
        await safeCreateIndex(db, 'journal_entry_lines', 'idx_journalentryline_journal',
            { journalEntryId: 1 });

        // 16. GlobalString - Policy lookups
        await safeCreateIndex(db, 'global_strings', 'idx_globalstring_company_group_systemkey',
            { companyId: 1, group: 1, systemKey: 1 });

        // 17. Expense - Branch-filtered reports
        await safeCreateIndex(db, 'expenses', 'idx_expense_company_branch_date',
            { companyId: 1, branchId: 1, date: 1 });

        // 18. EmployeeDocument - Employee documents
        await safeCreateIndex(db, 'hr_employee_documents', 'idx_employeedocument_company_employee',
            { companyId: 1, employeeId: 1 });

        // 19. PurchaseInvoice - Branch listing
        await safeCreateIndex(db, 'purchase_invoices', 'idx_purchaseinvoice_company_branch_createdat',
            { companyId: 1, branchId: 1, createdAt: 1 });

        // 20. CashCollectionBag - Branch tracking
        await safeCreateIndex(db, 'cash_collection_bags', 'idx_cashcollectionbag_company_status_branch',
            { companyId: 1, status: 1, branchId: 1 });

        // 21. POSInvoice - Loyalty history
        await safeCreateIndex(db, 'pos_invoices', 'idx_pos_invoice_company_loyalty_createdat',
            { companyId: 1, loyaltyCustomerId: 1, createdAt: 1 });

        // 22. POSInvoice - Terminal sales
        await safeCreateIndex(db, 'pos_invoices', 'idx_pos_invoice_company_terminal_createdat',
            { companyId: 1, posTerminalId: 1, createdAt: 1 });

        // 23. BankAccount - Branch accounts
        await safeCreateIndex(db, 'bank_accounts', 'idx_bankaccount_company_branch_active',
            { companyId: 1, branchId: 1, isActive: 1 });

        // 24. BankReconciliation - Status listing
        await safeCreateIndex(db, 'bank_reconciliations', 'idx_bankreconciliation_company_status_createdat',
            { companyId: 1, status: 1, createdAt: 1 });

        // ═══════════════════════════════════════════════════════════
        // EXISTING INDEXES (Already in schema, ensure they exist)
        // ═══════════════════════════════════════════════════════════

        logger.info('Verifying existing indexes...');

        // Global Strings
        await safeCreateIndex(db, 'global_strings', 'idx_globalstring_company_group_active',
            { companyId: 1, group: 1, isActive: 1 });

        // POS Terminals
        await safeCreateIndex(db, 'pos_terminals', 'idx_posterminal_company_active_code',
            { companyId: 1, isActive: 1, code: 1 });

        // Users
        await safeCreateIndex(db, 'users', 'idx_users_company_active',
            { companyId: 1, isActive: 1 });

        await safeCreateIndex(db, 'users', 'idx_users_company_deleted_createdat',
            { companyId: 1, deletedAt: 1, createdAt: -1 });

        await safeCreateIndex(db, 'users', 'idx_users_company_email_lastlogin',
            { companyId: 1, email: 1, lastLoginAt: 1 });

        await safeCreateIndex(db, 'user_branches', 'idx_userbranches_user_branch',
            { userId: 1, branchId: 1 });

        await safeCreateIndex(db, 'user_branches', 'idx_userbranches_branch_user',
            { branchId: 1, userId: 1 });

        // Branches
        await safeCreateIndex(db, 'branches', 'idx_branch_company_name',
            { companyId: 1, name: 1 });

        await safeCreateIndex(db, 'branches', 'idx_branch_company_code',
            { companyId: 1, code: 1 });

        // Roles
        await safeCreateIndex(db, 'roles', 'idx_role_company_name',
            { companyId: 1, name: 1 });

        // Accounting
        await safeCreateIndex(db, 'accounts', 'idx_account_company_type_code',
            { companyId: 1, type: 1, code: 1 });

        await safeCreateIndex(db, 'account_mappings', 'idx_accountmapping_company_scope',
            { companyId: 1, mappingType: 1, entityType: 1, entityId: 1 });

        await safeCreateIndex(db, 'journal_entries', 'idx_journalentry_company_branch_date',
            { companyId: 1, branchId: 1, date: -1 });

        await safeCreateIndex(db, 'journal_entries', 'idx_journalentry_company_source',
            { companyId: 1, sourceType: 1, sourceId: 1 });

        await safeCreateIndex(db, 'journal_entry_lines', 'idx_journalentryline_company_account_date',
            { companyId: 1, accountId: 1, date: -1 });

        // Sales and POS
        await safeCreateIndex(db, 'pos_invoices', 'idx_pos_invoice_company_branch_posted_status_createdat',
            { companyId: 1, branchId: 1, isPosted: 1, status: 1, createdAt: -1 });

        await safeCreateIndex(db, 'pos_invoices', 'idx_pos_invoice_company_customer_posted_status_createdat',
            { companyId: 1, customerId: 1, isPosted: 1, status: 1, createdAt: -1 });

        await safeCreateIndex(db, 'pos_invoice_items', 'idx_posinvoiceitem_company_product_createdat',
            { companyId: 1, productId: 1, createdAt: -1 });

        await safeCreateIndex(db, 'sales_quotations', 'idx_salesquotation_company_status_createdat',
            { companyId: 1, status: 1, createdAt: -1 });

        await safeCreateIndex(db, 'sales_orders', 'idx_salesorder_company_status_createdat',
            { companyId: 1, status: 1, createdAt: -1 });

        await safeCreateIndex(db, 'sales_returns', 'idx_salesreturn_company_createdat',
            { companyId: 1, createdAt: -1 });

        // Purchases and payables
        await safeCreateIndex(db, 'purchase_invoices', 'idx_purchaseinvoice_company_supplier_createdat',
            { companyId: 1, supplierId: 1, createdAt: -1 });

        await safeCreateIndex(db, 'purchase_invoices', 'idx_purchaseinvoice_company_branch_status_createdat',
            { companyId: 1, branchId: 1, status: 1, createdAt: -1 });

        await safeCreateIndex(db, 'purchase_payments', 'idx_purchasepayment_company_supplier_status_createdat',
            { companyId: 1, supplierId: 1, status: 1, createdAt: -1 });

        await safeCreateIndex(db, 'purchase_returns', 'idx_purchasereturn_company_supplier_createdat',
            { companyId: 1, supplierId: 1, createdAt: -1 });

        // Inventory movement and valuation
        await safeCreateIndex(db, 'stock_movements', 'idx_stockmovement_company_product_createdat',
            { companyId: 1, productId: 1, createdAt: -1 });

        await safeCreateIndex(db, 'stock_movements', 'idx_stockmovement_company_branch_type_createdat',
            { companyId: 1, branchId: 1, type: 1, createdAt: -1 });

        await safeCreateIndex(db, 'stock_counts', 'idx_stockcount_company_branch_status_createdat',
            { companyId: 1, branchId: 1, status: 1, createdAt: -1 });

        // Expenses and analytics
        await safeCreateIndex(db, 'expenses', 'idx_expense_company_createdat',
            { companyId: 1, createdAt: -1 });

        await safeCreateIndex(db, 'expenses', 'idx_expense_company_category_createdat',
            { companyId: 1, category: 1, createdAt: -1 });

        // Price Groups - skip _id index (MongoDB creates it automatically)
        // await safeCreateIndex(db, 'price_groups', 'idx_pricegroup_id',
        //     { _id: 1 });

        // Companies
        await safeCreateIndex(db, 'companies', 'idx_company_createdat',
            { createdAt: 1 });

        logger.info('✓ Database indexes verified/created successfully');
    } catch (error) {
        logger.warn('Failed to ensure database indexes:', error);
        if (options.throwOnError) {
            throw error;
        }
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

