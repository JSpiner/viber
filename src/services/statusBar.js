const { Tray, Menu, app, shell, BrowserWindow, nativeImage } = require('electron');
const StatusBarIcons = require('./statusBarIcons');
const path = require('path');

class StatusBar {
  constructor(mainWindow, realtimeMonitor) {
    this.mainWindow = mainWindow;
    this.realtimeMonitor = realtimeMonitor;
    this.tray = null;
    this.icons = new StatusBarIcons();
    this.updateInterval = null;
    this.settings = {
      enabled: true,
      displayMode: 'compact', // 'full', 'compact', 'icon-only'
      alertsEnabled: true,
      alertThreshold: 90,
      updateFrequency: 5, // minutes
      notifyOnReset: false
    };
    this.lastAlertTime = null;
    this.currentUsageData = null;
  }

  async init() {
    if (!this.settings.enabled) return;
    
    // Create tray icon
    const icon = this.icons.getIcon('normal', 0);
    this.tray = new Tray(icon);
    this.tray.setToolTip('Viber - Token Usage Monitor');
    
    // Set up click handler
    this.tray.on('click', () => {
      this.updateMenu();
    });
    
    // Start periodic updates
    this.startUpdates();
    
    // Initial update
    await this.update();
  }

  async update() {
    try {
      // Get recent usage data
      const data = await this.realtimeMonitor.getRecentUsage();
      this.currentUsageData = data;
      
      // Calculate usage percentage for 5-hour window
      const usagePercent = data.hourlyWindow.limit > 0 
        ? Math.round((data.hourlyWindow.effectiveTotal / data.hourlyWindow.limit) * 100)
        : 0;
      
      // Update icon based on usage
      const state = this.icons.getStateFromUsage(usagePercent);
      const icon = this.icons.getIcon(state, usagePercent);
      this.tray.setImage(icon);
      
      // Update title based on display mode
      this.updateTitle(usagePercent, data.hourlyWindow);
      
      // Check for alerts
      if (this.settings.alertsEnabled) {
        this.checkAlerts(usagePercent);
      }
      
      // Update menu if it's open
      if (this.tray.popUpContextMenu) {
        this.updateMenu();
      }
    } catch (error) {
      console.error('Error updating status bar:', error);
    }
  }

  updateTitle(usagePercent, windowData) {
    let title = '';
    
    switch (this.settings.displayMode) {
      case 'full':
        // Full: TPM, Percentage, Session Count
        const tpm = Math.round(this.currentUsageData?.tokensPerMinute || 0);
        const sessionCount = windowData.messageCount || 0;
        title = `${tpm} tpm | ${usagePercent}% | ${sessionCount}`;
        break;
      case 'compact':
        // Compact: Just TPM
        const compactTpm = Math.round(this.currentUsageData?.tokensPerMinute || 0);
        title = `${compactTpm} tpm`;
        break;
      case 'icon-only':
        title = '';
        break;
    }
    
    this.tray.setTitle(title);
  }

  updateMenu() {
    if (!this.currentUsageData) return;
    
    const data = this.currentUsageData;
    const hourlyPercent = data.hourlyWindow.limit > 0 
      ? Math.round((data.hourlyWindow.effectiveTotal / data.hourlyWindow.limit) * 100)
      : 0;
    const weeklyPercent = data.weeklyWindow.limit > 0 
      ? Math.round((data.weeklyWindow.effectiveTotal / data.weeklyWindow.limit) * 100)
      : 0;
    
    const menu = Menu.buildFromTemplate([
      {
        label: 'Viber Token Monitor',
        enabled: false
      },
      { type: 'separator' },
      
      // 5-Hour Window Section
      {
        label: '5-Hour Window',
        enabled: false
      },
      {
        label: `  ${this.formatNumber(data.hourlyWindow.effectiveTotal)} / ${this.formatNumber(data.hourlyWindow.limit)} tokens (${hourlyPercent}%)`,
        enabled: false
      },
      {
        label: `  Reset in ${this.formatTime(data.hourlyWindow.resetTime)}`,
        enabled: false
      },
      {
        label: `  Started: ${this.formatDate(data.hourlyWindow.sessionStart)}`,
        enabled: false
      },
      { type: 'separator' },
      
      // Weekly Window Section
      {
        label: 'Weekly Window',
        enabled: false
      },
      {
        label: `  ${this.formatNumber(data.weeklyWindow.effectiveTotal)} / ${this.formatNumber(data.weeklyWindow.limit)} tokens (${weeklyPercent}%)`,
        enabled: false
      },
      {
        label: `  Reset in ${this.formatTime(data.weeklyWindow.resetTime)}`,
        enabled: false
      },
      { type: 'separator' },
      
      // Recent Activity Section
      {
        label: 'Recent Activity (10 min)',
        enabled: false
      },
      {
        label: `  ${Math.round(data.tokensPerMinute)} tokens/min ${this.getTrendIndicator(data.trend)}`,
        enabled: false
      },
      { type: 'separator' },
      
      // Actions
      {
        label: 'Open Viber',
        click: () => {
          this.mainWindow.show();
          this.mainWindow.focus();
        }
      },
      {
        label: 'Refresh',
        click: () => {
          this.update();
        }
      },
      {
        label: 'Settings',
        click: () => {
          this.mainWindow.show();
          this.mainWindow.focus();
          // Send message to renderer to switch to settings tab
          this.mainWindow.webContents.send('switch-to-tab', 'settings');
        }
      },
      { type: 'separator' },
      {
        label: 'Quit Viber',
        click: () => {
          app.quit();
        }
      }
    ]);
    
    this.tray.setContextMenu(menu);
    this.tray.popUpContextMenu();
  }

  formatNumber(num) {
    if (num > 1000000) {
      return `${(num / 1000000).toFixed(1)}M`;
    } else if (num > 1000) {
      return `${(num / 1000).toFixed(1)}K`;
    }
    return Math.round(num).toString();
  }

  formatTime(resetTime) {
    const now = new Date();
    const timeRemaining = resetTime - now;
    
    if (timeRemaining <= 0) return 'now';
    
    const hours = Math.floor(timeRemaining / (1000 * 60 * 60));
    const minutes = Math.floor((timeRemaining % (1000 * 60 * 60)) / (1000 * 60));
    
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  }

  formatDate(date) {
    return new Date(date).toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  }

  getTrendIndicator(trend) {
    switch (trend) {
      case 'up': return '↑';
      case 'down': return '↓';
      default: return '→';
    }
  }

  checkAlerts(usagePercent) {
    if (usagePercent >= this.settings.alertThreshold) {
      const now = Date.now();
      const alertCooldown = 30 * 60 * 1000; // 30 minutes
      
      if (!this.lastAlertTime || now - this.lastAlertTime > alertCooldown) {
        this.showNotification(
          'Usage Alert',
          `Token usage at ${usagePercent}% of 5-hour limit`,
          'warning'
        );
        this.lastAlertTime = now;
      }
    }
  }

  showNotification(title, body, type = 'info') {
    const notification = {
      title: title,
      body: body,
      icon: this.icons.getIcon(type === 'warning' ? 'warning' : 'normal', 0)
    };
    
    // Show native notification
    const { Notification } = require('electron');
    const notif = new Notification(notification);
    
    notif.on('click', () => {
      this.mainWindow.show();
      this.mainWindow.focus();
      this.mainWindow.webContents.send('switch-to-tab', 'now');
    });
    
    notif.show();
  }

  startUpdates() {
    // Clear existing interval
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }
    
    // Set up new interval
    const intervalMs = this.settings.updateFrequency * 60 * 1000;
    this.updateInterval = setInterval(() => {
      this.update();
    }, intervalMs);
  }

  updateSettings(newSettings) {
    this.settings = { ...this.settings, ...newSettings };
    
    if (!this.settings.enabled) {
      this.destroy();
    } else if (!this.tray && this.settings.enabled) {
      this.init();
    } else {
      // Restart updates with new frequency
      this.startUpdates();
      // Update immediately
      this.update();
    }
  }

  destroy() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
    
    if (this.tray) {
      this.tray.destroy();
      this.tray = null;
    }
  }
}

module.exports = StatusBar;