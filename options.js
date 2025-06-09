/**
 * Photonic Settings Page
 * Allows users to configure the extension
 */

// Core functionality loaded via HTML script tag

// Global variables for DOM elements
let subdomainInput, usernameInput, passwordInput, maxGBInput, ttlDaysInput;
let pollIntervalSecInput, enableAutoPollingCheckbox, notifyOnDownloadCheckbox, debugCheckbox;
let saveButton, testButton, viewCacheButton, statusElement;
let studyCountElement, cacheSizeElement, cacheUsageElement, lastPollTimeElement;
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
  enableAutoPollingCheckbox = document.getElementById('enableAutoPolling');
  notifyOnDownloadCheckbox = document.getElementById('notifyOnDownload');
  debugCheckbox = document.getElementById('debug');
  saveButton = document.getElementById('save');
  testButton = document.getElementById('test');
  viewCacheButton = document.getElementById('viewCache');
  statusElement = document.getElementById('status');
  studyCountElement = document.getElementById('studyCount');
  cacheSizeElement = document.getElementById('cacheSize');
  cacheUsageElement = document.getElementById('cacheUsage');
  lastPollTimeElement = document.getElementById('lastPollTime');

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

  // Set up periodic refresh of last poll time
  setInterval(() => {
    updateLastPollTime();
  }, 10000); // Refresh every 10 seconds

  // Add event listeners
  if (saveButton) {
    console.log('Adding click listener to save button');
    saveButton.addEventListener('click', async function(e) {
      console.log('Save button clicked');

      // Disable save button during save
      saveButton.disabled = true;
      const originalText = saveButton.textContent;
      saveButton.textContent = 'Saving...';

      try {
        await saveSettings();
      } finally {
        // Re-enable save button
        saveButton.disabled = false;
        saveButton.textContent = originalText;
      }
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
  chrome.storage.local.get(['settings', 'auth', 'encryptedPassword', 'lastPollTime'], ({ settings, auth, encryptedPassword, lastPollTime }) => {
    if (settings) {
      if (subdomainInput) subdomainInput.value = settings.subdomain || '';
      if (maxGBInput) maxGBInput.value = settings.maxGB || 50;
      if (ttlDaysInput) ttlDaysInput.value = settings.ttlDays || 7;
      if (pollIntervalSecInput) pollIntervalSecInput.value = settings.pollIntervalSec || 60;
      if (enableAutoPollingCheckbox) enableAutoPollingCheckbox.checked = settings.enableAutoPolling !== false;
      if (notifyOnDownloadCheckbox) notifyOnDownloadCheckbox.checked = settings.notifyOnDownload !== false;
      if (debugCheckbox) debugCheckbox.checked = settings.debug || false;
    }

    // Update last poll time display
    if (lastPollTimeElement) {
      if (lastPollTime) {
        const date = new Date(lastPollTime);
        lastPollTimeElement.textContent = date.toLocaleString();
      } else {
        lastPollTimeElement.textContent = 'Never';
      }
    }

    // Load username from auth (backward compatibility)
    if (auth && usernameInput) {
      try {
        const decoded = atob(auth);
        const username = decoded.split(':')[0];
        usernameInput.value = username;

        // If we have old-style auth but no encrypted password, extract and encrypt the password
        if (!encryptedPassword && decoded.includes(':')) {
          const password = decoded.split(':')[1];
          if (password && passwordInput) {
            passwordInput.value = password;
            // The password will be encrypted when settings are saved next time
          }
        }
      } catch (e) {
        console.error('Error decoding auth:', e);
      }
    }

    // Load encrypted password
    if (encryptedPassword && passwordInput) {
      decryptPassword(encryptedPassword)
        .then(password => {
          passwordInput.value = password;
          validateForm();
        })
        .catch(e => {
          console.error('Error decrypting password:', e);
          // Clear the corrupted encrypted password
          chrome.storage.local.remove(['encryptedPassword']);
          validateForm();
        });
    } else {
      validateForm();
    }
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
async function saveSettings() {
  try {
    const settings = {
      subdomain: subdomainInput ? subdomainInput.value.trim() : '',
      maxGB: maxGBInput ? +maxGBInput.value || 50 : 50,
      ttlDays: ttlDaysInput ? +ttlDaysInput.value || 7 : 7,
      pollIntervalSec: pollIntervalSecInput ? +pollIntervalSecInput.value || 60 : 60,
      enableAutoPolling: enableAutoPollingCheckbox ? enableAutoPollingCheckbox.checked : true,
      notifyOnDownload: notifyOnDownloadCheckbox ? notifyOnDownloadCheckbox.checked : true,
      filters: { status: 'READY' },
      debug: debugCheckbox ? debugCheckbox.checked : false
    };

    const username = usernameInput ? usernameInput.value : '';
    const password = passwordInput ? passwordInput.value : '';

    // Create auth for backward compatibility (but don't store the actual password)
    const auth = btoa(`${username}:`);

    // Encrypt the password
    let encryptedPassword = null;
    if (password) {
      encryptedPassword = await encryptPassword(password);
    }

    // Save settings
    const storageData = { settings, auth };
    if (encryptedPassword) {
      storageData.encryptedPassword = encryptedPassword;
    }

    chrome.storage.local.set(storageData, () => {
      showStatus('Settings saved successfully!', 'success');

      // Restart polling with new settings
      chrome.runtime.sendMessage('restartPolling');

      // Update cache stats
      setTimeout(updateCacheStats, 500);
    });

  } catch (error) {
    console.error('Error saving settings:', error);
    showStatus('Error saving settings: ' + error.message, 'error');
  }
}

/**
 * Tests the connection to the PACS
 */
async function testConnection() {
  console.log('Test button clicked');

  // Disable test button during test
  if (testButton) {
    testButton.disabled = true;
    testButton.textContent = 'Testing...';
  }

  showStatus('Testing connection...', 'info');

  // Validate required fields
  const subdomain = subdomainInput ? subdomainInput.value.trim() : '';
  const username = usernameInput ? usernameInput.value.trim() : '';
  const password = passwordInput ? passwordInput.value : '';

  if (!username || !password) {
    showStatus('Please fill in username and password', 'error');
    resetTestButton();
    return;
  }

  // Note: For QuickRad, the subdomain should typically be 'toprad'
  if (subdomain && subdomain !== 'toprad') {
    showStatus('Note: QuickRad typically uses "toprad" as subdomain. Testing with provided subdomain...', 'info');
  }

  try {
    // Test the connection directly without saving settings
    const testResult = await testPacsConnection(subdomain, username, password);

    if (testResult.success) {
      showStatus(`✓ Connection successful! Found ${testResult.studyCount} studies in worklist.`, 'success');
    } else {
      showStatus(`✗ Connection failed: ${testResult.error}`, 'error');
    }

  } catch (error) {
    console.error('Test connection error:', error);
    showStatus(`✗ Connection test failed: ${error.message}`, 'error');
  } finally {
    resetTestButton();
  }
}

/**
 * Reset test button to original state
 */
function resetTestButton() {
  if (testButton) {
    testButton.disabled = false;
    testButton.textContent = 'Test Connection';
  }
}

/**
 * Tests PACS connection without saving settings using the correct QuickRad API
 * @param {string} subdomain - The PACS subdomain (should be 'toprad' for QuickRad)
 * @param {string} username - Username/email
 * @param {string} password - Password
 * @returns {Promise<Object>} - Test result with success status and details
 */
async function testPacsConnection(subdomain, username, password) {
  try {
    // Step 1: Authenticate and get JWT token
    console.log('Step 1: Authenticating with QuickRad API...');

    const loginUrl = 'https://toprad.aikenist.com/api/quickrad/telerad/login-validation';

    // Create FormData for login (as per Python script)
    const formData = new FormData();
    formData.append('email', username);
    formData.append('password', password);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

    const loginResponse = await fetch(loginUrl, {
      method: 'POST',
      body: formData,
      headers: {
        'Accept': 'application/json'
      },
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!loginResponse.ok) {
      if (loginResponse.status === 429) {
        return {
          success: false,
          error: 'Too many login attempts. Account may be temporarily locked.'
        };
      } else if (loginResponse.status === 401 || loginResponse.status === 403) {
        return {
          success: false,
          error: 'Authentication failed. Please check your username and password.'
        };
      } else {
        return {
          success: false,
          error: `Login failed: HTTP ${loginResponse.status}: ${loginResponse.statusText}`
        };
      }
    }

    const loginData = await loginResponse.json();

    if (!loginData.status || !loginData.token) {
      return {
        success: false,
        error: loginData.message || 'Authentication failed - no valid token received'
      };
    }

    const token = loginData.token;
    console.log('✓ Authentication successful, got JWT token');

    // Step 2: Fetch work-list using the JWT token
    console.log('Step 2: Fetching work-list...');

    const workListUrl = 'https://toprad.aikenist.com/api/quickrad/telerad/fetch-admin-list';

    const workListFormData = new FormData();
    workListFormData.append('page_size', '10'); // Small page size for testing
    workListFormData.append('page_num', '1');

    const workListController = new AbortController();
    const workListTimeoutId = setTimeout(() => workListController.abort(), 10000);

    const workListResponse = await fetch(workListUrl, {
      method: 'POST',
      body: workListFormData,
      headers: {
        'Authorization': `JWT ${token}`,
        'Accept': 'application/json'
      },
      signal: workListController.signal
    });

    clearTimeout(workListTimeoutId);

    if (!workListResponse.ok) {
      return {
        success: false,
        error: `Work-list fetch failed: HTTP ${workListResponse.status}: ${workListResponse.statusText}`
      };
    }

    const workListData = await workListResponse.json();
    console.log('✓ Work-list fetch successful');

    // Extract studies from response (handle both array and object with study_list)
    let studies = [];
    if (Array.isArray(workListData)) {
      studies = workListData;
    } else if (workListData.study_list && Array.isArray(workListData.study_list)) {
      studies = workListData.study_list;
    }

    return {
      success: true,
      studyCount: studies.length,
      message: 'Connection successful'
    };

  } catch (error) {
    if (error.name === 'AbortError') {
      return {
        success: false,
        error: 'Connection timeout. Please check your network and try again.'
      };
    } else if (error.message.includes('Failed to fetch')) {
      return {
        success: false,
        error: 'Network error. Please check your internet connection.'
      };
    } else {
      return {
        success: false,
        error: error.message
      };
    }
  }
}

/**
 * Opens the DevTools panel
 */
function openDevTools() {
  // This is just a placeholder - we can't directly open DevTools from here
  showStatus('To view cache details, open Chrome DevTools and select the Photonic panel.', 'info');
}

/**
 * Updates the last poll time display
 */
function updateLastPollTime() {
  if (lastPollTimeElement) {
    chrome.storage.local.get(['lastPollTime'], ({ lastPollTime }) => {
      if (lastPollTime) {
        const date = new Date(lastPollTime);
        lastPollTimeElement.textContent = date.toLocaleString();
      } else {
        lastPollTimeElement.textContent = 'Never';
      }
    });
  }
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
