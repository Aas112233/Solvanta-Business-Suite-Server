const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronPOS', {
    isElectron: true,
    platform: process.platform,
    getConfig: () => ipcRenderer.invoke('get-config'),
    getPrinters: () => ipcRenderer.invoke('get-printers'),
    printHtml: (payload) => ipcRenderer.invoke('print-html', payload)
});
