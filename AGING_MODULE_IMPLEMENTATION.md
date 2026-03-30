# Accounts Receivable & Payable Aging Module

## Overview

A comprehensive AR/AP aging module that provides insights into outstanding customer and supplier balances, organized by age buckets (Current, 31-60, 61-90, 90+ days).

## Features Implemented

### 1. Accounts Receivable (AR) Aging
- **Summary View**: Total receivables broken down by aging buckets
- **Customer Detail**: Per-customer aging with credit limit utilization
- **Invoice Drill-down**: View individual outstanding invoices per customer
- **Credit Monitoring**: Visual credit limit usage indicators
- **Export**: CSV export functionality

### 2. Accounts Payable (AP) Aging
- **Summary View**: Total payables broken down by aging buckets
- **Supplier Detail**: Per-supplier aging breakdown
- **Invoice Drill-down**: View individual outstanding invoices per supplier
- **Export**: CSV export functionality

### 3. Customer/Supplier Statements
- Transaction history for any date range
- Running balance calculation
- Opening/closing balance summary

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/aging/ar` | GET | AR aging summary (all customers) |
| `/api/aging/ar/:customerId` | GET | AR detail for specific customer |
| `/api/aging/ap` | GET | AP aging summary (all suppliers) |
| `/api/aging/ap/:supplierId` | GET | AP detail for specific supplier |
| `/api/aging/statements/customer/:customerId` | GET | Generate customer statement |
| `/api/aging/summary` | GET | Combined AR/AP dashboard summary |

### Query Parameters
- `asOfDate`: Calculate aging as of specific date (default: today)
- `customerId`: Filter by specific customer
- `supplierId`: Filter by specific supplier
- `branchId`: Filter by branch
- `startDate`/`endDate`: Date range for statements

## Frontend Pages

### AR Aging (`/aging/ar`)
- Visual aging bucket cards with percentages
- Customer table with aging breakdown columns
- Credit utilization progress bars
- Detail modal with invoice list
- CSV export

### AP Aging (`/aging/ap`)
- Visual aging bucket cards with percentages
- Supplier table with aging breakdown
- Detail modal with invoice list
- CSV export

## Unified Components Used

Both pages consistently use:
- ✅ `PageTemplate` with breadcrumbs
- ✅ `Section` for content grouping
- ✅ `DataTable` for tabular data
- ✅ `FormField` + `Input` for date selection
- ✅ `Badge` for status indicators
- ✅ `Modal` for detail views
- ✅ `useNotification` for toast messages

## Data Structure

### AR Aging Response
```json
{
  "summary": {
    "current": 50000,
    "days31to60": 25000,
    "days61to90": 10000,
    "over90": 5000,
    "total": 90000
  },
  "asOfDate": "2026-03-30",
  "totalCustomers": 15,
  "customers": [
    {
      "customer": { "id": "...", "name": "...", "creditLimit": 100000 },
      "current": 10000,
      "days31to60": 5000,
      "days61to90": 0,
      "over90": 0,
      "total": 15000,
      "invoices": [...]
    }
  ]
}
```

## Integration

### Navigation Menu
Added under Accounting section:
- AR Aging → `/aging/ar`
- AP Aging → `/aging/ap`

### Permissions
Uses existing `accounting.view` permission (no new permissions required).

## Usage Examples

### View AR Aging
```
GET /api/aging/ar?asOfDate=2026-03-30
```

### View Customer Detail
```
GET /api/aging/ar/customer-id-123
```

### Generate Statement
```
GET /api/aging/statements/customer/customer-id-123?startDate=2026-01-01&endDate=2026-03-30
```

## Business Value

1. **Cash Flow Management**: Quickly identify overdue receivables/payables
2. **Credit Control**: Monitor customer credit utilization
3. **Collection Priority**: Focus on customers with highest overdue amounts
4. **Vendor Management**: Track payment obligations to suppliers
5. **Financial Reporting**: Essential for month-end financial statements

## Next Steps

1. **Add Automated Alerts**: Notify when customers exceed credit limits
2. **Collection Tracking**: Log collection calls/activities
3. **Payment Scheduling**: Plan upcoming payments to suppliers
4. **Aging Reports**: Scheduled email reports (daily/weekly)
5. **Trend Analysis**: Compare aging over time periods

## Files Created

### Backend
- `server/src/modules/aging/aging.routes.ts` - All API endpoints

### Frontend
- `client/src/pages/aging/ARAging.tsx` - AR aging page
- `client/src/pages/aging/APAging.tsx` - AP aging page

### Updated Files
- `server/src/app.ts` - Route registration
- `client/src/App.tsx` - Frontend routes
- `client/src/pages/lazy.ts` - Lazy imports
- `client/src/components/Layout.tsx` - Navigation menu

---

**Status**: Ready for use (no database migration required - uses existing invoice data)
