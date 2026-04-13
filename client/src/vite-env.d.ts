/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly VITE_API_URL?: string;
    readonly VITE_API_BASE_URL?: string;
    readonly VITE_APP_BASE_PATH?: string;
    readonly VITE_APP_TITLE?: string;
    readonly VITE_APP_NAME?: string;
    readonly VITE_APP_VERSION?: string;
    readonly VITE_DEV_SERVER_PORT?: string;
    readonly VITE_DEV_API_PROXY?: string;
    readonly VITE_ENABLE_DEV_TOOLS?: string;
    readonly VITE_ENABLE_LOGGING?: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
    readonly hot?: {
        dispose: (fn: () => void) => void;
    };
}

interface Window {
    electronPOS?: {
        isElectron?: boolean;
        printReceipt?: (html: string, options?: any) => Promise<void>;
        printHtml?: (options: {
            documentTitle?: string;
            html: string;
            styles?: string;
            deviceName?: string;
            silent?: boolean;
            copies?: number;
        }) => Promise<{ ok?: boolean; error?: string }>;
        printers?: () => Promise<any[]>;
        getPrinters?: () => Promise<ElectronPrinterInfo[]>;
    };
}

interface ElectronPrinterInfo {
    name: string;
    isDefault: boolean;
    status: number;
}
