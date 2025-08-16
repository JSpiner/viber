// Hooks tab functionality
class HooksManager {
  constructor() {
    this.installedHooks = {};
    this.availableHooks = [];
    this.initializeEventListeners();
    this.loadHooks();
  }

  initializeEventListeners() {
    // Raw JSON view buttons
    document.getElementById('copyJsonBtn').addEventListener('click', () => this.copyJsonToClipboard());
    document.getElementById('closeJsonView').addEventListener('click', () => this.hideRawJsonView());
  }

  async loadHooks() {
    try {
      // Load installed hooks
      const installedResult = await window.electronAPI.getInstalledHooks();
      if (installedResult.success) {
        this.installedHooks = installedResult.data;
        this.renderInstalledHooks();
      }

      // Load available hooks
      const availableResult = await window.electronAPI.getAvailableHooks();
      if (availableResult.success) {
        this.availableHooks = availableResult.data;
        this.renderAvailableHooks();
      }
    } catch (error) {
      console.error('Error loading hooks:', error);
      this.showError('Failed to load hooks configuration');
    }
  }

  renderInstalledHooks() {
    const container = document.getElementById('installedHooksList');
    container.innerHTML = '';

    let totalCount = 0;

    for (const [eventType, hooks] of Object.entries(this.installedHooks)) {
      if (hooks.length === 0) continue;

      const eventSection = document.createElement('div');
      eventSection.className = 'hook-event-section';
      
      const eventHeader = document.createElement('h4');
      eventHeader.textContent = `${eventType} (${hooks.length})`;
      eventSection.appendChild(eventHeader);

      hooks.forEach((hook, index) => {
        totalCount++;
        const hookCard = this.createInstalledHookCard(hook, eventType, index);
        eventSection.appendChild(hookCard);
      });

      container.appendChild(eventSection);
    }

    // Update count
    document.getElementById('installedHooksCount').textContent = `(${totalCount})`;

    if (totalCount === 0) {
      container.innerHTML = '<p class="no-hooks-message">No hooks installed yet</p>';
    }
  }

  createInstalledHookCard(hook, eventType, index) {
    const card = document.createElement('div');
    card.className = 'hook-card installed';

    const typeIcon = this.getHookTypeIcon(hook.type);
    const truncatedCommand = this.truncateCommand(hook.command);

    card.innerHTML = `
      <div class="hook-header">
        <div class="hook-info">
          <span class="hook-type-icon">${typeIcon}</span>
          <span class="hook-number">${index + 1}.</span>
          <span class="hook-command" title="${this.escapeHtml(hook.command)}">${this.escapeHtml(truncatedCommand)}</span>
        </div>
      </div>
      <div class="hook-details">
        <span class="hook-type">Type: ${hook.type}</span>
        ${hook.matcher ? `<span class="hook-matcher">Matcher: ${this.escapeHtml(hook.matcher)}</span>` : ''}
        ${hook.metadata && hook.metadata.url ? `<span class="hook-url">URL: ${this.escapeHtml(hook.metadata.url)}</span>` : ''}
        ${hook.metadata && hook.metadata.filePath ? `<span class="hook-file">File: ${this.escapeHtml(hook.metadata.filePath)}</span>` : ''}
      </div>
      <div class="hook-actions">
        <button class="btn-small" onclick="hooksManager.editHook('${eventType}', ${index})">Edit</button>
        <button class="btn-small btn-danger" onclick="hooksManager.removeHook('${eventType}', ${index})">Remove</button>
        <button class="btn-small" onclick="hooksManager.testHook('${eventType}', ${index})">Test</button>
      </div>
    `;

    return card;
  }

  renderAvailableHooks() {
    const container = document.getElementById('availableHooksList');
    container.innerHTML = '';

    this.availableHooks.forEach(hook => {
      const hookCard = this.createAvailableHookCard(hook);
      container.appendChild(hookCard);
    });
  }

  createAvailableHookCard(hook) {
    const card = document.createElement('div');
    card.className = 'hook-card available';

    card.innerHTML = `
      <div class="hook-header">
        <h4>${hook.name}</h4>
      </div>
      <div class="hook-description">
        ${hook.description}
      </div>
      <div class="hook-actions">
        <button class="btn-primary" onclick="hooksManager.installHook('${hook.id}')">Install</button>
      </div>
    `;

    return card;
  }

  async installHook(hookId) {
    const hook = this.availableHooks.find(h => h.id === hookId);
    if (!hook) return;

    // Check prerequisites first
    const prereqResult = await window.electronAPI.checkHookPrerequisites(hookId);
    
    if (!prereqResult.success || !prereqResult.data.allMet) {
      this.showPrerequisiteDialog(hook, prereqResult.data);
      return;
    }

    // Show configuration dialog
    this.showConfigurationDialog(hook);
  }

  showPrerequisiteDialog(hook, prereqData) {
    const missing = prereqData.missing || [];
    const dialog = document.createElement('div');
    dialog.className = 'modal-overlay';
    dialog.innerHTML = `
      <div class="modal">
        <div class="modal-header">
          <h3>Prerequisites Required</h3>
        </div>
        <div class="modal-body">
          <p class="warning-message">⚠️ ${hook.name} requires the following to be installed:</p>
          <ul class="prerequisites-list">
            ${missing.map(cmd => `<li><code>${cmd}</code></li>`).join('')}
          </ul>
          <div class="installation-options">
            <h4>Installation Options:</h4>
            ${missing.map(cmd => this.getInstallationInstructions(cmd)).join('')}
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" onclick="hooksManager.closeModal()">Cancel</button>
          <button class="btn-primary" onclick="hooksManager.proceedWithInstallation('${hook.id}')">Install Anyway</button>
        </div>
      </div>
    `;
    document.body.appendChild(dialog);
  }

  getInstallationInstructions(command) {
    const instructions = {
      'terminal-notifier': `
        <div class="install-option">
          <strong>terminal-notifier:</strong>
          <pre>brew install terminal-notifier</pre>
          <a href="https://github.com/julienXX/terminal-notifier/releases" target="_blank">Download from GitHub</a>
        </div>
      `,
      'curl': `
        <div class="install-option">
          <strong>curl:</strong>
          <pre>brew install curl</pre>
          <p>Usually pre-installed on macOS</p>
        </div>
      `
    };
    return instructions[command] || '';
  }

  showConfigurationDialog(hook) {
    const dialog = document.createElement('div');
    dialog.className = 'modal-overlay';
    
    if (hook.id === 'mac-os-claude-done-notification') {
      dialog.innerHTML = this.getMacOSConfigDialog(hook);
    } else if (hook.id === 'osascript-notification') {
      dialog.innerHTML = this.getOsascriptConfigDialog(hook);
    } else if (hook.id === 'web-hook-claude-done-notification') {
      dialog.innerHTML = this.getWebhookConfigDialog(hook);
    }
    
    document.body.appendChild(dialog);
  }

  getMacOSConfigDialog(hook) {
    return `
      <div class="modal">
        <div class="modal-header">
          <h3>Configure: ${hook.name}</h3>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>Notification Title:</label>
            <input type="text" id="notifTitle" value="Claude Code" class="form-input">
          </div>
          <div class="form-group">
            <label>Notification Message:</label>
            <input type="text" id="notifMessage" value="Task completed" class="form-input">
          </div>
          <div class="form-group">
            <label>Sound:</label>
            <select id="notifSound" class="form-select">
              <option value="Glass">Glass</option>
              <option value="Ping">Ping</option>
              <option value="Pop">Pop</option>
              <option value="Basso">Basso</option>
              <option value="Blow">Blow</option>
              <option value="Bottle">Bottle</option>
              <option value="Frog">Frog</option>
              <option value="Funk">Funk</option>
              <option value="Hero">Hero</option>
              <option value="Morse">Morse</option>
              <option value="Purr">Purr</option>
              <option value="Sosumi">Sosumi</option>
              <option value="Submarine">Submarine</option>
              <option value="Tink">Tink</option>
            </select>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" onclick="hooksManager.testConfiguration('${hook.id}')">Test Hook</button>
          <button class="btn-secondary" onclick="hooksManager.closeModal()">Cancel</button>
          <button class="btn-primary" onclick="hooksManager.saveHookConfiguration('${hook.id}')">Save</button>
        </div>
      </div>
    `;
  }

  getOsascriptConfigDialog(hook) {
    return `
      <div class="modal">
        <div class="modal-header">
          <h3>Configure: ${hook.name}</h3>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>Notification Title:</label>
            <input type="text" id="osascriptTitle" value="Claude Code" class="form-input">
          </div>
          <div class="form-group">
            <label>Notification Message:</label>
            <input type="text" id="osascriptMessage" value="Task completed" class="form-input">
          </div>
          <div class="form-group">
            <label>Sound:</label>
            <select id="osascriptSound" class="form-select">
              <option value="Glass">Glass</option>
              <option value="Ping">Ping</option>
              <option value="Pop">Pop</option>
              <option value="Basso">Basso</option>
              <option value="Blow">Blow</option>
              <option value="Bottle">Bottle</option>
              <option value="Frog">Frog</option>
              <option value="Funk">Funk</option>
              <option value="Hero">Hero</option>
              <option value="Morse">Morse</option>
              <option value="Purr">Purr</option>
              <option value="Sosumi">Sosumi</option>
              <option value="Submarine">Submarine</option>
              <option value="Tink">Tink</option>
            </select>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" onclick="hooksManager.testConfiguration('${hook.id}')">Test Hook</button>
          <button class="btn-secondary" onclick="hooksManager.closeModal()">Cancel</button>
          <button class="btn-primary" onclick="hooksManager.saveHookConfiguration('${hook.id}')">Save</button>
        </div>
      </div>
    `;
  }

  getWebhookConfigDialog(hook) {
    return `
      <div class="modal">
        <div class="modal-header">
          <h3>Configure: ${hook.name}</h3>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>Webhook URL: <span style="color: #ff6b6b;">*</span></label>
            <input type="text" id="webhookUrl" placeholder="https://hooks.slack.com/services/..." class="form-input" required>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" onclick="hooksManager.closeModal()">Cancel</button>
          <button class="btn-primary" onclick="hooksManager.saveHookConfiguration('${hook.id}')">Confirm</button>
        </div>
      </div>
    `;
  }

  async saveHookConfiguration(hookId) {
    const params = {};
    
    if (hookId === 'mac-os-claude-done-notification') {
      params.title = document.getElementById('notifTitle').value;
      params.message = document.getElementById('notifMessage').value;
      params.sound = document.getElementById('notifSound').value;
    } else if (hookId === 'osascript-notification') {
      params.title = document.getElementById('osascriptTitle').value;
      params.message = document.getElementById('osascriptMessage').value;
      params.sound = document.getElementById('osascriptSound').value;
    } else if (hookId === 'web-hook-claude-done-notification') {
      params.webhookUrl = document.getElementById('webhookUrl').value;
      
      if (!params.webhookUrl) {
        alert('Please enter a webhook URL');
        return;
      }
    }

    try {
      const result = await window.electronAPI.installHook(hookId, params);
      if (result.success) {
        this.closeModal();
        this.loadHooks();
        this.showSuccess('Hook installed successfully');
      } else {
        this.showError(result.error || 'Failed to install hook');
      }
    } catch (error) {
      this.showError('Failed to install hook: ' + error.message);
    }
  }

  async testConfiguration(hookId) {
    const params = {};
    
    if (hookId === 'mac-os-claude-done-notification') {
      params.title = document.getElementById('notifTitle').value;
      params.message = document.getElementById('notifMessage').value;
      params.sound = document.getElementById('notifSound').value;
    } else if (hookId === 'osascript-notification') {
      params.title = document.getElementById('osascriptTitle').value;
      params.message = document.getElementById('osascriptMessage').value;
      params.sound = document.getElementById('osascriptSound').value;
    } else if (hookId === 'web-hook-claude-done-notification') {
      params.webhookUrl = document.getElementById('webhookUrl').value;
      params.message = document.getElementById('webhookMessage').value;
    }

    try {
      // Generate the command to show to user
      const result = await window.electronAPI.generateHookCommand(hookId, params);
      if (result.success && result.data) {
        // Show terminal command dialog instead of executing
        this.showTerminalCommandDialog(result.data, hookId);
        
        // Show permission reminder for macOS notifications
        if (hookId === 'mac-os-claude-done-notification' || hookId === 'osascript-notification') {
          setTimeout(() => {
            this.showPermissionReminder(hookId);
          }, 500);
        }
      } else {
        this.showError('Failed to generate test command');
      }
    } catch (error) {
      this.showError('Test failed: ' + error.message);
    }
  }

  async removeHook(eventType, index) {
    if (!confirm('Are you sure you want to remove this hook?')) return;

    try {
      const result = await window.electronAPI.removeHook(eventType, index);
      if (result.success) {
        this.loadHooks();
        this.showSuccess('Hook removed successfully');
      } else {
        this.showError(result.error || 'Failed to remove hook');
      }
    } catch (error) {
      this.showError('Failed to remove hook: ' + error.message);
    }
  }

  async testHook(eventType, index) {
    try {
      const hook = this.installedHooks[eventType][index];
      
      // Show terminal command dialog instead of executing
      this.showTerminalCommandDialog(hook.command);
      
      // Check if this is a macOS notification hook
      const isMacOSNotification = hook.command && (
        hook.command.includes('terminal-notifier') || 
        hook.command.includes('osascript') && hook.command.includes('display notification')
      );
      
      if (isMacOSNotification) {
        setTimeout(() => {
          const hookType = hook.command.includes('terminal-notifier') ? 
            'mac-os-claude-done-notification' : 'osascript-notification';
          this.showPermissionReminder(hookType);
        }, 500);
      }
    } catch (error) {
      this.showError('Failed to test hook: ' + error.message);
    }
  }

  async editHook(eventType, index) {
    const hook = this.installedHooks[eventType][index];
    const newCommand = prompt('Edit hook command:', hook.command);
    
    if (newCommand && newCommand !== hook.command) {
      try {
        // Remove old hook and add new one
        await window.electronAPI.removeHook(eventType, index);
        await window.electronAPI.addHookCommand(eventType, newCommand);
        this.loadHooks();
        this.showSuccess('Hook updated successfully');
      } catch (error) {
        this.showError('Failed to update hook: ' + error.message);
      }
    }
  }

  showRawJsonView() {
    const rawView = document.getElementById('rawJsonView');
    const installedSection = document.getElementById('installedHooksSection');
    const availableSection = document.getElementById('availableHooksSection');
    
    // Format hooks for display
    const hooksJson = JSON.stringify({ hooks: this.installedHooks }, null, 2);
    document.getElementById('rawJsonContent').textContent = hooksJson;
    
    // Show raw view, hide others
    rawView.style.display = 'block';
    installedSection.style.display = 'none';
    availableSection.style.display = 'none';
  }

  hideRawJsonView() {
    const rawView = document.getElementById('rawJsonView');
    const installedSection = document.getElementById('installedHooksSection');
    const availableSection = document.getElementById('availableHooksSection');
    
    rawView.style.display = 'none';
    installedSection.style.display = 'block';
    availableSection.style.display = 'block';
  }

  showInstalledView() {
    this.hideRawJsonView();
  }

  async copyJsonToClipboard() {
    const content = document.getElementById('rawJsonContent').textContent;
    try {
      await navigator.clipboard.writeText(content);
      this.showSuccess('Copied to clipboard');
    } catch (error) {
      this.showError('Failed to copy to clipboard');
    }
  }

  closeModal() {
    const modal = document.querySelector('.modal-overlay');
    if (modal) {
      modal.remove();
    }
  }

  proceedWithInstallation(hookId) {
    this.closeModal();
    const hook = this.availableHooks.find(h => h.id === hookId);
    if (hook) {
      this.showConfigurationDialog(hook);
    }
  }

  getHookTypeIcon(type) {
    const icons = {
      'macOS Notification': '🔔',
      'Webhook': '🌐',
      'File Logging': '📄',
      'Custom Script': '⚙️'
    };
    return icons[type] || '📌';
  }

  truncateCommand(command, maxLength = 50) {
    if (!command || typeof command !== 'string') return '';
    if (command.length <= maxLength) return command;
    return command.substring(0, maxLength) + '...';
  }

  escapeHtml(text) {
    if (!text || typeof text !== 'string') return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  showTerminalCommandDialog(command, hookId) {
    // Create modal overlay
    const dialog = document.createElement('div');
    dialog.className = 'modal-overlay';
    dialog.innerHTML = `
      <div class="modal">
        <div class="modal-header">
          <h3>Run this script in your terminal</h3>
        </div>
        <div class="modal-body">
          <p style="margin-bottom: 15px; color: #b0b0b0;">
            Copy and run the command below in your terminal to test how the hook works.
          </p>
          <div style="position: relative; background: #1a1a1a; border: 1px solid #333; border-radius: 4px; padding: 12px; margin: 10px 0;">
            <pre id="terminalCommand" style="margin: 0; color: #4ec9b0; font-family: 'SF Mono', Monaco, monospace; font-size: 13px; white-space: pre-wrap; word-break: break-all;">${this.escapeHtml(command)}</pre>
            <button onclick="hooksManager.copyTerminalCommand()" 
                    style="position: absolute; top: 8px; right: 8px; padding: 4px 8px; 
                           background: #333; border: 1px solid #555; border-radius: 3px; 
                           color: #b0b0b0; font-size: 11px; cursor: pointer; 
                           transition: all 0.2s;"
                    onmouseover="this.style.background='#444'; this.style.borderColor='#666';"
                    onmouseout="this.style.background='#333'; this.style.borderColor='#555';">
              Copy
            </button>
          </div>
          <div style="margin-top: 15px; padding: 10px; background: #2a2a1a; border: 1px solid #444400; border-radius: 4px;">
            <p style="margin: 0; color: #ffcc00; font-size: 13px;">
              <strong>💡 Tip:</strong> If notifications don't appear after running in terminal, 
              check permissions in System Settings > Notifications.
            </p>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-primary" onclick="hooksManager.closeModal()">OK</button>
        </div>
      </div>
    `;
    
    document.body.appendChild(dialog);
    
    // Store command for copy function
    this.currentTestCommand = command;
  }

  copyTerminalCommand() {
    const commandElement = document.getElementById('terminalCommand');
    if (commandElement && this.currentTestCommand) {
      navigator.clipboard.writeText(this.currentTestCommand).then(() => {
        // Change button text temporarily
        const copyBtn = event.target;
        const originalText = copyBtn.textContent;
        copyBtn.textContent = 'Copied!';
        copyBtn.style.background = '#2a4a2a';
        copyBtn.style.borderColor = '#4a6a4a';
        
        setTimeout(() => {
          copyBtn.textContent = originalText;
          copyBtn.style.background = '#333';
          copyBtn.style.borderColor = '#555';
        }, 2000);
      }).catch(err => {
        console.error('Failed to copy:', err);
        this.showError('Failed to copy to clipboard');
      });
    }
  }

  showPermissionReminder(hookId) {
    const appName = hookId === 'mac-os-claude-done-notification' ? 'terminal-notifier' : 'Terminal';
    const message = `Not seeing notifications? Please allow ${appName} in System Settings > Notifications > Application Notifications.`;
    
    // Create a temporary notification element
    const notification = document.createElement('div');
    notification.className = 'permission-reminder';
    notification.innerHTML = `
      <div style="position: fixed; top: 20px; right: 20px; background: #2a2a2a; border: 1px solid #444; 
                  border-radius: 8px; padding: 15px 20px; max-width: 400px; z-index: 10000; 
                  box-shadow: 0 4px 12px rgba(0,0,0,0.3); animation: slideIn 0.3s ease-out;">
        <div style="display: flex; align-items: start; gap: 10px;">
          <span style="font-size: 20px;">ℹ️</span>
          <div>
            <p style="margin: 0; color: #e0e0e0; font-size: 14px; line-height: 1.5;">${message}</p>
            <button onclick="this.parentElement.parentElement.parentElement.remove()" 
                    style="margin-top: 10px; padding: 4px 12px; background: #444; border: none; 
                           border-radius: 4px; color: #e0e0e0; cursor: pointer; font-size: 12px;">
              OK
            </button>
          </div>
        </div>
      </div>
    `;
    
    // Add CSS animation if not already present
    if (!document.querySelector('#permissionReminderStyles')) {
      const style = document.createElement('style');
      style.id = 'permissionReminderStyles';
      style.textContent = `
        @keyframes slideIn {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
      `;
      document.head.appendChild(style);
    }
    
    document.body.appendChild(notification);
    
    // Auto-remove after 10 seconds
    setTimeout(() => {
      if (notification.parentElement) {
        notification.remove();
      }
    }, 10000);
  }

  showSuccess(message) {
    // Could implement a toast notification here
    console.log('Success:', message);
  }

  showError(message) {
    // Could implement a toast notification here
    console.error('Error:', message);
    alert(message);
  }
}

// Initialize Hooks Manager when DOM is loaded
if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    window.hooksManager = new HooksManager();
  });
}