// Now tab functionality for real-time token usage monitoring
class NowManager {
  constructor() {
    this.recentUsageData = [];
    this.hourlyWindowData = null;
    this.weeklyWindowData = null;
    this.fiveHourChart = null;
    this.weeklyChart = null;
    this.updateInterval = null;
    
    // Default value, will be loaded async from electron-store
    this.subscriptionTier = 'pro'; // 'pro', 'max5x', 'max20x'
    
    // Load subscription tier from electron-store via IPC
    this.loadSubscriptionTier();
    
    this.initializeEventListeners();
  }

  async loadSubscriptionTier() {
    try {
      const tier = await window.electronAPI.getSubscriptionTier();
      console.log('[NowManager] Loaded subscription tier from electron-store:', tier);
      this.subscriptionTier = tier || 'pro';
      
      // Update dropdown if it exists
      const tierSelector = document.getElementById('subscriptionTier');
      if (tierSelector) {
        console.log('[NowManager] Setting dropdown to loaded value:', this.subscriptionTier);
        tierSelector.value = this.subscriptionTier;
      }
      
      // Update display after loading tier
      if (this.recentUsageData.length > 0) {
        this.updateDisplay();
      }
    } catch (error) {
      console.error('[NowManager] Error loading subscription tier:', error);
      this.subscriptionTier = 'pro';
    }
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
    // Wait for next tick to ensure DOM is ready - increased delay to ensure DOM is fully loaded
    setTimeout(() => {
      const tierSelector = document.getElementById('subscriptionTier');
      console.log('[initializeEventListeners] Looking for dropdown element...');
      
      if (tierSelector) {
        console.log('[initializeEventListeners] Dropdown found!');
        console.log('[initializeEventListeners] Current dropdown value before setting:', tierSelector.value);
        console.log('[initializeEventListeners] Available options:', Array.from(tierSelector.options).map(o => o.value));
        console.log('[initializeEventListeners] Trying to set to:', this.subscriptionTier);
        
        // Set the selected value from localStorage
        tierSelector.value = this.subscriptionTier;
        console.log('[initializeEventListeners] Dropdown value after setting:', tierSelector.value);
        
        // Verify the value was actually set by checking if it matches
        if (tierSelector.value !== this.subscriptionTier) {
          console.log('[initializeEventListeners] Direct assignment failed, trying alternative method...');
          // Try setting by finding the matching option
          const matchingOption = Array.from(tierSelector.options).find(opt => opt.value === this.subscriptionTier);
          if (matchingOption) {
            matchingOption.selected = true;
            console.log('[initializeEventListeners] Set using option.selected = true');
          } else {
            console.log('[initializeEventListeners] ERROR: No matching option found for:', this.subscriptionTier);
          }
        }
        
        tierSelector.addEventListener('change', async (e) => {
          console.log('[Dropdown Change Event] New value:', e.target.value);
          this.subscriptionTier = e.target.value;
          
          // Save to electron-store via IPC
          try {
            const success = await window.electronAPI.setSubscriptionTier(this.subscriptionTier);
            console.log('[Dropdown Change Event] Saved to electron-store:', this.subscriptionTier, 'Success:', success);
          } catch (error) {
            console.error('[Dropdown Change Event] Error saving subscription tier:', error);
          }
          
          this.updateDisplay();
        });
      } else {
        console.log('[initializeEventListeners] ERROR: Dropdown element not found!');
      }
    }, 100); // Increased delay from 0 to 100ms
  }

  ensureDropdownValueSet() {
    const tierSelector = document.getElementById('subscriptionTier');
    if (tierSelector && tierSelector.value !== this.subscriptionTier) {
      tierSelector.value = this.subscriptionTier;
      
      // If still not set correctly, try the alternate approach
      if (tierSelector.value !== this.subscriptionTier) {
        const matchingOption = Array.from(tierSelector.options).find(opt => opt.value === this.subscriptionTier);
        if (matchingOption) {
          matchingOption.selected = true;
        }
      }
    }
  }

  async loadNowData() {
    console.log('loadNowData called');
    
    // Re-initialize dropdown value to ensure it's set correctly
    this.ensureDropdownValueSet();
    
    try {
      // Load recent token usage data
      console.log('Calling electronAPI.loadRecentUsage...');
      const result = await window.electronAPI.loadRecentUsage();
      console.log('Result from loadRecentUsage:', result);
      
      if (result.success) {
        this.recentUsageData = result.data.recent;
        this.twelveHourData = result.data.twelveHourData || [];
        this.hourlyWindowData = result.data.hourlyWindow;
        this.weeklyWindowData = result.data.weeklyWindow;
        this.twoWeeksData = result.data.twoWeeksData || [];
        this.weeklyWindows = result.data.weeklyWindows || [];
        
        console.log('Data loaded successfully:', {
          recent: this.recentUsageData.length,
          twelveHour: this.twelveHourData.length,
          hourlyWindow: this.hourlyWindowData,
          weeklyWindow: this.weeklyWindowData,
          twoWeeksData: this.twoWeeksData?.length,
          weeklyWindows: this.weeklyWindows?.length
        });
        
        // Log sample of twelveHourData
        if (this.twelveHourData.length > 0) {
          console.log('Sample twelveHourData:', this.twelveHourData.slice(0, 3));
        }
        
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
    // Token limits based on official Anthropic documentation (2x increased)
    const limits = {
      pro: {
        fiveHourTokens: 38000,     // 38k tokens per 5 hours
        weeklyTokens: 608000,      // 608k tokens per week  
        messages: 45
      },
      max5x: {
        fiveHourTokens: 176000,    // 176k tokens per 5 hours
        weeklyTokens: 2816000,     // 2.816M tokens per week
        messages: 225
      },
      max20x: {
        fiveHourTokens: 440000,    // 440k tokens per 5 hours
        weeklyTokens: 5632000,     // 5.632M tokens per week
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

    // Prepare timeline data for last 12 hours
    const chartData = this.prepareFiveHourData();
    const limits = this.getSubscriptionLimits();
    
    // Prepare session windows data (current and previous)
    const sessionWindows = this.prepareFiveHourSessions();

    // Store session data for tooltip access
    const sessionData = sessionWindows;
    
    // Create custom plugin to draw session window bars
    const sessionWindowsPlugin = {
      id: 'sessionWindows',
      afterDatasetsDraw: (chart) => {
        const ctx = chart.ctx;
        const chartArea = chart.chartArea;
        const xScale = chart.scales.x;
        
        if (!sessionWindows || sessionWindows.length === 0) return;
        
        ctx.save();
        
        // Store session rectangles for hover detection
        chart.sessionRects = [];
        
        // Draw each session window
        sessionWindows.forEach((session, index) => {
          if (!session) return;
          
          const startDate = new Date(session.start);
          const endDate = new Date(session.end);
          
          // Find indices for start and end times
          const startIdx = chartData.timestamps.findIndex(ts => {
            const tsDate = new Date(ts);
            return tsDate >= startDate;
          });
          
          const endIdx = chartData.timestamps.findIndex(ts => {
            const tsDate = new Date(ts);
            return tsDate >= endDate;
          });
          
          if (startIdx === -1) return;
          
          const actualEndIdx = endIdx === -1 ? chartData.timestamps.length - 1 : endIdx;
          const startX = xScale.getPixelForValue(startIdx);
          const endX = xScale.getPixelForValue(actualEndIdx);
          
          // Position bars at the bottom
          const barHeight = 20;
          const barY = chartArea.bottom - (index + 1) * (barHeight + 5);
          
          // Style based on session type
          if (session.isCurrent) {
            ctx.fillStyle = 'rgba(255, 107, 107, 0.2)';
            ctx.strokeStyle = 'rgba(255, 107, 107, 0.8)';
            ctx.lineWidth = 3;
            ctx.setLineDash([]);
          } else {
            // Previous session
            ctx.fillStyle = 'rgba(255, 165, 0, 0.15)';
            ctx.strokeStyle = 'rgba(255, 165, 0, 0.7)';
            ctx.lineWidth = 2.5;
            ctx.setLineDash([8, 4]);
          }
          
          // Draw the bar
          ctx.fillRect(startX, barY, endX - startX, barHeight);
          ctx.strokeRect(startX, barY, endX - startX, barHeight);
          
          // Store rectangle for hover detection
          chart.sessionRects.push({
            x: startX,
            y: barY,
            width: endX - startX,
            height: barHeight,
            session: session
          });
          
          // Add text label
          ctx.font = session.isCurrent ? 'bold 11px sans-serif' : '11px sans-serif';
          ctx.fillStyle = session.isCurrent ? '#ff6b6b' : '#ffa500';
          
          const usagePercent = ((session.totalTokens / limits.fiveHourTokens) * 100).toFixed(1);
          let label;
          
          if (session.isCurrent) {
            // Current session: "current (XX%) - Xh Xm left"
            const timeInfo = session.timeRemaining ? ` - ${session.timeRemaining}` : '';
            label = `current (${usagePercent}%)${timeInfo}`;
          } else {
            // Previous session: "prev (XX%)"
            label = `prev (${usagePercent}%)`;
          }
          
          ctx.fillText(label, startX + 5, barY + 14);
        });
        
        ctx.restore();
      }
    };

    // Create labels with only hourly marks (every other label since we have 30-min intervals)
    const displayLabels = chartData.labels.map((label, index) => {
      // Show label only for even indices (every hour since intervals are 30 min)
      // The labels at even indices should be on the hour (00 minutes)
      if (index % 2 === 0) {
        return label;
      }
      return null;  // null to completely hide 30-min marks
    });

    this.fiveHourChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: displayLabels,  // Use the modified labels
        datasets: [{
          label: 'Token Usage',
          data: chartData.values,
          borderColor: '#0e639c',
          backgroundColor: 'rgba(14, 99, 156, 0.1)',
          borderWidth: 2,
          tension: 0.4,
          fill: true,
          spanGaps: true,  // Connect points even if there are gaps in data
          pointRadius: 3,  // Show all points
          pointBackgroundColor: '#0e639c',
          pointBorderColor: '#0e639c',
          pointHoverRadius: 5,
          pointHoverBackgroundColor: '#0e639c',
          pointHoverBorderColor: '#fff',
          pointHoverBorderWidth: 2
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
              minRotation: 45,
              autoSkip: false,  // Don't auto-skip, we've already filtered
              // Filter out null labels
              callback: function(value, index, ticks) {
                const label = this.getLabelForValue(value);
                return label !== null ? label : undefined;
              }
            }
          },
          y: {
            beginAtZero: true,
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
            display: false
          },
          tooltip: {
            enabled: false  // Disable all tooltips for line graph
          }
        }
      },
      plugins: [sessionWindowsPlugin]
    });
    
    // Add mouse move event handler for custom tooltip
    ctx.canvas.addEventListener('mousemove', (e) => {
      const rect = ctx.canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      
      if (!this.fiveHourChart.sessionRects) return;
      
      let tooltipEl = document.getElementById('chartjs-session-tooltip');
      
      // Create tooltip element if it doesn't exist
      if (!tooltipEl) {
        tooltipEl = document.createElement('div');
        tooltipEl.id = 'chartjs-session-tooltip';
        tooltipEl.style.background = 'rgba(0, 0, 0, 0.9)';
        tooltipEl.style.border = '1px solid #444';
        tooltipEl.style.borderRadius = '4px';
        tooltipEl.style.color = '#fff';
        tooltipEl.style.opacity = '0';
        tooltipEl.style.pointerEvents = 'none';
        tooltipEl.style.position = 'absolute';
        tooltipEl.style.padding = '10px';
        tooltipEl.style.fontSize = '12px';
        tooltipEl.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        tooltipEl.style.zIndex = '10000';
        tooltipEl.style.transition = 'opacity 0.2s ease';
        tooltipEl.style.boxShadow = '0 2px 8px rgba(0,0,0,0.3)';
        document.body.appendChild(tooltipEl);
      }
      
      // Check if hovering over a session bar
      let hoveredSession = null;
      for (const rectData of this.fiveHourChart.sessionRects) {
        if (x >= rectData.x && x <= rectData.x + rectData.width &&
            y >= rectData.y && y <= rectData.y + rectData.height) {
          hoveredSession = rectData.session;
          break;
        }
      }
      
      if (hoveredSession) {
        // Format times for display
        const startTime = new Date(hoveredSession.start);
        const endTime = new Date(hoveredSession.end);
        const now = new Date();
        
        // For current session, use current time if session hasn't ended yet
        const effectiveEndTime = hoveredSession.isCurrent && endTime > now ? now : endTime;
        const duration = (effectiveEndTime - startTime) / (1000 * 60 * 60); // in hours
        
        const formatTime = (date) => {
          const hours = String(date.getHours()).padStart(2, '0');
          const minutes = String(date.getMinutes()).padStart(2, '0');
          const seconds = String(date.getSeconds()).padStart(2, '0');
          return `${hours}:${minutes}:${seconds}`;
        };
        
        const formatDuration = (hours) => {
          const h = Math.floor(hours);
          const m = Math.round((hours - h) * 60);
          if (h > 0 && m > 0) {
            return `${h}h ${m}m`;
          } else if (h > 0) {
            return `${h}h`;
          } else {
            return `${m}m`;
          }
        };
        
        // Build tooltip content
        const sessionType = hoveredSession.isCurrent ? 
          '<span style="color: #ff6b6b;">Current Session</span>' : 
          '<span style="color: #ffa500;">Previous Session</span>';
        
        tooltipEl.innerHTML = `
          <div style="font-weight: bold; margin-bottom: 6px; font-size: 13px;">${sessionType}</div>
          <div style="margin-bottom: 3px;"><span style="color: #999;">Start:</span> ${formatTime(startTime)}</div>
          <div style="margin-bottom: 3px;"><span style="color: #999;">End:</span> ${formatTime(endTime)}</div>
          <div style="margin-bottom: 3px;"><span style="color: #999;">Duration:</span> ${formatDuration(duration)}</div>
          <div style="margin-top: 6px; padding-top: 6px; border-top: 1px solid #444;">
            <span style="color: #999;">Tokens Used:</span> <strong>${hoveredSession.totalTokens.toLocaleString()}</strong>
          </div>
        `;
        
        // Position tooltip
        tooltipEl.style.opacity = '1';
        tooltipEl.style.left = (rect.left + x + 10) + 'px';
        tooltipEl.style.top = (rect.top + y - 80) + 'px';
      } else {
        // Hide tooltip when not hovering over session bar
        tooltipEl.style.opacity = '0';
      }
    });
    
    // Hide tooltip when mouse leaves canvas
    ctx.canvas.addEventListener('mouseleave', () => {
      const tooltipEl = document.getElementById('chartjs-session-tooltip');
      if (tooltipEl) {
        tooltipEl.style.opacity = '0';
      }
    });
  }

  prepareFiveHourData() {
    // Prepare data for the 12-hour timeline
    const labels = [];
    const values = [];
    const timestamps = [];
    const now = new Date();
    
    // Use the 12-hour data from backend
    const allData = this.twelveHourData || [];
    
    console.log('prepareFiveHourData - using twelveHourData:', allData.length, 'items');
    
    // Determine the actual time range of the data
    let startTime, endTime;
    
    if (allData.length > 0) {
      // Find the actual time range of the data
      const times = allData.map(item => new Date(item.timestamp).getTime());
      const minTime = Math.min(...times);
      const maxTime = Math.max(...times);
      
      // Use the actual data range, extended to 12 hours if less
      startTime = new Date(minTime);
      endTime = new Date(maxTime);
      
      // Ensure we show at least 12 hours
      const rangeMs = endTime - startTime;
      const twelveHoursMs = 12 * 60 * 60 * 1000;
      
      if (rangeMs < twelveHoursMs) {
        // Center the data in a 12-hour window
        const padding = (twelveHoursMs - rangeMs) / 2;
        startTime = new Date(startTime.getTime() - padding);
        endTime = new Date(endTime.getTime() + padding);
      }
    } else {
      // No data, show the last 12 hours from now
      endTime = now;
      startTime = new Date(now.getTime() - 12 * 60 * 60 * 1000);
    }
    
    // Round start time down to the nearest hour
    startTime = new Date(startTime);
    startTime.setMinutes(0, 0, 0);
    
    // Adjust end time to be exactly 12 hours from start
    endTime = new Date(startTime.getTime() + 12 * 60 * 60 * 1000);
    
    console.log('prepareFiveHourData - time range:', {
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
      dataPoints: allData.length
    });
    
    // Create 30-minute intervals
    const intervals = 24; // 12 hours / 30 minutes = 24 intervals
    const intervalMs = 30 * 60 * 1000; // 30 minutes in ms
    
    // Generate intervals based on the actual time range
    for (let i = 0; i < intervals; i++) {
      const intervalStart = new Date(startTime.getTime() + i * intervalMs);
      const intervalEnd = new Date(intervalStart.getTime() + intervalMs);
      
      // Count ALL tokens in this interval
      const intervalTokens = allData
        .filter(item => {
          const itemTime = new Date(item.timestamp);
          return itemTime >= intervalStart && itemTime < intervalEnd;
        })
        .reduce((sum, item) => sum + (item.usage.effectiveTotal || 0), 0);
      
      // Format time label - for hourly intervals, show simpler format
      let timeLabel;
      if (intervalStart.getMinutes() === 0) {
        // On the hour - show in format like "9:00 AM", "12:00 PM"
        timeLabel = intervalStart.toLocaleTimeString('en-US', { 
          hour: 'numeric',
          minute: '2-digit',
          hour12: true
        });
      } else {
        // 30-minute mark - still include for data but will be hidden
        timeLabel = intervalStart.toLocaleTimeString('en-US', { 
          hour: '2-digit', 
          minute: '2-digit' 
        });
      }
      
      labels.push(timeLabel);
      values.push(intervalTokens);
      timestamps.push(intervalStart.toISOString());
      
      if (intervalTokens > 0) {
        console.log(`Interval ${i} (${timeLabel}): ${intervalTokens} tokens`);
      }
    }
    
    console.log('prepareFiveHourData - chart data:', { 
      intervalsWithData: values.filter(v => v > 0).length,
      totalTokens: values.reduce((sum, v) => sum + v, 0),
      maxTokensInInterval: Math.max(...values)
    });
    
    return { labels, values, timestamps };
  }

  prepareFiveHourSessions() {
    // Prepare current and previous 5-hour session windows
    const sessions = [];
    const now = new Date();
    const limits = this.getSubscriptionLimits();
    
    // Current session
    if (this.hourlyWindowData?.windowStart) {
      const sessionStart = new Date(this.hourlyWindowData.windowStart);
      const sessionEnd = new Date(sessionStart.getTime() + 5 * 60 * 60 * 1000);
      const timeRemaining = Math.max(0, sessionEnd - now);
      const hoursRemaining = Math.floor(timeRemaining / (1000 * 60 * 60));
      const minutesRemaining = Math.floor((timeRemaining % (1000 * 60 * 60)) / (1000 * 60));
      
      sessions.push({
        start: sessionStart.toISOString(),
        end: sessionEnd.toISOString(),
        totalTokens: this.hourlyWindowData.totalTokens || 0,
        isCurrent: true,
        timeRemaining: hoursRemaining > 0 ? `${hoursRemaining}h ${minutesRemaining}m left` : `${minutesRemaining}m left`
      });
    }
    
    // Find previous session (look for 5+ hour gap before current session)
    // Use twelveHourData which has more complete data
    if (this.twelveHourData && this.twelveHourData.length > 0) {
      const sortedData = [...this.twelveHourData].sort((a, b) => 
        new Date(a.timestamp) - new Date(b.timestamp)
      );
      
      // If there's a current session, look for sessions before it
      const currentSessionStart = this.hourlyWindowData?.windowStart ? 
        new Date(this.hourlyWindowData.windowStart) : now;
      
      // Find messages before current session
      const beforeCurrent = sortedData.filter(item => 
        new Date(item.timestamp) < currentSessionStart
      );
      
      if (beforeCurrent.length > 0) {
        // Look for the most recent session before current
        // Work backwards to find session boundaries
        let prevSessionEnd = null;
        let prevSessionStart = null;
        
        for (let i = beforeCurrent.length - 1; i > 0; i--) {
          const current = new Date(beforeCurrent[i].timestamp);
          const previous = new Date(beforeCurrent[i - 1].timestamp);
          const gapHours = (current - previous) / (1000 * 60 * 60);
          
          if (gapHours >= 5) {
            // Found a session boundary
            prevSessionEnd = current;
            prevSessionStart = current;
            
            // Find the actual start of this session
            for (let j = i; j < beforeCurrent.length; j++) {
              const msgTime = new Date(beforeCurrent[j].timestamp);
              if (j === beforeCurrent.length - 1 || 
                  (new Date(beforeCurrent[j + 1].timestamp) - msgTime) / (1000 * 60 * 60) >= 5) {
                prevSessionEnd = msgTime;
                break;
              }
            }
            break;
          }
        }
        
        // If no gap found, the entire range before current is one session
        if (!prevSessionStart) {
          prevSessionStart = new Date(beforeCurrent[0].timestamp);
          prevSessionEnd = new Date(beforeCurrent[beforeCurrent.length - 1].timestamp);
        }
        
        // Calculate tokens for previous session
        const sessionData = sortedData.filter(item => {
          const itemTime = new Date(item.timestamp);
          return itemTime >= prevSessionStart && 
                 itemTime < new Date(Math.min(prevSessionEnd.getTime() + 5 * 60 * 60 * 1000, 
                                              currentSessionStart.getTime()));
        });
        
        const prevTokens = sessionData.reduce((sum, item) => 
          sum + (item.usage.effectiveTotal || 0), 0
        );
        
        if (prevTokens > 0) {
          sessions.push({
            start: prevSessionStart.toISOString(),
            end: new Date(Math.min(
              prevSessionStart.getTime() + 5 * 60 * 60 * 1000,
              prevSessionEnd.getTime()
            )).toISOString(),
            totalTokens: prevTokens,
            isCurrent: false
          });
        }
      }
    }
    
    return sessions;
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
      afterDatasetsDraw: (chart) => {
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