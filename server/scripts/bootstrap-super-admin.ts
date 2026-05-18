import 'dotenv/config';
import { ensureConfiguredSuperAdmin } from '../src/bootstrap/superAdmin.js';

async function main() {
    const result = await ensureConfiguredSuperAdmin({
        resetPassword: true,
        source: 'script',
    });

    if (!result) {
        console.log('Super admin bootstrap skipped because SUPER_ADMIN_EMAIL is not configured.');
        return;
    }

    console.log('Super admin user is ready.');
    console.log(`Email: ${result.email}`);
    console.log(`Password: ${process.env.SUPER_ADMIN_PASSWORD || '(unchanged)'}`);
    console.log(`Company: ${result.companyName} (${result.companyId})`);
    console.log(`Branches assigned: ${result.branchCount}`);
    console.log('Role-based platform access is configured for this user.');
    console.log('Legacy SUPER_ADMIN_EMAILS fallback remains available during migration.');
}

main()
    .catch((error) => {
        console.error('bootstrap-super-admin failed:', error);
        process.exit(1);
    });

