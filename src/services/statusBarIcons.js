const { nativeImage } = require('electron');
const path = require('path');

class StatusBarIcons {
  constructor() {
    // Base icon paths
    this.iconPath = path.join(__dirname, '../../resources/tray');
    
    // Create icon templates for different states
    this.icons = {
      normal: null,
      warning: null,
      critical: null,
      disabled: null
    };
  }

  // Generate a simple SVG icon for the status bar
  generateSVGIcon(color = '#0e639c', fillPercent = 0) {
    const svg = `
      <svg width="22" height="22" viewBox="0 0 22 22" xmlns="http://www.w3.org/2000/svg">
        <!-- Background circle -->
        <circle cx="11" cy="11" r="9" fill="none" stroke="${color}" stroke-width="2" opacity="0.3"/>
        
        <!-- Progress arc -->
        <path d="M 11 2 A 9 9 0 ${fillPercent > 50 ? 1 : 0} 1 ${this.getArcEndPoint(fillPercent)}" 
              fill="none" 
              stroke="${color}" 
              stroke-width="2"
              stroke-linecap="round"/>
        
        <!-- Center dot -->
        <circle cx="11" cy="11" r="3" fill="${color}"/>
      </svg>
    `;
    
    return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
  }

  getArcEndPoint(percent) {
    const angle = (percent / 100) * 360 - 90; // Start from top
    const radians = (angle * Math.PI) / 180;
    const x = 11 + 9 * Math.cos(radians);
    const y = 11 + 9 * Math.sin(radians);
    return `${x} ${y}`;
  }

  getIcon(state = 'normal', usagePercent = 0) {
    let color;
    switch (state) {
      case 'normal':
        color = '#0e639c'; // Blue
        break;
      case 'warning':
        color = '#ffa500'; // Orange
        break;
      case 'critical':
        color = '#ff6b6b'; // Red
        break;
      case 'disabled':
        color = '#666666'; // Gray
        break;
      default:
        color = '#0e639c';
    }

    const svgData = this.generateSVGIcon(color, usagePercent);
    const icon = nativeImage.createFromDataURL(svgData);
    
    // Mark as template image for macOS (adapts to menu bar theme)
    icon.setTemplateImage(true);
    
    return icon;
  }

  getStateFromUsage(usagePercent) {
    if (usagePercent >= 95) return 'critical';
    if (usagePercent >= 80) return 'warning';
    return 'normal';
  }
}

module.exports = StatusBarIcons;