const { app, BrowserWindow, Menu, ipcMain, shell } = require('electron');
const path = require('path');

const APP_URL = 'https://solvanta.wuaze.com/pos';
const APP_ORIGIN = new URL(APP_URL).origin;
const isDev = !app.isPackaged;

let mainWindow = null;
let splashWindow = null;

function isAllowedNavigation(url) {
    if (url === 'about:blank') return true;
    if (url.startsWith('file://')) return true;
    try {
        return new URL(url).origin === APP_ORIGIN;
    } catch {
        return false;
    }
}

function openExternalIfWebUrl(url) {
    try {
        const protocol = new URL(url).protocol;
        if (protocol === 'http:' || protocol === 'https:') {
            shell.openExternal(url);
        }
    } catch {
        // Ignore malformed URLs
    }
}

function createSplashWindow() {
    splashWindow = new BrowserWindow({
        width: 460,
        height: 320,
        frame: false,
        transparent: true,
        resizable: false,
        alwaysOnTop: true,
        skipTaskbar: true,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true
        }
    });

    splashWindow.loadFile(path.join(__dirname, 'splash.html'));
    splashWindow.center();
}

async function loadAppWindow() {
    if (!mainWindow) return;
    try {
        await mainWindow.loadURL(APP_URL);
    } catch {
        await mainWindow.loadFile(path.join(__dirname, 'offline.html'));
    }
}

function buildMenu() {
    const template = [
        {
            label: 'POS',
            submenu: [
                {
                    label: 'Refresh',
                    accelerator: 'F5',
                    click: () => mainWindow && mainWindow.reload()
                },
                {
                    label: 'Hard Refresh',
                    accelerator: 'CmdOrCtrl+Shift+R',
                    click: async () => {
                        if (!mainWindow) return;
                        await mainWindow.webContents.session.clearCache();
                        mainWindow.reload();
                    }
                },
                { type: 'separator' },
                {
                    label: 'Open POS in Browser',
                    click: () => shell.openExternal(APP_URL)
                },
                { type: 'separator' },
                {
                    label: 'Exit',
                    accelerator: 'CmdOrCtrl+Q',
                    click: () => app.quit()
                }
            ]
        },
        {
            label: 'View',
            submenu: [
                {
                    label: 'Toggle Fullscreen',
                    accelerator: 'F11',
                    click: () => {
                        if (!mainWindow) return;
                        mainWindow.setFullScreen(!mainWindow.isFullScreen());
                    }
                },
                {
                    label: 'Zoom In',
                    accelerator: 'CmdOrCtrl+=',
                    click: () => {
                        if (!mainWindow) return;
                        const z = mainWindow.webContents.getZoomLevel();
                        mainWindow.webContents.setZoomLevel(z + 0.5);
                    }
                },
                {
                    label: 'Zoom Out',
                    accelerator: 'CmdOrCtrl+-',
                    click: () => {
                        if (!mainWindow) return;
                        const z = mainWindow.webContents.getZoomLevel();
                        mainWindow.webContents.setZoomLevel(z - 0.5);
                    }
                },
                {
                    label: 'Reset Zoom',
                    accelerator: 'CmdOrCtrl+0',
                    click: () => mainWindow && mainWindow.webContents.setZoomLevel(0)
                },
                ...(isDev
                    ? [
                        { type: 'separator' },
                        {
                            label: 'DevTools',
                            accelerator: 'F12',
                            click: () => mainWindow && mainWindow.webContents.toggleDevTools()
                        }
                    ]
                    : [])
            ]
        }
    ];

    Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createMainWindow() {
    mainWindow = new BrowserWindow({
        width: 1280,
        height: 800,
        minWidth: 1024,
        minHeight: 700,
        title: 'Solvanta POS',
        backgroundColor: '#0f172a',
        show: false,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true
        }
    });

    mainWindow.webContents.on('will-navigate', (event, url) => {
        if (isAllowedNavigation(url)) return;
        event.preventDefault();
        openExternalIfWebUrl(url);
    });

    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        if (isAllowedNavigation(url)) return { action: 'allow' };
        openExternalIfWebUrl(url);
        return { action: 'deny' };
    });

    mainWindow.once('ready-to-show', () => {
        if (splashWindow && !splashWindow.isDestroyed()) {
            splashWindow.close();
            splashWindow = null;
        }
        mainWindow.show();
        mainWindow.focus();
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });

    buildMenu();
    void loadAppWindow();
}

ipcMain.handle('get-config', () => ({
    appUrl: APP_URL,
    isElectron: true,
    version: app.getVersion()
}));

ipcMain.handle('get-printers', async () => {
    try {
        if (!mainWindow || mainWindow.isDestroyed()) return [];
        const list = await mainWindow.webContents.getPrintersAsync();
        return list.map((printer) => ({
            name: printer.name,
            displayName: printer.displayName || printer.name,
            description: printer.description || '',
            status: typeof printer.status === 'number' ? printer.status : 0,
            isDefault: Boolean(printer.isDefault)
        }));
    } catch {
        return [];
    }
});

ipcMain.handle('print-html', async (_event, payload = {}) => {
    let printWindow = null;
    try {
        const html = String(payload.html || '');
        const styles = String(payload.styles || '');
        const documentTitle = String(payload.documentTitle || 'POS Receipt');
        const deviceName = String(payload.deviceName || '').trim();
        const silent = Boolean(payload.silent);
        const copies = Number(payload.copies || 1);

        if (!html.trim()) {
            return { ok: false, error: 'No HTML content provided for printing' };
        }

        printWindow = new BrowserWindow({
            show: false,
            width: 420,
            height: 900,
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true
            }
        });

        const fullHtml = `
            <!doctype html>
            <html>
            <head>
                <meta charset="utf-8" />
                <title>${documentTitle}</title>
                ${styles ? `<style>${styles}</style>` : ''}
            </head>
            <body>${html}</body>
            </html>
        `;

        await printWindow.loadURL(`data:text/html;charset=UTF-8,${encodeURIComponent(fullHtml)}`);

        const result = await new Promise((resolve) => {
            const options = {
                silent,
                printBackground: true,
                deviceName: deviceName || undefined,
                copies: Number.isFinite(copies) ? Math.max(1, Math.min(5, Math.floor(copies))) : 1
            };
            printWindow.webContents.print(options, (success, failureReason) => {
                if (!success) {
                    resolve({ ok: false, error: failureReason || 'Print failed' });
                    return;
                }
                resolve({ ok: true });
            });
        });

        return result;
    } catch (error) {
        return { ok: false, error: error && error.message ? error.message : 'Failed to print' };
    } finally {
        if (printWindow && !printWindow.isDestroyed()) {
            printWindow.close();
        }
    }
});

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
    app.quit();
} else {
    app.on('second-instance', () => {
        if (!mainWindow) return;
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.focus();
    });
}

app.whenReady().then(() => {
    createSplashWindow();
    setTimeout(() => {
        createMainWindow();
    }, 1000);
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
});
