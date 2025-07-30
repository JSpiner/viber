// Now tab functionality for real-time token usage monitoring
class NowManager {
  constructor() {
    this.recentUsageData = [];
    this.hourlyWindowData = null;
    this.weeklyWindowData = null;
    this.fiveHourChart = null;
    this.weeklyChart = null;
    this.updateInterval = null;
    
    // Load subscription tier from localStorage or use default
    this.subscriptionTier = localStorage.getItem('subscriptionTier') || 'pro'; // 'pro', 'max5x', 'max20x'
    
    this.initializeEventListeners();
  }

  initializeEventListeners() {
    // Subscription tier selector if exists
    const tierSelector = document.getElementById('subscriptionTier');
    if (tierSelector) {
      // Set the selected value from localStorage
      tierSelector.value = this.subscriptionTier;
      
      tierSelector.addEventListener('change', (e) => {
        this.subscriptionTier = e.target.value;
        // Save to localStorage
        localStorage.setItem('subscriptionTier', this.subscriptionTier);
        this.updateDisplay();
      });
    }
  }

  async loadNowData() {
    console.log('loadNowData called');
    try {
      // Load recent token usage data
      console.log('Calling electronAPI.loadRecentUsage...');
      const result = await window.electronAPI.loadRecentUsage();
      console.log('Result from loadRecentUsage:', result);
      
      if (result.success) {
        this.recentUsageData = result.data.recent;
        this.hourlyWindowData = result.data.hourlyWindow;
        this.weeklyWindowData = result.data.weeklyWindow;
        
        console.log('Data loaded successfully:', {
          recent: this.recentUsageData.length,
          hourlyWindow: this.hourlyWindowData,
          weeklyWindow: this.weeklyWindowData
        });
        
        this.updateDisplay();
        this.startAutoUpdate();
      } else {
        console.error('Failed to load now data:', result.error);
        this.showError(result.error || 'Failed to load real-time data');
      }
    } catch (error) {
      console.error('Error loading now data:', error);
      this.showError('Failed to load real-time data: ' + error.message);
    }
  }

  startAutoUpdate() {
    // Clear existing interval if any
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }
    
    // Update every 30 seconds
    this.updateInterval = setInterval(() => {
      this.loadNowData();
    }, 30000);
  }

  stopAutoUpdate() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
  }

  updateDisplay() {
    this.updateRecentUsage();
    this.updateFiveHourWindow();
    this.updateWeeklyWindow();
    this.updateCharts();
  }

  updateRecentUsage() {
    // Calculate tokens per minute from recent 10 minutes
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
    const recentData = this.recentUsageData
      .filter(item => new Date(item.timestamp) >= tenMinutesAgo);
    
    // Use effective total for TPM calculation
    const recentTokens = recentData
      .reduce((sum, item) => sum + (item.usage.effectiveTotal || item.usage.total), 0);
    
    const tokensPerMinute = Math.round(recentTokens / 10);
    
    // Update UI
    document.getElementById('recentTokens').textContent = Math.round(recentTokens).toLocaleString();
    document.getElementById('tokensPerMinute').textContent = `${tokensPerMinute.toLocaleString()} tpm`;
    
    // Update trend indicator
    this.updateTrend(tokensPerMinute);
  }

  updateTrend(currentTpm) {
    const trendElement = document.getElementById('usageTrend');
    if (!trendElement) return;
    
    // Compare with previous TPM (stored in element data)
    const previousTpm = parseInt(trendElement.dataset.previousTpm || '0');
    
    if (currentTpm > previousTpm) {
      trendElement.innerHTML = '↑';
      trendElement.className = 'trend-up';
    } else if (currentTpm < previousTpm) {
      trendElement.innerHTML = '↓';
      trendElement.className = 'trend-down';
    } else {
      trendElement.innerHTML = '→';
      trendElement.className = 'trend-stable';
    }
    
    trendElement.dataset.previousTpm = currentTpm;
  }

  updateFiveHourWindow() {
    const limits = this.getSubscriptionLimits();
    const used = this.hourlyWindowData?.totalTokens || 0;  // This is effective total
    const limit = limits.fiveHourTokens;
    const remaining = Math.max(0, limit - used);
    const percentage = limit > 0 ? (used / limit) * 100 : 0;
    
    // Calculate cache savings if raw totals are available
    let cacheSavings = 0;
    if (this.hourlyWindowData?.rawTotals) {
      const raw = this.hourlyWindowData.rawTotals;
      const rawTotal = raw.total;
      cacheSavings = rawTotal - used;
    }
    
    console.log('Updating 5-hour window:', { 
      used, 
      limit, 
      remaining, 
      percentage, 
      cacheSavings,
      windowStart: this.hourlyWindowData?.windowStart 
    });
    
    // Update UI
    document.getElementById('fiveHourUsed').textContent = used.toLocaleString();
    document.getElementById('fiveHourLimit').textContent = limit.toLocaleString();
    document.getElementById('fiveHourRemaining').textContent = remaining.toLocaleString();
    document.getElementById('fiveHourPercentage').textContent = `${percentage.toFixed(1)}%`;
    
    // Update session start time
    if (this.hourlyWindowData?.windowStart) {
      const startTime = new Date(this.hourlyWindowData.windowStart);
      const formattedTime = startTime.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
      document.getElementById('fiveHourSessionStart').textContent = formattedTime;
    }
    
    // Show cache savings
    if (cacheSavings > 0) {
      document.getElementById('fiveHourCacheSavings').textContent = 
        `-${cacheSavings.toLocaleString()} (${((cacheSavings / (cacheSavings + used)) * 100).toFixed(1)}%)`;
      document.getElementById('fiveHourCacheSavings').style.color = '#51cf66';
    } else {
      document.getElementById('fiveHourCacheSavings').textContent = '0';
      document.getElementById('fiveHourCacheSavings').style.color = 'inherit';
    }
    
    // Update progress bar
    const progressBar = document.getElementById('fiveHourProgress');
    if (progressBar) {
      progressBar.style.width = `${Math.min(100, percentage)}%`;
      progressBar.className = `progress-bar ${percentage > 90 ? 'danger' : percentage > 70 ? 'warning' : 'safe'}`;
    }
    
    // Calculate reset time
    if (this.hourlyWindowData?.windowStart) {
      const resetTime = new Date(this.hourlyWindowData.windowStart);
      resetTime.setHours(resetTime.getHours() + 5);
      this.updateResetTime('fiveHourReset', resetTime);
    } else {
      // If no window data, show 5 hours from now
      const resetTime = new Date();
      resetTime.setHours(resetTime.getHours() + 5);
      this.updateResetTime('fiveHourReset', resetTime);
    }
  }

  updateWeeklyWindow() {
    const limits = this.getSubscriptionLimits();
    const used = this.weeklyWindowData?.totalTokens || 0;  // This is effective total
    const limit = limits.weeklyTokens;
    const remaining = Math.max(0, limit - used);
    const percentage = limit > 0 ? (used / limit) * 100 : 0;
    
    // Calculate cache savings if raw totals are available
    let cacheSavings = 0;
    if (this.weeklyWindowData?.rawTotals) {
      const raw = this.weeklyWindowData.rawTotals;
      const rawTotal = raw.total;
      cacheSavings = rawTotal - used;
    }
    
    console.log('Updating weekly window:', { used, limit, remaining, percentage, cacheSavings });
    
    // Update UI
    document.getElementById('weeklyUsed').textContent = used.toLocaleString();
    document.getElementById('weeklyLimit').textContent = limit.toLocaleString();
    document.getElementById('weeklyRemaining').textContent = remaining.toLocaleString();
    document.getElementById('weeklyPercentage').textContent = `${percentage.toFixed(1)}%`;
    
    // Update session start time
    if (this.weeklyWindowData?.windowStart) {
      const startTime = new Date(this.weeklyWindowData.windowStart);
      const formattedTime = startTime.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
      document.getElementById('weeklySessionStart').textContent = formattedTime;
    }
    
    // Show cache savings
    if (cacheSavings > 0) {
      document.getElementById('weeklyCacheSavings').textContent = 
        `-${cacheSavings.toLocaleString()} (${((cacheSavings / (cacheSavings + used)) * 100).toFixed(1)}%)`;
      document.getElementById('weeklyCacheSavings').style.color = '#51cf66';
    } else {
      document.getElementById('weeklyCacheSavings').textContent = '0';
      document.getElementById('weeklyCacheSavings').style.color = 'inherit';
    }
    
    // Update progress bar
    const progressBar = document.getElementById('weeklyProgress');
    if (progressBar) {
      progressBar.style.width = `${Math.min(100, percentage)}%`;
      progressBar.className = `progress-bar ${percentage > 90 ? 'danger' : percentage > 70 ? 'warning' : 'safe'}`;
    }
    
    // Calculate reset time
    if (this.weeklyWindowData?.windowStart) {
      const resetTime = new Date(this.weeklyWindowData.windowStart);
      resetTime.setDate(resetTime.getDate() + 7);
      this.updateResetTime('weeklyReset', resetTime);
    } else {
      // If no window data, show 7 days from now
      const resetTime = new Date();
      resetTime.setDate(resetTime.getDate() + 7);
      this.updateResetTime('weeklyReset', resetTime);
    }
  }

  updateResetTime(elementId, resetTime) {
    const element = document.getElementById(elementId);
    if (!element) {
      console.error(`Element ${elementId} not found`);
      return;
    }
    
    console.log(`Setting reset time for ${elementId}:`, resetTime);
    
    const updateTime = () => {
      const now = new Date();
      const timeRemaining = resetTime - now;
      
      if (timeRemaining > 0) {
        const days = Math.floor(timeRemaining / (1000 * 60 * 60 * 24));
        const hours = Math.floor((timeRemaining % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((timeRemaining % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((timeRemaining % (1000 * 60)) / 1000);
        
        if (days > 0) {
          element.textContent = `${days}d ${hours}h ${minutes}m ${seconds}s`;
        } else if (hours > 0) {
          element.textContent = `${hours}h ${minutes}m ${seconds}s`;
        } else if (minutes > 0) {
          element.textContent = `${minutes}m ${seconds}s`;
        } else {
          element.textContent = `${seconds}s`;
        }
      } else {
        element.textContent = 'Resetting...';
      }
    };
    
    // Update immediately
    updateTime();
    
    // Store the interval ID on the element to clear it later if needed
    if (element.intervalId) {
      clearInterval(element.intervalId);
    }
    
    // Update every second
    element.intervalId = setInterval(updateTime, 1000);
  }

  getSubscriptionLimits() {
    // Estimated token limits based on message counts and average token usage
    // These are rough estimates - actual limits vary based on usage patterns
    const limits = {
      pro: {
        fiveHourTokens: 450000,  // ~45 messages * ~10k tokens per message
        weeklyTokens: 15120000,  // ~40-80 hours of usage
        messages: 45
      },
      max5x: {
        fiveHourTokens: 2250000,  // ~225 messages * ~10k tokens per message
        weeklyTokens: 52920000,   // ~140-280 hours of usage
        messages: 225
      },
      max20x: {
        fiveHourTokens: 9000000,  // ~900 messages * ~10k tokens per message
        weeklyTokens: 90720000,   // ~240-480 hours of usage
        messages: 900
      }
    };
    
    return limits[this.subscriptionTier] || limits.pro;
  }

  updateCharts() {
    this.renderFiveHourChart();
    this.renderWeeklyChart();
  }

  renderFiveHourChart() {
    const ctx = document.getElementById('fiveHourChart').getContext('2d');
    
    if (this.fiveHourChart) {
      this.fiveHourChart.destroy();
    }

    const limits = this.getSubscriptionLimits();
    const used = this.hourlyWindowData?.totalTokens || 0;
    const remaining = Math.max(0, limits.fiveHourTokens - used);

    this.fiveHourChart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ['Used', 'Remaining'],
        datasets: [{
          data: [used, remaining],
          backgroundColor: [
            used / limits.fiveHourTokens > 0.9 ? '#ff6b6b' : 
            used / limits.fiveHourTokens > 0.7 ? '#ffa500' : '#0e639c',
            '#3a3a3c'
          ],
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              color: '#cccccc',
              padding: 10
            }
          },
          tooltip: {
            callbacks: {
              label: function(context) {
                const label = context.label || '';
                const value = context.parsed || 0;
                const percentage = ((value / limits.fiveHourTokens) * 100).toFixed(1);
                return `${label}: ${value.toLocaleString()} tokens (${percentage}%)`;
              }
            }
          }
        }
      }
    });
  }

  renderWeeklyChart() {
    const ctx = document.getElementById('weeklyChart').getContext('2d');
    
    if (this.weeklyChart) {
      this.weeklyChart.destroy();
    }

    // Prepare daily data for the past 7 days
    const dailyData = this.prepareDailyData();
    
    this.weeklyChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: dailyData.labels,
        datasets: [{
          label: 'Daily Token Usage',
          data: dailyData.values,
          borderColor: '#0e639c',
          backgroundColor: 'rgba(14, 99, 156, 0.1)',
          borderWidth: 2,
          tension: 0.4,
          fill: true
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            grid: {
              color: '#3a3a3c'
            },
            ticks: {
              color: '#969696'
            }
          },
          y: {
            grid: {
              color: '#3a3a3c'
            },
            ticks: {
              color: '#969696',
              callback: function(value) {
                return (value / 1000000).toFixed(1) + 'M';
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
              label: function(context) {
                return `Tokens: ${context.parsed.y.toLocaleString()}`;
              }
            }
          }
        }
      }
    });
  }

  prepareDailyData() {
    const labels = [];
    const values = [];
    
    // Generate labels for past 7 days
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      labels.push(date.toLocaleDateString('en-US', { weekday: 'short' }));
      
      // Calculate daily usage from recent data
      const dayStart = new Date(date);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(date);
      dayEnd.setHours(23, 59, 59, 999);
      
      const dayUsage = this.recentUsageData
        .filter(item => {
          const itemDate = new Date(item.timestamp);
          return itemDate >= dayStart && itemDate <= dayEnd;
        })
        .reduce((sum, item) => sum + item.usage.total, 0);
      
      values.push(dayUsage);
    }
    
    return { labels, values };
  }

  showError(message) {
    const errorElements = [
      'recentTokens',
      'tokensPerMinute',
      'fiveHourUsed',
      'weeklyUsed'
    ];
    
    errorElements.forEach(id => {
      const element = document.getElementById(id);
      if (element) {
        element.textContent = 'Error';
        element.style.color = '#ff6b6b';
      }
    });
    
    console.error('Now tab error:', message);
  }

  destroy() {
    this.stopAutoUpdate();
    
    // Clear reset time intervals
    const fiveHourReset = document.getElementById('fiveHourReset');
    const weeklyReset = document.getElementById('weeklyReset');
    
    if (fiveHourReset && fiveHourReset.intervalId) {
      clearInterval(fiveHourReset.intervalId);
      fiveHourReset.intervalId = null;
    }
    
    if (weeklyReset && weeklyReset.intervalId) {
      clearInterval(weeklyReset.intervalId);
      weeklyReset.intervalId = null;
    }
    
    if (this.fiveHourChart) {
      this.fiveHourChart.destroy();
    }
    
    if (this.weeklyChart) {
      this.weeklyChart.destroy();
    }
  }
}

// Initialize Now Manager when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    window.nowManager = new NowManager();
  }, 100);
});