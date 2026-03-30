# Payroll & Employee-Bank Integration - Implementation Plan

## 📋 Executive Summary

**Goal:** Connect Employees ↔ Bank Accounts ↔ Salary Payments to enable payroll processing with automatic bank transfers and accounting integration.

**Current State:**
- ✅ Bank Accounts module fully implemented
- ✅ HR Employees module with salary fields (unused)
- ✅ Accounting/Journal Entry system ready
- ❌ No payroll payment tracking
- ❌ No employee-bank account linkage

**Proposed Solution:** Add `PayrollPayment` model with full API, UI, and accounting integration.

---

## 🎯 Phase 1: Core Infrastructure (Week 1-2)

### **1.1 Database Schema Changes**

#### **File:** `server/prisma/schema.prisma`

**Add new enum:**
```prisma
enum PayrollPaymentStatus {
  PENDING
  APPROVED
  PAID
  CANCELLED
}
```

**Add new model:**
```prisma
model PayrollPayment {
  id                String                @id @default(auto()) @map("_id") @db.ObjectId
  companyId         String                @db.ObjectId
  branchId          String?               @db.ObjectId
  employeeId        String                @db.ObjectId
  bankAccountId     String?               @db.ObjectId  // NULL if cash payment
  
  paymentNo         String
  payPeriodStart    DateTime              @db.Date
  payPeriodEnd      DateTime              @db.Date
  paymentDate       DateTime              @db.Date
  
  // Earnings
  basicSalary       Float                 @default(0)
  housingAllowance  Float                 @default(0)
  transportAllowance Float                @default(0)
  otherAllowances   Float                 @default(0)
  overtimePay       Float                 @default(0)
  bonuses           Float                 @default(0)
  totalEarnings     Float
  
  // Deductions
  taxDeductions     Float                 @default(0)
  insuranceDeductions Float               @default(0)
  loanDeductions    Float                 @default(0)
  advanceDeductions Float                 @default(0)
  otherDeductions   Float                 @default(0)
  totalDeductions   Float
  
  // Net Pay
  netPay            Float
  
  // Payment Details
  status            PayrollPaymentStatus  @default(PENDING)
  paymentMethod     PaymentMethod         @default(BANK_TRANSFER)
  
  // References
  journalEntryId    String?               @db.ObjectId
  notes             String?
  
  createdAt         DateTime              @default(now())
  updatedAt         DateTime              @updatedAt
  
  // Relations
  company           Company               @relation(fields: [companyId], references: [id], onDelete: Cascade)
  branch            Branch?               @relation(fields: [branchId], references: [id])
  employee          Employee              @relation(fields: [employeeId], references: [id])
  bankAccount       BankAccount?          @relation(fields: [bankAccountId], references: [id])
  journalEntry      JournalEntry?         @relation(fields: [journalEntryId], references: [id])
  
  @@unique([companyId, paymentNo])
  @@index([companyId, paymentDate])
  @@index([employeeId, payPeriodStart])
  @@index([companyId, status])
  @@map("payroll_payments")
}
```

**Update Employee model:**
```prisma
// Replace these fields:
// bankName         String?
// bankAccount      String?

// With relation:
bankAccountId      String?               @db.ObjectId
bankAccount        BankAccount?          @relation(fields: [bankAccountId], references: [id])
```

---

### **1.2 Permissions**

#### **File:** `server/src/config/permissions.ts`

**Add new permissions:**
```typescript
// Payroll
PAYROLL_VIEW: 'payroll.view',
PAYROLL_CREATE: 'payroll.create',
PAYROLL_EDIT: 'payroll.edit',
PAYROLL_DELETE: 'payroll.delete',
PAYROLL_APPROVE: 'payroll.approve',
PAYROLL_PROCESS: 'payroll.process',
```

---

### **1.3 Backend API Routes**

#### **File:** `server/src/modules/payroll/payroll.routes.ts` (NEW)

**Endpoints:**

```typescript
// GET /payroll/payments - List all payroll payments
GET /payroll/payments
  Query: ?status=PAID&employeeId=xxx&branchId=xxx&from=2024-01-01&to=2024-01-31
  Response: Paginated list of payments

// GET /payroll/payments/:id - Get single payment
GET /payroll/payments/:id
  Response: Payment details with employee & bank info

// POST /payroll/payments - Create salary payment
POST /payroll/payments
  Body: {
    employeeId, bankAccountId, paymentDate,
    payPeriodStart, payPeriodEnd,
    basicSalary, allowances[], overtime, bonuses,
    deductions[], paymentMethod, notes
  }
  Actions:
    1. Validate employee & bank account
    2. Calculate totals
    3. Create payment record
    4. Auto-create journal entry
    5. Update bank account balance (if bank transfer)

// PUT /payroll/payments/:id - Update payment
PUT /payroll/payments/:id
  Body: Same as POST (partial)
  Actions:
    1. Update payment record
    2. Update journal entry
    3. Adjust bank balance if changed

// DELETE /payroll/payments/:id - Cancel/delete payment
DELETE /payroll/payments/:id
  Actions:
    1. Reverse journal entry
    2. Reverse bank balance
    3. Soft delete or mark as CANCELLED

// POST /payroll/payments/:id/approve - Approve payment
POST /payroll/payments/:id/approve
  Actions:
    1. Change status to APPROVED
    2. Lock editing

// POST /payroll/payments/:id/pay - Mark as paid
POST /payroll/payments/:id/pay
  Actions:
    1. Change status to PAID
    2. Post bank transaction
    3. Update bank balance

// GET /payroll/employees/:id/history - Employee payment history
GET /payroll/employees/:id/payments
  Query: ?from=&to=
  Response: List of payments for employee

// GET /payroll/summary - Payroll summary report
GET /payroll/summary
  Query: ?from=&to=&branchId=&departmentId=
  Response: Aggregated totals by department, branch

// POST /payroll/batch-process - Process multiple employees
POST /payroll/batch-process
  Body: {
    employeeIds[], payPeriodStart, payPeriodEnd,
    paymentDate, notes
  }
  Actions:
    1. Create payments for all employees
    2. Generate batch number
    3. Create consolidated journal entry
```

---

### **1.4 Accounting Integration**

#### **File:** `server/src/modules/accounting/PayrollAccountingService.ts` (NEW)

**Auto-generate journal entries:**

```typescript
// Standard Payroll Journal Entry
Debit:  Salary Expense Account      (basicSalary + allowances)
Debit:  Overtime Expense Account    (overtimePay)
Debit:  Bonus Expense Account       (bonuses)
Credit: Employee Payable Account    (netPay)
Credit: Tax Payable Account         (taxDeductions)
Credit: Insurance Payable Account   (insuranceDeductions)
Credit: Loan Receivable Account     (loanDeductions)

// When Paid via Bank Transfer
Debit:  Employee Payable Account    (netPay)
Credit: Bank Account                (netPay)

// When Paid via Cash
Debit:  Employee Payable Account    (netPay)
Credit: Cash Account                (netPay)
```

---

## 🎨 Phase 2: Frontend UI (Week 2-3)

### **2.1 Payroll Payment List Page**

#### **File:** `client/src/pages/payroll/PayrollPayments.tsx` (NEW)

**Features:**
- DataTable with all payments
- Filters: Status, Employee, Branch, Date Range
- Actions: View, Edit, Approve, Pay, Cancel
- Export to Excel
- Bulk actions

**UI Components:**
```tsx
<PageTemplate
  title="Payroll Payments"
  subtitle="Manage employee salary payments"
  action={<Button onClick={handleCreate}>New Payment</Button>}
>
  <FilterBar>
    <Select options={statusOptions} onChange={setStatusFilter} />
    <Select options={employeeOptions} onChange={setEmployeeFilter} />
    <Select options={branchOptions} onChange={setBranchFilter} />
    <DateRangePicker onChange={setDateRange} />
  </FilterBar>
  
  <DataTable
    columns={[
      { key: 'paymentNo', header: 'Payment No' },
      { key: 'employee', header: 'Employee', render: (r) => r.employee.firstName + ' ' + r.employee.lastName },
      { key: 'payPeriod', header: 'Pay Period', render: (r) => formatDate(r.payPeriodStart) + ' - ' + formatDate(r.payPeriodEnd) },
      { key: 'paymentDate', header: 'Payment Date' },
      { key: 'bankAccount', header: 'Bank Account', render: (r) => r.bankAccount?.accountName || 'Cash' },
      { key: 'totalEarnings', header: 'Earnings', align: 'right' },
      { key: 'totalDeductions', header: 'Deductions', align: 'right' },
      { key: 'netPay', header: 'Net Pay', align: 'right' },
      { key: 'status', header: 'Status', render: (r) => <Badge status={r.status} /> },
      { key: 'actions', header: '', render: actions }
    ]}
  />
</PageTemplate>
```

---

### **2.2 Create/Edit Payment Form**

#### **File:** `client/src/pages/payroll/PayrollPaymentForm.tsx` (NEW)

**Features:**
- Employee selector (with search)
- Auto-fetch employee salary & bank details
- Earnings section (Basic, Housing, Transport, Overtime, Bonuses)
- Deductions section (Tax, Insurance, Loan, Advance)
- Auto-calculate totals
- Payment method selector (Bank Transfer / Cash)
- Bank account selector (filtered by employee's bank)
- Notes field

**UI Layout:**
```tsx
<Modal isOpen title="New Salary Payment">
  <FormGroup>
    <FormField label="Employee" required>
      <Select options={employees} searchable onChange={handleEmployeeSelect} />
    </FormField>
    
    <FormField label="Payment Date" required>
      <DatePicker value={paymentDate} onChange={setPaymentDate} />
    </FormField>
    
    <FormField label="Pay Period" required>
      <div className="flex gap-2">
        <DatePicker value={periodStart} onChange={setPeriodStart} placeholder="Start" />
        <DatePicker value={periodEnd} onChange={setPeriodEnd} placeholder="End" />
      </div>
    </FormField>
  </FormGroup>
  
  <Section title="Earnings">
    <FormField label="Basic Salary">
      <Input type="number" value={basic} onChange={setBasic} />
    </FormField>
    <FormField label="Housing Allowance">
      <Input type="number" value={housing} onChange={setHousing} />
    </FormField>
    <FormField label="Transport Allowance">
      <Input type="number" value={transport} onChange={setTransport} />
    </FormField>
    <FormField label="Overtime Pay">
      <Input type="number" value={overtime} onChange={setOvertime} />
    </FormField>
    <FormField label="Bonuses">
      <Input type="number" value={bonuses} onChange={setBonuses} />
    </FormField>
    <div className="font-bold text-right">
      Total Earnings: {totalEarnings}
    </div>
  </Section>
  
  <Section title="Deductions">
    <FormField label="Tax Deductions">
      <Input type="number" value={tax} onChange={setTax} />
    </FormField>
    <FormField label="Insurance Deductions">
      <Input type="number" value={insurance} onChange={setInsurance} />
    </FormField>
    <FormField label="Loan Deductions">
      <Input type="number" value={loan} onChange={setLoan} />
    </FormField>
    <FormField label="Advance Deductions">
      <Input type="number" value={advance} onChange={setAdvance} />
    </FormField>
    <div className="font-bold text-right">
      Total Deductions: {totalDeductions}
    </div>
  </Section>
  
  <Section title="Payment Details">
    <FormField label="Payment Method" required>
      <Select options={[
        { value: 'BANK_TRANSFER', label: 'Bank Transfer' },
        { value: 'CASH', label: 'Cash' }
      ]} onChange={setPaymentMethod} />
    </FormField>
    
    {paymentMethod === 'BANK_TRANSFER' && (
      <FormField label="Bank Account" required>
        <Select options={bankAccounts} value={bankAccountId} onChange={setBankAccountId} />
      </FormField>
    )}
    
    <div className="text-2xl font-bold text-brand-600">
      Net Pay: {netPay}
    </div>
  </Section>
  
  <FormField label="Notes">
    <Textarea value={notes} onChange={setNotes} rows={3} />
  </FormField>
  
  <FormActions>
    <Button variant="outline" onClick={onClose}>Cancel</Button>
    <Button variant="primary" onClick={handleSubmit}>Save Payment</Button>
  </FormActions>
</Modal>
```

---

### **2.3 Payment Detail View**

#### **File:** `client/src/pages/payroll/PayrollPaymentDetail.tsx` (NEW)

**Features:**
- Full payment information display
- Employee details card
- Payment breakdown (earnings/deductions)
- Journal entry link
- Bank transaction link
- Print payslip button
- Download PDF button

---

### **2.4 Employee Payment History**

#### **File:** `client/src/pages/hr/EmployeePayments.tsx` (NEW)

**Features:**
- Embedded in employee detail page
- List of all payments for selected employee
- Year-to-date totals
- Quick filters (Year, Status)

---

### **2.5 Update Employee Form**

#### **File:** `client/src/pages/hr/EmployeeForm.tsx` (MODIFY)

**Changes:**
- Replace `bankName` text input with Bank Account selector
- Fetch bank accounts from API
- Store `bankAccountId` instead of string

```tsx
<FormField label="Bank Account" required>
  <Select
    options={bankAccounts}
    value={formData.bankAccountId}
    onChange={setBankAccountId}
    placeholder="Select bank account"
    searchable
  />
</FormField>
```

---

## 🔗 Phase 3: Integration & Automation (Week 3-4)

### **3.1 Bank Account Link Migration**

#### **File:** `server/scripts/migrate-employee-banks.ts` (NEW)

**Script to migrate existing data:**
```typescript
// Find employees with bankName/bankAccount strings
// Match to existing BankAccount records
// Update employee.bankAccountId with relation
```

---

### **3.2 Auto-Journal Entry Creation**

#### **File:** `server/src/modules/payroll/payrollAccounting.ts` (NEW)

**Service to create journal entries:**
```typescript
async function createPayrollJournalEntry(payment, tx) {
  const entry = await tx.journalEntry.create({
    data: {
      companyId: payment.companyId,
      date: payment.paymentDate,
      reference: `PAYROLL-${payment.paymentNo}`,
      description: `Salary payment for ${payment.employee.firstName} ${payment.employee.lastName}`,
      lines: [
        // Debits
        { accountId: salaryExpenseId, debit: payment.totalEarnings, credit: 0 },
        { accountId: overtimeExpenseId, debit: payment.overtimePay, credit: 0 },
        // Credits
        { accountId: employeePayableId, debit: 0, credit: payment.netPay },
        { accountId: taxPayableId, debit: 0, credit: payment.taxDeductions },
        { accountId: bankAccountId, debit: 0, credit: payment.netPay },
      ]
    }
  });
  
  // Link back to payment
  await tx.payrollPayment.update({
    where: { id: payment.id },
    data: { journalEntryId: entry.id }
  });
  
  return entry;
}
```

---

### **3.3 Bank Balance Updates**

**When payment is marked as PAID:**
```typescript
await tx.bankAccount.update({
  where: { id: payment.bankAccountId },
  data: {
    currentBalance: { decrement: payment.netPay }
  }
});

await tx.bankTransaction.create({
  data: {
    companyId: payment.companyId,
    bankAccountId: payment.bankAccountId,
    transactionDate: payment.paymentDate,
    description: `Salary Payment - ${payment.employee.firstName} ${payment.employee.lastName}`,
    transactionType: 'WITHDRAWAL',
    amount: payment.netPay,
    sourceType: 'PayrollPayment',
    sourceId: payment.id,
    createdById: req.user.id
  }
});
```

---

## 📊 Phase 4: Reporting & Exports (Week 4)

### **4.1 Payroll Summary Report**

#### **File:** `client/src/pages/reports/PayrollSummary.tsx` (NEW)

**Features:**
- Date range filter
- Group by: Department, Branch, Position
- Totals: Earnings, Deductions, Net Pay
- Export to Excel/PDF

---

### **4.2 Employee Payslip**

#### **File:** `client/src/pages/payroll/Payslip.tsx` (NEW)

**Features:**
- Print-ready layout
- Company logo & info
- Employee details
- Payment breakdown
- YTD totals
- Digital signature placeholder

---

### **4.3 Bank Transfer File Export**

**Generate bank-compatible file formats:**
- CSV for local banks (SNB, Al Rajhi, Riyad Bank)
- SFTP upload ready format
- Payment advice emails

---

## 🧪 Phase 5: Testing & Validation

### **5.1 Test Cases**

```typescript
// Unit Tests
- createPayrollPayment() - validates all fields
- calculateTotals() - earnings, deductions, net pay
- createJournalEntry() - correct debits/credits
- updateBankBalance() - balance changes correctly

// Integration Tests
- Full payment flow: Create → Approve → Pay → Bank Update
- Journal entry reversal on cancel
- Employee payment history accuracy
- Bank reconciliation includes payroll transactions

// E2E Tests
- Create payment via UI
- Approve and pay
- Verify bank balance updated
- Verify journal entry posted
- Print payslip
```

---

## 📦 Deliverables Checklist

### **Backend**
- [ ] `schema.prisma` updated with PayrollPayment model
- [ ] `permissions.ts` updated with payroll permissions
- [ ] `payroll.routes.ts` - All API endpoints
- [ ] `payrollAccounting.ts` - Journal entry service
- [ ] Database migration script
- [ ] Employee bank migration script

### **Frontend**
- [ ] `PayrollPayments.tsx` - Payment list page
- [ ] `PayrollPaymentForm.tsx` - Create/Edit form
- [ ] `PayrollPaymentDetail.tsx` - Detail view
- [ ] `Payslip.tsx` - Printable payslip
- [ ] `EmployeeForm.tsx` - Updated with bank selector
- [ ] `PayrollSummary.tsx` - Summary report
- [ ] Routes added to app router

### **Documentation**
- [ ] API documentation
- [ ] User guide for payroll processing
- [ ] Admin setup guide
- [ ] Troubleshooting guide

---

## 🚀 Rollout Plan

### **Week 1: Backend Foundation**
- Days 1-2: Schema design & migration
- Days 3-4: API routes implementation
- Day 5: Accounting integration

### **Week 2: Frontend Core**
- Days 1-3: Payment list & form pages
- Day 4: Employee form update
- Day 5: Integration testing

### **Week 3: Advanced Features**
- Days 1-2: Detail view & payslip
- Days 3-4: Reporting & exports
- Day 5: User acceptance testing

### **Week 4: Polish & Deploy**
- Days 1-2: Bug fixes & refinements
- Days 3-4: Documentation & training
- Day 5: Production deployment

---

## 🔐 Security Considerations

1. **Permission Checks:**
   - Only HR/Admin can create payments
   - Approval requires manager permission
   - Bank transfer requires finance permission

2. **Data Isolation:**
   - Company-scoped queries
   - Branch-level access control
   - Audit trail for all changes

3. **Audit Logging:**
   - Log all payment creations
   - Log status changes
   - Log bank balance updates

---

## 📈 Future Enhancements (Post-MVP)

1. **Payroll Batches:** Process all employees at once
2. **GOSI Integration:** Auto-calculate Saudi social security
3. **Zakat & Tax:** Auto-calculate Islamic tax
4. **Loan Management:** Employee advances & deductions
5. **Attendance Integration:** Auto-deduct absences
6. **Overtime Rules:** Auto-calculate based on labor law
7. **End-of-Service Benefits:** Calculate gratuity
8. **Multi-currency Payroll:** Pay in different currencies
9. **Direct Bank Integration:** API integration with banks
10. **Email Payslips:** Auto-email to employees

---

## ✅ Success Criteria

- [ ] Can create salary payment for employee
- [ ] Payment auto-creates journal entry
- [ ] Bank balance updates correctly
- [ ] Employee payment history accurate
- [ ] Payslip prints correctly
- [ ] Reports show correct totals
- [ ] All permissions enforced
- [ ] No data integrity issues
- [ ] Performance acceptable (<2s page loads)

---

**Ready to implement? Let me know which phase to start with!**
