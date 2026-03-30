import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

const translationEN = {
    "app": { "name": "SOLVANTA Business Suite", "welcome": "Welcome", "loading": "Loading...", "search": "Search...", "noResults": "No results found", "save": "Save", "cancel": "Cancel", "delete": "Delete", "edit": "Edit", "create": "Create", "update": "Update", "close": "Close", "confirm": "Confirm", "back": "Back", "next": "Next", "previous": "Previous", "yes": "Yes", "no": "No", "ok": "OK", "apply": "Apply", "clear": "Clear", "reset": "Reset", "filter": "Filter", "export": "Export", "import": "Import", "print": "Print", "download": "Download", "upload": "Upload", "refresh": "Refresh", "logout": "Logout", "login": "Login", "signOut": "Sign Out", "signIn": "Sign In" },
    "dashboard": { "title": "Dashboard", "overview": "Overview", "todaySales": "Today's Sales", "totalRevenue": "Total Revenue", "pendingInvoices": "Pending Invoices", "lowStockItems": "Low Stock Items", "recentActivity": "Recent Activity" },
    "navigation": { "sales": "Sales", "purchases": "Purchases", "inventory": "Inventory", "items": "Items", "customers": "Customers", "suppliers": "Suppliers", "accounting": "Accounting", "reports": "Reports", "hr": "Human Resources", "pos": "POS", "settings": "Settings", "users": "Users", "roles": "Roles & Permissions", "branches": "Branches", "companies": "Companies" },
    "common": { "name": "Name", "code": "Code", "description": "Description", "status": "Status", "active": "Active", "inactive": "Inactive", "date": "Date", "amount": "Amount", "quantity": "Quantity", "price": "Price", "total": "Total", "action": "Action", "actions": "Actions", "branch": "Branch", "warehouse": "Warehouse", "company": "Company", "email": "Email", "phone": "Phone", "address": "Address", "notes": "Notes", "created": "Created", "updated": "Updated", "createdBy": "Created By", "updatedBy": "Updated By" },
    "status": { "pending": "Pending", "approved": "Approved", "rejected": "Rejected", "completed": "Completed", "cancelled": "Cancelled", "draft": "Draft", "published": "Published", "paid": "Paid", "unpaid": "Unpaid", "partial": "Partial", "void": "Void", "refunded": "Refunded" },
    "sales": { "title": "Sales", "invoices": "Sales Invoices", "orders": "Sales Orders", "quotations": "Quotations", "returns": "Sales Returns", "payments": "Payments", "newInvoice": "New Invoice", "newOrder": "New Order", "customer": "Customer", "invoiceDate": "Invoice Date", "dueDate": "Due Date", "subtotal": "Subtotal", "discount": "Discount", "tax": "Tax", "grandTotal": "Grand Total" },
    "purchases": { "title": "Purchases", "invoices": "Purchase Invoices", "orders": "Purchase Orders", "returns": "Purchase Returns", "payments": "Payments", "newInvoice": "New Purchase Invoice", "supplier": "Supplier", "invoiceNo": "Invoice Number", "grn": "Goods Receipt Note" },
    "inventory": { "title": "Inventory", "stockOverview": "Stock Overview", "stockCount": "Stock Count", "transfers": "Stock Transfers", "warehouses": "Warehouses", "movements": "Stock Movements", "adjustments": "Adjustments", "currentStock": "Current Stock", "availableQty": "Available Quantity", "reservedQty": "Reserved Quantity" },
    "products": { "title": "Products", "categories": "Categories", "brands": "Brands", "units": "Units", "priceList": "Price List", "barcode": "Barcode", "sku": "SKU", "costPrice": "Cost Price", "sellingPrice": "Selling Price" },
    "customers": { "title": "Customers", "newCustomer": "New Customer", "customerList": "Customer List", "groups": "Customer Groups", "ledger": "Customer Ledger", "creditLimit": "Credit Limit", "contactPerson": "Contact Person" },
    "suppliers": { "title": "Suppliers", "newSupplier": "New Supplier", "supplierList": "Supplier List", "ledger": "Supplier Ledger", "paymentTerms": "Payment Terms" },
    "accounting": { "title": "Accounting", "chartOfAccounts": "Chart of Accounts", "journalEntries": "Journal Entries", "generalLedger": "General Ledger", "trialBalance": "Trial Balance", "profitAndLoss": "Profit & Loss", "balanceSheet": "Balance Sheet", "accountCode": "Account Code", "accountName": "Account Name", "accountType": "Account Type", "debit": "Debit", "credit": "Credit" },
    "hr": { "title": "Human Resources", "employees": "Employees", "departments": "Departments", "positions": "Positions", "attendance": "Attendance", "leaves": "Leaves", "employeeNo": "Employee No", "firstName": "First Name", "lastName": "Last Name", "department": "Department", "position": "Position", "manager": "Manager", "hireDate": "Hire Date", "checkIn": "Check In", "checkOut": "Check Out", "leaveType": "Leave Type", "startDate": "Start Date", "endDate": "End Date" },
    "pos": { "title": "Point of Sale", "terminal": "POS Terminal", "cart": "Cart", "checkout": "Checkout", "hold": "Hold", "resume": "Resume", "cashPayment": "Cash Payment", "cardPayment": "Card Payment", "changeDue": "Change Due", "receipt": "Receipt" },
    "reports": { "title": "Reports", "salesReport": "Sales Report", "purchaseReport": "Purchase Report", "inventoryReport": "Inventory Report", "stockReport": "Stock Report", "customerReport": "Customer Report", "supplierReport": "Supplier Report", "taxReport": "Tax Report", "fromDate": "From Date", "toDate": "To Date", "generateReport": "Generate Report" },
    "settings": { "title": "Settings", "general": "General Settings", "taxes": "Taxes", "globalStrings": "Global Strings", "modules": "Modules", "profile": "Profile", "language": "Language" },
    "validation": { "required": "This field is required", "invalidEmail": "Invalid email address", "minLength": "Must be at least {{length}} characters", "maxLength": "Must not exceed {{length}} characters", "minValue": "Must be at least {{value}}", "maxValue": "Must not exceed {{value}}", "invalidFormat": "Invalid format", "duplicate": "This value already exists" },
    "messages": { "saveSuccess": "Saved successfully", "saveError": "Failed to save", "deleteSuccess": "Deleted successfully", "deleteError": "Failed to delete", "deleteConfirm": "Are you sure you want to delete this item?", "loading": "Loading...", "noData": "No data available", "sessionExpired": "Your session has expired. Please login again.", "accessDenied": "You don't have permission to access this resource." },
    "language": { "select": "Select Language", "english": "English", "bangla": "বাংলা" }
};

const translationBN = {
    "app": { "name": "সলভ্যান্টা বিজনেস সুইট", "welcome": "স্বাগতম", "loading": "লোড হচ্ছে...", "search": "অনুসন্ধান...", "noResults": "কোনো ফলাফল পাওয়া যায়নি", "save": "সংরক্ষণ", "cancel": "বাতিল", "delete": "মুছুন", "edit": "সম্পাদনা", "create": "তৈরি করুন", "update": "আপডেট", "close": "বন্ধ", "confirm": "নিশ্চিত করুন", "back": "পিছনে", "next": "পরবর্তী", "previous": "পূর্ববর্তী", "yes": "হ্যাঁ", "no": "না", "ok": "ঠিক আছে", "apply": "প্রয়োগ", "clear": "পরিষ্কার", "reset": "রিসেট", "filter": "ফিল্টার", "export": "রপ্তানি", "import": "আমদানি", "print": "প্রিন্ট", "download": "ডাউনলোড", "upload": "আপলোড", "refresh": "রিফ্রেশ", "logout": "লগআউট", "login": "লগইন", "signOut": "সাইন আউট", "signIn": "সাইন ইন" },
    "dashboard": { "title": "ড্যাশবোর্ড", "overview": "সংক্ষিপ্ত বিবরণ", "todaySales": "আজকের বিক্রয়", "totalRevenue": "মোট রাজস্ব", "pendingInvoices": "বকেয়া ইনভয়েস", "lowStockItems": "কম স্টক আইটেম", "recentActivity": "সাম্প্রতিক কার্যকলাপ" },
    "navigation": { "sales": "বিক্রয়", "purchases": "ক্রয়", "inventory": "ইনভেন্টরি", "items": "আইটেম", "customers": "গ্রাহক", "suppliers": "সরবরাহকারী", "accounting": "অ্যাকাউন্টিং", "reports": "রিপোর্ট", "hr": "মানব সম্পদ", "pos": "পিওএস", "settings": "সেটিংস", "users": "ব্যবহারকারী", "roles": "ভূমিকা ও অনুমতি", "branches": "শাখা", "companies": "কোম্পানি" },
    "common": { "name": "নাম", "code": "কোড", "description": "বিবরণ", "status": "অবস্থা", "active": "সক্রিয়", "inactive": "নিষ্ক্রিয়", "date": "তারিখ", "amount": "পরিমাণ", "quantity": "পরিমাণ", "price": "মূল্য", "total": "মোট", "action": "কার্য", "actions": "কার্যসমূহ", "branch": "শাখা", "warehouse": "গুদাম", "company": "কোম্পানি", "email": "ইমেইল", "phone": "ফোন", "address": "ঠিকানা", "notes": "নোট", "created": "তৈরি করা হয়েছে", "updated": "আপডেট করা হয়েছে", "createdBy": "তৈরি করেছেন", "updatedBy": "আপডেট করেছেন" },
    "status": { "pending": "মুলতুবি", "approved": "অনুমোদিত", "rejected": "প্রত্যাখ্যাত", "completed": "সম্পন্ন", "cancelled": "বাতিল", "draft": "খসড়া", "published": "প্রকাশিত", "paid": "পরিশোধিত", "unpaid": "অপরিশোধিত", "partial": "আংশিক", "void": "বাতিল", "refunded": "ফেরত" },
    "sales": { "title": "বিক্রয়", "invoices": "বিক্রয় ইনভয়েস", "orders": "বিক্রয় অর্ডার", "quotations": "কোটেশন", "returns": "বিক্রয় ফেরত", "payments": "পেমেন্ট", "newInvoice": "নতুন ইনভয়েস", "newOrder": "নতুন অর্ডার", "customer": "গ্রাহক", "invoiceDate": "ইনভয়েস তারিখ", "dueDate": "নির্ধারিত তারিখ", "subtotal": "সাবটোটাল", "discount": "ছাড়", "tax": "কর", "grandTotal": "সর্বমোট" },
    "purchases": { "title": "ক্রয়", "invoices": "ক্রয় ইনভয়েস", "orders": "ক্রয় অর্ডার", "returns": "ক্রয় ফেরত", "payments": "পেমেন্ট", "newInvoice": "নতুন ক্রয় ইনভয়েস", "supplier": "সরবরাহকারী", "invoiceNo": "ইনভয়েস নম্বর", "grn": "গুডস রিসিট নোট" },
    "inventory": { "title": "ইনভেন্টরি", "stockOverview": "স্টক ওভারভিউ", "stockCount": "স্টক গণনা", "transfers": "স্টক স্থানান্তর", "warehouses": "গুদাম", "movements": "স্টক চলাচল", "adjustments": "সমন্বয়", "currentStock": "বর্তমান স্টক", "availableQty": "উপলব্ধ পরিমাণ", "reservedQty": "সংরক্ষিত পরিমাণ" },
    "products": { "title": "পণ্য", "categories": "বিভাগ", "brands": "ব্র্যান্ড", "units": "একক", "priceList": "মূল্য তালিকা", "barcode": "বারকোড", "sku": "এসকেইউ", "costPrice": "ক্রয় মূল্য", "sellingPrice": "বিক্রয় মূল্য" },
    "customers": { "title": "গ্রাহক", "newCustomer": "নতুন গ্রাহক", "customerList": "গ্রাহক তালিকা", "groups": "গ্রাহক গ্রুপ", "ledger": "গ্রাহক খতিয়ান", "creditLimit": "ঋণ সীমা", "contactPerson": "যোগাযোগের ব্যক্তি" },
    "suppliers": { "title": "সরবরাহকারী", "newSupplier": "নতুন সরবরাহকারী", "supplierList": "সরবরাহকারী তালিকা", "ledger": "সরবরাহকারী খতিয়ান", "paymentTerms": "পেমেন্ট শর্তাবলী" },
    "accounting": { "title": "অ্যাকাউন্টিং", "chartOfAccounts": "অ্যাকাউন্টের চার্ট", "journalEntries": "জার্নাল এন্ট্রি", "generalLedger": "সাধারণ খতিয়ান", "trialBalance": "ট্রায়াল ব্যালেন্স", "profitAndLoss": "লাভ ও ক্ষতি", "balanceSheet": "ব্যালেন্স শিট", "accountCode": "অ্যাকাউন্ট কোড", "accountName": "অ্যাকাউন্টের নাম", "accountType": "অ্যাকাউন্টের ধরন", "debit": "ডেবিট", "credit": "ক্রেডিট" },
    "hr": { "title": "মানব সম্পদ", "employees": "কর্মচারী", "departments": "বিভাগ", "positions": "পদবী", "attendance": "উপস্থিতি", "leaves": "ছুটি", "employeeNo": "কর্মচারী নম্বর", "firstName": "প্রথম নাম", "lastName": "শেষ নাম", "department": "বিভাগ", "position": "পদবী", "manager": "ম্যানেজার", "hireDate": "নিয়োগের তারিখ", "checkIn": "চেক ইন", "checkOut": "চেক আউট", "leaveType": "ছুটির ধরন", "startDate": "শুরুর তারিখ", "endDate": "শেষের তারিখ" },
    "pos": { "title": "পয়েন্ট অফ সেল", "terminal": "পিওএস টার্মিনাল", "cart": "কার্ট", "checkout": "চেকআউট", "hold": "হোল্ড", "resume": "পুনরায় শুরু", "cashPayment": "নগদ পেমেন্ট", "cardPayment": "কার্ড পেমেন্ট", "changeDue": "পরিবর্তন বাকি", "receipt": "রসিদ" },
    "reports": { "title": "রিপোর্ট", "salesReport": "বিক্রয় রিপোর্ট", "purchaseReport": "ক্রয় রিপোর্ট", "inventoryReport": "ইনভেন্টরি রিপোর্ট", "stockReport": "স্টক রিপোর্ট", "customerReport": "গ্রাহক রিপোর্ট", "supplierReport": "সরবরাহকারী রিপোর্ট", "taxReport": "কর রিপোর্ট", "fromDate": "থেকে তারিখ", "toDate": "পর্যন্ত তারিখ", "generateReport": "রিপোর্ট তৈরি করুন" },
    "settings": { "title": "সেটিংস", "general": "সাধারণ সেটিংস", "taxes": "কর", "globalStrings": "গ্লোবাল স্ট্রিং", "modules": "মডিউল", "profile": "প্রোফাইল", "language": "ভাষা" },
    "validation": { "required": "এই ঘরটি আবশ্যক", "invalidEmail": "অবৈধ ইমেইল ঠিকানা", "minLength": "কমপক্ষে {{length}} অক্ষর হতে হবে", "maxLength": "{{length}} অক্ষরের বেশি হতে পারবে না", "minValue": "কমপক্ষে {{value}} হতে হবে", "maxValue": "{{value}} এর বেশি হতে পারবে না", "invalidFormat": "অবৈধ ফরম্যাট", "duplicate": "এই মানটি ইতিমধ্যে বিদ্যমান" },
    "messages": { "saveSuccess": "সফলভাবে সংরক্ষিত", "saveError": "সংরক্ষণ ব্যর্থ", "deleteSuccess": "সফলভাবে মুছে ফেলা হয়েছে", "deleteError": "মুছে ফেলা ব্যর্থ", "deleteConfirm": "আপনি কি এই আইটেমটি মুছে ফেলতে চান?", "loading": "লোড হচ্ছে...", "noData": "কোনো ডেটা উপলব্ধ নেই", "sessionExpired": "আপনার সেশনের মেয়াদ শেষ হয়েছে। অনুগ্রহ করে আবার লগইন করুন।", "accessDenied": "আপনার এই রিসোর্সে প্রবেশের অনুমতি নেই।" },
    "language": { "select": "ভাষা নির্বাচন করুন", "english": "English", "bangla": "বাংলা" }
};

const resources = {
    en: { translation: translationEN },
    bn: { translation: translationBN },
};

i18n
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
        resources,
        fallbackLng: 'en',
        supportedLngs: ['en', 'bn'],
        interpolation: {
            escapeValue: false,
        },
        detection: {
            order: ['localStorage', 'navigator'],
            caches: ['localStorage'],
        },
    });

export default i18n;
