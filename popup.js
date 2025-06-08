/**
 * Photonic Popup
 * Provides quick access to extension functions
 */

document.addEventListener('DOMContentLoaded', function() {
  // DOM elements
  const studyCountElement = document.getElementById('studyCount');
  const cacheSizeElement = document.getElementById('cacheSize');
  const cacheUsageElement = document.getElementById('cacheUsage');
  const openSettingsButton = document.getElementById('openSettings');
  const forcePollButton = document.getElementById('forcePoll');
  const flushCacheButton = document.getElementById('flushCache');
  const studyManagerButton = document.getElementById('studyManager');
  
  // Load cache stats
  updateCacheStats();
  
  // Add event listeners
  if (openSettingsButton) {
    openSettingsButton.addEventListener('click', function() {
      chrome.runtime.openOptionsPage();
    });
  }
  
  if (forcePollButton) {
    forcePollButton.addEventListener('click', function() {
      forcePollButton.textContent = 'Polling...';
      forcePollButton.disabled = true;
      
      chrome.runtime.sendMessage('forcePoll', function(response) {
        forcePollButton.textContent = 'Force Poll Now';
        forcePollButton.disabled = false;
        
        if (response === 'ok') {
          showNotification('Polling completed successfully');
          setTimeout(updateCacheStats, 500);
        } else {
          showNotification('Polling failed. Check settings.', 'error');
        }
      });
    });
  }
  
  if (flushCacheButton) {
    flushCacheButton.addEventListener('click', function() {
      if (confirm('Are you sure you want to delete all cached studies?')) {
        flushCacheButton.textContent = 'Flushing...';
        flushCacheButton.disabled = true;
        
        chrome.runtime.sendMessage('flushCache', function(response) {
          flushCacheButton.textContent = 'Flush Cache';
          flushCacheButton.disabled = false;
          
          if (response === 'flushed') {
            showNotification('Cache flushed successfully');
            setTimeout(updateCacheStats, 500);
          } else {
            showNotification('Failed to flush cache', 'error');
          }
        });
      }
    });
  }
  
  if (studyManagerButton) {
    studyManagerButton.addEventListener('click', function() {
      // Open the study manager in a new tab
      chrome.tabs.create({
        url: chrome.runtime.getURL('study-manager.html')
      });
    });
  }
  
  /**
   * Updates the cache statistics display
   */
  function updateCacheStats() {
    chrome.runtime.sendMessage({ cmd: 'dumpCache' }, function(studies) {
      if (chrome.runtime.lastError) {
        console.error('Error getting cache stats:', chrome.runtime.lastError);
        return;
      }
      
      if (studyCountElement) {
        studyCountElement.textContent = studies ? studies.length : 0;
      }
      
      if (cacheSizeElement && studies) {
        const totalBytes = studies.reduce((sum, study) => sum + (study.size || 0), 0);
        cacheSizeElement.textContent = (totalBytes / 1048576).toFixed(1) + ' MB';
      }
      
      // Get settings to calculate quota usage
      chrome.storage.local.get(['settings'], function(result) {
        if (result.settings && cacheUsageElement && studies) {
          const totalBytes = studies.reduce((sum, study) => sum + (study.size || 0), 0);
          const maxBytes = parseFloat(result.settings.maxGB || 50) * 1073741824;
          const percentage = maxBytes > 0 ? Math.round((totalBytes / maxBytes) * 100) : 0;
          cacheUsageElement.textContent = percentage + '%';
        }
      });
    });
  }
  
  /**
   * Shows a notification in the popup
   * @param {string} message - The message to display
   * @param {string} type - The message type (success, error)
   */
  function showNotification(message, type = 'success') {
    // Create notification element if it doesn't exist
    let notification = document.getElementById('notification');
    if (!notification) {
      notification = document.createElement('div');
      notification.id = 'notification';
      notification.style.position = 'fixed';
      notification.style.bottom = '16px';
      notification.style.left = '16px';
      notification.style.right = '16px';
      notification.style.padding = '8px 12px';
      notification.style.borderRadius = '4px';
      notification.style.textAlign = 'center';
      notification.style.transition = 'opacity 0.3s';
      document.body.appendChild(notification);
    }
    
    // Set notification style based on type
    if (type === 'success') {
      notification.style.backgroundColor = '#dff6dd';
      notification.style.color = '#107c10';
    } else {
      notification.style.backgroundColor = '#fde7e9';
      notification.style.color = '#d83b01';
    }
    
    // Set message and show notification
    notification.textContent = message;
    notification.style.opacity = '1';
    
    // Hide notification after 3 seconds
    setTimeout(function() {
      notification.style.opacity = '0';
    }, 3000);
  }
});