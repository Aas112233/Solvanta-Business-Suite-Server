import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const clientRoot = path.resolve(__dirname, '..');
const sourcePath = path.join(clientRoot, 'public', '.htaccess');
const targetPath = path.join(clientRoot, 'dist', '.htaccess');

if (fs.existsSync(sourcePath)) {
    fs.copyFileSync(sourcePath, targetPath);
    console.log('Copied .htaccess into dist/.htaccess');
}
