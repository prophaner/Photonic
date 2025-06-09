/**
 * Photonic - Background Service Worker
 * Handles study prefetching, encryption, and cache management
 */

// Import core functionality
importScripts('core.js');

// Global state
let pollTimer;
let consecutiveErrors = 0;
const MAX_CONSECUTIVE_ERRORS = 3;
const MAX_LOGS = 1000; // Maximum number of logs to keep
let logHistory = []; // In-memory log history

// ------------------------------------------------ LOGGING helper
/**
 * Logs debug messages if debug mode is enabled
 * @param {...any} args - Arguments to log
 */
function dbg(...args) {
  chrome.storage.local.get(['settings'], ({ settings }) => {
    if (settings?.debug) {
      console.log('[Photonic]', ...args);
      addLogEntry('debug', args.join(' '));
    }
  });
}

/**
 * Adds a log entry to the log history
 * @param {string} level - Log level (debug, info, warn, error)
 * @param {string} message - Log message
 */
function addLogEntry(level, message) {
  const logEntry = {
    timestamp: Date.now(),
    level: level,
    message: message
  };

  // Add to in-memory log history
  logHistory.unshift(logEntry); // Add to beginning for newest first

  // Trim log history if it exceeds maximum size
  if (logHistory.length > MAX_LOGS) {
    logHistory = logHistory.slice(0, MAX_LOGS);
  }

  // Store logs in chrome.storage.local
  chrome.storage.local.get(['logs'], function(result) {
    let logs = result.logs || [];
    logs.unshift(logEntry);

    // Trim logs if they exceed maximum size
    if (logs.length > MAX_LOGS) {
      logs = logs.slice(0, MAX_LOGS);
    }

    chrome.storage.local.set({ logs: logs });
  });
}

// ------------------------------------------------ INITIALIZATION
/**
 * Initialize the extension on install/update
 */
chrome.runtime.onInstalled.addListener(async (details) => {
  // Initialize settings if not present
  const { settings } = await chrome.storage.local.get(['settings']);
  if (!settings) {
    await chrome.storage.local.set({ settings: DEFAULT_SETTINGS });
    dbg('Initialized default settings');
  }

  // Create alarms for maintenance tasks
  chrome.alarms.create('dailyCleanup', { periodInMinutes: 1440 }); // Once per day
  chrome.alarms.create('hourlyQuotaCheck', { periodInMinutes: 60 }); // Once per hour

  // Create context menu
  createContextMenu();

  // Update badge with current cache count
  updateBadge();

  dbg(`Extension ${details.reason === 'install' ? 'installed' : 'updated'}`);
});

// ------------------------------------------------ EVENT LISTENERS
/**
 * Handle alarms
 */
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'dailyCleanup') cleanupCache();
  if (alarm.name === 'hourlyQuotaCheck') enforceQuota();
});

/**
 * Handle messages from other parts of the extension
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Handle string messages
  if (typeof message === 'string') {
    if (message === 'forcePoll') {
      console.log('[Photonic] Received forcePoll message');
      startOnePoll()
        .then(() => {
          console.log('[Photonic] Force poll completed successfully');
          sendResponse('ok');
        })
        .catch(err => {
          console.error('[Photonic] Force poll error:', err);
          sendResponse('error');
        });
      return true; // Keep the message channel open for async response
    }

    if (message === 'flushCache') {
      flushCache().then(() => sendResponse('flushed')).catch(err => {
        console.error('[Photonic] Flush cache error:', err);
        sendResponse('error');
      });
      return true;
    }

    if (message === 'restartPolling') {
      startPolling();
      sendResponse('restarted');
      return true;
    }

    // New workflow messages
    if (message === 'fetchStudyList') {
      handleFetchStudyList()
        .then(result => sendResponse(result))
        .catch(err => {
          console.error('[Photonic] Fetch study list error:', err);
          sendResponse({ success: false, error: err.message });
        });
      return true;
    }

    if (message === 'triggerDownloads') {
      handleTriggerDownloads()
        .then(result => sendResponse(result))
        .catch(err => {
          console.error('[Photonic] Trigger downloads error:', err);
          sendResponse({ success: false, error: err.message });
        });
      return true;
    }
  }

  // Handle object messages
  if (typeof message === 'object') {
    if (message.cmd === 'dumpCache') {
      idbGetAll().then(studies => sendResponse(studies)).catch(err => {
        console.error('[Photonic] Dump cache error:', err);
        sendResponse([]);
      });
      return true;
    }

    if (message.cmd === 'deleteStudy' && message.uid) {
      idbDelete(message.uid).then(() => {
        updateBadge();
        sendResponse('deleted');
      }).catch(err => {
        console.error('[Photonic] Delete study error:', err);
        sendResponse('error');
      });
      return true;
    }

    if (message.cmd === 'getStudy' && message.uid) {
      idbGet(message.uid).then(study => {
        if (!study) return sendResponse(null);

        // We don't want to send the entire encrypted data in the response
        const metadata = {
          uid: study.uid,
          size: study.size,
          ts: study.ts,
          available: true
        };

        sendResponse(metadata);
      }).catch(err => {
        console.error('[Photonic] Get study error:', err);
        sendResponse(null);
      });
      return true;
    }

    // Handle log-related commands
    if (message.cmd === 'getLogs') {
      chrome.storage.local.get(['logs'], function(result) {
        const logs = result.logs || [];
        sendResponse(logs);
      });
      return true;
    }

    if (message.cmd === 'clearLogs') {
      logHistory = [];
      chrome.storage.local.set({ logs: [] }, function() {
        sendResponse({ success: true });
      });
      return true;
    }
  }
});

/**
 * Handle storage changes to update polling if settings change
 */
chrome.storage.onChanged.addListener((changes) => {
  if (changes.settings) {
    dbg('Settings changed, restarting polling');
    startPolling();
  }
});

// ------------------------------------------------ CONTEXT MENU
/**
 * Creates the extension's context menu
 */
function createContextMenu() {
  chrome.contextMenus.create({
    id: 'flush', 
    title: 'Photonic → Flush Cache', 
    contexts: ['action']
  });

  chrome.contextMenus.create({
    id: 'force_poll', 
    title: 'Photonic → Force Poll Now', 
    contexts: ['action']
  });

  chrome.contextMenus.onClicked.addListener((info) => {
    if (info.menuItemId === 'flush') flushCache();
    if (info.menuItemId === 'force_poll') startOnePoll();
  });
}

// ------------------------------------------------ POLLING
/**
 * Start the polling process
 */
async function startPolling() {
  try {
    clearInterval(pollTimer);

    const { settings } = await chrome.storage.local.get(['settings']);
    if (!settings || !settings.pollIntervalSec || settings.enableAutoPolling === false) {
      dbg('Polling disabled - no interval configured or auto polling disabled');
      return;
    }

    dbg('Starting polling with interval:', settings.pollIntervalSec, 'seconds');

    // Start immediate poll
    startOnePoll().catch(err => {
      console.error('[Photonic] Initial poll failed:', err);
    });

    // Set up recurring polling
    pollTimer = setInterval(() => {
      startOnePoll().catch(err => {
        console.error('[Photonic] Scheduled poll failed:', err);
        consecutiveErrors++;

        if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
          console.error('[Photonic] Too many consecutive errors, stopping polling');
          clearInterval(pollTimer);
        }
      });
    }, settings.pollIntervalSec * 1000);

  } catch (error) {
    console.error('[Photonic] Error starting polling:', error);
  }
}

/**
 * Start polling immediately once
 */
async function startOnePoll() {
  console.log('[Photonic] Starting one-time poll');
  const currentTime = Date.now();

  // Store the last poll time
  chrome.storage.local.set({ lastPollTime: currentTime });

  // Log the poll time
  console.log('[Photonic] Poll started at:', new Date(currentTime).toLocaleString());
  addLogEntry('info', `Poll started at: ${new Date(currentTime).toLocaleString()}`);

  const cfg = await getCfg();
  console.log('[Photonic] Config loaded:', {
    hasSettings: !!cfg.settings,
    hasAuth: !!cfg.auth,
    subdomain: cfg.settings?.subdomain || 'missing'
  });

  if (!cfg.settings || !cfg.auth || !cfg.settings.subdomain) {
    console.error('[Photonic] Missing configuration for polling');
    throw new Error('Missing configuration');
  }

  try {
    await pollWorklist(cfg.settings, cfg.auth);
    console.log('[Photonic] Poll completed successfully');

    // Log the poll completion
    const completionTime = Date.now();
    const duration = (completionTime - currentTime) / 1000; // in seconds
    console.log('[Photonic] Poll completed at:', new Date(completionTime).toLocaleString(), `(duration: ${duration.toFixed(2)}s)`);
    addLogEntry('info', `Poll completed successfully (duration: ${duration.toFixed(2)}s)`);

    return 'completed';
  } catch (error) {
    console.error('[Photonic] Error during poll:', error);

    // Log the poll error
    addLogEntry('error', `Poll failed: ${error.message}`);

    throw error;
  }
}

/**
 * Poll the worklist and download new studies using QuickRad API
 * @param {Object} settings - User settings
 * @param {string} auth - Base64 encoded authentication string
 */
async function pollWorklist(settings, auth) {
  try {
    dbg('Polling worklist...');

    // Get credentials
    let password;
    if (settings.password && typeof settings.password === 'object') {
      password = await decryptPassword(settings.password);
    } else {
      password = settings.password;
    }

    const credentials = {
      username: settings.username,
      password: password
    };

    // Authenticate and fetch work list
    const authResult = await authenticateWithAPI(credentials);
    if (!authResult.success) {
      throw new Error(authResult.error);
    }

    const workList = await fetchWorkList(authResult.token);
    const studies = Array.isArray(workList) ? workList : workList.study_list || [];

    dbg('Found', studies.length, 'studies in worklist');

    // Process studies that match filters and aren't already cached
    let downloadCount = 0;
    for (const study of studies) {
      if (await shouldDownloadStudy(study, settings)) {
        try {
          await downloadStudy(study, authResult.token);
          downloadCount++;
        } catch (error) {
          console.error('[Photonic] Failed to download study:', study.study_instance_uid, error);
        }
      }
    }

    if (downloadCount > 0) {
      await updateBadge();
      if (settings.notifyOnDownload) {
        chrome.notifications.create({
          type: 'basic',
          iconUrl: '/icons/icon48.png',
          title: 'Photonic',
          message: `Downloaded ${downloadCount} new studies`
        });
      }
    }

    consecutiveErrors = 0; // Reset error counter on success

  } catch (error) {
    console.error('[Photonic] Polling error:', error);
    throw error;
  }
}

// ------------------------------------------------ NEW WORKFLOW HANDLERS
/**
 * Handles fetching the study list from the API
 */
async function handleFetchStudyList() {
  try {
    console.log('[Photonic] Fetching study list...');

    // Get credentials from storage
    const { settings } = await chrome.storage.local.get(['settings']);
    if (!settings || !settings.username || !settings.password) {
      throw new Error('No credentials configured');
    }

    // Decrypt password
    let password;
    if (settings.password && typeof settings.password === 'object') {
      password = await decryptPassword(settings.password);
    } else {
      password = settings.password;
    }

    const credentials = {
      username: settings.username,
      password: password
    };

    // Authenticate with API
    const authResult = await authenticateWithAPI(credentials);
    if (!authResult.success) {
      throw new Error(authResult.error);
    }

    // Fetch work list
    const workList = await fetchWorkList(authResult.token);

    console.log('[Photonic] Study list fetched successfully');

    return {
      success: true,
      studies: workList,
      token: authResult.token
    };

  } catch (error) {
    console.error('[Photonic] Error fetching study list:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Handles triggering downloads for marked studies
 */
async function handleTriggerDownloads() {
  try {
    console.log('[Photonic] Triggering downloads for marked studies...');

    // Get studies marked for download
    const downloadStudies = await studiesDbGetByStatus(STUDY_STATUS.DOWNLOAD);

    if (downloadStudies.length === 0) {
      return {
        success: true,
        message: 'No studies marked for download',
        total: 0,
        downloaded: 0,
        errors: 0,
        results: []
      };
    }

    // Get credentials
    const { settings } = await chrome.storage.local.get(['settings']);
    if (!settings || !settings.username || !settings.password) {
      throw new Error('No credentials configured');
    }

    let password;
    if (settings.password && typeof settings.password === 'object') {
      password = await decryptPassword(settings.password);
    } else {
      password = settings.password;
    }

    const credentials = {
      username: settings.username,
      password: password
    };

    // Authenticate
    const authResult = await authenticateWithAPI(credentials);
    if (!authResult.success) {
      throw new Error(authResult.error);
    }

    // Download each study
    const results = [];
    let downloaded = 0;
    let errors = 0;

    for (const study of downloadStudies) {
      try {
        await downloadStudyFromRecord(study, authResult.token);
        await studiesDbUpdateStatus(study.study_id, STUDY_STATUS.DOWNLOADED, {
          download_time: new Date().toISOString()
        });
        results.push({ study_id: study.study_id, status: 'success' });
        downloaded++;
      } catch (error) {
        console.error('[Photonic] Download failed for study:', study.study_id, error);
        await studiesDbUpdateStatus(study.study_id, STUDY_STATUS.ERROR, {
          error: error.message
        });
        results.push({ study_id: study.study_id, status: 'error', error: error.message });
        errors++;
      }
    }

    await updateBadge();

    return {
      success: true,
      total: downloadStudies.length,
      downloaded,
      errors,
      results
    };

  } catch (error) {
    console.error('[Photonic] Error triggering downloads:', error);
    return {
      success: false,
      error: error.message,
      total: 0,
      downloaded: 0,
      errors: 0,
      results: []
    };
  }
}

// ------------------------------------------------ STUDY PROCESSING HELPERS

/**
 * Determines if a study should be downloaded based on filters and cache status
 */
async function shouldDownloadStudy(study, settings) {
  try {
    // Check if already cached
    if (await idbHasStudy(study.study_instance_uid)) {
      return false;
    }

    // Apply status filter
    if (settings.filters && settings.filters.status) {
      if (study.status !== settings.filters.status) {
        return false;
      }
    }

    return true;
  } catch (error) {
    console.error('[Photonic] Error checking if study should be downloaded:', error);
    return false;
  }
}

/**
 * Downloads a single study and stores it in cache
 */
async function downloadStudy(study, token) {
  try {
    dbg('Downloading study:', study.study_instance_uid);

    // Get internal UUID
    const miscUrl = 'https://toprad.aikenist.com/api/quickrad/general/get-misc-study-data';
    const formData = new FormData();
    formData.append('study_instance_uid', study.study_instance_uid);

    const miscResponse = await fetch(miscUrl, {
      method: 'POST',
      body: formData,
      headers: {
        'Authorization': `JWT ${token}`,
        'Accept': 'application/json'
      }
    });

    if (!miscResponse.ok) {
      throw new Error(`Failed to get study UUID: ${miscResponse.status}`);
    }

    const miscData = await miscResponse.json();
    const uuid = miscData.study_data?.study_instance_uuid;

    if (!uuid) {
      throw new Error('No UUID found in response');
    }

    // Download ZIP
    const archiveUrl = `https://toprad.aikenist.com/dicom-web/studies/${uuid}/archive`;
    const archiveResponse = await fetch(archiveUrl, {
      headers: {
        'Authorization': `JWT ${token}`
      }
    });

    if (!archiveResponse.ok) {
      throw new Error(`Failed to download study: ${archiveResponse.status}`);
    }

    const blob = await archiveResponse.blob();

    // Encrypt and store
    const encryptedData = await encryptBlob(blob);
    const studyRecord = {
      uid: study.study_instance_uid,
      ...encryptedData,
      size: blob.size,
      ts: Date.now(),
      patientName: study.patient_name || 'Unknown',
      studyDate: study.study_date || ''
    };

    await idbPut(study.study_instance_uid, studyRecord);
    dbg('Study downloaded and cached:', study.study_instance_uid);

  } catch (error) {
    console.error('[Photonic] Error downloading study:', error);
    throw error;
  }
}

/**
 * Downloads a study from a database record
 */
async function downloadStudyFromRecord(studyRecord, token) {
  const study = {
    study_instance_uid: studyRecord.study_instance_uid || studyRecord.study_id,
    patient_name: studyRecord.patient_name,
    study_date: studyRecord.created_at
  };

  return downloadStudy(study, token);
}

// ------------------------------------------------ CACHE MANAGEMENT
/**
 * Get configuration from storage
 */
async function getCfg() {
  const { settings, auth } = await chrome.storage.local.get(['settings', 'auth']);
  return { settings, auth };
}

/**
 * Update the extension badge with cache count
 */
async function updateBadge() {
  try {
    const studies = await idbGetAll();
    const count = studies.length;

    chrome.action.setBadgeText({ 
      text: count > 0 ? count.toString() : '' 
    });

    chrome.action.setBadgeBackgroundColor({ color: '#4CAF50' });
  } catch (error) {
    console.error('[Photonic] Error updating badge:', error);
  }
}

/**
 * Flush the entire cache
 */
async function flushCache() {
  try {
    const studies = await idbGetAll();

    for (const study of studies) {
      await idbDelete(study.uid);
    }

    await updateBadge();

    chrome.notifications.create({
      type: 'basic',
      iconUrl: '/icons/icon48.png',
      title: 'Photonic',
      message: `Flushed ${studies.length} studies from cache`
    });

    dbg('Cache flushed:', studies.length, 'studies');
  } catch (error) {
    console.error('[Photonic] Error flushing cache:', error);
  }
}

/**
 * Clean up old studies based on TTL
 */
async function cleanupCache() {
  try {
    const { settings } = await chrome.storage.local.get(['settings']);
    if (!settings || !settings.ttlDays) return;

    const studies = await idbGetByAge();
    const cutoff = Date.now() - (settings.ttlDays * 24 * 60 * 60 * 1000);

    let deletedCount = 0;

    for (const study of studies) {
      if (study.ts < cutoff) {
        await idbDelete(study.uid);
        deletedCount++;
      }
    }

    if (deletedCount > 0) {
      await updateBadge();
      dbg('Cleaned up', deletedCount, 'old studies');
    }
  } catch (error) {
    console.error('[Photonic] Error during cleanup:', error);
  }
}

/**
 * Enforce storage quota
 */
async function enforceQuota() {
  try {
    const { settings } = await chrome.storage.local.get(['settings']);
    if (!settings || !settings.maxGB) return;

    const maxBytes = gbToBytes(settings.maxGB);
    const currentSize = await idbTotalSize();

    if (currentSize <= maxBytes) return;

    // Delete oldest studies until under quota
    const studies = await idbGetByAge();
    let deletedCount = 0;
    let freedBytes = 0;

    for (const study of studies) {
      if (currentSize - freedBytes <= maxBytes) break;

      await idbDelete(study.uid);
      freedBytes += study.size || 0;
      deletedCount++;
    }

    if (deletedCount > 0) {
      await updateBadge();
      dbg('Quota enforcement: deleted', deletedCount, 'studies, freed', bytesToMB(freedBytes), 'MB');
    }
  } catch (error) {
    console.error('[Photonic] Error enforcing quota:', error);
  }
}

// ------------------------------------------------ CONSOLE LOGGING OVERRIDE
// Override console methods to capture logs
const originalConsole = {
  log: console.log,
  info: console.info,
  warn: console.warn,
  error: console.error
};

// Override console.log
console.log = function(...args) {
  originalConsole.log.apply(console, args);

  // Only capture Photonic logs
  const message = args.join(' ');
  if (message.includes('[Photonic]')) {
    addLogEntry('info', message);
  }
};

// Override console.info
console.info = function(...args) {
  originalConsole.info.apply(console, args);

  // Only capture Photonic logs
  const message = args.join(' ');
  if (message.includes('[Photonic]')) {
    addLogEntry('info', message);
  }
};

// Override console.warn
console.warn = function(...args) {
  originalConsole.warn.apply(console, args);

  // Only capture Photonic logs
  const message = args.join(' ');
  if (message.includes('[Photonic]')) {
    addLogEntry('warn', message);
  }
};

// Override console.error
console.error = function(...args) {
  originalConsole.error.apply(console, args);

  // Only capture Photonic logs
  const message = args.join(' ');
  if (message.includes('[Photonic]')) {
    addLogEntry('error', message);
  }
};

// Start polling when the service worker starts
startPolling();
