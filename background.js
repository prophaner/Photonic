/**
 * Photonic - Background Service Worker
 * Handles study prefetching, encryption, and cache management
 */

// Import functions from modules
// Note: These will be properly imported once the modules are set up
// For now, we'll define these functions inline to avoid import errors

// Encryption functions
async function encryptBlob(blob) {
  try {
    // Generate a random encryption key
    const key = await window.crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt']
    );
    
    // Generate a random initialization vector
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    
    // Export the key for storage
    const exportedKey = await window.crypto.subtle.exportKey('raw', key);
    
    // Convert blob to ArrayBuffer for encryption
    const arrayBuffer = await blob.arrayBuffer();
    
    // Encrypt the data
    const cipherText = await window.crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      arrayBuffer
    );
    
    return {
      cipherText,
      key: new Uint8Array(exportedKey),
      iv,
      originalSize: arrayBuffer.byteLength
    };
  } catch (error) {
    console.error('[Photonic] Encryption error:', error);
    throw new Error('Failed to encrypt data: ' + error.message);
  }
}

async function decryptToBlob(encryptedData) {
  try {
    // Import the encryption key
    const key = await window.crypto.subtle.importKey(
      'raw',
      encryptedData.key,
      { name: 'AES-GCM', length: 256 },
      false,
      ['decrypt']
    );
    
    // Decrypt the data
    const decryptedBuffer = await window.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: encryptedData.iv },
      key,
      encryptedData.cipherText
    );
    
    // Convert back to Blob
    return new Blob([decryptedBuffer], { type: 'application/dicom' });
  } catch (error) {
    console.error('[Photonic] Decryption error:', error);
    throw new Error('Failed to decrypt data: ' + error.message);
  }
}

// IndexedDB functions
const DB_NAME = 'PhotonicCache';
const STORE_NAME = 'studies';
const DB_VERSION = 1;

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onerror = (event) => {
      console.error('[Photonic] Database error:', event.target.error);
      reject(event.target.error);
    };
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'uid' });
        store.createIndex('timestamp', 'ts', { unique: false });
        store.createIndex('size', 'size', { unique: false });
      }
    };
    
    request.onsuccess = (event) => {
      resolve(event.target.result);
    };
  });
}

async function idbPut(uid, data) {
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      
      // Add the UID to the data object
      const record = { ...data, uid };
      
      const request = store.put(record);
      
      request.onerror = (event) => {
        console.error('[Photonic] Error storing study:', event.target.error);
        reject(event.target.error);
      };
      
      request.onsuccess = () => {
        resolve();
      };
      
      transaction.oncomplete = () => {
        db.close();
      };
    });
  } catch (error) {
    console.error('[Photonic] Database put error:', error);
    throw error;
  }
}

async function idbGet(uid) {
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(uid);
      
      request.onerror = (event) => {
        console.error('[Photonic] Error retrieving study:', event.target.error);
        reject(event.target.error);
      };
      
      request.onsuccess = (event) => {
        resolve(event.target.result || null);
      };
      
      transaction.oncomplete = () => {
        db.close();
      };
    });
  } catch (error) {
    console.error('[Photonic] Database get error:', error);
    throw error;
  }
}

async function idbHasStudy(uid) {
  const study = await idbGet(uid);
  return study !== null;
}

async function idbDelete(uid) {
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(uid);
      
      request.onerror = (event) => {
        console.error('[Photonic] Error deleting study:', event.target.error);
        reject(event.target.error);
      };
      
      request.onsuccess = () => {
        resolve();
      };
      
      transaction.oncomplete = () => {
        db.close();
      };
    });
  } catch (error) {
    console.error('[Photonic] Database delete error:', error);
    throw error;
  }
}

async function idbGetAll() {
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();
      
      request.onerror = (event) => {
        console.error('[Photonic] Error retrieving all studies:', event.target.error);
        reject(event.target.error);
      };
      
      request.onsuccess = (event) => {
        resolve(event.target.result || []);
      };
      
      transaction.oncomplete = () => {
        db.close();
      };
    });
  } catch (error) {
    console.error('[Photonic] Database getAll error:', error);
    throw error;
  }
}

async function idbTotalSize() {
  const studies = await idbGetAll();
  return studies.reduce((total, study) => total + (study.size || 0), 0);
}

async function idbGetByAge() {
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const index = store.index('timestamp');
      const request = index.getAll();
      
      request.onerror = (event) => {
        console.error('[Photonic] Error retrieving studies by age:', event.target.error);
        reject(event.target.error);
      };
      
      request.onsuccess = (event) => {
        resolve(event.target.result || []);
      };
      
      transaction.oncomplete = () => {
        db.close();
      };
    });
  } catch (error) {
    console.error('[Photonic] Database getByAge error:', error);
    throw error;
  }
}

// Utility functions
function bytesToMB(bytes, precision = 2) {
  return (bytes / 1048576).toFixed(precision);
}

function bytesToGB(bytes, precision = 2) {
  return (bytes / 1073741824).toFixed(precision);
}

function gbToBytes(gb) {
  return gb * 1073741824;
}

function getAgeInDays(timestamp) {
  const now = Date.now();
  const ageMs = now - timestamp;
  return ageMs / (1000 * 60 * 60 * 24);
}

function throttle(func, limit) {
  let inThrottle;
  return function(...args) {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

async function retry(fn, maxRetries = 3, baseDelay = 1000) {
  let lastError;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt < maxRetries) {
        const delay = baseDelay * Math.pow(2, attempt);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw lastError;
}

// Default settings
const DEFAULT_SETTINGS = {
  subdomain: '',
  username: '',
  password: '',
  maxGB: 50,
  ttlDays: 7,
  filters: { status: 'READY' },
  pollIntervalSec: 60,
  debug: false,
  notifyOnDownload: true
};

// Global state
let pollTimer;
let consecutiveErrors = 0;
const MAX_CONSECUTIVE_ERRORS = 3;

// ------------------------------------------------ LOGGING helper
/**
 * Logs debug messages if debug mode is enabled
 * @param {...any} args - Arguments to log
 */
function dbg(...args) {
  chrome.storage.local.get(['settings'], ({ settings }) => {
    if (settings?.debug) console.log('[Photonic]', ...args);
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
function startPolling() {
  getCfg().then(({ settings, auth }) => {
    if (!settings || !auth || !settings.subdomain) {
      dbg('Polling not started: missing configuration');
      return;
    }
    
    // Clear existing timer
    if (pollTimer) {
      clearInterval(pollTimer);
    }
    
    // Start new timer
    const interval = settings.pollIntervalSec * 1000;
    pollTimer = setInterval(() => pollWorklist(settings, auth), interval);
    
    dbg('Polling started every', settings.pollIntervalSec, 'sec');
    
    // Do an immediate poll
    pollWorklist(settings, auth);
  });
}

/**
 * Start polling immediately once
 */
async function startOnePoll() {
  console.log('[Photonic] Starting one-time poll');
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
    return 'completed';
  } catch (error) {
    console.error('[Photonic] Error during poll:', error);
    throw error;
  }
}

/**
 * Poll the worklist and download new studies
 * @param {Object} settings - User settings
 * @param {string} auth - Base64 encoded authentication string
 */
async function pollWorklist(settings, auth) {
  console.log('[Photonic] Polling worklist with settings:', {
    subdomain: settings.subdomain,
    status: settings.filters?.status || 'READY'
  });
  
  try {
    const url = `https://${settings.subdomain}.aikenist.com/dicom-web/studies?status=${settings.filters?.status || 'READY'}`;
    console.log('[Photonic] Fetching from URL:', url);
    
    // Simple fetch without retry for now
    const response = await fetch(url, { 
      headers: { 
        'Authorization': `Basic ${auth}`,
        'Accept': 'application/json'
      }
    });
    
    if (!response.ok) {
      const errorMsg = `Worklist fetch failed: ${response.status} ${response.statusText}`;
      console.error('[Photonic]', errorMsg);
      throw new Error(errorMsg);
    }
    
    console.log('[Photonic] Fetch successful, parsing response');
    const resp = response;
    
    const studies = await resp.json();
    dbg('Worklist returned', studies.length, 'items');
    
    // Reset error counter on success
    consecutiveErrors = 0;
    
    // Process studies in parallel with concurrency limit
    const promises = [];
    const concurrencyLimit = 3; // Process up to 3 studies at once
    
    for (let i = 0; i < studies.length; i += concurrencyLimit) {
      const batch = studies.slice(i, i + concurrencyLimit);
      const batchPromises = batch.map(async (study) => {
        try {
          const cached = await idbHasStudy(study.StudyInstanceUID);
          if (!cached) {
            await downloadAndStoreStudy(study, settings, auth);
          }
        } catch (err) {
          console.error(`[Photonic] Error processing study ${study.StudyInstanceUID}:`, err);
        }
      });
      
      // Wait for the current batch to complete before starting the next
      await Promise.all(batchPromises);
      promises.push(...batchPromises);
    }
    
    // Wait for all downloads to complete
    await Promise.all(promises);
    
    // Update badge with current count
    await updateBadge();
    
  } catch (err) {
    console.error('[Photonic] Worklist error:', err);
    
    // Increment error counter
    consecutiveErrors++;
    
    // Notify user if there are persistent errors
    if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
      chrome.notifications.create({
        type: 'basic',
        iconUrl: '/icons/icon48.png',
        title: 'Photonic Error',
        message: `Unable to connect to PACS. Please check your settings.`
      });
    }
  }
}

/**
 * Downloads and stores a study
 * @param {Object} study - Study metadata
 * @param {Object} settings - User settings
 * @param {string} auth - Base64 encoded authentication string
 */
async function downloadAndStoreStudy(study, settings, auth) {
  const uid = study.StudyInstanceUID;
  const studyDesc = study.StudyDescription || 'Unknown';
  
  dbg('Downloading', uid, studyDesc);
  
  try {
    // Check available space before downloading
    await enforceQuota(settings);
    
    // Download the study
    const url = `https://${settings.subdomain}.aikenist.com/dicom-web/studies/${uid}`;
    
    const resp = await retry(async () => {
      const response = await fetch(url, { 
        headers: { 'Authorization': `Basic ${auth}` } 
      });
      
      if (!response.ok) {
        throw new Error(`Study download failed: ${response.status} ${response.statusText}`);
      }
      
      return response;
    }, 2);
    
    const blob = await resp.blob();
    
    // Encrypt the study
    dbg('Encrypting', uid, `(${bytesToMB(blob.size)} MB)`);
    const enc = await encryptBlob(blob);
    
    // Add metadata
    enc.ts = Date.now();
    enc.size = enc.cipherText.byteLength;
    enc.originalSize = blob.size;
    enc.studyDesc = studyDesc;
    
    // Store in IndexedDB
    await idbPut(uid, enc);
    dbg('Stored', uid, `(${bytesToMB(enc.size)} MB)`);
    
    // Enforce quota again after storing
    await enforceQuota(settings);
    
    // Update badge
    updateBadge();
    
    // Show notification if enabled
    if (settings.notifyOnDownload) {
      chrome.notifications.create({
        type: 'basic',
        iconUrl: '/icons/icon48.png',
        title: 'Study Downloaded',
        message: `Study ${studyDesc} (${uid.substring(0, 8)}...) is now available offline.`
      });
    }
    
    return true;
  } catch (error) {
    console.error(`[Photonic] Error downloading study ${uid}:`, error);
    return false;
  }
}

// ------------------------------------------------ CACHE MANAGEMENT
/**
 * Enforces the storage quota by removing old studies
 * @param {Object} [settings] - User settings (will be fetched if not provided)
 */
async function enforceQuota(settings) {
  if (!settings) {
    const cfg = await getCfg();
    settings = cfg.settings;
  }
  
  try {
    // Get total size
    const totalBytes = await idbTotalSize();
    const maxBytes = gbToBytes(settings.maxGB);
    
    // If we're under quota, no need to remove anything
    if (totalBytes <= maxBytes) {
      return;
    }
    
    dbg(`Cache size ${bytesToGB(totalBytes)}GB exceeds limit of ${settings.maxGB}GB, cleaning up...`);
    
    // Get all studies ordered by age (oldest first)
    const studies = await idbGetByAge();
    
    // Calculate how much we need to remove
    const bytesToRemove = totalBytes - maxBytes;
    let removedBytes = 0;
    
    // Remove studies until we're under quota
    for (const study of studies) {
      if (removedBytes >= bytesToRemove) {
        break;
      }
      
      dbg(`Removing study ${study.uid} (${bytesToMB(study.size)} MB) due to quota`);
      await idbDelete(study.uid);
      removedBytes += study.size;
    }
    
    dbg(`Removed ${bytesToMB(removedBytes)} MB to enforce quota`);
    
    // Update badge
    updateBadge();
  } catch (error) {
    console.error('[Photonic] Error enforcing quota:', error);
  }
}

/**
 * Cleans up the cache by removing studies older than ttlDays
 */
async function cleanupCache() {
  try {
    const { settings } = await getCfg();
    if (!settings) return;
    
    const studies = await idbGetAll();
    const now = Date.now();
    let removedCount = 0;
    
    for (const study of studies) {
      const ageInDays = (now - study.ts) / (1000 * 60 * 60 * 24);
      
      if (ageInDays > settings.ttlDays) {
        dbg(`Removing study ${study.uid} (age: ${ageInDays.toFixed(1)} days)`);
        await idbDelete(study.uid);
        removedCount++;
      }
    }
    
    if (removedCount > 0) {
      dbg(`Removed ${removedCount} studies due to age > ${settings.ttlDays} days`);
      updateBadge();
    }
  } catch (error) {
    console.error('[Photonic] Error cleaning cache:', error);
  }
}

/**
 * Flushes the entire cache
 */
async function flushCache() {
  try {
    const studies = await idbGetAll();
    
    for (const study of studies) {
      await idbDelete(study.uid);
    }
    
    dbg(`Cache flushed (${studies.length} studies removed)`);
    updateBadge();
    
    return studies.length;
  } catch (error) {
    console.error('[Photonic] Error flushing cache:', error);
    throw error;
  }
}

// ------------------------------------------------ UTILITIES
/**
 * Updates the extension badge with the current study count
 */
async function updateBadge() {
  try {
    const studies = await idbGetAll();
    const count = studies.length.toString();
    
    chrome.action.setBadgeText({ text: count });
    chrome.action.setBadgeBackgroundColor({ color: '#4285F4' });
    
    // Update title with more details
    const totalSize = studies.reduce((sum, study) => sum + study.size, 0);
    const title = `Photonic: ${count} studies (${bytesToMB(totalSize)} MB)`;
    chrome.action.setTitle({ title });
  } catch (error) {
    console.error('[Photonic] Error updating badge:', error);
  }
}

/**
 * Gets the current configuration from storage
 * @returns {Promise<Object>} - Object containing settings and auth
 */
async function getCfg() {
  return chrome.storage.local.get(['settings', 'auth']);
}

// Start polling when the service worker activates
startPolling();