// Agents UI - uses IPC for all backend communication
class AgentsUI {
  constructor() {
    this.currentAgent = null;
    this.isNewAgent = false;
    this.selectedAgentElement = null;
    
    this.initializeElements();
    this.attachEventListeners();
    this.loadAgents();
    this.loadRecommendedAgents();
  }

  initializeElements() {
    console.log('Initializing elements...');
    // List elements
    this.myAgentsList = document.getElementById('agents-my-agents-list');
    this.recommendedAgentsList = document.getElementById('agents-recommended-agents-list');
    this.myAgentsCount = document.getElementById('agents-my-agents-count');
    this.recommendedAgentsCount = document.getElementById('agents-recommended-agents-count');
    this.searchInput = document.getElementById('agents-agent-search');
    
    console.log('Elements found:', {
      myAgentsList: !!this.myAgentsList,
      recommendedAgentsList: !!this.recommendedAgentsList,
      newAgentBtn: !!document.getElementById('agents-new-agent-btn')
    });
    
    // Detail/Editor elements
    this.emptyState = document.getElementById('agents-empty-state');
    this.agentDetail = document.getElementById('agents-agent-detail');
    this.agentPreview = document.getElementById('agents-agent-preview');
    
    // Form elements
    this.agentNameInput = document.getElementById('agents-agent-name');
    this.agentContentInput = document.getElementById('agents-agent-content');
    this.agentSource = document.getElementById('agents-agent-source');
    this.agentModified = document.getElementById('agents-agent-modified');
    
    console.log('Form elements found:', {
      agentNameInput: !!this.agentNameInput,
      agentContentInput: !!this.agentContentInput,
      agentSource: !!this.agentSource,
      agentModified: !!this.agentModified
    });
    
    // Preview elements
    this.previewName = document.getElementById('agents-preview-name');
    this.previewSource = document.getElementById('agents-preview-source');
    this.previewCategory = document.getElementById('agents-preview-category');
    this.previewDescription = document.getElementById('agents-preview-description');
    this.previewPrompt = document.getElementById('agents-preview-prompt');
    this.previewTools = document.getElementById('agents-preview-tools');
    this.previewModel = document.getElementById('agents-preview-model');
    
    // Buttons
    this.newAgentBtn = document.getElementById('agents-new-agent-btn');
    this.saveBtn = document.getElementById('agents-save-btn');
    this.cancelBtn = document.getElementById('agents-cancel-btn');
    this.deleteBtn = document.getElementById('agents-delete-btn');
    this.cloneBtn = document.getElementById('agents-clone-btn');
    this.installBtn = document.getElementById('agents-install-btn');
  }

  attachEventListeners() {
    // Search
    this.searchInput.addEventListener('input', () => this.filterAgents());
    
    // New Agent
    console.log('Attaching click listener to new agent button:', this.newAgentBtn);
    this.newAgentBtn.addEventListener('click', () => {
      console.log('New Agent button clicked');
      this.createNewAgent();
    });
    
    // Save/Cancel
    this.saveBtn.addEventListener('click', () => this.saveAgent());
    this.cancelBtn.addEventListener('click', () => this.cancelEdit());
    
    // Delete/Clone
    this.deleteBtn.addEventListener('click', () => this.deleteAgent());
    this.cloneBtn.addEventListener('click', () => this.cloneAgent());
    
    // Install recommended
    this.installBtn.addEventListener('click', () => this.installRecommendedAgent());
    
    // Auto-save with debounce
    const autoSave = this.debounce(() => {
      if (this.currentAgent && !this.isNewAgent) {
        this.saveAgent();
      }
    }, 2000);
    
    this.agentContentInput.addEventListener('input', autoSave);
    
    // Update name in content when name input changes
    this.agentNameInput.addEventListener('input', () => {
      const newName = this.agentNameInput.value.trim();
      if (newName) {
        this.agentContentInput.value = this.updateNameInContent(this.agentContentInput.value, newName);
      }
    });
  }

  async loadAgents() {
    try {
      console.log('Loading agents via IPC...');
      const result = await window.electronAPI.loadAgents();
      
      if (result.success) {
        console.log('Agents loaded:', result.data);
        this.renderMyAgents(result.data);
      } else {
        console.error('Error loading agents:', result.error);
      }
    } catch (error) {
      console.error('Error loading agents:', error);
    }
  }

  async loadRecommendedAgents() {
    try {
      console.log('Loading recommended agents via IPC...');
      const result = await window.electronAPI.loadRecommendedAgents();
      
      if (result.success) {
        console.log('Recommended agents loaded:', result.data);
        console.log('Number of agents:', result.data ? result.data.length : 0);
        this.renderRecommendedAgents(result.data);
      } else {
        console.error('Error loading recommended agents:', result.error);
      }
    } catch (error) {
      console.error('Error loading recommended agents:', error);
      console.error('Stack trace:', error.stack);
    }
  }

  renderMyAgents(agents) {
    this.myAgentsList.innerHTML = '';
    this.myAgentsCount.textContent = agents.length;
    
    const filteredAgents = this.filterAgentsList(agents);
    
    filteredAgents.forEach(agent => {
      const agentElement = this.createAgentElement(agent, false);
      this.myAgentsList.appendChild(agentElement);
    });
  }

  renderRecommendedAgents(agents) {
    this.recommendedAgentsList.innerHTML = '';
    this.recommendedAgentsCount.textContent = agents.length;
    
    const filteredAgents = this.filterAgentsList(agents);
    
    filteredAgents.forEach(agent => {
      const agentElement = this.createAgentElement(agent, true);
      this.recommendedAgentsList.appendChild(agentElement);
    });
  }

  createAgentElement(agent, isRecommended) {
    const div = document.createElement('div');
    div.className = 'agent-item';
    div.innerHTML = `
      <div class="agent-item-header">
        <span class="agent-item-name">${this.escapeHtml(agent.name)}</span>
        <span class="agent-item-model">${agent.model || 'default'}</span>
      </div>
      <div class="agent-item-description">${this.escapeHtml(agent.description || 'No description')}</div>
    `;
    
    div.addEventListener('click', () => {
      this.selectAgent(agent, div, isRecommended);
    });
    
    return div;
  }

  selectAgent(agent, element, isRecommended) {
    // Update selection
    if (this.selectedAgentElement) {
      this.selectedAgentElement.classList.remove('selected');
    }
    element.classList.add('selected');
    this.selectedAgentElement = element;
    
    // Show appropriate panel
    if (isRecommended) {
      this.showRecommendedAgent(agent);
    } else {
      this.editAgent(agent);
    }
  }

  showRecommendedAgent(agent) {
    this.emptyState.style.display = 'none';
    this.agentDetail.style.display = 'none';
    this.agentPreview.style.display = 'block';
    
    this.previewName.textContent = agent.name;
    this.previewCategory.textContent = agent.category || 'General';
    this.previewDescription.textContent = agent.description || 'No description';
    this.previewPrompt.textContent = agent.system_prompt || 'No system prompt defined';
    this.previewModel.textContent = this.getModelDisplayName(agent.model);
    
    // Render tools
    this.previewTools.innerHTML = '';
    if (agent.tools && agent.tools.length > 0) {
      agent.tools.forEach(tool => {
        const toolTag = document.createElement('div');
        toolTag.className = 'tool-tag';
        toolTag.textContent = tool;
        this.previewTools.appendChild(toolTag);
      });
    } else {
      this.previewTools.innerHTML = '<span style="color: var(--text-secondary)">No tools configured</span>';
    }
    
    this.currentAgent = agent;
  }

  editAgent(agent) {
    this.emptyState.style.display = 'none';
    this.agentPreview.style.display = 'none';
    this.agentDetail.style.display = 'block';
    
    this.currentAgent = agent;
    this.isNewAgent = false;
    
    // Populate form
    this.agentNameInput.value = agent.name || '';
    
    // Generate markdown content from agent data
    let content = '---\n';
    content += `name: ${agent.name || ''}\n`;
    content += `description: ${agent.description || ''}\n`;
    content += `model: ${agent.model || 'default'}\n`;
    if (agent.tools && agent.tools.length > 0) {
      content += 'tools:\n';
      agent.tools.forEach(tool => {
        content += `  - ${tool}\n`;
      });
    }
    content += '---\n\n';
    content += agent.system_prompt || '';
    
    this.agentContentInput.value = content;
    
    // Update metadata
    if (agent.metadata) {
      this.agentSource.textContent = agent.metadata.source || 'Local';
      this.agentModified.textContent = `Modified ${this.formatDate(agent.metadata.modified)}`;
    }
  }

  createNewAgent() {
    console.log('Creating new agent...');
    this.emptyState.style.display = 'none';
    this.agentPreview.style.display = 'none';
    this.agentDetail.style.display = 'block';
    
    this.isNewAgent = true;
    this.currentAgent = {
      name: 'new-agent',
      content: this.getDefaultTemplate()
    };
    
    // Clear form
    this.agentNameInput.value = 'new-agent';
    this.agentContentInput.value = this.getDefaultTemplate();
    this.agentSource.textContent = 'New Agent';
    this.agentModified.textContent = '';
    
    // Verify the values were set
    console.log('After setting default values:');
    console.log('Name input value:', this.agentNameInput.value);
    console.log('Content input value:', this.agentContentInput.value);
    console.log('Content length:', this.agentContentInput.value.length);
    
    // Focus name input
    this.agentNameInput.focus();
  }

  getDefaultTemplate() {
    return `---
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

[Additional instructions or guidelines]`;
  }


  async saveAgent() {
    if (!this.currentAgent) return;
    
    // Get values from form inputs
    const nameInputValue = this.agentNameInput.value;
    const contentInputValue = this.agentContentInput.value;
    
    console.log('saveAgent - Raw input values:', {
      nameInputValue,
      contentInputValue,
      nameLength: nameInputValue.length,
      contentLength: contentInputValue.length
    });
    
    const name = nameInputValue.trim();
    let content = contentInputValue.trim();
    
    console.log('saveAgent - After trim:', {
      name,
      content,
      nameLength: name.length,
      contentLength: content.length
    });
    
    if (!name) {
      alert('Agent name is required');
      return;
    }
    
    // Update the name in the frontmatter to match the input field
    content = this.updateNameInContent(content, name);
    
    console.log('saveAgent - After updateNameInContent:', {
      content,
      contentLength: content.length
    });
    
    // The content should be saved as-is
    const agentData = {
      name: name,
      content: content
    };
    
    console.log('saveAgent - Final agentData:', JSON.stringify(agentData, null, 2));
    
    try {
      let result;
      if (this.isNewAgent) {
        console.log('Creating new agent...');
        result = await window.electronAPI.createAgent(agentData);
      } else {
        console.log('Updating existing agent:', this.currentAgent.name);
        result = await window.electronAPI.updateAgent(this.currentAgent.name, agentData);
      }
      
      console.log('Save result:', result);
      
      if (result.success) {
        await this.loadAgents();
        this.showSuccessMessage('Agent saved successfully');
        // Update current agent name for future saves
        this.currentAgent.name = name;
        this.isNewAgent = false;
      } else {
        alert(`Error saving agent: ${result.error}`);
      }
    } catch (error) {
      console.error('Error saving agent:', error);
      alert(`Error saving agent: ${error.message}`);
    }
  }

  updateNameInContent(content, newName) {
    // Update the name in YAML frontmatter
    const lines = content.split('\n');
    let inFrontmatter = false;
    let frontmatterStart = -1;
    
    for (let i = 0; i < lines.length; i++) {
      if (lines[i] === '---') {
        if (!inFrontmatter) {
          inFrontmatter = true;
          frontmatterStart = i;
        } else {
          // End of frontmatter
          break;
        }
      } else if (inFrontmatter && lines[i].startsWith('name:')) {
        lines[i] = `name: ${newName}`;
      }
    }
    
    return lines.join('\n');
  }

  async deleteAgent() {
    if (!this.currentAgent || this.isNewAgent) return;
    
    if (confirm(`Are you sure you want to delete "${this.currentAgent.name}"?`)) {
      try {
        const result = await window.electronAPI.deleteAgent(this.currentAgent.name);
        
        if (result.success) {
          await this.loadAgents();
          this.showEmptyState();
          this.showSuccessMessage('Agent deleted successfully');
        } else {
          alert(`Error deleting agent: ${result.error}`);
        }
      } catch (error) {
        console.error('Error deleting agent:', error);
        alert(`Error deleting agent: ${error.message}`);
      }
    }
  }

  async cloneAgent() {
    if (!this.currentAgent) return;
    
    const newName = prompt(`Enter name for cloned agent:`, `${this.currentAgent.name}-copy`);
    if (newName && newName.trim()) {
      try {
        const result = await window.electronAPI.cloneAgent(this.currentAgent.name, newName.trim());
        
        if (result.success) {
          await this.loadAgents();
          this.showSuccessMessage('Agent cloned successfully');
        } else {
          alert(`Error cloning agent: ${result.error}`);
        }
      } catch (error) {
        console.error('Error cloning agent:', error);
        alert(`Error cloning agent: ${error.message}`);
      }
    }
  }

  async installRecommendedAgent() {
    if (!this.currentAgent) return;
    
    try {
      // Generate markdown content for the recommended agent
      let content = '---\n';
      content += `name: ${this.currentAgent.name}\n`;
      content += `description: ${this.currentAgent.description || ''}\n`;
      content += `model: ${this.currentAgent.model || 'default'}\n`;
      if (this.currentAgent.tools && this.currentAgent.tools.length > 0) {
        content += 'tools:\n';
        this.currentAgent.tools.forEach(tool => {
          content += `  - ${tool}\n`;
        });
      }
      content += '---\n\n';
      content += this.currentAgent.system_prompt || '';
      
      const agentData = {
        name: this.currentAgent.name,
        content: content
      };
      
      const result = await window.electronAPI.createAgent(agentData);
      
      if (result.success) {
        await this.loadAgents();
        this.showSuccessMessage(`Agent "${this.currentAgent.name}" installed successfully`);
        
        // Switch to edit mode for the newly installed agent
        const agentsResult = await window.electronAPI.loadAgents();
        if (agentsResult.success) {
          const installedAgent = agentsResult.data.find(a => a.name === this.currentAgent.name);
          if (installedAgent) {
            this.editAgent(installedAgent);
          }
        }
      } else {
        alert(`Error installing agent: ${result.error}`);
      }
    } catch (error) {
      console.error('Error installing agent:', error);
      alert(`Error installing agent: ${error.message}`);
    }
  }

  cancelEdit() {
    if (this.isNewAgent || confirm('Discard unsaved changes?')) {
      this.showEmptyState();
    }
  }

  showEmptyState() {
    this.emptyState.style.display = 'flex';
    this.agentDetail.style.display = 'none';
    this.agentPreview.style.display = 'none';
    this.currentAgent = null;
    
    if (this.selectedAgentElement) {
      this.selectedAgentElement.classList.remove('selected');
      this.selectedAgentElement = null;
    }
  }

  filterAgents() {
    this.loadAgents();
    this.loadRecommendedAgents();
  }

  filterAgentsList(agents) {
    const searchTerm = this.searchInput.value.toLowerCase();
    if (!searchTerm) return agents;
    
    return agents.filter(agent => 
      agent.name.toLowerCase().includes(searchTerm) ||
      (agent.description && agent.description.toLowerCase().includes(searchTerm)) ||
      (agent.tools && agent.tools.some(tool => tool.toLowerCase().includes(searchTerm)))
    );
  }

  showSuccessMessage(message) {
    // Could implement a toast notification here
    console.log(message);
  }

  getModelDisplayName(model) {
    const modelNames = {
      'default': 'Default',
      'haiku': 'Haiku (Fast)',
      'sonnet': 'Sonnet (Balanced)',
      'opus': 'Opus (Powerful)'
    };
    return modelNames[model] || model || 'Default';
  }

  formatDate(date) {
    if (!date) return '';
    const d = new Date(date);
    return d.toLocaleDateString();
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }
}

// Initialize when agents tab is shown
window.agentsUI = null;

window.initializeAgentsUI = function() {
  if (!window.agentsUI) {
    console.log('Agents UI initializing...');
    try {
      window.agentsUI = new AgentsUI();
      console.log('Agents UI initialized successfully');
    } catch (error) {
      console.error('Error initializing Agents UI:', error);
      console.error('Stack trace:', error.stack);
    }
  }
};