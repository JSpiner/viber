// Settings Tab JavaScript
let currentSettings = {
  statusBar: {
    enabled: true,
    displayMode: 'compact',
    alertsEnabled: true,
    alertThreshold: 90,
    updateFrequency: 5,
    notifyOnReset: false
  }
};

// Platform-specific UI text
const platformText = {
  statusBarSectionTitle: {
    darwin: 'Menu Bar',
    win32: 'System Tray'
  },
  statusBarEnabledLabel: {
    darwin: 'Show in menu bar',
    win32: 'Show in system tray'
  },
  statusBarDescription: {
    darwin: 'Display token usage monitor in macOS menu bar',
    win32: 'Display token usage monitor in Windows system tray'
  },
  displayModeDescription: {
    darwin: 'Choose what to display in the menu bar',
    win32: 'Choose what to display in the system tray'
  },
  notificationPermissionError: {
    darwin: 'Not receiving notifications?\nPlease enable notifications for Viber in System Preferences > Notifications.',
    win32: 'Not receiving notifications?\nPlease enable notifications for Viber in Windows Settings > System > Notifications.'
  }
};

// Get platform-specific text
function getPlatformText(key) {
  const platform = window.electronAPI?.platform || 'darwin';
  return platformText[key]?.[platform] || platformText[key]?.darwin || '';
}

// Initialize settings when the page loads
async function initSettings() {
  try {
    // Apply platform-specific text
    applyPlatformText();

    // Load current settings from main process
    const settings = await window.electronAPI.loadSettings();
    if (settings) {
      currentSettings = settings;
      updateSettingsUI();
    }
  } catch (error) {
    console.error('Error loading settings:', error);
  }
}

// Apply platform-specific text to UI elements
function applyPlatformText() {
  const elementsToUpdate = [
    'statusBarSectionTitle',
    'statusBarEnabledLabel',
    'statusBarDescription',
    'displayModeDescription'
  ];

  elementsToUpdate.forEach(id => {
    const element = document.getElementById(id);
    if (element) {
      element.textContent = getPlatformText(id);
    }
  });
}

// Update UI to reflect current settings
function updateSettingsUI() {
  // Status bar enabled
  document.getElementById('statusBarEnabled').checked = currentSettings.statusBar.enabled;
  
  // Display mode
  document.getElementById('displayMode').value = currentSettings.statusBar.displayMode;
  
  // Alerts
  document.getElementById('alertsEnabled').checked = currentSettings.statusBar.alertsEnabled;
  document.getElementById('alertThreshold').value = currentSettings.statusBar.alertThreshold;
  document.getElementById('alertThresholdValue').textContent = `${currentSettings.statusBar.alertThreshold}%`;
  
  // Update frequency
  document.getElementById('updateFrequency').value = currentSettings.statusBar.updateFrequency;
  document.getElementById('updateFrequencyValue').textContent = `${currentSettings.statusBar.updateFrequency} min`;
  
  // Reset notification
  document.getElementById('notifyOnReset').checked = currentSettings.statusBar.notifyOnReset;
  
  // Enable/disable dependent fields
  toggleStatusBarSettings(currentSettings.statusBar.enabled);
  toggleAlertSettings(currentSettings.statusBar.alertsEnabled);
}

// Toggle status bar related settings
function toggleStatusBarSettings(enabled) {
  const elements = document.querySelectorAll('.status-bar-setting');
  elements.forEach(el => {
    el.disabled = !enabled;
  });
}

// Toggle alert related settings
function toggleAlertSettings(enabled) {
  document.getElementById('alertThreshold').disabled = !enabled;
}

// Save settings to main process
async function saveSettings() {
  try {
    await window.electronAPI.saveSettings(currentSettings);
    showSaveConfirmation();
  } catch (error) {
    console.error('Error saving settings:', error);
    showSaveError();
  }
}

// Show save confirmation
function showSaveConfirmation() {
  const button = document.getElementById('saveSettings');
  const originalText = button.textContent;
  button.textContent = 'Saved!';
  button.classList.add('saved');
  
  setTimeout(() => {
    button.textContent = originalText;
    button.classList.remove('saved');
  }, 2000);
}

// Show save error
function showSaveError() {
  const button = document.getElementById('saveSettings');
  const originalText = button.textContent;
  button.textContent = 'Error saving';
  button.classList.add('error');
  
  setTimeout(() => {
    button.textContent = originalText;
    button.classList.remove('error');
  }, 2000);
}

// Test alert functionality
async function testAlert() {
  try {
    // Test native notification
    const notification = new Notification('Viber Alert Test', {
      body: `Alert threshold reached: ${currentSettings.statusBar.alertThreshold}%`,
      icon: 'resources/icon.png'
    });

    // Show success message
    showTestResult('Alert test successful!');
  } catch (error) {
    // Check notification permission
    const permissionErrorMsg = getPlatformText('notificationPermissionError');
    if (Notification.permission === 'denied') {
      showTestResult(permissionErrorMsg, true);
    } else if (Notification.permission === 'default') {
      // Request permission
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        testAlert(); // Retry after permission granted
      } else {
        showTestResult(permissionErrorMsg, true);
      }
    } else {
      showTestResult('Error testing alert: ' + error.message, true);
    }
  }
}

// Show test result message
function showTestResult(message, isError = false) {
  // Create or update message element
  let messageEl = document.getElementById('alertTestMessage');
  if (!messageEl) {
    messageEl = document.createElement('div');
    messageEl.id = 'alertTestMessage';
    messageEl.style.cssText = `
      margin-top: 10px;
      padding: 8px 12px;
      border-radius: 4px;
      font-size: 13px;
      line-height: 1.4;
      white-space: pre-line;
    `;
    document.getElementById('testAlert').parentElement.appendChild(messageEl);
  }
  
  messageEl.textContent = message;
  messageEl.style.backgroundColor = isError ? 'rgba(255, 59, 48, 0.1)' : 'rgba(52, 199, 89, 0.1)';
  messageEl.style.color = isError ? '#ff3b30' : '#34c759';
  messageEl.style.border = `1px solid ${isError ? 'rgba(255, 59, 48, 0.3)' : 'rgba(52, 199, 89, 0.3)'}`;
  
  // Auto-hide success messages after 3 seconds
  if (!isError) {
    setTimeout(() => {
      messageEl.style.display = 'none';
    }, 3000);
  } else {
    // Keep error messages visible
    messageEl.style.display = 'block';
  }
}

// Event listeners
document.addEventListener('DOMContentLoaded', () => {
  // Status bar enabled toggle
  document.getElementById('statusBarEnabled').addEventListener('change', (e) => {
    currentSettings.statusBar.enabled = e.target.checked;
    toggleStatusBarSettings(e.target.checked);
  });
  
  // Display mode
  document.getElementById('displayMode').addEventListener('change', (e) => {
    currentSettings.statusBar.displayMode = e.target.value;
  });
  
  // Alerts enabled
  document.getElementById('alertsEnabled').addEventListener('change', (e) => {
    currentSettings.statusBar.alertsEnabled = e.target.checked;
    toggleAlertSettings(e.target.checked);
  });
  
  // Alert threshold
  document.getElementById('alertThreshold').addEventListener('input', (e) => {
    currentSettings.statusBar.alertThreshold = parseInt(e.target.value);
    document.getElementById('alertThresholdValue').textContent = `${e.target.value}%`;
  });
  
  // Update frequency
  document.getElementById('updateFrequency').addEventListener('input', (e) => {
    currentSettings.statusBar.updateFrequency = parseInt(e.target.value);
    document.getElementById('updateFrequencyValue').textContent = `${e.target.value} min`;
  });
  
  // Notify on reset
  document.getElementById('notifyOnReset').addEventListener('change', (e) => {
    currentSettings.statusBar.notifyOnReset = e.target.checked;
  });
  
  // Save button
  document.getElementById('saveSettings').addEventListener('click', saveSettings);
  
  // Test alert button
  document.getElementById('testAlert').addEventListener('click', testAlert);
  
  // Initialize settings
  initSettings();
});