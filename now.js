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

  // Helper function to format date as YYYY-MM-DD HH:MM:SS
  formatDateTime(date) {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const seconds = String(d.getSeconds()).padStart(2, '0');
    
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
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
        this.twoWeeksData = result.data.twoWeeksData || [];
        this.weeklyWindows = result.data.weeklyWindows || [];
        
        console.log('Data loaded successfully:', {
          recent: this.recentUsageData.length,
          hourlyWindow: this.hourlyWindowData,
          weeklyWindow: this.weeklyWindowData,
          twoWeeksData: this.twoWeeksData?.length,
          weeklyWindows: this.weeklyWindows?.length
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
    
    // Calculate TPM using only input + output tokens (excluding cache tokens)
    const recentTokens = recentData
      .reduce((sum, item) => sum + (item.usage.inputTokens || 0) + (item.usage.outputTokens || 0), 0);
    
    const tokensPerMinute = Math.round(recentTokens / 10);
    
    // Update UI
    document.getElementById('recentTokens').textContent = Math.round(recentTokens).toLocaleString();
    document.getElementById('tokensPerMinute').textContent = `${tokensPerMinute.toLocaleString()} tokens/min`;
    
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
    
    // Check if we have valid session data
    const hasActiveSession = this.hourlyWindowData?.windowStart !== null && this.hourlyWindowData?.windowStart !== undefined;
    const used = hasActiveSession ? (this.hourlyWindowData?.totalTokens || 0) : 0;
    const limit = limits.fiveHourTokens;
    const remaining = Math.max(0, limit - used);
    const percentage = limit > 0 ? (used / limit) * 100 : 0;
    
    // Calculate cache savings (cache tokens that don't count towards limit)
    let cacheSavings = 0;
    if (hasActiveSession && this.hourlyWindowData?.rawTotals) {
      const raw = this.hourlyWindowData.rawTotals;
      // Cache savings = cache create + cache read tokens (which don't count towards limit)
      cacheSavings = raw.cacheCreate + raw.cacheRead;
    }
    
    console.log('Updating 5-hour window:', { 
      hasActiveSession,
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
    
    // Update remaining with color based on percentage
    const remainingElement = document.getElementById('fiveHourRemaining');
    const remainingPercentage = limit > 0 ? ((remaining / limit) * 100).toFixed(1) : 0;
    remainingElement.textContent = `${remainingPercentage}% (${remaining.toLocaleString()})`;
    
    // Update remaining container style based on usage level
    const remainingContainer = remainingElement.closest('.highlight-remaining');
    if (remainingContainer) {
      if (percentage > 90) {
        remainingContainer.style.backgroundColor = 'rgba(255, 107, 107, 0.1)';
        remainingElement.style.color = '#ff6b6b';
      } else if (percentage > 70) {
        remainingContainer.style.backgroundColor = 'rgba(255, 165, 0, 0.1)';
        remainingElement.style.color = '#ffa500';
      } else {
        remainingContainer.style.backgroundColor = 'rgba(14, 99, 156, 0.1)';
        remainingElement.style.color = 'var(--primary-color)';
      }
    }
    
    document.getElementById('fiveHourPercentage').textContent = `${percentage.toFixed(1)}%`;
    
    // Update session start time
    if (hasActiveSession) {
      const startTime = new Date(this.hourlyWindowData.windowStart);
      const formattedTime = this.formatDateTime(startTime);
      document.getElementById('fiveHourSessionStart').textContent = formattedTime;
    } else {
      // No active session
      document.getElementById('fiveHourSessionStart').textContent = '-';
    }
    
    // Show cache savings
    if (cacheSavings > 0) {
      const totalWithCache = used + cacheSavings;
      const savingsPercent = ((cacheSavings / totalWithCache) * 100).toFixed(1);
      document.getElementById('fiveHourCacheSavings').textContent = 
        `${cacheSavings.toLocaleString()} tokens saved (${savingsPercent}% of total)`;
      document.getElementById('fiveHourCacheSavings').style.color = 'var(--text-secondary)';
    } else {
      document.getElementById('fiveHourCacheSavings').textContent = '0';
      document.getElementById('fiveHourCacheSavings').style.color = 'var(--text-secondary)';
    }
    
    // Update progress bar
    const progressBar = document.getElementById('fiveHourProgress');
    if (progressBar) {
      progressBar.style.width = `${Math.min(100, percentage)}%`;
      progressBar.className = `progress-bar ${percentage > 90 ? 'danger' : percentage > 70 ? 'warning' : 'safe'}`;
    }
    
    // Calculate reset time
    if (hasActiveSession) {
      // Reset time = Session start time + 5 hours
      const sessionStart = new Date(this.hourlyWindowData.windowStart);
      const resetTime = new Date(sessionStart.getTime() + (5 * 60 * 60 * 1000)); // Add 5 hours in milliseconds
      this.updateResetTime('fiveHourReset', resetTime);
    } else {
      // If no active session, don't show a reset timer
      const resetElement = document.getElementById('fiveHourReset');
      if (resetElement) {
        resetElement.textContent = '-';
        // Clear any existing interval
        if (resetElement.intervalId) {
          clearInterval(resetElement.intervalId);
          resetElement.intervalId = null;
        }
      }
    }
  }

  updateWeeklyWindow() {
    const limits = this.getSubscriptionLimits();
    
    // Check if we have valid session data
    const hasActiveSession = this.weeklyWindowData?.windowStart !== null && this.weeklyWindowData?.windowStart !== undefined;
    const used = hasActiveSession ? (this.weeklyWindowData?.totalTokens || 0) : 0;
    const limit = limits.weeklyTokens;
    const remaining = Math.max(0, limit - used);
    const percentage = limit > 0 ? (used / limit) * 100 : 0;
    
    // Calculate cache savings (cache tokens that don't count towards limit)
    let cacheSavings = 0;
    if (hasActiveSession && this.weeklyWindowData?.rawTotals) {
      const raw = this.weeklyWindowData.rawTotals;
      // Cache savings = cache create + cache read tokens (which don't count towards limit)
      cacheSavings = raw.cacheCreate + raw.cacheRead;
    }
    
    console.log('Updating weekly window:', { hasActiveSession, used, limit, remaining, percentage, cacheSavings });
    
    // Update UI
    document.getElementById('weeklyUsed').textContent = used.toLocaleString();
    document.getElementById('weeklyLimit').textContent = limit.toLocaleString();
    
    // Update remaining with color based on percentage
    const remainingElement = document.getElementById('weeklyRemaining');
    const remainingPercentage = limit > 0 ? ((remaining / limit) * 100).toFixed(1) : 0;
    remainingElement.textContent = `${remainingPercentage}% (${remaining.toLocaleString()})`;
    
    // Update remaining container style based on usage level
    const remainingContainer = remainingElement.closest('.highlight-remaining');
    if (remainingContainer) {
      if (percentage > 90) {
        remainingContainer.style.backgroundColor = 'rgba(255, 107, 107, 0.1)';
        remainingElement.style.color = '#ff6b6b';
      } else if (percentage > 70) {
        remainingContainer.style.backgroundColor = 'rgba(255, 165, 0, 0.1)';
        remainingElement.style.color = '#ffa500';
      } else {
        remainingContainer.style.backgroundColor = 'rgba(14, 99, 156, 0.1)';
        remainingElement.style.color = 'var(--primary-color)';
      }
    }
    
    document.getElementById('weeklyPercentage').textContent = `${percentage.toFixed(1)}%`;
    
    // Update session start time
    if (hasActiveSession) {
      const startTime = new Date(this.weeklyWindowData.windowStart);
      const formattedTime = this.formatDateTime(startTime);
      document.getElementById('weeklySessionStart').textContent = formattedTime;
    } else {
      // No active session
      document.getElementById('weeklySessionStart').textContent = '-';
    }
    
    // Show cache savings
    if (cacheSavings > 0) {
      const totalWithCache = used + cacheSavings;
      const savingsPercent = ((cacheSavings / totalWithCache) * 100).toFixed(1);
      document.getElementById('weeklyCacheSavings').textContent = 
        `${cacheSavings.toLocaleString()} tokens saved (${savingsPercent}% of total)`;
      document.getElementById('weeklyCacheSavings').style.color = 'var(--text-secondary)';
    } else {
      document.getElementById('weeklyCacheSavings').textContent = '0';
      document.getElementById('weeklyCacheSavings').style.color = 'var(--text-secondary)';
    }
    
    // Update progress bar
    const progressBar = document.getElementById('weeklyProgress');
    if (progressBar) {
      progressBar.style.width = `${Math.min(100, percentage)}%`;
      progressBar.className = `progress-bar ${percentage > 90 ? 'danger' : percentage > 70 ? 'warning' : 'safe'}`;
    }
    
    // Calculate reset time
    if (hasActiveSession && this.weeklyWindowData?.resetTime) {
      const resetTime = new Date(this.weeklyWindowData.resetTime);
      this.updateResetTime('weeklyReset', resetTime);
    } else {
      // If no active session, don't show a reset timer
      const resetElement = document.getElementById('weeklyReset');
      if (resetElement) {
        resetElement.textContent = '-';
        // Clear any existing interval
        if (resetElement.intervalId) {
          clearInterval(resetElement.intervalId);
          resetElement.intervalId = null;
        }
      }
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
    // Token limits based on official Anthropic documentation
    const limits = {
      pro: {
        fiveHourTokens: 19000,     // 19k tokens per 5 hours
        weeklyTokens: 304000,      // 304k tokens per week  
        messages: 45
      },
      max5x: {
        fiveHourTokens: 88000,     // 88k tokens per 5 hours
        weeklyTokens: 1408000,     // 1.408M tokens per week
        messages: 225
      },
      max20x: {
        fiveHourTokens: 220000,    // 220k tokens per 5 hours
        weeklyTokens: 2816000,     // 2.816M tokens per week
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

    // Prepare data for the past 2 weeks
    const chartData = this.prepareTwoWeeksData();
    
    // Create custom plugin to draw weekly window bars
    const weeklyWindowsPlugin = {
      id: 'weeklyWindows',
      beforeDraw: (chart) => {
        const ctx = chart.ctx;
        const chartArea = chart.chartArea;
        const xScale = chart.scales.x;
        const yScale = chart.scales.y;
        
        console.log('weeklyWindowsPlugin - weeklyWindows:', this.weeklyWindows);
        if (!this.weeklyWindows || this.weeklyWindows.length === 0) return;
        
        ctx.save();
        
        // Draw each weekly window
        this.weeklyWindows.forEach((window, index) => {
          const startDate = new Date(window.start);
          const endDate = new Date(window.end);
          
          // Calculate x positions based on dates
          const xMin = chart.scales.x.min;
          const xMax = chart.scales.x.max;
          const xRange = xMax - xMin;
          
          // Convert window dates to chart scale
          if (!chartData.rawLabels) {
            console.error('chartData.rawLabels is undefined');
            return;
          }
          
          const startIdx = Math.max(0, chartData.rawLabels.findIndex(label => {
            return new Date(label).toDateString() === startDate.toDateString();
          }));
          
          const endIdx = Math.min(chartData.rawLabels.length - 1, chartData.rawLabels.findIndex(label => {
            return new Date(label).toDateString() === endDate.toDateString();
          }));
          
          const startX = startIdx >= 0 ? xScale.getPixelForValue(startIdx) : chartArea.left;
          const endX = endIdx >= 0 ? xScale.getPixelForValue(endIdx) : xScale.getPixelForValue(chartData.labels.length - 1);
          
          // Determine if this is the previous window
          const currentWindowIndex = this.weeklyWindows.findIndex(w => w.isCurrent);
          const isPreviousWindow = currentWindowIndex > 0 && index === currentWindowIndex - 1;
          
          // Draw translucent bar with different styles for current, previous, and other windows
          if (window.isCurrent) {
            ctx.fillStyle = 'rgba(255, 107, 107, 0.2)';
            ctx.strokeStyle = 'rgba(255, 107, 107, 0.8)';
            ctx.lineWidth = 3;
            ctx.setLineDash([]);
          } else if (isPreviousWindow) {
            ctx.fillStyle = 'rgba(255, 165, 0, 0.15)'; // Orange for previous
            ctx.strokeStyle = 'rgba(255, 165, 0, 0.7)';
            ctx.lineWidth = 2.5;
            ctx.setLineDash([8, 4]);
          } else {
            ctx.fillStyle = 'rgba(255, 107, 107, 0.1)';
            ctx.strokeStyle = 'rgba(255, 107, 107, 0.5)';
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 3]);
          }
          
          // Position bars at the bottom of the chart
          const barHeight = 20;
          const barY = chartArea.bottom - (index + 1) * (barHeight + 5);
          
          // Draw the bar
          ctx.fillRect(
            startX || chartArea.left,
            barY,
            (endX || chartArea.right) - (startX || chartArea.left),
            barHeight
          );
          
          // Draw border
          ctx.strokeRect(
            startX || chartArea.left,
            barY,
            (endX || chartArea.right) - (startX || chartArea.left),
            barHeight
          );
          
          // Add text label
          ctx.font = window.isCurrent ? 'bold 11px sans-serif' : '11px sans-serif';
          
          let label;
          const limits = this.getSubscriptionLimits();
          const weeklyLimit = limits.weeklyTokens;
          const usagePercent = ((window.totalTokens / weeklyLimit) * 100).toFixed(1);
          
          if (window.isCurrent) {
            label = `Current Week: ${window.totalTokens.toLocaleString()} / ${weeklyLimit.toLocaleString()} tokens (${usagePercent}%)`;
          } else if (isPreviousWindow) {
            label = `Previous Week: ${window.totalTokens.toLocaleString()} tokens (${usagePercent}%)`;
            ctx.fillStyle = '#ffa500'; // Orange color for previous week
          } else {
            label = `Week: ${window.totalTokens.toLocaleString()} tokens (${usagePercent}%)`;
          }
          
          ctx.fillText(
            label,
            (startX || chartArea.left) + 5,
            barY + 14
          );
        });
        
        ctx.restore();
      }
    };
    
    console.log('Creating weekly chart with data:', {
      labels: chartData.labels,
      values: chartData.values,
      hasValues: chartData.values.some(v => v > 0)
    });
    
    this.weeklyChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: chartData.labels,
        datasets: [{
          label: 'Daily Token Usage',
          data: chartData.values,
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
              color: '#969696',
              maxRotation: 45,
              minRotation: 45
            }
          },
          y: {
            grid: {
              color: '#3a3a3c'
            },
            ticks: {
              color: '#969696',
              callback: function(value) {
                if (value >= 1000000) {
                  return (value / 1000000).toFixed(1) + 'M';
                } else if (value >= 1000) {
                  return (value / 1000).toFixed(0) + 'K';
                }
                return value.toLocaleString();
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
        },
        layout: {
          padding: {
            bottom: Math.max(50, (this.weeklyWindows ? this.weeklyWindows.length : 0) * 25 + 10)
          }
        }
      },
      plugins: [weeklyWindowsPlugin]
    });
  }

  prepareTwoWeeksData() {
    const labels = [];
    const values = [];
    
    console.log('prepareTwoWeeksData - twoWeeksData:', this.twoWeeksData?.length, 'items');
    console.log('prepareTwoWeeksData - weeklyWindows:', this.weeklyWindows);
    
    // Debug: show sample data
    if (this.twoWeeksData && this.twoWeeksData.length > 0) {
      console.log('Sample twoWeeksData item:', this.twoWeeksData[0]);
    }
    
    // Generate labels for past 14 days
    for (let i = 13; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      date.setHours(0, 0, 0, 0);
      date.setMilliseconds(0);
      labels.push(date.toISOString());
      
      // Calculate daily usage from two weeks data
      const dayStart = new Date(date);
      const dayEnd = new Date(date);
      dayEnd.setHours(23, 59, 59, 999);
      
      const itemsInDay = (this.twoWeeksData || [])
        .filter(item => {
          const itemDate = new Date(item.timestamp);
          return itemDate >= dayStart && itemDate <= dayEnd;
        });
      
      // Debug each day
      if (i === 13 || i === 0 || itemsInDay.length > 0) {
        console.log(`Day ${14-i} (${dayStart.toLocaleDateString()}):`, 
                    itemsInDay.length, 'items, total:', 
                    itemsInDay.reduce((sum, item) => sum + (item.usage.effectiveTotal || item.usage.total || 0), 0));
      }
      
      const dayUsage = itemsInDay.reduce((sum, item) => {
        const tokenValue = item.usage.effectiveTotal || item.usage.total || 0;
        return sum + tokenValue;
      }, 0);
      
      values.push(dayUsage);
    }
    
    console.log('prepareTwoWeeksData - values:', values);
    
    // If no data, create some dummy data for testing
    if (values.every(v => v === 0) && this.twoWeeksData && this.twoWeeksData.length > 0) {
      console.warn('All values are 0, but we have data. Checking data structure...');
      
      // Group all data by date
      const dataByDate = {};
      this.twoWeeksData.forEach(item => {
        const date = new Date(item.timestamp).toLocaleDateString();
        if (!dataByDate[date]) {
          dataByDate[date] = 0;
        }
        dataByDate[date] += item.usage.effectiveTotal || item.usage.total || 0;
      });
      
      console.log('Data grouped by date:', dataByDate);
      
      // Use the grouped data instead
      for (let i = 0; i < 14; i++) {
        const date = new Date();
        date.setDate(date.getDate() - (13 - i));
        const dateKey = date.toLocaleDateString();
        values[i] = dataByDate[dateKey] || 0;
      }
    }
    
    // Format labels for display
    const displayLabels = labels.map(label => {
      const date = new Date(label);
      return date.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric' 
      });
    });
    
    return { labels: displayLabels, values, rawLabels: labels };
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
if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
      window.nowManager = new NowManager();
    }, 100);
  });
}

// Export for testing
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { NowManager };
}