const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const yaml = require('js-yaml');

class AgentsManager {
  constructor(agentsDirectory = null) {
    this.agentsDir = agentsDirectory || path.join(os.homedir(), '.claude', 'agents');
  }

  async ensureAgentsDirectory() {
    try {
      await fs.access(this.agentsDir);
    } catch (error) {
      await fs.mkdir(this.agentsDir, { recursive: true });
    }
  }

  async loadAgents() {
    await this.ensureAgentsDirectory();
    
    try {
      const files = await fs.readdir(this.agentsDir);
      const agentFiles = files.filter(file => 
        file.endsWith('.yaml') || file.endsWith('.yml') || file.endsWith('.md')
      );

      const agents = [];
      for (const file of agentFiles) {
        try {
          const filePath = path.join(this.agentsDir, file);
          const agent = await this.parseAgentFile(filePath);
          
          if (agent) {
            const stats = await fs.stat(filePath);
            agent.metadata = {
              ...agent.metadata,
              created: stats.birthtime,
              modified: stats.mtime,
              filePath: filePath,
              source: agent.metadata?.source || 'unknown'
            };
            agents.push(agent);
          }
        } catch (error) {
          console.error(`Error loading agent ${file}:`, error);
        }
      }

      return agents.sort((a, b) => a.name.localeCompare(b.name));
    } catch (error) {
      console.error('Error loading agents:', error);
      return [];
    }
  }

  async parseAgentFile(filePath) {
    const content = await fs.readFile(filePath, 'utf8');
    const ext = path.extname(filePath).toLowerCase();

    if (ext === '.yaml' || ext === '.yml') {
      return this.parseYamlAgent(content);
    } else if (ext === '.md') {
      return this.parseMarkdownAgent(content);
    }
    
    return null;
  }

  parseYamlAgent(content) {
    try {
      const agent = yaml.load(content);
      return {
        name: agent.name || 'unnamed',
        description: agent.description || '',
        system_prompt: agent.system_prompt || '',
        tools: agent.tools || [],
        model: agent.model || 'default',
        ...agent,
        metadata: {
          ...(agent.metadata || {}),
          source: agent.metadata?.source || 'unknown'
        }
      };
    } catch (error) {
      console.error('Error parsing YAML agent:', error);
      return null;
    }
  }

  parseMarkdownAgent(content) {
    console.log('AgentsManager.parseMarkdownAgent called with content length:', content.length);
    // Parse source from first line if it matches the pattern
    let source = 'unknown';
    const lines = content.split('\n');
    const firstLine = lines[0]?.trim();
    
    // Check if first line contains source information
    // Pattern: # Source: https://github.com/... (License)
    if (firstLine && firstLine.startsWith('#')) {
      console.log('[AgentsManager] Parsing first line:', firstLine);
      const sourceMatch = firstLine.match(/Source:\s*(.+?)(?:\s*\(|$)/);
      if (sourceMatch) {
        const fullSource = sourceMatch[1].trim();
        console.log('[AgentsManager] Full source extracted:', fullSource);
        
        // Extract repository name from GitHub URL if present
        const githubMatch = fullSource.match(/github\.com\/([^/]+\/[^/]+)/);
        if (githubMatch) {
          source = githubMatch[1];
          console.log('[AgentsManager] GitHub repo extracted:', source);
        } else {
          source = fullSource;
          console.log('[AgentsManager] Using full source:', source);
        }
      } else {
        console.log('[AgentsManager] No source match found');
      }
    } else {
      console.log('[AgentsManager] First line does not start with #');
    }
    
    // Check if the content has YAML frontmatter
    if (content.startsWith('---')) {
      const endOfFrontmatter = content.indexOf('\n---\n', 4);
      if (endOfFrontmatter !== -1) {
        const frontmatterContent = content.substring(4, endOfFrontmatter);
        const bodyContent = content.substring(endOfFrontmatter + 5).trim();
        
        try {
          const frontmatter = yaml.load(frontmatterContent);
          const agentData = {
            name: frontmatter.name || 'unnamed',
            description: frontmatter.description || '',
            system_prompt: bodyContent || '',
            tools: frontmatter.tools || [],
            model: frontmatter.model || 'default',
            ...frontmatter,
            metadata: {
              ...(frontmatter.metadata || {}),
              source: source
            }
          };
          console.log('AgentsManager - Loaded agent:', frontmatter.name, 'from source:', source);
          return agentData;
        } catch (error) {
          console.error('Error parsing YAML frontmatter:', error);
        }
      }
    }
    
    // Fallback to old parsing method for non-frontmatter content
    const agent = {
      name: 'unnamed',
      description: '',
      system_prompt: '',
      tools: [],
      metadata: {
        source: source
      }
    };

    let currentSection = null;
    let sectionContent = [];

    for (const line of lines) {
      if (line.startsWith('# ')) {
        agent.name = line.substring(2).trim();
      } else if (line.startsWith('## ')) {
        if (currentSection && sectionContent.length > 0) {
          this.processMarkdownSection(agent, currentSection, sectionContent);
        }
        currentSection = line.substring(3).trim().toLowerCase();
        sectionContent = [];
      } else if (currentSection) {
        sectionContent.push(line);
      } else if (line.trim() && !agent.description) {
        agent.description = line.trim();
      }
    }

    if (currentSection && sectionContent.length > 0) {
      this.processMarkdownSection(agent, currentSection, sectionContent);
    }

    return agent;
  }

  processMarkdownSection(agent, section, content) {
    const joinedContent = content.join('\n').trim();
    
    if (section === 'system prompt' || section === 'prompt') {
      agent.system_prompt = joinedContent;
    } else if (section === 'tools') {
      agent.tools = content
        .filter(line => line.trim().startsWith('-'))
        .map(line => line.trim().substring(1).trim());
    } else if (section === 'description') {
      agent.description = joinedContent;
    }
  }

  async createAgent(agentData) {
    console.log('AgentsManager.createAgent called with:', JSON.stringify(agentData, null, 2));
    
    await this.ensureAgentsDirectory();
    
    const fileName = `${agentData.name}.md`;
    const filePath = path.join(this.agentsDir, fileName);
    
    console.log('Creating agent file at:', filePath);

    try {
      await fs.access(filePath);
      throw new Error('Agent already exists');
    } catch (error) {
      if (error.message !== 'Agent already exists') {
        // File doesn't exist, we can create it
        // If content is provided (even if empty string), use it directly; otherwise generate from structured data
        const markdownContent = agentData.content !== undefined ? agentData.content : this.generateYamlContent(agentData);
        
        console.log('Writing content to file:');
        console.log('Content length:', markdownContent.length);
        console.log('First 200 chars:', markdownContent.substring(0, 200));
        
        await fs.writeFile(filePath, markdownContent, 'utf8');
        
        // Verify what was written
        const writtenContent = await fs.readFile(filePath, 'utf8');
        console.log('Verified written content length:', writtenContent.length);
        console.log('File successfully created at:', filePath);
        
        return filePath;
      }
      throw error;
    }
  }

  async updateAgent(agentName, agentData) {
    console.log('AgentsManager.updateAgent called');
    console.log('Agent name:', agentName);
    console.log('Agent data:', JSON.stringify(agentData, null, 2));
    
    await this.ensureAgentsDirectory();
    
    const agents = await this.loadAgents();
    const existingAgent = agents.find(a => a.name === agentName);
    
    if (!existingAgent) {
      throw new Error('Agent not found');
    }

    // If content is provided (even if empty string), use it directly; otherwise generate from structured data
    const markdownContent = agentData.content !== undefined ? agentData.content : this.generateYamlContent(agentData);
    
    console.log('Updating agent file at:', existingAgent.metadata.filePath);
    console.log('Content length:', markdownContent.length);
    console.log('First 200 chars:', markdownContent.substring(0, 200));
    
    await fs.writeFile(existingAgent.metadata.filePath, markdownContent, 'utf8');
    
    // Verify what was written
    const writtenContent = await fs.readFile(existingAgent.metadata.filePath, 'utf8');
    console.log('Verified written content length:', writtenContent.length);
    console.log('File successfully updated at:', existingAgent.metadata.filePath);
    
    return existingAgent.metadata.filePath;
  }

  async deleteAgent(agentName) {
    const agents = await this.loadAgents();
    const agent = agents.find(a => a.name === agentName);
    
    if (!agent) {
      throw new Error('Agent not found');
    }

    await fs.unlink(agent.metadata.filePath);
  }

  async cloneAgent(sourceAgentName, targetAgentName) {
    const agents = await this.loadAgents();
    const sourceAgent = agents.find(a => a.name === sourceAgentName);
    
    if (!sourceAgent) {
      throw new Error('Source agent not found');
    }

    const targetExists = agents.some(a => a.name === targetAgentName);
    if (targetExists) {
      throw new Error('Target agent already exists');
    }

    const clonedAgent = {
      ...sourceAgent,
      name: targetAgentName,
      metadata: undefined // Remove metadata as it will be regenerated
    };

    await this.createAgent(clonedAgent);
  }

  generateYamlContent(agentData) {
    console.log('generateYamlContent called with:', JSON.stringify(agentData, null, 2));
    
    // Generate markdown format like agents-gallery
    const frontmatter = {
      name: agentData.name || 'unnamed',
      description: agentData.description || '',
      model: agentData.model || 'default'
    };
    
    // Add tools if present
    if (agentData.tools && agentData.tools.length > 0) {
      frontmatter.tools = agentData.tools;
    }
    
    // Create markdown content
    let content = '---\n';
    content += yaml.dump(frontmatter, {
      lineWidth: -1,
      noRefs: true,
      sortKeys: false
    });
    content += '---\n\n';
    content += agentData.system_prompt || '';
    
    console.log('Generated YAML content:', content);
    
    return content;
  }

  async watchAgentsDirectory(callback) {
    await this.ensureAgentsDirectory();
    
    const watcher = fs.watch(this.agentsDir, async (eventType, filename) => {
      if (filename && (filename.endsWith('.yaml') || filename.endsWith('.yml') || filename.endsWith('.md'))) {
        const agents = await this.loadAgents();
        callback(agents);
      }
    });

    return watcher;
  }
}

module.exports = AgentsManager;