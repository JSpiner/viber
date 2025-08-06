const DEFAULT_AGENT_TEMPLATE = `---
name: new-agent
description: Brief description of what this agent does
model: default
---

You are an expert assistant specializing in [DOMAIN].

## Focus Areas
- [Primary focus area 1]
- [Primary focus area 2]
- [Primary focus area 3]

## Approach
1. [Step 1 in your approach]
2. [Step 2 in your approach]
3. [Step 3 in your approach]

## Output
- [Expected output type 1]
- [Expected output type 2]
- [Expected output type 3]

[Additional instructions or guidelines]
`;

module.exports = { DEFAULT_AGENT_TEMPLATE };