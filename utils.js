/**
 * Utility functions for Photonic
 */

/**
 * Converts bytes to megabytes with specified precision
 * @param {number} bytes - Size in bytes
 * @param {number} [precision=2] - Number of decimal places
 * @returns {number} - Size in megabytes
 */
function bytesToMB(bytes, precision = 2) {
  return (bytes / 1048576).toFixed(precision);
}

/**
 * Converts bytes to gigabytes with specified precision
 * @param {number} bytes - Size in bytes
 * @param {number} [precision=2] - Number of decimal places
 * @returns {number} - Size in gigabytes
 */
function bytesToGB(bytes, precision = 2) {
  return (bytes / 1073741824).toFixed(precision);
}

/**
 * Converts megabytes to bytes
 * @param {number} mb - Size in megabytes
 * @returns {number} - Size in bytes
 */
function mbToBytes(mb) {
  return mb * 1048576;
}

/**
 * Converts gigabytes to bytes
 * @param {number} gb - Size in gigabytes
 * @returns {number} - Size in bytes
 */
function gbToBytes(gb) {
  return gb * 1073741824;
}

/**
 * Formats a timestamp as a human-readable string
 * @param {number} timestamp - Timestamp in milliseconds
 * @returns {string} - Formatted date string
 */
function formatTimestamp(timestamp) {
  return new Date(timestamp).toLocaleString();
}

/**
 * Calculates the age of a timestamp in days
 * @param {number} timestamp - Timestamp in milliseconds
 * @returns {number} - Age in days
 */
function getAgeInDays(timestamp) {
  const now = Date.now();
  const ageMs = now - timestamp;
  return ageMs / (1000 * 60 * 60 * 24);
}

/**
 * Creates a throttled version of a function
 * @param {Function} func - The function to throttle
 * @param {number} limit - Throttle limit in milliseconds
 * @returns {Function} - Throttled function
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
 * @param {Function} fn - Async function to retry
 * @param {number} [maxRetries=3] - Maximum number of retry attempts
 * @param {number} [baseDelay=1000] - Base delay in milliseconds
 * @returns {Promise<any>} - Result of the function
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

// Export the functions
export {
  bytesToMB,
  bytesToGB,
  mbToBytes,
  gbToBytes,
  formatTimestamp,
  getAgeInDays,
  throttle,
  retry
};