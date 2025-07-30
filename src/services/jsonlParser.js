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

  async getAllTokenUsage() {
    const sessions = await this.scanProjects();
    const allTokenUsage = [];

    for (const session of sessions) {
      try {
        const messages = await this.parseSession(session.filePath);
        const tokenUsage = this.extractTokenUsage(messages);
        
        tokenUsage.forEach(usage => {
          usage.projectName = session.projectName;
        });
        
        allTokenUsage.push(...tokenUsage);
      } catch (error) {
        console.error(`Error processing session ${session.sessionId}:`, error);
      }
    }

    return allTokenUsage;
  }
}

module.exports = JSONLParser;