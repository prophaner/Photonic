/**
 * Photonic Core - Consolidated functionality
 * Contains all shared utilities, encryption, database operations, and API functions
 */

// ================================================
// CONSTANTS AND CONFIGURATION
// ================================================

// Database configuration
const CACHE_DB_CONFIG = {
  name: 'PhotonicCache',
  storeName: 'studies',
  version: 1
};

const STUDIES_DB_CONFIG = {
  name: 'PhotonicStudies',
  storeName: 'studies',
  version: 1
};

// Study status constants
const STUDY_STATUS = {
  PENDING: 'pending',
  DOWNLOAD: 'download',
  DOWNLOADED: 'downloaded',
  ERROR: 'error',
  SKIPPED: 'skipped',
  DELETED: 'deleted'
};

// Default settings
const DEFAULT_SETTINGS = {
  subdomain: '',
  username: '',
  password: '',
  maxGB: 50,
  ttlDays: 7,
  filters: { status: 'READY' },
  pollIntervalSec: 60,
  enableAutoPolling: true,
  debug: false,
  notifyOnDownload: true
};

// ================================================
// UTILITY FUNCTIONS
// ================================================

/**
 * Converts bytes to megabytes with specified precision
 */
function bytesToMB(bytes, precision = 2) {
  return (bytes / 1048576).toFixed(precision);
}

/**
 * Converts bytes to gigabytes with specified precision
 */
function bytesToGB(bytes, precision = 2) {
  return (bytes / 1073741824).toFixed(precision);
}

/**
 * Converts megabytes to bytes
 */
function mbToBytes(mb) {
  return mb * 1048576;
}

/**
 * Converts gigabytes to bytes
 */
function gbToBytes(gb) {
  return gb * 1073741824;
}

/**
 * Formats a timestamp as a human-readable string
 */
function formatTimestamp(timestamp) {
  return new Date(timestamp).toLocaleString();
}

/**
 * Calculates the age of a timestamp in days
 */
function getAgeInDays(timestamp) {
  const now = Date.now();
  const ageMs = now - timestamp;
  return ageMs / (1000 * 60 * 60 * 24);
}

/**
 * Creates a throttled version of a function
 */
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

/**
 * Retries a function multiple times with exponential backoff
 */
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

// ================================================
// ENCRYPTION FUNCTIONS
// ================================================

/**
 * Encrypts a blob using AES-GCM with a random key and IV
 */
async function encryptBlob(blob) {
  try {
    const key = await window.crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt']
    );

    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const exportedKey = await window.crypto.subtle.exportKey('raw', key);
    const arrayBuffer = await blob.arrayBuffer();

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

/**
 * Decrypts a previously encrypted blob
 */
async function decryptToBlob(encryptedData) {
  try {
    const key = await window.crypto.subtle.importKey(
      'raw',
      encryptedData.key,
      { name: 'AES-GCM', length: 256 },
      false,
      ['decrypt']
    );

    const decryptedBuffer = await window.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: encryptedData.iv },
      key,
      encryptedData.cipherText
    );

    return new Blob([decryptedBuffer], { type: 'application/dicom' });
  } catch (error) {
    console.error('[Photonic] Decryption error:', error);
    throw new Error('Failed to decrypt data: ' + error.message);
  }
}

/**
 * Encrypts a password string using AES-GCM
 */
async function encryptPassword(password) {
  try {
    const key = await window.crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt']
    );

    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const exportedKey = await window.crypto.subtle.exportKey('raw', key);
    const encoder = new TextEncoder();
    const passwordBuffer = encoder.encode(password);

    const cipherText = await window.crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      passwordBuffer
    );

    return {
      cipherText: Array.from(new Uint8Array(cipherText)),
      key: Array.from(new Uint8Array(exportedKey)),
      iv: Array.from(iv)
    };
  } catch (error) {
    console.error('[Photonic] Password encryption error:', error);
    throw new Error('Failed to encrypt password: ' + error.message);
  }
}

/**
 * Decrypts a previously encrypted password
 */
async function decryptPassword(encryptedData) {
  try {
    const keyArray = new Uint8Array(encryptedData.key);
    const ivArray = new Uint8Array(encryptedData.iv);
    const cipherArray = new Uint8Array(encryptedData.cipherText);

    const key = await window.crypto.subtle.importKey(
      'raw',
      keyArray,
      { name: 'AES-GCM', length: 256 },
      false,
      ['decrypt']
    );

    const decryptedBuffer = await window.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: ivArray },
      key,
      cipherArray
    );

    const decoder = new TextDecoder();
    return decoder.decode(decryptedBuffer);
  } catch (error) {
    console.error('[Photonic] Password decryption error:', error);
    throw new Error('Failed to decrypt password: ' + error.message);
  }
}

// ================================================
// INDEXEDDB FUNCTIONS - CACHE
// ================================================

/**
 * Opens the IndexedDB cache database
 */
function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(CACHE_DB_CONFIG.name, CACHE_DB_CONFIG.version);

    request.onerror = (event) => {
      console.error('[Photonic] Cache database error:', event.target.error);
      reject(event.target.error);
    };

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(CACHE_DB_CONFIG.storeName)) {
        const store = db.createObjectStore(CACHE_DB_CONFIG.storeName, { keyPath: 'uid' });
        store.createIndex('timestamp', 'ts', { unique: false });
        store.createIndex('size', 'size', { unique: false });
      }
    };

    request.onsuccess = (event) => {
      resolve(event.target.result);
    };
  });
}

/**
 * Stores an encrypted study in IndexedDB cache
 */
async function idbPut(uid, data) {
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([CACHE_DB_CONFIG.storeName], 'readwrite');
      const store = transaction.objectStore(CACHE_DB_CONFIG.storeName);
      const record = { ...data, uid };
      const request = store.put(record);

      request.onerror = (event) => {
        console.error('[Photonic] Error storing study:', event.target.error);
        reject(event.target.error);
      };

      request.onsuccess = () => resolve();
      transaction.oncomplete = () => db.close();
    });
  } catch (error) {
    console.error('[Photonic] Database put error:', error);
    throw error;
  }
}

/**
 * Retrieves a study from IndexedDB cache
 */
async function idbGet(uid) {
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([CACHE_DB_CONFIG.storeName], 'readonly');
      const store = transaction.objectStore(CACHE_DB_CONFIG.storeName);
      const request = store.get(uid);

      request.onerror = (event) => {
        console.error('[Photonic] Error retrieving study:', event.target.error);
        reject(event.target.error);
      };

      request.onsuccess = (event) => {
        resolve(event.target.result || null);
      };

      transaction.oncomplete = () => db.close();
    });
  } catch (error) {
    console.error('[Photonic] Database get error:', error);
    throw error;
  }
}

/**
 * Checks if a study exists in the cache
 */
async function idbHasStudy(uid) {
  const study = await idbGet(uid);
  return study !== null;
}

/**
 * Deletes a study from IndexedDB cache
 */
async function idbDelete(uid) {
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([CACHE_DB_CONFIG.storeName], 'readwrite');
      const store = transaction.objectStore(CACHE_DB_CONFIG.storeName);
      const request = store.delete(uid);

      request.onerror = (event) => {
        console.error('[Photonic] Error deleting study:', event.target.error);
        reject(event.target.error);
      };

      request.onsuccess = () => resolve();
      transaction.oncomplete = () => db.close();
    });
  } catch (error) {
    console.error('[Photonic] Database delete error:', error);
    throw error;
  }
}

/**
 * Gets all studies from IndexedDB cache
 */
async function idbGetAll() {
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([CACHE_DB_CONFIG.storeName], 'readonly');
      const store = transaction.objectStore(CACHE_DB_CONFIG.storeName);
      const request = store.getAll();

      request.onerror = (event) => {
        console.error('[Photonic] Error retrieving all studies:', event.target.error);
        reject(event.target.error);
      };

      request.onsuccess = (event) => {
        resolve(event.target.result || []);
      };

      transaction.oncomplete = () => db.close();
    });
  } catch (error) {
    console.error('[Photonic] Database getAll error:', error);
    throw error;
  }
}

/**
 * Gets the total size of all stored studies
 */
async function idbTotalSize() {
  const studies = await idbGetAll();
  return studies.reduce((total, study) => total + (study.size || 0), 0);
}

/**
 * Gets studies ordered by timestamp (oldest first)
 */
async function idbGetByAge() {
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([CACHE_DB_CONFIG.storeName], 'readonly');
      const store = transaction.objectStore(CACHE_DB_CONFIG.storeName);
      const index = store.index('timestamp');
      const request = index.getAll();

      request.onerror = (event) => {
        console.error('[Photonic] Error retrieving studies by age:', event.target.error);
        reject(event.target.error);
      };

      request.onsuccess = (event) => {
        resolve(event.target.result || []);
      };

      transaction.oncomplete = () => db.close();
    });
  } catch (error) {
    console.error('[Photonic] Database getByAge error:', error);
    throw error;
  }
}

// ================================================
// INDEXEDDB FUNCTIONS - STUDIES DATABASE
// ================================================

/**
 * Opens the Studies database
 */
function openStudiesDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(STUDIES_DB_CONFIG.name, STUDIES_DB_CONFIG.version);

    request.onerror = (event) => {
      console.error('[Photonic] Studies database error:', event.target.error);
      reject(event.target.error);
    };

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STUDIES_DB_CONFIG.storeName)) {
        const store = db.createObjectStore(STUDIES_DB_CONFIG.storeName, { keyPath: 'study_id' });

        // Create indexes for efficient querying
        store.createIndex('status', 'status', { unique: false });
        store.createIndex('patient_id', 'patient_id', { unique: false });
        store.createIndex('patient_name', 'patient_name', { unique: false });
        store.createIndex('diag_centre_name', 'diag_centre_name', { unique: false });
        store.createIndex('download_time', 'download_time', { unique: false });
        store.createIndex('delete_time', 'delete_time', { unique: false });
        store.createIndex('created_at', 'created_at', { unique: false });

        console.log('[Photonic] Studies database schema created');
      }
    };

    request.onsuccess = (event) => {
      resolve(event.target.result);
    };
  });
}

/**
 * Stores a study record in the Studies database
 */
async function studiesDbPut(studyData) {
  try {
    const db = await openStudiesDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STUDIES_DB_CONFIG.storeName], 'readwrite');
      const store = transaction.objectStore(STUDIES_DB_CONFIG.storeName);

      const record = {
        study_id: studyData.study_id,
        patient_name: studyData.patient_name || '',
        patient_id: studyData.patient_id || '',
        diag_centre_name: studyData.diag_centre_name || '',
        status: studyData.status || STUDY_STATUS.DOWNLOAD,
        download_time: studyData.download_time || null,
        delete_time: studyData.delete_time || null,
        error: studyData.error || 'None',
        created_at: studyData.created_at || new Date().toISOString(),
        updated_at: new Date().toISOString(),
        study_instance_uid: studyData.study_instance_uid || '',
        study_instance_uuid: studyData.study_instance_uuid || '',
        file_path: studyData.file_path || '',
        file_size: studyData.file_size || 0,
        priority: studyData.priority || 0,
        retry_count: studyData.retry_count || 0,
        last_retry: studyData.last_retry || null
      };

      const request = store.put(record);

      request.onerror = (event) => {
        console.error('[Photonic] Error storing study:', event.target.error);
        reject(event.target.error);
      };

      request.onsuccess = () => {
        console.log('[Photonic] Study stored:', record.study_id);
        resolve();
      };

      transaction.oncomplete = () => db.close();
    });
  } catch (error) {
    console.error('[Photonic] Studies database put error:', error);
    throw error;
  }
}

/**
 * Retrieves a study from the Studies database
 */
async function studiesDbGet(studyId) {
  try {
    const db = await openStudiesDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STUDIES_DB_CONFIG.storeName], 'readonly');
      const store = transaction.objectStore(STUDIES_DB_CONFIG.storeName);
      const request = store.get(studyId);

      request.onerror = (event) => {
        console.error('[Photonic] Error retrieving study:', event.target.error);
        reject(event.target.error);
      };

      request.onsuccess = (event) => {
        resolve(event.target.result || null);
      };

      transaction.oncomplete = () => db.close();
    });
  } catch (error) {
    console.error('[Photonic] Studies database get error:', error);
    throw error;
  }
}

/**
 * Gets all studies from the Studies database
 */
async function studiesDbGetAll() {
  try {
    const db = await openStudiesDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STUDIES_DB_CONFIG.storeName], 'readonly');
      const store = transaction.objectStore(STUDIES_DB_CONFIG.storeName);
      const request = store.getAll();

      request.onerror = (event) => {
        console.error('[Photonic] Error retrieving all studies:', event.target.error);
        reject(event.target.error);
      };

      request.onsuccess = (event) => {
        resolve(event.target.result || []);
      };

      transaction.oncomplete = () => db.close();
    });
  } catch (error) {
    console.error('[Photonic] Studies database getAll error:', error);
    throw error;
  }
}

/**
 * Deletes a study from the Studies database
 */
async function studiesDbDelete(studyId) {
  try {
    const db = await openStudiesDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STUDIES_DB_CONFIG.storeName], 'readwrite');
      const store = transaction.objectStore(STUDIES_DB_CONFIG.storeName);
      const request = store.delete(studyId);

      request.onerror = (event) => {
        console.error('[Photonic] Error deleting study:', event.target.error);
        reject(event.target.error);
      };

      request.onsuccess = () => {
        console.log('[Photonic] Study deleted:', studyId);
        resolve();
      };

      transaction.oncomplete = () => db.close();
    });
  } catch (error) {
    console.error('[Photonic] Studies database delete error:', error);
    throw error;
  }
}

/**
 * Clears all studies from the Studies database
 */
async function studiesDbClear() {
  try {
    const db = await openStudiesDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STUDIES_DB_CONFIG.storeName], 'readwrite');
      const store = transaction.objectStore(STUDIES_DB_CONFIG.storeName);
      const request = store.clear();

      request.onerror = (event) => {
        console.error('[Photonic] Error clearing studies database:', event.target.error);
        reject(event.target.error);
      };

      request.onsuccess = () => {
        console.log('[Photonic] Studies database cleared');
        resolve();
      };

      transaction.oncomplete = () => db.close();
    });
  } catch (error) {
    console.error('[Photonic] Studies database clear error:', error);
    throw error;
  }
}

/**
 * Gets studies by status from the Studies database
 */
async function studiesDbGetByStatus(status) {
  try {
    const db = await openStudiesDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STUDIES_DB_CONFIG.storeName], 'readonly');
      const store = transaction.objectStore(STUDIES_DB_CONFIG.storeName);
      const index = store.index('status');
      const request = index.getAll(status);

      request.onerror = (event) => {
        console.error('[Photonic] Error retrieving studies by status:', event.target.error);
        reject(event.target.error);
      };

      request.onsuccess = (event) => {
        resolve(event.target.result || []);
      };

      transaction.oncomplete = () => db.close();
    });
  } catch (error) {
    console.error('[Photonic] Studies database getByStatus error:', error);
    throw error;
  }
}

/**
 * Updates the status of a study in the Studies database
 */
async function studiesDbUpdateStatus(studyId, status, additionalData = {}) {
  try {
    const db = await openStudiesDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STUDIES_DB_CONFIG.storeName], 'readwrite');
      const store = transaction.objectStore(STUDIES_DB_CONFIG.storeName);

      // First get the existing study
      const getRequest = store.get(studyId);

      getRequest.onerror = (event) => {
        console.error('[Photonic] Error retrieving study for update:', event.target.error);
        reject(event.target.error);
      };

      getRequest.onsuccess = (event) => {
        const study = event.target.result;
        if (!study) {
          reject(new Error(`Study with ID ${studyId} not found`));
          return;
        }

        // Update the study with new status and additional data
        const updatedStudy = {
          ...study,
          status: status,
          updated_at: new Date().toISOString(),
          ...additionalData
        };

        // Put the updated study back
        const putRequest = store.put(updatedStudy);

        putRequest.onerror = (event) => {
          console.error('[Photonic] Error updating study status:', event.target.error);
          reject(event.target.error);
        };

        putRequest.onsuccess = (event) => {
          console.log(`[Photonic] Study ${studyId} status updated to ${status}`);
          resolve(updatedStudy);
        };
      };

      transaction.oncomplete = () => db.close();
    });
  } catch (error) {
    console.error('[Photonic] Studies database updateStatus error:', error);
    throw error;
  }
}

// ================================================
// API FUNCTIONS
// ================================================

/**
 * Authenticates with the API
 */
async function authenticateWithAPI(credentials) {
  try {
    console.log('[Photonic] Authenticating with API for user:', credentials.username);

    const loginUrl = 'https://toprad.aikenist.com/api/quickrad/telerad/login-validation';

    const formData = new FormData();
    formData.append('email', credentials.username);
    formData.append('password', credentials.password);

    const response = await fetch(loginUrl, {
      method: 'POST',
      body: formData,
      headers: {
        'Accept': 'application/json'
      }
    });

    console.log('[Photonic] Authentication response status:', response.status, response.statusText);

    if (!response.ok) {
      if (response.status === 429) {
        throw new Error('Too many login attempts. Account may be temporarily locked.');
      }
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    console.log('[Photonic] Authentication response data:', data);

    if (!data.status || !data.token) {
      throw new Error(data.message || 'Authentication failed - no valid token received');
    }

    console.log('[Photonic] Authentication successful, token received');

    return {
      success: true,
      token: data.token,
      message: data.message
    };

  } catch (error) {
    console.error('[Photonic] Authentication error:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Fetches the work list from the API
 */
async function fetchWorkList(token) {
  try {
    const workListUrl = 'https://toprad.aikenist.com/api/quickrad/telerad/fetch-admin-list';

    console.log('[Photonic] Fetching work list from:', workListUrl);

    const formData = new FormData();
    formData.append('page_size', '100');
    formData.append('page_num', '1');

    const response = await fetch(workListUrl, {
      method: 'POST',
      body: formData,
      headers: {
        'Authorization': `JWT ${token}`,
        'Accept': 'application/json'
      }
    });

    console.log('[Photonic] Work list response status:', response.status, response.statusText);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    console.log('[Photonic] Work list response data:', typeof data, data);

    return data;

  } catch (error) {
    console.error('[Photonic] Error fetching work list:', error);
    throw error;
  }
}

/**
 * Cleans patient name for use in filenames
 */
function cleanPatientName(name) {
  if (!name || typeof name !== 'string') {
    return 'Unknown_Patient';
  }

  let cleaned = name
    .replace(/[^A-Za-z0-9\s\-_]/g, '')
    .replace(/\s+/g, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^_+|_+$/g, '')
    .trim();

  if (!cleaned) {
    cleaned = 'Unknown_Patient';
  }

  if (cleaned.length > 50) {
    cleaned = cleaned.substring(0, 50);
  }

  return cleaned;
}

// ================================================
// EXPORT FUNCTIONS
// ================================================

// Make functions globally available for browser extension environment
if (typeof window !== 'undefined') {
  // Utility functions
  window.bytesToMB = bytesToMB;
  window.bytesToGB = bytesToGB;
  window.mbToBytes = mbToBytes;
  window.gbToBytes = gbToBytes;
  window.formatTimestamp = formatTimestamp;
  window.getAgeInDays = getAgeInDays;
  window.throttle = throttle;
  window.retry = retry;

  // Encryption functions
  window.encryptBlob = encryptBlob;
  window.decryptToBlob = decryptToBlob;
  window.encryptPassword = encryptPassword;
  window.decryptPassword = decryptPassword;

  // Cache database functions
  window.idbPut = idbPut;
  window.idbGet = idbGet;
  window.idbHasStudy = idbHasStudy;
  window.idbDelete = idbDelete;
  window.idbGetAll = idbGetAll;
  window.idbTotalSize = idbTotalSize;
  window.idbGetByAge = idbGetByAge;

  // Studies database functions
  window.studiesDbPut = studiesDbPut;
  window.studiesDbGet = studiesDbGet;
  window.studiesDbGetAll = studiesDbGetAll;
  window.studiesDbDelete = studiesDbDelete;
  window.studiesDbClear = studiesDbClear;
  window.studiesDbGetByStatus = studiesDbGetByStatus;

  // API functions
  window.authenticateWithAPI = authenticateWithAPI;
  window.fetchWorkList = fetchWorkList;
  window.cleanPatientName = cleanPatientName;

  // Constants
  window.STUDY_STATUS = STUDY_STATUS;
  window.DEFAULT_SETTINGS = DEFAULT_SETTINGS;
}
