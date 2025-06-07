/**
 * Photonic DevTools Page Script
 * This script runs in the devtools page context and creates the panel
 */

// Create the DevTools panel
chrome.devtools.panels.create('Photonic', '', 'devtools.html', () => {
  console.log('Photonic DevTools panel created');
});