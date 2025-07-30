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

// Initialize settings when the page loads
async function initSettings() {
  try {
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
  
  // Initialize settings
  initSettings();
});