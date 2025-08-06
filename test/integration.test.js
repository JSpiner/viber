const { describe, it, expect, beforeEach, afterEach } = require('@jest/globals');
const RealtimeMonitor = require('../src/services/realtimeMonitor');

describe('Integration Tests - No Activity Scenario', () => {
  let monitor;
  
  beforeEach(() => {
    monitor = new RealtimeMonitor();
    jest.useFakeTimers();
  });
  
  afterEach(() => {
    jest.useRealTimers();
  });

  it('should handle complete scenario: no activity for 5+ hours', async () => {
    const currentTime = new Date('2024-12-15T20:00:00.000Z');
    jest.setSystemTime(currentTime);
    
    // Mock usage data with last activity 6 hours ago
    const mockUsageData = [
      {
        timestamp: '2024-12-15T13:00:00.000Z', // 7 hours ago
        sessionId: 'old-session',
        projectName: 'test-project',
        model: 'claude-3-sonnet',
        usage: {
          inputTokens: 1000,
          outputTokens: 2000,
          cacheCreateTokens: 0,
          cacheReadTokens: 500,
          effectiveTotal: 3050, // 1000 + 2000 + (500 * 0.1)
          total: 3500
        }
      },
      {
        timestamp: '2024-12-15T13:30:00.000Z', // 6.5 hours ago
        sessionId: 'old-session',
        projectName: 'test-project',
        model: 'claude-3-sonnet',
        usage: {
          inputTokens: 500,
          outputTokens: 1000,
          cacheCreateTokens: 0,
          cacheReadTokens: 0,
          effectiveTotal: 1500,
          total: 1500
        }
      }
    ];
    
    // Mock the getAllRecentTokenUsage method
    monitor.getAllRecentTokenUsage = jest.fn().mockResolvedValue(mockUsageData);
    
    // Get recent usage
    const result = await monitor.getRecentUsage();
    
    // Verify recent usage (last 10 minutes) is empty
    expect(result.recent).toHaveLength(0);
    expect(result.tokensPerMinute).toBe(0);
    expect(result.trend).toBe('stable');
    
    // Verify 5-hour window shows no active session
    expect(result.hourlyWindow.totalTokens).toBe(0);
    expect(result.hourlyWindow.messageCount).toBe(0);
    expect(result.hourlyWindow.windowStart).toBe(null);
    expect(result.hourlyWindow.sessionStart).toBe(null);
    
    // Verify weekly window includes the old activity (within 7 days)
    // Since effectiveTotal is provided in mock data, it uses those values
    expect(result.weeklyWindow.totalTokens).toBe(1500); // Only the most recent message from 6.5 hours ago
    expect(result.weeklyWindow.messageCount).toBe(1);
  });

  it('should transition from no activity to active session', async () => {
    const currentTime = new Date('2024-12-15T20:00:00.000Z');
    jest.setSystemTime(currentTime);
    
    // Initial state: old activity only
    const oldUsageData = [
      {
        timestamp: '2024-12-15T13:00:00.000Z', // 7 hours ago
        usage: { effectiveTotal: 1000, total: 1000 }
      }
    ];
    
    monitor.getAllRecentTokenUsage = jest.fn().mockResolvedValue(oldUsageData);
    let result = await monitor.getRecentUsage();
    
    // Verify no active session
    expect(result.hourlyWindow.totalTokens).toBe(0);
    
    // Now add new activity
    const newUsageData = [
      ...oldUsageData,
      {
        timestamp: '2024-12-15T19:55:00.000Z', // 5 minutes ago
        sessionId: 'new-session',
        projectName: 'test-project',
        model: 'claude-3-sonnet',
        usage: {
          inputTokens: 200,
          outputTokens: 300,
          cacheCreateTokens: 0,
          cacheReadTokens: 0,
          effectiveTotal: 500,
          total: 500
        }
      }
    ];
    
    monitor.getAllRecentTokenUsage = jest.fn().mockResolvedValue(newUsageData);
    result = await monitor.getRecentUsage();
    
    // Verify new session is detected
    expect(result.recent).toHaveLength(1);
    expect(result.hourlyWindow.totalTokens).toBe(500);
    expect(result.hourlyWindow.messageCount).toBe(1);
    expect(result.hourlyWindow.windowStart).toBe('2024-12-15T19:55:00.000Z');
  });

  it('should correctly identify session boundaries with exact 5-hour gaps', async () => {
    const currentTime = new Date('2024-12-15T20:00:00.000Z');
    jest.setSystemTime(currentTime);
    
    const usageData = [
      {
        timestamp: '2024-12-15T09:00:00.000Z', // 11 hours ago
        usage: { effectiveTotal: 1000, total: 1000 }
      },
      {
        timestamp: '2024-12-15T14:00:00.000Z', // 6 hours ago (5 hour gap)
        usage: { effectiveTotal: 2000, total: 2000 }
      },
      {
        timestamp: '2024-12-15T14:30:00.000Z', // 5.5 hours ago
        usage: { effectiveTotal: 1500, total: 1500 }
      },
      {
        timestamp: '2024-12-15T19:45:00.000Z', // 15 minutes ago (5.25 hour gap)
        usage: { effectiveTotal: 500, total: 500 }
      },
      {
        timestamp: '2024-12-15T19:50:00.000Z', // 10 minutes ago
        usage: { effectiveTotal: 300, total: 300 }
      }
    ];
    
    monitor.getAllRecentTokenUsage = jest.fn().mockResolvedValue(usageData);
    const result = await monitor.getRecentUsage();
    
    // Should only include the latest session (last 2 messages)
    expect(result.hourlyWindow.totalTokens).toBe(800); // 500 + 300
    expect(result.hourlyWindow.messageCount).toBe(2);
    expect(result.hourlyWindow.windowStart).toBe('2024-12-15T19:45:00.000Z');
  });
});