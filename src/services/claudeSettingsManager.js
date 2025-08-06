const fs = require('fs').promises;
const path = require('path');
const os = require('os');

class ClaudeSettingsManager {
  constructor() {
    this.settingsPath = path.join(os.homedir(), '.claude', 'settings.json');
    this.backupPath = path.join(os.homedir(), '.claude', 'settings.backup.json');
  }

  /**
   * Read settings from ~/.claude/settings.json
   * @returns {Object} Parsed settings object or empty object if file doesn't exist
   */
  async readSettings() {
    try {
      const data = await fs.readFile(this.settingsPath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      if (error.code === 'ENOENT') {
        // File doesn't exist, return empty object
        return {};
      }
      throw error;
    }
  }

  /**
   * Write settings to ~/.claude/settings.json with backup
   * @param {Object} settings - Settings object to write
   */
  async writeSettings(settings) {
    // Ensure directory exists
    const dir = path.dirname(this.settingsPath);
    await fs.mkdir(dir, { recursive: true });

    // Create backup if file exists
    try {
      const currentContent = await fs.readFile(this.settingsPath, 'utf8');
      await fs.writeFile(this.backupPath, currentContent, 'utf8');
    } catch (error) {
      // File doesn't exist yet, no backup needed
    }

    // Write new settings with proper formatting
    const content = JSON.stringify(settings, null, 2);
    await fs.writeFile(this.settingsPath, content, 'utf8');
  }

  /**
   * Update hooks in settings without destroying other settings
   * @param {string} hookEvent - Hook event name (e.g., 'afterApiResponseEnd')
   * @param {string|Array} hookCommands - Hook command(s) to set
   */
  async updateHook(hookEvent, hookCommands) {
    const settings = await this.readSettings();
    
    // Initialize hooks object if it doesn't exist
    if (!settings.hooks) {
      settings.hooks = {};
    }

    // Update specific hook
    settings.hooks[hookEvent] = hookCommands;

    await this.writeSettings(settings);
  }

  /**
   * Add a hook command to an existing hook event
   * @param {string} hookEvent - Hook event name
   * @param {string} hookCommand - Hook command to add
   */
  async addHook(hookEvent, hookCommand) {
    const settings = await this.readSettings();
    
    if (!settings.hooks) {
      settings.hooks = {};
    }

    const existingHooks = settings.hooks[hookEvent];
    
    if (!existingHooks) {
      settings.hooks[hookEvent] = hookCommand;
    } else if (typeof existingHooks === 'string') {
      // Convert to array
      settings.hooks[hookEvent] = [existingHooks, hookCommand];
    } else if (Array.isArray(existingHooks)) {
      // Add to array
      settings.hooks[hookEvent].push(hookCommand);
    }

    await this.writeSettings(settings);
  }

  /**
   * Remove a specific hook command
   * @param {string} hookEvent - Hook event name (should be 'Notification')
   * @param {string|number} hookIdentifier - Hook command or index to remove
   */
  async removeHook(hookEvent, hookIdentifier) {
    const settings = await this.readSettings();
    
    if (!settings.hooks || !settings.hooks[hookEvent]) {
      return; // Nothing to remove
    }

    // For Claude format, hooks are stored as array of matcher objects
    if (hookEvent === 'Notification' && Array.isArray(settings.hooks[hookEvent])) {
      if (typeof hookIdentifier === 'number') {
        // Find which matcher group contains this index
        let currentIndex = 0;
        for (let i = 0; i < settings.hooks[hookEvent].length; i++) {
          const matcherGroup = settings.hooks[hookEvent][i];
          if (matcherGroup.hooks && Array.isArray(matcherGroup.hooks)) {
            if (hookIdentifier < currentIndex + matcherGroup.hooks.length) {
              // Found the hook to remove
              const localIndex = hookIdentifier - currentIndex;
              matcherGroup.hooks.splice(localIndex, 1);
              
              // Remove the matcher group if it has no more hooks
              if (matcherGroup.hooks.length === 0) {
                settings.hooks[hookEvent].splice(i, 1);
              }
              break;
            }
            currentIndex += matcherGroup.hooks.length;
          }
        }
      }
      
      // Clean up if array is empty
      if (settings.hooks[hookEvent].length === 0) {
        delete settings.hooks[hookEvent];
      }
    }

    // Clean up empty hooks object
    if (settings.hooks && Object.keys(settings.hooks).length === 0) {
      delete settings.hooks;
    }

    await this.writeSettings(settings);
  }

  /**
   * Get all installed hooks organized by event type
   * @returns {Object} Hooks organized by event type
   */
  async getInstalledHooks() {
    const settings = await this.readSettings();
    const hooks = settings.hooks || {};
    
    const result = {};
    
    for (const [event, hookData] of Object.entries(hooks)) {
      result[event] = [];
      
      // Handle the Claude settings.json structure
      if (Array.isArray(hookData)) {
        // Hook data is an array of matchers with hooks
        hookData.forEach((matcherGroup) => {
          if (matcherGroup.hooks && Array.isArray(matcherGroup.hooks)) {
            matcherGroup.hooks.forEach((hook, index) => {
              const command = hook.command || '';
              const hookInfo = {
                command: command,
                index: index,
                type: this.parseHookType(command),
                metadata: hook.metadata || this.extractMetadata(command),
                matcher: matcherGroup.matcher || '*',
                hookType: hook.type || 'command'
              };
              
              // Merge extracted metadata with stored metadata
              if (hook.metadata) {
                hookInfo.metadata = { ...this.extractMetadata(command), ...hook.metadata };
              }
              
              result[event].push(hookInfo);
            });
          }
        });
      } else if (typeof hookData === 'string') {
        // Simple string command (our format)
        result[event].push({
          command: hookData,
          index: 0,
          type: this.parseHookType(hookData),
          metadata: this.extractMetadata(hookData)
        });
      } else if (Array.isArray(hookData)) {
        // Array of string commands (our format)
        hookData.forEach((cmd, index) => {
          if (typeof cmd === 'string') {
            result[event].push({
              command: cmd,
              index: index,
              type: this.parseHookType(cmd),
              metadata: this.extractMetadata(cmd)
            });
          }
        });
      }
    }
    
    return result;
  }

  /**
   * Parse hook type from command
   * @param {string} command - Hook command
   * @returns {string} Hook type
   */
  parseHookType(command) {
    if (!command || typeof command !== 'string') {
      return 'Custom Script';
    }
    
    if (command.includes('terminal-notifier')) {
      return 'macOS Notification';
    } else if (command.includes('curl') && (command.includes('http://') || command.includes('https://'))) {
      return 'Webhook';
    } else if (command.includes('echo') || command.includes('cat')) {
      return 'File Logging';
    } else {
      return 'Custom Script';
    }
  }

  /**
   * Extract metadata from hook command
   * @param {string} command - Hook command
   * @returns {Object} Extracted metadata
   */
  extractMetadata(command) {
    const metadata = {};
    
    if (!command || typeof command !== 'string') {
      return metadata;
    }
    
    // Extract URLs
    const urlMatch = command.match(/https?:\/\/[^\s'"]+/);
    if (urlMatch) {
      metadata.url = urlMatch[0];
    }
    
    // Extract file paths
    const fileMatch = command.match(/>>?\s*([^\s'"]+\.(?:log|txt|json|csv))/);
    if (fileMatch) {
      metadata.filePath = fileMatch[1];
    }
    
    // Extract terminal-notifier title
    const titleMatch = command.match(/-title\s+['"]([^'"]+)['"]/);
    if (titleMatch) {
      metadata.title = titleMatch[1];
    }
    
    // Extract terminal-notifier message
    const messageMatch = command.match(/-message\s+['"]([^'"]+)['"]/);
    if (messageMatch) {
      metadata.message = messageMatch[1];
    }
    
    return metadata;
  }

  /**
   * Restore settings from backup
   */
  async restoreFromBackup() {
    try {
      const backupContent = await fs.readFile(this.backupPath, 'utf8');
      await fs.writeFile(this.settingsPath, backupContent, 'utf8');
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Validate JSON structure
   * @param {string} jsonString - JSON string to validate
   * @returns {Object} Validation result
   */
  validateJSON(jsonString) {
    try {
      JSON.parse(jsonString);
      return { valid: true };
    } catch (error) {
      return { 
        valid: false, 
        error: error.message,
        line: this.extractLineNumber(error.message)
      };
    }
  }

  extractLineNumber(errorMessage) {
    const match = errorMessage.match(/position (\d+)/);
    if (match) {
      const position = parseInt(match[1]);
      // Rough line number estimation
      return Math.floor(position / 50) + 1;
    }
    return null;
  }
}

module.exports = ClaudeSettingsManager;