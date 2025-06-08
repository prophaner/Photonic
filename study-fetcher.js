/**
 * Study List Fetcher for Photonic
 * Handles fetching, parsing, and storing study lists from the API
 */

// Core functionality loaded via HTML script tag

/**
 * Fetches the study list from the API after authentication
 * @param {Object} credentials - Authentication credentials
 * @returns {Promise<Array>} - Array of study objects
 */
async function fetchStudyList(credentials) {
  try {
    console.log('[Photonic] fetchStudyList called with credentials:', {
      username: credentials?.username,
      hasPassword: !!credentials?.password
    });
    
    // Check if core functions are available
    console.log('[Photonic] Checking core functions availability:', {
      authenticateWithAPI: typeof authenticateWithAPI,
      fetchWorkList: typeof fetchWorkList
    });
    
    if (typeof authenticateWithAPI === 'undefined') {
      throw new Error('authenticateWithAPI function not available - core.js may not be loaded');
    }
    
    if (typeof fetchWorkList === 'undefined') {
      throw new Error('fetchWorkList function not available - core.js may not be loaded');
    }
    
    // Use the existing authentication system from core.js
    console.log('[Photonic] Calling authenticateWithAPI...');
    const authResult = await authenticateWithAPI(credentials);
    console.log('[Photonic] Authentication result:', authResult);
    
    if (!authResult.success) {
      throw new Error(`Authentication failed: ${authResult.error}`);
    }
    
    // Fetch the work list using the authenticated session
    console.log('[Photonic] Calling fetchWorkList with token...');
    const workListResponse = await fetchWorkList(authResult.token);
    console.log('[Photonic] Work list response:', typeof workListResponse, workListResponse);
    
    // Parse and clean up the response
    console.log('[Photonic] Calling parseStudyList...');
    const studies = parseStudyList(workListResponse);
    console.log('[Photonic] parseStudyList returned:', typeof studies, Array.isArray(studies), studies);
    
    if (!Array.isArray(studies)) {
      console.error('[Photonic] parseStudyList did not return an array:', studies);
      throw new Error('Failed to parse study list - invalid response format');
    }
    
    console.log(`[Photonic] fetchStudyList returning ${studies.length} studies`);
    return studies;
    
  } catch (error) {
    console.error('[Photonic] Error in fetchStudyList:', error);
    throw error;
  }
}



/**
 * Parses and cleans the study list response
 * @param {Object} response - Raw API response
 * @returns {Array} - Cleaned array of study objects
 */
function parseStudyList(response) {
  try {
    console.log('[Photonic] parseStudyList called with response:', typeof response, response);
    
    // Extract studies from response (handle different response formats)
    let studies = [];
    
    if (Array.isArray(response)) {
      console.log('[Photonic] Response is array with', response.length, 'items');
      studies = response;
    } else if (response && response.study_list && Array.isArray(response.study_list)) {
      console.log('[Photonic] Found study_list array with', response.study_list.length, 'items');
      studies = response.study_list;
    } else if (response && response.data && Array.isArray(response.data)) {
      console.log('[Photonic] Found data array with', response.data.length, 'items');
      studies = response.data;
    } else {
      console.warn('[Photonic] Unexpected response format:', response);
      console.warn('[Photonic] Response type:', typeof response);
      console.warn('[Photonic] Response keys:', response ? Object.keys(response) : 'null/undefined');
      return [];
    }
    
    console.log('[Photonic] Processing', studies.length, 'raw studies');
    
    // Clean and standardize each study
    const cleanedStudies = studies.map(study => cleanStudyData(study)).filter(study => study !== null);
    
    console.log('[Photonic] Cleaned studies:', cleanedStudies.length, 'valid studies');
    
    // Ensure we always return an array
    return Array.isArray(cleanedStudies) ? cleanedStudies : [];
    
  } catch (error) {
    console.error('[Photonic] Error parsing study list:', error);
    return [];
  }
}

/**
 * Cleans and standardizes a single study object
 * @param {Object} rawStudy - Raw study data from API
 * @returns {Object|null} - Cleaned study object or null if invalid
 */
function cleanStudyData(rawStudy) {
  try {
    // Validate input
    if (!rawStudy || typeof rawStudy !== 'object') {
      console.warn('[Photonic] Invalid study data:', rawStudy);
      return null;
    }
    
    // Validate required fields
    if (!rawStudy.study_instance_uid) {
      console.warn('[Photonic] Study missing study_instance_uid:', rawStudy);
      return null;
    }
    
    // Generate a unique study_id (use study_instance_uid as primary key)
    const studyId = rawStudy.study_instance_uid;
    
    // Clean patient name
    const patientName = cleanPatientName(rawStudy.patient_name || '');
    
    // Extract and clean other fields
    const cleanedStudy = {
      study_id: studyId,
      patient_name: patientName,
      patient_id: rawStudy.patient_id || rawStudy.mrn || '',
      diag_centre_name: rawStudy.diag_centre_name || rawStudy.institution || '',
      study_instance_uid: rawStudy.study_instance_uid,
      
      // Additional fields for processing
      study_date: rawStudy.study_date || '',
      study_time: rawStudy.study_time || '',
      modality: rawStudy.modality || '',
      study_description: rawStudy.study_description || '',
      accession_number: rawStudy.accession_number || '',
      referring_physician: rawStudy.referring_physician || '',
      
      // Workflow status fields (will be set when storing)
      status: STUDY_STATUS.PENDING,
      download_time: null,
      delete_time: null,
      error: 'None',
      created_at: new Date().toISOString()
    };
    
    return cleanedStudy;
    
  } catch (error) {
    console.error('[Photonic] Error cleaning study data:', error);
    return null;
  }
}



/**
 * Stores the fetched studies in the database
 * @param {Array} studies - Array of cleaned study objects
 * @returns {Promise<Object>} - Result summary
 */
async function storeStudiesInDatabase(studies) {
  try {
    console.log(`[Photonic] Storing ${studies.length} studies in database...`);
    
    let stored = 0;
    let updated = 0;
    let errors = 0;
    
    for (const study of studies) {
      try {
        // Check if study already exists
        const existingStudy = await studiesDbGet(study.study_id);
        
        if (existingStudy) {
          // Update existing study (preserve status and timestamps)
          const updatedStudy = {
            ...study,
            status: existingStudy.status,
            download_time: existingStudy.download_time,
            delete_time: existingStudy.delete_time,
            error: existingStudy.error,
            created_at: existingStudy.created_at,
            updated_at: new Date().toISOString(),
            // Preserve additional processing fields
            study_instance_uuid: existingStudy.study_instance_uuid,
            file_path: existingStudy.file_path,
            file_size: existingStudy.file_size,
            priority: existingStudy.priority,
            retry_count: existingStudy.retry_count,
            last_retry: existingStudy.last_retry
          };
          
          await studiesDbPut(updatedStudy);
          updated++;
        } else {
          // Store new study
          await studiesDbPut(study);
          stored++;
        }
        
      } catch (error) {
        console.error(`[Photonic] Error storing study ${study.study_id}:`, error);
        errors++;
      }
    }
    
    const result = {
      total: studies.length,
      stored,
      updated,
      errors,
      message: `Processed ${studies.length} studies: ${stored} new, ${updated} updated, ${errors} errors`
    };
    
    console.log('[Photonic] Store result:', result.message);
    return result;
    
  } catch (error) {
    console.error('[Photonic] Error storing studies in database:', error);
    throw error;
  }
}

/**
 * Main function to fetch and store study list
 * @param {Object} credentials - Authentication credentials
 * @returns {Promise<Object>} - Operation result
 */
async function fetchAndStoreStudyList(credentials) {
  try {
    console.log('[Photonic] fetchAndStoreStudyList starting with credentials:', {
      username: credentials?.username,
      hasPassword: !!credentials?.password
    });
    
    // Step 1: Fetch study list from API
    const studies = await fetchStudyList(credentials);
    
    console.log('[Photonic] fetchStudyList returned:', Array.isArray(studies) ? studies.length + ' studies' : 'invalid result');
    
    if (!Array.isArray(studies)) {
      throw new Error('fetchStudyList did not return a valid array');
    }
    
    if (studies.length === 0) {
      console.log('[Photonic] No studies found in work list');
      return {
        success: true,
        message: 'No studies found in work list',
        total: 0,
        stored: 0,
        updated: 0,
        errors: 0
      };
    }
    
    // Step 2: Store studies in database
    console.log('[Photonic] Storing', studies.length, 'studies in database...');
    const storeResult = await storeStudiesInDatabase(studies);
    
    console.log('[Photonic] Store result:', storeResult);
    
    return {
      success: true,
      ...storeResult
    };
    
  } catch (error) {
    console.error('[Photonic] Error in fetchAndStoreStudyList:', error);
    return {
      success: false,
      error: error.message,
      total: 0,
      stored: 0,
      updated: 0,
      errors: 1
    };
  }
}

// Export functions for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  // Node.js environment
  module.exports = {
    fetchStudyList,
    fetchAndStoreStudyList,
    parseStudyList,
    cleanStudyData,
    storeStudiesInDatabase
  };
} else {
  // Browser environment - make functions globally available
  window.fetchStudyList = fetchStudyList;
  window.fetchAndStoreStudyList = fetchAndStoreStudyList;
  window.parseStudyList = parseStudyList;
  window.cleanStudyData = cleanStudyData;
  window.storeStudiesInDatabase = storeStudiesInDatabase;
}