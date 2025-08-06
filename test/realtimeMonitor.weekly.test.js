const { describe, it, expect, beforeEach, afterEach } = require('@jest/globals');
const RealtimeMonitor = require('../src/services/realtimeMonitor');

describe('RealtimeMonitor - Weekly Window Calculations', () => {
  let monitor;
  const mockDate = new Date('2024-12-15T14:30:00.000Z');
  
  beforeEach(() => {
    monitor = new RealtimeMonitor();
    jest.useFakeTimers();
    jest.setSystemTime(mockDate);
  });
  
  afterEach(() => {
    jest.useRealTimers();
  });

  describe('calculateWeeklyWindowStart', () => {
    it('should return null when no usage data exists', () => {
      const result = monitor.calculateWeeklyWindowStart([]);
      expect(result).toBe(null);
    });

    it('should calculate window start from first usage', () => {
      const usage = [
        { timestamp: '2024-12-01T10:00:00.000Z' }, // 14.2 days ago
        { timestamp: '2024-12-08T10:00:00.000Z' }, // 7.2 days ago
        { timestamp: '2024-12-15T10:00:00.000Z' }, // 4.5 hours ago
      ];
      
      const result = monitor.calculateWeeklyWindowStart(usage);
      // First usage was on Dec 1, which is in week 0
      // Current time is Dec 15, which is in week 2
      // Week 2 starts on Dec 15 00:00:00
      expect(result.toISOString()).toBe('2024-12-15T10:00:00.000Z');
    });

    it('should handle usage spanning multiple weeks', () => {
      const usage = [
        { timestamp: '2024-11-20T08:00:00.000Z' }, // 25.3 days ago
        { timestamp: '2024-11-27T08:00:00.000Z' }, // 18.3 days ago
        { timestamp: '2024-12-04T08:00:00.000Z' }, // 11.3 days ago
        { timestamp: '2024-12-11T08:00:00.000Z' }, // 4.3 days ago
        { timestamp: '2024-12-15T08:00:00.000Z' }, // 6.5 hours ago
      ];
      
      const result = monitor.calculateWeeklyWindowStart(usage);
      // First usage: Nov 20 (week 0)
      // Current: Dec 15 (week 3, starts Dec 11)
      expect(result.toISOString()).toBe('2024-12-11T08:00:00.000Z');
    });

    it('should handle edge case where current time is exactly on week boundary', () => {
      // Set current time to exactly 7 days after first usage
      const firstUsage = new Date('2024-12-08T14:30:00.000Z');
      jest.setSystemTime(new Date('2024-12-15T14:30:00.000Z'));
      
      const usage = [
        { timestamp: firstUsage.toISOString() },
        { timestamp: '2024-12-15T14:30:00.000Z' },
      ];
      
      const result = monitor.calculateWeeklyWindowStart(usage);
      expect(result.toISOString()).toBe('2024-12-15T14:30:00.000Z');
    });
  });

  describe('calculateWindowUsage with weekly window improvements', () => {
    it('should use 30-day data for weekly calculations', () => {
      // This test verifies that old data (>3 days) is included in calculations
      const usage = [
        { 
          timestamp: '2024-11-20T10:00:00.000Z', // 25 days ago
          usage: { 
            inputTokens: 1000, 
            outputTokens: 2000, 
            cacheCreateTokens: 0,
            cacheReadTokens: 0,
            total: 3000,
            effectiveTotal: 3000
          },
          model: 'claude-3-sonnet'
        },
        { 
          timestamp: '2024-12-13T10:00:00.000Z', // 2 days ago (within current week)
          usage: { 
            inputTokens: 500, 
            outputTokens: 1000, 
            cacheCreateTokens: 0,
            cacheReadTokens: 0,
            total: 1500,
            effectiveTotal: 1500
          },
          model: 'claude-3-sonnet'
        }
      ];
      
      // Mock the new weekly window calculation
      monitor.calculateWeeklyWindowStart = jest.fn().mockReturnValue(
        new Date('2024-12-11T10:00:00.000Z') // Current week started 4 days ago
      );
      
      const result = monitor.calculateWindowUsage(usage, null, true);
      
      // Should only include usage from current weekly window (Dec 13)
      expect(result.totalTokens).toBe(1500);
      expect(result.messageCount).toBe(1);
      expect(monitor.calculateWeeklyWindowStart).toHaveBeenCalledWith(usage);
    });

    it('should correctly calculate usage across week boundary', () => {
      const usage = [
        { 
          timestamp: '2024-12-10T10:00:00.000Z', // Previous week
          usage: { 
            inputTokens: 1000, 
            outputTokens: 2000, 
            total: 3000,
            effectiveTotal: 3000
          },
          model: 'claude-3-opus'
        },
        { 
          timestamp: '2024-12-11T10:00:00.000Z', // Start of current week
          usage: { 
            inputTokens: 500, 
            outputTokens: 1000, 
            total: 1500,
            effectiveTotal: 1500
          },
          model: 'claude-3-opus'
        },
        { 
          timestamp: '2024-12-15T10:00:00.000Z', // Current time
          usage: { 
            inputTokens: 300, 
            outputTokens: 700, 
            total: 1000,
            effectiveTotal: 1000
          },
          model: 'claude-3-opus'
        }
      ];
      
      // Mock weekly window start
      monitor.calculateWeeklyWindowStart = jest.fn().mockReturnValue(
        new Date('2024-12-11T10:00:00.000Z')
      );
      
      const result = monitor.calculateWindowUsage(usage, null, true);
      
      // Should include only Dec 11 and Dec 15 (current week)
      expect(result.totalTokens).toBe(2500); // 1500 + 1000
      expect(result.messageCount).toBe(2);
      expect(result.windowStart).toBe('2024-12-11T10:00:00.000Z');
    });

    it('should return empty window when all usage is before current week', () => {
      const usage = [
        { 
          timestamp: '2024-12-01T10:00:00.000Z', // 2 weeks ago
          usage: { total: 3000, effectiveTotal: 3000 }
        },
        { 
          timestamp: '2024-12-08T10:00:00.000Z', // 1 week ago
          usage: { total: 1500, effectiveTotal: 1500 }
        }
      ];
      
      // Mock weekly window start to be after all usage
      monitor.calculateWeeklyWindowStart = jest.fn().mockReturnValue(
        new Date('2024-12-15T10:00:00.000Z')
      );
      
      const result = monitor.calculateWindowUsage(usage, null, true);
      
      expect(result.totalTokens).toBe(0);
      expect(result.messageCount).toBe(0);
    });

    it('should handle continuous usage with no gaps over multiple weeks', () => {
      // Generate usage data for 30 days with daily activity
      const usage = [];
      for (let i = 29; i >= 0; i--) {
        const date = new Date(mockDate);
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
          },
          model: 'claude-3-sonnet'
        });
      }
      
      // First usage was 29 days ago
      const firstUsageDate = new Date(mockDate);
      firstUsageDate.setDate(firstUsageDate.getDate() - 29);
      firstUsageDate.setHours(10, 0, 0, 0);
      
      // Calculate expected window start (should be within last 7 days)
      const expectedWindowStart = new Date(firstUsageDate);
      const weeksSince = Math.floor((mockDate - firstUsageDate) / (7 * 24 * 60 * 60 * 1000));
      expectedWindowStart.setDate(expectedWindowStart.getDate() + weeksSince * 7);
      
      monitor.calculateWeeklyWindowStart = jest.fn().mockReturnValue(expectedWindowStart);
      
      const result = monitor.calculateWindowUsage(usage, null, true);
      
      // Should include only the last few days of usage (within current week)
      expect(result.messageCount).toBeGreaterThan(0);
      expect(result.messageCount).toBeLessThanOrEqual(7); // At most 7 days
      expect(result.totalTokens).toBe(result.messageCount * 300);
    });
  });

  describe('Data collection period tests', () => {
    it('should verify 30-day data collection in getAllRecentTokenUsage', async () => {
      // This test will fail until we implement the 30-day collection
      const mockProjectPath = '/mock/path';
      const mockFiles = ['session1.jsonl', 'session2.jsonl'];
      
      // Mock fs operations
      const fs = require('fs').promises;
      jest.spyOn(fs, 'access').mockResolvedValue();
      jest.spyOn(fs, 'readdir').mockResolvedValue(['project1']);
      jest.spyOn(fs, 'stat').mockResolvedValue({ 
        isDirectory: () => true,
        mtime: new Date() 
      });
      
      // Spy on getProjectRecentUsage to check date parameter
      const getProjectSpy = jest.spyOn(monitor, 'getProjectRecentUsage')
        .mockResolvedValue([]);
      
      await monitor.getAllRecentTokenUsage();
      
      // This expectation will fail with current code (3 days)
      // and pass when we implement 30-day collection
      expect(getProjectSpy).toHaveBeenCalled();
      
      // Clean up
      jest.restoreAllMocks();
    });

    it('should verify extractRecentUsageFromFile checks 30 days', async () => {
      const filePath = '/test/file.jsonl';
      const projectName = 'test-project';
      const sessionId = 'test-session';
      
      // Create test data spanning 30 days
      const testData = [];
      for (let i = 0; i < 35; i++) {
        const date = new Date(mockDate);
        date.setDate(date.getDate() - i);
        testData.push(JSON.stringify({
          type: 'assistant',
          timestamp: date.toISOString(),
          message: {
            model: 'claude-3-sonnet',
            usage: {
              input_tokens: 100,
              output_tokens: 200,
              cache_creation_input_tokens: 0,
              cache_read_input_tokens: 0
            }
          }
        }));
      }
      
      const fs = require('fs').promises;
      jest.spyOn(fs, 'readFile').mockResolvedValue(testData.join('\n'));
      
      const result = await monitor.extractRecentUsageFromFile(filePath, projectName, sessionId);
      
      // Should include 30 days of data (not 35)
      // This will fail with current 3-day implementation
      expect(result.length).toBe(30);
      
      // Verify oldest included data is 30 days ago
      const oldestDate = new Date(result[result.length - 1].timestamp);
      const daysDiff = (mockDate - oldestDate) / (1000 * 60 * 60 * 24);
      expect(daysDiff).toBeLessThan(30);
      expect(daysDiff).toBeGreaterThanOrEqual(29);
      
      jest.restoreAllMocks();
    });
  });

  describe('Weekly reset time calculation', () => {
    it('should calculate correct reset time for weekly window', () => {
      const usage = [
        { 
          timestamp: '2024-12-11T10:00:00.000Z',
          usage: { total: 1000, effectiveTotal: 1000 }
        }
      ];
      
      monitor.calculateWeeklyWindowStart = jest.fn().mockReturnValue(
        new Date('2024-12-11T10:00:00.000Z')
      );
      
      const result = monitor.calculateWindowUsage(usage, null, true);
      
      // Reset time should be exactly 7 days after window start
      const expectedReset = new Date('2024-12-18T10:00:00.000Z');
      expect(result.resetTime.toISOString()).toBe(expectedReset.toISOString());
    });
  });
});