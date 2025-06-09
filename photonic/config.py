"""
Configuration management for Photonic.
"""
import os
import json
import logging
from pathlib import Path

# ───────────────────────────── Config ───────────────────────────────
CREDENTIALS_FILE = Path("~/.photonic_credentials.json").expanduser()
TOKEN_CACHE_FILE = Path("~/.photonic_token.json").expanduser()
CONFIG_FILE = Path("~/.photonic_config.json").expanduser()
DEFAULT_DOWNLOAD_DIR = Path(os.path.expanduser("~/Downloads/photonic"))
DEFAULT_BASE_URL = "https://toprad.aikenist.com"

# Configure logging
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
