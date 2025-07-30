// Statistics Manager for browser environment
class StatisticsManager {
  constructor() {
    this.tokenData = [];
    this.currentView = 'daily';
    this.dailyChart = null;
    this.timelineChart = null;
    
    this.initializeEventListeners();
    this.initializeDateInputs();
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
    
    // Create table rows
    const rows = dailyData.slice(0, 7).map(day => {
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

  renderSessionView(sessionData) {
    // Render timeline chart first
    this.renderTimelineChart(sessionData);
    
    const sessionList = document.getElementById('sessionList');
    
    const html = sessionData.map((session, index) => {
      const startTime = new Date(session.startTime);
      const formattedDate = startTime.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric', 
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });

      const modelsHtml = Object.entries(session.models).map(([model, usage]) => `
        <div class="model-item">
          <span class="model-name">${model.replace('claude-', '').replace('-20240229', '').replace('-20250514', '')}</span>
          <div class="token-details">
            <div class="token-type">
              <div class="token-label">Input</div>
              <div class="token-value">${usage.inputTokens.toLocaleString()}</div>
            </div>
            <div class="token-type">
              <div class="token-label">Output</div>
              <div class="token-value">${usage.outputTokens.toLocaleString()}</div>
            </div>
            <div class="token-type">
              <div class="token-label">Cache Create</div>
              <div class="token-value">${usage.cacheCreateTokens.toLocaleString()}</div>
            </div>
            <div class="token-type">
              <div class="token-label">Cache Read</div>
              <div class="token-value">${usage.cacheReadTokens.toLocaleString()}</div>
            </div>
          </div>
        </div>
      `).join('');

      return `
        <div class="session-item" data-index="${index}">
          <div class="session-header">
            <div>
              <div class="session-title">${session.projectName}</div>
              <div class="session-meta">
                <span>${formattedDate}</span>
                <span>Duration: ${session.duration}</span>
                <span>${session.messageCount} messages</span>
              </div>
            </div>
            <div class="session-cost">$${session.totals.totalCost.toFixed(2)}</div>
          </div>
          <div class="session-details">
            <div class="session-id">Session ID: ${session.sessionId}</div>
            <div class="model-breakdown">
              ${modelsHtml}
            </div>
            <div class="session-totals">
              <strong>Total Tokens:</strong> ${session.totals.totalTokens.toLocaleString()}
            </div>
          </div>
        </div>
      `;
    }).join('');

    sessionList.innerHTML = html;

    // Add click handlers for expanding sessions
    sessionList.querySelectorAll('.session-item').forEach(item => {
      item.addEventListener('click', () => {
        item.classList.toggle('expanded');
      });
    });
  }

  renderTimelineChart(sessionData) {
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

    // Prepare data for timeline chart
    const chartData = sessionData.slice(0, 20).map((session, index) => {
      const start = new Date(session.startTime);
      const end = new Date(session.endTime);
      
      return {
        label: session.projectName.split('/').pop() || 'Unknown',
        sessionId: session.sessionId.substring(0, 8),
        start: start,
        end: end,
        duration: end - start,
        cost: session.totals.totalCost,
        tokens: session.totals.totalTokens
      };
    });

    // Create datasets for the chart
    const datasets = [{
      label: 'Sessions',
      data: chartData.map((item, index) => ({
        x: [item.start, item.end],
        y: index,
        sessionId: item.sessionId,
        cost: item.cost,
        tokens: item.tokens
      })),
      backgroundColor: chartData.map((_, index) => {
        const colors = [
          'rgba(14, 99, 156, 0.8)',
          'rgba(30, 156, 108, 0.8)',
          'rgba(156, 94, 14, 0.8)',
          'rgba(156, 14, 94, 0.8)'
        ];
        return colors[index % colors.length];
      }),
      borderColor: chartData.map((_, index) => {
        const colors = [
          'rgba(14, 99, 156, 1)',
          'rgba(30, 156, 108, 1)',
          'rgba(156, 94, 14, 1)',
          'rgba(156, 14, 94, 1)'
        ];
        return colors[index % colors.length];
      }),
      borderWidth: 1,
      borderSkipped: false,
      barPercentage: 0.8,
      categoryPercentage: 0.9
    }];

    // Create the timeline chart
    this.timelineChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: chartData.map(d => d.label),
        datasets: datasets
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            type: 'time',
            min: filterStartDate,
            max: filterEndDate,
            time: {
              displayFormats: {
                hour: 'HH:mm',
                day: 'MMM dd'
              },
              tooltipFormat: 'MMM dd, yyyy HH:mm'
            },
            grid: {
              color: '#3a3a3c'
            },
            ticks: {
              color: '#969696',
              maxRotation: 0
            }
          },
          y: {
            grid: {
              color: '#3a3a3c'
            },
            ticks: {
              color: '#969696',
              font: {
                size: 11
              }
            }
          }
        },
        plugins: {
          legend: {
            display: false
          },
          tooltip: {
            callbacks: {
              title: function(context) {
                const item = context[0];
                const data = chartData[item.dataIndex];
                return `${data.label} (${data.sessionId})`;
              },
              label: function(context) {
                const data = chartData[context.dataIndex];
                const duration = data.duration;
                const hours = Math.floor(duration / (1000 * 60 * 60));
                const minutes = Math.floor((duration % (1000 * 60 * 60)) / (1000 * 60));
                
                return [
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