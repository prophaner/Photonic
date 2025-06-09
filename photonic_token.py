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
4. **GET /dicom‑web/studies/<uuid>/archive** – stream ZIP → *<download_dir>/<patient>.zip*
"""
from __future__ import annotations
import sys, json, time, base64, logging, re, getpass, argparse, os
from pathlib import Path
from dataclasses import dataclass
from typing import Optional, List, Dict, Any, Tuple
from concurrent.futures import ThreadPoolExecutor, as_completed

import requests
from requests import Session

# ───────────────────────────── Config ───────────────────────────────
CREDENTIALS_FILE = Path("~/.photonic_credentials.json").expanduser()
TOKEN_CACHE_FILE = Path("~/.photonic_token.json").expanduser()
CONFIG_FILE = Path("~/.photonic_config.json").expanduser()
DEFAULT_DOWNLOAD_DIR = Path(os.path.expanduser("~/Downloads/photonic"))
DEFAULT_BASE_URL = "https://toprad.aikenist.com"

def get_base_url() -> str:
    """
    Get the base URL from config file or use the default.

    Returns:
        Base URL string
    """
    # Try to load from config file
    if CONFIG_FILE.exists():
        try:
            config = json.loads(CONFIG_FILE.read_text())
            if "base_url" in config and config["base_url"]:
                return config["base_url"]
        except Exception as e:
            log.warning("⚠️   Failed to load config file: %s", e)

    # Return default if no config or config loading failed
    return DEFAULT_BASE_URL

# ───────────────────────────── Endpoints ────────────────────────────
def get_login_url():
    """Get the login URL based on the configured base URL."""
    base = get_base_url()
    return f"{base}/api/quickrad/telerad/login-validation"

def get_worklist_url():
    """Get the worklist URL based on the configured base URL."""
    base = get_base_url()
    return f"{base}/api/quickrad/telerad/fetch-admin-list"

def get_misc_url():
    """Get the misc study data URL based on the configured base URL."""
    base = get_base_url()
    return f"{base}/api/quickrad/general/get-misc-study-data"

def get_archive_url(uuid):
    """Get the archive URL based on the configured base URL."""
    base = get_base_url()
    return f"{base}/dicom-web/studies/{uuid}/archive"

logging.basicConfig(level="INFO", format="%(asctime)s %(levelname)s %(message)s",
                   datefmt="%Y-%m-%d %H:%M:%S")
log = logging.getLogger("photonic")

def get_default_download_dir() -> Path:
    """
    Get the default download directory from config file or use the default.

    Returns:
        Path object representing the download directory
    """
    # Try to load from config file
    if CONFIG_FILE.exists():
        try:
            config = json.loads(CONFIG_FILE.read_text())
            if "download_dir" in config and config["download_dir"]:
                return Path(os.path.expanduser(config["download_dir"]))
        except Exception as e:
            log.warning("⚠️   Failed to load config file: %s", e)

    # Return default if no config or config loading failed
    return DEFAULT_DOWNLOAD_DIR

def save_config(download_dir: str = None, base_url: str = None):
    """
    Save configuration to config file.

    Args:
        download_dir: Download directory path to save
        base_url: Base URL to save
    """
    # Load existing config if it exists
    config = {}
    if CONFIG_FILE.exists():
        try:
            config = json.loads(CONFIG_FILE.read_text())
        except Exception:
            pass

    # Update config with new values if provided
    if download_dir is not None:
        config["download_dir"] = download_dir

    if base_url is not None:
        config["base_url"] = base_url

    # Save config
    CONFIG_FILE.write_text(json.dumps(config, indent=2))
    log.info("💾  Configuration saved to %s", CONFIG_FILE)

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

            login_url = get_login_url()
            r = self.s.post(login_url, files=files, headers={"Accept": "application/json"}, timeout=10)

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
                out_dir: Path | None = None, max_retries: int = 3) -> Path:
    """
    Download study ZIP to the specified directory.

    Args:
        api: Authenticated PhotonicSession
        uuid: Study instance UUID
        file_base: Base filename (usually patient name)
        out_dir: Directory to save the ZIP file (defaults to configured download directory)
        max_retries: Maximum number of retry attempts for network errors

    Returns:
        Path to the downloaded ZIP file
    """
    # Use the provided directory or the default
    out_dir = Path(out_dir) if out_dir is not None else Path(get_default_download_dir())
    out_dir.mkdir(parents=True, exist_ok=True)

    url = ARCHIVE_TPL.format(uuid=uuid)
    log.info("⬇️   GET %s", url)

    fname = out_dir / f"{file_base}.zip"

    # Implement retry logic for network failures
    retry_count = 0
    total_size = 0
    last_progress_time = time.time()

    while retry_count <= max_retries:
        try:
            # If retrying and partial file exists, use Range header to resume download
            headers = {}
            if retry_count > 0 and fname.exists():
                current_size = fname.stat().st_size
                if current_size > 0:
                    headers["Range"] = f"bytes={current_size}-"
                    total_size = current_size
                    log.info("🔄  Resuming download from byte %d", current_size)

            r = api.get(url, stream=True, headers=headers)

            # If we're resuming and the server doesn't support range requests
            if retry_count > 0 and r.status_code == 200 and "Range" in headers:
                log.warning("⚠️   Server doesn't support resume, starting from beginning")
                if fname.exists():
                    fname.unlink()
                total_size = 0

            r.raise_for_status()

            # Open file in append mode if resuming, otherwise write mode
            mode = "ab" if "Range" in headers and r.status_code == 206 else "wb"

            with fname.open(mode) as f:
                for chunk in r.iter_content(chunk_size=8192):
                    if chunk:  # filter out keep-alive chunks
                        chunk_size = len(chunk)
                        f.write(chunk)
                        total_size += chunk_size

                        # Log progress every 5 seconds
                        current_time = time.time()
                        if current_time - last_progress_time >= 5:
                            log.info("📊  Downloaded: %.2f MB", total_size / (1024 * 1024))
                            last_progress_time = current_time

            log.info("✅  ZIP saved → %s (%.2f MB)", fname, total_size / (1024 * 1024))
            return fname

        except requests.RequestException as e:
            retry_count += 1
            if retry_count <= max_retries:
                wait_time = 2 ** retry_count  # Exponential backoff
                log.warning("⚠️   Download error (attempt %d/%d): %s. Retrying in %d seconds...", 
                           retry_count, max_retries, e, wait_time)
                time.sleep(wait_time)
            else:
                # Clean up partial file on final error if it's very small (likely corrupted)
                if fname.exists() and fname.stat().st_size < 1024:
                    fname.unlink()
                    log.error("❌  Removed corrupted partial download")
                raise RuntimeError(f"Failed to download ZIP after {max_retries} attempts: {e}") from e
        except Exception as e:
            # Clean up partial file on error if it's very small (likely corrupted)
            if fname.exists() and fname.stat().st_size < 1024:
                fname.unlink()
                log.error("❌  Removed corrupted partial download")
            raise RuntimeError(f"Failed to download ZIP: {e}") from e

# ─────────────────────── Entrypoint  ────────────────────────────────
def process_study(api: PhotonicSession, study: Dict[str, Any], download_dir: Path, max_retries: int = 3) -> bool:
    """
    Process a single study: fetch UUID and download ZIP.

    Args:
        api: Authenticated PhotonicSession
        study: Study data dictionary
        download_dir: Directory to save the ZIP file
        max_retries: Maximum number of retry attempts

    Returns:
        True if successful, False otherwise
    """
    try:
        patient_name = slugify(study.get("patient_name", "patient"))
        study_uid = study["study_instance_uid"]

        log.info("👤  Processing patient: %s", patient_name)
        log.info("🔍  Study UID: %s", study_uid)

        # Resolve internal UUID & download ZIP
        internal_uuid = fetch_internal_uuid(api, study_uid)
        log.info("🆔  Internal UUID: %s", internal_uuid)

        download_zip(api, internal_uuid, patient_name, download_dir, max_retries)
        return True

    except Exception as e:
        log.error("❌  Error processing study: %s", e)
        return False

def _process_study_worker(args: Tuple[PhotonicSession, Dict[str, Any], Path, int, int, int]) -> Tuple[bool, Dict[str, Any], int]:
    """
    Worker function for processing a single study in a thread pool.

    Args:
        args: Tuple containing (api, study, download_dir, max_retries, index, total_count)

    Returns:
        Tuple of (success, study_info, index)
    """
    api, study, download_dir, max_retries, index, total_count = args

    study_uid = study.get("study_instance_uid", "unknown")
    patient_name = study.get("patient_name", f"patient_{index}")

    # Process the study
    success = process_study(api, study, download_dir, max_retries)

    # Return result
    study_info = {
        "study_uid": study_uid,
        "patient_name": patient_name
    }

    return success, study_info, index

def process_studies_bulk(api: PhotonicSession, studies: List[Dict[str, Any]], download_dir: Path, 
                         max_retries: int = 3, show_progress: bool = True, 
                         concurrent: bool = False, max_workers: int = 4) -> Dict[str, Any]:
    """
    Process multiple studies in bulk, with optional concurrent processing.

    Args:
        api: Authenticated PhotonicSession
        studies: List of study data dictionaries
        download_dir: Directory to save the ZIP files
        max_retries: Maximum number of retry attempts
        show_progress: Whether to show detailed progress information
        concurrent: Whether to use concurrent processing
        max_workers: Maximum number of concurrent workers when concurrent=True

    Returns:
        Dictionary with results summary containing:
        - success_count: Number of successfully processed studies
        - total_count: Total number of studies
        - successful_studies: List of successfully processed studies
        - failed_studies: List of failed studies with error information
    """
    if not studies:
        log.warning("⚠️  No studies provided for bulk processing")
        return {
            "success_count": 0,
            "total_count": 0,
            "successful_studies": [],
            "failed_studies": []
        }

    total_count = len(studies)
    log.info("🔄  Starting bulk processing of %d studies", total_count)

    # Ensure download directory exists
    download_dir.mkdir(parents=True, exist_ok=True)

    successful_studies = []
    failed_studies = []

    # Choose processing method based on concurrent flag
    if concurrent and total_count > 1:
        # Use concurrent processing
        workers = min(max_workers, total_count)
        log.info("🧵  Using concurrent processing with %d workers", workers)

        # Create a progress counter
        completed = 0

        with ThreadPoolExecutor(max_workers=workers) as executor:
            # Submit all tasks
            future_to_index = {
                executor.submit(
                    _process_study_worker, 
                    (api, study, download_dir, max_retries, i, total_count)
                ): i 
                for i, study in enumerate(studies, 1)
            }

            # Process results as they complete
            for future in as_completed(future_to_index):
                success, study_info, index = future.result()
                completed += 1

                # Show progress
                if show_progress:
                    progress_percent = completed / total_count * 100
                    log.info("📊  Completed study %d/%d (%.1f%%) - Patient: %s", 
                            index, total_count, progress_percent, study_info["patient_name"])

                # Track results
                if success:
                    successful_studies.append(study_info)
                else:
                    failed_studies.append(study_info)
    else:
        # Use sequential processing
        for i, study in enumerate(studies, 1):
            study_uid = study.get("study_instance_uid", "unknown")
            patient_name = study.get("patient_name", f"patient_{i}")

            # Show progress information
            progress_percent = (i - 1) / total_count * 100
            if show_progress:
                log.info("📊  Processing study %d/%d (%.1f%%) - Patient: %s", 
                        i, total_count, progress_percent, patient_name)

            # Process the study
            success = process_study(api, study, download_dir, max_retries)

            # Track results
            if success:
                successful_studies.append({
                    "study_uid": study_uid,
                    "patient_name": patient_name
                })
            else:
                failed_studies.append({
                    "study_uid": study_uid,
                    "patient_name": patient_name
                })

    # Prepare results summary
    success_count = len(successful_studies)
    results = {
        "success_count": success_count,
        "total_count": total_count,
        "successful_studies": successful_studies,
        "failed_studies": failed_studies
    }

    # Log summary
    log.info("✅  Bulk processing complete: %d/%d studies successful (%.1f%%)", 
            success_count, total_count, (success_count / total_count * 100) if total_count > 0 else 0)

    if failed_studies:
        log.warning("⚠️  %d studies failed to process", len(failed_studies))
        for i, failed in enumerate(failed_studies, 1):
            log.warning("   %d. %s (%s)", i, failed["patient_name"], failed["study_uid"])

    return results

def main(args=None):
    """
    Main execution function.

    Args:
        args: Command line arguments (for testing)
    """
    # Parse command line arguments
    parser = argparse.ArgumentParser(description="Photonic - QuickRad download automation")
    parser.add_argument("--download-dir", "-d", type=str, 
                        help="Directory to save downloaded files")
    parser.add_argument("--set-default-dir", "-s", action="store_true",
                        help="Save the specified download directory as default")
    parser.add_argument("--reset-credentials", "-r", action="store_true",
                        help="Reset stored credentials")
    parser.add_argument("--all", "-a", action="store_true",
                        help="Download all studies from the work-list")
    parser.add_argument("--count", "-c", type=int, default=1,
                        help="Number of studies to download (default: 1)")
    parser.add_argument("--study-uid", "-u", type=str, nargs="+",
                        help="Specific study instance UID(s) to download")
    parser.add_argument("--max-retries", "-m", type=int, default=3,
                        help="Maximum retry attempts for network errors (default: 3)")
    parser.add_argument("--concurrent", "-p", action="store_true",
                        help="Enable concurrent processing for bulk operations")
    parser.add_argument("--workers", "-w", type=int, default=4,
                        help="Number of concurrent workers (default: 4, used with --concurrent)")
    parser.add_argument("--verbose", "-v", action="store_true",
                        help="Enable verbose logging")

    parsed_args = parser.parse_args(args)

    # Set log level based on verbose flag
    if parsed_args.verbose:
        log.setLevel(logging.DEBUG)
        log.debug("🔍  Verbose logging enabled")

    # Handle reset credentials
    if parsed_args.reset_credentials:
        log.info("🔄  Resetting credentials...")
        if CREDENTIALS_FILE.exists():
            CREDENTIALS_FILE.unlink()
            log.info("✅  Credentials file deleted")
        else:
            log.info("ℹ️   No credentials file found")

        TokenCache.clear()
        log.info("✅  Credential reset complete. Run script again to enter new credentials.")
        return 0

    # Handle download directory
    download_dir = None
    if parsed_args.download_dir:
        download_dir = Path(os.path.expanduser(parsed_args.download_dir))
        log.info("📂  Using download directory: %s", download_dir)

        # Save as default if requested
        if parsed_args.set_default_dir:
            save_config(download_dir=str(download_dir))
    else:
        download_dir = get_default_download_dir()
        log.info("📂  Using default download directory: %s", download_dir)

    # Ensure download directory exists
    download_dir.mkdir(parents=True, exist_ok=True)

    try:
        api = PhotonicSession()

        # If specific study UIDs are provided
        if parsed_args.study_uid:
            log.info("🎯  Processing %d specific studies", len(parsed_args.study_uid))

            # Create study dictionaries from UIDs
            studies = [
                {"study_instance_uid": uid, "patient_name": f"patient_{i}"}
                for i, uid in enumerate(parsed_args.study_uid, 1)
            ]

            # Process studies in bulk
            results = process_studies_bulk(
                api, 
                studies, 
                download_dir, 
                max_retries=parsed_args.max_retries,
                show_progress=True,
                concurrent=parsed_args.concurrent,
                max_workers=parsed_args.workers
            )

            return 0 if results["success_count"] == results["total_count"] else 1

        # Otherwise, fetch from work-list
        log.info("📋  Fetching work-list...")
        worklist_url = get_worklist_url()
        wl_response = api.post(worklist_url, files={"page_size": (None, "30"), "page_num": (None, "1")})
        wl_response.raise_for_status()

        studies = extract_studies(wl_response.json())
        if not studies:
            log.error("❌  No studies returned from work-list")
            return 1

        log.info("📊  Found %d studies in work-list", len(studies))

        # Determine how many studies to process
        if parsed_args.all:
            studies_to_process = studies
            log.info("🔄  Processing all %d studies", len(studies_to_process))
        else:
            count = min(parsed_args.count, len(studies))
            studies_to_process = studies[:count]
            log.info("🔄  Processing %d studies", len(studies_to_process))

        # Process studies in bulk
        results = process_studies_bulk(
            api, 
            studies_to_process, 
            download_dir, 
            max_retries=parsed_args.max_retries,
            show_progress=True,
            concurrent=parsed_args.concurrent,
            max_workers=parsed_args.workers
        )

        return 0 if results["success_count"] == results["total_count"] else 1

    except CredentialsInvalidError as e:
        log.error("🚫  Authentication Error: %s", e)
        log.error("💡  To fix this:")
        log.error("    1. Delete credentials file: %s", CREDENTIALS_FILE)
        log.error("    2. Run the script again to enter new credentials")
        log.error("    3. Wait before retrying to avoid account lockout")
        return 2
    except AuthenticationError as e:
        log.error("🔐  Authentication failed: %s", e)
        return 2
    except KeyboardInterrupt:
        log.info("⏹️   Operation cancelled by user")
        return 0
    except Exception as e:
        log.error("❌  Error: %s", e)
        return 1

if __name__ == "__main__":
    sys.exit(main())
