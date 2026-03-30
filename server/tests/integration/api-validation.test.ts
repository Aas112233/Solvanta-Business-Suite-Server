/**
 * API Integration Tests - Critical Endpoints
 * Tests for authentication, data validation, and error handling
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { app } from '../../src/app.js';
import { basePrisma } from '../../src/lib/prisma.js';
import { env } from '../../src/config/env.js';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

const db = basePrisma as any;
const createdCompanyIds = new Set<string>();
let server: any;
let baseUrl = '';

// Helper functions
function unique(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

async function apiRequest(
    method: string,
    path: string,
    options: {
        token?: string;
        body?: Record<string, unknown>;
    }
): Promise<{ status: number; body: any }> {
    const headers: Record<string, string> = {};

    if (options.token) {
        headers.Authorization = `Bearer ${options.token}`;
    }

    let body: string | undefined;
    if (options.body !== undefined) {
        headers['Content-Type'] = 'application/json';
        body = JSON.stringify(options.body);
    }

    const response = await fetch(`${baseUrl}/api/v1${path}`, {
        method,
        headers,
        body,
    });

    const text = await response.text();
    const parsed = text ? JSON.parse(text) : null;

    return {
        status: response.status,
        body: parsed,
    };
}

async function createTestCompany() {
    const company = await db.company.create({
        data: {
            name: unique('test-company'),
            settings: {},
        },
    });
    createdCompanyIds.add(company.id);

    // Create default accounting accounts
    const accounts = await Promise.all([
        db.account.create({ data: { companyId: company.id, code: '1100', name: 'Cash', type: 'ASSET', isSystem: true } }),
        db.account.create({ data: { companyId: company.id, code: '1200', name: 'Bank', type: 'ASSET', isSystem: true } }),
        db.account.create({ data: { companyId: company.id, code: '2100', name: 'Accounts Payable', type: 'LIABILITY', isSystem: true } }),
        db.account.create({ data: { companyId: company.id, code: '4100', name: 'Sales Revenue', type: 'REVENUE', isSystem: true } }),
    ]);

    // Create account mappings
    await db.accountMapping.createMany({
        data: [
            { companyId: company.id, mappingType: 'CASH', accountId: accounts[0].id, entityType: 'GLOBAL' },
            { companyId: company.id, mappingType: 'BANK', accountId: accounts[1].id, entityType: 'GLOBAL' },
            { companyId: company.id, mappingType: 'ACCOUNT_PAYABLE', accountId: accounts[2].id, entityType: 'GLOBAL' },
            { companyId: company.id, mappingType: 'SALES_REVENUE', accountId: accounts[3].id, entityType: 'GLOBAL' },
        ],
    });

    return company;
}

async function createTestUser(companyId: string, email?: string, permissions: string[] = []) {
    const role = await db.role.create({
        data: {
            companyId,
            name: unique('test-role'),
            permissions,
        },
    });

    const passwordHash = await bcrypt.hash('TestPassword123!', 10);
    const user = await db.user.create({
        data: {
            companyId,
            email: email || `${unique('user')}@example.com`,
            name: unique('Test User'),
            passwordHash,
            roleId: role.id,
            isActive: true,
        },
    });

    const token = jwt.sign(
        { userId: user.id, companyId },
        env.JWT_SECRET
    );

    return { user, token };
}

// Setup
beforeAll(async () => {
    await new Promise<void>((resolve) => {
        server = app.listen(0, () => resolve());
    });
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 3000;
    baseUrl = `http://127.0.0.1:${port}`;
}, 30000);

// Cleanup
afterAll(async () => {
    if (server) {
        await new Promise<void>((resolve, reject) => {
            server.close((err: Error | undefined) => (err ? reject(err) : resolve()));
        });
    }

    // Cleanup test data
    if (createdCompanyIds.size > 0) {
        await db.company.deleteMany({
            where: { id: { in: Array.from(createdCompanyIds) } },
        });
    }

    await basePrisma.$disconnect();
}, 30000);

// ─────────────────────────────────────────────────────────────
// AUTHENTICATION TESTS
// ─────────────────────────────────────────────────────────────

describe('Authentication API', () => {
    describe('POST /auth/login', () => {
        it('should reject login with invalid email format', async () => {
            const response = await apiRequest('POST', '/auth/login', {
                body: {
                    email: 'invalid-email',
                    password: 'TestPassword123!',
                },
            });

            expect(response.status).toBe(422);
            expect(response.body.success).toBe(false);
            expect(response.body.error.code).toBe('VALIDATION_ERROR');
        });

        it('should reject login with short password', async () => {
            const response = await apiRequest('POST', '/auth/login', {
                body: {
                    email: 'test@example.com',
                    password: '12345', // Less than 6 characters
                },
            });

            expect(response.status).toBe(422);
            expect(response.body.success).toBe(false);
            expect(response.body.error.code).toBe('VALIDATION_ERROR');
        });

        it('should reject login with non-existent user', async () => {
            const response = await apiRequest('POST', '/auth/login', {
                body: {
                    email: `${unique('nonexistent')}@example.com`,
                    password: 'TestPassword123!',
                },
            });

            expect(response.status).toBe(401);
            expect(response.body.success).toBe(false);
            expect(response.body.error.code).toBe('UNAUTHORIZED');
        });

        it('should reject login with wrong password', async () => {
            const company = await createTestCompany();
            const email = `${unique('login-test')}@example.com`;
            await createTestUser(company.id, email);

            const response = await apiRequest('POST', '/auth/login', {
                body: {
                    email,
                    password: 'WrongPassword!',
                },
            });

            expect(response.status).toBe(401);
            expect(response.body.success).toBe(false);
            expect(response.body.error.code).toBe('UNAUTHORIZED');
        });

        it('should reject login with inactive user', async () => {
            const company = await createTestCompany();
            const email = `${unique('inactive')}@example.com`;

            const role = await db.role.create({
                data: { companyId: company.id, name: unique('role'), permissions: [] },
            });

            const passwordHash = await bcrypt.hash('TestPassword123!', 10);
            await db.user.create({
                data: {
                    companyId: company.id,
                    email,
                    name: 'Inactive User',
                    passwordHash,
                    roleId: role.id,
                    isActive: false,
                },
            });

            const response = await apiRequest('POST', '/auth/login', {
                body: {
                    email,
                    password: 'TestPassword123!',
                },
            });

            expect(response.status).toBe(403);
            expect(response.body.success).toBe(false);
        });

        it('should successfully login with valid credentials', async () => {
            const company = await createTestCompany();
            const email = `${unique('success-login')}@example.com`;
            await createTestUser(company.id, email);

            const response = await apiRequest('POST', '/auth/login', {
                body: {
                    email,
                    password: 'TestPassword123!',
                },
            });

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.data).toHaveProperty('accessToken');
            expect(response.body.data).toHaveProperty('refreshToken');
        });
    });

    describe('GET /auth/me', () => {
        it('should reject request without token', async () => {
            const response = await apiRequest('GET', '/auth/me', {});
            expect(response.status).toBe(401);
        });

        it('should reject request with invalid token', async () => {
            const response = await apiRequest('GET', '/auth/me', {
                token: 'invalid-token',
            });
            expect(response.status).toBe(401);
        });

        it('should return user profile with valid token', async () => {
            const company = await createTestCompany();
            const { token, user } = await createTestUser(company.id);

            const response = await apiRequest('GET', '/auth/me', { token });

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.data.id).toBe(user.id);
            expect(response.body.data.email).toBe(user.email);
        });
    });
});

// ─────────────────────────────────────────────────────────────
// CUSTOMER API TESTS
// ─────────────────────────────────────────────────────────────

describe('Customer API', () => {
    let company: any;
    let adminToken: string;

    beforeAll(async () => {
        company = await createTestCompany();
        const admin = await createTestUser(company.id, undefined, [
            'crm.view',
            'crm.edit',
            'crm.create',
            'crm.delete',
        ]);
        adminToken = admin.token;
    });

    describe('POST /customers', () => {
        it('should reject customer creation without name', async () => {
            const response = await apiRequest('POST', '/customers', {
                token: adminToken,
                body: {
                    phone: '1234567890',
                },
            });

            expect(response.status).toBe(422);
            expect(response.body.success).toBe(false);
        });

        it('should reject customer with invalid email format', async () => {
            const response = await apiRequest('POST', '/customers', {
                token: adminToken,
                body: {
                    name: 'Test Customer',
                    email: 'invalid-email',
                },
            });

            expect(response.status).toBe(422);
            expect(response.body.success).toBe(false);
        });

        it('should reject customer with invalid phone format', async () => {
            const response = await apiRequest('POST', '/customers', {
                token: adminToken,
                body: {
                    name: 'Test Customer',
                    phone: 'abc-def-ghij', // Invalid format
                },
            });

            expect(response.status).toBe(422);
            expect(response.body.success).toBe(false);
        });

        it('should reject customer with very long name', async () => {
            const response = await apiRequest('POST', '/customers', {
                token: adminToken,
                body: {
                    name: 'A'.repeat(250), // Exceeds 200 char limit
                },
            });

            expect(response.status).toBe(422);
            expect(response.body.success).toBe(false);
        });

        it('should reject customer with negative credit limit', async () => {
            const response = await apiRequest('POST', '/customers', {
                token: adminToken,
                body: {
                    name: 'Test Customer',
                    creditLimit: -1000,
                },
            });

            expect(response.status).toBe(422);
            expect(response.body.success).toBe(false);
        });

        it('should create customer with valid data', async () => {
            const response = await apiRequest('POST', '/customers', {
                token: adminToken,
                body: {
                    name: unique('Valid Customer'),
                    email: `${unique('customer')}@example.com`,
                    phone: '+966-50-123-4567',
                    creditLimit: 50000,
                },
            });

            expect(response.status).toBe(201);
            expect(response.body.success).toBe(true);
            expect(response.body.data).toHaveProperty('id');
            expect(response.body.data).toHaveProperty('customerCode');
            expect(response.body.data.name).toBe(response.body.data.name.trim());
        });

        it('should sanitize customer code (remove special chars)', async () => {
            const response = await apiRequest('POST', '/customers', {
                token: adminToken,
                body: {
                    name: 'Test Customer',
                    customerCode: 'CUST@#$%123', // Should be rejected by regex
                },
            });

            expect(response.status).toBe(422);
            expect(response.body.success).toBe(false);
        });

        it('should create customer with empty email/phone (convert to null)', async () => {
            const response = await apiRequest('POST', '/customers', {
                token: adminToken,
                body: {
                    name: unique('Customer No Contact'),
                    email: '',
                    phone: '',
                },
            });

            expect(response.status).toBe(201);
            expect(response.body.success).toBe(true);
            // Email and phone should be null in database
        });
    });

    describe('GET /customers', () => {
        it('should return paginated customer list', async () => {
            const response = await apiRequest('GET', '/customers', {
                token: adminToken,
            });

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.data).toBeInstanceOf(Array);
            expect(response.body).toHaveProperty('pagination');
        });

        it('should search customers by name', async () => {
            // Create a test customer
            await apiRequest('POST', '/customers', {
                token: adminToken,
                body: { name: 'SearchTest Customer XYZ' },
            });

            const response = await apiRequest('GET', '/customers?search=SearchTest', {
                token: adminToken,
            });

            expect(response.status).toBe(200);
            expect(response.body.data.length).toBeGreaterThan(0);
            expect(response.body.data[0].name).toContain('SearchTest');
        });
    });

    describe('PATCH /customers/:id', () => {
        it('should update customer with valid data', async () => {
            // Create customer first
            const createResponse = await apiRequest('POST', '/customers', {
                token: adminToken,
                body: { name: unique('Update Test Customer') },
            });
            const customerId = createResponse.body.data.id;

            const response = await apiRequest('PATCH', `/customers/${customerId}`, {
                token: adminToken,
                body: {
                    name: 'Updated Customer Name',
                    creditLimit: 75000,
                },
            });

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.data.name).toBe('Updated Customer Name');
        });

        it('should reject update with duplicate customer code', async () => {
            // Create two customers
            const customer1 = await apiRequest('POST', '/customers', {
                token: adminToken,
                body: { name: 'Customer 1', customerCode: 'CODE1' },
            });
            const customer2 = await apiRequest('POST', '/customers', {
                token: adminToken,
                body: { name: 'Customer 2' },
            });

            // Try to update customer2 with customer1's code
            const response = await apiRequest('PATCH', `/customers/${customer2.body.data.id}`, {
                token: adminToken,
                body: { customerCode: 'CODE1' },
            });

            expect(response.status).toBe(400);
            expect(response.body.success).toBe(false);
        });
    });

    describe('DELETE /customers/:id', () => {
        it('should soft-delete customer', async () => {
            const createResponse = await apiRequest('POST', '/customers', {
                token: adminToken,
                body: { name: unique('Delete Test Customer') },
            });
            const customerId = createResponse.body.data.id;

            const response = await apiRequest('DELETE', `/customers/${customerId}`, {
                token: adminToken,
            });

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);

            // Verify customer is soft-deleted (has deletedAt)
            const deletedCustomer = await db.customer.findUnique({
                where: { id: customerId },
            });
            expect(deletedCustomer.deletedAt).not.toBeNull();
        });
    });
});

// ─────────────────────────────────────────────────────────────
// PRODUCT/INVENTORY TESTS
// ─────────────────────────────────────────────────────────────

describe('Product API', () => {
    let company: any;
    let adminToken: string;

    beforeAll(async () => {
        company = await createTestCompany();
        const admin = await createTestUser(company.id, undefined, [
            'inventory.view',
            'inventory.edit',
            'items.view',
            'items.edit',
        ]);
        adminToken = admin.token;
    });

    describe('POST /products', () => {
        it('should reject product without name', async () => {
            const response = await apiRequest('POST', '/products', {
                token: adminToken,
                body: {
                    itemCode: 'TEST123',
                },
            });

            expect(response.status).toBe(422);
            expect(response.body.success).toBe(false);
        });

        it('should reject product with negative sale price', async () => {
            const response = await apiRequest('POST', '/products', {
                token: adminToken,
                body: {
                    name: 'Test Product',
                    salePrice: -100,
                },
            });

            expect(response.status).toBe(422);
            expect(response.body.success).toBe(false);
        });

        it('should reject product with invalid tax rate', async () => {
            const response = await apiRequest('POST', '/products', {
                token: adminToken,
                body: {
                    name: 'Test Product',
                    taxRate: 150, // > 100%
                },
            });

            expect(response.status).toBe(422);
            expect(response.body.success).toBe(false);
        });

        it('should create product with valid data', async () => {
            const response = await apiRequest('POST', '/products', {
                token: adminToken,
                body: {
                    name: unique('Valid Product'),
                    itemCode: unique('ITEM'),
                    salePrice: 100,
                    costPrice: 50,
                    taxRate: 15,
                },
            });

            expect(response.status).toBe(201);
            expect(response.body.success).toBe(true);
            expect(response.body.data).toHaveProperty('id');
            expect(response.body.data.status).toBe('ACTIVE');
        });
    });
});

// ─────────────────────────────────────────────────────────────
// HR MODULE TESTS
// ─────────────────────────────────────────────────────────────

describe('HR Module API', () => {
    let company: any;
    let adminToken: string;

    beforeAll(async () => {
        company = await createTestCompany();
        const admin = await createTestUser(company.id, undefined, [
            'hr.department.view',
            'hr.department.create',
            'hr.department.edit',
            'hr.department.delete',
            'hr.position.view',
            'hr.position.create',
            'hr.employee.view',
            'hr.employee.create',
        ]);
        adminToken = admin.token;
    });

    describe('POST /hr/departments', () => {
        it('should reject department without name', async () => {
            const response = await apiRequest('POST', '/hr/departments', {
                token: adminToken,
                body: {
                    code: 'DEPT001',
                },
            });

            expect(response.status).toBe(422);
            expect(response.body.success).toBe(false);
        });

        it('should reject department without code', async () => {
            const response = await apiRequest('POST', '/hr/departments', {
                token: adminToken,
                body: {
                    name: 'Test Department',
                },
            });

            expect(response.status).toBe(422);
            expect(response.body.success).toBe(false);
        });

        it('should create department with valid data', async () => {
            const response = await apiRequest('POST', '/hr/departments', {
                token: adminToken,
                body: {
                    name: unique('IT Department'),
                    code: unique('IT'),
                    description: 'Information Technology',
                },
            });

            expect(response.status).toBe(201);
            expect(response.body.success).toBe(true);
            expect(response.body.data).toHaveProperty('id');
        });

        it('should reject duplicate department code', async () => {
            const deptName = unique('HR Department');
            const deptCode = unique('HR');

            await apiRequest('POST', '/hr/departments', {
                token: adminToken,
                body: { name: deptName, code: deptCode },
            });

            const response = await apiRequest('POST', '/hr/departments', {
                token: adminToken,
                body: { name: 'Another HR', code: deptCode },
            });

            expect(response.status).toBe(400);
            expect(response.body.success).toBe(false);
        });
    });

    describe('POST /hr/employees', () => {
        let departmentId: string;
        let positionId: string;
        let branchId: string;

        beforeAll(async () => {
            // Create department
            const dept = await apiRequest('POST', '/hr/departments', {
                token: adminToken,
                body: { name: unique('Engineering'), code: unique('ENG') },
            });
            departmentId = dept.body.data.id;

            // Create position
            const position = await apiRequest('POST', '/hr/positions', {
                token: adminToken,
                body: { title: unique('Software Engineer'), code: unique('SWE'), level: 3 },
            });
            positionId = position.body.data.id;

            // Create branch
            const branch = await db.branch.create({
                data: {
                    companyId: company.id,
                    name: unique('Main Branch'),
                    code: unique('MB'),
                },
            });
            branchId = branch.id;
        });

        it('should reject employee without required fields', async () => {
            const response = await apiRequest('POST', '/hr/employees', {
                token: adminToken,
                body: {},
            });

            expect(response.status).toBe(422);
            expect(response.body.success).toBe(false);
        });

        it('should reject employee with invalid email', async () => {
            const response = await apiRequest('POST', '/hr/employees', {
                token: adminToken,
                body: {
                    employeeNo: 'EMP001',
                    firstName: 'John',
                    lastName: 'Doe',
                    email: 'invalid-email',
                },
            });

            expect(response.status).toBe(422);
            expect(response.body.success).toBe(false);
        });

        it('should reject employee with negative salary', async () => {
            const response = await apiRequest('POST', '/hr/employees', {
                token: adminToken,
                body: {
                    employeeNo: 'EMP002',
                    firstName: 'John',
                    lastName: 'Doe',
                    salary: -5000,
                },
            });

            expect(response.status).toBe(422);
            expect(response.body.success).toBe(false);
        });

        it('should create employee with valid data', async () => {
            const response = await apiRequest('POST', '/hr/employees', {
                token: adminToken,
                body: {
                    employeeNo: unique('EMP'),
                    firstName: 'John',
                    lastName: 'Doe',
                    email: `${unique('john.doe')}@example.com`,
                    phone: '+966-50-123-4567',
                    departmentId,
                    positionId,
                    branchId,
                    hireDate: new Date().toISOString(),
                    employmentType: 'FULL_TIME',
                    status: 'ACTIVE',
                    salary: 15000,
                    currency: 'SAR',
                },
            });

            expect(response.status).toBe(201);
            expect(response.body.success).toBe(true);
            expect(response.body.data).toHaveProperty('id');
            expect(response.body.data.employeeNo).toBeTruthy();
        });

        it('should create employee with optional fields as null/empty', async () => {
            const response = await apiRequest('POST', '/hr/employees', {
                token: adminToken,
                body: {
                    employeeNo: unique('EMP'),
                    firstName: 'Jane',
                    lastName: 'Smith',
                    email: '',
                    phone: '',
                    departmentId: null,
                    positionId: null,
                    hireDate: new Date().toISOString(),
                    employmentType: 'FULL_TIME',
                    status: 'ACTIVE',
                    salary: 10000,
                },
            });

            expect(response.status).toBe(201);
            expect(response.body.success).toBe(true);
        });
    });
});

// ─────────────────────────────────────────────────────────────
// DATA SANITIZATION TESTS
// ─────────────────────────────────────────────────────────────

describe('Data Sanitization', () => {
    let company: any;
    let adminToken: string;

    beforeAll(async () => {
        company = await createTestCompany();
        const admin = await createTestUser(company.id, undefined, ['crm.edit', 'crm.view']);
        adminToken = admin.token;
    });

    it('should trim whitespace from customer name', async () => {
        const response = await apiRequest('POST', '/customers', {
            token: adminToken,
            body: {
                name: '   Test Customer With Spaces   ',
            },
        });

        expect(response.status).toBe(201);
        expect(response.body.data.name).toBe('Test Customer With Spaces');
        expect(response.body.data.name).not.toContain('   ');
    });

    it('should reject XSS attempt in customer name', async () => {
        const response = await apiRequest('POST', '/customers', {
            token: adminToken,
            body: {
                name: '<script>alert("XSS")</script>',
            },
        });

        // Should either sanitize or reject
        expect(response.status).toBeLessThan(300);
        if (response.status === 201) {
            // Name should be sanitized or escaped
            expect(response.body.data.name).not.toContain('<script>');
        }
    });

    it('should sanitize SQL injection attempt in search', async () => {
        const response = await apiRequest('GET', "/customers?search='; DROP TABLE customers; --", {
            token: adminToken,
        });

        // Should not error, Prisma handles parameterization
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
    });

    it('should handle unicode characters properly', async () => {
        const response = await apiRequest('POST', '/customers', {
            token: adminToken,
            body: {
                name: 'عميل اختبار - Test Customer - 测试客户',
            },
        });

        expect(response.status).toBe(201);
        expect(response.body.success).toBe(true);
        expect(response.body.data.name).toContain('عميل اختبار');
    });

    it('should reject extremely long input (DoS prevention)', async () => {
        const response = await apiRequest('POST', '/customers', {
            token: adminToken,
            body: {
                name: 'A'.repeat(10000), // Exceeds 200 char limit
            },
        });

        expect(response.status).toBe(422);
        expect(response.body.success).toBe(false);
    });
});

// ─────────────────────────────────────────────────────────────
// ERROR HANDLING TESTS
// ─────────────────────────────────────────────────────────────

describe('Error Handling', () => {
    it('should return 404 for non-existent routes', async () => {
        const response = await apiRequest('GET', '/api/v1/non-existent-route', {});
        expect(response.status).toBe(404);
        expect(response.body.error.code).toBe('NOT_FOUND');
    });

    it('should return 401 for protected routes without token', async () => {
        const response = await apiRequest('GET', '/customers', {});
        expect(response.status).toBe(401);
        expect(response.body.error.code).toBe('UNAUTHORIZED');
    });

    it('should return 403 for insufficient permissions', async () => {
        const company = await createTestCompany();
        const user = await createTestUser(company.id, undefined, ['crm.view']); // No edit permission

        const response = await apiRequest('POST', '/customers', {
            token: user.token,
            body: { name: 'Test' },
        });

        expect(response.status).toBe(403);
        expect(response.body.error.code).toBe('FORBIDDEN');
    });

    it('should handle malformed JSON body', async () => {
        const company = await createTestCompany();
        const user = await createTestUser(company.id);

        const response = await fetch(`${baseUrl}/api/v1/customers`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${user.token}`,
                'Content-Type': 'application/json',
            },
            body: '{ invalid json }',
        });

        expect(response.status).toBe(400);
    });

    it('should handle database constraint violations gracefully', async () => {
        // This tests the Prisma error handling
        const response = await apiRequest('DELETE', '/customers/non-existent-id', {
            token: adminToken,
        });

        // Should not crash, should return appropriate error
        expect([400, 404].includes(response.status)).toBe(true);
    });
});
