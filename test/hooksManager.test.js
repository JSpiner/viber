const { describe, it, expect, beforeEach } = require('@jest/globals');
const HooksManager = require('../src/services/hooksManager');
const ClaudeSettingsManager = require('../src/services/claudeSettingsManager');

// Mock the ClaudeSettingsManager
jest.mock('../src/services/claudeSettingsManager');

// Mock child_process
jest.mock('child_process', () => ({
  exec: jest.fn()
}));

const { exec } = require('child_process');

describe('HooksManager', () => {
  let manager;
  let mockSettingsManager;

  beforeEach(() => {
    jest.clearAllMocks();
    mockSettingsManager = new ClaudeSettingsManager();
    manager = new HooksManager();
    manager.settingsManager = mockSettingsManager;
  });

  describe('getAvailableHooks', () => {
    it('should return list of available hooks', () => {
      const hooks = manager.getAvailableHooks();
      expect(hooks).toHaveLength(2);
      expect(hooks[0].id).toBe('mac-os-claude-done-notification');
      expect(hooks[1].id).toBe('web-hook-claude-done-notification');
    });
  });

  describe('checkPrerequisite', () => {
    it('should return true when command exists', async () => {
      exec.mockImplementation((cmd, callback) => {
        callback(null, '/usr/local/bin/terminal-notifier');
      });

      const result = await manager.checkPrerequisite('terminal-notifier');
      expect(result).toBe(true);
      expect(exec).toHaveBeenCalledWith('which terminal-notifier', expect.any(Function));
    });

    it('should return false when command does not exist', async () => {
      exec.mockImplementation((cmd, callback) => {
        callback(new Error('Command not found'));
      });

      const result = await manager.checkPrerequisite('terminal-notifier');
      expect(result).toBe(false);
    });
  });

  describe('checkHookPrerequisites', () => {
    it('should check all prerequisites for macOS notification hook', async () => {
      exec.mockImplementation((cmd, callback) => {
        callback(null, '/usr/local/bin/terminal-notifier');
      });

      const result = await manager.checkHookPrerequisites('mac-os-claude-done-notification');
      expect(result.allMet).toBe(true);
      expect(result.missing).toEqual([]);
    });

    it('should return missing prerequisites', async () => {
      exec.mockImplementation((cmd, callback) => {
        callback(new Error('Command not found'));
      });

      const result = await manager.checkHookPrerequisites('mac-os-claude-done-notification');
      expect(result.allMet).toBe(false);
      expect(result.missing).toEqual(['terminal-notifier']);
    });

    it('should return false for unknown hook', async () => {
      const result = await manager.checkHookPrerequisites('unknown-hook');
      expect(result.allMet).toBe(false);
    });
  });

  describe('installHook', () => {
    it('should install hook with default config', async () => {
      mockSettingsManager.addHook.mockResolvedValue();

      const result = await manager.installHook('mac-os-claude-done-notification');
      
      expect(result.success).toBe(true);
      expect(result.event).toBe('afterApiResponseEnd');
      expect(mockSettingsManager.addHook).toHaveBeenCalledWith(
        'afterApiResponseEnd',
        "terminal-notifier -title 'Claude Code' -message 'Task completed' -sound Glass"
      );
    });

    it('should install hook with custom config', async () => {
      mockSettingsManager.addHook.mockResolvedValue();

      const config = {
        command: 'custom command',
        event: 'beforeApiRequest'
      };
      const result = await manager.installHook('mac-os-claude-done-notification', config);
      
      expect(result.success).toBe(true);
      expect(result.event).toBe('beforeApiRequest');
      expect(mockSettingsManager.addHook).toHaveBeenCalledWith('beforeApiRequest', 'custom command');
    });

    it('should throw error for unknown hook', async () => {
      await expect(manager.installHook('unknown-hook')).rejects.toThrow('Hook not found');
    });
  });

  describe('testHook', () => {
    it('should execute test command successfully', async () => {
      exec.mockImplementation((cmd, options, callback) => {
        callback(null, 'Success output', '');
      });

      const result = await manager.testHook('echo "test"');
      
      expect(result.success).toBe(true);
      expect(result.output).toBe('Success output');
      expect(result.error).toBe(null);
    });

    it('should handle command execution failure', async () => {
      const error = new Error('Command failed');
      error.code = 1;
      exec.mockImplementation((cmd, options, callback) => {
        callback(error, '', 'Error output');
      });

      const result = await manager.testHook('invalid command');
      
      expect(result.success).toBe(false);
      expect(result.output).toBe('Error output');
      expect(result.error).toBe('Command failed');
    });

    it('should replace template variables', async () => {
      exec.mockImplementation((cmd, options, callback) => {
        callback(null, cmd, '');
      });

      const result = await manager.testHook('echo "{project_name} {duration} {tokens_used} {cost}"');
      
      expect(result.output).toContain('test-project');
      expect(result.output).toContain('2.5s');
      expect(result.output).toContain('1,234');
      expect(result.output).toContain('0.02');
    });
  });

  describe('generateHookCommand', () => {
    it('should generate macOS notification command', () => {
      const params = {
        title: 'Custom Title',
        message: 'Custom Message',
        sound: 'Ping'
      };
      
      const command = manager.generateHookCommand('mac-os-claude-done-notification', params);
      
      expect(command).toBe("terminal-notifier -title 'Custom Title' -message 'Custom Message' -sound Ping");
    });

    it('should generate webhook command', () => {
      const params = {
        webhookUrl: 'https://hooks.slack.com/test',
        message: 'Test message'
      };
      
      const command = manager.generateHookCommand('web-hook-claude-done-notification', params);
      
      expect(command).toContain('https://hooks.slack.com/test');
      expect(command).toContain('"Test message"');
    });

    it('should return null for unknown hook', () => {
      const command = manager.generateHookCommand('unknown-hook', {});
      expect(command).toBe(null);
    });
  });

  describe('getInstallationInstructions', () => {
    it('should return instructions for terminal-notifier', () => {
      const instructions = manager.getInstallationInstructions('terminal-notifier');
      expect(instructions.homebrew).toBe('brew install terminal-notifier');
      expect(instructions.github).toContain('github.com');
    });

    it('should return instructions for curl', () => {
      const instructions = manager.getInstallationInstructions('curl');
      expect(instructions.homebrew).toBe('brew install curl');
      expect(instructions.apt).toContain('apt-get');
    });

    it('should return empty object for unknown prerequisite', () => {
      const instructions = manager.getInstallationInstructions('unknown');
      expect(instructions).toEqual({});
    });
  });

  describe('exportHooks', () => {
    it('should export hooks from settings', async () => {
      const mockHooks = { afterApiResponseEnd: 'test command' };
      mockSettingsManager.readSettings.mockResolvedValue({ hooks: mockHooks });

      const hooks = await manager.exportHooks();
      expect(hooks).toEqual(mockHooks);
    });

    it('should return empty object when no hooks exist', async () => {
      mockSettingsManager.readSettings.mockResolvedValue({});

      const hooks = await manager.exportHooks();
      expect(hooks).toEqual({});
    });
  });

  describe('importHooks', () => {
    it('should import and merge hooks', async () => {
      const existingHooks = { afterApiResponseEnd: 'existing' };
      const newHooks = { beforeApiRequest: 'new' };
      
      mockSettingsManager.readSettings.mockResolvedValue({ hooks: existingHooks });
      mockSettingsManager.writeSettings.mockResolvedValue();

      await manager.importHooks(newHooks);
      
      expect(mockSettingsManager.writeSettings).toHaveBeenCalledWith({
        hooks: {
          afterApiResponseEnd: 'existing',
          beforeApiRequest: 'new'
        }
      });
    });
  });

  describe('getSupportedHookEvents', () => {
    it('should return list of supported hook events', () => {
      const events = manager.getSupportedHookEvents();
      expect(events).toContain('afterApiResponseEnd');
      expect(events).toContain('beforeApiRequest');
      expect(events).toContain('onError');
      expect(events).toContain('onModelSwitch');
      expect(events).toContain('onProjectSwitch');
    });
  });

  describe('validateHookCommand', () => {
    it('should validate safe commands', () => {
      const safeCommands = [
        'echo "test"',
        'terminal-notifier -title "Test"',
        'curl https://example.com',
        'cat file.txt'
      ];

      safeCommands.forEach(cmd => {
        const result = manager.validateHookCommand(cmd);
        expect(result.valid).toBe(true);
      });
    });

    it('should reject dangerous commands', () => {
      const dangerousCommands = [
        'rm -rf /',
        'echo "test" > /dev/sda',
        'format C:',
        'del /s /q C:\\',
        'echo $(malicious command)',
        'echo `malicious command`'
      ];

      dangerousCommands.forEach(cmd => {
        const result = manager.validateHookCommand(cmd);
        expect(result.valid).toBe(false);
        expect(result.reason).toContain('dangerous');
      });
    });
  });
});