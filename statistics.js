// Statistics Manager for browser environment
class StatisticsManager {
  constructor() {
    this.tokenData = [];
    this.currentView = 'daily';
    this.dailyChart = null;
    this.timelineChart = null;
    this.concurrentChart = null;
    
    this.initializeEventListeners();
    this.initializeDateInputs();
  }

  // Helper function to extract project name from various path formats
  extractProjectName(fullProjectName) {
    if (!fullProjectName) return 'Unknown';
    
    const trimmed = fullProjectName.trim();
    
    // First, normalize the path format
    // Convert dash-separated format to slash-separated
    let normalizedPath = trimmed;
    if (trimmed.startsWith('-')) {
      // Format: -Users-jspiner-src-projectname
      // Convert to: /Users/jspiner/src/projectname
      normalizedPath = '/' + trimmed.substring(1).replace(/-/g, '/');
    }
    
    // Now process the normalized path
    if (normalizedPath.includes('/')) {
      // Format: /Users/jspiner/src/projectname or /Users/jspiner/projectname
      // Split by '/' and skip first 3 parts (/Users/jspiner)
      const parts = normalizedPath.split('/').filter(p => p); // filter removes empty strings
      if (parts.length >= 3) {
        // Remove 'Users' and 'jspiner', keep everything else
        const projectPath = parts.slice(2).join('/');
        
        // Special handling: if the project is just 'viber' without 'src', add 'src' prefix
        // This consolidates /Users/jspiner/viber and /Users/jspiner/src/viber
        if (projectPath === 'viber') {
          return 'src/viber';
        }
        
        return projectPath;
      } else if (parts.length > 0) {
        // If less than 3 parts, return the last part
        return parts[parts.length - 1];
      }
    }
    
    // Unknown format, use as-is
    return trimmed;
  }

  initializeEventListeners() {
    // View toggle - use event delegation on the parent container
    const viewToggle = document.querySelector('.view-toggle');
    if (viewToggle) {
      viewToggle.addEventListener('click', (e) => {
        const button = e.target.closest('.toggle-btn');
        if (button) {
          const view = button.getAttribute('data-view');
          this.switchView(view);
        }
      });
    }

    // Date range change
    const startDate = document.getElementById('startDate');
    const endDate = document.getElementById('endDate');
    
    if (startDate && endDate) {
      startDate.addEventListener('change', () => this.applyDateFilter());
      endDate.addEventListener('change', () => this.applyDateFilter());
    }
  }

  initializeDateInputs() {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);

    // Format dates as YYYY-MM-DD in local timezone
    const formatDate = (date) => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    document.getElementById('startDate').value = formatDate(startDate);
    document.getElementById('endDate').value = formatDate(endDate);
  }

  async loadStatistics() {
    console.log('loadStatistics called');
    try {
      // Show loading state
      this.showLoading();
      
      // Load token data through Electron IPC
      console.log('Calling electronAPI.loadTokenUsage...');
      const result = await window.electronAPI.loadTokenUsage();
      console.log('Result received:', result);
      
      if (result.success) {
        this.rawData = result.data.raw;
        this.dailyData = result.data.daily;
        this.sessionData = result.data.sessions;
        
        console.log('Data loaded:', {
          raw: this.rawData.length,
          daily: this.dailyData.length,
          sessions: this.sessionData.length
        });
        
        // Apply date filter and render
        this.applyDateFilter();
        this.hideLoading();
      } else {
        console.error('Load failed:', result.error);
        this.showError(result.error || 'Failed to load statistics');
        this.hideLoading();
      }
    } catch (error) {
      console.error('Error loading statistics:', error);
      this.showError('Failed to load statistics: ' + error.message);
      this.hideLoading();
    }
  }

  applyDateFilter() {
    const startDate = document.getElementById('startDate').value;
    const endDate = document.getElementById('endDate').value;

    if (!startDate || !endDate || !this.dailyData || !this.sessionData) return;

    if (this.currentView === 'daily') {
      const filteredData = this.filterByDateRange(this.dailyData, startDate, endDate);
      this.renderDailyView(filteredData);
    } else {
      const filteredData = this.filterByDateRange(this.sessionData, startDate, endDate);
      this.renderSessionView(filteredData);
    }

    this.updateSummaryCards(this.rawData, startDate, endDate);
  }

  filterByDateRange(data, startDate, endDate) {
    return data.filter(item => {
      // For daily data, compare date strings directly
      if (item.date) {
        return item.date >= startDate && item.date <= endDate;
      }
      
      // For session data, compare using local date
      const itemDate = new Date(item.startTime);
      const year = itemDate.getFullYear();
      const month = String(itemDate.getMonth() + 1).padStart(2, '0');
      const day = String(itemDate.getDate()).padStart(2, '0');
      const itemDateStr = `${year}-${month}-${day}`;
      
      return itemDateStr >= startDate && itemDateStr <= endDate;
    });
  }

  switchView(view) {
    this.currentView = view;

    // Update toggle buttons
    document.querySelectorAll('.toggle-btn').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-view') === view);
    });

    // Update view content
    document.querySelectorAll('.view-content').forEach(content => {
      content.classList.remove('active');
    });

    if (view === 'daily') {
      document.getElementById('dailyView').classList.add('active');
    } else {
      document.getElementById('sessionView').classList.add('active');
    }

    this.applyDateFilter();
  }

  updateSummaryCards(data, startDate, endDate) {
    if (!data) return;

    const filteredData = data.filter(item => {
      const itemDate = new Date(item.timestamp);
      const itemDateStr = `${itemDate.getFullYear()}-${String(itemDate.getMonth() + 1).padStart(2, '0')}-${String(itemDate.getDate()).padStart(2, '0')}`;
      return itemDateStr >= startDate && itemDateStr <= endDate;
    });

    let totalTokens = 0;
    let totalCost = 0;
    const modelCounts = {};

    filteredData.forEach(item => {
      totalTokens += item.usage.total;
      const cost = this.calculateCost(item.usage, item.model);
      totalCost += cost.total;
      
      modelCounts[item.model] = (modelCounts[item.model] || 0) + 1;
    });

    const mostUsedModel = Object.entries(modelCounts)
      .sort((a, b) => b[1] - a[1])[0];

    document.getElementById('totalTokens').textContent = totalTokens.toLocaleString();
    document.getElementById('totalCost').textContent = `$${totalCost.toFixed(2)}`;
    document.getElementById('mostUsedModel').textContent = mostUsedModel ? 
      mostUsedModel[0].replace('claude-', '').replace('-20240229', '').replace('-20250514', '') : '-';
  }

  calculateCost(usage, model) {
    const pricing = {
      'claude-opus-4-20250514': {
        input: 0.015, output: 0.075, cacheCreate: 0.01875, cacheRead: 0.00075
      },
      'claude-sonnet-4-20250514': {
        input: 0.003, output: 0.015, cacheCreate: 0.00375, cacheRead: 0.00015
      },
      'claude-3-opus-20240229': {
        input: 0.015, output: 0.075, cacheCreate: 0.01875, cacheRead: 0.00075
      },
      'claude-3-sonnet-20240229': {
        input: 0.003, output: 0.015, cacheCreate: 0.00375, cacheRead: 0.00015
      },
      'claude-3-haiku-20240307': {
        input: 0.00025, output: 0.00125, cacheCreate: 0.0003, cacheRead: 0.00003
      }
    };

    const p = pricing[model] || pricing['claude-3-sonnet-20240229'];
    
    const cost = {
      input: (usage.inputTokens / 1000) * p.input,
      output: (usage.outputTokens / 1000) * p.output,
      cacheCreate: (usage.cacheCreateTokens / 1000) * p.cacheCreate,
      cacheRead: (usage.cacheReadTokens / 1000) * p.cacheRead
    };
    
    cost.total = cost.input + cost.output + cost.cacheCreate + cost.cacheRead;
    
    return cost;
  }

  renderDailyView(dailyData) {
    // Prepare chart data
    const labels = dailyData.map(d => {
      const date = new Date(d.date);
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }).reverse();

    const datasets = [];
    const modelColors = {
      'claude-opus-4-20250514': '#0e639c',
      'claude-sonnet-4-20250514': '#1e9c6c',
      'claude-3-opus-20240229': '#0e639c',
      'claude-3-sonnet-20240229': '#1e9c6c',
      'claude-3-haiku-20240307': '#9c5e0e'
    };

    // Get all unique models
    const allModels = new Set();
    dailyData.forEach(day => {
      Object.keys(day.models).forEach(model => allModels.add(model));
    });

    // Create dataset for each model
    allModels.forEach(model => {
      const data = dailyData.map(day => day.models[model]?.totalTokens || 0).reverse();
      
      datasets.push({
        label: model.replace('claude-', '').replace('-20240229', '').replace('-20250514', ''),
        data: data,
        backgroundColor: modelColors[model] || '#666',
        borderColor: modelColors[model] || '#666',
        borderWidth: 2
      });
    });

    // Update chart
    const ctx = document.getElementById('dailyChart').getContext('2d');
    
    if (this.dailyChart) {
      this.dailyChart.destroy();
    }

    this.dailyChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: datasets
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            stacked: true,
            grid: {
              color: '#3a3a3c'
            },
            ticks: {
              color: '#969696'
            }
          },
          y: {
            stacked: true,
            grid: {
              color: '#3a3a3c'
            },
            ticks: {
              color: '#969696',
              callback: function(value) {
                return value.toLocaleString();
              }
            }
          }
        },
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              color: '#cccccc',
              padding: 20
            }
          },
          tooltip: {
            callbacks: {
              label: function(context) {
                return context.dataset.label + ': ' + context.parsed.y.toLocaleString() + ' tokens';
              }
            }
          }
        }
      }
    });

    // Render daily details
    this.renderDailyDetails(dailyData);
  }

  renderDailyDetails(dailyData) {
    const detailsContainer = document.getElementById('dailyDetails');
    
    // Get all unique models across all days
    const allModels = new Set();
    dailyData.forEach(day => {
      Object.keys(day.models).forEach(model => allModels.add(model));
    });
    
    // Create table headers for models
    const modelHeaders = Array.from(allModels).map(model => 
      `<th class="model-header">${model.replace('claude-', '').replace('-20240229', '').replace('-20250514', '')}</th>`
    ).join('');
    
    // Create table rows - show all data without limit
    const rows = dailyData.map(day => {
      const date = day.date; // Already in YYYY-MM-DD format
      
      // Calculate model percentages
      const modelCells = Array.from(allModels).map(model => {
        const usage = day.models[model];
        if (!usage) {
          return '<td class="token-cell">-</td>';
        }
        
        const percentage = ((usage.totalTokens / day.totals.totalTokens) * 100).toFixed(1);
        return `
          <td class="token-cell">
            <div class="cell-tokens">${usage.totalTokens.toLocaleString()}</div>
            <div class="cell-percentage">${percentage}%</div>
          </td>
        `;
      }).join('');
      
      // Calculate individual token costs
      const inputCost = this.calculateTokenTypeCost(day, 'input');
      const outputCost = this.calculateTokenTypeCost(day, 'output');
      const cacheCreateCost = this.calculateTokenTypeCost(day, 'cacheCreate');
      const cacheReadCost = this.calculateTokenTypeCost(day, 'cacheRead');
      
      return `
        <tr>
          <td class="date-cell">${date}</td>
          ${modelCells}
          <td class="token-cell">
            <div class="cell-tokens">${day.totals.inputTokens.toLocaleString()}</div>
            <div class="cell-cost">$${inputCost.toFixed(4)}</div>
          </td>
          <td class="token-cell">
            <div class="cell-tokens">${day.totals.outputTokens.toLocaleString()}</div>
            <div class="cell-cost">$${outputCost.toFixed(4)}</div>
          </td>
          <td class="token-cell">
            <div class="cell-tokens">${day.totals.cacheCreateTokens.toLocaleString()}</div>
            <div class="cell-cost">$${cacheCreateCost.toFixed(4)}</div>
          </td>
          <td class="token-cell">
            <div class="cell-tokens">${day.totals.cacheReadTokens.toLocaleString()}</div>
            <div class="cell-cost">$${cacheReadCost.toFixed(4)}</div>
          </td>
          <td class="total-cell">
            <div class="cell-tokens">${day.totals.totalTokens.toLocaleString()}</div>
            <div class="cell-cost">$${day.totals.totalCost.toFixed(4)}</div>
          </td>
        </tr>
      `;
    }).join('');

    detailsContainer.innerHTML = `
      <h3>Recent Daily Usage</h3>
      <div class="table-wrapper">
        <table class="daily-usage-table">
          <thead>
            <tr>
              <th class="date-header">Date</th>
              ${modelHeaders}
              <th class="token-type-header">Input</th>
              <th class="token-type-header">Output</th>
              <th class="token-type-header">Cache Create</th>
              <th class="token-type-header">Cache Read</th>
              <th class="total-header">Total Tokens</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      </div>
    `;
  }

  // Helper method to calculate cost for specific token type
  calculateTokenTypeCost(day, tokenType) {
    let totalCost = 0;
    
    Object.entries(day.models).forEach(([model, usage]) => {
      const pricing = this.getPricing(model);
      const tokens = usage[`${tokenType}Tokens`];
      
      if (tokenType === 'input') {
        totalCost += (tokens / 1000) * pricing.input;
      } else if (tokenType === 'output') {
        totalCost += (tokens / 1000) * pricing.output;
      } else if (tokenType === 'cacheCreate') {
        totalCost += (tokens / 1000) * pricing.cacheCreate;
      } else if (tokenType === 'cacheRead') {
        totalCost += (tokens / 1000) * pricing.cacheRead;
      }
    });
    
    return totalCost;
  }

  // Helper method to get pricing for a model
  getPricing(model) {
    const pricing = {
      'claude-opus-4-20250514': {
        input: 0.015, output: 0.075, cacheCreate: 0.01875, cacheRead: 0.00075
      },
      'claude-sonnet-4-20250514': {
        input: 0.003, output: 0.015, cacheCreate: 0.00375, cacheRead: 0.00015
      },
      'claude-3-opus-20240229': {
        input: 0.015, output: 0.075, cacheCreate: 0.01875, cacheRead: 0.00075
      },
      'claude-3-sonnet-20240229': {
        input: 0.003, output: 0.015, cacheCreate: 0.00375, cacheRead: 0.00015
      },
      'claude-3-haiku-20240307': {
        input: 0.00025, output: 0.00125, cacheCreate: 0.0003, cacheRead: 0.00003
      }
    };
    
    return pricing[model] || pricing['claude-3-sonnet-20240229'];
  }

  calculateConcurrentSessions(sessionData, filterStartDate, filterEndDate) {
    // Use provided dates or get from filter inputs
    if (!filterStartDate || !filterEndDate) {
      const startDateStr = document.getElementById('startDate').value;
      const endDateStr = document.getElementById('endDate').value;
      
      filterStartDate = new Date(startDateStr);
      filterStartDate.setHours(0, 0, 0, 0);
      
      filterEndDate = new Date(endDateStr);
      filterEndDate.setHours(23, 59, 59, 999);
    }

    // Create time points every 2 minutes within the filtered date range for smoother curve
    const timePoints = [];
    const intervalMs = 2 * 60 * 1000; // 2 minutes for many more data points
    
    for (let time = filterStartDate.getTime(); time <= filterEndDate.getTime(); time += intervalMs) {
      timePoints.push(new Date(time));
    }

    // Calculate concurrent sessions at each time point
    const concurrentCounts = timePoints.map(timePoint => {
      let count = 0;
      
      sessionData.forEach(session => {
        const sessionStart = new Date(session.startTime);
        const sessionEnd = new Date(session.endTime);
        
        // Check if the session was running at this time point
        if (timePoint >= sessionStart && timePoint <= sessionEnd) {
          count++;
        }
      });
      
      return {
        time: timePoint,
        count: count
      };
    });

    // Apply simple moving average for smoother curve (window of 3)
    const smoothedCounts = concurrentCounts.map((point, index) => {
      const start = Math.max(0, index - 1);
      const end = Math.min(concurrentCounts.length - 1, index + 1);
      let sum = 0;
      let count = 0;
      
      for (let i = start; i <= end; i++) {
        sum += concurrentCounts[i].count;
        count++;
      }
      
      return {
        time: point.time,
        count: Math.round(sum / count)
      };
    });
    
    return smoothedCounts;
  }


  renderSessionView(sessionData) {
    // Render combined timeline and concurrent sessions chart
    this.renderCombinedChart(sessionData);
    
    // Render project statistics
    this.renderProjectStatistics(sessionData);
    
    const sessionList = document.getElementById('sessionList');
    
    // Create table structure
    const tableHtml = `
      <table class="sessions-table">
        <thead>
          <tr>
            <th>Project Name</th>
            <th>First Prompt</th>
            <th>Date/Time</th>
            <th>Duration</th>
            <th>Messages</th>
            <th>Models Used</th>
            <th>Total Tokens</th>
            <th>Cost</th>
          </tr>
        </thead>
        <tbody>
          ${sessionData.map((session, index) => {
            const startTime = new Date(session.startTime);
            const formattedDate = startTime.toLocaleDateString('en-US', { 
              month: 'short', 
              day: 'numeric', 
              year: 'numeric'
            });
            const formattedTime = startTime.toLocaleTimeString('en-US', { 
              hour: '2-digit',
              minute: '2-digit'
            });

            const modelsHtml = Object.entries(session.models).map(([model, usage]) => {
              const modelName = model.replace('claude-', '').replace('-20240229', '').replace('-20250514', '');
              const totalModelTokens = usage.inputTokens + usage.outputTokens + usage.cacheCreateTokens + usage.cacheReadTokens;
              return `
                <div class="model-row">
                  <span class="model-name">${modelName}:</span>
                  <span class="model-tokens">${totalModelTokens.toLocaleString()}</span>
                </div>
              `;
            }).join('');

            const promptsHtml = session.prompts && session.prompts.length > 0 ? `
              <div class="prompts-list">
                <div class="prompts-header">
                  <strong>All User Prompts in Session</strong>
                </div>
                ${session.prompts.map((prompt, promptIndex) => `
                  <div class="prompt-item">
                    <div class="prompt-number">#${promptIndex + 1}</div>
                    <div class="prompt-content">
                      <div class="prompt-text">${prompt.prompt}</div>
                      <div class="prompt-stats">
                        <span class="prompt-duration">⏱ ${prompt.duration}</span>
                        <span class="prompt-tokens">🔢 ${prompt.tokens.total.toLocaleString()} tokens</span>
                        <span class="prompt-cost">💵 $${prompt.cost.toFixed(4)}</span>
                        ${prompt.responseCount > 1 ? `<span class="prompt-responses">🔄 ${prompt.responseCount} responses</span>` : ''}
                      </div>
                    </div>
                  </div>
                `).join('')}
              </div>
            ` : '<div class="no-prompts">No prompts found in this session</div>';

            return `
              <tr class="session-row" data-index="${index}" data-session-key="${session.sessionId}_${session.projectName}">
                <td class="project-name">${this.extractProjectName(session.projectName)}</td>
                <td class="prompt-cell" title="${(session.firstPrompt || 'No prompt found').replace(/"/g, '&quot;')}">${session.firstPrompt || 'No prompt found'}</td>
                <td class="date-time">
                  <div class="date">${formattedDate}</div>
                  <div class="time">${formattedTime}</div>
                </td>
                <td class="duration">${session.duration}</td>
                <td class="messages">${session.messageCount}</td>
                <td class="models-cell">
                  ${modelsHtml}
                </td>
                <td class="total-tokens">${session.totals.totalTokens.toLocaleString()}</td>
                <td class="cost">$${session.totals.totalCost.toFixed(2)}</td>
              </tr>
              <tr class="session-details-row" style="display: none;">
                <td colspan="8">
                  ${promptsHtml}
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    `;

    sessionList.innerHTML = tableHtml;
    
    // Add click handlers for expanding/collapsing rows
    const sessionRows = sessionList.querySelectorAll('.session-row');
    sessionRows.forEach(row => {
      row.addEventListener('click', () => {
        const detailsRow = row.nextElementSibling;
        if (detailsRow && detailsRow.classList.contains('session-details-row')) {
          const isExpanded = detailsRow.style.display !== 'none';
          
          // Close all other expanded rows
          sessionList.querySelectorAll('.session-details-row').forEach(r => {
            r.style.display = 'none';
          });
          sessionList.querySelectorAll('.session-row').forEach(r => {
            r.classList.remove('expanded');
          });
          
          // Toggle current row
          if (!isExpanded) {
            detailsRow.style.display = 'table-row';
            row.classList.add('expanded');
          }
        }
      });
    });
  }

  renderProjectStatistics(sessionData) {
    // Calculate statistics per project
    const projectStats = {};
    
    sessionData.forEach(session => {
      const projectName = this.extractProjectName(session.projectName);
      
      if (!projectStats[projectName]) {
        projectStats[projectName] = {
          sessions: 0,
          totalDuration: 0,
          totalTokens: 0,
          totalCost: 0,
          models: {},
          firstSession: null,
          lastSession: null,
          inputTokens: 0,
          outputTokens: 0,
          cacheTokens: 0
        };
      }
      
      const stats = projectStats[projectName];
      stats.sessions++;
      
      // Calculate duration
      const startTime = new Date(session.startTime);
      const endTime = new Date(session.endTime);
      const duration = endTime - startTime;
      stats.totalDuration += duration;
      
      // Aggregate tokens and costs
      stats.totalTokens += session.totals.totalTokens;
      stats.totalCost += session.totals.totalCost;
      stats.inputTokens += session.totals.inputTokens;
      stats.outputTokens += session.totals.outputTokens;
      stats.cacheTokens += (session.totals.cacheCreateTokens + session.totals.cacheReadTokens);
      
      // Track first and last session
      if (!stats.firstSession || startTime < new Date(stats.firstSession)) {
        stats.firstSession = session.startTime;
      }
      if (!stats.lastSession || startTime > new Date(stats.lastSession)) {
        stats.lastSession = session.startTime;
      }
      
      // Track model usage
      Object.entries(session.models).forEach(([model, usage]) => {
        if (!stats.models[model]) {
          stats.models[model] = 0;
        }
        stats.models[model] += usage.totalTokens;
      });
    });
    
    // Sort projects by total tokens (descending)
    const sortedProjects = Object.entries(projectStats)
      .sort((a, b) => b[1].totalTokens - a[1].totalTokens);
    
    // Render statistics cards
    const container = document.getElementById('projectStatistics');
    
    const html = sortedProjects.map(([projectName, stats]) => {
      const avgDuration = stats.totalDuration / stats.sessions;
      const avgTokens = Math.round(stats.totalTokens / stats.sessions);
      
      // Format duration
      const formatDuration = (ms) => {
        const hours = Math.floor(ms / (1000 * 60 * 60));
        const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
        if (hours > 0) {
          return `${hours}h ${minutes}m`;
        }
        return `${minutes}m`;
      };
      
      // Find most used model
      const mostUsedModel = Object.entries(stats.models)
        .sort((a, b) => b[1] - a[1])[0];
      
      // Calculate efficiency (tokens per minute)
      const tokensPerMinute = Math.round(stats.totalTokens / (stats.totalDuration / 60000));
      
      return `
        <div class="project-stat-card">
          <div class="project-stat-header">
            <div class="project-stat-name">${projectName}</div>
            <div class="project-stat-sessions">${stats.sessions} sessions</div>
          </div>
          <div class="project-stat-row">
            <span class="project-stat-label">Total Duration</span>
            <span class="project-stat-value highlight">${formatDuration(stats.totalDuration)}</span>
          </div>
          <div class="project-stat-row">
            <span class="project-stat-label">Total Tokens</span>
            <span class="project-stat-value">${stats.totalTokens.toLocaleString()}</span>
          </div>
          <div class="project-stat-row">
            <span class="project-stat-label">Total Cost</span>
            <span class="project-stat-value cost">$${stats.totalCost.toFixed(2)}</span>
          </div>
          <div class="project-stat-row">
            <span class="project-stat-label">Avg Duration/Session</span>
            <span class="project-stat-value">${formatDuration(avgDuration)}</span>
          </div>
          <div class="project-stat-row">
            <span class="project-stat-label">Avg Tokens/Session</span>
            <span class="project-stat-value">${avgTokens.toLocaleString()}</span>
          </div>
          <div class="project-stat-row">
            <span class="project-stat-label">Tokens/Minute</span>
            <span class="project-stat-value">${tokensPerMinute.toLocaleString()}</span>
          </div>
          <div class="project-stat-row">
            <span class="project-stat-label">Most Used Model</span>
            <span class="project-stat-value">${mostUsedModel ? mostUsedModel[0].replace('claude-', '').replace(/-\d+$/, '') : 'N/A'}</span>
          </div>
          <div class="project-stat-row">
            <span class="project-stat-label">Token Distribution</span>
            <span class="project-stat-value" style="font-size: 10px;">
              I:${Math.round(stats.inputTokens/1000)}k O:${Math.round(stats.outputTokens/1000)}k C:${Math.round(stats.cacheTokens/1000)}k
            </span>
          </div>
        </div>
      `;
    }).join('');
    
    container.innerHTML = html;
  }

  renderCombinedChart(sessionData) {
    console.log('renderCombinedChart called with', sessionData.length, 'sessions');
    const ctx = document.getElementById('timelineChart').getContext('2d');
    
    if (this.timelineChart) {
      this.timelineChart.destroy();
    }
    
    // Get date filter values
    const startDateStr = document.getElementById('startDate').value;
    const endDateStr = document.getElementById('endDate').value;
    
    // Convert date strings to Date objects at start and end of day
    const filterStartDate = new Date(startDateStr);
    filterStartDate.setHours(0, 0, 0, 0);
    
    const filterEndDate = new Date(endDateStr);
    filterEndDate.setHours(23, 59, 59, 999);
    
    // Group sessions by time periods (e.g., by hour or day)
    const sessionTimeGroups = new Map();
    
    sessionData.forEach(session => {
      const startTime = new Date(session.startTime);
      const endTime = new Date(session.endTime);
      
      // Group by day and hour
      const startHour = new Date(startTime);
      startHour.setMinutes(0, 0, 0);
      
      const endHour = new Date(endTime);
      endHour.setMinutes(0, 0, 0);
      
      // Add all hours this session spans
      for (let hour = new Date(startHour); hour <= endHour; hour.setHours(hour.getHours() + 1)) {
        const hourKey = hour.toISOString();
        if (!sessionTimeGroups.has(hourKey)) {
          sessionTimeGroups.set(hourKey, []);
        }
        sessionTimeGroups.get(hourKey).push(session);
      }
    });
    
    // Get sorted unique time periods with data
    const uniqueTimePeriods = Array.from(sessionTimeGroups.keys()).sort();
    console.log('Unique time periods with data:', uniqueTimePeriods.length);
    
    // Find min and max for the actual data range
    const actualMinTime = uniqueTimePeriods.length > 0 ? new Date(uniqueTimePeriods[0]) : filterStartDate;
    const actualMaxTime = uniqueTimePeriods.length > 0 ? new Date(uniqueTimePeriods[uniqueTimePeriods.length - 1]) : filterEndDate;
    
    // Calculate concurrent sessions only for periods with data
    const concurrentData = [];
    uniqueTimePeriods.forEach(period => {
      const periodTime = new Date(period);
      let count = 0;
      
      sessionData.forEach(session => {
        const start = new Date(session.startTime);
        const end = new Date(session.endTime);
        
        if (start <= periodTime && end >= periodTime) {
          count++;
        }
      });
      
      concurrentData.push({
        time: periodTime,
        count: count
      });
    });
    
    console.log('Concurrent data points:', concurrentData.length);

    // Group sessions by project name for timeline
    const projectGroups = {};
    const projectColors = {};
    const colorPalette = [
      { bg: 'rgba(14, 99, 156, 0.8)', border: 'rgba(14, 99, 156, 1)' },
      { bg: 'rgba(30, 156, 108, 0.8)', border: 'rgba(30, 156, 108, 1)' },
      { bg: 'rgba(156, 94, 14, 0.8)', border: 'rgba(156, 94, 14, 1)' },
      { bg: 'rgba(156, 14, 94, 0.8)', border: 'rgba(156, 14, 94, 1)' },
      { bg: 'rgba(94, 156, 14, 0.8)', border: 'rgba(94, 156, 14, 1)' },
      { bg: 'rgba(14, 156, 156, 0.8)', border: 'rgba(14, 156, 156, 1)' },
      { bg: 'rgba(156, 14, 14, 0.8)', border: 'rgba(156, 14, 14, 1)' }
    ];
    let colorIndex = 0;

    // Process sessions and group by project
    sessionData.forEach(session => {
      const fullProjectName = (session.projectName || 'Unknown').trim();
      const projectName = this.extractProjectName(fullProjectName);
      
      if (!projectGroups[projectName]) {
        projectGroups[projectName] = [];
        projectColors[projectName] = colorPalette[colorIndex % colorPalette.length];
        colorIndex++;
      }
      
      const start = new Date(session.startTime);
      const end = new Date(session.endTime);
      
      projectGroups[projectName].push({
        label: projectName,
        fullProjectName: fullProjectName,
        sessionId: session.sessionId.substring(0, 8),
        start: start,
        end: end,
        duration: end - start,
        cost: session.totals.totalCost,
        tokens: session.totals.totalTokens,
        originalSession: session
      });
    });

    // Create labels for Y axis (project names) - Sort for consistency
    const projectNames = Object.keys(projectGroups).sort();
    console.log('Project names:', projectNames);
    
    // Create bar chart data for sessions
    const chartData = [];
    const backgroundColors = [];
    const borderColors = [];
    
    projectNames.forEach((projectName) => {
      const sessions = projectGroups[projectName];
      const color = projectColors[projectName];
      
      sessions.forEach(session => {
        chartData.push({
          x: [session.start, session.end],
          y: projectName,
          sessionId: session.sessionId,
          cost: session.cost,
          tokens: session.tokens,
          projectName: session.fullProjectName,
          label: session.label
        });
        backgroundColors.push(color.bg);
        borderColors.push(color.border);
      });
    });
    
    console.log('Chart data points:', chartData.length);
    console.log('Sample chart data:', chartData[0]);

    // Create mixed chart with both datasets
    console.log('Creating mixed chart with', concurrentData.length, 'concurrent points and', chartData.length, 'session bars');
    
    // Format concurrent data for the line chart
    const lineChartData = concurrentData.map(point => ({
      x: point.time,
      y: point.count
    }));
    console.log('Line chart data points:', lineChartData.length, 'First few:', lineChartData.slice(0, 5));
    
    try {
      this.timelineChart = new Chart(ctx, {
        data: {
          labels: projectNames,
          datasets: [
            {
              type: 'bar',
              label: 'Sessions',
              data: chartData,
              backgroundColor: backgroundColors,
              borderColor: borderColors,
              borderWidth: 1,
              borderSkipped: false,
              barPercentage: 0.8,
              categoryPercentage: 0.9,
              minBarLength: 2,
              yAxisID: 'y',
              order: 1  // Draw bars first (lower order = drawn first)
            },
            {
              type: 'line',
              label: 'Concurrent Sessions',
              data: lineChartData,
              borderColor: 'rgba(150, 150, 150, 0.4)',  // Gray with lower opacity
              backgroundColor: 'transparent',  // No fill background
              borderWidth: 2,  // Slightly thicker for visibility
              borderJoinStyle: 'round',  // Round joins for smoother appearance
              fill: false,  // Disable fill
              tension: 0.4,  // Higher tension for smoother curve
              cubicInterpolationMode: 'monotone',  // Smooth monotone interpolation
              spanGaps: true,  // Connect points even if there are gaps
              pointRadius: 0,
              pointHoverRadius: 0,  // No hover effect
              pointHitRadius: 0,  // No hit detection for tooltips
              yAxisID: 'y1',
              order: 2  // Draw line on top (higher order = drawn later)
            }
          ]
        },
      options: {
        indexAxis: 'y',  // This is crucial for horizontal bars
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: 'point',
          intersect: true  // Only show tooltip when directly hovering over elements
        },
        scales: {
          x: {
            type: 'timeseries',  // Use timeseries type for better handling of sparse data
            min: actualMinTime,
            max: actualMaxTime,
            time: {
              displayFormats: {
                hour: 'MMM dd HH:mm',
                day: 'MMM dd'
              },
              tooltipFormat: 'MMM dd, yyyy HH:mm'
            },
            grid: {
              color: '#3a3a3c'
            },
            ticks: {
              color: '#969696',
              maxRotation: 45,
              source: 'data',  // Only show ticks where we have data
              autoSkip: true,
              maxTicksLimit: 15  // Limit number of ticks for readability
            },
            bounds: 'data'  // Scale bounds based on data, not ticks
          },
          y: {
            type: 'category',
            labels: projectNames,
            position: 'left',
            grid: {
              color: '#3a3a3c'
            },
            ticks: {
              color: '#969696',
              font: {
                size: 11
              },
              autoSkip: false
            }
          },
          y1: {
            type: 'linear',
            position: 'right',
            beginAtZero: true,
            grid: {
              drawOnChartArea: false
            },
            ticks: {
              color: '#696969',  // Dimmer gray color
              stepSize: 1,
              callback: function(value) {
                return Math.floor(value) === value ? value : '';
              }
            },
            title: {
              display: true,
              text: 'Concurrent Sessions',
              color: '#696969',  // Dimmer gray color
              font: {
                size: 10  // Smaller font
              }
            }
          }
        },
        plugins: {
          legend: {
            display: true,
            position: 'top',
            labels: {
              color: '#cccccc',
              padding: 15,
              filter: function(item) {
                return item.text !== 'Sessions';  // Hide Sessions legend, only show Concurrent Sessions
              }
            }
          },
          tooltip: {
            filter: function(tooltipItem) {
              // Check if it's the bar dataset (index 0) or has sessionId property
              const isBarChart = tooltipItem.datasetIndex === 0 || 
                                (tooltipItem.raw && tooltipItem.raw.sessionId);
              return isBarChart;
            },
            callbacks: {
              title: function(context) {
                if (context.length === 0) return '';
                const item = context[0];
                // Only process bar chart tooltips
                if (item.datasetIndex !== 0) return '';
                
                const data = item.raw;
                if (!data || !data.label) return '';
                return `${data.label} (${data.sessionId})`;
              },
              label: function(context) {
                // Only process bar chart tooltips
                if (context.datasetIndex !== 0) return [];
                
                const data = context.raw;
                if (!data || !data.x) return [];
                
                const startTime = new Date(data.x[0]);
                const endTime = new Date(data.x[1]);
                const duration = data.x[1] - data.x[0];
                const hours = Math.floor(duration / (1000 * 60 * 60));
                const minutes = Math.floor((duration % (1000 * 60 * 60)) / (1000 * 60));
                
                // Format time as "MMM dd HH:mm"
                const formatTime = (date) => {
                  const month = date.toLocaleDateString('en-US', { month: 'short' });
                  const day = date.getDate();
                  const hour = String(date.getHours()).padStart(2, '0');
                  const min = String(date.getMinutes()).padStart(2, '0');
                  return `${month} ${day} ${hour}:${min}`;
                };
                
                return [
                  `Time: ${formatTime(startTime)} - ${formatTime(endTime)}`,
                  `Duration: ${hours}h ${minutes}m`,
                  `Tokens: ${data.tokens.toLocaleString()}`,
                  `Cost: $${data.cost.toFixed(2)}`
                ];
              }
            }
          }
        }
      }
    });
      console.log('Chart created successfully!');
    } catch (error) {
      console.error('Error creating chart:', error);
    }
  }

  renderTimelineChart(sessionData) {
    // This method is now replaced by renderCombinedChart
    // Keeping empty for backward compatibility
  }

  showLoading() {
    document.getElementById('dailyDetails').innerHTML = '<p>Loading statistics...</p>';
    document.getElementById('sessionList').innerHTML = '<p>Loading sessions...</p>';
    
    // Disable controls during loading
    document.querySelectorAll('.toggle-btn, .date-input').forEach(el => {
      el.disabled = true;
    });
  }
  
  hideLoading() {
    // Re-enable controls after loading
    document.querySelectorAll('.toggle-btn, .date-input').forEach(el => {
      el.disabled = false;
    });
  }

  showError(message) {
    document.getElementById('dailyDetails').innerHTML = `<p style="color: #ff6b6b;">${message}</p>`;
    document.getElementById('sessionList').innerHTML = `<p style="color: #ff6b6b;">${message}</p>`;
  }
}

// Initialize Statistics Manager when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  console.log('DOMContentLoaded - initializing StatisticsManager');
  // Small delay to ensure all elements are rendered
  setTimeout(() => {
    console.log('Creating StatisticsManager instance');
    window.statisticsManager = new StatisticsManager();
    console.log('StatisticsManager created:', window.statisticsManager);
  }, 100);
});