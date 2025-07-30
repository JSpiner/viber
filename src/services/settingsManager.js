const Store = require('electron-store').default || require('electron-store');

class SettingsManager {
  constructor() {
    this.store = new Store({
      name: 'viber-settings',
      defaults: {
        statusBar: {
          enabled: true,
          displayMode: 'compact',
          alertsEnabled: true,
          alertThreshold: 90,
          updateFrequency: 5,
          notifyOnReset: false
        }
      }
    });
  }

  getAll() {
    return this.store.store;
  }

  get(key) {
    return this.store.get(key);
  }

  set(key, value) {
    this.store.set(key, value);
  }

  getStatusBarSettings() {
    return this.store.get('statusBar');
  }

  setStatusBarSettings(settings) {
    this.store.set('statusBar', settings);
  }

  reset() {
    this.store.clear();
  }
}

module.exports = SettingsManager;