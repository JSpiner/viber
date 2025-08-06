class SessionLogManager {
  constructor() {
    this.sessions = [];
    this.currentSession = null;
    this.messages = [];
    this.selectedMessage = null;
    
    this.initializeElements();
    this.attachEventListeners();
    this.loadSessions();
  }

  initializeElements() {
    // Session list elements
    this.sessionsList = document.getElementById('sessions-list');
    this.sessionSearch = document.getElementById('session-search');
    this.sessionSort = document.getElementById('session-sort');
    
    // Message timeline elements
    this.messageTimeline = document.getElementById('message-timeline');
    this.sessionTitle = document.getElementById('session-title');
    
    // Message detail elements
    this.messageDetail = document.getElementById('message-detail');
    this.messageType = document.getElementById('message-type');
    this.messageTime = document.getElementById('message-time');
    this.messageTokens = document.getElementById('message-tokens');
    this.messageContent = document.getElementById('message-content');
    
    // Code diff viewer elements
    this.codeDiffViewer = document.getElementById('code-diff-viewer');
    this.diffContent = document.getElementById('diff-content');
    this.diffViewToggle = document.getElementById('diff-view-toggle');
  }

  attachEventListeners() {
    // Session search
    this.sessionSearch?.addEventListener('input', (e) => {
      this.filterSessions(e.target.value);
    });
    
    // Session sort
    this.sessionSort?.addEventListener('change', (e) => {
      this.sortSessions(e.target.value);
    });
    
    // Diff view toggle
    this.diffViewToggle?.addEventListener('click', () => {
      this.toggleDiffView();
    });
  }

  async loadSessions() {
    try {
      console.log('Loading sessions via IPC...');
      const result = await window.electronAPI.getClaudeSessions();
      
      if (result.success) {
        this.sessions = result.data;
        console.log('Sessions loaded:', this.sessions.length);
        
        // Get summaries for each session
        for (const session of this.sessions) {
          const summaryResult = await this.getSessionSummary(session.filePath);
          session.summary = summaryResult || 'No summary available';
        }
        
        this.renderSessionsList();
      } else {
        console.error('Failed to load sessions:', result.error);
        if (this.sessionsList) {
          this.sessionsList.innerHTML = '<div class="error-message">Error loading sessions. Check console for details.</div>';
        }
      }
    } catch (error) {
      console.error('Error loading sessions:', error);
      if (this.sessionsList) {
        this.sessionsList.innerHTML = '<div class="error-message">Error loading sessions. Check console for details.</div>';
      }
    }
  }

  async getSessionSummary(filePath) {
    try {
      const result = await window.electronAPI.readSessionFile(filePath);
      if (result.success && result.data.summary) {
        return result.data.summary;
      }
    } catch (error) {
      console.error('Error getting session summary:', error);
    }
    return null;
  }

  renderSessionsList() {
    if (!this.sessionsList) {
      console.error('Sessions list element not found');
      return;
    }
    
    if (this.sessions.length === 0) {
      this.sessionsList.innerHTML = '<div class="empty-state"><p>No sessions found</p></div>';
      return;
    }
    
    // Group sessions by date
    const grouped = this.groupSessionsByDate(this.sessions);
    
    this.sessionsList.innerHTML = '';
    
    for (const [group, sessions] of Object.entries(grouped)) {
      const groupEl = document.createElement('div');
      groupEl.className = 'session-group';
      
      const headerEl = document.createElement('div');
      headerEl.className = 'session-group-header';
      headerEl.textContent = group;
      
      const sessionsEl = document.createElement('div');
      sessionsEl.className = 'session-group-items';
      
      sessions.forEach(session => {
        const itemEl = this.createSessionItem(session);
        sessionsEl.appendChild(itemEl);
      });
      
      groupEl.appendChild(headerEl);
      groupEl.appendChild(sessionsEl);
      this.sessionsList.appendChild(groupEl);
    }
  }

  groupSessionsByDate(sessions) {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 7);
    
    const groups = {
      'Today': [],
      'Yesterday': [],
      'This Week': [],
      'This Month': [],
      'Older': []
    };
    
    sessions.forEach(session => {
      const sessionDate = new Date(session.modifiedTime);
      
      if (sessionDate >= today) {
        groups['Today'].push(session);
      } else if (sessionDate >= yesterday) {
        groups['Yesterday'].push(session);
      } else if (sessionDate >= weekAgo) {
        groups['This Week'].push(session);
      } else if (sessionDate.getMonth() === now.getMonth() && sessionDate.getFullYear() === now.getFullYear()) {
        groups['This Month'].push(session);
      } else {
        groups['Older'].push(session);
      }
    });
    
    // Remove empty groups
    Object.keys(groups).forEach(key => {
      if (groups[key].length === 0) delete groups[key];
    });
    
    return groups;
  }

  createSessionItem(session) {
    const itemEl = document.createElement('div');
    itemEl.className = 'session-item';
    itemEl.dataset.sessionId = session.id;
    
    const timeEl = document.createElement('div');
    timeEl.className = 'session-time';
    timeEl.textContent = this.formatTime(session.modifiedTime);
    
    const infoEl = document.createElement('div');
    infoEl.className = 'session-info';
    
    const projectEl = document.createElement('div');
    projectEl.className = 'session-project';
    projectEl.textContent = session.projectName;
    
    const summaryEl = document.createElement('div');
    summaryEl.className = 'session-summary';
    summaryEl.textContent = session.summary;
    
    infoEl.appendChild(projectEl);
    infoEl.appendChild(summaryEl);
    
    itemEl.appendChild(timeEl);
    itemEl.appendChild(infoEl);
    
    itemEl.addEventListener('click', () => this.selectSession(session));
    
    return itemEl;
  }

  formatTime(date) {
    const now = new Date();
    const d = new Date(date);
    const diff = now - d;
    
    // Less than 1 hour
    if (diff < 3600000) {
      const mins = Math.floor(diff / 60000);
      return `${mins}m ago`;
    }
    
    // Today
    if (d.toDateString() === now.toDateString()) {
      return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    }
    
    // This year
    if (d.getFullYear() === now.getFullYear()) {
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
    
    // Older
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  }

  async selectSession(session) {
    this.currentSession = session;
    
    // Update UI
    document.querySelectorAll('.session-item').forEach(el => el.classList.remove('active'));
    document.querySelector(`[data-session-id="${session.id}"]`)?.classList.add('active');
    
    if (this.sessionTitle) {
      this.sessionTitle.textContent = session.id;
    }
    
    // Load messages
    await this.loadMessages(session.filePath);
  }

  async loadMessages(filePath) {
    try {
      const result = await window.electronAPI.readSessionFile(filePath);
      
      if (result.success) {
        this.messages = result.data.messages;
        this.renderMessageTimeline();
      } else {
        console.error('Failed to load messages:', result.error);
        if (this.messageTimeline) {
          this.messageTimeline.innerHTML = '<div class="error-message">Error loading messages</div>';
        }
      }
    } catch (error) {
      console.error('Error loading messages:', error);
    }
  }

  renderMessageTimeline() {
    if (!this.messageTimeline) return;
    
    this.messageTimeline.innerHTML = '';
    
    if (this.messages.length === 0) {
      this.messageTimeline.innerHTML = '<div class="empty-state"><p>No messages in this session</p></div>';
      return;
    }
    
    this.messages.forEach((message, index) => {
      const messageEl = this.createMessageItem(message, index);
      this.messageTimeline.appendChild(messageEl);
    });
  }

  createMessageItem(message, index) {
    const itemEl = document.createElement('div');
    itemEl.className = `message-item ${message.type}`;
    itemEl.dataset.messageIndex = index;
    
    const headerEl = document.createElement('div');
    headerEl.className = 'message-header';
    
    const iconEl = document.createElement('span');
    iconEl.className = 'message-icon';
    iconEl.textContent = message.type === 'user' ? 'U' : 'A';
    
    const timeEl = document.createElement('span');
    timeEl.className = 'message-timestamp';
    timeEl.textContent = new Date(message.timestamp).toLocaleTimeString();
    
    const toolsEl = document.createElement('span');
    toolsEl.className = 'message-tools';
    toolsEl.textContent = this.getToolIcons(message);
    
    headerEl.appendChild(iconEl);
    headerEl.appendChild(timeEl);
    headerEl.appendChild(toolsEl);
    
    const previewEl = document.createElement('div');
    previewEl.className = 'message-preview';
    previewEl.textContent = this.getMessagePreview(message);
    
    itemEl.appendChild(headerEl);
    itemEl.appendChild(previewEl);
    
    itemEl.addEventListener('click', () => this.selectMessage(message, index));
    
    return itemEl;
  }

  getToolIcons(message) {
    if (message.type !== 'assistant' || !message.message?.content) return '';
    
    const tools = [];
    message.message.content.forEach(item => {
      if (item.type === 'tool_use') {
        switch (item.name) {
          case 'Read': tools.push('📖'); break;
          case 'Edit': tools.push('✏️'); break;
          case 'Write': tools.push('📝'); break;
          case 'Bash': tools.push('🖥️'); break;
          case 'TodoWrite': tools.push('✅'); break;
          default: tools.push('🔧');
        }
      }
    });
    
    return tools.join(' ');
  }

  getMessagePreview(message) {
    if (message.type === 'user') {
      const content = message.message?.content;
      if (typeof content === 'string') {
        // Extract command or plain text
        const commandMatch = content.match(/<command-message>(.*?)<\/command-message>/);
        if (commandMatch) {
          return `Command: ${commandMatch[1]}`;
        }
        const stdoutMatch = content.match(/<local-command-stdout>(.*?)<\/local-command-stdout>/s);
        if (stdoutMatch) {
          const output = stdoutMatch[1].trim();
          return output ? `Output: ${output.substring(0, 50)}...` : 'Output: (empty)';
        }
        return content.substring(0, 100) + (content.length > 100 ? '...' : '');
      } else if (Array.isArray(content)) {
        // Handle array content (tool results)
        const toolResult = content.find(item => item.type === 'tool_result');
        if (toolResult) {
          if (toolResult.is_error) {
            return `Error: ${toolResult.content.substring(0, 80)}...`;
          }
          return `Tool Result: ${toolResult.content.substring(0, 80)}...`;
        }
        // If no tool_result, check for other content types
        const textItem = content.find(item => item.type === 'text');
        if (textItem && textItem.content) {
          return textItem.content.substring(0, 100) + (textItem.content.length > 100 ? '...' : '');
        }
        // Log unexpected content structure
        console.log('Unexpected user message content array:', content);
        return 'Array content';
      } else if (content) {
        // Log unexpected content type
        console.log('Unexpected user message content type:', typeof content, content);
        return 'Unknown content type';
      }
    }
    
    if (message.type === 'assistant' && message.message?.content) {
      for (const item of message.message.content) {
        if (item.type === 'text' && item.text) {
          return item.text.substring(0, 100) + (item.text.length > 100 ? '...' : '');
        }
        if (item.type === 'tool_use') {
          return `Using tool: ${item.name}`;
        }
      }
    }
    
    return 'No preview available';
  }

  selectMessage(message, index) {
    this.selectedMessage = message;
    
    // Update UI
    document.querySelectorAll('.message-item').forEach(el => el.classList.remove('active'));
    document.querySelector(`[data-message-index="${index}"]`)?.classList.add('active');
    
    this.renderMessageDetail(message);
  }

  renderMessageDetail(message) {
    if (!this.messageDetail) return;
    
    // Update message metadata
    if (this.messageType) {
      this.messageType.textContent = message.type === 'user' ? 'User' : 'Assistant';
    }
    
    if (this.messageTime) {
      this.messageTime.textContent = new Date(message.timestamp).toLocaleString();
    }
    
    if (this.messageTokens && message.message?.usage) {
      const usage = message.message.usage;
      this.messageTokens.textContent = `${usage.input_tokens || 0} in / ${usage.output_tokens || 0} out`;
    } else if (this.messageTokens) {
      this.messageTokens.textContent = 'N/A';
    }
    
    // Hide empty state and show content
    const emptyState = this.messageDetail.querySelector('.empty-state');
    if (emptyState) {
      emptyState.style.display = 'none';
    }
    
    // Show and render message content
    if (this.messageContent) {
      this.messageContent.style.display = 'block';
      this.messageContent.innerHTML = '';
      
      if (message.type === 'user') {
        this.renderUserMessage(message);
      } else if (message.type === 'assistant' && message.message?.content) {
        this.renderAssistantMessage(message);
      }
    }
  }

  renderUserMessage(message) {
    const content = message.message?.content;
    
    if (typeof content === 'string') {
      // Parse and render special content
      if (content.includes('<command-name>') || content.includes('<local-command-stdout>')) {
        this.renderSpecialContent(content);
      } else {
        const contentEl = document.createElement('div');
        contentEl.className = 'text-content';
        contentEl.textContent = content;
        this.messageContent.appendChild(contentEl);
      }
    } else if (Array.isArray(content)) {
      // Handle array content (tool results)
      content.forEach(item => {
        if (item.type === 'tool_result') {
          this.renderToolResult(item);
        } else if (item.type === 'text') {
          const textEl = document.createElement('div');
          textEl.className = 'text-content';
          textEl.textContent = item.text || item.content || '';
          this.messageContent.appendChild(textEl);
        } else if (item.type === 'image') {
          this.renderImage(item);
        }
      });
    }
    
    // Show additional metadata if available
    if (message.toolUseResult) {
      if (typeof message.toolUseResult === 'string') {
        const metaEl = document.createElement('div');
        metaEl.className = 'message-metadata';
        metaEl.textContent = message.toolUseResult;
        this.messageContent.appendChild(metaEl);
      } else if (typeof message.toolUseResult === 'object') {
        // Check if it's a file creation
        if (message.toolUseResult.type === 'create' && message.toolUseResult.filePath) {
          this.renderFileCreation(message.toolUseResult);
        } else {
          // Handle other object toolUseResult
          const metaEl = document.createElement('div');
          metaEl.className = 'message-metadata';
          const resultEl = document.createElement('pre');
          resultEl.className = 'metadata-object';
          resultEl.textContent = JSON.stringify(message.toolUseResult, null, 2);
          metaEl.appendChild(resultEl);
          this.messageContent.appendChild(metaEl);
        }
      }
    }
  }

  renderAssistantMessage(message) {
    message.message.content.forEach(item => {
      if (item.type === 'text') {
        const textEl = document.createElement('div');
        textEl.className = 'text-content';
        textEl.textContent = item.text;
        this.messageContent.appendChild(textEl);
      } else if (item.type === 'tool_use') {
        const toolEl = this.createToolUseElement(item);
        this.messageContent.appendChild(toolEl);
      }
    });
  }

  renderSpecialContent(content) {
    const container = document.createElement('div');
    container.className = 'special-content';
    
    // Extract command information
    const commandNameMatch = content.match(/<command-name>(.*?)<\/command-name>/);
    const commandMessageMatch = content.match(/<command-message>(.*?)<\/command-message>/);
    const commandArgsMatch = content.match(/<command-args>(.*?)<\/command-args>/);
    const stdoutMatch = content.match(/<local-command-stdout>(.*?)<\/local-command-stdout>/s);
    
    if (commandNameMatch || commandMessageMatch) {
      const commandEl = document.createElement('div');
      commandEl.className = 'command-block';
      
      const headerEl = document.createElement('div');
      headerEl.className = 'command-header';
      headerEl.textContent = '⌘ Command';
      commandEl.appendChild(headerEl);
      
      if (commandNameMatch) {
        const nameEl = document.createElement('div');
        nameEl.className = 'command-name';
        nameEl.textContent = commandNameMatch[1];
        commandEl.appendChild(nameEl);
      }
      
      if (commandArgsMatch && commandArgsMatch[1].trim()) {
        const argsEl = document.createElement('div');
        argsEl.className = 'command-args';
        argsEl.textContent = `Args: ${commandArgsMatch[1]}`;
        commandEl.appendChild(argsEl);
      }
      
      container.appendChild(commandEl);
    }
    
    if (stdoutMatch) {
      const outputEl = document.createElement('div');
      outputEl.className = 'command-output';
      
      const headerEl = document.createElement('div');
      headerEl.className = 'output-header';
      headerEl.textContent = '📤 Output';
      outputEl.appendChild(headerEl);
      
      const contentEl = document.createElement('pre');
      contentEl.className = 'output-content';
      contentEl.textContent = stdoutMatch[1].trim() || '(empty)';
      outputEl.appendChild(contentEl);
      
      container.appendChild(outputEl);
    }
    
    // Add any remaining text
    const plainText = content
      .replace(/<command-name>.*?<\/command-name>/g, '')
      .replace(/<command-message>.*?<\/command-message>/g, '')
      .replace(/<command-args>.*?<\/command-args>/g, '')
      .replace(/<local-command-stdout>.*?<\/local-command-stdout>/gs, '')
      .trim();
    
    if (plainText) {
      const textEl = document.createElement('div');
      textEl.className = 'text-content';
      textEl.textContent = plainText;
      container.appendChild(textEl);
    }
    
    this.messageContent.appendChild(container);
  }

  renderToolResult(result) {
    const resultEl = document.createElement('div');
    resultEl.className = `tool-result ${result.is_error ? 'error' : 'success'}`;
    
    const headerEl = document.createElement('div');
    headerEl.className = 'tool-result-header';
    headerEl.textContent = result.is_error ? '❌ Tool Error' : '✅ Tool Result';
    resultEl.appendChild(headerEl);
    
    const contentEl = document.createElement('pre');
    contentEl.className = 'tool-result-content';
    contentEl.textContent = result.content;
    resultEl.appendChild(contentEl);
    
    if (result.tool_use_id) {
      const idEl = document.createElement('div');
      idEl.className = 'tool-result-id';
      idEl.textContent = `ID: ${result.tool_use_id}`;
      resultEl.appendChild(idEl);
    }
    
    this.messageContent.appendChild(resultEl);
  }

  renderImage(item) {
    const imageEl = document.createElement('div');
    imageEl.className = 'image-content';
    
    const headerEl = document.createElement('div');
    headerEl.className = 'image-header';
    headerEl.textContent = '🖼️ Image';
    imageEl.appendChild(headerEl);
    
    // Note: Actual image rendering would require handling base64 or URLs
    const placeholderEl = document.createElement('div');
    placeholderEl.className = 'image-placeholder';
    placeholderEl.textContent = 'Image content (not rendered)';
    imageEl.appendChild(placeholderEl);
    
    this.messageContent.appendChild(imageEl);
  }

  renderFileCreation(fileData) {
    const fileEl = document.createElement('div');
    fileEl.className = 'file-creation';
    
    const headerEl = document.createElement('div');
    headerEl.className = 'file-header';
    
    const iconEl = document.createElement('span');
    iconEl.className = 'file-icon';
    iconEl.textContent = '📄';
    
    const titleEl = document.createElement('span');
    titleEl.className = 'file-title';
    titleEl.textContent = 'File Created';
    
    headerEl.appendChild(iconEl);
    headerEl.appendChild(titleEl);
    fileEl.appendChild(headerEl);
    
    // File path
    const pathEl = document.createElement('div');
    pathEl.className = 'file-path';
    pathEl.textContent = fileData.filePath;
    fileEl.appendChild(pathEl);
    
    // File content
    if (fileData.content) {
      const contentContainer = document.createElement('div');
      contentContainer.className = 'file-content-container';
      
      const contentHeader = document.createElement('div');
      contentHeader.className = 'file-content-header';
      contentHeader.textContent = 'Content:';
      contentContainer.appendChild(contentHeader);
      
      const contentEl = document.createElement('pre');
      contentEl.className = 'file-content';
      
      // Truncate very long content
      const maxLength = 5000;
      const content = fileData.content;
      if (content.length > maxLength) {
        contentEl.textContent = content.substring(0, maxLength) + '\n\n... (truncated)';
      } else {
        contentEl.textContent = content;
      }
      
      contentContainer.appendChild(contentEl);
      fileEl.appendChild(contentContainer);
    }
    
    this.messageContent.appendChild(fileEl);
  }

  createToolUseElement(toolUse) {
    const toolEl = document.createElement('div');
    toolEl.className = 'tool-use';
    
    const headerEl = document.createElement('div');
    headerEl.className = 'tool-header';
    headerEl.textContent = `Tool: ${toolUse.name}`;
    
    const inputEl = document.createElement('pre');
    inputEl.className = 'tool-input';
    inputEl.textContent = JSON.stringify(toolUse.input, null, 2);
    
    toolEl.appendChild(headerEl);
    toolEl.appendChild(inputEl);
    
    // Add view diff button for Edit operations
    if (toolUse.name === 'Edit' || toolUse.name === 'MultiEdit') {
      const diffBtn = document.createElement('button');
      diffBtn.className = 'view-diff-btn';
      diffBtn.textContent = 'View Diff';
      diffBtn.addEventListener('click', () => this.showCodeDiff(toolUse));
      toolEl.appendChild(diffBtn);
    }
    
    return toolEl;
  }

  showCodeDiff(toolUse) {
    if (!this.codeDiffViewer) return;
    
    this.codeDiffViewer.style.display = 'flex';
    
    // Generate diff content
    if (toolUse.name === 'Edit') {
      this.renderSingleDiff(toolUse.input);
    } else if (toolUse.name === 'MultiEdit') {
      this.renderMultiDiff(toolUse.input);
    }
  }

  renderSingleDiff(input) {
    if (!this.diffContent) return;
    
    const diffEl = document.createElement('div');
    diffEl.className = 'diff-item';
    
    const fileEl = document.createElement('div');
    fileEl.className = 'diff-file';
    fileEl.textContent = input.file_path;
    
    const changesEl = document.createElement('div');
    changesEl.className = 'diff-changes';
    
    // Simple diff display - in real implementation, use a proper diff library
    const oldLines = (input.old_string || '').split('\n');
    const newLines = (input.new_string || '').split('\n');
    
    oldLines.forEach((line, i) => {
      const lineEl = document.createElement('div');
      lineEl.className = 'diff-line removed';
      lineEl.textContent = `- ${line}`;
      changesEl.appendChild(lineEl);
    });
    
    newLines.forEach((line, i) => {
      const lineEl = document.createElement('div');
      lineEl.className = 'diff-line added';
      lineEl.textContent = `+ ${line}`;
      changesEl.appendChild(lineEl);
    });
    
    diffEl.appendChild(fileEl);
    diffEl.appendChild(changesEl);
    
    this.diffContent.innerHTML = '';
    this.diffContent.appendChild(diffEl);
  }

  renderMultiDiff(input) {
    if (!this.diffContent) return;
    
    this.diffContent.innerHTML = '';
    
    if (input.edits) {
      input.edits.forEach(edit => {
        this.renderSingleDiff({
          file_path: input.file_path,
          old_string: edit.old_string,
          new_string: edit.new_string
        });
      });
    }
  }

  toggleDiffView() {
    // Toggle between side-by-side and unified view
    const diffContent = document.getElementById('diff-content');
    if (diffContent) {
      diffContent.classList.toggle('side-by-side');
    }
  }

  filterSessions(searchTerm) {
    const term = searchTerm.toLowerCase();
    const items = document.querySelectorAll('.session-item');
    
    items.forEach(item => {
      const text = item.textContent.toLowerCase();
      item.style.display = text.includes(term) ? '' : 'none';
    });
  }

  sortSessions(sortBy) {
    switch (sortBy) {
      case 'recent':
        this.sessions.sort((a, b) => new Date(b.modifiedTime) - new Date(a.modifiedTime));
        break;
      case 'oldest':
        this.sessions.sort((a, b) => new Date(a.modifiedTime) - new Date(b.modifiedTime));
        break;
      case 'size':
        this.sessions.sort((a, b) => b.size - a.size);
        break;
    }
    
    this.renderSessionsList();
  }
}

// Initialize when the tab is shown
let sessionLogManager = null;

document.addEventListener('DOMContentLoaded', () => {
  // Initialize when session-log tab is clicked
  const sessionLogTab = document.querySelector('[data-tab="session-log"]');
  if (sessionLogTab) {
    sessionLogTab.addEventListener('click', () => {
      if (!sessionLogManager) {
        setTimeout(() => {
          sessionLogManager = new SessionLogManager();
        }, 100);
      }
    });
  }
});

// Export for use in other modules if needed
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { SessionLogManager };
}