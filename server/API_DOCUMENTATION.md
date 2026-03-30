# SOLVANTA Business Suite - API Documentation

## Overview

This document provides comprehensive documentation for the SOLVANTA Business Suite API, including authentication, request/response formats, error handling, and usage examples.

**Base URL:** `http://localhost:5001/api/v1`

---

## Table of Contents

1. [Authentication](#authentication)
2. [Request/Response Format](#requestresponse-format)
3. [Error Handling](#error-handling)
4. [Data Validation & Sanitization](#data-validation--sanitization)
5. [Core Endpoints](#core-endpoints)
6. [Module-Specific Endpoints](#module-specific-endpoints)
7. [Rate Limiting](#rate-limiting)
8. [Best Practices](#best-practices)

---

## Authentication

### Overview

All API endpoints (except `/auth/login`) require authentication using JWT tokens.

### Token-Based Authentication

1. **Login** to obtain access and refresh tokens
2. **Include** the access token in the `Authorization` header
3. **Refresh** the token when it expires

### Login

**Endpoint:** `POST /auth/login`

**Request:**
```json
{
  "email": "user@example.com",
  "password": "SecurePassword123!"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIs...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIs...",
    "user": {
      "id": "uuid",
      "email": "user@example.com",
      "name": "John Doe",
      "role": {
        "name": "admin",
        "permissions": ["sales.view", "sales.edit"]
      },
      "company": {
        "id": "uuid",
        "name": "Company Name"
      },
      "branches": [
        { "id": "uuid", "name": "Main Branch" }
      ]
    }
  }
}
```

**Using the Token:**

```bash
curl -X GET http://localhost:5001/api/v1/customers \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### Token Refresh

**Endpoint:** `POST /auth/refresh`

**Request:**
```json
{
  "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIs...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
  }
}
```

---

## Request/Response Format

### Standard Request Format

```http
POST /api/v1/resource HTTP/1.1
Host: localhost:5001
Authorization: Bearer YOUR_TOKEN
Content-Type: application/json

{
  "field1": "value1",
  "field2": "value2"
}
```

### Standard Response Format

**Success Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "field1": "value1",
    "field2": "value2",
    "createdAt": "2024-01-01T00:00:00.000Z"
  },
  "message": "Operation successful"
}
```

**Paginated Response:**
```json
{
  "success": true,
  "data": [...],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 150,
    "totalPages": 8
  }
}
```

**Error Response:**
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed. Please check your input.",
    "details": [
      {
        "field": "email",
        "message": "Invalid email format",
        "code": "invalid_string"
      }
    ],
    "timestamp": "2024-01-01T00:00:00.000Z"
  }
}
```

---

## Error Handling

### Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `BAD_REQUEST` | 400 | Invalid request parameters |
| `UNAUTHORIZED` | 401 | Missing or invalid authentication |
| `FORBIDDEN` | 403 | Insufficient permissions |
| `NOT_FOUND` | 404 | Resource not found |
| `CONFLICT` | 409 | Resource conflict (e.g., duplicate) |
| `VALIDATION_ERROR` | 422 | Validation failed |
| `RATE_LIMIT_EXCEEDED` | 429 | Too many requests |
| `INTERNAL_ERROR` | 500 | Server error |
| `DATABASE_ERROR` | 500 | Database error |

### Error Response Examples

#### Validation Error (422)
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed. Please check your input.",
    "details": [
      {
        "field": "email",
        "message": "Invalid email format",
        "code": "invalid_string",
        "expected": "string",
        "received": "invalid-email"
      },
      {
        "field": "name",
        "message": "Name is required",
        "code": "too_small",
        "expected": "min length 1",
        "received": ""
      }
    ]
  }
}
```

#### Authentication Error (401)
```json
{
  "success": false,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Invalid or expired token"
  }
}
```

#### Permission Error (403)
```json
{
  "success": false,
  "error": {
    "code": "FORBIDDEN",
    "message": "Insufficient permissions. Required: sales.edit"
  }
}
```

#### Not Found Error (404)
```json
{
  "success": false,
  "error": {
    "code": "NOT_FOUND",
    "message": "Customer with ID '123' not found"
  }
}
```

#### Conflict Error (409)
```json
{
  "success": false,
  "error": {
    "code": "CONFLICT",
    "message": "A record with customerCode 'CUST001' already exists"
  }
}
```

---

## Data Validation & Sanitization

### Input Validation Rules

All input data is automatically validated and sanitized. Here are the common validation rules:

#### Email
- Must be valid email format
- Automatically trimmed and lowercased
- Max length: 254 characters

```json
{
  "email": "user@example.com"  // ✓ Valid
}
```

```json
{
  "email": "invalid-email"  // ✗ Invalid format
}
```

#### Phone Number
- Allowed characters: `+`, digits, spaces, hyphens, parentheses
- Min length: 7, Max length: 20
- Pattern: `/^[+0-9()\- ]{7,20}$/`

```json
{
  "phone": "+966-50-123-4567"  // ✓ Valid
}
```

```json
{
  "phone": "abc-def-ghij"  // ✗ Invalid characters
}
```

#### Codes (Customer Code, Item Code, etc.)
- Allowed characters: Alphanumeric, hyphens, underscores
- Automatically uppercased and trimmed
- Max length: 50 characters

```json
{
  "customerCode": "CUST-001"  // ✓ Valid
}
```

```json
{
  "customerCode": "CUST@#$%"  // ✗ Invalid characters
}
```

#### Names and Text
- Automatically trimmed
- XSS protection (HTML tags removed)
- Max length enforced per field

```json
{
  "name": "John Doe"  // ✓ Valid
}
```

```json
{
  "name": "<script>alert('XSS')</script>"  // ✗ Sanitized or rejected
}
```

#### Numbers
- Positive numbers: Must be > 0
- Non-negative numbers: Must be >= 0
- Percentages: Must be 0-100
- Finite numbers only (no Infinity, NaN)

```json
{
  "salePrice": 100.50,    // ✓ Valid
  "taxRate": 15,          // ✓ Valid (0-100)
  "qty": 10               // ✓ Valid (positive)
}
```

```json
{
  "salePrice": -100,      // ✗ Negative
  "taxRate": 150          // ✗ Exceeds 100%
}
```

#### Dates
- ISO 8601 format: `YYYY-MM-DD` or `YYYY-MM-DDTHH:mm:ss.sssZ`
- Automatically validated and normalized

```json
{
  "hireDate": "2024-01-15"           // ✓ Valid
}
```

```json
{
  "hireDate": "15/01/2024"           // ✗ Invalid format
}
```

### Sanitization Features

1. **XSS Protection**: HTML tags and dangerous patterns are removed
2. **SQL Injection Protection**: Special characters are escaped
3. **Whitespace Trimming**: Leading/trailing whitespace is removed
4. **Unicode Normalization**: Text is normalized to NFC form
5. **Null Byte Removal**: Control characters are removed

---

## Core Endpoints

### Authentication

#### POST /auth/login
Login with email and password.

**Request:**
```json
{
  "email": "user@example.com",
  "password": "SecurePassword123!"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "accessToken": "...",
    "refreshToken": "...",
    "user": { ... }
  }
}
```

#### GET /auth/me
Get current user profile.

**Headers:**
```
Authorization: Bearer YOUR_TOKEN
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "email": "user@example.com",
    "name": "John Doe",
    "role": { ... },
    "company": { ... },
    "permissions": ["sales.view", "sales.edit"],
    "branches": [...]
  }
}
```

---

### Customers

#### GET /customers
List all customers (paginated).

**Query Parameters:**
- `page` (number, default: 1): Page number
- `limit` (number, default: 20): Items per page
- `search` (string): Search by name, email, phone
- `sortBy` (string): Field to sort by
- `sortOrder` (string: 'asc' | 'desc', default: 'desc')

**Example:**
```bash
GET /customers?page=1&limit=20&search=John
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "customerCode": "CUST001",
      "name": "John Doe",
      "email": "john@example.com",
      "phone": "+966-50-123-4567",
      "creditLimit": 50000,
      "openingBalance": 0,
      "createdAt": "2024-01-01T00:00:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 1,
    "totalPages": 1
  }
}
```

#### POST /customers
Create a new customer.

**Request:**
```json
{
  "customerCode": "CUST001",  // Optional (auto-generated if not provided)
  "name": "John Doe",
  "email": "john@example.com",
  "phone": "+966-50-123-4567",
  "vatNumber": "300000000000003",
  "address": {
    "street": "123 Main St",
    "city": "Riyadh",
    "country": "Saudi Arabia"
  },
  "creditLimit": 50000,
  "allowCreditSales": true,
  "openingBalance": 0,
  "tags": ["VIP", "Wholesale"],
  "notes": "Preferred customer"
}
```

**Response (201 Created):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "customerCode": "CUST001",
    "name": "John Doe",
    "email": "john@example.com",
    "phone": "+966-50-123-4567",
    "createdAt": "2024-01-01T00:00:00.000Z"
  },
  "message": "Customer created successfully"
}
```

#### GET /customers/:id
Get customer by ID.

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "customerCode": "CUST001",
    "name": "John Doe",
    "email": "john@example.com",
    "phone": "+966-50-123-4567",
    "creditLimit": 50000,
    "openingBalance": 0,
    "receivableBalance": 15000,
    "recentInvoices": [...],
    "priceGroup": { ... }
  }
}
```

#### GET /customers/:id/ledger
Get customer transaction ledger.

**Query Parameters:**
- `dateFrom` (string: YYYY-MM-DD): Start date
- `dateTo` (string: YYYY-MM-DD): End date

**Response:**
```json
{
  "success": true,
  "data": {
    "customer": {
      "id": "uuid",
      "name": "John Doe",
      "customerCode": "CUST001",
      "openingBalance": 0
    },
    "openingBalance": 0,
    "ledger": [
      {
        "id": "uuid",
        "date": "2024-01-15T00:00:00.000Z",
        "type": "INVOICE",
        "reference": "INV-001",
        "description": "Sales Invoice: INV-001",
        "debit": 5000,
        "credit": 0,
        "balance": 5000
      },
      {
        "id": "uuid",
        "date": "2024-01-20T00:00:00.000Z",
        "type": "PAYMENT",
        "reference": "PMT-001",
        "description": "Payment Receipt: PMT-001",
        "debit": 0,
        "credit": 2000,
        "balance": 3000
      }
    ],
    "finalBalance": 3000
  }
}
```

#### PATCH /customers/:id
Update customer.

**Request:**
```json
{
  "name": "John Doe Updated",
  "creditLimit": 75000,
  "notes": "Updated notes"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "customerCode": "CUST001",
    "name": "John Doe Updated",
    "email": "john@example.com",
    "creditLimit": 75000,
    "updatedAt": "2024-01-20T00:00:00.000Z"
  }
}
```

#### DELETE /customers/:id
Soft-delete customer (archive).

**Response:**
```json
{
  "success": true,
  "data": {
    "message": "Customer archived"
  }
}
```

---

### Products/Inventory

#### GET /products
List products (paginated).

**Query Parameters:**
- `page`, `limit`, `search`, `sortBy`, `sortOrder`
- `categoryIds` (array): Filter by categories
- `brandId` (string): Filter by brand
- `status` (string): ACTIVE | INACTIVE | DISCONTINUED
- `minPrice`, `maxPrice` (number): Price range

#### POST /products
Create a new product.

**Request:**
```json
{
  "itemCode": "ITEM001",
  "name": "Product Name",
  "description": "Product description",
  "barcodes": ["1234567890123"],
  "status": "ACTIVE",
  "taxRate": 15,
  "categoryIds": ["uuid1", "uuid2"],
  "brandId": "uuid",
  "salePrice": 100,
  "costPrice": 50,
  "minStock": 10,
  "maxStock": 100
}
```

**Response (201 Created):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "itemCode": "ITEM001",
    "name": "Product Name",
    "status": "ACTIVE",
    "salePrice": 100,
    "costPrice": 50,
    "createdAt": "2024-01-01T00:00:00.000Z"
  }
}
```

---

## Module-Specific Endpoints

### HR Module

#### POST /hr/departments
Create department.

**Request:**
```json
{
  "name": "Information Technology",
  "code": "IT",
  "description": "IT Department",
  "parentId": null
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "Information Technology",
    "code": "IT",
    "companyId": "uuid",
    "createdAt": "2024-01-01T00:00:00.000Z"
  }
}
```

#### POST /hr/employees
Create employee.

**Request:**
```json
{
  "employeeNo": "EMP001",
  "firstName": "John",
  "lastName": "Doe",
  "email": "john.doe@example.com",
  "phone": "+966-50-123-4567",
  "departmentId": "uuid",
  "positionId": "uuid",
  "branchId": "uuid",
  "hireDate": "2024-01-15",
  "employmentType": "FULL_TIME",
  "status": "ACTIVE",
  "salary": 15000,
  "currency": "SAR",
  "emergencyContact": {
    "name": "Jane Doe",
    "phone": "+966-50-987-6543",
    "relationship": "Spouse"
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "employeeNo": "EMP001",
    "firstName": "John",
    "lastName": "Doe",
    "email": "john.doe@example.com",
    "department": {
      "id": "uuid",
      "name": "Information Technology"
    },
    "position": {
      "id": "uuid",
      "title": "Software Engineer"
    },
    "status": "ACTIVE",
    "createdAt": "2024-01-15T00:00:00.000Z"
  }
}
```

---

### POS Module

#### POST /pos/invoices
Create POS invoice.

**Request:**
```json
{
  "customerId": "uuid",
  "items": [
    {
      "productId": "uuid",
      "unitCode": "PCS",
      "qty": 2,
      "unitPrice": 50,
      "discount": 0,
      "taxAmount": 7.5
    }
  ],
  "paymentMethod": "CASH",
  "cashReceived": 100,
  "notes": "Cash sale"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "invoiceNo": "POS-2024-001",
    "status": "POSTED",
    "isPosted": true,
    "subtotal": 100,
    "taxTotal": 15,
    "grandTotal": 115,
    "cashReceived": 100,
    "changeGiven": 0,
    "items": [...],
    "createdAt": "2024-01-01T00:00:00.000Z"
  }
}
```

---

### Sales Module

#### POST /sales/invoices
Create sales invoice.

**Request:**
```json
{
  "customerId": "uuid",
  "date": "2024-01-15",
  "dueDate": "2024-02-15",
  "branchId": "uuid",
  "items": [
    {
      "productId": "uuid",
      "unitCode": "PCS",
      "qty": 10,
      "unitPrice": 100,
      "discount": 5,
      "taxAmount": 15
    }
  ],
  "paymentMethod": "CREDIT",
  "notes": "Credit sale",
  "discountTotal": 50
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "invoiceNo": "INV-2024-001",
    "status": "CREDIT",
    "grandTotal": 1065,
    "items": [...],
    "createdAt": "2024-01-15T00:00:00.000Z"
  }
}
```

---

## Rate Limiting

### Limits

- **Authentication endpoints**: 20 requests per 15 minutes
- **Other endpoints**: No default limit (configurable)

### Rate Limit Response Headers

```
X-RateLimit-Limit: 20
X-RateLimit-Remaining: 15
X-RateLimit-Reset: 1704067200
```

### Rate Limit Exceeded Response (429)

```json
{
  "success": false,
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Too many requests, try again later"
  }
}
```

---

## Best Practices

### 1. Error Handling

Always handle errors gracefully:

```javascript
try {
  const response = await fetch('/api/v1/customers', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name: 'Test' }),
  });

  const data = await response.json();

  if (!response.ok) {
    console.error('Error:', data.error);
    // Handle specific error codes
    switch (data.error.code) {
      case 'VALIDATION_ERROR':
        // Show validation errors to user
        break;
      case 'UNAUTHORIZED':
        // Redirect to login
        break;
      case 'FORBIDDEN':
        // Show permission denied
        break;
    }
    return;
  }

  console.log('Success:', data.data);
} catch (error) {
  console.error('Network error:', error);
}
```

### 2. Input Validation

Validate data client-side before sending:

```javascript
function validateCustomer(data) {
  const errors = [];

  if (!data.name || data.name.trim().length === 0) {
    errors.push('Name is required');
  }

  if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
    errors.push('Invalid email format');
  }

  if (data.phone && !/^[+0-9()\- ]{7,20}$/.test(data.phone)) {
    errors.push('Invalid phone format');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}
```

### 3. Pagination

Use pagination for large datasets:

```javascript
async function fetchAllCustomers() {
  let page = 1;
  const limit = 100;
  const allCustomers = [];

  while (true) {
    const response = await fetch(`/customers?page=${page}&limit=${limit}`);
    const data = await response.json();

    allCustomers.push(...data.data);

    if (page >= data.pagination.totalPages) {
      break;
    }

    page++;
  }

  return allCustomers;
}
```

### 4. Token Management

Handle token refresh automatically:

```javascript
let accessToken = localStorage.getItem('accessToken');
let refreshToken = localStorage.getItem('refreshToken');

async function apiRequest(url, options = {}) {
  let response = await fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      'Authorization': `Bearer ${accessToken}`,
    },
  });

  // If token expired, refresh and retry
  if (response.status === 401) {
    const refreshResponse = await fetch('/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });

    if (refreshResponse.ok) {
      const { data } = await refreshResponse.json();
      accessToken = data.accessToken;
      refreshToken = data.refreshToken;

      localStorage.setItem('accessToken', accessToken);
      localStorage.setItem('refreshToken', refreshToken);

      // Retry original request
      response = await fetch(url, {
        ...options,
        headers: {
          ...options.headers,
          'Authorization': `Bearer ${accessToken}`,
        },
      });
    } else {
      // Refresh failed, redirect to login
      window.location.href = '/login';
    }
  }

  return response;
}
```

### 5. Batch Operations

For bulk operations, use batch endpoints when available:

```javascript
// Instead of multiple requests
const promises = customerIds.map(id =>
  fetch(`/customers/${id}`, { method: 'DELETE' })
);
await Promise.all(promises);

// Use batch endpoint if available
await fetch('/customers/batch-delete', {
  method: 'POST',
  body: JSON.stringify({ ids: customerIds }),
});
```

---

## Testing

### Using cURL

```bash
# Login
curl -X POST http://localhost:5001/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"SecurePassword123!"}'

# Get customers
curl -X GET http://localhost:5001/api/v1/customers \
  -H "Authorization: Bearer YOUR_TOKEN"

# Create customer
curl -X POST http://localhost:5001/api/v1/customers \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Customer",
    "email": "test@example.com",
    "phone": "+966-50-123-4567"
  }'
```

### Using Postman

1. Create a new collection
2. Add environment variables:
   - `baseUrl`: `http://localhost:5001`
   - `accessToken`: (set automatically after login)
3. Create login request and save token to environment
4. Use `{{accessToken}}` in Authorization header for other requests

---

## Support

For API support, contact:
- Email: support@solvanta.com
- Documentation: https://docs.solvanta.com/api

---

## Changelog

### Version 1.0.0 (2024-01-01)
- Initial API release
- Authentication with JWT
- Customer, Product, HR, POS, Sales modules
- Enhanced error handling
- Data validation and sanitization
