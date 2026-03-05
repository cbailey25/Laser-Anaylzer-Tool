const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const isDev = !app.isPackaged;

function createWindow() {
    const win = new BrowserWindow({
        width: 1400,
        height: 900,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.cjs'),
        },
        backgroundColor: '#0a0e1a',
        title: 'Laser Analyzer',
    });

    if (isDev) {
        win.loadURL('http://localhost:5173');
        win.webContents.openDevTools();
    } else {
        win.loadFile(path.join(__dirname, 'dist/index.html'));
    }
}

// IPC Handlers
ipcMain.handle('append-log', async (event, { filePath, content }) => {
    try {
        fs.appendFileSync(filePath, content + '\n');
        return { success: true };
    } catch (error) {
        console.error('Failed to append to log:', error);
        return { success: false, error: error.message };
    }
});

// IPC handler for saving PNG images for training data
ipcMain.handle('save-image-seq', async (event, { folderPath, filename, base64Data }) => {
    try {
        const fullFolder = path.join(__dirname, folderPath);
        if (!fs.existsSync(fullFolder)) {
            fs.mkdirSync(fullFolder, { recursive: true });
        }

        const filePath = path.join(fullFolder, filename);
        // Remove header from base64 string
        const base64Image = base64Data.split(';base64,').pop();

        fs.writeFileSync(filePath, base64Image, { encoding: 'base64' });
        return { success: true, filePath };
    } catch (error) {
        console.error('Failed to save image:', error);
        return { success: false, error: error.message };
    }
});

app.whenReady().then(() => {
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

