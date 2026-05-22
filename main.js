const { app, BrowserWindow, screen, ipcMain, dialog } = require('electron');
const path = require('path');
const { autoUpdater } = require('electron-updater');

let mainWindow;
let projectorWindow;
let selectedDisplayId = null;

// Auto-Updater Configuration
autoUpdater.autoDownload = true; // We can let it download in background or ask
autoUpdater.autoInstallOnAppQuit = true;

function createMainWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        autoHideMenuBar: true,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            devTools: true
        },
        title: "Precision Pulse - Control Dashboard"
    });

    mainWindow.loadFile('bundle.html');
    mainWindow.webContents.openDevTools();
    
    mainWindow.webContents.on('did-finish-load', () => {
        sendDisplayList();
        // Check for updates after the window is loaded
        if (app.isPackaged) {
            autoUpdater.checkForUpdatesAndNotify();
        }
    });
    
    mainWindow.on('close', () => {
        if (projectorWindow) projectorWindow.close();
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
        app.quit();
    });
}

// Auto-Updater Events
autoUpdater.on('update-available', (info) => {
    if (mainWindow) mainWindow.webContents.send('update-available', info.version);
});

autoUpdater.on('update-downloaded', (info) => {
    if (mainWindow) mainWindow.webContents.send('update-downloaded', info.version);
});

autoUpdater.on('error', (err) => {
    console.error('Update error:', err);
});

ipcMain.on('restart-app', () => {
    autoUpdater.quitAndInstall();
});

function sendDisplayList() {
    if (!app.isReady()) return;
    const displays = screen.getAllDisplays().map(d => ({
        id: d.id,
        label: d.label || `Display ${d.id}`,
        isPrimary: d.id === screen.getPrimaryDisplay().id
    }));
    if (mainWindow) mainWindow.webContents.send('display-list', displays);
}

ipcMain.on('select-audio-file', async (event, type) => {
    const buzzerDir = app.isPackaged 
        ? path.join(process.resourcesPath, 'Buzzer sounds') 
        : path.join(__dirname, 'Buzzer sounds');
    
    try {
        const result = await dialog.showOpenDialog(mainWindow, {
            defaultPath: buzzerDir,
            properties: ['openFile'],
            filters: [{ name: 'Audio Files', extensions: ['mp3', 'wav', 'ogg'] }]
        });
        if (!result.canceled && result.filePaths.length > 0) {
            event.reply('audio-file-selected', { type, path: result.filePaths[0] });
        }
    } catch (err) {
        console.error("Error opening dialog:", err);
    }
});

ipcMain.on('set-target-display', (e, id) => { selectedDisplayId = id; });

ipcMain.on('launch-projector', (event) => {
    if (projectorWindow) {
        projectorWindow.focus();
        return;
    }
    const displays = screen.getAllDisplays();
    let targetDisplay = displays.find(d => d.id == selectedDisplayId);
    if (!targetDisplay) targetDisplay = displays.find(d => d.id !== screen.getPrimaryDisplay().id) || screen.getPrimaryDisplay();

    projectorWindow = new BrowserWindow({
        x: targetDisplay.bounds.x,
        y: targetDisplay.bounds.y,
        width: targetDisplay.bounds.width,
        height: targetDisplay.bounds.height,
        fullscreen: true,
        kiosk: true,
        autoHideMenuBar: true,
        backgroundColor: '#000000',
        webPreferences: { nodeIntegration: true, contextIsolation: false },
        frame: false,
        alwaysOnTop: true,
        skipTaskbar: true
    });

    projectorWindow.loadFile('projector.html');
    
    // Allow closing projector with Escape key from the main process if needed
    // but better to handle it in the projector.html renderer for responsiveness.

    projectorWindow.on('closed', () => { 
        projectorWindow = null; 
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('projector-status', false);
        }
    });

    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('projector-status', true);
    }
});

ipcMain.on('close-projector', () => { if (projectorWindow) projectorWindow.close(); });

ipcMain.on('update-timer', (event, data) => {
    if (projectorWindow) projectorWindow.webContents.send('timer-tick', data);
});

app.whenReady().then(() => {
    screen.on('display-added', sendDisplayList);
    screen.on('display-removed', sendDisplayList);
    createMainWindow();
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
