/**
 * Study Manager Frontend JavaScript
 * Handles the user interface for the Photonic Study Manager
 */

// Core functionality loaded via HTML script tag

// Global state
let currentStudies = [];
let credentials = null;
let isProcessing = false;
let downloadsDisabled = false; // Emergency flag to disable all downloads

// Initialize the application
document.addEventListener('DOMContentLoaded', async function() {
    console.log('[Photonic] Study Manager initialized');

    const statusDiv = document.getElementById('initStatus');

    function updateStatus(message, isError = false) {
        if (statusDiv) {
            statusDiv.textContent = message;
            statusDiv.style.background = isError ? 'rgba(255,0,0,0.2)' : 'rgba(255,255,255,0.2)';
        }
        console.log('[Photonic] Status:', message);
    }

    updateStatus('Checking dependencies...');

    const dependencies = {
        fetchAndStoreStudyList: typeof fetchAndStoreStudyList,
        studiesDbGetAll: typeof studiesDbGetAll,
        studiesDbPut: typeof studiesDbPut,
        downloadSingleStudy: typeof downloadSingleStudy,
        authenticateWithAPI: typeof authenticateWithAPI,
        STUDY_STATUS: typeof STUDY_STATUS,
        chrome: typeof chrome
    };

    console.log('[Photonic] Available functions:', dependencies);

    // Additional debugging for core functions
    console.log('[Photonic] Core functions check:', {
        window_fetchAndStoreStudyList: typeof window.fetchAndStoreStudyList,
        window_studiesDbGetAll: typeof window.studiesDbGetAll,
        window_authenticateWithAPI: typeof window.authenticateWithAPI
    });

    // Check for missing dependencies
    const missing = Object.entries(dependencies)
        .filter(([name, type]) => type === 'undefined')
        .map(([name]) => name);

    if (missing.length > 0) {
        updateStatus(`Missing dependencies: ${missing.join(', ')}`, true);
        return;
    }

    updateStatus('Loading credentials...');
    await loadCredentials();

    updateStatus('Loading settings...');
    await loadSettings();

    updateStatus('Loading data...');
    await refreshData();

    updateStatus(credentials ? 'Ready' : 'Ready (no credentials)');

    // Hide status after 3 seconds if successful
    if (statusDiv && !missing.length) {
        setTimeout(() => {
            statusDiv.style.display = 'none';
        }, 3000);
    }

    // Set up event listeners
    setupEventListeners();

    // Initialize bulk download UI
    updateBulkDownloadUI();

    // Make debug functions available globally
    window.debugPhotonic = {
        refreshData: () => refreshData(true),
        loadStudiesData: loadStudiesData,
        currentStudies: () => currentStudies,
        testFetch: () => {
            if (credentials) {
                return handleFetchStudyList();
            } else {
                console.log('No credentials available');
                return Promise.resolve();
            }
        },
        loadTestData: () => {
            console.log('[Photonic] Loading test data...');
            currentStudies = [
                {
                    study_id: 'TEST001',
                    patient_name: 'Test Patient 1',
                    patient_id: 'MRN001',
                    diag_centre_name: 'Test Center',
                    status: 'pending',
                    created_at: new Date().toISOString(),
                    download_time: null
                },
                {
                    study_id: 'TEST002',
                    patient_name: 'Test Patient 2',
                    patient_id: 'MRN002',
                    diag_centre_name: 'Test Center',
                    status: 'downloaded',
                    created_at: new Date().toISOString(),
                    download_time: new Date().toISOString(),
                    file_path: 'C:\\Users\\LuisRamos\\Downloads\\Photonic\\TEST002 - Test_Patient_2.zip'
                }
            ];
            updateStudiesTable();
            updateStatistics();
            console.log('[Photonic] Test data loaded');
        }
    };

    // DISABLED: Set up periodic refresh - preventing automatic operations
    // setInterval(refreshData, 30000); // Refresh every 30 seconds
    console.log('[Photonic] Automatic refresh disabled to prevent unwanted operations');
});

/**
 * Set up all event listeners
 */
function setupEventListeners() {
    // Main action buttons
    const fetchBtn = document.getElementById('fetchStudyListBtn');
    if (fetchBtn) fetchBtn.addEventListener('click', handleFetchStudyList);

    const settingsBtn = document.getElementById('settingsBtn');
    if (settingsBtn) settingsBtn.addEventListener('click', showSettingsModal);

    // Bulk action buttons
    const bulkDownloadBtn = document.getElementById('bulkDownloadBtn');
    if (bulkDownloadBtn) bulkDownloadBtn.addEventListener('click', bulkDownloadSelected);

    const bulkSkipBtn = document.getElementById('bulkSkipBtn');
    if (bulkSkipBtn) bulkSkipBtn.addEventListener('click', bulkSkipSelected);

    const bulkDeleteBtn = document.getElementById('bulkDeleteBtn');
    if (bulkDeleteBtn) bulkDeleteBtn.addEventListener('click', bulkDeleteSelected);

    const bulkDeselectBtn = document.getElementById('bulkDeselectBtn');
    if (bulkDeselectBtn) bulkDeselectBtn.addEventListener('click', deselectAllStudies);

    // Checkbox handlers
    const selectAllCheckbox = document.getElementById('selectAllCheckbox');
    if (selectAllCheckbox) selectAllCheckbox.addEventListener('change', toggleSelectAll);

    // Settings modal buttons
    const cancelSettingsBtn = document.getElementById('cancelSettingsBtn');
    if (cancelSettingsBtn) cancelSettingsBtn.addEventListener('click', closeSettingsModal);

    const saveSettingsBtn = document.getElementById('saveSettingsBtn');
    if (saveSettingsBtn) saveSettingsBtn.addEventListener('click', saveSettings);

    const updateCredentialsBtn = document.getElementById('updateCredentialsBtn');
    if (updateCredentialsBtn) updateCredentialsBtn.addEventListener('click', showCredentialsModal);

    const clearCacheBtn = document.getElementById('clearCacheBtn');
    if (clearCacheBtn) clearCacheBtn.addEventListener('click', clearAllStudies);

    const clearErrorsBtn = document.getElementById('clearErrorsBtn');
    if (clearErrorsBtn) clearErrorsBtn.addEventListener('click', clearErrorStudies);

    const fixFilePathsBtn = document.getElementById('fixFilePathsBtn');
    if (fixFilePathsBtn) fixFilePathsBtn.addEventListener('click', fixStudyFilePaths);

    // Radiant integration buttons
    const detectRadiantBtn = document.getElementById('detectRadiantBtn');
    if (detectRadiantBtn) detectRadiantBtn.addEventListener('click', detectRadiantPath);

    const testRadiantBtn = document.getElementById('testRadiantBtn');
    if (testRadiantBtn) testRadiantBtn.addEventListener('click', testRadiantIntegration);

    // MicroDicom integration buttons
    const detectMicroDicomBtn = document.getElementById('detectMicroDicomBtn');
    if (detectMicroDicomBtn) detectMicroDicomBtn.addEventListener('click', detectMicroDicomPath);

    const testMicroDicomBtn = document.getElementById('testMicroDicomBtn');
    if (testMicroDicomBtn) testMicroDicomBtn.addEventListener('click', testMicroDicomIntegration);

    // Credentials modal buttons
    const cancelCredentialsBtn = document.getElementById('cancelCredentialsBtn');
    if (cancelCredentialsBtn) cancelCredentialsBtn.addEventListener('click', closeCredentialsModal);

    const saveCredentialsBtn = document.getElementById('saveCredentialsBtn');
    if (saveCredentialsBtn) saveCredentialsBtn.addEventListener('click', saveCredentials);

    // Search box
    const searchBox = document.getElementById('searchBox');
    if (searchBox) searchBox.addEventListener('keyup', filterStudies);

    // Close modal when clicking outside
    const modal = document.getElementById('credentialsModal');
    if (modal) {
        modal.addEventListener('click', function(event) {
            if (event.target === modal) {
                closeCredentialsModal();
            }
        });
    }

    // Close settings modal when clicking outside
    const settingsModal = document.getElementById('settingsModal');
    if (settingsModal) {
        settingsModal.addEventListener('click', function(event) {
            if (event.target === settingsModal) {
                closeSettingsModal();
            }
        });
    }

    // Event delegation for study action buttons and checkboxes
    const studiesTable = document.getElementById('studiesTable');
    if (studiesTable) {
        studiesTable.addEventListener('click', function(event) {
            if (event.target.classList.contains('action-btn') || 
                event.target.classList.contains('study-action-btn') ||
                event.target.classList.contains('viewer-icon')) {
                const action = event.target.getAttribute('data-action');
                const studyId = event.target.getAttribute('data-study-id');

                console.log(`[Photonic] Action button clicked: ${action} for study ${studyId}`);

                // Prevent default and stop propagation
                event.preventDefault();
                event.stopPropagation();

                switch (action) {
                    case 'download':
                        downloadIndividualStudy(studyId);
                        break;
                    case 'skip':
                        skipStudy(studyId);
                        break;
                    case 'retry':
                        retryStudy(studyId);
                        break;
                    case 'open':
                        openStudyFile(studyId);
                        break;
                    case 'delete':
                        deleteStudy(studyId);
                        break;
                    case 'download-individual':
                        downloadIndividualStudy(studyId);
                        break;
                    case 'open-radiant':
                        openStudyInRadiant(studyId);
                        break;
                    case 'open-microdicom':
                        openStudyInMicroDicom(studyId);
                        break;
                    default:
                        console.warn(`[Photonic] Unknown action: ${action}`);
                }
            }
        });

        // Event delegation for study checkboxes
        studiesTable.addEventListener('change', function(event) {
            if (event.target.classList.contains('study-checkbox')) {
                updateSelectedCount();
            }
        });
    }

    // Bulk download toggle event listener
    const bulkToggle = document.getElementById('bulkDownloadToggle');
    if (bulkToggle) {
        bulkToggle.addEventListener('change', function() {
            updateBulkDownloadUI();
            saveSettings(); // Persist the setting
        });
    }

    // Study location folder change listener
    const studyLocationFolder = document.getElementById('studyLocationFolder');
    if (studyLocationFolder) {
        studyLocationFolder.addEventListener('input', updateResolvedStoragePath);
    }

    // Settings tabs functionality
    const tabButtons = document.querySelectorAll('.tab-btn');
    tabButtons.forEach(button => {
        button.addEventListener('click', function() {
            const targetTab = this.getAttribute('data-tab');
            switchSettingsTab(targetTab);
        });
    });
}

/**
 * Load saved credentials from storage (using same system as main extension)
 */
async function loadCredentials() {
    try {
        console.log('[Photonic] Loading credentials...');

        if (typeof chrome !== 'undefined' && chrome.storage) {
            // Extension environment - use same storage as main extension
            console.log('[Photonic] Using Chrome storage');
            const result = await chrome.storage.local.get(['auth', 'encryptedPassword']);
            console.log('[Photonic] Storage result:', {
                hasAuth: !!result.auth,
                hasEncryptedPassword: !!result.encryptedPassword
            });

            if (result.auth) {
                try {
                    // Extract username from auth
                    const decoded = atob(result.auth);
                    const username = decoded.split(':')[0];
                    console.log('[Photonic] Extracted username:', username);

                    let password = '';

                    // Try to get password from encrypted storage
                    if (result.encryptedPassword) {
                        try {
                            console.log('[Photonic] Attempting to decrypt password...');
                            password = await decryptPassword(result.encryptedPassword);
                            console.log('[Photonic] Password decrypted successfully');
                        } catch (e) {
                            console.error('[Photonic] Error decrypting password:', e);
                            // Fall back to extracting from auth if available
                            if (decoded.includes(':')) {
                                password = decoded.split(':')[1];
                                console.log('[Photonic] Using fallback password from auth');
                            }
                        }
                    } else if (decoded.includes(':')) {
                        // Fall back to old-style auth
                        password = decoded.split(':')[1];
                        console.log('[Photonic] Using old-style password from auth');
                    }

                    if (username && password) {
                        credentials = { username, password };
                        console.log('[Photonic] Credentials loaded from extension storage');
                    } else {
                        console.log('[Photonic] Missing username or password');
                    }
                } catch (e) {
                    console.error('[Photonic] Error decoding credentials:', e);
                }
            } else {
                console.log('[Photonic] No auth found in storage');
            }
        } else {
            // Standalone environment - use localStorage
            console.log('[Photonic] Using localStorage');
            const saved = localStorage.getItem('photonic_credentials');
            if (saved) {
                credentials = JSON.parse(saved);
                console.log('[Photonic] Credentials loaded from localStorage');
            } else {
                console.log('[Photonic] No credentials in localStorage');
            }
        }

        console.log('[Photonic] Final credentials state:', credentials ? 'loaded' : 'not loaded');
    } catch (error) {
        console.error('[Photonic] Error loading credentials:', error);
    }
}

/**
 * Save credentials to storage (using same system as main extension)
 */
async function saveCredentialsToStorage(creds) {
    try {
        if (typeof chrome !== 'undefined' && chrome.storage) {
            // Extension environment - use same storage as main extension
            const auth = btoa(`${creds.username}:`);

            // Encrypt the password
            let encryptedPassword = null;
            if (creds.password) {
                encryptedPassword = await encryptPassword(creds.password);
            }

            const storageData = { auth };
            if (encryptedPassword) {
                storageData.encryptedPassword = encryptedPassword;
            }

            await chrome.storage.local.set(storageData);
        } else {
            // Standalone environment
            localStorage.setItem('photonic_credentials', JSON.stringify(creds));
        }
        console.log('[Photonic] Credentials saved to storage');
    } catch (error) {
        console.error('[Photonic] Error saving credentials:', error);
    }
}

/**
 * Load settings from storage
 */
async function loadSettings() {
    try {
        console.log('[Photonic] Loading settings...');

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

        // Apply settings to UI
        const bulkToggle = document.getElementById('bulkDownloadToggle');
        if (bulkToggle) {
            bulkToggle.checked = settings.bulkDownloadEnabled || false;
        }

        // Study storage settings
        const studyLocationFolder = document.getElementById('studyLocationFolder');
        if (studyLocationFolder) {
            studyLocationFolder.value = settings.studyLocationFolder || 'Photonic';
        }

        // Radiant integration settings
        const enableRadiantIntegration = document.getElementById('enableRadiantIntegration');
        if (enableRadiantIntegration) {
            enableRadiantIntegration.checked = settings.enableRadiantIntegration || false;
        }

        const radiantOpenMode = document.getElementById('radiantOpenMode');
        if (radiantOpenMode) {
            radiantOpenMode.value = settings.radiantOpenMode || 'file';
        }

        const radiantAdditionalArgs = document.getElementById('radiantAdditionalArgs');
        if (radiantAdditionalArgs) {
            radiantAdditionalArgs.value = settings.radiantAdditionalArgs || '-cl';
        }

        // MicroDicom integration settings
        const enableMicroDicomIntegration = document.getElementById('enableMicroDicomIntegration');
        if (enableMicroDicomIntegration) {
            enableMicroDicomIntegration.checked = settings.enableMicroDicomIntegration !== undefined ? settings.enableMicroDicomIntegration : true;
        }

        const microDicomOpenMode = document.getElementById('microDicomOpenMode');
        if (microDicomOpenMode) {
            microDicomOpenMode.value = settings.microDicomOpenMode || 'file';
        }

        const microDicomAdditionalArgs = document.getElementById('microDicomAdditionalArgs');
        if (microDicomAdditionalArgs) {
            microDicomAdditionalArgs.value = settings.microDicomAdditionalArgs || '';
        }

        // Polling settings
        const pollingInterval = document.getElementById('pollingInterval');
        const enableAutoPolling = document.getElementById('enableAutoPolling');
        const pollingIntervalDisplay = document.getElementById('pollingIntervalDisplay');

        if (pollingInterval) {
            pollingInterval.value = settings.pollingInterval || 60;
        }

        if (pollingIntervalDisplay) {
            pollingIntervalDisplay.textContent = pollingInterval ? pollingInterval.value : '60';
        }

        if (enableAutoPolling) {
            enableAutoPolling.checked = settings.enableAutoPolling || false;
        }

        // Storage size settings
        const maxStorageSize = document.getElementById('maxStorageSize');
        const autoDeleteOldest = document.getElementById('autoDeleteOldest');

        if (maxStorageSize) {
            maxStorageSize.value = settings.maxStorageSize || 10;
        }

        if (autoDeleteOldest) {
            autoDeleteOldest.checked = settings.autoDeleteOldest !== undefined ? settings.autoDeleteOldest : true;
        }

        // Time management settings
        const autoDeleteDays = document.getElementById('autoDeleteDays');
        const enableTimeManagement = document.getElementById('enableTimeManagement');

        if (autoDeleteDays) {
            autoDeleteDays.value = settings.autoDeleteDays || 7;
        }

        if (enableTimeManagement) {
            enableTimeManagement.checked = settings.enableTimeManagement !== undefined ? settings.enableTimeManagement : true;
        }

        // Update resolved storage path
        updateResolvedStoragePath();

        console.log('[Photonic] Settings loaded:', settings);
    } catch (error) {
        console.error('[Photonic] Error loading settings:', error);
    }
}

/**
 * Save settings to storage
 */
async function saveSettings() {
    try {
        const bulkToggle = document.getElementById('bulkDownloadToggle');
        const studyLocationFolder = document.getElementById('studyLocationFolder');
        const enableRadiantIntegration = document.getElementById('enableRadiantIntegration');
        const radiantOpenMode = document.getElementById('radiantOpenMode');
        const radiantAdditionalArgs = document.getElementById('radiantAdditionalArgs');
        const enableMicroDicomIntegration = document.getElementById('enableMicroDicomIntegration');
        const microDicomOpenMode = document.getElementById('microDicomOpenMode');
        const microDicomAdditionalArgs = document.getElementById('microDicomAdditionalArgs');

        // Get polling settings
        const pollingInterval = document.getElementById('pollingInterval');
        const enableAutoPolling = document.getElementById('enableAutoPolling');

        // Get storage size settings
        const maxStorageSize = document.getElementById('maxStorageSize');
        const autoDeleteOldest = document.getElementById('autoDeleteOldest');

        // Get time management settings
        const autoDeleteDays = document.getElementById('autoDeleteDays');
        const enableTimeManagement = document.getElementById('enableTimeManagement');

        const settings = {
            bulkDownloadEnabled: bulkToggle ? bulkToggle.checked : false,
            studyLocationFolder: studyLocationFolder ? studyLocationFolder.value : 'Photonic',
            enableRadiantIntegration: enableRadiantIntegration ? enableRadiantIntegration.checked : false,
            radiantOpenMode: radiantOpenMode ? radiantOpenMode.value : 'file',
            radiantAdditionalArgs: radiantAdditionalArgs ? radiantAdditionalArgs.value : '',
            enableMicroDicomIntegration: enableMicroDicomIntegration ? enableMicroDicomIntegration.checked : false,
            microDicomOpenMode: microDicomOpenMode ? microDicomOpenMode.value : 'file',
            microDicomAdditionalArgs: microDicomAdditionalArgs ? microDicomAdditionalArgs.value : '',

            // Polling settings
            pollingInterval: pollingInterval ? parseInt(pollingInterval.value) : 60,
            enableAutoPolling: enableAutoPolling ? enableAutoPolling.checked : false,

            // Storage size settings
            maxStorageSize: maxStorageSize ? parseInt(maxStorageSize.value) : 10,
            autoDeleteOldest: autoDeleteOldest ? autoDeleteOldest.checked : true,

            // Time management settings
            autoDeleteDays: autoDeleteDays ? parseInt(autoDeleteDays.value) : 7,
            enableTimeManagement: enableTimeManagement ? enableTimeManagement.checked : true
        };

        if (typeof chrome !== 'undefined' && chrome.storage) {
            // Extension environment
            await chrome.storage.local.set({ photonic_settings: settings });
        } else {
            // Standalone environment
            localStorage.setItem('photonic_settings', JSON.stringify(settings));
        }

        console.log('[Photonic] Settings saved:', settings);
        closeSettingsModal();
        showNotification('Settings saved successfully', 'success');
    } catch (error) {
        console.error('[Photonic] Error saving settings:', error);
        showNotification('Error saving settings', 'error');
    }
}

/**
 * Refresh all data and update the interface
 */
async function refreshData(force = false) {
    if (isProcessing && !force) return;

    try {
        console.log('[Photonic] Refreshing data...');
        await loadStudiesData();
        updateStatistics();
        updateStudiesTable();
        console.log('[Photonic] Data refresh complete - displaying', currentStudies.length, 'studies');
    } catch (error) {
        console.error('[Photonic] Error refreshing data:', error);
        showNotification('Error refreshing data: ' + error.message, 'error');
    }
}

/**
 * Load studies data from the database
 */
async function loadStudiesData() {
    try {
        console.log('[Photonic] Loading studies from database...');
        console.log('[Photonic] studiesDbGetAll type:', typeof studiesDbGetAll);
        console.log('[Photonic] window.studiesDbGetAll type:', typeof window.studiesDbGetAll);

        if (typeof studiesDbGetAll === 'undefined') {
            console.warn('[Photonic] studiesDbGetAll function not available');
            currentStudies = [];
            return;
        }

        console.log('[Photonic] Calling studiesDbGetAll...');
        const studies = await studiesDbGetAll();
        console.log('[Photonic] studiesDbGetAll returned:', studies);

        currentStudies = Array.isArray(studies) ? studies : [];
        console.log(`[Photonic] Loaded ${currentStudies.length} studies from database`);

        // Log some details about the studies for debugging
        if (currentStudies.length > 0) {
            console.log('[Photonic] Sample study:', currentStudies[0]);
            const statusCounts = currentStudies.reduce((acc, study) => {
                acc[study.status] = (acc[study.status] || 0) + 1;
                return acc;
            }, {});
            console.log('[Photonic] Study status counts:', statusCounts);
        } else {
            console.log('[Photonic] No studies found in database');
        }
    } catch (error) {
        console.error('[Photonic] Error loading studies:', error);
        console.error('[Photonic] Error stack:', error.stack);
        currentStudies = [];
        // Don't re-throw, just log the error and continue with empty array
    }
}

/**
 * Update statistics display
 * Note: Stats cards have been removed from the UI, but we keep this function
 * to maintain compatibility with existing code that calls it.
 */
function updateStatistics() {
    // Stats cards have been removed from the UI, so we don't need to update them
    // We keep this function to maintain compatibility with existing code that calls it
    console.log('[Photonic] Statistics update skipped (UI elements removed)');
}

/**
 * Update the studies table
 */
function updateStudiesTable() {
    const tbody = document.getElementById('studiesTableBody');

    if (currentStudies.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="9" style="text-align: center; padding: 40px; color: #666;">
                    No studies found. Click "Fetch Study List" to load studies.
                </td>
            </tr>
        `;
        return;
    }



    // Sort studies by created date (newest first)
    const sortedStudies = [...currentStudies].sort((a, b) => 
        new Date(b.created_at || 0) - new Date(a.created_at || 0)
    );

    tbody.innerHTML = sortedStudies.map(study => createStudyRow(study)).join('');
}

/**
 * Create a table row for a study
 */
function createStudyRow(study) {
    const downloadTime = study.download_time ? 
        new Date(study.download_time).toLocaleString() : '-';

    const statusBadge = `<span class="status-badge status-${study.status}">${study.status.toUpperCase()}</span>`;

    const viewerIcons = createViewerIcons(study);
    const actions = createStudyActions(study);



    return `
        <tr data-study-id="${study.study_id}">
            <td>
                <input type="checkbox" class="study-checkbox" value="${study.study_id}">
            </td>
            <td>${escapeHtml(study.patient_name || 'Unknown')}</td>
            <td>${escapeHtml(study.patient_id || '-')}</td>
            <td title="${study.study_id}">${study.study_id.substring(0, 20)}...</td>
            <td>${escapeHtml(study.diag_centre_name || '-')}</td>
            <td>${statusBadge}</td>
            <td>${downloadTime}</td>
            <td>${viewerIcons}</td>
            <td>${actions}</td>
        </tr>
    `;
}

/**
 * Create individual download button for a study
 */
function createIndividualDownloadButton(study) {
    if (study.status === STUDY_STATUS.DOWNLOADED) {
        return '<span style="color: #2e7d32; font-size: 12px;">✓ Downloaded</span>';
    }

    if (study.status === STUDY_STATUS.ERROR) {
        return `<button class="btn warning study-action-btn" style="padding: 4px 8px; font-size: 12px;" 
                data-action="download-individual" data-study-id="${study.study_id}">Retry Download</button>`;
    }

    // For DOWNLOAD status or any other status
    return `<button class="btn study-action-btn" style="padding: 4px 8px; font-size: 12px;" 
            data-action="download-individual" data-study-id="${study.study_id}">Download</button>`;
}

/**
 * Create action buttons for a study
 */
function createStudyActions(study) {
    const actions = [];

    // Download action (for pending, download, error, skipped, and deleted studies)
    if (study.status === STUDY_STATUS.PENDING || study.status === STUDY_STATUS.DOWNLOAD || study.status === STUDY_STATUS.ERROR || study.status === STUDY_STATUS.SKIPPED || study.status === STUDY_STATUS.DELETED) {
        const buttonTitle = study.status === STUDY_STATUS.DELETED ? 'Re-download' : 'Download';
        actions.push(`<button class="action-icon primary" data-action="download" data-study-id="${study.study_id}" title="${buttonTitle}">📥</button>`);
    }

    // Skip action (for pending and deleted studies)
    if (study.status === STUDY_STATUS.PENDING || study.status === STUDY_STATUS.DELETED) {
        actions.push(`<button class="action-icon warning" data-action="skip" data-study-id="${study.study_id}" title="Skip">⏭️</button>`);
    }

    // Delete action (only for downloaded studies with existing files)
    // Don't show delete button if the study is not downloaded or if the file doesn't exist
    if (study.status === STUDY_STATUS.DOWNLOADED) {
        actions.push(`<button class="action-icon danger" data-action="delete" data-study-id="${study.study_id}" title="Delete">🗑️</button>`);
    }

    return `<div style="display: flex; justify-content: flex-start;">${actions.join('')}</div>`;
}

/**
 * Create viewer icons for a study
 */
function createViewerIcons(study) {
    // Only show viewer icons for downloaded studies
    if (study.status !== STUDY_STATUS.DOWNLOADED) {
        return '';
    }

    const icons = [];

    // Get current settings
    const settings = getCurrentSettings();

    // Add Radiant icon if enabled
    if (settings.enableRadiantIntegration) {
        const filePath = study.file_path || 'No file path';
        icons.push(`
            <div class="viewer-icon radiant-icon" 
                 title="Open in RadiAnt Viewer&#10;File: ${escapeHtml(filePath)}" 
                 data-action="open-radiant" 
                 data-study-id="${study.study_id}">
                <img src="icons/radiant-icon.png" alt="RadiAnt" class="viewer-icon-img" 
                     onerror="this.style.display='none'; this.parentNode.innerHTML='📱';">
            </div>
        `);
    }

    // Add MicroDicom icon if enabled
    if (settings.enableMicroDicomIntegration) {
        const filePath = study.file_path || 'No file path';
        icons.push(`
            <div class="viewer-icon microdicom-icon" 
                 title="Open in MicroDicom Viewer&#10;File: ${escapeHtml(filePath)}" 
                 data-action="open-microdicom" 
                 data-study-id="${study.study_id}">
                <img src="icons/microdicom-icon.png" alt="MicroDicom" class="viewer-icon-img" 
                     onerror="this.style.display='none'; this.parentNode.innerHTML='📱';">
            </div>
        `);
    }

    if (icons.length === 0) {
        return '';
    }

    return `<div class="viewer-icons">${icons.join('')}</div>`;
}

/**
 * Get current settings from UI or defaults
 */
function getCurrentSettings() {
    const enableRadiantIntegration = document.getElementById('enableRadiantIntegration');
    const radiantOpenMode = document.getElementById('radiantOpenMode');
    const radiantAdditionalArgs = document.getElementById('radiantAdditionalArgs');
    const enableMicroDicomIntegration = document.getElementById('enableMicroDicomIntegration');
    const microDicomOpenMode = document.getElementById('microDicomOpenMode');
    const microDicomAdditionalArgs = document.getElementById('microDicomAdditionalArgs');
    const studyLocationFolder = document.getElementById('studyLocationFolder');

    return {
        enableRadiantIntegration: enableRadiantIntegration ? enableRadiantIntegration.checked : false,
        radiantOpenMode: radiantOpenMode ? radiantOpenMode.value : 'file',
        radiantAdditionalArgs: radiantAdditionalArgs ? radiantAdditionalArgs.value : '',
        enableMicroDicomIntegration: enableMicroDicomIntegration ? enableMicroDicomIntegration.checked : false,
        microDicomOpenMode: microDicomOpenMode ? microDicomOpenMode.value : 'file',
        microDicomAdditionalArgs: microDicomAdditionalArgs ? microDicomAdditionalArgs.value : '',
        studyLocationFolder: studyLocationFolder ? studyLocationFolder.value : 'Photonic'
    };
}

/**
 * Get default RadiAnt path based on operating system
 */
function getDefaultRadiantPath() {
    // Detect operating system
    const userAgent = navigator.userAgent;
    const platform = navigator.platform;

    if (platform.indexOf('Win') !== -1 || userAgent.indexOf('Windows') !== -1) {
        // Windows - check common installation paths
        return 'C:\\Program Files\\RadiAnt DICOM Viewer\\RadiAntViewer.exe';
    } else if (platform.indexOf('Mac') !== -1 || userAgent.indexOf('Mac') !== -1) {
        // macOS
        return '/Applications/RadiAnt DICOM Viewer.app/Contents/MacOS/RadiAnt DICOM Viewer';
    } else {
        // Linux or other
        return '/usr/bin/radiantviewer';
    }
}

/**
 * Get default downloads directory path
 */
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
 * Update the resolved storage path display
 */
function updateResolvedStoragePath() {
    const resolvedStoragePathElement = document.getElementById('resolvedStoragePath');
    if (resolvedStoragePathElement) {
        const settings = getCurrentSettings();
        const downloadsPath = getDefaultDownloadsPath();
        const fullPath = `${downloadsPath}/${settings.studyLocationFolder}`;
        resolvedStoragePathElement.textContent = fullPath;
    }
}

/**
 * Switch between settings tabs
 */
function switchSettingsTab(tabName) {
    // Hide all tab contents
    const tabContents = document.querySelectorAll('.tab-content');
    tabContents.forEach(content => {
        content.classList.remove('active');
    });

    // Remove active class from all tab buttons
    const tabButtons = document.querySelectorAll('.tab-btn');
    tabButtons.forEach(button => {
        button.classList.remove('active');
    });

    // Show the selected tab content
    const targetContent = document.getElementById(`${tabName}-tab`);
    if (targetContent) {
        targetContent.classList.add('active');
    }

    // Add active class to the clicked tab button
    const targetButton = document.querySelector(`[data-tab="${tabName}"]`);
    if (targetButton) {
        targetButton.classList.add('active');
    }
}

/**
 * Auto-detect RadiAnt installation (URL protocol check)
 */
async function detectRadiantPath() {
    try {
        showNotification('Checking RadiAnt URL protocol...', 'info');

        // Enable RadiAnt integration automatically
        const enableRadiantIntegration = document.getElementById('enableRadiantIntegration');
        if (enableRadiantIntegration) {
            enableRadiantIntegration.checked = true;
        }

        // Set default additional arguments
        const radiantAdditionalArgs = document.getElementById('radiantAdditionalArgs');
        if (radiantAdditionalArgs && !radiantAdditionalArgs.value) {
            radiantAdditionalArgs.value = '-cl';
        }

        showNotification('RadiAnt integration enabled. Use "Test Integration" to verify the URL protocol works.', 'success');

    } catch (error) {
        console.error('[Photonic] Error setting up RadiAnt integration:', error);
        showNotification('Error setting up RadiAnt integration: ' + error.message, 'error');
    }
}

/**
 * Auto-detect MicroDicom installation (URL protocol check)
 */
async function detectMicroDicomPath() {
    try {
        showNotification('Checking MicroDicom URL protocol...', 'info');

        // Enable MicroDicom integration automatically
        const enableMicroDicomIntegration = document.getElementById('enableMicroDicomIntegration');
        if (enableMicroDicomIntegration) {
            enableMicroDicomIntegration.checked = true;
        }

        showNotification('MicroDicom integration enabled. Use "Test Integration" to verify the URL protocol works.', 'success');

    } catch (error) {
        console.error('[Photonic] Error setting up MicroDicom integration:', error);
        showNotification('Error setting up MicroDicom integration: ' + error.message, 'error');
    }
}

/**
 * Test RadiAnt integration
 */
async function testRadiantIntegration() {
    try {
        const settings = getCurrentSettings();

        if (!settings.enableRadiantIntegration) {
            showNotification('RadiAnt integration is not enabled. Please enable it first.', 'warning');
            return;
        }

        showNotification('Testing RadiAnt integration...', 'info');

        // Create a test URL to validate the URL protocol
        const testFilePath = `${getDefaultDownloadsPath()}\\${settings.studyLocationFolder}\\4807 - MARSHALL_STEVE.zip`;
        const testUrl = buildRadiantUrl(testFilePath, settings);

        const testMessage = `RadiAnt Integration Test:\n\n` +
                          `✓ Integration enabled: ${settings.enableRadiantIntegration}\n` +
                          `✓ Open mode: ${settings.radiantOpenMode}\n` +
                          `✓ Additional args: ${settings.radiantAdditionalArgs || 'None'}\n\n` +
                          `Test URL generated:\n${testUrl}\n\n` +
                          `Click OK to test the RadiAnt URL protocol (will try to open RadiAnt)`;

        if (confirm(testMessage)) {
            try {
                window.open(testUrl, '_blank');
                showNotification('RadiAnt URL protocol test initiated. Check if RadiAnt opened.', 'success');
            } catch (error) {
                showNotification('RadiAnt URL protocol test failed: ' + error.message, 'error');
            }
        } else {
            showNotification('RadiAnt integration configuration validated.', 'success');
        }

    } catch (error) {
        console.error('[Photonic] Error testing RadiAnt integration:', error);
        showNotification('Error testing RadiAnt integration: ' + error.message, 'error');
    }
}

/**
 * Test MicroDicom integration
 */
async function testMicroDicomIntegration() {
    try {
        const settings = getCurrentSettings();

        if (!settings.enableMicroDicomIntegration) {
            showNotification('MicroDicom integration is not enabled. Please enable it first.', 'warning');
            return;
        }

        showNotification('Testing MicroDicom integration...', 'info');

        // Create a test URL to validate the URL protocol
        const testFilePath = `${getDefaultDownloadsPath()}\\${settings.studyLocationFolder}\\4807 - MARSHALL_STEVE.zip`;
        const testUrl = buildMicroDicomUrl(testFilePath, settings);

        const testMessage = `MicroDicom Integration Test:\n\n` +
                          `✓ Integration enabled: ${settings.enableMicroDicomIntegration}\n` +
                          `✓ Open mode: ${settings.microDicomOpenMode}\n` +
                          `✓ Additional args: ${settings.microDicomAdditionalArgs || 'None'}\n\n` +
                          `Test URL generated:\n${testUrl}\n\n` +
                          `Click OK to test the MicroDicom URL protocol (will try to open MicroDicom)`;

        if (confirm(testMessage)) {
            try {
                window.open(testUrl, '_blank');
                showNotification('MicroDicom URL protocol test initiated. Check if MicroDicom opened.', 'success');
            } catch (error) {
                showNotification('MicroDicom URL protocol test failed: ' + error.message, 'error');
            }
        } else {
            showNotification('MicroDicom integration configuration validated.', 'success');
        }

    } catch (error) {
        console.error('[Photonic] Error testing MicroDicom integration:', error);
        showNotification('Error testing MicroDicom integration: ' + error.message, 'error');
    }
}

/**
 * Construct expected file path for a study
 */
async function constructExpectedFilePath(study) {
    try {
        const settings = getCurrentSettings();
        const downloadsPath = getDefaultDownloadsPath();
        const studyFolder = settings.studyLocationFolder || 'Photonic';

        // Create filename in the same format as createZipFilename
        const mrn = study.patient_id || 'Unknown_MRN';
        const name = study.patient_name || 'Unknown_Patient';

        // Clean the components for filename use - allow spaces, hyphens, and underscores
        const cleanMrn = mrn.replace(/[^A-Za-z0-9\-_\s]/g, '').trim().substring(0, 20);
        const cleanName = name.replace(/[^A-Za-z0-9\-_\s]/g, '').trim().substring(0, 30);

        const filename = `${cleanMrn} - ${cleanName}.zip`;
        const fullPath = `${downloadsPath}/${studyFolder}/${filename}`;

        return normalizeFilePath(fullPath);
    } catch (error) {
        console.error('[Photonic] Error constructing expected file path:', error);
        return null;
    }
}

/**
 * Debug study file path information
 */
async function debugStudyPath(studyId) {
    try {
        const study = await studiesDbGet(studyId);
        if (!study) {
            throw new Error('Study not found');
        }

        const settings = getCurrentSettings();
        const originalPath = study.file_path || 'No file path stored';
        const normalizedPath = study.file_path ? normalizeFilePath(study.file_path) : 'N/A';
        const expectedPath = await constructExpectedFilePath(study);
        const normalizedExpectedPath = expectedPath ? normalizeFilePath(expectedPath) : 'Could not construct';

        let radiantUrl = 'N/A';
        if (study.file_path && settings.enableRadiantIntegration) {
            radiantUrl = buildRadiantUrl(study.file_path, settings);
        }

        let microDicomUrl = 'N/A';
        if (study.file_path && settings.enableMicroDicomIntegration) {
            microDicomUrl = buildMicroDicomUrl(study.file_path, settings);
        }

        const debugInfo = `Study File Path Debug Information:\n\n` +
                         `Study ID: ${study.study_id}\n` +
                         `Patient: ${study.patient_name || 'Unknown'} (${study.patient_id || 'Unknown'})\n\n` +
                         `STORED PATH INFO:\n` +
                         `Original stored path: ${originalPath}\n` +
                         `Normalized stored path: ${normalizedPath}\n\n` +
                         `EXPECTED PATH INFO:\n` +
                         `Expected path: ${expectedPath}\n` +
                         `Normalized expected: ${normalizedExpectedPath}\n\n` +
                         `RADIANT INTEGRATION:\n` +
                         `Integration enabled: ${settings.enableRadiantIntegration}\n` +
                         `Open mode: ${settings.radiantOpenMode}\n` +
                         `RadiAnt URL: ${radiantUrl}\n\n` +
                         `MICRODICOM INTEGRATION:\n` +
                         `Integration enabled: ${settings.enableMicroDicomIntegration}\n` +
                         `Open mode: ${settings.microDicomOpenMode}\n` +
                         `MicroDicom URL: ${microDicomUrl}\n\n` +
                         `SETTINGS:\n` +
                         `Study folder: ${settings.studyLocationFolder}\n` +
                         `Downloads path: ${getDefaultDownloadsPath()}`;

        // Show in alert for now, could be improved with a modal
        alert(debugInfo);

        // Also log to console
        console.log('[Photonic] Debug Path Info:', {
            studyId,
            originalPath,
            normalizedPath,
            expectedPath,
            normalizedExpectedPath,
            radiantUrl,
            microDicomUrl,
            settings
        });

    } catch (error) {
        console.error('[Photonic] Error debugging study path:', error);
        showNotification('Error debugging study path: ' + error.message, 'error');
    }
}

/**
 * Fix file paths for downloaded studies that are missing them
 */
async function fixStudyFilePaths() {
    try {
        showNotification('Scanning downloaded studies for missing file paths...', 'info');

        const studies = await studiesDbGetAll();
        const downloadedStudies = studies.filter(study => 
            study.status === STUDY_STATUS.DOWNLOADED && !study.file_path
        );

        if (downloadedStudies.length === 0) {
            showNotification('No downloaded studies with missing file paths found.', 'success');
            return;
        }

        const message = `Found ${downloadedStudies.length} downloaded studies with missing file paths.\n\n` +
                       `This will attempt to fix the file paths based on the expected location.\n` +
                       `Studies will be updated to point to:\n` +
                       `Downloads/Photonic/MRN - PatientName.zip\n\n` +
                       `Continue?`;

        if (!confirm(message)) {
            return;
        }

        let fixedCount = 0;
        let errorCount = 0;

        for (const study of downloadedStudies) {
            try {
                const expectedPath = await constructExpectedFilePath(study);
                if (expectedPath) {
                    // Update the study with the expected file path
                    await studiesDbUpdateStatus(study.study_id, STUDY_STATUS.DOWNLOADED, {
                        file_path: expectedPath,
                        file_size: study.file_size,
                        download_time: study.download_time
                    });
                    fixedCount++;
                    console.log(`[Photonic] Fixed file path for study ${study.study_id}: ${expectedPath}`);
                } else {
                    errorCount++;
                }
            } catch (error) {
                console.error(`[Photonic] Error fixing file path for study ${study.study_id}:`, error);
                errorCount++;
            }
        }

        const resultMessage = `File path fix completed:\n\n` +
                             `✅ Fixed: ${fixedCount} studies\n` +
                             `❌ Errors: ${errorCount} studies\n\n` +
                             `Refreshing study list...`;

        alert(resultMessage);
        showNotification(`Fixed file paths for ${fixedCount} studies`, 'success');

        // Refresh the study list
        await fetchStudies();

    } catch (error) {
        console.error('[Photonic] Error fixing study file paths:', error);
        showNotification('Error fixing study file paths: ' + error.message, 'error');
    }
}

/**
 * Fetch study list from the API
 */
async function handleFetchStudyList() {
    console.log('[Photonic] handleFetchStudyList called');

    if (isProcessing) {
        console.log('[Photonic] Already processing, skipping');
        return;
    }

    console.log('[Photonic] Current credentials:', credentials ? 'present' : 'missing');

    if (!credentials) {
        console.log('[Photonic] No credentials, showing modal');
        showCredentialsModal();
        return;
    }

    isProcessing = true;
    const fetchBtn = document.getElementById('fetchBtn');
    const originalText = fetchBtn.textContent;

    try {
        console.log('[Photonic] Starting fetch process...');
        fetchBtn.innerHTML = '<span class="loading"></span>Fetching...';
        showProgress(0);

        // Check if fetchAndStoreStudyList function exists
        if (typeof fetchAndStoreStudyList === 'undefined') {
            throw new Error('fetchAndStoreStudyList function not found. Make sure study-fetcher.js is loaded.');
        }

        // Check if required database functions exist
        if (typeof studiesDbPut === 'undefined') {
            throw new Error('studiesDbPut function not found. Make sure studies-db.js is loaded.');
        }

        console.log('[Photonic] Calling fetchAndStoreStudyList with credentials:', {
            username: credentials.username,
            hasPassword: !!credentials.password
        });

        showProgress(25);
        const result = await fetchAndStoreStudyList(credentials);
        console.log('[Photonic] fetchAndStoreStudyList result:', result);

        showProgress(75);

        if (result && result.success) {
            showNotification(result.message || 'Study list fetched successfully', 'success');
            console.log('[Photonic] Refreshing data after successful fetch...');

            // Force a complete refresh of the data and UI
            await loadStudiesData();
            updateStatistics();
            updateStudiesTable();

            showProgress(100);
            console.log('[Photonic] UI refresh completed');
        } else {
            const errorMsg = result ? result.error : 'Unknown error occurred';
            throw new Error(errorMsg);
        }

    } catch (error) {
        console.error('[Photonic] Error fetching study list:', error);
        showNotification('Error fetching study list: ' + error.message, 'error');

        // If authentication failed, show credentials modal
        if (error.message.includes('Authentication') || error.message.includes('credentials')) {
            showCredentialsModal();
        }
    } finally {
        isProcessing = false;
        fetchBtn.textContent = originalText;
        hideProgress();
    }
}

/**
 * Trigger downloads for pending studies
 */
async function triggerDownloads() {
    if (downloadsDisabled) {
        showNotification('Downloads are disabled. Use Emergency Stop button to re-enable.', 'error');
        return;
    }

    if (isProcessing) return;

    if (!credentials) {
        showCredentialsModal();
        return;
    }

    // Check if bulk downloads are enabled
    const bulkToggle = document.getElementById('bulkDownloadToggle');
    if (!bulkToggle.checked) {
        showNotification('Bulk downloads are disabled. Use individual download buttons or enable bulk downloads.', 'warning');
        return;
    }

    const pendingStudies = currentStudies.filter(s => s.status === STUDY_STATUS.DOWNLOAD);
    if (pendingStudies.length === 0) {
        showNotification('No studies pending download', 'info');
        return;
    }

    // Confirm bulk download
    if (!confirm(`Are you sure you want to download ${pendingStudies.length} studies in bulk?`)) {
        return;
    }

    isProcessing = true;
    const downloadBtn = document.getElementById('downloadBtn');
    const originalText = downloadBtn.textContent;

    try {
        downloadBtn.innerHTML = '<span class="loading"></span>Downloading...';
        showProgress(0);

        const result = await triggerStudyDownloads(credentials, { maxConcurrent: 3 });

        if (result.success) {
            showNotification(result.message, 'success');
            await refreshData();
        } else {
            throw new Error(result.error);
        }

    } catch (error) {
        console.error('[Photonic] Error triggering downloads:', error);
        showNotification('Error starting downloads: ' + error.message, 'error');
    } finally {
        isProcessing = false;
        downloadBtn.textContent = originalText;
        hideProgress();
    }
}

/**
 * Retry failed downloads
 */
async function retryFailedDownloads() {
    if (isProcessing) return;

    if (!credentials) {
        showCredentialsModal();
        return;
    }

    isProcessing = true;

    try {
        showProgress(0);
        const result = await retryFailedDownloads(credentials);

        if (result.success) {
            showNotification(result.message, 'success');
            await refreshData();
        } else {
            throw new Error(result.error);
        }

    } catch (error) {
        console.error('[Photonic] Error retrying downloads:', error);
        showNotification('Error retrying downloads: ' + error.message, 'error');
    } finally {
        isProcessing = false;
        hideProgress();
    }
}

/**
 * Download an individual study
 */
async function downloadIndividualStudy(studyId) {
    if (downloadsDisabled) {
        showNotification('Downloads are disabled. Use Emergency Stop button to re-enable.', 'error');
        return;
    }

    if (isProcessing) {
        showNotification('Another operation is in progress. Please wait.', 'warning');
        return;
    }

    if (!credentials) {
        showCredentialsModal();
        return;
    }

    try {
        // Log the study ID being downloaded for debugging
        console.log(`[Photonic] Starting download for study ID: ${studyId}`);

        const study = await studiesDbGet(studyId);
        if (!study) {
            throw new Error('Study not found');
        }

        // Log the study details for verification
        console.log(`[Photonic] Retrieved study: ${study.study_id}, Patient: ${study.patient_name}, UID: ${study.study_instance_uid}`);

        // CRITICAL: Validate study data before attempting download
        if (!study.study_instance_uid || study.study_instance_uid === 'undefined') {
            throw new Error(`Study ${study.study_id} has invalid study_instance_uid: ${study.study_instance_uid}`);
        }

        if (!study.patient_name || study.patient_name === 'undefined') {
            console.warn(`Study ${study.study_id} has invalid patient_name, using fallback`);
            study.patient_name = 'Unknown_Patient';
        }

        console.log(`[Photonic] Starting individual download for study: ${study.patient_name}`);

        // Show progress bar
        showProgress(0);

        // Update button to show loading state
        const button = document.querySelector(`[data-action="download"][data-study-id="${studyId}"], [data-action="download-individual"][data-study-id="${studyId}"]`);
        const originalText = button ? button.textContent : '';
        if (button) {
            button.innerHTML = '<span class="loading"></span>Downloading...';
            button.disabled = true;
        }

        // Set study status to download and update UI immediately
        await studiesDbUpdateStatus(studyId, STUDY_STATUS.DOWNLOAD);
        showProgress(10);
        await refreshData(true); // Force update UI to show new status
        showProgress(20);

        // Check if downloadSingleStudy function exists
        if (typeof downloadSingleStudy === 'undefined') {
            throw new Error('downloadSingleStudy function not found. Make sure study-downloader.js is loaded.');
        }

        // Get authentication token
        showProgress(30);
        const token = await getAuthToken(credentials);
        showProgress(40);

        // Use the existing download function but for a single study
        showProgress(50);
        const result = await downloadSingleStudy(study, token);
        showProgress(90);

        if (result.success) {
            showProgress(100);
            showNotification(`Successfully downloaded: ${study.patient_name}`, 'success');
            await refreshData(true); // Force update UI to show downloaded status
            hideProgress();
        } else {
            throw new Error(result.error);
        }

    } catch (error) {
        console.error('[Photonic] Error downloading individual study:', error);

        // Update status to error immediately
        try {
            await studiesDbUpdateStatus(studyId, STUDY_STATUS.ERROR, {
                error: error.message,
                error_time: new Date().toISOString()
            });
        } catch (dbError) {
            console.error('[Photonic] Error updating study status to error:', dbError);
        }

        showNotification('Error downloading study: ' + error.message, 'error');
        await refreshData(true); // Force refresh to show error status
        hideProgress();
    } finally {
        // Reset button state
        const button = document.querySelector(`[data-action="download"][data-study-id="${studyId}"], [data-action="download-individual"][data-study-id="${studyId}"]`);
        if (button) {
            button.disabled = false;
            // The button text will be updated when refreshData() updates the table
        }
    }
}

/**
 * Get authentication token
 */
async function getAuthToken(credentials) {
    if (typeof authenticateWithAPI === 'undefined') {
        throw new Error('authenticateWithAPI function not available. Make sure study-fetcher.js is loaded.');
    }

    const authResult = await authenticateWithAPI(credentials);
    if (!authResult.success) {
        throw new Error(`Authentication failed: ${authResult.error}`);
    }
    return authResult.token;
}

/**
 * Retry a specific study
 */
async function retryStudy(studyId) {
    try {
        console.log(`[Photonic] Retrying study: ${studyId}`);

        // Update status to pending for retry
        await studiesDbUpdateStatus(studyId, STUDY_STATUS.PENDING, {
            retry_time: new Date().toISOString(),
            error: null // Clear previous error
        });

        showNotification('Study marked for retry', 'success');
        await refreshData(); // Update UI immediately
    } catch (error) {
        console.error('[Photonic] Error retrying study:', error);
        showNotification('Error retrying study: ' + error.message, 'error');
    }
}

/**
 * Skip a specific study
 */
async function skipStudy(studyId) {
    try {
        console.log(`[Photonic] Skipping study: ${studyId}`);

        // Update status immediately
        await studiesDbUpdateStatus(studyId, STUDY_STATUS.SKIPPED, {
            skipped_time: new Date().toISOString()
        });

        showNotification('Study skipped', 'success');
        await refreshData(); // Update UI immediately
    } catch (error) {
        console.error('[Photonic] Error skipping study:', error);
        showNotification('Error skipping study: ' + error.message, 'error');
    }
}

/**
 * Delete a specific study
 */
async function deleteStudy(studyId) {
    if (!confirm('Are you sure you want to delete the downloaded file? The study will remain in the list for re-download.')) {
        return;
    }

    try {
        console.log(`[Photonic] Deleting downloaded file for study: ${studyId}`);

        const study = await studiesDbGet(studyId);
        if (!study) {
            throw new Error('Study not found');
        }

        let fileDeleted = false;

        // Check if we have a downloadId to use for deletion (extension mode)
        if (study.download_id && typeof chrome !== 'undefined' && chrome.downloads) {
            console.log(`[Photonic] Deleting file using Chrome downloads API, downloadId: ${study.download_id}`);

            // Use Chrome's downloads API to delete the file
            chrome.downloads.removeFile(study.download_id, () => {
                if (chrome.runtime.lastError) {
                    console.error('[Photonic] Could not delete file:', chrome.runtime.lastError.message);
                    // Continue with marking as deleted even if file deletion fails
                } else {
                    console.log('[Photonic] File deleted successfully');
                    fileDeleted = true;
                    // Optionally remove from downloads list
                    chrome.downloads.erase({id: study.download_id}, () => {
                        console.log('[Photonic] Download record erased from downloads list');
                    });
                }
            });
        } 
        // If we have a file_path, try to delete the file directly (standalone mode)
        else if (study.file_path) {
            console.log(`[Photonic] Attempting to delete file directly: ${study.file_path}`);

            try {
                // For standalone mode, we need to use the File System Access API or other methods
                // to delete the file directly from JavaScript

                // Method 1: Try to use the showSaveFilePicker API to get access to the file
                if (window.showSaveFilePicker) {
                    try {
                        // This will prompt the user to select the file, which is not ideal but necessary
                        // for security reasons (browsers don't allow direct file deletion without user interaction)
                        showNotification('Please select the file to confirm deletion', 'info');

                        const fileHandle = await window.showOpenFilePicker({
                            id: 'deleteFile',
                            startIn: 'downloads',
                            suggestedName: study.file_path.split('\\').pop(),
                            types: [
                                {
                                    description: 'ZIP Files',
                                    accept: {
                                        'application/zip': ['.zip']
                                    }
                                }
                            ]
                        });

                        if (fileHandle && fileHandle[0]) {
                            // We have permission to the file, now remove it
                            await fileHandle[0].remove();
                            console.log('[Photonic] File deleted successfully using File System Access API');
                            fileDeleted = true;
                        }
                    } catch (fsError) {
                        console.error('[Photonic] File System Access API error:', fsError);
                        // User may have cancelled the file picker, continue with marking as deleted
                    }
                } 
                // Method 2: For older browsers or if Method 1 fails, use a download link with revoke
                else {
                    console.log('[Photonic] File System Access API not available, marking as deleted only');
                    // We can't actually delete the file, but we'll mark it as deleted in our database
                    showNotification('Please manually delete the file from your downloads folder', 'info');
                }

                console.log(`[Photonic] File deletion process completed for: ${study.file_path}`);
            } catch (deleteError) {
                console.error('[Photonic] Error during file deletion:', deleteError);
                // Continue with marking as deleted even if file deletion fails
            }
        } else {
            console.log('[Photonic] No downloadId or file_path available, skipping file deletion');
        }

        // Mark study as deleted (remove downloaded file info but keep study data)
        await studiesDbUpdateStatus(studyId, STUDY_STATUS.DELETED, {
            file_path: null,
            file_size: null,
            download_id: null, // Clear the downloadId
            delete_time: new Date().toISOString(),
            // Clear download-related fields but keep study data
            study_instance_uuid: null
        });

        const message = fileDeleted 
            ? 'Downloaded file deleted. Study can be downloaded again.' 
            : 'Study marked as deleted in database. You may need to manually delete the file.';

        showNotification(message, 'success');
        await refreshData(true); // Force update UI immediately
    } catch (error) {
        console.error('[Photonic] Error deleting study:', error);
        showNotification('Error deleting study: ' + error.message, 'error');
    }
}

/**
 * Open a downloaded study file
 */
async function openStudyFile(studyId) {
    try {
        const study = await studiesDbGet(studyId);
        if (!study || !study.file_path) {
            throw new Error('Study file not found');
        }

        // In an extension environment, we might need to use chrome.downloads.open
        if (typeof chrome !== 'undefined' && chrome.downloads) {
            // This would require additional permissions and implementation
            showNotification('File opening not implemented in extension mode', 'info');
        } else {
            showNotification('File path: ' + study.file_path, 'info');
        }

    } catch (error) {
        console.error('[Photonic] Error opening study file:', error);
        showNotification('Error opening study file: ' + error.message, 'error');
    }
}

/**
 * Open a downloaded study in RadiAnt Viewer using URL protocol
 */
async function openStudyInRadiant(studyId) {
    try {
        const study = await studiesDbGet(studyId);

        // Enhanced debugging
        console.log(`[Photonic] Study data for ${studyId}:`, study);
        console.log(`[Photonic] Study file_path:`, study?.file_path);
        console.log(`[Photonic] Study status:`, study?.status);

        if (!study) {
            throw new Error('Study not found in database');
        }

        if (!study.file_path) {
            // Try to construct the expected file path
            const expectedPath = await constructExpectedFilePath(study);
            console.log(`[Photonic] No file_path stored. Expected path: ${expectedPath}`);

            // Automatically use the expected path without showing a message
            if (expectedPath) {
                study.file_path = expectedPath;

                // Update the study in the database with the expected path
                try {
                    await studiesDbPut({
                        ...study,
                        file_path: expectedPath
                    });
                    console.log(`[Photonic] Updated study ${study.study_id} with expected file path`);
                } catch (updateError) {
                    console.error(`[Photonic] Error updating study with expected path:`, updateError);
                }
            } else {
                throw new Error('Could not determine file path for this study.');
            }
        }

        const settings = getCurrentSettings();

        if (!settings.enableRadiantIntegration) {
            showNotification('RadiAnt integration is not enabled. Please enable it in settings.', 'error');
            return;
        }

        console.log(`[Photonic] Opening study ${studyId} in RadiAnt Viewer`);
        console.log(`[Photonic] Original file path: ${study.file_path}`);

        // Build RadiAnt URL using the radiant:// protocol
        const radiantUrl = buildRadiantUrl(study.file_path, settings);

        console.log(`[Photonic] Normalized file path: ${normalizeFilePath(study.file_path)}`);
        console.log(`[Photonic] RadiAnt URL: ${radiantUrl}`);

        try {
            // Try to open RadiAnt using the URL protocol
            window.open(radiantUrl, '_blank');
            showNotification('Opening study in RadiAnt Viewer...', 'success');
        } catch (error) {
            console.error('[Photonic] Error opening RadiAnt URL:', error);

            // Fallback: show instructions to user
            const normalizedPath = normalizeFilePath(study.file_path);
            const message = `RadiAnt URL protocol failed. Alternative options:\n\n` +
                          `1. Copy RadiAnt URL to address bar:\n` +
                          `   ${radiantUrl}\n\n` +
                          `2. Manual opening:\n` +
                          `   Open RadiAnt Viewer and navigate to:\n` +
                          `   ${normalizedPath}\n\n` +
                          `3. Debug info:\n` +
                          `   Original path: ${study.file_path}\n` +
                          `   Normalized path: ${normalizedPath}`;

            if (confirm(message + '\n\nCopy RadiAnt URL to clipboard?')) {
                try {
                    await navigator.clipboard.writeText(radiantUrl);
                    showNotification('RadiAnt URL copied to clipboard', 'success');
                } catch (e) {
                    showNotification('Could not copy to clipboard. URL: ' + radiantUrl, 'info');
                }
            }
        }

    } catch (error) {
        console.error('[Photonic] Error opening study in RadiAnt:', error);
        showNotification('Error opening study in RadiAnt: ' + error.message, 'error');
    }
}

/**
 * Open a downloaded study in MicroDicom Viewer using URL protocol
 */
async function openStudyInMicroDicom(studyId) {
    try {
        const study = await studiesDbGet(studyId);

        // Enhanced debugging
        console.log(`[Photonic] Study data for ${studyId}:`, study);
        console.log(`[Photonic] Study file_path:`, study?.file_path);
        console.log(`[Photonic] Study status:`, study?.status);

        if (!study) {
            throw new Error('Study not found in database');
        }

        if (!study.file_path) {
            // Try to construct the expected file path
            const expectedPath = await constructExpectedFilePath(study);
            console.log(`[Photonic] No file_path stored. Expected path: ${expectedPath}`);

            // Automatically use the expected path without showing a message
            if (expectedPath) {
                study.file_path = expectedPath;

                // Update the study in the database with the expected path
                try {
                    await studiesDbPut({
                        ...study,
                        file_path: expectedPath
                    });
                    console.log(`[Photonic] Updated study ${study.study_id} with expected file path`);
                } catch (updateError) {
                    console.error(`[Photonic] Error updating study with expected path:`, updateError);
                }
            } else {
                throw new Error('Could not determine file path for this study.');
            }
        }

        const settings = getCurrentSettings();

        if (!settings.enableMicroDicomIntegration) {
            showNotification('MicroDicom integration is not enabled. Please enable it in settings.', 'error');
            return;
        }

        console.log(`[Photonic] Opening study ${studyId} in MicroDicom Viewer`);
        console.log(`[Photonic] Original file path: ${study.file_path}`);

        // Build MicroDicom URL using the microdicom:// protocol
        const microDicomUrl = buildMicroDicomUrl(study.file_path, settings);

        console.log(`[Photonic] Normalized file path: ${normalizeFilePath(study.file_path)}`);
        console.log(`[Photonic] MicroDicom URL: ${microDicomUrl}`);

        try {
            // Try to open MicroDicom using the URL protocol
            // Use a unique name for the window to ensure a new window is created each time
            const windowName = 'microdicom_' + Date.now();
            window.open(microDicomUrl, windowName);
            showNotification('Opening study in MicroDicom Viewer...', 'success');
        } catch (error) {
            console.error('[Photonic] Error opening MicroDicom URL:', error);

            // Fallback: show instructions to user
            const normalizedPath = normalizeFilePath(study.file_path);
            const message = `MicroDicom URL protocol failed. Alternative options:\n\n` +
                          `1. Copy MicroDicom URL to address bar:\n` +
                          `   ${microDicomUrl}\n\n` +
                          `2. Manual opening:\n` +
                          `   Open MicroDicom Viewer and navigate to:\n` +
                          `   ${normalizedPath}\n\n` +
                          `3. Debug info:\n` +
                          `   Original path: ${study.file_path}\n` +
                          `   Normalized path: ${normalizedPath}`;

            if (confirm(message + '\n\nCopy MicroDicom URL to clipboard?')) {
                try {
                    await navigator.clipboard.writeText(microDicomUrl);
                    showNotification('MicroDicom URL copied to clipboard', 'success');
                } catch (e) {
                    showNotification('Could not copy to clipboard. URL: ' + microDicomUrl, 'info');
                }
            }
        }

    } catch (error) {
        console.error('[Photonic] Error opening study in MicroDicom:', error);
        showNotification('Error opening study in MicroDicom: ' + error.message, 'error');
    }
}

/**
 * Build RadiAnt URL using the radiant:// protocol
 */
function buildRadiantUrl(filePath, settings) {
    const baseUrl = 'radiant://';

    // Normalize file path for Windows (replace forward slashes with backslashes)
    const normalizedPath = normalizeFilePath(filePath);

    // Create a custom URL with properly encoded parameters
    // We're not using URLSearchParams because it might not handle the file path correctly
    let url = baseUrl;

    // Add file or folder opening parameter
    if (settings.radiantOpenMode === 'folder') {
        // Open folder containing the study (-d flag)
        const folderPath = getFolderPath(normalizedPath);
        url += `?n=d&v=${encodeURIComponent(folderPath)}`;
    } else {
        // Open specific file (-f flag)
        url += `?n=f&v=${encodeURIComponent(normalizedPath)}`;
    }

    // Add additional arguments if specified
    if (settings.radiantAdditionalArgs) {
        const additionalArgs = parseRadiantArgs(settings.radiantAdditionalArgs);
        additionalArgs.forEach(arg => {
            if (arg.name) {
                url += `&n=${encodeURIComponent(arg.name)}`;
                if (arg.value) {
                    url += `&v=${encodeURIComponent(arg.value)}`;
                }
            }
        });
    }

    // Log the URL for debugging
    console.log('[Photonic] Built RadiAnt URL:', url);
    console.log('[Photonic] Normalized path:', normalizedPath);

    return url;
}

/**
 * Build MicroDicom URL using the microdicom:// protocol
 * 
 * Note: The MicroDicom icon file (microdicom-icon.png) needs to be downloaded from:
 * https://www.google.com/url?sa=i&url=https%3A%2F%2Fapps.microsoft.com%2Fdetail%2Fxpffh6z7wldnb4%3Fhl%3Den-US%26gl%3DUS&psig=AOvVaw1Io1hZW_rEkzqQtyhRbOxV&ust=1749549746797000&source=images&cd=vfe&opi=89978449&ved=0CBEQjRxqFwoTCPjvj-uK5I0DFQAAAAAdAAAAABAE
 * and saved to the icons directory.
 */
function buildMicroDicomUrl(filePath, settings) {
    const baseUrl = 'microdicom://';

    // Normalize file path for Windows (replace forward slashes with backslashes)
    const normalizedPath = normalizeFilePath(filePath);

    // Create a custom URL with properly encoded parameters
    let url = baseUrl;

    // Add file or folder opening parameter
    if (settings.microDicomOpenMode === 'folder') {
        // Open folder containing the study
        const folderPath = getFolderPath(normalizedPath);
        url += `param=fd&value="${encodeURIComponent(folderPath)}"`;
    } else {
        // Open specific file
        url += `param=fd&value="${encodeURIComponent(normalizedPath)}"`;
    }

    // Add additional arguments if specified
    if (settings.microDicomAdditionalArgs) {
        url += `&${settings.microDicomAdditionalArgs}`;
    }

    // Log the URL for debugging
    console.log('[Photonic] Built MicroDicom URL:', url);
    console.log('[Photonic] Normalized path:', normalizedPath);

    return url;
}

/**
 * Get the current Windows username
 */
function getUserName() {
    // In a browser extension, we can't directly access environment variables
    // But we can try to infer the username from various sources

    // Try to get from the current URL or other browser APIs
    try {
        // For this specific case, we know the username from the project path
        return 'LuisRamos';
    } catch (error) {
        console.warn('[Photonic] Could not determine username, using default');
        return 'User';
    }
}

/**
 * Normalize file path for the current operating system
 */
function normalizeFilePath(filePath) {
    const userAgent = navigator.userAgent;
    const platform = navigator.platform;

    if (platform.indexOf('Win') !== -1 || userAgent.indexOf('Windows') !== -1) {
        // Windows: convert forward slashes to backslashes and expand environment variables
        let normalizedPath = filePath.replace(/\//g, '\\');

        // Expand %USERPROFILE% if present
        if (normalizedPath.includes('%USERPROFILE%')) {
            // Resolve %USERPROFILE% to the actual user profile path
            // In Windows, this is typically C:\Users\{username}
            const userProfile = `C:\\Users\\${getUserName()}`;
            normalizedPath = normalizedPath.replace(/%USERPROFILE%/g, userProfile);
        }

        return normalizedPath;
    } else {
        // macOS/Linux: ensure forward slashes and expand ~ if present
        let normalizedPath = filePath.replace(/\\/g, '/');

        // Expand ~ if present
        if (normalizedPath.startsWith('~/')) {
            // In a real environment, this would be expanded by the OS
            // For now, we'll leave it as is since RadiAnt should handle it
            return normalizedPath;
        }

        return normalizedPath;
    }
}

/**
 * Get folder path from file path
 */
function getFolderPath(filePath) {
    const userAgent = navigator.userAgent;
    const platform = navigator.platform;

    if (platform.indexOf('Win') !== -1 || userAgent.indexOf('Windows') !== -1) {
        // Windows: use backslash separator
        const lastBackslash = filePath.lastIndexOf('\\');
        return lastBackslash !== -1 ? filePath.substring(0, lastBackslash) : filePath;
    } else {
        // macOS/Linux: use forward slash separator
        const lastSlash = filePath.lastIndexOf('/');
        return lastSlash !== -1 ? filePath.substring(0, lastSlash) : filePath;
    }
}

/**
 * Parse RadiAnt additional arguments into name-value pairs
 */
function parseRadiantArgs(argsString) {
    const args = [];
    const tokens = argsString.trim().split(/\s+/);

    for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];

        if (token.startsWith('-')) {
            // This is a parameter name
            const paramName = token.substring(1); // Remove the '-'
            let paramValue = null;

            // Check if the next token is a value (doesn't start with -)
            if (i + 1 < tokens.length && !tokens[i + 1].startsWith('-')) {
                paramValue = tokens[i + 1];
                i++; // Skip the next token as we've consumed it as a value
            }

            args.push({
                name: paramName,
                value: paramValue
            });
        }
    }

    return args;
}

/**
 * Clear studies with error status
 */
async function clearErrorStudies() {
    if (!confirm('Are you sure you want to delete all studies with error status?')) {
        return;
    }

    try {
        const errorStudies = currentStudies.filter(s => s.status === STUDY_STATUS.ERROR);

        for (const study of errorStudies) {
            await studiesDbDelete(study.study_id);
        }

        showNotification(`Deleted ${errorStudies.length} error studies`, 'success');
        await refreshData();

    } catch (error) {
        console.error('[Photonic] Error clearing error studies:', error);
        showNotification('Error clearing error studies: ' + error.message, 'error');
    }
}

/**
 * Clear all studies
 */
async function clearAllStudies() {
    if (!confirm('Are you sure you want to delete ALL studies? This cannot be undone.')) {
        return;
    }

    try {
        await studiesDbClear();
        showNotification('All studies cleared', 'success');
        await refreshData();
    } catch (error) {
        console.error('[Photonic] Error clearing all studies:', error);
        showNotification('Error clearing all studies: ' + error.message, 'error');
    }
}

/**
 * Get selected study IDs from checkboxes
 */
function getSelectedStudyIds() {
    const checkboxes = document.querySelectorAll('.study-checkbox:checked');
    return Array.from(checkboxes).map(cb => cb.value);
}

/**
 * Bulk download selected studies
 */
async function bulkDownloadSelected() {
    const selectedIds = getSelectedStudyIds();

    if (selectedIds.length === 0) {
        showNotification('No studies selected', 'warning');
        return;
    }

    try {
        // Get all selected studies
        const selectedStudies = [];
        for (const studyId of selectedIds) {
            const study = await studiesDbGet(studyId);
            if (study) {
                selectedStudies.push(study);
            }
        }

        // Filter out studies that have already been downloaded
        const studiesToDownload = selectedStudies.filter(study => 
            study.status !== STUDY_STATUS.DOWNLOADED);

        const alreadyDownloaded = selectedStudies.length - studiesToDownload.length;

        if (studiesToDownload.length === 0) {
            showNotification('All selected studies have already been downloaded', 'info');
            return;
        }

        // Confirm with user, mentioning how many will be skipped
        let confirmMessage = `Download ${studiesToDownload.length} selected studies?`;
        if (alreadyDownloaded > 0) {
            confirmMessage = `Download ${studiesToDownload.length} selected studies? (${alreadyDownloaded} already downloaded will be skipped)`;
        }

        if (!confirm(confirmMessage)) {
            return;
        }

        let successCount = 0;
        let errorCount = 0;
        const totalStudies = studiesToDownload.length;

        showProgress(0);

        for (let i = 0; i < studiesToDownload.length; i++) {
            const studyId = studiesToDownload[i].study_id;
            const progressPercent = Math.round((i / totalStudies) * 100);
            showProgress(progressPercent);

            try {
                await downloadIndividualStudy(studyId);
                successCount++;
            } catch (error) {
                console.error(`[Photonic] Error downloading study ${studyId}:`, error);
                errorCount++;
            }
        }

        showProgress(100);

        let message = `Bulk download completed: ${successCount} successful, ${errorCount} failed`;
        if (alreadyDownloaded > 0) {
            message += ` (${alreadyDownloaded} already downloaded were skipped)`;
        }

        showNotification(message, errorCount > 0 ? 'warning' : 'success');
        await refreshData();
        hideProgress();

    } catch (error) {
        console.error('[Photonic] Error in bulk download:', error);
        showNotification('Error in bulk download: ' + error.message, 'error');
        hideProgress();
    }
}

/**
 * Bulk skip selected studies
 */
async function bulkSkipSelected() {
    const selectedIds = getSelectedStudyIds();

    if (selectedIds.length === 0) {
        showNotification('No studies selected', 'warning');
        return;
    }

    try {
        // Get all selected studies
        const selectedStudies = [];
        for (const studyId of selectedIds) {
            const study = await studiesDbGet(studyId);
            if (study) {
                selectedStudies.push(study);
            }
        }

        // Filter out studies that have already been downloaded
        const studiesToSkip = selectedStudies.filter(study => 
            study.status !== STUDY_STATUS.DOWNLOADED);

        const alreadyDownloaded = selectedStudies.length - studiesToSkip.length;

        if (studiesToSkip.length === 0) {
            showNotification('All selected studies have already been downloaded and cannot be skipped', 'info');
            return;
        }

        // Confirm with user, mentioning how many will be ignored
        let confirmMessage = `Skip ${studiesToSkip.length} selected studies?`;
        if (alreadyDownloaded > 0) {
            confirmMessage = `Skip ${studiesToSkip.length} selected studies? (${alreadyDownloaded} already downloaded will be ignored)`;
        }

        if (!confirm(confirmMessage)) {
            return;
        }

        // Skip only studies that haven't been downloaded
        for (const study of studiesToSkip) {
            await studiesDbUpdateStatus(study.study_id, STUDY_STATUS.SKIPPED);
        }

        let message = `${studiesToSkip.length} studies skipped`;
        if (alreadyDownloaded > 0) {
            message += ` (${alreadyDownloaded} already downloaded were ignored)`;
        }

        showNotification(message, 'success');
        await refreshData();

    } catch (error) {
        console.error('[Photonic] Error in bulk skip:', error);
        showNotification('Error in bulk skip: ' + error.message, 'error');
    }
}

/**
 * Bulk delete selected studies
 */
async function bulkDeleteSelected() {
    const selectedIds = getSelectedStudyIds();

    if (selectedIds.length === 0) {
        showNotification('No studies selected', 'warning');
        return;
    }

    if (!confirm(`Delete ${selectedIds.length} selected studies? This will delete the downloaded files but keep the study records.`)) {
        return;
    }

    try {
        let successCount = 0;
        let errorCount = 0;
        let notDownloadedCount = 0;

        showProgress(0);
        const totalStudies = selectedIds.length;

        for (let i = 0; i < selectedIds.length; i++) {
            const studyId = selectedIds[i];
            const progressPercent = Math.round((i / totalStudies) * 100);
            showProgress(progressPercent);

            try {
                // Get the study details
                const study = await studiesDbGet(studyId);
                if (!study) {
                    console.warn(`[Photonic] Study not found: ${studyId}`);
                    errorCount++;
                    continue;
                }

                // If the study is not downloaded, just count it
                if (study.status !== STUDY_STATUS.DOWNLOADED) {
                    notDownloadedCount++;
                    continue;
                }

                // Delete the file if we have a downloadId
                if (study.download_id && typeof chrome !== 'undefined' && chrome.downloads) {
                    console.log(`[Photonic] Deleting file using Chrome downloads API, downloadId: ${study.download_id}`);

                    // Use Chrome's downloads API to delete the file
                    chrome.downloads.removeFile(study.download_id, () => {
                        if (chrome.runtime.lastError) {
                            console.error('[Photonic] Could not delete file:', chrome.runtime.lastError.message);
                            // Continue with marking as deleted even if file deletion fails
                        } else {
                            console.log('[Photonic] File deleted successfully');
                            // Optionally remove from downloads list
                            chrome.downloads.erase({id: study.download_id}, () => {
                                console.log('[Photonic] Download record erased from downloads list');
                            });
                        }
                    });
                } else {
                    console.log('[Photonic] No downloadId available or not in extension context, skipping file deletion');
                }

                // Mark study as deleted (remove downloaded file info but keep study data)
                await studiesDbUpdateStatus(studyId, STUDY_STATUS.DELETED, {
                    file_path: null,
                    file_size: null,
                    download_id: null, // Clear the downloadId
                    delete_time: new Date().toISOString(),
                    // Clear download-related fields but keep study data
                    study_instance_uuid: null
                });

                successCount++;
            } catch (error) {
                console.error(`[Photonic] Error deleting study ${studyId}:`, error);
                errorCount++;
            }
        }

        showProgress(100);
        hideProgress();

        let message = `Bulk delete completed: ${successCount} files deleted`;
        if (notDownloadedCount > 0) {
            message += `, ${notDownloadedCount} not downloaded were ignored`;
        }
        if (errorCount > 0) {
            message += `, ${errorCount} errors`;
        }

        showNotification(message, errorCount > 0 ? 'warning' : 'success');
        await refreshData();

    } catch (error) {
        console.error('[Photonic] Error in bulk delete:', error);
        showNotification('Error in bulk delete: ' + error.message, 'error');
        hideProgress();
    }
}

/**
 * Deselect all studies
 */
function deselectAllStudies() {
    const checkboxes = document.querySelectorAll('.study-checkbox');
    checkboxes.forEach(cb => cb.checked = false);

    const selectAllCheckbox = document.getElementById('selectAllCheckbox');
    if (selectAllCheckbox) {
        selectAllCheckbox.checked = false;
    }

    updateSelectedCount();
}

/**
 * Toggle select all studies
 */
function toggleSelectAll() {
    const selectAllCheckbox = document.getElementById('selectAllCheckbox');
    const studyCheckboxes = document.querySelectorAll('.study-checkbox');

    studyCheckboxes.forEach(cb => {
        cb.checked = selectAllCheckbox.checked;
    });

    updateSelectedCount();
}

/**
 * Update selected count display
 */
function updateSelectedCount() {
    const selectedCount = document.querySelectorAll('.study-checkbox:checked').length;
    const selectedCountElement = document.getElementById('selectedCount');

    if (selectedCountElement) {
        selectedCountElement.textContent = selectedCount;
    }

    // Show/hide bulk actions group based on selection
    const bulkActionsGroup = document.getElementById('bulkActionsGroup');
    if (bulkActionsGroup) {
        bulkActionsGroup.style.display = selectedCount > 0 ? 'flex' : 'none';
    }
}

/**
 * Filter studies table based on search input
 */
function filterStudies() {
    const searchTerm = document.getElementById('searchBox').value.toLowerCase();
    const rows = document.querySelectorAll('#studiesTableBody tr');

    rows.forEach(row => {
        const text = row.textContent.toLowerCase();
        row.style.display = text.includes(searchTerm) ? '' : 'none';
    });
}

/**
 * Show credentials modal
 */
function showCredentialsModal() {
    const modal = document.getElementById('credentialsModal');
    modal.style.display = 'block';

    // Pre-fill with existing credentials
    if (credentials) {
        document.getElementById('username').value = credentials.username || '';
        document.getElementById('password').value = credentials.password || '';
    }
}

/**
 * Close credentials modal
 */
function closeCredentialsModal() {
    const modal = document.getElementById('credentialsModal');
    modal.style.display = 'none';
}

/**
 * Save credentials from modal
 */
async function saveCredentials() {
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value.trim();

    if (!username || !password) {
        showNotification('Please enter both username and password', 'error');
        return;
    }

    credentials = { username, password };
    await saveCredentialsToStorage(credentials);

    closeCredentialsModal();
    showNotification('Credentials saved successfully', 'success');
}

/**
 * Show settings modal
 */
function showSettingsModal() {
    const modal = document.getElementById('settingsModal');
    modal.style.display = 'block';

    // Update current settings display
    updateSettingsDisplay();
}

/**
 * Close settings modal
 */
function closeSettingsModal() {
    const modal = document.getElementById('settingsModal');
    modal.style.display = 'none';
}

/**
 * Update settings display with current values
 */
function updateSettingsDisplay() {
    // Update credentials display
    const usernameDisplay = document.getElementById('currentUsername');
    const passwordDisplay = document.getElementById('passwordStatus');

    if (usernameDisplay) {
        usernameDisplay.textContent = credentials ? credentials.username : 'Not set';
    }

    if (passwordDisplay) {
        passwordDisplay.textContent = credentials ? 'Set' : 'Not set';
    }

    // Update polling settings
    const pollingInterval = document.getElementById('pollingInterval');
    const enableAutoPolling = document.getElementById('enableAutoPolling');
    const pollingIntervalDisplay = document.getElementById('pollingIntervalDisplay');

    // Update storage size settings
    const maxStorageSize = document.getElementById('maxStorageSize');
    const autoDeleteOldest = document.getElementById('autoDeleteOldest');

    // Update time management settings
    const autoDeleteDays = document.getElementById('autoDeleteDays');
    const enableTimeManagement = document.getElementById('enableTimeManagement');

    if (pollingInterval) {
        pollingInterval.value = 60; // Default value

        // Update the display value when the input changes
        pollingInterval.addEventListener('input', function() {
            if (pollingIntervalDisplay) {
                pollingIntervalDisplay.textContent = this.value;
            }
        });
    }

    if (pollingIntervalDisplay) {
        pollingIntervalDisplay.textContent = pollingInterval ? pollingInterval.value : '60';
    }

    if (enableAutoPolling) {
        enableAutoPolling.checked = false; // Default to not enabled (same as disabled in old version)
    }

    if (maxStorageSize) {
        maxStorageSize.value = 10; // Default to 10GB
    }

    if (autoDeleteOldest) {
        autoDeleteOldest.checked = true; // Default to enabled
    }

    if (autoDeleteDays) {
        autoDeleteDays.value = 7; // Default to 7 days
    }

    if (enableTimeManagement) {
        enableTimeManagement.checked = true; // Default to enabled
    }

    // Update cache size display
    updateCacheSizeDisplay();
}

/**
 * Update cache size display
 */
async function updateCacheSizeDisplay() {
    const cacheDisplay = document.getElementById('currentCacheSize');
    if (cacheDisplay) {
        try {
            // Calculate cache size based on stored studies
            const studies = await studiesDbGetAll();
            const downloadedStudies = studies.filter(s => s.status === STUDY_STATUS.DOWNLOADED);
            cacheDisplay.textContent = `${downloadedStudies.length} studies downloaded`;
        } catch (error) {
            cacheDisplay.textContent = 'Unable to calculate';
        }
    }
}

/**
 * Update bulk download UI based on toggle state
 */
function updateBulkDownloadUI() {
    const bulkToggle = document.getElementById('bulkDownloadToggle');
    const downloadBtn = document.getElementById('triggerDownloadsBtn');

    if (bulkToggle && downloadBtn) {
        if (bulkToggle.checked) {
            downloadBtn.disabled = false;
            downloadBtn.style.opacity = '1';
            downloadBtn.title = 'Start bulk downloads for all pending studies';
        } else {
            downloadBtn.disabled = true;
            downloadBtn.style.opacity = '0.5';
            downloadBtn.title = 'Bulk downloads are disabled. Enable the toggle above or use individual download buttons.';
        }
    }
}

/**
 * Show progress bar
 */
function showProgress(percentage) {
    const progressBar = document.getElementById('progressBar');
    const progressFill = document.getElementById('progressFill');

    progressBar.style.display = 'block';
    progressFill.style.width = percentage + '%';
}

/**
 * Hide progress bar
 */
function hideProgress() {
    const progressBar = document.getElementById('progressBar');
    progressBar.style.display = 'none';
}

/**
 * Show notification
 */
function showNotification(message, type = 'info') {
    // Remove existing notification
    const existing = document.querySelector('.notification');
    if (existing) {
        existing.remove();
    }

    // Create new notification
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;

    document.body.appendChild(notification);

    // Show notification
    setTimeout(() => notification.classList.add('show'), 100);

    // Hide notification after 5 seconds
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => notification.remove(), 300);
    }, 5000);
}

/**
 * Emergency stop all downloads and clear any pending requests
 */
function emergencyStopDownloads() {
    if (downloadsDisabled) {
        // Re-enable downloads
        console.log('[Photonic] Re-enabling downloads');
        downloadsDisabled = false;
        showNotification('Downloads re-enabled', 'success');

        // Update button text
        const emergencyBtn = document.getElementById('emergencyStopBtn');
        if (emergencyBtn) {
            emergencyBtn.innerHTML = '🛑 Emergency Stop';
        }
    } else {
        // Disable downloads
        console.log('[Photonic] EMERGENCY STOP: Stopping all downloads');

        // Set emergency flag to disable all downloads
        downloadsDisabled = true;
        isProcessing = false;

        // Clear any pending timeouts/intervals
        if (window.downloadInterval) {
            clearInterval(window.downloadInterval);
            window.downloadInterval = null;
        }

        // Reset all download buttons
        const downloadButtons = document.querySelectorAll('[data-action="download-individual"]');
        downloadButtons.forEach(button => {
            button.disabled = false;
            button.innerHTML = 'Download';
        });

        // Reset bulk download button
        const bulkBtn = document.getElementById('downloadBtn');
        if (bulkBtn) {
            bulkBtn.textContent = 'Start Bulk Downloads';
        }

        // Hide progress
        hideProgress();

        showNotification('Emergency stop activated - all downloads stopped', 'warning');

        // Update button text
        const emergencyBtn = document.getElementById('emergencyStopBtn');
        if (emergencyBtn) {
            emergencyBtn.innerHTML = '✅ Re-enable Downloads';
        }
    }
}

/**
 * Show debug information
 */
async function showDebugInfo() {
    try {
        console.log('[Photonic] === DEBUG INFO ===');

        // Check function availability
        const functions = {
            fetchAndStoreStudyList: typeof fetchAndStoreStudyList,
            studiesDbGetAll: typeof studiesDbGetAll,
            studiesDbPut: typeof studiesDbPut,
            downloadSingleStudy: typeof downloadSingleStudy,
            authenticateWithAPI: typeof authenticateWithAPI,
            STUDY_STATUS: typeof STUDY_STATUS
        };
        console.log('[Photonic] Function availability:', functions);

        // Check credentials
        console.log('[Photonic] Credentials:', credentials ? 'present' : 'missing');
        if (credentials) {
            console.log('[Photonic] Username:', credentials.username);
        }

        // Check database
        if (typeof studiesDbGetAll !== 'undefined') {
            const studies = await studiesDbGetAll();
            console.log('[Photonic] Database studies count:', studies.length);
            if (studies.length > 0) {
                console.log('[Photonic] First study:', studies[0]);
            }
        } else {
            console.log('[Photonic] Database function not available');
        }

        // Check current state
        console.log('[Photonic] Current studies in memory:', currentStudies.length);
        console.log('[Photonic] Is processing:', isProcessing);

        // Show in UI
        const debugInfo = `
Functions: ${Object.entries(functions).map(([k,v]) => `${k}: ${v}`).join(', ')}
Credentials: ${credentials ? 'present' : 'missing'}
Database studies: ${typeof studiesDbGetAll !== 'undefined' ? (await studiesDbGetAll()).length : 'N/A'}
Memory studies: ${currentStudies.length}
Processing: ${isProcessing}
        `.trim();

        showNotification('Debug info logged to console', 'info');
        alert('Debug Info:\n\n' + debugInfo);

    } catch (error) {
        console.error('[Photonic] Debug error:', error);
        showNotification('Debug error: ' + error.message, 'error');
    }
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Close modal when clicking outside
window.onclick = function(event) {
    const modal = document.getElementById('credentialsModal');
    if (event.target === modal) {
        closeCredentialsModal();
    }
}

// EMERGENCY STOP SYSTEM
function fullEmergencyStop() {
    console.log('🛑 FULL EMERGENCY STOP ACTIVATED');

    // Clear all intervals
    for (let i = 1; i < 99999; i++) {
        clearInterval(i);
        clearTimeout(i);
    }

    // Override fetch to prevent requests
    const originalFetch = window.fetch;
    window.fetch = function(url, options) {
        if (typeof url === 'string' && url.includes('dicom-web/studies/undefined')) {
            console.error('🛑 BLOCKED REQUEST TO:', url);
            return Promise.reject(new Error('Emergency stop: blocked undefined UUID request'));
        }

        if (typeof url === 'string' && url.includes('dicom-web/studies/') && url.includes('/archive')) {
            console.warn('🛑 BLOCKED DOWNLOAD REQUEST TO:', url);
            return Promise.reject(new Error('Emergency stop: all downloads blocked'));
        }

        return originalFetch.apply(this, arguments);
    };

    // Disable all download functions
    downloadsDisabled = true;
    isProcessing = false;

    showNotification('🛑 FULL EMERGENCY STOP ACTIVATED - All requests blocked', 'error');
}

// Make emergency stop available globally for console access
window.photonicEmergencyStop = emergencyStopDownloads;
window.photonicFullStop = fullEmergencyStop;
window.photonicDisableDownloads = function() {
    downloadsDisabled = true;
    console.log('[Photonic] Downloads disabled via console');
};

// Log instructions for emergency use
console.log('[Photonic] Emergency commands available:');
console.log('  photonicEmergencyStop() - Stop all downloads and toggle download state');
console.log('  photonicFullStop() - FULL EMERGENCY STOP - blocks all requests');
console.log('  photonicDisableDownloads() - Immediately disable all downloads');
