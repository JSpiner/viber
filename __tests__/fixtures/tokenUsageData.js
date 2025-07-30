const mockTokenUsageData = [
  // Day 1: 2025-07-28 - Multiple models
  {
    timestamp: '2025-07-28T09:15:00.000Z',
    sessionId: 'session-1',
    projectName: '/Users/test/project1',
    model: 'claude-opus-4-20250514',
    usage: {
      inputTokens: 1500,
      outputTokens: 800,
      cacheCreateTokens: 2000,
      cacheReadTokens: 3000,
      total: 7300
    },
    requestId: 'req-1',
    uuid: 'uuid-1'
  },
  {
    timestamp: '2025-07-28T10:30:00.000Z',
    sessionId: 'session-1',
    projectName: '/Users/test/project1',
    model: 'claude-opus-4-20250514',
    usage: {
      inputTokens: 1200,
      outputTokens: 600,
      cacheCreateTokens: 1500,
      cacheReadTokens: 2500,
      total: 5800
    },
    requestId: 'req-2',
    uuid: 'uuid-2'
  },
  {
    timestamp: '2025-07-28T14:20:00.000Z',
    sessionId: 'session-2',
    projectName: '/Users/test/project2',
    model: 'claude-sonnet-4-20250514',
    usage: {
      inputTokens: 800,
      outputTokens: 400,
      cacheCreateTokens: 1000,
      cacheReadTokens: 1500,
      total: 3700
    },
    requestId: 'req-3',
    uuid: 'uuid-3'
  },
  // Day 2: 2025-07-29 - Single model
  {
    timestamp: '2025-07-29T08:00:00.000Z',
    sessionId: 'session-3',
    projectName: '/Users/test/project1',
    model: 'claude-opus-4-20250514',
    usage: {
      inputTokens: 2000,
      outputTokens: 1000,
      cacheCreateTokens: 2500,
      cacheReadTokens: 4000,
      total: 9500
    },
    requestId: 'req-4',
    uuid: 'uuid-4'
  },
  {
    timestamp: '2025-07-29T16:45:00.000Z',
    sessionId: 'session-3',
    projectName: '/Users/test/project1',
    model: 'claude-opus-4-20250514',
    usage: {
      inputTokens: 1800,
      outputTokens: 900,
      cacheCreateTokens: 2200,
      cacheReadTokens: 3500,
      total: 8400
    },
    requestId: 'req-5',
    uuid: 'uuid-5'
  },
  // Day 3: 2025-07-30 - Mixed models and sessions
  {
    timestamp: '2025-07-30T11:00:00.000Z',
    sessionId: 'session-4',
    projectName: '/Users/test/project3',
    model: 'claude-3-haiku-20240307',
    usage: {
      inputTokens: 500,
      outputTokens: 250,
      cacheCreateTokens: 600,
      cacheReadTokens: 1000,
      total: 2350
    },
    requestId: 'req-6',
    uuid: 'uuid-6'
  }
];

const expectedDailyAggregation = [
  {
    date: '2025-07-30',
    models: {
      'claude-3-haiku-20240307': {
        inputTokens: 500,
        outputTokens: 250,
        cacheCreateTokens: 600,
        cacheReadTokens: 1000,
        totalTokens: 2350,
        cost: 0.0006475
      }
    },
    totals: {
      inputTokens: 500,
      outputTokens: 250,
      cacheCreateTokens: 600,
      cacheReadTokens: 1000,
      totalTokens: 2350,
      totalCost: 0.0006475
    }
  },
  {
    date: '2025-07-29',
    models: {
      'claude-opus-4-20250514': {
        inputTokens: 3800,
        outputTokens: 1900,
        cacheCreateTokens: 4700,
        cacheReadTokens: 7500,
        totalTokens: 17900,
        cost: 0.29325
      }
    },
    totals: {
      inputTokens: 3800,
      outputTokens: 1900,
      cacheCreateTokens: 4700,
      cacheReadTokens: 7500,
      totalTokens: 17900,
      totalCost: 0.29325
    }
  },
  {
    date: '2025-07-28',
    models: {
      'claude-opus-4-20250514': {
        inputTokens: 2700,
        outputTokens: 1400,
        cacheCreateTokens: 3500,
        cacheReadTokens: 5500,
        totalTokens: 13100,
        cost: 0.21525
      },
      'claude-sonnet-4-20250514': {
        inputTokens: 800,
        outputTokens: 400,
        cacheCreateTokens: 1000,
        cacheReadTokens: 1500,
        totalTokens: 3700,
        cost: 0.012375
      }
    },
    totals: {
      inputTokens: 3500,
      outputTokens: 1800,
      cacheCreateTokens: 4500,
      cacheReadTokens: 7000,
      totalTokens: 16800,
      totalCost: 0.227625
    }
  }
];

const expectedSessionAggregation = [
  {
    sessionId: 'session-4',
    projectName: '/Users/test/project3',
    startTime: '2025-07-30T11:00:00.000Z',
    endTime: '2025-07-30T11:00:00.000Z',
    duration: '0m',
    messageCount: 1,
    models: {
      'claude-3-haiku-20240307': {
        inputTokens: 500,
        outputTokens: 250,
        cacheCreateTokens: 600,
        cacheReadTokens: 1000,
        totalTokens: 2350,
        cost: 0.0006475
      }
    },
    totals: {
      inputTokens: 500,
      outputTokens: 250,
      cacheCreateTokens: 600,
      cacheReadTokens: 1000,
      totalTokens: 2350,
      totalCost: 0.0006475
    }
  },
  {
    sessionId: 'session-3',
    projectName: '/Users/test/project1',
    startTime: '2025-07-29T08:00:00.000Z',
    endTime: '2025-07-29T16:45:00.000Z',
    duration: '8h 45m',
    messageCount: 2,
    models: {
      'claude-opus-4-20250514': {
        inputTokens: 3800,
        outputTokens: 1900,
        cacheCreateTokens: 4700,
        cacheReadTokens: 7500,
        totalTokens: 17900,
        cost: 0.29325
      }
    },
    totals: {
      inputTokens: 3800,
      outputTokens: 1900,
      cacheCreateTokens: 4700,
      cacheReadTokens: 7500,
      totalTokens: 17900,
      totalCost: 0.29325
    }
  },
  {
    sessionId: 'session-2',
    projectName: '/Users/test/project2',
    startTime: '2025-07-28T14:20:00.000Z',
    endTime: '2025-07-28T14:20:00.000Z',
    duration: '0m',
    messageCount: 1,
    models: {
      'claude-sonnet-4-20250514': {
        inputTokens: 800,
        outputTokens: 400,
        cacheCreateTokens: 1000,
        cacheReadTokens: 1500,
        totalTokens: 3700,
        cost: 0.012375
      }
    },
    totals: {
      inputTokens: 800,
      outputTokens: 400,
      cacheCreateTokens: 1000,
      cacheReadTokens: 1500,
      totalTokens: 3700,
      totalCost: 0.012375
    }
  },
  {
    sessionId: 'session-1',
    projectName: '/Users/test/project1',
    startTime: '2025-07-28T09:15:00.000Z',
    endTime: '2025-07-28T10:30:00.000Z',
    duration: '1h 15m',
    messageCount: 2,
    models: {
      'claude-opus-4-20250514': {
        inputTokens: 2700,
        outputTokens: 1400,
        cacheCreateTokens: 3500,
        cacheReadTokens: 5500,
        totalTokens: 13100,
        cost: 0.21525
      }
    },
    totals: {
      inputTokens: 2700,
      outputTokens: 1400,
      cacheCreateTokens: 3500,
      cacheReadTokens: 5500,
      totalTokens: 13100,
      totalCost: 0.21525
    }
  }
];

module.exports = {
  mockTokenUsageData,
  expectedDailyAggregation,
  expectedSessionAggregation
};