// ═══════════════════════════════════════════════════════════════════
// SOLVANTA — Chart of Accounts Templates (6 Industry Templates)
// Professional-grade, IFRS-aligned, Saudi/Arabic business context
// ═══════════════════════════════════════════════════════════════════

import type { AccountMappingType } from '@prisma/client';

// ── Types ─────────────────────────────────────────────────────────

export interface CoaAccountTemplate {
  code: string;
  name: string;
  nameArabic: string;
  type: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';
  children?: CoaAccountTemplate[];
  isSystem?: boolean;
}

export interface MappingTemplate {
  mappingType: AccountMappingType;
  entityType: 'GLOBAL' | 'BRANCH' | 'PRODUCT' | 'CATEGORY' | 'CUSTOMER' | 'SUPPLIER';
  accountCode: string;
  description?: string;
}

export interface CoaTemplate {
  id: string;
  name: string;
  nameArabic: string;
  description: string;
  icon: string;
  accounts: CoaAccountTemplate[];
  mappings: MappingTemplate[];
}

// ── Helper ────────────────────────────────────────────────────────

export function getTemplateById(id: string): CoaTemplate | undefined {
  return COA_TEMPLATES.find((t) => t.id === id);
}

// ═══════════════════════════════════════════════════════════════════
// TEMPLATE 1 — General Retail & Wholesale
// ═══════════════════════════════════════════════════════════════════

const GENERAL_RETAIL: CoaTemplate = {
  id: 'general-retail',
  name: 'General Retail & Wholesale',
  nameArabic: 'تجارة التجزئة والجملة العامة',
  description: 'Standard chart of accounts for merchandising businesses that buy and sell finished goods. Suitable for supermarkets, wholesalers, distributors, and general trading companies.',
  icon: '🛒',
  accounts: [
    // ── 1000 ASSETS ──
    {
      code: '1100', name: 'Current Assets', nameArabic: 'الأصول المتداولة', type: 'ASSET', children: [
        { code: '1110', name: 'Cash on Hand', nameArabic: 'الصندوق', type: 'ASSET', isSystem: true },
        { code: '1120', name: 'Cash at Bank', nameArabic: 'البنك', type: 'ASSET', isSystem: true },
        { code: '1130', name: 'Accounts Receivable', nameArabic: 'ذمم العملاء', type: 'ASSET', isSystem: true },
        { code: '1135', name: 'Allowance for Doubtful Debts', nameArabic: 'مخصص ديون مشكوك فيها', type: 'ASSET' },
        { code: '1140', name: 'Inventory', nameArabic: 'المخزون', type: 'ASSET', isSystem: true },
        { code: '1145', name: 'Inventory in Transit', nameArabic: 'مخزون قيد النقل', type: 'ASSET' },
        { code: '1150', name: 'Prepaid Expenses', nameArabic: 'مصاريف مدفوعة مقدماً', type: 'ASSET' },
        { code: '1160', name: 'Advances to Suppliers', nameArabic: 'دفعات مقدمة للموردين', type: 'ASSET' },
        { code: '1170', name: 'VAT Receivable', nameArabic: 'ضريبة القيمة المضافة المستحقة', type: 'ASSET' },
        { code: '1180', name: 'Employee Advances', nameArabic: 'سلف الموظفين', type: 'ASSET' },
        { code: '1190', name: 'Other Current Assets', nameArabic: 'أصول متداولة أخرى', type: 'ASSET' },
      ]
    },
    {
      code: '1200', name: 'Non-Current Assets', nameArabic: 'الأصول غير المتداولة', type: 'ASSET', children: [
        { code: '1210', name: 'Furniture & Fixtures', nameArabic: 'أثاث وتجهيزات', type: 'ASSET' },
        { code: '1211', name: 'Accum. Depr. — Furniture', nameArabic: 'مجمع إهلاك الأثاث', type: 'ASSET' },
        { code: '1220', name: 'Office Equipment', nameArabic: 'معدات مكتبية', type: 'ASSET' },
        { code: '1221', name: 'Accum. Depr. — Office Equipment', nameArabic: 'مجمع إهلاك المعدات المكتبية', type: 'ASSET' },
        { code: '1230', name: 'Vehicles', nameArabic: 'مركبات', type: 'ASSET' },
        { code: '1231', name: 'Accum. Depr. — Vehicles', nameArabic: 'مجمع إهلاك المركبات', type: 'ASSET' },
        { code: '1240', name: 'Buildings', nameArabic: 'مبانٍ', type: 'ASSET' },
        { code: '1241', name: 'Accum. Depr. — Buildings', nameArabic: 'مجمع إهلاك المباني', type: 'ASSET' },
        { code: '1280', name: 'Intangible Assets', nameArabic: 'أصول غير ملموسة', type: 'ASSET' },
        { code: '1290', name: 'Investments', nameArabic: 'استثمارات', type: 'ASSET' },
      ]
    },
    // ── 2000 LIABILITIES ──
    {
      code: '2100', name: 'Current Liabilities', nameArabic: 'الخصوم المتداولة', type: 'LIABILITY', children: [
        { code: '2110', name: 'Accounts Payable', nameArabic: 'ذمم الموردين', type: 'LIABILITY', isSystem: true },
        { code: '2120', name: 'VAT Payable — Output', nameArabic: 'ضريبة القيمة المضافة — المخرجات', type: 'LIABILITY', isSystem: true },
        { code: '2130', name: 'VAT Payable — Input', nameArabic: 'ضريبة القيمة المضافة — المدخلات', type: 'LIABILITY', isSystem: true },
        { code: '2140', name: 'Salary Payable', nameArabic: 'رواتب مستحقة', type: 'LIABILITY' },
        { code: '2150', name: 'Accrued Expenses', nameArabic: 'مصاريف مستحقة', type: 'LIABILITY' },
        { code: '2160', name: 'GOSI Payable', nameArabic: 'مستحقات التأمينات الاجتماعية', type: 'LIABILITY' },
        { code: '2170', name: 'Zakat Provision', nameArabic: 'مخصص الزكاة', type: 'LIABILITY' },
        { code: '2180', name: 'Customer Deposits', nameArabic: 'ودائع العملاء', type: 'LIABILITY' },
        { code: '2190', name: 'Other Current Liabilities', nameArabic: 'خصوم متداولة أخرى', type: 'LIABILITY' },
      ]
    },
    {
      code: '2200', name: 'Non-Current Liabilities', nameArabic: 'الخصوم غير المتداولة', type: 'LIABILITY', children: [
        { code: '2210', name: 'Bank Loans — Long Term', nameArabic: 'قروض بنكية — طويلة الأجل', type: 'LIABILITY' },
        { code: '2220', name: 'Lease Liabilities', nameArabic: 'التزامات إيجار', type: 'LIABILITY' },
        { code: '2230', name: 'End of Service Provision', nameArabic: 'مخصص مكافأة نهاية الخدمة', type: 'LIABILITY' },
      ]
    },
    // ── 3000 EQUITY ──
    {
      code: '3100', name: 'Shareholders\' Equity', nameArabic: 'حقوق المساهمين', type: 'EQUITY', children: [
        { code: '3110', name: 'Share Capital', nameArabic: 'رأس المال', type: 'EQUITY' },
        { code: '3120', name: 'Retained Earnings', nameArabic: 'الأرباح المحتجزة', type: 'EQUITY' },
        { code: '3130', name: 'Owner\'s Drawings', nameArabic: 'مسحوبات المالك', type: 'EQUITY' },
        { code: '3140', name: 'Current Year Profit/Loss', nameArabic: 'أرباح/خسائر العام الحالي', type: 'EQUITY' },
      ]
    },
    // ── 4000 REVENUE ──
    {
      code: '4100', name: 'Operating Revenue', nameArabic: 'الإيرادات التشغيلية', type: 'REVENUE', children: [
        { code: '4110', name: 'Sales Revenue — Goods', nameArabic: 'إيرادات مبيعات البضائع', type: 'REVENUE', isSystem: true },
        { code: '4120', name: 'Sales Revenue — Services', nameArabic: 'إيرادات مبيعات الخدمات', type: 'REVENUE' },
        { code: '4130', name: 'Shipping Revenue', nameArabic: 'إيرادات الشحن', type: 'REVENUE' },
        { code: '4140', name: 'Other Operating Revenue', nameArabic: 'إيرادات تشغيلية أخرى', type: 'REVENUE' },
      ]
    },
    {
      code: '4200', name: 'Revenue Contra Accounts', nameArabic: 'حسابات مقابلة للإيرادات', type: 'REVENUE', children: [
        { code: '4210', name: 'Sales Returns & Allowances', nameArabic: 'مرتجعات ومسموحات المبيعات', type: 'REVENUE', isSystem: true },
        { code: '4220', name: 'Sales Discount Given', nameArabic: 'خصم مسموح به', type: 'REVENUE', isSystem: true },
      ]
    },
    {
      code: '4300', name: 'Non-Operating Revenue', nameArabic: 'إيرادات غير تشغيلية', type: 'REVENUE', children: [
        { code: '4310', name: 'Interest Income', nameArabic: 'إيرادات فوائد', type: 'REVENUE' },
        { code: '4320', name: 'Foreign Exchange Gain', nameArabic: 'أرباح فروقات عملة', type: 'REVENUE' },
        { code: '4330', name: 'Discount Received', nameArabic: 'خصم مكتسب', type: 'REVENUE', isSystem: true },
      ]
    },
    // ── 5000 EXPENSES ──
    {
      code: '5100', name: 'Cost of Goods Sold', nameArabic: 'تكلفة البضاعة المباعة', type: 'EXPENSE', children: [
        { code: '5110', name: 'COGS — Purchases', nameArabic: 'تكلفة المشتريات', type: 'EXPENSE', isSystem: true },
        { code: '5120', name: 'Freight & Shipping In', nameArabic: 'مصاريف الشحن الوارد', type: 'EXPENSE' },
        { code: '5130', name: 'Inventory Shrinkage', nameArabic: 'عجز المخزون', type: 'EXPENSE', isSystem: true },
        { code: '5140', name: 'Damaged Goods', nameArabic: 'بضائع تالفة', type: 'EXPENSE', isSystem: true },
      ]
    },
    {
      code: '5200', name: 'Operating Expenses', nameArabic: 'المصاريف التشغيلية', type: 'EXPENSE', children: [
        { code: '5210', name: 'Salaries & Wages', nameArabic: 'رواتب وأجور', type: 'EXPENSE' },
        { code: '5220', name: 'GOSI — Employer Share', nameArabic: 'حصة صاحب العمل في التأمينات', type: 'EXPENSE' },
        { code: '5230', name: 'Rent Expense', nameArabic: 'مصاريف الإيجار', type: 'EXPENSE' },
        { code: '5240', name: 'Utilities', nameArabic: 'مرافق وكهرباء', type: 'EXPENSE' },
        { code: '5250', name: 'Marketing & Advertising', nameArabic: 'تسويق وإعلان', type: 'EXPENSE' },
        { code: '5260', name: 'Depreciation Expense', nameArabic: 'مصاريف الإهلاك', type: 'EXPENSE' },
        { code: '5270', name: 'Insurance Expense', nameArabic: 'مصاريف التأمين', type: 'EXPENSE' },
        { code: '5280', name: 'Maintenance & Repairs', nameArabic: 'صيانة وإصلاحات', type: 'EXPENSE' },
        { code: '5290', name: 'Travel & Transportation', nameArabic: 'سفر ونقل', type: 'EXPENSE' },
        { code: '5295', name: 'Office Supplies', nameArabic: 'لوازم مكتبية', type: 'EXPENSE' },
      ]
    },
    {
      code: '5300', name: 'Financial Expenses', nameArabic: 'مصاريف تمويلية', type: 'EXPENSE', children: [
        { code: '5310', name: 'Bank Charges', nameArabic: 'رسوم بنكية', type: 'EXPENSE' },
        { code: '5320', name: 'Interest Expense', nameArabic: 'مصاريف فوائد', type: 'EXPENSE' },
        { code: '5330', name: 'Foreign Exchange Loss', nameArabic: 'خسائر فروقات عملة', type: 'EXPENSE' },
        { code: '5340', name: 'Bad Debt Expense', nameArabic: 'مصاريف ديون معدومة', type: 'EXPENSE' },
        { code: '5350', name: 'Rounding Adjustments', nameArabic: 'تسويات التقريب', type: 'EXPENSE' },
      ]
    },
    {
      code: '5400', name: 'Other Expenses', nameArabic: 'مصاريف أخرى', type: 'EXPENSE', children: [
        { code: '5410', name: 'Zakat Expense', nameArabic: 'مصاريف الزكاة', type: 'EXPENSE' },
        { code: '5420', name: 'Penalties & Fines', nameArabic: 'غرامات ومخالفات', type: 'EXPENSE' },
        { code: '5430', name: 'Miscellaneous Expenses', nameArabic: 'مصاريف متنوعة', type: 'EXPENSE' },
      ]
    },
  ],
  mappings: [
    { mappingType: 'SALES_REVENUE' as AccountMappingType, entityType: 'GLOBAL', accountCode: '4110', description: 'Main goods sales revenue' },
    { mappingType: 'SERVICE_REVENUE' as AccountMappingType, entityType: 'GLOBAL', accountCode: '4120', description: 'Services revenue' },
    { mappingType: 'SALES_RETURN' as AccountMappingType, entityType: 'GLOBAL', accountCode: '4210', description: 'Sales returns' },
    { mappingType: 'INVENTORY_ASSET' as AccountMappingType, entityType: 'GLOBAL', accountCode: '1140', description: 'Inventory asset' },
    { mappingType: 'COGS_EXPENSE' as AccountMappingType, entityType: 'GLOBAL', accountCode: '5110', description: 'Cost of goods sold' },
    { mappingType: 'CASH' as AccountMappingType, entityType: 'GLOBAL', accountCode: '1110', description: 'Cash on hand' },
    { mappingType: 'BANK' as AccountMappingType, entityType: 'GLOBAL', accountCode: '1120', description: 'Bank accounts' },
    { mappingType: 'ACCOUNT_RECEIVABLE' as AccountMappingType, entityType: 'GLOBAL', accountCode: '1130', description: 'Trade receivables' },
    { mappingType: 'ACCOUNT_PAYABLE' as AccountMappingType, entityType: 'GLOBAL', accountCode: '2110', description: 'Trade payables' },
    { mappingType: 'OUTPUT_TAX' as AccountMappingType, entityType: 'GLOBAL', accountCode: '2120', description: 'VAT collected on sales' },
    { mappingType: 'INPUT_TAX' as AccountMappingType, entityType: 'GLOBAL', accountCode: '2130', description: 'VAT paid on purchases' },
    { mappingType: 'DISCOUNT_GIVEN' as AccountMappingType, entityType: 'GLOBAL', accountCode: '4220', description: 'Sales discounts' },
    { mappingType: 'DISCOUNT_RECEIVED' as AccountMappingType, entityType: 'GLOBAL', accountCode: '4330', description: 'Purchase discounts received' },
    { mappingType: 'SHRINKAGE_EXPENSE' as AccountMappingType, entityType: 'GLOBAL', accountCode: '5130', description: 'Inventory shrinkage' },
    { mappingType: 'DAMAGED_GOODS_EXPENSE' as AccountMappingType, entityType: 'GLOBAL', accountCode: '5140', description: 'Damaged inventory' },
    { mappingType: 'PURCHASE_FREIGHT' as AccountMappingType, entityType: 'GLOBAL', accountCode: '5120', description: 'Inbound freight' },
    { mappingType: 'SALES_SHIPPING_REVENUE' as AccountMappingType, entityType: 'GLOBAL', accountCode: '4130', description: 'Outbound shipping' },
    { mappingType: 'ROUNDING' as AccountMappingType, entityType: 'GLOBAL', accountCode: '5350', description: 'Rounding differences' },
  ],
};

// ═══════════════════════════════════════════════════════════════════
// TEMPLATE 2 — Manufacturing & Production
// ═══════════════════════════════════════════════════════════════════

const MANUFACTURING: CoaTemplate = {
  id: 'manufacturing',
  name: 'Manufacturing & Production',
  nameArabic: 'التصنيع والإنتاج',
  description: 'Chart of accounts for manufacturing companies with raw materials, work-in-progress, finished goods, BOM-based production, and variance tracking.',
  icon: '🏭',
  accounts: [
    {
      code: '1100', name: 'Current Assets', nameArabic: 'الأصول المتداولة', type: 'ASSET', children: [
        { code: '1110', name: 'Cash on Hand', nameArabic: 'الصندوق', type: 'ASSET', isSystem: true },
        { code: '1120', name: 'Cash at Bank', nameArabic: 'البنك', type: 'ASSET', isSystem: true },
        { code: '1130', name: 'Accounts Receivable', nameArabic: 'ذمم العملاء', type: 'ASSET', isSystem: true },
        { code: '1135', name: 'Allowance for Doubtful Debts', nameArabic: 'مخصص ديون مشكوك فيها', type: 'ASSET' },
        { code: '1140', name: 'Raw Materials Inventory', nameArabic: 'مخزون المواد الخام', type: 'ASSET', isSystem: true },
        { code: '1141', name: 'Work-in-Progress (WIP)', nameArabic: 'إنتاج تحت التشغيل', type: 'ASSET', isSystem: true },
        { code: '1142', name: 'Finished Goods Inventory', nameArabic: 'مخزون البضاعة الجاهزة', type: 'ASSET', isSystem: true },
        { code: '1143', name: 'Packing Materials', nameArabic: 'مواد التعبئة والتغليف', type: 'ASSET' },
        { code: '1145', name: 'Production Supplies', nameArabic: 'لوازم الإنتاج', type: 'ASSET' },
        { code: '1150', name: 'Prepaid Expenses', nameArabic: 'مصاريف مدفوعة مقدماً', type: 'ASSET' },
        { code: '1160', name: 'Advances to Suppliers', nameArabic: 'دفعات مقدمة للموردين', type: 'ASSET' },
        { code: '1170', name: 'VAT Receivable', nameArabic: 'ضريبة القيمة المضافة المستحقة', type: 'ASSET' },
      ]
    },
    {
      code: '1200', name: 'Non-Current Assets', nameArabic: 'الأصول غير المتداولة', type: 'ASSET', children: [
        { code: '1210', name: 'Plant & Machinery', nameArabic: 'آلات ومعدات المصنع', type: 'ASSET' },
        { code: '1211', name: 'Accum. Depr. — Machinery', nameArabic: 'مجمع إهلاك الآلات', type: 'ASSET' },
        { code: '1220', name: 'Factory Building', nameArabic: 'مبنى المصنع', type: 'ASSET' },
        { code: '1221', name: 'Accum. Depr. — Building', nameArabic: 'مجمع إهلاك المبنى', type: 'ASSET' },
        { code: '1230', name: 'Vehicles', nameArabic: 'مركبات', type: 'ASSET' },
        { code: '1231', name: 'Accum. Depr. — Vehicles', nameArabic: 'مجمع إهلاك المركبات', type: 'ASSET' },
        { code: '1240', name: 'Office Equipment', nameArabic: 'معدات مكتبية', type: 'ASSET' },
        { code: '1241', name: 'Accum. Depr. — Office Equipment', nameArabic: 'مجمع إهلاك المعدات المكتبية', type: 'ASSET' },
        { code: '1280', name: 'Intangible Assets', nameArabic: 'أصول غير ملموسة', type: 'ASSET' },
      ]
    },
    {
      code: '2100', name: 'Current Liabilities', nameArabic: 'الخصوم المتداولة', type: 'LIABILITY', children: [
        { code: '2110', name: 'Accounts Payable', nameArabic: 'ذمم الموردين', type: 'LIABILITY', isSystem: true },
        { code: '2120', name: 'VAT Payable — Output', nameArabic: 'ضريبة القيمة المضافة — المخرجات', type: 'LIABILITY', isSystem: true },
        { code: '2130', name: 'VAT Payable — Input', nameArabic: 'ضريبة القيمة المضافة — المدخلات', type: 'LIABILITY', isSystem: true },
        { code: '2140', name: 'Salary & Wages Payable', nameArabic: 'رواتب وأجور مستحقة', type: 'LIABILITY' },
        { code: '2150', name: 'Accrued Expenses', nameArabic: 'مصاريف مستحقة', type: 'LIABILITY' },
        { code: '2160', name: 'GOSI Payable', nameArabic: 'مستحقات التأمينات الاجتماعية', type: 'LIABILITY' },
        { code: '2170', name: 'Zakat Provision', nameArabic: 'مخصص الزكاة', type: 'LIABILITY' },
      ]
    },
    {
      code: '2200', name: 'Non-Current Liabilities', nameArabic: 'الخصوم غير المتداولة', type: 'LIABILITY', children: [
        { code: '2210', name: 'Bank Loans — Long Term', nameArabic: 'قروض بنكية — طويلة الأجل', type: 'LIABILITY' },
        { code: '2230', name: 'End of Service Provision', nameArabic: 'مخصص مكافأة نهاية الخدمة', type: 'LIABILITY' },
      ]
    },
    {
      code: '3100', name: 'Shareholders\' Equity', nameArabic: 'حقوق المساهمين', type: 'EQUITY', children: [
        { code: '3110', name: 'Share Capital', nameArabic: 'رأس المال', type: 'EQUITY' },
        { code: '3120', name: 'Retained Earnings', nameArabic: 'الأرباح المحتجزة', type: 'EQUITY' },
        { code: '3130', name: 'Owner\'s Drawings', nameArabic: 'مسحوبات المالك', type: 'EQUITY' },
        { code: '3140', name: 'Current Year Profit/Loss', nameArabic: 'أرباح/خسائر العام الحالي', type: 'EQUITY' },
      ]
    },
    {
      code: '4100', name: 'Operating Revenue', nameArabic: 'الإيرادات التشغيلية', type: 'REVENUE', children: [
        { code: '4110', name: 'Sales Revenue — Finished Goods', nameArabic: 'إيرادات مبيعات المنتجات', type: 'REVENUE', isSystem: true },
        { code: '4120', name: 'Scrap/Waste Sales', nameArabic: 'مبيعات المخلفات', type: 'REVENUE' },
        { code: '4130', name: 'Shipping Revenue', nameArabic: 'إيرادات الشحن', type: 'REVENUE' },
      ]
    },
    {
      code: '4200', name: 'Revenue Contra Accounts', nameArabic: 'حسابات مقابلة للإيرادات', type: 'REVENUE', children: [
        { code: '4210', name: 'Sales Returns', nameArabic: 'مرتجعات المبيعات', type: 'REVENUE', isSystem: true },
        { code: '4220', name: 'Sales Discount Given', nameArabic: 'خصم مسموح به', type: 'REVENUE', isSystem: true },
      ]
    },
    {
      code: '4300', name: 'Non-Operating Revenue', nameArabic: 'إيرادات غير تشغيلية', type: 'REVENUE', children: [
        { code: '4310', name: 'Interest Income', nameArabic: 'إيرادات فوائد', type: 'REVENUE' },
        { code: '4320', name: 'Foreign Exchange Gain', nameArabic: 'أرباح فروقات عملة', type: 'REVENUE' },
        { code: '4330', name: 'Discount Received', nameArabic: 'خصم مكتسب', type: 'REVENUE', isSystem: true },
      ]
    },
    {
      code: '5100', name: 'Cost of Goods Sold', nameArabic: 'تكلفة البضاعة المباعة', type: 'EXPENSE', children: [
        { code: '5110', name: 'COGS — Finished Goods', nameArabic: 'تكلفة المنتجات المباعة', type: 'EXPENSE', isSystem: true },
        { code: '5120', name: 'Production Variance', nameArabic: 'فروقات الإنتاج', type: 'EXPENSE', isSystem: true },
        { code: '5130', name: 'Inventory Shrinkage', nameArabic: 'عجز المخزون', type: 'EXPENSE', isSystem: true },
        { code: '5140', name: 'Damaged Inventory', nameArabic: 'بضائع تالفة', type: 'EXPENSE', isSystem: true },
      ]
    },
    {
      code: '5200', name: 'Manufacturing Overhead', nameArabic: 'تكاليف صناعية غير مباشرة', type: 'EXPENSE', children: [
        { code: '5210', name: 'Direct Labor', nameArabic: 'عمالة مباشرة', type: 'EXPENSE' },
        { code: '5220', name: 'Indirect Labor', nameArabic: 'عمالة غير مباشرة', type: 'EXPENSE' },
        { code: '5230', name: 'Factory Rent', nameArabic: 'إيجار المصنع', type: 'EXPENSE' },
        { code: '5240', name: 'Factory Utilities', nameArabic: 'مرافق المصنع', type: 'EXPENSE' },
        { code: '5250', name: 'Machine Repairs & Maintenance', nameArabic: 'إصلاح وصيانة الآلات', type: 'EXPENSE' },
        { code: '5260', name: 'Depreciation — Factory', nameArabic: 'إهلاك أصول المصنع', type: 'EXPENSE' },
        { code: '5270', name: 'Factory Insurance', nameArabic: 'تأمين المصنع', type: 'EXPENSE' },
        { code: '5280', name: 'Quality Control', nameArabic: 'رقابة الجودة', type: 'EXPENSE' },
      ]
    },
    {
      code: '5300', name: 'Selling & Admin Expenses', nameArabic: 'مصاريف بيعية وإدارية', type: 'EXPENSE', children: [
        { code: '5310', name: 'Salaries — Admin', nameArabic: 'رواتب إدارية', type: 'EXPENSE' },
        { code: '5320', name: 'GOSI — Employer Share', nameArabic: 'حصة صاحب العمل في التأمينات', type: 'EXPENSE' },
        { code: '5330', name: 'Marketing & Advertising', nameArabic: 'تسويق وإعلان', type: 'EXPENSE' },
        { code: '5340', name: 'Travel & Transportation', nameArabic: 'سفر ونقل', type: 'EXPENSE' },
        { code: '5350', name: 'Office Supplies', nameArabic: 'لوازم مكتبية', type: 'EXPENSE' },
        { code: '5360', name: 'Professional Fees', nameArabic: 'أتعاب مهنية', type: 'EXPENSE' },
      ]
    },
    {
      code: '5400', name: 'Financial & Other Expenses', nameArabic: 'مصاريف تمويلية وأخرى', type: 'EXPENSE', children: [
        { code: '5410', name: 'Bank Charges', nameArabic: 'رسوم بنكية', type: 'EXPENSE' },
        { code: '5420', name: 'Interest Expense', nameArabic: 'مصاريف فوائد', type: 'EXPENSE' },
        { code: '5430', name: 'Foreign Exchange Loss', nameArabic: 'خسائر فروقات عملة', type: 'EXPENSE' },
        { code: '5440', name: 'Bad Debt Expense', nameArabic: 'مصاريف ديون معدومة', type: 'EXPENSE' },
        { code: '5450', name: 'Rounding Adjustments', nameArabic: 'تسويات التقريب', type: 'EXPENSE' },
        { code: '5460', name: 'Zakat Expense', nameArabic: 'مصاريف الزكاة', type: 'EXPENSE' },
      ]
    },
  ],
  mappings: [
    { mappingType: 'SALES_REVENUE' as AccountMappingType, entityType: 'GLOBAL', accountCode: '4110', description: 'Finished goods sales' },
    { mappingType: 'SALES_RETURN' as AccountMappingType, entityType: 'GLOBAL', accountCode: '4210' },
    { mappingType: 'INVENTORY_ASSET' as AccountMappingType, entityType: 'GLOBAL', accountCode: '1142', description: 'Finished goods inventory' },
    { mappingType: 'WIP_ASSET' as AccountMappingType, entityType: 'GLOBAL', accountCode: '1141', description: 'Work-in-progress' },
    { mappingType: 'COGS_EXPENSE' as AccountMappingType, entityType: 'GLOBAL', accountCode: '5110' },
    { mappingType: 'PRODUCTION_VARIANCE' as AccountMappingType, entityType: 'GLOBAL', accountCode: '5120' },
    { mappingType: 'CASH' as AccountMappingType, entityType: 'GLOBAL', accountCode: '1110' },
    { mappingType: 'BANK' as AccountMappingType, entityType: 'GLOBAL', accountCode: '1120' },
    { mappingType: 'ACCOUNT_RECEIVABLE' as AccountMappingType, entityType: 'GLOBAL', accountCode: '1130' },
    { mappingType: 'ACCOUNT_PAYABLE' as AccountMappingType, entityType: 'GLOBAL', accountCode: '2110' },
    { mappingType: 'OUTPUT_TAX' as AccountMappingType, entityType: 'GLOBAL', accountCode: '2120' },
    { mappingType: 'INPUT_TAX' as AccountMappingType, entityType: 'GLOBAL', accountCode: '2130' },
    { mappingType: 'DISCOUNT_GIVEN' as AccountMappingType, entityType: 'GLOBAL', accountCode: '4220' },
    { mappingType: 'DISCOUNT_RECEIVED' as AccountMappingType, entityType: 'GLOBAL', accountCode: '4330' },
    { mappingType: 'SHRINKAGE_EXPENSE' as AccountMappingType, entityType: 'GLOBAL', accountCode: '5130' },
    { mappingType: 'DAMAGED_GOODS_EXPENSE' as AccountMappingType, entityType: 'GLOBAL', accountCode: '5140' },
    { mappingType: 'TRANSFER_IN_TRANSIT' as AccountMappingType, entityType: 'GLOBAL', accountCode: '1145' },
    { mappingType: 'ROUNDING' as AccountMappingType, entityType: 'GLOBAL', accountCode: '5450' },
  ],
};

// ═══════════════════════════════════════════════════════════════════
// TEMPLATE 3 — Professional Services
// ═══════════════════════════════════════════════════════════════════

const PROFESSIONAL_SERVICES: CoaTemplate = {
  id: 'professional-services',
  name: 'Professional Services',
  nameArabic: 'الخدمات المهنية',
  description: 'Chart of accounts for service-based businesses: consulting firms, law offices, accounting practices, IT services, marketing agencies, and healthcare clinics.',
  icon: '💼',
  accounts: [
    {
      code: '1100', name: 'Current Assets', nameArabic: 'الأصول المتداولة', type: 'ASSET', children: [
        { code: '1110', name: 'Cash on Hand', nameArabic: 'الصندوق', type: 'ASSET', isSystem: true },
        { code: '1120', name: 'Cash at Bank', nameArabic: 'البنك', type: 'ASSET', isSystem: true },
        { code: '1130', name: 'Accounts Receivable', nameArabic: 'ذمم العملاء', type: 'ASSET', isSystem: true },
        { code: '1135', name: 'Unbilled Revenue', nameArabic: 'إيرادات غير محررة', type: 'ASSET' },
        { code: '1140', name: 'Prepaid Expenses', nameArabic: 'مصاريف مدفوعة مقدماً', type: 'ASSET' },
        { code: '1150', name: 'VAT Receivable', nameArabic: 'ضريبة القيمة المضافة المستحقة', type: 'ASSET' },
        { code: '1160', name: 'Deposits Paid', nameArabic: 'تأمينات مدفوعة', type: 'ASSET' },
      ]
    },
    {
      code: '1200', name: 'Non-Current Assets', nameArabic: 'الأصول غير المتداولة', type: 'ASSET', children: [
        { code: '1210', name: 'Office Equipment', nameArabic: 'معدات مكتبية', type: 'ASSET' },
        { code: '1211', name: 'Accum. Depr. — Equipment', nameArabic: 'مجمع إهلاك المعدات', type: 'ASSET' },
        { code: '1220', name: 'Furniture & Fixtures', nameArabic: 'أثاث وتجهيزات', type: 'ASSET' },
        { code: '1221', name: 'Accum. Depr. — Furniture', nameArabic: 'مجمع إهلاك الأثاث', type: 'ASSET' },
        { code: '1230', name: 'Vehicles', nameArabic: 'مركبات', type: 'ASSET' },
        { code: '1231', name: 'Accum. Depr. — Vehicles', nameArabic: 'مجمع إهلاك المركبات', type: 'ASSET' },
        { code: '1280', name: 'Software Licenses', nameArabic: 'تراخيص برامج', type: 'ASSET' },
      ]
    },
    {
      code: '2100', name: 'Current Liabilities', nameArabic: 'الخصوم المتداولة', type: 'LIABILITY', children: [
        { code: '2110', name: 'Accounts Payable', nameArabic: 'ذمم الموردين', type: 'LIABILITY', isSystem: true },
        { code: '2120', name: 'VAT Payable — Output', nameArabic: 'ضريبة القيمة المضافة — المخرجات', type: 'LIABILITY', isSystem: true },
        { code: '2130', name: 'VAT Payable — Input', nameArabic: 'ضريبة القيمة المضافة — المدخلات', type: 'LIABILITY', isSystem: true },
        { code: '2140', name: 'Salary Payable', nameArabic: 'رواتب مستحقة', type: 'LIABILITY' },
        { code: '2150', name: 'Accrued Expenses', nameArabic: 'مصاريف مستحقة', type: 'LIABILITY' },
        { code: '2160', name: 'GOSI Payable', nameArabic: 'مستحقات التأمينات الاجتماعية', type: 'LIABILITY' },
        { code: '2170', name: 'Client Deposits/Retainers', nameArabic: 'ودائع/مقدمات العملاء', type: 'LIABILITY' },
        { code: '2180', name: 'Zakat Provision', nameArabic: 'مخصص الزكاة', type: 'LIABILITY' },
      ]
    },
    {
      code: '3100', name: 'Shareholders\' Equity', nameArabic: 'حقوق المساهمين', type: 'EQUITY', children: [
        { code: '3110', name: 'Share Capital', nameArabic: 'رأس المال', type: 'EQUITY' },
        { code: '3120', name: 'Retained Earnings', nameArabic: 'الأرباح المحتجزة', type: 'EQUITY' },
        { code: '3130', name: 'Owner\'s Drawings', nameArabic: 'مسحوبات المالك', type: 'EQUITY' },
        { code: '3140', name: 'Current Year Profit/Loss', nameArabic: 'أرباح/خسائر العام الحالي', type: 'EQUITY' },
      ]
    },
    {
      code: '4100', name: 'Service Revenue', nameArabic: 'إيرادات الخدمات', type: 'REVENUE', children: [
        { code: '4110', name: 'Professional Fees Revenue', nameArabic: 'إيرادات أتعاب مهنية', type: 'REVENUE', isSystem: true },
        { code: '4120', name: 'Consulting Revenue', nameArabic: 'إيرادات استشارات', type: 'REVENUE' },
        { code: '4130', name: 'Retainer Revenue', nameArabic: 'إيرادات عقود دورية', type: 'REVENUE' },
        { code: '4140', name: 'Reimbursable Expenses', nameArabic: 'مصاريف قابلة للاسترداد', type: 'REVENUE' },
        { code: '4150', name: 'Other Service Revenue', nameArabic: 'إيرادات خدمات أخرى', type: 'REVENUE' },
      ]
    },
    {
      code: '4200', name: 'Other Revenue', nameArabic: 'إيرادات أخرى', type: 'REVENUE', children: [
        { code: '4210', name: 'Interest Income', nameArabic: 'إيرادات فوائد', type: 'REVENUE' },
        { code: '4220', name: 'Foreign Exchange Gain', nameArabic: 'أرباح فروقات عملة', type: 'REVENUE' },
        { code: '4230', name: 'Discount Received', nameArabic: 'خصم مكتسب', type: 'REVENUE', isSystem: true },
      ]
    },
    {
      code: '5100', name: 'Direct Service Costs', nameArabic: 'تكاليف الخدمة المباشرة', type: 'EXPENSE', children: [
        { code: '5110', name: 'Professional Salaries', nameArabic: 'رواتب المهنيين', type: 'EXPENSE' },
        { code: '5120', name: 'Contractor/Subcontractor Fees', nameArabic: 'أتعاب مقاولين', type: 'EXPENSE' },
        { code: '5130', name: 'Software Subscriptions', nameArabic: 'اشتراكات برامج', type: 'EXPENSE' },
        { code: '5140', name: 'Professional Indemnity Insurance', nameArabic: 'تأمين المسؤولية المهنية', type: 'EXPENSE' },
      ]
    },
    {
      code: '5200', name: 'Operating Expenses', nameArabic: 'المصاريف التشغيلية', type: 'EXPENSE', children: [
        { code: '5210', name: 'Admin Salaries', nameArabic: 'رواتب إدارية', type: 'EXPENSE' },
        { code: '5220', name: 'GOSI — Employer Share', nameArabic: 'حصة صاحب العمل في التأمينات', type: 'EXPENSE' },
        { code: '5230', name: 'Office Rent', nameArabic: 'إيجار المكتب', type: 'EXPENSE' },
        { code: '5240', name: 'Utilities', nameArabic: 'مرافق وكهرباء', type: 'EXPENSE' },
        { code: '5250', name: 'Marketing & Advertising', nameArabic: 'تسويق وإعلان', type: 'EXPENSE' },
        { code: '5260', name: 'Depreciation', nameArabic: 'مصاريف الإهلاك', type: 'EXPENSE' },
        { code: '5270', name: 'Insurance', nameArabic: 'مصاريف التأمين', type: 'EXPENSE' },
        { code: '5280', name: 'Travel & Transportation', nameArabic: 'سفر ونقل', type: 'EXPENSE' },
        { code: '5290', name: 'Office Supplies', nameArabic: 'لوازم مكتبية', type: 'EXPENSE' },
        { code: '5295', name: 'Training & Development', nameArabic: 'تدريب وتطوير', type: 'EXPENSE' },
      ]
    },
    {
      code: '5300', name: 'Financial Expenses', nameArabic: 'مصاريف تمويلية', type: 'EXPENSE', children: [
        { code: '5310', name: 'Bank Charges', nameArabic: 'رسوم بنكية', type: 'EXPENSE' },
        { code: '5320', name: 'Interest Expense', nameArabic: 'مصاريف فوائد', type: 'EXPENSE' },
        { code: '5330', name: 'Foreign Exchange Loss', nameArabic: 'خسائر فروقات عملة', type: 'EXPENSE' },
        { code: '5340', name: 'Bad Debt Expense', nameArabic: 'مصاريف ديون معدومة', type: 'EXPENSE' },
        { code: '5350', name: 'Rounding Adjustments', nameArabic: 'تسويات التقريب', type: 'EXPENSE' },
        { code: '5360', name: 'Zakat Expense', nameArabic: 'مصاريف الزكاة', type: 'EXPENSE' },
      ]
    },
  ],
  mappings: [
    { mappingType: 'SALES_REVENUE' as AccountMappingType, entityType: 'GLOBAL', accountCode: '4110', description: 'Professional fees' },
    { mappingType: 'SERVICE_REVENUE' as AccountMappingType, entityType: 'GLOBAL', accountCode: '4110', description: 'Service revenue' },
    { mappingType: 'SERVICE_COST' as AccountMappingType, entityType: 'GLOBAL', accountCode: '5110', description: 'Direct service cost' },
    { mappingType: 'CASH' as AccountMappingType, entityType: 'GLOBAL', accountCode: '1110' },
    { mappingType: 'BANK' as AccountMappingType, entityType: 'GLOBAL', accountCode: '1120' },
    { mappingType: 'ACCOUNT_RECEIVABLE' as AccountMappingType, entityType: 'GLOBAL', accountCode: '1130' },
    { mappingType: 'ACCOUNT_PAYABLE' as AccountMappingType, entityType: 'GLOBAL', accountCode: '2110' },
    { mappingType: 'OUTPUT_TAX' as AccountMappingType, entityType: 'GLOBAL', accountCode: '2120' },
    { mappingType: 'INPUT_TAX' as AccountMappingType, entityType: 'GLOBAL', accountCode: '2130' },
    { mappingType: 'SALARY_EXPENSE' as AccountMappingType, entityType: 'GLOBAL', accountCode: '5210' },
    { mappingType: 'DISCOUNT_GIVEN' as AccountMappingType, entityType: 'GLOBAL', accountCode: '4230' },
    { mappingType: 'DISCOUNT_RECEIVED' as AccountMappingType, entityType: 'GLOBAL', accountCode: '4230' },
    { mappingType: 'ROUNDING' as AccountMappingType, entityType: 'GLOBAL', accountCode: '5350' },
  ],
};

// ═══════════════════════════════════════════════════════════════════
// TEMPLATE 4 — Restaurant & Food Service
// ═══════════════════════════════════════════════════════════════════

const RESTAURANT: CoaTemplate = {
  id: 'restaurant',
  name: 'Restaurant & Food Service',
  nameArabic: 'المطاعم وخدمات الطعام',
  description: 'Chart of accounts for restaurants, cafes, fast-food chains, catering businesses, and cloud kitchens. Includes food cost, beverage cost, kitchen supplies, and POS-driven operations.',
  icon: '🍽️',
  accounts: [
    {
      code: '1100', name: 'Current Assets', nameArabic: 'الأصول المتداولة', type: 'ASSET', children: [
        { code: '1110', name: 'Cash on Hand', nameArabic: 'الصندوق', type: 'ASSET', isSystem: true },
        { code: '1115', name: 'Petty Cash', nameArabic: 'عهدة نقدية', type: 'ASSET' },
        { code: '1120', name: 'Cash at Bank', nameArabic: 'البنك', type: 'ASSET', isSystem: true },
        { code: '1130', name: 'Accounts Receivable', nameArabic: 'ذمم العملاء', type: 'ASSET', isSystem: true },
        { code: '1140', name: 'Food Inventory', nameArabic: 'مخزون المواد الغذائية', type: 'ASSET', isSystem: true },
        { code: '1141', name: 'Beverage Inventory', nameArabic: 'مخزون المشروبات', type: 'ASSET' },
        { code: '1142', name: 'Kitchen Supplies', nameArabic: 'لوازم المطبخ', type: 'ASSET' },
        { code: '1143', name: 'Cleaning Supplies', nameArabic: 'لوازم التنظيف', type: 'ASSET' },
        { code: '1150', name: 'Prepaid Expenses', nameArabic: 'مصاريف مدفوعة مقدماً', type: 'ASSET' },
        { code: '1160', name: 'VAT Receivable', nameArabic: 'ضريبة القيمة المضافة المستحقة', type: 'ASSET' },
      ]
    },
    {
      code: '1200', name: 'Non-Current Assets', nameArabic: 'الأصول غير المتداولة', type: 'ASSET', children: [
        { code: '1210', name: 'Kitchen Equipment', nameArabic: 'معدات المطبخ', type: 'ASSET' },
        { code: '1211', name: 'Accum. Depr. — Kitchen Equipment', nameArabic: 'مجمع إهلاك معدات المطبخ', type: 'ASSET' },
        { code: '1220', name: 'Furniture & Fixtures', nameArabic: 'أثاث وتجهيزات', type: 'ASSET' },
        { code: '1221', name: 'Accum. Depr. — Furniture', nameArabic: 'مجمع إهلاك الأثاث', type: 'ASSET' },
        { code: '1230', name: 'POS Systems', nameArabic: 'أنظمة نقاط البيع', type: 'ASSET' },
        { code: '1240', name: 'Leasehold Improvements', nameArabic: 'تحسينات عقار مستأجر', type: 'ASSET' },
        { code: '1241', name: 'Accum. Amort. — Leasehold', nameArabic: 'مجمع إهلاك تحسينات العقار', type: 'ASSET' },
      ]
    },
    {
      code: '2100', name: 'Current Liabilities', nameArabic: 'الخصوم المتداولة', type: 'LIABILITY', children: [
        { code: '2110', name: 'Accounts Payable', nameArabic: 'ذمم الموردين', type: 'LIABILITY', isSystem: true },
        { code: '2120', name: 'VAT Payable — Output', nameArabic: 'ضريبة القيمة المضافة — المخرجات', type: 'LIABILITY', isSystem: true },
        { code: '2130', name: 'VAT Payable — Input', nameArabic: 'ضريبة القيمة المضافة — المدخلات', type: 'LIABILITY', isSystem: true },
        { code: '2140', name: 'Salary & Wages Payable', nameArabic: 'رواتب وأجور مستحقة', type: 'LIABILITY' },
        { code: '2150', name: 'Tips Payable', nameArabic: 'بقشيش مستحق للعاملين', type: 'LIABILITY' },
        { code: '2160', name: 'Accrued Expenses', nameArabic: 'مصاريف مستحقة', type: 'LIABILITY' },
        { code: '2170', name: 'GOSI Payable', nameArabic: 'مستحقات التأمينات الاجتماعية', type: 'LIABILITY' },
        { code: '2180', name: 'Zakat Provision', nameArabic: 'مخصص الزكاة', type: 'LIABILITY' },
      ]
    },
    {
      code: '3100', name: 'Shareholders\' Equity', nameArabic: 'حقوق المساهمين', type: 'EQUITY', children: [
        { code: '3110', name: 'Share Capital', nameArabic: 'رأس المال', type: 'EQUITY' },
        { code: '3120', name: 'Retained Earnings', nameArabic: 'الأرباح المحتجزة', type: 'EQUITY' },
        { code: '3130', name: 'Owner\'s Drawings', nameArabic: 'مسحوبات المالك', type: 'EQUITY' },
        { code: '3140', name: 'Current Year Profit/Loss', nameArabic: 'أرباح/خسائر العام الحالي', type: 'EQUITY' },
      ]
    },
    {
      code: '4100', name: 'Food & Beverage Revenue', nameArabic: 'إيرادات الأغذية والمشروبات', type: 'REVENUE', children: [
        { code: '4110', name: 'Food Sales — Dine-in', nameArabic: 'مبيعات الطعام — داخل المطعم', type: 'REVENUE', isSystem: true },
        { code: '4115', name: 'Food Sales — Delivery', nameArabic: 'مبيعات الطعام — توصيل', type: 'REVENUE' },
        { code: '4120', name: 'Beverage Sales', nameArabic: 'مبيعات المشروبات', type: 'REVENUE' },
        { code: '4130', name: 'Catering Revenue', nameArabic: 'إيرادات الحفلات الخارجية', type: 'REVENUE' },
      ]
    },
    {
      code: '4200', name: 'Other Revenue', nameArabic: 'إيرادات أخرى', type: 'REVENUE', children: [
        { code: '4210', name: 'Service Charge Revenue', nameArabic: 'إيرادات رسوم الخدمة', type: 'REVENUE' },
        { code: '4220', name: 'Delivery Fee Revenue', nameArabic: 'إيرادات رسوم التوصيل', type: 'REVENUE' },
        { code: '4230', name: 'Sales Discount Given', nameArabic: 'خصم مسموح به', type: 'REVENUE', isSystem: true },
      ]
    },
    {
      code: '5100', name: 'Cost of Sales', nameArabic: 'تكلفة المبيعات', type: 'EXPENSE', children: [
        { code: '5110', name: 'Food Cost', nameArabic: 'تكلفة المواد الغذائية', type: 'EXPENSE', isSystem: true },
        { code: '5115', name: 'Beverage Cost', nameArabic: 'تكلفة المشروبات', type: 'EXPENSE' },
        { code: '5120', name: 'Kitchen Consumables', nameArabic: 'مستهلكات المطبخ', type: 'EXPENSE' },
        { code: '5130', name: 'Food Waste & Spoilage', nameArabic: 'هدر وتلف الطعام', type: 'EXPENSE', isSystem: true },
      ]
    },
    {
      code: '5200', name: 'Labor Costs', nameArabic: 'تكاليف العمالة', type: 'EXPENSE', children: [
        { code: '5210', name: 'Chef & Kitchen Staff', nameArabic: 'رواتب الطهاة والعاملين', type: 'EXPENSE' },
        { code: '5220', name: 'Wait Staff', nameArabic: 'رواتب النُدُل', type: 'EXPENSE' },
        { code: '5230', name: 'Management Salaries', nameArabic: 'رواتب الإدارة', type: 'EXPENSE' },
        { code: '5240', name: 'GOSI — Employer Share', nameArabic: 'حصة صاحب العمل في التأمينات', type: 'EXPENSE' },
      ]
    },
    {
      code: '5300', name: 'Operating Expenses', nameArabic: 'المصاريف التشغيلية', type: 'EXPENSE', children: [
        { code: '5310', name: 'Restaurant Rent', nameArabic: 'إيجار المطعم', type: 'EXPENSE' },
        { code: '5320', name: 'Utilities', nameArabic: 'مرافق وكهرباء', type: 'EXPENSE' },
        { code: '5330', name: 'Kitchen Equipment Maintenance', nameArabic: 'صيانة معدات المطبخ', type: 'EXPENSE' },
        { code: '5340', name: 'Cleaning Services', nameArabic: 'خدمات التنظيف', type: 'EXPENSE' },
        { code: '5350', name: 'Marketing & Promotion', nameArabic: 'تسويق وترويج', type: 'EXPENSE' },
        { code: '5360', name: 'Delivery Platform Commissions', nameArabic: 'عمولات منصات التوصيل', type: 'EXPENSE' },
        { code: '5370', name: 'Uniforms & Laundry', nameArabic: 'زي موحد وغسيل', type: 'EXPENSE' },
        { code: '5380', name: 'License & Municipality Fees', nameArabic: 'رسوم تراخيص وبلدية', type: 'EXPENSE' },
        { code: '5390', name: 'Depreciation', nameArabic: 'مصاريف الإهلاك', type: 'EXPENSE' },
      ]
    },
    {
      code: '5400', name: 'Financial Expenses', nameArabic: 'مصاريف تمويلية', type: 'EXPENSE', children: [
        { code: '5410', name: 'Bank Charges', nameArabic: 'رسوم بنكية', type: 'EXPENSE' },
        { code: '5420', name: 'POS Terminal Fees', nameArabic: 'رسوم أجهزة الدفع', type: 'EXPENSE' },
        { code: '5430', name: 'Rounding Adjustments', nameArabic: 'تسويات التقريب', type: 'EXPENSE' },
        { code: '5440', name: 'Zakat Expense', nameArabic: 'مصاريف الزكاة', type: 'EXPENSE' },
      ]
    },
  ],
  mappings: [
    { mappingType: 'SALES_REVENUE' as AccountMappingType, entityType: 'GLOBAL', accountCode: '4110', description: 'Food dine-in sales' },
    { mappingType: 'SERVICE_REVENUE' as AccountMappingType, entityType: 'GLOBAL', accountCode: '4130', description: 'Catering revenue' },
    { mappingType: 'INVENTORY_ASSET' as AccountMappingType, entityType: 'GLOBAL', accountCode: '1140', description: 'Food inventory' },
    { mappingType: 'COGS_EXPENSE' as AccountMappingType, entityType: 'GLOBAL', accountCode: '5110', description: 'Food cost' },
    { mappingType: 'SALES_RETURN' as AccountMappingType, entityType: 'GLOBAL', accountCode: '5130' },
    { mappingType: 'CASH' as AccountMappingType, entityType: 'GLOBAL', accountCode: '1110' },
    { mappingType: 'BANK' as AccountMappingType, entityType: 'GLOBAL', accountCode: '1120' },
    { mappingType: 'ACCOUNT_RECEIVABLE' as AccountMappingType, entityType: 'GLOBAL', accountCode: '1130' },
    { mappingType: 'ACCOUNT_PAYABLE' as AccountMappingType, entityType: 'GLOBAL', accountCode: '2110' },
    { mappingType: 'OUTPUT_TAX' as AccountMappingType, entityType: 'GLOBAL', accountCode: '2120' },
    { mappingType: 'INPUT_TAX' as AccountMappingType, entityType: 'GLOBAL', accountCode: '2130' },
    { mappingType: 'DISCOUNT_GIVEN' as AccountMappingType, entityType: 'GLOBAL', accountCode: '4230' },
    { mappingType: 'SHRINKAGE_EXPENSE' as AccountMappingType, entityType: 'GLOBAL', accountCode: '5130' },
    { mappingType: 'ROUNDING' as AccountMappingType, entityType: 'GLOBAL', accountCode: '5430' },
  ],
};

// ═══════════════════════════════════════════════════════════════════
// TEMPLATE 5 — E-Commerce & Online Retail
// ═══════════════════════════════════════════════════════════════════

const ECOMMERCE: CoaTemplate = {
  id: 'ecommerce',
  name: 'E-Commerce & Online Retail',
  nameArabic: 'التجارة الإلكترونية والتجزئة الرقمية',
  description: 'Chart of accounts for online stores, dropshipping, marketplace sellers, and digital product businesses. Includes payment gateway accounts, marketplace fees, and shipping cost tracking.',
  icon: '📦',
  accounts: [
    {
      code: '1100', name: 'Current Assets', nameArabic: 'الأصول المتداولة', type: 'ASSET', children: [
        { code: '1110', name: 'Cash at Bank', nameArabic: 'البنك', type: 'ASSET', isSystem: true },
        { code: '1120', name: 'Payment Gateway — Pending', nameArabic: 'بوابة الدفع — معلقة', type: 'ASSET' },
        { code: '1130', name: 'Accounts Receivable', nameArabic: 'ذمم العملاء', type: 'ASSET', isSystem: true },
        { code: '1140', name: 'Inventory', nameArabic: 'المخزون', type: 'ASSET', isSystem: true },
        { code: '1145', name: 'Inventory in FBA/3PL', nameArabic: 'مخزون لدى طرف ثالث', type: 'ASSET' },
        { code: '1150', name: 'Prepaid Expenses', nameArabic: 'مصاريف مدفوعة مقدماً', type: 'ASSET' },
        { code: '1160', name: 'VAT Receivable', nameArabic: 'ضريبة القيمة المضافة المستحقة', type: 'ASSET' },
        { code: '1170', name: 'Marketplace Receivables', nameArabic: 'ذمم منصات البيع', type: 'ASSET' },
      ]
    },
    {
      code: '1200', name: 'Non-Current Assets', nameArabic: 'الأصول غير المتداولة', type: 'ASSET', children: [
        { code: '1210', name: 'Website & App Development', nameArabic: 'تطوير الموقع والتطبيق', type: 'ASSET' },
        { code: '1211', name: 'Accum. Amort. — Website', nameArabic: 'مجمع إهلاك الموقع', type: 'ASSET' },
        { code: '1220', name: 'Computer Equipment', nameArabic: 'أجهزة حاسب', type: 'ASSET' },
        { code: '1221', name: 'Accum. Depr. — Computers', nameArabic: 'مجمع إهلاك الأجهزة', type: 'ASSET' },
        { code: '1230', name: 'Warehouse Equipment', nameArabic: 'معدات المستودع', type: 'ASSET' },
        { code: '1240', name: 'Domain Names & Trademarks', nameArabic: 'أسماء نطاق وعلامات تجارية', type: 'ASSET' },
      ]
    },
    {
      code: '2100', name: 'Current Liabilities', nameArabic: 'الخصوم المتداولة', type: 'LIABILITY', children: [
        { code: '2110', name: 'Accounts Payable', nameArabic: 'ذمم الموردين', type: 'LIABILITY', isSystem: true },
        { code: '2120', name: 'VAT Payable — Output', nameArabic: 'ضريبة القيمة المضافة — المخرجات', type: 'LIABILITY', isSystem: true },
        { code: '2130', name: 'VAT Payable — Input', nameArabic: 'ضريبة القيمة المضافة — المدخلات', type: 'LIABILITY', isSystem: true },
        { code: '2140', name: 'Salary Payable', nameArabic: 'رواتب مستحقة', type: 'LIABILITY' },
        { code: '2150', name: 'Customer Refunds Payable', nameArabic: 'مستردات عملاء مستحقة', type: 'LIABILITY' },
        { code: '2160', name: 'Accrued Expenses', nameArabic: 'مصاريف مستحقة', type: 'LIABILITY' },
        { code: '2170', name: 'GOSI Payable', nameArabic: 'مستحقات التأمينات الاجتماعية', type: 'LIABILITY' },
        { code: '2180', name: 'Zakat Provision', nameArabic: 'مخصص الزكاة', type: 'LIABILITY' },
      ]
    },
    {
      code: '3100', name: 'Shareholders\' Equity', nameArabic: 'حقوق المساهمين', type: 'EQUITY', children: [
        { code: '3110', name: 'Share Capital', nameArabic: 'رأس المال', type: 'EQUITY' },
        { code: '3120', name: 'Retained Earnings', nameArabic: 'الأرباح المحتجزة', type: 'EQUITY' },
        { code: '3130', name: 'Owner\'s Drawings', nameArabic: 'مسحوبات المالك', type: 'EQUITY' },
        { code: '3140', name: 'Current Year Profit/Loss', nameArabic: 'أرباح/خسائر العام الحالي', type: 'EQUITY' },
      ]
    },
    {
      code: '4100', name: 'Sales Revenue', nameArabic: 'إيرادات المبيعات', type: 'REVENUE', children: [
        { code: '4110', name: 'Online Store Sales', nameArabic: 'مبيعات المتجر الإلكتروني', type: 'REVENUE', isSystem: true },
        { code: '4115', name: 'Marketplace Sales', nameArabic: 'مبيعات المنصات', type: 'REVENUE' },
        { code: '4120', name: 'Digital Products Sales', nameArabic: 'مبيعات منتجات رقمية', type: 'REVENUE' },
        { code: '4130', name: 'Shipping Revenue', nameArabic: 'إيرادات الشحن', type: 'REVENUE' },
        { code: '4140', name: 'Gift Card Sales', nameArabic: 'مبيعات بطاقات هدايا', type: 'REVENUE' },
      ]
    },
    {
      code: '4200', name: 'Revenue Contra Accounts', nameArabic: 'حسابات مقابلة للإيرادات', type: 'REVENUE', children: [
        { code: '4210', name: 'Sales Returns & Refunds', nameArabic: 'مرتجعات ومستردات', type: 'REVENUE', isSystem: true },
        { code: '4220', name: 'Chargebacks', nameArabic: 'اعتراضات مالية', type: 'REVENUE' },
        { code: '4230', name: 'Sales Discount Given', nameArabic: 'خصم مسموح به', type: 'REVENUE', isSystem: true },
      ]
    },
    {
      code: '5100', name: 'Cost of Sales', nameArabic: 'تكلفة المبيعات', type: 'EXPENSE', children: [
        { code: '5110', name: 'COGS — Products', nameArabic: 'تكلفة المنتجات المباعة', type: 'EXPENSE', isSystem: true },
        { code: '5120', name: 'Outbound Shipping Cost', nameArabic: 'تكلفة الشحن الصادر', type: 'EXPENSE' },
        { code: '5130', name: 'Packaging Materials', nameArabic: 'مواد التعبئة والتغليف', type: 'EXPENSE' },
        { code: '5140', name: 'Inventory Shrinkage', nameArabic: 'عجز المخزون', type: 'EXPENSE', isSystem: true },
      ]
    },
    {
      code: '5200', name: 'Selling Expenses', nameArabic: 'مصاريف بيعية', type: 'EXPENSE', children: [
        { code: '5210', name: 'Marketplace Fees & Commissions', nameArabic: 'رسوم وعمولات المنصات', type: 'EXPENSE' },
        { code: '5220', name: 'Payment Gateway Fees', nameArabic: 'رسوم بوابات الدفع', type: 'EXPENSE' },
        { code: '5230', name: 'Digital Marketing — Ads', nameArabic: 'تسويق رقمي — إعلانات', type: 'EXPENSE' },
        { code: '5240', name: 'Influencer/Affiliate Commissions', nameArabic: 'عمولات مؤثرين ومسوقين', type: 'EXPENSE' },
        { code: '5250', name: 'SEO & Content Marketing', nameArabic: 'تحسين محركات البحث والمحتوى', type: 'EXPENSE' },
      ]
    },
    {
      code: '5300', name: 'Operating Expenses', nameArabic: 'المصاريف التشغيلية', type: 'EXPENSE', children: [
        { code: '5310', name: 'Salaries & Wages', nameArabic: 'رواتب وأجور', type: 'EXPENSE' },
        { code: '5320', name: 'GOSI — Employer Share', nameArabic: 'حصة صاحب العمل في التأمينات', type: 'EXPENSE' },
        { code: '5330', name: 'Warehouse/Storage Rent', nameArabic: 'إيجار المستودع', type: 'EXPENSE' },
        { code: '5340', name: 'Web Hosting & Domain', nameArabic: 'استضافة ونطاق', type: 'EXPENSE' },
        { code: '5350', name: 'Software Subscriptions', nameArabic: 'اشتراكات برامج', type: 'EXPENSE' },
        { code: '5360', name: 'Customer Support', nameArabic: 'خدمة العملاء', type: 'EXPENSE' },
        { code: '5370', name: 'Depreciation', nameArabic: 'مصاريف الإهلاك', type: 'EXPENSE' },
      ]
    },
    {
      code: '5400', name: 'Financial Expenses', nameArabic: 'مصاريف تمويلية', type: 'EXPENSE', children: [
        { code: '5410', name: 'Bank Charges', nameArabic: 'رسوم بنكية', type: 'EXPENSE' },
        { code: '5420', name: 'Interest Expense', nameArabic: 'مصاريف فوائد', type: 'EXPENSE' },
        { code: '5430', name: 'Foreign Exchange Loss', nameArabic: 'خسائر فروقات عملة', type: 'EXPENSE' },
        { code: '5440', name: 'Bad Debt Expense', nameArabic: 'مصاريف ديون معدومة', type: 'EXPENSE' },
        { code: '5450', name: 'Rounding Adjustments', nameArabic: 'تسويات التقريب', type: 'EXPENSE' },
        { code: '5460', name: 'Zakat Expense', nameArabic: 'مصاريف الزكاة', type: 'EXPENSE' },
      ]
    },
  ],
  mappings: [
    { mappingType: 'SALES_REVENUE' as AccountMappingType, entityType: 'GLOBAL', accountCode: '4110', description: 'Online store sales' },
    { mappingType: 'SALES_RETURN' as AccountMappingType, entityType: 'GLOBAL', accountCode: '4210', description: 'Sales returns & refunds' },
    { mappingType: 'SALES_SHIPPING_REVENUE' as AccountMappingType, entityType: 'GLOBAL', accountCode: '4130' },
    { mappingType: 'INVENTORY_ASSET' as AccountMappingType, entityType: 'GLOBAL', accountCode: '1140' },
    { mappingType: 'COGS_EXPENSE' as AccountMappingType, entityType: 'GLOBAL', accountCode: '5110' },
    { mappingType: 'PURCHASE_FREIGHT' as AccountMappingType, entityType: 'GLOBAL', accountCode: '5120' },
    { mappingType: 'CASH' as AccountMappingType, entityType: 'GLOBAL', accountCode: '1110' },
    { mappingType: 'BANK' as AccountMappingType, entityType: 'GLOBAL', accountCode: '1110' },
    { mappingType: 'ACCOUNT_RECEIVABLE' as AccountMappingType, entityType: 'GLOBAL', accountCode: '1130' },
    { mappingType: 'ACCOUNT_PAYABLE' as AccountMappingType, entityType: 'GLOBAL', accountCode: '2110' },
    { mappingType: 'OUTPUT_TAX' as AccountMappingType, entityType: 'GLOBAL', accountCode: '2120' },
    { mappingType: 'INPUT_TAX' as AccountMappingType, entityType: 'GLOBAL', accountCode: '2130' },
    { mappingType: 'DISCOUNT_GIVEN' as AccountMappingType, entityType: 'GLOBAL', accountCode: '4230' },
    { mappingType: 'SHRINKAGE_EXPENSE' as AccountMappingType, entityType: 'GLOBAL', accountCode: '5140' },
    { mappingType: 'MARKETING_EXPENSE' as AccountMappingType, entityType: 'GLOBAL', accountCode: '5230' },
    { mappingType: 'ROUNDING' as AccountMappingType, entityType: 'GLOBAL', accountCode: '5450' },
  ],
};

// ═══════════════════════════════════════════════════════════════════
// TEMPLATE 6 — Construction & Contracting
// ═══════════════════════════════════════════════════════════════════

const CONSTRUCTION: CoaTemplate = {
  id: 'construction',
  name: 'Construction & Contracting',
  nameArabic: 'المقاولات والإنشاءات',
  description: 'Chart of accounts for construction companies, general contractors, and subcontractors. Includes project-based accounting, contract revenue recognition, retention tracking, and equipment costing.',
  icon: '🏗️',
  accounts: [
    {
      code: '1100', name: 'Current Assets', nameArabic: 'الأصول المتداولة', type: 'ASSET', children: [
        { code: '1110', name: 'Cash on Hand', nameArabic: 'الصندوق', type: 'ASSET', isSystem: true },
        { code: '1120', name: 'Cash at Bank', nameArabic: 'البنك', type: 'ASSET', isSystem: true },
        { code: '1130', name: 'Accounts Receivable', nameArabic: 'ذمم العملاء', type: 'ASSET', isSystem: true },
        { code: '1135', name: 'Retention Receivable', nameArabic: 'ذمم محتجزة — عملاء', type: 'ASSET' },
        { code: '1140', name: 'Contract Work-in-Progress', nameArabic: 'أعمال تحت التنفيذ', type: 'ASSET', isSystem: true },
        { code: '1145', name: 'Construction Materials Inventory', nameArabic: 'مخزون مواد البناء', type: 'ASSET' },
        { code: '1150', name: 'Prepaid Expenses', nameArabic: 'مصاريف مدفوعة مقدماً', type: 'ASSET' },
        { code: '1160', name: 'Advances to Subcontractors', nameArabic: 'دفعات مقدمة للمقاولين', type: 'ASSET' },
        { code: '1170', name: 'VAT Receivable', nameArabic: 'ضريبة القيمة المضافة المستحقة', type: 'ASSET' },
      ]
    },
    {
      code: '1200', name: 'Non-Current Assets', nameArabic: 'الأصول غير المتداولة', type: 'ASSET', children: [
        { code: '1210', name: 'Construction Equipment', nameArabic: 'معدات إنشاءات', type: 'ASSET' },
        { code: '1211', name: 'Accum. Depr. — Equipment', nameArabic: 'مجمع إهلاك المعدات', type: 'ASSET' },
        { code: '1220', name: 'Vehicles & Heavy Machinery', nameArabic: 'مركبات وآلات ثقيلة', type: 'ASSET' },
        { code: '1221', name: 'Accum. Depr. — Vehicles', nameArabic: 'مجمع إهلاك المركبات', type: 'ASSET' },
        { code: '1230', name: 'Office Building', nameArabic: 'مبنى إداري', type: 'ASSET' },
        { code: '1231', name: 'Accum. Depr. — Building', nameArabic: 'مجمع إهلاك المبنى', type: 'ASSET' },
        { code: '1280', name: 'Investments', nameArabic: 'استثمارات', type: 'ASSET' },
      ]
    },
    {
      code: '2100', name: 'Current Liabilities', nameArabic: 'الخصوم المتداولة', type: 'LIABILITY', children: [
        { code: '2110', name: 'Accounts Payable', nameArabic: 'ذمم الموردين', type: 'LIABILITY', isSystem: true },
        { code: '2115', name: 'Subcontractors Payable', nameArabic: 'ذمم مقاولي الباطن', type: 'LIABILITY' },
        { code: '2120', name: 'VAT Payable — Output', nameArabic: 'ضريبة القيمة المضافة — المخرجات', type: 'LIABILITY', isSystem: true },
        { code: '2130', name: 'VAT Payable — Input', nameArabic: 'ضريبة القيمة المضافة — المدخلات', type: 'LIABILITY', isSystem: true },
        { code: '2140', name: 'Salary & Wages Payable', nameArabic: 'رواتب وأجور مستحقة', type: 'LIABILITY' },
        { code: '2145', name: 'Retention Payable', nameArabic: 'ذمم محتجزة — مقاولين', type: 'LIABILITY' },
        { code: '2150', name: 'Accrued Expenses', nameArabic: 'مصاريف مستحقة', type: 'LIABILITY' },
        { code: '2160', name: 'GOSI Payable', nameArabic: 'مستحقات التأمينات الاجتماعية', type: 'LIABILITY' },
        { code: '2170', name: 'Zakat Provision', nameArabic: 'مخصص الزكاة', type: 'LIABILITY' },
        { code: '2180', name: 'Advances from Clients', nameArabic: 'دفعات مقدمة من العملاء', type: 'LIABILITY' },
      ]
    },
    {
      code: '3100', name: 'Shareholders\' Equity', nameArabic: 'حقوق المساهمين', type: 'EQUITY', children: [
        { code: '3110', name: 'Share Capital', nameArabic: 'رأس المال', type: 'EQUITY' },
        { code: '3120', name: 'Retained Earnings', nameArabic: 'الأرباح المحتجزة', type: 'EQUITY' },
        { code: '3130', name: 'Owner\'s Drawings', nameArabic: 'مسحوبات المالك', type: 'EQUITY' },
        { code: '3140', name: 'Current Year Profit/Loss', nameArabic: 'أرباح/خسائر العام الحالي', type: 'EQUITY' },
      ]
    },
    {
      code: '4100', name: 'Contract Revenue', nameArabic: 'إيرادات العقود', type: 'REVENUE', children: [
        { code: '4110', name: 'Contract Revenue — Fixed Price', nameArabic: 'إيرادات عقود — سعر ثابت', type: 'REVENUE', isSystem: true },
        { code: '4120', name: 'Contract Revenue — Cost Plus', nameArabic: 'إيرادات عقود — تكلفة زائدة', type: 'REVENUE' },
        { code: '4130', name: 'Variation Orders Revenue', nameArabic: 'إيرادات أوامر تغييرية', type: 'REVENUE' },
        { code: '4140', name: 'Equipment Rental Revenue', nameArabic: 'إيرادات تأجير معدات', type: 'REVENUE' },
      ]
    },
    {
      code: '4200', name: 'Revenue Contra Accounts', nameArabic: 'حسابات مقابلة للإيرادات', type: 'REVENUE', children: [
        { code: '4210', name: 'Contract Penalties/Reductions', nameArabic: 'غرامات/تخفيضات عقود', type: 'REVENUE' },
        { code: '4220', name: 'Sales Discount Given', nameArabic: 'خصم مسموح به', type: 'REVENUE', isSystem: true },
      ]
    },
    {
      code: '5100', name: 'Direct Project Costs', nameArabic: 'تكاليف المشاريع المباشرة', type: 'EXPENSE', children: [
        { code: '5110', name: 'COGS — Materials Used', nameArabic: 'تكلفة المواد المستخدمة', type: 'EXPENSE', isSystem: true },
        { code: '5120', name: 'Subcontractor Costs', nameArabic: 'تكاليف مقاولي الباطن', type: 'EXPENSE' },
        { code: '5130', name: 'Direct Labor — Site Workers', nameArabic: 'عمالة مباشرة — موقع', type: 'EXPENSE' },
        { code: '5140', name: 'Equipment Rental — Site', nameArabic: 'تأجير معدات — موقع', type: 'EXPENSE' },
        { code: '5150', name: 'Fuel & Lubricants', nameArabic: 'وقود وزيوت', type: 'EXPENSE' },
        { code: '5160', name: 'Site Facilities', nameArabic: 'تسهيلات الموقع', type: 'EXPENSE' },
        { code: '5170', name: 'Permits & Inspection Fees', nameArabic: 'رسوم تصاريح وتفتيش', type: 'EXPENSE' },
      ]
    },
    {
      code: '5200', name: 'Indirect Project Costs', nameArabic: 'تكاليف المشاريع غير المباشرة', type: 'EXPENSE', children: [
        { code: '5210', name: 'Project Management Salaries', nameArabic: 'رواتب إدارة المشاريع', type: 'EXPENSE' },
        { code: '5220', name: 'Equipment Depreciation', nameArabic: 'إهلاك المعدات', type: 'EXPENSE' },
        { code: '5230', name: 'Equipment Maintenance', nameArabic: 'صيانة المعدات', type: 'EXPENSE' },
        { code: '5240', name: 'Safety & PPE', nameArabic: 'سلامة ومعدات وقاية', type: 'EXPENSE' },
        { code: '5250', name: 'Transportation & Logistics', nameArabic: 'نقل ولوجستيات', type: 'EXPENSE' },
      ]
    },
    {
      code: '5300', name: 'General & Admin Expenses', nameArabic: 'مصاريف عمومية وإدارية', type: 'EXPENSE', children: [
        { code: '5310', name: 'Office Salaries', nameArabic: 'رواتب إدارية', type: 'EXPENSE' },
        { code: '5320', name: 'GOSI — Employer Share', nameArabic: 'حصة صاحب العمل في التأمينات', type: 'EXPENSE' },
        { code: '5330', name: 'Office Rent', nameArabic: 'إيجار المكتب', type: 'EXPENSE' },
        { code: '5340', name: 'Utilities', nameArabic: 'مرافق وكهرباء', type: 'EXPENSE' },
        { code: '5350', name: 'Insurance — General', nameArabic: 'تأمين عام', type: 'EXPENSE' },
        { code: '5360', name: 'Professional Fees', nameArabic: 'أتعاب مهنية', type: 'EXPENSE' },
        { code: '5370', name: 'Marketing', nameArabic: 'تسويق', type: 'EXPENSE' },
      ]
    },
    {
      code: '5400', name: 'Financial Expenses', nameArabic: 'مصاريف تمويلية', type: 'EXPENSE', children: [
        { code: '5410', name: 'Bank Charges', nameArabic: 'رسوم بنكية', type: 'EXPENSE' },
        { code: '5420', name: 'Interest Expense', nameArabic: 'مصاريف فوائد', type: 'EXPENSE' },
        { code: '5430', name: 'Bank Guarantee Charges', nameArabic: 'رسوم ضمانات بنكية', type: 'EXPENSE' },
        { code: '5440', name: 'Bad Debt Expense', nameArabic: 'مصاريف ديون معدومة', type: 'EXPENSE' },
        { code: '5450', name: 'Rounding Adjustments', nameArabic: 'تسويات التقريب', type: 'EXPENSE' },
        { code: '5460', name: 'Zakat Expense', nameArabic: 'مصاريف الزكاة', type: 'EXPENSE' },
      ]
    },
  ],
  mappings: [
    { mappingType: 'SALES_REVENUE' as AccountMappingType, entityType: 'GLOBAL', accountCode: '4110', description: 'Contract revenue' },
    { mappingType: 'CONTRACT_REVENUE' as AccountMappingType, entityType: 'GLOBAL', accountCode: '4110', description: 'Contract revenue' },
    { mappingType: 'SALES_RETURN' as AccountMappingType, entityType: 'GLOBAL', accountCode: '4210' },
    { mappingType: 'SUBCONTRACTOR_EXPENSE' as AccountMappingType, entityType: 'GLOBAL', accountCode: '5120' },
    { mappingType: 'RETENTION_RECEIVABLE' as AccountMappingType, entityType: 'GLOBAL', accountCode: '1135', description: 'Retention held by clients' },
    { mappingType: 'RETENTION_PAYABLE' as AccountMappingType, entityType: 'GLOBAL', accountCode: '2145', description: 'Retention held from subcontractors' },
    { mappingType: 'INVENTORY_ASSET' as AccountMappingType, entityType: 'GLOBAL', accountCode: '1145' },
    { mappingType: 'COGS_EXPENSE' as AccountMappingType, entityType: 'GLOBAL', accountCode: '5110' },
    { mappingType: 'WIP_ASSET' as AccountMappingType, entityType: 'GLOBAL', accountCode: '1140', description: 'Construction work-in-progress' },
    { mappingType: 'CASH' as AccountMappingType, entityType: 'GLOBAL', accountCode: '1110' },
    { mappingType: 'BANK' as AccountMappingType, entityType: 'GLOBAL', accountCode: '1120' },
    { mappingType: 'ACCOUNT_RECEIVABLE' as AccountMappingType, entityType: 'GLOBAL', accountCode: '1130' },
    { mappingType: 'ACCOUNT_PAYABLE' as AccountMappingType, entityType: 'GLOBAL', accountCode: '2110' },
    { mappingType: 'OUTPUT_TAX' as AccountMappingType, entityType: 'GLOBAL', accountCode: '2120' },
    { mappingType: 'INPUT_TAX' as AccountMappingType, entityType: 'GLOBAL', accountCode: '2130' },
    { mappingType: 'DISCOUNT_GIVEN' as AccountMappingType, entityType: 'GLOBAL', accountCode: '4220' },
    { mappingType: 'ROUNDING' as AccountMappingType, entityType: 'GLOBAL', accountCode: '5450' },
  ],
};

// ═══════════════════════════════════════════════════════════════════
// EXPORT
// ═══════════════════════════════════════════════════════════════════

export const COA_TEMPLATES: CoaTemplate[] = [
  GENERAL_RETAIL,
  MANUFACTURING,
  PROFESSIONAL_SERVICES,
  RESTAURANT,
  ECOMMERCE,
  CONSTRUCTION,
];
