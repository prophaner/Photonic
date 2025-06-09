/**
 * Photonic Popup
 * Provides quick access to extension functions
 */

document.addEventListener('DOMContentLoaded', function() {
  // DOM elements
  const studyCountElement = document.getElementById('studyCount');
  const cacheSizeElement = document.getElementById('cacheSize');
  const vaultButton = document.getElementById('vaultButton');
  const cacheButton = document.getElementById('cacheButton');
  const accountButton = document.getElementById('accountButton');
  const logsButton = document.getElementById('logsButton');

  // Load cache stats
  updateCacheStats();

  // Add event listeners for the new icon buttons
  if (vaultButton) {
    vaultButton.addEventListener('click', function() {
      // Open the Photonic Vault (renamed from Study Manager) in a new tab
      chrome.tabs.create({
        url: chrome.runtime.getURL('study-manager.html')
      });
    });
  }

  if (cacheButton) {
    cacheButton.addEventListener('click', function() {
      // Show cache settings in a modal
      chrome.storage.local.get(['settings'], function(result) {
        const settings = result.settings || {};

        // Create and show a modal with cache settings
        const modal = document.createElement('div');
        modal.style.position = 'fixed';
        modal.style.top = '0';
        modal.style.left = '0';
        modal.style.width = '100%';
        modal.style.height = '100%';
        modal.style.backgroundColor = 'rgba(0,0,0,0.5)';
        modal.style.zIndex = '1000';
        modal.style.display = 'flex';
        modal.style.justifyContent = 'center';
        modal.style.alignItems = 'center';

        const content = document.createElement('div');
        content.style.backgroundColor = 'white';
        content.style.padding = '20px';
        content.style.borderRadius = '8px';
        content.style.width = '80%';
        content.style.maxWidth = '300px';

        content.innerHTML = `
          <h3 style="margin-top: 0; color: #0078d4;">Cache Settings</h3>
          <div style="margin-bottom: 15px;">
            <label style="display: block; margin-bottom: 5px; font-weight: 500;">Maximum Size (GB):</label>
            <input type="number" id="maxGB" min="1" max="100" value="${settings.maxGB || 10}" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
          </div>
          <div style="margin-bottom: 15px;">
            <label style="display: block; margin-bottom: 5px; font-weight: 500;">Auto-delete After (days):</label>
            <input type="number" id="ttlDays" min="1" max="30" value="${settings.ttlDays || 7}" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
          </div>
          <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px;">
            <button id="cancelBtn" style="padding: 8px 16px; background: #f0f0f0; color: #333; border: none; border-radius: 4px; cursor: pointer;">Cancel</button>
            <button id="saveBtn" style="padding: 8px 16px; background: #0078d4; color: white; border: none; border-radius: 4px; cursor: pointer;">Save</button>
          </div>
        `;

        modal.appendChild(content);
        document.body.appendChild(modal);

        // Add event listeners for the modal buttons
        document.getElementById('cancelBtn').addEventListener('click', function() {
          document.body.removeChild(modal);
        });

        document.getElementById('saveBtn').addEventListener('click', function() {
          const maxGB = document.getElementById('maxGB').value;
          const ttlDays = document.getElementById('ttlDays').value;

          // Update settings
          chrome.storage.local.get(['settings'], function(result) {
            const updatedSettings = result.settings || {};
            updatedSettings.maxGB = maxGB;
            updatedSettings.ttlDays = ttlDays;

            chrome.storage.local.set({ settings: updatedSettings }, function() {
              document.body.removeChild(modal);
              showNotification('Cache settings saved');
              updateCacheStats();
            });
          });
        });
      });
    });
  }

  if (accountButton) {
    accountButton.addEventListener('click', function() {
      // Show account information in a modal
      chrome.storage.local.get(['settings'], function(result) {
        const settings = result.settings || {};

        // Create and show a modal with account information
        const modal = document.createElement('div');
        modal.style.position = 'fixed';
        modal.style.top = '0';
        modal.style.left = '0';
        modal.style.width = '100%';
        modal.style.height = '100%';
        modal.style.backgroundColor = 'rgba(0,0,0,0.5)';
        modal.style.zIndex = '1000';
        modal.style.display = 'flex';
        modal.style.justifyContent = 'center';
        modal.style.alignItems = 'center';

        const content = document.createElement('div');
        content.style.backgroundColor = 'white';
        content.style.padding = '20px';
        content.style.borderRadius = '8px';
        content.style.width = '80%';
        content.style.maxWidth = '300px';

        content.innerHTML = `
          <h3 style="margin-top: 0; color: #0078d4;">Account Information</h3>
          <div style="margin-bottom: 15px;">
            <label style="display: block; margin-bottom: 5px; font-weight: 500;">Username:</label>
            <input type="text" id="username" value="${settings.username || ''}" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
          </div>
          <div style="margin-bottom: 15px;">
            <label style="display: block; margin-bottom: 5px; font-weight: 500;">Password:</label>
            <input type="password" id="password" placeholder="••••••••" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
          </div>
          <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px;">
            <button id="cancelBtn" style="padding: 8px 16px; background: #f0f0f0; color: #333; border: none; border-radius: 4px; cursor: pointer;">Cancel</button>
            <button id="saveBtn" style="padding: 8px 16px; background: #0078d4; color: white; border: none; border-radius: 4px; cursor: pointer;">Save</button>
          </div>
        `;

        modal.appendChild(content);
        document.body.appendChild(modal);

        // Add event listeners for the modal buttons
        document.getElementById('cancelBtn').addEventListener('click', function() {
          document.body.removeChild(modal);
        });

        document.getElementById('saveBtn').addEventListener('click', function() {
          const username = document.getElementById('username').value;
          const password = document.getElementById('password').value;

          // Update settings
          chrome.storage.local.get(['settings'], function(result) {
            const updatedSettings = result.settings || {};
            updatedSettings.username = username;
            if (password) {
              updatedSettings.password = password;
            }

            chrome.storage.local.set({ settings: updatedSettings }, function() {
              document.body.removeChild(modal);
              showNotification('Account information saved');
            });
          });
        });
      });
    });
  }

  if (logsButton) {
    logsButton.addEventListener('click', function() {
      // Show logs in a modal
      chrome.storage.local.get(['settings', 'logs'], function(result) {
        const settings = result.settings || {};
        const logs = result.logs || [];

        // Create and show a modal with logs
        const modal = document.createElement('div');
        modal.style.position = 'fixed';
        modal.style.top = '0';
        modal.style.left = '0';
        modal.style.width = '100%';
        modal.style.height = '100%';
        modal.style.backgroundColor = 'rgba(0,0,0,0.5)';
        modal.style.zIndex = '1000';
        modal.style.display = 'flex';
        modal.style.justifyContent = 'center';
        modal.style.alignItems = 'center';

        const content = document.createElement('div');
        content.style.backgroundColor = 'white';
        content.style.padding = '20px';
        content.style.borderRadius = '8px';
        content.style.width = '90%';
        content.style.maxWidth = '600px';
        content.style.maxHeight = '80vh';
        content.style.overflowY = 'auto';

        // Create logs content
        let logsHtml = `
          <h3 style="margin-top: 0; color: #0078d4;">Extension Logs</h3>
          <div style="margin-bottom: 15px; display: flex; justify-content: space-between; align-items: center;">
            <div>
              <label style="margin-right: 10px;">
                <input type="checkbox" id="debugMode" ${settings.debug ? 'checked' : ''}>
                Enable Debug Mode
              </label>
            </div>
            <button id="clearLogsBtn" style="padding: 4px 8px; background: #f0f0f0; color: #333; border: none; border-radius: 4px; cursor: pointer;">Clear Logs</button>
          </div>
          <div style="margin-bottom: 15px;">
            <div id="logsContainer" style="background-color: #f5f5f5; padding: 10px; border-radius: 4px; font-family: monospace; white-space: pre-wrap; max-height: 400px; overflow-y: auto;">`;

        // Get logs from background script
        chrome.runtime.sendMessage({ cmd: 'getLogs' }, function(response) {
          const allLogs = response || [];

          if (allLogs.length === 0) {
            logsHtml += 'No logs available.';
          } else {
            allLogs.forEach(log => {
              const timestamp = new Date(log.timestamp).toLocaleTimeString();
              const level = log.level || 'info';
              const message = log.message || '';

              let logClass = '';
              if (level === 'error') {
                logClass = 'color: #d83b01;';
              } else if (level === 'warn') {
                logClass = 'color: #ff8c00;';
              } else if (level === 'debug') {
                logClass = 'color: #107c10;';
              }

              logsHtml += `<div style="${logClass}">[${timestamp}] [${level.toUpperCase()}] ${message}</div>`;
            });
          }

          logsHtml += `</div>
          </div>
          <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px;">
            <button id="cancelBtn" style="padding: 8px 16px; background: #f0f0f0; color: #333; border: none; border-radius: 4px; cursor: pointer;">Close</button>
            <button id="saveBtn" style="padding: 8px 16px; background: #0078d4; color: white; border: none; border-radius: 4px; cursor: pointer;">Save Settings</button>
          </div>`;

          content.innerHTML = logsHtml;
          modal.appendChild(content);
          document.body.appendChild(modal);

          // Add event listeners for the modal buttons
          document.getElementById('cancelBtn').addEventListener('click', function() {
            document.body.removeChild(modal);
          });

          document.getElementById('saveBtn').addEventListener('click', function() {
            const debugMode = document.getElementById('debugMode').checked;

            // Update settings
            chrome.storage.local.get(['settings'], function(result) {
              const updatedSettings = result.settings || {};
              updatedSettings.debug = debugMode;

              chrome.storage.local.set({ settings: updatedSettings }, function() {
                document.body.removeChild(modal);
                showNotification('Log settings saved');
              });
            });
          });

          document.getElementById('clearLogsBtn').addEventListener('click', function() {
            chrome.runtime.sendMessage({ cmd: 'clearLogs' }, function() {
              document.getElementById('logsContainer').innerHTML = 'Logs cleared.';
              showNotification('Logs cleared');
            });
          });
        });
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

        // Format size in MB or GB depending on the actual number
        if (totalBytes >= 1073741824) { // 1 GB in bytes
          cacheSizeElement.textContent = (totalBytes / 1073741824).toFixed(1) + ' GB';
        } else {
          cacheSizeElement.textContent = (totalBytes / 1048576).toFixed(1) + ' MB';
        }
      }
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
