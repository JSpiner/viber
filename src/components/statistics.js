const JSONLParser = require('../services/jsonlParser');
const TokenAggregator = require('../services/tokenAggregator');
const Chart = require('chart.js/auto');

class StatisticsManager {
  constructor() {
    this.parser = new JSONLParser();
    this.aggregator = new TokenAggregator();
    this.tokenData = [];
    this.currentView = 'daily';
    this.dailyChart = null;
    
    this.initializeEventListeners();
    this.initializeDateInputs();
  }

  initializeEventListeners() {
    // Tab activation
    document.addEventListener('DOMContentLoaded', () => {
      const statsTab = document.querySelector('[data-tab="statistics"]');
      if (statsTab) {
        statsTab.addEventListener('click', () => {
          setTimeout(() => this.loadStatistics(), 100);
        });
      }
    });

    // View toggle
    const toggleButtons = document.querySelectorAll('.toggle-btn');
    toggleButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        const view = e.target.getAttribute('data-view');
        this.switchView(view);
      });
    });

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

    document.getElementById('startDate').value = startDate.toISOString().split('T')[0];
    document.getElementById('endDate').value = endDate.toISOString().split('T')[0];
  }

  async loadStatistics() {
    try {
      // Show loading state
      this.showLoading();
      
      // Load token data
      this.tokenData = await this.parser.getAllTokenUsage();
      
      // Apply date filter and render
      this.applyDateFilter();
    } catch (error) {
      console.error('Error loading statistics:', error);
      this.showError('Failed to load statistics');
    }
  }

  applyDateFilter() {
    const startDate = document.getElementById('startDate').value;
    const endDate = document.getElementById('endDate').value;

    if (!startDate || !endDate) return;

    if (this.currentView === 'daily') {
      const dailyData = this.aggregator.aggregateByDay(this.tokenData);
      const filteredData = this.aggregator.filterByDateRange(dailyData, startDate, endDate);
      this.renderDailyView(filteredData);
    } else {
      const sessionData = this.aggregator.aggregateBySession(this.tokenData);
      const filteredData = this.aggregator.filterByDateRange(sessionData, startDate, endDate);
      this.renderSessionView(filteredData);
    }

    this.updateSummaryCards(this.tokenData, startDate, endDate);
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
    const filteredData = data.filter(item => {
      const date = new Date(item.timestamp);
      return date >= new Date(startDate) && date <= new Date(endDate + 'T23:59:59');
    });

    let totalTokens = 0;
    let totalCost = 0;
    const modelCounts = {};

    filteredData.forEach(item => {
      totalTokens += item.usage.total;
      const cost = this.aggregator.calculateCost(item.usage, item.model);
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
    
    const html = dailyData.slice(0, 7).map(day => {
      const date = new Date(day.date);
      const formattedDate = date.toLocaleDateString('en-US', { 
        weekday: 'short', 
        month: 'short', 
        day: 'numeric', 
        year: 'numeric' 
      });

      const modelsHtml = Object.entries(day.models).map(([model, usage]) => `
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
              <div class="token-label">Cache</div>
              <div class="token-value">${(usage.cacheCreateTokens + usage.cacheReadTokens).toLocaleString()}</div>
            </div>
            <div class="token-type">
              <div class="token-label">Cost</div>
              <div class="token-value">$${usage.cost.toFixed(2)}</div>
            </div>
          </div>
        </div>
      `).join('');

      return `
        <div class="daily-item">
          <div class="daily-header">
            <h4>${formattedDate}</h4>
            <div class="daily-summary">
              <span>${day.totals.totalTokens.toLocaleString()} tokens</span>
              <span class="cost">$${day.totals.totalCost.toFixed(2)}</span>
            </div>
          </div>
          <div class="model-breakdown">
            ${modelsHtml}
          </div>
        </div>
      `;
    }).join('');

    detailsContainer.innerHTML = `
      <h3>Recent Daily Usage</h3>
      ${html}
    `;
  }

  renderSessionView(sessionData) {
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

  showLoading() {
    document.getElementById('dailyDetails').innerHTML = '<p>Loading statistics...</p>';
    document.getElementById('sessionList').innerHTML = '<p>Loading sessions...</p>';
  }

  showError(message) {
    document.getElementById('dailyDetails').innerHTML = `<p style="color: #ff6b6b;">${message}</p>`;
    document.getElementById('sessionList').innerHTML = `<p style="color: #ff6b6b;">${message}</p>`;
  }
}

module.exports = StatisticsManager;