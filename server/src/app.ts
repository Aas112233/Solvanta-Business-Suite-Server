import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { env } from './config/env.js';
import { errorHandler } from './middleware/errorHandler.js';
import { logger } from './lib/logger.js';
import { basePrisma } from './lib/prisma.js';

// Import routes
import { authRoutes } from './modules/auth/auth.routes.js';
import { companyRoutes } from './modules/company/company.routes.js';
import { branchRoutes } from './modules/branch/branch.routes.js';
import { userRoutes } from './modules/user/user.routes.js';
import { roleRoutes } from './modules/role/role.routes.js';
import { customerRoutes } from './modules/customer/customer.routes.js';
import { supplierRoutes } from './modules/supplier/supplier.routes.js';
import { productRoutes } from './modules/product/product.routes.js';
import { inventoryRoutes } from './modules/inventory/inventory.routes.js';
import { purchaseRoutes } from './modules/purchase/purchase.routes.js';
import { posRoutes } from './modules/pos/pos.routes.js';
import { accountingRoutes } from './modules/accounting/accounting.routes.js';
import { unitManagementRoutes } from './modules/unit-management/unit-management.routes.js';

import { reportRoutes } from './modules/reports/report.routes.js';
import { globalStringRoutes } from './modules/company/global-string.routes.js';
import { salesRoutes } from './modules/sales/sales.routes.js';
import { salesCashRoutes } from './modules/sales/cash.routes.js';
import { posTerminalRoutes } from './modules/pos-terminal/pos-terminal.routes.js';
import { superAdminRoutes } from './modules/super-admin/super-admin.routes.js';
import { taxRoutes } from './modules/tax/tax.routes.js';
import { hrRoutes } from './modules/hr/hr.routes.js';
import { serviceRoutes } from './modules/service/service.routes.js';
import { serviceInvoiceRoutes } from './modules/service-invoice/service-invoice.routes.js';
import { bankRoutes } from './modules/bank/bank.routes.js';
import { agingRoutes } from './modules/aging/aging.routes.js';
import { bomRoutes } from './modules/bom/bom.routes.js';
import { productionRoutes } from './modules/production/production.routes.js';

export const app = express();
app.disable('etag');

function parseCorsOrigins(raw: string) {
    return raw
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean);
}

function isPrivateNetworkHost(hostname: string) {
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') return true;
    if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)) return true;
    if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname)) return true;

    const match172 = /^172\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/.exec(hostname);
    if (match172) {
        const second = Number(match172[1]);
        if (second >= 16 && second <= 31) return true;
    }

    return false;
}

function isLocalNetworkOrigin(origin: string) {
    try {
        const url = new URL(origin);
        return isPrivateNetworkHost(url.hostname);
    } catch {
        return false;
    }
}

const allowedOrigins = parseCorsOrigins(env.CORS_ORIGIN);

// ── Security ────────────────────────────────────────────────
app.use(helmet());

// Render and similar PaaS route traffic through a reverse proxy.
// Trust the first proxy hop in production so rate limiting can use real client IPs.
if (env.NODE_ENV === 'production') {
    app.set('trust proxy', 1);
}

app.use(cors({
    origin: (origin, callback) => {
        if (!origin) {
            callback(null, true);
            return;
        }

        if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
            callback(null, true);
            return;
        }

        if (env.NODE_ENV === 'development' && isLocalNetworkOrigin(origin)) {
            callback(null, true);
            return;
        }

        callback(new Error(`CORS blocked for origin: ${origin}`));
    },
    credentials: true,
}));

// ── Rate limiting for auth ──────────────────────────────────
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    message: { success: false, error: { code: 'RATE_LIMIT', message: 'Too many requests, try again later' } },
});

// ── Body parsing ────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(compression() as any);

// ── Logging ─────────────────────────────────────────────────
const morganStream = { write: (msg: string) => logger.http(msg.trim()) };
app.use(morgan('short', { stream: morganStream }));

// ── Health check ────────────────────────────────────────────
app.get('/', (_req, res) => {
    res.json({
        success: true,
        service: 'SOLVANTA Business Suite API',
        version: 'v1',
        health: '/health',
        api: '/api/v1',
    });
});

app.get('/health', async (_req, res) => {
    const startTime = Date.now();
    const healthStatus: {
        status: 'ok' | 'degraded' | 'unhealthy';
        timestamp: string;
        uptime: number;
        database: {
            status: 'connected' | 'disconnected';
            responseTime?: number;
        };
    } = {
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        database: {
            status: 'disconnected',
        },
    };

    // Check database connection
    try {
        await basePrisma.$runCommandRaw({ ping: 1 });
        healthStatus.database.status = 'connected';
        healthStatus.database.responseTime = Date.now() - startTime;
        logger.info(`Health check: OK (db=${healthStatus.database.status}, responseTime=${healthStatus.database.responseTime}ms)`);
    } catch (error: any) {
        healthStatus.database.status = 'disconnected';
        healthStatus.status = 'degraded';
        const errorMessage = error?.message || error?.toString() || 'Unknown error';
        logger.warn(`Health check: DEGRADED (db=${healthStatus.database.status}, error=${errorMessage})`);
    }

    const httpStatus = healthStatus.status === 'unhealthy' ? 503 : 200;
    res.status(httpStatus).json(healthStatus);
});

// ── API v1 Routes ───────────────────────────────────────────
const v1 = express.Router();
v1.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    next();
});
v1.use('/auth', authLimiter, authRoutes);
v1.use('/companies', companyRoutes);
v1.use('/branches', branchRoutes);
v1.use('/users', userRoutes);
v1.use('/roles', roleRoutes);
v1.use('/customers', customerRoutes);
v1.use('/suppliers', supplierRoutes);
v1.use('/products', productRoutes);
v1.use('/inventory', inventoryRoutes);
v1.use('/purchases', purchaseRoutes);
v1.use('/pos', posRoutes);

v1.use('/reports', reportRoutes);
v1.use('/global-strings', globalStringRoutes);
v1.use('/sales/cash', salesCashRoutes);
v1.use('/sales', salesRoutes);
v1.use('/pos-terminals', posTerminalRoutes);
v1.use('/super-admin', superAdminRoutes);
v1.use('/accounting', accountingRoutes);
v1.use('/taxes', taxRoutes);
v1.use('/unit-management', unitManagementRoutes);
v1.use('/hr', hrRoutes);
v1.use('/services', serviceRoutes);
v1.use('/service-invoices', serviceInvoiceRoutes);
v1.use('/bank', bankRoutes);
v1.use('/aging', agingRoutes);
v1.use('/bom', bomRoutes);
v1.use('/production', productionRoutes);

app.use('/api/v1', v1);

// ── 404 ─────────────────────────────────────────────────────
app.use((_req, res) => {
    res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Route not found' } });
});

// ── Global error handler ────────────────────────────────────
app.use(errorHandler);
