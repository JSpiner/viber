class TokenAggregator {
  constructor() {
    this.pricing = {
      'claude-opus-4-20250514': {
        input: 0.015,      // per 1K tokens
        output: 0.075,     // per 1K tokens
        cacheCreate: 0.01875,  // per 1K tokens
        cacheRead: 0.00075    // per 1K tokens
      },
      'claude-sonnet-4-20250514': {
        input: 0.003,
        output: 0.015,
        cacheCreate: 0.00375,
        cacheRead: 0.00015
      },
      'claude-3-opus-20240229': {
        input: 0.015,
        output: 0.075,
        cacheCreate: 0.01875,
        cacheRead: 0.00075
      },
      'claude-3-sonnet-20240229': {
        input: 0.003,
        output: 0.015,
        cacheCreate: 0.00375,
        cacheRead: 0.00015
      },
      'claude-3-haiku-20240307': {
        input: 0.00025,
        output: 0.00125,
        cacheCreate: 0.0003,
        cacheRead: 0.00003
      }
    };
  }

  calculateCost(usage, model) {
    const pricing = this.pricing[model] || this.pricing['claude-3-sonnet-20240229'];
    
    // Ensure all values are numbers to prevent NaN
    const inputTokens = usage.inputTokens || 0;
    const outputTokens = usage.outputTokens || 0;
    const cacheCreateTokens = usage.cacheCreateTokens || 0;
    const cacheReadTokens = usage.cacheReadTokens || 0;
    
    const cost = {
      input: (inputTokens / 1000) * pricing.input,
      output: (outputTokens / 1000) * pricing.output,
      cacheCreate: (cacheCreateTokens / 1000) * pricing.cacheCreate,
      cacheRead: (cacheReadTokens / 1000) * pricing.cacheRead
    };
    
    // Ensure total is not NaN
    cost.total = (cost.input || 0) + (cost.output || 0) + (cost.cacheCreate || 0) + (cost.cacheRead || 0);
    
    return cost;
  }

  aggregateByDay(tokenUsageData) {
    const dailyUsage = {};

    tokenUsageData.forEach(entry => {
      // Convert to local date string (YYYY-MM-DD) using system timezone
      const localDate = new Date(entry.timestamp);
      const year = localDate.getFullYear();
      const month = String(localDate.getMonth() + 1).padStart(2, '0');
      const day = String(localDate.getDate()).padStart(2, '0');
      const date = `${year}-${month}-${day}`;
      
      if (!dailyUsage[date]) {
        dailyUsage[date] = {
          date,
          models: {},
          totals: {
            inputTokens: 0,
            outputTokens: 0,
            cacheCreateTokens: 0,
            cacheReadTokens: 0,
            totalTokens: 0,
            totalCost: 0
          }
        };
      }

      if (!dailyUsage[date].models[entry.model]) {
        dailyUsage[date].models[entry.model] = {
          inputTokens: 0,
          outputTokens: 0,
          cacheCreateTokens: 0,
          cacheReadTokens: 0,
          totalTokens: 0,
          cost: 0
        };
      }

      const modelUsage = dailyUsage[date].models[entry.model];
      modelUsage.inputTokens += entry.usage.inputTokens;
      modelUsage.outputTokens += entry.usage.outputTokens;
      modelUsage.cacheCreateTokens += entry.usage.cacheCreateTokens;
      modelUsage.cacheReadTokens += entry.usage.cacheReadTokens;
      modelUsage.totalTokens += entry.usage.total;

      const cost = this.calculateCost(entry.usage, entry.model);
      modelUsage.cost += cost.total;

      dailyUsage[date].totals.inputTokens += entry.usage.inputTokens;
      dailyUsage[date].totals.outputTokens += entry.usage.outputTokens;
      dailyUsage[date].totals.cacheCreateTokens += entry.usage.cacheCreateTokens;
      dailyUsage[date].totals.cacheReadTokens += entry.usage.cacheReadTokens;
      dailyUsage[date].totals.totalTokens += entry.usage.total;
      dailyUsage[date].totals.totalCost += cost.total;
    });

    return Object.values(dailyUsage).sort((a, b) => b.date.localeCompare(a.date));
  }

  aggregateBySession(tokenUsageData, sessionPrompts = {}, sessionDetails = {}) {
    const sessionUsage = {};

    tokenUsageData.forEach(entry => {
      const key = `${entry.sessionId}_${entry.projectName}`;
      
      if (!sessionUsage[key]) {
        sessionUsage[key] = {
          sessionId: entry.sessionId,
          projectName: entry.projectName,
          firstPrompt: sessionPrompts[key] || entry.firstPrompt || 'No prompt found',
          prompts: sessionDetails[key] || [],
          timestamps: [],
          models: {},
          totals: {
            inputTokens: 0,
            outputTokens: 0,
            cacheCreateTokens: 0,
            cacheReadTokens: 0,
            totalTokens: 0,
            totalCost: 0
          },
          messageCount: 0
        };
      }

      sessionUsage[key].timestamps.push(entry.timestamp);
      sessionUsage[key].messageCount++;

      if (!sessionUsage[key].models[entry.model]) {
        sessionUsage[key].models[entry.model] = {
          inputTokens: 0,
          outputTokens: 0,
          cacheCreateTokens: 0,
          cacheReadTokens: 0,
          totalTokens: 0,
          cost: 0
        };
      }

      const modelUsage = sessionUsage[key].models[entry.model];
      modelUsage.inputTokens += entry.usage.inputTokens;
      modelUsage.outputTokens += entry.usage.outputTokens;
      modelUsage.cacheCreateTokens += entry.usage.cacheCreateTokens;
      modelUsage.cacheReadTokens += entry.usage.cacheReadTokens;
      modelUsage.totalTokens += entry.usage.total;

      const cost = this.calculateCost(entry.usage, entry.model);
      modelUsage.cost += cost.total;

      sessionUsage[key].totals.inputTokens += entry.usage.inputTokens;
      sessionUsage[key].totals.outputTokens += entry.usage.outputTokens;
      sessionUsage[key].totals.cacheCreateTokens += entry.usage.cacheCreateTokens;
      sessionUsage[key].totals.cacheReadTokens += entry.usage.cacheReadTokens;
      sessionUsage[key].totals.totalTokens += entry.usage.total;
      sessionUsage[key].totals.totalCost += cost.total;
    });

    // Calculate duration and sort timestamps
    Object.values(sessionUsage).forEach(session => {
      session.timestamps.sort();
      session.startTime = session.timestamps[0];
      session.endTime = session.timestamps[session.timestamps.length - 1];
      
      const duration = new Date(session.endTime) - new Date(session.startTime);
      session.duration = this.formatDuration(duration);
      
      delete session.timestamps;
      
      // Calculate cost for each prompt
      if (session.prompts && session.prompts.length > 0) {
        session.prompts = session.prompts.map(prompt => {
          // Convert tokens format to match calculateCost expectations
          const usageFormat = {
            inputTokens: prompt.tokens.input || 0,
            outputTokens: prompt.tokens.output || 0,
            cacheCreateTokens: prompt.tokens.cacheCreate || 0,
            cacheReadTokens: prompt.tokens.cacheRead || 0
          };
          const cost = this.calculateCost(usageFormat, prompt.model);
          const duration = new Date(prompt.responseTime) - new Date(prompt.timestamp);
          return {
            ...prompt,
            cost: cost.total || 0,
            duration: this.formatDuration(duration)
          };
        });
      }
    });

    return Object.values(sessionUsage).sort((a, b) => 
      new Date(b.startTime) - new Date(a.startTime)
    );
  }

  formatDuration(milliseconds) {
    const hours = Math.floor(milliseconds / (1000 * 60 * 60));
    const minutes = Math.floor((milliseconds % (1000 * 60 * 60)) / (1000 * 60));
    
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  }

  filterByDateRange(data, startDate, endDate) {
    // Parse dates as local dates (not UTC)
    const start = new Date(startDate + 'T00:00:00');
    const end = new Date(endDate + 'T23:59:59.999');

    return data.filter(item => {
      // For daily data, compare date strings directly
      if (item.date) {
        return item.date >= startDate && item.date <= endDate;
      }
      
      // For session data, use timestamp comparison
      const itemDate = new Date(item.startTime);
      return itemDate >= start && itemDate <= end;
    });
  }
}

module.exports = TokenAggregator;