const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const JSONLParser = require('./src/services/jsonlParser');
const TokenAggregator = require('./src/services/tokenAggregator');
const RealtimeMonitor = require('./src/services/realtimeMonitor');
const StatusBar = require('./src/services/statusBar');
const SettingsManager = require('./src/services/settingsManager');

let mainWindow;
let statusBar;
let settingsManager;
let realtimeMonitor;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    icon: path.join(__dirname, 'resources', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#1e1e1e',
    vibrancy: 'ultra-dark',
    visualEffectState: 'active',
    show: false
  });

  mainWindow.loadFile('index.html');

  // Open DevTools for debugging
  mainWindow.webContents.openDevTools();

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
  
  // Initialize services
  settingsManager = new SettingsManager();
  realtimeMonitor = new RealtimeMonitor();
  
  // Initialize status bar
  statusBar = new StatusBar(mainWindow, realtimeMonitor);
  const statusBarSettings = settingsManager.getStatusBarSettings();
  statusBar.updateSettings(statusBarSettings);
  statusBar.init();
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  // Clean up status bar
  if (statusBar) {
    statusBar.destroy();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

// Handle IPC requests for token usage data
ipcMain.handle('load-token-usage', async () => {
  console.log('IPC: load-token-usage called');
  try {
    const parser = new JSONLParser();
    const aggregator = new TokenAggregator();
    
    console.log('Loading token usage data...');
    // Load all token usage data
    const tokenData = await parser.getAllTokenUsage();
    console.log('Token data loaded:', tokenData.length, 'entries');
    
    // Aggregate data
    const dailyData = aggregator.aggregateByDay(tokenData);
    const sessionData = aggregator.aggregateBySession(tokenData);
    
    console.log('Aggregated data:', {
      daily: dailyData.length,
      sessions: sessionData.length
    });
    
    // Return both raw data and aggregated data
    return {
      success: true,
      data: {
        raw: tokenData,
        daily: dailyData,
        sessions: sessionData
      }
    };
  } catch (error) {
    console.error('Error loading token usage:', error);
    return {
      success: false,
      error: error.message,
      stack: error.stack
    };
  }
});

// Handle IPC requests for real-time usage data
ipcMain.handle('load-recent-usage', async () => {
  console.log('IPC: load-recent-usage called');
  try {
    if (!realtimeMonitor) {
      realtimeMonitor = new RealtimeMonitor();
    }
    
    console.log('Loading recent usage data...');
    const recentData = await realtimeMonitor.getRecentUsage();
    
    console.log('Recent data loaded:', {
      recent: recentData.recent.length,
      hourlyTokens: recentData.hourlyWindow.totalTokens,
      weeklyTokens: recentData.weeklyWindow.totalTokens
    });
    
    return {
      success: true,
      data: recentData
    };
  } catch (error) {
    console.error('Error loading recent usage:', error);
    return {
      success: false,
      error: error.message,
      stack: error.stack
    };
  }
});

// Handle IPC requests for settings
ipcMain.handle('load-settings', async () => {
  console.log('IPC: load-settings called');
  try {
    if (!settingsManager) {
      settingsManager = new SettingsManager();
    }
    
    const settings = settingsManager.getAll();
    console.log('Settings loaded:', settings);
    
    return settings;
  } catch (error) {
    console.error('Error loading settings:', error);
    return null;
  }
});

ipcMain.handle('save-settings', async (event, settings) => {
  console.log('IPC: save-settings called', settings);
  try {
    if (!settingsManager) {
      settingsManager = new SettingsManager();
    }
    
    // Save settings
    settingsManager.set('statusBar', settings.statusBar);
    
    // Update status bar with new settings
    if (statusBar) {
      statusBar.updateSettings(settings.statusBar);
    }
    
    return true;
  } catch (error) {
    console.error('Error saving settings:', error);
    return false;
  }
});