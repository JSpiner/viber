const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const readline = require('readline');
const { createReadStream } = require('fs');

class JSONLParser {
  constructor() {
    this.claudeDir = path.join(os.homedir(), '.claude', 'projects');
  }

  async scanProjects() {
    try {
      console.log('Scanning directory:', this.claudeDir);
      
      // Check if directory exists
      try {
        await fs.access(this.claudeDir);
      } catch (error) {
        console.error('Claude directory does not exist:', this.claudeDir);
        return [];
      }
      
      const projects = await fs.readdir(this.claudeDir);
      console.log('Found projects:', projects);
      const allSessions = [];

      for (const project of projects) {
        const projectPath = path.join(this.claudeDir, project);
        const stat = await fs.stat(projectPath);
        
        if (stat.isDirectory()) {
          const sessions = await this.scanProjectSessions(projectPath, project);
          allSessions.push(...sessions);
        }
      }

      console.log('Total sessions found:', allSessions.length);
      return allSessions;
    } catch (error) {
      console.error('Error scanning projects:', error);
      return [];
    }
  }

  async scanProjectSessions(projectPath, projectName) {
    try {
      const files = await fs.readdir(projectPath);
      const jsonlFiles = files.filter(file => file.endsWith('.jsonl'));
      
      const sessions = [];
      for (const file of jsonlFiles) {
        const sessionId = file.replace('.jsonl', '');
        sessions.push({
          projectName: projectName.replace(/-/g, '/'),
          sessionId,
          filePath: path.join(projectPath, file)
        });
      }

      return sessions;
    } catch (error) {
      console.error(`Error scanning project ${projectName}:`, error);
      return [];
    }
  }

  async parseSession(filePath) {
    const messages = [];
    
    return new Promise((resolve, reject) => {
      const rl = readline.createInterface({
        input: createReadStream(filePath),
        crlfDelay: Infinity
      });

      rl.on('line', (line) => {
        try {
          const data = JSON.parse(line);
          messages.push(data);
        } catch (error) {
          console.error('Error parsing line:', error);
        }
      });

      rl.on('close', () => {
        resolve(messages);
      });

      rl.on('error', reject);
    });
  }

  extractTokenUsage(messages) {
    const tokenUsage = [];

    for (const message of messages) {
      if (message.type === 'assistant' && message.message?.usage) {
        const usage = message.message.usage;
        const model = message.message.model || 'unknown';
        
        tokenUsage.push({
          timestamp: message.timestamp,
          sessionId: message.sessionId,
          model,
          usage: {
            inputTokens: usage.input_tokens || 0,
            outputTokens: usage.output_tokens || 0,
            cacheCreateTokens: usage.cache_creation_input_tokens || 0,
            cacheReadTokens: usage.cache_read_input_tokens || 0,
            total: (usage.input_tokens || 0) + 
                   (usage.output_tokens || 0) + 
                   (usage.cache_creation_input_tokens || 0) + 
                   (usage.cache_read_input_tokens || 0)
          },
          requestId: message.requestId,
          uuid: message.uuid
        });
      }
    }

    return tokenUsage;
  }

  extractAllUserPrompts(messages) {
    const promptsMap = new Map();
    
    // Build a map of messages by UUID for easy lookup
    const messageMap = {};
    messages.forEach(msg => {
      if (msg.uuid) {
        messageMap[msg.uuid] = msg;
      }
    });
    
    // Find all assistant messages with usage
    messages.forEach(message => {
      if (message.type === 'assistant' && message.message?.usage && message.parentUuid) {
        // Walk up the parent chain to find the originating user message
        let currentUuid = message.parentUuid;
        let userMessage = null;
        let depth = 0;
        const maxDepth = 10; // Prevent infinite loops
        
        while (currentUuid && depth < maxDepth) {
          const parent = messageMap[currentUuid];
          if (!parent) break;
          
          if (parent.type === 'user' && !parent.isMeta && parent.message?.content) {
            const content = parent.message.content;
            let promptText = null;
            
            if (typeof content === 'string') {
              // Skip command-related messages
              if (!content.includes('<command-name>') && 
                  !content.includes('<command-message>') && 
                  !content.includes('<local-command-stdout>') &&
                  !content.includes('Caveat: The messages below were generated')) {
                promptText = content
                  .replace(/<[^>]*>/g, '')
                  .replace(/\n+/g, ' ')
                  .trim();
              }
            } else if (Array.isArray(content)) {
              // Skip tool results
              const hasToolResult = content.some(item => item.type === 'tool_result');
              if (!hasToolResult) {
                for (const item of content) {
                  if (item.type === 'text' && item.text) {
                    promptText = item.text.replace(/\n+/g, ' ').trim();
                    break;
                  }
                }
              }
            }
            
            if (promptText && promptText.length > 0) {
              userMessage = parent;
              break;
            }
          }
          
          currentUuid = parent.parentUuid;
          depth++;
        }
        
        // If we found a user message, aggregate the data
        if (userMessage) {
          const usage = message.message.usage;
          const model = message.message.model || 'unknown';
          const promptText = this.extractTextFromContent(userMessage.message.content);
          
          if (promptText) {
            const promptKey = promptText.substring(0, 200);
            const truncatedPrompt = promptKey + (promptText.length > 200 ? '...' : '');
            
            if (promptsMap.has(promptKey)) {
              // Aggregate tokens for duplicate prompts
              const existing = promptsMap.get(promptKey);
              existing.tokens.input += usage.input_tokens || 0;
              existing.tokens.output += usage.output_tokens || 0;
              existing.tokens.cacheCreate += usage.cache_creation_input_tokens || 0;
              existing.tokens.cacheRead += usage.cache_read_input_tokens || 0;
              existing.tokens.total += (usage.input_tokens || 0) + 
                                      (usage.output_tokens || 0) + 
                                      (usage.cache_creation_input_tokens || 0) + 
                                      (usage.cache_read_input_tokens || 0);
              existing.responseCount++;
              // Update responseTime to the latest
              existing.responseTime = message.timestamp;
            } else {
              // Create new prompt entry
              promptsMap.set(promptKey, {
                prompt: truncatedPrompt,
                timestamp: userMessage.timestamp,
                responseTime: message.timestamp,
                model: model,
                responseCount: 1,
                tokens: {
                  input: usage.input_tokens || 0,
                  output: usage.output_tokens || 0,
                  cacheCreate: usage.cache_creation_input_tokens || 0,
                  cacheRead: usage.cache_read_input_tokens || 0,
                  total: (usage.input_tokens || 0) + 
                         (usage.output_tokens || 0) + 
                         (usage.cache_creation_input_tokens || 0) + 
                         (usage.cache_read_input_tokens || 0)
                }
              });
            }
          }
        }
      }
    });
    
    // Convert map to array and sort by timestamp
    return Array.from(promptsMap.values()).sort((a, b) => 
      new Date(a.timestamp) - new Date(b.timestamp)
    );
  }
  
  extractTextFromContent(content) {
    if (!content) return null;
    
    if (typeof content === 'string') {
      // Skip command-related messages
      if (content.includes('<command-name>') || 
          content.includes('<command-message>') || 
          content.includes('<local-command-stdout>') ||
          content.includes('Caveat: The messages below were generated')) {
        return null;
      }
      
      return content
        .replace(/<[^>]*>/g, '')
        .replace(/\n+/g, ' ')
        .trim();
    } else if (Array.isArray(content)) {
      // Skip tool results
      const hasToolResult = content.some(item => item.type === 'tool_result');
      if (hasToolResult) return null;
      
      for (const item of content) {
        if (item.type === 'text' && item.text) {
          return item.text.replace(/\n+/g, ' ').trim();
        }
      }
    }
    
    return null;
  }

  extractFirstUserPrompt(messages) {
    for (const message of messages) {
      // Skip meta messages and non-user messages
      if (message.type !== 'user' || message.isMeta === true) {
        continue;
      }
      
      if (message.message?.content) {
        const content = message.message.content;
        
        if (typeof content === 'string') {
          // Skip command-related messages
          if (content.includes('<command-name>') || 
              content.includes('<command-message>') || 
              content.includes('<local-command-stdout>') ||
              content.includes('Caveat: The messages below were generated')) {
            continue;
          }
          
          // Clean and return the content
          const cleanContent = content
            .replace(/<[^>]*>/g, '') // Remove XML tags
            .replace(/\n+/g, ' ') // Replace newlines with spaces
            .trim();
          
          if (cleanContent.length > 0) {
            const truncated = cleanContent.substring(0, 100);
            return truncated + (cleanContent.length > 100 ? '...' : '');
          }
        } else if (Array.isArray(content)) {
          // Handle array format (for tool results, etc.)
          for (const item of content) {
            if (item.type === 'text' && item.text) {
              const text = item.text
                .replace(/\n+/g, ' ')
                .trim()
                .substring(0, 100);
              return text + (item.text.length > 100 ? '...' : '');
            }
          }
        }
      }
    }
    
    return 'No prompt found';
  }

  async getAllTokenUsage() {
    const sessions = await this.scanProjects();
    const allTokenUsage = [];
    const sessionPrompts = {};
    const sessionDetails = {};

    for (const session of sessions) {
      try {
        const messages = await this.parseSession(session.filePath);
        const tokenUsage = this.extractTokenUsage(messages);
        
        // Extract first user prompt and all prompts for this session
        const firstPrompt = this.extractFirstUserPrompt(messages);
        const allPrompts = this.extractAllUserPrompts(messages);
        const sessionKey = `${session.sessionId}_${session.projectName}`;
        
        sessionPrompts[sessionKey] = firstPrompt;
        sessionDetails[sessionKey] = allPrompts;
        
        tokenUsage.forEach(usage => {
          usage.projectName = session.projectName;
          usage.firstPrompt = firstPrompt;
        });
        
        allTokenUsage.push(...tokenUsage);
      } catch (error) {
        console.error(`Error processing session ${session.sessionId}:`, error);
      }
    }

    return { tokenUsage: allTokenUsage, sessionPrompts, sessionDetails };
  }
}

module.exports = JSONLParser;