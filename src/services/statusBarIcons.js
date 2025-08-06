const { nativeImage } = require('electron');
const path = require('path');

class StatusBarIcons {
  constructor() {
    // Use the main app icon for status bar
    this.iconPath = path.join(__dirname, '../../resources/icon.png');
    
    // Load and resize icon
    try {
      const originalIcon = nativeImage.createFromPath(this.iconPath);
      // Resize to 16x16 for status bar
      this.baseIcon = originalIcon.resize({ width: 16, height: 16 });
      this.baseIcon.setTemplateImage(true);
      console.log('Base icon loaded:', !this.baseIcon.isEmpty());
    } catch (error) {
      console.error('Error loading base icon:', error);
      this.baseIcon = nativeImage.createEmpty();
    }
  }

  // Generate a simple SVG icon for the status bar
  generateSVGIcon(color = '#000000', fillPercent = 0) {
    // For macOS template images, use black color - it will be automatically adjusted
    const svg = `<svg width="16" height="16" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
<circle cx="8" cy="8" r="7" fill="none" stroke="#000000" stroke-width="1.5" opacity="0.3"/>
${fillPercent > 0 ? `<path d="M 8 1 A 7 7 0 ${fillPercent > 50 ? 1 : 0} 1 ${this.getArcEndPoint(fillPercent)}" fill="none" stroke="#000000" stroke-width="1.5" stroke-linecap="round"/>` : ''}
<circle cx="8" cy="8" r="2.5" fill="#000000"/>
</svg>`;
    
    return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
  }

  getArcEndPoint(percent) {
    const angle = (percent / 100) * 360 - 90; // Start from top
    const radians = (angle * Math.PI) / 180;
    const x = 8 + 7 * Math.cos(radians);
    const y = 8 + 7 * Math.sin(radians);
    return `${x} ${y}`;
  }

  getIcon(state = 'normal', usagePercent = 0) {
    // Simply return the base icon for now
    // In the future, we can add overlays or badges based on state
    return this.baseIcon;
  }

  getStateFromUsage(usagePercent) {
    if (usagePercent >= 95) return 'critical';
    if (usagePercent >= 80) return 'warning';
    return 'normal';
  }
}

module.exports = StatusBarIcons;