/**
 * Study Downloader for Photonic
 * Handles parallel downloading of studies marked for download
 */

/**
 * Main downloader trigger - searches for studies with download status and downloads them
 * @param {Object} credentials - Authentication credentials
 * @param {Object} options - Download options
 * @returns {Promise<Object>} - Download result summary
 */
async function triggerStudyDownloads(credentials, options = {}) {
  try {
    console.log('[Photonic] Starting download trigger...');
    
    // CRITICAL: Validate credentials before proceeding
    if (!credentials || !credentials.username || !credentials.password) {
      throw new Error('Invalid credentials provided for download trigger');
    }
    
    // Get studies marked for download
    const studiesToDownload = await studiesDbGetByStatus(STUDY_STATUS.DOWNLOAD);
    
    // CRITICAL: Validate each study before attempting download
    const validStudies = studiesToDownload.filter(study => {
      if (!study || !study.study_instance_uid || !study.study_id) {
        console.warn('[Photonic] Skipping invalid study:', study);
        return false;
      }
      return true;
    });
    
    if (validStudies.length !== studiesToDownload.length) {
      console.warn(`[Photonic] Filtered out ${studiesToDownload.length - validStudies.length} invalid studies`);
    }
    
    if (validStudies.length === 0) {
      console.log('[Photonic] No valid studies marked for download');
      return {
        success: true,
        message: 'No valid studies marked for download',
        total: 0,
        downloaded: 0,
        errors: 0,
        results: []
      };
    }
    
    console.log(`[Photonic] Found ${validStudies.length} valid studies to download`);
    
    // Authenticate first
    const authResult = await authenticateWithAPI(credentials);
    if (!authResult.success) {
      throw new Error(`Authentication failed: ${authResult.error}`);
    }
    
    // Download studies in parallel (with concurrency limit)
    const maxConcurrent = options.maxConcurrent || 3;
    const results = await downloadStudiesInParallel(validStudies, authResult.token, maxConcurrent);
    
    // Summarize results
    const summary = summarizeDownloadResults(results);
    console.log('[Photonic] Download summary:', summary.message);
    
    return summary;
    
  } catch (error) {
    console.error('[Photonic] Error in download trigger:', error);
    return {
      success: false,
      error: error.message,
      total: 0,
      downloaded: 0,
      errors: 1,
      results: []
    };
  }
}

/**
 * Downloads studies in parallel with concurrency control
 * @param {Array} studies - Studies to download
 * @param {string} token - Authentication token
 * @param {number} maxConcurrent - Maximum concurrent downloads
 * @returns {Promise<Array>} - Array of download results
 */
async function downloadStudiesInParallel(studies, token, maxConcurrent = 3) {
  const results = [];
  const downloadQueue = [...studies];
  const activeDownloads = new Set();
  
  return new Promise((resolve) => {
    const processNext = async () => {
      // Check if we're done
      if (downloadQueue.length === 0 && activeDownloads.size === 0) {
        resolve(results);
        return;
      }
      
      // Start new downloads if we have capacity and items in queue
      while (activeDownloads.size < maxConcurrent && downloadQueue.length > 0) {
        const study = downloadQueue.shift();
        const downloadPromise = downloadSingleStudy(study, token);
        
        activeDownloads.add(downloadPromise);
        
        downloadPromise
          .then((result) => {
            results.push(result);
            activeDownloads.delete(downloadPromise);
            processNext();
          })
          .catch((error) => {
            results.push({
              study_id: study.study_id,
              success: false,
              error: error.message,
              patient_name: study.patient_name
            });
            activeDownloads.delete(downloadPromise);
            processNext();
          });
      }
    };
    
    processNext();
  });
}

/**
 * Downloads a single study
 * @param {Object} study - Study object to download
 * @param {string} token - Authentication token
 * @returns {Promise<Object>} - Download result
 */
async function downloadSingleStudy(study, token) {
  try {
    console.log(`[Photonic] Starting download for study: ${study.study_id} (${study.patient_name})`);
    
    // CRITICAL: Validate study data before proceeding
    if (!study || !study.study_instance_uid) {
      throw new Error(`Invalid study data: missing study_instance_uid`);
    }
    
    if (!token || typeof token !== 'string') {
      throw new Error(`Invalid authentication token provided`);
    }
    
    // Step 1: Get internal UUID for the study
    const internalUuid = await fetchInternalUuid(study.study_instance_uid, token);
    
    // CRITICAL: Validate the UUID we got back
    if (!internalUuid || internalUuid === 'undefined' || typeof internalUuid !== 'string' || internalUuid.trim() === '') {
      throw new Error(`Failed to get valid internal UUID for study ${study.study_id}. Got: ${internalUuid}`);
    }
    
    // Update study with UUID
    await studiesDbUpdateStatus(study.study_id, STUDY_STATUS.DOWNLOAD, {
      study_instance_uuid: internalUuid
    });
    
    // Step 2: Download the ZIP file
    const downloadResult = await downloadStudyZip(internalUuid, study, token);
    
    // Step 3: Update study status to downloaded
    await studiesDbUpdateStatus(study.study_id, STUDY_STATUS.DOWNLOADED, {
      file_path: downloadResult.filePath,
      file_size: downloadResult.fileSize,
      download_time: new Date().toISOString()
    });
    
    console.log(`[Photonic] Successfully downloaded: ${study.patient_name}.zip`);
    
    return {
      study_id: study.study_id,
      success: true,
      patient_name: study.patient_name,
      file_path: downloadResult.filePath,
      file_size: downloadResult.fileSize,
      message: 'Download completed successfully'
    };
    
  } catch (error) {
    console.error(`[Photonic] Error downloading study ${study.study_id}:`, error);
    
    // Update study status to error
    try {
      await studiesDbUpdateStatus(study.study_id, STUDY_STATUS.ERROR, {
        error: error.message,
        retry_count: (study.retry_count || 0) + 1,
        last_retry: new Date().toISOString()
      });
    } catch (updateError) {
      console.error('[Photonic] Error updating study status:', updateError);
    }
    
    return {
      study_id: study.study_id,
      success: false,
      patient_name: study.patient_name,
      error: error.message
    };
  }
}

/**
 * Fetches the internal UUID for a study
 * @param {string} studyInstanceUid - Study instance UID
 * @param {string} token - Authentication token
 * @returns {Promise<string>} - Internal UUID
 */
async function fetchInternalUuid(studyInstanceUid, token) {
  try {
    // CRITICAL: Validate inputs before making any requests
    if (!studyInstanceUid || typeof studyInstanceUid !== 'string' || studyInstanceUid.trim() === '') {
      throw new Error(`Invalid study_instance_uid provided: ${studyInstanceUid}`);
    }
    
    if (!token || typeof token !== 'string') {
      throw new Error(`Invalid token provided for UUID fetch`);
    }
    
    const miscUrl = 'https://toprad.aikenist.com/api/quickrad/general/get-misc-study-data';
    
    const formData = new FormData();
    formData.append('study_instance_uid', studyInstanceUid);
    
    const response = await fetch(miscUrl, {
      method: 'POST',
      body: formData,
      headers: {
        'Authorization': `JWT ${token}`,
        'Accept': 'application/json'
      }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    const uuid = data.study_data?.study_instance_uuid;
    
    if (!uuid || uuid === 'undefined' || typeof uuid !== 'string' || uuid.trim() === '') {
      console.error('[Photonic] Invalid UUID in response:', data);
      throw new Error(`Invalid study_instance_uuid in response: ${uuid}`);
    }
    
    console.log(`[Photonic] Successfully fetched UUID: ${uuid}`);
    return uuid;
    
  } catch (error) {
    console.error('[Photonic] Error fetching internal UUID:', error);
    throw error;
  }
}

/**
 * Downloads a study ZIP file
 * @param {string} uuid - Internal study UUID
 * @param {Object} study - Study object
 * @param {string} token - Authentication token
 * @returns {Promise<Object>} - Download result with file path and size
 */
async function downloadStudyZip(uuid, study, token) {
  try {
    // CRITICAL: Validate UUID before making any requests
    if (!uuid || uuid === 'undefined' || typeof uuid !== 'string' || uuid.trim() === '') {
      throw new Error(`Invalid UUID provided: ${uuid}. Cannot download study.`);
    }
    
    const archiveUrl = `https://toprad.aikenist.com/dicom-web/studies/${uuid}/archive`;
    
    console.log(`[Photonic] Downloading ZIP from: ${archiveUrl}`);
    
    const response = await fetch(archiveUrl, {
      method: 'GET',
      headers: {
        'Authorization': `JWT ${token}`
      }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    // Get the response as a blob
    const blob = await response.blob();
    
    // Create filename: "MRN - Name.zip"
    const filename = createZipFilename(study);
    
    // In a browser extension, we'll use the Downloads API
    const downloadResult = await saveZipFile(blob, filename);
    
    return {
      filePath: downloadResult.filePath,
      fileSize: blob.size,
      filename: filename
    };
    
  } catch (error) {
    console.error('[Photonic] Error downloading ZIP:', error);
    throw error;
  }
}

/**
 * Creates a filename for the ZIP file in format "MRN - Name.zip"
 * @param {Object} study - Study object
 * @returns {string} - Formatted filename
 */
function createZipFilename(study) {
  const mrn = study.patient_id || 'Unknown_MRN';
  const name = study.patient_name || 'Unknown_Patient';
  
  // Clean the components for filename use - allow spaces, hyphens, and underscores
  const cleanMrn = mrn.replace(/[^A-Za-z0-9\-_\s]/g, '').trim().substring(0, 20);
  const cleanName = name.replace(/[^A-Za-z0-9\-_\s]/g, '').trim().substring(0, 30);
  
  return `${cleanMrn} - ${cleanName}.zip`;
}

/**
 * Saves the ZIP file using the browser's download API
 * @param {Blob} blob - File blob
 * @param {string} filename - Desired filename
 * @returns {Promise<Object>} - Save result
 */
async function saveZipFile(blob, filename) {
  try {
    // Create object URL for the blob
    const url = URL.createObjectURL(blob);
    
    // Get the study location folder from settings
    const studyLocationFolder = await getStudyLocationFolder();
    const downloadPath = `${studyLocationFolder}/${filename}`;
    
    // Use Chrome's downloads API if available (extension context)
    if (typeof chrome !== 'undefined' && chrome.downloads) {
      return new Promise((resolve, reject) => {
        chrome.downloads.download({
          url: url,
          filename: downloadPath,
          saveAs: false // Don't prompt user
        }, (downloadId) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            // Clean up the object URL
            URL.revokeObjectURL(url);
            
            // Get the full file path by querying the download
            chrome.downloads.search({id: downloadId}, (downloads) => {
              const fullPath = downloads.length > 0 ? downloads[0].filename : downloadPath;
              resolve({
                downloadId: downloadId,
                filePath: fullPath,
                success: true
              });
            });
          }
        });
      });
    } else {
      // Fallback for non-extension environments
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      // Construct the expected full path for non-extension environments
      const defaultDownloadsPath = getDefaultDownloadsPath();
      const fullPath = `${defaultDownloadsPath}/${studyLocationFolder}/${filename}`;
      
      return {
        filePath: fullPath,
        success: true
      };
    }
    
  } catch (error) {
    console.error('[Photonic] Error saving ZIP file:', error);
    throw error;
  }
}

/**
 * Get the study location folder from settings
 */
async function getStudyLocationFolder() {
  try {
    let settings = {};
    
    if (typeof chrome !== 'undefined' && chrome.storage) {
      // Extension environment
      const result = await chrome.storage.local.get(['photonic_settings']);
      settings = result.photonic_settings || {};
    } else {
      // Standalone environment
      const saved = localStorage.getItem('photonic_settings');
      if (saved) {
        settings = JSON.parse(saved);
      }
    }
    
    return settings.studyLocationFolder || 'Photonic';
  } catch (error) {
    console.error('[Photonic] Error getting study location folder:', error);
    return 'Photonic'; // Default fallback
  }
}

/**
 * Get default downloads directory path
 */
/**
 * Get the current Windows username
 */
function getUserName() {
  // In a browser extension, we can't directly access environment variables
  // For this specific case, we know the username from the project path
  return 'LuisRamos';
}

function getDefaultDownloadsPath() {
  const userAgent = navigator.userAgent;
  const platform = navigator.platform;
  
  if (platform.indexOf('Win') !== -1 || userAgent.indexOf('Windows') !== -1) {
    // Windows - return the resolved path instead of environment variable
    return `C:\\Users\\${getUserName()}\\Downloads`;
  } else if (platform.indexOf('Mac') !== -1 || userAgent.indexOf('Mac') !== -1) {
    // macOS
    return '~/Downloads';
  } else {
    // Linux or other
    return '~/Downloads';
  }
}

/**
 * Summarizes download results
 * @param {Array} results - Array of download results
 * @returns {Object} - Summary object
 */
function summarizeDownloadResults(results) {
  const total = results.length;
  const downloaded = results.filter(r => r.success).length;
  const errors = results.filter(r => !r.success).length;
  
  return {
    success: true,
    total,
    downloaded,
    errors,
    results,
    message: `Download completed: ${downloaded}/${total} successful, ${errors} errors`
  };
}

/**
 * Retries failed downloads
 * @param {Object} credentials - Authentication credentials
 * @param {number} maxRetries - Maximum retry attempts
 * @returns {Promise<Object>} - Retry result summary
 */
async function retryFailedDownloads(credentials, maxRetries = 3) {
  try {
    console.log('[Photonic] Checking for failed downloads to retry...');
    
    // Get studies with error status that haven't exceeded retry limit
    const allStudies = await studiesDbGetAll();
    const failedStudies = allStudies.filter(study => 
      study.status === STUDY_STATUS.ERROR && 
      (study.retry_count || 0) < maxRetries
    );
    
    if (failedStudies.length === 0) {
      return {
        success: true,
        message: 'No failed downloads to retry',
        total: 0,
        retried: 0,
        errors: 0
      };
    }
    
    console.log(`[Photonic] Found ${failedStudies.length} failed downloads to retry`);
    
    // Reset status to download for retry
    for (const study of failedStudies) {
      await studiesDbUpdateStatus(study.study_id, STUDY_STATUS.DOWNLOAD);
    }
    
    // Trigger downloads
    return await triggerStudyDownloads(credentials);
    
  } catch (error) {
    console.error('[Photonic] Error retrying failed downloads:', error);
    return {
      success: false,
      error: error.message,
      total: 0,
      retried: 0,
      errors: 1
    };
  }
}

// Export functions
if (typeof module !== 'undefined' && module.exports) {
  // Node.js environment
  module.exports = {
    triggerStudyDownloads,
    downloadSingleStudy,
    retryFailedDownloads,
    createZipFilename
  };
} else {
  // Browser environment - make functions globally available
  window.triggerStudyDownloads = triggerStudyDownloads;
  window.downloadSingleStudy = downloadSingleStudy;
  window.retryFailedDownloads = retryFailedDownloads;
  window.createZipFilename = createZipFilename;
}