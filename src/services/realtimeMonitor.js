const fs = require('fs').promises;
const path = require('path');
const os = require('os');

class RealtimeMonitor {
  constructor() {
    this.claudeDir = path.join(os.homedir(), '.claude', 'projects');
  }

  async getRecentUsage() {
    try {
      // Get all token usage from the last 3 days (to find session boundaries)
      const allUsage = await this.getAllRecentTokenUsage();
      
      // Get recent 10 minutes usage
      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
      const recentUsage = allUsage.filter(item => 
        new Date(item.timestamp) >= tenMinutesAgo
      );

      // Get current 5-hour session data
      const hourlyWindowData = this.calculateWindowUsage(allUsage, null, false);

      // Get current weekly session data
      const weeklyWindowData = this.calculateWindowUsage(allUsage, null, true);

      // Get last 2 weeks of data for weekly visualization
      const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
      const twoWeeksData = allUsage.filter(item => 
        new Date(item.timestamp) >= twoWeeksAgo
      );
      
      console.log('RealtimeMonitor - twoWeeksData:', twoWeeksData.length, 'items from', twoWeeksAgo.toISOString());

      // Calculate all weekly windows in the 2-week period (pass all usage data)
      const weeklyWindows = this.calculateAllWeeklyWindows(allUsage);
      console.log('Weekly windows calculated:', weeklyWindows.length, 'windows');
      weeklyWindows.forEach((w, i) => {
        console.log(`Window ${i}: ${new Date(w.start).toLocaleDateString()} - ${new Date(w.end).toLocaleDateString()}, isCurrent: ${w.isCurrent}`);
      });

      // Calculate tokens per minute and trend (only input + output tokens)
      const tokensPerMinute = recentUsage.length > 0
        ? recentUsage.reduce((sum, item) => sum + (item.usage.inputTokens || 0) + (item.usage.outputTokens || 0), 0) / 10
        : 0;

      // Determine trend (you might want to compare with previous period)
      const trend = tokensPerMinute > 0 ? 'up' : 'stable';

      return {
        recent: recentUsage,
        hourlyWindow: hourlyWindowData,
        weeklyWindow: weeklyWindowData,
        twoWeeksData: twoWeeksData,
        weeklyWindows: weeklyWindows,
        tokensPerMinute,
        trend
      };
    } catch (error) {
      console.error('Error getting recent usage:', error);
      throw error;
    }
  }

  calculateWeeklyWindowStart(allUsage) {
    if (allUsage.length === 0) {
      return null;
    }
    
    // Find the oldest usage timestamp
    const timestamps = allUsage.map(item => new Date(item.timestamp));
    const oldestUsage = new Date(Math.min(...timestamps));
    
    // Current time
    const now = new Date();
    
    // Calculate elapsed time since first usage
    const elapsedMs = now - oldestUsage;
    const elapsedWeeks = Math.floor(elapsedMs / (7 * 24 * 60 * 60 * 1000));
    
    // Calculate current weekly window start
    const currentWindowStart = new Date(
      oldestUsage.getTime() + (elapsedWeeks * 7 * 24 * 60 * 60 * 1000)
    );
    
    return currentWindowStart;
  }

  calculateAllWeeklyWindows(allUsage) {
    if (!allUsage || allUsage.length === 0) {
      return [];
    }
    
    // Find the very first usage timestamp from all data
    const firstWindowStart = this.calculateWeeklyWindowStart(allUsage);
    if (!firstWindowStart) {
      return [];
    }
    
    console.log('First window start:', firstWindowStart.toISOString());
    
    const windows = [];
    const weekMs = 7 * 24 * 60 * 60 * 1000;
    const now = new Date();
    const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    
    // Start from the first window that might overlap with our 2-week period
    let windowStart = new Date(firstWindowStart);
    
    // Move forward to find the first window that overlaps with our 2-week display period
    while (windowStart.getTime() + weekMs < twoWeeksAgo.getTime()) {
      windowStart = new Date(windowStart.getTime() + weekMs);
    }
    
    // Make sure we include at least one previous window if it exists
    const currentWindowStart = this.calculateWeeklyWindowStart(allUsage);
    if (currentWindowStart && windowStart.getTime() >= currentWindowStart.getTime()) {
      // Go back one window to include the previous one
      windowStart = new Date(windowStart.getTime() - weekMs);
    }
    
    console.log('Starting window calculation from:', windowStart.toISOString());
    
    // Calculate all windows that overlap with the 2-week period
    // Continue until we've covered all windows including the current one
    while (windowStart.getTime() < now.getTime() + weekMs) {
      const windowEnd = new Date(windowStart.getTime() + weekMs);
      
      // Count tokens in this window
      const windowUsage = allUsage.filter(item => {
        const itemTime = new Date(item.timestamp);
        return itemTime >= windowStart && itemTime < windowEnd;
      });
      
      const totalTokens = windowUsage.reduce((sum, item) => 
        sum + (item.usage.effectiveTotal || 0), 0
      );
      
      // Only include windows that have some overlap with the 2-week period
      if (windowEnd >= twoWeeksAgo && windowStart <= now) {
        windows.push({
          start: windowStart.toISOString(),
          end: windowEnd.toISOString(),
          totalTokens: totalTokens,
          messageCount: windowUsage.length,
          isCurrent: windowStart <= now && windowEnd > now
        });
      }
      
      // Move to next window
      windowStart = new Date(windowStart.getTime() + weekMs);
    }
    
    return windows;
  }

  findCurrentSessionStart(allUsage, gapHours = 5) {
    if (allUsage.length === 0) {
      return new Date();
    }

    // Sort by timestamp (oldest first)
    const sortedUsage = [...allUsage].sort((a, b) => 
      new Date(a.timestamp) - new Date(b.timestamp)
    );

    // Start from the most recent and work backwards to find session boundaries
    let currentSessionStart = sortedUsage[sortedUsage.length - 1].timestamp;
    
    // Work backwards from the most recent message
    for (let i = sortedUsage.length - 1; i > 0; i--) {
      const currentTime = new Date(sortedUsage[i].timestamp);
      const previousTime = new Date(sortedUsage[i - 1].timestamp);
      const gapInHours = (currentTime - previousTime) / (1000 * 60 * 60);
      
      if (gapInHours >= gapHours) {
        // Found a gap! The current message (i) is the start of the current session
        currentSessionStart = sortedUsage[i].timestamp;
        break;
      }
    }
    
    const sessionStartDate = new Date(currentSessionStart);
    const now = new Date();
    const sessionDuration = (now - sessionStartDate) / (1000 * 60 * 60);
    console.log(`Found session start (${gapHours}h gap):`, currentSessionStart, `Duration: ${sessionDuration.toFixed(2)}h`);
    return sessionStartDate;
  }

  calculateWindowUsage(allUsage, windowStart, isWeekly = false) {
    // Check if there's any recent usage data
    if (allUsage.length === 0) {
      return {
        windowStart: null,
        sessionStart: null,
        totalTokens: 0,
        effectiveTotal: 0,
        limit: isWeekly ? 304000 : 19000, // Default pro limits
        resetTime: null,
        rawTotals: { input: 0, output: 0, cacheCreate: 0, cacheRead: 0, total: 0 },
        messageCount: 0,
        byModel: {}
      };
    }

    // For 5-hour windows, check if the most recent activity is older than the gap period
    if (!isWeekly) {
      const now = new Date();
      const gapHours = 5;
      const mostRecentActivity = allUsage
        .map(item => new Date(item.timestamp))
        .sort((a, b) => b - a)[0]; // Get most recent timestamp

      const hoursSinceLastActivity = (now - mostRecentActivity) / (1000 * 60 * 60);
      
      // If last activity is older than the gap period, return no active session
      if (hoursSinceLastActivity >= gapHours) {
        console.log(`No active 5-hour session - last activity was ${hoursSinceLastActivity.toFixed(1)} hours ago`);
        return {
          windowStart: null,
          sessionStart: null,
          totalTokens: 0,
          effectiveTotal: 0,
          limit: 19000, // Default pro limits
          resetTime: null,
          rawTotals: { input: 0, output: 0, cacheCreate: 0, cacheRead: 0, total: 0 },
          messageCount: 0,
          byModel: {}
        };
      }
    }

    // For 5-hour window, find the actual current session start
    // For weekly window, use the new weekly calculation
    let actualSessionStart;
    let windowUsage;
    
    if (isWeekly) {
      actualSessionStart = this.calculateWeeklyWindowStart(allUsage);
      if (!actualSessionStart) {
        // No usage data, return empty window
        return {
          windowStart: null,
          sessionStart: null,
          totalTokens: 0,
          effectiveTotal: 0,
          limit: 304000, // Default pro limits
          resetTime: null,
          rawTotals: { input: 0, output: 0, cacheCreate: 0, cacheRead: 0, total: 0 },
          messageCount: 0,
          byModel: {}
        };
      }
      // For weekly, get all usage within the week
      const weekEnd = new Date(actualSessionStart.getTime() + 7 * 24 * 60 * 60 * 1000);
      windowUsage = allUsage.filter(item => {
        const itemTime = new Date(item.timestamp);
        return itemTime >= actualSessionStart && itemTime < weekEnd;
      });
    } else {
      // For 5-hour window, use strict rolling window approach
      const now = new Date();
      const fiveHoursAgo = new Date(now.getTime() - 5 * 60 * 60 * 1000);
      
      // Get all messages within the last 5 hours
      windowUsage = allUsage.filter(item => 
        new Date(item.timestamp) >= fiveHoursAgo
      );
      
      // If we have messages, the session start is 5 hours ago or the first message, whichever is later
      if (windowUsage.length > 0) {
        const sortedWindow = [...windowUsage].sort((a, b) => 
          new Date(a.timestamp) - new Date(b.timestamp)
        );
        actualSessionStart = new Date(sortedWindow[0].timestamp);
        
        // Log for debugging
        console.log(`5-hour rolling window: ${windowUsage.length} messages from ${actualSessionStart.toISOString()} to ${now.toISOString()}`);
      } else {
        actualSessionStart = fiveHoursAgo;
      }
    }

    // Use effectiveTotal for usage limit calculations (input + output only)
    const totalTokens = windowUsage.reduce((sum, item) => {
      const itemTokens = item.usage.effectiveTotal || 0;
      return sum + itemTokens;
    }, 0);
    
    // Calculate raw totals for display
    const rawTotals = windowUsage.reduce((totals, item) => ({
      input: totals.input + item.usage.inputTokens,
      output: totals.output + item.usage.outputTokens,
      cacheCreate: totals.cacheCreate + item.usage.cacheCreateTokens,
      cacheRead: totals.cacheRead + item.usage.cacheReadTokens,
      total: totals.total + item.usage.total
    }), { input: 0, output: 0, cacheCreate: 0, cacheRead: 0, total: 0 });

    const byModel = {};
    windowUsage.forEach(item => {
      if (!byModel[item.model]) {
        byModel[item.model] = {
          tokens: 0,
          effectiveTokens: 0,
          messages: 0
        };
      }
      byModel[item.model].tokens += item.usage.total;
      byModel[item.model].effectiveTokens += (item.usage.effectiveTotal || 0);
      byModel[item.model].messages += 1;
    });

    console.log(`${isWeekly ? 'Weekly' : '5-hour'} window:`, {
      messages: windowUsage.length,
      effectiveTokens: totalTokens,
      rawTokens: rawTotals.total
    });

    // Get subscription limits (defaulting to Pro tier)
    const limits = {
      pro: { fiveHourTokens: 19000, weeklyTokens: 304000 },
      max5x: { fiveHourTokens: 88000, weeklyTokens: 1408000 },
      max20x: { fiveHourTokens: 220000, weeklyTokens: 2816000 }
    };
    
    const tierLimits = limits.pro; // Default to pro tier
    const limit = isWeekly ? tierLimits.weeklyTokens : tierLimits.fiveHourTokens;
    
    const resetTime = isWeekly
      ? new Date(actualSessionStart.getTime() + 7 * 24 * 60 * 60 * 1000)
      : new Date(new Date().getTime() + 5 * 60 * 60 * 1000); // Rolling window resets 5 hours from now

    return {
      windowStart: actualSessionStart.toISOString(),
      sessionStart: actualSessionStart,
      totalTokens,  // This is the effective total for limit calculations
      effectiveTotal: totalTokens, // Add this for status bar compatibility
      limit: limit, // Add limit for status bar
      resetTime: resetTime,
      rawTotals,    // Raw token counts for display
      messageCount: windowUsage.length,
      byModel
    };
  }

  async getAllRecentTokenUsage() {
    const allUsage = [];
    
    try {
      // Check if directory exists
      try {
        await fs.access(this.claudeDir);
      } catch {
        return [];
      }

      const projects = await fs.readdir(this.claudeDir);
      
      for (const project of projects) {
        const projectPath = path.join(this.claudeDir, project);
        const stat = await fs.stat(projectPath);
        
        if (stat.isDirectory()) {
          const usage = await this.getProjectRecentUsage(projectPath, project);
          allUsage.push(...usage);
        }
      }

      // Sort by timestamp
      allUsage.sort((a, b) => 
        new Date(b.timestamp) - new Date(a.timestamp)
      );

      return allUsage;
    } catch (error) {
      console.error('Error getting all recent usage:', error);
      return [];
    }
  }

  async getProjectRecentUsage(projectPath, projectName) {
    const usage = [];
    // No date limit - read all available data
    const oldestAllowedDate = new Date(0); // Unix epoch (1970-01-01)
    
    try {
      const files = await fs.readdir(projectPath);
      const jsonlFiles = files.filter(file => file.endsWith('.jsonl'));
      
      // Check files modified in the last 3 days
      for (const file of jsonlFiles) {
        const filePath = path.join(projectPath, file);
        const stat = await fs.stat(filePath);
        
        // Always read JSONL files regardless of modification time
        if (true) {
          const fileUsage = await this.extractRecentUsageFromFile(
            filePath, 
            projectName.replace(/-/g, '/'),
            file.replace('.jsonl', '')
          );
          usage.push(...fileUsage);
        }
      }
      
      return usage;
    } catch (error) {
      console.error(`Error getting project usage for ${projectName}:`, error);
      return [];
    }
  }

  async extractRecentUsageFromFile(filePath, projectName, sessionId) {
    const usage = [];
    // No date limit - read all available data
    
    try {
      const content = await fs.readFile(filePath, 'utf8');
      const lines = content.trim().split('\n');
      
      // Read from the end for recent data
      for (let i = lines.length - 1; i >= 0; i--) {
        try {
          const data = JSON.parse(lines[i]);
          
          // No date limit - process all data
          
          if (data.type === 'assistant' && data.message?.usage) {
            const usageData = data.message.usage;
            const usageItem = {
              timestamp: data.timestamp,
              sessionId,
              projectName,
              model: data.message.model || 'unknown',
              usage: {
                inputTokens: usageData.input_tokens || 0,
                outputTokens: usageData.output_tokens || 0,
                cacheCreateTokens: usageData.cache_creation_input_tokens || 0,
                cacheReadTokens: usageData.cache_read_input_tokens || 0,
                // For limit calculations, only input + output tokens count
                // Cache tokens are excluded from limit calculations
                effectiveTotal: (usageData.input_tokens || 0) + 
                               (usageData.output_tokens || 0),
                total: (usageData.input_tokens || 0) + 
                       (usageData.output_tokens || 0) + 
                       (usageData.cache_creation_input_tokens || 0) + 
                       (usageData.cache_read_input_tokens || 0)
              }
            };
            
            usage.push(usageItem);
          }
        } catch (parseError) {
          // Skip malformed lines
          continue;
        }
      }
      
      return usage;
    } catch (error) {
      console.error(`Error extracting usage from ${filePath}:`, error);
      return [];
    }
  }
}

module.exports = RealtimeMonitor;