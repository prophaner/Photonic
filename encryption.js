/**
 * Encryption utilities for Photonic
 * Uses Web Crypto API with AES-GCM for secure encryption of DICOM studies
 */

/**
 * Encrypts a blob using AES-GCM with a random key and IV
 * @param {Blob} blob - The blob to encrypt
 * @returns {Promise<Object>} - Object containing cipherText, key, iv, and original size
 */
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

/**
 * Decrypts a previously encrypted blob
 * @param {Object} encryptedData - Object containing cipherText, key, and iv
 * @returns {Promise<Blob>} - The decrypted blob
 */
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

// Export the functions
export { encryptBlob, decryptToBlob };