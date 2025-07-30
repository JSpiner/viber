const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  loadTokenUsage: () => ipcRenderer.invoke('load-token-usage'),
  loadRecentUsage: () => ipcRenderer.invoke('load-recent-usage'),
  loadSettings: () => ipcRenderer.invoke('load-settings'),
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
  onStatisticsUpdate: (callback) => ipcRenderer.on('statistics-update', callback),
  onSwitchTab: (callback) => ipcRenderer.on('switch-to-tab', callback)
});