const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const AgentsManager = require('../src/services/agentsManager');

describe('AgentsManager', () => {
  let agentsManager;
  let testAgentsDir;
  
  beforeEach(async () => {
    // Create a temporary test directory
    testAgentsDir = path.join(os.tmpdir(), 'viber-test-agents-' + Date.now());
    await fs.mkdir(testAgentsDir, { recursive: true });
    
    // Create AgentsManager instance with test directory
    agentsManager = new AgentsManager(testAgentsDir);
  });

  afterEach(async () => {
    // Clean up test directory
    await fs.rm(testAgentsDir, { recursive: true, force: true });
  });

  describe('loadAgents', () => {
    it('should return empty array when no agents exist', async () => {
      const agents = await agentsManager.loadAgents();
      expect(agents).toEqual([]);
    });

    it('should load agents from directory', async () => {
      // Create test agent files
      const agent1 = {
        name: 'test-agent-1',
        description: 'Test Agent 1',
        system_prompt: 'You are a test agent',
        tools: ['read_file']
      };
      
      const agent2 = {
        name: 'test-agent-2',
        description: 'Test Agent 2',
        system_prompt: 'You are another test agent',
        tools: ['search_code']
      };

      await fs.writeFile(
        path.join(testAgentsDir, 'test-agent-1.yaml'),
        `name: ${agent1.name}\ndescription: ${agent1.description}\nsystem_prompt: |\n  ${agent1.system_prompt}\ntools:\n  - ${agent1.tools[0]}`
      );
      
      await fs.writeFile(
        path.join(testAgentsDir, 'test-agent-2.yaml'),
        `name: ${agent2.name}\ndescription: ${agent2.description}\nsystem_prompt: |\n  ${agent2.system_prompt}\ntools:\n  - ${agent2.tools[0]}`
      );

      const agents = await agentsManager.loadAgents();
      expect(agents).toHaveLength(2);
      expect(agents[0].name).toBe('test-agent-1');
      expect(agents[1].name).toBe('test-agent-2');
    });

    it('should include file metadata', async () => {
      await fs.writeFile(
        path.join(testAgentsDir, 'test-agent.yaml'),
        'name: test-agent\ndescription: Test Agent'
      );

      const agents = await agentsManager.loadAgents();
      expect(agents[0].metadata).toBeDefined();
      expect(agents[0].metadata.created).toBeDefined();
      expect(agents[0].metadata.modified).toBeDefined();
      expect(agents[0].metadata.filePath).toBe(path.join(testAgentsDir, 'test-agent.yaml'));
    });
  });

  describe('createAgent', () => {
    it('should create a new agent file', async () => {
      const newAgent = {
        name: 'new-agent',
        description: 'A new agent',
        system_prompt: 'You are a new agent',
        tools: ['read_file', 'search_code']
      };

      await agentsManager.createAgent(newAgent);

      const agents = await agentsManager.loadAgents();
      expect(agents).toHaveLength(1);
      expect(agents[0].name).toBe('new-agent');
      expect(agents[0].description).toBe('A new agent');
    });

    it('should throw error if agent already exists', async () => {
      const agent = { name: 'existing-agent', description: 'Existing agent' };
      
      await agentsManager.createAgent(agent);
      
      await expect(agentsManager.createAgent(agent))
        .rejects.toThrow('Agent already exists');
    });
  });

  describe('updateAgent', () => {
    it('should update an existing agent', async () => {
      const originalAgent = {
        name: 'update-test',
        description: 'Original description',
        system_prompt: 'Original prompt',
        tools: ['read_file']
      };

      await agentsManager.createAgent(originalAgent);

      const updatedAgent = {
        ...originalAgent,
        description: 'Updated description',
        tools: ['read_file', 'search_code']
      };

      await agentsManager.updateAgent('update-test', updatedAgent);

      const agents = await agentsManager.loadAgents();
      expect(agents[0].description).toBe('Updated description');
      expect(agents[0].tools).toEqual(['read_file', 'search_code']);
    });

    it('should throw error if agent does not exist', async () => {
      await expect(agentsManager.updateAgent('non-existent', {}))
        .rejects.toThrow('Agent not found');
    });
  });

  describe('deleteAgent', () => {
    it('should delete an existing agent', async () => {
      const agent = { name: 'delete-test', description: 'To be deleted' };
      
      await agentsManager.createAgent(agent);
      let agents = await agentsManager.loadAgents();
      expect(agents).toHaveLength(1);

      await agentsManager.deleteAgent('delete-test');
      agents = await agentsManager.loadAgents();
      expect(agents).toHaveLength(0);
    });

    it('should throw error if agent does not exist', async () => {
      await expect(agentsManager.deleteAgent('non-existent'))
        .rejects.toThrow('Agent not found');
    });
  });

  describe('cloneAgent', () => {
    it('should create a copy of an existing agent', async () => {
      const originalAgent = {
        name: 'original-agent',
        description: 'Original agent',
        system_prompt: 'Original prompt',
        tools: ['read_file']
      };

      await agentsManager.createAgent(originalAgent);
      await agentsManager.cloneAgent('original-agent', 'cloned-agent');

      const agents = await agentsManager.loadAgents();
      expect(agents).toHaveLength(2);
      
      const clonedAgent = agents.find(a => a.name === 'cloned-agent');
      expect(clonedAgent).toBeDefined();
      expect(clonedAgent.description).toBe('Original agent');
      expect(clonedAgent.system_prompt).toBe('Original prompt');
    });

    it('should throw error if source agent does not exist', async () => {
      await expect(agentsManager.cloneAgent('non-existent', 'new-name'))
        .rejects.toThrow('Source agent not found');
    });

    it('should throw error if target agent already exists', async () => {
      const agent1 = { name: 'agent1', description: 'Agent 1' };
      const agent2 = { name: 'agent2', description: 'Agent 2' };
      
      await agentsManager.createAgent(agent1);
      await agentsManager.createAgent(agent2);
      
      await expect(agentsManager.cloneAgent('agent1', 'agent2'))
        .rejects.toThrow('Target agent already exists');
    });
  });

  describe('parseAgentFile', () => {
    it('should parse YAML format', async () => {
      const yamlContent = `name: yaml-agent
description: YAML agent
system_prompt: |
  You are a YAML agent
tools:
  - read_file
  - search_code`;

      await fs.writeFile(path.join(testAgentsDir, 'yaml-agent.yaml'), yamlContent);
      const agent = await agentsManager.parseAgentFile(path.join(testAgentsDir, 'yaml-agent.yaml'));
      
      expect(agent.name).toBe('yaml-agent');
      expect(agent.tools).toEqual(['read_file', 'search_code']);
    });

    it('should parse Markdown format', async () => {
      const mdContent = `# markdown-agent

A Markdown agent

## System Prompt

You are a Markdown agent

## Tools

- read_file
- search_code`;

      await fs.writeFile(path.join(testAgentsDir, 'markdown-agent.md'), mdContent);
      const agent = await agentsManager.parseAgentFile(path.join(testAgentsDir, 'markdown-agent.md'));
      
      expect(agent.name).toBe('markdown-agent');
      expect(agent.description).toBe('A Markdown agent');
    });
  });
});