# 🌐 Multilanguage Support (i18n)

SOLVANTA Business Suite now supports multilingual UI with **English** and **বাংলা (Bangla)**.

---

## 📦 Implementation

Built with **i18next** - the industry standard for React internationalization.

### **Features:**
- ✅ **Real-time language switching** - Changes apply instantly
- ✅ **Persistent preference** - Saved in localStorage
- ✅ **Auto-detection** - Detects browser language
- ✅ **Type-safe** - Full TypeScript support
- ✅ **Extensible** - Easy to add new languages

---

## 🚀 Usage

### **1. Using the Translation Hook**

```tsx
import { useAppTranslation } from '@/components/ui';

function MyComponent() {
    const { t } = useAppTranslation();
    
    return (
        <div>
            <h1>{t('dashboard.title')}</h1>
            <p>{t('app.welcome')}</p>
            <button>{t('app.save')}</button>
        </div>
    );
}
```

### **2. Using the Language Switcher**

```tsx
import { LanguageSwitcher } from '@/components/ui';

function Header() {
    return (
        <header>
            <LanguageSwitcher />
        </header>
    );
}
```

### **3. Programmatic Language Change**

```tsx
import { useLanguageStore } from '@/stores/languageStore';

function Settings() {
    const { language, setLanguage } = useLanguageStore();
    
    return (
        <select 
            value={language} 
            onChange={(e) => setLanguage(e.target.value as 'en' | 'bn')}
        >
            <option value="en">English</option>
            <option value="bn">বাংলা</option>
        </select>
    );
}
```

---

## 📁 File Structure

```
client/src/
├── lib/
│   └── i18n.ts                 # i18next configuration
├── locales/
│   ├── en.json                 # English translations
│   └── bn.json                 # Bangla translations
├── stores/
│   └── languageStore.ts        # Zustand language state
├── hooks/
│   └── useAppTranslation.ts    # Custom translation hook
└── components/
    └── ui/
        └── LanguageSwitcher.tsx # Language switch dropdown
```

---

## 📝 Translation Keys

### **Available Namespaces:**

| Key | Description | Example |
|-----|-------------|---------|
| `app.*` | General app strings | `app.welcome`, `app.save` |
| `dashboard.*` | Dashboard labels | `dashboard.title`, `dashboard.todaySales` |
| `navigation.*` | Navigation menu | `navigation.sales`, `navigation.customers` |
| `common.*` | Common fields | `common.name`, `common.email` |
| `status.*` | Status labels | `status.pending`, `status.completed` |
| `sales.*` | Sales module | `sales.invoices`, `sales.customer` |
| `purchases.*` | Purchases module | `purchases.supplier`, `purchases.invoiceNo` |
| `inventory.*` | Inventory module | `inventory.stockOverview`, `inventory.warehouses` |
| `products.*` | Product management | `products.categories`, `products.brands` |
| `customers.*` | Customer management | `customers.newCustomer`, `customers.creditLimit` |
| `suppliers.*` | Supplier management | `suppliers.newSupplier`, `suppliers.paymentTerms` |
| `accounting.*` | Accounting module | `accounting.chartOfAccounts`, `accounting.debit` |
| `hr.*` | Human resources | `hr.employees`, `hr.attendance`, `hr.leaveType` |
| `pos.*` | Point of sale | `pos.terminal`, `pos.checkout`, `pos.receipt` |
| `reports.*` | Reports | `reports.salesReport`, `reports.fromDate` |
| `settings.*` | Settings | `settings.general`, `settings.language` |
| `validation.*` | Validation messages | `validation.required`, `validation.invalidEmail` |
| `messages.*` | System messages | `messages.saveSuccess`, `messages.deleteConfirm` |
| `language.*` | Language selector | `language.english`, `language.bangla` |

---

## ➕ Adding New Languages

### **Step 1: Create Translation File**

Create `client/src/locales/fr.json` for French:

```json
{
    "app": {
        "welcome": "Bienvenue",
        "save": "Enregistrer",
        "cancel": "Annuler"
    }
}
```

### **Step 2: Register Language**

Update `client/src/lib/i18n.ts`:

```typescript
import translationFR from './locales/fr.json';

const resources = {
    en: { translation: translationEN },
    bn: { translation: translationBN },
    fr: { translation: translationFR }, // Add French
};

i18n.init({
    // ...
    supportedLngs: ['en', 'bn', 'fr'], // Add 'fr'
});
```

### **Step 3: Update Language Switcher**

Update `client/src/components/ui/LanguageSwitcher.tsx`:

```typescript
const languageOptions = [
    { value: 'en', label: '🇬🇧 English' },
    { value: 'bn', label: '🇧🇩 বাংলা' },
    { value: 'fr', label: '🇫🇷 Français' }, // Add French
];
```

### **Step 4: Update Type Definitions**

Update `client/src/stores/languageStore.ts`:

```typescript
type Language = 'en' | 'bn' | 'fr'; // Add 'fr'
```

---

## 🎨 Best Practices

### **1. Use Translation Keys Consistently**

```tsx
// ✅ Good
<h1>{t('dashboard.title')}</h1>

// ❌ Avoid
<h1>Dashboard</h1>
```

### **2. Organize Keys by Module**

```
sales.*     → All sales-related strings
hr.*        → All HR-related strings
```

### **3. Use Variables in Translations**

```json
{
    "validation": {
        "minLength": "Must be at least {{length}} characters"
    }
}
```

```tsx
t('validation.minLength', { length: 5 })
// Output: "Must be at least 5 characters"
```

### **4. Handle Missing Translations Gracefully**

i18next will fallback to English if a translation is missing.

---

## 🔧 Configuration

### **i18next Options** (`client/src/lib/i18n.ts`)

```typescript
i18n.init({
    fallbackLng: 'en',           // Default language
    supportedLngs: ['en', 'bn'], // Available languages
    interpolation: {
        escapeValue: false,      // React already escapes
    },
    detection: {
        order: ['localStorage', 'navigator'], // Detection priority
        caches: ['localStorage'],             // Persist preference
    },
});
```

---

## 📊 Current Coverage

| Module | English | বাংলা | Status |
|--------|---------|-------|--------|
| App Core | ✅ | ✅ | Complete |
| Dashboard | ✅ | ✅ | Complete |
| Navigation | ✅ | ✅ | Complete |
| Sales | ✅ | ✅ | Complete |
| Purchases | ✅ | ✅ | Complete |
| Inventory | ✅ | ✅ | Complete |
| Products | ✅ | ✅ | Complete |
| Customers | ✅ | ✅ | Complete |
| Suppliers | ✅ | ✅ | Complete |
| Accounting | ✅ | ✅ | Complete |
| HR | ✅ | ✅ | Complete |
| POS | ✅ | ✅ | Complete |
| Reports | ✅ | ✅ | Complete |
| Settings | ✅ | ✅ | Complete |
| Validation | ✅ | ✅ | Complete |
| Messages | ✅ | ✅ | Complete |

---

## 🎯 Example: Translating a Page

```tsx
import { useAppTranslation } from '@/components/ui';
import { PageHeader, Card } from '@/components/ui';

function CustomersPage() {
    const { t } = useAppTranslation();
    
    return (
        <PageLayout>
            <PageHeader
                title={t('customers.title')}
                action={<Button>{t('customers.newCustomer')}</Button>}
            />
            
            <Card>
                <CardHeader>
                    <CardTitle>{t('customers.customerList')}</CardTitle>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>{t('common.name')}</TableHead>
                                <TableHead>{t('common.email')}</TableHead>
                                <TableHead>{t('common.phone')}</TableHead>
                                <TableHead>{t('common.status')}</TableHead>
                                <TableHead>{t('common.actions')}</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {/* Table rows */}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </PageLayout>
    );
}
```

---

## 🐛 Troubleshooting

### **Translations not showing?**
1. Check if the translation key exists in both `en.json` and `bn.json`
2. Ensure the i18n module is imported in `main.tsx`
3. Clear browser cache and localStorage

### **Language not persisting?**
1. Check browser's localStorage permissions
2. Verify `detection.caches` in `i18n.ts` includes `'localStorage'`

### **TypeScript errors?**
1. Update the `Language` type in `languageStore.ts`
2. Ensure all language codes match in `supportedLngs`

---

## 📚 Resources

- [i18next Documentation](https://www.i18next.com/)
- [react-i18next Documentation](https://react.i18next.com/)
- [i18next Browser Language Detector](https://github.com/i18next/i18next-browser-languageDetector)

---

**Last Updated:** March 2026  
**Version:** 1.0.0
