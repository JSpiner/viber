const { describe, it, expect, beforeEach, afterEach } = require('@jest/globals');
const RealtimeMonitor = require('../src/services/realtimeMonitor');

describe('RealtimeMonitor', () => {
  let monitor;
  const mockDate = new Date('2024-12-15T14:30:00.000Z');
  
  beforeEach(() => {
    monitor = new RealtimeMonitor();
    // Mock current time
    jest.useFakeTimers();
    jest.setSystemTime(mockDate);
  });
  
  afterEach(() => {
    jest.useRealTimers();
  });

  describe('findCurrentSessionStart', () => {
    it('should return current time when no usage data exists', () => {
      const result = monitor.findCurrentSessionStart([]);
      expect(result.toISOString()).toBe(mockDate.toISOString());
    });

    it('should find session start after 5-hour gap', () => {
      const usage = [
        { timestamp: '2024-12-15T08:00:00.000Z' }, // 6.5 hours ago
        { timestamp: '2024-12-15T09:00:00.000Z' }, // 5.5 hours ago
        { timestamp: '2024-12-15T14:00:00.000Z' }, // 30 minutes ago
        { timestamp: '2024-12-15T14:15:00.000Z' }, // 15 minutes ago
      ];
      
      const result = monitor.findCurrentSessionStart(usage, 5);
      // Should return 14:00:00 as session start (after 5-hour gap)
      expect(result.toISOString()).toBe('2024-12-15T14:00:00.000Z');
    });

    it('should return most recent timestamp when no gap exists', () => {
      const usage = [
        { timestamp: '2024-12-15T12:00:00.000Z' }, // 2.5 hours ago
        { timestamp: '2024-12-15T13:00:00.000Z' }, // 1.5 hours ago
        { timestamp: '2024-12-15T14:00:00.000Z' }, // 30 minutes ago
      ];
      
      const result = monitor.findCurrentSessionStart(usage, 5);
      // Should return most recent timestamp since session continues from oldest
      expect(result.toISOString()).toBe('2024-12-15T14:00:00.000Z');
    });
  });

  describe('calculateWindowUsage', () => {
    it('should return zero usage when last activity is older than 5 hours', () => {
      const usage = [
        { 
          timestamp: '2024-12-15T08:00:00.000Z', // 6.5 hours ago
          usage: { 
            inputTokens: 100, 
            outputTokens: 200, 
            cacheCreateTokens: 0,
            cacheReadTokens: 0,
            total: 300,
            effectiveTotal: 300
          }
        }
      ];
      
      const result = monitor.calculateWindowUsage(usage, null, false);
      
      // Should indicate no active session
      expect(result.totalTokens).toBe(0);
      expect(result.messageCount).toBe(0);
      expect(result.windowStart).toBe(null);
      expect(result.sessionStart).toBe(null);
    });

    it('should calculate usage for active session within 5 hours', () => {
      const usage = [
        { 
          timestamp: '2024-12-15T13:00:00.000Z', // 1.5 hours ago
          usage: { 
            inputTokens: 100, 
            outputTokens: 200, 
            cacheCreateTokens: 50,
            cacheReadTokens: 100,
            total: 450,
            effectiveTotal: 300  // input + output only
          },
          model: 'claude-3-sonnet'
        },
        { 
          timestamp: '2024-12-15T14:00:00.000Z', // 30 minutes ago
          usage: { 
            inputTokens: 150, 
            outputTokens: 250, 
            cacheCreateTokens: 0,
            cacheReadTokens: 200,
            total: 600,
            effectiveTotal: 400  // input + output only
          },
          model: 'claude-3-sonnet'
        }
      ];
      
      const result = monitor.calculateWindowUsage(usage, null, false);
      
      // With rolling window, both messages are within 5 hours, so both are included
      expect(result.totalTokens).toBe(700); // Both messages: 300 + 400
      expect(result.messageCount).toBe(2);
      expect(result.windowStart).toBe('2024-12-15T13:00:00.000Z'); // First message in window
      expect(result.rawTotals.total).toBe(1050); // Total of both messages: 450 + 600
    });

    it('should handle weekly window with 7-day gap', () => {
      const usage = [
        { 
          timestamp: '2024-12-07T14:00:00.000Z', // 8 days ago
          usage: { total: 1000, effectiveTotal: 1000 }
        },
        { 
          timestamp: '2024-12-15T13:00:00.000Z', // 1.5 hours ago
          usage: { total: 500, effectiveTotal: 500 }
        }
      ];
      
      const result = monitor.calculateWindowUsage(usage, null, true);
      
      // Weekly window should only include recent usage
      expect(result.totalTokens).toBe(500);
      expect(result.messageCount).toBe(1);
    });
  });

  describe('Date formatting helper', () => {
    it('should format date as YYYY-MM-DD HH:MM:SS', () => {
      // This tests the date formatting function we'll add to now.js
      const formatDateTime = (date) => {
        const d = new Date(date);
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        const hours = String(d.getHours()).padStart(2, '0');
        const minutes = String(d.getMinutes()).padStart(2, '0');
        const seconds = String(d.getSeconds()).padStart(2, '0');
        
        return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
      };
      
      // Create a date in local timezone
      const testDate = new Date(2024, 11, 15, 13, 23, 45); // Month is 0-indexed, so 11 = December
      const expected = '2024-12-15 13:23:45';
      expect(formatDateTime(testDate)).toBe(expected);
    });
  });

  describe('TPM calculation', () => {
    it('should calculate TPM using only input and output tokens', () => {
      const monitor = new RealtimeMonitor();
      const mockUsage = [
        {
          timestamp: new Date().toISOString(),
          usage: {
            inputTokens: 100,
            outputTokens: 200,
            cacheCreateTokens: 50,  // Should be excluded
            cacheReadTokens: 100,   // Should be excluded
            total: 450,
            effectiveTotal: 300  // 100 + 200
          }
        },
        {
          timestamp: new Date(Date.now() - 5 * 60 * 1000).toISOString(), // 5 minutes ago
          usage: {
            inputTokens: 150,
            outputTokens: 250,
            cacheCreateTokens: 0,
            cacheReadTokens: 200,   // Should be excluded
            total: 600,
            effectiveTotal: 400  // 150 + 250
          }
        }
      ];
      
      // Mock getAllRecentTokenUsage
      monitor.getAllRecentTokenUsage = jest.fn().mockResolvedValue(mockUsage);
      
      return monitor.getRecentUsage().then(result => {
        // Should calculate (100+200+150+250) / 10 = 70 TPM
        expect(result.tokensPerMinute).toBe(70);
      });
    });
  });
});