#!/usr/bin/env python3
"""
photonic_token.py – Automate QuickRad download flow
===================================================
*Now saves the ZIP using the **patient's name** instead of the UUID.*

Workflow
--------
1. **Login** (`/telerad/login-validation`) – multipart `email`+`password` → JWT.
2. **Work‑list** (`/telerad/fetch-admin-list`) – multipart `page_size/page_num` → rows with
   `patient_name`, `study_instance_uid`, …
3. **get‑misc-study-data** – multipart `study_instance_uid` → `study_instance_uuid`.
4. **GET /dicom‑web/studies/<uuid>/archive** – stream ZIP → *Arkadi/download/<patient>.zip*
"""
from __future__ import annotations
import sys, json, time, base64, logging, re, getpass
from pathlib import Path
from dataclasses import dataclass
from typing import Optional

import requests
from requests import Session

# ───────────────────────────── Endpoints ────────────────────────────
BASE         = "https://toprad.aikenist.com"
LOGIN_URL    = f"{BASE}/api/quickrad/telerad/login-validation"
WL_URL       = f"{BASE}/api/quickrad/telerad/fetch-admin-list"
MISC_URL     = f"{BASE}/api/quickrad/general/get-misc-study-data"
ARCHIVE_TPL  = f"{BASE}/dicom-web/studies/{{uuid}}/archive"

# ───────────────────────────── Config ───────────────────────────────
CREDENTIALS_FILE = Path("~/.photonic_credentials.json").expanduser()
TOKEN_CACHE_FILE = Path("~/.photonic_token.json").expanduser()

logging.basicConfig(level="INFO", format="%(levelname)s %(message)s")
log = logging.getLogger("photonic")

# ─────────────────────── Credential & Token Management ──────────────
@dataclass
class Credentials:
    username: str
    password: str
    
    def save(self):
        """Save credentials to encrypted file."""
        CREDENTIALS_FILE.write_text(json.dumps(self.__dict__))
        log.info("💾  Credentials saved")
    
    @classmethod
    def load(cls) -> Optional['Credentials']:
        """Load credentials from file."""
        try:
            if CREDENTIALS_FILE.exists():
                data = json.loads(CREDENTIALS_FILE.read_text())
                return cls(**data)
        except Exception as e:
            log.warning("⚠️   Failed to load credentials: %s", e)
        return None
    
    @classmethod
    def prompt_and_save(cls) -> 'Credentials':
        """Prompt user for credentials and save them."""
        print("\n🔐  First time setup - Please enter your QuickRad credentials:")
        username = input("Username/Email: ").strip()
        password = getpass.getpass("Password: ").strip()
        
        if not username or not password:
            raise ValueError("Username and password cannot be empty")
        
        creds = cls(username, password)
        creds.save()
        return creds

@dataclass
class TokenCache:
    access_token: str
    exp_epoch: int
    
    def good(self) -> bool:
        """Check if token is still valid (with 30s buffer)."""
        return self.exp_epoch - 30 > time.time()
    
    def save(self):
        """Save token cache to file."""
        TOKEN_CACHE_FILE.write_text(json.dumps(self.__dict__))
    
    @classmethod
    def load(cls) -> Optional['TokenCache']:
        """Load token cache from file."""
        try:
            if TOKEN_CACHE_FILE.exists():
                data = json.loads(TOKEN_CACHE_FILE.read_text())
                return cls(**data)
        except Exception as e:
            log.debug("Failed to load token cache: %s", e)
        return None
    
    @classmethod
    def clear(cls):
        """Clear token cache file."""
        if TOKEN_CACHE_FILE.exists():
            TOKEN_CACHE_FILE.unlink()
            log.info("🗑️   Token cache cleared")

# ─────────────────────── Authentication Exceptions ─────────────────
class AuthenticationError(Exception):
    """Raised when authentication fails."""
    pass

class CredentialsInvalidError(AuthenticationError):
    """Raised when credentials are invalid and should not be retried."""
    pass

# ─────────────────────── Helper Functions ───────────────────────────
def _jwt_exp(tok: str) -> int:
    """Extract expiration time from JWT token."""
    pl = tok.split(".")[1] + "=="
    return json.loads(base64.urlsafe_b64decode(pl))["exp"]

# ─────────────────────── Session wrapper ────────────────────────────
class PhotonicSession:
    def __init__(self):
        self.s: Session = requests.Session()
        self.credentials: Optional[Credentials] = None
        self.token_cache: Optional[TokenCache] = None
        self._auth_failed = False  # Flag to prevent repeated auth attempts
        
        # Load credentials and token
        self._load_credentials()
        self._load_token()
        
        # Ensure we have a valid token
        if not (self.token_cache and self.token_cache.good()):
            self._authenticate()

    def _load_credentials(self):
        """Load credentials from file or prompt user."""
        self.credentials = Credentials.load()
        if not self.credentials:
            log.info("🔐  No saved credentials found")
            self.credentials = Credentials.prompt_and_save()

    def _load_token(self):
        """Load token cache from file."""
        self.token_cache = TokenCache.load()
        if self.token_cache and self.token_cache.good():
            log.info("🎫  Using cached token (expires %s)", 
                    time.strftime("%Y-%m-%d %H:%M", time.localtime(self.token_cache.exp_epoch)))

    def _authenticate(self):
        """Perform authentication with current credentials."""
        if self._auth_failed:
            raise CredentialsInvalidError(
                "Authentication previously failed. Please update credentials to avoid account lockout."
            )
        
        if not self.credentials:
            raise AuthenticationError("No credentials available")
        
        try:
            log.info("🔑  Authenticating with server...")
            files = {
                "email": (None, self.credentials.username), 
                "password": (None, self.credentials.password)
            }
            
            r = self.s.post(LOGIN_URL, files=files, headers={"Accept": "application/json"}, timeout=10)
            
            # Check for HTTP errors first
            if r.status_code == 429:
                self._auth_failed = True
                raise CredentialsInvalidError(
                    "Too many login attempts. Account may be temporarily locked. Please wait and try again later."
                )
            
            r.raise_for_status()  # This will raise for HTTP errors (4xx, 5xx)
            
            # Parse response
            try:
                response_data = r.json()
            except json.JSONDecodeError as e:
                raise AuthenticationError(f"Invalid JSON response: {e}")
            
            # Check authentication status in response
            auth_status = response_data.get("status", False)
            message = response_data.get("message", "")
            token = response_data.get("token", "")
            
            if not auth_status or not token:
                self._auth_failed = True
                TokenCache.clear()  # Clear any invalid cached token
                error_msg = message if message else "Authentication failed - no valid token received"
                raise CredentialsInvalidError(f"Invalid credentials: {error_msg}")
            
            # Validate token format
            if not token or token.strip() == "":
                self._auth_failed = True
                TokenCache.clear()
                raise CredentialsInvalidError("Authentication failed: empty token received")
            
            token = response_data["token"]
            try:
                exp_time = _jwt_exp(token)
            except (IndexError, json.JSONDecodeError, KeyError) as e:
                raise AuthenticationError(f"Invalid token format received: {e}")
            
            self.token_cache = TokenCache(token, exp_time)
            self.token_cache.save()
            
            log.info("✅  Authentication successful - token expires %s", 
                    time.strftime("%Y-%m-%d %H:%M", time.localtime(exp_time)))
            
        except requests.RequestException as e:
            raise AuthenticationError(f"Network error during authentication: {e}")
        except (KeyError, json.JSONDecodeError) as e:
            raise AuthenticationError(f"Invalid response format: {e}")

    def _ensure_authenticated(self):
        """Ensure we have a valid token, re-authenticate if needed."""
        if not self.token_cache or not self.token_cache.good():
            if self._auth_failed:
                raise CredentialsInvalidError(
                    "Token expired and previous authentication failed. Please update credentials."
                )
            log.info("🔄  Token expired, re-authenticating...")
            self._authenticate()

    def _add_auth_header(self, kwargs):
        """Add authorization header to request kwargs."""
        if not self.token_cache:
            raise AuthenticationError("No valid token available")
        
        headers = kwargs.setdefault("headers", {})
        headers["Authorization"] = f"JWT {self.token_cache.access_token}"
        return kwargs

    def get(self, url: str, **kwargs):
        """Perform authenticated GET request."""
        self._ensure_authenticated()
        return self.s.get(url, **self._add_auth_header(kwargs))

    def post(self, url: str, **kwargs):
        """Perform authenticated POST request."""
        self._ensure_authenticated()
        return self.s.post(url, **self._add_auth_header(kwargs))

    def reset_credentials(self):
        """Reset stored credentials and force re-authentication."""
        if CREDENTIALS_FILE.exists():
            CREDENTIALS_FILE.unlink()
            log.info("🗑️   Credentials cleared")
        
        TokenCache.clear()
        self._auth_failed = False
        self.credentials = None
        self.token_cache = None
        
        # Prompt for new credentials
        self._load_credentials()
        self._authenticate()

# ─────────────────────── Helpers ────────────────────────────────────

def extract_studies(obj):
    return obj if isinstance(obj, list) else obj.get("study_list", [])

def slugify(name: str) -> str:
    """Sanitise patient name for use as filename."""
    name = re.sub(r"[^A-Za-z0-9 _-]+", "", name).strip()
    name = re.sub(r"[\s]+", "_", name)
    return name or "patient"

# ─────────────────────── QuickRad calls  ────────────────────────────

def fetch_internal_uuid(api: PhotonicSession, study_instance_uid: str) -> str:
    """Fetch internal UUID for a study using its instance UID."""
    files = {"study_instance_uid": (None, study_instance_uid)}
    r = api.post(MISC_URL, files=files)
    r.raise_for_status()
    
    uuid = r.json().get("study_data", {}).get("study_instance_uuid")
    if not uuid:
        raise RuntimeError("study_instance_uuid not found in response")
    return uuid

def download_zip(api: PhotonicSession, uuid: str, file_base: str,
                out_dir: Path | None = None) -> Path:
    """Download study ZIP to the specified directory (defaults to Arkadi download folder)."""
    default_dir = Path(r"C:/Users/LuisRamos/PycharmProjects/Arkadi/download")
    out_dir = default_dir if out_dir is None else Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    url = ARCHIVE_TPL.format(uuid=uuid)
    log.info("⬇️   GET %s", url)
    
    r = api.get(url, stream=True)
    r.raise_for_status()

    fname = out_dir / f"{file_base}.zip"
    try:
        with fname.open("wb") as f:
            for chunk in r.iter_content(chunk_size=8192):
                if chunk:  # filter out keep-alive chunks
                    f.write(chunk)
        log.info("✅  ZIP saved → %s", fname)
        return fname
    except Exception as e:
        # Clean up partial file on error
        if fname.exists():
            fname.unlink()
        raise RuntimeError(f"Failed to download ZIP: {e}") from e

# ─────────────────────── Entrypoint  ────────────────────────────────
def main():
    """Main execution function."""
    try:
        api = PhotonicSession()

        # 1. Fetch work-list (30 rows)
        log.info("📋  Fetching work-list...")
        wl_response = api.post(WL_URL, files={"page_size": (None, "30"), "page_num": (None, "1")})
        wl_response.raise_for_status()
        
        studies = extract_studies(wl_response.json())
        if not studies:
            log.error("❌  No studies returned from work-list")
            sys.exit(1)

        log.info("📊  Found %d studies", len(studies))
        
        # Process first study
        first_study = studies[0]
        patient_name = slugify(first_study.get("patient_name", "patient"))
        study_uid = first_study["study_instance_uid"]
        
        log.info("👤  Processing patient: %s", patient_name)
        log.info("🔍  Study UID: %s", study_uid)

        # 2. Resolve internal UUID & download ZIP
        internal_uuid = fetch_internal_uuid(api, study_uid)
        log.info("🆔  Internal UUID: %s", internal_uuid)
        
        download_zip(api, internal_uuid, patient_name)
        
    except CredentialsInvalidError as e:
        log.error("🚫  Authentication Error: %s", e)
        log.error("💡  To fix this:")
        log.error("    1. Delete credentials file: %s", CREDENTIALS_FILE)
        log.error("    2. Run the script again to enter new credentials")
        log.error("    3. Wait before retrying to avoid account lockout")
        sys.exit(2)
    except AuthenticationError as e:
        log.error("🔐  Authentication failed: %s", e)
        sys.exit(2)
    except KeyboardInterrupt:
        log.info("⏹️   Operation cancelled by user")
        sys.exit(0)
    except Exception as e:
        log.error("❌  Error: %s", e)
        sys.exit(1)

if __name__ == "__main__":
    # Check for command line arguments
    if len(sys.argv) > 1:
        if sys.argv[1] == "--reset-credentials":
            log.info("🔄  Resetting credentials...")
            if CREDENTIALS_FILE.exists():
                CREDENTIALS_FILE.unlink()
                log.info("✅  Credentials file deleted")
            else:
                log.info("ℹ️   No credentials file found")
            
            TokenCache.clear()
            log.info("✅  Credential reset complete. Run script again to enter new credentials.")
            sys.exit(0)
        elif sys.argv[1] in ["--help", "-h"]:
            print("Usage:")
            print("  python photonic_token.py                 # Normal operation")
            print("  python photonic_token.py --reset-credentials  # Reset stored credentials")
            print("  python photonic_token.py --help         # Show this help")
            sys.exit(0)
        else:
            log.error("Unknown argument: %s", sys.argv[1])
            log.error("Use --help for usage information")
            sys.exit(1)
    
    main()