# Photonic

A Chrome extension for pre-fetching and locally caching encrypted DICOM studies from Aikenist PACS.

## Overview

Photonic is designed to eliminate WAN latency for radiologists working with DICOM studies from remote Aikenist PACS servers. It works by:

1. Polling the PACS worklist at regular intervals
2. Downloading new studies that match specified criteria
3. Encrypting the studies with AES-GCM and storing them in the browser's IndexedDB
4. Serving the studies instantly when requested by the radiologist

This approach is particularly beneficial for overseas doctors with slow network connections, as it removes the need to download large DICOM studies over high-latency links when they need to be viewed.

## Features

- **Secure Storage**: All studies are encrypted with AES-GCM using a random key and IV per study
- **Automatic Cache Management**: LRU+TTL cache policy keeps local storage within configurable limits
- **Background Operation**: Service worker runs in the background, even when the browser is closed
- **Configurable Settings**: Customize subdomain, credentials, cache size, TTL, and more
- **DevTools Integration**: Custom DevTools panel for inspecting and managing cached studies
- **Debug Tools**: Badge counter, logging, and test functions for easy development and troubleshooting

## Architecture

### Core Components

- **Background Service Worker**: Handles polling, downloading, encryption, and cache management
- **Options Page**: User interface for configuring the extension
- **DevTools Panel**: Interface for inspecting and managing cached studies
- **Encryption Module**: Handles secure encryption and decryption of studies
- **IndexedDB Wrapper**: Manages local storage operations

### Security

- All runtime secrets (keys, subdomain, Basic-Auth token) are stored in `chrome.storage.local` and never leave the machine
- Studies are encrypted with AES-GCM using the Web Crypto API
- Each study has its own random encryption key and IV

## Installation

1. Clone this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode"
4. Click "Load unpacked" and select the project directory
5. Configure the extension by clicking on its icon and entering your Aikenist subdomain and credentials

## Configuration

The following settings can be configured through the options page:

- **Subdomain**: Your Aikenist PACS subdomain (e.g., "toprad" for toprad.aikenist.com)
- **Username/Password**: Your Aikenist credentials
- **Max Cache Size**: Maximum storage space to use (in GB)
- **TTL**: Number of days to keep studies before automatic deletion
- **Polling Interval**: How often to check for new studies (in seconds)
- **Debug Mode**: Enable detailed logging for troubleshooting

## Development

### Project Structure

- `manifest.json`: Extension manifest defining permissions and components
- `background.js`: Core logic for the service worker
- `encryption.js`: Web Crypto API wrapper for encryption/decryption
- `idb.js`: IndexedDB wrapper for storage operations
- `utils.js`: Utility functions
- `options.html/js`: Settings UI
- `devtools.html/js`: DevTools panel UI

### Building and Testing

The extension can be loaded directly as an unpacked extension during development. Use the "Test Now" button in the options page to force an immediate poll without waiting for the next timer tick.

## Troubleshooting

- **Extension Badge**: Shows the current number of cached studies
- **DevTools Panel**: Lists all cached studies with size and age information
- **Debug Logging**: Enable in settings to see detailed logs in the console
- **Context Menu**: Right-click the extension icon for options like "Flush Cache" and "Force Poll Now"

## License

[MIT License](LICENSE)