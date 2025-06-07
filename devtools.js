/**
 * Photonic DevTools Panel
 * Provides a UI for inspecting and managing the cached studies
 */

// Wait for DOM to be ready
document.addEventListener('DOMContentLoaded', () => {
  // Only proceed if we're in the devtools.html page
  if (document.getElementById('studies-body')) {
    initializeDevTools();
  }
});

/**
 * Function to initialize the DevTools UI
 */
function initializeDevTools() {
  // DOM elements
  const studyCount = document.getElementById('study-count');
  const totalSize = document.getElementById('total-size');
  const oldestStudy = document.getElementById('oldest-study');
  const studiesBody = document.getElementById('studies-body');
  const emptyState = document.getElementById('empty-state');
  const refreshBtn = document.getElementById('refresh-btn');
  const flushBtn = document.getElementById('flush-btn');

  // Event listeners
  loadCacheData(); // Load data immediately
  if (refreshBtn) refreshBtn.addEventListener('click', loadCacheData);
  if (flushBtn) flushBtn.addEventListener('click', flushCache);

  /**
   * Loads and displays cache data
   */
  async function loadCacheData() {
    try {
      const studies = await chrome.runtime.sendMessage({ cmd: 'dumpCache' });
      
      // Update stats
      updateStats(studies);
      
      // Update table
      updateTable(studies);
      
      // Show/hide empty state
      if (emptyState) {
        emptyState.style.display = studies.length === 0 ? 'block' : 'none';
      }
    } catch (error) {
      console.error('Error loading cache data:', error);
    }
  }

  /**
   * Updates the statistics display
   * @param {Array} studies - Array of study objects
   */
  function updateStats(studies) {
    // Update study count
    if (studyCount) {
      studyCount.textContent = studies.length;
    }
    
    // Calculate total size
    if (totalSize) {
      const totalBytes = studies.reduce((sum, study) => sum + study.size, 0);
      totalSize.textContent = (totalBytes / 1048576).toFixed(2) + ' MB';
    }
    
    // Find oldest study
    if (oldestStudy && studies.length > 0) {
      const oldest = studies.reduce((oldest, study) => 
        study.ts < oldest.ts ? study : oldest, studies[0]);
      const daysAgo = ((Date.now() - oldest.ts) / (1000 * 60 * 60 * 24)).toFixed(1);
      oldestStudy.textContent = daysAgo + ' days';
    } else if (oldestStudy) {
      oldestStudy.textContent = '-';
    }
  }

  /**
   * Updates the studies table
   * @param {Array} studies - Array of study objects
   */
  function updateTable(studies) {
    // Clear existing rows
    if (studiesBody) {
      studiesBody.innerHTML = '';
      
      // Sort studies by timestamp (newest first)
      studies.sort((a, b) => b.ts - a.ts);
      
      // Add rows for each study
      studies.forEach(study => {
        const row = document.createElement('tr');
        
        // Calculate age in days
        const ageInDays = ((Date.now() - study.ts) / (1000 * 60 * 60 * 24)).toFixed(1);
        
        row.innerHTML = `
          <td title="${study.uid}">${truncateUid(study.uid)}</td>
          <td>${(study.size / 1048576).toFixed(2)} MB</td>
          <td>${new Date(study.ts).toLocaleString()}</td>
          <td>${ageInDays}</td>
          <td>
            <button class="delete-btn" data-uid="${study.uid}">Delete</button>
          </td>
        `;
        
        studiesBody.appendChild(row);
      });
      
      // Add event listeners to delete buttons
      document.querySelectorAll('.delete-btn[data-uid]').forEach(btn => {
        btn.addEventListener('click', () => deleteStudy(btn.dataset.uid));
      });
    }
  }

  /**
   * Truncates a long UID for display
   * @param {string} uid - The StudyInstanceUID
   * @returns {string} - Truncated UID
   */
  function truncateUid(uid) {
    if (uid.length <= 20) return uid;
    return uid.substring(0, 8) + '...' + uid.substring(uid.length - 8);
  }

  /**
   * Deletes a study from the cache
   * @param {string} uid - The StudyInstanceUID to delete
   */
  async function deleteStudy(uid) {
    try {
      await chrome.runtime.sendMessage({ cmd: 'deleteStudy', uid });
      loadCacheData(); // Refresh the data
    } catch (error) {
      console.error('Error deleting study:', error);
    }
  }

  /**
   * Flushes the entire cache
   */
  async function flushCache() {
    if (confirm('Are you sure you want to delete all cached studies?')) {
      try {
        await chrome.runtime.sendMessage('flushCache');
        loadCacheData(); // Refresh the data
      } catch (error) {
        console.error('Error flushing cache:', error);
      }
    }
  }
} // End of initializeDevTools function