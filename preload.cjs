const { contextBridge, ipcRenderer } = require('electron');

// Basic preload script
window.addEventListener('DOMContentLoaded', () => {
    console.log('Laser Analyzer Loaded');
});

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld(
    'electronAPI', {
    appendLog: (data) => ipcRenderer.invoke('append-log', data),
    saveImageSequence: (data) => ipcRenderer.invoke('save-image-seq', data)
}
);
