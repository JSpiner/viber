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

      // Calculate tokens per minute and trend
      const tokensPerMinute = recentUsage.length > 0
        ? recentUsage.reduce((sum, item) => sum + (item.usage.effectiveTotal || item.usage.total), 0) / 10
        : 0;

      // Determine trend (you might want to compare with previous period)
      const trend = tokensPerMinute > 0 ? 'up' : 'stable';

      return {
        recent: recentUsage,
        hourlyWindow: hourlyWindowData,
        weeklyWindow: weeklyWindowData,
        tokensPerMinute,
        trend
      };
    } catch (error) {
      console.error('Error getting recent usage:', error);
      throw error;
    }
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
    // For 5-hour window, find the actual current session start
    // For weekly window, find the current weekly session start
    const gapHours = isWeekly ? 24 * 7 : 5;
    const actualSessionStart = this.findCurrentSessionStart(allUsage, gapHours);
    
    // Get all usage within the current session
    const windowUsage = allUsage.filter(item => 
      new Date(item.timestamp) >= actualSessionStart
    );

    // Use effectiveTotal for usage limit calculations
    const totalTokens = windowUsage.reduce((sum, item) => 
      sum + (item.usage.effectiveTotal || item.usage.total), 0
    );
    
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
      byModel[item.model].effectiveTokens += (item.usage.effectiveTotal || item.usage.total);
      byModel[item.model].messages += 1;
    });

    console.log(`${isWeekly ? 'Weekly' : '5-hour'} window:`, {
      messages: windowUsage.length,
      effectiveTokens: totalTokens,
      rawTokens: rawTotals.total
    });

    // Get subscription limits (defaulting to Pro tier)
    const limits = {
      pro: { fiveHourTokens: 10000000, weeklyTokens: 20000000 },
      max5x: { fiveHourTokens: 50000000, weeklyTokens: 100000000 },
      max20x: { fiveHourTokens: 200000000, weeklyTokens: 200000000 }
    };
    
    const tierLimits = limits.pro; // Default to pro tier
    const limit = isWeekly ? tierLimits.weeklyTokens : tierLimits.fiveHourTokens;
    
    const now = new Date();
    const resetTime = isWeekly
      ? new Date(actualSessionStart.getTime() + 7 * 24 * 60 * 60 * 1000)
      : new Date(actualSessionStart.getTime() + 5 * 60 * 60 * 1000);

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
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    
    try {
      const files = await fs.readdir(projectPath);
      const jsonlFiles = files.filter(file => file.endsWith('.jsonl'));
      
      // Check files modified in the last 3 days
      for (const file of jsonlFiles) {
        const filePath = path.join(projectPath, file);
        const stat = await fs.stat(filePath);
        
        if (stat.mtime >= threeDaysAgo) {
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
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    
    try {
      const content = await fs.readFile(filePath, 'utf8');
      const lines = content.trim().split('\n');
      
      // Read from the end for recent data
      for (let i = lines.length - 1; i >= 0; i--) {
        try {
          const data = JSON.parse(lines[i]);
          
          // Stop if we've gone too far back
          if (new Date(data.timestamp) < threeDaysAgo) {
            break;
          }
          
          if (data.type === 'assistant' && data.message?.usage) {
            const usageData = data.message.usage;
            usage.push({
              timestamp: data.timestamp,
              sessionId,
              projectName,
              model: data.message.model || 'unknown',
              usage: {
                inputTokens: usageData.input_tokens || 0,
                outputTokens: usageData.output_tokens || 0,
                cacheCreateTokens: usageData.cache_creation_input_tokens || 0,
                cacheReadTokens: usageData.cache_read_input_tokens || 0,
                // Cache read tokens count as 10% (90% discount) toward usage limits
                // Cache create tokens count as 125% (25% more expensive)
                effectiveTotal: (usageData.input_tokens || 0) + 
                               (usageData.output_tokens || 0) + 
                               ((usageData.cache_creation_input_tokens || 0) * 1.25) + 
                               ((usageData.cache_read_input_tokens || 0) * 0.1),
                total: (usageData.input_tokens || 0) + 
                       (usageData.output_tokens || 0) + 
                       (usageData.cache_creation_input_tokens || 0) + 
                       (usageData.cache_read_input_tokens || 0)
              }
            });
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