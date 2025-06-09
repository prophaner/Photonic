"""
Study processing and downloading functionality for Photonic.
"""
import re
import time
from pathlib import Path
from typing import Dict, Any, List, Optional

import requests

from photonic.auth import PhotonicSession
from photonic.config import log, get_base_url

# ───────────────────────────── Endpoints ────────────────────────────
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

# ─────────────────────── Helpers ────────────────────────────────────
def extract_studies(obj):
    """Extract studies list from API response."""
    return obj if isinstance(obj, list) else obj.get("study_list", [])

def slugify(name: str) -> str:
    """Sanitise patient name for use as filename."""
    name = re.sub(r"[^A-Za-z0-9 _-]+", "", name).strip()
    name = re.sub(r"[\s]+", "_", name)
    return name or "patient"

# ─────────────────────── QuickRad calls  ────────────────────────────
def fetch_internal_uuid(api: PhotonicSession, study_instance_uid: str) -> str:
    """
    Fetch internal UUID for a study using its instance UID.

    Args:
        api: Authenticated PhotonicSession
        study_instance_uid: Study instance UID

    Returns:
        Internal UUID for the study

    Raises:
        RuntimeError: If UUID not found in response
    """
    files = {"study_instance_uid": (None, study_instance_uid)}
    misc_url = get_misc_url()
    r = api.post(misc_url, files=files)
    r.raise_for_status()

    uuid = r.json().get("study_data", {}).get("study_instance_uuid")
    if not uuid:
        raise RuntimeError("study_instance_uuid not found in response")
    return uuid

def download_zip(api: PhotonicSession, uuid: str, file_base: str,
                out_dir: Path, max_retries: int = 3) -> Path:
    """
    Download study ZIP to the specified directory.

    Args:
        api: Authenticated PhotonicSession
        uuid: Study instance UUID
        file_base: Base filename (usually patient name)
        out_dir: Directory to save the ZIP file
        max_retries: Maximum number of retry attempts for network errors

    Returns:
        Path to the downloaded ZIP file
    """
    out_dir.mkdir(parents=True, exist_ok=True)

    url = get_archive_url(uuid)
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

def fetch_worklist(api: PhotonicSession, page_size: int = 30, page_num: int = 1) -> List[Dict[str, Any]]:
    """
    Fetch work-list from the server.

    Args:
        api: Authenticated PhotonicSession
        page_size: Number of studies to fetch
        page_num: Page number

    Returns:
        List of studies
    """
    log.info("📋  Fetching work-list (page %d, size %d)...", page_num, page_size)
    worklist_url = get_worklist_url()
    wl_response = api.post(
        worklist_url, 
        files={
            "page_size": (None, str(page_size)), 
            "page_num": (None, str(page_num))
        }
    )
    wl_response.raise_for_status()

    studies = extract_studies(wl_response.json())
    log.info("📊  Found %d studies in work-list", len(studies))
    return studies
