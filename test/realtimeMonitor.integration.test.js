const { describe, it, expect, beforeEach, afterEach } = require('@jest/globals');
const RealtimeMonitor = require('../src/services/realtimeMonitor');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');

describe('RealtimeMonitor - Integration Tests for Weekly Window', () => {
  let monitor;
  let tempDir;
  const mockDate = new Date('2024-12-15T14:30:00.000Z');
  
  beforeEach(async () => {
    monitor = new RealtimeMonitor();
    jest.useFakeTimers();
    jest.setSystemTime(mockDate);
    
    // Create temporary directory structure
    tempDir = path.join(os.tmpdir(), 'viber-test-' + Date.now());
    const claudeDir = path.join(tempDir, '.claude', 'projects');
    await fs.mkdir(claudeDir, { recursive: true });
    
    // Override the claudeDir in monitor
    monitor.claudeDir = claudeDir;
  });
  
  afterEach(async () => {
    jest.useRealTimers();
    
    // Clean up temp directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  async function createTestJsonlFile(projectName, sessionId, entries) {
    const projectDir = path.join(monitor.claudeDir, projectName);
    await fs.mkdir(projectDir, { recursive: true });
    
    const filePath = path.join(projectDir, `${sessionId}.jsonl`);
    const content = entries.map(entry => JSON.stringify(entry)).join('\n');
    await fs.writeFile(filePath, content);
    
    // Set file modification time to the most recent entry
    const mostRecentTime = new Date(entries[entries.length - 1].timestamp);
    await fs.utimes(filePath, mostRecentTime, mostRecentTime);
  }

  describe('Real-world weekly window scenarios', () => {
    it('should handle user with sporadic usage over 30 days', async () => {
      // Simulate usage pattern: active for a few days, then gaps
      const entries = [
        // Week 1 (Nov 17-23): Initial usage
        {
          type: 'assistant',
          timestamp: '2024-11-17T10:00:00.000Z',
          message: {
            model: 'claude-3-opus',
            usage: {
              input_tokens: 5000,
              output_tokens: 10000,
              cache_creation_input_tokens: 0,
              cache_read_input_tokens: 0
            }
          }
        },
        {
          type: 'assistant',
          timestamp: '2024-11-18T15:30:00.000Z',
          message: {
            model: 'claude-3-opus',
            usage: {
              input_tokens: 3000,
              output_tokens: 6000,
              cache_creation_input_tokens: 0,
              cache_read_input_tokens: 0
            }
          }
        },
        // Gap of several days
        // Week 2 (Nov 24-30): Some activity
        {
          type: 'assistant',
          timestamp: '2024-11-26T09:00:00.000Z',
          message: {
            model: 'claude-3-sonnet',
            usage: {
              input_tokens: 2000,
              output_tokens: 4000,
              cache_creation_input_tokens: 0,
              cache_read_input_tokens: 0
            }
          }
        },
        // Week 3 (Dec 1-7): No activity
        // Week 4 (Dec 8-14): Heavy usage
        {
          type: 'assistant',
          timestamp: '2024-12-10T08:00:00.000Z',
          message: {
            model: 'claude-3-opus',
            usage: {
              input_tokens: 50000,
              output_tokens: 100000,
              cache_creation_input_tokens: 10000,
              cache_read_input_tokens: 20000
            }
          }
        },
        {
          type: 'assistant',
          timestamp: '2024-12-11T14:00:00.000Z',
          message: {
            model: 'claude-3-opus',
            usage: {
              input_tokens: 30000,
              output_tokens: 60000,
              cache_creation_input_tokens: 5000,
              cache_read_input_tokens: 15000
            }
          }
        },
        // Current week (Dec 15-21): Today's usage
        {
          type: 'assistant',
          timestamp: '2024-12-15T10:00:00.000Z',
          message: {
            model: 'claude-3-opus',
            usage: {
              input_tokens: 10000,
              output_tokens: 20000,
              cache_creation_input_tokens: 2000,
              cache_read_input_tokens: 5000
            }
          }
        }
      ];

      await createTestJsonlFile('test-project', 'session-1', entries);
      
      const result = await monitor.getRecentUsage();
      
      // Verify weekly window calculation
      expect(result.weeklyWindow).toBeDefined();
      
      // With proper weekly calculation from first usage (Nov 17),
      // current week should start on Dec 15 (4 weeks later)
      // So only the Dec 15 usage should be included
      expect(result.weeklyWindow.messageCount).toBe(1);
      
      // Total tokens for Dec 15: only input + output tokens count
      // = 10000 + 20000 = 30000 (cache tokens excluded)
      expect(result.weeklyWindow.totalTokens).toBe(30000);
      
      // Verify reset time is 7 days from window start
      const windowStart = new Date(result.weeklyWindow.windowStart);
      const resetTime = new Date(result.weeklyWindow.resetTime);
      const daysDiff = (resetTime - windowStart) / (1000 * 60 * 60 * 24);
      expect(daysDiff).toBe(7);
    });

    it('should handle exactly 7-day old session correctly', async () => {
      // Create usage exactly 7 days apart
      const entries = [
        {
          type: 'assistant',
          timestamp: '2024-12-08T14:30:00.000Z', // Exactly 7 days ago
          message: {
            model: 'claude-3-sonnet',
            usage: {
              input_tokens: 1000,
              output_tokens: 2000,
              cache_creation_input_tokens: 0,
              cache_read_input_tokens: 0
            }
          }
        },
        {
          type: 'assistant',
          timestamp: '2024-12-15T14:30:00.000Z', // Current time
          message: {
            model: 'claude-3-sonnet',
            usage: {
              input_tokens: 500,
              output_tokens: 1000,
              cache_creation_input_tokens: 0,
              cache_read_input_tokens: 0
            }
          }
        }
      ];

      await createTestJsonlFile('boundary-test', 'session-boundary', entries);
      
      const result = await monitor.getRecentUsage();
      
      // With proper implementation, new week starts at Dec 15 14:30
      // So only the second message should be included
      expect(result.weeklyWindow.messageCount).toBe(1);
      expect(result.weeklyWindow.totalTokens).toBe(1500); // 500 + 1000
    });

    it('should handle multiple projects with different usage patterns', async () => {
      // Project 1: Regular daily usage
      const project1Entries = [];
      for (let i = 29; i >= 0; i--) {
        const date = new Date(mockDate);
        date.setDate(date.getDate() - i);
        date.setHours(10, 0, 0, 0);
        
        project1Entries.push({
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
        });
      }
      
      // Project 2: Heavy usage in current week only
      const project2Entries = [
        {
          type: 'assistant',
          timestamp: '2024-12-13T08:00:00.000Z',
          message: {
            model: 'claude-3-opus',
            usage: {
              input_tokens: 10000,
              output_tokens: 20000,
              cache_creation_input_tokens: 5000,
              cache_read_input_tokens: 10000
            }
          }
        },
        {
          type: 'assistant',
          timestamp: '2024-12-14T16:00:00.000Z',
          message: {
            model: 'claude-3-opus',
            usage: {
              input_tokens: 15000,
              output_tokens: 30000,
              cache_creation_input_tokens: 0,
              cache_read_input_tokens: 25000
            }
          }
        }
      ];
      
      await createTestJsonlFile('project-1', 'session-regular', project1Entries);
      await createTestJsonlFile('project-2', 'session-heavy', project2Entries);
      
      const result = await monitor.getRecentUsage();
      
      // Verify combined usage from both projects
      expect(result.weeklyWindow.messageCount).toBeGreaterThan(0);
      
      // Verify model breakdown includes both projects
      expect(result.weeklyWindow.byModel).toHaveProperty('claude-3-sonnet');
      expect(result.weeklyWindow.byModel).toHaveProperty('claude-3-opus');
    });

    it('should handle cache tokens correctly in weekly calculations', async () => {
      const entries = [
        {
          type: 'assistant',
          timestamp: '2024-12-15T10:00:00.000Z',
          message: {
            model: 'claude-3-opus',
            usage: {
              input_tokens: 1000,
              output_tokens: 2000,
              cache_creation_input_tokens: 4000, // 125% = 5000 effective
              cache_read_input_tokens: 10000      // 10% = 1000 effective
            }
          }
        }
      ];
      
      await createTestJsonlFile('cache-test', 'session-cache', entries);
      
      const result = await monitor.getRecentUsage();
      
      // Verify effective total calculation - only input + output tokens count
      // 1000 + 2000 = 3000 (cache tokens excluded)
      expect(result.weeklyWindow.totalTokens).toBe(3000);
      expect(result.weeklyWindow.effectiveTotal).toBe(3000);
      
      // Verify raw totals are tracked separately
      expect(result.weeklyWindow.rawTotals.input).toBe(1000);
      expect(result.weeklyWindow.rawTotals.output).toBe(2000);
      expect(result.weeklyWindow.rawTotals.cacheCreate).toBe(4000);
      expect(result.weeklyWindow.rawTotals.cacheRead).toBe(10000);
      expect(result.weeklyWindow.rawTotals.total).toBe(17000);
    });

    it('should return empty window when no usage in current week', async () => {
      // All usage is from 2+ weeks ago
      const entries = [
        {
          type: 'assistant',
          timestamp: '2024-11-20T10:00:00.000Z',
          message: {
            model: 'claude-3-sonnet',
            usage: {
              input_tokens: 5000,
              output_tokens: 10000,
              cache_creation_input_tokens: 0,
              cache_read_input_tokens: 0
            }
          }
        },
        {
          type: 'assistant',
          timestamp: '2024-11-25T10:00:00.000Z',
          message: {
            model: 'claude-3-sonnet',
            usage: {
              input_tokens: 3000,
              output_tokens: 6000,
              cache_creation_input_tokens: 0,
              cache_read_input_tokens: 0
            }
          }
        }
      ];
      
      await createTestJsonlFile('old-usage', 'session-old', entries);
      
      const result = await monitor.getRecentUsage();
      
      // Should indicate no usage in current week
      expect(result.weeklyWindow.totalTokens).toBe(0);
      expect(result.weeklyWindow.messageCount).toBe(0);
      expect(result.weeklyWindow.windowStart).toBeDefined(); // But window start should still be calculated
    });
  });

  describe('Performance with large datasets', () => {
    it('should handle 30 days of heavy usage efficiently', async () => {
      const entries = [];
      
      // Generate 1000 messages over 30 days
      for (let i = 0; i < 1000; i++) {
        const daysAgo = Math.floor(i / 33); // ~33 messages per day
        const hoursInDay = (i % 33) * 0.7; // Spread throughout day
        
        const date = new Date(mockDate);
        date.setDate(date.getDate() - daysAgo);
        date.setHours(Math.floor(hoursInDay), (hoursInDay % 1) * 60, 0, 0);
        
        entries.push({
          type: 'assistant',
          timestamp: date.toISOString(),
          message: {
            model: i % 2 === 0 ? 'claude-3-opus' : 'claude-3-sonnet',
            usage: {
              input_tokens: Math.floor(Math.random() * 5000) + 500,
              output_tokens: Math.floor(Math.random() * 10000) + 1000,
              cache_creation_input_tokens: Math.floor(Math.random() * 2000),
              cache_read_input_tokens: Math.floor(Math.random() * 10000)
            }
          }
        });
      }
      
      // Sort entries by timestamp (oldest first) before writing
      entries.sort((a, b) => 
        new Date(a.timestamp) - new Date(b.timestamp)
      );
      
      await createTestJsonlFile('heavy-usage', 'session-heavy', entries);
      
      const startTime = Date.now();
      const result = await monitor.getRecentUsage();
      const endTime = Date.now();
      
      // Should complete within reasonable time (< 1 second)
      expect(endTime - startTime).toBeLessThan(1000);
      
      // Verify results are calculated
      expect(result.weeklyWindow).toBeDefined();
      expect(result.weeklyWindow.messageCount).toBeGreaterThan(0);
      expect(result.weeklyWindow.byModel['claude-3-opus']).toBeDefined();
      expect(result.weeklyWindow.byModel['claude-3-sonnet']).toBeDefined();
    });
  });
});