/**
 * IndexedDB wrapper for Photonic
 * Provides simplified access to the local study cache
 */

const DB_NAME = 'PhotonicCache';
const STORE_NAME = 'studies';
const DB_VERSION = 1;

/**
 * Opens the IndexedDB database
 * @returns {Promise<IDBDatabase>} - The database connection
 */
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

/**
 * Stores an encrypted study in IndexedDB
 * @param {string} uid - The StudyInstanceUID
 * @param {Object} data - The encrypted study data
 * @returns {Promise<void>}
 */
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

/**
 * Retrieves a study from IndexedDB
 * @param {string} uid - The StudyInstanceUID
 * @returns {Promise<Object|null>} - The study data or null if not found
 */
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

/**
 * Checks if a study exists in the cache
 * @param {string} uid - The StudyInstanceUID
 * @returns {Promise<boolean>} - True if the study exists
 */
async function idbHasStudy(uid) {
  const study = await idbGet(uid);
  return study !== null;
}

/**
 * Deletes a study from IndexedDB
 * @param {string} uid - The StudyInstanceUID
 * @returns {Promise<void>}
 */
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

/**
 * Gets all studies from IndexedDB
 * @returns {Promise<Array>} - Array of all stored studies
 */
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

/**
 * Gets the total size of all stored studies
 * @returns {Promise<number>} - Total size in bytes
 */
async function idbTotalSize() {
  const studies = await idbGetAll();
  return studies.reduce((total, study) => total + (study.size || 0), 0);
}

/**
 * Gets studies ordered by timestamp (oldest first)
 * @returns {Promise<Array>} - Array of studies ordered by timestamp
 */
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

// Export the functions
export { 
  idbPut, 
  idbGet, 
  idbHasStudy, 
  idbDelete, 
  idbGetAll, 
  idbTotalSize,
  idbGetByAge
};