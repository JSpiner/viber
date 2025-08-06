const { describe, it, expect, beforeEach, afterEach } = require('@jest/globals');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const ClaudeSettingsManager = require('../src/services/claudeSettingsManager');

describe('ClaudeSettingsManager', () => {
  let manager;
  let testDir;
  let settingsPath;
  let backupPath;

  beforeEach(async () => {
    // Create a temporary test directory
    testDir = path.join(os.tmpdir(), 'viber-test-' + Date.now());
    await fs.mkdir(testDir, { recursive: true });
    
    settingsPath = path.join(testDir, '.claude', 'settings.json');
    backupPath = path.join(testDir, '.claude', 'settings.backup.json');
    
    // Mock the home directory
    jest.spyOn(os, 'homedir').mockReturnValue(testDir);
    
    manager = new ClaudeSettingsManager();
  });

  afterEach(async () => {
    // Clean up test directory
    await fs.rm(testDir, { recursive: true, force: true });
    jest.restoreAllMocks();
  });

  describe('readSettings', () => {
    it('should return empty object when settings file does not exist', async () => {
      const settings = await manager.readSettings();
      expect(settings).toEqual({});
    });

    it('should read and parse existing settings file', async () => {
      const testSettings = { hooks: { afterApiResponseEnd: 'echo "test"' } };
      await fs.mkdir(path.dirname(settingsPath), { recursive: true });
      await fs.writeFile(settingsPath, JSON.stringify(testSettings));
      
      const settings = await manager.readSettings();
      expect(settings).toEqual(testSettings);
    });

    it('should throw error for invalid JSON', async () => {
      await fs.mkdir(path.dirname(settingsPath), { recursive: true });
      await fs.writeFile(settingsPath, 'invalid json');
      
      await expect(manager.readSettings()).rejects.toThrow();
    });
  });

  describe('writeSettings', () => {
    it('should create directory if it does not exist', async () => {
      const settings = { test: 'value' };
      await manager.writeSettings(settings);
      
      const exists = await fs.access(settingsPath).then(() => true).catch(() => false);
      expect(exists).toBe(true);
    });

    it('should write settings with proper formatting', async () => {
      const settings = { hooks: { test: 'command' } };
      await manager.writeSettings(settings);
      
      const content = await fs.readFile(settingsPath, 'utf8');
      expect(content).toBe(JSON.stringify(settings, null, 2));
    });

    it('should create backup of existing file', async () => {
      const originalSettings = { original: true };
      const newSettings = { new: true };
      
      await fs.mkdir(path.dirname(settingsPath), { recursive: true });
      await fs.writeFile(settingsPath, JSON.stringify(originalSettings));
      
      await manager.writeSettings(newSettings);
      
      const backupContent = await fs.readFile(backupPath, 'utf8');
      expect(JSON.parse(backupContent)).toEqual(originalSettings);
    });
  });

  describe('updateHook', () => {
    it('should add hook to empty settings', async () => {
      await manager.updateHook('afterApiResponseEnd', 'echo "done"');
      
      const settings = await manager.readSettings();
      expect(settings.hooks.afterApiResponseEnd).toBe('echo "done"');
    });

    it('should update existing hook', async () => {
      const initialSettings = { 
        hooks: { afterApiResponseEnd: 'old command' },
        other: 'value'
      };
      await manager.writeSettings(initialSettings);
      
      await manager.updateHook('afterApiResponseEnd', 'new command');
      
      const settings = await manager.readSettings();
      expect(settings.hooks.afterApiResponseEnd).toBe('new command');
      expect(settings.other).toBe('value'); // Should preserve other settings
    });
  });

  describe('addHook', () => {
    it('should add hook when none exists', async () => {
      await manager.addHook('afterApiResponseEnd', 'echo "test"');
      
      const settings = await manager.readSettings();
      expect(settings.hooks.afterApiResponseEnd).toBe('echo "test"');
    });

    it('should convert single hook to array when adding second', async () => {
      await manager.addHook('afterApiResponseEnd', 'first command');
      await manager.addHook('afterApiResponseEnd', 'second command');
      
      const settings = await manager.readSettings();
      expect(settings.hooks.afterApiResponseEnd).toEqual(['first command', 'second command']);
    });

    it('should add to existing array', async () => {
      const initialSettings = {
        hooks: { afterApiResponseEnd: ['cmd1', 'cmd2'] }
      };
      await manager.writeSettings(initialSettings);
      
      await manager.addHook('afterApiResponseEnd', 'cmd3');
      
      const settings = await manager.readSettings();
      expect(settings.hooks.afterApiResponseEnd).toEqual(['cmd1', 'cmd2', 'cmd3']);
    });
  });

  describe('removeHook', () => {
    it('should remove single hook by matching command', async () => {
      await manager.addHook('afterApiResponseEnd', 'test command');
      await manager.removeHook('afterApiResponseEnd', 'test command');
      
      const settings = await manager.readSettings();
      expect(settings.hooks).toBeUndefined();
    });

    it('should remove single hook by index 0', async () => {
      await manager.addHook('afterApiResponseEnd', 'test command');
      await manager.removeHook('afterApiResponseEnd', 0);
      
      const settings = await manager.readSettings();
      expect(settings.hooks).toBeUndefined();
    });

    it('should remove from array by index', async () => {
      const initialSettings = {
        hooks: { afterApiResponseEnd: ['cmd1', 'cmd2', 'cmd3'] }
      };
      await manager.writeSettings(initialSettings);
      
      await manager.removeHook('afterApiResponseEnd', 1);
      
      const settings = await manager.readSettings();
      expect(settings.hooks.afterApiResponseEnd).toEqual(['cmd1', 'cmd3']);
    });

    it('should convert array to string when only one left', async () => {
      const initialSettings = {
        hooks: { afterApiResponseEnd: ['cmd1', 'cmd2'] }
      };
      await manager.writeSettings(initialSettings);
      
      await manager.removeHook('afterApiResponseEnd', 0);
      
      const settings = await manager.readSettings();
      expect(settings.hooks.afterApiResponseEnd).toBe('cmd2');
    });

    it('should clean up empty hooks object', async () => {
      await manager.addHook('afterApiResponseEnd', 'test');
      await manager.removeHook('afterApiResponseEnd', 0);
      
      const settings = await manager.readSettings();
      expect(settings.hooks).toBeUndefined();
    });
  });

  describe('getInstalledHooks', () => {
    it('should return empty object when no hooks exist', async () => {
      const hooks = await manager.getInstalledHooks();
      expect(hooks).toEqual({});
    });

    it('should parse and categorize hooks correctly', async () => {
      const testSettings = {
        hooks: {
          afterApiResponseEnd: 'terminal-notifier -title "Test" -message "Done"',
          beforeApiRequest: [
            'curl -H "Content-type: application/json" https://example.com/webhook',
            'echo "Started" >> ~/.log'
          ]
        }
      };
      await manager.writeSettings(testSettings);
      
      const hooks = await manager.getInstalledHooks();
      
      expect(hooks.afterApiResponseEnd).toHaveLength(1);
      expect(hooks.afterApiResponseEnd[0].type).toBe('macOS Notification');
      expect(hooks.afterApiResponseEnd[0].metadata.title).toBe('Test');
      
      expect(hooks.beforeApiRequest).toHaveLength(2);
      expect(hooks.beforeApiRequest[0].type).toBe('Webhook');
      expect(hooks.beforeApiRequest[0].metadata.url).toBe('https://example.com/webhook');
      expect(hooks.beforeApiRequest[1].type).toBe('File Logging');
    });
  });

  describe('parseHookType', () => {
    it('should identify macOS notification hooks', () => {
      const type = manager.parseHookType('terminal-notifier -title "Test"');
      expect(type).toBe('macOS Notification');
    });

    it('should identify webhook hooks', () => {
      const type = manager.parseHookType('curl https://api.example.com/hook');
      expect(type).toBe('Webhook');
    });

    it('should identify file logging hooks', () => {
      expect(manager.parseHookType('echo "test" >> file.log')).toBe('File Logging');
      expect(manager.parseHookType('cat data.txt')).toBe('File Logging');
    });

    it('should default to custom script', () => {
      const type = manager.parseHookType('python script.py');
      expect(type).toBe('Custom Script');
    });
  });

  describe('extractMetadata', () => {
    it('should extract URLs', () => {
      const metadata = manager.extractMetadata('curl https://example.com/webhook -d data');
      expect(metadata.url).toBe('https://example.com/webhook');
    });

    it('should extract file paths', () => {
      const metadata = manager.extractMetadata('echo "test" >> /var/log/test.log');
      expect(metadata.filePath).toBe('/var/log/test.log');
    });

    it('should extract terminal-notifier parameters', () => {
      const metadata = manager.extractMetadata('terminal-notifier -title "My Title" -message "My Message"');
      expect(metadata.title).toBe('My Title');
      expect(metadata.message).toBe('My Message');
    });
  });

  describe('restoreFromBackup', () => {
    it('should restore settings from backup file', async () => {
      const originalSettings = { hooks: { test: 'original' } };
      const newSettings = { hooks: { test: 'new' } };
      
      await manager.writeSettings(originalSettings);
      await manager.writeSettings(newSettings);
      
      const restored = await manager.restoreFromBackup();
      expect(restored).toBe(true);
      
      const settings = await manager.readSettings();
      expect(settings).toEqual(originalSettings);
    });

    it('should return false when no backup exists', async () => {
      const restored = await manager.restoreFromBackup();
      expect(restored).toBe(false);
    });
  });

  describe('validateJSON', () => {
    it('should validate correct JSON', () => {
      const result = manager.validateJSON('{"valid": true}');
      expect(result.valid).toBe(true);
    });

    it('should return error for invalid JSON', () => {
      const result = manager.validateJSON('{"invalid": }');
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });
  });
});