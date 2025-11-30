const { exec } = require('child_process');
const ClaudeSettingsManager = require('./claudeSettingsManager');

class HooksManager {
  constructor() {
    this.settingsManager = new ClaudeSettingsManager();
    this.availableHooks = this.getAvailableHooks();
  }

  /**
   * Get list of available hooks with their configurations
   * Filters hooks based on current platform
   */
  getAvailableHooks() {
    const platform = process.platform;

    const allHooks = [
      {
        id: 'mac-os-claude-done-notification',
        name: 'macOS Done Notification (terminal-notifier)',
        description: 'Display native macOS notifications when Claude completes a task',
        category: 'notification',
        platform: 'darwin',
        prerequisites: ['terminal-notifier'],
        defaultConfig: {
          event: 'afterApiResponseEnd',
          command: "terminal-notifier -title 'Claude Code' -message 'Task completed' -sound Glass"
        }
      },
      {
        id: 'osascript-notification',
        name: 'macOS Native Notification (osascript)',
        description: 'Display native macOS notifications using built-in osascript (no additional tools required)',
        category: 'notification',
        platform: 'darwin',
        prerequisites: [],
        defaultConfig: {
          event: 'afterApiResponseEnd',
          command: "osascript -e 'display notification \"Task completed\" with title \"Claude Code\" sound name \"Glass\"'"
        }
      },
      {
        id: 'windows-toast-notification',
        name: 'Windows Toast Notification',
        description: 'Display native Windows toast notifications using PowerShell (no additional tools required)',
        category: 'notification',
        platform: 'win32',
        prerequisites: [],
        defaultConfig: {
          event: 'afterApiResponseEnd',
          command: "powershell -Command \"[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null; $template = [Windows.UI.Notifications.ToastTemplateType]::ToastText02; $xml = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent($template); $xml.GetElementsByTagName('text')[0].AppendChild($xml.CreateTextNode('Claude Code')) | Out-Null; $xml.GetElementsByTagName('text')[1].AppendChild($xml.CreateTextNode('Task completed')) | Out-Null; $toast = [Windows.UI.Notifications.ToastNotification]::new($xml); [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('Claude Code').Show($toast)\""
        }
      },
      {
        id: 'windows-balloon-notification',
        name: 'Windows Balloon Notification',
        description: 'Display Windows balloon notifications using PowerShell (simpler, works on older Windows)',
        category: 'notification',
        platform: 'win32',
        prerequisites: [],
        defaultConfig: {
          event: 'afterApiResponseEnd',
          command: "powershell -Command \"Add-Type -AssemblyName System.Windows.Forms; $notify = New-Object System.Windows.Forms.NotifyIcon; $notify.Icon = [System.Drawing.SystemIcons]::Information; $notify.Visible = $true; $notify.ShowBalloonTip(5000, 'Claude Code', 'Task completed', [System.Windows.Forms.ToolTipIcon]::Info); Start-Sleep -Seconds 5; $notify.Dispose()\""
        }
      },
      {
        id: 'web-hook-claude-done-notification',
        name: 'Webhook Notification',
        description: 'Send webhook notifications to external services (Slack-compatible)',
        category: 'notification',
        platform: 'all',
        prerequisites: ['curl'],
        defaultConfig: {
          event: 'afterApiResponseEnd',
          command: "curl -H 'Content-type: application/json' --data '{\"text\":\"Claude Code: Task completed\"}' YOUR_WEBHOOK_URL"
        }
      }
    ];

    // Filter hooks based on current platform
    return allHooks.filter(hook =>
      hook.platform === 'all' || hook.platform === platform
    );
  }

  /**
   * Check if a prerequisite is installed
   * @param {string} command - Command to check
   * @returns {Promise<boolean>} True if installed
   */
  async checkPrerequisite(command) {
    return new Promise((resolve) => {
      const isWindows = process.platform === 'win32';
      const checkCommand = isWindows ? `where ${command}` : `which ${command}`;

      exec(checkCommand, (error) => {
        resolve(!error);
      });
    });
  }

  /**
   * Check all prerequisites for a hook
   * @param {string} hookId - Hook ID
   * @returns {Promise<Object>} Prerequisites check result
   */
  async checkHookPrerequisites(hookId) {
    const hook = this.availableHooks.find(h => h.id === hookId);
    if (!hook) return { allMet: false, missing: [] };

    const results = await Promise.all(
      hook.prerequisites.map(async (prereq) => ({
        command: prereq,
        installed: await this.checkPrerequisite(prereq)
      }))
    );

    const missing = results.filter(r => !r.installed).map(r => r.command);
    return {
      allMet: missing.length === 0,
      missing,
      results
    };
  }

  /**
   * Install a hook from available hooks
   * @param {string} hookId - Hook ID to install
   * @param {Object} config - Hook configuration
   */
  async installHook(hookId, config = {}) {
    const hook = this.availableHooks.find(h => h.id === hookId);
    if (!hook) throw new Error('Hook not found');

    const command = config.command || hook.defaultConfig.command;
    const event = config.event || hook.defaultConfig.event;

    await this.settingsManager.addHook(event, command);
    return { success: true, event, command };
  }

  /**
   * Test a hook command
   * @param {string} command - Hook command to test
   * @returns {Promise<Object>} Test result
   */
  async testHook(command) {
    return new Promise((resolve) => {
      // Replace variables with test data
      const testCommand = command
        .replace(/\{project_name\}/g, 'test-project')
        .replace(/\{duration\}/g, '2.5s')
        .replace(/\{tokens_used\}/g, '1,234')
        .replace(/\{cost\}/g, '0.02');

      exec(testCommand, { timeout: 5000 }, (error, stdout, stderr) => {
        resolve({
          success: !error,
          output: stdout || stderr,
          error: error ? error.message : null,
          exitCode: error ? error.code : 0
        });
      });
    });
  }

  /**
   * Generate hook command from template
   * @param {string} hookId - Hook ID
   * @param {Object} params - Parameters for the hook
   */
  generateHookCommand(hookId, params) {
    const hook = this.availableHooks.find(h => h.id === hookId);
    if (!hook) return null;

    let command = hook.defaultConfig.command;

    switch (hookId) {
      case 'mac-os-claude-done-notification':
        if (params.title) {
          command = command.replace(/'Claude Code'/, `'${params.title}'`);
        }
        if (params.message) {
          command = command.replace(/'Task completed'/, `'${params.message}'`);
        }
        if (params.sound) {
          command = command.replace(/Glass/, params.sound);
        }
        break;

      case 'osascript-notification':
        if (params.title) {
          command = command.replace(/\"Claude Code\"/, `\"${params.title}\"`);
        }
        if (params.message) {
          command = command.replace(/\"Task completed\"/, `\"${params.message}\"`);
        }
        if (params.sound) {
          command = command.replace(/\"Glass\"/, `\"${params.sound}\"`);
        }
        break;

      case 'web-hook-claude-done-notification':
        if (params.webhookUrl) {
          command = command.replace(/YOUR_WEBHOOK_URL/, params.webhookUrl);
        }
        if (params.message) {
          const text = params.message || 'Claude Code: Task completed';
          command = command.replace(/\"Claude Code: Task completed\"/, `"${text}"`);
        }
        break;

      case 'windows-toast-notification':
        if (params.title) {
          command = command.replace(/'Claude Code'/, `'${params.title}'`);
        }
        if (params.message) {
          command = command.replace(/'Task completed'/, `'${params.message}'`);
        }
        break;

      case 'windows-balloon-notification':
        if (params.title) {
          command = command.replace(/'Claude Code'/, `'${params.title}'`);
        }
        if (params.message) {
          command = command.replace(/'Task completed'/, `'${params.message}'`);
        }
        break;
    }

    return command;
  }

  /**
   * Get installation instructions for missing prerequisites
   * @param {string} prerequisite - Prerequisite command
   */
  getInstallationInstructions(prerequisite) {
    const instructions = {
      'terminal-notifier': {
        homebrew: 'brew install terminal-notifier',
        github: 'https://github.com/julienXX/terminal-notifier/releases',
        manual: 'Download the latest release from GitHub and add to PATH',
        note: 'macOS only - not available on Windows'
      },
      'curl': {
        homebrew: 'brew install curl',
        winget: 'winget install curl',
        chocolatey: 'choco install curl',
        scoop: 'scoop install curl',
        manual: 'Windows 10+ includes curl by default. For older versions, download from https://curl.se/windows/'
      }
    };

    return instructions[prerequisite] || {};
  }

  /**
   * Export hooks configuration
   */
  async exportHooks() {
    const settings = await this.settingsManager.readSettings();
    return settings.hooks || {};
  }

  /**
   * Import hooks configuration
   * @param {Object} hooksConfig - Hooks configuration to import
   */
  async importHooks(hooksConfig) {
    const settings = await this.settingsManager.readSettings();
    settings.hooks = { ...settings.hooks, ...hooksConfig };
    await this.settingsManager.writeSettings(settings);
  }

  /**
   * Get hook events supported by Claude Code
   */
  getSupportedHookEvents() {
    return [
      'afterApiResponseEnd',
      'beforeApiRequest',
      'onError',
      'onModelSwitch',
      'onProjectSwitch'
    ];
  }

  /**
   * Validate hook command for security
   * @param {string} command - Command to validate
   */
  validateHookCommand(command) {
    // Basic security checks
    const dangerousPatterns = [
      /rm\s+-rf/,
      />\s*\/dev\/sda/,
      /format\s+[cC]:/,
      /del\s+\/s\s+\/q/,
      /\$\(.*\)/,  // Command substitution
      /`.*`/,      // Backtick substitution
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(command)) {
        return {
          valid: false,
          reason: 'Command contains potentially dangerous operations'
        };
      }
    }

    return { valid: true };
  }
}

module.exports = HooksManager;