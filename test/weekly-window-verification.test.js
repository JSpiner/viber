const { describe, it, expect, beforeEach, afterEach } = require('@jest/globals');
const RealtimeMonitor = require('../src/services/realtimeMonitor');

describe('Weekly Window Verification - Specific Edge Cases', () => {
  let monitor;
  
  beforeEach(() => {
    monitor = new RealtimeMonitor();
    jest.useFakeTimers();
  });
  
  afterEach(() => {
    jest.useRealTimers();
  });

  describe('Weekly window boundary calculation', () => {
    it('should correctly calculate window for usage exactly at week boundaries', () => {
      // Set current time to Dec 15, 2024 14:30 UTC
      const currentTime = new Date('2024-12-15T14:30:00.000Z');
      jest.setSystemTime(currentTime);
      
      const usage = [
        // First usage: Nov 17, 10:00 (exactly 4 weeks ago)
        { timestamp: '2024-11-17T10:00:00.000Z' },
        // Usage at each week boundary
        { timestamp: '2024-11-24T10:00:00.000Z' }, // Week 1 start
        { timestamp: '2024-12-01T10:00:00.000Z' }, // Week 2 start
        { timestamp: '2024-12-08T10:00:00.000Z' }, // Week 3 start
        { timestamp: '2024-12-15T10:00:00.000Z' }, // Week 4 start (current week)
      ];
      
      const windowStart = monitor.calculateWeeklyWindowStart(usage);
      
      // Should be Dec 15 10:00 (start of current week)
      expect(windowStart.toISOString()).toBe('2024-12-15T10:00:00.000Z');
    });

    it('should handle first usage in middle of week', () => {
      // Current time: Sunday Dec 15, 2024 14:30
      const currentTime = new Date('2024-12-15T14:30:00.000Z');
      jest.setSystemTime(currentTime);
      
      const usage = [
        // First usage: Wednesday Nov 20 (25.7 days ago)
        { timestamp: '2024-11-20T08:00:00.000Z' },
        { timestamp: '2024-12-10T15:00:00.000Z' },
        { timestamp: '2024-12-15T12:00:00.000Z' },
      ];
      
      const windowStart = monitor.calculateWeeklyWindowStart(usage);
      
      // From Nov 20 to Dec 15 is 25 days = 3 weeks + 4 days
      // So current week (week 3) starts on Dec 11 08:00
      expect(windowStart.toISOString()).toBe('2024-12-11T08:00:00.000Z');
    });

    it('should verify weekly window resets after exactly 7 days', () => {
      // Set time to exactly 7 days after first usage
      const firstUsageTime = new Date('2024-12-08T10:00:00.000Z');
      const currentTime = new Date('2024-12-15T10:00:00.000Z'); // Exactly 7 days later
      jest.setSystemTime(currentTime);
      
      const usage = [
        { 
          timestamp: firstUsageTime.toISOString(),
          usage: { 
            inputTokens: 1000, 
            outputTokens: 2000, 
            cacheCreateTokens: 0,
            cacheReadTokens: 0,
            total: 3000,
            effectiveTotal: 3000
          }
        },
        { 
          timestamp: '2024-12-15T09:59:59.999Z', // Just before window reset
          usage: { 
            inputTokens: 500, 
            outputTokens: 1000, 
            total: 1500,
            effectiveTotal: 1500
          }
        },
        { 
          timestamp: currentTime.toISOString(), // Exactly at window reset
          usage: { 
            inputTokens: 300, 
            outputTokens: 700, 
            total: 1000,
            effectiveTotal: 1000
          }
        }
      ];
      
      const result = monitor.calculateWindowUsage(usage, null, true);
      
      // Should only include the last message (at reset time)
      expect(result.totalTokens).toBe(1000);
      expect(result.messageCount).toBe(1);
      expect(result.windowStart).toBe('2024-12-15T10:00:00.000Z');
    });

    it('should calculate correct window for continuous daily usage', () => {
      const currentTime = new Date('2024-12-15T14:30:00.000Z');
      jest.setSystemTime(currentTime);
      
      // Generate daily usage for 30 days
      const usage = [];
      for (let i = 29; i >= 0; i--) {
        const date = new Date(currentTime);
        date.setDate(date.getDate() - i);
        date.setHours(10, 0, 0, 0);
        
        usage.push({
          timestamp: date.toISOString(),
          usage: {
            inputTokens: 100,
            outputTokens: 200,
            cacheCreateTokens: 0,
            cacheReadTokens: 0,
            total: 300,
            effectiveTotal: 300
          }
        });
      }
      
      const windowStart = monitor.calculateWeeklyWindowStart(usage);
      const result = monitor.calculateWindowUsage(usage, null, true);
      
      // First usage was Nov 16, current is Dec 15
      // That's 29 days = 4 weeks + 1 day
      // So current week (week 4) starts on Dec 14 10:00
      expect(windowStart.toISOString()).toBe('2024-12-14T10:00:00.000Z');
      
      // Should include Dec 14 and Dec 15 (2 days)
      expect(result.messageCount).toBe(2);
      expect(result.totalTokens).toBe(600); // 2 days * 300 tokens
    });

    it('should handle usage patterns with long gaps correctly', () => {
      const currentTime = new Date('2024-12-15T14:30:00.000Z');
      jest.setSystemTime(currentTime);
      
      const usage = [
        // Very old usage (45 days ago)
        { 
          timestamp: '2024-11-01T10:00:00.000Z',
          usage: { total: 10000, effectiveTotal: 10000 }
        },
        // Gap of ~40 days
        // Recent usage in current week
        { 
          timestamp: '2024-12-14T10:00:00.000Z',
          usage: { total: 5000, effectiveTotal: 5000 }
        },
        { 
          timestamp: '2024-12-15T10:00:00.000Z',
          usage: { total: 3000, effectiveTotal: 3000 }
        }
      ];
      
      const windowStart = monitor.calculateWeeklyWindowStart(usage);
      const result = monitor.calculateWindowUsage(usage, null, true);
      
      // From Nov 1 to Dec 15 is 44 days = 6 weeks + 2 days
      // Current week (week 6) starts on Dec 13 10:00
      expect(windowStart.toISOString()).toBe('2024-12-13T10:00:00.000Z');
      
      // Should include Dec 14 and Dec 15
      expect(result.messageCount).toBe(2);
      expect(result.totalTokens).toBe(8000); // 5000 + 3000
    });
  });

  describe('Weekly window with different time zones consideration', () => {
    it('should maintain consistent window calculation regardless of local time', () => {
      // Test that window calculation is consistent in UTC
      const usage = [
        { timestamp: '2024-12-01T00:00:00.000Z' }, // Start of day UTC
        { timestamp: '2024-12-01T23:59:59.999Z' }, // End of day UTC
        { timestamp: '2024-12-08T12:00:00.000Z' }, // Mid-day next week
      ];
      
      // Test at different "current" times
      const testTimes = [
        '2024-12-08T00:00:00.000Z',
        '2024-12-08T12:00:00.000Z',
        '2024-12-08T23:59:59.999Z',
      ];
      
      const results = testTimes.map(time => {
        jest.setSystemTime(new Date(time));
        return monitor.calculateWeeklyWindowStart(usage);
      });
      
      // All should return the same window start
      expect(results[0].toISOString()).toBe('2024-12-08T00:00:00.000Z');
      expect(results[1].toISOString()).toBe('2024-12-08T00:00:00.000Z');
      expect(results[2].toISOString()).toBe('2024-12-08T00:00:00.000Z');
    });
  });

  describe('Weekly limit tracking accuracy', () => {
    it('should accurately track token usage against weekly limits', () => {
      const currentTime = new Date('2024-12-15T14:30:00.000Z');
      jest.setSystemTime(currentTime);
      
      const usage = [
        {
          timestamp: '2024-12-11T10:00:00.000Z', // Current week start
          usage: {
            inputTokens: 5000000,
            outputTokens: 10000000,
            cacheCreateTokens: 0,
            cacheReadTokens: 0,
            total: 15000000,
            effectiveTotal: 15000000
          }
        },
        {
          timestamp: '2024-12-15T10:00:00.000Z', // Today
          usage: {
            inputTokens: 1000000,
            outputTokens: 2000000,
            cacheCreateTokens: 1000000, // 1.25x = 1,250,000
            cacheReadTokens: 10000000,  // 0.1x = 1,000,000
            total: 14000000,
            effectiveTotal: 5250000
          }
        }
      ];
      
      const result = monitor.calculateWindowUsage(usage, null, true);
      
      // Total effective tokens: 15,000,000 + 5,250,000 = 20,250,000
      expect(result.totalTokens).toBe(20250000);
      expect(result.effectiveTotal).toBe(20250000);
      expect(result.limit).toBe(20000000); // Pro tier weekly limit
      
      // Verify we're over the limit
      const percentUsed = (result.totalTokens / result.limit) * 100;
      expect(percentUsed).toBeGreaterThan(100);
      expect(percentUsed).toBeCloseTo(101.25, 2);
    });
  });
});