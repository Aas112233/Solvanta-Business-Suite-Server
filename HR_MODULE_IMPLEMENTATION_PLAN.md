# HR Module Implementation Plan
## Solvanta Business Suite - Human Resources Management System

---

## 📋 Table of Contents

1. [Executive Summary](#executive-summary)
2. [Module Architecture](#module-architecture)
3. [Phase 1: Employee Management](#phase-1-employee-management)
4. [Phase 2: Attendance & Leave Management](#phase-2-attendance--leave-management)
5. [Phase 3: Payroll Management](#phase-3-payroll-management)
6. [Phase 4: Recruitment & Onboarding](#phase-4-recruitment--onboarding)
7. [Phase 5: Performance Management](#phase-5-performance-management)
8. [Phase 6: Training & Development](#phase-6-training--development)
9. [Phase 7: Employee Self-Service](#phase-7-employee-self-service)
10. [Phase 8: Analytics & Reporting](#phase-8-analytics--reporting)
11. [Integration Strategy](#integration-strategy)
12. [Testing Strategy](#testing-strategy)
13. [Deployment Plan](#deployment-plan)

---

## Executive Summary

### Purpose
This document outlines the complete implementation plan for the HR module in Solvanta Business Suite. The HR module will provide comprehensive human resource management capabilities, seamlessly integrated with existing POS, Inventory, Sales, and Accounting modules.

### Business Objectives
- **Centralize Employee Data**: Single source of truth for all employee information
- **Automate Payroll**: Reduce manual payroll processing time by 80%
- **Track Attendance**: Real-time attendance monitoring with multiple check-in methods
- **Compliance**: Ensure 100% compliance with Saudi labor laws (GOSI, EOSB, Nitaqat)
- **Self-Service**: Empower employees and managers with self-service portals
- **Data-Driven Decisions**: Advanced analytics for workforce optimization

### Technical Goals
- Multi-tenant architecture (company-wise data isolation)
- Branch-level access control
- Role-based permissions
- RESTful API design
- Mobile-responsive UI
- Real-time notifications
- Audit trail for all operations

---

## Module Architecture

### Database Schema Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     HR Module Entities                       │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Employee ──┬──> Attendance ──> Payroll                     │
│     │       │         │              │                       │
│     │       │         │              └──> Journal Entry     │
│     │       │         └──> Overtime  │      (Accounting)    │
│     │       │                        │                       │
│     │       └──> Leave ──> Approval  │                       │
│     │                                 │                       │
│     ├──> Department ──> Positions     │                       │
│     │                                 │                       │
│     ├──> Loan ──> Installments ──────┘                       │
│     │                                 │                       │
│     ├──> Document ──> Expiry Alerts   │                       │
│     │                                 │                       │
│     └──> Performance ──> Reviews ────┘                       │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Folder Structure
```
server/src/modules/hr/
├── hr.routes.ts              # API endpoints
├── hr.controllers.ts         # Business logic
├── hr.validators.ts          # Request validation
├── hr.services.ts            # Core services
├── hr.utils.ts               # Helper functions
└── hr.permissions.ts         # Permission definitions

client/src/pages/hr/
├── employees/
│   ├── EmployeeList.tsx
│   ├── EmployeeForm.tsx
│   └── EmployeeDetail.tsx
├── attendance/
│   ├── AttendanceDashboard.tsx
│   ├── AttendanceReport.tsx
│   └── ShiftManagement.tsx
├── payroll/
│   ├── PayrollDashboard.tsx
│   ├── PayrollProcessing.tsx
│   └── PayslipView.tsx
├── leave/
│   ├── LeaveRequests.tsx
│   └── LeaveBalance.tsx
└── reports/
    └── HRReports.tsx
```

---

## Phase 1: Employee Management
**Duration**: 2-3 weeks  
**Priority**: CRITICAL  
**Purpose**: Foundation for all HR features

### 1.1 Employee Database

#### **Purpose**
- Central repository for all employee information
- Track employment lifecycle from hiring to exit
- Enable organizational structure management

#### **Features to Implement**

**A. Employee Record Creation**
```typescript
// File: server/src/modules/hr/hr.routes.ts
POST /api/v1/hr/employees
{
  "firstName": "Ahmed",
  "lastName": "Al-Ghamdi",
  "email": "ahmed.ghamdi@company.com",
  "phone": "+966-555555555",
  "departmentId": "xxx",
  "positionId": "xxx",
  "managerId": "xxx",
  "hireDate": "2024-01-01",
  "employmentType": "FULL_TIME",
  "branchId": "xxx",
  "salary": 8500
}
```

**Implementation Steps**:
1. Create Prisma schema for `Employee` model
2. Add employee number auto-generation (EMP-2024-0001)
3. Implement CRUD operations
4. Add file upload for employee photos
5. Create document attachment system (PDF, images)
6. Build employee list with filters (department, branch, status)
7. Implement employee detail view with tabs

**B. Department Management**
```prisma
model Department {
  id          String     @id @default(auto())
  companyId   String     @db.ObjectId
  name        String
  code        String     @unique
  description String?
  parentId    String?    @db.ObjectId
  parent      Department? @relation(fields: [parentId], references: [id])
  children    Department[] @relation("DepartmentHierarchy")
  employees   Employee[]
}
```

**Implementation Steps**:
1. Create department CRUD
2. Implement hierarchical structure (parent-child)
3. Add department head assignment
4. Create department budget tracking
5. Build department tree view UI

**C. Position Management**
```prisma
model Position {
  id           String     @id @default(auto())
  companyId    String     @db.ObjectId
  title        String
  code         String
  departmentId String?    @db.ObjectId
  level        Int        // Job grade/level
  reportsTo    String?    @db.ObjectId
  minSalary    Float
  maxSalary    Float
}
```

**Implementation Steps**:
1. Create position catalog
2. Define reporting relationships
3. Set salary bands per position
4. Link positions to departments
5. Track headcount per position

**D. Employment Lifecycle**
```typescript
// Employee status transitions
DRAFT → PROBATION → CONFIRMED → ACTIVE → TERMINATED/RESIGNED/RETIRED
```

**Implementation Steps**:
1. Implement confirmation workflow (probation → confirmed)
2. Add promotion/demotion tracking
3. Create transfer system (branch/department changes)
4. Build exit management (resignation, termination)
5. Generate experience letters
6. Calculate final settlement

#### **Database Schema**
```prisma
model Employee {
  id              String   @id @default(auto())
  companyId       String   @db.ObjectId
  branchId        String   @db.ObjectId
  employeeNo      String   @unique
  firstName       String
  lastName        String
  email           String   @unique
  phone           String
  dateOfBirth     DateTime?
  gender          String?
  nationality     String?
  departmentId    String?  @db.ObjectId
  positionId      String?  @db.ObjectId
  managerId       String?  @db.ObjectId
  hireDate        DateTime
  probationEndDate DateTime?
  confirmationDate DateTime?
  terminationDate DateTime?
  employmentType  String   // FULL_TIME, PART_TIME, CONTRACT, INTERN
  status          String   // ACTIVE, PROBATION, SUSPENDED, TERMINATED
  salary          Float
  currency        String   @default("SAR")
  bankName        String?
  bankAccount     String?
  address         String?
  city            String?
  emergencyContact String?
  emergencyPhone  String?
  
  // Relations
  company         Company  @relation(fields: [companyId], references: [id])
  branch          Branch   @relation(fields: [branchId], references: [id])
  department      Department? @relation(fields: [departmentId], references: [id])
  position        Position?   @relation(fields: [positionId], references: [id])
  manager         Employee?   @relation("ManagerSubordinates", fields: [managerId], references: [id])
  subordinates    Employee[]  @relation("ManagerSubordinates")
  attendance      Attendance[]
  payroll         Payroll[]
  leaves          Leave[]
  loans           EmployeeLoan[]
  documents       EmployeeDocument[]
  performance     PerformanceReview[]
  
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  
  @@unique([companyId, employeeNo])
  @@index([companyId, status])
  @@index([companyId, departmentId])
  @@map("employees")
}
```

#### **UI Components**
1. **Employee List**
   - DataTable with columns: Employee No, Name, Department, Position, Branch, Status, Actions
   - Filters: Department dropdown, Branch dropdown, Status dropdown, Search bar
   - Bulk actions: Export to Excel, Send Email, Change Status
   - Row actions: View, Edit, Terminate, Transfer

2. **Employee Form**
   - Multi-step form:
     - Step 1: Personal Information
     - Step 2: Job Details
     - Step 3: Compensation
     - Step 4: Documents
   - Validation: Email uniqueness, required fields
   - Auto-save draft

3. **Employee Detail**
   - Tab 1: Overview (photo, basic info, quick stats)
   - Tab 2: Attendance (monthly summary, late arrivals)
   - Tab 3: Payroll (salary history, payslips)
   - Tab 4: Leave (balance, history)
   - Tab 5: Documents (contracts, certificates, IDs)
   - Tab 6: Performance (reviews, goals)
   - Tab 7: Timeline (promotions, transfers, disciplinary)

#### **Permissions**
```typescript
HR_EMPLOYEE_VIEW = 'hr.employeeView'      // View employee list/detail
HR_EMPLOYEE_CREATE = 'hr.employeeCreate'  // Create new employees
HR_EMPLOYEE_EDIT = 'hr.employeeEdit'      // Edit employee data
HR_EMPLOYEE_DELETE = 'hr.employeeDelete'  // Terminate/delete employees
HR_EMPLOYEE_TRANSFER = 'hr.employeeTransfer' // Transfer between branches
HR_EMPLOYEE_PROMOTE = 'hr.employeePromote'   // Promote/demote
```

---

### 1.2 Document Management

#### **Purpose**
- Store and track employee documents
- Automated expiry alerts for visas, IDs, insurance
- Compliance with labor law requirements

#### **Features**
```typescript
Document Types:
- Employment Contract
- id number
- Passport
- Medical Insurance
- Professional License
- Educational Certificates
- Driver's License
- Bond Agreement
```

**Implementation Steps**:
1. Create `EmployeeDocument` model with fields:
   - documentType, fileUrl, issueDate, expiryDate, issuingAuthority
2. Implement file upload (AWS S3, Azure Blob, or local storage) will implement leter
3. Add document scanning/OCR (optional) leter
4. Create expiry alert system (30 days, 15 days, 7 days before)
5. Build document renewal workflow
6. Add document request/approval (employee requests, HR approves)

#### **Alert System**
```typescript
// File: server/src/modules/hr/hr.services.ts
async function checkDocumentExpiries() {
  const thirtyDaysFromNow = new Date();
  thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
  
  const expiringDocs = await prisma.employeeDocument.findMany({
    where: {
      expiryDate: {
        lte: thirtyDaysFromNow
      },
      status: 'ACTIVE'
    },
    include: { employee: true }
  });
  
  // Send email notifications
  for (const doc of expiringDocs) {
    await sendEmail({
      to: doc.employee.email,
      subject: `Document Expiring: ${doc.documentType}`,
      message: `Your ${doc.documentType} expires on ${format(doc.expiryDate, 'dd MMM yyyy')}`
    });
  }
}
```

---

## Phase 2: Attendance & Leave Management
**Duration**: 3-4 weeks  
**Priority**: HIGH  
**Purpose**: Track employee time and manage absences

### 2.1 Attendance Tracking

#### **Purpose**
- Monitor employee work hours
- Calculate overtime automatically
- Integrate with payroll for salary processing
- Ensure compliance with working hour regulations

#### **Features to Implement**

**A. Daily Attendance**
```typescript
POST /api/v1/hr/attendance/check-in
{
  "employeeId": "xxx",
  "timestamp": "2024-03-08T08:55:00Z",
  "method": "WEB", // WEB, MOBILE, BIOMETRIC, POS
  "location": {     // Optional for geo-fencing
    "latitude": 24.7136,
    "longitude": 46.6753
  }
}

POST /api/v1/hr/attendance/check-out
{
  "employeeId": "xxx",
  "timestamp": "2024-03-08T17:05:00Z"
}
```

**Implementation Steps**:
1. Create `Attendance` model with check-in/check-out
2. Implement check-in/check-out APIs
3. Add geo-fencing validation (optional)
4. Integrate with POS login (auto check-in when cashier logs in)
5. Create biometric device integration (optional)
6. Build attendance correction workflow (manager approves late/missing)
7. Implement break time tracking (start/end)

**B. Shift Management**
```prisma
model Shift {
  id          String   @id @default(auto())
  companyId   String   @db.ObjectId
  name        String   // "Morning", "Evening", "Night"
  startTime   String   // "09:00"
  endTime     String   // "18:00"
  breakStart  String?  // "13:00"
  breakEnd    String?  // "14:00"
  gracePeriod Int      // Minutes (e.g., 15)
  isOvernight Boolean  @default(false)
}

model EmployeeShift {
  employeeId  String   @db.ObjectId
  shiftId     String   @db.ObjectId
  startDate   DateTime
  endDate     DateTime?
  // Employee can have different shifts on different days
}
```

**Implementation Steps**:
1. Create shift catalog (Morning, Evening, Night, Custom)
2. Assign shifts to employees (individual or bulk)
3. Implement shift rotation (weekly/monthly rotation)
4. Add holiday calendar assignment
5. Create shift swap request workflow

**C. Overtime Management**
```typescript
POST /api/v1/hr/attendance/overtime/request
{
  "employeeId": "xxx",
  "date": "2024-03-08",
  "startTime": "18:00",
  "endTime": "21:00",
  "reason": "Month-end closing",
  "approvedBy": "manager-id"
}
```

**Implementation Steps**:
1. Create overtime request form
2. Implement approval workflow
3. Calculate overtime hours (1.5x, 2x based on labor law)
4. Integrate with payroll (auto-add to salary)
5. Generate overtime report (monthly/quarterly)

**D. Attendance Policies**
```typescript
// Company settings for attendance
{
  "workDaysPerWeek": 6,          // Sunday-Friday
  "gracePeriodMinutes": 15,      // Late arrival buffer
  "lateArrivalThreshold": 3,     // Late arrivals before action
  "halfDayHours": 4,             // Hours for half-day leave
  "autoMarkAbsentAfter": 4,      // Hours without check-in
  "overtimeMultiplier": 1.5,     // 1.5x pay for overtime
  "fridayOvertimeMultiplier": 2.0 // 2x on Friday
}
```

**Implementation Steps**:
1. Create attendance policy configuration
2. Implement late arrival calculation
3. Add half-day leave auto-detection
4. Build absenteeism alerts (no-show)
5. Create attendance regularization (manager approves missing)

#### **Database Schema**
```prisma
model Attendance {
  id              String   @id @default(auto())
  companyId       String   @db.ObjectId
  branchId        String   @db.ObjectId
  employeeId      String   @db.ObjectId
  date            DateTime @db.Date
  shiftId         String?  @db.ObjectId
  checkIn         DateTime?
  checkOut        DateTime?
  checkInMethod   String?  // WEB, MOBILE, BIOMETRIC, POS
  checkInLocation String?  // Geo coordinates
  checkOutMethod  String?
  checkOutLocation String?
  status          String   // PRESENT, ABSENT, LATE, HALF_DAY, HOLIDAY
  lateMinutes     Int      @default(0)
  earlyDepartureMinutes Int @default(0)
  overtimeMinutes Int      @default(0)
  breakStart      DateTime?
  breakEnd        DateTime?
  workHours       Float    // Calculated hours worked
  notes           String?
  
  employee        Employee @relation(fields: [employeeId], references: [id])
  shift           Shift?   @relation(fields: [shiftId], references: [id])
  
  @@unique([companyId, employeeId, date])
  @@index([companyId, date, status])
  @@index([employeeId, date])
  @@map("attendance")
}

model Leave {
  id              String   @id @default(auto())
  companyId       String   @db.ObjectId
  employeeId      String   @db.ObjectId
  leaveTypeId     String   @db.ObjectId
  startDate       DateTime
  endDate         DateTime
  days            Int
  reason          String?
  status          String   // PENDING, APPROVED, REJECTED, CANCELLED
  appliedDate     DateTime @default(now())
  approvedById    String?  @db.ObjectId
  approvedDate    DateTime?
  rejectionReason String?
  
  employee        Employee @relation(fields: [employeeId], references: [id])
  leaveType       LeaveType @relation(fields: [leaveTypeId], references: [id])
  
  @@index([companyId, employeeId, status])
  @@map("leaves")
}

model LeaveType {
  id          String   @id @default(auto())
  companyId   String   @db.ObjectId
  name        String   // Annual, Sick, Emergency, Hajj, Maternity
  code        String
  paid        Boolean  @default(true)
  requiresApproval Boolean @default(true)
  maxDaysPerYear Int?
  accrualRate Float?   // Days per month
  carryForwardLimit Int? // Max days that can be carried to next year
}
```

#### **UI Components**
1. **Attendance Dashboard**
   - Today's stats: Present, Absent, Late, On Leave
   - Check-in/out timeline (graph)
   - Department-wise attendance pie chart
   - Late arrivals list (today/this week)
   - Quick actions: Mark Attendance, Import Attendance, Export Report

2. **Attendance Calendar**
   - Monthly calendar view
   - Color-coded days: Green (Present), Red (Absent), Yellow (Late), Blue (Leave)
   - Hover tooltip: Check-in time, Check-out time, Work hours, Late minutes
   - Click to view/edit day details

3. **Attendance Report**
   - Date range selector
   - Employee/Department/Branch filters
   - Summary table: Employee, Working Days, Present, Absent, Late, Work Hours, Overtime
   - Export to Excel/PDF
   - Graph: Attendance trend over time

---

### 2.2 Leave Management

#### **Purpose**
- Manage employee time-off requests
- Track leave balances and accruals
- Ensure adequate staffing levels
- Comply with labor law leave entitlements

#### **Features**

**A. Leave Types (Saudi Labor Law)**
```
1. Annual Leave: 21 days paid (increases to 30 after 5 years)
2. Sick Leave: Up to 30 days (first 10 full pay, next 20 half pay)
3. Emergency Leave: 3-5 days paid
4. Hajj Leave: 10-15 days once during employment
5. Maternity Leave: 10 weeks full pay
6. Paternity Leave: 3 days
7. Bereavement Leave: 3-5 days (immediate family)
8. Study Leave: As per company policy
9. Unpaid Leave: As approved by manager
```

**B. Leave Accrual System**
```typescript
// Monthly accrual calculation
function calculateLeaveAccrual(employee) {
  const annualLeaveDays = employee.yearsOfService >= 5 ? 30 : 21;
  const monthlyAccrual = annualLeaveDays / 12; // 1.75 or 2.5 days/month
  
  return {
    annualLeave: monthlyAccrual,
    sickLeave: 2.5, // 30 days / 12
    emergencyLeave: 0.5 // 6 days / 12
  };
}
```

**Implementation Steps**:
1. Create leave type catalog per company
2. Implement accrual engine (monthly cron job)
3. Build leave request form (employee)
4. Create approval workflow (manager → HR)
5. Add leave balance checking (real-time)
6. Implement leave encashment (end of service)
7. Generate leave utilization reports

**C. Leave Approval Workflow**
```typescript
// Multi-level approval
Employee Request → Manager Approval → HR Approval → Approved

// Auto-approval rules
if (leaveDays <= 3 && leaveType === 'SICK') {
  autoApprove = true; // For short sick leaves with medical certificate
}

if (leaveDays > 30) {
  requiresCFOApproval = true; // Long leaves need finance approval
}
```

#### **UI Components**
1. **Leave Request Form**
   - Leave type dropdown (shows balance next to each type)
   - Date range picker (with working days calculator)
   - Reason text area
   - Attachment upload (medical certificate for sick leave)
   - Submit button

2. **Leave Dashboard (Manager)**
   - Pending approvals list
   - Team calendar (who's on leave when)
   - Quick approve/reject actions
   - Team leave balance summary

3. **Leave Balance View (Employee)**
   - Current year accrual: 21 days
   - Used: 10 days
   - Pending: 2 days
   - Balance: 9 days
   - Projected next month: 10.75 days

---

## Phase 3: Payroll Management
**Duration**: 4-5 weeks  
**Priority**: CRITICAL  
**Purpose**: Automated, compliant payroll processing

### 3.1 Salary Structure

#### **Purpose**
- Define comprehensive salary components
- Comply with Saudi wage protection system
- Enable flexible salary configurations

#### **Features**

**A. Salary Components**
```typescript
Earnings:
- Basic Salary (60-70% of total)
- Housing Allowance (25% or actual rent)
- Transport Allowance (10% or fixed)
- Phone Allowance (fixed)
- Food Allowance (fixed)
- Overtime Pay (calculated)
- Commission (from POS sales)
- Bonus (performance-based)

Deductions:
- GOSI (10% employee + 12% employer)
- Employee Loans
- Salary Advances
- Absence Deductions
- Penalties (disciplinary)
```

**B. Salary Configuration**
```prisma
model SalaryStructure {
  id          String   @id @default(auto())
  companyId   String   @db.ObjectId
  employeeId  String   @db.ObjectId
  effectiveFrom DateTime
  effectiveTo DateTime?
  
  basicSalary Float
  housingAllowance Float
  transportAllowance Float
  phoneAllowance Float
  foodAllowance Float
  otherAllowances Float
  
  totalGrossSalary Float // Calculated
  
  gosipctEmployee Float @default(10) // 10%
  gosipctEmployer Float @default(12) // 12%
}
```

**Implementation Steps**:
1. Create salary structure per employee
2. Implement allowance calculations
3. Add GOSI calculation (with ceiling)
4. Build loan installment tracking
5. Create commission calculation (from POS)
6. Implement pro-rated salary (for partial months)

### 3.2 Payroll Processing

#### **Purpose**
- Process monthly salaries accurately
- Generate payslips automatically
- Create accounting entries
- Ensure timely payment

#### **Features**

**A. Monthly Payroll Cycle**
```typescript
// Payroll processing workflow
1. Lock attendance (final day of month)
2. Calculate overtime (from approved requests)
3. Calculate deductions (loans, advances, absence)
4. Add commissions (from POS sales)
5. Generate draft payroll
6. HR review & approval
7. Finance approval
8. Bank transfer file generation
9. Mark as paid
```

**B. Payroll Calculation**
```typescript
function calculatePayroll(employee, month) {
  const attendance = getAttendance(employee.id, month);
  const salaryStruct = getSalaryStructure(employee.id);
  
  // Earnings
  const basic = salaryStruct.basicSalary;
  const allowances = salaryStruct.housingAllowance + 
                     salaryStruct.transportAllowance + 
                     salaryStruct.otherAllowances;
  
  const overtimePay = calculateOvertimePay(attendance.overtimeMinutes);
  const commission = getSalesCommission(employee.id, month);
  
  // Deductions
  const absenceDeduction = calculateAbsenceDeduction(attendance.absentDays, basic);
  const loanInstallment = getLoanInstallment(employee.id, month);
  const gosipEmployee = basic * 0.10;
  
  // Net Salary
  const grossSalary = basic + allowances;
  const totalEarnings = grossSalary + overtimePay + commission;
  const totalDeductions = absenceDeduction + loanInstallment + gosipEmployee;
  const netSalary = totalEarnings - totalDeductions;
  
  return {
    grossSalary,
    totalEarnings,
    totalDeductions,
    netSalary,
    breakdown: { ... }
  };
}
```

**C. Payroll Journal Entry**
```typescript
// Auto-create accounting entry
POST /api/v1/accounting/journal-entries
{
  "date": "2024-03-31",
  "description": "Salary Accrual - March 2024",
  "lines": [
    {
      "accountId": "salary-expense",
      "debit": 100000,  // Gross salary
      "description": "March 2024 Salaries"
    },
    {
      "accountId": "bank",
      "credit": 85000,  // Net salary
      "description": "Bank Transfer"
    },
    {
      "accountId": "gosi-payable",
      "credit": 10000,  // Employee GOSI
      "description": "GOSI Employee Share"
    },
    {
      "accountId": "gosi-expense",
      "debit": 12000,   // Employer GOSI
      "description": "GOSI Employer Share"
    },
    {
      "accountId": "gosi-payable",
      "credit": 12000,  // Total GOSI payable
      "description": "Total GOSI Liability"
    },
    {
      "accountId": "loans-payable",
      "credit": 5000,   // Loan recoveries
      "description": "Employee Loan Deductions"
    }
  ]
}
```

#### **Database Schema**
```prisma
model Payroll {
  id              String   @id @default(auto())
  companyId       String   @db.ObjectId
  employeeId      String   @db.ObjectId
  month           DateTime @db.Date // First day of month
  periodStart     DateTime
  periodEnd       DateTime
  
  // Earnings
  basicSalary     Float
  housingAllowance Float
  transportAllowance Float
  phoneAllowance  Float
  foodAllowance   Float
  overtimePay     Float
  commission      Float
  bonus           Float
  otherEarnings Float
  
  // Deductions
  absenceDeduction Float
  loanDeduction   Float
  advanceDeduction Float
  penaltyDeduction Float
  gosiEmployee    Float
  otherDeductions Float
  
  // Totals
  grossSalary     Float
  totalEarnings   Float
  totalDeductions Float
  netSalary       Float
  
  // Status
  status          String   // DRAFT, PROCESSED, APPROVED, PAID
  paymentDate     DateTime?
  paymentMethod   String?  // BANK_TRANSFER, CASH, CHEQUE
  bankReference   String?
  
  // Accounting
  journalEntryId  String?  @db.ObjectId
  
  employee        Employee @relation(fields: [employeeId], references: [id])
  journalEntry    JournalEntry? @relation(fields: [journalEntryId], references: [id])
  
  @@unique([companyId, employeeId, month])
  @@index([companyId, month, status])
  @@map("payroll")
}

model EmployeeLoan {
  id              String   @id @default(auto())
  companyId       String   @db.ObjectId
  employeeId      String   @db.ObjectId
  loanType        String   // Personal, Car, Housing
  principalAmount Float
  interestRate    Float?
  totalAmount     Float
  monthlyInstallment Float
  startDate       DateTime
  endDate         DateTime
  remainingBalance Float
  status          String   // ACTIVE, CLOSED
  
  employee        Employee @relation(fields: [employeeId], references: [id])
  
  @@map("employee_loans")
}
```

#### **UI Components**
1. **Payroll Dashboard**
   - This month's stats: Processed, Pending, Paid
   - Total payroll cost (graph by department)
   - Quick actions: Process Payroll, View Reports, Generate Bank File
   - Alerts: Employees without salary structure, Pending loan deductions

2. **Payroll Processing Wizard**
   - Step 1: Select Month & Branch
   - Step 2: Review Attendance (present days, overtime, absences)
   - Step 3: Review Deductions (loans, advances, penalties)
   - Step 4: Review Additions (commission, bonus)
   - Step 5: Calculate & Preview
   - Step 6: Approve & Process
   - Step 7: Generate Bank File

3. **Payslip View**
   - Company header with logo
   - Employee details (name, ID, department, position)
   - Payment period & date
   - Earnings table (Basic, Allowances, Overtime, etc.)
   - Deductions table (GOSI, Loans, Absence, etc.)
   - Net Pay (prominent display)
   - YTD totals
   - Download PDF button
   - Email to employee button

4. **Bank Transfer File**
   - Select bank (Al Rajhi, SNB, Riyad Bank, etc.)
   - Generate WPS (Wage Protection System) file
   - Preview total amount & employee count
   - Download SIE/CBS file format
   - Mark as paid after transfer

---

### 3.3 End of Service Benefits (EOSB)

#### **Purpose**
- Calculate gratuity as per Saudi labor law
- Handle resignation vs termination differently
- Generate EOSB settlement report

#### **Features**

**A. EOSB Calculation (Saudi Labor Law)**
```typescript
function calculateEOSB(employee) {
  const yearsOfService = calculateYearsOfService(employee.hireDate, employee.terminationDate);
  const lastDrawnSalary = employee.salary;
  
  let eosb = 0;
  
  if (employee.terminationReason === 'RESIGNATION') {
    if (yearsOfService < 2) {
      eosb = 0; // No gratuity for less than 2 years
    } else if (yearsOfService >= 2 && yearsOfService < 5) {
      eosb = (lastDrawnSalary / 2) * yearsOfService; // Half month per year
    } else {
      eosb = (lastDrawnSalary / 2) * 5 + (lastDrawnSalary) * (yearsOfService - 5);
    }
    // Resignation: 1/3 reduction if < 5 years, full if >= 5 years
    if (yearsOfService < 5) {
      eosb = eosb * (2/3);
    }
  } else if (employee.terminationReason === 'TERMINATION_BY_EMPLOYER') {
    // Full gratuity regardless of service length
    if (yearsOfService < 5) {
      eosb = (lastDrawnSalary / 2) * yearsOfService;
    } else {
      eosb = (lastDrawnSalary / 2) * 5 + (lastDrawnSalary) * (yearsOfService - 5);
    }
  }
  
  // Deduct any outstanding loans/advances
  const outstandingLoans = getOutstandingLoans(employee.id);
  const netEOSB = eosb - outstandingLoans;
  
  return {
    yearsOfService,
    lastDrawnSalary,
    grossEOSB: eosb,
    deductions: outstandingLoans,
    netEOSB: netEOSB
  };
}
```

**Implementation Steps**:
1. Create EOSB calculation engine
2. Implement resignation workflow (notice period, handover)
3. Add termination workflow (clearance from all departments)
4. Generate EOSB settlement report
5. Create accounting entry for EOSB payment
6. Generate experience letter

---

## Phase 4: Recruitment & Onboarding
**Duration**: 3-4 weeks  
**Priority**: MEDIUM  
**Purpose**: Streamline hiring process

### 4.1 Job Requisition

#### **Purpose**
- Formalize hiring requests
- Budget approval workflow
- Track open positions

**Implementation Steps**:
1. Create job requisition form (position, justification, budget)
2. Implement approval workflow (manager → HR → finance)
3. Track requisition status (draft, pending, approved, rejected)
4. Link to recruitment pipeline

### 4.2 Applicant Tracking System (ATS)

#### **Purpose**
- Manage candidate pipeline
- Schedule interviews efficiently
- Improve candidate experience

**Features**:
```typescript
Candidate Stages:
Applied → Screening → Interview 1 → Interview 2 → Offer → Hired

// OR rejected at any stage
```

**Implementation Steps**:
1. Create career page (public job listings)
2. Implement application form
3. Add resume parsing (extract name, email, experience, skills)
4. Create candidate database
5. Build interview scheduling (calendar integration)
6. Add interview feedback forms
7. Generate offer letters
8. Implement background verification tracking

### 4.3 Onboarding

#### **Purpose**
- Structured onboarding experience
- Ensure compliance
- Reduce time-to-productivity

**Features**:
```typescript
Onboarding Checklist:
□ Employment contract signed
□ Iqama/ID copies collected
□ Bank account details submitted
□ IT equipment assigned (laptop, phone)
□ Email account created
□ Access cards issued
□ Orientation scheduled
□ Buddy assigned
□ 30-day check-in meeting
□ 60-day check-in meeting
□ 90-day performance review
```

**Implementation Steps**:
1. Create onboarding checklist template
2. Assign tasks to stakeholders (IT, Admin, Manager)
3. Track completion status
4. Send automated reminders
5. Collect feedback from new hire

---

## Phase 5: Performance Management
**Duration**: 3-4 weeks  
**Priority**: MEDIUM  
**Purpose**: Drive employee performance

### 5.1 Goal Setting

#### **Purpose**
- Align individual goals with company objectives
- Track progress throughout the year

**Features**:
```typescript
Goal Structure:
- Goal title
- Description
- KPIs (measurable outcomes)
- Target value
- Weight (%)
- Deadline
- Status (Not Started, In Progress, Achieved, Overachieved)
```

**Implementation Steps**:
1. Create goal template library
2. Implement goal setting workflow (employee → manager approval)
3. Add progress tracking (monthly updates)
4. Build goal alignment (individual → team → company)

### 5.2 Performance Reviews

#### **Purpose**
- Formal performance evaluation
- Identify high performers
- Address performance gaps

**Features**:
```typescript
Review Types:
- Annual Review (comprehensive)
- Mid-Year Review (check-in)
- Probation Review (confirmation)
- 360-Degree Feedback (peer, manager, subordinate)
```

**Implementation Steps**:
1. Create review cycle setup (annual, mid-year)
2. Build self-assessment form
3. Implement manager assessment
4. Add 360-degree feedback (optional)
5. Generate review report
6. Create PIP (Performance Improvement Plan) for underperformers

---

## Phase 6: Training & Development
**Duration**: 2-3 weeks  
**Priority**: LOW  
**Purpose**: Upskill workforce

### 6.1 Training Management

#### **Purpose**
- Track employee training
- Manage training budget
- Measure training effectiveness

**Features**:
```typescript
Training Types:
- Mandatory (compliance, safety)
- Technical (job-specific skills)
- Soft Skills (communication, leadership)
- External (certifications, workshops)
```

**Implementation Steps**:
1. Create training catalog
2. Implement training request workflow
3. Add training calendar
4. Track training attendance
5. Collect post-training feedback
6. Calculate training ROI

---

## Phase 7: Employee Self-Service
**Duration**: 2-3 weeks  
**Priority**: HIGH  
**Purpose**: Empower employees, reduce HR admin

### 7.1 Employee Portal

#### **Features**
```typescript
Employee Can:
✓ View payslips
✓ Apply for leave
✓ Check attendance
✓ Update personal info
✓ Request letters
✓ Submit expense claims
✓ View company policies
✓ Enroll in training
```

**Implementation Steps**:
1. Create employee dashboard
2. Implement leave application
3. Add payslip viewer
4. Build profile update form
5. Create letter request workflow

### 7.2 Manager Portal

#### **Features**
```typescript
Manager Can:
✓ Approve/reject leave requests
✓ View team attendance
✓ Approve timesheets
✓ Conduct performance reviews
✓ Request recruitment
```

**Implementation Steps**:
1. Create manager dashboard
2. Implement approval queue
3. Add team overview (attendance, leave, performance)
4. Build recruitment request form

---

## Phase 8: Analytics & Reporting
**Duration**: 2-3 weeks  
**Priority**: MEDIUM  
**Purpose**: Data-driven HR decisions

### 8.1 Standard Reports

**Attendance Reports**:
- Monthly attendance summary
- Late arrivals report
- Absenteeism analysis
- Overtime report

**Leave Reports**:
- Leave utilization by department
- Leave balance report
- Leave trend analysis

**Payroll Reports**:
- Monthly payroll cost by department
- Salary breakdown (earnings vs deductions)
- Overtime cost analysis
- Loan recovery report

**Recruitment Reports**:
- Time to fill
- Cost per hire
- Source effectiveness
- Offer acceptance rate

**Performance Reports**:
- Performance distribution
- Goal achievement rate
- High potential employees

### 8.2 HR Dashboard

**Key Metrics**:
- Headcount (current vs previous month)
- Turnover rate (monthly, quarterly, annual)
- Absenteeism rate
- Overtime cost
- Training hours per employee
- Revenue per employee

---

## Integration Strategy

### Integration with POS Module
```typescript
// Auto-attendance via POS login
POST /api/v1/pos/shifts/open
{
  "employeeId": "xxx",
  "terminalId": "xxx"
}

// Trigger HR attendance
await prisma.attendance.create({
  data: {
    employeeId,
    date: new Date(),
    checkIn: new Date(),
    checkInMethod: 'POS',
    status: 'PRESENT'
  }
});

// Sales commission calculation
GET /api/v1/hr/payroll/commission?employeeId=xxx&month=2024-03
{
  "totalSales": 150000,
  "commissionRate": 0.02,
  "commissionAmount": 3000
}
```

### Integration with Accounting Module
```typescript
// Payroll journal entry
POST /api/v1/accounting/journal-entries
{
  "sourceType": "PAYROLL",
  "sourceId": "payroll-id",
  "lines": [...]
}

// Employee loan booking
POST /api/v1/accounting/journal-entries
{
  "sourceType": "EMPLOYEE_LOAN",
  "lines": [
    { "accountId": "loans-receivable", "debit": 10000 },
    { "accountId": "bank", "credit": 10000 }
  ]
}
```

### Integration with Inventory Module
```typescript
// Asset assignment to employee
POST /api/v1/inventory/assets/assign
{
  "assetId": "xxx",
  "assignedTo": "employee-id",
  "assignedType": "EMPLOYEE"
}

// Asset return during exit
POST /api/v1/inventory/assets/return
{
  "assetId": "xxx",
  "reason": "EMPLOYEE_EXIT"
}
```

---

## Testing Strategy

### Unit Tests
```typescript
// Test EOSB calculation
describe('calculateEOSB', () => {
  test('should return 0 for service < 2 years', () => {
    const result = calculateEOSB({
      hireDate: '2023-01-01',
      terminationDate: '2024-01-01',
      salary: 10000,
      reason: 'RESIGNATION'
    });
    expect(result.netEOSB).toBe(0);
  });
  
  test('should calculate half-month salary for 2-5 years', () => {
    // Test implementation
  });
});
```

### Integration Tests
```typescript
// Test payroll processing
describe('Payroll Integration Test', () => {
  test('should process payroll and create journal entry', async () => {
    // Create employee
    // Create attendance
    // Create salary structure
    // Process payroll
    // Verify journal entry created
  });
});
```

### E2E Tests
```typescript
// Test employee onboarding flow
describe('Employee Onboarding E2E', () => {
  test('complete onboarding flow', async () => {
    // Login as HR
    // Create employee
    // Assign assets
    // Enroll in training
    // Verify employee portal access
  });
});
```

---

## Deployment Plan

### Phase 1: Employee Management
**Week 1-2**: Database schema, CRUD APIs  
**Week 3**: UI components  
**Week 4**: Testing & bug fixes

### Phase 2: Attendance & Leave
**Week 1-2**: Attendance tracking, shift management  
**Week 3**: Leave management  
**Week 4**: Integration with POS, testing

### Phase 3: Payroll
**Week 1-2**: Salary structure, payroll calculation  
**Week 3**: EOSB, bank integration  
**Week 4**: Accounting integration, UAT

### Phase 4-8: Roll out remaining features incrementally

---

## Success Metrics

1. **Employee Data Accuracy**: 100% complete employee records
2. **Payroll Processing Time**: Reduced from 5 days to 1 day
3. **Attendance Compliance**: 95%+ check-in compliance
4. **Leave Processing Time**: Auto-approval for 80% of requests
5. **Employee Satisfaction**: 90%+ satisfaction with self-service portal
6. **Compliance**: 100% GOSI, EOSB, labor law compliance

---

## Risk Mitigation

1. **Data Migration**: Backup existing employee data, test migration scripts
2. **User Adoption**: Training sessions, user manuals, helpdesk support
3. **Integration Issues**: Comprehensive testing, rollback plan
4. **Performance**: Database indexing, query optimization, caching
5. **Security**: Role-based access, audit logs, data encryption

---

## Conclusion

This HR module implementation plan provides a comprehensive roadmap for building a feature-rich, integrated HR system. Each phase builds upon the previous one, ensuring a solid foundation before adding advanced features.

**Estimated Total Timeline**: 18-24 weeks (4-6 months)  
**Team Required**: 2-3 backend developers, 2 frontend developers, 1 QA engineer, 1 product manager

The modular architecture allows for parallel development and phased rollout, minimizing disruption to business operations while delivering value incrementally.
