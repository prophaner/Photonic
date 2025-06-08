# Photonic Token - Python Script Usage

## Overview

The `photonic_token.py` script automates the QuickRad download flow, allowing you to download DICOM studies from the Aikenist PACS system with secure credential management.

## Features

- **Secure Authentication**: First-time credential prompt with secure storage
- **JWT Token Management**: Automatic token caching and renewal
- **Account Protection**: Prevents repeated failed login attempts to avoid lockouts
- **Patient-Named Files**: Downloads are saved using the patient's name instead of UUID
- **Automatic Directory Creation**: Creates download directories if they don't exist
- **Error Handling**: Comprehensive error handling and user guidance

## Authentication System

The script implements a secure 4-step authentication process:

1. **First Time Setup**: Prompts for username/password and stores them securely
2. **Token Generation**: Creates and caches JWT tokens for reuse
3. **Automatic Renewal**: Re-authenticates when tokens expire using stored credentials
4. **Failure Protection**: Stops retry attempts on credential failures to prevent account lockout

## Usage

### Basic Usage

```bash
python photonic_token.py
```

**First Run**: You'll be prompted to enter your credentials:
```
🔐  First time setup - Please enter your QuickRad credentials:
Username/Email: your-email@domain.com
Password: [hidden input]
```

**Subsequent Runs**: Uses cached credentials and tokens automatically.

### Command Line Options

```bash
# Normal operation
python photonic_token.py

# Reset stored credentials (useful if credentials change)
python photonic_token.py --reset-credentials

# Show help
python photonic_token.py --help
```

### Configuration

- **Base URL**: `https://toprad.aikenist.com`
- **Download Directory**: `C:/Users/LuisRamos/PycharmProjects/Arkadi/download/`
- **Credentials File**: `~/.photonic_credentials.json`
- **Token Cache**: `~/.photonic_token.json`

## Error Handling

### Authentication Errors

If you see authentication errors:

```
🚫  Authentication Error: Invalid credentials. Please run the script again to update your username/password.
💡  To fix this:
    1. Delete credentials file: ~/.photonic_credentials.json
    2. Run the script again to enter new credentials
    3. Wait before retrying to avoid account lockout
```

**Solutions**:
1. Use `--reset-credentials` to clear stored credentials
2. Wait before retrying to avoid account lockout
3. Verify your credentials are correct

### Account Lockout Protection

The script automatically:
- Stops retry attempts after authentication failure
- Provides clear guidance on credential updates
- Prevents repeated failed login attempts

### File Naming

Patient names are sanitized for use as filenames:
- Special characters are removed
- Spaces are replaced with underscores
- Example: "HELVEY, JAMES" becomes "HELVEY_JAMES.zip"

## Dependencies

- `requests>=2.31.0` (for HTTP requests)
- Python 3.7+ (for dataclasses and type hints)

Install dependencies:
```bash
pip install -r requirements.txt
```

## Workflow

1. **Login** (`/telerad/login-validation`) - Authenticate with email/password → JWT
2. **Work-list** (`/telerad/fetch-admin-list`) - Fetch studies with patient info
3. **Get Study Data** (`/general/get-misc-study-data`) - Convert study UID to internal UUID
4. **Download Archive** (`/dicom-web/studies/<uuid>/archive`) - Stream ZIP file

## Logging

The script provides informative logging:
- 🔑 Login attempts
- ✅ Successful operations
- ⬇️ Download progress
- Error messages for troubleshooting

## Security Notes

- Credentials are currently hardcoded (should use environment variables in production)
- JWT tokens are cached locally for convenience
- All HTTPS connections for secure communication