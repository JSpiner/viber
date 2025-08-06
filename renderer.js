// Tab switching functionality
document.addEventListener('DOMContentLoaded', () => {
  const navItems = document.querySelectorAll('.nav-item');
  const contentPanels = document.querySelectorAll('.content-panel');

  function switchToTab(targetTab) {
    // Get previous tab before changing active states
    const previousTab = document.querySelector('.content-panel.active')?.id;
    
    navItems.forEach(navItem => navItem.classList.remove('active'));
    contentPanels.forEach(panel => panel.classList.remove('active'));
    
    // Find and activate the target tab
    const targetNavItem = document.querySelector(`[data-tab="${targetTab}"]`);
    const targetPanel = document.getElementById(targetTab);
    
    if (targetNavItem && targetPanel) {
      targetNavItem.classList.add('active');
      targetPanel.classList.add('active');
    }

    // Clean up previous tab if needed
    if (previousTab === 'now' && targetTab !== 'now') {
      // Stop the second-by-second updates when leaving Now tab
      window.nowManager?.destroy();
    }
    
    // Load data when tabs are activated
    if (targetTab === 'statistics') {
      setTimeout(() => window.statisticsManager?.loadStatistics(), 100);
    } else if (targetTab === 'now') {
      setTimeout(() => window.nowManager?.loadNowData(), 100);
    } else if (targetTab === 'agents') {
      setTimeout(() => {
        if (typeof window.initializeAgentsUI === 'function') {
          window.initializeAgentsUI();
        }
      }, 100);
    }
  }

  navItems.forEach(item => {
    item.addEventListener('click', () => {
      const targetTab = item.getAttribute('data-tab');
      switchToTab(targetTab);
    });
  });

  // Listen for tab switch requests from main process
  window.electronAPI.onSwitchTab((event, tabName) => {
    switchToTab(tabName);
  });
  
  // Load Now tab data on startup since it's the default tab
  setTimeout(() => {
    console.log('Loading Now tab data on startup...');
    window.nowManager?.loadNowData();
  }, 500);
});