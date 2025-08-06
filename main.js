const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const JSONLParser = require('./src/services/jsonlParser');
const TokenAggregator = require('./src/services/tokenAggregator');
const RealtimeMonitor = require('./src/services/realtimeMonitor');
const StatusBar = require('./src/services/statusBar');
const SettingsManager = require('./src/services/settingsManager');
const ClaudeSettingsManager = require('./src/services/claudeSettingsManager');
const HooksManager = require('./src/services/hooksManager');
const AgentsManager = require('./src/services/agentsManager');
const agentsGallery = require('./src/services/agentsGallery');

let mainWindow;
let statusBar;
let settingsManager;
let realtimeMonitor;
let claudeSettingsManager;
let hooksManager;
let agentsManager;

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
      nodeIntegration: false,
      webviewTag: true,
      webSecurity: false
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
  claudeSettingsManager = new ClaudeSettingsManager();
  hooksManager = new HooksManager();
  agentsManager = new AgentsManager();
  
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

// Hooks IPC Handlers
ipcMain.handle('get-installed-hooks', async () => {
  console.log('IPC: get-installed-hooks called');
  try {
    const hooks = await claudeSettingsManager.getInstalledHooks();
    return { success: true, data: hooks };
  } catch (error) {
    console.error('Error getting installed hooks:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-available-hooks', async () => {
  console.log('IPC: get-available-hooks called');
  try {
    const hooks = hooksManager.getAvailableHooks();
    return { success: true, data: hooks };
  } catch (error) {
    console.error('Error getting available hooks:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('check-hook-prerequisites', async (event, hookId) => {
  console.log('IPC: check-hook-prerequisites called for', hookId);
  try {
    const result = await hooksManager.checkHookPrerequisites(hookId);
    return { success: true, data: result };
  } catch (error) {
    console.error('Error checking prerequisites:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('install-hook', async (event, hookId, params) => {
  console.log('IPC: install-hook called', hookId, params);
  try {
    const command = hooksManager.generateHookCommand(hookId, params);
    // Always use 'Notification' event for Claude hooks
    const settings = await claudeSettingsManager.readSettings();
    
    // Initialize hooks structure if it doesn't exist
    if (!settings.hooks) {
      settings.hooks = {};
    }
    
    // Initialize Notification array if it doesn't exist
    if (!settings.hooks.Notification) {
      settings.hooks.Notification = [];
    }
    
    // Create hook object with metadata
    const hookObject = {
      type: "command",
      command: command
    };
    
    // Add metadata for webhook
    if (hookId === 'web-hook-claude-done-notification' && params.webhookUrl) {
      hookObject.metadata = {
        url: params.webhookUrl
      };
    }
    
    // Add new hook with matcher and command structure
    settings.hooks.Notification.push({
      matcher: "*",
      hooks: [hookObject]
    });
    
    await claudeSettingsManager.writeSettings(settings);
    return { success: true };
  } catch (error) {
    console.error('Error installing hook:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('remove-hook', async (event, hookEvent, index) => {
  console.log('IPC: remove-hook called', hookEvent, index);
  try {
    await claudeSettingsManager.removeHook(hookEvent, index);
    return { success: true };
  } catch (error) {
    console.error('Error removing hook:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('test-hook', async (event, hookId, params) => {
  console.log('IPC: test-hook called', hookId, params);
  try {
    const command = hooksManager.generateHookCommand(hookId, params);
    const result = await hooksManager.testHook(command);
    return { success: true, data: result };
  } catch (error) {
    console.error('Error testing hook:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('test-hook-command', async (event, command) => {
  console.log('IPC: test-hook-command called');
  try {
    const result = await hooksManager.testHook(command);
    return { success: true, data: result };
  } catch (error) {
    console.error('Error testing hook command:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('add-hook-command', async (event, hookEvent, command) => {
  console.log('IPC: add-hook-command called', hookEvent);
  try {
    await claudeSettingsManager.addHook(hookEvent, command);
    return { success: true };
  } catch (error) {
    console.error('Error adding hook command:', error);
    return { success: false, error: error.message };
  }
});

// Agents IPC Handlers
ipcMain.handle('load-agents', async () => {
  console.log('IPC: load-agents called');
  try {
    const agents = await agentsManager.loadAgents();
    return { success: true, data: agents };
  } catch (error) {
    console.error('Error loading agents:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('load-recommended-agents', async () => {
  console.log('IPC: load-recommended-agents called');
  try {
    const agents = await agentsGallery.getRecommendedAgents();
    return { success: true, data: agents };
  } catch (error) {
    console.error('Error loading recommended agents:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('create-agent', async (event, agentData) => {
  console.log('IPC: create-agent called');
  console.log('Received agentData:', JSON.stringify(agentData, null, 2));
  console.log('agentData.name:', agentData?.name);
  console.log('agentData.content:', agentData?.content);
  console.log('agentData.content length:', agentData?.content?.length);
  
  try {
    await agentsManager.createAgent(agentData);
    return { success: true };
  } catch (error) {
    console.error('Error creating agent:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('update-agent', async (event, agentName, agentData) => {
  console.log('IPC: update-agent called');
  console.log('Agent name to update:', agentName);
  console.log('Received agentData:', JSON.stringify(agentData, null, 2));
  console.log('agentData.name:', agentData?.name);
  console.log('agentData.content:', agentData?.content);
  console.log('agentData.content length:', agentData?.content?.length);
  
  try {
    await agentsManager.updateAgent(agentName, agentData);
    return { success: true };
  } catch (error) {
    console.error('Error updating agent:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('delete-agent', async (event, agentName) => {
  console.log('IPC: delete-agent called', agentName);
  try {
    await agentsManager.deleteAgent(agentName);
    return { success: true };
  } catch (error) {
    console.error('Error deleting agent:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('clone-agent', async (event, sourceAgentName, targetAgentName) => {
  console.log('IPC: clone-agent called', sourceAgentName, '->', targetAgentName);
  try {
    await agentsManager.cloneAgent(sourceAgentName, targetAgentName);
    return { success: true };
  } catch (error) {
    console.error('Error cloning agent:', error);
    return { success: false, error: error.message };
  }
});

// Session Log IPC Handlers
ipcMain.handle('get-claude-sessions', async () => {
  console.log('IPC: get-claude-sessions called');
  const fs = require('fs').promises;
  const os = require('os');
  
  try {
    const claudeProjectsPath = path.join(os.homedir(), '.claude', 'projects');
    console.log('Looking for sessions in:', claudeProjectsPath);
    
    // Check if directory exists
    try {
      await fs.access(claudeProjectsPath);
    } catch (e) {
      console.log('Claude projects directory does not exist');
      return { success: true, data: [] };
    }
    
    const projects = await fs.readdir(claudeProjectsPath);
    console.log('Found projects:', projects);
    
    const sessions = [];
    
    for (const project of projects) {
      if (project.startsWith('.')) continue;
      
      const projectPath = path.join(claudeProjectsPath, project);
      const projectStats = await fs.stat(projectPath);
      
      if (projectStats.isDirectory()) {
        const files = await fs.readdir(projectPath);
        const jsonlFiles = files.filter(f => f.endsWith('.jsonl'));
        
        for (const file of jsonlFiles) {
          const filePath = path.join(projectPath, file);
          const stats = await fs.stat(filePath);
          const sessionId = file.replace('.jsonl', '');
          
          sessions.push({
            id: `${project}/${sessionId}`,
            projectName: project,
            sessionId,
            filePath,
            startTime: stats.birthtime,
            modifiedTime: stats.mtime,
            size: stats.size
          });
        }
      }
    }
    
    console.log(`Found ${sessions.length} sessions`);
    return { success: true, data: sessions };
  } catch (error) {
    console.error('Error getting sessions:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('read-session-file', async (event, filePath) => {
  console.log('IPC: read-session-file called', filePath);
  const fs = require('fs').promises;
  const readline = require('readline');
  const { createReadStream } = require('fs');
  
  try {
    const messages = [];
    let summary = '';
    
    const fileStream = createReadStream(filePath);
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });
    
    for await (const line of rl) {
      try {
        const data = JSON.parse(line);
        if (data.type === 'summary' && data.summary) {
          summary = data.summary;
        } else if (data.type === 'user' || data.type === 'assistant') {
          messages.push(data);
        }
      } catch (e) {
        // Ignore parse errors
      }
    }
    
    return { success: true, data: { summary, messages } };
  } catch (error) {
    console.error('Error reading session file:', error);
    return { success: false, error: error.message };
  }
});