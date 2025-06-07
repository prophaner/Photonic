/**
 * Photonic Settings Page
 * Allows users to configure the extension
 */

// Global variables for DOM elements
let subdomainInput, usernameInput, passwordInput, maxGBInput, ttlDaysInput;
let pollIntervalSecInput, notifyOnDownloadCheckbox, debugCheckbox;
let saveButton, testButton, viewCacheButton, statusElement;
let studyCountElement, cacheSizeElement, cacheUsageElement;
let inputs = [];

// Initialize when the DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
  console.log('DOM loaded, initializing options page');
  
  // Get DOM elements
  subdomainInput = document.getElementById('subdomain');
  usernameInput = document.getElementById('username');
  passwordInput = document.getElementById('password');
  maxGBInput = document.getElementById('maxGB');
  ttlDaysInput = document.getElementById('ttlDays');
  pollIntervalSecInput = document.getElementById('pollIntervalSec');
  notifyOnDownloadCheckbox = document.getElementById('notifyOnDownload');
  debugCheckbox = document.getElementById('debug');
  saveButton = document.getElementById('save');
  testButton = document.getElementById('test');
  viewCacheButton = document.getElementById('viewCache');
  statusElement = document.getElementById('status');
  studyCountElement = document.getElementById('studyCount');
  cacheSizeElement = document.getElementById('cacheSize');
  cacheUsageElement = document.getElementById('cacheUsage');

  console.log('DOM elements found:', {
    subdomain: !!subdomainInput,
    username: !!usernameInput,
    password: !!passwordInput,
    saveButton: !!saveButton,
    testButton: !!testButton
  });

  // Load settings and update cache stats
  loadSettings();
  updateCacheStats();

  // Add event listeners
  if (saveButton) {
    console.log('Adding click listener to save button');
    saveButton.addEventListener('click', function(e) {
      console.log('Save button clicked');
      saveSettings();
    });
    
    // Enable the save button by default
    saveButton.disabled = false;
  }
  
  if (testButton) {
    console.log('Adding click listener to test button');
    testButton.addEventListener('click', function(e) {
      console.log('Test button clicked');
      testConnection();
    });
  }
  
  if (viewCacheButton) {
    viewCacheButton.addEventListener('click', openDevTools);
  }

  // Form validation
  inputs = [subdomainInput, usernameInput, passwordInput, maxGBInput, ttlDaysInput, pollIntervalSecInput];
  inputs.forEach(input => {
    if (input) {
      input.addEventListener('input', validateForm);
    }
  });
});

/**
 * Loads settings from storage
 */
function loadSettings() {
  chrome.storage.local.get(['settings', 'auth'], ({ settings, auth }) => {
    if (settings) {
      if (subdomainInput) subdomainInput.value = settings.subdomain || '';
      if (maxGBInput) maxGBInput.value = settings.maxGB || 50;
      if (ttlDaysInput) ttlDaysInput.value = settings.ttlDays || 7;
      if (pollIntervalSecInput) pollIntervalSecInput.value = settings.pollIntervalSec || 60;
      if (notifyOnDownloadCheckbox) notifyOnDownloadCheckbox.checked = settings.notifyOnDownload !== false;
      if (debugCheckbox) debugCheckbox.checked = settings.debug || false;
    }
    
    if (auth && settings && usernameInput) {
      try {
        usernameInput.value = atob(auth).split(':')[0];
      } catch (e) {
        console.error('Error decoding auth:', e);
      }
    }
    
    validateForm();
  });
}

/**
 * Updates the cache statistics display
 */
function updateCacheStats() {
  chrome.runtime.sendMessage({ cmd: 'dumpCache' }, (studies) => {
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
    
    if (cacheUsageElement && maxGBInput && studies) {
      const totalBytes = studies.reduce((sum, study) => sum + (study.size || 0), 0);
      const maxBytes = parseFloat(maxGBInput.value) * 1073741824;
      const percentage = maxBytes > 0 ? Math.round((totalBytes / maxBytes) * 100) : 0;
      cacheUsageElement.textContent = percentage + '%';
    }
  });
}

/**
 * Validates the form inputs
 */
function validateForm() {
  // Log the values for debugging
  console.log('Validating form with values:', {
    subdomain: subdomainInput ? subdomainInput.value : 'missing',
    username: usernameInput ? usernameInput.value : 'missing',
    password: passwordInput ? passwordInput.value : 'missing',
    maxGB: maxGBInput ? maxGBInput.value : 'missing',
    ttlDays: ttlDaysInput ? ttlDaysInput.value : 'missing',
    pollInterval: pollIntervalSecInput ? pollIntervalSecInput.value : 'missing'
  });
  
  // Simplified validation - just check the critical fields
  let isValid = true;
  
  if (!subdomainInput || subdomainInput.value.trim() === '') {
    console.log('Subdomain invalid');
    isValid = false;
  }
  
  if (!usernameInput || usernameInput.value.trim() === '') {
    console.log('Username invalid');
    isValid = false;
  }
  
  if (!passwordInput || passwordInput.value === '') {
    console.log('Password invalid');
    isValid = false;
  }
  
  // Enable the save button regardless of validation for now
  if (saveButton) {
    console.log('Setting save button disabled state to:', false);
    saveButton.disabled = false;
  }
  
  // Add validation styling
  inputs.forEach(input => {
    if (input) {
      if (input.value.trim() === '' || 
          (input.type === 'number' && input.value <= 0) ||
          (input.id === 'pollIntervalSec' && input.value < 30)) {
        input.classList.add('invalid');
      } else {
        input.classList.remove('invalid');
      }
    }
  });
  
  return isValid;
}

/**
 * Saves settings to storage
 */
function saveSettings() {
  const settings = {
    subdomain: subdomainInput ? subdomainInput.value.trim() : '',
    maxGB: maxGBInput ? +maxGBInput.value || 50 : 50,
    ttlDays: ttlDaysInput ? +ttlDaysInput.value || 7 : 7,
    pollIntervalSec: pollIntervalSecInput ? +pollIntervalSecInput.value || 60 : 60,
    notifyOnDownload: notifyOnDownloadCheckbox ? notifyOnDownloadCheckbox.checked : true,
    filters: { status: 'READY' },
    debug: debugCheckbox ? debugCheckbox.checked : false
  };
  
  const auth = btoa(`${usernameInput ? usernameInput.value : ''}:${passwordInput ? passwordInput.value : ''}`);
  
  chrome.storage.local.set({ settings, auth }, () => {
    showStatus('Settings saved successfully!', 'success');
    
    // Restart polling with new settings
    chrome.runtime.sendMessage('restartPolling');
    
    // Update cache stats
    setTimeout(updateCacheStats, 500);
  });
}

/**
 * Tests the connection to the PACS
 */
function testConnection() {
  console.log('Test button clicked');
  showStatus('Testing connection...', 'info');
  
  // First, save the current settings
  const settings = {
    subdomain: subdomainInput ? subdomainInput.value.trim() : '',
    maxGB: maxGBInput ? +maxGBInput.value || 50 : 50,
    ttlDays: ttlDaysInput ? +ttlDaysInput.value || 7 : 7,
    pollIntervalSec: pollIntervalSecInput ? +pollIntervalSecInput.value || 60 : 60,
    notifyOnDownload: notifyOnDownloadCheckbox ? notifyOnDownloadCheckbox.checked : true,
    filters: { status: 'READY' },
    debug: debugCheckbox ? debugCheckbox.checked : false
  };
  
  const auth = btoa(`${usernameInput ? usernameInput.value : ''}:${passwordInput ? passwordInput.value : ''}`);
  
  console.log('Saving temporary settings for test:', {
    subdomain: settings.subdomain,
    username: usernameInput ? usernameInput.value : '',
    hasPassword: passwordInput && passwordInput.value ? 'yes' : 'no'
  });
  
  // Save settings first, then test
  chrome.storage.local.set({ settings, auth }, () => {
    console.log('Settings saved, now testing connection');
    
    // Now test the connection
    chrome.runtime.sendMessage('forcePoll', (response) => {
      console.log('Test response:', response);
      
      if (chrome.runtime.lastError) {
        console.error('Runtime error:', chrome.runtime.lastError);
        showStatus('Connection failed. Check your settings and try again.', 'error');
        return;
      }
      
      if (response === 'ok') {
        showStatus('Connection successful! Check DevTools for details.', 'success');
        setTimeout(updateCacheStats, 1000);
      } else {
        showStatus('Connection failed. Check your settings and try again.', 'error');
      }
    });
  });
}

/**
 * Opens the DevTools panel
 */
function openDevTools() {
  // This is just a placeholder - we can't directly open DevTools from here
  showStatus('To view cache details, open Chrome DevTools and select the Photonic panel.', 'info');
}

/**
 * Shows a status message
 * @param {string} message - The message to display
 * @param {string} type - The message type (success, error, info)
 */
function showStatus(message, type = 'info') {
  if (statusElement) {
    statusElement.textContent = message;
    statusElement.className = type;
    
    // Clear the message after 5 seconds
    setTimeout(() => {
      statusElement.textContent = '';
      statusElement.className = '';
    }, 5000);
  }
}