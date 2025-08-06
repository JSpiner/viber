const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  loadTokenUsage: () => ipcRenderer.invoke('load-token-usage'),
  loadRecentUsage: () => ipcRenderer.invoke('load-recent-usage'),
  loadSettings: () => ipcRenderer.invoke('load-settings'),
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
  onStatisticsUpdate: (callback) => ipcRenderer.on('statistics-update', callback),
  onSwitchTab: (callback) => ipcRenderer.on('switch-to-tab', callback),
  
  // Hooks API
  getInstalledHooks: () => ipcRenderer.invoke('get-installed-hooks'),
  getAvailableHooks: () => ipcRenderer.invoke('get-available-hooks'),
  checkHookPrerequisites: (hookId) => ipcRenderer.invoke('check-hook-prerequisites', hookId),
  installHook: (hookId, params) => ipcRenderer.invoke('install-hook', hookId, params),
  removeHook: (hookEvent, index) => ipcRenderer.invoke('remove-hook', hookEvent, index),
  testHook: (hookId, params) => ipcRenderer.invoke('test-hook', hookId, params),
  testHookCommand: (command) => ipcRenderer.invoke('test-hook-command', command),
  addHookCommand: (hookEvent, command) => ipcRenderer.invoke('add-hook-command', hookEvent, command),
  
  // Agents API
  loadAgents: () => ipcRenderer.invoke('load-agents'),
  loadRecommendedAgents: () => ipcRenderer.invoke('load-recommended-agents'),
  createAgent: (agentData) => ipcRenderer.invoke('create-agent', agentData),
  updateAgent: (agentName, agentData) => ipcRenderer.invoke('update-agent', agentName, agentData),
  deleteAgent: (agentName) => ipcRenderer.invoke('delete-agent', agentName),
  cloneAgent: (sourceAgentName, targetAgentName) => ipcRenderer.invoke('clone-agent', sourceAgentName, targetAgentName),
  
  // Session Log API
  getClaudeSessions: () => ipcRenderer.invoke('get-claude-sessions'),
  readSessionFile: (filePath) => ipcRenderer.invoke('read-session-file', filePath)
});