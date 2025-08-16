const fs = require('fs').promises;
const path = require('path');
const os = require('os');

class RealtimeMonitor {
  constructor(settingsManager = null) {
    this.claudeDir = path.join(os.homedir(), '.claude', 'projects');
    this.settingsManager = settingsManager;
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

      // Get last 12 hours of data for 5-hour window chart
      // If there's recent activity, use 12 hours from now
      // Otherwise, get the most recent 12 hours of data available
      let twelveHourData = [];
      const now = new Date();
      const twelveHoursAgo = new Date(now.getTime() - 12 * 60 * 60 * 1000);
      
      // First try to get data from the last 12 hours
      twelveHourData = allUsage.filter(item => 
        new Date(item.timestamp) >= twelveHoursAgo
      );
      
      // If no data in last 12 hours, get the most recent 12 hours of activity
      if (twelveHourData.length === 0 && allUsage.length > 0) {
        // Sort by timestamp descending
        const sortedUsage = [...allUsage].sort((a, b) => 
          new Date(b.timestamp) - new Date(a.timestamp)
        );
        
        // Get the most recent timestamp
        const mostRecentTime = new Date(sortedUsage[0].timestamp);
        const twelveHoursBeforeRecent = new Date(mostRecentTime.getTime() - 12 * 60 * 60 * 1000);
        
        // Get data from the most recent 12-hour window
        twelveHourData = allUsage.filter(item => {
          const itemTime = new Date(item.timestamp);
          return itemTime >= twelveHoursBeforeRecent && itemTime <= mostRecentTime;
        });
        
        console.log('RealtimeMonitor - Using most recent 12-hour window:', {
          mostRecentTime: mostRecentTime.toISOString(),
          twelveHoursBeforeRecent: twelveHoursBeforeRecent.toISOString(),
          dataCount: twelveHourData.length
        });
      }
      
      console.log('RealtimeMonitor - twelveHourData:', {
        allUsageCount: allUsage.length,
        twelveHourCount: twelveHourData.length,
        twelveHoursAgo: twelveHoursAgo.toISOString(),
        now: now.toISOString(),
        firstItem: twelveHourData[0]?.timestamp,
        lastItem: twelveHourData[twelveHourData.length - 1]?.timestamp
      });

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
        twelveHourData: twelveHourData,
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

  getSubscriptionLimits() {
    return {
      pro: { fiveHourTokens: 38000, weeklyTokens: 608000 },
      max5x: { fiveHourTokens: 176000, weeklyTokens: 2816000 },
      max20x: { fiveHourTokens: 440000, weeklyTokens: 5632000 }
    };
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

  // New function to find session start with 5-hour limit
  findSessionStartWithLimit(allUsage, limitHours = 5, referenceTime = null) {
    const now = referenceTime || new Date();
    
    if (allUsage.length === 0) {
      return null;
    }
    
    // Sort by timestamp (newest first)
    const sortedUsage = [...allUsage].sort((a, b) => 
      new Date(b.timestamp) - new Date(a.timestamp)
    );
    
    // Get the most recent message
    const mostRecent = new Date(sortedUsage[0].timestamp);
    
    // If the most recent message is older than limit hours from reference time, no active session
    const hoursSinceLastActivity = (now - mostRecent) / (1000 * 60 * 60);
    if (hoursSinceLastActivity >= limitHours) {
      return null;
    }
    
    // Find the session start by looking for gaps, working backwards from most recent
    let sessionStart = mostRecent;
    
    // Work backwards through messages to find session boundaries
    for (let i = 0; i < sortedUsage.length - 1; i++) {
      const currentTime = new Date(sortedUsage[i].timestamp);
      const previousTime = new Date(sortedUsage[i + 1].timestamp);
      
      // Check for gap between messages (current is newer, previous is older)
      const gapInHours = (currentTime - previousTime) / (1000 * 60 * 60);
      
      if (gapInHours >= limitHours) {
        // Found a gap! Current session starts at the current message
        sessionStart = currentTime;
        break;
      }
      
      // Update session start to the oldest message we've seen without a gap
      sessionStart = previousTime;
    }
    
    console.log(`Session start with ${limitHours}h limit:`, sessionStart.toISOString());
    return sessionStart;
  }

  calculateWindowUsage(allUsage, windowStart, isWeekly = false) {
    // Get subscription limits based on current tier
    const tier = this.settingsManager?.getSubscriptionTier() || 'pro';
    const limits = this.getSubscriptionLimits()[tier] || this.getSubscriptionLimits()['pro'];
    const defaultLimit = isWeekly ? limits.weeklyTokens : limits.fiveHourTokens;
    
    // Check if there's any recent usage data
    if (allUsage.length === 0) {
      return {
        windowStart: null,
        sessionStart: null,
        totalTokens: 0,
        effectiveTotal: 0,
        limit: defaultLimit,
        resetTime: null,
        rawTotals: { input: 0, output: 0, cacheCreate: 0, cacheRead: 0, total: 0 },
        messageCount: 0,
        byModel: {}
      };
    }

    // Session-based implementation for 5-hour windows
    if (!isWeekly) {
      const sessionStart = this.findSessionStartWithLimit(allUsage, 5);
      
      // If no active session found
      if (!sessionStart) {
        console.log('No active 5-hour session');
        return {
          windowStart: null,
          sessionStart: null,
          totalTokens: 0,
          effectiveTotal: 0,
          limit: defaultLimit,
          resetTime: null,
          rawTotals: { input: 0, output: 0, cacheCreate: 0, cacheRead: 0, total: 0 },
          messageCount: 0,
          byModel: {}
        };
      }
      
      // Calculate session end time (session start + 5 hours)
      const sessionEnd = new Date(sessionStart.getTime() + 5 * 60 * 60 * 1000);
      const now = new Date();
      
      // Check if session has expired
      if (now >= sessionEnd) {
        // Session expired, check for new session
        const messagesAfterExpiry = allUsage.filter(item => 
          new Date(item.timestamp) >= sessionEnd
        );
        
        if (messagesAfterExpiry.length > 0) {
          // Sort messages after expiry by timestamp (oldest first)
          const sortedMessages = [...messagesAfterExpiry].sort((a, b) => 
            new Date(a.timestamp) - new Date(b.timestamp)
          );
          
          // Check if the MOST RECENT message is within 5 hours of now
          const mostRecentMessage = sortedMessages[sortedMessages.length - 1];
          const mostRecentTime = new Date(mostRecentMessage.timestamp);
          const hoursSinceMostRecent = (now - mostRecentTime) / (1000 * 60 * 60);
          
          // If the most recent message is more than 5 hours ago, no active session
          if (hoursSinceMostRecent >= 5) {
            console.log('Session expired, no recent activity within 5 hours');
            return {
              windowStart: null,
              sessionStart: null,
              totalTokens: 0,
              effectiveTotal: 0,
              limit: 38000,
              resetTime: null,
              rawTotals: { input: 0, output: 0, cacheCreate: 0, cacheRead: 0, total: 0 },
              messageCount: 0,
              byModel: {}
            };
          }
          
          // Find the actual session start by working backwards from most recent
          // Start with the oldest message after expiry
          let actualSessionStart = new Date(sortedMessages[0].timestamp);
          
          // Work backwards from most recent to find the last 5-hour gap
          for (let i = sortedMessages.length - 1; i > 0; i--) {
            const currTime = new Date(sortedMessages[i].timestamp);
            const prevTime = new Date(sortedMessages[i - 1].timestamp);
            const gapHours = (currTime - prevTime) / (1000 * 60 * 60);
            
            if (gapHours >= 5) {
              // Found a gap, current session starts at current message
              actualSessionStart = currTime;
              break;
            }
          }
          
          // If the found session start is more than 5 hours ago, use rolling window
          const hoursSinceSessionStart = (now - actualSessionStart) / (1000 * 60 * 60);
          if (hoursSinceSessionStart > 5) {
            // No gap found within 5 hours, use rolling window (current time - 5 hours)
            const fiveHoursAgo = new Date(now.getTime() - 5 * 60 * 60 * 1000);
            
            // Find the first message after 5 hours ago
            let rollingSessionStart = null;
            for (const msg of sortedMessages) {
              const msgTime = new Date(msg.timestamp);
              if (msgTime >= fiveHoursAgo) {
                rollingSessionStart = msgTime;
                break;
              }
            }
            
            if (!rollingSessionStart) {
              // This shouldn't happen since we checked mostRecentTime, but handle gracefully
              console.log('No messages within 5-hour window');
              return {
                windowStart: null,
                sessionStart: null,
                totalTokens: 0,
                effectiveTotal: 0,
                limit: 38000,
                resetTime: null,
                rawTotals: { input: 0, output: 0, cacheCreate: 0, cacheRead: 0, total: 0 },
                messageCount: 0,
                byModel: {}
              };
            }
            
            actualSessionStart = rollingSessionStart;
            console.log(`Using rolling window: session start at ${actualSessionStart.toISOString()}`);
          }
          
          const actualSessionEnd = new Date(actualSessionStart.getTime() + 5 * 60 * 60 * 1000);
          
          // Get messages within the new session
          const windowUsage = allUsage.filter(item => {
            const itemTime = new Date(item.timestamp);
            return itemTime >= actualSessionStart && itemTime < actualSessionEnd;
          });
          
          // Calculate tokens and return
          const totalTokens = windowUsage.reduce((sum, item) => 
            sum + (item.usage.effectiveTotal || 0), 0
          );
          
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
          
          const tier = this.settingsManager?.getSubscriptionTier() || 'pro';
          const limits = this.getSubscriptionLimits()[tier] || this.getSubscriptionLimits()['pro'];
          const limit = limits.fiveHourTokens;
          
          console.log(`New session after expiry: ${actualSessionStart.toISOString()}`);
          
          return {
            windowStart: actualSessionStart.toISOString(),
            sessionStart: actualSessionStart,
            totalTokens,
            effectiveTotal: totalTokens,
            limit: limit,
            resetTime: actualSessionEnd,
            rawTotals,
            messageCount: windowUsage.length,
            byModel
          };
        } else {
          // No new session after expiry
          console.log('Session expired, no new activity');
          return {
            windowStart: null,
            sessionStart: null,
            totalTokens: 0,
            effectiveTotal: 0,
            limit: defaultLimit,
            resetTime: null,
            rawTotals: { input: 0, output: 0, cacheCreate: 0, cacheRead: 0, total: 0 },
            messageCount: 0,
            byModel: {}
          };
        }
      }
      
      // Current session is still active
      const windowUsage = allUsage.filter(item => {
        const itemTime = new Date(item.timestamp);
        return itemTime >= sessionStart && itemTime < sessionEnd;
      });
      
      // Calculate tokens
      const totalTokens = windowUsage.reduce((sum, item) => 
        sum + (item.usage.effectiveTotal || 0), 0
      );
      
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
      
      const tier = this.settingsManager?.getSubscriptionTier() || 'pro';
      const limits = this.getSubscriptionLimits()[tier] || this.getSubscriptionLimits()['pro'];
      const limit = limits.fiveHourTokens;
      
      console.log(`Active session: ${sessionStart.toISOString()} to ${sessionEnd.toISOString()}`);
      console.log(`Tokens used: ${totalTokens} / ${limit}`);
      
      return {
        windowStart: sessionStart.toISOString(),
        sessionStart: sessionStart,
        totalTokens,
        effectiveTotal: totalTokens,
        limit: limit,
        resetTime: sessionEnd,
        rawTotals,
        messageCount: windowUsage.length,
        byModel
      };
    }

    // For weekly window, use the existing weekly calculation
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
          limit: 608000, // Default pro limits
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
      // This branch should never be reached as we handle 5-hour windows above
      console.error('Unexpected code path in calculateWindowUsage');
      return {
        windowStart: null,
        sessionStart: null,
        totalTokens: 0,
        effectiveTotal: 0,
        limit: 19000,
        resetTime: null,
        rawTotals: { input: 0, output: 0, cacheCreate: 0, cacheRead: 0, total: 0 },
        messageCount: 0,
        byModel: {}
      };
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

    // Get subscription limits based on current tier
    const currentTier = this.settingsManager?.getSubscriptionTier() || 'pro';
    const tierLimits = this.getSubscriptionLimits()[currentTier] || this.getSubscriptionLimits()['pro'];
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