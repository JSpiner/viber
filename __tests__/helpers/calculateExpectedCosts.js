// Helper to calculate expected costs based on the pricing
const pricing = {
  'claude-opus-4-20250514': {
    input: 0.015,
    output: 0.075,
    cacheCreate: 0.01875,
    cacheRead: 0.00075
  },
  'claude-sonnet-4-20250514': {
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

function calculateCost(usage, model) {
  const p = pricing[model];
  const cost = (usage.inputTokens / 1000) * p.input +
               (usage.outputTokens / 1000) * p.output +
               (usage.cacheCreateTokens / 1000) * p.cacheCreate +
               (usage.cacheReadTokens / 1000) * p.cacheRead;
  return cost;
}

// Calculate for day 2025-07-29 - opus model
const day29Usage = {
  inputTokens: 3800,
  outputTokens: 1900,
  cacheCreateTokens: 4700,
  cacheReadTokens: 7500
};
console.log('Day 29 Opus cost:', calculateCost(day29Usage, 'claude-opus-4-20250514'));

// Calculate for day 2025-07-28 - opus model
const day28OpusUsage = {
  inputTokens: 2700,
  outputTokens: 1400,
  cacheCreateTokens: 3500,
  cacheReadTokens: 5500
};
console.log('Day 28 Opus cost:', calculateCost(day28OpusUsage, 'claude-opus-4-20250514'));

// Calculate for day 2025-07-28 - sonnet model  
const day28SonnetUsage = {
  inputTokens: 800,
  outputTokens: 400,
  cacheCreateTokens: 1000,
  cacheReadTokens: 1500
};
console.log('Day 28 Sonnet cost:', calculateCost(day28SonnetUsage, 'claude-sonnet-4-20250514'));

// Calculate for day 2025-07-30 - haiku model
const day30Usage = {
  inputTokens: 500,
  outputTokens: 250,
  cacheCreateTokens: 600,
  cacheReadTokens: 1000
};
console.log('Day 30 Haiku cost:', calculateCost(day30Usage, 'claude-3-haiku-20240307'));