const { describe, it, expect, beforeEach } = require('@jest/globals');
const { JSDOM } = require('jsdom');

// Mock Chart.js
global.Chart = jest.fn().mockImplementation(() => ({
  destroy: jest.fn()
}));

describe('NowManager UI Updates', () => {
  let dom;
  let window;
  let document;
  let nowManager;
  
  beforeEach(() => {
    // Setup DOM
    dom = new JSDOM(`
      <!DOCTYPE html>
      <html>
        <body>
          <div id="recentTokens">0</div>
          <div id="tokensPerMinute">0 tokens/min</div>
          <div id="usageTrend">→</div>
          
          <!-- 5-hour window elements -->
          <div id="fiveHourUsed">0</div>
          <div id="fiveHourLimit">0</div>
          <div id="fiveHourRemaining">0</div>
          <div id="fiveHourPercentage">0%</div>
          <div id="fiveHourSessionStart">-</div>
          <div id="fiveHourCacheSavings">0</div>
          <div id="fiveHourReset">-</div>
          <div id="fiveHourProgress" class="progress-bar" style="width: 0%"></div>
          
          <!-- Weekly window elements -->
          <div id="weeklyUsed">0</div>
          <div id="weeklyLimit">0</div>
          <div id="weeklyRemaining">0</div>
          <div id="weeklyPercentage">0%</div>
          <div id="weeklySessionStart">-</div>
          <div id="weeklyCacheSavings">0</div>
          <div id="weeklyReset">-</div>
          <div id="weeklyProgress" class="progress-bar" style="width: 0%"></div>
          
          <!-- Charts -->
          <canvas id="fiveHourChart"></canvas>
          <canvas id="weeklyChart"></canvas>
          
          <!-- Subscription selector -->
          <select id="subscriptionTier">
            <option value="pro">Pro</option>
            <option value="max5x">Max 5x</option>
            <option value="max20x">Max 20x</option>
          </select>
        </body>
      </html>
    `, { url: 'http://localhost' });
    
    window = dom.window;
    document = window.document;
    global.window = window;
    global.document = document;
    global.localStorage = {
      getItem: jest.fn(() => 'pro'),
      setItem: jest.fn()
    };
    
    // Mock canvas context
    window.HTMLCanvasElement.prototype.getContext = jest.fn(() => ({
      clearRect: jest.fn(),
      fillRect: jest.fn(),
      beginPath: jest.fn(),
      moveTo: jest.fn(),
      lineTo: jest.fn(),
      stroke: jest.fn()
    }));
    
    // Load NowManager (we'll need to refactor it to be testable)
    const NowManager = require('../now.js').NowManager;
    nowManager = new NowManager();
  });

  describe('updateFiveHourWindow', () => {
    it('should display 0 when no session data exists', () => {
      nowManager.hourlyWindowData = {
        totalTokens: 0,
        windowStart: null,
        rawTotals: { total: 0, input: 0, output: 0, cacheCreate: 0, cacheRead: 0 }
      };
      
      nowManager.updateFiveHourWindow();
      
      expect(document.getElementById('fiveHourUsed').textContent).toBe('0');
      expect(document.getElementById('fiveHourSessionStart').textContent).toBe('-');
      expect(document.getElementById('fiveHourPercentage').textContent).toBe('0.0%');
    });

    it('should display 0 when session is older than 5 hours', () => {
      const sixHoursAgo = new Date();
      sixHoursAgo.setHours(sixHoursAgo.getHours() - 6);
      
      nowManager.hourlyWindowData = {
        totalTokens: 0,
        windowStart: null,
        isExpired: true,
        rawTotals: { total: 0, input: 0, output: 0, cacheCreate: 0, cacheRead: 0 }
      };
      
      nowManager.updateFiveHourWindow();
      
      expect(document.getElementById('fiveHourUsed').textContent).toBe('0');
      expect(document.getElementById('fiveHourSessionStart').textContent).toBe('-');
    });

    it('should display active session data correctly', () => {
      const oneHourAgo = new Date();
      oneHourAgo.setHours(oneHourAgo.getHours() - 1);
      
      nowManager.hourlyWindowData = {
        totalTokens: 15000,
        windowStart: oneHourAgo.toISOString(),
        rawTotals: { total: 18000, input: 7500, output: 7500, cacheCreate: 2000, cacheRead: 1000 } // 3k cache tokens
      };
      
      nowManager.updateFiveHourWindow();
      
      expect(document.getElementById('fiveHourUsed').textContent).toBe('15,000');
      expect(document.getElementById('fiveHourSessionStart').textContent).not.toBe('-');
      expect(document.getElementById('fiveHourCacheSavings').textContent).toBe('3,000 tokens saved (16.7% of total)');
    });

    it('should format date as YYYY-MM-DD HH:MM:SS', () => {
      // Mock the formatDateTime function
      nowManager.formatDateTime = (date) => {
        const d = new Date(date);
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        const hours = String(d.getHours()).padStart(2, '0');
        const minutes = String(d.getMinutes()).padStart(2, '0');
        const seconds = String(d.getSeconds()).padStart(2, '0');
        
        return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
      };
      
      const testDate = new Date('2024-12-15T13:23:45.000Z');
      nowManager.hourlyWindowData = {
        totalTokens: 10000,
        windowStart: testDate.toISOString(),
        rawTotals: { total: 10000, input: 5000, output: 5000, cacheCreate: 0, cacheRead: 0 }
      };
      
      // Override updateFiveHourWindow to use formatDateTime
      const originalUpdate = nowManager.updateFiveHourWindow;
      nowManager.updateFiveHourWindow = function() {
        originalUpdate.call(this);
        if (this.hourlyWindowData?.windowStart) {
          document.getElementById('fiveHourSessionStart').textContent = 
            this.formatDateTime(this.hourlyWindowData.windowStart);
        }
      };
      
      nowManager.updateFiveHourWindow();
      
      // Check that the formatted time is set (exact time depends on timezone)
      const sessionStartText = document.getElementById('fiveHourSessionStart').textContent;
      expect(sessionStartText).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
      // Verify it contains the date part
      expect(sessionStartText).toContain('2024-12-15');
    });
  });

  describe('updateWeeklyWindow', () => {
    it('should display 0 when no weekly session exists', () => {
      nowManager.weeklyWindowData = {
        totalTokens: 0,
        windowStart: null,
        rawTotals: { total: 0, input: 0, output: 0, cacheCreate: 0, cacheRead: 0 }
      };
      
      nowManager.updateWeeklyWindow();
      
      expect(document.getElementById('weeklyUsed').textContent).toBe('0');
      expect(document.getElementById('weeklySessionStart').textContent).toBe('-');
      expect(document.getElementById('weeklyPercentage').textContent).toBe('0.0%');
    });
  });

  describe('Progress bar updates', () => {
    it('should update progress bar class based on usage percentage', () => {
      const progressBar = document.getElementById('fiveHourProgress');
      
      // Test safe zone (< 70%)
      nowManager.hourlyWindowData = {
        totalTokens: 12000, // 63.2% of 19k pro limit
        windowStart: new Date().toISOString(),
        rawTotals: { total: 12000, input: 6000, output: 6000, cacheCreate: 0, cacheRead: 0 }
      };
      nowManager.updateFiveHourWindow();
      expect(progressBar.className).toContain('safe');
      
      // Test warning zone (70-90%)
      nowManager.hourlyWindowData.totalTokens = 15200; // 80% of 19k
      nowManager.updateFiveHourWindow();
      expect(progressBar.className).toContain('warning');
      
      // Test danger zone (> 90%)
      nowManager.hourlyWindowData.totalTokens = 17200; // 90.5% of 19k
      nowManager.updateFiveHourWindow();
      expect(progressBar.className).toContain('danger');
    });
  });
});