"""
Authentication and session management for Photonic.
"""
import json
import time
import base64
import getpass
from dataclasses import dataclass
from typing import Optional

import requests
from requests import Session

from photonic.config import CREDENTIALS_FILE, TOKEN_CACHE_FILE, log, get_base_url

# ───────────────────────────── Endpoints ────────────────────────────
def get_login_url():
    """Get the login URL based on the configured base URL."""
    base = get_base_url()
    return f"{base}/api/quickrad/telerad/login-validation"

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
