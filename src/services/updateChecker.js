const { app, shell } = require('electron');
const https = require('https');
const semver = require('semver');
const SettingsManager = require('./settingsManager');

class UpdateChecker {
  constructor() {
    this.currentVersion = app.getVersion();
    this.latestVersion = null;
    this.updateAvailable = false;
    this.lastCheckTime = null;
    this.checkInterval = 24 * 60 * 60 * 1000; // 24 hours
    this.githubRepo = 'JSpiner/Viber';
    this.settingsManager = new SettingsManager();
    this.releaseUrl = null;
  }

  async init() {
    // Load last check time
    this.lastCheckTime = this.settingsManager.get('lastUpdateCheck');
    
    console.log('[UpdateChecker] Initialized');
    console.log(`[UpdateChecker] Current version: v${this.currentVersion}`);
    console.log(`[UpdateChecker] Last check time: ${this.lastCheckTime ? new Date(this.lastCheckTime).toLocaleString() : 'Never'}`);
    console.log('[UpdateChecker] Will check for updates in 30 seconds...');
    
    // Initial check (30 seconds after app start)
    setTimeout(() => {
      console.log('[UpdateChecker] Performing initial update check...');
      this.checkForUpdates();
    }, 30000);
    
    // Set up periodic check
    this.startPeriodicCheck();
  }

  startPeriodicCheck() {
    console.log(`[UpdateChecker] Periodic check scheduled every ${this.checkInterval / 1000 / 60 / 60} hours`);
    setInterval(() => {
      console.log('[UpdateChecker] Performing periodic update check...');
      this.checkForUpdates();
    }, this.checkInterval);
  }

  async checkForUpdates() {
    const now = Date.now();
    
    // Skip if less than 24 hours since last check
    if (this.lastCheckTime && (now - this.lastCheckTime) < this.checkInterval) {
      const timeSinceLastCheck = (now - this.lastCheckTime) / 1000 / 60; // minutes
      const timeUntilNextCheck = (this.checkInterval - (now - this.lastCheckTime)) / 1000 / 60 / 60; // hours
      console.log(`[UpdateChecker] Skipped - Last checked ${timeSinceLastCheck.toFixed(1)} minutes ago`);
      console.log(`[UpdateChecker] Next check in ${timeUntilNextCheck.toFixed(1)} hours`);
      return;
    }

    console.log(`[UpdateChecker] Checking for updates from GitHub (${this.githubRepo})...`);
    
    try {
      const releaseData = await this.fetchLatestRelease();
      
      if (releaseData && releaseData.tag_name) {
        const latestVersion = releaseData.tag_name.replace('v', '');
        
        console.log(`[UpdateChecker] Latest release found: v${latestVersion}`);
        console.log(`[UpdateChecker] Release name: ${releaseData.name || 'N/A'}`);
        console.log(`[UpdateChecker] Published at: ${releaseData.published_at}`);
        
        // Validate version format
        if (!semver.valid(latestVersion)) {
          console.error(`[UpdateChecker] Invalid version format: ${latestVersion}`);
          return;
        }
        
        if (semver.gt(latestVersion, this.currentVersion)) {
          this.updateAvailable = true;
          this.latestVersion = latestVersion;
          this.releaseUrl = releaseData.html_url;
          
          console.log(`[UpdateChecker] ✅ UPDATE AVAILABLE: v${this.currentVersion} -> v${latestVersion}`);
          console.log(`[UpdateChecker] Release URL: ${this.releaseUrl}`);
          
          // Notify main window of update
          this.notifyUpdate();
        } else if (semver.eq(latestVersion, this.currentVersion)) {
          console.log(`[UpdateChecker] ✓ Already on latest version (v${this.currentVersion})`);
          this.updateAvailable = false;
        } else {
          console.log(`[UpdateChecker] ℹ️ Current version (v${this.currentVersion}) is newer than latest release (v${latestVersion})`);
          this.updateAvailable = false;
        }
      } else {
        console.log('[UpdateChecker] No release data found');
      }
      
      // Save last check time
      this.lastCheckTime = now;
      this.settingsManager.set('lastUpdateCheck', now);
      console.log(`[UpdateChecker] Check completed at ${new Date(now).toLocaleString()}`);
      
    } catch (error) {
      console.error('[UpdateChecker] Failed to check for updates:', error.message);
    }
  }

  fetchLatestRelease() {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: 'api.github.com',
        path: `/repos/${this.githubRepo}/releases/latest`,
        method: 'GET',
        headers: {
          'User-Agent': 'Viber-App',
          'Accept': 'application/vnd.github.v3+json'
        }
      };

      console.log(`[UpdateChecker] Fetching from: https://${options.hostname}${options.path}`);

      https.get(options, (res) => {
        let data = '';
        
        console.log(`[UpdateChecker] Response status: ${res.statusCode}`);

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          try {
            const release = JSON.parse(data);
            
            // Check for API errors
            if (release.message) {
              console.log(`[UpdateChecker] GitHub API message: ${release.message}`);
              if (res.statusCode === 404) {
                console.log('[UpdateChecker] No releases found for this repository');
              } else if (res.statusCode === 403) {
                console.log('[UpdateChecker] API rate limit may have been exceeded');
              }
              resolve(null);
            } else {
              console.log(`[UpdateChecker] Successfully fetched release data`);
              resolve(release);
            }
          } catch (error) {
            console.error('[UpdateChecker] Failed to parse GitHub API response:', error.message);
            reject(error);
          }
        });
      }).on('error', (error) => {
        console.error('[UpdateChecker] Network error:', error.message);
        reject(error);
      });
    });
  }

  notifyUpdate() {
    // Send update notification to main window via IPC
    if (global.mainWindow && global.mainWindow.webContents) {
      console.log('[UpdateChecker] Sending update notification to renderer process');
      global.mainWindow.webContents.send('update-available', {
        currentVersion: this.currentVersion,
        latestVersion: this.latestVersion,
        releaseUrl: this.releaseUrl
      });
    } else {
      console.log('[UpdateChecker] Main window not available for notification');
    }
  }

  openReleasePage() {
    if (this.releaseUrl) {
      console.log(`[UpdateChecker] Opening release page: ${this.releaseUrl}`);
      shell.openExternal(this.releaseUrl);
    } else {
      console.log('[UpdateChecker] No release URL available');
    }
  }

  getUpdateInfo() {
    return {
      updateAvailable: this.updateAvailable,
      currentVersion: this.currentVersion,
      latestVersion: this.latestVersion,
      releaseUrl: this.releaseUrl
    };
  }
}

module.exports = UpdateChecker;